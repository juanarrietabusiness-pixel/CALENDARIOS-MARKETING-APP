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
import { RENDER, cuadrosDelVideo, tramosDeAudio, armarPcm, FILTRO_MEDIR, filtroDeNormalizar, leerLoudnorm } from "../src/lib/renderVideo.js";
import { momentosDeEfectos, mezclarEfectos, muestrasDeEfecto } from "../src/lib/efectosSonido.js";
import { mezclarMusica, mezclarClip } from "../src/lib/sonidoVideo.js";
import { Decodificador, audioDe } from "./clips.mjs";

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
async function decodificar(carpeta, nombre, bytes, que) {
  const entrada = join(carpeta, nombre);
  const crudo = join(carpeta, `${nombre}.pcm`);
  const muestreo = String(RENDER.muestreo);
  await writeFile(entrada, bytes);
  const d = await ffmpeg(["-i", entrada, "-vn", "-af", `aresample=${muestreo}`, "-ac", "2", "-ar", muestreo, "-c:a", "pcm_s16le", "-f", "s16le", crudo]).fin;
  if (d.codigo !== 0) throw falla(que, d);
  return new Uint8Array(await readFile(crudo));
}

/**
 * Los efectos de la biblioteca (`{ whoosh?, pop? }`, sus bytes) decodificados a muestras. Uno que no se puede leer no
 * tumba el audio: suena el sintetizado. → { whoosh?, pop? } (Float32Array).
 */
async function efectosDeLaBiblioteca(carpeta, efectosPropios) {
  const out = {};
  for (const tipo of ["whoosh", "pop"]) {
    const bytes = efectosPropios?.[tipo];
    if (!bytes?.length) continue;
    try {
      const s = muestrasDeEfecto(await decodificar(carpeta, `efecto-${tipo}`, bytes, "No se pudo leer el efecto"), RENDER.muestreo);
      if (s.length) out[tipo] = s;
    } catch (e) {
      console.error(`render: el efecto ${tipo} no se pudo leer, va el sintetizado:`, e?.message ?? e);
    }
  }
  return out;
}

/**
 * El audio del video en `salida` (AAC) → { lufs, pico, antes } medidos tras normalizar, o null sin voz.
 *
 *   1. La toma se DECODIFICA sola, con una cadena simple (MP3 mono a 44,1 kHz → PCM estéreo a 48 kHz). Una cadena simple
 *      sí sabe rehacerse si el archivo cambia de parámetros a la mitad.
 *   2. Los silencios de las escenas se meten copiando muestras (`armarPcm`), hasta el último cuadro exacto; encima, el
 *      SONIDO de los clips de video que lo llevan (`clips`: los usos de `usosDeVideo` con `sonido`), los EFECTOS
 *      (`efectos`: whoosh y pop, src/lib/efectosSonido.js; con `efectosPropios` { whoosh?, pop? } —los bytes de un efecto
 *      de la biblioteca de sonido—, ese suena en vez del sintetizado, decodificado a PCM como la voz) y la MÚSICA con
 *      ducking y fundido (`musica`: { audio, volumen }, src/lib/sonidoVideo.js), que baja también cuando habla un clip.
 *   3. El volumen: loudnorm MIDE, la segunda pasada aplica una ganancia fija (y un limitador si el pico se pasaría) y
 *      una tercera mide lo que quedó.
 *
 * La segunda pasada de loudnorm (`measured_*`, en lineal) hacía morir al ffmpeg 5.1 de la imagen con «Error
 * reinitializing filters! | Failed to inject frame into filter network: Invalid argument» cada vez que no podía ir en
 * lineal y pasaba a su modo dinámico: con una voz de verdad, casi siempre.
 */
export async function audioDelVideo(carpeta, { audio, linea, total, salida, guion = null, efectos = false, musica = null, clips = [], efectosPropios = null }) {
  const muestreo = String(RENDER.muestreo);
  const toma = audio?.length ? await decodificar(carpeta, "voz", audio, "No se pudo leer el audio de la locución") : new Uint8Array(0);
  const voz = armarPcm(toma, tramosDeAudio(linea.silencios), total, RENDER.muestreo);
  // El sonido de los clips va con la voz (lo que «habla»): la música baja también debajo de él.
  let conClips = 0;
  const habla = clips.length ? new Uint8Array(voz) : voz;
  for (const u of clips) {
    const tramo = await audioDe(u.archivo, u.clipDesde, Math.max(0, u.hasta - u.desde)).catch(() => new Uint8Array(0));
    if (tramo.length) conClips += mezclarClip(habla, tramo, { en: u.desde, hasta: u.hasta, volumen: u.volumen, muestreo: RENDER.muestreo }) > 0 ? 1 : 0;
  }
  // Lo que suena debajo, en el mismo PCM y antes del volumen: así guarda su distancia con la voz sea cual sea la toma.
  const pcm = musica?.audio?.length || efectos ? new Uint8Array(habla) : habla;
  if (efectos && guion) {
    const propios = await efectosDeLaBiblioteca(carpeta, efectosPropios);
    const duraciones = propios.whoosh ? { whoosh: propios.whoosh.length / RENDER.muestreo } : undefined;
    mezclarEfectos(pcm, momentosDeEfectos(guion, linea, duraciones ? { duraciones } : {}), { muestreo: RENDER.muestreo, propios });
  }
  if (musica?.audio?.length) {
    const fondo = await decodificar(carpeta, "musica", musica.audio, "No se pudo leer la música");
    mezclarMusica(pcm, fondo, { muestreo: RENDER.muestreo, volumen: musica.volumen ?? 0, voz: habla });
  }
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
    return null;
  }
  // Primera pasada: medir.
  const m = await ffmpeg([...leer, "-af", FILTRO_MEDIR, "-f", "null", "-"]).fin;
  if (m.codigo !== 0) throw falla("No se pudo medir el audio de la locución", m);
  const medido = leerLoudnorm(m.error);
  // Segunda: la ganancia (y el limitador). Una toma muda (o ilegible) no se normaliza: se codifica tal cual.
  const r = await ffmpeg([...leer, ...(medido ? ["-af", filtroDeNormalizar(medido)] : []), ...codificar]).fin;
  if (r.codigo !== 0) throw falla("No se pudo armar el audio", r);
  if (!medido) return null;
  // Tercera: lo que quedó (lo que se apunta en el render y vigila la prueba). Si no se puede medir, el audio vale igual.
  const f = await ffmpeg(["-i", salida, "-af", FILTRO_MEDIR, "-f", "null", "-"]).fin;
  const final = f.codigo === 0 ? leerLoudnorm(f.error) : null;
  return { lufs: final?.input_i ?? null, pico: final?.input_tp ?? null, antes: medido.input_i };
}

/**
 * Renderiza el video → { mp4 (Buffer), duracion, cuadros, ancho, alto, ms: { audio, video, total }, audio: {lufs…} }.
 * `base`: lo de `preparar()` del servidor (guion, linea, formato, paleta, recursos, fuentes). `audio`: los bytes de la
 * toma (o null: silencio).
 */
export async function renderizar(base, { audio = null, musica = null, efectos = false, efectosPropios = null, fps = RENDER.fps } = {}) {
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
    const medidas = await audioDelVideo(carpeta, { audio, linea: base.linea, total: duracion, salida: sonido, guion: base.guion, efectos, musica, clips, efectosPropios });
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
