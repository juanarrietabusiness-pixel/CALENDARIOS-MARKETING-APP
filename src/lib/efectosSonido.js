// ============================================================
// Los EFECTOS DE SONIDO del video animado: leerlos, medirlos y MEZCLARLOS (puro: lo lee el render del Container)
//
// Qué suena y cuándo lo decide src/lib/efectosColocados.js (una lista de efectos anclados a eventos del video, o los
// automáticos: un whoosh en cada transición y un pop en cada sello o llamado). Aquí se arma el AUDIO por PISTAS —la voz
// (con el sonido de los clips), la música y los efectos, cada una en su PCM— y se suman al final:
//
//   1. La música se mezcla sola, con su ducking contra la voz (src/lib/sonidoVideo.js).
//   2. Cada efecto se nivela con dos reglas y gana la más alta: la de siempre (12 dB bajo la voz, movida por su papel) y la
//      de la música (sus dB medidos por encima de lo que la música sonaba en el segundo de antes). Así un efecto en un
//      hueco sin voz no queda tapado por la música. Nunca pasa de 6 dB bajo la voz, salvo que se le suba a mano.
//   3. Antes de un golpe, una caída, un whoosh grande o un respiro, la música baja un instante y vuelve con él.
//
// Las pistas sueltas sirven también para ESCUCHAR sin oídos (src/lib/escucharSonido.js): cuánto suena cada efecto sobre
// la voz y la música, qué palabra pisa, qué se tapa.
//
// Los efectos son archivos: los del CATÁLOGO de la aplicación (src/lib/catalogoEfectos.js) y los de la BIBLIOTECA de
// sonido; el Container los decodifica a PCM como la voz (`muestrasDeEfecto`). Si un archivo del catálogo no se pudiera
// leer, el whoosh y el pop de siempre se SINTETIZAN aquí (`sintetizar`): el video nunca se queda sin ellos.
// ============================================================

import { BYTES_MUESTRA, RENDER } from "./renderVideo.js";
import { nivelDe, mezclarMusica } from "./sonidoVideo.js";
import { BAJO_LA_VOZ, TECHO_BAJO_LA_VOZ, bajadaEn } from "./efectosColocados.js";

/** Lo que dura cada efecto (s). */
export const DURACION_EFECTO = Object.freeze({ whoosh: 0.42, pop: 0.09 });

const r3 = (n) => Math.round(n * 1000) / 1000;

