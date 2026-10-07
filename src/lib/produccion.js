// ============================================================
// «Producir el mes»: qué semanas y qué días, y en qué orden (puro)
//
// La agencia produce por TIPO de contenido, y el tipo va por día de la
// semana (lunes Anuncio, martes Promociones…): todos los lunes del mes
// salen con el mismo estilo. Por eso, por defecto, la lista va de lunes a
// domingo y dentro de cada día por fecha; «Por fecha» la deja corrida.
// La semana es la FILA de la rejilla (`semanaDelMes`), la misma que la
// lista por semanas y la campaña de cada semana.
// ============================================================

import { semanaDelMes } from "./semanas";

/** Los días en el orden de la agencia: lunes primero. `n` es el de `getUTCDay()`. */
export const DIAS_SEMANA = Object.freeze([
  { n: 1, nombre: "Lunes", corto: "Lun" },
  { n: 2, nombre: "Martes", corto: "Mar" },
  { n: 3, nombre: "Miércoles", corto: "Mié" },
  { n: 4, nombre: "Jueves", corto: "Jue" },
  { n: 5, nombre: "Viernes", corto: "Vie" },
  { n: 6, nombre: "Sábado", corto: "Sáb" },
  { n: 0, nombre: "Domingo", corto: "Dom" },
]);

/** 0 = domingo … 6 = sábado, sin depender de la zona horaria. */
export const diaDeLaSemana = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay();

/** La posición de un día en el orden de la agencia (lunes 0 … domingo 6). */
const posicion = (fecha) => (diaDeLaSemana(fecha) + 6) % 7;

/** Las semanas que tienen algo → [número], en orden. */
export function semanasDe(lista = []) {
  return [...new Set(lista.map((c) => semanaDelMes(c.date)))].sort((a, b) => a - b);
}

/** Los días de la semana que tienen algo → los de DIAS_SEMANA que aparecen, lunes primero. */
export function diasDe(lista = []) {
  const hay = new Set(lista.map((c) => diaDeLaSemana(c.date)));
  return DIAS_SEMANA.filter((d) => hay.has(d.n));
}

/**
 * Lo que queda con el filtro: `semanas` y `dias` son conjuntos (de números de semana y de `getUTCDay`);
 * vacío o null = todas. Pura.
 */
export function filtrarProduccion(lista = [], { semanas = null, dias = null } = {}) {
  return lista.filter((c) =>
    (!semanas?.size || semanas.has(semanaDelMes(c.date))) && (!dias?.size || dias.has(diaDeLaSemana(c.date))));
}

/** «dia»: de lunes a domingo y, dentro, por fecha; «fecha»: corrido. No cambia la lista de entrada. Pura. */
export function ordenarProduccion(lista = [], orden = "dia") {
  return [...lista].sort((a, b) =>
    (orden === "dia" ? posicion(a.date) - posicion(b.date) : 0) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
