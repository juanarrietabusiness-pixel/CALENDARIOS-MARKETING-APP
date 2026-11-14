// ============================================================
// Los marcos públicos del estudio de mercado (puro y pequeño)
//
// Los cinco niveles de consciencia (Eugene Schwartz) y los dieciséis deseos
// básicos (Steven Reiss). Viven aparte de estudioMercado.js para que lo que
// va en el bundle principal (los textos de la IA, api.js) los use sin
// arrastrar el estudio entero.
// ============================================================

/** Los dieciséis deseos básicos (Steven Reiss). */
export const DESEOS_REISS = Object.freeze([
  "Aceptación", "Curiosidad", "Alimentación", "Familia", "Honor", "Idealismo", "Independencia", "Orden",
  "Actividad física", "Poder", "Romance", "Ahorro", "Contacto social", "Estatus social", "Tranquilidad", "Competencia",
]);

/**
 * Los cinco niveles de consciencia (Eugene Schwartz). Los dos primeros se tocan por el dolor; los demás, por la ganancia.
 * «Decisión» es quien ya lo sabe todo y YA COMPRÓ (curso de campañas, decisión de la agencia del 14-nov): se le habla
 * con productos nuevos o reactivándolo con servicios o promociones especiales. El empujón final de quien aún no compró
 * es la etapa Conversión, escrita en el nivel «producto» (por qué comprarme a mí).
 */
export const NIVELES_CONSCIENCIA = Object.freeze([
  { clave: "inconsciente", nombre: "Inconsciente", ayuda: "No sabe que tiene el problema", angulo: "dolor" },
  { clave: "problema", nombre: "Consciente del problema", ayuda: "Sabe que algo va mal, no conoce soluciones", angulo: "dolor" },
  { clave: "solucion", nombre: "Consciente de la solución", ayuda: "Busca soluciones, no conoce tu producto", angulo: "ganancia" },
  { clave: "producto", nombre: "Consciente del producto", ayuda: "Conoce tu producto, no está convencido", angulo: "ganancia" },
  { clave: "decision", nombre: "Decisión (ya compró)", ayuda: "Ya te compró y lo sabe todo: productos nuevos, servicios o promociones especiales para que vuelva", angulo: "ganancia" },
]);

export const CLAVES_NIVEL = NIVELES_CONSCIENCIA.map((n) => n.clave);
export const nombreDeNivel = (clave) => NIVELES_CONSCIENCIA.find((n) => n.clave === clave)?.nombre ?? "";
