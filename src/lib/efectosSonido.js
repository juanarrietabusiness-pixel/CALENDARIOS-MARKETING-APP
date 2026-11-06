// ============================================================
// Los EFECTOS DE SONIDO del video animado: un «whoosh» en cada transición y un «pop» cuando entra un sello o el
// llamado a la acción, bajitos, por debajo de la voz (puro: lo lee el render del Container).
//
// Por defecto no son archivos: se SINTETIZAN aquí (ruido filtrado que sube y baja; un tono corto que cae de tono), así
// no hay licencias, ni descargas, ni costo, y salen idénticos en cada render (el ruido sale de una semilla). Se mezclan
// en el MISMO PCM que arma `armarPcm` (src/lib/renderVideo.js), antes de normalizar el volumen: así quedan a la misma
// distancia de la voz sea cual sea el volumen de la toma.
//
// Con la BIBLIOTECA DE SONIDO, cada cliente puede escoger un efecto suyo (o de la agencia) para las transiciones y otro
// para los sellos y llamados (`sonido.efectosPropios`): el Container lo decodifica a PCM como la voz
// (`muestrasDeEfecto`) y suena en esos mismos instantes, al mismo nivel bajito, en vez del sintetizado (`propios`).
// ============================================================

import { tiempoDeCapa } from "./videoEscenas.js";
import { BYTES_MUESTRA, RENDER } from "./renderVideo.js";
import { nivelDe } from "./sonidoVideo.js";

/** Cuánto más bajos que la voz (dB, en RMS). 12 dB: se notan sin tapar ninguna palabra. */
export const EFECTOS_BAJO_LA_VOZ = 12;

/** Lo que dura cada efecto (s). */
export const DURACION_EFECTO = Object.freeze({ whoosh: 0.42, pop: 0.09 });

const r3 = (n) => Math.round(n * 1000) / 1000;

/** Lo más que arranca un whoosh antes del cambio de escena (s): uno largo de la biblioteca se adelantaría demasiado. */
export const MAX_ANTES_DEL_CAMBIO = 0.5;
/** Lo que se usa como mucho de un efecto de la biblioteca (s): uno más largo se corta con un fundido. */
export const MAX_EFECTO_PROPIO = 4;
/** Lo que se considera silencio al recortar el principio de un efecto subido (sobre 1, el pico). */
const UMBRAL_SILENCIO = 0.02;

/**
 * Cuándo suena cada efecto, en segundos del VIDEO (`linea` = `lineaDeTiempo`): un whoosh en cada escena que entra con
 * transición (no en un corte seco ni en la primera) —centrado en el cambio, que es cuando más se mueve la pantalla— y un
 * pop al entrar cada sello y cada llamado. Dos efectos a menos de 0,15 s se quedan en uno (el primero). → [{ tipo, en }]
 * en orden. Pura.
 */
export function momentosDeEfectos(guion, linea, { duraciones = DURACION_EFECTO } = {}) {
  const out = [];
  // Un whoosh de la biblioteca puede durar más: se centra igual en el cambio, pero no arranca más de medio segundo antes.
  const antes = Math.min(MAX_ANTES_DEL_CAMBIO, (Number(duraciones?.whoosh) || DURACION_EFECTO.whoosh) / 2);
  (guion?.escenas ?? []).forEach((e, k) => {
    const esc = linea?.escenas?.[k];
    if (!esc) return;
    if (k > 0 && e.transicion?.tipo && e.transicion.tipo !== "corte") {
      out.push({ tipo: "whoosh", en: r3(Math.max(0, esc.desde - antes)) });
    }
    for (const c of e.capas ?? []) {
      if (c.tipo === "sello" || c.tipo === "llamado") out.push({ tipo: "pop", en: tiempoDeCapa(c, esc).desde });
    }
  });
  out.sort((a, b) => a.en - b.en);
  return out.filter((x, i, l) => i === 0 || x.en - l[i - 1].en >= 0.15);
}

/** Un generador de números al azar con semilla (mulberry32): el mismo ruido en cada render. */
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Las muestras (mono, -1…1, pico 1) de un efecto a `muestreo`. Whoosh: ruido que pasa por un filtro que se abre y se
 * cierra (sube y baja de brillo) con una envolvente en campana. Pop: un tono que cae de 900 a 250 Hz en un instante, con
 * ataque de 2 ms y caída rápida. Pura.
 */
