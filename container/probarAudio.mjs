// ============================================================
// La prueba del AUDIO del render, DENTRO de la imagen (con su ffmpeg de Debian): `docker exec video node
// container/probarAudio.mjs`. Las tomas son como las de verdad: MP3 mono a 44,1 kHz y 128 kb/s (lo que devuelve
// ElevenLabs), con y sin pausas, y con una pausa DESPUÉS del final de la toma (la última palabra de la alineación puede
// acabar unos milisegundos más tarde que el archivo). Además, una toma cuyo muestreo cambia a la mitad, y los EFECTOS de
// la biblioteca de sonido (un MP3 y un WAV subidos) en vez de los sintetizados.
// ============================================================

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { audioDelVideo } from "./render.mjs";
import { RENDER } from "../src/lib/renderVideo.js";
import { validarGuion, lineaDeTiempo } from "../src/lib/videoEscenas.js";
import { EJEMPLO_GUION } from "../src/lib/videoFormatoIA.js";
import { momentosDeEfectos } from "../src/lib/efectosSonido.js";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const carpeta = await mkdtemp(join(tmpdir(), "probar-audio-"));
let mal = 0;

/** Un MP3 de `segundos` de un tono que sube y baja (como una voz), mono, al muestreo dado. */
function mp3(nombre, segundos, muestreo = 44100, volumen = "0.3+0.2*sin(2*PI*3*t)") {
  const salida = join(carpeta, nombre);
  const r = spawnSync(FFMPEG, ["-hide_banner", "-y", "-f", "lavfi", "-i",
    `sine=frequency=220:sample_rate=${muestreo}:duration=${segundos},volume='${volumen}':eval=frame`,
    "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", salida], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`no se pudo hacer ${nombre}: ${r.stderr.slice(-400)}`);
  return salida;
}

