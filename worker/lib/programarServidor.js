// ============================================================
// Programar desde el SERVIDOR: preparar en el Container y meter en la cola, aunque se cierre la pestaña
//
// Instagram sólo publica JPEG, lo que no cabe en el feed sale con su copia 4:5 (9:16 en la historia) y las fotos de
// TikTok van a 1080p. Eso lo hacía el navegador: «Programar lo aprobado» preparaba cada imagen una tras otra y guardaba
// el mes al final (si se cerraba la pestaña a la mitad no quedaba nada), y Claude por MCP no podía programar una pieza
// del Estudio (son PNG: «programa desde el panel»). Ahora:
//
//   · `prepararYProgramar`: UNA publicación. El Container la prepara con la MISMA regla y el MISMO dibujo que el
//     navegador (redesServidor.js, lo que ya hacía «Programar al aprobar») y `programar` la mete en la cola. Lo usa
//     `programar_publicacion` de Claude.
//   · Un LOTE (`programar_lotes`, 0081): la lista de lo que falta, lo que salió y lo que no y por qué. Cada paso hace
//     UNA publicación y guarda el avance; lo da la bomba del espacio (su Durable Object, worker/lib/estudio/bomba.js),
//     el cron de respaldo y, mientras se mira, la pantalla que lo sigue (GET /api/publicar/lotes/:id empuja si lleva
//     quieto un rato). `bloqueado_hasta` es el permiso de un paso a la vez, como en los encargos del Estudio. Lo lanzan
//     «Programar lo aprobado» de la pantalla, `programar_lo_aprobado` de Claude y «Aprobar todas» del cliente con
//     «Programar al aprobar» encendido.
//
// Sin Container (en local) no hay nada que preparar en el servidor: `prepararYGuardar` lo dice y `programar` explica lo
// que falta, como antes. La pantalla, sin Container, sigue por su camino de siempre (src/lib/programarAprobadas.js).
// ============================================================

import { uuid, ahora } from "./ids.js";
import { difundir, firma } from "./vivo.js";
import { despertar } from "./despertar.js";
import { json, error, cuerpo, noEncontrado } from "./respuesta.js";
import { programar, ErrorPublicar, esDePostPeer, buscarPublicacion } from "./publicador.js";
import { prepararYGuardar } from "./redesServidor.js";
import { avisar, miembrosDe, destinatariosDe, enlacePublicacion, AVISO_SEGUIDO_MS } from "./equipo.js";
import { redesDe } from "../../src/lib/publicacion.js";
import { tipoAprobacion } from "../../src/lib/aprobacion.js";

/** Lo más que lleva un lote (un mes trae unas 30). */
export const MAX_LOTE = 100;
/** El permiso de un paso: preparar en el Container puede tardar (arrancarlo, varias imágenes). */
export const RESERVA_LOTE_MS = 4 * 60_000;
/** Un lote que lleva esto sin terminar se cierra: lo que falte queda con su motivo. */
export const PLAZO_LOTE_MS = 60 * 60_000;
/** Desde cuánto quieto la pantalla que lo sigue da ella el paso (la bomba lo da en segundos). */
export const EMPUJAR_TRAS_MS = 20_000;

const FIRMA = { userId: "sistema", nombre: "Programar", color: "", tab: null };
const leerJSON = (t, d) => { if (t && typeof t === "object") return t; try { return JSON.parse(t) ?? d; } catch { return d; } };
const tituloDe = (post) => String(post?.title || post?.idea || "una publicación").replace(/\s+/g, " ").slice(0, 80);

/**
 * Prepara (Container) y programa UNA publicación. `redes`: las pedidas (null: las suyas). → { filas, preparada,
 * problema }. Lanza `ErrorPublicar` con el motivo de `programar` y, si lo hubo, lo que no se pudo preparar.
 */
