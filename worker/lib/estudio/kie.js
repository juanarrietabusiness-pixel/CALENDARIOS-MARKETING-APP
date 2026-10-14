// ============================================================
// Kie.ai como motor del Estudio
//
//   Crear     POST https://api.kie.ai/api/v1/jobs/createTask      { model, input }   → { code: 200, data: { taskId } }
//   Mirar     GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=…              → { code: 200, data: { state, resultJson, failMsg } }
//             `state`: waiting | queuing | generating | success | fail; `resultJson` es un TEXTO JSON con `resultUrls`.
//   Subir     POST https://kieai.redpandaai.co/api/file-stream-upload  (multipart: file, uploadPath)
//                                                                  → { success, code: 200, data: { downloadUrl } }
//
// Auth: `Authorization: Bearer <KIE_API_KEY>` en las tres. Kie contesta casi siempre 200 y pone el error en `code`
// (401 llave, 402 sin créditos, 422 datos, 429 saturado, 455 mantenimiento, 5xx): se mira `code`, no sólo el HTTP.
//
// Todo va por la COLA (`enviar` + `sondear`), también las imágenes: Kie no contesta en el acto. Las imágenes de
// apoyo se suben a SU almacén (caducan solas a los pocos días) y van por dirección: Kie no acepta data URI.
//
// LA FORMA SALE DE UN CLIENTE PÚBLICO DE SU API, NO DE PROBARLA: desde el entorno donde se escribió no se llegaba a
// kie.ai. Se lee con tolerancia (`datosDe`, `urlsDelResultado`) y todo rechazo enseña lo que dijo Kie. Lo primero
// con la llave: una imagen de GPT Image 2 sin referencias, y otra con una.
//
// Aquí sólo vive lo que Kie sabe: modelos y cuerpos. El catálogo (src/lib/estudioCatalogo.js) dice qué hay; un test
// falla si un modelo de Kie del catálogo no tiene su pedido aquí, o al revés.
// ============================================================

import { ErrorMotor } from "./gemini.js";

const BASE = (env) => (env.KIE_URL || "https://api.kie.ai").replace(/\/$/, "");
const SUBIDAS = (env) => (env.KIE_UPLOAD_URL || "https://kieai.redpandaai.co").replace(/\/$/, "");
const PLAZO_MS = 60_000;

/** GPT Image 2 sólo conoce estas proporciones; el 4:5 del feed sale 3:4 (lo más cercano) y se adapta al programar. */
const PROPORCIONES_GPT = ["1:1", "9:16", "16:9", "4:3", "3:4"];

/**
 * Lo que Kie sabe de cada modelo del catálogo: con qué `model` y qué `input` se pide. `refs`: las direcciones de las
 * imágenes de apoyo ya subidas a Kie.
 */
export const MODELOS_KIE = Object.freeze({
  "gpt-image-2-kie": ({ prompt, ajustes, refs }) => {
    const aspect = PROPORCIONES_GPT.includes(ajustes.aspectRatio) ? ajustes.aspectRatio : "3:4";
    // En 1:1 no hay 4K: se queda en 2K.
    const resolution = aspect === "1:1" && ajustes.imageSize === "4K" ? "2K" : (ajustes.imageSize || "2K");
    return refs.length
      ? { model: "gpt-image-2-image-to-image", input: { prompt, input_urls: refs.slice(0, 16), aspect_ratio: aspect, resolution } }
      : { model: "gpt-image-2-text-to-image", input: { prompt, aspect_ratio: aspect, resolution } };
  },
  "nano-banana-pro-kie": ({ prompt, ajustes, refs }) => ({
    model: "nano-banana-pro",
    input: { prompt, image_input: refs.slice(0, 8), aspect_ratio: ajustes.aspectRatio || "auto", resolution: ajustes.imageSize || "2K", output_format: "png" },
  }),
  "nano-banana-2-kie": ({ prompt, ajustes, refs }) => ({
    model: "nano-banana-2",
    input: { prompt, image_input: refs.slice(0, 14), aspect_ratio: ajustes.aspectRatio || "auto", resolution: ajustes.imageSize || "1K", output_format: "png" },
  }),
});

/** El pedido a Kie: { model, input } para ese modelo, o lanza si no lo conoce. Pura. */
export function pedidoKie(modelo, { prompt, ajustes = {}, refs = [] }) {
  const armar = MODELOS_KIE[modelo.id];
  if (!armar) throw new ErrorMotor(`El Estudio no sabe pedir «${modelo.nombre}» a Kie.ai.`, 500);
  return armar({ prompt, ajustes, refs });
}

/** El rechazo de Kie en palabras, por su `code` (o por el estado HTTP si no lo trae). Pura. */
export function errorDeKie(codigo, mensaje = "") {
  const d = mensaje ? `: ${String(mensaje).slice(0, 200)}` : "";
  if (codigo === 401) return new ErrorMotor("Kie.ai no aceptó la llave del servidor (KIE_API_KEY).", 502);
  if (codigo === 402) return new ErrorMotor(`Kie.ai no tiene créditos suficientes en la cuenta${d}. Recárgala en kie.ai.`, 502);
  if (codigo === 404) return new ErrorMotor(`Kie.ai no encontró eso${d}.`, 502);
  if (codigo === 422) return new ErrorMotor(`Kie.ai rechazó el pedido${d || " (datos no válidos)"}.`, 502);
  if (codigo === 429) return new ErrorMotor("Kie.ai está saturado. Inténtalo en unos segundos.", 429, { reintentable: true });
  if (codigo === 455) return new ErrorMotor("Kie.ai está en mantenimiento. Inténtalo más tarde.", 503, { reintentable: true });
  return new ErrorMotor(`Kie.ai devolvió un error (${codigo})${d || "."}`, 502, { reintentable: codigo >= 500 });
}

