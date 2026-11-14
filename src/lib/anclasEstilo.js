// ============================================================
// Las REFERENCIAS DE ESTILO de la marca (`kit.anclas`, pura)
//
// Lo que un director de arte dice para que una imagen «se sienta» de una manera sin describirla entera: el tipo de
// película o de revelado, la época, el tipo de publicación, el movimiento artístico, la técnica de luz. Son frases
// cortas que la marca fija UNA vez y van en todas sus piezas (en la línea de la marca que recibe el motor y en lo que
// lee el director).
//
// SIEMPRE GENÉRICAS. Nada de artistas, fotógrafos, personas reales ni MARCAS (tampoco marcas de película fotográfica):
// algunos motores las rechazan, otros calcan, y la agencia no nombra marcas ajenas en lo que no es el producto real.
// «Película de color cálida y de grano fino, de retrato» dice lo mismo sin nombrar a nadie. El código lo vigila con una
// comprobación sencilla (`avisoDeAncla`): lo que parece un nombre propio se avisa en la pantalla y NO va a las piezas
// (`anclasUsables`). La persona lo reescribe con palabras genéricas.
//
// Opcional: un kit sin referencias no cambia (ni se escribe la clave).
// ============================================================

/** Cuántas referencias de estilo, como mucho, y lo más largo de cada una. */
export const MAX_ANCLAS = 6;
export const MAX_ANCLA = 80;
/** Lo más que ocupa la línea en el pedido del MOTOR (el director las lee todas): el pedido tiene su tope (MAX_PROMPT). */
export const MAX_LINEA_ANCLAS = 200;

