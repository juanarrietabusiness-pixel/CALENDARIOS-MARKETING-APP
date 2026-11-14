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
 * «Decisión» es quien lo sabe todo y sólo le falta el EMPUJÓN para comprar (Schwartz, «el más consciente»; los prompts
 * de investigación y de diversificación del curso; decisión de la agencia del 14-nov, segunda vuelta): la oferta, la
 * garantía o la urgencia real. Va en la etapa Conversión (con Producto) y en Ascensión, donde quien ya compró recibe el
 * mismo empujón para volver (lo nuevo, el complemento, el combo).
 */
export const NIVELES_CONSCIENCIA = Object.freeze([
  { clave: "inconsciente", nombre: "Inconsciente", ayuda: "No sabe que tiene el problema", angulo: "dolor" },
  { clave: "problema", nombre: "Consciente del problema", ayuda: "Sabe que algo va mal, no conoce soluciones", angulo: "dolor" },
  { clave: "solucion", nombre: "Consciente de la solución", ayuda: "Busca soluciones, no conoce tu producto", angulo: "ganancia" },
  { clave: "producto", nombre: "Consciente del producto", ayuda: "Conoce tu producto, no está convencido", angulo: "ganancia" },
  { clave: "decision", nombre: "Decisión (listo para comprar)", ayuda: "Lo sabe todo y sólo le falta el empujón: la oferta, la garantía o la urgencia (también quien ya compró y puede volver)", angulo: "ganancia" },
]);

export const CLAVES_NIVEL = NIVELES_CONSCIENCIA.map((n) => n.clave);
export const nombreDeNivel = (clave) => NIVELES_CONSCIENCIA.find((n) => n.clave === clave)?.nombre ?? "";
