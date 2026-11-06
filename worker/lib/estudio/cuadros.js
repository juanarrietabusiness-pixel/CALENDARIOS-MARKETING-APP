// ============================================================
// VER UN CUADRO del video animado y REVISARLO antes de renderizar (por el Container: worker/contenedor.js)
//
// El Worker no tiene lienzo; el Container sí, con el MISMO motor que la vista previa. Aquí se arma el pedido con lo
// que el Container no puede leer por su cuenta (no tiene llaves ni internet):
//   · el guion validado y los tiempos de la locución (si la hay; si no, el motor estima a 2,5 palabras por segundo);
//   · la paleta del kit del cliente;
//   · las imágenes que nombra el guion —ids de la GALERÍA de ESE cliente, nunca una clave que llegue de fuera—, el
//     logo del kit y la letra (la del kit, o la que pida el guion si es de ese cliente), leídas de R2 y en base64;
//   · los CLIPS de video (capas `video`) NO van en el pedido: pesan decenas de MB y el Worker tiene 128. Se suben antes,
//     por flujo desde R2, con `PUT /clip/<id>` (`subirClips`), y el pedido sólo los nombra (`videos`);
//   · las IMÁGENES que no caben en el tope del pedido (un fondo de IA por sección suma decenas de MB) tampoco: se suben
//     igual, con `PUT /imagen/<id>` (`subirImagenes`), y el pedido las nombra en `imagenesSubidas`.
// No gasta dinero de IA: es cómputo del Container (céntimos de céntimo; ver CLAUDE.md).
// ============================================================

import { ErrorVideo } from "../videosProyectos.js";
import { kitDe } from "./kit.js";
import { conPersonajeDelKit } from "../../../src/lib/personajeVideo.js";
import { claveDelCliente } from "./archivos.js";
import { validarGuion, archivosDelGuion, videosDelGuion, FORMATOS_VIDEO } from "../../../src/lib/videoEscenas.js";
import { palabrasParaLinea } from "../../../src/lib/videoCancion.js";

/**
 * Lo más que pesa lo que va DENTRO del pedido (imágenes y fuentes, en base64): el Worker y el Durable Object del render
 * lo tienen en memoria varias veces (los bytes, el base64 y el JSON). Lo que no cabe se sube por flujo (`subirImagenes`).
 */
const TOPE_TOTAL = 16 * 1024 * 1024;
/** Una imagen que se sube aparte puede pesar hasta esto (container/imagenes.mjs admite 25 MB). */
const TOPE_SUBIDA = 24 * 1024 * 1024;
/** Una imagen o una fuente de más de esto no se manda (el motor pinta su marcador). */
const TOPE_ARCHIVO = 8 * 1024 * 1024;
/** El nombre del único Container de cuadros del espacio (worker/contenedor.js). */
const NOMBRE = "cuadros";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };

/** Bytes → base64, por trozos (un `String.fromCharCode(...bytes)` de varios MB revienta la pila). */
export function aBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Un archivo de R2 en base64, o null si no está, pesa de más o se pasa del total. */
async function deR2(env, clave, cuenta) {
  if (!clave) return null;
  const obj = await env.MEDIA.get(clave).catch(() => null);
  if (!obj || obj.size > TOPE_ARCHIVO || cuenta.bytes + obj.size > TOPE_TOTAL) return null;
  const bytes = new Uint8Array(await obj.arrayBuffer());
  cuenta.bytes += bytes.length;
  return aBase64(bytes);
}

/** Lo que se sabe de un objeto de R2 sin bajarlo (`head`; con un R2 que no lo tenga, `get` sin leer el cuerpo) o null. */
async function enR2(env, clave) {
  try {
    if (typeof env.MEDIA.head === "function") return await env.MEDIA.head(clave);
    const obj = await env.MEDIA.get(clave);
    await obj?.body?.cancel?.();
    return obj;
  } catch { return null; }
}

/**
 * Todo lo que el Container necesita para dibujar este video → { pedido, guion, palabras }.
 * Sólo lee: la galería, el kit y R2 de ESE cliente.
 */
