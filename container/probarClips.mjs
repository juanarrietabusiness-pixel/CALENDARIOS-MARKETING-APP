// ============================================================
// La prueba de los CLIPS de video (capas `video`), DENTRO de la imagen y contra su servidor: `docker exec video node
// container/probarClips.mjs` (o `node container/probarClips.mjs http://localhost:8099` en local, con ffmpeg).
//
// Hace con ffmpeg un clip de prueba (barras de color con un tono) y otro GRABADO DE LADO (marcado con un giro de 90°,
// como los de un teléfono), los sube con PUT /clip/<id> y comprueba:
//   · la medida que dice el Container (el girado, con el ancho y el alto cambiados) y que HEAD lo encuentra;
//   · /cuadro con el clip a sangre: el centro del cuadro tiene los colores del clip (no el fondo ni el «Video» oscuro);
//   · /render de un montaje SIN voz (un guion sin habla): un mp4 con la duración del tramo del clip, su pista de audio
//     con sonido (el del clip) y en -14 LUFS (±1.5);
//   · un id con caracteres raros es un 400.
// Sale con código 1 al primer fallo.
// ============================================================

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { RENDER, cuadrosDelVideo, esMp4 } from "../src/lib/renderVideo.js";
import { lineaDeTiempo, validarGuion } from "../src/lib/videoEscenas.js";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const base = process.argv[2] ?? "http://localhost:8080";
const carpeta = await mkdtemp(join(tmpdir(), "probar-clips-"));

function falla(que) {
  console.error(`✗ ${que}`);
  process.exit(1);
}

