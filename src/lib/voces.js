// ============================================================
// La VOZ del video animado: modelos, voces, costo y los tiempos de cada palabra (puro)
//
// La locución es UNA toma de ElevenLabs por Kie.ai (el cliente de Kie que ya tiene el Estudio,
// worker/lib/estudio/kie.js). Dos modelos:
//
//   · v3 (`elevenlabs/text-to-dialogue-v3`): el principal. Entiende las etiquetas de emoción
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

/** Los modelos de voz. `creditos` por cada 1.000 caracteres (su página de precios, octubre de 2026). */
export const MODELOS_VOZ = Object.freeze({
  v3: Object.freeze({
    id: "elevenlabs-v3-kie", clave: "v3", nombre: "ElevenLabs v3 (expresiva)", kie: "elevenlabs/text-to-dialogue-v3",
    creditos: 14, max: 5000, etiquetas: true,
  }),
  v2: Object.freeze({
    id: "elevenlabs-v2-kie", clave: "v2", nombre: "ElevenLabs Multilingual v2 (respaldo)", kie: "elevenlabs/text-to-speech-multilingual-v2",
    creditos: 12, max: 5000, etiquetas: false,
  }),
});
export const MODELO_VOZ_POR_DEFECTO = "v3";

/**
 * El modelo de voz como lo ve la cola del Estudio (worker/lib/estudio/trabajos.js): motor Kie, tipo «audio», por la
 * cola. `costo` no es el precio (depende del texto: va en el trabajo, `costo_estimado`); sólo dice que gasta. Pura.
 */
export function modeloDelEstudio(id) {
  const m = Object.values(MODELOS_VOZ).find((x) => x.id === id);
  return m ? { id: m.id, nombre: m.nombre, motor: "kie", tipo: "audio", cola: true, costo: 0.001, estimado: true } : null;
}

/** El modelo de voz por su clave («v3», «v2») o por su id del Estudio. */
export const modeloDeVoz = (valor) => MODELOS_VOZ[valor] ?? Object.values(MODELOS_VOZ).find((m) => m.id === valor) ?? null;

/**
 * Las voces DE SERIE de ElevenLabs (las que tiene toda cuenta), con su id. Son multilingües: hablan español, pero su
 * acento de origen se puede notar. Las nativas en español de su biblioteca no tienen un id fijo que se conozca de
 * antemano: la agencia las escoge en el panel de Kie y las añade como voces propias (`kit.locucion.voces`).
 */
export const VOCES_DE_SERIE = Object.freeze([
  { id: "EXAVITQu4vr4xnSDxMaL", nombre: "Sarah", genero: "femenina", nota: "joven, suave y segura" },
  { id: "FGY2WhTYpPnrIDTdsKH5", nombre: "Laura", genero: "femenina", nota: "joven, con energía" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", nombre: "Alice", genero: "femenina", nota: "clara, didáctica" },
  { id: "XrExE9yKIg1WjnnlVkGX", nombre: "Matilda", genero: "femenina", nota: "cálida, cercana" },
  { id: "cgSgspJ2msm6clMCkdW9", nombre: "Jessica", genero: "femenina", nota: "joven, expresiva" },
  { id: "pFZP5JQG7iQjIQuC4Bku", nombre: "Lily", genero: "femenina", nota: "cálida, pausada" },
  { id: "9BWtsMINqrJLrRacOk9x", nombre: "Aria", genero: "femenina", nota: "madura, expresiva" },
  { id: "XB0fDUnXU5powFXDhCwa", nombre: "Charlotte", genero: "femenina", nota: "natural, conversacional" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", nombre: "Roger", genero: "masculina", nota: "seguro, cercano" },
  { id: "IKne3meq5aSn9XLyUdCD", nombre: "Charlie", genero: "masculina", nota: "joven, conversacional" },
  { id: "JBFqnCBsd6RMkjVDRZzb", nombre: "George", genero: "masculina", nota: "cálido, narrador" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", nombre: "Liam", genero: "masculina", nota: "joven, articulado" },
  { id: "bIHbv24MWmeRgasZH58o", nombre: "Will", genero: "masculina", nota: "amable, relajado" },
  { id: "cjVigY5qzO86Huf0OWal", nombre: "Eric", genero: "masculina", nota: "suave, confiable" },
  { id: "iP95p4xoKVk53GoZ742B", nombre: "Chris", genero: "masculina", nota: "natural, casual" },
  { id: "nPczCjzI2devNBz1zQrb", nombre: "Brian", genero: "masculina", nota: "grave, narrador" },
]);

/** Un id de voz de ElevenLabs: letras y números, sin espacios. */
const ID_VOZ = /^[A-Za-z0-9]{12,40}$/;
export const MAX_VOCES_PROPIAS = 12;
const GENEROS = ["femenina", "masculina", "neutra"];

/** Una voz propia que añade la agencia (de la biblioteca de ElevenLabs, escogida en el panel de Kie). Null si no vale. */
export function limpiarVozPropia(v) {
  const id = String(v?.id ?? "").trim();
  if (!ID_VOZ.test(id)) return null;
  const nombre = String(v?.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || id;
  return {
    id, nombre, genero: GENEROS.includes(v?.genero) ? v.genero : "neutra",
    nota: String(v?.nota ?? "").replace(/\s+/g, " ").trim().slice(0, 80), propia: true,
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

/** Las voces que se pueden escoger para un cliente: las suyas primero, luego las de serie. Pura. */
export function vocesDisponibles(locucion) {
  const propias = limpiarLocucion(locucion).voces;
  const ids = new Set(propias.map((v) => v.id));
  return [...propias, ...VOCES_DE_SERIE.filter((v) => !ids.has(v.id)).map((v) => ({ ...v, propia: false }))];
}

/** Una voz por su id, entre las disponibles del cliente. Null si no está (no se manda un id cualquiera). */
export const vozPorId = (locucion, id) => vocesDisponibles(locucion).find((v) => v.id === id) ?? null;

// ------------------------------------------------------------
// Texto y costo
// ------------------------------------------------------------

/** El texto que se manda a la voz: con sus etiquetas de emoción en v3, sin ellas en v2. Pura. */
export function textoParaVoz(guion, modelo = MODELO_VOZ_POR_DEFECTO) {
  const m = modeloDeVoz(modelo);
  const texto = textoDeLocucion(guion);
  return (m?.etiquetas ? texto : sinEtiquetas(texto)).replace(/\s+/g, " ").trim();
}

/** Lo que cuesta una toma de `caracteres` con ese modelo: { creditos, usd } (usd redondeado hacia arriba al milésimo). */
export function costoDeVoz(modelo, caracteres) {
  const m = modeloDeVoz(modelo);
  if (!m) return { creditos: 0, usd: 0 };
  const creditos = Math.round(((Math.max(0, caracteres) / 1000) * m.creditos) * 1000) / 1000;
  return { creditos, usd: Math.ceil(creditos * USD_POR_CREDITO * 1000) / 1000 };
}

/** La frase de la muestra de una voz: corta (unos 120 caracteres) y con una emoción, para oírla en v3. */
export const FRASE_MUESTRA_VOZ = "[cálida] Hola, así suena la voz de tu marca: clara, cercana y lista para contar lo que vendes en tu próximo video.";

/** El texto de la muestra para un modelo (v2 no lleva la etiqueta). Pura. */
export const fraseDeMuestra = (modelo) => (modeloDeVoz(modelo)?.etiquetas ? FRASE_MUESTRA_VOZ : sinEtiquetas(FRASE_MUESTRA_VOZ));

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
