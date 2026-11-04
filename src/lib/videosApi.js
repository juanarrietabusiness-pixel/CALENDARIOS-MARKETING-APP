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
  return r?.video ?? null;
}

export async function borrarVideo(clienteId, id) {
  await pedir(`${base(clienteId)}/${encodeURIComponent(id)}`, { method: "DELETE" });
  avisar(clienteId, id);
}
