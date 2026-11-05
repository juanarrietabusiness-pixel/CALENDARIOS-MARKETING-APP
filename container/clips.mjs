// ============================================================
// Los CLIPS de video del video animado, dentro del Container (las capas `video` del formato v1)
//
// El Worker no puede meter un video de 50 MB en un pedido JSON (su memoria es de 128 MB): lo SUBE antes, por flujo,
// con `PUT /clip/<id>` (el id de la galería), y el pedido sólo lo nombra. Aquí se guarda en disco, se mide con ffprobe
// y se decodifica con ffmpeg:
//   · `cuadroDe`: UN cuadro en un segundo del clip (para /cuadro, /hoja y /revisar);
//   · `Decodificador`: los cuadros SEGUIDOS de un uso (una capa en su escena) para el render, leídos de la salida de
//     ffmpeg a medida que el motor los pide (nunca el clip entero en memoria);
//   · `audioDe`: el sonido de un tramo, en PCM, para mezclarlo con la voz.
// El tamaño al que se decodifica sale de `medidaDeDecodificar` (src/lib/renderVideo.js): el del clip sin pasar de 1920 de
// lado, girado si el teléfono lo grabó de lado.
//
// Los clips se quedan en disco mientras quepan (`TOPE_DISCO`): el mismo clip se mira muchas veces (un cuadro, la hoja,
// la revisión, el render). Se borra lo que lleva más tiempo sin usarse. El id es el de la galería (un archivo no cambia
// de bytes con el mismo id), así que no hace falta comprobar si cambió.
// ============================================================

import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat, utimes, readFile, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { Buffer } from "node:buffer";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { createCanvas, ImageData } from "@napi-rs/canvas";
import { RENDER, medidaDeDecodificar, leerSonda } from "../src/lib/renderVideo.js";

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const FFPROBE = process.env.FFPROBE || "ffprobe";
const CARPETA = join(tmpdir(), "clips");
/** Lo más que pesa un clip (la galería admite 50 MB; Drive puede traer más). */
export const TOPE_CLIP = 300 * 1024 * 1024;
/** Lo que ocupan como mucho los clips guardados: lo de más allá se borra empezando por el menos usado. */
const TOPE_DISCO = 2 * 1024 * 1024 * 1024;
const ID = /^[\w-]{1,80}$/;

export class ErrorClip extends Error {
  constructor(mensaje, estado = 400) { super(mensaje); this.estado = estado; }
}

const ruta = (id) => {
  if (!ID.test(String(id ?? ""))) throw new ErrorClip("El id del clip no vale.");
  return join(CARPETA, `${id}.bin`);
};
const rutaInfo = (id) => join(CARPETA, `${id}.json`);

/** ¿Está ya el clip? (y lo marca como usado). */
export async function tieneClip(id) {
  const r = ruta(id);
  if (!existsSync(r) || !existsSync(rutaInfo(id))) return false;
  const ahora = new Date();
  await utimes(r, ahora, ahora).catch(() => {});
  return true;
}

/** Corre un programa y junta su salida → { codigo, salida (Buffer), error (texto) }. */
function correr(programa, args) {
  return new Promise((ok, mal) => {
    const proc = spawn(programa, args, { stdio: ["ignore", "pipe", "pipe"] });
    const trozos = [];
    let error = "";
    proc.stdout.on("data", (t) => trozos.push(t));
    proc.stderr.on("data", (t) => { error = (error + t.toString()).slice(-8000); });
    proc.on("error", (e) => mal(new Error(`No se pudo arrancar ${programa}: ${e.message}`)));
    proc.on("close", (codigo) => ok({ codigo, salida: Buffer.concat(trozos), error }));
  });
}

/** Lo que dice ffprobe del clip → { ancho, alto (ya girados), duracion, audio }. */
async function sondear(archivo) {
  const r = await correr(FFPROBE, ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", archivo]);
  if (r.codigo !== 0) throw new ErrorClip(`No es un video que se pueda leer: ${r.error.trim().split("\n").at(-1) ?? ""}`);
  const info = leerSonda(r.salida.toString("utf8"));
  if (!info) throw new ErrorClip("El archivo no tiene imagen de video.");
  return info;
}

/** Borra los clips menos usados hasta que lo guardado quepa en `TOPE_DISCO`. */
async function hacerSitio() {
  const nombres = await readdir(CARPETA).catch(() => []);
  const clips = [];
  for (const n of nombres.filter((x) => x.endsWith(".bin"))) {
    const s = await stat(join(CARPETA, n)).catch(() => null);
    if (s) clips.push({ id: n.slice(0, -4), bytes: s.size, usado: s.mtimeMs });
  }
  let total = clips.reduce((n, c) => n + c.bytes, 0);
  for (const c of clips.sort((a, b) => a.usado - b.usado)) {
    if (total <= TOPE_DISCO) break;
    await rm(join(CARPETA, `${c.id}.bin`), { force: true });
    await rm(rutaInfo(c.id), { force: true });
    total -= c.bytes;
  }
}

/** Guarda un clip que llega por flujo (`entrada`: el cuerpo del pedido) → su info. Si pasa del tope, 413 y nada queda. */
export async function guardarClip(id, entrada) {
  const destino = ruta(id);
  await mkdir(CARPETA, { recursive: true });
  const temporal = `${destino}.parte`;
  let n = 0;
  const contar = new Transform({
    transform(trozo, _, listo) {
      n += trozo.length;
      if (n > TOPE_CLIP) listo(new ErrorClip(`El clip pesa más de ${Math.round(TOPE_CLIP / 1048576)} MB.`, 413));
      else listo(null, trozo);
    },
  });
  try {
    await pipeline(entrada, contar, createWriteStream(temporal));
    if (!n) throw new ErrorClip("El clip llegó vacío.");
    const info = await sondear(temporal);
    await rm(destino, { force: true });
    await writeFile(rutaInfo(id), JSON.stringify(info));
    await rename(temporal, destino);
    await hacerSitio();
    return info;
  } catch (e) {
    await rm(temporal, { force: true }).catch(() => {});
    throw e;
  }
}

/** La info guardada de un clip → { ancho, alto, duracion, audio } o null si no está. */
export async function infoDe(id) {
  if (!(await tieneClip(id))) return null;
  try { return JSON.parse(await readFile(rutaInfo(id), "utf8")); } catch { return null; }
}

/** Unos bytes RGBA de `ancho` × `alto` → un lienzo que el motor dibuja con `drawImage`. */
function lienzoDe(bytes, ancho, alto, lienzo = null) {
  const l = lienzo ?? createCanvas(ancho, alto);
  l.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, ancho * alto * 4), ancho, alto), 0, 0);
  return l;
}

