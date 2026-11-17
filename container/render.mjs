// ============================================================
// El RENDER a mp4 del video animado, dentro del Container (Node + @napi-rs/canvas + ffmpeg de Debian)
//
//   1. El AUDIO: la toma de la locución decodificada a PCM, con los silencios de las escenas insertados y rellenada
//      hasta el último cuadro (`armarPcm`, src/lib/renderVideo.js), medida con loudnorm y llevada a -14 LUFS con una
//      ganancia fija (y un limitador si el pico se pasaría). Queda en AAC.
//   2. El VIDEO: cada cuadro lo dibuja el MISMO motor que la vista previa (dibujarFrame) en las medidas del formato y
//      sus píxeles van EN CRUDO (RGBA) a ffmpeg por una tubería, que los pasa a H.264 mientras el motor dibuja el
//      siguiente. Se probó mandar cada cuadro como JPEG (menos bytes por la tubería): costaba un 40 % más de CPU,
//      porque codificar un JPEG de 1080 × 1920 con grano es más caro que dibujar el cuadro (30 ms contra 1,3).
//   3. Los junta en un mp4 con `+faststart` (se reproduce mientras se baja).
//
// Todo en una carpeta temporal que se borra al terminar. Un render a la vez: el Container tiene dos núcleos y dos
// renders a la vez tardarían lo mismo que uno detrás de otro, con el doble de memoria.
// ============================================================

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { createCanvas } from "@napi-rs/canvas";
import { FORMATOS_VIDEO } from "../src/lib/videoEscenas.js";
import { dibujarFrame, videosEnInstante, usosDeVideo } from "../src/lib/motorVideo.js";
import { RENDER, cuadrosDelVideo, FILTRO_MEDIR, filtroDeNormalizar, leerLoudnorm } from "../src/lib/renderVideo.js";
import { Decodificador } from "./clips.mjs";
import { sonidoPorPistas } from "./efectos.mjs";

const FFMPEG = process.env.FFMPEG || "ffmpeg";

/** Corre ffmpeg con `args` → { proc, fin: { codigo, error (lo último de su stderr) } }. `conEntrada`: le llega stdin. */
function ffmpeg(args, { conEntrada = false } = {}) {
  // `-nostdin` sólo quita las órdenes por teclado: `pipe:0` sigue leyendo los cuadros.
  const proc = spawn(FFMPEG, ["-hide_banner", "-nostdin", "-y", ...args], {
    stdio: [conEntrada ? "pipe" : "ignore", "ignore", "pipe"],
  });
  let error = "";
  proc.stderr.on("data", (t) => { error = (error + t.toString()).slice(-20000); });
  const fin = new Promise((ok, mal) => {
    proc.on("error", (e) => mal(new Error(`No se pudo arrancar ffmpeg: ${e.message}`)));
    proc.on("close", (codigo) => ok({ codigo, error }));
  });
  return { proc, fin };
}

/**
 * Espera a que la tubería hacia ffmpeg se vacíe (o a que ffmpeg se cierre: entonces no se vaciará nunca). Quita la
 * escucha que no saltó: dejarla colgada en cada cuadro acumulaba cientos de escuchas en el proceso.
 */
function vaciada(proc) {
  return new Promise((ok) => {
    const fin = () => { proc.stdin.off("drain", fin); proc.off("close", fin); ok(); };
    proc.stdin.once("drain", fin);
    proc.once("close", fin);
  });
}

const falla = (que, r) => new Error(`${que} (ffmpeg ${r.codigo}): ${r.error.trim().split("\n").slice(-4).join(" | ")}`);

/** Decodifica un audio (MP3, WAV…) a PCM s16le estéreo al muestreo del render, con una cadena simple. → Uint8Array. */
async function decodificar(carpeta, nombre, bytes, que = "No se pudo leer el audio") {
  const entrada = join(carpeta, nombre);
  const crudo = join(carpeta, `${nombre}.pcm`);
  const muestreo = String(RENDER.muestreo);
  await writeFile(entrada, bytes);
  const d = await ffmpeg(["-i", entrada, "-vn", "-af", `aresample=${muestreo}`, "-ac", "2", "-ar", muestreo, "-c:a", "pcm_s16le", "-f", "s16le", crudo]).fin;
  if (d.codigo !== 0) throw falla(que, d);
  return new Uint8Array(await readFile(crudo));
}

/** `decodificar` atado a una carpeta temporal: (bytes, nombre, que) → PCM (lo que piden los efectos y la escucha). */
export const decodificadorEn = (carpeta) => (bytes, nombre, que) => decodificar(carpeta, nombre, bytes, que);

