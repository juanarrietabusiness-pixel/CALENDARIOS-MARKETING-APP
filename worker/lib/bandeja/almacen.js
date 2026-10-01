// ============================================================
// La bandeja: guardar lo que llega de Meta
//
// Dos caminos llegan aquí con la MISMA forma de suceso (webhook.js):
//
//   · el webhook, sin sesión: `procesarAviso()` busca de qué espacio y de
//     qué cliente es cada cuenta (`cuentasPorExterno`, la única lectura sin
//     dueño) y a partir de ahí todo va por `crearAcceso(db, owner_id)`;
//   · «Actualizar», con sesión: meta.js lee los últimos comentarios y
//     mensajes de Meta y los guarda con el acceso de quien pulsó.
//
// Las reglas, en los dos:
//
//   · El INTERRUPTOR manda. Si el cliente tiene la bandeja apagada (o sin
//     fila), lo suyo se descarta sin escribir nada. Una cuenta sin cliente
//     no es de nadie: `cuentasPorExterno` ni la devuelve.
//   · Un comentario es UNA fila aunque llegue dos veces (el webhook y
//     «Actualizar», o «add» y luego «edited»): el id es
//     «espacio:red:id de Meta», y al volver a llegar se FUNDE con lo que
//     había. Lo que es de la agencia —atendido, respondido— no lo pisa Meta.
//   · Todo en lotes: una lectura de lo que había, un `guardarVarios`. El
//     webhook no tiene los 50 subpedidos de sobra si llega un aviso gordo.
// ============================================================

import { crearAcceso, cuentasPorExterno } from "../acceso.js";
import { graph, descifrarMeta } from "../meta.js";
import { difundir } from "../vivo.js";
import { desmenuzar } from "./webhook.js";

export const FIRMA_META = Object.freeze({ userId: "meta", nombre: "Meta", color: "#1877F2" });

/** Cuántas llamadas a Meta puede hacer UN aviso para completar lo que falta (miniaturas, nombres). */
export const TOPE_CONSULTAS_AVISO = 6;

const ahora = () => new Date().toISOString();
export const idDe = (owner, red, externo) => `${owner}:${red}:${externo}`;
export const idHilo = (owner, red, cuenta, usuario) => `${owner}:${red}:${cuenta}:${usuario}`;

/** Los clientes (de esta lista) con la bandeja encendida. */
export async function clientesActivos(acceso, clientIds) {
  const filas = await acceso.leerVarios("bandeja_clientes", ["client_id", "activa"], "client_id", clientIds);
  return new Set(filas.filter((f) => Number(f.activa) === 1).map((f) => f.client_id));
}

/** El token de cada cuenta (id de cuentas_sociales → token), descifrado. */
async function tokensDe(env, acceso, cuentaIds) {
  const filas = await acceso.leerVarios("cuentas_sociales", ["id", "token_cifrado"], "id", cuentaIds);
  const salida = new Map();
  for (const f of filas) {
    if (!f.token_cifrado) continue;
    try { salida.set(f.id, await descifrarMeta(env, f.token_cifrado)); } catch { /* sin token: sin extras */ }
  }
  return salida;
}

/**
 * Texto, miniatura y enlace de las publicaciones que no los traen. Por
 * orden de coste: otro comentario de la misma publicación, la foto de
 * métricas, y sólo al final Meta (como mucho `presupuesto` llamadas).
 */