export async function prepararYProgramar(env, acceso, { calendarId, postId, redes = null, usuarioId = null, soloPosibles = false }) {
  const cal = await acceso.leerUno("calendars", { id: calendarId });
  if (!cal) throw new ErrorPublicar("Ese calendario no existe.");
  const hallada = buscarPublicacion(leerJSON(cal.days, []), postId);
  if (!hallada) throw new ErrorPublicar("La publicación ya no está en el calendario.");
  const [cliente, cuentas] = await Promise.all([
    acceso.leerUno("clients", { id: cal.client_id }),
    acceso.leer("cuentas_sociales", { client_id: cal.client_id }),
  ]);
  const conectadas = [...new Set(cuentas.filter((c) => c.red !== "tiktok" || esDePostPeer(c)).map((c) => c.red))];
  const salen = (Array.isArray(redes) && redes.length ? redes : redesDe(hallada.post, conectadas)).filter((r) => conectadas.includes(r));
  let prep = { preparada: false, problema: null };
  if (salen.length) {
    try {
      prep = await prepararYGuardar(env, acceso, { calendarId, postId, redes: salen, clienteId: cal.client_id, colorMarca: cliente?.primary_color || "#ffffff" });
    } catch (e) {
      prep = { preparada: false, problema: `no se pudieron preparar las imágenes: ${e?.message ?? e}` };
    }
  }
  try {
    const filas = await programar(env, acceso, { calendarId, postId, redes: Array.isArray(redes) && redes.length ? redes : null, usuarioId, soloPosibles });
    return { filas, ...prep };
  } catch (e) {
    if (e instanceof ErrorPublicar && prep.problema) throw new ErrorPublicar(`${e.message} (Al prepararla en el servidor: ${prep.problema}.)`);
    throw e;
  }
}

/** Lo que ve la pantalla (y Claude) de un lote. */
export function lotePublico(f) {
  if (!f) return null;
  const hechas = leerJSON(f.hechas, []);
  const fallidas = leerJSON(f.fallidas, []);
  const pendientes = leerJSON(f.pendientes, []);
  return {
    id: f.id, calendarId: f.calendar_id, clientId: f.client_id, estado: f.estado, origen: f.origen,
    total: hechas.length + fallidas.length + pendientes.length,
    hechas: hechas.length, programadas: hechas.reduce((s, h) => s + (Number(h.piezas) || 0), 0),
    pendientes: pendientes.length, fallidas, avisos: hechas.filter((h) => h.aviso).map((h) => ({ postId: h.postId, aviso: h.aviso })),
    nota: f.nota ?? "", creado: f.created_at, terminado: f.terminado_at ?? null,
  };
}

/**
 * Crea el lote de un calendario con esas publicaciones (en orden, sin repetir, y sin las que ya van en otro lote vivo
 * del mismo mes: dos pasos a la vez sobre la misma publicación la meterían dos veces en la cola) y despierta a la
 * bomba. → la fila, o null si no queda ninguna. `origen`: «agencia», «claude» o «al_aprobar».
 */
export async function crearLoteProgramar(env, acceso, { calendarId, postIds = [], usuarioId = null, origen = "agencia" }) {
  const cal = await acceso.leerUno("calendars", { id: calendarId });
  if (!cal) throw new ErrorPublicar("Ese calendario no existe.");
  const vivos = await acceso.leer("programar_lotes", { calendar_id: calendarId, estado: "en_marcha" });
  const ocupadas = new Set(vivos.flatMap((l) => leerJSON(l.pendientes, [])));
  const ids = [...new Set((Array.isArray(postIds) ? postIds : []).map(String))].filter((id) => !ocupadas.has(id)).slice(0, MAX_LOTE);
  if (!ids.length) return vivos[0] ?? null;
  const t = ahora();
  const fila = await acceso.insertar("programar_lotes", {
    id: uuid(), client_id: cal.client_id, calendar_id: calendarId, estado: "en_marcha",
    origen: ["agencia", "claude", "al_aprobar"].includes(origen) ? origen : "agencia",
    pendientes: JSON.stringify(ids), hechas: "[]", fallidas: "[]", nota: "En cola", creado_por: usuarioId,
    bloqueado_hasta: "", created_at: t, updated_at: t, terminado_at: null,
  });
  await despertar(env, acceso.ownerId);
  return fila;
}

/**
 * Da UN paso del lote `id`: prepara y programa la siguiente publicación y guarda el avance. → { lote, hizo, ocupado }
 * o null si no existe. Nunca lanza por una publicación: la que no se puede queda en `fallidas` con su motivo.
 */