export function sintetizar(tipo, muestreo = RENDER.muestreo, semilla = 7) {
  const n = Math.round(DURACION_EFECTO[tipo] * muestreo);
  const s = new Float32Array(n);
  if (tipo === "whoosh") {
    const r = azar(semilla);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const x = i / n; // 0 → 1
      const campana = Math.sin(Math.PI * x) ** 2;
      // El filtro de un polo: casi cerrado en los bordes, abierto en medio.
      const corte = 0.02 + 0.25 * campana;
      lp += corte * (r() * 2 - 1 - lp);
      s[i] = lp * campana;
    }
  } else {
    let fase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / muestreo;
      const f = 250 + 650 * Math.exp(-t * 60);
      fase += (2 * Math.PI * f) / muestreo;
      const env = Math.min(1, t / 0.002) * Math.exp(-t * 45);
      s[i] = Math.sin(fase) * env;
    }
  }
  let pico = 0;
  for (const v of s) pico = Math.max(pico, Math.abs(v));
  if (pico > 0) for (let i = 0; i < n; i++) s[i] /= pico;
  return s;
}

/** El RMS (0–1) de unas muestras de efecto. */
const rms = (s) => Math.sqrt(s.reduce((n, x) => n + x * x, 0) / Math.max(1, s.length));

/**
 * El RMS de lo que SUENA de un efecto subido (sin sus colas de silencio): con el de todo el archivo, un efecto con un
 * segundo de silencio detrás saldría mucho más fuerte que el sintetizado. Pura.
 */
function rmsSonando(s) {
  let suma = 0;
  let n = 0;
  for (const x of s) if (Math.abs(x) > UMBRAL_SILENCIO) { suma += x * x; n++; }
  return n ? Math.sqrt(suma / n) : 0;
}

/**
 * Las muestras de un efecto de la biblioteca a partir de su PCM decodificado (s16le estéreo a `muestreo`): mono, sin el
 * silencio del principio (así suena en su instante) ni el del final, como mucho `MAX_EFECTO_PROPIO` segundos (con un
 * fundido si se corta) y con el pico en 1, como las sintetizadas. → Float32Array (vacía si no suena nada). Pura.
 */
export function muestrasDeEfecto(pcm, muestreo = RENDER.muestreo) {
  const total = Math.floor((pcm?.byteLength ?? 0) / BYTES_MUESTRA);
  if (!total) return new Float32Array(0);
  const v = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const mono = new Float32Array(total);
  let pico = 0;
  for (let i = 0; i < total; i++) {
    const x = (v.getInt16(i * BYTES_MUESTRA, true) + v.getInt16(i * BYTES_MUESTRA + 2, true)) / 65536;
    mono[i] = x;
    pico = Math.max(pico, Math.abs(x));
  }
  if (!pico) return new Float32Array(0);
  let inicio = 0;
  while (inicio < total && Math.abs(mono[inicio]) / pico <= UMBRAL_SILENCIO) inicio++;
  let fin = total;
  while (fin > inicio && Math.abs(mono[fin - 1]) / pico <= UMBRAL_SILENCIO) fin--;
  const largo = Math.min(fin - inicio, Math.round(MAX_EFECTO_PROPIO * muestreo));
  const out = new Float32Array(largo);
  const fundido = Math.min(largo, Math.round(0.05 * muestreo));
  const cortado = fin - inicio > largo;
  for (let i = 0; i < largo; i++) {
    let g = 1 / pico;
    if (cortado && i >= largo - fundido) g *= (largo - i) / fundido;
    out[i] = mono[inicio + i] * g;
  }
  return out;
}

/**
 * Mezcla los efectos en el PCM (s16le estéreo; lo CAMBIA y lo devuelve), `bajo` dB por debajo del nivel de la voz (sin
 * voz, a un nivel fijo bajito). Lo que se pasaría de la escala se recorta. `propios` ({ whoosh?, pop? }: muestras de
 * `muestrasDeEfecto`) suenan en vez de los sintetizados, al MISMO nivel (por el RMS de lo que suena). Pura salvo por
 * cambiar `pcm`.
 */
export function mezclarEfectos(pcm, momentos, { muestreo = RENDER.muestreo, bajo = EFECTOS_BAJO_LA_VOZ, propios = null } = {}) {
  if (!momentos?.length || !pcm?.length) return pcm;
  const voz = nivelDe(pcm) || 0.05;
  const objetivo = voz * 10 ** (-bajo / 20);
  const v = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const muestras = Math.floor(pcm.byteLength / BYTES_MUESTRA);
  const cache = {};
  const ganancia = {};
  for (const m of momentos) {
    const propio = propios?.[m.tipo]?.length ? propios[m.tipo] : null;
    const s = (cache[m.tipo] ??= propio ?? sintetizar(m.tipo, muestreo));
    const g = (ganancia[m.tipo] ??= objetivo / ((propio ? rmsSonando(s) : rms(s)) || 1));
    const desde = Math.round(m.en * muestreo);
    for (let i = 0; i < s.length; i++) {
      const j = desde + i;
      if (j < 0) continue;
      if (j >= muestras) break;
      const extra = Math.round(s[i] * g * 32767);
      for (const canal of [0, 2]) {
        const o = j * BYTES_MUESTRA + canal;
        v.setInt16(o, Math.max(-32768, Math.min(32767, v.getInt16(o, true) + extra)), true);
      }
    }
  }
  return pcm;
}