/** El sobre de Kie: `data` si `code` es 200 (o no viene y el HTTP fue bien); si no, lanza con su motivo. */
export function datosDe(j, estadoHttp = 200) {
  const codigo = Number(j?.code ?? estadoHttp);
  if (codigo !== 200 || estadoHttp >= 400) throw errorDeKie(codigo !== 200 ? codigo : estadoHttp, j?.msg ?? j?.message ?? "");
  return j?.data ?? {};
}

async function llamar(env, url, opciones = {}) {
  let res;
  try {
    res = await fetch(url, { ...opciones, headers: { Authorization: `Bearer ${env.KIE_API_KEY}`, ...(opciones.headers ?? {}) }, signal: AbortSignal.timeout(PLAZO_MS) });
  } catch {
    throw new ErrorMotor("No se pudo contactar con Kie.ai", 502, { reintentable: true });
  }
  const texto = await res.text().catch(() => "");
  let j = null;
  try { j = JSON.parse(texto); } catch { /* no es JSON */ }
  if (!j) throw errorDeKie(res.ok ? 502 : res.status, texto.slice(0, 160));
  return datosDe(j, res.status);
}

/** Sube una imagen de apoyo al almacén de Kie y devuelve su dirección. */
async function subir(env, f, i) {
  const form = new FormData();
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[f.mime] ?? "png";
  const nombre = `estudio-${Date.now().toString(36)}-${i}.${ext}`;
  form.set("file", new Blob([f.bytes], { type: f.mime }), nombre);
  form.set("uploadPath", "images/estudio");
  form.set("fileName", nombre);
  const d = await llamar(env, `${SUBIDAS(env)}/api/file-stream-upload`, { method: "POST", body: form });
  const url = d?.downloadUrl ?? d?.fileUrl ?? d?.url;
  if (!/^https:\/\//.test(String(url ?? ""))) throw new ErrorMotor("Kie.ai no devolvió la dirección de la imagen de referencia subida.", 502, { reintentable: true });
  return url;
}

/** Las direcciones del resultado: `resultJson` es un texto JSON con `resultUrls` (o ya un objeto). Pura. */
export function urlsDelResultado(data = {}) {
  let r = data?.resultJson ?? data?.result ?? null;
  if (typeof r === "string") {
    try { r = JSON.parse(r); } catch { r = null; }
  }
  const lista = r?.resultUrls ?? r?.result_urls ?? data?.resultUrls ?? [];
  return (Array.isArray(lista) ? lista : [lista]).map(String).filter((u) => /^https:\/\//.test(u));
}

const NOTAS = { waiting: "En espera en Kie.ai", queuing: "En cola en Kie.ai", generating: "Generando en Kie.ai…" };

export const MOTOR_KIE = {
  nombre: "Kie.ai",
  llave: "KIE_API_KEY",
  activo: (env) => Boolean(env?.KIE_API_KEY),

  async enviar(env, { modelo, prompt, ajustes, medios = {} }) {
    const refs = [];
    for (const [i, f] of [...(medios.reference ?? []), ...(medios.start ?? [])].entries()) refs.push(await subir(env, f, i));
    const cuerpo = pedidoKie(modelo, { prompt, ajustes, refs });
    const d = await llamar(env, `${BASE(env)}/api/v1/jobs/createTask`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
    });
    const id = d?.taskId ?? d?.task_id;
    if (!id) throw new ErrorMotor("Kie.ai no devolvió el número de la tarea.", 502);
    return { id: String(id), cada: 4000 };
  },

  async sondear(env, { modelo, item }) {
    let d;
    try {
      d = await llamar(env, `${BASE(env)}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(item?.id ?? "")}`);
    } catch (e) {
      // Un 4xx al mirar no se reintenta: la tarea no existe o la llave dejó de valer.
      if (e instanceof ErrorMotor && !e.reintentable) return { estado: "fallido", error: e.message };
      throw e;
    }
    const estado = String(d?.state ?? "").toLowerCase();
    if (estado === "fail" || estado === "failed") {
      return { estado: "fallido", error: `${modelo.nombre}: Kie.ai no pudo hacerlo${d?.failMsg ? ` (${String(d.failMsg).slice(0, 180)})` : ""}.` };
    }
    if (estado !== "success") return { estado: "pendiente", nota: NOTAS[estado] ?? "Kie.ai lo está preparando…", cada: 4000 };
    const [url] = urlsDelResultado(d);
    if (!url) return { estado: "fallido", error: `${modelo.nombre}: Kie.ai terminó sin ninguna imagen.` };
    return { estado: "listo", url };
  },
};
