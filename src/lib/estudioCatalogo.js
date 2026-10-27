// ============================================================
// El catálogo del Estudio: qué modelos hay, qué aceptan y cuánto cuestan
//
// PURO, y lo importan los dos lados: el Worker (para validar un pedido y
// saber a qué motor va) y la pantalla (para enseñar el costo ANTES de
// pedir). Dos copias de la tabla de precios acaban diciendo cosas
// distintas, y entonces el botón promete 0,07 $ y el contador apunta
// otra cifra. Igual que `agenda.js` y `publicacion.js`.
//
// UN MODELO ES DATOS, NO CÓDIGO. Añadir uno es una línea aquí; el motor
// (worker/lib/estudio/motores.js) sólo sabe llamar a su proveedor. Un test
// recorre el catálogo entero y falla si un modelo de imagen acepta
// fotogramas (en Agents Office la tarjeta de prueba los pedía y parecía un
// formulario de video), si un ajuste no trae su valor por defecto entre los
// permitidos, o si un modelo no declara costo.
//
// LOS PRECIOS SON ESTIMACIONES, y así se rotulan. Los motores no devuelven
// el costo real de una imagen; lo que se apunta en el contador es esto.
// `PRECIOS_AL` dice de cuándo son: un test avisa cuando pasan de 90 días.
// ============================================================

import MODELOS_HIGGSFIELD from "./estudioHiggsfield.json";

/** De cuándo son los precios de abajo (AAAA-MM-DD). */
export const PRECIOS_AL = "2026-09-30";

/** Desde este costo el pedido pide una segunda confirmación. */
export const CONFIRMAR_DESDE = 0.5;

/** Imágenes por pedido, como máximo. */
export const MAX_POR_PEDIDO = 8;

/** Videos por pedido, como máximo: cada uno cuesta de 0,20 $ a 3 $, y se ve mejor de uno en uno. */
export const MAX_VIDEOS_POR_PEDIDO = 2;

/** Cuántos se pueden pedir de este modelo. */
export const maxPorPedido = (modelo) => (modelo?.tipo === "video" ? MAX_VIDEOS_POR_PEDIDO : MAX_POR_PEDIDO);

/** Lo más largo que puede ser un prompt. */
export const MAX_PROMPT = 4_000;

const enumerado = (valores, defecto) => ({ tipo: "enum", valores: Object.freeze(valores), defecto });

/**
 * Las voces fijas de Gemini Omni (Kie, `gemini-omni-audio`): la voz se REGISTRA (gratis) y su id va en `audio_ids`
 * del video. El timbre es de la voz; el idioma lo da el texto de la locución. Descripción en español para escoger.
 */
export const VOCES_OMNI = Object.freeze({
  achernar: "Mujer · suave, aguda", achird: "Hombre · amigable, media", algenib: "Hombre · rasposa, grave",
  algieba: "Hombre · relajada, media-grave", alnilam: "Hombre · firme, media-grave", aoede: "Mujer · enérgica, media",
  autonoe: "Mujer · luminosa, media", callirrhoe: "Mujer · relajada, media", charon: "Hombre · intelectual, grave",
  despina: "Mujer · suave, media", enceladus: "Hombre · susurrada, grave", erinome: "Mujer · clara, media",
  fenrir: "Hombre · animada, joven", gacrux: "Mujer · madura, media", iapetus: "Hombre · clara, media-grave",
  kore: "Mujer · segura, media", laomedeia: "Mujer · alegre, media-aguda", leda: "Mujer · joven, media-aguda",
  orus: "Hombre · firme, media-grave", puck: "Hombre · alegre, media", pulcherrima: "Neutra · directa, media-aguda",
  rasalgethi: "Hombre · intelectual, media", sadachbia: "Hombre · vivaz, grave", sadaltager: "Hombre · experta, media",
  schedar: "Hombre · suave, media-grave", sulafat: "Mujer · cálida, media", umbriel: "Hombre · suave, grave",
  vindemiatrix: "Mujer · amable, media", zephyr: "Mujer · luminosa, media-aguda", zubenelgenubi: "Hombre · casual, media-grave",
});

const PROPORCIONES = Object.freeze(["1:1", "4:5", "3:4", "2:3", "9:16", "16:9", "4:3", "3:2", "5:4", "21:9"]);
const TAMANOS = Object.freeze(["1K", "2K", "4K"]);

/** Cómo se llama cada proporción en la interfaz (para quien no sabe qué es «4:5»). */
export const NOMBRE_PROPORCION = Object.freeze({
  "1:1": "Cuadrado", "4:5": "Vertical (feed)", "3:4": "Vertical", "2:3": "Vertical alto", "9:16": "Historia / Reel",
  "16:9": "Horizontal", "4:3": "Horizontal clásico", "3:2": "Horizontal foto", "5:4": "Casi cuadrado", "21:9": "Panorámico",
});

/** Tamaño de la tarjeta de prueba y de lo que se supone de un motor que no lo dice. */
export const MEDIDAS = Object.freeze({
  "1:1": [1024, 1024], "4:5": [1024, 1280], "3:4": [1024, 1365], "2:3": [1024, 1536], "9:16": [1024, 1792],
  "16:9": [1792, 1024], "4:3": [1365, 1024], "3:2": [1536, 1024], "5:4": [1280, 1024], "21:9": [1792, 768],
});

/** Los formatos que fal.ai trae con nombre exacto (`image_size`): con otro, la imagen no saldría en la proporción que dice la pantalla. */
const FORMATOS_FAL = ["1:1", "3:4", "9:16", "4:3", "16:9"];

/** Un modelo del JSON generado, con sus ajustes en la forma del catálogo. */
const desdeJson = (m) => ({
  ...m,
  ajustes: Object.fromEntries(Object.entries(m.ajustes).map(([nombre, def]) => [nombre, enumerado(def.valores, def.defecto)])),
});

/**
 * Los modelos. `costo` es dólares por imagen (o por segundo de video: `por: "s"`). `referencias` es cuántas
 * imágenes de referencia admite (0 = ninguna). `motor` dice quién lo hace.
 * `gid` es el id que espera el proveedor.
 */
