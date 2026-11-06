// ============================================================
// El SONIDO del video animado que no es la voz: los efectos y la MÚSICA de fondo (puro: lo leen el Worker, el render
// del Container y la pantalla)
//
// Vive en `videos_proyectos.sonido`, APARTE del guion: cambiar la música o apagar los efectos no sube la versión ni
// devuelve el video a borrador, así que no obliga a pagar otra locución. Sólo hay que volver a renderizar.
//
// La música se mezcla aquí, copiando muestras, como los silencios y los efectos (sin cadena de filtros de ffmpeg: la
// del 5.1 de la imagen ya se rompió una vez). Va por debajo de la voz con DUCKING —baja sola mientras se habla y sube
// en los huecos—, entra con un fundido corto y sale con uno largo al final del video. Si es más corta que el video, se
// repite.
// ============================================================

import { BYTES_MUESTRA, RENDER } from "./renderVideo.js";

/** Dónde queda la música respecto a la voz (dB, en RMS): mientras se habla y en los huecos sin voz. */
export const MUSICA_BAJO_LA_VOZ = Object.freeze({ hablando: 20, hueco: 9 });
/** Lo que se puede subir o bajar la música a mano (dB). */
export const VOLUMEN_MUSICA = Object.freeze({ min: -12, max: 12 });
/** El fundido de entrada y el de salida (s). */
export const FUNDIDO_MUSICA = Object.freeze({ entrada: 0.4, salida: 2 });
/** Cómo reacciona el ducking: lo que tarda en bajar al empezar a hablar y en subir al callar (s). */
export const DUCKING = Object.freeze({ ventana: 0.01, baja: 0.08, sube: 0.45 });

const ID = /^[\w-]{1,80}$/;

/** Los dos sitios donde suena un efecto de la biblioteca en vez del sintetizado: las transiciones y los sellos y llamados. */
export const SITIOS_EFECTO = Object.freeze(["transicion", "sello"]);

/**
 * Una clave de audio que puede ir en el sonido: de la galería de un cliente (`clientes/…`) o de la biblioteca de la
 * agencia (`biblioteca/<espacio>/…`), sin `..`. La pone el servidor desde la ficha, nunca el navegador. Pura.
 */
const claveValida = (c) => typeof c === "string" && /^(clientes|biblioteca)\/[\w-]+\/./.test(c) && !c.includes("..");

