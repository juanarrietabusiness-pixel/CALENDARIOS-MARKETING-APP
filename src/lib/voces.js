// ============================================================
// La VOZ del video animado: modelos, voces, costo y los tiempos de cada palabra (puro)
//
// La locución es UNA toma de ElevenLabs. Por DOS caminos (`viaDeVoz`):
//   · DIRECTO con la llave oficial (`ELEVENLABS_API_KEY`, worker/lib/estudio/elevenlabs.js) cuando el servidor la tiene:
//     contesta en el acto con el audio y el tiempo de cada carácter, y vale cualquier voz de la cuenta.
//   · por Kie.ai (worker/lib/estudio/kie.js), el respaldo sin llave oficial: sólo las voces de su lista.
// Tres modelos:
//
//   · v4 (`eleven_v4`, sólo DIRECTO): el principal con la llave oficial; si la cuenta no lo tiene, v3 (`modeloParaVia`).
//   · v3 (`elevenlabs/text-to-dialogue-v3`): el principal por Kie. Entiende las etiquetas de emoción
//     entre corchetes del guion («[preocupada] ¿Las toallitas…»). Va por `dialogue: [{ text, voice }]`.
//   · v2 (`elevenlabs/text-to-speech-multilingual-v2`): el de respaldo. Sin etiquetas (se quitan),
//     y se le pide `timestamps`.
//
// LOS TIEMPOS POR PALABRA, EN TRES CAPAS (`tiemposDeLocucion`), porque el motor del video ancla cada
// escena y cada capa a una palabra:
//   1. Los que traiga el resultado, si los trae (`palabrasDelResultado` lee las formas que usa
//      ElevenLabs: por palabra o por carácter). La documentación de Kie no dice si v3 los devuelve.
//   2. Si no, la VERIFICACIÓN POSTERIOR: Gemini escucha el audio y transcribe con tiempos; se ALINEA
//      con las palabras del guion (`alinearPalabras`) y de paso dice cuánto de lo escrito se oyó
//      (`coincidencia`): una locución que se salta una frase se nota aquí y no en el render.
//   3. Si tampoco, se ESTIMAN sobre la duración REAL del audio (`duracionMp3`), repartida por el largo
//      de cada palabra y las pausas de la puntuación (`palabrasEstimadas`). Nunca inventa una duración.
//
// El resultado es la lista que espera `lineaDeTiempo` (src/lib/videoEscenas.js): un `{ desde, hasta }`
// por cada palabra de `palabrasDe(textoDeLocucion(guion))`, ni una más ni una menos.
//
// LO QUE SALE DE LA DOCUMENTACIÓN Y NO SE HA PROBADO CONTRA KIE: los nombres de los campos de los dos
// modelos, cómo nombra Kie una voz (por id de ElevenLabs en v3, como su ejemplo; en v2 se manda el
// nombre de las de serie) y si el resultado trae tiempos. Todo se lee con tolerancia y un fallo dice
// lo que contestó Kie.
// ============================================================

import { palabrasDe, sinEtiquetas, textoDeLocucion } from "./videoEscenas.js";

/** Un crédito de Kie en dólares (su página de precios: 1 crédito ≈ 0,005 $). */
export const USD_POR_CREDITO = 0.005;

/** Los modelos de voz. `creditos` por cada 1.000 caracteres por Kie (su página de precios, octubre de 2026). */
// `idDirecto` y `elevenlabs` (su `model_id`) son los del camino directo; `max` es el menor de los dos caminos (v3 directo
// admite 5.000 caracteres por petición). v4 sólo existe por el camino DIRECTO (`kie: null`): Kie no lo ofrece.
export const MODELOS_VOZ = Object.freeze({
  v4: Object.freeze({
    id: null, idDirecto: "elevenlabs-v4", elevenlabs: "eleven_v4", clave: "v4", nombre: "ElevenLabs v4 (la más expresiva)",
    kie: null, creditos: null, max: 5000, etiquetas: true, soloDirecto: true,
  }),
  v3: Object.freeze({
    id: "elevenlabs-v3-kie", idDirecto: "elevenlabs-v3", elevenlabs: "eleven_v3", clave: "v3", nombre: "ElevenLabs v3 (expresiva)",
    kie: "elevenlabs/text-to-dialogue-v3", creditos: 14, max: 5000, etiquetas: true,
  }),
  v2: Object.freeze({
    id: "elevenlabs-v2-kie", idDirecto: "elevenlabs-v2", elevenlabs: "eleven_multilingual_v2", clave: "v2", nombre: "ElevenLabs Multilingüe v2 (respaldo)",
    kie: "elevenlabs/text-to-speech-multilingual-v2", creditos: 12, max: 5000, etiquetas: false,
  }),
});

/** Las claves que entiende la pantalla, el asistente y el MCP. */
export const CLAVES_MODELO_VOZ = Object.freeze(Object.keys(MODELOS_VOZ));

/**
 * El modelo que de verdad se usa por esa vía: v4 sólo va directo y sólo si la cuenta lo tiene (`disponibles`: el
 * conjunto de `model_id` que dio `/v1/models`, o null si no se pudo saber: entonces se intenta y un rechazo no cobra).
 * Lo que no se puede, baja a v3. Pura.
 */
