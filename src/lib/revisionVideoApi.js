// ============================================================
// Cliente de «¿Está listo este video?», «Las piezas juntas» y «Desglosar toma por toma» (/api/estudio/<cliente>/revisar-video,
// /serie y /archivos/<id>/deconstruir)
//
// Aparte de lib/estudio.js a propósito: ése arrastra el catálogo entero de modelos y lo usa el panel de la publicación.
// ============================================================

import { pedir, conFotogramas } from "./db";

const base = (clienteId) => `/estudio/${encodeURIComponent(clienteId)}`;
const post = (cuerpo) => ({ method: "POST", body: JSON.stringify(cuerpo ?? {}) });
const conGasto = async (promesa) => {
  try { return await promesa; } finally { window.dispatchEvent(new Event("ia:gasto")); }
};

/**
 * «¿Está listo este video?»: `{ archivoId }` (galería) o `{ clave }` (el de una publicación), con `idea`, `productoId`,
 * `formato` y `otraVez`. `src`: el video, por si lo ve Meta (con fotogramas). → { revision, guardada }.
 */
export const revisarVideo = (clienteId, datos, src = "") =>
  conGasto(conFotogramas((fotogramas) => pedir(`${base(clienteId)}/revisar-video`, post({ ...datos, ...(fotogramas ? { fotogramas } : {}) })), src));

/** «Las piezas juntas»: la hoja del mes (JPEG en base64) y cuántas piezas lleva. → { puntaje, resumen, comun, fuera }. */
export const revisarSerie = (clienteId, imagen, total) => conGasto(pedir(`${base(clienteId)}/serie`, post({ imagen, total })));

/**
 * «Desglosar toma por toma» un video de la galería: la IA lo describe sin opinar (planos, cámara, luz, lo que se dice,
 * el ritmo de cortes). Queda en su ficha: la segunda vez no se paga, salvo `otraVez`. `src`: el video, por si lo ve Meta
 * (con fotogramas). → { deconstruccion, guardada }.
 */
export const deconstruirVideo = (clienteId, archivoId, { otraVez = false } = {}, src = "") =>
  conGasto(conFotogramas((fotogramas) => pedir(`${base(clienteId)}/archivos/${encodeURIComponent(archivoId)}/deconstruir`, post({ otraVez, ...(fotogramas ? { fotogramas } : {}) })), src));
