// ============================================================
// Las plantillas de plan, desde el navegador (/api/plantillas-plan)
//
// La lista cambia poco y la piden la ficha del cliente, «Planificar mes» y
// Ajustes: se recuerda en memoria y se olvida al guardar o borrar.
// ============================================================

import { pedir } from "./db";

let recordada = null;

/** → [plantilla] (las de arranque con lo cambiado, y las propias). */
export async function leerPlantillas({ forzar = false } = {}) {
  if (!forzar && recordada) return recordada;
  const r = await pedir("/plantillas-plan");
  recordada = r.plantillas ?? [];
  return recordada;
}

export async function guardarPlantilla(id, plantilla) {
  const r = await pedir(`/plantillas-plan/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ plantilla }) });
  recordada = r.plantillas ?? null;
  return recordada;
}

/** Una propia se borra; una de arranque vuelve a como venía. */
export async function borrarPlantilla(id) {
  const r = await pedir(`/plantillas-plan/${encodeURIComponent(id)}`, { method: "DELETE" });
  recordada = r.plantillas ?? null;
  return recordada;
}
