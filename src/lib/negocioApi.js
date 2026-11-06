// ============================================================
// Cliente de /api/anuncios/clientes/<c>/negocio: los números del negocio (worker/lib/negocio.js)
// ============================================================

import { pedir } from "./db";

const ruta = (clientId, resto = "") => `/anuncios/clientes/${encodeURIComponent(clientId)}/negocio${resto}`;

/**
 * Lo guardado, la tasa por defecto del Manual y lo de Meta en 30 días. `meta: false` no pregunta a Meta (el
 * estratega y el diagnóstico sólo necesitan lo guardado).
 */
export const leerNegocio = (clientId, { meta = true } = {}) => pedir(ruta(clientId, meta ? "" : "?meta=0"));

/** Guardar. `antes` es el `actualizado` que se leyó: si otra persona guardó entremedias, 409 con lo de ahora. */
export const guardarNegocio = (clientId, negocio, antes = null) =>
  pedir(ruta(clientId), { method: "PUT", body: JSON.stringify({ negocio, antes }) });

/** La IA propone lo que falta (con lo que está en pantalla, sin guardar). */
export const proponerNegocio = (clientId, negocio) =>
  pedir(ruta(clientId, "/proponer"), { method: "POST", body: JSON.stringify({ negocio }) });
