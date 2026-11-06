// ============================================================
// «Video con tu canción»: el video animado sobre una CANCIÓN YA GRABADA (puro: lo leen el Worker, el Container y la
// pantalla)
//
// La agencia sube el MP3 terminado de una canción (voz e instrumental mezclados; el FRAGMENTO del reel ya recortado,
// hasta 3 minutos) y pega su letra. No se genera voz: la canción ES la locución. Lo que vive aquí:
//
//   · la LETRA: limpiarla (las marcas de sección fuera), partirla en líneas, cuántas palabras;
//   · leer la SINCRONÍA que devuelve ElevenLabs (Forced Alignment) o Gemini, con tolerancia, y alinearla a la letra
//     (`medirAlineacion`): la letra con sus tiempos (`oidas`, una por palabra de la letra) y qué tan fiable salió;
//   · la LOCUCIÓN de un video con canción (`videos_proyectos.locucion` con `origen: "cancion"`): sus palabras se sacan
//     GRATIS del guion de ahora contra `oidas` (`palabrasDeLaCancion`), con el ajuste fino (`desplazamiento`, ±1,5 s)
//     aplicado al leer; la canción sigue valiendo mientras lo que dice el guion coincida con la letra
//     (`cancionSigueValiendo`, ≥ `COINCIDENCIA_MINIMA`);
//   · la PRUEBA DE SINCRONÍA (`guionKaraoke`): un guion gratis, una escena por línea con la línea de titular, escenas sin
//     letra en los huecos instrumentales y el logo al cierre; valida y se renderiza tal cual;
//   · comprobar que la `habla` de un guion es la letra TAL CUAL (`comprobarLetra`), para lo que diseña la IA;
//   · lo que dura el audio por sus bytes (MP3, WAV, M4A) y lo que cuesta sincronizar (aproximado: la tarifa de
//     ElevenLabs para alinear y aislar la voz NO está verificada desde aquí).
// ============================================================

import {
  palabrasDe, textoDeLocucion, validarGuion, MAX_SEGUNDOS_CANCION, MAX_ESCENAS_CANCION, MAX_HABLA, MIN_ESCENA, FORMATOS_VIDEO,
} from "./videoEscenas.js";
import { alinearPalabras, normalizarPalabra, COINCIDENCIA_MINIMA, palabrasEstimadas, duracionMp3 } from "./voces.js";

export { MAX_SEGUNDOS_CANCION, COINCIDENCIA_MINIMA };

/** Lo más que se acepta de letra (una canción de 3 minutos son unos 1.500 caracteres). */
export const MAX_LETRA = 6000;
/** Lo que se puede mover la letra entera si va adelantada o atrasada (s). */
export const DESPLAZAMIENTO_MAX = 1.5;
/** Lo que pesa como mucho la canción (lo de la música de la biblioteca de sonido). */
export const MAX_BYTES_CANCION = 15 * 1024 * 1024;
/** Un hueco sin letra de más de esto lleva su escena en la prueba de sincronía (intro, puente, final). */
export const HUECO_INSTRUMENTAL = 2;
/** Lo más que mide una línea en pantalla: una más larga se parte en frases. */
const LARGO_LINEA = 70;

/** De dónde salieron los tiempos de la letra, dicho para la persona. */
export const FUENTES_CANCION = Object.freeze({
  elevenlabs: "ElevenLabs (alineación de la letra)",
  "elevenlabs-aislada": "ElevenLabs con la voz aislada",
  gemini: "Gemini al oírla",
  estimado: "estimados (sin oírla)",
});

// La tarifa de ElevenLabs para estas dos cosas NO está verificada desde aquí: son aproximadas y se rotulan así. Si la
// respuesta trae los créditos, se apuntan los de verdad.
/** Alinear la letra (Forced Alignment), por minuto de audio. */
export const USD_ALINEAR_POR_MINUTO = 0.02;
/** Aislar la voz (Voice Isolator: unos 1.000 créditos por minuto). */
export const USD_AISLAR_POR_MINUTO = 0.22;
/** Que Gemini la oiga (unos miles de tokens de audio). */
export const USD_OIR_CANCION = 0.01;

const r3 = (n) => Math.round(n * 1000) / 1000;
const arriba = (n) => Math.ceil(n * 1000) / 1000;
const esObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const numero = (...vals) => { for (const v of vals) { const n = Number(v); if (v !== null && v !== undefined && v !== "" && Number.isFinite(n)) return n; } return NaN; };

