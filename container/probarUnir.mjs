// ============================================================
// La prueba de UNIR («Mejorar mi video»), dentro de la imagen y contra su servidor: `docker exec video node
// container/probarUnir.mjs` (o `node container/probarUnir.mjs http://localhost:8099` en local, con ffmpeg).
//
// Hace con ffmpeg un «original» con sonido (un tono), una «mejora» SIN sonido y tres «ángulos» sin sonido, los sube con
// PUT /clip/<id> y comprueba:
//   · un tramo: el mp4 lleva la imagen de la mejora (su medida) y el AUDIO del original, y dura lo más corto;
//   · varios tramos: el montaje mide lo que el original, dura lo que los tramos y lleva el audio del original;
//   · un clip que no está es un 400 con el motivo.
// Sale con código 1 al primer fallo.
// ============================================================

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { esMp4 } from "../src/lib/renderVideo.js";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const FFPROBE = process.env.FFPROBE || "ffprobe";
const base = process.argv[2] ?? "http://localhost:8080";
const carpeta = await mkdtemp(join(tmpdir(), "probar-unir-"));

function falla(que) {
  console.error(`✗ ${que}`);
  process.exit(1);
}

function hacer(nombre, { color, segundos, ancho, alto, tono = false }) {
  const archivo = join(carpeta, `${nombre}.mp4`);
  const args = ["-hide_banner", "-v", "error", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=${ancho}x${alto}:r=30:d=${segundos}`];
  if (tono) args.push("-f", "lavfi", "-i", `sine=frequency=440:duration=${segundos}`);
  args.push("-c:v", "libx264", "-pix_fmt", "yuv420p", ...(tono ? ["-c:a", "aac", "-shortest"] : ["-an"]), archivo);
  const r = spawnSync(FFMPEG, args);
  if (r.status !== 0) falla(`no se pudo hacer el clip ${nombre}: ${r.stderr}`);
  return archivo;
}

function sonda(archivo) {
  const r = spawnSync(FFPROBE, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", archivo]);
  const j = JSON.parse(r.stdout.toString());
  const v = j.streams.find((s) => s.codec_type === "video");
  return { ancho: v?.width, alto: v?.height, audio: j.streams.some((s) => s.codec_type === "audio"), duracion: Number(j.format.duration) };
}

async function subir(id, archivo) {
  const r = await fetch(`${base}/clip/${id}`, { method: "PUT", body: await readFile(archivo), duplex: "half" });
  if (!r.ok) falla(`PUT /clip/${id} respondió ${r.status}: ${await r.text()}`);
}

async function unir(cuerpo) {
  const r = await fetch(`${base}/unir`, { method: "POST", body: JSON.stringify(cuerpo) });
  return { estado: r.status, cabeceras: r.headers, bytes: new Uint8Array(await r.arrayBuffer()) };
}

try {
  await subir("unir-original", hacer("original", { color: "red", segundos: 6, ancho: 540, alto: 960, tono: true }));
  await subir("unir-mejora", hacer("mejora", { color: "blue", segundos: 5, ancho: 1080, alto: 1920 }));
  for (const [i, color] of ["green", "yellow", "white"].entries()) {
    await subir(`unir-angulo-${i}`, hacer(`angulo-${i}`, { color, segundos: 6, ancho: 720, alto: 1280 }));
  }

  // Un tramo: la imagen de la mejora, con el sonido del original.
  const uno = await unir({ original: "unir-original", tramos: [{ clip: "unir-mejora", desde: 0, hasta: 5 }] });
  if (uno.estado !== 200) falla(`/unir (un tramo) respondió ${uno.estado}: ${Buffer.from(uno.bytes).toString()}`);
  if (!esMp4(uno.bytes)) falla("/unir (un tramo) no devolvió un mp4");
  if (Number(uno.cabeceras.get("X-Bytes")) !== uno.bytes.length) falla("X-Bytes no es lo que pesa el mp4");
  await writeFile(join(carpeta, "uno.mp4"), uno.bytes);
  const s1 = sonda(join(carpeta, "uno.mp4"));
  if (s1.ancho !== 1080 || s1.alto !== 1920) falla(`un tramo: mide ${s1.ancho}×${s1.alto}, se esperaba la medida de la mejora (1080×1920)`);
  if (!s1.audio) falla("un tramo: salió SIN el audio del original");
  if (Math.abs(s1.duracion - 5) > 0.3) falla(`un tramo: dura ${s1.duracion} s, se esperaban 5`);
  console.log(`✓ un tramo: ${s1.ancho}×${s1.alto}, ${s1.duracion.toFixed(2)} s, con el audio del original`);

  // Varios tramos: el montaje de ángulos con el audio del original entero.
  const tramos = [
    { clip: "unir-original", desde: 0, hasta: 1.5 }, { clip: "unir-angulo-0", desde: 1.5, hasta: 3 },
    { clip: "unir-angulo-1", desde: 3, hasta: 4.5 }, { clip: "unir-angulo-2", desde: 4.5, hasta: 6 },
  ];
  const varios = await unir({ original: "unir-original", tramos });
  if (varios.estado !== 200) falla(`/unir (ángulos) respondió ${varios.estado}: ${Buffer.from(varios.bytes).toString()}`);
  await writeFile(join(carpeta, "varios.mp4"), varios.bytes);
  const s2 = sonda(join(carpeta, "varios.mp4"));
  if (s2.ancho !== 540 || s2.alto !== 960) falla(`ángulos: mide ${s2.ancho}×${s2.alto}, se esperaba la del original (540×960)`);
  if (!s2.audio) falla("ángulos: salió SIN el audio del original");
  if (Math.abs(s2.duracion - 6) > 0.3) falla(`ángulos: dura ${s2.duracion} s, se esperaban 6`);
  console.log(`✓ ángulos: ${s2.ancho}×${s2.alto}, ${s2.duracion.toFixed(2)} s, con el audio del original`);

  const sinClip = await unir({ original: "unir-original", tramos: [{ clip: "no-esta", desde: 0, hasta: 2 }] });
  if (sinClip.estado !== 400) falla(`un clip que no está debía ser 400 y fue ${sinClip.estado}`);
  console.log("✓ un clip que no está es un 400");
} finally {
  await rm(carpeta, { recursive: true, force: true }).catch(() => {});
}
