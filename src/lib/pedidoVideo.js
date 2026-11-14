// ============================================================
// Los PEDIDOS a un modelo de video: cortos y en un orden fijo (puro; también lo importa el Worker)
//
// Un modelo de video deforma más cuanto más largo es lo que se le pide. Se arma siempre igual —primero lo FIJO (el
// formato y la duración, que Omni lee del texto), luego SUJETO → ACCIÓN → LUZ → CÁMARA → MOVIMIENTO, el sonido de
// fondo y al final lo que tampoco se toca (la voz entre comillas, SIN_TEXTO_VIDEO)— y, si pasa de 1.000 caracteres, se
// recorta en el orden INVERSO: lo último que se pierde es el sujeto. Contar caracteres es cosa del CÓDIGO, no de la IA.
//
// El recorte va en dos vueltas, las dos de atrás hacia delante:
//   1. COMPRIMIR: la parte que pasa de su tope (el bloque de la marca, que puede tener 3.000) se acorta hasta él;
//      así un estilo larguísimo no se lleva por delante el movimiento de cámara, que mide una línea.
//   2. CORTAR: si aún no cabe, cada parte se acorta lo que haga falta (o se quita entera si quedaría en nada), primero
//      el sonido de fondo y el movimiento, al final el sujeto.
// Una parte con varias líneas (los planos de un storyboard) se acorta línea a línea por igual: ningún plano desaparece
// mientras se pueda acortar a todos.
//
// Lo usan el clip de un plano (reelPedidos.js), el video con el storyboard (reel.js) y el del producto (videoProducto.js).
// ============================================================

/** Lo más largo que se le pide a un modelo de video (un plano, una toma). */
export const MAX_PEDIDO_VIDEO = 1000;
/** El orden de las partes que se pueden recortar: se arma así y se recorta al revés. */
export const ORDEN_PEDIDO_VIDEO = Object.freeze(["sujeto", "accion", "luz", "camara", "movimiento", "sonido"]);
/** Hasta dónde se COMPRIME cada parte antes de quitarle nada más a ninguna (la primera vuelta). */
export const TOPE_PARTE = Object.freeze({ sujeto: 420, accion: 560, luz: 240, camara: 160, movimiento: 160, sonido: 200 });
/** Lo menos que queda de una parte; por debajo, se quita entera. */
const MINIMO = 24;
/** Lo menos que queda de cada línea al acortar una parte de varias (un plano). */
const MINIMO_LINEA = 32;
/** Lo que no tiene sentido al final de un trozo cortado. */
const CONECTOR_FINAL = /\s+(?:y|e|o|u|de|del|con|en|a|al|la|el|los|las|un|una|que|por|para|sin|su|sus)$/i;

