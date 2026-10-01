// ============================================================
// Meta (Muse Image) como motor del Estudio
//
// Dos vías, en este orden:
//
//   1. API de imágenes (la de siempre, con el tamaño EXACTO de cada proporción):
//      sin referencias  POST <base>/images/generations  { model, prompt, n, size, output_format, reasoning_strength }
//      con referencias  POST <base>/images/edits        lo mismo + images: [{ image_url }] (data URI)
//      respuesta        { data: [{ b64_json } | { url }] }
//   2. Si Meta RECHAZA esa (400/404/415/422): la API de Responses, como el
//      recetario oficial (github.com/meta-models/meta-model-cookbook, 05_muse_image):
//      POST <base>/responses  { model, input, tools: [{ type: "image_generation", size, output_format }], store: false }
//      con las referencias como `input_image` DENTRO de un mensaje de usuario; la
//      imagen es el `result` del `image_generation_call`. Su `size` sólo admite
//      1024x1024, 1024x1536 y 1536x1024: se pide el de la orientación.
//
// La primera versión mandaba además `response_format: "b64_json"`, que las
// API de imágenes compatibles con OpenAI rechazan para los modelos nuevos; y
// el error sólo leía `error.message`, así que Meta contestaba 400 y la
// pantalla decía «Meta rechazó el pedido.» sin motivo. Ahora el error lleva
// el código y el cuerpo de las DOS vías.
//
// Auth: `Authorization: Bearer <META_API_KEY>` (o `MODEL_API_KEY`). La base
// se puede cambiar con `META_BASE` para un doble en las pruebas.
// ============================================================

import { ErrorMotor, aBase64, deBase64 } from "./gemini.js";
import { tipoPorBytes } from "./archivos.js";
import { abrirDescarga, TOPE_IMAGEN } from "./descarga.js";
import { MEDIDAS } from "../../../src/lib/estudioCatalogo.js";
import { llaveMeta } from "../configIA.js";

const BASE = (env) => (env?.META_BASE || "https://api.meta.ai/v1").replace(/\/$/, "");
const PLAZO_MS = 180_000;
/** Los rechazos que hacen probar la otra vía: el pedido no le gustó, no es que Meta esté caído. */
const PROBAR_LA_OTRA = new Set([400, 404, 405, 415, 422]);

/** Los tres tamaños que admite el tool `image_generation` de la API de Responses. */
export const TAMANOS_MUSE = Object.freeze({ cuadrado: "1024x1024", vertical: "1024x1536", horizontal: "1536x1024" });

/** El tamaño de la API de Responses para una proporción: el de su orientación. Pura. */
export function tamanoMuse(aspectRatio) {
  const [w, h] = MEDIDAS[aspectRatio] ?? MEDIDAS["1:1"];
  if (w === h) return TAMANOS_MUSE.cuadrado;
  return h > w ? TAMANOS_MUSE.vertical : TAMANOS_MUSE.horizontal;
}

const aDataUri = (f) => `data:${f.mime};base64,${f.base64 ?? aBase64(f.bytes)}`;

/** El cuerpo para la API de imágenes, con el tamaño exacto de la proporción. Pura. */
export function peticionMuse(modelo, { prompt, ajustes = {}, referencias = [] }) {
  const [w, h] = MEDIDAS[ajustes.aspectRatio] ?? MEDIDAS["1:1"];
  const cuerpo = {
    model: modelo.gid,
    prompt,
    n: 1,
    size: `${w}x${h}`,
    output_format: ajustes.formato || "webp",
    ...(ajustes.calidad ? { reasoning_strength: ajustes.calidad } : {}),
  };
  const refs = referencias.slice(0, modelo.referencias ?? 0);
  if (!refs.length) return { ruta: "/images/generations", cuerpo };
  return { ruta: "/images/edits", cuerpo: { ...cuerpo, images: refs.map((r) => ({ image_url: aDataUri(r) })) } };
}

/** El cuerpo para la API de Responses (la segunda vía). Pura. */
export function peticionMuseResponses(modelo, { prompt, ajustes = {}, referencias = [] }) {
  const refs = referencias.slice(0, modelo.referencias ?? 0);
  const input = refs.length
    ? [{ role: "user", content: [{ type: "input_text", text: prompt }, ...refs.map((r) => ({ type: "input_image", image_url: aDataUri(r) }))] }]
    : prompt;
  return {
    ruta: "/responses",
    cuerpo: {
      model: modelo.gid,
      input,
      tools: [{ type: "image_generation", size: tamanoMuse(ajustes.aspectRatio), output_format: ajustes.formato || "webp" }],
      store: false,
    },
  };
}

/** Lo que contestó Meta, legible: su mensaje si lo trae y, si no, el cuerpo tal cual (recortado). */
export function motivoDe(texto) {
  const bruto = String(texto ?? "").replace(/\s+/g, " ").trim();
  try {
    const d = JSON.parse(texto);
    const m = d?.error?.message ?? d?.message ?? d?.detail ?? (typeof d?.error === "string" ? d.error : "");
    if (m) return String(typeof m === "string" ? m : JSON.stringify(m)).slice(0, 300);
  } catch { /* no es JSON */ }
  return bruto && bruto !== "{}" ? bruto.slice(0, 300) : "sin detalle";
}

