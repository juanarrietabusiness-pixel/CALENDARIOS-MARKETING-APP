// ============================================================
// «Escuchar» una voz de la marca antes de escogerla
//
// Las voces de Gemini Omni (VOCES_OMNI: Kore, Puck, Charon…) son las voces
// fijas de Google, las mismas que tiene su texto a voz. Para oír una antes de
// fijarla en el kit, se le pide a Google una frase corta con esa voz, con la
// MISMA llave de siempre (GOOGLE_AI_KEY), y se guarda en R2: cada voz se paga
// una sola vez para toda la agencia (son 30, de una fracción de centavo).
//
// La muestra NO es lo que dirá el video: es la voz. Lo que cuenta en el video lo
// pone Omni con su texto.
//
// R2 bajo `voces/`, no `clientes/`: no es de ningún cliente y /api/media no lo
// sirve. Google contesta audio PCM de 16 bits en crudo: se le pone la cabecera
// WAV aquí para que el navegador lo reproduzca.
// ============================================================

import { VOCES_OMNI } from "../../../src/lib/estudioCatalogo.js";
import { bloqueoPorPresupuesto, registrarConsumoGemini } from "../configIA.js";
import { ErrorEstudio } from "./trabajos.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** Los de texto a voz, en orden: si la llave no tiene el primero (404), el siguiente. */
export const MODELOS_VOZ = Object.freeze(["gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts", "gemini-2.5-pro-preview-tts"]);
export const FRASE_MUESTRA = "Hola, así suena la voz de tu marca en los videos: clara, cercana y lista para tu próximo anuncio.";
const PLAZO_MS = 60_000;

/** El PCM de 16 bits en crudo con su cabecera WAV. Pura. */
export function wavDePcm(pcm, hz = 24000, canales = 1) {
  const datos = pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm);
  const salida = new Uint8Array(44 + datos.length);
  const v = new DataView(salida.buffer);
  const texto = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  texto(0, "RIFF"); v.setUint32(4, 36 + datos.length, true); texto(8, "WAVE");
  texto(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, canales, true);
  v.setUint32(24, hz, true); v.setUint32(28, hz * canales * 2, true); v.setUint16(32, canales * 2, true); v.setUint16(34, 16, true);
  texto(36, "data"); v.setUint32(40, datos.length, true);
  salida.set(datos, 44);
  return salida;
}

/** La frecuencia que dice el tipo de Google («audio/L16;codec=pcm;rate=24000»), o 24000. Pura. */
export const frecuenciaDe = (mime = "") => Number(/rate=(\d+)/.exec(String(mime))?.[1]) || 24000;

const aBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** La muestra de una voz (audio/wav) → { cuerpo, nueva }. La primera vez se pide a Google y se guarda en R2. */
export async function muestraDeVoz(env, acceso, voz) {
  if (!Object.hasOwn(VOCES_OMNI, voz)) throw new ErrorEstudio("Esa voz no existe.", 404);
  const clave = `voces/${voz}.wav`;
  const guardada = await env.MEDIA.get(clave);
  if (guardada) return { cuerpo: guardada.body, nueva: false };
  if (!env.GOOGLE_AI_KEY) throw new ErrorEstudio("El servidor no tiene la llave de Google (GOOGLE_AI_KEY) para escuchar las voces.", 503);
  const bloqueo = await bloqueoPorPresupuesto(acceso);
  if (bloqueo) throw new ErrorEstudio(bloqueo, 402);

  // El nombre de la voz va con mayúscula inicial («Kore»), como lo escribe Google.
  const nombre = voz.charAt(0).toUpperCase() + voz.slice(1);
  let ultimo = "";
  for (const modelo of MODELOS_VOZ) {
    let res;
    try {
      res = await fetch(`${BASE}/${modelo}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GOOGLE_AI_KEY },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Dilo en español latino neutro, con tono cálido y natural: ${FRASE_MUESTRA}` }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: nombre } } } },
        }),
        signal: AbortSignal.timeout(PLAZO_MS),
      });
    } catch {
      throw new ErrorEstudio("Google no contestó a tiempo. Inténtalo otra vez.", 504);
    }
    // Un modelo que esta llave no tiene: el siguiente.
    if (res.status === 404) { ultimo = modelo; continue; }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new ErrorEstudio(`Google no dio la muestra (${res.status}): ${String(j?.error?.message ?? "sin motivo").slice(0, 200)}`, 502);
    const parte = (j?.candidates?.[0]?.content?.parts ?? []).find((p) => p?.inlineData?.data);
    if (!parte) throw new ErrorEstudio("Google contestó sin audio. Inténtalo otra vez.", 502);
    const wav = wavDePcm(aBytes(parte.inlineData.data), frecuenciaDe(parte.inlineData.mimeType));
    await env.MEDIA.put(clave, wav, { httpMetadata: { contentType: "audio/wav" } });
    await registrarConsumoGemini(acceso, { funcion: "muestra de voz", modelo, meta: j?.usageMetadata });
    return { cuerpo: wav, nueva: true };
  }
  throw new ErrorEstudio(`Esta llave de Google no tiene ningún modelo de voz (probé ${ultimo ? MODELOS_VOZ.join(", ") : "ninguno"}).`, 502);
}