export const MODELOS = Object.freeze([
  {
    id: "nano-banana", motor: "gemini", tipo: "imagen", gid: "gemini-2.5-flash-image", nombre: "Nano Banana", predeterminado: true,
    creador: "Google", calidad: 3, velocidad: "rápido", costo: 0.039, referencias: 3,
    nota: "El que ya usa la aplicación para las imágenes de las publicaciones. Edita y mezcla fotos: hasta 3 referencias (tu producto, tu logo, un estilo).",
    para: ["todo uso", "editar fotos", "producto"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "1:1") },
  },
  {
    id: "nano-banana-2", motor: "gemini", tipo: "imagen", gid: "gemini-3.1-flash-image", nombre: "Nano Banana 2",
    creador: "Google", calidad: 3, velocidad: "rápido", costo: 0.067, referencias: 14, estimado: true,
    nota: "El todoterreno más nuevo de Google: hasta 14 referencias y hasta 4K. Precio aproximado; si tu cuenta de Google aún no lo tiene, dirá el motivo.",
    para: ["todo uso", "muchas referencias", "4K"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "1:1"), imageSize: enumerado(TAMANOS, "1K") },
  },
  {
    id: "nano-banana-2-lite", motor: "gemini", tipo: "imagen", gid: "gemini-3.1-flash-lite-image", nombre: "Nano Banana 2 Lite",
    creador: "Google", calidad: 2, velocidad: "muy rápido", costo: 0.02, referencias: 3, estimado: true,
    nota: "El más rápido y barato de Google: para probar ideas y hacer lotes. Precio aproximado.",
    para: ["bocetos", "lotes", "barato"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "1:1") },
  },
  {
    id: "nano-banana-pro", motor: "gemini", tipo: "imagen", gid: "gemini-3-pro-image-preview", nombre: "Nano Banana Pro",
    creador: "Google", calidad: 4, velocidad: "normal", costo: 0.134, referencias: 14, estimado: true,
    nota: "El tope de Google: piensa la composición y escribe texto legible dentro de la imagen. Hasta 14 referencias y 4K. Precio aproximado.",
    para: ["texto legible", "composición compleja", "4K"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "1:1"), imageSize: enumerado(TAMANOS, "1K") },
  },
  {
    id: "muse-image", motor: "meta", tipo: "imagen", gid: "muse-image-1.0", nombre: "Muse Image",
    creador: "Meta", calidad: 3, velocidad: "normal", costo: 0.01, referencias: 10,
    // Con imágenes de referencia Meta rechaza la vía de las medidas exactas y la segunda (Responses) sólo da estas tres:
    // un 4:5 con el logo o la foto del producto salía 2:3. `modeloQueRespeta` lo manda a otro modelo.
    conReferencias: ["1:1", "2:3", "3:2"],
    nota: "De Meta: genera y edita, y busca por su cuenta referencias reales (marcas, lugares, datos actuales) antes de dibujar. Texto legible e infografías. Muy barato.",
    para: ["texto legible", "editar y componer", "barato"],
    ajustes: {
      aspectRatio: enumerado(PROPORCIONES, "1:1"),
      calidad: enumerado(["high", "low"], "high"),
      formato: enumerado(["webp", "png", "jpeg"], "webp"),
    },
  },
  // ---- Video. Cuestan por SEGUNDO (`por: "s"`) y tardan de uno a diez minutos: van por la cola de
  // los motores (`enviar` + `sondear`), no en una sola llamada. Los Veo 3.1 de Google (preview) estaban aquí y
  // Google los retiró de la API de Gemini el 22-10-2026: sus versiones finales sólo existen en la plataforma
  // empresarial, con otra cuenta. Veo sigue por fal.ai; lo que se creó con ellos sigue en la galería
  // (`MODELOS_RETIRADOS` le pone nombre).
  {
    // El «Omni» de Flow. Va por la Interactions API de Gemini: la duración no es
    // un parámetro (se dice en el prompt, con los tiempos marcados) y la misma llave de Google sirve.
    id: "gemini-omni-flash", motor: "gemini", api: "interactions", tipo: "video", gid: "gemini-omni-1.1-flash", nombre: "Gemini Omni Flash · hasta 10 s", predeterminado: true,
    creador: "Google", calidad: 4, velocidad: "normal", costo: 0.1, por: "s", referencias: 0, inicial: 1, final: 1, estimado: true,
    nota: "El Omni de Flow: de 3 a 10 s con sonido, desde texto o con imagen inicial y final. Los tiempos van en el prompt ([0-2 s] …): el guion de 10 s ya los escribe. No acepta fotos con personas reconocibles. Sin probar todavía contra Google. Precio aproximado (720p).",
    para: ["hasta 10 s", "reels", "con sonido"],
    ajustes: { aspectRatio: enumerado(["9:16", "16:9"], "9:16"), resolution: enumerado(["720p", "1080p", "360p"], "720p"), duration: enumerado(["4", "6", "8", "10"], "10") },
  },
  // ---- fal.ai. Las imágenes contestan en el acto; el video va por su cola. Los precios son aproximados.
  {
    id: "nano-banana-fal", motor: "fal", tipo: "imagen", nombre: "Nano Banana (fal)",
    creador: "Google", calidad: 3, velocidad: "rápido", costo: 0.039, referencias: 3, estimado: true,
    nota: "Nano Banana a través de tu llave de fal.ai. Edita y mezcla fotos: hasta 3 referencias. Precio aproximado.",
    para: ["editar fotos", "mezclar referencias"],
    ajustes: { aspectRatio: enumerado(["1:1", "4:5", "3:4", "9:16", "16:9", "4:3", "3:2", "2:3", "5:4", "21:9"], "1:1") },
  },
  {
    id: "seedream-4", motor: "fal", tipo: "imagen", nombre: "Seedream 4",
    creador: "ByteDance", calidad: 3, velocidad: "normal", costo: 0.03, referencias: 4, estimado: true,
    nota: "ByteDance: alta resolución; edita con hasta 4 referencias. Sólo los formatos que fal.ai trae exactos. Precio aproximado.",
    para: ["alta resolución", "editar fotos"],
    ajustes: { aspectRatio: enumerado(FORMATOS_FAL, "1:1") },
  },
  {
    id: "flux-kontext", motor: "fal", tipo: "imagen", nombre: "Flux Kontext",
    creador: "Black Forest Labs", calidad: 3, velocidad: "normal", costo: 0.04, referencias: 1, estimado: true,
    nota: "Cambia una imagen con una frase («ponle fondo de playa»): con una referencia, la edita. Precio aproximado.",
    para: ["editar con una frase"],
    ajustes: { aspectRatio: enumerado(["1:1", "3:4", "2:3", "9:16", "4:3", "3:2", "16:9", "21:9"], "1:1") },
  },
  {
    id: "flux-schnell", motor: "fal", tipo: "imagen", nombre: "Flux Schnell",
    creador: "Black Forest Labs", calidad: 1, velocidad: "muy rápido", costo: 0.003, referencias: 0, estimado: true,
    nota: "El más barato: para probar ideas en lote. Sólo los formatos que fal.ai trae exactos. Precio aproximado.",
    para: ["bocetos", "lotes", "el más barato"],
    ajustes: { aspectRatio: enumerado(FORMATOS_FAL, "1:1") },
  },
  {
    id: "ideogram-3-fal", motor: "fal", tipo: "imagen", nombre: "Ideogram 3 (fal)",
    creador: "Ideogram", calidad: 3, velocidad: "normal", costo: 0.06, referencias: 0, estimado: true,
    nota: "Texto legible dentro de la imagen. Sólo los formatos que fal.ai trae exactos. Precio aproximado.",
    para: ["texto legible", "carteles"],
    ajustes: { aspectRatio: enumerado(FORMATOS_FAL, "1:1") },
  },
  {
    id: "kling-2.5-fal", motor: "fal", tipo: "video", nombre: "Kling 2.5 Turbo (fal)", cola: true,
    creador: "Kling (Kuaishou)", calidad: 2, velocidad: "rápido", costo: 0.07, por: "s", referencias: 0, inicial: 1, final: 1, estimado: true,
    nota: "Anima una foto (con imagen final opcional) o crea desde texto. 5 o 10 s. Precio aproximado.",
    para: ["animar una foto"],
    ajustes: { aspectRatio: enumerado(["9:16", "16:9", "1:1"], "9:16"), duration: enumerado(["5", "10"], "5") },
  },
  {
    id: "seedance-1-fal", motor: "fal", tipo: "video", nombre: "Seedance 1 Pro (fal)", cola: true,
    creador: "ByteDance", calidad: 2, velocidad: "normal", costo: 0.12, por: "s", referencias: 0, inicial: 1, final: 1, estimado: true,
    nota: "Anima una foto (con imagen final opcional) o crea desde texto; hasta 1080p. Precio aproximado, el de 1080p.",
    para: ["animar una foto"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1", "4:3", "3:4", "21:9"], "9:16"),
      resolution: enumerado(["480p", "720p", "1080p"], "720p"),
      duration: enumerado(["5", "10"], "5"),
    },
  },
  {
    id: "hailuo-02-fal", motor: "fal", tipo: "video", nombre: "MiniMax Hailuo 02 (fal)", cola: true,
    creador: "MiniMax", calidad: 2, velocidad: "normal", costo: 0.045, por: "s", referencias: 0, inicial: 1, final: 1, estimado: true,
    nota: "Anima una foto (con imagen final opcional) o crea desde texto; 6 o 10 s. El formato lo decide el modelo. Precio aproximado.",
    para: ["animar una foto"],
    ajustes: { duration: enumerado(["6", "10"], "6") },
  },
  {
    id: "veo-3-fast-fal", motor: "fal", tipo: "video", nombre: "Veo 3 Fast (fal)", cola: true,
    creador: "Google", calidad: 3, velocidad: "normal", costo: 0.4, por: "s", referencias: 0, inicial: 1, final: 0, estimado: true,
    nota: "Google Veo con voz y sonido, siempre de 8 s. Caro: cada video sale cerca de 3 $. Precio aproximado.",
    para: ["con sonido", "anuncios"],
    ajustes: { aspectRatio: enumerado(["9:16", "16:9"], "9:16"), duration: enumerado(["8"], "8") },
  },
  // ---- Kie.ai: todo por su cola (tarea + consulta), también las imágenes; las de apoyo se suben a su almacén.
  {
    id: "gpt-image-2-kie", motor: "kie", tipo: "imagen", nombre: "GPT Image 2 (Kie)", cola: true,
    creador: "OpenAI", calidad: 4, velocidad: "normal", costo: 0.05, referencias: 8, estimado: true,
    nota: "El de OpenAI por tu llave de Kie.ai: muy bueno con el texto dentro de la imagen y con fotos de referencia. Proporciones 1:1, 3:4, 9:16, 4:3 y 16:9: el 4:5 del feed sale 3:4. Precio aproximado (2K).",
    para: ["texto legible", "anuncios", "fiel a la referencia"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "9:16", "4:3", "16:9"], "3:4"), imageSize: enumerado(TAMANOS, "2K") },
  },
  {
    id: "nano-banana-pro-kie", motor: "kie", tipo: "imagen", nombre: "Nano Banana Pro (Kie)", cola: true,
    creador: "Google", calidad: 4, velocidad: "normal", costo: 0.09, referencias: 8, estimado: true,
    nota: "Nano Banana Pro por Kie.ai, más barato que por Google: compone bien, escribe texto legible y es muy fiel a la foto del producto. Hasta 8 referencias. Precio aproximado (1K–2K).",
    para: ["fiel al producto", "texto legible", "4K"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "4:5"), imageSize: enumerado(TAMANOS, "2K") },
  },
  {
    id: "nano-banana-2-kie", motor: "kie", tipo: "imagen", nombre: "Nano Banana 2 (Kie)", cola: true,
    creador: "Google", calidad: 3, velocidad: "rápido", costo: 0.04, referencias: 14, estimado: true,
    nota: "Nano Banana 2 por Kie.ai: el todoterreno, hasta 14 referencias. Precio aproximado (1K).",
    para: ["todo uso", "muchas referencias", "lotes"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "4:5"), imageSize: enumerado(TAMANOS, "1K") },
  },
  {
    id: "nano-banana-2-1-kie", motor: "kie", tipo: "imagen", nombre: "Nano Banana 2.1 (Kie)", cola: true,
    creador: "Google", calidad: 4, velocidad: "rápido", costo: 0.06, referencias: 10, estimado: true,
    costoSegun: { ajuste: "imageSize", valores: { "1K": 0.04, "2K": 0.06, "4K": 0.1 } },
    nota: "La versión más nueva de Nano Banana por Kie.ai: hasta 10 referencias, 4:5 exacto y hasta 4K. Muy fiel al producto y al personaje. Precio aproximado.",
    para: ["fiel al producto", "personajes", "4K"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "4:5"), imageSize: enumerado(TAMANOS, "2K") },
  },
  {
    id: "gpt-image-2-5-kie", motor: "kie", tipo: "imagen", nombre: "GPT Image 2.5 (Kie)", cola: true,
    creador: "OpenAI", calidad: 4, velocidad: "normal", costo: 0.07, referencias: 16, estimado: true,
    costoSegun: { ajuste: "imageSize", valores: { "1K": 0.04, "2K": 0.07, "4K": 0.12 } },
    nota: "El más nuevo de OpenAI por Kie.ai: diseña piezas con el texto bien jerarquizado y sigue muy bien las referencias. Sin 4:5: el del feed sale 3:4. Precio aproximado.",
    para: ["texto legible", "diseño de anuncio", "fiel a la referencia"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "9:16", "4:3", "16:9"], "3:4"), imageSize: enumerado(TAMANOS, "2K") },
  },
  {
    id: "ideogram-3-kie", motor: "kie", tipo: "imagen", nombre: "Ideogram 3 (Kie)", cola: true,
    creador: "Ideogram", calidad: 4, velocidad: "normal", costo: 0.06, referencias: 0, estimado: true,
    costoSegun: { ajuste: "calidad", valores: { high: 0.09, low: 0.06 } },
    nota: "El que mejor escribe: titulares, precios y carteles tipográficos sin errores. No lleva referencias (ni el producto real): para piezas de texto y diseño gráfico. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["texto perfecto", "diseño gráfico", "promociones"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "9:16", "4:3", "16:9"], "3:4"), calidad: enumerado(["high", "low"], "high") },
  },
  {
    id: "seedream-5-pro-kie", motor: "kie", tipo: "imagen", nombre: "Seedream 5 Pro (Kie)", cola: true,
    creador: "ByteDance", calidad: 4, velocidad: "normal", costo: 0.04, referencias: 10, estimado: true,
    nota: "Fotografía realista de alta gama, con hasta 10 referencias. Sin 4:5: el del feed sale 3:4. Precio aproximado.",
    para: ["fotografía realista", "producto", "alta resolución"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9"], "3:4"), calidad: enumerado(["high", "low"], "high") },
  },
  {
    id: "imagen-4-ultra-kie", motor: "kie", tipo: "imagen", nombre: "Imagen 4 Ultra (Kie)", cola: true,
    creador: "Google", calidad: 4, velocidad: "normal", costo: 0.06, referencias: 0, estimado: true,
    nota: "El fotográfico de Google: luz y texturas muy reales. Sin referencias (no copia el producto real). Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["fotografía realista", "ambientes", "personas"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "9:16", "4:3", "16:9"], "3:4") },
  },
  // Los de la documentación de Kie de octubre de 2026 (docs/kie/): misma cola, cada uno con su pedido en kie.js.
  {
    id: "imagen-4-kie", motor: "kie", tipo: "imagen", nombre: "Imagen 4 (Kie)", cola: true,
    creador: "Google", calidad: 3, velocidad: "normal", costo: 0.04, referencias: 0, estimado: true,
    nota: "El fotográfico de Google en su versión normal: más barato que Ultra. Sin referencias. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["fotografía realista", "ambientes"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "9:16", "4:3", "16:9"], "3:4") },
  },
  {
    id: "imagen-4-fast-kie", motor: "kie", tipo: "imagen", nombre: "Imagen 4 Fast (Kie)", cola: true,
    creador: "Google", calidad: 2, velocidad: "rápido", costo: 0.02, referencias: 0, estimado: true,
    nota: "Imagen 4 rápido y barato: para probar ideas y ambientes. Sin referencias. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["bocetos", "barato", "ambientes"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "9:16", "4:3", "16:9"], "3:4") },
  },
  {
    id: "nano-banana-2-lite-kie", motor: "kie", tipo: "imagen", nombre: "Nano Banana 2 Lite (Kie)", cola: true,
    creador: "Google", calidad: 2, velocidad: "muy rápido", costo: 0.02, referencias: 10, estimado: true,
    nota: "La versión ligera de Nano Banana 2 por Kie.ai: muy rápida y barata, con hasta 10 referencias y 4:5 exacto. Para lotes y pruebas. Precio aproximado.",
    para: ["lotes", "barato", "4:5"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "4:5") },
  },
  {
    id: "z-image-kie", motor: "kie", tipo: "imagen", nombre: "Z-Image (Kie)", cola: true,
    creador: "Alibaba", calidad: 2, velocidad: "muy rápido", costo: 0.004, referencias: 0, estimado: true,
    nota: "Texto a imagen muy rápido y casi gratis: para bocetos y probar escenas antes de gastar. Sin referencias. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["bocetos", "el más barato", "pruebas"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "4:3", "16:9", "9:16"], "3:4") },
  },
  {
    id: "seedream-4-5-kie", motor: "kie", tipo: "imagen", nombre: "Seedream 4.5 (Kie)", cola: true,
    creador: "ByteDance", calidad: 3, velocidad: "normal", costo: 0.032, referencias: 14, estimado: true,
    nota: "Seedream 4.5: fotografía y edición con hasta 14 referencias. Sin 4:5: el del feed sale 3:4. Precio aproximado.",
    para: ["editar fotos", "muchas referencias", "producto"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9"], "3:4"), calidad: enumerado(["high", "low"], "high") },
  },
  {
    id: "seedream-5-lite-kie", motor: "kie", tipo: "imagen", nombre: "Seedream 5 Lite (Kie)", cola: true,
    creador: "ByteDance", calidad: 3, velocidad: "rápido", costo: 0.03, referencias: 14, estimado: true,
    costoSegun: { ajuste: "calidad", valores: { low: 0.025, high: 0.03, ultra: 0.045 } },
    nota: "Seedream 5 en su versión ligera: realista, con hasta 14 referencias y una calidad «ultra». Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["fotografía realista", "muchas referencias", "barato"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9"], "3:4"), calidad: enumerado(["high", "ultra", "low"], "high") },
  },
  {
    id: "seedream-5-flash-kie", motor: "kie", tipo: "imagen", nombre: "Seedream 5 Flash (Kie)", cola: true,
    creador: "ByteDance", calidad: 3, velocidad: "muy rápido", costo: 0.02, referencias: 10, estimado: true,
    nota: "Seedream 5 rápido: buena foto en segundos, con hasta 10 referencias. Para lotes. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["lotes", "rápido", "producto"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "4:3", "9:16", "16:9", "2:3", "3:2", "21:9"], "3:4"), imageSize: enumerado(["2K", "1.5K", "1K"], "2K") },
  },
  {
    id: "flux-2-pro-kie", motor: "kie", tipo: "imagen", nombre: "Flux 2 Pro (Kie)", cola: true,
    creador: "Black Forest Labs", calidad: 4, velocidad: "normal", costo: 0.035, referencias: 8, estimado: true,
    costoSegun: { ajuste: "imageSize", valores: { "1K": 0.025, "2K": 0.035 } },
    nota: "Flux 2 Pro: fotografía y diseño muy pulidos, sigue bien el prompt; edita con hasta 8 referencias. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["fotografía de producto", "diseño", "fiel al prompt"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "4:3", "16:9", "9:16", "3:2", "2:3"], "3:4"), imageSize: enumerado(["2K", "1K"], "2K") },
  },
  {
    id: "flux-2-flex-kie", motor: "kie", tipo: "imagen", nombre: "Flux 2 Flex (Kie)", cola: true,
    creador: "Black Forest Labs", calidad: 4, velocidad: "lento", costo: 0.12, referencias: 8, estimado: true,
    costoSegun: { ajuste: "imageSize", valores: { "1K": 0.07, "2K": 0.12 } },
    nota: "Flux 2 Flex: la variante que mejor escribe el texto y cuida la tipografía; más lenta y cara que Pro. Hasta 8 referencias. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["texto legible", "tipografía", "diseño"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "4:3", "16:9", "9:16", "3:2", "2:3"], "3:4"), imageSize: enumerado(["2K", "1K"], "2K") },
  },
  {
    id: "flux-3-klein-kie", motor: "kie", tipo: "imagen", nombre: "Flux 3 Klein (Kie)", cola: true,
    creador: "Black Forest Labs", calidad: 3, velocidad: "rápido", costo: 0.015, referencias: 10, estimado: true,
    costoSegun: { ajuste: "imageSize", valores: { "1K": 0.015, "2K": 0.03, "4K": 0.06 } },
    nota: "El Flux 3 pequeño: rápido y barato, edita con hasta 10 referencias y llega a 4K. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["barato", "editar fotos", "4K"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "4:3", "3:2", "2:3", "16:9", "9:16", "21:9"], "3:4"), imageSize: enumerado(TAMANOS, "1K") },
  },
  {
    id: "grok-imagine-2-kie", motor: "kie", tipo: "imagen", nombre: "Grok Imagine 2.0 (Kie)", cola: true,
    creador: "xAI", calidad: 3, velocidad: "rápido", costo: 0.02, referencias: 5, estimado: true,
    nota: "La imagen de Grok (xAI): estilo llamativo y rápido; edita con hasta 5 referencias. Proporciones 2:3, 1:1, 3:2, 9:16 y 16:9: el 4:5 sale 2:3. Precio aproximado.",
    para: ["creativo", "rápido", "redes"],
    ajustes: { aspectRatio: enumerado(["2:3", "1:1", "3:2", "9:16", "16:9"], "2:3") },
  },
  {
    id: "gpt-image-1-5-kie", motor: "kie", tipo: "imagen", nombre: "GPT Image 1.5 (Kie)", cola: true,
    creador: "OpenAI", calidad: 3, velocidad: "normal", costo: 0.11, referencias: 16, estimado: true,
    costoSegun: { ajuste: "calidad", valores: { high: 0.11, low: 0.03 } },
    nota: "La generación anterior de OpenAI: buena con texto y referencias, sólo en 2:3, 1:1 y 3:2 (el 4:5 sale 2:3). En calidad baja es barata. Precio aproximado.",
    para: ["texto legible", "fiel a la referencia"],
    ajustes: { aspectRatio: enumerado(["2:3", "1:1", "3:2"], "2:3"), calidad: enumerado(["high", "low"], "high") },
  },
  {
    id: "gpt-image-2-5-flare-kie", motor: "kie", tipo: "imagen", nombre: "GPT Image 2.5 Flare (Kie)", cola: true,
    creador: "OpenAI", calidad: 4, velocidad: "normal", costo: 0.07, referencias: 16, estimado: true,
    costoSegun: { ajuste: "imageSize", valores: { "1K": 0.04, "2K": 0.07, "4K": 0.12 } },
    nota: "La otra variante de GPT Image 2.5 (Flare): misma familia que «GPT Image 2.5», otro acabado. Hasta 16 referencias. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["texto legible", "diseño de anuncio"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "9:16", "4:3", "16:9", "2:3", "3:2", "21:9"], "3:4"), imageSize: enumerado(TAMANOS, "2K") },
  },
  {
    id: "qwen-2-1-kie", motor: "kie", tipo: "imagen", nombre: "Qwen Image 2.1 (Kie)", cola: true,
    creador: "Alibaba", calidad: 3, velocidad: "normal", costo: 0.02, referencias: 10, estimado: true,
    nota: "Qwen Image: escribe bien el texto (también en español) y edita con hasta 10 referencias. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["texto legible", "editar fotos", "barato"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "4:3", "3:2", "2:3", "16:9", "9:16", "21:9"], "3:4"), imageSize: enumerado(["2K", "1K"], "2K") },
  },
  {
    id: "qwen-3-pro-kie", motor: "kie", tipo: "imagen", nombre: "Qwen 3 Pro (Kie)", cola: true,
    creador: "Alibaba", calidad: 3, velocidad: "normal", costo: 0.03, referencias: 3, estimado: true,
    nota: "Qwen 3 Pro: composición cuidada y texto legible; edita con hasta 3 referencias. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["texto legible", "composición"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "3:2", "2:3", "4:3", "16:9", "9:16", "21:9"], "3:4"), imageSize: enumerado(["2K", "1K"], "2K") },
  },
  {
    id: "wan-2-7-image-kie", motor: "kie", tipo: "imagen", nombre: "Wan 2.7 Image (Kie)", cola: true,
    creador: "Alibaba", calidad: 3, velocidad: "normal", costo: 0.03, referencias: 9, estimado: true,
    nota: "La imagen de Wan 2.7: realista, con hasta 9 referencias. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["fotografía realista", "referencias"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "16:9", "4:3", "21:9", "9:16"], "3:4"), imageSize: enumerado(["2K", "1K"], "2K") },
  },
  {
    id: "wan-2-7-image-pro-kie", motor: "kie", tipo: "imagen", nombre: "Wan 2.7 Image Pro (Kie)", cola: true,
    creador: "Alibaba", calidad: 4, velocidad: "lento", costo: 0.075, referencias: 9, estimado: true,
    nota: "Wan 2.7 Pro: más detalle y hasta 4K, con hasta 9 referencias. Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["alta resolución", "4K", "referencias"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "16:9", "4:3", "21:9", "9:16"], "3:4"), imageSize: enumerado(TAMANOS, "2K") },
  },
  {
    id: "ideogram-personaje-kie", motor: "kie", tipo: "imagen", nombre: "Ideogram Character (Kie) · el mismo personaje", cola: true, necesitaImagen: true,
    creador: "Ideogram", calidad: 4, velocidad: "normal", costo: 0.18, referencias: 1, estimado: true,
    costoSegun: { ajuste: "calidad", valores: { high: 0.18, low: 0.12 } },
    nota: "Pone a la MISMA persona o personaje de la foto de referencia en una escena nueva: para que el personaje de la marca sea siempre el mismo. Necesita una referencia (la del personaje). Sin 4:5: sale 3:4. Precio aproximado.",
    para: ["personajes", "el mismo personaje", "consistencia"],
    ajustes: { aspectRatio: enumerado(["3:4", "1:1", "9:16", "4:3", "16:9"], "3:4"), calidad: enumerado(["high", "low"], "high") },
  },
  // ---- Video por Kie.ai. Por SEGUNDO; el precio cambia con la calidad (`costoSegun`).
  {
    id: "gemini-omni-kie", motor: "kie", tipo: "video", nombre: "Gemini Omni Flash (Kie) · hasta 10 s", cola: true,
    creador: "Google", calidad: 4, velocidad: "normal", costo: 0.08, por: "s", referencias: 7, inicial: 1, final: 1, video: 1, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "360p": 0.05, "720p": 0.08, "1080p": 0.12, "4k": 0.25 } },
    nota: "El Omni de Flow por Kie.ai: varios planos en 10 s con sonido; hasta 7 imágenes de referencia (fotogramas del storyboard, personajes, estilo), o imagen inicial y final, o un video para corregirlo. Precio aproximado.",
    para: ["reels de 10 s", "storyboard", "corregir un video"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9"], "9:16"), duration: enumerado(["4", "6", "8", "10"], "10"),
      resolution: enumerado(["720p", "1080p", "4k", "360p"], "720p"),
      // La voz de la locución (vacío: la que escoja el modelo). Lo que DICE va en el pedido.
      voz: enumerado(["", ...Object.keys(VOCES_OMNI)], ""),
    },
  },
  {
    id: "kling-3-kie", motor: "kie", tipo: "video", nombre: "Kling 3.0 (Kie)", cola: true,
    creador: "Kling (Kuaishou)", calidad: 4, velocidad: "normal", costo: 0.07, por: "s", referencias: 0, inicial: 1, final: 1, estimado: true,
    costoSegun: { ajuste: "modo", valores: { std: 0.07, pro: 0.1, "4K": 0.2 } },
    nota: "Kling 3.0 por Kie.ai: de 3 a 15 s, con sonido, desde texto o desde una imagen inicial (y final). Precio aproximado.",
    para: ["reels", "animar una foto", "con sonido"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1"], "9:16"), duration: enumerado(["5", "6", "7", "8", "9", "10", "12", "15"], "10"),
      modo: enumerado(["std", "pro", "4K"], "std"), sonido: enumerado(["si", "no"], "si"),
    },
  },
  {
    id: "kling-3-omni-kie", motor: "kie", tipo: "video", nombre: "Kling 3.0 Omni (Kie)", cola: true,
    creador: "Kling (Kuaishou)", calidad: 4, velocidad: "lento", costo: 0.1, por: "s", referencias: 7, inicial: 1, final: 1, video: 1, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "720p": 0.1, "1080p": 0.14, "4k": 0.28 } },
    nota: "Kling 3.0 Omni por Kie.ai: hasta 7 imágenes de referencia (personajes, producto, escena) o un video que seguir; de 3 a 15 s con sonido. Precio aproximado.",
    para: ["personajes", "referencias", "seguir un video"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1"], "9:16"), duration: enumerado(["5", "6", "7", "8", "9", "10", "12", "15"], "10"),
      resolution: enumerado(["720p", "1080p", "4k"], "720p"), sonido: enumerado(["si", "no"], "si"),
    },
  },
  {
    id: "seedance-2-kie", motor: "kie", tipo: "video", nombre: "Seedance 2.0 (Kie)", cola: true,
    creador: "ByteDance", calidad: 4, velocidad: "normal", costo: 0.08, por: "s", referencias: 9, inicial: 1, final: 1, video: 1, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "480p": 0.05, "720p": 0.08, "1080p": 0.14, "4k": 0.3 } },
    nota: "Seedance 2.0 por Kie.ai: varios planos con sonido, hasta 9 referencias y un video de referencia; de 4 a 15 s. Precio aproximado.",
    para: ["reels", "referencias", "con sonido"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1", "3:4", "4:3"], "9:16"), duration: enumerado(["5", "6", "8", "10", "12", "15"], "10"),
      resolution: enumerado(["720p", "1080p", "480p", "4k"], "720p"), sonido: enumerado(["si", "no"], "si"),
    },
  },
  {
    id: "seedance-2-5-kie", motor: "kie", tipo: "video", nombre: "Seedance 2.5 (Kie)", cola: true,
    creador: "ByteDance", calidad: 4, velocidad: "normal", costo: 0.1, por: "s", referencias: 14, inicial: 1, final: 1, video: 1, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "480p": 0.06, "720p": 0.1, "1080p": 0.16 } },
    nota: "Seedance 2.5 por Kie.ai: hasta 14 referencias y videos de referencia, de 4 a 30 s, con sonido. Precio aproximado.",
    para: ["muchas referencias", "videos largos"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1", "3:4", "4:3"], "9:16"), duration: enumerado(["5", "6", "8", "10", "12", "15", "20", "30"], "10"),
      resolution: enumerado(["720p", "1080p", "480p"], "720p"), sonido: enumerado(["si", "no"], "si"),
    },
  },
  {
    id: "veo-3-1-fast-kie", motor: "kie", tipo: "video", nombre: "Veo 3.1 Fast (Kie)", cola: true,
    creador: "Google", calidad: 4, velocidad: "normal", costo: 0.05, por: "s", referencias: 3, inicial: 1, final: 1, estimado: true,
    nota: "Veo 3.1 de Google por Kie.ai, con voz y sonido: 4, 6 u 8 s; imagen inicial y final, o hasta 3 referencias (entonces siempre 8 s). Precio aproximado.",
    para: ["con voz", "anuncios", "8 s"],
    ajustes: { aspectRatio: enumerado(["9:16", "16:9"], "9:16"), duration: enumerado(["8", "6", "4"], "8"), resolution: enumerado(["720p", "1080p", "4k"], "720p") },
  },
  {
    id: "veo-3-1-kie", motor: "kie", tipo: "video", nombre: "Veo 3.1 Quality (Kie)", cola: true,
    creador: "Google", calidad: 4, velocidad: "lento", costo: 0.25, por: "s", referencias: 0, inicial: 1, final: 1, estimado: true,
    nota: "Veo 3.1 en su mejor calidad, con voz y sonido: 4, 6 u 8 s, con imagen inicial y final. Caro. Precio aproximado.",
    para: ["la mejor calidad", "con voz"],
    ajustes: { aspectRatio: enumerado(["9:16", "16:9"], "9:16"), duration: enumerado(["8", "6", "4"], "8"), resolution: enumerado(["720p", "1080p", "4k"], "720p") },
  },
  {
    id: "hailuo-2-3-kie", motor: "kie", tipo: "video", nombre: "Hailuo 2.3 Pro (Kie)", cola: true, necesitaImagen: true,
    creador: "MiniMax", calidad: 3, velocidad: "normal", costo: 0.05, por: "s", referencias: 0, inicial: 1, final: 0, estimado: true,
    nota: "Anima una foto con movimiento muy natural; 6 o 10 s, sin sonido. Barato. Precio aproximado.",
    para: ["animar una foto", "barato"],
    ajustes: { duration: enumerado(["6", "10"], "10"), resolution: enumerado(["768P", "1080P"], "768P") },
  },
  {
    id: "wan-2-7-kie", motor: "kie", tipo: "video", nombre: "Wan 2.7 (Kie)", cola: true,
    creador: "Alibaba", calidad: 3, velocidad: "normal", costo: 0.06, por: "s", referencias: 0, inicial: 1, final: 1, estimado: true,
    nota: "Desde texto o con imagen inicial y final, de 2 a 15 s en 1080p. Para probar ideas barato. Precio aproximado.",
    para: ["barato", "pruebas"],
    ajustes: { aspectRatio: enumerado(["9:16", "16:9", "1:1", "3:4", "4:3"], "9:16"), duration: enumerado(["5", "8", "10", "15"], "10"), resolution: enumerado(["1080p", "720p"], "1080p") },
  },
  // Los de la documentación de Kie de octubre de 2026 (docs/kie/).
  {
    id: "gemini-omni-video-kie", motor: "kie", tipo: "video", nombre: "Gemini Omni (Kie) · calidad alta", cola: true,
    creador: "Google", calidad: 4, velocidad: "lento", costo: 0.15, por: "s", referencias: 7, video: 1, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "720p": 0.15, "1080p": 0.2, "4k": 0.4 } },
    nota: "El Omni completo (no el Flash): más calidad y hasta 4K; hasta 7 referencias o un video para corregirlo, con voz escogida. Sin imagen inicial (para eso, el Flash). Precio aproximado.",
    para: ["la mejor calidad", "storyboard", "corregir un video"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9"], "9:16"), duration: enumerado(["4", "6", "8", "10"], "10"),
      resolution: enumerado(["720p", "1080p", "4k"], "720p"), voz: enumerado(["", ...Object.keys(VOCES_OMNI)], ""),
    },
  },
  {
    id: "seedance-2-fast-kie", motor: "kie", tipo: "video", nombre: "Seedance 2.0 Fast (Kie)", cola: true,
    creador: "ByteDance", calidad: 3, velocidad: "rápido", costo: 0.05, por: "s", referencias: 9, inicial: 1, final: 1, video: 1, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "480p": 0.03, "720p": 0.05 } },
    nota: "Seedance 2.0 más rápido y barato (hasta 720p): las mismas referencias, video y sonido. Para probar antes de pedir el bueno. Precio aproximado.",
    para: ["barato", "rápido", "referencias"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"], "9:16"), duration: enumerado(["5", "6", "8", "10", "12", "15"], "10"),
      resolution: enumerado(["720p", "480p"], "720p"), sonido: enumerado(["si", "no"], "si"),
    },
  },
  {
    id: "seedance-2-mini-kie", motor: "kie", tipo: "video", nombre: "Seedance 2.0 Mini (Kie)", cola: true,
    creador: "ByteDance", calidad: 2, velocidad: "rápido", costo: 0.03, por: "s", referencias: 9, inicial: 1, final: 1, video: 1, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "480p": 0.02, "720p": 0.03 } },
    nota: "El Seedance más barato: para bocetos y pruebas de movimiento, con referencias y sonido. Precio aproximado.",
    para: ["el más barato", "bocetos"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"], "9:16"), duration: enumerado(["5", "6", "8", "10", "12", "15"], "10"),
      resolution: enumerado(["720p", "480p"], "720p"), sonido: enumerado(["si", "no"], "si"),
    },
  },
  {
    id: "kling-3-turbo-kie", motor: "kie", tipo: "video", nombre: "Kling 3.0 Turbo (Kie)", cola: true,
    creador: "Kling (Kuaishou)", calidad: 3, velocidad: "rápido", costo: 0.05, por: "s", referencias: 0, inicial: 1, final: 0, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "720p": 0.05, "1080p": 0.07 } },
    nota: "Kling 3.0 rápido: desde texto o animando una foto, 5 o 10 s. Más barato que el 3.0 normal. Precio aproximado.",
    para: ["animar una foto", "rápido", "barato"],
    ajustes: { aspectRatio: enumerado(["9:16", "16:9", "1:1"], "9:16"), duration: enumerado(["5", "10"], "10"), resolution: enumerado(["720p", "1080p"], "720p") },
  },
  {
    id: "kling-2-6-kie", motor: "kie", tipo: "video", nombre: "Kling 2.6 (Kie)", cola: true,
    creador: "Kling (Kuaishou)", calidad: 3, velocidad: "normal", costo: 0.11, por: "s", referencias: 0, inicial: 1, final: 0, estimado: true,
    costoSegun: { ajuste: "sonido", valores: { si: 0.11, no: 0.055 } },
    nota: "Kling 2.6: desde texto o animando una foto, 5 o 10 s, con sonido o sin él (sin sonido cuesta la mitad). Precio aproximado.",
    para: ["animar una foto", "con sonido"],
    ajustes: { aspectRatio: enumerado(["9:16", "16:9", "1:1"], "9:16"), duration: enumerado(["5", "10"], "10"), sonido: enumerado(["si", "no"], "si") },
  },
  {
    id: "kling-2-6-movimiento-kie", motor: "kie", tipo: "video", nombre: "Kling 2.6 · copia el movimiento (Kie)", cola: true, necesitaVideo: true, necesitaImagen: true,
    creador: "Kling (Kuaishou)", calidad: 3, velocidad: "normal", costo: 0.045, por: "s", segundos: 10, referencias: 1, inicial: 1, final: 0, video: 1, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "720p": 0.045, "1080p": 0.07 } },
    nota: "Pone a la persona de TU foto a hacer los movimientos del video de referencia (un baile, un gesto, un recorrido). Necesita la foto (referencia o imagen inicial) y el video. Se cobra por lo que dura el video: el precio supone 10 s. Precio aproximado.",
    para: ["copiar un movimiento", "tendencias", "personajes"],
    ajustes: { resolution: enumerado(["720p", "1080p"], "720p"), orientacion: enumerado(["video", "image"], "video") },
  },
  {
    id: "veo-3-1-lite-kie", motor: "kie", tipo: "video", nombre: "Veo 3.1 Lite (Kie)", cola: true,
    creador: "Google", calidad: 3, velocidad: "rápido", costo: 0.03, por: "s", referencias: 0, inicial: 1, final: 1, estimado: true,
    nota: "Veo 3.1 en su versión ligera, con voz y sonido: 4, 6 u 8 s, desde texto o con imagen inicial y final. El Veo más barato. Precio aproximado.",
    para: ["con voz", "barato", "8 s"],
    ajustes: { aspectRatio: enumerado(["9:16", "16:9"], "9:16"), duration: enumerado(["8", "6", "4"], "8"), resolution: enumerado(["720p", "1080p"], "720p") },
  },
  {
    id: "wan-3-kie", motor: "kie", tipo: "video", nombre: "Wan 3.0 (Kie)", cola: true,
    creador: "Alibaba", calidad: 4, velocidad: "normal", costo: 0.08, por: "s", referencias: 10, inicial: 1, final: 1, video: 1, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "480P": 0.04, "720P": 0.06, "1080P": 0.08 } },
    nota: "Wan 3.0: hasta 10 imágenes de referencia, un video que seguir o imagen inicial y final, con sonido. Precio aproximado.",
    para: ["referencias", "con sonido", "reels"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1", "3:4", "4:3"], "9:16"), duration: enumerado(["5", "8", "10"], "10"),
      resolution: enumerado(["1080P", "720P", "480P"], "1080P"), sonido: enumerado(["si", "no"], "si"),
    },
  },
  {
    id: "wan-3-prime-kie", motor: "kie", tipo: "video", nombre: "Wan 3.0 Prime (Kie)", cola: true,
    creador: "Alibaba", calidad: 4, velocidad: "lento", costo: 0.15, por: "s", referencias: 10, inicial: 1, final: 1, video: 1, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "480P": 0.08, "720P": 0.11, "1080P": 0.15 } },
    nota: "Wan 3.0 en su mejor calidad (Prime): lo mismo que Wan 3.0 con más detalle y movimiento. Precio aproximado.",
    para: ["la mejor calidad", "referencias"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1", "3:4", "4:3"], "9:16"), duration: enumerado(["5", "8", "10"], "10"),
      resolution: enumerado(["1080P", "720P", "480P"], "1080P"), sonido: enumerado(["si", "no"], "si"),
    },
  },
  {
    id: "hailuo-2-3-std-kie", motor: "kie", tipo: "video", nombre: "Hailuo 2.3 Standard (Kie)", cola: true, necesitaImagen: true,
    creador: "MiniMax", calidad: 3, velocidad: "normal", costo: 0.03, por: "s", referencias: 0, inicial: 1, final: 0, estimado: true,
    nota: "Hailuo 2.3 en su versión normal: anima una foto con movimiento natural, más barato que el Pro. 6 o 10 s, sin sonido. Precio aproximado.",
    para: ["animar una foto", "barato"],
    ajustes: { duration: enumerado(["6", "10"], "10"), resolution: enumerado(["768P", "1080P"], "768P") },
  },
  {
    id: "minimax-h3-kie", motor: "kie", tipo: "video", nombre: "MiniMax H3 (Kie)", cola: true,
    creador: "MiniMax", calidad: 4, velocidad: "normal", costo: 0.1, por: "s", referencias: 9, inicial: 1, final: 1, video: 1, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "768P": 0.05, "2K": 0.1 } },
    nota: "MiniMax H3: hasta 2K, de 4 a 15 s; desde texto, con imagen inicial y final, o con hasta 9 referencias y un video. Precio aproximado.",
    para: ["referencias", "2K", "videos largos"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1", "3:4", "4:3", "21:9"], "9:16"), duration: enumerado(["6", "8", "10", "12", "15"], "10"),
      resolution: enumerado(["2K", "768P"], "768P"),
    },
  },
  {
    id: "pixverse-6-kie", motor: "kie", tipo: "video", nombre: "PixVerse V6 (Kie)", cola: true,
    creador: "PixVerse", calidad: 3, velocidad: "rápido", costo: 0.06, por: "s", referencias: 0, inicial: 1, final: 1, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "360p": 0.03, "540p": 0.04, "720p": 0.06, "1080p": 0.1 } },
    nota: "PixVerse V6: desde texto, animando una foto o haciendo la transición entre dos (inicial y final); con sonido si se quiere. Precio aproximado.",
    para: ["transiciones", "animar una foto", "rápido"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1", "3:4", "4:3", "2:3", "3:2", "21:9"], "9:16"), duration: enumerado(["5", "8", "10", "15"], "10"),
      resolution: enumerado(["720p", "1080p", "540p", "360p"], "720p"), sonido: enumerado(["no", "si"], "no"),
    },
  },
  {
    id: "happyhorse-1-1-kie", motor: "kie", tipo: "video", nombre: "HappyHorse 1.1 (Kie)", cola: true,
    creador: "HappyHorse", calidad: 3, velocidad: "normal", costo: 0.08, por: "s", referencias: 9, inicial: 1, final: 0, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "720p": 0.05, "1080p": 0.08 } },
    nota: "HappyHorse 1.1: desde texto, animando una foto o con hasta 9 referencias; tiene 4:5 exacto. De 3 a 15 s. Precio aproximado.",
    para: ["4:5", "referencias", "animar una foto"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "4:5", "16:9", "1:1", "3:4", "4:3", "5:4", "21:9"], "9:16"), duration: enumerado(["5", "8", "10", "15"], "10"),
      resolution: enumerado(["1080p", "720p"], "1080p"),
    },
  },
  {
    id: "grok-imagine-video-kie", motor: "kie", tipo: "video", nombre: "Grok Imagine Video 1.5 (Kie)", cola: true,
    creador: "xAI", calidad: 3, velocidad: "rápido", costo: 0.05, por: "s", referencias: 7, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "480p": 0.03, "720p": 0.05, "1080p": 0.08 } },
    nota: "El video de Grok (xAI, versión de prueba): desde texto o con hasta 7 imágenes de referencia, de 6 a 15 s. Precio aproximado.",
    para: ["creativo", "referencias", "rápido"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1", "3:2", "2:3"], "9:16"), duration: enumerado(["6", "8", "10", "15"], "8"),
      resolution: enumerado(["720p", "1080p", "480p"], "720p"),
    },
  },
  {
    id: "vidu-q4-kie", motor: "kie", tipo: "video", nombre: "Vidu Q4 (Kie)", cola: true, necesitaImagen: true,
    creador: "Vidu (Shengshu)", calidad: 4, velocidad: "normal", costo: 0.06, por: "s", referencias: 15, inicial: 1, final: 0, estimado: true,
    costoSegun: { ajuste: "resolution", valores: { "540p": 0.04, "720p": 0.06, "1080p": 0.09, "2k": 0.14, "4k": 0.2 } },
    nota: "Vidu Q4: anima una foto o junta hasta 15 referencias en un video de 3 a 16 s, con sonido y hasta 4K. Necesita una imagen. Precio aproximado.",
    para: ["muchas referencias", "4K", "con sonido"],
    ajustes: {
      aspectRatio: enumerado(["9:16", "16:9", "1:1", "3:4", "4:3"], "9:16"), duration: enumerado(["5", "8", "10", "16"], "10"),
      resolution: enumerado(["720p", "1080p", "540p", "2k", "4k"], "720p"), sonido: enumerado(["si", "no"], "si"),
    },
  },
  // ---- Higgsfield: sale de su documentación (scripts/estudio/generar-higgsfield.mjs), no se escribe a mano.
  ...MODELOS_HIGGSFIELD.map(desdeJson),
  {
    id: "prueba-video", motor: "prueba", tipo: "video", nombre: "Prueba de video (gratis)",
    creador: "Estudio", calidad: 1, velocidad: "muy rápido", costo: 0, por: "s", referencias: 8, inicial: 1, final: 1,
    nota: "Una tarjeta animada en lugar del video: prueba todo el recorrido (animar una imagen, esperar, ver) sin gastar nada.",
    para: ["probar el flujo sin gastar"],
    ajustes: { aspectRatio: enumerado(["16:9", "9:16", "1:1"], "9:16"), duration: enumerado(["3", "5", "8"], "5") },
  },
  {
    id: "prueba", motor: "prueba", tipo: "imagen", nombre: "Prueba (gratis)",
    creador: "Estudio", calidad: 1, velocidad: "muy rápido", costo: 0, referencias: 8,
    nota: "Una tarjeta con tu prompt, no una imagen real: prueba todo el recorrido sin gastar nada.",
    para: ["probar el flujo sin gastar"],
    ajustes: { aspectRatio: enumerado(PROPORCIONES, "1:1") },
  },
]);