/**
 * Lo que cuesta sincronizar una canción de `segundos`. Con la llave de ElevenLabs: lo de una alineación (`minimo`) y lo
 * más que puede costar (`maximo`: alinear, aislar la voz y alinear otra vez). Sin ella, lo de Gemini. Aproximado.
 */
export function costoDeSincronia(segundos, { elevenlabs = true } = {}) {
  const minutos = Math.max(1 / 60, Number(segundos) / 60 || 0);
  if (!elevenlabs) return { minimo: USD_OIR_CANCION, maximo: USD_OIR_CANCION, alinear: 0, aislar: 0, aprox: true };
  const alinear = arriba(minutos * USD_ALINEAR_POR_MINUTO);
  const aislar = arriba(minutos * USD_AISLAR_POR_MINUTO);
  return { minimo: alinear, maximo: arriba(alinear * 2 + aislar + USD_OIR_CANCION), alinear, aislar, aprox: true };
}

// ------------------------------------------------------------
// La letra
// ------------------------------------------------------------

/**
 * Una línea que sólo dice la sección: entre corchetes o paréntesis («[Coro]», «(Puente)»), con dos puntos («Verso 2:»)
 * o una que no puede ser letra («Coro», «Estribillo 2»). «Final» o «Intro» a secas sí pueden cantarse: se quedan.
 */
const NOMBRE_SECCION = "(coro|estribillo|verso|estrofa|puente|intro|introducci[oó]n|outro|final|pre-?coro|chorus|verse|bridge|hook|pre-?chorus)";
const SECCION = new RegExp(`^\\s*[[(]\\s*${NOMBRE_SECCION}\\b[^\\])]{0,20}[\\])]\\s*:?\\s*$|^\\s*${NOMBRE_SECCION}\\b[^:]{0,12}:\\s*$|^\\s*(coro|estribillo|verso|estrofa|pre-?coro|chorus|verse|pre-?chorus)(\\s*\\d+)?\\s*$`, "i");
/** «(x2)», «x3»: la repetición se canta, así que se tiene que escribir. */
const REPETIR = /\(?\s*[x×]\s*\d+\s*\)?\s*$/i;

/** Las líneas que se CANTAN de una letra, en orden (sin las de sección ni las vacías). Pura. */
export function lineasDeLetra(letra) {
  return String(letra ?? "").replace(/\r/g, "").split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !SECCION.test(l) && palabrasDe(l).length);
}

/**
 * La letra pegada, limpia: { letra (las líneas cantadas, una por renglón), lineas, palabras (cuántas), avisos } o
 * { error }. Una repetición escrita como «(x2)» se quita y se avisa: la canción la canta, y la letra tiene que decirla.
 */
export function limpiarLetra(texto) {
  const crudo = String(texto ?? "").replace(/\r/g, "").trim();
  if (!crudo) return { error: "Pega la letra de la canción (lo que se canta en el fragmento, tal cual)." };
  if (crudo.length > MAX_LETRA) return { error: `La letra tiene ${crudo.length} caracteres y se admiten ${MAX_LETRA}: pega sólo la del fragmento del reel.` };
  const avisos = [];
  const lineas = lineasDeLetra(crudo).map((l) => {
    if (!REPETIR.test(l)) return l;
    avisos.push(`«${l}»: la repetición se canta, escríbela entera (se quitó el «x2»).`);
    return l.replace(REPETIR, "").trim();
  }).filter((l) => palabrasDe(l).length);
  const palabras = palabrasDe(lineas.join(" ")).length;
  if (!palabras) return { error: "La letra no tiene palabras que se canten." };
  return { letra: lineas.join("\n"), lineas, palabras, avisos };
}

// ------------------------------------------------------------
// Leer la sincronía (ElevenLabs Forced Alignment, Gemini) con tolerancia
// ------------------------------------------------------------

/** Una lista de palabras con tiempo en cualquiera de sus formas ({ text|word|t, start|start_time|d, end|end_time|h, loss? }). */
function palabrasDeLista(lista) {
  if (!Array.isArray(lista) || !lista.length) return [];
  return lista.map((w) => ({
    texto: String(w?.text ?? w?.word ?? w?.texto ?? w?.t ?? ""),
    desde: numero(w?.start, w?.start_time, w?.start_s, w?.desde, w?.d),
    hasta: numero(w?.end, w?.end_time, w?.end_s, w?.hasta, w?.h),
    ...(Number.isFinite(numero(w?.loss)) ? { loss: numero(w.loss) } : {}),
  })).filter((w) => normalizarPalabra(w.texto) && Number.isFinite(w.desde) && Number.isFinite(w.hasta) && w.hasta >= w.desde);
}

