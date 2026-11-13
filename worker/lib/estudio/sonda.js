// ============================================================
// Medir un archivo ya guardado en R2 sin cargarlo entero: ancho, alto y duración
//
// Lo usa lo que Claude sube a la galería (subidaClaude.js): un mp4 de 90 MB no cabe en la memoria del Worker junto a
// todo lo demás, y el Worker no tiene ffprobe. Un MP4 (y un MOV) es una lista de CAJAS; la que lleva la duración y las
// medidas es `moov`, que puede ir al principio (con «faststart») o AL FINAL del archivo. Se recorren las cajas de
// primer nivel leyendo sólo su cabecera (16 bytes, por rango) hasta dar con `moov`, y se lee ésa entera (unos KB).
//
//   · La duración, de `mvhd` (escala y duración, versión 0 o 1).
//   · Las medidas, del `tkhd` de la pista de VIDEO (la que su `hdlr` dice «vide»), en 16.16; si su matriz gira 90°
//     (un video grabado de pie en el teléfono), se cruzan: lo que importa es cómo se VE.
//   · Imágenes: PNG y JPEG con `medidasDe` (archivos.js); WebP aquí (VP8, VP8L y VP8X).
//   · Audio: `duracionDeAudio` (videoCancion.js), con el archivo entero (el audio va topado a 20 MB).
//
// Puro salvo `sondearEnR2`, que sólo LEE de R2 por rangos. Nada aquí escribe.
// ============================================================

import { medidasDe } from "./archivos.js";
import { duracionDeAudio } from "../../../src/lib/videoCancion.js";