async function infoPublicaciones(env, acceso, sucesos, presupuesto) {
  const info = new Map();
  for (const s of sucesos) if (s.publicacion && s.publicacionId) info.set(s.publicacionId, s.publicacion);
  let faltan = [...new Set(sucesos.map((s) => s.publicacionId).filter((id) => id && !info.has(id)))];
  if (!faltan.length) return info;

  const cols = ["publicacion_id", "publicacion_texto", "publicacion_miniatura", "publicacion_enlace"];
  for (const f of await acceso.leerVarios("bandeja_comentarios", cols, "publicacion_id", faltan)) {
    if (f.publicacion_miniatura || f.publicacion_texto) {
      info.set(f.publicacion_id, { texto: f.publicacion_texto, miniatura: f.publicacion_miniatura, enlace: f.publicacion_enlace });
    }
  }
  faltan = faltan.filter((id) => !info.has(id));
  if (!faltan.length) return info;

  for (const f of await acceso.leerVarios("metricas_publicacion", ["externo_id", "texto", "miniatura", "enlace"], "externo_id", faltan)) {
    info.set(f.externo_id, { texto: f.texto, miniatura: f.miniatura, enlace: f.enlace });
  }
  faltan = faltan.filter((id) => !info.has(id)).slice(0, Math.max(0, presupuesto.restante));
  if (!faltan.length) return info;

  const cuentaDe = new Map(sucesos.map((s) => [s.publicacionId, s.cuentaFila]));
  const tokens = await tokensDe(env, acceso, [...new Set(faltan.map((id) => cuentaDe.get(id)?.id).filter(Boolean))]);
  for (const id of faltan) {
    const cuenta = cuentaDe.get(id);
    const token = tokens.get(cuenta?.id);
    if (!token) continue;
    presupuesto.restante -= 1;
    try {
      if (cuenta.red === "instagram") {
        const m = await graph(env, token, `/${id}`, { params: { fields: "caption,media_type,media_url,thumbnail_url,permalink" } });
        info.set(id, { texto: m.caption ?? "", miniatura: m.thumbnail_url || (m.media_type === "VIDEO" ? "" : m.media_url) || "", enlace: m.permalink ?? "" });
      } else {
        const p = await graph(env, token, `/${id}`, { params: { fields: "message,full_picture,permalink_url" } });
        info.set(id, { texto: p.message ?? "", miniatura: p.full_picture ?? "", enlace: p.permalink_url ?? "" });
      }
    } catch { /* sin miniatura: el comentario se guarda igual */ }
  }
  return info;
}

/**
 * Guarda comentarios (sucesos con `cuentaFila`: id, client_id, externo_id,
 * red de la cuenta). Devuelve cuántas filas cambiaron.
 */
export async function guardarComentarios(env, acceso, sucesos, presupuesto = { restante: 0 }) {
  const owner = acceso.ownerId;
  // El último suceso de cada comentario gana (un «add» y su «edited» en el mismo aviso).
  const porId = new Map();
  for (const s of sucesos) porId.set(idDe(owner, s.red, s.externoId), s);

  const quitar = [...porId].filter(([, s]) => s.verbo === "remove").map(([id]) => id);
  const cambios = quitar.length ? await acceso.borrarVarios("bandeja_comentarios", quitar) : 0;

  const resto = [...porId].filter(([, s]) => s.verbo !== "remove");
  if (!resto.length) return cambios;

  const cols = [
    "id", "padre_id", "publicacion_id", "publicacion_texto", "publicacion_miniatura", "publicacion_enlace",
    "autor_id", "autor", "texto", "propio", "oculto", "atendido", "respondido", "creado_at", "atendido_por", "created_at",
  ];
  const previas = new Map((await acceso.leerVarios("bandeja_comentarios", cols, "id", resto.map(([id]) => id))).map((f) => [f.id, f]));
  const info = await infoPublicaciones(env, acceso, resto.map(([, s]) => s).filter((s) => {
    const p = previas.get(idDe(owner, s.red, s.externoId));
    return !p?.publicacion_miniatura && !p?.publicacion_texto;
  }), presupuesto);

  const marca = ahora();
  const filas = resto.map(([id, s]) => {
    const p = previas.get(id);
    const pub = s.publicacion ?? info.get(s.publicacionId) ?? {};
    const propio = s.propio || (s.autorId && s.autorId === s.cuentaFila.externo_id) ? 1 : Number(p?.propio ?? 0);
    const soloVisibilidad = s.verbo === "hide" || s.verbo === "unhide";
    const oculto = s.verbo === "hide" ? 1 : s.verbo === "unhide" ? 0 : s.oculto !== undefined ? (s.oculto ? 1 : 0) : Number(p?.oculto ?? 0);
    return {
      id,
      client_id: s.cuentaFila.client_id,
      cuenta_id: s.cuentaFila.id,
      red: s.red,
      externo_id: s.externoId,
      padre_id: s.padreId ?? p?.padre_id ?? null,
      publicacion_id: s.publicacionId || p?.publicacion_id || "",
      publicacion_texto: String(pub.texto || p?.publicacion_texto || "").slice(0, 500),
      publicacion_miniatura: pub.miniatura || p?.publicacion_miniatura || "",
      publicacion_enlace: pub.enlace || p?.publicacion_enlace || "",
      autor_id: s.autorId || p?.autor_id || "",
      autor: s.autor || p?.autor || "",
      texto: soloVisibilidad && !s.texto ? (p?.texto ?? "") : (s.texto || p?.texto || ""),
      propio,
      oculto,
      // Lo propio nace atendido: una respuesta de la agencia no es trabajo pendiente.
      atendido: p ? Number(p.atendido) : propio,
      respondido: Number(p?.respondido ?? 0),
      creado_at: p?.creado_at ?? s.creadoAt,
      atendido_por: p?.atendido_por ?? null,
      created_at: p?.created_at ?? marca,
      updated_at: marca,
    };
  });
  await acceso.guardarVarios("bandeja_comentarios", filas);
  return cambios + filas.length;
}