/** Los CARACTERES con tiempo ([{ text, start, end }]) agrupados en palabras por los espacios. */
function palabrasDeCaracteres(lista) {
  if (!Array.isArray(lista) || !lista.length) return [];
  const salida = [];
  let actual = null;
  for (const c of lista) {
    const t = String(c?.text ?? c?.char ?? c?.character ?? "");
    const d = numero(c?.start, c?.start_time);
    const h = numero(c?.end, c?.end_time);
    if (!t || /^\s+$/.test(t)) { if (actual) { salida.push(actual); actual = null; } continue; }
    if (!Number.isFinite(d) || !Number.isFinite(h)) continue;
    if (!actual) actual = { texto: "", desde: d, hasta: h };
    actual.texto += t;
    actual.hasta = Math.max(actual.hasta, h);
  }
  if (actual) salida.push(actual);
  return salida.filter((w) => normalizarPalabra(w.texto));
}

/**
 * Lo que devolvió una alineación (la de ElevenLabs: `{ words: [{ text, start, end, loss }], characters, loss }`), leído
 * con tolerancia: las palabras de `words` (o de `data.words`, `alignment.words`, `segments[].words`), o si no, los
 * caracteres agrupados. → { palabras: [{ texto, desde, hasta }], loss (o null), campos (lo que llegó) }. Pura.
 */
export function leerAlineacion(respuesta) {
  let j = respuesta;
  if (typeof j === "string") { try { j = JSON.parse(j); } catch { j = null; } }
  if (!esObjeto(j)) return { palabras: [], loss: null, campos: [] };
  const campos = Object.keys(j).slice(0, 12);
  const candidatos = [j, j.data, j.result, j.alignment, j.output].filter(esObjeto);
  for (const c of candidatos) {
    for (const k of ["words", "word_segments", "palabras"]) {
      const l = palabrasDeLista(c[k]);
      if (l.length) return { palabras: l, loss: Number.isFinite(numero(c.loss, j.loss)) ? numero(c.loss, j.loss) : null, campos };
    }
    if (Array.isArray(c.segments)) {
      const l = palabrasDeLista(c.segments.flatMap((s) => (Array.isArray(s?.words) ? s.words : [])));
      if (l.length) return { palabras: l, loss: Number.isFinite(numero(j.loss)) ? numero(j.loss) : null, campos };
    }
  }
  for (const c of candidatos) {
    const l = palabrasDeCaracteres(c.characters ?? c.chars);
    if (l.length) return { palabras: l, loss: Number.isFinite(numero(c.loss, j.loss)) ? numero(c.loss, j.loss) : null, campos };
  }
  return { palabras: [], loss: Number.isFinite(numero(j.loss)) ? numero(j.loss) : null, campos };
}

/** Un trozo corto y legible de una respuesta cruda (para apuntar su forma real sin guardarla entera). Pura. */
export function extractoCrudo(respuesta, max = 1500) {
  try {
    const t = typeof respuesta === "string" ? respuesta : JSON.stringify(respuesta);
    return String(t ?? "").slice(0, max);
  } catch {
    return "";
  }
}

/** Una palabra que la alineación dejó sin duración (las aplasta así cuando no la encuentra entre la música). */
const APLASTADA = 0.03;

/**
 * La letra con los tiempos que se OYERON (`crudas`: [{ texto, desde, hasta }]) → { oidas: [{ texto, desde, hasta }] (una
 * por palabra de la letra, en orden), coincidencia, exactas, aplastadas }. `exactas`: cuántas de la letra se oyeron tal
 * cual; `aplastadas`: cuántas quedaron sin duración. `coincidencia` = exactas × (1 − aplastadas): una alineación
 * FORZADA devuelve siempre la letra que se le dio (las exactas salen 1), así que lo que dice si encontró la voz es que
 * las palabras tengan duración. Pura.
 */