/** Mide un PCM del render con loudnorm (sin cambiarlo) → { input_i, input_tp, … } o null. */
export async function medirPcm(carpeta, pcm, nombre = "medir.pcm") {
  const pista = join(carpeta, nombre);
  await writeFile(pista, pcm);
  const m = await ffmpeg(["-f", "s16le", "-ar", String(RENDER.muestreo), "-ac", "2", "-i", pista, "-af", FILTRO_MEDIR, "-f", "null", "-"]).fin;
  return m.codigo === 0 ? leerLoudnorm(m.error) : null;
}

/**
 * El audio del video en `salida` (AAC) → { lufs, pico, antes } medidos tras normalizar (null si no se normalizó: sin voz,
 * clips ni música) y `efectos`: { cuantos, automaticos, sinSitio, avisos }.
 *
 *   1. El audio POR PISTAS (container/efectos.mjs, `sonidoPorPistas`): la toma se DECODIFICA sola, con una cadena simple
 *      (MP3 mono a 44,1 kHz → PCM estéreo a 48 kHz; una cadena simple sí sabe rehacerse si el archivo cambia de
 *      parámetros a la mitad), con sus silencios hasta el último cuadro exacto (`armarPcm`); encima, el SONIDO de los
 *      clips de video que lo llevan (`clips`), la MÚSICA con ducking y fundido (`musica`: { audio, volumen }) y los
 *      EFECTOS (la lista `colocados`, o los automáticos; del catálogo o de la biblioteca —`libreria`, `propios`—), cada
 *      uno en su pista y sumados al final.
 *   2. El volumen: loudnorm MIDE, la segunda pasada aplica una ganancia fija (y un limitador si el pico se pasaría) y
 *      una tercera mide lo que quedó.
 *
 * La segunda pasada de loudnorm (`measured_*`, en lineal) hacía morir al ffmpeg 5.1 de la imagen con «Error
 * reinitializing filters! | Failed to inject frame into filter network: Invalid argument» cada vez que no podía ir en
 * lineal y pasaba a su modo dinámico: con una voz de verdad, casi siempre.
 */
export async function audioDelVideo(carpeta, { audio, linea, total, salida, guion = null, efectos = false, musica = null, clips = [], colocados = [], propios = {}, libreria = {} }) {
  const muestreo = String(RENDER.muestreo);
  const s = await sonidoPorPistas({ audio, linea, total, guion, efectos, colocados, propios, libreria, musica, clips, decodificar: decodificadorEn(carpeta) });
  const { toma, conClips } = s;
  const pcm = s.mezcla;
  const resumenEfectos = { cuantos: s.medidas.length, automaticos: s.efectos.automaticos, sinSitio: s.efectos.sinSitio.length, avisos: s.efectos.avisos };
  const pista = join(carpeta, "pista.pcm");
  await writeFile(pista, pcm);
  const leer = ["-f", "s16le", "-ar", muestreo, "-ac", "2", "-i", pista];
  const codificar = ["-c:a", "aac", "-b:a", `${RENDER.kbpsAudio}k`, "-ar", muestreo, salida];
  // Sin voz ni clips que suenen, el audio se codifica tal cual (silencio o sólo efectos)… salvo que lleve MÚSICA: una
  // foto con música (src/lib/conMusica.js) es sólo la música, que sin voz que la mida queda muy baja; se normaliza a
  // -14 LUFS como una locución.
  if (!toma.length && !conClips && !musica?.audio?.length) {
    const r = await ffmpeg([...leer, ...codificar]).fin;
    if (r.codigo !== 0) throw falla("No se pudo armar el audio", r);
    return { lufs: null, pico: null, antes: null, efectos: resumenEfectos };
  }
  // Primera pasada: medir.
  const m = await ffmpeg([...leer, "-af", FILTRO_MEDIR, "-f", "null", "-"]).fin;
  if (m.codigo !== 0) throw falla("No se pudo medir el audio de la locución", m);
  const medido = leerLoudnorm(m.error);
  // Segunda: la ganancia (y el limitador). Una toma muda (o ilegible) no se normaliza: se codifica tal cual.
  const r = await ffmpeg([...leer, ...(medido ? ["-af", filtroDeNormalizar(medido)] : []), ...codificar]).fin;
  if (r.codigo !== 0) throw falla("No se pudo armar el audio", r);
  if (!medido) return { lufs: null, pico: null, antes: null, efectos: resumenEfectos };
  // Tercera: lo que quedó (lo que se apunta en el render y vigila la prueba). Si no se puede medir, el audio vale igual.
  const f = await ffmpeg(["-i", salida, "-af", FILTRO_MEDIR, "-f", "null", "-"]).fin;
  const final = f.codigo === 0 ? leerLoudnorm(f.error) : null;
  return { lufs: final?.input_i ?? null, pico: final?.input_tp ?? null, antes: medido.input_i, efectos: resumenEfectos };
}

