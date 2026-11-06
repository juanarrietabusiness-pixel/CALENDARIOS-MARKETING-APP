// ============================================================
// Los GOLPES de una canción: el BPM y cuándo suena cada golpe (puro: lo usan el Container, el Worker y la pantalla)
//
// «Video con tu canción» sincroniza la LETRA (qué palabra se canta cuándo), pero el video también tiene que ir con la
// MÚSICA: los cortes de escena y las palabras que entran de golpe caen mejor en un golpe del ritmo. El Container
// decodifica la canción con ffmpeg a PCM mono (`MUESTREO_GOLPES`) y esto la analiza en JS, sin librerías:
//
//   · la ENVOLVENTE de ataques: la energía de la señal derivada (lo que cambia de golpe pesa más que lo que suena
//     sostenido) por ventanas cortas, en logaritmo, y su subida (sólo lo que sube) de una ventana a la siguiente;
//   · los GOLPES: los picos de esa envolvente que pasan de su media local (un umbral que se adapta a lo fuerte de cada
//     parte), separados al menos `SEPARACION_MINIMA`;
//   · el BPM: la autocorrelación de la envolvente en el tramo de tempos de una canción (60–180), el de más fuerza, con
//     preferencia por el tempo «de bailar» entre 80 y 160 (un medio o un doble tempo se lleva a ese tramo).
//
// Es una detección por energía, no un análisis musical: en una balada sin percusión los golpes salen pocos o flojos, y
// lo dice `confianza`. Se guardan con la locución de la canción (`golpes`, `bpm`) y los usan la IA que diseña las escenas
// (los golpes de cada línea) y el motor (`pulso` de una capa: un 4 % más grande en cada golpe).
// ============================================================

/** El muestreo al que el Container decodifica la canción para analizarla (sobra para ver golpes). */
export const MUESTREO_GOLPES = 11025;
/** La ventana y el salto del análisis, en muestras (a 11 025 Hz: unos 46 y 12 ms). */
export const VENTANA_GOLPES = 512;
export const SALTO_GOLPES = 128;
/** Dos golpes no están más cerca que esto (s). */
export const SEPARACION_MINIMA = 0.12;
/** Lo más que se guardan (una canción de 3 minutos a 180 BPM son ~540 tiempos). */
export const MAX_GOLPES = 1200;
/** El tramo de tempos que se busca y el que se prefiere. */
const TEMPO = Object.freeze({ min: 60, max: 180, comodo: [80, 160] });

const redondo = (x) => Math.round(x * 1000) / 1000;

/**
 * La envolvente de ataques de una señal mono (`pcm`: Float32Array o lista de números entre −1 y 1). → { flujo
 * (Float32Array, una por salto), paso (s por salto), desfase (s) }. Un ataque se nota en la ventana en cuanto ENTRA en
 * ella (por su final): `desfase` lleva el número de ventana al segundo del ataque (sin él, salían 40 ms antes). Pura.
 */
export function envolventeDeAtaques(pcm, muestreo = MUESTREO_GOLPES, { ventana = VENTANA_GOLPES, salto = SALTO_GOLPES } = {}) {
  const n = pcm?.length ?? 0;
  const cuantas = n > ventana ? Math.floor((n - ventana) / salto) + 1 : 0;
  const energia = new Float32Array(cuantas);
  for (let k = 0; k < cuantas; k++) {
    let e = 0;
    const desde = k * salto;
    for (let i = desde + 1; i < desde + ventana; i++) { const d = pcm[i] - pcm[i - 1]; e += d * d; }
    energia[k] = Math.log(1e-9 + e / ventana);
  }
  const flujo = new Float32Array(cuantas);
  for (let k = 1; k < cuantas; k++) flujo[k] = Math.max(0, energia[k] - energia[k - 1]);
  return { flujo, paso: salto / muestreo, desfase: (ventana - salto / 2) / muestreo };
}

/**
 * Los golpes de una envolvente: los picos que pasan de su media local (±`media` s) más `sobre` veces su desviación, y
 * de un mínimo absoluto, separados al menos `SEPARACION_MINIMA`. → [{ t (s), fuerza (0–1) }]. Pura.
 */
export function picosDeAtaque(flujo, paso, { media = 0.5, sobre = 1.0, separacion = SEPARACION_MINIMA, desfase = 0 } = {}) {
  const n = flujo?.length ?? 0;
  if (!n) return [];
  const r = Math.max(1, Math.round(media / paso));
  // Sumas acumuladas para la media y la varianza de cada ventana sin recorrerla entera.
  const s1 = new Float64Array(n + 1);
  const s2 = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { s1[i + 1] = s1[i] + flujo[i]; s2[i + 1] = s2[i] + flujo[i] * flujo[i]; }
  let maximo = 0;
  for (let i = 0; i < n; i++) if (flujo[i] > maximo) maximo = flujo[i];
  if (!(maximo > 0)) return [];
  const minimo = maximo * 0.08;
  const vecinos = Math.max(1, Math.round(0.05 / paso));
  const picos = [];
  for (let i = 1; i < n - 1; i++) {
    const v = flujo[i];
    if (v < minimo) continue;
    const a = Math.max(0, i - r); const b = Math.min(n, i + r + 1);
    const m = (s1[b] - s1[a]) / (b - a);
    const desv = Math.sqrt(Math.max(0, (s2[b] - s2[a]) / (b - a) - m * m));
    if (v <= m + sobre * desv) continue;
    let esPico = true;
    for (let j = Math.max(0, i - vecinos); j <= Math.min(n - 1, i + vecinos); j++) if (flujo[j] > v || (flujo[j] === v && j < i)) { esPico = false; break; }
    if (esPico) picos.push({ t: i * paso + desfase, fuerza: v / maximo });
  }
  // Separados: de dos demasiado cerca, se queda el más fuerte.
  const salida = [];
  for (const p of picos) {
    const ult = salida.at(-1);
    if (ult && p.t - ult.t < separacion) { if (p.fuerza > ult.fuerza) salida[salida.length - 1] = p; continue; }
    salida.push(p);
  }
  return salida;
}