export function medirAlineacion(palabrasLetra, crudas, duracion = 0) {
  const esperadas = Array.isArray(palabrasLetra) ? palabrasLetra : [];
  const dichas = (Array.isArray(crudas) ? crudas : []).filter((p) => Number.isFinite(p?.desde) && Number.isFinite(p?.hasta));
  if (!esperadas.length || !dichas.length) return { oidas: [], coincidencia: 0, exactas: 0, aplastadas: 1 };
  const a = alinearPalabras(esperadas, dichas);
  const fin = Number(duracion) > 0 ? Number(duracion) : Infinity;
  const oidas = a.palabras.map((p, i) => ({ texto: esperadas[i], desde: r3(Math.min(fin, Math.max(0, p.desde))), hasta: r3(Math.min(fin, Math.max(0, p.hasta))) }));
  const aplastadas = Math.round((oidas.filter((p) => p.hasta - p.desde < APLASTADA).length / oidas.length) * 1000) / 1000;
  return { oidas, coincidencia: Math.round(a.coincidencia * (1 - aplastadas) * 1000) / 1000, exactas: a.coincidencia, aplastadas };
}

/** Los tiempos ESTIMADOS de la letra sobre lo que dura la canción (sin oírla: el último recurso). Pura. */
export function letraEstimada(palabrasLetra, duracion) {
  return palabrasEstimadas(palabrasLetra, duracion).map((t, i) => ({ texto: palabrasLetra[i], ...t }));
}

/** El pedido a Gemini para OÍR una canción con su letra (la voz cantada sobre la música). */
export function pedidoDeTiemposCancion(letra) {
  return [
    "Escucha esta CANCIÓN: una voz CANTADA sobre música. Te doy su letra exacta, en orden. Marca, palabra por palabra, el",
    "segundo en que EMPIEZA y TERMINA de cantarse cada palabra de esta letra (con dos decimales). No añadas, quites ni",
    "cambies palabras; si una no se oye, ponle el tiempo entre sus vecinas. Responde SOLO con JSON:",
    '{"palabras":[{"t":"palabra","d":0.00,"h":0.00}]}',
    "",
    "LETRA:",
    String(letra ?? "").slice(0, MAX_LETRA),
  ].join("\n");
}

// ------------------------------------------------------------
// La locución de un video con canción
// ------------------------------------------------------------

/** ¿Es la locución de una CANCIÓN (no una voz generada)? */
export const esCancion = (l) => l?.origen === "cancion";

/** El ajuste fino, acotado a ±`DESPLAZAMIENTO_MAX` y a centésimas. Pura. */
export function limpiarDesplazamiento(d) {
  const n = Number(d);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(-DESPLAZAMIENTO_MAX, Math.min(DESPLAZAMIENTO_MAX, n)) * 100) / 100;
}

/**
 * La letra con sus tiempos MOVIDOS `d` segundos (positivo: la letra sale más tarde), sin salirse de la canción. Pura.
 */
export function conDesplazamiento(oidas, d = 0, duracion = 0) {
  const lista = Array.isArray(oidas) ? oidas : [];
  const mov = limpiarDesplazamiento(d);
  const fin = Number(duracion) > 0 ? Number(duracion) : Infinity;
  const dentro = (x) => r3(Math.min(fin, Math.max(0, x)));
  return lista.filter((p) => Number.isFinite(p?.desde) && Number.isFinite(p?.hasta))
    .map((p) => ({ texto: String(p.texto ?? ""), desde: dentro(p.desde + mov), hasta: dentro(p.hasta + mov) }));
}

/**
 * Las palabras del GUION de ahora con su tiempo en la canción (una por palabra de `palabrasDe(textoDeLocucion(guion))`),
 * alineadas contra la letra sincronizada con su ajuste fino. Gratis: no se oye nada otra vez. → { palabras, coincidencia }
 * (`coincidencia`: cuántas palabras del guion están en la letra, en su orden). Pura.
 */
export function palabrasDeLaCancion(guion, l) {
  const esperadas = palabrasDe(textoDeLocucion(guion));
  const oidas = conDesplazamiento(l?.oidas, l?.desplazamiento, l?.duracion);
  if (!esperadas.length || !oidas.length) return { palabras: null, coincidencia: 0 };
  const a = alinearPalabras(esperadas, oidas);
  return { palabras: a.palabras.map((p) => ({ desde: r3(p.desde), hasta: r3(p.hasta) })), coincidencia: a.coincidencia };
}

