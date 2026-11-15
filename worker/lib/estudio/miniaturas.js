// ============================================================
// Lo que Claude VE de una pieza del Estudio por MCP (y el asistente por sus herramientas de servidor)
//
// El Worker no tiene lienzo; el Container del video animado sí (worker/contenedor.js, container/servidor.mjs →
// POST /miniatura). Una pieza de 2K en PNG pesa de 4 a 8 MB: mandarla entera en el resultado de una herramienta gasta
// tokens y puede pasarse del tope de imagen de quien la recibe. Por eso va una COPIA reducida en JPEG (768 de lado
// mayor), que alcanza para juzgar el diseño, el texto y la marca.
//
// Sin Container (en local, o si falla) se manda la ORIGINAL sólo si es pequeña; si no, nada: el texto dice que no se
// pudo enseñar, y la pieza sigue en la galería. Nunca tumba la herramienta: ver una pieza es un extra.
// No gasta IA: es cómputo del Container (céntimos de céntimo).
// ============================================================

import { alContenedor, aBase64 } from "./cuadros.js";

/** El lado mayor de la copia: lo mismo que usa el director de la aplicación (`paraElModelo`). */
export const LADO_MINIATURA = 768;
/** Cuántas piezas se enseñan de una vez como mucho (cada una son ~1.000 tokens de imagen). */
export const MAX_PIEZAS_VISTAS = 6;
/** Más que esto no se lee de R2 para reducirlo (una pieza de 4K en PNG ronda los 20 MB; no es lo normal). */
const TOPE_LEER = 24 * 1024 * 1024;
/** Sin Container, la original sólo si pesa menos que esto. */
const TOPE_ORIGINAL = 1_200_000;
const MIMES_ORIGINAL = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * La copia reducida de una imagen de R2 → { datos (base64), mime, ancho?, alto?, original? } o null.
 * `mime` es el de la ficha de la galería (el de R2 puede no estar).
 */
export async function miniaturaDe(env, clave, { mime = "", lado = LADO_MINIATURA } = {}) {
  if (!clave || !env?.MEDIA) return null;
  const obj = await env.MEDIA.get(clave).catch(() => null);
  if (!obj || obj.size > TOPE_LEER) return null;
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if (env.VIDEO) {
    try {
      const r = await alContenedor(env, "/miniatura", { imagen: aBase64(bytes), lado });
      const j = await r.json();
      if (j?.datos) return { datos: j.datos, mime: j.mime || "image/jpeg", ancho: j.ancho, alto: j.alto, original: j.original };
    } catch (e) {
      console.error("miniatura:", e?.message ?? e);
    }
  }
  const tipo = mime || obj.httpMetadata?.contentType || "";
  if (bytes.length <= TOPE_ORIGINAL && MIMES_ORIGINAL.has(tipo)) return { datos: aBase64(bytes), mime: tipo };
  return null;
}

/** Varias fichas de la galería → sus copias, en orden, una a una (el Worker no carga varias de 2K a la vez). */
export async function miniaturasDe(env, fichas, opciones = {}) {
  const salida = [];
  for (const f of fichas.slice(0, MAX_PIEZAS_VISTAS)) {
    if (!String(f?.mime ?? "").startsWith("image/")) { salida.push(null); continue; }
    salida.push(await miniaturaDe(env, f.clave, { ...opciones, mime: f.mime }).catch(() => null));
  }
  return salida;
}

// ============================================================
// La COPIA REDUCIDA de una imagen de publicación (lo que pintan el chip del mes, la cuadrícula del perfil y la
// página del cliente)
//
// Esas vistas pintaban el ORIGINAL: piezas de 2K de 4 a 8 MB por chip, y un mes en el teléfono pasaba de 100 MB. La
// pantalla pide `/api/media/<clave>?mini=1` (o la ruta pública con `?mini=1`): el permiso se comprueba sobre el
// ORIGINAL, como siempre, y se sirve su copia de `LADO_REDUCIDA` en JPEG. La copia se hace al subir la imagen y, para
// todo lo demás (lo del Estudio, lo de antes), la primera vez que alguien la pide: mientras no existe se redirige al
// original y se encarga detrás de la respuesta. Sin Container (en local) no hay copia y se ve el original, como antes.
// Vive bajo `reducidas/`, fuera de `clientes/`: /api/media no la sirve por su cuenta, sólo por la ruta de su original.
// ============================================================

