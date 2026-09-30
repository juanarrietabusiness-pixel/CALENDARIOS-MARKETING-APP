// ============================================================
// Los pesos que aprende el cerebro
//
// Lo que se lee en CADA búsqueda: cuánto sube o baja cada nota según lo que
// pasó con las publicaciones donde se usó (`reinforce()`, memoria.js) y qué
// pares de notas se refuerzan al citarse juntas. Va en su propia columna
// (`cerebro_memoria.pesos`), aparte de la contabilidad de señales ya
// aplicadas (`aplicadas`), que sólo hace falta al aprender: leerla en cada
// búsqueda sería pagar por lo que la búsqueda no usa.
//
// Es un factor de 0,8 a 1,2 sobre la puntuación (`boostOf`): una nota que
// suele salir bien sube un poco, una que suele salir mal baja un poco, y
// nunca desaparece de la búsqueda por eso. Con los meses todo vuelve al
// neutro (vida media de 90 días) si no se sigue usando.
// ============================================================

import { boostOf, effective, learnedLinks } from "./memoria.js";

const parsear = (texto) => {
  try {
    const o = JSON.parse(texto);
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
};

/** Los pesos de un cliente: { notes, edges }, vacíos si aún no aprendió nada. */
export async function leerPesos(acceso, clientId) {
  const [fila] = await acceso.leerColumnas("cerebro_memoria", ["pesos"], { client_id: clientId });
  const p = parsear(fila?.pesos);
  return { notes: p.notes ?? {}, edges: p.edges ?? {} };
}

/** ¿Hay algo aprendido? */
export const hayPesos = (pesos) => Object.keys(pesos?.notes ?? {}).length > 0 || Object.keys(pesos?.edges ?? {}).length > 0;

/**
 * El factor por nota para la búsqueda (0,8 … 1,2), o null si no hay nada aprendido: la búsqueda entonces ni se toca.
 */
export function boostDe(pesos, ahora = Date.now()) {
  if (!hayPesos(pesos)) return null;
  const mem = { notes: pesos.notes, edges: pesos.edges, applied: {} };
  return (ruta) => boostOf(mem, ruta, ahora);
}

export const cargarBoost = async (acceso, clientId) => boostDe(await leerPesos(acceso, clientId));

/** Lo que pesa hoy una nota (0–1, 0,5 neutro), o null si nunca se aprendió nada de ella. */
export const pesoDe = (pesos, ruta, ahora = Date.now()) => (pesos?.notes?.[ruta] ? effective(pesos.notes[ruta], ahora) : null);

/** Los enlaces aprendidos [[rutaA, rutaB, peso]] que aún valen algo hoy. */
export const enlacesAprendidos = (pesos, ahora = Date.now()) => learnedLinks({ edges: pesos?.edges ?? {} }, ahora);