/** Lo que se usa como mucho de un efecto de la biblioteca (s): uno más largo se corta con un fundido. */
export const MAX_EFECTO_PROPIO = 4;
/** Lo mismo para uno del CATÁLOGO de la aplicación (src/lib/catalogoEfectos.js): las colas de un impacto pasan de 4 s. */
export const MAX_EFECTO_CATALOGO = 6;
/** La ventana con la que se busca el momento más fuerte de un efecto (s): con una muestra suelta, el ruido de un whoosh engaña. */
const VENTANA_PICO = 0.01;
/** Lo que se considera silencio al recortar el principio de un efecto subido (sobre 1, el pico). */
const UMBRAL_SILENCIO = 0.02;

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
export function muestrasDeEfecto(pcm, muestreo = RENDER.muestreo, { max = MAX_EFECTO_PROPIO } = {}) {
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
  const largo = Math.min(fin - inicio, Math.round(max * muestreo));
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
 * El momento más FUERTE de un efecto (s desde su primera muestra): el centro de la PRIMERA ventana de 10 ms que llega a
 * 1 dB de la más fuerte. Es el punto que se pone sobre el corte en lo que se alinea por el pico (un whoosh, una subida).
 * Con la ventana más fuerte a secas, un efecto con meseta (una subida que se sostiene) saltaba de un extremo a otro de
 * ella con el ruido de codificar el MP3: hasta 220 ms. Pura.
 */
export function picoDeEfecto(s, muestreo = RENDER.muestreo) {
  const n = s?.length ?? 0;
  if (!n) return 0;
  const ventana = Math.max(1, Math.round(VENTANA_PICO * muestreo));
  const energias = [];
  let mejor = 0;
  for (let k = 0; k * ventana < n; k++) {
    let suma = 0;
    const fin = Math.min(n, (k + 1) * ventana);
    for (let i = k * ventana; i < fin; i++) suma += s[i] * s[i];
    energias.push(suma);
    mejor = Math.max(mejor, suma);
  }
  const umbral = mejor * 10 ** (-1 / 10);
  const donde = Math.max(0, energias.findIndex((e) => e >= umbral));
  return r3(Math.min(n, donde * ventana + ventana / 2) / muestreo);
}

/** El RMS de lo que SUENA de unas muestras de efecto (para igualar su nivel). Pura. */
export const nivelDeEfecto = (s) => rmsSonando(s) || rms(s);

/** Una pista vacía (PCM s16le estéreo) del mismo largo que `pcm`. */
const vacia = (pcm) => new Uint8Array(pcm.byteLength);

/** El nivel de partida de los efectos sin voz que lo mida: el de una voz «normal» (0,05 de RMS), como siempre. */
const VOZ_POR_DEFECTO = 0.05;

/**
 * Lo que sonaba una pista (la MÚSICA) en el segundo antes de `t`: la mediana del RMS de sus ventanas de 50 ms (lo que
 * mide earshot como «el fondo» de un efecto). 0 si no suena nada. Pura.
 */
export function nivelDeFondoEn(pcm, t, muestreo = RENDER.muestreo) {
  if (!pcm?.byteLength) return 0;
  const total = Math.floor(pcm.byteLength / BYTES_MUESTRA);
  const v = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const ventana = Math.round(0.05 * muestreo);
  const fin = Math.min(total, Math.round(t * muestreo));
  const ini = Math.max(0, fin - muestreo);
  const niveles = [];
  for (let a = ini; a + ventana <= fin; a += ventana) {
    let suma = 0;
    for (let i = a; i < a + ventana; i++) suma += (v.getInt16(i * BYTES_MUESTRA, true) / 32768) ** 2;
    niveles.push(Math.sqrt(suma / ventana));
  }
  if (!niveles.length) return 0;
  niveles.sort((x, y) => x - y);
  return niveles[Math.floor(niveles.length / 2)];
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

/**
 * Mezcla los efectos (`momentos` de `momentosColocados`) en `destino` (la pista de los EFECTOS, PCM s16le estéreo; se
 * CAMBIA). Cada uno se nivela por el RMS de lo que suena: lo más alto entre su nivel bajo la voz (`BAJO_LA_VOZ` movido por
 * su papel) y sus `sobreFondo` dB sobre la música del segundo de antes (`fondo`, la pista de la música), sin pasar de
 * `TECHO_BAJO_LA_VOZ` bajo la voz; luego, su `volumen` a mano. `muestras` (Map clave → Float32Array) son los archivos ya
 * leídos. → [{ i, clave, en, golpe, dur, sobreVoz, sobreFondo, aMano }] (dB; null sin voz o sin música) y los que
 * no tenían archivo en `sinArchivo`. Pura salvo por cambiar `destino`.
 */
export function mezclarColocados(destino, momentos, muestras, { habla = null, fondo = null, muestreo = RENDER.muestreo } = {}) {
  const medidas = [];
  const sinArchivo = [];
  const total = Math.floor(destino.byteLength / BYTES_MUESTRA);
  const v = new DataView(destino.buffer, destino.byteOffset, destino.byteLength);
  const voz = habla ? nivelDe(habla) : 0;
  const base = (voz || VOZ_POR_DEFECTO) * 10 ** (-BAJO_LA_VOZ / 20);
  const techo = voz ? voz * 10 ** (-TECHO_BAJO_LA_VOZ / 20) : Infinity;
  for (const m of momentos ?? []) {
    const s = muestras?.get(m.clave);
    if (!s?.length) { sinArchivo.push(m); continue; }
    const porVoz = base * 10 ** (m.db / 20);
    const bajoFondo = fondo ? nivelDeFondoEn(fondo, m.golpe, muestreo) : 0;
    const porFondo = bajoFondo * 10 ** (m.sobreFondo / 20);
    const objetivo = Math.min(Math.max(porVoz, porFondo), Math.max(porVoz, techo)) * 10 ** ((m.volumen ?? 0) / 20);
    const g = objetivo / (nivelDeEfecto(s) || 1);
    const desde = Math.round(m.en * muestreo);
    for (let i = 0; i < s.length; i++) {
      const j = desde + i;
      if (j < 0) continue;
      if (j >= total) break;
      const extra = Math.round(s[i] * g * 32767);
      for (const canal of [0, 2]) {
        const o = j * BYTES_MUESTRA + canal;
        v.setInt16(o, Math.max(-32768, Math.min(32767, v.getInt16(o, true) + extra)), true);
      }
    }
    medidas.push({
      i: m.i, clave: m.clave, en: m.en, golpe: m.golpe, dur: r3(s.length / muestreo),
      sobreVoz: voz ? r1(db(objetivo / voz)) : null, sobreFondo: bajoFondo ? r1(db(objetivo / bajoFondo)) : null, aMano: m.volumen ?? 0,
    });
  }
  return { medidas, sinArchivo };
}

/** Baja la pista de la MÚSICA (se CAMBIA) en las bajadas de `bajadasDeMusica`. Pura salvo por cambiar `pcm`. */
export function aplicarBajadas(pcm, bajadas, muestreo = RENDER.muestreo) {
  if (!bajadas?.length || !pcm?.byteLength) return pcm;
  const total = Math.floor(pcm.byteLength / BYTES_MUESTRA);
  const v = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  for (const b of bajadas) {
    const ini = Math.max(0, Math.floor(b.desde * muestreo));
    const fin = Math.min(total, Math.ceil((b.hasta + 0.2) * muestreo));
    for (let i = ini; i < fin; i++) {
      const g = 10 ** (-bajadaEn([b], i / muestreo) / 20);
      if (g >= 1) continue;
      for (const canal of [0, 2]) {
        const o = i * BYTES_MUESTRA + canal;
        v.setInt16(o, Math.round(v.getInt16(o, true) * g), true);
      }
    }
  }
  return pcm;
}

/** Suma pistas PCM s16le del mismo largo en una nueva (lo que se pasaría de la escala se recorta). Pura. */
export function sumarPistas(...pistas) {
  const largo = Math.max(0, ...pistas.filter(Boolean).map((p) => p.byteLength));
  const out = new Uint8Array(largo);
  const o = new DataView(out.buffer);
  const vistas = pistas.filter((p) => p?.byteLength).map((p) => new DataView(p.buffer, p.byteOffset, p.byteLength));
  for (let k = 0; k + 1 < largo; k += 2) {
    let x = 0;
    for (const w of vistas) if (k + 1 < w.byteLength) x += w.getInt16(k, true);
    o.setInt16(k, Math.max(-32768, Math.min(32767, x)), true);
  }
  return out;
}

/**
 * El AUDIO por pistas: `habla` (la voz con el sonido de los clips, ya armada hasta el último cuadro), la `musica`
 * (decodificada; con su `volumen` en dB) y los efectos (`momentos` con sus `muestras`; `bajadas` de la música). Las
 * bajadas se aplican DESPUÉS de medir el fondo de cada efecto (el fondo es la música de antes, no la ya bajada).
 * → { mezcla, pistas: { habla, musica, efectos }, medidas, sinArchivo }. Pura.
 */
export function armarSonido({ habla, musica = null, volumen = 0, momentos = [], muestras = new Map(), bajadas = [], muestreo = RENDER.muestreo }) {
  const fondo = musica?.byteLength ? mezclarMusica(vacia(habla), musica, { muestreo, volumen, voz: habla }) : null;
  const efectos = momentos.length ? vacia(habla) : null;
  const { medidas, sinArchivo } = efectos ? mezclarColocados(efectos, momentos, muestras, { habla, fondo, muestreo }) : { medidas: [], sinArchivo: [] };
  if (fondo && medidas.length) aplicarBajadas(fondo, bajadas, muestreo);
  const mezcla = fondo || efectos ? sumarPistas(habla, fondo, efectos) : habla;
  return { mezcla, pistas: { habla, musica: fondo, efectos }, medidas, sinArchivo };
}