/** Un WAV de `segundos` de un tono corto que cae (como un «pop» subido), mono, a 48 kHz. */
function wav(nombre, segundos) {
  const salida = join(carpeta, nombre);
  const r = spawnSync(FFMPEG, ["-hide_banner", "-y", "-f", "lavfi", "-i",
    `sine=frequency=880:sample_rate=48000:duration=${segundos},volume='exp(-t*18)':eval=frame`,
    "-ac", "1", "-c:a", "pcm_s16le", salida], { encoding: "utf8" });
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

async function caso(titulo, audio, silencios, total, { callado = null, suena = null, guion = null, linea = null, efectos = false, musica = null, efectosPropios = null } = {}) {
  const salida = join(carpeta, `${titulo.replace(/\W+/g, "-")}.m4a`);
  try {
    const m = await audioDelVideo(carpeta, { audio, linea: linea ?? { silencios }, total, salida, guion, efectos, musica, efectosPropios });
    const dur = duracion(salida);
    if (!(Math.abs(dur - total) < 0.06)) throw new Error(`el audio dura ${dur} s, no ${total}`);
    // Con voz, o con sólo música (una foto con música): normalizado a -14 LUFS y sin pasarse de pico.
    const normalizado = audio || musica;
    if (normalizado && !(Math.abs((m?.lufs ?? NaN) - RENDER.lufs) <= 1)) throw new Error(`quedó en ${m?.lufs} LUFS`);
    if (normalizado && !(m?.pico <= RENDER.pico + 0.5)) throw new Error(`el pico quedó en ${m?.pico} dB`);
    // La pausa está donde tiene que estar: callada en su sitio y con voz justo antes (sin contar lo que AAC emborrona).
    if (callado && nivel(salida, ...callado) > 0.003) throw new Error(`entre ${callado.join(" y ")} s debería haber silencio`);
    if (suena && nivel(salida, ...suena) < 0.02) throw new Error(`entre ${suena.join(" y ")} s debería sonar la voz`);
    console.log(`✓ ${titulo} (${dur.toFixed(2)} s${m ? `, ${m.lufs} LUFS, pico ${m.pico} dB` : ""})`);
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
  // Como una voz de verdad: bajita y con golpes fuertes (la ganancia sola llevaría el pico por encima de -1,5 dB, así
  // que entra el limitador).
  const conPicos = await readFile(mp3("picos.mp3", 20, 44100, "if(lt(mod(t,0.7),0.03),0.9,0.04)"));
  await caso("Voz con picos (limitador) y una pausa", conPicos, [{ en: 6, dur: 0.5 }], 20.6, { callado: [6.05, 6.45] });
  // Dos MP3 pegados con muestreos distintos: el decodificador cambia de parámetros a la mitad.
  const pegado = Buffer.concat([await readFile(mp3("a.mp3", 6, 44100)), await readFile(mp3("b.mp3", 6, 22050))]);
  await caso("MP3 que cambia de muestreo a la mitad", pegado, [{ en: 3, dur: 0.5 }], 12.6);
  await caso("Sin voz", null, [], 5);
  // El guion de ejemplo con los efectos y una música corta (se repite) por debajo: sigue en -14 LUFS y en su duración;
  // en el silencio de la pausa ya no hay silencio total (suena la música) pero sí mucho menos que la voz.
  const g = validarGuion(JSON.parse(JSON.stringify(EJEMPLO_GUION))).guion;
  const l = lineaDeTiempo(g, null);
  const vozEjemplo = await readFile(mp3("voz-ejemplo.mp3", Math.max(1, l.total - 1)));
  const tema = await readFile(mp3("tema.mp3", 4, 44100, "0.5"));
  if (!momentosDeEfectos(g, l).length) { mal++; console.error("✗ el ejemplo debería tener efectos (transiciones o sellos)"); }
  await caso("Con efectos y música de fondo (ducking y fundido)", vozEjemplo, l.silencios, l.total, {
    guion: g, linea: l, efectos: true, musica: { audio: tema, volumen: 0 },
  });
  // Los EFECTOS de la biblioteca de sonido (subidos por la agencia: un MP3 con silencio delante y un WAV corto), en vez
  // del whoosh y del pop sintetizados: el audio sigue en -14 LUFS y en su duración, y en el instante de un sello suena.
  const whooshSubido = await readFile(mp3("whoosh-subido.mp3", 1.2, 44100, "if(lt(t,0.3),0,0.6)"));
  const popSubido = await readFile(wav("pop-subido.wav", 0.25));
  const momentos = momentosDeEfectos(g, l);
  const pop = momentos.find((x) => x.tipo === "pop");
  await caso("Con efectos SUBIDOS (biblioteca de sonido) y música", vozEjemplo, l.silencios, l.total, {
    guion: g, linea: l, efectos: true, musica: { audio: tema, volumen: 0 }, efectosPropios: { whoosh: whooshSubido, pop: popSubido },
    ...(pop ? { suena: [pop.en, pop.en + 0.2] } : {}),
  });
  // Uno que no se puede leer no tumba el audio: suena el sintetizado.
  await caso("Con un efecto subido que no se puede leer (va el sintetizado)", vozEjemplo, l.silencios, l.total, {
    guion: g, linea: l, efectos: true, efectosPropios: { pop: Buffer.from("no es un audio") },
  });
  // Una foto con música (src/lib/conMusica.js): sin voz, la escena entera es un silencio insertado y debajo sólo la
  // música, repetida; tiene que oírse a -14 LUFS (sin voz que la mida quedaba muy baja) y sonar en medio.
  await caso("Sólo música, sin voz (una foto con música)", null, [{ en: 0, dur: 10 }], 10, { musica: { audio: tema, volumen: 0 }, suena: [4, 6] });
} finally {
  await rm(carpeta, { recursive: true, force: true });
}
if (mal) {
  console.error(`${mal} caso(s) fallaron.`);
  process.exit(1);
}
console.log("Audio: todo bien.");