export function modeloParaVia(clave, via, disponibles = null) {
  const m = modeloDeVoz(clave) ?? MODELOS_VOZ[MODELO_VOZ_POR_DEFECTO];
  if (!m.soloDirecto) return m.clave;
  if (via !== "elevenlabs") return "v3";
  if (disponibles && !disponibles.has(m.elevenlabs)) return "v3";
  return m.clave;
}

/** Los modelos que se pueden escoger por esa vía (v4 fuera si no va directo o la cuenta no lo tiene). Pura. */
export const modelosDeLaVia = (via, disponibles = null) =>
  Object.values(MODELOS_VOZ).filter((m) => modeloParaVia(m.clave, via, disponibles) === m.clave);

/** Por dónde sale la voz: «elevenlabs» (la llave oficial) o «kie». Lo decide el SERVIDOR por sus llaves. */
export const VIAS_VOZ = Object.freeze({
  elevenlabs: Object.freeze({ nombre: "ElevenLabs (llave oficial)", unidad: "créditos de ElevenLabs" }),
  kie: Object.freeze({ nombre: "Kie.ai", unidad: "créditos de Kie.ai" }),
});

/**
 * ElevenLabs cobra 1 crédito por carácter en v4, v3 y Multilingüe v2 (salvo que `/v1/models` diga otro factor), de los que trae el plan de la cuenta. En dólares
 * depende del plan: se estima con el de Creator (unos 22 $ por 100.000 créditos) y se rotula «aproximado».
 */
export const USD_POR_CARACTER_ELEVENLABS = 0.00022;
/** El modelo de partida: v4 (si la vía o la cuenta no lo tienen, `modeloParaVia` lo baja a v3). */
export const MODELO_VOZ_POR_DEFECTO = "v4";

/**
 * El modelo de voz como lo ve la cola del Estudio (worker/lib/estudio/trabajos.js): motor Kie, tipo «audio», por la
 * cola. `costo` no es el precio (depende del texto: va en el trabajo, `costo_estimado`); sólo dice que gasta. Pura.
 */
export function modeloDelEstudio(id) {
  const m = id ? Object.values(MODELOS_VOZ).find((x) => x.id === id || x.idDirecto === id) : null;
  if (!m) return null;
  const directo = m.idDirecto === id;
  return {
    id, clave: m.clave, nombre: m.nombre, motor: directo ? "elevenlabs" : "kie", tipo: "audio", cola: true, costo: 0.001, estimado: true,
    ...(directo ? { elevenlabs: m.elevenlabs } : {}),
  };
}

/** El id del trabajo para ese modelo y esa vía. Pura. */
export const idDeModeloVoz = (clave, via) => (via === "elevenlabs" ? MODELOS_VOZ[clave]?.idDirecto : MODELOS_VOZ[clave]?.id);

/** El modelo de voz por su clave («v3», «v2») o por su id del Estudio (de cualquiera de las dos vías). */
export const modeloDeVoz = (valor) =>
  (valor ? MODELOS_VOZ[valor] ?? Object.values(MODELOS_VOZ).find((m) => m.id === valor || m.idDirecto === valor) : null) ?? null;

/**
 * Las voces que ACEPTA Kie, con su id de ElevenLabs. Kie no deja escoger cualquier voz de ElevenLabs: sólo las de su
 * lista (el formulario de su panel), y con otra contesta «Invalid voice parameter» (pasó con Matilda, que es de serie en
 * ElevenLabs y no está en la de Kie). Los mismos ids valen para v3 y v2. Kie tiene 66; aquí van las que se han
 * comprobado en su formulario. Una que falte se añade aquí con su id tal cual lo da Kie.
 */
