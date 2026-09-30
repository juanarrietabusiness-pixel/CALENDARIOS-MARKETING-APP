// ============================================================
// Lo que del ADN entra en cada llamada de escritura
//
// Todo lo de este archivo es puro: entra texto, sale texto. Resuelve dos
// cosas que costaban dinero en cada tanda:
//
//  1. `sinCapaMaquetacion()`. El ADN que se lee del repositorio trae dos
//     capas: la MARCA (tono, personas, límites, precios) y la MAQUETACIÓN
//     (plantillas, escala tipográfica, bloque de estilo, negativos, contrato
//     del HTML) que sólo sirve para pedirle las piezas a Meta AI. Escribir
//     un caption o un guion no necesita la segunda, y en Dcasa son ~41 000
//     de 127 000 caracteres: un tercio del contexto, pagado en cada llamada.
//
//  2. `prepararContenidoIA()`. El ADN es lo mismo en las diez o quince
//     llamadas de una generación y sólo cambian las publicaciones. Marcado
//     con `cache_control`, Anthropic lo cobra entero una vez y las
//     siguientes lo leen de la caché a una décima parte. `cachedBlock()`
//     existía desde la migración y nadie lo llamaba, así que la
//     generación nunca cacheó nada.
//
// Se falla ABIERTO en las dos: si el texto no tiene la forma esperada, se
// devuelve entero. Mandar de más cuesta unos tokens; recortar de más
// cuesta una marca mal escrita, y eso no se ve hasta que el cliente lo lee.
// ============================================================

import { cachedBlock, bloque } from "./parse";

// ------------------------------------------------------------
// 1. Quitar la capa de maquetación
// ------------------------------------------------------------

/**
 * El encabezado con el que `worker/rutas/adn.js` separa cada archivo:
 * `\n--- ruta (recortado) ---\n`. Se exige que la ruta acabe en una
 * extensión de texto: una raya horizontal de markdown con palabras en
 * medio no es un archivo.
 */
const ENCABEZADO = /\n--- (.+?\.(?:md|txt|json|ya?ml))( \(recortado\))? ---\n/g;

/**
 * Las secciones del prompt maestro que sólo hablan de cómo se maqueta la
 * pieza. Se quitan por lo que dice su título, no por su número: cada
 * cliente numera distinto («3 · Color y tipografía», «2 · El sistema
 * visual de la pieza»). Lo que no coincide se queda: «Cómo se arma la
 * semana», «Las reglas duras» y «Lo que no se le pide nunca» hablan de
 * qué se escribe y a qué no se puede llegar.
 */
export const SECCION_DE_MAQUETACION =
  /reparto del trabajo|plantilla|color y tipograf|sistema visual|bloque de estilo|negativos|\blogo\b|\bfirma\b|contrato del html|verificaci[oó]n (?:antes|propia|dependiente)|qu[eé] revisar cuando/i;

/**
 * De la receta en JSON, lo que un texto necesita: los hashtags, los
 * emojis, la llamada a la acción, las cifras permitidas y las reglas
 * duras. El resto son medidas de lienzo, fuentes y colores.
 */
export const CLAVES_DE_TEXTO_DE_LA_RECETA = [
  "marca", "slug", "productoFisico", "fotoReal", "tildes",
  "hashtags", "emojis", "cta", "cifrasPermitidas", "reglasDuras",
];

