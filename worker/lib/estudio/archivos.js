// ============================================================
// Los archivos del Estudio: claves de R2, tipo y medidas
//
// Puro. Nada aquí toca la base ni R2.
// ============================================================

const EXTENSIONES = Object.freeze({
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg",
  "video/mp4": "mp4", "video/webm": "webm",
});

/** La extensión de un tipo; nunca la que traiga el proveedor por su cuenta. */
export const extensionDe = (mime) => EXTENSIONES[String(mime).toLowerCase()] ?? "bin";

/** «una tarjeta de café con ñandú» → «una-tarjeta-de-cafe-con-nandu», corto y seguro para una clave. */
export function slugCorto(texto, max = 40) {
  return String(texto ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, max).replace(/-+$/g, "") || "imagen";
}

/**
 * La clave de R2 de un archivo del Estudio. NUNCA se reutiliza: lleva un
 * trozo de uuid al final. En Agents Office reutilizar un nombre hizo que la
 * galería enseñara una imagen vieja desde la caché del navegador; aquí la
 * ruta de medios cachea una hora (`private, max-age=3600`), así que sería lo
 * mismo. Cuelga de `clientes/<id>/`: es lo que `/api/media` sirve y acota.
 */
export function claveDeArchivo(clientId, prompt, mime, { fecha = new Date(), aleatorio = crypto.randomUUID() } = {}) {
  const iso = fecha.toISOString();
  return `clientes/${clientId}/estudio/${iso.slice(0, 7)}/${iso.slice(0, 10)}-${slugCorto(prompt)}-${String(aleatorio).slice(0, 8)}.${extensionDe(mime)}`;
}

/**
 * ¿Esta clave (o ruta `/api/media/…`) es de UN archivo de ESTE cliente?
 * Devuelve la clave limpia o null. Es lo que impide usar de referencia, o
 * poner en una publicación, un archivo de otro cliente: el id llega del
 * navegador y no se cree.
 */
export function claveDelCliente(valor, clientId) {
  const clave = String(valor ?? "").replace(/^\/api\/media\//, "");
  if (!clave.startsWith(`clientes/${clientId}/`) || clave.includes("..") || clave.length > 300) return null;
  return clave;
}

/** ¿Es un archivo del Estudio (y no una imagen de publicación cualquiera)? */
export const esDelEstudio = (clave) => /^clientes\/[^/]+\/estudio\//.test(String(clave ?? ""));

/**
 * Ancho y alto de una imagen, mirando sólo su cabecera (PNG y JPEG). 0 y 0
 * si no se sabe. Sirve para comprobar la proporción de una publicación sin
 * decodificar nada.
 */
export function medidasDe(bytes, mime) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    if (/png/i.test(mime) && b.length > 24 && b[1] === 0x50) {
      const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
      return { ancho: v.getUint32(16), alto: v.getUint32(20) };
    }
    if (/jpe?g/i.test(mime) && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const marca = b[i + 1];
        if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
          return { alto: (b[i + 5] << 8) | b[i + 6], ancho: (b[i + 7] << 8) | b[i + 8] };
        }
        i += 2 + ((b[i + 2] << 8) | b[i + 3]);
      }
    }
  } catch { /* cabecera rota: no se sabe */ }
  return { ancho: 0, alto: 0 };
}

/** Lo que se puede guardar como archivo del Estudio, por sus primeros bytes y no por lo que diga quien lo manda. */
export function tipoPorBytes(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "video/mp4";
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  return null;
}