const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Las referencias, limpias: frases cortas, sin comillas ni punto final, sin repetir (sin mirar tildes ni mayúsculas). Pura. */
export function limpiarAnclas(entrada) {
  const fuera = [];
  for (const a of Array.isArray(entrada) ? entrada : []) {
    const t = String(a ?? "").replace(/["“”«»]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_ANCLA).replace(/[.;,\s]+$/, "");
    if (t && !fuera.some((x) => sinTildes(x) === sinTildes(t))) fuera.push(t);
  }
  return fuera.slice(0, MAX_ANCLAS);
}

/**
 * Marcas que la gente nombra al hablar de estilo (película, cámaras, revistas, campañas famosas): se reconocen aunque
 * vayan en minúsculas. No es una lista de todas las marcas del mundo: lo demás lo caza la regla de los nombres propios.
 */
const MARCAS = Object.freeze([
  "kodak", "fuji", "fujifilm", "ilford", "cinestill", "polaroid", "agfa", "lomography", "portra", "ektar", "ektachrome",
  "kodachrome", "velvia", "provia", "tri-x", "leica", "hasselblad", "nikon", "sony", "kinfolk", "vogue", "apple", "nike",
  "adidas", "a24", "marlboro", "gucci", "chanel", "prada", "zara", "ikea", "netflix", "pixar", "disney", "instagram",
  "pinterest", "coca-cola", "starbucks", "national geographic", "wes anderson",
]);

/**
 * Palabras con mayúscula que NO son el nombre de una persona ni de una marca: movimientos, épocas y gentilicios que
 * alguien escribe con mayúscula, y lugares comunes. Sin tildes y en minúsculas.
 */
const PERMITIDAS = new Set([
  "art", "deco", "nouveau", "pop", "bauhaus", "wabi", "sabi", "wabi-sabi", "barroco", "renacimiento", "impresionismo",
  "cubismo", "minimalismo", "brutalismo", "modernismo", "surrealismo", "nueva", "ola", "anos", "decada", "siglo",
  "escandinavo", "escandinava", "nordico", "nordica", "japones", "japonesa", "frances", "francesa", "italiano", "italiana",
  "mediterraneo", "mediterranea", "tropical", "caribeno", "caribena", "latino", "latina", "europeo", "europea",
  "americano", "americana", "panama", "caribe", "latinoamerica", "mexico", "japon", "italia", "francia", "europa",
  "escandinavia", "mediterraneo", "york", "paris", "tokio",
]);

const MAYUSCULA = /^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü'-]+$/;

/**
 * ¿Parece un nombre propio de persona o de marca? → "" si es genérica, o la frase que lo explica (en la pantalla y en
 * lo que la IA propone). La regla es sencilla a propósito —una marca conocida, una palabra con mayúscula que no abre la
 * frase, o una palabra con mayúscula seguida de un número («Portra 400»)— y puede avisar de más: se arregla
 * escribiéndola con palabras genéricas y en minúsculas. Pura.
 */
export function avisoDeAncla(frase) {
  const t = String(frase ?? "").trim();
  if (!t) return "";
  const llano = ` ${sinTildes(t).replace(/[^a-z0-9-]+/g, " ")} `;
  const marca = MARCAS.find((m) => llano.includes(` ${m} `));
  if (marca) return `«${marca}» es una marca: dilo con palabras genéricas (por ejemplo, «película de color cálida y de grano fino»).`;
  // Palabra a palabra: la que abre la frase (o va tras un punto, dos puntos o punto y coma) puede llevar mayúscula.
  const palabras = t.split(/\s+/);
  for (let i = 0; i < palabras.length; i++) {
    const limpia = palabras[i].replace(/^[(¿¡"«“]+|[)?!.,;:"»”]+$/g, "");
    if (!MAYUSCULA.test(limpia) || PERMITIDAS.has(sinTildes(limpia))) continue;
    const abre = i === 0 || /[.:;!?]$/.test(palabras[i - 1]);
    const conNumero = /^\d{2,4}\b/.test(palabras[i + 1] ?? "");
    if (!abre || conNumero) return `«${limpia}» parece el nombre de una persona o de una marca: dilo con palabras genéricas, sin nombres propios.`;
  }
  return "";
}

/** Las que SÍ van a las piezas: las genéricas. Pura. */
export const anclasUsables = (lista) => limpiarAnclas(lista).filter((a) => !avisoDeAncla(a));

/**
 * La línea de las referencias de estilo: «Referencias de estilo (genéricas: tómalas como ambiente, sin copiar a
 * nadie): a; b; c.». Sólo las genéricas. Con `max`, las que quepan en ese largo (el pedido del motor); sin él, todas
 * (el director). Vacía si no hay ninguna. Pura.
 */
export function lineaDeAnclas(lista, { max = 0 } = {}) {
  const usables = anclasUsables(lista);
  if (!usables.length) return "";
  const armar = (l) => `Referencias de estilo de la marca (como ambiente, sin copiar a nadie): ${l.join("; ")}.`;
  if (!max) return armar(usables);
  const dentro = [];
  for (const a of usables) {
    if (armar([...dentro, a]).length > max) break;
    dentro.push(a);
  }
  return dentro.length ? armar(dentro) : "";
}

/**
 * Las sugerencias de la casa, para escoger con un toque en el kit. Escritas con palabras propias y GENÉRICAS (un test
 * lo comprueba con `avisoDeAncla`). Pura.
 */
export const SUGERENCIAS_ANCLAS = Object.freeze([
  { grupo: "Película y color", frases: [
    "película de color cálida y de grano fino, de retrato",
    "diapositiva de colores saturados y contraste alto",
    "blanco y negro de alto contraste con grano marcado",
    "película nocturna de luz de tungsteno, con brillos de neón",
    "colores lavados de foto instantánea",
  ] },
  { grupo: "Época", frases: [
    "grano cálido de los años 70",
    "fotografía analógica de los 90 con flash directo",
    "revista de los años 60 en tonos pastel",
  ] },
  { grupo: "Tipo de publicación", frases: [
    "revista de estilo de vida, sobria y luminosa",
    "editorial de moda audaz",
    "revista de diseño de interiores",
    "libro de cocina con luz de ventana",
    "catálogo de producto limpio",
  ] },
  { grupo: "Movimiento y estética", frases: [
    "minimalismo escandinavo",
    "estética wabi-sabi: lo natural e imperfecto",
    "geometría y color plano de la escuela bauhaus",
    "art déco: simetría y líneas geométricas",
    "pop de colores planos y contraste alto",
  ] },
  { grupo: "Técnica de luz", frases: [
    "claroscuro suave de pintura clásica",
    "luz lateral de hora dorada",
    "flash directo de revista, sombras duras",
    "luz cenital suave de estudio de producto",
  ] },
]);