/** El nombre de quien escribe por privado: el aviso sólo trae su id. */
async function nombresDe(env, token, red, ids, presupuesto) {
  const salida = new Map();
  for (const id of ids) {
    if (presupuesto.restante <= 0) break;
    presupuesto.restante -= 1;
    try {
      const u = await graph(env, token, `/${id}`, { params: { fields: red === "instagram" ? "name,username" : "name" } });
      salida.set(id, u.username ? `@${u.username}` : u.name ?? "");
    } catch { /* sin nombre: «Persona de …» en la pantalla */ }
  }
  return salida;
}

/**
 * Guarda mensajes privados y pone al día su hilo. `nombres` (usuarioId →
 * nombre) llega de «Actualizar», que los trae en la misma llamada; el
 * webhook los pide, con tope. Devuelve cuántos mensajes nuevos.
 */
export async function guardarMensajes(env, acceso, sucesos, { presupuesto = { restante: 0 }, nombres = new Map() } = {}) {
  const owner = acceso.ownerId;
  const porId = new Map();
  for (const s of sucesos) porId.set(idDe(owner, s.red, s.externoId), { ...s, hiloId: idHilo(owner, s.red, s.cuentaFila.externo_id, s.usuarioId) });
  if (!porId.size) return 0;

  const lista = [...porId.values()];
  const hiloIds = [...new Set(lista.map((s) => s.hiloId))];
  const hilos = new Map((await acceso.leerVarios("bandeja_hilos",
    ["id", "usuario", "ultimo_texto", "ultimo_at", "ultimo_usuario_at", "sin_leer", "atendido", "created_at"], "id", hiloIds)).map((h) => [h.id, h]));
  const yaEstaban = new Set((await acceso.leerVarios("bandeja_mensajes", ["id"], "id", [...porId.keys()])).map((f) => f.id));

  // Nombres de las personas nuevas: una llamada cada una, con tope.
  const sinNombre = lista.filter((s) => !hilos.get(s.hiloId)?.usuario && !nombres.has(s.usuarioId));
  if (sinNombre.length && presupuesto.restante > 0) {
    const tokens = await tokensDe(env, acceso, [...new Set(sinNombre.map((s) => s.cuentaFila.id))]);
    for (const [cuentaId, token] of tokens) {
      const deEsta = sinNombre.filter((s) => s.cuentaFila.id === cuentaId);
      const encontrados = await nombresDe(env, token, deEsta[0].red, [...new Set(deEsta.map((s) => s.usuarioId))], presupuesto);
      for (const [k, v] of encontrados) if (v) nombres.set(k, v);
    }
  }

  const marca = ahora();
  const filasHilos = [];
  for (const hiloId of hiloIds) {
    const suyos = lista.filter((s) => s.hiloId === hiloId).sort((a, b) => a.enviadoAt.localeCompare(b.enviadoAt));
    const primero = suyos[0];
    const previo = hilos.get(hiloId);
    const ultimo = suyos.at(-1);
    const ultimoDelUsuario = suyos.filter((s) => !s.propio).at(-1)?.enviadoAt ?? null;
    const nuevosDelUsuario = suyos.filter((s) => !s.propio && !yaEstaban.has(idDe(owner, s.red, s.externoId))).length;
    const masReciente = !previo?.ultimo_at || ultimo.enviadoAt >= previo.ultimo_at;
    filasHilos.push({
      id: hiloId,
      client_id: primero.cuentaFila.client_id,
      cuenta_id: primero.cuentaFila.id,
      red: primero.red,
      usuario_id: primero.usuarioId,
      usuario: nombres.get(primero.usuarioId) || previo?.usuario || "",
      ultimo_texto: masReciente ? (ultimo.texto || (ultimo.adjuntos?.length ? "(archivo adjunto)" : "")).slice(0, 300) : previo.ultimo_texto,
      ultimo_at: masReciente ? ultimo.enviadoAt : previo.ultimo_at,
      ultimo_usuario_at: [previo?.ultimo_usuario_at, ultimoDelUsuario].filter(Boolean).sort().at(-1) ?? null,
      sin_leer: Number(previo?.sin_leer ?? 0) + nuevosDelUsuario,
      // Algo nuevo de la persona lo vuelve a abrir; si no, se queda como estaba.
      atendido: nuevosDelUsuario ? 0 : previo ? Number(previo.atendido) : (suyos.every((s) => s.propio) ? 1 : 0),
      created_at: previo?.created_at ?? marca,
      updated_at: marca,
    });
  }
  // Primero los hilos: los mensajes cuelgan de ellos (clave ajena).
  await acceso.guardarVarios("bandeja_hilos", filasHilos);
  const filasMensajes = [...porId].map(([id, s]) => ({
    id,
    client_id: s.cuentaFila.client_id,
    hilo_id: s.hiloId,
    red: s.red,
    externo_id: s.externoId,
    propio: s.propio ? 1 : 0,
    texto: s.texto ?? "",
    adjuntos: JSON.stringify(s.adjuntos ?? []),
    enviado_at: s.enviadoAt,
    enviado_por: s.enviadoPor ?? null,
    created_at: marca,
    updated_at: marca,
  }));
  // Lo que ya estaba no se reescribe: guardarlo otra vez borraría quién lo envió desde aquí.
  const nuevas = filasMensajes.filter((f) => !yaEstaban.has(f.id));
  await acceso.guardarVarios("bandeja_mensajes", nuevas);
  return nuevas.length;
}

