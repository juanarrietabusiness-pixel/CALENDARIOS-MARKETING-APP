// ============================================================
// El RENDER a mp4 del video animado, dentro del Container (Node + @napi-rs/canvas + ffmpeg de Debian)
//
//   1. El AUDIO: la toma de la locución con los silencios de las escenas insertados y rellenada hasta el último
//      cuadro (`filtroDeAudio`, src/lib/renderVideo.js), medida con loudnorm y vuelta a pasar en lineal hasta -14 LUFS.
//      Queda en AAC.
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
import { dibujarFrame } from "../src/lib/motorVideo.js";
import { RENDER, cuadrosDelVideo, tramosDeAudio, filtroDeAudio, leerLoudnorm } from "../src/lib/renderVideo.js";

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

/** El audio del video en `salida` (AAC) → { lufs, pico } medidos tras normalizar, o null sin voz. */
export async function audioDelVideo(carpeta, { audio, linea, total, salida }) {
  const conVoz = Boolean(audio?.length);
  const entrada = join(carpeta, "voz");
  if (conVoz) await writeFile(entrada, audio);
  const tramos = tramosDeAudio(linea.silencios);
  const base = conVoz ? ["-i", entrada] : [];
  const codificar = ["-map", "[mezcla]", "-c:a", "aac", "-b:a", `${RENDER.kbpsAudio}k`, "-ar", String(RENDER.muestreo), salida];
  if (!conVoz) {
    const r = await ffmpeg([...base, "-filter_complex", filtroDeAudio(tramos, total, { conVoz }), ...codificar]).fin;
    if (r.codigo !== 0) throw falla("No se pudo armar el audio", r);
    return null;
  }
  // Primera pasada: medir.
  const m = await ffmpeg([...base, "-filter_complex", filtroDeAudio(tramos, total, { normalizar: { medir: true } }), "-map", "[mezcla]", "-f", "null", "-"]).fin;
  if (m.codigo !== 0) throw falla("No se pudo leer el audio de la locución", m);
  const medido = leerLoudnorm(m.error);
  // Una toma muda (o ilegible) no se normaliza: se arma tal cual.
  const r = await ffmpeg([...base, "-filter_complex", filtroDeAudio(tramos, total, { normalizar: medido }), ...codificar]).fin;
  if (r.codigo !== 0) throw falla("No se pudo armar el audio", r);
  const final = leerLoudnorm(r.error);
  return final ? { lufs: final.output_i ?? null, pico: final.output_tp ?? null, antes: medido?.input_i ?? null } : null;
}

/**
 * Renderiza el video → { mp4 (Buffer), duracion, cuadros, ancho, alto, ms: { audio, video, total }, audio: {lufs…} }.
 * `base`: lo de `preparar()` del servidor (guion, linea, formato, paleta, recursos, fuentes). `audio`: los bytes de la
 * toma (o null: silencio).
 */
export async function renderizar(base, { audio = null, fps = RENDER.fps } = {}) {
  const inicio = Date.now();
  const { ancho: W, alto: H } = FORMATOS_VIDEO[base.formato];
  const total = base.linea.total;
  const cuadros = cuadrosDelVideo(total, fps);
  const duracion = cuadros / fps;
  const carpeta = await mkdtemp(join(tmpdir(), "render-"));
  try {
    const sonido = join(carpeta, "audio.m4a");
    const medidas = await audioDelVideo(carpeta, { audio, linea: base.linea, total: duracion, salida: sonido });
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
      "-c:v", "libx264", "-preset", "veryfast", "-crf", String(RENDER.crf), "-profile:v", "high", "-r", String(fps),
      "-c:a", "copy", "-t", duracion.toFixed(3), "-movflags", "+faststart", salida,
    ], { conEntrada: true });
    let roto = null;
    proc.stdin.on("error", (e) => { roto = e; });

    const lienzo = createCanvas(W, H);
    const ctx = lienzo.getContext("2d");
    // `data()` devuelve una COPIA de los píxeles: se puede seguir dibujando mientras la tubería la lleva. Si ffmpeg va
    // más lento, se espera a que la tubería se vacíe (no se acumulan cuadros de 8 MB en memoria).
    for (let i = 0; i < cuadros && !roto; i++) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      dibujarFrame(ctx, { guion: base.guion, linea: base.linea, t: i / fps, formato: base.formato, paleta: base.paleta, recursos: base.recursos, fuentes: base.fuentes });
      if (!proc.stdin.write(lienzo.data())) await vaciada(proc);
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