export const VOCES_KIE = Object.freeze([
  { id: "Z3R5wn05IrDiVCyEkUrK", nombre: "Arabella", genero: "femenina", nota: "" },
  { id: "hpp4J3VqNfWAUOO0d1Us", nombre: "Bella", genero: "femenina", nota: "" },
  { id: "iCrDUkL56s3C8sCRl7wb", nombre: "Esperanza", genero: "femenina", nota: "" },
  { id: "LruHrtVF6PSyGItzMNHS", nombre: "Benjamín", genero: "masculina", nota: "" },
  { id: "NNl6r8mD7vthiJatiJt1", nombre: "Bradford", genero: "masculina", nota: "" },
  { id: "qXpMhyvQqiRxWQs4qSSB", nombre: "Horacio", genero: "masculina", nota: "" },
  { id: "EkK5I93UQWFDigLMpZcX", nombre: "James", genero: "masculina", nota: "" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", nombre: "Liam", genero: "masculina", nota: "" },
]);
/** El nombre de antes (lo importan pantallas y pruebas): las de Kie. */
export const VOCES_DE_SERIE = VOCES_KIE;

/**
 * Las voces de serie («premade») de ElevenLabs, que tiene toda cuenta: el respaldo del camino DIRECTO cuando la llave no
 * deja leer la lista de la cuenta (`/v1/voices` pide el permiso de leer voces). Multilingües: hablan español con su acento.
 */
export const VOCES_ELEVENLABS = Object.freeze([
  { id: "EXAVITQu4vr4xnSDxMaL", nombre: "Sarah", genero: "femenina", nota: "joven, suave y segura" },
  { id: "FGY2WhTYpPnrIDTdsKH5", nombre: "Laura", genero: "femenina", nota: "joven, con energía" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", nombre: "Alice", genero: "femenina", nota: "clara, didáctica" },
  { id: "XrExE9yKIg1WjnnlVkGX", nombre: "Matilda", genero: "femenina", nota: "cálida, cercana" },
  { id: "cgSgspJ2msm6clMCkdW9", nombre: "Jessica", genero: "femenina", nota: "joven, expresiva" },
  { id: "pFZP5JQG7iQjIQuC4Bku", nombre: "Lily", genero: "femenina", nota: "cálida, pausada" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", nombre: "Roger", genero: "masculina", nota: "seguro, cercano" },
  { id: "IKne3meq5aSn9XLyUdCD", nombre: "Charlie", genero: "masculina", nota: "joven, conversacional" },
  { id: "JBFqnCBsd6RMkjVDRZzb", nombre: "George", genero: "masculina", nota: "cálido, narrador" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", nombre: "Liam", genero: "masculina", nota: "joven, articulado" },
  { id: "cjVigY5qzO86Huf0OWal", nombre: "Eric", genero: "masculina", nota: "suave, confiable" },
  { id: "nPczCjzI2devNBz1zQrb", nombre: "Brian", genero: "masculina", nota: "grave, narrador" },
]);

const GENERO_ELEVENLABS = { female: "femenina", male: "masculina", neutral: "neutra" };

// ------------------------------------------------------------
// Las voces en ESPAÑOL: lo que dice ElevenLabs de cada voz, traducido
// ------------------------------------------------------------
//
// ElevenLabs describe sus voces en inglés («Roger - Laid-Back, Casual, Resonant», acento «american», uso
// «social media»). La agencia trabaja en español: se traduce con un diccionario (frases antes que palabras) y lo que no
// está en él se QUITA, salvo en una voz nativa en español, cuya descripción ya suele venir en español. Así la pantalla
// nunca enseña una mezcla de idiomas.

/** Frases y palabras de las etiquetas y descripciones de ElevenLabs → español. Las frases van primero. */
const TRADUCCION = Object.freeze({
  // usos
  "social media creator": "creador de redes", "social media": "redes sociales", "entertainment tv": "televisión",
  "narrative story": "narración", "narrative & story": "narración", "characters animation": "personajes y animación",
  "characters & animation": "personajes y animación", "informative educational": "educativa", "informative & educational": "educativa",
  "news": "noticias", "advertisement": "publicidad", "conversational": "conversacional", "audiobook": "audiolibro",
  "meditation": "meditación", "video games": "videojuegos", "asmr": "ASMR",
  // frases de los nombres
  "engaging educator": "educadora cercana", "captivating storyteller": "narrador cautivador", "steady broadcaster": "locutor estable",
  "velvety actress": "actriz aterciopelada", "fierce warrior": "guerrero feroz", "husky trickster": "pícaro de voz ronca",
  "relaxed optimist": "optimista relajado", "quirky attitude": "actitud peculiar", "down-to-earth": "sencillo",
  "laid-back": "relajada", "well-rounded": "equilibrada", "middle aged": "de mediana edad", "middle-aged": "de mediana edad",
  // acentos
  "latin american": "latinoamericano", "latin-american": "latinoamericano", "latino": "latino", "mexican": "mexicano",
  "colombian": "colombiano", "argentine": "argentino", "argentinian": "argentino", "venezuelan": "venezolano",
  "chilean": "chileno", "peruvian": "peruano", "panamanian": "panameño", "caribbean": "caribeño", "cuban": "cubano",
  "puerto rican": "puertorriqueño", "dominican": "dominicano", "castilian": "español de España", "peninsular": "español de España",
  "spanish": "español", "american": "estadounidense", "british": "británico", "australian": "australiano", "irish": "irlandés",
  "canadian": "canadiense", "indian": "indio", "african": "africano", "standard": "neutro", "neutral": "neutra",
  // tonos
  "professional": "profesional", "confident": "segura", "warm": "cálida", "calm": "tranquila", "casual": "casual",
  "classy": "elegante", "sassy": "atrevida", "hyped": "muy animada", "mature": "madura", "rough": "áspera", "chill": "relajada",
  "cute": "tierna", "formal": "formal", "upbeat": "animada", "crisp": "nítida", "resonant": "resonante", "reassuring": "tranquilizadora",
  "enthusiast": "entusiasta", "enthusiastic": "entusiasta", "deep": "grave", "energetic": "enérgica", "relaxed": "relajada",
  "informative": "informativa", "clear": "clara", "knowledgable": "experta", "knowledgeable": "experta", "playful": "juguetona",
  "bright": "luminosa", "smooth": "suave", "trustworthy": "confiable", "charming": "encantadora", "comforting": "reconfortante",
  "dominant": "dominante", "firm": "firme", "wise": "sabia", "balanced": "equilibrada", "soft": "suave", "gentle": "delicada",
  "friendly": "amigable", "young": "joven", "old": "mayor", "raspy": "rasposa", "husky": "ronca", "strong": "fuerte",
  "expressive": "expresiva", "natural": "natural", "pleasant": "agradable", "serious": "seria", "authoritative": "con autoridad",
  "articulate": "articulada", "excited": "emocionada", "seductive": "seductora", "whispery": "susurrante", "breathy": "aireada",
  "storyteller": "narradora", "narrator": "narradora", "educator": "educadora", "broadcaster": "locutora", "actress": "actriz",
  "creator": "creadora", "sweet": "dulce", "cheerful": "alegre", "happy": "alegre", "emotive": "emotiva", "dramatic": "dramática",
  "intense": "intensa", "low": "grave", "high": "aguda", "fast": "rápida", "slow": "pausada", "kind": "amable", "loud": "potente",
  "modulated": "modulada", "engaging": "cercana", "captivating": "cautivadora", "steady": "estable",
});

/** Las palabras que, solas, delatan un texto en inglés (si quedan sin traducir, el trozo se quita). */
const PALABRAS_ESPANOL = /[áéíóúñ¿¡]|\b(de|del|la|el|y|con|para|voz|joven|mujer|hombre|cálid|suave|clara|narrador|locutor|neutr|latin)/i;

/** Un trozo de descripción en español: por el diccionario; si no, null (o él mismo si se fía de su idioma). */
function traducirTrozo(trozo, { fiarse = false } = {}) {
  const t = String(trozo ?? "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const k = t.toLowerCase();
  if (TRADUCCION[k]) return TRADUCCION[k];
  // «Deep, Resonant and Comforting» → por palabras; todas tienen que estar en el diccionario.
  const palabras = k.split(/\s+(?:and|&|y)\s+|\s+/).filter((p) => p && !["a", "an", "the", "voice", "with"].includes(p));
  if (palabras.length && palabras.every((p) => TRADUCCION[p])) return palabras.map((p) => TRADUCCION[p]).join(" y ");
  return fiarse || PALABRAS_ESPANOL.test(t) ? t : null;
}

/** Una lista de trozos traducidos, sin repetir, separados por comas. Pura. */
function descripcionEnEspanol(trozos, opciones) {
  const vistos = new Set();
  return trozos.flatMap((x) => String(x ?? "").split(/\s*[,;/·]\s*/)).map((x) => traducirTrozo(x, opciones))
    .filter((x) => x && !vistos.has(x.toLowerCase()) && vistos.add(x.toLowerCase())).join(", ");
}

/** El nombre de una voz sin el lema en inglés de ElevenLabs («Roger - Laid-Back, Casual» → «Roger» y el lema aparte). */
export function partirNombreDeVoz(nombre) {
  const n = String(nombre ?? "").replace(/\s+/g, " ").trim();
  const m = n.match(/^(.+?)\s+[-–—|]\s+(.+)$/);
  return m ? { nombre: m[1].trim(), lema: m[2].trim() } : { nombre: n, lema: "" };
}

/** Si el idioma que dice ElevenLabs es español («es», «es-419», «spanish»). */
export const esIdiomaEspanol = (x) => /^(es)([-_].*)?$|^spanish$|^español$/i.test(String(x ?? "").trim());

/** El acento en español: «latinoamericano», «mexicano», «español de España»… o "" si no se sabe. Pura. */
export const acentoEnEspanol = (x) => traducirTrozo(x, { fiarse: false }) ?? "";

/**
 * ¿Es una voz NATIVA en español? Lo dice su etiqueta de idioma; sin etiqueta, que su único idioma verificado sea el
 * español (las de serie traen varios verificados y su etiqueta dice «en»). Pura.
 */
function nativaEnEspanol(v, l) {
  if (l.language) return esIdiomaEspanol(l.language);
  if (v?.language) return esIdiomaEspanol(v.language);
  const ver = Array.isArray(v?.verified_languages) ? v.verified_languages.map((x) => x?.language).filter(Boolean) : [];
  return ver.length > 0 && ver.every(esIdiomaEspanol);
}

/** La dirección de la muestra GRATIS que da ElevenLabs de una voz (sólo https de sus almacenes). Pura. */
export function previaDeVoz(url) {
  try {
    const u = new URL(String(url ?? ""));
    if (u.protocol !== "https:") return "";
    return HOSTS_PREVIA.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)) ? u.href.slice(0, 600) : "";
  } catch {
    return "";
  }
}
/** Dónde guarda ElevenLabs las muestras de sus voces (las de serie y las de la biblioteca). */
export const HOSTS_PREVIA = Object.freeze(["storage.googleapis.com", "elevenlabs.io"]);

/**
 * Una voz (de la cuenta, `/v1/voices`, o de la biblioteca, `/v1/shared-voices`) como la ve la pantalla, TODO en español:
 * id, nombre (sin el lema en inglés), género, una nota con su acento, su tono y para qué sirve, si es nativa en
 * español y la dirección de su muestra gratis. Null si no trae id válido. Pura.
 */
export function vozDeLaCuenta(v) {
  const id = String(v?.voice_id ?? "").trim();
  if (!ID_VOZ.test(id)) return null;
  const l = v?.labels && typeof v.labels === "object" ? v.labels : {};
  const espanol = nativaEnEspanol(v, l);
  const { nombre, lema } = partirNombreDeVoz(v?.name);
  const acento = acentoEnEspanol(l.accent ?? v?.accent);
  const nota = descripcionEnEspanol([
    lema, l.descriptive ?? l.description ?? v?.descriptive, l.use_case ?? l["use case"] ?? v?.use_case, l.age ?? v?.age,
    ...(espanol && typeof v?.description === "string" ? [v.description.slice(0, 120)] : []),
  ], { fiarse: espanol });
  const previa = previaDeVoz(v?.preview_url);
  return {
    id, nombre: nombre.slice(0, 40) || id,
    genero: GENERO_ELEVENLABS[String(l.gender ?? v?.gender ?? "").toLowerCase()] ?? "neutra",
    nota: [acento && `acento ${acento}`, nota].filter(Boolean).join(", ").slice(0, 100),
    espanol, ...(acento ? { acento } : {}), ...(previa ? { previa } : {}),
    ...(v?.category ? { categoria: String(v.category).slice(0, 20) } : {}),
  };
}

/**
 * Una voz de la BIBLIOTECA de ElevenLabs (`/v1/shared-voices`), lista para «Añadir a mis voces»: lo de `vozDeLaCuenta`
 * más quién la publicó (`publico`, hace falta para añadirla) y cuánta gente la usa. Null si le falta algo. Pura.
 */
export function vozDeLaBiblioteca(v) {
  const base = vozDeLaCuenta(v);
  const publico = String(v?.public_owner_id ?? "").trim();
  if (!base || !/^[A-Za-z0-9]{8,80}$/.test(publico)) return null;
  const usos = Number(v?.cloned_by_count ?? v?.usage_character_count_1y ?? 0);
  return { ...base, publico, ...(Number.isFinite(usos) && usos > 0 ? { usos } : {}) };
}

/** Las voces en español primero (luego las demás), sin cambiar el orden dentro de cada grupo. Pura. */
export const enEspanolPrimero = (voces) => [...voces.filter((v) => v.espanol), ...voces.filter((v) => !v.espanol)];

/** Un id de voz de ElevenLabs: letras y números, sin espacios. */
const ID_VOZ = /^[A-Za-z0-9]{12,40}$/;
export const esIdDeVoz = (id) => ID_VOZ.test(String(id ?? ""));
export const MAX_VOCES_PROPIAS = 12;
const GENEROS = ["femenina", "masculina", "neutra"];

/** Una voz propia que añade la agencia (de la biblioteca de ElevenLabs, escogida en el panel de Kie). Null si no vale. */
export function limpiarVozPropia(v) {
  const id = String(v?.id ?? "").trim();
  if (!ID_VOZ.test(id)) return null;
  const nombre = String(v?.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || id;
  return {
    id, nombre, genero: GENEROS.includes(v?.genero) ? v.genero : "neutra",
    nota: String(v?.nota ?? "").replace(/\s+/g, " ").trim().slice(0, 80), propia: true, espanol: v?.espanol === true,
  };
}

/** La locución del kit: la voz escogida, el modelo y las voces propias. Pura. */
export function limpiarLocucion(l) {
  const vistas = new Set();
  const voces = (Array.isArray(l?.voces) ? l.voces : []).map(limpiarVozPropia)
    .filter((v) => v && !vistas.has(v.id) && vistas.add(v.id)).slice(0, MAX_VOCES_PROPIAS);
  const voz = ID_VOZ.test(String(l?.voz ?? "")) ? String(l.voz) : "";
  return { voz, modelo: MODELOS_VOZ[l?.modelo] ? l.modelo : MODELO_VOZ_POR_DEFECTO, voces };
}

/**
 * Las voces que se pueden escoger para un cliente: las suyas primero, luego las de la vía (`base`: las de Kie por
 * defecto; con la llave oficial, las de la cuenta de ElevenLabs). Pura.
 */
export function vocesDisponibles(locucion, base = VOCES_KIE) {
  const propias = limpiarLocucion(locucion).voces;
  const ids = new Set(propias.map((v) => v.id));
  return [...propias, ...base.filter((v) => !ids.has(v.id)).map((v) => ({ ...v, propia: false }))];
}

/** Una voz por su id, entre las disponibles del cliente. Null si no está (no se manda un id cualquiera). */
export const vozPorId = (locucion, id, base = VOCES_KIE) => vocesDisponibles(locucion, base).find((v) => v.id === id) ?? null;

// ------------------------------------------------------------
// Texto y costo
// ------------------------------------------------------------

/** El texto que se manda a la voz: con sus etiquetas de emoción en v3, sin ellas en v2. Pura. */
export function textoParaVoz(guion, modelo = MODELO_VOZ_POR_DEFECTO) {
  const m = modeloDeVoz(modelo);
  const texto = textoDeLocucion(guion);
  return (m?.etiquetas ? texto : sinEtiquetas(texto)).replace(/\s+/g, " ").trim();
}

/**
 * Lo que cuesta una toma de `caracteres` con ese modelo y por esa vía: { creditos, usd, unidad } (usd redondeado hacia
 * arriba al milésimo). Por Kie, sus créditos por cada 1.000 caracteres; directo, un crédito de ElevenLabs por carácter
 * por el `factor` del modelo en la cuenta (`/v1/models` lo dice: `character_cost_multiplier`; 1 si no se sabe).
 */
export function costoDeVoz(modelo, caracteres, via = "kie", factor = 1) {
  const m = modeloDeVoz(modelo);
  const unidad = VIAS_VOZ[via]?.unidad ?? VIAS_VOZ.kie.unidad;
  if (!m) return { creditos: 0, usd: 0, unidad };
  const n = Math.max(0, caracteres);
  if (via === "elevenlabs") {
    const f = Number.isFinite(Number(factor)) && Number(factor) > 0 ? Number(factor) : 1;
    const creditos = Math.ceil(n * f);
    return { creditos, usd: Math.ceil(creditos * USD_POR_CARACTER_ELEVENLABS * 1000) / 1000, unidad };
  }
  const porMil = m.creditos ?? MODELOS_VOZ.v3.creditos;
  const creditos = Math.round(((n / 1000) * porMil) * 1000) / 1000;
  return { creditos, usd: Math.ceil(creditos * USD_POR_CREDITO * 1000) / 1000, unidad };
}

/** La frase de la muestra de una voz: corta (unos 120 caracteres) y con una emoción, para oírla en v3. */
export const FRASE_MUESTRA_VOZ = "[cálida] Hola, así suena la voz de tu marca: clara, cercana y lista para contar lo que vendes en tu próximo video.";

/** El texto de la muestra para un modelo (v2 no lleva la etiqueta). Pura. */
export const fraseDeMuestra = (modelo) => (modeloDeVoz(modelo)?.etiquetas ? FRASE_MUESTRA_VOZ : sinEtiquetas(FRASE_MUESTRA_VOZ));

/** Lo más largo que puede ser el texto PROPIO de una muestra (un anuncio corto): más es ya una locución. */
export const MAX_TEXTO_MUESTRA = 500;

/**
 * El texto de una muestra: el propio si se escribió uno (para oír cómo suena un anuncio de verdad con esa voz) o la
 * frase fija. En v2 sin las etiquetas de emoción, como la locución. → { texto, propio } o { error }. Pura.
 */
export function textoDeMuestra(modelo, propio = "") {
  const m = modeloDeVoz(modelo);
  const limpio = String(propio ?? "").replace(/\s+/g, " ").trim();
  if (!limpio) return { texto: fraseDeMuestra(modelo), propio: false };
  if (limpio.length > MAX_TEXTO_MUESTRA) return { error: `El texto de la muestra tiene ${limpio.length} caracteres y admite ${MAX_TEXTO_MUESTRA}: para algo más largo, la locución de un video.` };
  const texto = (m?.etiquetas ? limpio : sinEtiquetas(limpio)).replace(/\s+/g, " ").trim();
  return texto ? { texto, propio: true } : { error: "El texto de la muestra no dice nada sin las etiquetas de emoción." };
}

/**
 * Lo que la toma trajo de tiempos, dicho para la nota del trabajo (la muestra y la locución): si Kie devolvió el
 * momento de cada palabra y qué campos llegaron con el audio, que es lo que hay que mirar si la forma no es la
 * esperada. → { delMotor, palabras, campos, frase }. Pura.
 */
export function tiemposQueLlegaron(resultado, quien = "Kie") {
  const dichas = palabrasDelResultado(resultado);
  let r = resultado?.resultJson ?? resultado?.result ?? resultado;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch { r = null; } }
  const campos = r && typeof r === "object" ? Object.keys(r).slice(0, 12) : [];
  const delMotor = Boolean(dichas?.length);
  return {
    delMotor, palabras: dichas?.length ?? 0, campos,
    frase: delMotor
      ? `${quien} devolvió el tiempo de cada palabra (${dichas.length} palabras).`
      : `${quien} NO devolvió tiempos por palabra${campos.length ? ` (llegó: ${campos.join(", ")})` : ""}.`,
  };
}

/** Por qué no se puede hacer esa toma (texto vacío o largo de más). Null si se puede. Pura. */
export function problemaDelTexto(texto, modelo) {
  const m = modeloDeVoz(modelo);
  if (!m) return "Ese modelo de voz no existe.";
  if (!String(texto ?? "").trim()) return "El guion no tiene nada que decir: escribe el «habla» de las escenas.";
  if (texto.length > m.max) return `La locución tiene ${texto.length} caracteres y ${m.nombre} admite ${m.max}.`;
  return null;
}

// ------------------------------------------------------------
// Los tiempos de cada palabra
// ------------------------------------------------------------

/** Una palabra comparable: sin tildes, sin signos, en minúsculas. */
export const normalizarPalabra = (p) => String(p ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]/g, "");

const numero = (...vals) => { for (const v of vals) { const n = Number(v); if (Number.isFinite(n)) return n; } return NaN; };

/** Agrupa una alineación POR CARÁCTER (la de ElevenLabs) en palabras con su tiempo. */
function palabrasDeCaracteres(a) {
  const chars = a?.characters ?? a?.chars;
  const ini = a?.character_start_times_seconds ?? a?.characterStartTimesSeconds ?? a?.start_times;
  const fin = a?.character_end_times_seconds ?? a?.characterEndTimesSeconds ?? a?.end_times;
  if (!Array.isArray(chars) || !Array.isArray(ini) || !Array.isArray(fin) || chars.length !== ini.length) return null;
  const salida = [];
  let actual = null;
  chars.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (actual) { salida.push(actual); actual = null; } return; }
    if (!actual) actual = { texto: "", desde: Number(ini[i]), hasta: Number(fin[i]) };
    actual.texto += ch;
    actual.hasta = Number(fin[i]);
  });
  if (actual) salida.push(actual);
  return salida.length ? salida : null;
}

