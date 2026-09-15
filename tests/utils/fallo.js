// ============================================================
// Formato único de los fallos de despliegue.
//
// Un test que sólo dice «expected false to be true» obliga a abrir el
// archivo, entender la regla y deducir el arreglo. Aquí cada fallo dice
// las cuatro cosas que hacen falta para corregirlo sin contexto previo:
// qué se rompió, dónde, por qué importa y qué hacer.
//
// El formato es fijo a propósito: así el reporter de `informe.js` puede
// recomponerlo en un informe legible, y un agente que reciba ese informe
// tiene el arreglo delante sin volver a auditar el repositorio.
// ============================================================

/**
 * @param {object} d
 * @param {string} d.que      qué regla se incumple
 * @param {string} d.donde    archivo (y línea, si se sabe)
 * @param {string} d.porque   qué se rompe en producción si esto pasa
 * @param {string} d.arreglo  la corrección concreta
 */
export function fallo({ que, donde, porque, arreglo }) {
  return [
    "",
    `  ✗ ${que}`,
    `    dónde:   ${donde}`,
    `    porqué:  ${porque}`,
    `    arreglo: ${arreglo}`,
    "",
  ].join("\n");
}

/** Une varios fallos del mismo test en un solo mensaje. */
export function fallos(lista) {
  return lista.join("");
}
