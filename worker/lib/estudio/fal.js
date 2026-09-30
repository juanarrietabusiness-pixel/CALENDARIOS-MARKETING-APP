// ============================================================
// fal.ai como motor del Estudio
//
//   Imagen   POST https://fal.run/<ruta>            contesta en el acto: { images: [{ url }] }
//   Video    POST https://queue.fal.run/<ruta>      → { request_id, status_url, response_url }
//            GET  <status_url>                      → IN_QUEUE | IN_PROGRESS | COMPLETED
//            GET  <response_url>                    → { video: { url } }
//
// Auth: `Authorization: Key <FAL_KEY>`. Las imágenes de apoyo van como data URI dentro del cuerpo: fal.ai
// las acepta y así no hace falta ninguna dirección pública del Estudio.
//
// LAS DIRECCIONES QUE DEVUELVE fal NO SE CREEN. `status_url` y `response_url` reciben la llave, así que sólo se
// siguen si son de `queue.fal.run`; con otra cosa se reconstruye la de la documentación. (Ojo: fal usa sólo las dos
// primeras partes de la ruta —`dueño/aplicación`— en las direcciones de la cola, por eso importa la que devuelve.)
// El archivo del resultado se baja SIN la llave, de donde diga: no es de fal.
//
// Aquí sólo vive lo que fal.ai sabe: rutas y cuerpos. El catálogo (src/lib/estudioCatalogo.js) dice qué modelos hay.
// Un test recorre los dos lados y falla si un modelo de fal no tiene su ruta aquí, o al revés.
// ============================================================

import { ErrorMotor, aBase64 } from "./gemini.js";
import { abrirDescarga, TOPE_IMAGEN } from "./descarga.js";
import { MEDIDAS } from "../../../src/lib/estudioCatalogo.js";

const RUN = (env) => (env.FAL_RUN_URL || "https://fal.run").replace(/\/$/, "");
const COLA = (env) => (env.FAL_QUEUE_URL || "https://queue.fal.run").replace(/\/$/, "");
const PLAZO_MS = 120_000;
const IMAGENES = ["image/png", "image/jpeg", "image/webp"];

/** `image_size` con nombre, para los modelos que lo piden así. Sólo las proporciones exactas: el catálogo no ofrece otras. */
const TAMANO = { "1:1": "square_hd", "3:4": "portrait_4_3", "9:16": "portrait_16_9", "4:3": "landscape_4_3", "16:9": "landscape_16_9" };

const aDataUri = (f) => `data:${f.mime};base64,${f.base64 ?? aBase64(f.bytes)}`;

/**
 * Lo que fal.ai sabe de cada modelo del catálogo: a qué ruta va un pedido y con qué cuerpo. `m` trae las imágenes
 * ya como data URI: { start: [], end: [], reference: [] }.
 */