/** Una lista de palabras con tiempo en cualquiera de sus formas ({ text|word|t, start|desde|d, end|hasta|h }). */
function palabrasDeLista(lista) {
  if (!Array.isArray(lista) || !lista.length) return null;
  const salida = lista.map((w) => ({
    texto: String(w?.text ?? w?.word ?? w?.texto ?? w?.t ?? ""),
    desde: numero(w?.start, w?.start_time, w?.start_s, w?.desde, w?.d),
    hasta: numero(w?.end, w?.end_time, w?.end_s, w?.hasta, w?.h),
  })).filter((w) => w.texto.trim() && Number.isFinite(w.desde) && Number.isFinite(w.hasta) && w.hasta >= w.desde);
  // Las que son sólo espacios o signos (las «spacing» de ElevenLabs) no cuentan.
  const reales = salida.filter((w) => normalizarPalabra(w.texto));
  return reales.length ? reales : null;
}

/**
 * Los tiempos por palabra que traiga el RESULTADO de Kie, en la forma que venga: `resultJson` (texto o objeto) con
 * `timestamps`, `words`, `alignment` o `normalized_alignment` (por carácter, la de ElevenLabs). → [{ texto, desde,
 * hasta }] o null si no trae ninguno. Pura.
 */
export function palabrasDelResultado(datos) {
  let r = datos?.resultJson ?? datos?.result ?? datos;
  if (typeof r === "string") {
    try { r = JSON.parse(r); } catch { return null; }
  }
  if (!r || typeof r !== "object") return null;
  const candidatos = [r, r.data, r.result, r.output].filter((x) => x && typeof x === "object");
  for (const c of candidatos) {
    for (const k of ["words", "timestamps", "word_timestamps", "palabras"]) {
      const l = palabrasDeLista(c[k]);
      if (l) return l;
    }
    for (const k of ["alignment", "normalized_alignment", "timestamps"]) {
      const l = c[k] && !Array.isArray(c[k]) ? palabrasDeCaracteres(c[k]) : null;
      if (l) return l;
    }
  }
  return null;
}

