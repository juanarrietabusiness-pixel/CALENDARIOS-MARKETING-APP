// ============================================================
// Qué publicaciones entran en el lote
//
// Antes esto era `candidatas.slice(0, tope)` escrito en medio del diálogo.
// Con 21 publicaciones con contenido y un tope de 12, nueve se caían sin
// que nadie lo decidiera, sin aparecer en ninguna parte y sin forma de
// generarlas en una segunda vuelta.
//
// Vive aquí y no en el componente por lo mismo que `tandas.js`: es
// aritmética de índices, y la aritmética de índices falla en silencio. Un
// off-by-one aquí no rompe nada visible: repite una publicación o se salta
// otra, y eso sólo se ve cuando el prompt ya está pegado en Meta AI.
// ============================================================

/** Los identificadores de las primeras que caben. Es la propuesta al abrir. */
export function primeras(candidatas, tope) {
  return candidatas.slice(0, tope).map((p) => p.id);
}

/**
 * La tanda que sigue a la última marcada, en orden de calendario.
 *
 * Se busca la última POR POSICIÓN en `candidatas`, no por orden de marcado:
 * si marcas la 5 y luego la 2, la siguiente tanda arranca en la 6.
 */
export function siguientes(candidatas, elegidas, tope) {
  const ultima = candidatas.reduce((max, p, i) => (elegidas.has(p.id) ? i : max), -1);
  return candidatas.slice(ultima + 1, ultima + 1 + tope).map((p) => p.id);
}

/** Cuántas quedan por detrás de la última marcada. */
export function restantes(candidatas, elegidas) {
  const ultima = candidatas.reduce((max, p, i) => (elegidas.has(p.id) ? i : max), -1);
  return Math.max(0, candidatas.length - ultima - 1);
}

/**
 * Marca o desmarca una, respetando el tope.
 *
 * El tope no es una sugerencia: es lo que aguanta una tanda. Desmarcar
 * siempre se puede; marcar, sólo si queda sitio.
 */
export function alternar(elegidas, id, tope) {
  const s = new Set(elegidas);
  if (s.has(id)) s.delete(id);
  else if (s.size < tope) s.add(id);
  return s;
}