/** Un prompt maestro sin las secciones de maquetación. La cabecera del documento se queda. */
export function promptMaestroSoloTexto(md) {
  // `(?=## )` con la bandera `m` parte antes de cada «## », pero no de «### ».
  const partes = String(md).split(/^(?=## )/m);
  return partes
    .filter((parte, i) => i === 0 || !SECCION_DE_MAQUETACION.test(parte.split("\n", 1)[0]))
    .join("");
}

/** La receta reducida a las claves que sirven para escribir. Si no se puede leer, entera. */
export function recetaSoloTexto(texto) {
  let receta;
  try {
    receta = JSON.parse(texto);
  } catch {
    return texto; // recortada por el presupuesto del archivo: no se toca
  }
  if (!receta || typeof receta !== "object" || Array.isArray(receta)) return texto;
  const salida = {};
  for (const clave of CLAVES_DE_TEXTO_DE_LA_RECETA) {
    if (clave in receta) salida[clave] = receta[clave];
  }
  return JSON.stringify(salida, null, 2);
}

/**
 * Qué hacer con un archivo del ADN al ESCRIBIR texto: `null` lo quita,
 * una cadena lo sustituye, `undefined` lo deja como está.
 */
function tratarArchivo(ruta, texto) {
  // Los prompts semanales que ya se le mandaron a Meta AI: son un
  // derivado de la receta, no la marca.
  if (/(^|\/)Instagram_TikTok\/.*prompt_maestro.*\.md$/i.test(ruta)) return null;
  if (/(^|\/)05_prompt_maestro_meta_ai\.md$/i.test(ruta)) return promptMaestroSoloTexto(texto);
  if (/(^|\/)05_receta\.json$/i.test(ruta)) return recetaSoloTexto(texto);
  return undefined;
}

/**
 * El ADN sin la capa de maquetación, para escribir ideas, guiones y
 * descripciones. El de la ficha del cliente (`githubContext`) se guarda
 * entero y no cambia: esto sólo decide qué viaja a la IA.
 */
export function sinCapaMaquetacion(contenido) {
  const texto = String(contenido ?? "");
  const encabezados = [...texto.matchAll(ENCABEZADO)];
  if (!encabezados.length) return texto;

  let salida = texto.slice(0, encabezados[0].index);
  let cambiado = false;
  encabezados.forEach((m, i) => {
    const fin = i + 1 < encabezados.length ? encabezados[i + 1].index : texto.length;
    const cuerpo = texto.slice(m.index + m[0].length, fin);
    const tratado = tratarArchivo(m[1], cuerpo);
    if (tratado === undefined) {
      salida += m[0] + cuerpo;
      return;
    }
    cambiado = true;
    if (tratado === null) return;
    salida += m[0] + tratado.replace(/\n+$/, "") + "\n";
  });
  return cambiado ? salida : texto;
}

// ------------------------------------------------------------
// 2. Partir el contexto para la caché de prompt
// ------------------------------------------------------------

/**
 * Donde acaba lo que no cambia entre llamadas —la intro, las reglas y el
 * ADN— y empieza lo que sí: la ficha de la aplicación, la campaña del mes
 * y lo que se pide. `buildClientContext` escribe este título; si alguien
 * lo cambia sin cambiar esto, deja de cachearse sin fallar. Lo vigila
 * `contextoADN.test.js`.
 */
export const TITULO_FICHA = "FICHA EN LA APLICACIÓN — datos de contacto y preferencias";
const INICIO_DE_FICHA = /\n+═{10,}\nFICHA EN LA APLICACIÓN/;

/**
 * Anthropic no cachea prefijos de menos de ~1 000 tokens (Sonnet) y los
 * ignora sin error: por debajo de esto sólo se pagaría la escritura, que
 * cuesta un 25 % más, sin que nada se lea después.
 */
export const MIN_CARACTERES_CACHE = 4000;

/** El contexto en dos bloques —estable y cacheado, y variable— o `null` si no hay dónde partir. */
export function contextoEnBloques(texto) {
  const m = INICIO_DE_FICHA.exec(String(texto ?? ""));
  if (!m || m.index < MIN_CARACTERES_CACHE) return null;
  return [cachedBlock(texto.slice(0, m.index)), bloque(texto.slice(m.index))];
}

/**
 * Lo que se manda a `/api/ia`. Una cadena con el contexto del cliente al
 * principio pasa a dos bloques, y la caché sólo funciona por PREFIJO: por
 * eso el bloque del ADN va el primero y las imágenes, que cambian en cada
 * publicación, detrás. Una petición cuyo primer bloque es una imagen
 * —«escribir esta publicación mirando su foto»— no se toca.
 */
export function prepararContenidoIA(content) {
  if (typeof content === "string") return contextoEnBloques(content) ?? content;
  if (Array.isArray(content) && content[0]?.type === "text" && typeof content[0].text === "string") {
    const partido = contextoEnBloques(content[0].text);
    if (partido) return [...partido, ...content.slice(1)];
  }
  return content;
}
