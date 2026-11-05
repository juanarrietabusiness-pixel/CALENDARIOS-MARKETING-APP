// ============================================================
// Lo que necesita el semáforo del kit, desde el navegador
//
// Es lo de GET /api/estudio (kit, productos con fotos, `sinFotos`, «Me gusta», `perdidas`): la misma lectura de la
// galería, recordada DOS minutos por cliente. Crear y Marca la siembran con lo que ya leyeron (`recordarEstudio`), así
// el aviso de la pestaña Pieza de una publicación no la pide otra vez en cada panel que se abre.
// ============================================================

import { pedir } from "./db";

const DURA_MS = 2 * 60_000;
const RECORDADO = new Map();

/** Lo que ya se leyó de la galería de un cliente (lo llaman Crear y Marca al cargarla). */
export function recordarEstudio(clienteId, datos) {
  if (clienteId && datos) RECORDADO.set(clienteId, { t: Date.now(), datos });
}

/** Lo de GET /api/estudio de un cliente, recordado dos minutos. Lanza con el motivo del servidor. */
export async function estudioDelCliente(clienteId, { fresco = false } = {}) {
  const guardado = RECORDADO.get(clienteId);
  if (!fresco && guardado && Date.now() - guardado.t < DURA_MS) return guardado.datos;
  const datos = await pedir(`/estudio/${encodeURIComponent(clienteId)}`);
  recordarEstudio(clienteId, datos);
  return datos;
}
