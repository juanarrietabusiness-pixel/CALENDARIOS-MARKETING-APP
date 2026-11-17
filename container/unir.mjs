// ============================================================
// UNIR lo que sale de «Mejorar mi video» con el AUDIO ORIGINAL (worker/lib/estudio/mejoraVideo.js)
//
// Los modelos de video que editan (Omni 1.2, Seedance 2.5) inventan su propio sonido, y Topaz puede devolver el video
// sin él: lo que dijo la persona en su video se perdía. Aquí se junta la IMAGEN nueva con el SONIDO que toca:
//
//   · Un tramo sin nada encima (escalar, look, cambiar algo): la imagen nueva TAL CUAL (sin recodificar: no se pierde
//     nitidez) y el audio del original, cortado a lo que dure lo más corto. Sin sonido en el original, el del nuevo.
//   · Lo demás (ángulos, ganchos, alargar, color): cada tramo es un trozo de UN clip (`clip`, `desde`, `hasta`) con SU
//     audio (`audio`: { clip, desde }; por defecto, el del original en el mismo segundo: los ángulos recrean la misma
//     toma). Se encajan a la medida de salida (llenando, sin bandas), se pegan, se les da el COLOR (un grade de
//     src/lib/coloresVideo.js) y el TEXTO del gancho encima (dibujado con la letra de la casa) y se codifica (libx264).
//
// Los clips ya están en disco (`PUT /clip/<id>`, clips.mjs): el pedido sólo los nombra. → { mp4, ancho, alto, duracion }.
// También: un cuadro con un color puesto (`muestraDeColor`, para escogerlo) y un fotograma entero (`fotograma`, el
// último o el primer cuadro que se le da a un modelo para alargar o para un gancho nuevo).
// ============================================================

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { createCanvas } from "@napi-rs/canvas";
import { infoDe, rutaDeClip, correr, ErrorClip } from "./clips.mjs";
import { colorPorId } from "../src/lib/coloresVideo.js";
import { FUENTE_CASA } from "../src/lib/motorTexto.js";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
/** Lo más largo que se une (el original de «Mejorar» llega a 60 s; Topaz admite más, pero no hace falta). */
const MAX_SEGUNDOS = 180;
const MAX_TRAMOS = 24;
const MUESTREO = 48000;
const par = (n) => Math.max(2, Math.round(n / 2) * 2);
const f3 = (x) => Number(x).toFixed(3);

/** La medida de salida: la pedida o la del original, sin pasar de 1920 de lado. Pura. */
export function medidaDeSalida(info, pedida = null) {
  const a = Number(pedida?.ancho) || info.ancho || 1080;
  const h = Number(pedida?.alto) || info.alto || 1920;
  const k = Math.min(1, 1920 / Math.max(a, h));
  return { ancho: par(a * k), alto: par(h * k) };
}

/**
 * Los tramos, ajustados a lo que dura cada clip: un trozo que empieza después del final del clip se corre hacia atrás
 * (el clip dura algo menos de lo pensado) y uno que se pasa se rellena con su último cuadro. Pura.
 */
export function tramosAjustados(tramos, infos) {
  return tramos.map((t, i) => {
    const dur = Math.max(0.1, Number(t.hasta) - Number(t.desde));
    const largo = infos[i]?.duracion || dur;
    const desde = Math.max(0, Math.min(Number(t.desde) || 0, largo - Math.min(dur, largo)));
    return { ...t, desde, dur };
  });
}

/**
 * El filtro de ffmpeg que corta, encaja y pega la imagen y el sonido de los tramos. `entradas`: Map clip → índice de
 * entrada; `conAudio`: Map clip → si tiene sonido. → { filtro, video: «[v]», audio: «[a]» | null }. Pura.
 */