/**
 * El BPM de una envolvente por su autocorrelación entre 60 y 180 BPM, llevado al tramo cómodo (80–160) si salió a
 * medio o a doble tempo. → { bpm, confianza (0–1) } o { bpm: 0, confianza: 0 }. Pura.
 */
export function tempoDe(flujo, paso) {
  const n = flujo?.length ?? 0;
  const lagMin = Math.max(1, Math.floor(60 / TEMPO.max / paso));
  const lagMax = Math.min(n - 1, Math.ceil(60 / TEMPO.min / paso));
  if (n < 8 || lagMax <= lagMin) return { bpm: 0, confianza: 0 };
  let media = 0;
  for (let i = 0; i < n; i++) media += flujo[i];
  media /= n;
  const x = Float64Array.from(flujo, (v) => v - media);
  let cero = 0;
  for (let i = 0; i < n; i++) cero += x[i] * x[i];
  if (!(cero > 0)) return { bpm: 0, confianza: 0 };
  const ac = new Float64Array(lagMax + 2);
  for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) {
    if (lag < 1 || lag >= n) continue;
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
    ac[lag] = s / cero;
  }
  let mejor = lagMin;
  for (let lag = lagMin; lag <= lagMax; lag++) if (ac[lag] > ac[mejor]) mejor = lag;
  // El pico con interpolación parabólica: un salto de 12 ms son ±2 BPM a 120.
  const [a, b, c] = [ac[mejor - 1] ?? 0, ac[mejor], ac[mejor + 1] ?? 0];
  const den = a - 2 * b + c;
  const fino = den !== 0 ? mejor + 0.5 * (a - c) / den : mejor;
  let bpm = 60 / (fino * paso);
  while (bpm < TEMPO.comodo[0]) bpm *= 2;
  while (bpm > TEMPO.comodo[1]) bpm /= 2;
  return { bpm: Math.round(bpm), confianza: Math.max(0, Math.min(1, b)) };
}

/**
 * El ritmo de una canción ya decodificada (mono, `muestreo` Hz): { bpm, confianza, golpes: [s] } (los golpes en
 * segundos de la canción, con tres decimales, como mucho `MAX_GOLPES`). Pura.
 */
export function analizarRitmo(pcm, muestreo = MUESTREO_GOLPES) {
  const { flujo, paso, desfase } = envolventeDeAtaques(pcm, muestreo);
  const { bpm, confianza } = tempoDe(flujo, paso);
  const golpes = picosDeAtaque(flujo, paso, { desfase }).slice(0, MAX_GOLPES).map((p) => redondo(p.t));
  return { bpm, confianza: Math.round(confianza * 100) / 100, golpes };
}

/** PCM s16le (bytes) → Float32Array entre −1 y 1. Pura. */
export function pcmDeS16(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  const vista = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = Math.floor(b.byteLength / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = vista.getInt16(i * 2, true) / 32768;
  return out;
}

/** Los golpes guardados, limpios: números en orden y dentro de [0, `duracion`]. Pura. */
export function limpiarGolpes(golpes, duracion = Infinity) {
  return (Array.isArray(golpes) ? golpes : []).map(Number).filter((t) => Number.isFinite(t) && t >= 0 && t <= duracion)
    .sort((a, b) => a - b).slice(0, MAX_GOLPES);
}

/** Los golpes que caen dentro de [desde, hasta). Pura. */
export const golpesEnTramo = (golpes = [], desde, hasta) => golpes.filter((t) => t >= desde && t < hasta);

/** La línea de tiempo con los golpes de la canción (los lee el motor para el `pulso`). Sin golpes, la misma. Pura. */
export const conGolpes = (linea, golpes) => (Array.isArray(golpes) && golpes.length ? { ...linea, golpes } : linea);

/** Lo que crece una capa con `pulso` en cada golpe, y lo que tarda en volver. */
export const PULSO = Object.freeze({ escala: 0.04, dura: 0.18 });

/**
 * La escala de una capa con `pulso` en el instante `t`: 1 + 4 % justo en el golpe, que vuelve a 1 en `PULSO.dura`. Busca
 * el último golpe con una búsqueda binaria (cada cuadro lo pide). Pura.
 */
export function pulsoEn(golpes, t) {
  if (!Array.isArray(golpes) || !golpes.length) return 1;
  let a = 0; let b = golpes.length - 1;
  if (t < golpes[0]) return 1;
  while (a < b) { const m = (a + b + 1) >> 1; if (golpes[m] <= t) a = m; else b = m - 1; }
  const dt = t - golpes[a];
  return dt < PULSO.dura ? 1 + PULSO.escala * (1 - dt / PULSO.dura) : 1;
}
