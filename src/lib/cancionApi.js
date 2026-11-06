// ============================================================
// Cliente de «Video con tu canción» (/api/videos/<cliente>/cancion…): sincronizar la letra con una canción ya grabada,
// crear el borrador con ella y, en un video que ya la tiene, el ajuste fino y «Volver a sincronizar».
//
// Sincronizar SIEMPRE pide confirmar el costo: sin `confirmado` el servidor contesta 409 y aquí vuelve como
// `{ confirmar: { costo, minimo, duracion, palabras, error } }`, no como error. Lo carga sólo la pantalla de la canción.
// ============================================================

import { pedir } from "./db";

const base = (clienteId) => `/videos/${encodeURIComponent(clienteId)}`;
const json = (metodo, datos) => ({ method: metodo, body: JSON.stringify(datos ?? {}) });
const avisar = (clienteId, id) => { try { window.dispatchEvent(new CustomEvent("videos", { detail: { local: true, clienteId, id } })); } catch { /* sin ventana */ } };
const conConfirmacion = async (f) => {
  try {
    return await f();
  } catch (e) {
    if (e.estado === 409 && e.datos?.codigo === "confirmar") return { confirmar: { ...e.datos } };
    throw e;
  }
};

/** Las músicas que puede usar el cliente (las suyas y las de la agencia, la de la marca primero). */
export async function listarCanciones(clienteId) {
  return (await pedir(`${base(clienteId)}/musicas`))?.musicas ?? [];
}

/** Sincroniza la letra con la canción. → { sincronia, repetida } o { confirmar }. */
export function sincronizarCancion(clienteId, { musicaId, letra, confirmado = false }) {
  return conConfirmacion(() => pedir(`${base(clienteId)}/cancion`, json("POST", { musicaId, letra, confirmado })));
}

/**
 * Crea el borrador con la canción: `modo` «karaoke» (gratis) o «ia». `estiloId`: un estilo guardado del cliente (su forma
 * se impone). → { video, avisos, corregido, aviso, fondos, estilo? }.
 */
export async function crearVideoConCancion(clienteId, { huella, modo = "karaoke", formato = "9:16", titulo = "", postId = "", calendarId = "", desplazamiento = 0, indicacion = "", conFondos = false, estiloId = "" }) {
  const r = await pedir(`${base(clienteId)}/cancion/video`, json("POST", { huella, modo, formato, titulo, postId, calendarId, desplazamiento, indicacion, ...(conFondos ? { conFondos: true } : {}), ...(estiloId ? { estiloId } : {}) }));
  avisar(clienteId, r?.video?.id);
  return r;
}

/** El ajuste fino de la letra de un video (gratis, sin cambiar la versión). → el video. */
export async function ajustarCancionVideo(clienteId, id, desplazamiento) {
  const r = await pedir(`${base(clienteId)}/${encodeURIComponent(id)}/cancion`, json("PUT", { desplazamiento }));
  avisar(clienteId, id);
  return r?.video ?? null;
}

/** «Volver a sincronizar» la canción de un video. → { video, sincronia } o { confirmar }. */
export async function resincronizarCancionVideo(clienteId, id, { confirmado = false } = {}) {
  const r = await conConfirmacion(() => pedir(`${base(clienteId)}/${encodeURIComponent(id)}/cancion`, json("POST", { confirmado })));
  if (r?.video) avisar(clienteId, id);
  return r;
}
