// ============================================================
// Meta (Muse Image) como motor del Estudio
//
//   Sin referencias   POST <base>/images/generations   { model, prompt, n, size, output_format, response_format }
//   Con referencias   POST <base>/images/edits         lo mismo + images: [{ image_url }] (data URI)
//   Respuesta         { data: [{ b64_json } | { url }], output_format, usage }
//
// Compatible con la API de imágenes de OpenAI; las referencias van en el
// cuerpo JSON propio de Meta (`images`), que evita el multipart. Muse Image
// busca por su cuenta referencias reales (marcas, lugares, datos actuales)
// antes de dibujar: viene incluido en el precio y encendido por defecto.
//
// Auth: `Authorization: Bearer <META_API_KEY>` (o `MODEL_API_KEY`, que es
// como la llama la documentación de Meta). La base se puede cambiar con
// `META_BASE` para un doble en las pruebas.
//
// NO SE HA PROBADO CONTRA EL SERVICIO REAL: no hay llave. Los tests usan un
// `fetch` de mentira que habla como dice su documentación.
// ============================================================

import { ErrorMotor, aBase64, deBase64 } from "./gemini.js";
import { abrirDescarga, TOPE_IMAGEN } from "./descarga.js";
import { MEDIDAS } from "../../../src/lib/estudioCatalogo.js";
import { llaveMeta } from "../configIA.js";

const BASE = (env) => (env?.META_BASE || "https://api.meta.ai/v1").replace(/\/$/, "");
const PLAZO_MS = 180_000;

const aDataUri = (f) => `data:${f.mime};base64,${f.base64 ?? aBase64(f.bytes)}`;

/** El cuerpo de la petición a Muse Image. Pura. */
export function peticionMuse(modelo, { prompt, ajustes = {}, referencias = [] }) {
  const [w, h] = MEDIDAS[ajustes.aspectRatio] ?? MEDIDAS["1:1"];
  const cuerpo = {
    model: modelo.gid,
    prompt,
    n: 1,
    // Meta espera «AnchoxAlto»: fija la proporción, no el tamaño exacto.
    size: `${w}x${h}`,
    output_format: ajustes.formato || "webp",
    response_format: "b64_json",
    ...(ajustes.calidad ? { reasoning_strength: ajustes.calidad } : {}),
  };
  const refs = referencias.slice(0, modelo.referencias ?? 0);
  if (!refs.length) return { ruta: "/images/generations", cuerpo };
  return { ruta: "/images/edits", cuerpo: { ...cuerpo, images: refs.map((r) => ({ image_url: aDataUri(r) })) } };
}

/** El rechazo de Meta en palabras. */
function errorDeMeta(estado, texto) {
  let detalle = "";
  try { detalle = JSON.parse(texto)?.error?.message || ""; } catch { /* no es JSON */ }
  if (estado === 429) return new ErrorMotor("Meta está saturado. Inténtalo en unos segundos.", 429, { reintentable: true });
  if (estado === 401 || estado === 403) return new ErrorMotor(`Meta no dejó usar Muse Image con la llave del servidor${detalle ? `: ${detalle.slice(0, 200)}` : ""}.`, 502);
  if (estado === 400) return new ErrorMotor(`Meta rechazó el pedido${detalle ? `: ${detalle.slice(0, 200)}` : ""}.`, 422);
  return new ErrorMotor(`Meta devolvió un error (${estado})${detalle ? `: ${detalle.slice(0, 200)}` : "."}`, 502, { reintentable: estado >= 500 });
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
  } catch {
    if (abortar.signal.aborted) throw new ErrorMotor("Muse Image tardó demasiado. Inténtalo de nuevo.", 504, { reintentable: true });
    throw new ErrorMotor("No se pudo contactar con Meta.", 502, { reintentable: true });
  } finally {
    clearTimeout(reloj);
  }
  const texto = await res.text().catch(() => "");
  if (!res.ok) throw errorDeMeta(res.status, texto);
  let datos = null;
  try { datos = JSON.parse(texto); } catch { /* respuesta rara */ }
  const pieza = (datos?.data ?? [])[0];
  if (pieza?.b64_json) return { bytes: deBase64(pieza.b64_json), mime: `image/${datos.output_format === "jpeg" ? "jpeg" : datos.output_format || cuerpo.output_format}` };
  if (pieza?.url && /^https:\/\//.test(pieza.url)) {
    // El archivo se baja SIN la llave: la dirección no es de la API.
    const r = await abrirDescarga(pieza.url, { tope: TOPE_IMAGEN, tipos: ["image/png", "image/jpeg", "image/webp"], nombre: "Meta" });
    return { bytes: new Uint8Array(await new Response(r.cuerpo).arrayBuffer()), mime: r.mime };
  }
  throw new ErrorMotor("Muse Image no devolvió ninguna imagen.", 502);
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