export const MODELOS_FAL = Object.freeze({
  // ---- Imagen
  "nano-banana-fal": ({ prompt, ajustes, m }) => (m.reference.length
    ? { ruta: "fal-ai/nano-banana/edit", cuerpo: { prompt, num_images: 1, image_urls: m.reference, aspect_ratio: ajustes.aspectRatio } }
    : { ruta: "fal-ai/nano-banana", cuerpo: { prompt, num_images: 1, aspect_ratio: ajustes.aspectRatio } }),
  "seedream-4": ({ prompt, ajustes, m }) => (m.reference.length
    ? { ruta: "fal-ai/bytedance/seedream/v4/edit", cuerpo: { prompt, num_images: 1, image_urls: m.reference, image_size: TAMANO[ajustes.aspectRatio] ?? "square_hd" } }
    : { ruta: "fal-ai/bytedance/seedream/v4/text-to-image", cuerpo: { prompt, num_images: 1, image_size: TAMANO[ajustes.aspectRatio] ?? "square_hd" } }),
  "flux-kontext": ({ prompt, ajustes, m }) => (m.reference.length
    ? { ruta: "fal-ai/flux-pro/kontext", cuerpo: { prompt, num_images: 1, image_url: m.reference[0], aspect_ratio: ajustes.aspectRatio } }
    : { ruta: "fal-ai/flux-pro/kontext/text-to-image", cuerpo: { prompt, num_images: 1, aspect_ratio: ajustes.aspectRatio } }),
  "flux-schnell": ({ prompt, ajustes }) => ({ ruta: "fal-ai/flux/schnell", cuerpo: { prompt, num_images: 1, image_size: TAMANO[ajustes.aspectRatio] ?? "square_hd" } }),
  "ideogram-3-fal": ({ prompt, ajustes }) => ({ ruta: "fal-ai/ideogram/v3", cuerpo: { prompt, num_images: 1, image_size: TAMANO[ajustes.aspectRatio] ?? "square_hd" } }),
  // ---- Video
  "kling-2.5-fal": ({ prompt, ajustes, m }) => (m.start[0]
    ? { ruta: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video", cuerpo: { prompt, image_url: m.start[0], ...(m.end[0] ? { tail_image_url: m.end[0] } : {}), duration: ajustes.duration } }
    : { ruta: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video", cuerpo: { prompt, duration: ajustes.duration, aspect_ratio: ajustes.aspectRatio } }),
  "seedance-1-fal": ({ prompt, ajustes, m }) => (m.start[0]
    ? { ruta: "fal-ai/bytedance/seedance/v1/pro/image-to-video", cuerpo: { prompt, image_url: m.start[0], ...(m.end[0] ? { end_image_url: m.end[0] } : {}), resolution: ajustes.resolution, duration: ajustes.duration } }
    : { ruta: "fal-ai/bytedance/seedance/v1/pro/text-to-video", cuerpo: { prompt, aspect_ratio: ajustes.aspectRatio, resolution: ajustes.resolution, duration: ajustes.duration } }),
  "hailuo-02-fal": ({ prompt, ajustes, m }) => (m.start[0]
    ? { ruta: "fal-ai/minimax/hailuo-02/standard/image-to-video", cuerpo: { prompt, image_url: m.start[0], ...(m.end[0] ? { end_image_url: m.end[0] } : {}), duration: ajustes.duration } }
    : { ruta: "fal-ai/minimax/hailuo-02/standard/text-to-video", cuerpo: { prompt, duration: ajustes.duration } }),
  "veo-3-fast-fal": ({ prompt, ajustes, m }) => (m.start[0]
    ? { ruta: "fal-ai/veo3/fast/image-to-video", cuerpo: { prompt, image_url: m.start[0], duration: "8s" } }
    : { ruta: "fal-ai/veo3/fast", cuerpo: { prompt, aspect_ratio: ajustes.aspectRatio, duration: "8s" } }),
});

/** Una ruta de modelo válida: letras, números, guiones, puntos y barras. Nada que se salga de fal.ai. */
const RUTA_VALIDA = /^[a-z0-9][a-z0-9._/-]*$/i;

/** Las imágenes de apoyo de un pedido como data URI. */
function comoDataUri(medios = {}) {
  return { start: (medios.start ?? []).map(aDataUri), end: (medios.end ?? []).map(aDataUri), reference: (medios.reference ?? []).map(aDataUri) };
}

/** El pedido a fal: { ruta, cuerpo } para ese modelo, o lanza si no lo conoce. */
export function pedidoFal(modelo, { prompt, ajustes, medios }) {
  const armar = MODELOS_FAL[modelo.id];
  if (!armar) throw new ErrorMotor(`El Estudio no sabe pedir «${modelo.nombre}» a fal.ai.`, 500);
  const p = armar({ prompt, ajustes: ajustes ?? {}, m: comoDataUri(medios) });
  if (!RUTA_VALIDA.test(p.ruta) || p.ruta.includes("..")) throw new ErrorMotor("Ruta de modelo no válida.", 500);
  return p;
}

/** El rechazo de fal.ai en palabras. */
export function errorDeFal(estado, texto) {
  let detalle = "";
  try {
    const j = JSON.parse(texto);
    detalle = typeof j.detail === "string" ? j.detail : Array.isArray(j.detail) ? j.detail.map((d) => d?.msg).filter(Boolean).join("; ") : j.error?.message || j.message || "";
  } catch { /* no es JSON */ }
  const d = detalle ? `: ${String(detalle).slice(0, 200)}` : "";
  if (estado === 401) return new ErrorMotor("fal.ai no aceptó la llave del servidor (FAL_KEY).", 502);
  if (estado === 402 || estado === 403) return new ErrorMotor(`fal.ai no dejó hacer el pedido: sin saldo o sin permiso${d}.`, 502);
  if (estado === 404) return new ErrorMotor(`fal.ai no tiene ese modelo${d}.`, 502);
  if (estado === 422) return new ErrorMotor(`fal.ai rechazó el pedido${d || " (datos no válidos)"}.`, 502);
  if (estado === 429) return new ErrorMotor("fal.ai está saturado. Inténtalo en unos segundos.", 429, { reintentable: true });
  return new ErrorMotor(`fal.ai devolvió un error (${estado})${d || "."}`, 502, { reintentable: estado >= 500 });
}

async function llamar(env, url, opciones = {}) {
  let res;
  try {
    res = await fetch(url, { ...opciones, headers: { Authorization: `Key ${env.FAL_KEY}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) }, signal: AbortSignal.timeout(PLAZO_MS) });
  } catch {
    throw new ErrorMotor("No se pudo contactar con fal.ai", 502, { reintentable: true });
  }
  const texto = await res.text().catch(() => "");
  if (!res.ok) throw errorDeFal(res.status, texto);
  try { return JSON.parse(texto); } catch { throw new ErrorMotor("fal.ai devolvió algo que no se entiende.", 502); }
}

/** ¿Una dirección de la cola de fal? La llave sólo viaja a ese origen. */
export function esDeLaCola(env, url) {
  try { return new URL(url).origin === new URL(COLA(env)).origin; } catch { return false; }
}

/** El archivo que entrega el modelo: un video no se confunde con una imagen de vista previa que traiga la respuesta. */
const primeraUrl = (j, tipo) => (tipo === "video"
  ? (j?.video?.url ?? j?.videos?.[0]?.url ?? null)
  : (j?.images?.[0]?.url ?? j?.image?.url ?? null));

export const MOTOR_FAL = {
  nombre: "fal.ai",
  llave: "FAL_KEY",
  activo: (env) => Boolean(env?.FAL_KEY),

  /** Imagen: contesta en el acto. */
  async generar(env, { modelo, prompt, ajustes, medios = {}, referencias = [] }) {
    const { ruta, cuerpo } = pedidoFal(modelo, { prompt, ajustes, medios: { ...medios, reference: medios.reference ?? referencias } });
    const j = await llamar(env, `${RUN(env)}/${ruta}`, { method: "POST", body: JSON.stringify(cuerpo) });
    const url = primeraUrl(j, modelo.tipo);
    if (!url) throw new ErrorMotor(`${modelo.nombre} no devolvió ninguna imagen.`, 502);
    const d = await abrirDescarga(url, { tope: TOPE_IMAGEN, tipos: IMAGENES, nombre: "fal.ai" });
    const bytes = new Uint8Array(await new Response(d.cuerpo).arrayBuffer());
    const [ancho, alto] = MEDIDAS[ajustes?.aspectRatio] ?? MEDIDAS["1:1"];
    return { bytes, mime: d.mime, costo: modelo.costo, ancho: j.images?.[0]?.width || ancho, alto: j.images?.[0]?.height || alto };
  },

  /** Video: se envía a la cola y se guardan las direcciones de seguimiento. */
  async enviar(env, { modelo, prompt, ajustes, medios }) {
    const { ruta, cuerpo } = pedidoFal(modelo, { prompt, ajustes, medios });
    const j = await llamar(env, `${COLA(env)}/${ruta}`, { method: "POST", body: JSON.stringify(cuerpo) });
    if (!j?.request_id) throw new ErrorMotor("fal.ai no devolvió el número del pedido.", 502);
    // fal usa sólo `dueño/aplicación` en las direcciones de la cola.
    const base = `${COLA(env)}/${ruta.split("/").slice(0, 2).join("/")}/requests/${encodeURIComponent(j.request_id)}`;
    const estado = esDeLaCola(env, j.status_url) ? j.status_url : `${base}/status`;
    const resultado = esDeLaCola(env, j.response_url) ? j.response_url : base;
    return { id: j.request_id, cada: 5000, datos: { estado, resultado } };
  },

  async sondear(env, { modelo, item }) {
    const estado = item?.datos?.estado;
    if (!esDeLaCola(env, estado)) return { estado: "fallido", error: `${modelo.nombre}: falta la dirección para seguir el pedido. Vuelve a intentarlo.` };
    let st;
    try {
      st = await llamar(env, estado);
    } catch (e) {
      // Un 4xx al mirar no se reintenta: el pedido no existe o la llave dejó de valer.
      if (e instanceof ErrorMotor && !e.reintentable) return { estado: "fallido", error: e.message };
      throw e;
    }
    if (st.status === "IN_QUEUE") return { estado: "pendiente", nota: `En cola en fal.ai${st.queue_position != null ? ` (${st.queue_position} delante)` : ""}`, cada: 5000 };
    if (st.status === "IN_PROGRESS") return { estado: "pendiente", nota: "Generando en fal.ai…", cada: 5000 };
    if (st.status !== "COMPLETED") return { estado: "fallido", error: `${modelo.nombre}: fal.ai lo dio por fallido${st.error ? ` (${String(st.error).slice(0, 160)})` : ""}.` };
    if (st.error) return { estado: "fallido", error: `${modelo.nombre}: ${String(st.error).slice(0, 200)}` };

    const resultado = item?.datos?.resultado;
    if (!esDeLaCola(env, resultado)) return { estado: "fallido", error: `${modelo.nombre}: falta la dirección del resultado.` };
    let out;
    try {
      out = await llamar(env, resultado);
    } catch (e) {
      if (e instanceof ErrorMotor && !e.reintentable) return { estado: "fallido", error: e.message };
      throw e;
    }
    const url = primeraUrl(out, modelo.tipo);
    if (!url) return { estado: "fallido", error: `${modelo.nombre} no devolvió ningún archivo.` };
    return { estado: "listo", url };
  },
};
