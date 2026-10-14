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
// Todo va por la COLA (`enviar` + `sondear`), imágenes y videos: Kie no contesta en el acto. Las imágenes y el video
// de apoyo se suben a SU almacén (caducan solas a los pocos días) y van por dirección: Kie no acepta data URI.
// Veo 3.1 también va por `createTask` (con `model: "veo-3-1"` y el nivel en `input.model`).
//
// LA FORMA SALE DE SU DOCUMENTACIÓN (docs/kie/, el extracto que entregó la agencia), NO DE PROBARLA. Se lee con
// tolerancia (`datosDe`, `urlsDelResultado`) y todo rechazo enseña lo que dijo Kie.
//
// Aquí sólo vive lo que Kie sabe: modelos y cuerpos. El catálogo (src/lib/estudioCatalogo.js) dice qué hay; un test
// falla si un modelo de Kie del catálogo no tiene su pedido aquí, o al revés.
// ============================================================

import { ErrorMotor } from "./gemini.js";

const BASE = (env) => (env.KIE_URL || "https://api.kie.ai").replace(/\/$/, "");
const SUBIDAS = (env) => (env.KIE_UPLOAD_URL || "https://kieai.redpandaai.co").replace(/\/$/, "");
const PLAZO_MS = 60_000;

/** GPT Image 2 y 2.5 no tienen 4:5: el del feed sale 3:4 (lo más cercano) y se adapta al programar. */
const PROPORCIONES_GPT = ["1:1", "9:16", "16:9", "4:3", "3:4"];
const conProporcion = (aspect, validas, otra) => (validas.includes(aspect) ? aspect : otra);
const si = (valor) => valor !== "no";
const entero = (valor, defecto) => Number.parseInt(valor, 10) || defecto;

/** Ideogram no recibe proporciones sino tamaños con nombre. */
const TAMANO_IDEOGRAM = { "1:1": "square_hd", "3:4": "portrait_4_3", "9:16": "portrait_16_9", "4:3": "landscape_4_3", "16:9": "landscape_16_9" };

/**
 * Lo que Kie sabe de cada modelo del catálogo: con qué `model` y qué `input` se pide. Las direcciones ya subidas a
 * Kie: `refs` (referencias), `inicio` y `fin` (imagen inicial y final), `videos` (video de referencia).
 */
