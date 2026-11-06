// ============================================================
// Las IMÁGENES del video animado que no caben en el pedido, dentro del Container
//
// El pedido JSON lleva las imágenes en base64 hasta un tope (worker/lib/estudio/cuadros.js): el Worker y el Durable
// Object del render tienen 128 MB, y un video largo con un fondo de IA por sección suma decenas de MB (13 fondos de
// 2 MB en el de 57DMC: el último salía como marcador). Lo que no cabe se SUBE antes, por flujo, con `PUT /imagen/<id>`
// (el id de la galería), como los clips, y el pedido sólo lo nombra (`imagenesSubidas`). Aquí se guarda en disco
// mientras el Container está despierto; pasado `TOPE_DISCO` se borra lo que lleva más tiempo sin usarse. El id es el de
// la galería (un archivo no cambia de bytes con el mismo id), así que no hace falta comprobar si cambió.
// ============================================================

import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat, utimes, readFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { ErrorClip } from "./clips.mjs";

const CARPETA = join(tmpdir(), "imagenes");
/** Lo más que pesa una imagen subida (la galería admite menos: es sólo un tope de seguridad). */
export const TOPE_IMAGEN = 25 * 1024 * 1024;
/** Lo que ocupan como mucho las imágenes guardadas. */
const TOPE_DISCO = 512 * 1024 * 1024;
const ID = /^[\w-]{1,80}$/;

const ruta = (id) => {
  if (!ID.test(String(id ?? ""))) throw new ErrorClip("El id de la imagen no vale.");
  return join(CARPETA, `${id}.bin`);
};

/** ¿Está ya la imagen? (y la marca como usada). */
export async function tieneImagen(id) {
  const r = ruta(id);
  if (!existsSync(r)) return false;
  const ahora = new Date();
  await utimes(r, ahora, ahora).catch(() => {});
  return true;
}

/** Borra las imágenes menos usadas hasta que lo guardado quepa en `TOPE_DISCO`. */
async function hacerSitio() {
  const nombres = await readdir(CARPETA).catch(() => []);
  const lista = [];
  for (const n of nombres.filter((x) => x.endsWith(".bin"))) {
    const s = await stat(join(CARPETA, n)).catch(() => null);
    if (s) lista.push({ n, bytes: s.size, usado: s.mtimeMs });
  }
  let total = lista.reduce((t, x) => t + x.bytes, 0);
  for (const x of lista.sort((a, b) => a.usado - b.usado)) {
    if (total <= TOPE_DISCO) break;
    await rm(join(CARPETA, x.n), { force: true });
    total -= x.bytes;
  }
}

/** Guarda una imagen que llega por flujo → { bytes }. Si pasa del tope, 413 y nada queda. */
export async function guardarImagen(id, entrada) {
  const destino = ruta(id);
  await mkdir(CARPETA, { recursive: true });
  const temporal = `${destino}.parte`;
  let n = 0;
  const contar = new Transform({
    transform(trozo, _, listo) {
      n += trozo.length;
      if (n > TOPE_IMAGEN) listo(new ErrorClip(`La imagen pesa más de ${Math.round(TOPE_IMAGEN / 1048576)} MB.`, 413));
      else listo(null, trozo);
    },
  });
  try {
    await pipeline(entrada, contar, createWriteStream(temporal));
    if (!n) throw new ErrorClip("La imagen llegó vacía.");
    await rename(temporal, destino);
    await hacerSitio();
    return { bytes: n };
  } catch (e) {
    await rm(temporal, { force: true }).catch(() => {});
    throw e;
  }
}

/** Los bytes de una imagen subida, o null si no está. */
export async function bytesDeImagen(id) {
  if (!(await tieneImagen(id))) return null;
  return readFile(ruta(id)).catch(() => null);
}
