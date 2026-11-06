// ============================================================
// Cliente de «Publicar con música» (POST /api/videos/<c>/con-musica) y lo que necesita su pantalla (en diferido: lo
// carga calendario/ConMusica.jsx, que va lazy en la pestaña Pieza del panel)
// ============================================================

import { pedir } from "./db";

const base = (clienteId) => `/videos/${encodeURIComponent(clienteId)}`;
const avisar = (clienteId, id) => { try { window.dispatchEvent(new CustomEvent("videos", { detail: { local: true, clienteId, id } })); } catch { /* sin ventana */ } };

/** Las músicas de la galería del cliente (las de «Sonido» del video animado), de la más nueva a la más vieja. */
export async function musicasDelCliente(clienteId) {
  return (await pedir(`${base(clienteId)}/musicas`))?.musicas ?? [];
}

/**
 * Pide el reel con música de una publicación de UNA foto: crea el video, lo aprueba y lo renderiza en el servidor.
 * → { video, musica, costo: 0, aviso }. Un 503 (`sin_container`) o un 409 (`sin_musica`) vuelven como error con su
 * `datos.codigo`.
 */
export async function pedirConMusica(clienteId, { postId, calendarId, musicaId, segundos, movimiento, logo }) {
  const r = await pedir(`${base(clienteId)}/con-musica`, {
    method: "POST",
    body: JSON.stringify({ postId, calendarId, musicaId, segundos, movimiento, ...(typeof logo === "boolean" ? { logo } : {}) }),
  });
  avisar(clienteId, r?.video?.id);
  return r;
}

/** Un video animado (para seguir su render). */
export async function leerVideoConMusica(clienteId, id) {
  return (await pedir(`${base(clienteId)}/${encodeURIComponent(id)}`))?.video ?? null;
}

/** El medio del mp4 de un video ya renderizado, como lo pone el servidor en la publicación. */
export function medioDelVideo(video) {
  const r = video?.render ?? {};
  if (r.estado !== "listo" || !r.clave) return null;
  return {
    src: `/api/media/${r.clave}`, tipo: "video", nombre: `${String(video.titulo || "video").slice(0, 60)}.mp4`,
    ancho: r.ancho, alto: r.alto, duracion: r.duracion, videoAnimado: video.id,
  };
}
