// ============================================================
// Gemini VE un video (imagen y audio, entero) y lo cuenta por escrito
//
// La API de Claude no recibe video; Gemini sí. El video sube por la Files
// API de Gemini y no en línea: en línea habría que pasarlo a base64 AQUÍ,
// y codificar decenas de megas se come el tiempo de CPU del Worker. La
// subida es un `fetch` con los bytes tal cual; después se espera a que
// Gemini lo procese, se le pregunta y se borra.
//
// Lo usan el análisis de un video para el asistente (worker/rutas/video.js)
// y las referencias de video de la competencia (worker/lib/mercado.js).
// Quien llama comprueba antes el presupuesto (`bloqueoPorPresupuesto`); el
// consumo lo apunta esto.
// ============================================================

import { registrarConsumoGemini } from "./configIA.js";

const API = "https://generativelanguage.googleapis.com";
export const MAX_BYTES_VIDEO = 80 * 1024 * 1024;
const PRESUPUESTO_MS = 110_000;

// Gemini no conoce `video/quicktime`, que es lo que manda un iPhone.
const MIME = { "video/quicktime": "video/mov" };

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export class ErrorVideo extends Error {
  constructor(mensaje, estado = 502) {
    super(mensaje);
    this.estado = estado;
  }
}

async function fallo(paso, res) {
  const texto = await res.text().catch(() => "");
  console.error(`video: al ${paso}, Google AI respondió`, res.status, texto.slice(0, 500));
  if (res.status === 429) return new ErrorVideo("Google AI está saturado. Inténtalo en unos segundos.", 429);
  if (res.status === 401 || res.status === 403) return new ErrorVideo("La clave de Google AI no es válida.", 502);
  return new ErrorVideo(`No se pudo ${paso} (Google AI respondió ${res.status}).`, 502);
}

/**
 * Le enseña el video a Gemini con `prompt` y devuelve lo que contesta (texto). Lanza `ErrorVideo` con un mensaje
 * para la persona y su estado HTTP.
 * @param funcion  cómo se apunta en el consumo («análisis de video», «referencia de competencia»…).
 */
export async function verVideo(env, acceso, { bytes, mime: tipo, nombre = "video", clienteId = null, prompt, funcion = "análisis de video", json = false }) {
  if (!env.GOOGLE_AI_KEY) throw new ErrorVideo("El servidor no tiene configurada la clave de Google AI, que es la que lee los videos", 503);
  if (!String(tipo ?? "").startsWith("video/")) throw new ErrorVideo("Ese archivo no es un video", 400);
  const mime = MIME[tipo] ?? tipo;
  const modelo = env.GEMINI_VIDEO_MODEL || "gemini-2.5-flash";

  const arranque = Date.now();
  const restante = () => PRESUPUESTO_MS - (Date.now() - arranque);
  const cabeceras = { "x-goog-api-key": env.GOOGLE_AI_KEY };

  // 1. Abrir la subida y 2. mandar los bytes.
  const inicio = await fetch(`${API}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      ...cabeceras,
      "Content-Type": "application/json",
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mime,
    },
    body: JSON.stringify({ file: { display_name: nombre } }),
  });
  const urlSubida = inicio.headers.get("x-goog-upload-url");
  if (!inicio.ok || !urlSubida) throw await fallo("abrir la subida", inicio);

  const subida = await fetch(urlSubida, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: bytes,
  });
  if (!subida.ok) throw await fallo("subir el video", subida);
  let archivo = (await subida.json())?.file;
  if (!archivo?.name) throw new ErrorVideo("Google AI no devolvió el archivo subido", 502);

  try {
    // 3. Gemini procesa el video antes de poder leerlo.
    while (archivo.state === "PROCESSING") {
      if (restante() < 20_000) throw new ErrorVideo("Google AI tardó demasiado en procesar el video. Prueba con uno más corto.", 504);
      await dormir(2000);
      const estado = await fetch(`${API}/v1beta/${archivo.name}`, { headers: cabeceras });
      if (!estado.ok) throw await fallo("consultar el video", estado);
      archivo = await estado.json();
    }
    if (archivo.state !== "ACTIVE") throw new ErrorVideo("Google AI no pudo procesar ese video.", 422);

    // 4. Verlo.
    const abortar = new AbortController();
    const reloj = setTimeout(() => abortar.abort(), Math.max(restante(), 1000));
    let res;
    try {
      res = await fetch(`${API}/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        signal: abortar.signal,
        headers: { ...cabeceras, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ fileData: { mimeType: archivo.mimeType || mime, fileUri: archivo.uri } }, { text: prompt }] }],
          ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
        }),
      });
    } catch {
      throw new ErrorVideo(abortar.signal.aborted ? "El análisis del video tardó demasiado." : "No se pudo contactar con Google AI", 504);
    } finally {
      clearTimeout(reloj);
    }
    if (!res.ok) throw await fallo("analizar el video", res);

    const data = await res.json();
    await registrarConsumoGemini(acceso, { funcion, modelo, meta: data?.usageMetadata, clienteId });
    const texto = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p?.text ?? "").join("").trim();
    if (!texto) throw new ErrorVideo("Google AI no devolvió ningún análisis del video.", 422);
    return texto;
  } finally {
    // Caducan solos a las 48 h; borrarlo ya es no dejar el video de un
    // cliente en otro sitio más tiempo del necesario.
    fetch(`${API}/v1beta/${archivo.name}`, { method: "DELETE", headers: cabeceras }).catch(() => {});
  }
}