export async function avanzarLoteProgramar(env, acceso, id) {
  const fila = await acceso.leerUno("programar_lotes", { id });
  if (!fila) return null;
  if (fila.estado !== "en_marcha") return { lote: fila, hizo: false, ocupado: false };
  const t = Date.now();
  if (fila.bloqueado_hasta && fila.bloqueado_hasta > new Date(t).toISOString()) return { lote: fila, hizo: false, ocupado: true };
  const permiso = new Date(t + RESERVA_LOTE_MS).toISOString();
  if ((await acceso.actualizar("programar_lotes", { id, bloqueado_hasta: fila.bloqueado_hasta }, { bloqueado_hasta: permiso })) !== 1) {
    return { lote: fila, hizo: false, ocupado: true };
  }
  const pendientes = leerJSON(fila.pendientes, []);
  const hechas = leerJSON(fila.hechas, []);
  const fallidas = leerJSON(fila.fallidas, []);
  let hizo = false;
  if (t - Date.parse(fila.created_at) > PLAZO_LOTE_MS) {
    for (const postId of pendientes.splice(0)) fallidas.push({ postId, motivo: "Se acabó el tiempo para prepararla: prográmala desde su panel." });
  } else if (pendientes.length) {
    const postId = pendientes.shift();
    try {
      const r = await prepararYProgramar(env, acceso, { calendarId: fila.calendar_id, postId, usuarioId: fila.creado_por, soloPosibles: true });
      hechas.push({ postId, piezas: r.filas.length, ...(r.problema ? { aviso: String(r.problema).slice(0, 200) } : {}) });
      difundir(env, acceso.ownerId, { tipo: "publicacion", calId: fila.calendar_id, postId, por: FIRMA });
    } catch (e) {
      if (!(e instanceof ErrorPublicar)) console.error("programar en el servidor:", postId, e);
      fallidas.push({ postId, motivo: e instanceof ErrorPublicar ? e.message : "No se pudo programar por un error inesperado. Ábrela y prográmala desde su panel." });
    }
    hizo = true;
  }
  const estado = pendientes.length ? "en_marcha" : hechas.length ? "hecho" : "fallido";
  const total = pendientes.length + hechas.length + fallidas.length;
  const nota = estado === "en_marcha"
    ? `Preparando y programando (${hechas.length + fallidas.length + 1} de ${total})…`
    : `Programadas ${hechas.length} de ${total}${fallidas.length ? `; no se pudieron ${fallidas.length}` : ""}.`;
  await acceso.actualizar("programar_lotes", { id, bloqueado_hasta: permiso }, {
    pendientes: JSON.stringify(pendientes), hechas: JSON.stringify(hechas), fallidas: JSON.stringify(fallidas),
    nota, estado, bloqueado_hasta: "", updated_at: ahora(), ...(estado !== "en_marcha" ? { terminado_at: ahora() } : {}),
  });
  const actual = await acceso.leerUno("programar_lotes", { id });
  if (actual && estado !== "en_marcha") await avisarLote(env, acceso, actual);
  return { lote: actual, hizo, ocupado: false };
}

/**
 * Da pasos seguidos mientras quede tiempo (`presupuestoMs`): lo usan Claude (para contestar con lo que ya salió) y la
 * pantalla que empuja un lote quieto. → la fila al final.
 */
export async function avanzarMientras(env, acceso, id, presupuestoMs = 20_000) {
  const inicio = Date.now();
  let r = null;
  do {
    r = await avanzarLoteProgramar(env, acceso, id);
    if (!r?.hizo) break;
  } while (r.lote?.estado === "en_marcha" && Date.now() - inicio < presupuestoMs);
  return r?.lote ?? (await acceso.leerUno("programar_lotes", { id }));
}

/** Los lotes vivos de UN espacio, para la bomba de su Durable Object. */
export async function lotesVivos(acceso, limite = 3) {
  return acceso.leer("programar_lotes", { estado: "en_marcha" }, "created_at asc", limite);
}

/**
 * El aviso al cerrarse un lote. Lo de «Programar al aprobar» sólo avisa de lo que NO entró (con el motivo, a quien la
 * lleva o a todo el equipo), como hacía `programarAlAprobar`. Lo pedido por una persona (la pantalla, Claude) avisa a
 * quien lo pidió si algo no entró o si tardó tanto que lo más probable es que ya no se estuviera mirando. Nunca lanza.
 */
