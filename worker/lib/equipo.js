// ============================================================
// El equipo en el servidor: avisos, historial y asignaciones
//
// Los avisos se GUARDAN (tabla `avisos`) y además se anuncian por el
// socket para que la campana se ponga al día en el momento. Guardarlos
// es la diferencia con lo de antes: si la persona no estaba conectada
// cuando el cliente aprobó o algo falló, lo ve al entrar.
//
// Nada de esto puede tumbar la escritura que lo provocó: un aviso o una
// línea de historial que se pierden son un fallo menor; un calendario
// que no se guarda, no.
// ============================================================

import { uuid, ahora } from "./ids.js";
import { difundir } from "./vivo.js";
import { cambiosEntre, mencionesEn } from "../../src/lib/trabajo.js";
import { diasConRespuestas } from "../../src/lib/aprobacion.js";
import { NULO } from "./acceso.js";

/** Los miembros del espacio, con la forma del navegador. */
export async function miembrosDe(acceso) {
  const filas = await acceso.leer("memberships", {}, "created_at asc");
  return filas.map((m) => ({ userId: m.user_id, nombre: m.nombre, color: m.color, rol: m.rol }));
}

/** La dirección de una publicación: el router acepta ids en crudo, y `?publicacion=` la abre. */
export const enlacePublicacion = (clientId, calId, postId) =>
  `/cliente/${encodeURIComponent(clientId)}/${encodeURIComponent(calId)}${postId ? `?publicacion=${encodeURIComponent(postId)}` : ""}`;

/**
 * Guarda un aviso para cada destinatario (sin repetir y nunca para quien
 * lo provocó) y avisa al espacio para que las campanas se relean.
 */
export async function avisar(env, acceso, { para = [], tipo, texto, enlace = "", por = null }) {
  const destinatarios = [...new Set(para.filter(Boolean))].filter((id) => id !== por?.userId);
  if (!destinatarios.length) return 0;
  const t = ahora();
  try {
    await acceso.guardarVarios("avisos", destinatarios.map((user_id) => ({
      id: uuid(), user_id, tipo: String(tipo).slice(0, 40), texto: String(texto).slice(0, 500),
      enlace: String(enlace).slice(0, 500), por_nombre: String(por?.nombre ?? "").slice(0, 80), leido_at: null, created_at: t,
    })));
    difundir(env, acceso.ownerId, { tipo: "avisos", para: destinatarios });
  } catch (e) {
    console.error("avisos:", e);
    return 0;
  }
  return destinatarios.length;
}

/** El user_id del miembro que se llama así (sin tildes ni mayúsculas), o null. */
export function asignadoPorNombre(miembros, nombre) {
  const n = String(nombre ?? "").trim().toLowerCase();
  if (!n) return null;
  return miembros.find((m) => String(m.nombre ?? "").trim().toLowerCase() === n)?.userId ?? null;
}

/**
 * Antes de guardar una tarea: `asignado_id` a partir del nombre, y el
 * aviso para quien la recibe (si cambió y no se la asignó a sí mismo).
 */
export async function asignarTarea(env, ctx, req, { antes = null, fila, enlace }) {
  if (!("assigned_to" in fila)) return fila;
  const miembros = await miembrosDe(ctx.acceso);
  const asignado = asignadoPorNombre(miembros, fila.assigned_to);
  const salida = { ...fila, asignado_id: asignado };
  if (asignado && asignado !== (antes?.asignado_id ?? null)) {
    const titulo = fila.title ?? antes?.title ?? "una tarea";
    await avisar(env, ctx.acceso, {
      para: [asignado], tipo: "tarea",
      texto: `${ctx.usuario?.nombre || "Alguien"} te asignó la tarea «${titulo}».`,
      enlace, por: { userId: ctx.usuario?.id, nombre: ctx.usuario?.nombre },
    });
  }
  return salida;
}

const QUINCE_MIN = 15 * 60_000;

/**
 * Después de guardar un calendario: el historial de lo que cambió y los
 * avisos de lo que le toca a alguien (le asignaron una publicación, le
 * pidieron una revisión). Se apunta con quien guardó; lo repetido en
 * menos de quince minutos por la misma persona no se vuelve a apuntar
 * —el guardado va cada 600 ms mientras se escribe—.
 */
