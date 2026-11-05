// ============================================================
// Cliente de /api/videos/<cliente>: los proyectos de video animado
//
// Tras crear, guardar, aprobar o borrar se lanza `videos` en `window` (con
// `local`): el eco de la propia pestaña no llega por el socket, y la lista y el
// video abierto tienen que verse entre sí. Un guion con errores vuelve como
// error con `datos.errores` (cada uno con su `donde`): la pantalla los enseña.
// ============================================================

import { pedir } from "./db";

const base = (clienteId) => `/videos/${encodeURIComponent(clienteId)}`;
const json = (metodo, datos) => ({ method: metodo, body: JSON.stringify(datos ?? {}) });
const avisar = (clienteId, id) => { try { window.dispatchEvent(new CustomEvent("videos", { detail: { local: true, clienteId, id } })); } catch { /* sin ventana */ } };

export async function listarVideos(clienteId) {
  return (await pedir(base(clienteId)))?.videos ?? [];
}

export async function leerVideo(clienteId, id) {
  return (await pedir(`${base(clienteId)}/${encodeURIComponent(id)}`))?.video ?? null;
}

/** → { video, avisos }. */
export async function crearVideo(clienteId, { guion, titulo, calendarId, postId } = {}) {
  const r = await pedir(base(clienteId), json("POST", { guion, titulo, calendarId, postId }));
  avisar(clienteId, r?.video?.id);
  return r;
}

/** Guarda el guion y/o el título de la versión que se tenía abierta → { video, avisos }. 409 si otra persona lo cambió. */
export async function guardarVideo(clienteId, id, { guion, titulo, version }) {
  const r = await pedir(`${base(clienteId)}/${encodeURIComponent(id)}`, json("PUT", { guion, titulo, version }));
  avisar(clienteId, id);
  return r;
}

export async function aprobarVideo(clienteId, id, version) {
  const r = await pedir(`${base(clienteId)}/${encodeURIComponent(id)}/aprobar`, json("POST", { version }));
  avisar(clienteId, id);
  // `vozReutilizada`: lo que se dice no cambió y la locución de antes sirve para esta versión.
  return r?.video ? { ...r.video, vozReutilizada: r.vozReutilizada === true } : null;
}

/**
 * La IA ESCRIBE el guion (no guarda nada): { idea, segundos, formato, postId? } → { guion, avisos, corregido, aviso,
 * publicacion: { calendarId, postId } | null }.
 */
export async function escribirGuionVideo(clienteId, { idea = "", segundos, formato, postId = "" } = {}) {
  return pedir(`${base(clienteId)}/escribir`, json("POST", { idea, segundos, formato, postId }));
}

/**
 * La LOCUCIÓN del guion aprobado. Sin `confirmado` el servidor contesta 409 con el costo: aquí vuelve como
 * `{ confirmar: { costo, creditos, unidad, voz, modelo, caracteres, error } }` y no se crea nada.
 */
export async function pedirLocucionVideo(clienteId, id, { version, confirmado = false, voz, modelo } = {}) {
  try {
    const r = await pedir(`${base(clienteId)}/${encodeURIComponent(id)}/locucion`, json("POST", { version, confirmado, voz, modelo }));
    avisar(clienteId, id);
    return r;
  } catch (e) {
    if (e.estado === 409 && e.datos?.codigo === "confirmar") return { confirmar: { ...e.datos } };
    throw e;
  }
}

export async function borrarVideo(clienteId, id) {
  await pedir(`${base(clienteId)}/${encodeURIComponent(id)}`, { method: "DELETE" });
  avisar(clienteId, id);
}

// ------------------------------------------------------------
// La voz: las voces del cliente y la MUESTRA de una (siempre pide confirmar el costo)
// ------------------------------------------------------------

/** → { voces, voz, modelo, modelos }: las voces de serie y las propias del kit, y si su muestra ya está hecha. */
export async function listarVoces(clienteId) {
  return pedir(`${base(clienteId)}/voces`);
}

/**
 * Pide la muestra de una voz (`texto` propio, opcional). Sin `confirmado` el servidor contesta 409 con el costo: aquí
 * vuelve como `{ confirmar: { costo, creditos, caracteres } }`, no como error. → { lista, trabajoId, huella, … }.
 */
export async function pedirMuestraVoz(clienteId, { modelo, voz, texto = "", confirmado = false }) {
  try {
    return await pedir(`${base(clienteId)}/voces/muestra`, json("POST", { modelo, voz, texto, confirmado }));
  } catch (e) {
    if (e.estado === 409 && e.datos?.codigo === "confirmar") return { confirmar: e.datos };
    throw e;
  }
}

/** La dirección para oír una muestra ya hecha. */
export const urlMuestraVoz = (clienteId, { modelo, voz, huella = "" }) =>
  `/api${base(clienteId)}/voces/muestra?modelo=${encodeURIComponent(modelo)}&voz=${encodeURIComponent(voz)}${huella ? `&huella=${huella}` : ""}`;

/** Un paso del trabajo de la voz (lo avanza también la bomba del espacio): → el trabajo, con su `nota`. */
export async function avanzarTrabajoVoz(clienteId, trabajoId) {
  return (await pedir(`/estudio/${encodeURIComponent(clienteId)}/trabajos/${encodeURIComponent(trabajoId)}/avanzar`, { method: "POST" }))?.trabajo ?? null;
}

/** Fija la voz (y el modelo) de la marca en el kit del cliente (gratis). → { locucion, voz, modelo }. */
export async function fijarVozDeMarca(clienteId, { voz, modelo }) {
  return pedir(`${base(clienteId)}/voces/marca`, json("PUT", { voz, modelo }));
}

/** Voces en ESPAÑOL de la biblioteca de ElevenLabs (gratis). → { voces, mas, acentos }. */
export async function buscarVocesEnEspanol(clienteId, { q = "", genero = "", acento = "", pagina = 0 } = {}) {
  const p = new URLSearchParams({ q, genero, acento, pagina: String(pagina) });
  return pedir(`${base(clienteId)}/voces/biblioteca?${p}`);
}

/** Añade una voz de la biblioteca a la cuenta de ElevenLabs de la agencia (sólo administración). → { voz }. */
export async function anadirVozDeBiblioteca(clienteId, { publico, voz, nombre }) {
  return pedir(`${base(clienteId)}/voces/biblioteca`, json("POST", { publico, voz, nombre }));
}

/** La dirección para oír GRATIS la muestra que publica ElevenLabs de una voz. */
export const urlPreviaVoz = (clienteId, previa) => `/api${base(clienteId)}/voces/previa?u=${encodeURIComponent(previa)}`;

/** Pide el RENDER a mp4 (guion aprobado y su locución). Contesta ya: el video queda «Renderizando». → el video. */
export async function renderizarVideo(clienteId, id, version) {
  const r = await pedir(`${base(clienteId)}/${encodeURIComponent(id)}/render`, json("POST", { version }));
  avisar(clienteId, id);
  return r?.video ?? null;
}

/** Liga el video a una publicación (`postId` vacío: lo desliga). Si el mp4 ya está, se pone en ella. → { video, puesto, aviso }. */
export async function ligarVideo(clienteId, id, { postId = "", calendarId = "" } = {}) {
  const r = await pedir(`${base(clienteId)}/${encodeURIComponent(id)}/publicacion`, json("POST", { postId, calendarId }));
  avisar(clienteId, id);
  return r;
}