export async function pedidoDelVideo(env, acceso, cliente, fila, { formato } = {}) {
  const v = validarGuion(leerJSON(fila.guion, null));
  if (!v.ok) throw new ErrorVideo("El guion tiene errores: corrígelos antes de mirarlo.", 400, { errores: v.errores });
  const kit = kitDe(cliente);
  // El personaje se dibuja con el aspecto del kit si el guion no trae uno propio.
  const guion = conPersonajeDelKit(v.guion, kit);
  // Las de la locución, o las de la CANCIÓN sacadas del guion de ahora contra su letra (con el ajuste fino).
  const locucion = leerJSON(fila.locucion, {});
  const palabras = palabrasParaLinea(guion, locucion);
  const cuenta = { bytes: 0 };

  // El logo y la letra PRIMERO: pesan poco y sin ellos el video sale sin marca. Las imágenes, con lo que quede.
  const logo = await deR2(env, claveDelCliente(kit.logo ?? "", cliente.id), cuenta);
  // La letra: la que pida el guion (si es de este cliente) o la del kit.
  const claveDe = (f) => (f && typeof f === "object" && f.clave ? claveDelCliente(f.clave, cliente.id) : claveDelCliente(kit.fuente?.clave ?? "", cliente.id));
  const titularClave = claveDe(guion.estilo?.fuentes?.titular);
  const cuerpoClave = claveDe(guion.estilo?.fuentes?.cuerpo);
  const titular = titularClave ? await deR2(env, titularClave, cuenta) : null;
  const cuerpo = cuerpoClave && cuerpoClave !== titularClave ? await deR2(env, cuerpoClave, cuenta) : titular;

  // Las imágenes: los ids del guion que ESTÁN en la galería de este cliente (lo demás sale como marcador). Las que no
  // caben en el pedido van a `porSubir`: se suben por flujo antes de pedir (subirImagenes) y el pedido las nombra.
  const ids = archivosDelGuion(guion);
  const imagenes = {};
  const porSubir = [];
  for (const id of ids) {
    const f = await acceso.leerUno("estudio_archivos", { id: String(id), client_id: cliente.id }).catch(() => null);
    if (!f || f.borrado_at || !String(f.mime ?? "").startsWith("image/")) continue;
    const clave = claveDelCliente(f.clave, cliente.id);
    if (!clave) continue;
    const obj = await enR2(env, clave);
    if (!obj) continue;
    if (obj.size <= TOPE_ARCHIVO && cuenta.bytes + obj.size <= TOPE_TOTAL) {
      const b = await deR2(env, clave, cuenta);
      if (b) { imagenes[id] = b; continue; }
    }
    if (obj.size <= TOPE_SUBIDA) porSubir.push({ id: String(id), clave });
  }

  // Los clips: los ids que ESTÁN en la galería de este cliente como video (lo demás sale con su «Video» de espera).
  const idsVideo = videosDelGuion(guion);
  const clips = [];
  for (const id of idsVideo) {
    const f = await acceso.leerUno("estudio_archivos", { id: String(id), client_id: cliente.id }).catch(() => null);
    const clave = f && !f.borrado_at && String(f.mime ?? "").startsWith("video/") ? claveDelCliente(f.clave, cliente.id) : null;
    if (clave) clips.push({ id: String(id), clave });
  }

  return {
    guion, palabras,
    pedido: {
      guion, palabras, formato: FORMATOS_VIDEO[formato] ? formato : guion.formatos[0], paleta: kit.paleta ?? [],
      // Los golpes de la canción (si los hay): el `pulso` de una capa late con ellos.
      ...(Array.isArray(locucion.golpes) && locucion.golpes.length ? { golpes: locucion.golpes } : {}),
      imagenes, logo, fuentes: { titular: titular ? { datos: titular } : null, cuerpo: cuerpo ? { datos: cuerpo } : null },
      videos: clips.map((c) => c.id),
      ...(porSubir.length ? { imagenesSubidas: porSubir.map((x) => x.id) } : {}),
    },
    clips,
    porSubir,
    faltan: [
      ...ids.filter((id) => !imagenes[id] && !porSubir.some((x) => x.id === String(id))),
      ...idsVideo.filter((id) => !clips.some((c) => c.id === String(id))),
    ],
  };
}

/**
 * Sube al Container las imágenes que no cupieron en el pedido (`HEAD /imagen/<id>` primero, como los clips), por flujo
 * desde R2. → los ids que NO se pudieron subir (salen como marcador; el resto del video sale igual).
 */
export async function subirImagenes(env, lista, pedir) {
  return subirPorFlujo(env, lista, pedir, "imagen");
}