export async function avisarLote(env, acceso, fila) {
  try {
    const fallidas = leerJSON(fila.fallidas, []);
    const hechas = leerJSON(fila.hechas, []);
    const cal = await acceso.leerUno("calendars", { id: fila.calendar_id });
    const dias = leerJSON(cal?.days, []);
    const titulo = (postId) => tituloDe(buscarPublicacion(dias, postId)?.post);
    if (fila.origen === "al_aprobar") {
      if (!fallidas.length) return;
      const [cliente, miembros] = await Promise.all([acceso.leerUno("clients", { id: fila.client_id }), miembrosDe(acceso)]);
      for (const f of fallidas.slice(0, 10)) {
        const post = buscarPublicacion(dias, f.postId)?.post;
        await avisar(env, acceso, {
          para: destinatariosDe(miembros, post?.responsableId), tipo: "fallo",
          texto: `${cliente?.name ? `${cliente.name}: ` : ""}el cliente aprobó «${titulo(f.postId)}», pero no se pudo programar sola: ${f.motivo}`.slice(0, 500),
          enlace: enlacePublicacion(fila.client_id, fila.calendar_id, f.postId), por: { userId: "sistema", nombre: "Programar al aprobar" },
        });
      }
      return;
    }
    if (!fila.creado_por) return;
    const tardo = Date.parse(fila.terminado_at ?? ahora()) - Date.parse(fila.created_at) >= AVISO_SEGUIDO_MS;
    if (!fallidas.length && !tardo) return;
    const mes = String(cal?.name || "").trim() || "el calendario";
    const texto = fallidas.length
      ? `Programadas ${hechas.length} de ${hechas.length + fallidas.length} de ${mes}. No se pudo: ${fallidas.slice(0, 3).map((f) => `«${titulo(f.postId)}» (${f.motivo})`).join("; ")}${fallidas.length > 3 ? ` y ${fallidas.length - 3} más` : ""}.`
      : `Listo: ${hechas.length === 1 ? "programada 1 publicación" : `programadas ${hechas.length} publicaciones`} de ${mes}.`;
    await avisar(env, acceso, {
      para: [fila.creado_por], tipo: fallidas.length ? "fallo" : "programado", texto: texto.slice(0, 500),
      enlace: fallidas.length === 1 ? enlacePublicacion(fila.client_id, fila.calendar_id, fallidas[0].postId) : "/produccion",
      por: { userId: "sistema", nombre: "Programar" },
    });
  } catch (e) {
    console.error("aviso del lote de programar:", e);
  }
}

/**
 * «Aprobar todas» del cliente con «Programar al aprobar» encendido: la PIEZA FINAL aprobada entra en la cola sin pantalla
 * (en un lote: preparar 25 publicaciones no cabe en lo que dura una respuesta). Una idea aprobada, nunca. → la fila del
 * lote, o null si no toca.
 */
export async function programarAlAprobarVarias(env, acceso, { calendarId, postIds = [] }) {
  const cal = await acceso.leerUno("calendars", { id: calendarId });
  if (!cal) return null;
  const cliente = await acceso.leerUno("clients", { id: cal.client_id });
  if (!(cliente?.programar_al_aprobar === 1 || leerJSON(cal.opciones, {})?.programarAlAprobar)) return null;
  const dias = leerJSON(cal.days, []);
  const piezas = postIds.filter((id) => {
    const p = buscarPublicacion(dias, id)?.post;
    return p && tipoAprobacion(p) === "pieza";
  });
  if (!piezas.length) return null;
  return crearLoteProgramar(env, acceso, { calendarId, postIds: piezas, origen: "al_aprobar" });
}

/**
 * /api/publicar/lotes
 *
 *   POST { calendarId, postIds }  Crea el lote (prepara en el Container y programa, en el servidor). 409 `sin_container`
 *                                 si no hay Container: la pantalla sigue por su camino de siempre.
 *   GET  /:id                     Cómo va. Si lleva quieto un rato (la bomba no lo avanza), da ella el paso.
 */
export async function rutaLotes(req, env, { acceso, usuario, partes, metodo }) {
  const [, , id] = partes;
  if (!id && metodo === "POST") {
    if (!env.VIDEO) return json({ error: "No hay Container para preparar las imágenes en el servidor.", codigo: "sin_container" }, 409);
    const b = (await cuerpo(req)) ?? {};
    if (!b.calendarId || !Array.isArray(b.postIds) || !b.postIds.length) return error("Faltan las publicaciones");
    try {
      const fila = await crearLoteProgramar(env, acceso, { calendarId: String(b.calendarId), postIds: b.postIds, usuarioId: usuario.id, origen: "agencia" });
      if (!fila) return error("No hay nada que programar.", 422);
      difundir(env, acceso.ownerId, { tipo: "publicacion", calId: fila.calendar_id, por: firma(usuario, req) });
      return json({ lote: lotePublico(fila) }, 201);
    } catch (e) {
      if (e instanceof ErrorPublicar) return error(e.message, 422);
      throw e;
    }
  }
  if (id && metodo === "GET") {
    let fila = await acceso.leerUno("programar_lotes", { id });
    if (!fila) return noEncontrado("Lote");
    const quieto = Date.now() - Date.parse(fila.updated_at) > EMPUJAR_TRAS_MS;
    if (fila.estado === "en_marcha" && quieto && !(fila.bloqueado_hasta > new Date().toISOString())) {
      const r = await avanzarLoteProgramar(env, acceso, id).catch((e) => { console.error("empujar lote:", e); return null; });
      if (r?.lote) fila = r.lote;
      if (fila.estado === "en_marcha") await despertar(env, acceso.ownerId);
    }
    return json({ lote: lotePublico(fila) });
  }
  return noEncontrado("Ruta");
}