/** Un clip de `segundos` de barras de color (`ancho` × `alto`) con un tono de 330 Hz; `girado`: marcado a 90°. */
function clip(nombre, { segundos = 4, ancho = 640, alto = 360, girado = false } = {}) {
  const salida = join(carpeta, nombre);
  const r = spawnSync(FFMPEG, ["-hide_banner", "-y",
    "-f", "lavfi", "-i", `smptebars=size=${ancho}x${alto}:rate=30:duration=${segundos}`,
    "-f", "lavfi", "-i", `sine=frequency=330:sample_rate=44100:duration=${segundos}`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", salida], { encoding: "utf8" });
  if (r.status !== 0) falla(`no se pudo hacer ${nombre}: ${r.stderr.slice(-400)}`);
  if (!girado) return salida;
  // El giro: `-display_rotation` desde ffmpeg 6; en el 5.1 de la imagen, la etiqueta «rotate» (que el 6 ya no escribe).
  const girada = join(carpeta, `girado-${nombre}`);
  let g = spawnSync(FFMPEG, ["-hide_banner", "-y", "-display_rotation", "90", "-i", salida, "-c", "copy", girada], { encoding: "utf8" });
  if (g.status !== 0) g = spawnSync(FFMPEG, ["-hide_banner", "-y", "-i", salida, "-c", "copy", "-metadata:s:v:0", "rotate=90", girada], { encoding: "utf8" });
  if (g.status !== 0) falla(`no se pudo girar ${nombre}: ${g.stderr.slice(-400)}`);
  return girada;
}

async function subir(id, archivo) {
  const r = await fetch(`${base}/clip/${id}`, { method: "PUT", body: await readFile(archivo) });
  const j = await r.json().catch(() => ({}));
  if (r.status !== 200) falla(`PUT /clip/${id} devolvió ${r.status}: ${JSON.stringify(j)}`);
  return j;
}

const post = async (ruta, cuerpo) => {
  const r = await fetch(`${base}${ruta}`, { method: "POST", body: JSON.stringify(cuerpo) });
  return { estado: r.status, cabeceras: r.headers, bytes: new Uint8Array(await r.arrayBuffer()) };
};

try {
  // 1. Subir y medir.
  const barras = await subir("prueba-barras", clip("barras.mp4"));
  if (barras.ancho !== 640 || barras.alto !== 360 || !(Math.abs(barras.duracion - 4) < 0.2) || !barras.audio) falla(`la medida del clip no cuadra: ${JSON.stringify(barras)}`);
  const lado = await subir("prueba-lado", clip("lado.mp4", { segundos: 2, girado: true }));
  if (lado.ancho !== 360 || lado.alto !== 640) falla(`el clip girado debería medir 360 × 640, no ${lado.ancho} × ${lado.alto}`);
  if ((await fetch(`${base}/clip/prueba-barras`, { method: "HEAD" })).status !== 200) falla("HEAD /clip no encuentra el clip subido");
  if ((await fetch(`${base}/clip/no-esta`, { method: "HEAD" })).status !== 404) falla("HEAD /clip de uno que no está debería ser 404");
  const raro = await fetch(`${base}/clip/..%2Fetc`, { method: "PUT", body: "x" });
  if (raro.status !== 400 && raro.status !== 404 && raro.status !== 405) falla(`un id raro debería rechazarse, fue ${raro.status}`);
  console.log(`✓ PUT /clip (640 × 360 de ${barras.duracion} s con audio; el girado, ${lado.ancho} × ${lado.alto})`);

  // 2. Un montaje sin voz: el clip a sangre 3 s, con su sonido, y un texto encima.
  const guion = {
    version: 1, titulo: "Montaje de prueba", formatos: ["9:16"], subtitulos: { activo: false },
    escenas: [{
      id: "m1", tipo: "gancho", habla: "",
      capas: [
        { tipo: "video", id: "clip", archivo: "prueba-barras", desde: 0.5, hasta: 3.5, sonido: true, oscurecer: 0 },
        { tipo: "texto", id: "t", texto: "Así quedó", pos: "arriba", placa: "oscuro", color: "claro" },
      ],
    }, {
      id: "m2", tipo: "cierre", habla: "", transicion: { tipo: "fundido", dur: 0.3 },
      capas: [{ tipo: "video", id: "clip2", archivo: "prueba-lado", encuadre: "caja", desde: 0, hasta: 2 }],
    }],
  };
  const v = validarGuion(guion);
  if (!v.ok) falla(`el guion de prueba no valida: ${JSON.stringify(v.errores)}`);
  const linea = lineaDeTiempo(v.guion);
  if (!(Math.abs(linea.total - 5) < 0.05)) falla(`el montaje debería durar 5 s (3 + 2 de los tramos), dura ${linea.total}`);
  const pedido = { guion: v.guion, formato: "9:16", paleta: [], imagenes: {}, logo: null, fuentes: {}, videos: ["prueba-barras", "prueba-lado"] };

  // 3. Un cuadro: el centro tiene los colores de las barras.
  const c = await post("/cuadro", { ...pedido, t: 1, ancho: 270, tipo: "png" });
  if (c.estado !== 200) falla(`/cuadro con video devolvió ${c.estado}: ${new TextDecoder().decode(c.bytes).slice(0, 300)}`);
  const img = await loadImage(Buffer.from(c.bytes));
  const l = createCanvas(img.width, img.height);
  l.getContext("2d").drawImage(img, 0, 0);
  const px = l.getContext("2d").getImageData(0, Math.round(img.height / 2), img.width, 1).data;
  const colores = new Set();
  for (let x = 0; x < img.width; x += 4) colores.add(`${px[x * 4] >> 5},${px[x * 4 + 1] >> 5},${px[x * 4 + 2] >> 5}`);
  if (colores.size < 4) falla(`el centro del cuadro no tiene las barras de color del clip (${colores.size} colores): ¿se dibujó el «Video» de espera?`);
  console.log(`✓ /cuadro con el clip a sangre (${colores.size} colores en el centro)`);

  // 4. El render sin voz: la duración de los tramos y el sonido del clip.
  const r = await post("/render", { ...pedido, efectos: false });
  if (r.estado !== 200) falla(`/render del montaje devolvió ${r.estado}: ${new TextDecoder().decode(r.bytes).slice(0, 300)}`);
  if (!esMp4(r.bytes)) falla("/render del montaje no devolvió un mp4");
  const cuadros = Number(r.cabeceras.get("x-cuadros"));
  if (cuadros !== cuadrosDelVideo(linea.total)) falla(`/render: ${cuadros} cuadros, se esperaban ${cuadrosDelVideo(linea.total)}`);
  const lufs = Number(r.cabeceras.get("x-lufs"));
  if (!(Math.abs(lufs - RENDER.lufs) <= 1.5)) falla(`/render: el sonido del clip quedó en «${r.cabeceras.get("x-lufs")}» LUFS (¿no se mezcló?)`);
  console.log(`✓ /render de un montaje sin voz (${cuadros} cuadros, el sonido del clip en ${lufs} LUFS, ${r.cabeceras.get("x-ms")} ms)`);
} finally {
  await rm(carpeta, { recursive: true, force: true }).catch(() => {});
}
