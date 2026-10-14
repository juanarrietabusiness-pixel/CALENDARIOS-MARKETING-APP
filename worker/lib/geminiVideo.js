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
//
// EL MOTOR SE ESCOGE en Ajustes → IA (`ia_modelos.video`, `motorDeVideo`):
//   · Gemini con la llave de siempre (`GOOGLE_AI_KEY`);
//   · Gemini con una llave del nivel GRATUITO (`GOOGLE_AI_KEY_GRATIS`): el
//     mismo camino, apuntado a costo 0 (Google puede usar lo que recibe y
//     tiene topes por minuto y por día: un 429 lo dice así);
//   · Meta (Muse Spark), por si no queda crédito en Google: no recibe el
//     video, sino FOTOGRAMAS que saca el navegador (el Worker no puede
//     decodificar video). Sin ellos contesta 409 `fotogramas` y el
//     navegador los saca y repite el pedido. Sin audio: no hay transcripción.
// ============================================================

import { registrarConsumoGemini, leerConfigIA, motorDeVideo, MODELO_MUSE } from "./configIA.js";
import { llamarIA, ErrorIA } from "./cerebro/ia.js";

const API = "https://generativelanguage.googleapis.com";
export const MAX_BYTES_VIDEO = 80 * 1024 * 1024;
const PRESUPUESTO_MS = 110_000;

// Gemini no conoce `video/quicktime`, que es lo que manda un iPhone.
const MIME = { "video/quicktime": "video/mov" };

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export class ErrorVideo extends Error {
  constructor(mensaje, estado = 502, codigo = "") {
    super(mensaje);
    this.estado = estado;
    if (codigo) this.codigo = codigo;
  }
}

/** Los fotogramas que manda el navegador, limpios: JPEG en base64, como mucho 10 y de 600 kB cada uno. Pura. */
export const MAX_FOTOGRAMAS = 10;
export function limpiarFotogramas(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((f) => ({ segundo: Math.max(0, Math.round(Number(f?.segundo) || 0)), base64: String(f?.base64 ?? "") }))
    .filter((f) => f.base64.length > 100 && f.base64.length < 800_000 && /^[A-Za-z0-9+/=]+$/.test(f.base64) && f.base64.startsWith("/9j/"))
    .slice(0, MAX_FOTOGRAMAS);
}

async function fallo(paso, res, gratis = false) {
  const texto = await res.text().catch(() => "");
  console.error(`video: al ${paso}, Google AI respondió`, res.status, texto.slice(0, 500));
  if (res.status === 429 && gratis) {
    return new ErrorVideo("La llave gratuita de Google llegó a su tope (por minuto o del día). Espera un rato, o cambia el motor de video en Ajustes → IA.", 429);
  }
  if (res.status === 429) return new ErrorVideo("Google AI está saturado. Inténtalo en unos segundos.", 429);
  if (res.status === 401 || res.status === 403) return new ErrorVideo("La clave de Google AI no es válida.", 502);
  return new ErrorVideo(`No se pudo ${paso} (Google AI respondió ${res.status}).`, 502);
}

/**
 * Le enseña el video al motor escogido con `prompt` y devuelve lo que contesta (texto). Lanza `ErrorVideo` con un
 * mensaje para la persona y su estado HTTP (con Meta y sin fotogramas: 409 `fotogramas`).
 * @param funcion     cómo se apunta en el consumo («análisis de video», «referencia de competencia»…).
 * @param fotogramas  [{ segundo, base64 }] JPEG que saca el navegador: los usa Meta.
 */
