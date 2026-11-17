// ============================================================
// UNIR lo que sale de «Mejorar mi video» con el AUDIO ORIGINAL (worker/lib/estudio/mejoraVideo.js)
//
// Los modelos de video que editan (Omni 1.2, Seedance 2.5) inventan su propio sonido, y Topaz puede devolver el video
// sin él: lo que dijo la persona en su video se perdía. Aquí se junta la IMAGEN nueva con el SONIDO del original:
//
//   · Un tramo (escalar, look, cambiar algo): la imagen nueva TAL CUAL (sin recodificar: no se pierde nitidez) y el
//     audio del original, cortado a lo que dure lo más corto. Si el original no tiene sonido, el del nuevo.
//   · Varios tramos (varios ángulos de una toma): se corta cada ángulo en su trozo de tiempo —el mismo instante del
//     original, porque cada ángulo recrea la misma toma—, se encajan a la medida de salida (llenando, sin bandas), se
//     pegan y debajo va el audio original entero. Ahí sí se codifica (libx264).
//
// Los clips ya están en disco (`PUT /clip/<id>`, clips.mjs): el pedido sólo los nombra. → { mp4, ancho, alto, duracion }.
// ============================================================

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { infoDe, rutaDeClip, correr, ErrorClip } from "./clips.mjs";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
/** Lo más largo que se une (el original de «Mejorar» llega a 60 s; Topaz admite más, pero no hace falta). */
const MAX_SEGUNDOS = 180;
const MAX_TRAMOS = 12;
const par = (n) => Math.max(2, Math.round(n / 2) * 2);

/** La medida de salida de un montaje de ángulos: la del original, sin pasar de 1920 de lado. Pura. */
export function medidaDeSalida(info, pedida = null) {
  const a = Number(pedida?.ancho) || info.ancho || 1080;
  const h = Number(pedida?.alto) || info.alto || 1920;
  const k = Math.min(1, 1920 / Math.max(a, h));
  return { ancho: par(a * k), alto: par(h * k) };
}

/**
 * Los tramos, ajustados a lo que dura cada clip: un trozo que empieza después del final del clip se corre hacia atrás
 * (el ángulo dura algo menos que el original) y uno que se pasa se rellena con su último cuadro. Pura.
 */
export function tramosAjustados(tramos, infos) {
  return tramos.map((t, i) => {
    const dur = Math.max(0.1, Number(t.hasta) - Number(t.desde));
    const largo = infos[i]?.duracion || dur;
    const desde = Math.max(0, Math.min(Number(t.desde) || 0, largo - Math.min(dur, largo)));
    return { clip: t.clip, desde, dur };
  });
}

/** El filtro de ffmpeg que corta, encaja y pega los tramos (entradas 0..n-1) → «[v]». Pura. */
export function filtroDeTramos(tramos, { ancho, alto, fps = 30 }) {
  const partes = tramos.map((t, i) => `[${i}:v]trim=start=${t.desde.toFixed(3)}:duration=${t.dur.toFixed(3)},setpts=PTS-STARTPTS,`
    + `scale=${ancho}:${alto}:force_original_aspect_ratio=increase,crop=${ancho}:${alto},setsar=1,fps=${fps},format=yuv420p,`
    + `tpad=stop_mode=clone:stop_duration=${t.dur.toFixed(3)},trim=duration=${t.dur.toFixed(3)},setpts=PTS-STARTPTS[t${i}]`);
  return `${partes.join(";")};${tramos.map((_, i) => `[t${i}]`).join("")}concat=n=${tramos.length}:v=1:a=0[v]`;
}

/** Une según el pedido { original, tramos: [{ clip, desde, hasta }], salida? }. */
export async function unir(p = {}) {
  const original = await infoDe(p.original);
  if (!original) throw new ErrorClip("El video original no está en el Container: súbelo antes (PUT /clip/<id>).");
  const tramos = Array.isArray(p.tramos) ? p.tramos.slice(0, MAX_TRAMOS) : [];
  if (!tramos.length) throw new ErrorClip("Faltan los tramos.");
  const infos = [];
  for (const t of tramos) {
    const info = await infoDe(t.clip);
    if (!info) throw new ErrorClip(`El clip ${t.clip} no está en el Container.`);
    infos.push(info);
  }
  const carpeta = await mkdtemp(join(tmpdir(), "unir-"));
  const salida = join(carpeta, "unido.mp4");
  try {
    let ancho; let alto; let duracion;
    if (tramos.length === 1 && p.copiar !== false) {
      const nuevo = infos[0];
      duracion = Math.min(nuevo.duracion || MAX_SEGUNDOS, original.audio ? original.duracion || MAX_SEGUNDOS : MAX_SEGUNDOS, MAX_SEGUNDOS);
      ancho = nuevo.ancho; alto = nuevo.alto;
      const audio = original.audio ? ["-map", "1:a:0"] : ["-map", "0:a:0?"];
      const r = await correr(FFMPEG, [
        "-hide_banner", "-nostdin", "-v", "error", "-y", "-i", rutaDeClip(tramos[0].clip), "-i", rutaDeClip(p.original),
        "-map", "0:v:0", ...audio, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", duracion.toFixed(3),
        "-movflags", "+faststart", salida,
      ]);
      if (r.codigo !== 0) throw new Error(`ffmpeg no pudo unir el audio: ${r.error.trim().split("\n").at(-1) ?? ""}`);
    } else {
      const ajustados = tramosAjustados(tramos, infos);
      ({ ancho, alto } = medidaDeSalida(original, p.salida));
      duracion = Math.min(ajustados.reduce((n, t) => n + t.dur, 0), MAX_SEGUNDOS);
      const entradas = ajustados.flatMap((t) => ["-i", rutaDeClip(t.clip)]);
      const conAudio = original.audio;
      const r = await correr(FFMPEG, [
        "-hide_banner", "-nostdin", "-v", "error", "-y", ...entradas, ...(conAudio ? ["-i", rutaDeClip(p.original)] : []),
        "-filter_complex", filtroDeTramos(ajustados, { ancho, alto }), "-map", "[v]",
        ...(conAudio ? ["-map", `${ajustados.length}:a:0`, "-c:a", "aac", "-b:a", "192k"] : ["-an"]),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-t", duracion.toFixed(3),
        "-movflags", "+faststart", salida,
      ]);
      if (r.codigo !== 0) throw new Error(`ffmpeg no pudo montar los ángulos: ${r.error.trim().split("\n").at(-1) ?? ""}`);
    }
    const mp4 = await readFile(salida);
    return { mp4, ancho, alto, duracion };
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}