/** Lo que se guarda de una pista de la biblioteca (un efecto, o la música sin su volumen). Pura. */
function pistaLimpia(m) {
  const o = typeof m === "string" ? { archivoId: m } : m && typeof m === "object" ? m : null;
  if (!o || !ID.test(String(o.archivoId ?? ""))) return null;
  return {
    archivoId: String(o.archivoId),
    ...(claveValida(o.clave) ? { clave: o.clave } : {}),
    nombre: String(o.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
    ...(o.de === "agencia" ? { de: "agencia" } : {}),
  };
}

/**
 * El sonido de un video, limpio: { efectos (bool, encendidos por defecto), musica: null | { archivoId, clave?, nombre,
 * volumen (dB, -12…12), de? }, efectosPropios?: { transicion?, sello? } }. Lo que no vale se quita. `efectosPropios` son
 * efectos de la BIBLIOTECA (un id, o { archivoId, clave, nombre }) que suenan en vez del whoosh o del pop sintetizados;
 * sólo va si hay alguno. `de: "agencia"`: la pista es de la biblioteca de la agencia. Pura.
 */
export function limpiarSonido(s) {
  const o = s && typeof s === "object" && !Array.isArray(s) ? s : {};
  const m = o.musica && typeof o.musica === "object" ? pistaLimpia(o.musica) : null;
  let musica = null;
  if (m) {
    const v = Number(o.musica.volumen);
    const { de, ...resto } = m;
    musica = { ...resto, volumen: Number.isFinite(v) ? Math.max(VOLUMEN_MUSICA.min, Math.min(VOLUMEN_MUSICA.max, Math.round(v))) : 0, ...(de ? { de } : {}) };
  }
  const p = o.efectosPropios && typeof o.efectosPropios === "object" && !Array.isArray(o.efectosPropios) ? o.efectosPropios : {};
  const propios = {};
  for (const sitio of SITIOS_EFECTO) {
    const e = pistaLimpia(p[sitio]);
    if (e) propios[sitio] = e;
  }
  return { efectos: o.efectos !== false, musica, ...(Object.keys(propios).length ? { efectosPropios: propios } : {}) };
}

/** El RMS (0–1) de un PCM s16le estéreo, sin contar lo que es exactamente cero (el silencio insertado). Pura. */
export function nivelDe(pcm) {
  const v = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let suma = 0;
  let cuenta = 0;
  for (let i = 0; i + 1 < pcm.byteLength; i += 2) {
    const x = v.getInt16(i, true);
    if (x === 0) continue;
    suma += (x / 32768) ** 2;
    cuenta++;
  }
  return cuenta ? Math.sqrt(suma / cuenta) : 0;
}

/**
 * Por cada ventana de `DUCKING.ventana` segundos del PCM de la VOZ: ¿se está hablando? (su RMS pasa de un cuarto del
 * nivel de la voz). → Uint8Array de 0/1. Pura.
 */
export function hablandoPorVentana(voz, muestreo = RENDER.muestreo, nivel = nivelDe(voz)) {
  const porVentana = Math.max(1, Math.round(DUCKING.ventana * muestreo));
  const muestras = Math.floor(voz.byteLength / BYTES_MUESTRA);
  const n = Math.ceil(muestras / porVentana);
  const out = new Uint8Array(n);
  if (!nivel) return out;
  const umbral = (nivel / 4) ** 2;
  const v = new DataView(voz.buffer, voz.byteOffset, voz.byteLength);
  for (let k = 0; k < n; k++) {
    let suma = 0;
    const fin = Math.min(muestras, (k + 1) * porVentana);
    for (let i = k * porVentana; i < fin; i++) suma += (v.getInt16(i * BYTES_MUESTRA, true) / 32768) ** 2;
    out[k] = suma / Math.max(1, fin - k * porVentana) > umbral ? 1 : 0;
  }
  return out;
}

/**
 * La ganancia de la música (en dB respecto a la voz) en cada ventana, con el ducking suavizado: baja en `DUCKING.baja`
 * al empezar a hablar y sube en `DUCKING.sube` al callar. → Float32Array (dB). Pura.
 */
export function curvaDeDucking(hablando, { volumen = 0 } = {}) {
  const out = new Float32Array(hablando.length);
  const abajo = -MUSICA_BAJO_LA_VOZ.hablando + volumen;
  const arriba = -MUSICA_BAJO_LA_VOZ.hueco + volumen;
  const paso = (t) => Math.min(1, DUCKING.ventana / t);
  let g = hablando[0] ? abajo : arriba;
  for (let k = 0; k < hablando.length; k++) {
    const objetivo = hablando[k] ? abajo : arriba;
    g += (objetivo - g) * paso(objetivo < g ? DUCKING.baja : DUCKING.sube);
    out[k] = g;
  }
  return out;
}

/**
 * Mezcla la música (PCM s16le estéreo al mismo muestreo) por debajo de `pcm` (la voz ya armada, que se CAMBIA y se
 * devuelve): ducking contra la voz, fundido de entrada y de salida, repetida si es más corta. `voz` es el PCM de la voz
 * SOLA para el ducking (por defecto, el mismo `pcm`). Pura salvo por cambiar `pcm`.
 */
export function mezclarMusica(pcm, musica, { muestreo = RENDER.muestreo, volumen = 0, voz = pcm } = {}) {
  const mm = Math.floor((musica?.byteLength ?? 0) / BYTES_MUESTRA);
  const muestras = Math.floor(pcm.byteLength / BYTES_MUESTRA);
  if (!mm || !muestras) return pcm;
  const nivelVoz = nivelDe(voz) || 0.05;
  const nivelMusica = nivelDe(musica) || 1;
  const hablando = hablandoPorVentana(voz, muestreo, nivelVoz);
  const curva = curvaDeDucking(hablando, { volumen });
  const porVentana = Math.max(1, Math.round(DUCKING.ventana * muestreo));
  const entrada = Math.round(FUNDIDO_MUSICA.entrada * muestreo);
  const salida = Math.min(muestras, Math.round(FUNDIDO_MUSICA.salida * muestreo));
  const v = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const m = new DataView(musica.buffer, musica.byteOffset, musica.byteLength);
  const base = nivelVoz / nivelMusica;
  for (let i = 0; i < muestras; i++) {
    const db = curva[Math.min(curva.length - 1, Math.floor(i / porVentana))] ?? -MUSICA_BAJO_LA_VOZ.hueco;
    let g = base * 10 ** (db / 20);
    if (i < entrada) g *= i / entrada;
    const quedan = muestras - i;
    if (quedan < salida) g *= quedan / salida;
    const j = (i % mm) * BYTES_MUESTRA;
    for (const canal of [0, 2]) {
      const o = i * BYTES_MUESTRA + canal;
      const x = v.getInt16(o, true) + Math.round(m.getInt16(j + canal, true) * g);
      v.setInt16(o, Math.max(-32768, Math.min(32767, x)), true);
    }
  }
  return pcm;
}

/** El fundido del sonido de un clip al entrar y al salir (s): sin él, el corte se oye como un chasquido. */
export const FUNDIDO_CLIP = 0.04;

/**
 * Mezcla el SONIDO de un clip de video (una capa `video` con `sonido`) en el audio del video: `clip` es su tramo ya
 * decodificado (PCM s16le estéreo a `muestreo`), que entra en el segundo `en` del video a `volumen` (0–1), con un fundido
 * muy corto al entrar y al salir (si no, el corte se oye como un chasquido). No pasa de `hasta` (segundos del video) ni
 * del final del audio. → las muestras mezcladas. Puro.
 */
export function mezclarClip(pcm, clip, { en = 0, hasta = Infinity, volumen = 1, muestreo = RENDER.muestreo } = {}) {
  const total = Math.floor(pcm.byteLength / BYTES_MUESTRA);
  const mc = Math.floor((clip?.byteLength ?? 0) / BYTES_MUESTRA);
  const inicio = Math.max(0, Math.round((Number(en) || 0) * muestreo));
  const fin = Math.min(total, inicio + mc, Number.isFinite(hasta) ? Math.round(hasta * muestreo) : Infinity);
  const g = Math.max(0, Math.min(1, Number.isFinite(volumen) ? volumen : 1));
  if (!(fin > inicio) || g === 0) return 0;
  const fundido = Math.max(1, Math.round(FUNDIDO_CLIP * muestreo));
  const v = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const c = new DataView(clip.buffer, clip.byteOffset, clip.byteLength);
  for (let i = inicio; i < fin; i++) {
    const k = i - inicio;
    const f = g * Math.min(1, k / fundido, (fin - 1 - i) / fundido);
    for (const canal of [0, 2]) {
      const o = i * BYTES_MUESTRA + canal;
      const x = v.getInt16(o, true) + Math.round(c.getInt16(k * BYTES_MUESTRA + canal, true) * f);
      v.setInt16(o, Math.max(-32768, Math.min(32767, x)), true);
    }
  }
  return fin - inicio;
}