/**
 * ¿La canción sincronizada sigue valiendo para este guion? Lista, la misma canción (y la misma duración) que dice el
 * guion, y lo que se dice coincide con la letra (≥ `COINCIDENCIA_MINIMA`). → { ok, motivo, coincidencia }. Pura.
 */
export function estadoDeCancion(guion, l) {
  if (!esCancion(l) || l.estado !== "lista" || !l.clave) return { ok: false, motivo: "Primero sincroniza la canción.", coincidencia: 0 };
  if (!guion?.cancion || guion.cancion.archivo !== l.archivo || Math.abs(Number(guion.cancion.duracion) - Number(l.duracion)) > 0.05) {
    return { ok: false, motivo: "El guion ya no dice la misma canción que se sincronizó: vuelve a crearlo con la canción.", coincidencia: 0 };
  }
  const { coincidencia } = palabrasDeLaCancion(guion, l);
  if (coincidencia < COINCIDENCIA_MINIMA) {
    return { ok: false, motivo: `Lo que dice el guion ya no coincide con la letra de la canción (sólo el ${Math.round(coincidencia * 100)} %): la letra va tal cual en el «habla».`, coincidencia };
  }
  return { ok: true, motivo: "", coincidencia };
}
export const cancionSigueValiendo = (guion, l) => estadoDeCancion(guion, l).ok;

/**
 * Las palabras que van a `lineaDeTiempo` para este guion: las de la canción (calculadas ahora, con el ajuste fino) o las
 * de la locución generada. null si no hay locución lista. Pura.
 */
export function palabrasParaLinea(guion, l) {
  if (!l || l.estado !== "lista") return null;
  if (esCancion(l)) return palabrasDeLaCancion(guion, l).palabras;
  return Array.isArray(l.palabras) ? l.palabras : null;
}

/** La locución con sus `palabras` del guion de ahora si es una canción (las de la voz se quedan como están). Pura. */
export function conPalabrasDeCancion(guion, l) {
  if (!esCancion(l) || l.estado !== "lista" || !guion) return l;
  const { palabras, coincidencia } = palabrasDeLaCancion(guion, l);
  return { ...l, palabras, coincidenciaGuion: coincidencia };
}

// ------------------------------------------------------------
// Las líneas de la letra con sus tiempos, y la prueba de sincronía
// ------------------------------------------------------------

/** Parte una línea larga en frases (por la coma más al centro o, si no, por la palabra del centro). Pura. */
export function partirLinea(texto, max = LARGO_LINEA) {
  const t = String(texto ?? "").trim();
  if (t.length <= max) return [t];
  const palabras = t.split(" ");
  const mitad = t.length / 2;
  let mejor = -1;
  let dist = Infinity;
  let largo = 0;
  palabras.slice(0, -1).forEach((p, i) => {
    largo += p.length + 1;
    const coma = /[,;:]$/.test(p) ? 0 : 12;
    const d = Math.abs(largo - mitad) + coma;
    if (d < dist) { dist = d; mejor = i; }
  });
  if (mejor < 0) return [t.slice(0, max)];
  return [...partirLinea(palabras.slice(0, mejor + 1).join(" "), max), ...partirLinea(palabras.slice(mejor + 1).join(" "), max)];
}

const claveDeLinea = (texto) => palabrasDe(texto).map(normalizarPalabra).join(" ");

/**
 * Las líneas de la letra (`letra`, la limpia) con su tiempo en la canción (`oidas`, una por palabra de la letra, ya con
 * el ajuste fino), partidas si son largas y con el CORO marcado (las que se repiten). → [{ texto, desde, hasta, coro }].
 * Pura.
 */
export function lineasConTiempos(letra, oidas) {
  const lista = Array.isArray(oidas) ? oidas : [];
  const lineas = lineasDeLetra(letra).flatMap((l) => partirLinea(l));
  const veces = new Map();
  for (const l of lineas) veces.set(claveDeLinea(l), (veces.get(claveDeLinea(l)) ?? 0) + 1);
  let i = 0;
  const salida = [];
  for (const texto of lineas) {
    const n = palabrasDe(texto).length;
    const tramo = lista.slice(i, i + n);
    i += n;
    if (!tramo.length) continue;
    salida.push({ texto, desde: tramo[0].desde, hasta: tramo.at(-1).hasta, coro: (veces.get(claveDeLinea(texto)) ?? 0) > 1 });
  }
  return salida;
}

