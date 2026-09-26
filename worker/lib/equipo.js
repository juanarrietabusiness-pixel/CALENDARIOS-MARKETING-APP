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
 * Lo que el cliente responde le llega a quien lleva la publicación; si
 * nadie la lleva, a todo el equipo (en una agencia pequeña, alguien
 * tiene que enterarse).
 */
export async function avisarRespuestaCliente(env, acceso, { calendarId, postId, estado, revisor }) {
  const cal = await acceso.leerUno("calendars", { id: calendarId });
  if (!cal) return;
  const post = buscar(cal, postId);
  const cliente = await acceso.leerUno("clients", { id: cal.client_id });
  const titulo = post?.title || String(post?.idea || post?.descripcion || "").split(/[.\n]/)[0].slice(0, 50) || "una publicación";
  const quien = revisor || cliente?.name || "El cliente";
  const para = post?.responsableId ? [post.responsableId] : (await miembrosDe(acceso)).map((m) => m.userId);
  await avisar(env, acceso, {
    para, tipo: estado === "aprobado" ? "aprobada" : "cambios",
    texto: estado === "aprobado" ? `${quien} aprobó «${titulo}».` : `${quien} pidió cambios en «${titulo}».`,
    enlace: enlacePublicacion(cal.client_id, calendarId, postId), por: { userId: "cliente", nombre: quien },
  });
}

/** Algo que no se pudo publicar: a quien la lleva, a quien la programó, o a todos. */
export async function avisarFallo(env, acceso, fila, mensaje) {
  try {
    const cal = await acceso.leerUno("calendars", { id: fila.calendar_id });
    const post = cal ? buscar(cal, fila.post_id) : null;
    const para = post?.responsableId ? [post.responsableId] : fila.creado_por ? [fila.creado_por] : (await miembrosDe(acceso)).map((m) => m.userId);
    const titulo = post?.title || String(post?.idea || "").split(/[.\n]/)[0].slice(0, 50) || "Una publicación";
    await avisar(env, acceso, {
      para, tipo: "fallo",
      texto: `«${titulo}» no se publicó en ${fila.red}: ${String(mensaje).slice(0, 200)}`,
      enlace: "/programacion", por: { userId: "sistema", nombre: "Publicación" },
    });
  } catch (e) {
    console.error("aviso de fallo:", e);
  }
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