const lineasDe = (v) => (Array.isArray(v) ? v : [v]).map((x) => String(x ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);

/** Corta un texto a `n` caracteres como mucho, sin partir una palabra (en el fin de una frase si queda cerca). Pura. */
export function cortarTexto(texto, n) {
  const t = String(texto ?? "").trim();
  if (t.length <= n) return t;
  if (n < 2) return "";
  const trozo = t.slice(0, n);
  const fin = trozo.lastIndexOf(". ");
  if (fin >= n * 0.6) return trozo.slice(0, fin + 1);
  // Por palabra, dejando sitio para el punto final.
  const sitio = t.slice(0, n - 1);
  const entera = t[n - 1] === " ";
  let corte = entera ? sitio : sitio.slice(0, Math.max(0, sitio.lastIndexOf(" "))) || sitio;
  corte = corte.replace(/[\s,;:—–(-]+$/, "");
  while (CONECTOR_FINAL.test(corte)) corte = corte.replace(CONECTOR_FINAL, "").replace(/[\s,;:—–(-]+$/, "");
  return /[.!?»"]$/.test(corte) ? corte : `${corte}.`;
}

const largo = (lineas, sep) => (lineas.length ? lineas.reduce((s, l) => s + l.length, 0) + sep.length * (lineas.length - 1) : 0);

/**
 * Una parte (sus líneas) acortada a `objetivo` caracteres: varias líneas se acortan por igual (la más larga primero) y,
 * si aun al mínimo no caben, se quitan las del final. Por debajo del mínimo, nada. → las líneas nuevas. Pura.
 */
export function acortarParte(lineas, objetivo, sep = "\n") {
  if (largo(lineas, sep) <= objetivo) return lineas;
  if (objetivo < MINIMO) return [];
  if (lineas.length === 1) return [cortarTexto(lineas[0], objetivo)];
  // El tope por línea más alto con el que caben todas (lo que no usan las cortas, para las largas).
  const ordenadas = lineas.map((l) => l.length).sort((a, b) => a - b);
  let resto = objetivo - sep.length * (lineas.length - 1);
  let tope = Infinity;
  for (let i = 0; i < ordenadas.length; i++) {
    const parejo = Math.floor(resto / (ordenadas.length - i));
    if (ordenadas[i] <= parejo) { resto -= ordenadas[i]; continue; }
    tope = parejo;
    break;
  }
  if (tope >= MINIMO_LINEA) {
    const salida = lineas.map((l) => (l.length > tope ? cortarTexto(l, tope) : l));
    if (largo(salida, sep) <= objetivo) return salida;
  }
  // Ni al mínimo caben todas: fuera las del final.
  const cortas = lineas.map((l) => cortarTexto(l, MINIMO_LINEA));
  while (cortas.length && largo(cortas, sep) > objetivo) cortas.pop();
  return cortas;
}

/**
 * El pedido armado en su orden y recortado si pasa de `max`. `inicio` y `fin` no se recortan nunca (el formato, la
 * duración, la voz entre comillas, SIN_TEXTO_VIDEO); cada parte es un texto o una lista de líneas. Pura.
 */
export function armarPedidoVideo({ inicio = [], sujeto = [], accion = [], luz = [], camara = [], movimiento = [], sonido = [], fin = [], max = MAX_PEDIDO_VIDEO, separador = "\n" } = {}) {
  const fijoAntes = lineasDe(inicio);
  const fijoDespues = lineasDe(fin);
  const partes = { sujeto: lineasDe(sujeto), accion: lineasDe(accion), luz: lineasDe(luz), camara: lineasDe(camara), movimiento: lineasDe(movimiento), sonido: lineasDe(sonido) };
  const juntar = () => [...fijoAntes, ...ORDEN_PEDIDO_VIDEO.flatMap((k) => partes[k]), ...fijoDespues].join(separador);
  let texto = juntar();
  if (texto.length <= max) return texto;
  const alReves = [...ORDEN_PEDIDO_VIDEO].reverse();
  // 1. Comprimir lo que pasa de su tope, de atrás hacia delante.
  for (const k of alReves) {
    const exceso = texto.length - max;
    if (exceso <= 0) break;
    const actual = largo(partes[k], separador);
    if (actual <= TOPE_PARTE[k]) continue;
    partes[k] = acortarParte(partes[k], Math.max(TOPE_PARTE[k], actual - exceso), separador);
    texto = juntar();
  }
  // 2. Cortar lo que haga falta, de atrás hacia delante: lo último que se pierde es el sujeto.
  for (const k of alReves) {
    const exceso = texto.length - max;
    if (exceso <= 0) break;
    const actual = largo(partes[k], separador);
    if (!actual) continue;
    partes[k] = acortarParte(partes[k], actual - exceso, separador);
    texto = juntar();
  }
  return texto;
}

/**
 * Lo que puede medir el pedido de un video con STORYBOARD (varios planos en un solo video): 1.000 por el primer plano y
 * 250 por cada uno más, sin pasar de 2.500. Con 1.000 para todo, un reel de cuatro planos se quedaba sin los últimos.
 * Pura.
 */
export const limiteDeStoryboard = (planos = 1) => Math.min(2500, MAX_PEDIDO_VIDEO + 250 * Math.max(0, Math.round(Number(planos) || 1) - 1));