/** El modelo con ese id, o null. */
export const modeloPorId = (id) => MODELOS.find((m) => m.id === id) ?? null;

/**
 * Los que ya no se pueden pedir, con su nombre: la galería y los pedidos viejos los siguen nombrando. Que no estén
 * en `MODELOS` es lo que impide pedirlos (`validarPedido`) y avanzar un pedido que quedó a medias (trabajos.js).
 */
export const MODELOS_RETIRADOS = Object.freeze({
  "veo-3.1": "Veo 3.1",
  "veo-3.1-fast": "Veo 3.1 Fast",
  "veo-3.1-lite": "Veo 3.1 Lite",
  // «Pulir el acabado» (Kie): la agencia no le encontró uso y se quitó. Lo que ya se pulió sigue en la galería.
  "topaz-ampliar-kie": "Ampliar y limpiar (Topaz)",
  "recraft-nitidez-kie": "Nitidez (Recraft)",
  "recraft-sin-fondo-kie": "Quitar el fondo (Recraft)",
});
const DE_GOOGLE = new Set(["veo-3.1", "veo-3.1-fast", "veo-3.1-lite"]);

/** Por qué ya no se puede pedir un modelo retirado, y qué usar. */
export const retirado = (id) => (DE_GOOGLE.has(id)
  ? `Google retiró ${MODELOS_RETIRADOS[id] ?? id} de su API el 22 de octubre de 2026. Pídelo con Gemini Omni Flash o con Veo 3 Fast (fal).`
  : `«${MODELOS_RETIRADOS[id] ?? id}» ya no se ofrece en el Estudio.`);

