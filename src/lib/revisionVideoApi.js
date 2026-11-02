// ============================================================
// Cliente de «¿Está listo este video?» y de «Las piezas juntas» (/api/estudio/<cliente>/revisar-video y /serie)
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
