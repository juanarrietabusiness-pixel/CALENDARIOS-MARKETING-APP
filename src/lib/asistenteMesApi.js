// ============================================================
// Cliente de lo que el asistente del mes pide al servidor y no tiene otra
// puerta: los REELS del mes (POST /api/estudio/<cliente>/reel/mes,
// worker/lib/estudio/reelDelMes.js). Sin confirmar, el costo (no se crea
// nada); con el «sí», el encargo del reel por planos de cada publicación, que
// se pone solo en ella al terminar.
// ============================================================

import { pedir } from "./db";

const ruta = (clienteId) => `/estudio/${encodeURIComponent(clienteId)}/reel/mes`;
const post = (datos) => ({ method: "POST", body: JSON.stringify(datos ?? {}) });

/** El costo de cada reel, sin crear nada. → { reels: [{ postId, costo, costoTexto, … } | { postId, error }], total, totalTexto } */
export const costoDeReels = (clienteId, { calendarId, postIds }) => pedir(ruta(clienteId), post({ calendarId, postIds }));

/** UN reel, ya confirmado: escribe su guion (sigue el de la publicación) y lanza su encargo. → { encargoId, postId } */
export const lanzarReelDelMes = (clienteId, { calendarId, postId, montar = true }) =>
  pedir(ruta(clienteId), post({ calendarId, postId, montar, confirmado: true }));

/** Los reels lanzados desde este navegador para un mes (para seguir cómo van al volver). */
const clave = (calId) => `asistente-reels:${calId}`;
export function reelsLanzados(calId) {
  try {
    const g = JSON.parse(localStorage.getItem(clave(calId)) ?? "null");
    return Array.isArray(g?.reels) && Date.now() - (g.t ?? 0) < 3 * 86_400_000 ? g.reels : [];
  } catch { return []; }
}
export function apuntarReels(calId, reels) {
  try { localStorage.setItem(clave(calId), JSON.stringify({ reels, t: Date.now() })); } catch { /* sin almacenamiento: se sigue aquí */ }
}