/** Los huecos sin letra de más de `HUECO_INSTRUMENTAL` (intro, puentes, final) → [{ desde, hasta, cual }]. Pura. */
export function huecosInstrumentales(lineas, duracion) {
  const huecos = [];
  if (!lineas.length) return duracion > 0 ? [{ desde: 0, hasta: duracion, cual: "intro" }] : [];
  if (lineas[0].desde > HUECO_INSTRUMENTAL) huecos.push({ desde: 0, hasta: lineas[0].desde, cual: "intro" });
  for (let k = 1; k < lineas.length; k++) {
    if (lineas[k].desde - lineas[k - 1].hasta > HUECO_INSTRUMENTAL) huecos.push({ desde: lineas[k - 1].hasta, hasta: lineas[k].desde, cual: "puente" });
  }
  if (duracion - lineas.at(-1).hasta > HUECO_INSTRUMENTAL) huecos.push({ desde: lineas.at(-1).hasta, hasta: duracion, cual: "final" });
  return huecos;
}

/** Junta en una las líneas que se cantan tan seguidas que su escena duraría menos de lo que se lee (y respeta el tope). */
function juntarCortas(lineas, max) {
  const salida = lineas.map((l) => ({ ...l }));
  const dura = (k) => (k + 1 < salida.length ? salida[k + 1].desde : salida[k].hasta) - salida[k].desde;
  for (let k = 0; k < salida.length - 1;) {
    const unida = `${salida[k].texto} ${salida[k + 1].texto}`;
    if (dura(k) < MIN_ESCENA + 0.2 && unida.length <= MAX_HABLA) {
      salida.splice(k, 2, { texto: unida, desde: salida[k].desde, hasta: salida[k + 1].hasta, coro: salida[k].coro && salida[k + 1].coro });
    } else k++;
  }
  // Más escenas de las que caben: se juntan de dos en dos desde el principio.
  while (salida.length > max) {
    const k = salida.findIndex((l, i) => i < salida.length - 1 && `${l.texto} ${salida[i + 1].texto}`.length <= MAX_HABLA);
    if (k < 0) break;
    salida.splice(k, 2, { texto: `${salida[k].texto} ${salida[k + 1].texto}`, desde: salida[k].desde, hasta: salida[k + 1].hasta, coro: salida[k].coro && salida[k + 1].coro });
  }
  return salida;
}

/** Las formas que van detrás de una línea y los iconos de encima (rotan: uno por escena; el coro, su estrella). */
const FORMAS_KARAOKE = Object.freeze(["mancha", "circulo", "ola"]);
const ICONOS_KARAOKE = Object.freeze(["corazon", "sonrisa", "rayo", "hoja", "gota"]);