export async function alGuardarCalendario(env, acceso, { antes, despues, usuario, calId, clientId, clienteNombre = "" }) {
  try {
    const miembros = await miembrosDe(acceso);
    const nombreDe = (id) => miembros.find((m) => m.userId === id)?.nombre ?? "";
    const cambios = cambiosEntre(antes ?? [], despues ?? [], nombreDe);
    if (!cambios.length) return;

    const recientes = await acceso.leer("historial", { calendar_id: calId }, "created_at desc", 60);
    const limite = Date.now() - QUINCE_MIN;
    const repetido = (c) => recientes.some((h) => h.post_id === c.postId && h.user_id === usuario.id && h.accion === c.accion && Date.parse(h.created_at) > limite);
    const t = ahora();
    const nuevas = cambios.filter((c) => !repetido(c)).map((c) => ({
      id: uuid(), calendar_id: calId, post_id: c.postId, user_id: usuario.id ?? "", nombre: usuario.nombre ?? "",
      accion: c.accion.slice(0, 300), created_at: t,
    }));
    if (nuevas.length) await acceso.guardarVarios("historial", nuevas);

    const por = { userId: usuario.id, nombre: usuario.nombre };
    const de = clienteNombre ? ` de ${clienteNombre}` : "";
    for (const c of cambios) {
      if (c.responsable?.despues) {
        await avisar(env, acceso, {
          para: [c.responsable.despues], tipo: "publicacion",
          texto: `${usuario.nombre || "Alguien"} te asignó «${c.titulo}»${de}.`,
          enlace: enlacePublicacion(clientId, calId, c.postId), por,
        });
      }
      if (c.revisor) {
        await avisar(env, acceso, {
          para: [c.revisor], tipo: "revision",
          texto: `${usuario.nombre || "Alguien"} te pidió revisar «${c.titulo}»${de}.`,
          enlace: enlacePublicacion(clientId, calId, c.postId), por,
        });
      }
    }
  } catch (e) {
    console.error("historial del calendario:", e);
  }
}

/** Una publicación y su día dentro de un calendario (fila de D1). */
function buscar(cal, postId) {
  let days = cal?.days;
  if (typeof days === "string") { try { days = JSON.parse(days); } catch { days = []; } }
  for (const d of days ?? []) for (const p of d?.posts ?? []) if (p?.id === postId) return p;
  return null;
}

/**
 * A quién le llega lo de una publicación: a quien la lleva si SIGUE en el equipo; si nadie la lleva, o quien la llevaba
 * ya no está (lo sacaron), a todo el equipo. Antes, sacar a alguien dejaba sus publicaciones avisando a nadie. Pura.
 */
export function destinatariosDe(miembros = [], ...candidatos) {
  const ids = new Set(miembros.map((m) => m.userId));
  const dentro = candidatos.find((id) => id && ids.has(id));
  return dentro ? [dentro] : [...ids];
}

/** En cuánto tiempo las respuestas del cliente a un mismo mes se juntan en UN aviso. */
export const VENTANA_RESPUESTAS_MS = 3 * 60 * 60_000;

const tituloCorto = (post) => post?.title || String(post?.idea || post?.descripcion || "").split(/[.\n]/)[0].slice(0, 50) || "una publicación";
const nombreDelMes = (cal) => String(cal?.name || "").trim() || "el calendario";
const enlaceDelMes = (cal) => `/cliente/${encodeURIComponent(cal.client_id)}/${encodeURIComponent(cal.id)}`;

/**
 * El texto del aviso de lo que respondió el cliente en un mes (lo aprobado, junto). Pura.
 * `n`: aprobadas; `c`: con cambios pedidos; `titulo`: la publicación, si es una sola.
 */
export function textoDeRespuestas({ quien = "El cliente", n = 0, c = 0, titulo = "", mes = "", cliente = "" } = {}) {
  if (n === 1 && !c && titulo) return `${quien} aprobó «${titulo}».`;
  const aprobo = n ? `aprobó ${n === 1 ? "1 publicación" : `${n} publicaciones`}` : "";
  const cambios = c ? `pidió cambios en ${c}` : "";
  return `${quien} ${[aprobo, cambios].filter(Boolean).join(" y ")} de ${mes || "el calendario"}${cliente ? ` (${cliente})` : ""}.`;
}