/** El nombre de un modelo para la pantalla, también de uno retirado; si no se conoce, el id tal cual. */
export const nombreDelModelo = (id) => modeloPorId(id)?.nombre ?? (MODELOS_RETIRADOS[id] ? `${MODELOS_RETIRADOS[id]} (retirado)` : id || "");

/**
 * El modelo con que arranca el compositor: el marcado `predeterminado` de ese tipo si su motor tiene llave, luego
 * cualquier otro real, y si no hay ninguno, la prueba. El predeterminado es el más barato que ya se sabe que
 * funciona: para imagen, el que la aplicación ya usaba; para video, Gemini Omni Flash (la misma llave de Google).
 */
export function modeloPorDefecto(motoresActivos = {}, tipo = "imagen") {
  const deEsteTipo = MODELOS.filter((m) => m.tipo === tipo && m.motor !== "prueba" && motoresActivos[m.motor]);
  return deEsteTipo.find((m) => m.predeterminado) ?? deEsteTipo[0]
    ?? MODELOS.find((m) => m.tipo === tipo && m.motor === "prueba");
}

/**
 * ¿Sale este modelo en la proporción pedida? Tiene que admitirla y, si la pieza lleva imágenes de referencia, no ser
 * uno de los que con referencias sólo dan otras (`conReferencias`). Sin proporción, sí. Pura.
 */