/**
 * Renderiza el video → { mp4 (Buffer), duracion, cuadros, ancho, alto, ms: { audio, video, total }, audio: {lufs…} }.
 * `base`: lo de `preparar()` del servidor (guion, linea, formato, paleta, recursos, fuentes). `audio`: los bytes de la
 * toma (o null: silencio).
 */
export async function renderizar(base, { audio = null, musica = null, efectos = false, colocados = [], propios = {}, libreria = {}, fps = RENDER.fps } = {}) {
  const inicio = Date.now();
  const { ancho: W, alto: H } = FORMATOS_VIDEO[base.formato];
  const total = base.linea.total;
  const cuadros = cuadrosDelVideo(total, fps);
  const duracion = cuadros / fps;
  const carpeta = await mkdtemp(join(tmpdir(), "render-"));
  try {
    const sonido = join(carpeta, "audio.m4a");
    const usos = usosDeVideo(base.guion, base.linea).filter((u) => base.infoVideos?.has(u.archivo));
    const clips = usos.filter((u) => u.sonido && base.infoVideos.get(u.archivo)?.audio);
    const medidas = await audioDelVideo(carpeta, { audio, linea: base.linea, total: duracion, salida: sonido, guion: base.guion, efectos, musica, clips, colocados, propios, libreria });
    const tAudio = Date.now() - inicio;

    const salida = join(carpeta, "video.mp4");
    const { proc, fin } = ffmpeg([
      "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-framerate", String(fps), "-i", "pipe:0",
      "-i", sonido,
      "-map", "0:v:0", "-map", "1:a:0",
      // De RGB al estándar de video en HD (BT.709, rango de TV), y dicho en el archivo: sin eso, cada reproductor
      // adivina y los colores del kit salen corridos.
      "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", String(RENDER.crf),
      // Tope de bitrate: con fondos de imagen y grano, el crf solo subía a decenas de Mbps (más de 100 MB en 100 s) y
      // Instagram admite como mucho 25 Mbps en un reel.
      "-maxrate", `${RENDER.kbpsVideoMax}k`, "-bufsize", `${RENDER.kbpsVideoMax * 2}k`,
      "-profile:v", "high", "-r", String(fps),
      "-c:a", "copy", "-t", duracion.toFixed(3), "-movflags", "+faststart", salida,
    ], { conEntrada: true });
    let roto = null;
    proc.stdin.on("error", (e) => { roto = e; });

    const lienzo = createCanvas(W, H);
    const ctx = lienzo.getContext("2d");
    // `data()` devuelve una COPIA de los píxeles: se puede seguir dibujando mientras la tubería la lleva. Si ffmpeg va
    // más lento, se espera a que la tubería se vacíe (no se acumulan cuadros de 8 MB en memoria).
    // Los clips: un decodificador por USO (una capa en su escena), abierto al primer cuadro que lo pide y cerrado cuando
    // deja de verse. Antes de dibujar cada cuadro se pone su cuadro de video en `base.cuadros` (el motor no espera nada).
    const decos = new Map();
    try {
      for (let i = 0; i < cuadros && !roto; i++) {
        const t = i / fps;
        if (usos.length) {
          const pide = videosEnInstante(base.guion, base.linea, t).filter((v) => base.infoVideos.has(v.archivo));
          for (const [id, d] of decos) if (!pide.some((v) => v.id === id)) { d.cerrar(); decos.delete(id); }
          base.cuadros.clear();
          for (const v of pide) {
            if (!decos.has(v.id)) decos.set(v.id, new Decodificador(v.archivo, base.infoVideos.get(v.archivo), v.segundo, fps));
            const l = await decos.get(v.id).en(v.segundo);
            if (l) base.cuadros.set(v.id, l);
          }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        dibujarFrame(ctx, { guion: base.guion, linea: base.linea, t, formato: base.formato, paleta: base.paleta, recursos: base.recursos, fuentes: base.fuentes });
        if (!proc.stdin.write(lienzo.data())) await vaciada(proc);
      }
    } finally {
      for (const d of decos.values()) d.cerrar();
    }
    proc.stdin.end();
    const r = await fin;
    if (roto || r.codigo !== 0) throw falla("No se pudo codificar el video", r);
    const mp4 = await readFile(salida);
    const ms = { audio: tAudio, video: Date.now() - inicio - tAudio, total: Date.now() - inicio };
    return { mp4: Buffer.from(mp4), duracion, cuadros, ancho: W, alto: H, fps, ms, audio: medidas };
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}