export const MODELOS_KIE = Object.freeze({
  // ---- Imagen
  "gpt-image-2-kie": ({ prompt, ajustes, refs }) => {
    const aspect = conProporcion(ajustes.aspectRatio, PROPORCIONES_GPT, "3:4");
    // En 1:1 no hay 4K: se queda en 2K.
    const resolution = aspect === "1:1" && ajustes.imageSize === "4K" ? "2K" : (ajustes.imageSize || "2K");
    return refs.length
      ? { model: "gpt-image-2-image-to-image", input: { prompt, input_urls: refs.slice(0, 16), aspect_ratio: aspect, resolution } }
      : { model: "gpt-image-2-text-to-image", input: { prompt, aspect_ratio: aspect, resolution } };
  },
  "gpt-image-2-5-kie": ({ prompt, ajustes, refs }) => {
    const input = { prompt, aspect_ratio: conProporcion(ajustes.aspectRatio, PROPORCIONES_GPT, "3:4"), resolution: ajustes.imageSize || "2K" };
    return refs.length
      ? { model: "gpt-image-2-5-sunburst-image-to-image", input: { ...input, input_urls: refs.slice(0, 16) } }
      : { model: "gpt-image-2-5-sunburst-text-to-image", input };
  },
  "nano-banana-pro-kie": ({ prompt, ajustes, refs }) => ({
    model: "nano-banana-pro",
    input: { prompt, image_input: refs.slice(0, 8), aspect_ratio: ajustes.aspectRatio || "auto", resolution: ajustes.imageSize || "2K", output_format: "png" },
  }),
  "nano-banana-2-kie": ({ prompt, ajustes, refs }) => ({
    model: "nano-banana-2",
    input: { prompt, image_input: refs.slice(0, 14), aspect_ratio: ajustes.aspectRatio || "auto", resolution: ajustes.imageSize || "1K", output_format: "png" },
  }),
  "nano-banana-2-1-kie": ({ prompt, ajustes, refs }) => ({
    model: "nano-banana-2-1",
    input: { prompt, image_input: refs.slice(0, 10), aspect_ratio: ajustes.aspectRatio || "auto", resolution: ajustes.imageSize || "2K", output_format: "png" },
  }),
  "ideogram-3-kie": ({ prompt, ajustes }) => ({
    model: "ideogram/v3-text-to-image",
    input: {
      prompt, image_size: TAMANO_IDEOGRAM[ajustes.aspectRatio] ?? "portrait_4_3",
      rendering_speed: ajustes.calidad === "low" ? "BALANCED" : "QUALITY", style: "AUTO", expand_prompt: false,
    },
  }),
  "seedream-5-pro-kie": ({ prompt, ajustes, refs }) => {
    const input = { prompt, aspect_ratio: ajustes.aspectRatio || "3:4", quality: ajustes.calidad === "low" ? "basic" : "high" };
    return refs.length
      ? { model: "seedream/5-pro-image-to-image", input: { ...input, image_urls: refs.slice(0, 10) } }
      : { model: "seedream/5-pro-text-to-image", input };
  },
  "imagen-4-ultra-kie": ({ prompt, ajustes }) => ({
    model: "google/imagen4-ultra", input: { prompt, aspect_ratio: ajustes.aspectRatio || "3:4" },
  }),
  // ---- Pulir: ampliar y limpiar, o quitar el fondo. La imagen va como referencia; el texto no se usa.
  "topaz-ampliar-kie": ({ ajustes, refs }) => ({ model: "topaz/image-upscale", input: { image_url: refs[0], upscale_factor: ajustes.factor || "2" } }),
  "recraft-nitidez-kie": ({ refs }) => ({ model: "recraft/crisp-upscale", input: { image: refs[0] } }),
  "recraft-sin-fondo-kie": ({ refs }) => ({ model: "recraft/remove-background", input: { image: refs[0] } }),

  // ---- Video
  "kling-3-kie": ({ prompt, ajustes, inicio, fin }) => ({
    model: "kling-3.0/video",
    input: {
      prompt, sound: si(ajustes.sonido), duration: String(ajustes.duration || "10"), mode: ajustes.modo || "std", multi_shots: false,
      ...(inicio.length ? { image_urls: [inicio[0], ...fin.slice(0, 1)] } : { aspect_ratio: ajustes.aspectRatio || "9:16" }),
    },
  }),
  "kling-3-omni-kie": ({ prompt, ajustes, refs, inicio, fin, videos }) => {
    const comun = { prompt, audio: si(ajustes.sonido), resolution: ajustes.resolution || "720p" };
    const duration = entero(ajustes.duration, 10);
    if (videos.length || refs.length) {
      return {
        model: "kling-3.0-omni/reference-to-video",
        input: {
          ...comun, aspect_ratio: videos.length ? "auto" : (ajustes.aspectRatio || "9:16"),
          ...(refs.length ? { image_urls: refs.slice(0, 7) } : {}), ...(videos.length ? { video_urls: videos.slice(0, 1) } : { duration }),
        },
      };
    }
    if (inicio.length) {
      return { model: "kling-3.0-omni/image-to-video", input: { ...comun, image_urls: [inicio[0], ...fin.slice(0, 1)], duration, aspect_ratio: "auto" } };
    }
    return { model: "kling-3.0-omni/text-to-video", input: { ...comun, duration, aspect_ratio: ajustes.aspectRatio || "9:16" } };
  },
  "seedance-2-kie": (p) => seedance("bytedance/seedance-2", 9, 3, p),
  "seedance-2-5-kie": (p) => seedance("bytedance/seedance-2-5", 14, 10, p),
  "veo-3-1-fast-kie": (p) => veo("veo3_fast", p),
  "veo-3-1-kie": (p) => veo("veo3", p),
  "gemini-omni-kie": ({ prompt, ajustes, refs, inicio, fin, videos }) => {
    const input = { prompt, aspect_ratio: ajustes.aspectRatio || "9:16", resolution: ajustes.resolution || "720p", duration: String(ajustes.duration || "10") };
    // Con imagen inicial, nada más (ni referencias ni video): así lo exige Kie.
    if (inicio.length) return { model: "google/gemini-omni-flash-1-1", input: { ...input, first_frame_url: inicio[0], ...(fin.length ? { last_frame_url: fin[0] } : {}) } };
    // Cada video ocupa dos huecos de los 7: con video, hasta 5 imágenes. El tramo del video (`desde`–`hasta`, ≤ 10 s).
    const desde = Math.max(0, Number(ajustes.desde) || 0);
    const hasta = Math.min(desde + 10, Number(ajustes.hasta) || desde + 10);
    return {
      model: "google/gemini-omni-flash-1-1",
      input: {
        ...input,
        ...(refs.length ? { image_urls: refs.slice(0, videos.length ? 5 : 7) } : {}),
        ...(videos.length ? { video_list: [{ url: videos[0], start: desde, ends: hasta }] } : {}),
      },
    };
  },
  "hailuo-2-3-kie": ({ prompt, ajustes, inicio }) => ({
    model: "hailuo/2-3-image-to-video-pro",
    input: { prompt, image_url: inicio[0], duration: String(ajustes.duration || "6"), resolution: ajustes.resolution || "768P" },
  }),
  "wan-2-7-kie": ({ prompt, ajustes, inicio, fin }) => (inicio.length
    ? {
      model: "wan/2-7-image-to-video",
      input: { prompt, first_frame_url: inicio[0], ...(fin.length ? { last_frame_url: fin[0] } : {}), resolution: ajustes.resolution || "1080p", duration: entero(ajustes.duration, 10), watermark: false },
    }
    : {
      model: "wan/2-7-text-to-video",
      input: { prompt, ratio: ajustes.aspectRatio || "9:16", resolution: ajustes.resolution || "1080p", duration: entero(ajustes.duration, 10), watermark: false },
    }),
});