export function filtroDeTramos(tramos, { ancho, alto, fps = 30, entradas, conAudio, original, color = null, conTexto = false }) {
  const partes = [];
  const audios = [];
  const algunAudio = tramos.some((t) => conAudio.get(t.audio?.clip ?? original));
  tramos.forEach((t, i) => {
    const e = entradas.get(t.clip);
    partes.push(`[${e}:v]trim=start=${f3(t.desde)}:duration=${f3(t.dur)},setpts=PTS-STARTPTS,`
      + `scale=${ancho}:${alto}:force_original_aspect_ratio=increase,crop=${ancho}:${alto},setsar=1,fps=${fps},format=yuv420p,`
      + `tpad=stop_mode=clone:stop_duration=${f3(t.dur)},trim=duration=${f3(t.dur)},setpts=PTS-STARTPTS[v${i}]`);
    if (!algunAudio) return;
    const clipAudio = t.audio?.clip ?? original;
    const desdeAudio = Number.isFinite(Number(t.audio?.desde)) ? Number(t.audio.desde) : t.desde;
    if (conAudio.get(clipAudio)) {
      partes.push(`[${entradas.get(clipAudio)}:a]atrim=start=${f3(desdeAudio)}:duration=${f3(t.dur)},asetpts=PTS-STARTPTS,`
        + `aresample=${MUESTREO},aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${f3(t.dur)},atrim=duration=${f3(t.dur)}[a${i}]`);
    } else {
      partes.push(`anullsrc=r=${MUESTREO}:cl=stereo,atrim=duration=${f3(t.dur)},aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
    }
    audios.push(`[a${i}]`);
  });
  partes.push(`${tramos.map((_, i) => `[v${i}]`).join("")}concat=n=${tramos.length}:v=1:a=0[vc]`);
  let ultimo = "[vc]";
  const grade = color ? colorPorId(color) : null;
  if (grade) { partes.push(`${ultimo}${grade.filtro},format=yuv420p[vg]`); ultimo = "[vg]"; }
  if (conTexto) { partes.push(`${ultimo}[${entradas.size}:v]overlay=0:0:enable='lte(t,${f3(conTexto)})',format=yuv420p[vt]`); ultimo = "[vt]"; }
  if (audios.length) partes.push(`${audios.join("")}concat=n=${audios.length}:v=0:a=1[a]`);
  return { filtro: partes.join(";"), video: ultimo, audio: audios.length ? "[a]" : null };
}

/** Parte un texto en líneas que caben en `max` px con la letra del contexto. */
function lineasDe(ctx, texto, max) {
  const palabras = String(texto).split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (ctx.measureText(prueba).width > max && actual) { lineas.push(actual); actual = p; } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * El TEXTO del gancho en un PNG transparente de la medida del video: en mayúsculas, con la letra de la casa, cada línea
 * sobre su placa (`fondo`) en el tercio de arriba (lejos de los botones de Instagram). → Buffer PNG.
 */
export async function textoDeGancho(texto, { ancho, alto, color = "#FFFFFF", fondo = "#111111" }) {
  const lienzo = createCanvas(ancho, alto);
  const ctx = lienzo.getContext("2d");
  let tam = Math.round(ancho * 0.085);
  let lineas;
  for (;;) {
    ctx.font = `${tam}px "${FUENTE_CASA}", Roboto, sans-serif`;
    lineas = lineasDe(ctx, String(texto).toLocaleUpperCase("es"), ancho * 0.84);
    if (lineas.length <= 3 || tam <= ancho * 0.05) break;
    tam = Math.round(tam * 0.9);
  }
  const alto1 = tam * 1.22;
  const pad = tam * 0.28;
  let y = Math.round(alto * 0.2);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  for (const l of lineas.slice(0, 4)) {
    const w = ctx.measureText(l).width + pad * 2;
    ctx.fillStyle = fondo;
    const x = (ancho - w) / 2;
    const r = tam * 0.18;
    ctx.beginPath();
    ctx.roundRect(x, y, w, alto1, r);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(l, ancho / 2, y + alto1 / 2 + tam * 0.04);
    y += alto1 + tam * 0.12;
  }
  return lienzo.encode("png");
}

async function infosDe(ids) {
  const mapa = new Map();
  for (const id of ids) {
    if (mapa.has(id)) continue;
    const info = await infoDe(id);
    if (!info) throw new ErrorClip(`El clip ${id} no está en el Container: súbelo antes (PUT /clip/<id>).`);
    mapa.set(id, info);
  }
  return mapa;
}

/**
 * Une según el pedido { original, tramos: [{ clip, desde, hasta, audio? }], copiar?, color?, texto? { texto, hasta,
 * color?, fondo? }, salida? }.
 */
export async function unir(p = {}) {
  const tramos = Array.isArray(p.tramos) ? p.tramos.slice(0, MAX_TRAMOS) : [];
  if (!tramos.length) throw new ErrorClip("Faltan los tramos.");
  if (p.color && !colorPorId(p.color)) throw new ErrorClip("Ese color no existe.");
  const infos = await infosDe([p.original, ...tramos.map((t) => t.clip), ...tramos.map((t) => t.audio?.clip).filter(Boolean)]);
  const original = infos.get(p.original);
  const carpeta = await mkdtemp(join(tmpdir(), "unir-"));
  const salida = join(carpeta, "unido.mp4");
  try {
    let ancho; let alto; let duracion;
    const texto = p.texto?.texto ? p.texto : null;
    if (tramos.length === 1 && p.copiar !== false && !p.color && !texto) {
      const nuevo = infos.get(tramos[0].clip);
      duracion = Math.min(nuevo.duracion || MAX_SEGUNDOS, original.audio ? original.duracion || MAX_SEGUNDOS : MAX_SEGUNDOS, MAX_SEGUNDOS);
      ancho = nuevo.ancho; alto = nuevo.alto;
      const audio = original.audio ? ["-map", "1:a:0"] : ["-map", "0:a:0?"];
      const r = await correr(FFMPEG, [
        "-hide_banner", "-nostdin", "-v", "error", "-y", "-i", rutaDeClip(tramos[0].clip), "-i", rutaDeClip(p.original),
        "-map", "0:v:0", ...audio, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", f3(duracion),
        "-movflags", "+faststart", salida,
      ]);
      if (r.codigo !== 0) throw new Error(`ffmpeg no pudo unir el audio: ${r.error.trim().split("\n").at(-1) ?? ""}`);
    } else {
      const ajustados = tramosAjustados(tramos, tramos.map((t) => infos.get(t.clip)));
      ({ ancho, alto } = medidaDeSalida(original, p.salida));
      duracion = Math.min(ajustados.reduce((n, t) => n + t.dur, 0), MAX_SEGUNDOS);
      const clips = [...new Set([...ajustados.map((t) => t.clip), ...ajustados.map((t) => t.audio?.clip ?? p.original)])];
      const entradas = new Map(clips.map((c, i) => [c, i]));
      const conAudio = new Map(clips.map((c) => [c, Boolean(infos.get(c)?.audio)]));
      let png = null;
      if (texto) {
        png = join(carpeta, "texto.png");
        await writeFile(png, await textoDeGancho(String(texto.texto).slice(0, 120), { ancho, alto, color: texto.color, fondo: texto.fondo }));
      }
      const hasta = texto ? Math.max(0.5, Math.min(Number(texto.hasta) || 3, duracion)) : 0;
      const f = filtroDeTramos(ajustados, { ancho, alto, entradas, conAudio, original: p.original, color: p.color ?? null, conTexto: hasta });
      const r = await correr(FFMPEG, [
        "-hide_banner", "-nostdin", "-v", "error", "-y", ...clips.flatMap((c) => ["-i", rutaDeClip(c)]), ...(png ? ["-i", png] : []),
        "-filter_complex", f.filtro, "-map", f.video, ...(f.audio ? ["-map", f.audio, "-c:a", "aac", "-b:a", "192k"] : ["-an"]),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-t", f3(duracion),
        "-movflags", "+faststart", salida,
      ]);
      if (r.codigo !== 0) throw new Error(`ffmpeg no pudo montar el video: ${r.error.trim().split("\n").at(-1) ?? ""}`);
    }
    const mp4 = await readFile(salida);
    return { mp4, ancho, alto, duracion };
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}

/** UN cuadro del clip en su segundo `t` con un color puesto (o sin él), en JPEG de `ancho` px: la muestra para escoger. */
export async function muestraDeColor({ clip, color = "", t = 1, ancho = 540 }) {
  const info = await infoDe(clip);
  if (!info) throw new ErrorClip("El clip no está en el Container: súbelo antes (PUT /clip/<id>).");
  const grade = color ? colorPorId(color) : null;
  if (color && !grade) throw new ErrorClip("Ese color no existe.");
  const en = Math.max(0, Math.min(Number(t) || 0, Math.max(0, (info.duracion || 1) - 0.1)));
  const w = par(Math.max(120, Math.min(1080, Number(ancho) || 540)));
  const r = await correr(FFMPEG, [
    "-hide_banner", "-nostdin", "-v", "error", "-ss", f3(en), "-i", rutaDeClip(clip), "-frames:v", "1",
    "-vf", `scale=${w}:-2${grade ? `,${grade.filtro}` : ""}`, "-f", "image2", "-c:v", "mjpeg", "-q:v", "4", "pipe:1",
  ]);
  if (r.codigo !== 0 || !r.salida.length) throw new Error("No se pudo sacar la muestra del video.");
  return r.salida;
}

/** El cuadro del clip en su segundo `t` a su tamaño (JPEG): `t` < 0 cuenta desde el final (−0,05 = el último). */
export async function fotograma({ clip, t = 0 }) {
  const info = await infoDe(clip);
  if (!info) throw new ErrorClip("El clip no está en el Container: súbelo antes (PUT /clip/<id>).");
  const dur = info.duracion || 0;
  const en = Number(t) < 0 ? Math.max(0, dur + Number(t)) : Math.max(0, Math.min(Number(t) || 0, Math.max(0, dur - 0.05)));
  // Pegado al final, ffmpeg a veces no encuentra cuadro: se prueba un poco antes.
  for (const s of [en, Math.max(0, en - 0.3), Math.max(0, en - 1)]) {
    const r = await correr(FFMPEG, [
      "-hide_banner", "-nostdin", "-v", "error", "-ss", f3(s), "-i", rutaDeClip(clip), "-frames:v", "1",
      "-vf", "scale='min(1920,iw)':-2", "-f", "image2", "-c:v", "mjpeg", "-q:v", "2", "pipe:1",
    ]);
    if (r.codigo === 0 && r.salida.length) return r.salida;
  }
  throw new Error("No se pudo sacar el fotograma del video.");
}