/** Comentarios y mensajes de un mismo espacio, a sus tablas. */
export async function guardarSucesos(env, acceso, sucesos, presupuesto = { restante: 0 }, nombres = new Map()) {
  const comentarios = sucesos.filter((s) => s.tipo === "comentario");
  const mensajes = sucesos.filter((s) => s.tipo === "mensaje");
  return {
    comentarios: comentarios.length ? await guardarComentarios(env, acceso, comentarios, presupuesto) : 0,
    mensajes: mensajes.length ? await guardarMensajes(env, acceso, mensajes, { presupuesto, nombres }) : 0,
  };
}

/**
 * Un aviso del webhook, ya con la firma comprobada. Devuelve cuántos
 * sucesos se guardaron y cuántos se descartaron (de nadie, o de un cliente
 * con la bandeja apagada).
 */
export async function procesarAviso(env, aviso) {
  const sucesos = desmenuzar(aviso);
  const resumen = { guardados: 0, descartados: 0, espacios: 0 };
  if (!sucesos.length) return resumen;

  // ¿De quién es cada cuenta? Puede ser de más de un espacio.
  const cuentas = [];
  for (const red of new Set(sucesos.map((s) => s.red))) {
    const externos = sucesos.filter((s) => s.red === red).map((s) => s.cuenta);
    for (const c of await cuentasPorExterno(env.DB, red, externos)) cuentas.push({ ...c, red });
  }

  const usados = new Set();
  const presupuesto = { restante: TOPE_CONSULTAS_AVISO };
  for (const owner of new Set(cuentas.map((c) => c.owner_id))) {
    const acceso = crearAcceso(env.DB, owner);
    const suyas = cuentas.filter((c) => c.owner_id === owner);
    const activos = await clientesActivos(acceso, suyas.map((c) => c.client_id));
    const propios = [];
    sucesos.forEach((s, i) => {
      const cuenta = suyas.find((c) => c.red === s.red && c.externo_id === s.cuenta && activos.has(c.client_id));
      if (cuenta) { propios.push({ ...s, cuentaFila: cuenta }); usados.add(i); }
    });
    if (!propios.length) continue;
    const r = await guardarSucesos(env, acceso, propios, presupuesto);
    resumen.guardados += propios.length;
    resumen.espacios += 1;
    if (r.comentarios || r.mensajes) {
      difundir(env, owner, {
        tipo: "bandeja",
        clientes: [...new Set(propios.map((s) => s.cuentaFila.client_id))],
        comentarios: r.comentarios, mensajes: r.mensajes,
        por: FIRMA_META,
      });
    }
  }
  resumen.descartados = sucesos.length - usados.size;
  return resumen;
}