/** Un texto para la pantalla (≤ 80): entero si cabe; si no, hasta la última palabra que cabe con «…». */
function enPantalla(texto, max = 80) {
  const t = String(texto ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * La PRUEBA DE SINCRONÍA, gratis y sin IA: una escena por línea de la letra (la línea de titular grande; el coro con más
 * fuerza), los subtítulos por palabra, escenas sin letra en los huecos instrumentales de más de 2 s (la intro y el final
 * con el logo; un puente con una forma) y el logo al cierre. `lineas`: las de `lineasConTiempos`. Valida y se renderiza
 * tal cual. → el guion validado (o lanza si, por algo raro, no valida). Pura.
 */
export function guionKaraoke({ titulo = "", lineas = [], duracion, cancion, formato = "9:16" } = {}) {
  const f = FORMATOS_VIDEO[formato] ? formato : "9:16";
  const huecos = huecosInstrumentales(lineas, duracion);
  const caben = MAX_ESCENAS_CANCION - huecos.length - 1;
  const juntas = juntarCortas(lineas, Math.max(1, caben));
  const nombre = enPantalla(titulo || cancion?.nombre || "Nuestra canción");
  const escenas = [];
  const conLetra = juntas.map((l, i) => {
    const pantalla = enPantalla(l.texto);
    return {
      desde: l.desde,
      escena: {
        id: `l${i + 1}`, tipo: l.coro ? "beneficio" : "explicacion", habla: l.texto, pantalla,
        fondo: l.coro ? { tipo: "estrellas", color: "fondo", color2: "acento" } : i % 2 ? { tipo: "puntos", color: "fondo", color2: "superficie" } : { tipo: "papel", color: "fondo" },
        transicion: { tipo: l.coro ? "zoom" : "fundido", dur: 0.25 },
        // Un icono encima (sin una pieza visual, una línea sola se ve vacía) y una forma DETRÁS de la línea (el motor pone
        // una forma tras la capa que la sigue). El titular a 0,6 del lado corto: el motor lo agranda al llenar.
        capas: [
          { tipo: "icono", id: "icono", nombre: l.coro ? "estrella" : ICONOS_KARAOKE[i % ICONOS_KARAOKE.length], fondo: l.coro ? "acento" : "superficie", pos: "arriba", tam: 0.28, entra: { palabra: 0 }, animacion: { entrada: "rebote", bucle: l.coro ? "late" : "flota" } },
          { tipo: "forma", id: "fondo-linea", figura: l.coro ? "estrella" : FORMAS_KARAOKE[i % FORMAS_KARAOKE.length], color: l.coro ? "acento" : "apoyo", tam: 0.72, animacion: { entrada: "escala", bucle: l.coro ? "gira" : "flota" } },
          l.coro
            ? { tipo: "texto", id: "linea", texto: pantalla, rol: "titular", placa: "acento", color: "claro", tam: 0.6, entra: { palabra: 0 }, animacion: { entrada: "escala", bucle: "pulso" } }
            : { tipo: "texto", id: "linea", texto: pantalla, rol: "titular", color: "texto", tam: 0.6, entra: { palabra: 0 }, animacion: { entrada: "sube" } },
        ],
      },
    };
  });
  const sinLetra = huecos.map((h, i) => ({
    desde: h.desde,
    escena: h.cual === "puente"
      ? { id: `p${i + 1}`, tipo: "explicacion", habla: "", pantalla: "", fondo: { tipo: "degradado", color: "fondo", color2: "apoyo" }, transicion: { tipo: "fundido", dur: 0.3 },
        capas: [{ tipo: "forma", id: "forma", figura: "mancha", color: "apoyo", tam: 0.75, animacion: { entrada: "dibuja", bucle: "gira" } }] }
      : {
        id: h.cual === "intro" ? "intro" : "final", tipo: h.cual === "intro" ? "gancho" : "cierre", habla: "", pantalla: h.cual === "intro" ? nombre : "",
        fondo: { tipo: "degradado", color: "fondo", color2: "superficie" }, transicion: { tipo: "fundido", dur: 0.3 },
        capas: [
          { tipo: "logo", id: "logo", pos: "centro", tam: 0.5, animacion: { entrada: "escala", bucle: "flota" } },
          ...(h.cual === "intro" ? [{ tipo: "texto", id: "nombre", texto: nombre, rol: "apoyo", pos: "abajo", tam: 0.6, entra: { s: 0.4 }, animacion: { entrada: "sube" } }] : []),
        ],
      },
  }));
  // En el orden en que suenan (una escena sin letra va antes de la línea que empieza donde acaba su hueco).
  for (const x of [...sinLetra, ...conLetra].sort((a, b) => a.desde - b.desde || (a.escena.habla ? 1 : -1))) escenas.push(x.escena);
  // Sin final instrumental, el logo va en la última escena.
  if (!huecos.some((h) => h.cual === "final") && escenas.length) {
    const ultima = escenas.at(-1);
    if (!ultima.capas.some((c) => c.tipo === "logo")) ultima.capas = [{ tipo: "logo", id: "logo", pos: "arriba", tam: 0.32, animacion: { entrada: "fundido" } }, ...ultima.capas];
  }
  const guion = {
    version: 1, titulo: nombre, formatos: [f], estilo: { ritmo: "medio", grano: 0.2, ilustracion: "plana" },
    subtitulos: { activo: true, pos: "abajo", maxPalabras: 3 },
    escenas,
    cancion: { archivo: cancion?.archivo, duracion: Math.min(MAX_SEGUNDOS_CANCION, r3(Number(duracion))), ...(cancion?.nombre ? { nombre: String(cancion.nombre).slice(0, 120) } : {}) },
  };
  const v = validarGuion(guion);
  if (!v.ok) throw new Error(`La prueba de sincronía no validó: ${v.errores.slice(0, 3).map((e) => `${e.donde}: ${e.mensaje}`).join("; ")}`);
  return v.guion;
}

/**
 * ¿La `habla` del guion es la LETRA tal cual y en orden? (lo que se pide a la IA que diseña las escenas). → los errores
 * [{ donde, mensaje }] con la escena donde empieza a no cuadrar (vacío si cuadra). Pura.
 */
export function comprobarLetra(guion, letra) {
  const esperadas = palabrasDe(String(letra ?? "").replace(/\n/g, " "));
  const escenas = guion?.escenas ?? [];
  const dichas = [];
  escenas.forEach((e, k) => { for (const p of palabrasDe(e.habla)) dichas.push({ p, k }); });
  const n = Math.max(esperadas.length, dichas.length);
  for (let i = 0; i < n; i++) {
    const a = esperadas[i];
    const b = dichas[i];
    if (a && b && normalizarPalabra(a) === normalizarPalabra(b.p)) continue;
    const k = b?.k ?? Math.max(0, escenas.length - 1);
    const cerca = esperadas.slice(i, i + 6).join(" ");
    if (!b) return [{ donde: `escenas[${k}].habla`, mensaje: `Falta letra al final: después de lo último que dice el guion la canción sigue con «${cerca}».` }];
    if (!a) return [{ donde: `escenas[${k}].habla`, mensaje: `Sobra «${dichas.slice(i, i + 6).map((x) => x.p).join(" ")}»: la letra ya terminó.` }];
    return [{ donde: `escenas[${k}].habla`, mensaje: `La letra dice «${cerca}» y el guion dice «${dichas.slice(i, i + 6).map((x) => x.p).join(" ")}»: el «habla» es la letra TAL CUAL, en orden.` }];
  }
  return [];
}

/** El guion con SU canción (la pone la aplicación, no la IA) y sin la música del guion (la canción ya lo es). Pura. */
export function conLaCancion(g, { archivo, duracion, nombre = "" }) {
  if (!esObjeto(g)) return g;
  const { musica: _m, ...resto } = g;
  return { ...resto, cancion: { archivo, duracion: r3(Number(duracion)), ...(nombre ? { nombre: String(nombre).slice(0, 120) } : {}) } };
}

// ------------------------------------------------------------
// Lo que dura un audio, por sus bytes
// ------------------------------------------------------------

const u32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u32le = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const fourcc = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

/** Un WAV: los bytes de «data» entre los bytes por segundo de «fmt ». */
function duracionWav(b) {
  let porSegundo = 0;
  for (let i = 12; i + 8 <= b.length;) {
    const id = fourcc(b, i);
    const largo = u32le(b, i + 4);
    if (id === "fmt " && i + 16 <= b.length) porSegundo = u32le(b, i + 16);
    if (id === "data") return porSegundo > 0 ? r3(Math.min(largo, b.length - i - 8) / porSegundo) : 0;
    i += 8 + largo + (largo % 2);
  }
  return 0;
}

/** Un M4A / MP4: la duración y la escala de tiempo de su caja «mvhd» (dentro de «moov»). */
function duracionMp4(b) {
  const buscar = (desde, hasta, dentro) => {
    for (let i = desde; i + 8 <= hasta;) {
      let largo = u32(b, i);
      const tipo = fourcc(b, i + 4);
      if (largo === 1 && i + 16 <= hasta) largo = Number((BigInt(u32(b, i + 8)) << 32n) | BigInt(u32(b, i + 12)));
      if (largo < 8) largo = hasta - i;
      if (tipo === "mvhd") {
        const v = b[i + 8];
        const escala = v === 1 ? u32(b, i + 28) : u32(b, i + 20);
        const dur = v === 1 ? Number((BigInt(u32(b, i + 32)) << 32n) | BigInt(u32(b, i + 36))) : u32(b, i + 24);
        return escala > 0 ? r3(dur / escala) : 0;
      }
      if (tipo === "moov" && dentro) {
        const r = buscar(i + 8, Math.min(hasta, i + largo), false);
        if (r) return r;
      }
      i += largo;
    }
    return 0;
  };
  return buscar(0, b.length, true);
}

/**
 * Lo que dura un audio por sus bytes (MP3, WAV o M4A), en segundos; 0 si no se entiende (quien llama tira entonces de
 * lo que midió el navegador al subirlo). Pura.
 */
export function duracionDeAudio(bytes, mime = "") {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (b.length < 12) return 0;
  if (fourcc(b, 0) === "RIFF" && fourcc(b, 8) === "WAVE") return duracionWav(b);
  if (fourcc(b, 4) === "ftyp" || /mp4|m4a|aac/.test(String(mime))) return duracionMp4(b);
  return duracionMp3(b);
}