/**
 * Las palabras del GUION (`esperadas`, textos) con el tiempo de las que se OYERON (`dichas`, con tiempo), alineadas
 * como dos textos (distancia de edición por palabras): una palabra del guion que la voz dijo distinto o se comió toma
 * el tiempo de sus vecinas. → { palabras: [{ desde, hasta }] (una por esperada), coincidencia (0–1: cuántas del
 * guion se oyeron tal cual) }. Pura.
 */
export function alinearPalabras(esperadas, dichas) {
  const E = esperadas.map(normalizarPalabra);
  const D = (dichas ?? []).map((d) => normalizarPalabra(d.texto));
  const n = E.length; const m = D.length;
  if (!n) return { palabras: [], coincidencia: 1 };
  if (!m) return { palabras: [], coincidencia: 0 };
  // costo[i][j]: alinear las primeras i esperadas con las primeras j dichas.
  const costo = Array.from({ length: n + 1 }, (_, i) => { const f = new Array(m + 1).fill(0); f[0] = i; return f; });
  for (let j = 1; j <= m; j++) costo[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const igual = E[i - 1] === D[j - 1] ? 0 : 1;
      costo[i][j] = Math.min(costo[i - 1][j - 1] + igual, costo[i - 1][j] + 1, costo[i][j - 1] + 1);
    }
  }
  // De vuelta: qué dicha le toca a cada esperada (si le toca alguna).
  const asignada = new Array(n).fill(-1);
  let iguales = 0;
  for (let i = n, j = m; i > 0 || j > 0;) {
    if (i > 0 && j > 0 && costo[i][j] === costo[i - 1][j - 1] + (E[i - 1] === D[j - 1] ? 0 : 1)) {
      asignada[i - 1] = j - 1;
      if (E[i - 1] === D[j - 1]) iguales++;
      i--; j--;
    } else if (i > 0 && costo[i][j] === costo[i - 1][j] + 1) {
      i--;
    } else {
      j--;
    }
  }
  const t = asignada.map((k) => (k >= 0 ? { desde: dichas[k].desde, hasta: dichas[k].hasta } : null));
  rellenarHuecos(t, dichas[0].desde, dichas[m - 1].hasta);
  return { palabras: t, coincidencia: Math.round((iguales / n) * 1000) / 1000 };
}

