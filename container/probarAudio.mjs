// ============================================================
// La prueba del AUDIO del render, DENTRO de la imagen (con su ffmpeg de Debian): `docker exec video node
// container/probarAudio.mjs`. Las tomas son como las de verdad: MP3 mono a 44,1 kHz y 128 kb/s (lo que devuelve
// ElevenLabs), con y sin pausas, y con una pausa DESPUÉS del final de la toma (la última palabra de la alineación puede
// acabar unos milisegundos más tarde que el archivo). Además, una toma cuyo muestreo cambia a la mitad.
// ============================================================

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { audioDelVideo } from "./render.mjs";
import { RENDER } from "../src/lib/renderVideo.js";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const carpeta = await mkdtemp(join(tmpdir(), "probar-audio-"));
let mal = 0;

/** Un MP3 de `segundos` de un tono que sube y baja (como una voz), mono, al muestreo dado. */
function mp3(nombre, segundos, muestreo = 44100) {
  const salida = join(carpeta, nombre);
  const r = spawnSync(FFMPEG, ["-hide_banner", "-y", "-f", "lavfi", "-i",
    `sine=frequency=220:sample_rate=${muestreo}:duration=${segundos},volume='0.3+0.2*sin(2*PI*3*t)':eval=frame`,
    "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", salida], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`no se pudo hacer ${nombre}: ${r.stderr.slice(-400)}`);
  return salida;
}

/** La duración de un archivo de audio según ffprobe… o ffmpeg (la imagen no tiene por qué traer ffprobe). */
function duracion(archivo) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", archivo, "-f", "null", "-"], { encoding: "utf8" });
  const t = [...r.stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
  return t ? Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]) : NaN;
}

/** El nivel (RMS, 0–1) del audio de `archivo` entre `desde` y `hasta` segundos. */
function nivel(archivo, desde, hasta) {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", archivo, "-ss", String(desde), "-t", String(hasta - desde), "-ac", "1", "-f", "s16le", "-"], { maxBuffer: 1 << 26 });
  const b = Buffer.from(r.stdout ?? []);
  let suma = 0;
  for (let i = 0; i + 1 < b.length; i += 2) suma += (b.readInt16LE(i) / 32768) ** 2;
  return b.length ? Math.sqrt(suma / (b.length / 2)) : 0;
}

async function caso(titulo, audio, silencios, total, { callado = null, suena = null } = {}) {
  const salida = join(carpeta, `${titulo.replace(/\W+/g, "-")}.m4a`);
  try {
    const m = await audioDelVideo(carpeta, { audio, linea: { silencios }, total, salida });
    const dur = duracion(salida);
    if (!(Math.abs(dur - total) < 0.06)) throw new Error(`el audio dura ${dur} s, no ${total}`);
    if (audio && !(Math.abs((m?.lufs ?? NaN) - RENDER.lufs) <= 1)) throw new Error(`quedó en ${m?.lufs} LUFS`);
    // La pausa está donde tiene que estar: callada en su sitio y con voz justo antes (sin contar lo que AAC emborrona).
    if (callado && nivel(salida, ...callado) > 0.003) throw new Error(`entre ${callado.join(" y ")} s debería haber silencio`);
    if (suena && nivel(salida, ...suena) < 0.02) throw new Error(`entre ${suena.join(" y ")} s debería sonar la voz`);
    console.log(`✓ ${titulo} (${dur.toFixed(2)} s${m ? `, ${m.lufs} LUFS` : ""})`);
  } catch (e) {
    mal++;
    console.error(`✗ ${titulo}: ${e.message}`);
  }
}

try {
  const voz = await readFile(mp3("voz.mp3", 47.647));
  await caso("MP3 sin pausas", voz, [], 47.7);
  await caso("MP3 con una pausa en medio", voz, [{ en: 4.2, dur: 0.4 }], 48.1, { suena: [3.9, 4.15], callado: [4.25, 4.55] });
  await caso("MP3 con pausa en medio y al final (después del archivo)", voz, [{ en: 4.2, dur: 0.4 }, { en: 47.68, dur: 0.5 }], 48.6, { callado: [48.15, 48.55] });
  await caso("MP3 con pausa justo al final", voz, [{ en: 47.6, dur: 0.5 }], 48.15);
  await caso("MP3 con pausa al principio", voz, [{ en: 0, dur: 0.6 }], 48.3, { callado: [0.05, 0.55], suena: [0.7, 1] });
  await caso("MP3 con muchas pausas", voz, [0.4, 0.8, 0.3, 1.2, 0.5].map((dur, i) => ({ en: 5 + i * 8, dur })), 50.9);
  // Dos MP3 pegados con muestreos distintos: el decodificador cambia de parámetros a la mitad.
  const pegado = Buffer.concat([await readFile(mp3("a.mp3", 6, 44100)), await readFile(mp3("b.mp3", 6, 22050))]);
  await caso("MP3 que cambia de muestreo a la mitad", pegado, [{ en: 3, dur: 0.5 }], 12.6);
  await caso("Sin voz", null, [], 5);
} finally {
  await rm(carpeta, { recursive: true, force: true });
}
if (mal) {
  console.error(`${mal} caso(s) fallaron.`);
  process.exit(1);
}
console.log("Audio: todo bien.");