const u32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const i32 = (b, i) => (b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
const u16le = (b, i) => b[i] | (b[i + 1] << 8);
const u24le = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const fourcc = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
const r3 = (x) => Math.round(x * 1000) / 1000;

/** El tope de una caja `moov` que se lee entera (la de un reel de 60 s son unos 50–200 KB). */
export const MAX_MOOV = 8 * 1024 * 1024;
/** Las cajas de primer nivel que se miran como mucho buscando `moov`. */
const MAX_CAJAS = 40;

/** Las cajas hijas de [desde, hasta) dentro de `b`: [{ tipo, inicio, cuerpo, fin }]. Pura. */
function hijas(b, desde, hasta) {
  const out = [];
  for (let i = desde; i + 8 <= hasta && out.length < 500;) {
    let largo = u32(b, i);
    const tipo = fourcc(b, i + 4);
    let cab = 8;
    if (largo === 1 && i + 16 <= hasta) { largo = Number((BigInt(u32(b, i + 8)) << 32n) | BigInt(u32(b, i + 12))); cab = 16; }
    if (largo === 0 || largo < cab) largo = hasta - i;
    out.push({ tipo, inicio: i, cuerpo: i + cab, fin: Math.min(hasta, i + largo) });
    i += largo;
  }
  return out;
}

/**
 * Duración y medidas de la caja `moov` (sus bytes, cabecera incluida o no: se acepta desde `moov` o desde su cuerpo).
 * → { duracion, ancho, alto } (0 lo que no se sepa). Pura.
 */
export function datosDeMoov(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  const fuera = { duracion: 0, ancho: 0, alto: 0 };
  if (b.length < 16) return fuera;
  const inicio = fourcc(b, 4) === "moov" ? 8 : 0;
  try {
    for (const caja of hijas(b, inicio, b.length)) {
      if (caja.tipo === "mvhd") {
        const v = b[caja.cuerpo];
        const escala = v === 1 ? u32(b, caja.cuerpo + 20) : u32(b, caja.cuerpo + 12);
        const dur = v === 1 ? Number((BigInt(u32(b, caja.cuerpo + 24)) << 32n) | BigInt(u32(b, caja.cuerpo + 28))) : u32(b, caja.cuerpo + 16);
        if (escala > 0) fuera.duracion = r3(dur / escala);
      }
      if (caja.tipo === "trak" && !fuera.ancho) {
        const dentro = hijas(b, caja.cuerpo, caja.fin);
        const tkhd = dentro.find((x) => x.tipo === "tkhd");
        const mdia = dentro.find((x) => x.tipo === "mdia");
        const hdlr = mdia ? hijas(b, mdia.cuerpo, mdia.fin).find((x) => x.tipo === "hdlr") : null;
        // hdlr: versión y banderas (4), pre_defined (4) y el tipo de pista.
        const esVideo = hdlr ? fourcc(b, hdlr.cuerpo + 8) === "vide" : false;
        if (!tkhd || !esVideo) continue;
        const v = b[tkhd.cuerpo];
        // Tras versión y banderas: fechas, id, reservado y duración (20 o 32 bytes), 8 reservados, capa, grupo,
        // volumen y 2 reservados (8), la matriz (36) y el ancho y el alto en 16.16.
        const matriz = tkhd.cuerpo + 4 + (v === 1 ? 32 : 20) + 8 + 8;
        const ancho = Math.round(u32(b, matriz + 36) / 65536);
        const alto = Math.round(u32(b, matriz + 40) / 65536);
        const a = i32(b, matriz) / 65536;
        const bb = i32(b, matriz + 4) / 65536;
        const girado = Math.abs(a) < 0.01 && Math.abs(bb) > 0.5;
        if (ancho > 0 && alto > 0) Object.assign(fuera, girado ? { ancho: alto, alto: ancho } : { ancho, alto });
      }
    }
  } catch { /* caja rota: lo que se supo */ }
  return fuera;
}

/** Ancho y alto de un WebP por su cabecera (VP8, VP8L o VP8X). 0 y 0 si no se sabe. Pura. */
export function medidasWebp(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (b.length < 30 || fourcc(b, 0) !== "RIFF" || fourcc(b, 8) !== "WEBP") return { ancho: 0, alto: 0 };
  const trozo = fourcc(b, 12);
  if (trozo === "VP8X") return { ancho: u24le(b, 24) + 1, alto: u24le(b, 27) + 1 };
  if (trozo === "VP8 ") return { ancho: u16le(b, 26) & 0x3fff, alto: u16le(b, 28) & 0x3fff };
  if (trozo === "VP8L") {
    const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { ancho: (v & 0x3fff) + 1, alto: ((v >>> 14) & 0x3fff) + 1 };
  }
  return { ancho: 0, alto: 0 };
}

/** Las medidas de una imagen por su cabecera (PNG, JPEG, WebP). Pura. */
export function medidasDeImagen(cabecera, mime) {
  return mime === "image/webp" ? medidasWebp(cabecera) : medidasDe(cabecera, mime);
}

/** Lee `largo` bytes desde `desde` de un objeto de R2 (por rango). Uint8Array, o null si no está. */
async function leerRango(env, clave, desde, largo) {
  const o = await env.MEDIA.get(clave, { range: { offset: desde, length: largo } }).catch(() => null);
  if (!o) return null;
  return new Uint8Array(await (o.arrayBuffer ? o.arrayBuffer() : new Response(o.body).arrayBuffer()));
}

/**
 * Mide lo ya guardado en `clave` (de `bytes` de tamaño): → { ancho, alto, duracion } (0 lo que no se sepa).
 * Nunca lanza: medir no puede tumbar una subida.
 */
export async function sondearEnR2(env, clave, mime, bytes) {
  const fuera = { ancho: 0, alto: 0, duracion: 0 };
  try {
    if (String(mime).startsWith("image/")) {
      const cab = await leerRango(env, clave, 0, Math.min(bytes, 256 * 1024));
      return cab ? { ...fuera, ...medidasDeImagen(cab, mime) } : fuera;
    }
    if (String(mime).startsWith("audio/")) {
      const todo = await leerRango(env, clave, 0, bytes);
      return todo ? { ...fuera, duracion: duracionDeAudio(todo, mime) } : fuera;
    }
    if (mime === "video/mp4") {
      let p = 0;
      for (let n = 0; n < MAX_CAJAS && p + 8 <= bytes; n++) {
        const cab = await leerRango(env, clave, p, 16);
        if (!cab || cab.length < 8) break;
        let largo = u32(cab, 0);
        if (largo === 1 && cab.length >= 16) largo = Number((BigInt(u32(cab, 8)) << 32n) | BigInt(u32(cab, 12)));
        if (largo === 0) largo = bytes - p;
        if (largo < 8) break;
        if (fourcc(cab, 4) === "moov") {
          if (largo > MAX_MOOV) break;
          const moov = await leerRango(env, clave, p, largo);
          return moov ? { ...fuera, ...datosDeMoov(moov) } : fuera;
        }
        p += largo;
      }
    }
  } catch { /* no se pudo medir: se dice que no se sabe */ }
  return fuera;
}