/** Pone tiempo a las palabras sin él, repartiendo el hueco entre sus vecinas con tiempo; y que nunca vaya hacia atrás. */
function rellenarHuecos(t, inicio, fin) {
  const n = t.length;
  let i = 0;
  while (i < n) {
    if (t[i]) { i++; continue; }
    let j = i;
    while (j < n && !t[j]) j++;
    const a = i > 0 ? t[i - 1].hasta : inicio;
    const b = j < n ? t[j].desde : fin;
    const paso = Math.max(0, b - a) / (j - i);
    for (let k = i; k < j; k++) t[k] = { desde: a + paso * (k - i), hasta: a + paso * (k - i + 1) };
    i = j;
  }
  for (let k = 1; k < n; k++) {
    if (t[k].desde < t[k - 1].desde) t[k].desde = t[k - 1].desde;
    if (t[k].hasta < t[k].desde) t[k].hasta = t[k].desde;
  }
}

/** Lo que pesa una palabra al repartir el tiempo: sus letras y la pausa que pide su puntuación. */
const pesoDe = (p) => Math.max(1, normalizarPalabra(p).length) + (/[.!?…]$/.test(p) ? 4 : /[,;:]$/.test(p) ? 2 : 0);

/**
 * Los tiempos ESTIMADOS de las palabras sobre la duración REAL del audio: el reparto por su largo y su puntuación,
 * con un respiro al principio y al final. → [{ desde, hasta }]. Pura.
 */
