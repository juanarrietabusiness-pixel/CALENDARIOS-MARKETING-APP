// ============================================================
// Hablar con Gemini para crear una imagen
//
// UNA sola manera de llamar, para las dos puertas de entrada: el Estudio
// (trabajos, galería) y `/api/generar-imagen` (historias, ampliar, portadas
// y el chat), que sigue con su contrato. Antes esta llamada vivía dentro de
// la ruta y era imposible reutilizarla sin copiarla.
//
// El navegador NUNCA habla con Google: todo pasa por el Worker, que es lo
// que deja `connect-src` en `'self'`.
//
// Los mensajes de error son los que la aplicación ya enseñaba, palabra por
// palabra, para no cambiar lo que la gente lee. `estado` es el código HTTP
// con el que una ruta debe contestar.
// ============================================================

/** Un fallo de un motor, con lo que hay que decirle a la persona y si vale la pena reintentar. */
export class ErrorMotor extends Error {
  constructor(mensaje, estado = 502, { reintentable = false } = {}) {
    super(mensaje);
    this.name = "ErrorMotor";
    this.estado = estado;
    this.reintentable = reintentable;
  }
}

const PLAZO_MS = 120_000;
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * A trozos: `String.fromCharCode(...bytes)` con una imagen de más de
 * ~100 KB pasa del máximo de argumentos y lanza.
 */
export function aBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** De base64 a bytes, con un bucle: `Uint8Array.from(…, fn)` llama a `fn` por cada byte y con 1,5 MB roza el tope de CPU. */
export function deBase64(b64) {
  const bin = atob(b64);
  const salida = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) salida[i] = bin.charCodeAt(i);
  return salida;
}

/** Por qué Google no devolvió imagen, si fue su filtro. */
const FILTROS = /^(SAFETY|IMAGE_SAFETY|PROHIBITED_CONTENT|BLOCKLIST|SPII|RECITATION|IMAGE_PROHIBITED_CONTENT)$/;

/**
 * Pide UNA imagen. `partes` son las partes de Gemini (`{ text }` e
 * `{ inlineData }`); `ratio` la proporción; `tamano` («1K»…«4K») sólo si el
 * modelo lo admite. Devuelve `{ bytes, mime, meta }` o lanza `ErrorMotor`.
 */
export async function llamarGemini(env, { gid, partes, ratio, tamano = null, plazoMs = PLAZO_MS }) {
  if (!env.GOOGLE_AI_KEY) throw new ErrorMotor("El servidor no tiene configurada la clave de Google AI", 503);

  const abortar = new AbortController();
  const reloj = setTimeout(() => abortar.abort(), plazoMs);
  let res;
  try {
    res = await fetch(`${BASE}/${encodeURIComponent(gid)}:generateContent`, {
      method: "POST",
      signal: abortar.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GOOGLE_AI_KEY },
      body: JSON.stringify({
        contents: [{ parts: partes }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: ratio, ...(tamano ? { imageSize: tamano } : {}) },
        },
      }),
    });
  } catch {
    clearTimeout(reloj);
    if (abortar.signal.aborted) throw new ErrorMotor("La generación de la imagen tardó demasiado. Inténtalo de nuevo.", 504, { reintentable: true });
    throw new ErrorMotor("No se pudo contactar con Google AI", 502, { reintentable: true });
  }
  clearTimeout(reloj);

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    console.error("imagen: Google AI respondió", res.status, texto);
    if (res.status === 429) throw new ErrorMotor("Google AI está saturado. Inténtalo en unos segundos.", 429, { reintentable: true });
    if (res.status === 401 || res.status === 403) {
      throw new ErrorMotor("La clave de Google AI no es válida. Revísala en los secretos del Worker.", 502);
    }
    let detalle = "";
    try { detalle = JSON.parse(texto)?.error?.message || ""; } catch { /* no es JSON */ }
    // Un id de modelo que la cuenta no tiene es la apuesta que se pierde: que se lea.
    if (res.status === 404) {
      throw new ErrorMotor(`Tu cuenta de Google AI no tiene el modelo «${gid}»${detalle ? ` (${detalle.slice(0, 160)})` : ""}. Prueba con otro modelo.`, 502);
    }
    throw new ErrorMotor(
      `Google AI devolvió un error (${res.status})${detalle ? ": " + detalle.slice(0, 200) : ". Inténtalo de nuevo."}`,
      502,
      { reintentable: res.status >= 500 },
    );
  }

  const data = await res.json();
  const candidato = data?.candidates?.[0];
  const partesRespuesta = candidato?.content?.parts ?? [];
  const imagen = partesRespuesta.find((p) => p.inlineData);
  if (!imagen) {
    const razon = data?.promptFeedback?.blockReason || candidato?.finishReason || "";
    if (data?.promptFeedback?.blockReason || FILTROS.test(razon)) {
      throw new ErrorMotor(`El filtro de contenido de Google no dejó crear esa imagen (${razon}). Cambia el prompt.`, 422);
    }
    const texto = partesRespuesta.find((p) => p.text)?.text || "No se generó ninguna imagen";
    throw new ErrorMotor(`No se pudo generar la imagen: ${texto.slice(0, 200)}`, 422);
  }
  const { mimeType, data: b64 } = imagen.inlineData;
  return { bytes: deBase64(b64), mime: mimeType || "image/png", meta: data?.usageMetadata ?? {} };
}