export function respetaProporcion(modelo, proporcion, conReferencias = false) {
  if (!proporcion || modelo?.tipo !== "imagen") return true;
  if (!(modelo.ajustes?.aspectRatio?.valores ?? []).includes(proporcion)) return false;
  return !(conReferencias && modelo.conReferencias && !modelo.conReferencias.includes(proporcion));
}

/** Los que hacen cualquier proporción con referencias, en orden de preferencia (calidad y precio). */
export const RELEVO_PROPORCION = Object.freeze(["nano-banana-2-kie", "nano-banana-2", "nano-banana-2-1-kie", "nano-banana-pro-kie", "nano-banana-pro", "nano-banana"]);

/**
 * El modelo con que de verdad sale la pieza en `proporcion`: el escogido si la respeta; si no, el primero de
 * RELEVO_PROPORCION con llave que la respete (con sitio para las referencias, si van). Sin relevo, el escogido: la red
 * de seguridad de después (recomponer) la deja en su proporción. Pura.
 */
export function modeloQueRespeta(modelo, activos = {}, proporcion = "", referencias = 0) {
  if (!modelo || respetaProporcion(modelo, proporcion, referencias > 0)) return modelo;
  return relevoPara(activos, proporcion, Math.min(referencias, modelo.referencias ?? 0)) ?? modelo;
}

