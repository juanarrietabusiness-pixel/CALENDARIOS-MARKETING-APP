// ============================================================
// Leer un video para el asistente
//
// La API de Claude no recibe video: sólo imagen y documento. Así que el
// video lo VE Gemini —imagen y audio, entero— y devuelve un análisis
// escrito (transcripción, texto en pantalla, escenas, estructura), que
// es lo que el asistente recibe junto a unos fotogramas que saca el
// navegador. Claude escribe; Gemini mira.
//
// El video sube por la Files API de Gemini y no en línea: en línea
// habría que pasarlo a base64 AQUÍ, y codificar decenas de megas se
// come el tiempo de CPU del Worker. La subida es un `fetch` con los
// bytes tal cual.
//
// Sólo videos que ya están en R2 y son de un cliente de este espacio:
// la clave se comprueba igual que en /api/media.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";

const API = "https://generativelanguage.googleapis.com";
const MAX_BYTES = 80 * 1024 * 1024;
const PRESUPUESTO_MS = 110_000;

// Gemini no conoce `video/quicktime`, que es lo que manda un iPhone.
const MIME = { "video/quicktime": "video/mov" };

const PROMPT = `Analiza este video de redes sociales para que un redactor pueda escribir guiones inspirados en él.
Responde en español, con estas secciones y en este orden:

1. TRANSCRIPCIÓN: todo lo que se dice, literal, con marcas de tiempo [mm:ss]. Si no hay voz, dilo.
2. TEXTO EN PANTALLA: rótulos, subtítulos y textos superpuestos, con su momento.
3. ESCENAS: plano a plano, con marcas de tiempo: qué se ve, encuadre, acción, personas, producto y lugar.
4. ESTRUCTURA: el gancho de los primeros 3 segundos, el desarrollo, el cierre y la llamada a la acción.
5. ESTILO: duración, ritmo de edición, música o sonido, tono y tipo de pieza (tutorial, testimonio, tendencia…).
6. POR QUÉ FUNCIONA: los recursos que lo hacen atractivo y que se podrían reutilizar.

Sé fiel a lo que hay: no inventes nada que no se vea o no se oiga.`;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

export async function rutaAnalizarVideo(req, env, { acceso }) {
  if (!env.GOOGLE_AI_KEY) {
    return error("El servidor no tiene configurada la clave de Google AI, que es la que lee los videos", 503);
  }

  const { clave } = (await cuerpo(req)) ?? {};
  const m = /^clientes\/([^/]+)\//.exec(String(clave ?? ""));
  if (!m || String(clave).includes("..")) return error("Falta la clave del video");
  if (!(await acceso.leerUno("clients", { id: m[1] }))) return noEncontrado("Archivo");

  const objeto = await env.MEDIA.get(clave);
  if (!objeto) return noEncontrado("Archivo");
  if (objeto.size > MAX_BYTES) {
    return error(`El video pesa ${Math.round(objeto.size / 1048576)} MB; el máximo para analizarlo es ${MAX_BYTES / 1048576} MB.`, 413);
  }

  const tipo = objeto.httpMetadata?.contentType || "video/mp4";
  if (!tipo.startsWith("video/")) return error("Ese archivo no es un video");
  const mime = MIME[tipo] ?? tipo;

  const arranque = Date.now();
  const restante = () => PRESUPUESTO_MS - (Date.now() - arranque);
  const cabeceras = { "x-goog-api-key": env.GOOGLE_AI_KEY };
  const bytes = await objeto.arrayBuffer();

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
    body: JSON.stringify({ file: { display_name: clave.split("/").pop() } }),
  });
  const urlSubida = inicio.headers.get("x-goog-upload-url");
  if (!inicio.ok || !urlSubida) return fallo("abrir la subida", inicio);

  const subida = await fetch(urlSubida, {
    method: "POST",
    headers: { "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize" },
    body: bytes,
  });
  if (!subida.ok) return fallo("subir el video", subida);
  let archivo = (await subida.json())?.file;
  if (!archivo?.name) return error("Google AI no devolvió el archivo subido", 502);

  try {
    // 3. Gemini procesa el video antes de poder leerlo.
    while (archivo.state === "PROCESSING") {
      if (restante() < 20_000) return error("Google AI tardó demasiado en procesar el video. Prueba con uno más corto.", 504);
      await dormir(2000);
      const estado = await fetch(`${API}/v1beta/${archivo.name}`, { headers: cabeceras });
      if (!estado.ok) return fallo("consultar el video", estado);
      archivo = await estado.json();
    }
    if (archivo.state !== "ACTIVE") return error("Google AI no pudo procesar ese video.", 422);

    // 4. Verlo.
    const abortar = new AbortController();
    const reloj = setTimeout(() => abortar.abort(), Math.max(restante(), 1000));
    let res;
    try {
      res = await fetch(`${API}/v1beta/models/${env.GEMINI_VIDEO_MODEL || "gemini-2.5-flash"}:generateContent`, {
        method: "POST",
        signal: abortar.signal,
        headers: { ...cabeceras, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ fileData: { mimeType: archivo.mimeType || mime, fileUri: archivo.uri } }, { text: PROMPT }] }],
        }),
      });
    } catch {
      return error(abortar.signal.aborted ? "El análisis del video tardó demasiado." : "No se pudo contactar con Google AI", 504);
    } finally {
      clearTimeout(reloj);
    }
    if (!res.ok) return fallo("analizar el video", res);

    const data = await res.json();
    const analisis = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p?.text ?? "").join("").trim();
    if (!analisis) return error("Google AI no devolvió ningún análisis del video.", 422);
    return json({ analisis });
  } finally {
    // Caducan solos a las 48 h; borrarlo ya es no dejar el video de un
    // cliente en otro sitio más tiempo del necesario.
    fetch(`${API}/v1beta/${archivo.name}`, { method: "DELETE", headers: cabeceras }).catch(() => {});
  }
}

async function fallo(paso, res) {
  const texto = await res.text().catch(() => "");
  console.error(`video: al ${paso}, Google AI respondió`, res.status, texto.slice(0, 500));
  if (res.status === 429) return error("Google AI está saturado. Inténtalo en unos segundos.", 429);
  if (res.status === 401 || res.status === 403) return error("La clave de Google AI no es válida.", 502);
  return error(`No se pudo ${paso} (Google AI respondió ${res.status}).`, 502);
}
