// ============================================================
// Cómo se le habla a cada NIVEL DE CONSCIENCIA en un anuncio, y cuántos anuncios van a cada uno (puro y pequeño)
//
// El curso de campañas (módulo 4, «Textos que venden»; curso.txt 444-481) escribe los textos por el nivel de consciencia
// de quien los lee y reparte a la gente con la «regla de 100»: de cada 100 personas, unas 30 no saben que tienen el
// problema, 30 lo saben y no conocen la solución, 20 a 30 conocen las soluciones, 10 conocen el producto y 3 a 5 ya
// compraron. Aquí va con palabras propias (la licencia de su método no deja copiar su texto):
//
//   · `TEXTOS_POR_NIVEL`   — por nivel: qué sabe la persona, cómo se le habla y si la venta es indirecta o directa.
//                            «Decisión» es quien YA COMPRÓ (como el curso): se le habla de productos nuevos o se le
//                            reactiva con un servicio o una promoción especial. El empujón final es la etapa Conversión,
//                            escrita en nivel Producto.
//   · `NIVELES_DE_ETAPA`   — los niveles que tocan a cada campaña del ciclo (Presentación: inconsciente, problema y
//                            solución; Evaluación: solución y producto; Conversión: producto; Ascensión: decisión; la
//                            de temporada, producto). Curso.txt ~560-600.
//   · `nivelesParaHuecos`  — en qué nivel se escribe cada anuncio de una campaña, repartidos por la regla de 100.
//   · `tablaDeNiveles`     — la tabla dicha a la IA que escribe los textos del anuncio.
//
// Lo leen el plan de campañas (src/lib/planCiclo.js: el nivel de cada hueco de anuncio y lo que falta producir) y el
// pedido de los textos de sus anuncios (src/lib/anunciosPlan.js).
// ============================================================

/** Por nivel: qué sabe, cómo se le habla y el tipo de venta. El orden es el del embudo. */
export const TEXTOS_POR_NIVEL = Object.freeze([
  { nivel: "inconsciente", nombre: "Inconsciente", sabe: "No sabe que tiene un problema.",
    hablale: "Con un dato o una historia corta del problema que le haga darse cuenta de que lo tiene; el producto entra al final, como lo que tiene sentido después.",
    venta: "indirecta" },
  { nivel: "problema", nombre: "Consciente del problema", sabe: "Sabe que tiene el problema, pero no conoce la solución ni que tú la vendes.",
    hablale: "Poniéndote en su lugar con el problema (cómo se siente, qué le cuesta) y enseñando cómo le ayudas a resolverlo.",
    venta: "indirecta" },
  { nivel: "solucion", nombre: "Consciente de la solución", sabe: "Conoce el problema, las soluciones y a quienes las venden.",
    hablale: "Con los 1 a 3 beneficios principales de comprarte a ti: los mejores beneficios hacen que te escoja.",
    venta: "directa" },
  { nivel: "producto", nombre: "Consciente del producto", sabe: "Conoce el problema, las soluciones del mercado y tu producto.",
    hablale: "Con tus diferenciales: por qué comprarte a ti y no a los demás (la prueba, la garantía, la oferta si existe).",
    venta: "directa" },
  { nivel: "decision", nombre: "Decisión (ya compró)", sabe: "Lo sabe todo y ya te compró.",
    hablale: "Con productos nuevos, el complemento o el combo, o reactivándolo con un servicio o una promoción especial para clientes.",
    venta: "directa" },
]);
const POR_NIVEL = new Map(TEXTOS_POR_NIVEL.map((x) => [x.nivel, x]));
export const textoDeNivel = (nivel) => POR_NIVEL.get(nivel) ?? null;
/** El nombre de un nivel para la pantalla («Decisión (ya compró)»). Pura. */
export const nombreNivelTexto = (nivel) => POR_NIVEL.get(nivel)?.nombre ?? "";

/** La regla de 100: cuántas personas de cada 100 hay en cada nivel (solución, 20 a 30: el punto medio). */
export const REGLA_DE_100 = Object.freeze({ inconsciente: 30, problema: 30, solucion: 25, producto: 10, decision: 5 });

