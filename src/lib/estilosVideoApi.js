// ============================================================
// Cliente de los ESTILOS DE VIDEO guardados de un cliente (/api/videos/<cliente>/estilos y /<video>/estilo): listar,
// guardar uno de un video, cambiarle el nombre, quitarlo y aplicarlo a un video. Lo cargan sólo las pantallas del video
// (en diferido). Tras guardar o quitar se lanza `estilos-video` en `window`: el eco de la propia pestaña no llega por el
// socket, y la lista del kit y la de «Video con canción» tienen que verse entre sí.
// ============================================================

import { pedir } from "./db";

const base = (clienteId) => `/videos/${encodeURIComponent(clienteId)}`;
const json = (metodo, datos) => ({ method: metodo, body: JSON.stringify(datos ?? {}) });
const avisar = (clienteId) => { try { window.dispatchEvent(new CustomEvent("estilos-video", { detail: { clienteId } })); } catch { /* sin ventana */ } };
const avisarVideo = (clienteId, id) => { try { window.dispatchEvent(new CustomEvent("videos", { detail: { local: true, clienteId, id } })); } catch { /* sin ventana */ } };

/** Los estilos guardados del cliente, cada uno con su `resumen` en frases. */
export async function listarEstilos(clienteId) {
  return (await pedir(`${base(clienteId)}/estilos`))?.estilos ?? [];
}

/** «Guardar como estilo» un video guardado: { nombre, nota?, para? } → { estilo, estilos }. */
export async function guardarEstilo(clienteId, videoId, { nombre, nota = "", para = "" }) {
  const r = await pedir(`${base(clienteId)}/${encodeURIComponent(videoId)}/estilo`, json("POST", { nombre, nota, ...(para ? { para } : {}) }));
  avisar(clienteId);
  return r;
}

/** Cambiar el nombre, la nota o para qué videos es → { estilo, estilos }. */
export async function cambiarEstilo(clienteId, estiloId, cambios) {
  const r = await pedir(`${base(clienteId)}/estilos/${encodeURIComponent(estiloId)}`, json("PATCH", cambios));
  avisar(clienteId);
  return r;
}

/** Quitar un estilo → { estilos }. */
export async function quitarEstilo(clienteId, estiloId) {
  const r = await pedir(`${base(clienteId)}/estilos/${encodeURIComponent(estiloId)}`, { method: "DELETE" });
  avisar(clienteId);
  return r;
}

/** Imponer un estilo al guion de un video (una versión nueva, en borrador) → { video, cambios }. */
export async function aplicarEstiloAVideo(clienteId, videoId, { estiloId, version }) {
  const r = await pedir(`${base(clienteId)}/${encodeURIComponent(videoId)}/aplicar-estilo`, json("POST", { estiloId, version }));
  if (r?.cambios) avisarVideo(clienteId, videoId);
  return r;
}