/** El base64 de la imagen, venga de una vía o de la otra. */
function imagenDe(datos) {
  for (const item of datos?.output ?? []) {
    if (item?.type === "image_generation_call" && typeof item.result === "string" && item.result) return { b64: item.result };
  }
  const pieza = (datos?.data ?? [])[0];
  if (typeof pieza?.b64_json === "string" && pieza.b64_json) return { b64: pieza.b64_json };
  if (typeof pieza?.url === "string" && /^https:\/\//.test(pieza.url)) return { url: pieza.url };
  return null;
}

/** UNA petición a Meta. `{ ok, estado, texto }`; lanza sólo si no hubo respuesta. */
async function llamar(env, llave, { ruta, cuerpo }) {
  const abortar = new AbortController();
  const reloj = setTimeout(() => abortar.abort(), PLAZO_MS);
  try {
    const res = await fetch(`${BASE(env)}${ruta}`, {
      method: "POST",
      signal: abortar.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llave}` },
      body: JSON.stringify(cuerpo),
    });
    const texto = await res.text().catch(() => "");
    if (!res.ok) console.warn(`meta imagen: ${ruta} respondió ${res.status}`, texto.slice(0, 500));
    return { ok: res.ok, estado: res.status, texto, ruta };
  } catch (e) {
    if (abortar.signal.aborted) throw new ErrorMotor("Muse Image tardó demasiado. Inténtalo de nuevo.", 504, { reintentable: true });
    throw new ErrorMotor(`No se pudo contactar con Meta${e?.message ? ` (${String(e.message).slice(0, 120)})` : ""}.`, 502, { reintentable: true });
  } finally {
    clearTimeout(reloj);
  }
}

/** El rechazo de Meta en palabras, con el código y lo que dijo en cada vía probada. */
function errorDeMeta(intentos) {
  const ultimo = intentos[intentos.length - 1];
  const detalle = intentos.map((i) => `${i.ruta} → ${i.estado}: ${motivoDe(i.texto)}`).join(" · ");
  if (ultimo.estado === 429) return new ErrorMotor("Meta está saturado. Inténtalo en unos segundos.", 429, { reintentable: true });
  if (ultimo.estado === 401 || ultimo.estado === 403) return new ErrorMotor(`Meta no aceptó la llave del servidor (META_API_KEY). ${detalle}`, 502);
  if (PROBAR_LA_OTRA.has(ultimo.estado)) return new ErrorMotor(`Meta rechazó el pedido. ${detalle}`, 422);
  return new ErrorMotor(`Meta devolvió un error. ${detalle}`, 502, { reintentable: ultimo.estado >= 500 });
}

/**
 * Pide UNA imagen a Muse Image. También lo usa /api/generar-imagen para
 * adaptar a 4:5 con la original de referencia. Devuelve `{ bytes, mime }`.
 */
export async function llamarMuseImage(env, { gid = "muse-image-1.0", prompt, ajustes = {}, referencias = [], maxReferencias = 10 }) {
  const llave = llaveMeta(env);
  if (!llave) throw new ErrorMotor("El servidor no tiene la llave de Meta (META_API_KEY).", 503);
  const modelo = { gid, referencias: maxReferencias };
  const intentos = [await llamar(env, llave, peticionMuse(modelo, { prompt, ajustes, referencias }))];
  if (!intentos[0].ok && PROBAR_LA_OTRA.has(intentos[0].estado)) {
    intentos.push(await llamar(env, llave, peticionMuseResponses(modelo, { prompt, ajustes, referencias })));
  }
  const bueno = intentos.find((i) => i.ok);
  if (!bueno) throw errorDeMeta(intentos);

  let datos = null;
  try { datos = JSON.parse(bueno.texto); } catch { /* respuesta rara */ }
  if (datos?.status === "failed") throw new ErrorMotor(`Muse Image no pudo crear la imagen: ${motivoDe(bueno.texto)}`, 422);
  const pieza = imagenDe(datos);
  if (!pieza) throw new ErrorMotor(`Muse Image no devolvió ninguna imagen (${bueno.ruta}): ${motivoDe(bueno.texto)}`, 502);
  let bytes;
  if (pieza.b64) {
    bytes = deBase64(pieza.b64);
  } else {
    // El archivo se baja SIN la llave: la dirección no es de la API.
    const r = await abrirDescarga(pieza.url, { tope: TOPE_IMAGEN, tipos: ["image/png", "image/jpeg", "image/webp"], nombre: "Meta" });
    bytes = new Uint8Array(await new Response(r.cuerpo).arrayBuffer());
  }
  // El tipo, por los bytes: lo que se pidió no siempre es lo que llega.
  const mime = tipoPorBytes(bytes);
  if (!mime?.startsWith("image/")) throw new ErrorMotor("Muse Image devolvió algo que no es una imagen.", 502);
  return { bytes, mime };
}

export const MOTOR_META = Object.freeze({
  nombre: "Meta (Muse Image)",
  llave: "META_API_KEY",
  activo: (env) => Boolean(llaveMeta(env)),
  async generar(env, { modelo, prompt, ajustes, referencias = [] }) {
    const { bytes, mime } = await llamarMuseImage(env, { gid: modelo.gid, prompt, ajustes, referencias, maxReferencias: modelo.referencias ?? 0 });
    return { bytes, mime, costo: modelo.costo };
  },
});