/** Los niveles de cada campaña del ciclo de ventas (y de la de temporada), en el orden del embudo. */
export const NIVELES_DE_ETAPA = Object.freeze({
  presentacion: ["inconsciente", "problema", "solucion"],
  evaluacion: ["solucion", "producto"],
  conversion: ["producto"],
  ascension: ["decision"],
  temporada: ["producto"],
});

/**
 * En qué nivel se escribe cada uno de los `n` anuncios de una campaña: los de su etapa, repartidos por la regla de 100
 * (los restos al de más peso; a igual peso, el primero del embudo) y alternados para que dos seguidos no sean del mismo
 * nivel. Presentación con 4: inconsciente, problema, solución, inconsciente. → [nivel × n]. Pura.
 */
export function nivelesParaHuecos(etapa, n) {
  const niveles = NIVELES_DE_ETAPA[etapa] ?? NIVELES_DE_ETAPA.presentacion;
  const total = Math.max(0, Math.floor(Number(n) || 0));
  if (!total) return [];
  const peso = niveles.reduce((s, x) => s + REGLA_DE_100[x], 0);
  const exactos = niveles.map((x) => (total * REGLA_DE_100[x]) / peso);
  const cuantos = exactos.map(Math.floor);
  let resto = total - cuantos.reduce((s, x) => s + x, 0);
  const orden = niveles.map((_, i) => i).sort((a, b) => (exactos[b] - cuantos[b]) - (exactos[a] - cuantos[a]) || a - b);
  for (const i of orden) {
    if (resto <= 0) break;
    cuantos[i] += 1;
    resto -= 1;
  }
  // Alternados: uno de cada nivel por vuelta, en el orden del embudo.
  const salida = [];
  for (let vuelta = 0; salida.length < total; vuelta++) {
    niveles.forEach((x, i) => { if (cuantos[i] > vuelta) salida.push(x); });
  }
  return salida;
}

/** Cuántos de cada nivel en una lista de niveles → { nivel: n }. Pura. */
export function cuentaDeNiveles(lista = []) {
  const salida = {};
  for (const x of lista) if (POR_NIVEL.has(x)) salida[x] = (salida[x] ?? 0) + 1;
  return salida;
}

/** ¿Es un nivel frío? En inconsciente y problema el producto todavía no es el centro: ni precio ni «compra ya». Pura. */
export const esNivelFrio = (nivel) => nivel === "inconsciente" || nivel === "problema";

/**
 * El tipo de contenido (lib/pilares.js) de un anuncio que se produce para un nivel: en los fríos, un educativo (el
 * producto todavía no se ve: nada de venta directa con precio); en solución, uno de producto o servicio con sus
 * beneficios; en producto y decisión, el «Anuncio» de venta directa. Pura.
 */
export const tipoParaNivel = (nivel) => (esNivelFrio(nivel) ? "educativo" : nivel === "solucion" ? "servicios" : "anuncio");

/** La línea de un nivel para la IA. Pura. */
export function lineaDeNivel(nivel) {
  const x = POR_NIVEL.get(nivel);
  return x ? `- ${x.nombre}: ${x.sabe} Cómo hablarle: ${x.hablale} Venta ${x.venta}.` : "";
}

/**
 * La tabla de cómo hablarle a cada nivel, dicha a la IA que escribe los textos del anuncio (sólo los niveles que se
 * piden, o todos). Pura.
 */
export function tablaDeNiveles(niveles = null) {
  const usados = TEXTOS_POR_NIVEL.filter((x) => !niveles?.length || niveles.includes(x.nivel));
  return [
    "CÓMO SE LE HABLA A CADA NIVEL DE CONSCIENCIA (cada anuncio dice el suyo: escríbelo para esa persona):",
    ...usados.map((x) => lineaDeNivel(x.nivel)),
    "En los niveles de venta indirecta (inconsciente y problema) no se empieza por el producto ni por el precio: primero el problema; el producto, al final y como la salida.",
  ].join("\n");
}