function seedance(model, maxRefs, maxVideos, { prompt, ajustes, refs, inicio, fin, videos }) {
  return {
    model,
    input: {
      prompt, generate_audio: si(ajustes.sonido), resolution: ajustes.resolution || "720p", aspect_ratio: ajustes.aspectRatio || "9:16",
      duration: entero(ajustes.duration, 10), output_format: "mp4",
      ...(inicio.length ? { first_frame_url: inicio[0] } : {}), ...(fin.length ? { last_frame_url: fin[0] } : {}),
      ...(refs.length ? { reference_image_urls: refs.slice(0, maxRefs) } : {}),
      ...(videos.length ? { reference_video_urls: videos.slice(0, maxVideos) } : {}),
    },
  };
}

function veo(nivel, { prompt, ajustes, refs, inicio, fin }) {
  const input = { prompt, model: nivel, aspect_ratio: ajustes.aspectRatio || "9:16", resolution: ajustes.resolution || "720p", duration: entero(ajustes.duration, 8) };
  // Con referencias, Veo sólo hace 8 s (y sólo en Fast): se fija aquí; `validarKie` ya lo dijo al pedir.
  if (refs.length) return { model: "veo-3-1", input: { ...input, generation_type: "REFERENCE_2_VIDEO", image_urls: refs.slice(0, 3), duration: 8 } };
  if (inicio.length) return { model: "veo-3-1", input: { ...input, generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO", image_urls: [inicio[0], ...fin.slice(0, 1)] } };
  return { model: "veo-3-1", input: { ...input, generation_type: "TEXT_2_VIDEO" } };
}

/** El pedido a Kie: { model, input } para ese modelo, o lanza si no lo conoce. Pura. */
export function pedidoKie(modelo, { prompt, ajustes = {}, refs = [], inicio = [], fin = [], videos = [] }) {
  const armar = MODELOS_KIE[modelo.id];
  if (!armar) throw new ErrorMotor(`El Estudio no sabe pedir «${modelo.nombre}» a Kie.ai.`, 500);
  return armar({ prompt, ajustes, refs, inicio, fin, videos });
}

/** Lo que Kie no admite se dice AL PEDIR (motor.validar): → motivo | null. Pura. */
export function validarKie(modelo, pedido = {}) {
  const m = pedido.medios ?? {};
  const n = (rol) => (m[rol] ?? []).length;
  if (modelo.id === "gemini-omni-kie" && n("start") && (n("reference") || n("video"))) {
    return "Gemini Omni no mezcla la imagen inicial con referencias o video: usa una cosa o la otra.";
  }
  if (modelo.id === "gemini-omni-kie" && n("video") && n("reference") > 5) return "Con un video, Gemini Omni admite hasta 5 imágenes de referencia.";
  if (modelo.id === "veo-3-1-fast-kie" && n("reference") && n("start")) return "Veo 3.1 no mezcla referencias con imagen inicial: usa una cosa o la otra.";
  if (modelo.id === "kling-3-omni-kie" && n("start") && (n("reference") || n("video"))) return "Kling 3.0 Omni no mezcla la imagen inicial con referencias o video.";
  if (modelo.pulir && n("reference") !== 1) return "Escoge la imagen que quieres pulir.";
  return null;
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

const EXTENSION = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm" };

/** Sube una imagen o un video de apoyo al almacén de Kie y devuelve su dirección. */
async function subir(env, f, i) {
  const form = new FormData();
  const video = String(f.mime).startsWith("video/");
  const nombre = `estudio-${Date.now().toString(36)}-${i}.${EXTENSION[f.mime] ?? (video ? "mp4" : "png")}`;
  form.set("file", new Blob([f.bytes], { type: f.mime }), nombre);
  form.set("uploadPath", video ? "videos/estudio" : "images/estudio");
  form.set("fileName", nombre);
  const d = await llamar(env, `${SUBIDAS(env)}/api/file-stream-upload`, { method: "POST", body: form });
  const url = d?.downloadUrl ?? d?.fileUrl ?? d?.url;
  if (!/^https:\/\//.test(String(url ?? ""))) throw new ErrorMotor(`Kie.ai no devolvió la dirección ${video ? "del video" : "de la imagen"} de referencia subida.`, 502, { reintentable: true });
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
  validar: validarKie,

  async enviar(env, { modelo, prompt, ajustes, medios = {} }) {
    let i = 0;
    const subirTodas = async (lista = []) => {
      const urls = [];
      for (const f of lista) urls.push(await subir(env, f, i++));
      return urls;
    };
    // En los modelos de imagen la imagen inicial (si la hubiera) va como una referencia más.
    const esVideo = modelo.tipo === "video";
    const refs = await subirTodas(esVideo ? medios.reference : [...(medios.reference ?? []), ...(medios.start ?? [])]);
    const inicio = esVideo ? await subirTodas(medios.start) : [];
    const fin = esVideo ? await subirTodas(medios.end) : [];
    const videos = esVideo ? await subirTodas(medios.video) : [];
    const cuerpo = pedidoKie(modelo, { prompt, ajustes, refs, inicio, fin, videos });
    const d = await llamar(env, `${BASE(env)}/api/v1/jobs/createTask`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
    });
    const id = d?.taskId ?? d?.task_id;
    if (!id) throw new ErrorMotor("Kie.ai no devolvió el número de la tarea.", 502);
    return { id: String(id), cada: esVideo ? 10_000 : 4000 };
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
    const esVideo = modelo.tipo === "video";
    const estado = String(d?.state ?? "").toLowerCase();
    if (estado === "fail" || estado === "failed") {
      return { estado: "fallido", error: `${modelo.nombre}: Kie.ai no pudo hacerlo${d?.failMsg ? ` (${String(d.failMsg).slice(0, 180)})` : ""}.` };
    }
    if (estado !== "success") return { estado: "pendiente", nota: NOTAS[estado] ?? "Kie.ai lo está preparando…", cada: esVideo ? 10_000 : 4000 };
    const [url] = urlsDelResultado(d);
    if (!url) return { estado: "fallido", error: `${modelo.nombre}: Kie.ai terminó sin ${esVideo ? "ningún video" : "ninguna imagen"}.` };
    return { estado: "listo", url };
  },
};
