// ============================================================
// Bajar un resultado de un motor a R2, sin cargarlo en memoria
//
// Un video de Veo pesa de 5 a 40 MB y el Worker tiene 128 MB en total: se pasa
// de la respuesta del motor a R2 por FLUJO (`FixedLengthStream`, que R2 exige
// cuando el cuerpo no es un buffer), sin decodificar nada.
//
// LO QUE SE COMPRUEBA, porque la dirección la da el motor y no se cree:
//   · https y nada más, sin usuario ni contraseña en la dirección, y ninguna
//     redirección se sigue a un http;
//   · un tope de tamaño (`Content-Length` obligatorio: sin él, no se sabe cuánto va a llegar);
//   · el tipo, por los PRIMEROS BYTES del archivo (`tipoPorBytes`) y no por la cabecera
//     que mande el servidor: un HTML con `Content-Type: video/mp4` no entra.
// ============================================================

import { ErrorMotor } from "./gemini.js";
import { tipoPorBytes } from "./archivos.js";

export const TOPE_IMAGEN = 25 * 1024 * 1024;
export const TOPE_VIDEO = 200 * 1024 * 1024;
const MAX_REDIRECCIONES = 3;
const PLAZO_MS = 120_000;

/** ¿Una dirección que se puede seguir? Pura. */
export function direccionValida(texto) {
  let u;
  try { u = new URL(texto); } catch { return false; }
  return u.protocol === "https:" && !u.username && !u.password && Boolean(u.hostname);
}

/** Abre la descarga. Devuelve `{ cuerpo, largo, mime }` con el primer trozo ya leído y comprobado. */
export async function abrirDescarga(url, { headers = {}, tope = TOPE_VIDEO, tipos = ["video/mp4", "video/webm"], nombre = "el motor" } = {}) {
  let actual = url;
  let res;
  for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
    if (!direccionValida(actual)) throw new ErrorMotor(`${nombre} devolvió una dirección que no es https: no se descargó.`, 502);
    try {
      // La llave sólo viaja al primer sitio: una redirección a otro dominio no la recibe.
      const mismoOrigen = new URL(actual).origin === new URL(url).origin;
      res = await fetch(actual, { headers: mismoOrigen ? headers : {}, redirect: "manual", signal: AbortSignal.timeout(PLAZO_MS) });
    } catch {
      throw new ErrorMotor(`No se pudo descargar el resultado de ${nombre}.`, 502, { reintentable: true });
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      actual = new URL(res.headers.get("location"), actual).toString();
      continue;
    }
    break;
  }
  if (!res || !res.ok || !res.body) {
    throw new ErrorMotor(`No pude descargar el resultado de ${nombre} (${res?.status ?? "sin respuesta"}).`, 502, { reintentable: (res?.status ?? 500) >= 500 });
  }
  const largo = Number(res.headers.get("content-length"));
  if (!(largo > 0)) throw new ErrorMotor(`${nombre} no dijo cuánto pesa el archivo: no se descargó.`, 502);
  if (largo > tope) throw new ErrorMotor(`El resultado de ${nombre} pesa más de ${Math.round(tope / 1048576)} MB: no se descargó.`, 502);

  const lector = res.body.getReader();
  const primero = await lector.read();
  const mime = primero.value ? tipoPorBytes(primero.value) : null;
  if (!mime || !tipos.includes(mime)) {
    await lector.cancel().catch(() => {});
    throw new ErrorMotor(`Lo que devolvió ${nombre} no es un archivo de los que el Estudio guarda.`, 502);
  }
  // El primer trozo ya se leyó para mirarlo: vuelve a ir por delante.
  const cuerpo = new ReadableStream({
    start(c) { c.enqueue(primero.value); },
    async pull(c) {
      const { done, value } = await lector.read();
      if (done) c.close(); else c.enqueue(value);
    },
    cancel() { return lector.cancel(); },
  });
  return { cuerpo, largo, mime };
}

/** Guarda la descarga en R2 con su tamaño exacto. Devuelve `{ bytes, mime }`. */
export async function guardarDescarga(env, clave, descarga) {
  const { cuerpo, largo, mime } = descarga;
  if (typeof globalThis.FixedLengthStream === "function") {
    const { readable, writable } = new globalThis.FixedLengthStream(largo);
    const tuberia = cuerpo.pipeTo(writable);
    await Promise.all([env.MEDIA.put(clave, readable, { httpMetadata: { contentType: mime } }), tuberia]);
  } else {
    // Sin FixedLengthStream (las pruebas en Node): en memoria, ya acotado por el tope.
    await env.MEDIA.put(clave, await new Response(cuerpo).arrayBuffer(), { httpMetadata: { contentType: mime } });
  }
  return { bytes: largo, mime };
}