export function palabrasEstimadas(esperadas, duracion) {
  if (!esperadas.length || !(duracion > 0)) return [];
  const margen = Math.min(0.15, duracion * 0.03);
  const util = Math.max(0.01, duracion - margen * 2);
  const pesos = esperadas.map(pesoDe);
  const total = pesos.reduce((a, b) => a + b, 0);
  let reloj = margen;
  return pesos.map((w) => {
    const dur = (w / total) * util;
    const d = { desde: redondo(reloj), hasta: redondo(reloj + dur * 0.92) };
    reloj += dur;
    return d;
  });
}

const redondo = (x) => Math.round(x * 1000) / 1000;

// ------------------------------------------------------------
// La duración de un MP3
// ------------------------------------------------------------

const BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], // MPEG-1 capa III
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // MPEG-2/2.5 capa III
};
const FRECUENCIAS = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/**
 * La duración en segundos de un MP3 por sus bytes: con la cabecera Xing/Info (VBR) si la tiene, y si no, por el
 * tamaño y la tasa del primer cuadro (CBR, lo que da ElevenLabs). 0 si no es un MP3 que se entienda. Pura.
 */
export function duracionMp3(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  let i = 0;
  // Saltar la etiqueta ID3v2 (10 bytes de cabecera + su tamaño «synchsafe»).
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    i = 10 + ((b[6] & 0x7f) << 21 | (b[7] & 0x7f) << 14 | (b[8] & 0x7f) << 7 | (b[9] & 0x7f));
  }
  for (; i + 4 < b.length; i++) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) continue;
    const version = (b[i + 1] >> 3) & 0x3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const capa = (b[i + 1] >> 1) & 0x3; // 1 = capa III
    const indiceTasa = (b[i + 2] >> 4) & 0xf;
    const indiceFrec = (b[i + 2] >> 2) & 0x3;
    if (version === 1 || capa !== 1 || indiceTasa === 0 || indiceTasa === 15 || indiceFrec === 3) continue;
    const kbps = BITRATES[version === 3 ? 1 : 2][indiceTasa];
    const hz = FRECUENCIAS[version][indiceFrec];
    const muestrasPorCuadro = version === 3 ? 1152 : 576;
    // Xing / Info: el número de cuadros, a 36 (MPEG-1 estéreo), 21 (mono) o 13/21 en MPEG-2.
    const canales = (b[i + 3] >> 6) === 3 ? 1 : 2;
    const desplazamiento = version === 3 ? (canales === 1 ? 21 : 36) : (canales === 1 ? 13 : 21);
    const x = i + desplazamiento;
    const etiqueta = String.fromCharCode(b[x], b[x + 1], b[x + 2], b[x + 3]);
    if ((etiqueta === "Xing" || etiqueta === "Info") && b[x + 7] & 0x1) {
      const cuadros = (b[x + 8] << 24 | b[x + 9] << 16 | b[x + 10] << 8 | b[x + 11]) >>> 0;
      if (cuadros > 0) return redondo((cuadros * muestrasPorCuadro) / hz);
    }
    return redondo(((b.length - i) * 8) / (kbps * 1000));
  }
  return 0;
}