/** El primero de RELEVO_PROPORCION con llave que haga `proporcion` con `referencias` imágenes de apoyo, o null. Pura. */
export function relevoPara(activos = {}, proporcion = "", referencias = 1) {
  for (const id of RELEVO_PROPORCION) {
    const m = modeloPorId(id);
    if (m && activos[m.motor] && respetaProporcion(m, proporcion, referencias > 0) && (m.referencias ?? 0) >= referencias) return m;
  }
  return null;
}

/**
 * ¿Salió la imagen en otra proporción que la pedida? Con un 4 % de margen: Nano Banana entrega el 4:5 en 896×1152
 * (0,78) y eso vale; un 2:3 o un 3:4 cuando se pidió 4:5, no. Sin medidas o sin proporción pedida, no. Pura.
 */
export function fueraDeProporcion(archivo, proporcion = "") {
  const [w, h] = String(proporcion).split(":").map(Number);
  if (!(w > 0 && h > 0 && archivo?.ancho > 0 && archivo?.alto > 0)) return false;
  const pedida = w / h;
  return Math.abs(archivo.ancho / archivo.alto - pedida) / pedida > 0.04;
}

/**
 * La orden de RECOMPONER una pieza que salió en otra proporción: la misma pieza en el formato pedido, sin recortar ni
 * acercar (no se pierde el texto ni se encoge), reacomodando el fondo y los márgenes. Pura.
 */
