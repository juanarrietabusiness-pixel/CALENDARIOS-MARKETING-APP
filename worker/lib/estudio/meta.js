// ============================================================
// Meta (Muse Image) como motor del Estudio
//
//   POST <base>/responses   { model, input, tools: [{ type: "image_generation", size, output_format }], store: false }
//   Respuesta               { output: [ reasoning, message, { type: "image_generation_call", result: <base64> } ] }
//
// Es lo que hace el recetario OFICIAL de Meta (github.com/meta-models/
// meta-model-cookbook, 05_muse_image): la API de Responses, no la de
// imágenes. La primera versión hablaba con /images/generations y
// /images/edits con medidas propias («1024x1280» para 4:5) y
// `reasoning_strength`, sacado de páginas de terceros: Meta contestó 400
// a todo. Lo que dice el recetario:
//   · Las referencias van como partes `input_image` (data URI) DENTRO de un
//     mensaje `{ role: "user", content: [...] }`: una lista suelta es un 400.
//   · `size` del tool sólo admite 1024x1024, 1024x1536 y 1536x1024, y fija
//     la proporción, no los píxeles. Una proporción que no está se pide con
//     la más cercana de su orientación; quien necesita la exacta (adaptar a
//     4:5 o 9:16) recorta en el navegador.
//   · `store: false`: cada trabajo es un turno suelto, sin estado en Meta.
//
// Auth: `Authorization: Bearer <META_API_KEY>` (o `MODEL_API_KEY`). La base
// se puede cambiar con `META_BASE` para un doble en las pruebas.
// ============================================================

import { ErrorMotor, aBase64, deBase64 } from "./gemini.js";
import { tipoPorBytes } from "./archivos.js";
import { MEDIDAS } from "../../../src/lib/estudioCatalogo.js";
import { llaveMeta } from "../configIA.js";

const BASE = (env) => (env?.META_BASE || "https://api.meta.ai/v1").replace(/\/$/, "");
const PLAZO_MS = 180_000;

/** Los tres tamaños que admite el tool `image_generation` de Muse Image. */
export const TAMANOS_MUSE = Object.freeze({ cuadrado: "1024x1024", vertical: "1024x1536", horizontal: "1536x1024" });

/** El tamaño de Muse para una proporción: el de su orientación. Pura. */
export function tamanoMuse(aspectRatio) {
  const [w, h] = MEDIDAS[aspectRatio] ?? MEDIDAS["1:1"];
  if (w === h) return TAMANOS_MUSE.cuadrado;
  return h > w ? TAMANOS_MUSE.vertical : TAMANOS_MUSE.horizontal;
}

const aDataUri = (f) => `data:${f.mime};base64,${f.base64 ?? aBase64(f.bytes)}`;

/** El cuerpo de la petición a Muse Image. Pura. */
export function peticionMuse(modelo, { prompt, ajustes = {}, referencias = [] }) {
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

/** El motivo que da Meta, venga como venga; si no es JSON, el principio del texto. */
function motivoDe(texto) {
  try {
    const d = JSON.parse(texto);
    const m = d?.error?.message ?? d?.message ?? d?.detail ?? (typeof d?.error === "string" ? d.error : "");
    return m ? String(typeof m === "string" ? m : JSON.stringify(m)).slice(0, 300) : "";
  } catch { /* no es JSON */ }
  return String(texto || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

/** El rechazo de Meta en palabras. */
function errorDeMeta(estado, texto) {
  const detalle = motivoDe(texto);
  const cola = detalle ? `: ${detalle}` : ".";
  if (estado === 429) return new ErrorMotor("Meta está saturado. Inténtalo en unos segundos.", 429, { reintentable: true });
  if (estado === 401 || estado === 403) return new ErrorMotor(`Meta no dejó usar Muse Image con la llave del servidor${cola}`, 502);
  if (estado === 400 || estado === 422) return new ErrorMotor(`Meta rechazó el pedido${cola}`, 422);
  return new ErrorMotor(`Meta devolvió un error (${estado})${cola}`, 502, { reintentable: estado >= 500 });
}

/** El base64 de la imagen en una respuesta de Responses (o, por si acaso, de la API de imágenes). */
function imagenDe(datos) {
  for (const item of datos?.output ?? []) {
    if (item?.type === "image_generation_call" && typeof item.result === "string" && item.result) return item.result;
  }
  const pieza = (datos?.data ?? [])[0];
  return typeof pieza?.b64_json === "string" ? pieza.b64_json : null;
}

/**
 * Pide UNA imagen a Muse Image. También lo usa /api/generar-imagen para
 * adaptar a 4:5 con la original de referencia. Devuelve `{ bytes, mime }`.
 */
export async function llamarMuseImage(env, { gid = "muse-image-1.0", prompt, ajustes = {}, referencias = [], maxReferencias = 10 }) {
  const llave = llaveMeta(env);
  if (!llave) throw new ErrorMotor("El servidor no tiene la llave de Meta (META_API_KEY).", 503);
  const { ruta, cuerpo } = peticionMuse({ gid, referencias: maxReferencias }, { prompt, ajustes, referencias });
  const abortar = new AbortController();
  const reloj = setTimeout(() => abortar.abort(), PLAZO_MS);
  let res;
  try {
    res = await fetch(`${BASE(env)}${ruta}`, {
      method: "POST",
      signal: abortar.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llave}` },
      body: JSON.stringify(cuerpo),
    });
  } catch (e) {
    if (abortar.signal.aborted) throw new ErrorMotor("Muse Image tardó demasiado. Inténtalo de nuevo.", 504, { reintentable: true });
    throw new ErrorMotor(`No se pudo contactar con Meta${e?.message ? ` (${String(e.message).slice(0, 120)})` : ""}.`, 502, { reintentable: true });
  } finally {
    clearTimeout(reloj);
  }
  const texto = await res.text().catch(() => "");
  if (!res.ok) throw errorDeMeta(res.status, texto);
  let datos = null;
  try { datos = JSON.parse(texto); } catch { /* respuesta rara */ }
  if (datos?.status === "failed" || datos?.error) {
    throw new ErrorMotor(`Muse Image no pudo crear la imagen${datos?.error ? `: ${motivoDe(JSON.stringify(datos))}` : "."}`, 422);
  }
  const b64 = imagenDe(datos);
  if (!b64) throw new ErrorMotor("Muse Image no devolvió ninguna imagen (puede que lo haya rechazado por su contenido).", 502);
  const bytes = deBase64(b64);
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