/** Quita del pedido lo que no subió (`fallaron`: clips o imágenes) y lo suma a `faltan`. */
export function sinLoQueNoSubio(r, { clips = [], imagenes = [] } = {}) {
  if (!clips.length && !imagenes.length) return r;
  const pedido = { ...r.pedido, videos: r.pedido.videos.filter((id) => !clips.includes(id)) };
  if (pedido.imagenesSubidas) pedido.imagenesSubidas = pedido.imagenesSubidas.filter((id) => !imagenes.includes(id));
  return { ...r, pedido, faltan: [...new Set([...r.faltan, ...clips, ...imagenes])] };
}

/**
 * Sube al Container los clips que aún no tiene (`HEAD /clip/<id>` primero: se quedan en su disco mientras está
 * despierto). `pedir(ruta, init)` → la Response del Container (el de los cuadros o el del render). El cuerpo va por FLUJO
 * desde R2: el Worker nunca tiene el video entero en memoria. → los ids que NO se pudieron subir (salen con su «Video» de
 * espera; el resto del video sale igual).
 */
export async function subirClips(env, clips, pedir) {
  return subirPorFlujo(env, clips, pedir, "clip");
}

/** Sube por flujo desde R2 cada `{ id, clave }` a `/<ruta>/<id>` si el Container no lo tiene ya. → los que fallaron. */
async function subirPorFlujo(env, lista, pedir, ruta) {
  const fallaron = [];
  for (const c of lista ?? []) {
    try {
      const h = await pedir(`/${ruta}/${c.id}`, { method: "HEAD" });
      if (h.ok) continue;
      const obj = await env.MEDIA.get(c.clave);
      if (!obj) { fallaron.push(c.id); continue; }
      const r = await pedir(`/${ruta}/${c.id}`, { method: "PUT", body: obj.body, duplex: "half", headers: { "Content-Length": String(obj.size) } });
      if (!r.ok) fallaron.push(c.id);
      await r.body?.cancel?.().catch(() => {});
    } catch (e) {
      console.error(`subir ${ruta}:`, e?.message ?? e);
      fallaron.push(c.id);
    }
  }
  return fallaron;
}

/** Un pedido CRUDO al Container de los cuadros (para `subirClips`). */
export function pedirAlContenedor(env) {
  if (!env.VIDEO) throw new ErrorVideo("El Container del video no está disponible aquí (en local no se arranca: se prueba con container/probar.mjs).", 503);
  const stub = env.VIDEO.get(env.VIDEO.idFromName(NOMBRE));
  return (ruta, init) => stub.fetch(new Request(`https://contenedor${ruta}`, init));
}

/**
 * Lo de `pedidoDelVideo` con los clips y las imágenes que no cabían YA en el Container de los cuadros: para /cuadro,
 * /hoja y /revisar. Lo que no se pudo subir se quita del pedido (sale su «Video» de espera o su marcador) y va en `faltan`.
 */
export async function pedidoConClips(env, acceso, cliente, fila, opciones = {}) {
  const r = await pedidoDelVideo(env, acceso, cliente, fila, opciones);
  if (!r.clips.length && !r.porSubir.length) return r;
  const pedir = pedirAlContenedor(env);
  const clips = r.clips.length ? await subirClips(env, r.clips, pedir) : [];
  const imagenes = r.porSubir.length ? await subirImagenes(env, r.porSubir, pedir) : [];
  return sinLoQueNoSubio(r, { clips, imagenes });
}

/** Pide algo al Container del espacio → la Response. Sin Container (en local), 503 diciendo por qué. */
export async function alContenedor(env, ruta, cuerpo) {
  if (!env.VIDEO) {
    throw new ErrorVideo("El Container del video no está disponible aquí (en local no se arranca: se prueba con container/probar.mjs).", 503);
  }
  const stub = env.VIDEO.get(env.VIDEO.idFromName(NOMBRE));
  const r = await stub.fetch(new Request(`https://contenedor${ruta}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
  }));
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new ErrorVideo(j.error || `El Container del video respondió ${r.status}.`, [400, 503].includes(r.status) ? r.status : 502);
  }
  return r;
}

/** Bytes de una Response en base64 (para devolver la imagen a Claude). */
export async function respuestaEnBase64(r) {
  return aBase64(new Uint8Array(await r.arrayBuffer()));
}