export const pedidoDeRecomponer = (proporcion) =>
  `Recompón esta MISMA pieza en formato ${proporcion} (vertical si el alto es mayor). Conserva el diseño: el texto exacto palabra por palabra, con el mismo tamaño relativo y la misma jerarquía, la tipografía, los colores, el producto, las personas y el logo. Reacomoda o extiende el fondo y los márgenes para llenar el formato nuevo. No recortes ningún elemento, no hagas zoom ni cambies el encuadre del sujeto, no añadas texto.`;

/** Segundos de un video pedido (su ajuste `duration`, o el que traiga el modelo por defecto). */
export const duracionDe = (modelo, ajustes = {}) =>
  Number(ajustes?.duration ?? modelo?.ajustes?.duration?.defecto ?? modelo?.segundos ?? 0) || 0;

/**
 * ¿Este modelo se pide por la COLA (se envía, se espera, se mira cómo va)? Todos los de video, y las imágenes de los
 * motores que sólo contestan así (Higgsfield). Las demás imágenes contestan en el acto.
 */
export const enCola = (modelo) => modelo?.tipo === "video" || modelo?.cola === true;

/** Cómo se ordena la lista de modelos. */
export const CRITERIOS_ORDEN = Object.freeze([
  ["recomendado", "Recomendado"], ["calidad", "Mejor calidad"], ["barato", "Más barato"], ["caro", "Más caro"], ["rapido", "Más rápido"], ["creador", "Por creador"],
]);

export const NOMBRE_CALIDAD = Object.freeze({ 1: "básica", 2: "buena", 3: "alta", 4: "la mejor" });
const RAPIDEZ = Object.freeze({ "muy rápido": 4, rápido: 3, normal: 2, lento: 1 });

/**
 * Los modelos de un tipo, ordenados y filtrados para la lista. Pura.
 *
 *   · Los que tienen llave van SIEMPRE primero (`activos` = { motor: bool }): un modelo atenuado no se puede pedir.
 *   · `recomendado`: el predeterminado, luego la mejor calidad y, a igual calidad, el más barato.
 *   · `creador` filtra por quién hace el modelo (Google, Kling…); `seleccionado` se mantiene aunque el filtro lo
 *     deje fuera, para que la lista nunca esconda lo que está escogido.
 *   · A igualdad de criterio manda el orden del catálogo: la lista no salta de sitio entre una visita y otra.
 */
export function modelosParaLista(tipo, { orden = "recomendado", creador = "", activos = {}, seleccionado = "" } = {}) {
  const base = MODELOS.map((m, i) => ({ m, i })).filter(({ m }) => m.tipo === tipo);
  const filtrados = base.filter(({ m }) => !creador || m.creador === creador || m.id === seleccionado);
  const activo = ({ m }) => (activos[m.motor] ? 0 : 1);
  // Lo que cuesta UNA pieza (un video, con su duración por defecto): por segundo y por imagen no se comparan.
  const costoPorUnidad = ({ m }) => costoDePieza(m);
  const clave = {
    recomendado: (x) => [activo(x), x.m.predeterminado ? 0 : 1, -(x.m.calidad ?? 2), costoPorUnidad(x)],
    calidad: (x) => [activo(x), -(x.m.calidad ?? 2), costoPorUnidad(x)],
    barato: (x) => [activo(x), x.m.motor === "prueba" ? 1 : 0, costoPorUnidad(x), -(x.m.calidad ?? 2)],
    caro: (x) => [activo(x), -costoPorUnidad(x), -(x.m.calidad ?? 2)],
    rapido: (x) => [activo(x), -(RAPIDEZ[x.m.velocidad] ?? 2), costoPorUnidad(x)],
    creador: (x) => [activo(x), String(x.m.creador ?? "").toLocaleLowerCase("es"), -(x.m.calidad ?? 2), costoPorUnidad(x)],
  }[orden] ?? ((x) => [activo(x)]);
  const comparar = (a, b) => {
    const ka = clave(a);
    const kb = clave(b);
    for (let n = 0; n < ka.length; n++) {
      if (ka[n] < kb[n]) return -1;
      if (ka[n] > kb[n]) return 1;
    }
    return a.i - b.i;
  };
  return filtrados.sort(comparar).map(({ m }) => m);
}

/** Lo que cuesta UNA pieza con los ajustes por defecto: una imagen, o un video con su duración por defecto. */
export const costoDePieza = (m) => estimar(m, 1);