/** El lado mayor de la copia: un chip ocupa como mucho ~150 px de ancho, una celda del perfil ~130 a 3× de densidad. */
export const LADO_REDUCIDA = 480;
const TOPE_REDUCIR = 16 * 1024 * 1024;
const REDUCIBLES = /^image\/(jpeg|png|webp|gif)$/i;
/** A la vez por instancia: cada una lee su original entero (hasta 16 MB) y lo manda en base64; con 30 chips a la vez
 *  se pasaría de la memoria del Worker. Las que no entran se hacen la próxima vez que alguien las pida. */
const A_LA_VEZ = 2;
let enCurso = 0;
const haciendo = new Set();

/** Dónde vive la copia reducida de un archivo de R2. */
export const claveReducida = (clave) => `reducidas/${clave}.jpg`;

const deBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Apunta que esa imagen NO tiene copia (no es una imagen que se pueda reducir): no se vuelve a intentar. */
const sinCopia = (env, clave) => env.MEDIA.put(claveReducida(clave), new Uint8Array(0), { customMetadata: { sin: "1" } }).catch(() => {});

/** Hace y guarda la copia reducida de `clave` con el Container. → true si la dejó. No lanza. */
export async function crearReducida(env, clave) {
  if (!env?.MEDIA || !env?.VIDEO || !clave || haciendo.has(clave) || enCurso >= A_LA_VEZ) return false;
  haciendo.add(clave);
  enCurso++;
  try {
    const obj = await env.MEDIA.get(clave);
    if (!obj) return false;
    if (!REDUCIBLES.test(obj.httpMetadata?.contentType ?? "") || obj.size > TOPE_REDUCIR) {
      await obj.body?.cancel?.();
      await sinCopia(env, clave);
      return false;
    }
    const bytes = new Uint8Array(await obj.arrayBuffer());
    let r;
    try {
      r = await alContenedor(env, "/miniatura", { imagen: aBase64(bytes), lado: LADO_REDUCIDA });
    } catch (e) {
      // 400: no es una imagen que se pueda leer. Lo demás (el Container dormido o caído) se reintenta la próxima vez.
      if (e?.estado === 400) await sinCopia(env, clave);
      return false;
    }
    const j = await r.json().catch(() => null);
    if (!j?.datos) return false;
    await env.MEDIA.put(claveReducida(clave), deBase64(j.datos), { httpMetadata: { contentType: "image/jpeg" } });
    return true;
  } catch (e) {
    console.error("copia reducida:", clave, e?.message ?? e);
    return false;
  } finally {
    enCurso--;
    haciendo.delete(clave);
  }
}

/**
 * Sirve la copia reducida de `clave` (el permiso sobre el original ya se comprobó). Si aún no existe, redirige a
 * `original` (la misma ruta sin `?mini`) sin caché —así la próxima vez se vuelve a preguntar— y, si hay Container,
 * la encarga detrás de la respuesta.
 */
export async function sirveReducida(env, clave, { original, exec = null } = {}) {
  const obj = await env.MEDIA.get(claveReducida(clave)).catch(() => null);
  if (obj && !obj.customMetadata?.sin && obj.size > 0) {
    const cabeceras = { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" };
    if (obj.httpEtag) cabeceras.etag = obj.httpEtag;
    return new Response(obj.body, { headers: cabeceras });
  }
  if (!obj && env.VIDEO) {
    const tarea = crearReducida(env, clave);
    if (exec?.waitUntil) exec.waitUntil(tarea);
    else await tarea;
  }
  return new Response(null, { status: 302, headers: { Location: original, "Cache-Control": "no-store" } });
}
