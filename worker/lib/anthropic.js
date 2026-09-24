// ============================================================
// Hablar con Anthropic: una sola manera para toda la aplicación
//
// El asistente y la generación del calendario llamaban cada uno a su
// modo, y cada uno escondía el motivo de un rechazo detrás de «el
// proveedor de IA devolvió un error». Así pasó con Opus 5.5: la cuenta
// no tenía el modelo, el mensaje de Anthropic lo decía claro, y en
// pantalla no se veía. Aquí vive la llamada, sus reintentos y el
// rechazo con su motivo, para que las dos rutas los compartan.
//
// SIEMPRE EN STREAMING
//
// Con el razonamiento activado una respuesta puede tardar minutos y
// pedir decenas de miles de tokens. Sin streaming la API rechaza las
// peticiones que podrían pasar de diez minutos, y una conexión callada
// tanto rato la cortan los intermediarios. Leyendo el flujo, los bytes
// llegan desde el primer segundo.
// ============================================================

import { partirSSE, crearAcumulador } from "./flujoAnthropic.js";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un rechazo de Anthropic con su código y su motivo. */
export class RechazoAnthropic extends Error {
  constructor(estado, tipo, mensaje) {
    super(mensaje || `Anthropic respondió ${estado}`);
    this.estado = estado;
    this.tipo = tipo;
  }
}

/** ¿El rechazo es porque la cuenta no tiene ese modelo? */
export const esRechazoDeModelo = (e) =>
  e instanceof RechazoAnthropic &&
  (e.tipo === "not_found_error" || (e.estado === 400 && /\bmodel\b/i.test(e.message) && !/tool/i.test(e.message)));

/** ¿El rechazo es por la búsqueda o la lectura web? */
export const esRechazoDeWeb = (e) =>
  e instanceof RechazoAnthropic && (e.estado === 400 || e.estado === 403) &&
  /web[_ ]?(search|fetch)/i.test(e.message);

/** Lo que se le enseña a la persona: el motivo de verdad, no uno genérico. */
export function mensajeDeRechazo(e) {
  if (!(e instanceof RechazoAnthropic)) return e?.message || "No se pudo generar la respuesta.";
  if (e.estado === 429) return "La IA está saturada. Inténtalo en unos segundos.";
  if (e.estado === 401) return "La clave de Anthropic del servidor no es válida.";
  if (e.estado === 403) return `Anthropic no permite esta petición con la clave del servidor: ${String(e.message).slice(0, 300)}`;
  return `Anthropic rechazó la petición (${e.estado}): ${String(e.message).slice(0, 300)}`;
}

/**
 * Abre una llamada en streaming. Reintenta UNA vez si falla antes de
 * empezar a llegar nada (429, 5xx, red); a mitad del flujo no se
 * reintenta. Un rechazo se lanza como RechazoAnthropic, con su motivo.
 */
export async function abrirFlujo(env, peticion, { signal } = {}) {
  for (let intento = 0; intento <= 1; intento++) {
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ ...peticion, stream: true }),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      if (intento < 1) { await dormir(2000); continue; }
      throw new Error("No se pudo contactar con Anthropic.", { cause: e });
    }
    if ((res.status === 429 || res.status >= 500) && intento < 1) { await dormir(2000); continue; }
    if (!res.ok) {
      const cuerpoError = await res.text().catch(() => "");
      console.error("anthropic: rechazo", res.status, cuerpoError);
      let detalle = {};
      try { detalle = JSON.parse(cuerpoError)?.error ?? {}; } catch { /* no era JSON */ }
      throw new RechazoAnthropic(res.status, detalle.type ?? "", detalle.message ?? "");
    }
    return res;
  }
  throw new Error("No se pudo generar la respuesta.");
}

/** Lee un flujo SSE entero, avisando de cada trozo. Devuelve el mensaje. */
export async function leerFlujo(res, alTrozo = async () => {}) {
  const acc = crearAcumulador();
  const lector = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    const { eventos, resto } = partirSSE(buffer);
    buffer = resto;
    for (const ev of eventos) {
      const salida = acc.consumir(ev);
      if (salida) await alTrozo(salida);
    }
  }
  if (buffer.trim()) for (const ev of partirSSE(`${buffer}\n\n`).eventos) acc.consumir(ev);
  return acc.mensaje();
}

/** El texto de un mensaje: TODOS los bloques de texto, no el primero. */
export const textoDe = (mensaje) =>
  (mensaje?.content ?? []).filter((b) => b?.type === "text").map((b) => b.text ?? "").join("");