/** Los argumentos de ffmpeg para sacar cuadros RGBA de un clip desde `desde` s, a la medida `m`. */
const argsDeCuadros = (archivo, desde, m, extra = []) => [
  "-hide_banner", "-nostdin", "-v", "error", "-ss", Math.max(0, desde).toFixed(3), "-i", archivo,
  "-an", "-vf", `scale=${m.ancho}:${m.alto}:flags=bicubic,format=rgba`, ...extra, "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1",
];

/**
 * UN cuadro del clip en su segundo `s` → un lienzo, o null si no está o no se pudo leer. Pasado su final, el último.
 */
export async function cuadroDe(id, s) {
  const info = await infoDe(id);
  if (!info) return null;
  const m = medidaDeDecodificar(info);
  const t = Math.max(0, Math.min(Number(s) || 0, Math.max(0, info.duracion - 0.05)));
  const r = await correr(FFMPEG, argsDeCuadros(ruta(id), t, m, ["-frames:v", "1"]));
  const n = m.ancho * m.alto * 4;
  if (r.codigo !== 0 || r.salida.length < n) return null;
  return lienzoDe(r.salida, m.ancho, m.alto);
}

/**
 * Los cuadros SEGUIDOS de un uso de un clip para el render: ffmpeg los saca a `fps` desde `desde` y se leen a medida que
 * se piden (`en(s)`), sin tener el clip en memoria. Pasado el final del clip, devuelve el último cuadro (el motor lo deja
 * quieto). Un segundo anterior al ya leído (no pasa en un render, que va hacia delante) devuelve el que hay.
 */
export class Decodificador {
  constructor(id, info, desde, fps = RENDER.fps) {
    this.m = medidaDeDecodificar(info);
    this.bytes = this.m.ancho * this.m.alto * 4;
    this.desde = desde;
    this.fps = fps;
    this.indice = -1;
    this.lienzo = null;
    this.fin = false;
    this.proc = spawn(FFMPEG, [...argsDeCuadros(ruta(id), desde, this.m, ["-r", String(fps)])], { stdio: ["ignore", "pipe", "ignore"] });
    this.proc.on("error", () => { this.fin = true; });
    this.it = this.proc.stdout[Symbol.asyncIterator]();
    this.trozos = [];
    this.largo = 0;
  }

  async leerUno() {
    while (this.largo < this.bytes && !this.fin) {
      const { value, done } = await this.it.next();
      if (done) { this.fin = true; break; }
      this.trozos.push(value);
      this.largo += value.length;
    }
    if (this.largo < this.bytes) return null;
    const todo = this.trozos.length === 1 ? this.trozos[0] : Buffer.concat(this.trozos, this.largo);
    const cuadro = todo.subarray(0, this.bytes);
    const resto = todo.subarray(this.bytes);
    this.lienzo = lienzoDe(cuadro, this.m.ancho, this.m.alto, this.lienzo);
    this.trozos = resto.length ? [Buffer.from(resto)] : [];
    this.largo = resto.length;
    return this.lienzo;
  }

  /** El cuadro del segundo `s` del clip (o el último que hubo). */
  async en(s) {
    const objetivo = Math.max(0, Math.round((s - this.desde) * this.fps));
    while (this.indice < objetivo && !this.fin) {
      const l = await this.leerUno();
      if (!l) break;
      this.indice++;
    }
    return this.lienzo;
  }

  cerrar() {
    this.fin = true;
    try { this.proc.kill("SIGKILL"); } catch { /* ya terminó */ }
  }
}

/**
 * El sonido de un tramo del clip (`desde`, `dur` en segundos del clip) en PCM s16le estéreo al muestreo del render → un
 * Uint8Array (vacío si el clip no tiene audio o no se pudo leer: el video sale igual, sin ese sonido).
 */
export async function audioDe(id, desde, dur) {
  const info = await infoDe(id);
  if (!info?.audio || !(dur > 0)) return new Uint8Array(0);
  const muestreo = String(RENDER.muestreo);
  const r = await correr(FFMPEG, [
    "-hide_banner", "-nostdin", "-v", "error", "-ss", Math.max(0, desde).toFixed(3), "-t", dur.toFixed(3), "-i", ruta(id),
    "-vn", "-af", `aresample=${muestreo}`, "-ac", "2", "-ar", muestreo, "-c:a", "pcm_s16le", "-f", "s16le", "pipe:1",
  ]);
  return r.codigo === 0 ? new Uint8Array(r.salida.buffer, r.salida.byteOffset, r.salida.length) : new Uint8Array(0);
}