export async function verVideo(env, acceso, { bytes, mime: tipo, nombre = "video", clienteId = null, prompt, funcion = "análisis de video", json = false, fotogramas = null }) {
  if (!String(tipo ?? "").startsWith("video/")) throw new ErrorVideo("Ese archivo no es un video", 400);
  const config = acceso ? await leerConfigIA(acceso).catch(() => null) : null;
  const { motor, llave } = motorDeVideo(config, env);
  if (!motor) throw new ErrorVideo("El servidor no tiene ninguna llave que pueda ver videos (Google AI o Meta).", 503);
  if (motor === "meta") return verConMeta(env, acceso, { clienteId, prompt, funcion, json, fotogramas });
  const falla = (paso, res) => fallo(paso, res, motor === "gemini-gratis");
  const mime = MIME[tipo] ?? tipo;
  const modelo = env.GEMINI_VIDEO_MODEL || "gemini-2.5-flash";

  const arranque = Date.now();
  const restante = () => PRESUPUESTO_MS - (Date.now() - arranque);
  const cabeceras = { "x-goog-api-key": llave };

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
  if (!inicio.ok || !urlSubida) throw await falla("abrir la subida", inicio);

  const subida = await fetch(urlSubida, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: bytes,
  });
  if (!subida.ok) throw await falla("subir el video", subida);
  let archivo = (await subida.json())?.file;
  if (!archivo?.name) throw new ErrorVideo("Google AI no devolvió el archivo subido", 502);

  try {
    // 3. Gemini procesa el video antes de poder leerlo.
    while (archivo.state === "PROCESSING") {
      if (restante() < 20_000) throw new ErrorVideo("Google AI tardó demasiado en procesar el video. Prueba con uno más corto.", 504);
      await dormir(2000);
      const estado = await fetch(`${API}/v1beta/${archivo.name}`, { headers: cabeceras });
      if (!estado.ok) throw await falla("consultar el video", estado);
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
    if (!res.ok) throw await falla("analizar el video", res);

    const data = await res.json();
    await registrarConsumoGemini(acceso, { funcion, modelo, meta: data?.usageMetadata, clienteId, gratis: motor === "gemini-gratis" });
    const texto = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p?.text ?? "").join("").trim();
    if (!texto) throw new ErrorVideo("Google AI no devolvió ningún análisis del video.", 422);
    return texto;
  } finally {
    // Caducan solos a las 48 h; borrarlo ya es no dejar el video de un
    // cliente en otro sitio más tiempo del necesario.
    fetch(`${API}/v1beta/${archivo.name}`, { method: "DELETE", headers: cabeceras }).catch(() => {});
  }
}

/**
 * Meta (Muse Spark) mira los FOTOGRAMAS del video, en orden y con su segundo, y contesta lo mismo que Gemini menos lo
 * que se oye. Va por `llamarIA`: respeta el presupuesto, apunta el consumo y, si Meta rechaza el modelo, escribe Sonnet.
 */
async function verConMeta(env, acceso, { clienteId, prompt, funcion, json, fotogramas }) {
  const fotos = limpiarFotogramas(fotogramas);
  if (!fotos.length) throw new ErrorVideo("Con Meta hacen falta fotogramas del video.", 409, "fotogramas");
  const contenido = [
    ...fotos.flatMap((f) => [
      { type: "text", text: `Fotograma del segundo ${f.segundo}:` },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: f.base64 } },
    ]),
    {
      type: "text",
      text: [
        `Estos son ${fotos.length} fotogramas de UN video, en orden. No tienes el audio: lo que se dice no lo sabes; no lo inventes y, donde se pida la voz o la transcripción, di «sin audio (análisis por fotogramas)». Los textos en pantalla sí se leen en los fotogramas.`,
        "",
        prompt,
        json ? "\nResponde SOLO con JSON, sin texto alrededor." : "",
      ].join("\n"),
    },
  ];
  try {
    const r = await llamarIA(env, acceso, { id: clienteId }, { prompt: contenido, salida: 4000, funcion, modelo: MODELO_MUSE });
    if (!r.texto.trim()) throw new ErrorVideo("Meta no devolvió ningún análisis del video.", 422);
    return r.texto.trim();
  } catch (e) {
    if (e instanceof ErrorIA) throw new ErrorVideo(e.message, e.estado ?? 502);
    throw e;
  }
}