/** «≈ 0,04 $» o, en un video, «≈ 0,80 $ (10 s)»: lo que cuesta una pieza, para las listas. */
export const etiquetaDeCosto = (m) => (m?.tipo === "video" ? `${textoCosto(costoDePieza(m))} (${duracionDe(m)} s)` : textoCosto(costoDePieza(m)));

/**
 * Del más barato al más caro (por pieza): los que no tienen llave y la prueba, al final; a igual precio, la mejor
 * calidad primero y luego el orden del catálogo. La lista de cualquier pantalla del Estudio. Pura.
 */
export function porPrecio(modelos = [], activos = {}) {
  const rango = (m) => (m.motor === "prueba" ? 1 : activos[m.motor] ? 0 : 2);
  return modelos.map((m, i) => ({ m, i }))
    .sort((a, b) => rango(a.m) - rango(b.m) || costoDePieza(a.m) - costoDePieza(b.m) || (b.m.calidad ?? 2) - (a.m.calidad ?? 2) || a.i - b.i)
    .map(({ m }) => m);
}

/** Quién hace los modelos de un tipo, sin repetir y en orden alfabético. */
export function creadoresDe(tipo) {
  return [...new Set(MODELOS.filter((m) => m.tipo === tipo).map((m) => m.creador).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

/** Quién pone el modelo, para la lista. */
export const NOMBRE_MOTOR = Object.freeze({ gemini: "Google", fal: "fal.ai", higgsfield: "Higgsfield", kie: "Kie.ai", meta: "Meta", prueba: "Prueba" });

/**
 * El precio por unidad con estos ajustes: `costoSegun` (si el modelo lo trae) dice cuánto cuesta con cada valor de un
 * ajuste —la resolución, el modo—; sin ese ajuste, el de su valor por defecto. Si no, `costo`. Pura.
 */
export function costoUnitario(modelo, ajustes = {}) {
  const m = typeof modelo === "string" ? modeloPorId(modelo) : modelo;
  if (!m) return 0;
  const segun = m.costoSegun;
  if (!segun) return m.costo ?? 0;
  const valor = ajustes?.[segun.ajuste] ?? m.ajustes?.[segun.ajuste]?.defecto;
  return segun.valores[valor] ?? m.costo ?? 0;
}

/** Cuánto cuesta un pedido, en dólares, redondeado a la milésima. Un video cuesta por segundo. */
export function estimar(modelo, cantidad = 1, ajustes = {}) {
  const m = typeof modelo === "string" ? modeloPorId(modelo) : modelo;
  if (!m) return 0;
  const n = Math.max(1, Math.min(maxPorPedido(m), Math.trunc(Number(cantidad)) || 1));
  const unidades = m.por === "s" ? duracionDe(m, ajustes) : 1;
  return Math.round(costoUnitario(m, ajustes) * n * unidades * 1000) / 1000;
}

/** «≈ 0,07 $», «gratis». */
export function textoCosto(dolares) {
  if (!(dolares > 0)) return "gratis";
  const n = dolares < 0.1 ? dolares.toFixed(3) : dolares.toFixed(2);
  return `≈ ${n.replace(".", ",")} $`;
}

/** ¿Este costo pide una segunda confirmación? */
export const pideConfirmar = (dolares) => Number(dolares) >= CONFIRMAR_DESDE;

/**
 * Los ajustes tal como los acepta el modelo: cada uno con un valor
 * permitido, y los que el modelo no conoce, fuera. Lo que llegue
 * inventado (del navegador, de un asistente) no llega al proveedor.
 */
export function normalizarAjustes(modelo, entrada = {}) {
  const m = typeof modelo === "string" ? modeloPorId(modelo) : modelo;
  const salida = {};
  for (const [nombre, def] of Object.entries(m?.ajustes ?? {})) {
    const valor = entrada?.[nombre];
    salida[nombre] = def.valores.includes(valor) ? valor : def.defecto;
  }
  return salida;
}

/**
 * Los ajustes tal como quedan para este modelo y estos medios: normalizados, y con las reglas propias del
 * modelo aplicadas (`ajustar`, si el modelo trae reglas propias). La pantalla los
 * usa para no enseñar una combinación que el modelo va a cambiar, y `validarPedido` para lo que se envía.
 */
export function ajustesDe(modelo, entrada = {}, medios = {}) {
  const m = typeof modelo === "string" ? modeloPorId(modelo) : modelo;
  const ajustes = normalizarAjustes(m, entrada);
  return m?.ajustar ? m.ajustar(ajustes, medios) : ajustes;
}

/** La proporción de un pedido; 1:1 si el modelo no la trae. */
export const proporcionDe = (ajustes) => (MEDIDAS[ajustes?.aspectRatio] ? ajustes.aspectRatio : "1:1");

/**
 * Comprueba un pedido y lo deja limpio. Pura: la llaman el Worker (antes
 * de crear el trabajo) y la pantalla (para no enseñar un botón que el
 * servidor va a rechazar). `{ ok, error, pedido }`.
 */
export function validarPedido(entrada = {}) {
  const modelo = modeloPorId(entrada.modelo);
  if (!modelo) return { ok: false, error: MODELOS_RETIRADOS[entrada.modelo] ? retirado(entrada.modelo) : "Ese modelo no existe en el Estudio." };
  const prompt = String(entrada.prompt ?? "").trim();
  if (!prompt) return { ok: false, error: "Escribe qué quieres crear." };
  if (prompt.length > MAX_PROMPT) return { ok: false, error: `El prompt es demasiado largo (máximo ${MAX_PROMPT} caracteres).` };
  const tope = maxPorPedido(modelo);
  const n = Number(entrada.n ?? 1);
  if (!(Number.isInteger(n) && n >= 1 && n <= tope)) {
    return { ok: false, error: `Puedes pedir de 1 a ${tope} ${modelo.tipo === "video" ? "videos" : "imágenes"} por vez.` };
  }
  const unicos = (lista) => [...new Set((lista ?? []).map(String))];
  const medios = {};
  const referencias = unicos(entrada.medios?.reference);
  const inicial = unicos(entrada.medios?.start);
  const final = unicos(entrada.medios?.end);
  const videos = unicos(entrada.medios?.video);
  if (videos.length > (modelo.video ?? 0)) {
    return { ok: false, error: modelo.video ? `${modelo.nombre} lleva un solo video de referencia.` : `${modelo.nombre} no admite un video de referencia.` };
  }
  if (modelo.necesitaVideo && !videos.length) {
    return { ok: false, error: `${modelo.nombre} necesita un video de referencia (súbelo a la galería y ponlo en el pedido).` };
  }
  if (referencias.length > (modelo.referencias ?? 0)) {
    return {
      ok: false,
      error: modelo.referencias
        ? `${modelo.nombre} admite hasta ${modelo.referencias} referencias; llevas ${referencias.length}.`
        : `${modelo.nombre} no admite imágenes de referencia.`,
    };
  }
  if (inicial.length > (modelo.inicial ?? 0)) {
    return { ok: false, error: modelo.inicial ? `${modelo.nombre} lleva una sola imagen inicial.` : `${modelo.nombre} no admite imagen inicial.` };
  }
  if (final.length > (modelo.final ?? 0)) {
    return { ok: false, error: modelo.final ? `${modelo.nombre} lleva una sola imagen final.` : `${modelo.nombre} no admite imagen final.` };
  }
  if (final.length && !inicial.length) return { ok: false, error: "La imagen final necesita también una inicial." };
  if (modelo.necesitaImagen && !inicial.length && !referencias.length) {
    return { ok: false, error: `${modelo.nombre} no crea desde texto solo: necesita ${modelo.inicial ? "una imagen inicial" : "al menos una imagen de referencia"}.` };
  }
  if (inicial.length && referencias.length && modelo.motor === "gemini" && modelo.tipo === "video") {
    return { ok: false, error: "Ese modelo no mezcla imagen inicial con referencias: usa una cosa o la otra." };
  }
  if (referencias.length) medios.reference = referencias;
  if (inicial.length) medios.start = inicial;
  if (final.length) medios.end = final;
  if (videos.length) medios.video = videos;
  let ajustes = normalizarAjustes(modelo, entrada.ajustes);
  if (modelo.ajustar) ajustes = modelo.ajustar(ajustes, medios);
  return { ok: true, pedido: { modelo, prompt, n, ajustes, medios, costoEstimado: estimar(modelo, n, ajustes) } };
}

/** Días que un archivo espera en la papelera antes de borrarse de verdad. */
export const DIAS_PAPELERA = 30;

/** Días que le quedan a un archivo de la papelera (0 = se borra ya). */
export function diasQueQuedan(borradoAt, ahora = Date.now()) {
  const t = Date.parse(borradoAt);
  if (!Number.isFinite(t)) return DIAS_PAPELERA;
  return Math.max(0, Math.ceil((t + DIAS_PAPELERA * 86_400_000 - ahora) / 86_400_000));
}

/** Estados en los que un trabajo sigue vivo. */
export const ESTADOS_VIVOS = Object.freeze(["en_cola", "en_marcha"]);
export const estaVivo = (estado) => ESTADOS_VIVOS.includes(estado);

/** Lo que dice la interfaz de cada estado. */
export const NOMBRE_ESTADO = Object.freeze({
  en_cola: "En cola", en_marcha: "Creando…", hecho: "Listo", fallido: "No salió", cancelado: "Cancelado",
});