/**
 * Los tiempos de la locución para `lineaDeTiempo` (del guion o del texto que se mandó), por la mejor fuente que haya:
 *   resultado — lo que devolvió Kie (con tiempos o sin ellos)
 *   oidas     — la transcripción con tiempos de la verificación posterior (Gemini), si la hubo
 *   duracion  — la duración real del audio (para estimar si no hay otra cosa)
 * → { palabras: [{ desde, hasta }] (una por palabra del guion), fuente: "motor" | "verificado" | "estimado",
 *     coincidencia: 0–1 | null }. Pura.
 */
export function tiemposDeLocucion(guion, { resultado = null, oidas = null, duracion = 0 } = {}) {
  // El guion, o el TEXTO que se mandó a la voz (el de la toma: el guion pudo cambiar después).
  const esperadas = palabrasDe(typeof guion === "string" ? guion : textoDeLocucion(guion));
  const delMotor = palabrasDelResultado(resultado);
  if (delMotor) {
    const a = alinearPalabras(esperadas, delMotor);
    return { palabras: a.palabras, fuente: "motor", coincidencia: a.coincidencia };
  }
  const oidasValidas = palabrasDeLista(oidas);
  if (oidasValidas) {
    const a = alinearPalabras(esperadas, oidasValidas);
    return { palabras: a.palabras, fuente: "verificado", coincidencia: a.coincidencia };
  }
  return { palabras: palabrasEstimadas(esperadas, duracion), fuente: "estimado", coincidencia: null };
}

/** El pedido a Gemini para la verificación posterior: transcribir con tiempos, palabra por palabra. */
export const PEDIDO_TRANSCRIPCION_TIEMPOS = [
  "Escucha este audio en español y transcríbelo PALABRA POR PALABRA, en el orden en que se dicen, con el segundo en que",
  "empieza y termina cada una (con dos decimales). No corrijas lo que se dijo ni añadas nada. Responde SOLO con JSON:",
  '{"palabras":[{"t":"palabra","d":0.00,"h":0.00}]}',
].join(" ");

/** Lee la respuesta de esa transcripción → [{ texto, desde, hasta }] o null. Pura. */
export function leerTranscripcionConTiempos(texto) {
  const crudo = String(texto ?? "");
  const ini = crudo.indexOf("{");
  const fin = crudo.lastIndexOf("}");
  if (ini < 0 || fin < ini) return null;
  try {
    return palabrasDeLista(JSON.parse(crudo.slice(ini, fin + 1))?.palabras);
  } catch {
    return null;
  }
}

/** Debajo de esta coincidencia, la locución se marca para revisar: la voz no dijo lo que dice el guion. */
export const COINCIDENCIA_MINIMA = 0.85;