/**
 * Lo que el cliente responde. Los CAMBIOS pedidos van siempre en su propio aviso, con lo que pidió: es lo que hay que
 * hacer. Lo APROBADO se junta: las respuestas a un mismo mes dentro de `VENTANA_RESPUESTAS_MS` actualizan el aviso sin
 * leer de ese mes («Ana aprobó 12 publicaciones y pidió cambios en 2 de Noviembre 2026») en vez de sumar uno por
 * publicación —«Aprobar todas» con 25 eran 25 avisos, y la campana sólo enseña 60—. Le llega a quien lleva cada
 * publicación si sigue en el equipo o, si no, a todo el equipo. `postIds`: varias de una vez (todas aprobadas).
 * `fecha`: cuándo se guardó la respuesta. Nunca lanza.
 */
export async function avisarRespuestaCliente(env, acceso, { calendarId, postId = null, postIds = null, estado, revisor = "", comentario = "", fecha = null }) {
  try {
    const cal = await acceso.leerUno("calendars", { id: calendarId });
    if (!cal) return;
    const [cliente, miembros] = await Promise.all([acceso.leerUno("clients", { id: cal.client_id }), miembrosDe(acceso)]);
    const quien = String(revisor || "").trim() || cliente?.name || "El cliente";
    const por = { userId: "cliente", nombre: quien };
    const ids = postIds?.length ? postIds : [postId].filter(Boolean);
    const posts = ids.map((id) => buscar(cal, id));
    if (estado !== "aprobado") {
      const pide = String(comentario ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
      await avisar(env, acceso, {
        para: destinatariosDe(miembros, posts[0]?.responsableId), tipo: "cambios",
        texto: `${quien} pidió cambios en «${tituloCorto(posts[0])}»${pide ? `: «${pide}»` : "."}`,
        enlace: enlacePublicacion(cal.client_id, calendarId, ids[0]), por,
      });
      // El resumen del mes que ya estaba sin leer también lo cuenta (no se crea uno nuevo por un cambio).
      await avisarAgrupado(env, acceso, { cal, cliente, para: miembros.map((m) => m.userId), quien, por, ids, posts, fecha, soloActualizar: true });
      return;
    }
    const para = [...new Set(posts.flatMap((p) => destinatariosDe(miembros, p?.responsableId)))];
    await avisarAgrupado(env, acceso, { cal, cliente, para, quien, por, ids, posts, fecha });
  } catch (e) {
    console.error("aviso de la respuesta del cliente:", e);
  }
}

/** El aviso de lo aprobado en un mes: actualiza el que sigue sin leer dentro de la ventana, o crea uno. */
async function avisarAgrupado(env, acceso, { cal, cliente, para, quien, por, ids, posts, fecha, soloActualizar = false }) {
  const base = enlaceDelMes(cal);
  const ahoraMs = Date.now();
  const delMes = (a) => a.enlace === base || String(a.enlace ?? "").startsWith(`${base}?`);
  const abiertos = (await acceso.leer("avisos", { tipo: "aprobada", leido_at: NULO }, "created_at desc", 200))
    .filter((a) => delMes(a) && Date.parse(a.created_at) > ahoraMs - VENTANA_RESPUESTAS_MS);
  const respuestas = await acceso.leer("approvals", { calendar_id: cal.id });
  // Lo que respondió desde que empezó el aviso (`margen`: la respuesta que lo abrió se guarda unos milisegundos antes).
  const contar = (desde, margen = 0) => {
    const d = Date.parse(desde) - margen;
    const recientes = respuestas.filter((r) => Date.parse(r.updated_at) >= d);
    return { n: recientes.filter((r) => r.estado === "aprobado").length, c: recientes.filter((r) => r.estado === "cambios").length };
  };
  const mes = nombreDelMes(cal);
  const nuevos = [];
  const cambiados = [];
  for (const userId of para) {
    const suyo = abiertos.find((a) => a.user_id === userId);
    if (!suyo) { if (!soloActualizar) nuevos.push(userId); continue; }
    const { n, c } = contar(suyo.created_at, 10_000);
    await acceso.actualizar("avisos", { id: suyo.id, leido_at: NULO }, {
      texto: textoDeRespuestas({ quien, n: Math.max(n, 1), c, mes, cliente: cliente?.name ?? "" }).slice(0, 500),
      enlace: base, por_nombre: String(quien).slice(0, 80),
    });
    cambiados.push(userId);
  }
  if (nuevos.length) {
    const { n, c } = fecha ? contar(fecha) : contar(new Date(ahoraMs).toISOString(), 10_000);
    const total = Math.max(n, ids.length);
    const una = total === 1 && !c;
    await avisar(env, acceso, {
      para: nuevos, tipo: "aprobada",
      texto: textoDeRespuestas({ quien, n: total, c, titulo: una ? tituloCorto(posts[0]) : "", mes, cliente: cliente?.name ?? "" }),
      enlace: una ? enlacePublicacion(cal.client_id, cal.id, ids[0]) : base, por,
    });
  }
  if (cambiados.length) difundir(env, acceso.ownerId, { tipo: "avisos", para: cambiados });
}

/**
 * «Enviar mi revisión»: el cliente terminó. Antes sólo se anunciaba por el socket y, si nadie estaba conectado, se
 * perdía. Ahora queda en la campana de quien lleva algo de ese mes (o de todo el equipo), con quién la envió, cuántas
 * aprobó, en cuántas pidió cambios y cuántas dejó sin revisar. Nunca lanza.
 */
export async function avisarRevisionCliente(env, acceso, { calendarId, revisor = "" }) {
  try {
    const cal = await acceso.leerUno("calendars", { id: calendarId });
    if (!cal) return;
    const [cliente, miembros, filas] = await Promise.all([
      acceso.leerUno("clients", { id: cal.client_id }), miembrosDe(acceso), acceso.leer("approvals", { calendar_id: calendarId }),
    ]);
    const quien = String(revisor || "").trim() || cliente?.name || "El cliente";
    const r = { aprobadas: 0, cambios: 0, sin: 0 };
    const llevan = new Set();
    for (const d of diasConRespuestas(leerSiTexto(cal.days, []), filas)) {
      for (const p of d?.posts ?? []) {
        if (!p || p.status === "published") continue;
        if (p.status === "approved") r.aprobadas += 1;
        else if (p.status === "rejected") r.cambios += 1;
        else r.sin += 1;
        if (p.responsableId) llevan.add(p.responsableId);
      }
    }
    const equipo = new Set(miembros.map((m) => m.userId));
    const suyos = [...llevan].filter((id) => equipo.has(id));
    await avisar(env, acceso, {
      // Con algo sin dueño (o nadie que lleve nada), a todos: alguien tiene que enterarse.
      para: suyos.length && suyos.length === llevan.size ? suyos : [...equipo], tipo: "revision-cliente",
      texto: textoDeRevision({ quien, ...r, mes: nombreDelMes(cal), cliente: cliente?.name ?? "" }),
      enlace: enlaceDelMes(cal), por: { userId: "cliente", nombre: quien },
    });
  } catch (e) {
    console.error("aviso de la revisión del cliente:", e);
  }
}

/** «Ana terminó de revisar Noviembre 2026 (Dcasa): aprobó 12, pidió cambios en 2 y dejó 1 sin revisar.» Pura. */
export function textoDeRevision({ quien = "El cliente", aprobadas = 0, cambios = 0, sin = 0, mes = "", cliente = "" } = {}) {
  const partes = [`aprobó ${aprobadas}`, cambios ? `pidió cambios en ${cambios}` : "", sin ? `dejó ${sin} sin revisar` : ""].filter(Boolean);
  const ultima = partes.length > 1 ? ` y ${partes.pop()}` : "";
  return `${quien} terminó de revisar ${mes || "el calendario"}${cliente ? ` (${cliente})` : ""}: ${partes.join(", ")}${ultima}.`;
}

/** Algo que no se pudo publicar: a quien la lleva o a quien la programó (si siguen en el equipo), o a todos. */
export async function avisarFallo(env, acceso, fila, mensaje) {
  try {
    // Una historia automática no tiene calendario: su publicación va en la carga.
    const cal = fila.calendar_id ? await acceso.leerUno("calendars", { id: fila.calendar_id }) : null;
    let post = cal ? buscar(cal, fila.post_id) : null;
    if (!fila.calendar_id) { try { post = JSON.parse(fila.carga ?? "{}").post ?? null; } catch { post = null; } }
    const para = destinatariosDe(await miembrosDe(acceso), post?.responsableId, fila.creado_por);
    const titulo = post?.title || String(post?.idea || "").split(/[.\n]/)[0].slice(0, 50) || "Una publicación";
    await avisar(env, acceso, {
      para, tipo: "fallo",
      texto: `«${titulo}» no se publicó en ${fila.red}: ${String(mensaje).slice(0, 200)}`,
      enlace: "/produccion", por: { userId: "sistema", nombre: "Publicación" },
    });
  } catch (e) {
    console.error("aviso de fallo:", e);
  }
}

/**
 * Al SACAR a alguien del equipo su trabajo no se queda sin dueño: las publicaciones que llevaba (o cuya revisión se le
 * pidió) y sus tareas pasan a quien lo saca, y a esa persona le queda un aviso con cuántas. Cada mes se escribe con su
 * `updated_at` como condición (si alguien lo guardaba a la vez, se relee una vez) y se avisa a las pantallas abiertas.
 * Se llama ANTES de borrar la cuenta (lo que se reasigna se ve en el historial de quien lo hizo). → { publicaciones,
 * tareas }. Nunca lanza: sacar a alguien no puede fallar por esto.
 */
export async function reasignarTrabajoDe(env, acceso, { userId, nombre = "", a }) {
  const r = { publicaciones: 0, tareas: 0 };
  if (!userId || !a?.id || userId === a.id) return r;
  const firma = { userId: "sistema", nombre: "Equipo", color: "", tab: null };
  try {
    const calendarios = await acceso.leerColumnas("calendars", ["id", "client_id", "days", "updated_at"], {});
    for (const fila of calendarios) {
      if (!String(fila.days ?? "").includes(userId)) continue;
      for (let vuelta = 0; vuelta < 2; vuelta++) {
        const cal = vuelta ? await acceso.leerUno("calendars", { id: fila.id }) : fila;
        if (!cal) break;
        let n = 0;
        const dias = (leerSiTexto(cal.days, []) ?? []).map((d) => (Array.isArray(d?.posts) ? {
          ...d,
          posts: d.posts.map((p) => {
            if (!p || (p.responsableId !== userId && p.revisorId !== userId)) return p;
            n += 1;
            return { ...p, ...(p.responsableId === userId ? { responsableId: a.id } : {}), ...(p.revisorId === userId ? { revisorId: a.id } : {}) };
          }),
        } : d));
        if (!n) break;
        const hecho = await acceso.actualizar("calendars", { id: cal.id, updated_at: cal.updated_at }, { days: JSON.stringify(dias), updated_at: ahora() });
        if (!hecho) continue;
        r.publicaciones += n;
        difundir(env, acceso.ownerId, { tipo: "calendario:recargar", id: cal.id, clientId: cal.client_id, por: firma });
        break;
      }
    }
    for (const tabla of ["client_tasks", "quick_tasks"]) {
      r.tareas += await acceso.actualizar(tabla, { asignado_id: userId }, { asignado_id: a.id, assigned_to: String(a.nombre ?? "").slice(0, 120) });
    }
    if (r.tareas) difundir(env, acceso.ownerId, { tipo: "tarea", por: firma });
    if (r.publicaciones || r.tareas) {
      const cosas = [
        r.publicaciones ? `${r.publicaciones} ${r.publicaciones === 1 ? "publicación" : "publicaciones"}` : "",
        r.tareas ? `${r.tareas} ${r.tareas === 1 ? "tarea" : "tareas"}` : "",
      ].filter(Boolean).join(" y ");
      await avisar(env, acceso, {
        para: [a.id], tipo: "equipo",
        texto: `Al sacar a ${nombre || "una persona"} del equipo pasaron a ti ${cosas} que llevaba. Repártelas si hace falta.`,
        enlace: "/tareas", por: firma,
      });
    }
  } catch (e) {
    console.error("reasignar al sacar del equipo:", e);
  }
  return r;
}

/** Las menciones de una nota del hilo interno, más quien lleva la publicación. */
export async function avisarNota(env, acceso, { nota, post, clientId, usuario }) {
  const miembros = await miembrosDe(acceso);
  const mencionados = mencionesEn(nota.texto, miembros);
  const titulo = post?.title || String(post?.idea || "").split(/[.\n]/)[0].slice(0, 50) || "una publicación";
  const por = { userId: usuario.id, nombre: usuario.nombre };
  const enlace = enlacePublicacion(clientId, nota.calendar_id, nota.post_id);
  await avisar(env, acceso, { para: mencionados, tipo: "mencion", texto: `${usuario.nombre || "Alguien"} te mencionó en «${titulo}»: ${nota.texto.slice(0, 140)}`, enlace, por });
  const lleva = post?.responsableId;
  if (lleva && !mencionados.includes(lleva)) {
    await avisar(env, acceso, { para: [lleva], tipo: "nota", texto: `${usuario.nombre || "Alguien"} escribió en «${titulo}»: ${nota.texto.slice(0, 140)}`, enlace, por });
  }
  return mencionados;
}

// ------------------------------------------------------------
// Lo que el Estudio termina sin nadie delante: lotes, encargos, renders y montajes
// ------------------------------------------------------------
//
// Lo que se lanza desde el teléfono sigue en el servidor aunque se cierre la aplicación (la bomba del espacio), y al
// terminar no se enteraba nadie. Ahora deja un aviso en la campana de QUIEN LO PIDIÓ (`creado_por` del encargo, `porId`
// del render), guardado como los demás: le llega aunque no esté conectado. Lo que la pantalla sigue de cerca (una pieza
// del panel o del visor, `datos.seguido`) sólo avisa si falla o si tardó tanto que lo más probable es que ya no se
// estuviera mirando (`AVISO_SEGUIDO_MS`). Cancelar no avisa: lo hizo la persona.

/** Desde cuánto una pieza que la pantalla seguía avisa igual al terminar bien (lo normal es 1–2 min). */
export const AVISO_SEGUIDO_MS = 3 * 60_000;

/** Quien firma estos avisos: el sistema (si fuera la persona, `avisar` no se lo mandaría a ella). */
export const POR_ESTUDIO = Object.freeze({ userId: "sistema", nombre: "Estudio" });

const entre = (t) => `«${String(t ?? "").trim().slice(0, 80) || "sin título"}»`;
const leerSiTexto = (v, d) => { if (typeof v !== "string") return v ?? d; try { return JSON.parse(v); } catch { return d; } };
const enlaceDelEstudio = (clientId) => `/cliente/${encodeURIComponent(clientId ?? "")}/estudio`;

/** La publicación a la que va un encargo (la de su carrusel, su reel o su primera pieza), o null. Pura. */
export function publicacionDeEncargo(tipo, datos = {}, pasos = []) {
  if (tipo === "carrusel" && datos.comun?.postId) return { postId: datos.comun.postId, calendarId: datos.comun.calendarId ?? null };
  if (tipo === "reel" && datos.postId) return { postId: datos.postId, calendarId: datos.puesto?.calendarId ?? datos.calendarId ?? null };
  const p = pasos.find((x) => x?.pedido?.postId);
  return p ? { postId: p.pedido.postId, calendarId: p.pedido.calendarId ?? null } : null;
}

/** El texto del aviso de un reel que se cerró. Pura. */
function textoDeReel(titulo, fallo, motivo, datos) {
  const m = datos.montaje;
  if (fallo) return `No salió el reel ${titulo}${motivo ? `: ${motivo}` : "."}`;
  if (datos.video?.fase === "espera") return `Listo el storyboard del reel ${titulo}: revísalo y sigue con el video.`;
  if (m?.fase === "confirmar") return `El montaje del reel ${titulo} espera tu sí para la voz${m.costoTexto ? ` (${m.costoTexto})` : ""}.`;
  if (m?.fase === "fallido") return `El reel ${titulo} salió, pero el montaje no: ${String(m.error ?? "").slice(0, 140)}`;
  if (m?.fase === "espera") return `El reel ${titulo} está montado; falta el render.`;
  return `Listo el reel ${titulo}${datos.puesto?.postId ? ": ya está en su publicación." : ". Está en la galería del Estudio."}`;
}

/**
 * El aviso de un encargo que acaba de cerrarse (la fila con su estado nuevo, y sus `datos` y `pasos` ya leídos), o null
 * si no toca avisar. → { para, tipo, texto, enlace }. Pura (`ahoraMs` para los tests).
 */
export function avisoDeEncargo(fila, { datos = {}, pasos = [] } = {}, ahoraMs = Date.now()) {
  if (!fila?.creado_por || !["hecho", "fallido"].includes(fila.estado)) return null;
  const fallo = fila.estado === "fallido";
  const tardo = ahoraMs - Date.parse(fila.created_at ?? "") >= AVISO_SEGUIDO_MS;
  if (datos.seguido && !fallo && !tardo) return null;
  const titulo = entre(fila.titulo);
  const destino = publicacionDeEncargo(fila.tipo, datos, pasos);
  const enlace = destino?.postId && destino.calendarId ? enlacePublicacion(fila.client_id, destino.calendarId, destino.postId) : enlaceDelEstudio(fila.client_id);
  const motivo = String(fila.error ?? "").trim().slice(0, 160);
  const hechas = pasos.filter((p) => p?.fase === "hecho").length;
  const puestas = Array.isArray(datos.puestos) && datos.puestos.some((x) => x?.postId && !x.aviso);
  const donde = puestas ? ": ya está en su publicación." : ". Está en la galería del Estudio.";
  let texto;
  if (fila.tipo === "reel") texto = textoDeReel(titulo, fallo, motivo, datos);
  else if (fila.tipo === "carrusel") {
    texto = fallo ? `No salió el carrusel ${titulo}${motivo ? `: ${motivo}` : "."}` : `Listo el carrusel ${titulo} (${hechas} ${hechas === 1 ? "lámina" : "láminas"})${donde}`;
  } else {
    const una = pasos.length <= 1;
    if (fallo) texto = `${una ? "No salió" : "No salió ninguna pieza de"} ${titulo}${motivo ? `: ${motivo}` : "."}`;
    else texto = `${una ? `Lista ${titulo}` : `Listas ${hechas} de ${pasos.length} piezas de ${titulo}`}${donde}`;
  }
  return { para: [fila.creado_por], tipo: fallo ? "encargo-fallo" : "encargo", texto, enlace };
}

/** Avisa (si toca) de un encargo que se acaba de cerrar. Nunca lanza: un aviso perdido no tumba el encargo. */
export async function avisarEncargo(env, acceso, fila, { datos, pasos } = {}) {
  try {
    const a = avisoDeEncargo(fila, { datos: datos ?? leerSiTexto(fila?.datos, {}), pasos: pasos ?? leerSiTexto(fila?.pasos, []) });
    if (a) await avisar(env, acceso, { ...a, por: POR_ESTUDIO });
  } catch (e) {
    console.error("aviso del encargo:", e);
  }
}

/**
 * El aviso de un render que terminó (`render`: lo que quedó escrito en el proyecto) o null. Un render que sale de un
 * MONTAJE no avisa por su cuenta: lo dice el reel al cerrarse. Pura.
 */
export function avisoDeRender(fila, render = {}) {
  const para = render.porId;
  if (!para || !["listo", "fallido"].includes(render.estado)) return null;
  if (leerSiTexto(fila?.origen, {})?.tipo === "reel") return null;
  const titulo = entre(fila?.titulo);
  const adj = render.adjunto;
  const enlace = adj?.postId && adj.calendarId ? enlacePublicacion(fila.client_id, adj.calendarId, adj.postId) : enlaceDelEstudio(fila?.client_id);
  const texto = render.estado === "fallido"
    ? `Falló el render del video ${titulo}: ${String(render.error ?? "").slice(0, 160)}`
    : `Listo el video ${titulo}${adj?.postId ? ": ya está en su publicación." : ". Está en la galería del Estudio."}`;
  return { para: [para], tipo: render.estado === "fallido" ? "render-fallo" : "render", texto, enlace };
}

/** Avisa (si toca) de un render que terminó. Nunca lanza. */
export async function avisarRender(env, acceso, fila, render) {
  try {
    const a = avisoDeRender(fila, render);
    if (a) await avisar(env, acceso, { ...a, por: { userId: "sistema", nombre: "Render" } });
  } catch (e) {
    console.error("aviso del render:", e);
  }
}
