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
import { MARGEN_RAZONAMIENTO, esMuse, llaveMeta } from "./configIA.js";
import { conReglaIdioma } from "../../src/lib/idioma.js";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un rechazo de Anthropic con su código y su motivo. */
export class RechazoAnthropic extends Error {
  constructor(estado, tipo, mensaje, proveedor = "anthropic") {
    super(mensaje || `${proveedor === "meta" ? "Meta" : "Anthropic"} respondió ${estado}`);
    this.estado = estado;
    this.tipo = tipo;
    this.proveedor = proveedor;
  }
}

/**
 * ¿El rechazo es porque la cuenta no tiene ese modelo? Las rutas, entonces,
 * vuelven a escribir con Sonnet 5. De Meta cuenta además la llave que no
 * vale o el modelo que no se puede usar desde aquí (el Contributor no está
 * en todas las regiones): mejor un texto de Sonnet que ninguno.
 */
export const esRechazoDeModelo = (e) =>
  e instanceof RechazoAnthropic &&
  (e.tipo === "not_found_error" ||
    (e.proveedor === "meta" && [401, 403, 404].includes(e.estado)) ||
    (e.estado === 400 && /\bmodel\b/i.test(e.message) && !/tool/i.test(e.message)));

/** ¿El rechazo es por la búsqueda o la lectura web? */
export const esRechazoDeWeb = (e) =>
  e instanceof RechazoAnthropic && (e.estado === 400 || e.estado === 403) &&
  /web[_ ]?(search|fetch)/i.test(e.message);

/** Lo que se le enseña a la persona: el motivo de verdad, no uno genérico. */
/** «Your credit balance is too low to access the Anthropic API». */
export const esSaldoAgotado = (e) =>
  e instanceof RechazoAnthropic && /credit balance|billing/i.test(String(e.message ?? ""));

export function mensajeDeRechazo(e) {
  if (!(e instanceof RechazoAnthropic)) return e?.message || "No se pudo generar la respuesta.";
  if (e.proveedor === "meta") {
    if (e.estado === 429) return "Meta está saturado. Inténtalo en unos segundos.";
    if (e.estado === 401) return "La llave de Meta del servidor (META_API_KEY) no es válida.";
    return `Meta rechazó la petición (${e.estado}): ${String(e.message).slice(0, 300)}`;
  }
  // El saldo agotado llega como un 400 más, con el motivo en inglés. Es
  // justo el caso en que hace falta saber qué hacer, no qué pasó.
  if (esSaldoAgotado(e)) {
    return "Se acabó el saldo de Anthropic. Recárgalo en console.anthropic.com → Billing; " +
      "hasta entonces la IA de texto no puede responder.";
  }
  if (e.estado === 429) return "La IA está saturada. Inténtalo en unos segundos.";
  if (e.estado === 401) return "La clave de Anthropic del servidor no es válida.";
  if (e.estado === 403) return `Anthropic no permite esta petición con la clave del servidor: ${String(e.message).slice(0, 300)}`;
  return `Anthropic rechazó la petición (${e.estado}): ${String(e.message).slice(0, 300)}`;
}

// ------------------------------------------------------------
// Haiku 4.5 no habla el idioma de los modelos 5
// ------------------------------------------------------------
//
// Todas las rutas piden `thinking: adaptive` + `output_config.effort` y
// las herramientas web de 2026. Haiku 4.5 rechaza las tres con un 400:
// razona con un presupuesto fijo (`budget_tokens`, ≥ 1.024 y menor que
// `max_tokens`), no acepta `effort` y sólo tiene la web básica. Y su
// salida acaba en 64.000 tokens. Se traduce AQUÍ, por donde pasa toda
// llamada, para que una ruta nueva no tenga que acordarse.

const TOPE_SALIDA_HAIKU = 64_000;
const WEB_BASICA = Object.freeze({ web_search_20260209: "web_search_20250305", web_fetch_20260209: "web_fetch_20250910" });

// ------------------------------------------------------------
// Muse Spark (Meta) por su puerta compatible con Anthropic
// ------------------------------------------------------------
//
// La API de Meta acepta el formato de mensajes de Anthropic en
// `api.meta.ai/v1/messages`, pero no se sabe que acepte lo propio de los
// modelos de Anthropic: el razonamiento adaptativo, `effort`, las marcas de
// caché y las herramientas web que ejecuta Anthropic. Se quitan: Muse
// razona solo, y lo que le falta es la búsqueda web del asistente.

const SOLO_ANTHROPIC = /^(web_search|web_fetch|code_execution|bash|text_editor|computer|memory)_/;

const sinCache = (bloques) => (Array.isArray(bloques)
  ? bloques.map((b) => {
    if (!b || typeof b !== "object" || !("cache_control" in b)) return b;
    const { cache_control: _quitada, ...resto } = b;
    return resto;
  })
  : bloques);

function adaptarAMeta(peticion) {
  const { thinking: _t, output_config: _o, ...resto } = peticion;
  const salida = { ...resto };
  if (Array.isArray(resto.system)) salida.system = sinCache(resto.system);
  if (Array.isArray(resto.messages)) {
    salida.messages = resto.messages.map((m) => (Array.isArray(m?.content) ? { ...m, content: sinCache(m.content) } : m));
  }
  if (Array.isArray(resto.tools)) {
    const tools = sinCache(resto.tools).filter((t) => !SOLO_ANTHROPIC.test(String(t?.type ?? "")));
    if (tools.length) salida.tools = tools; else { delete salida.tools; delete salida.tool_choice; }
  }
  return salida;
}

/** La petición tal como la acepta ese modelo. Pura. */
export function adaptarAlModelo(peticion) {
  if (esMuse(peticion?.model)) return adaptarAMeta(peticion);
  if (!/^claude-haiku-4/.test(String(peticion?.model ?? ""))) return peticion;
  const { thinking, output_config: config, ...resto } = peticion;
  const { effort, ...otros } = config ?? {};
  const salida = { ...resto, max_tokens: Math.min(Number(peticion.max_tokens) || 8_000, TOPE_SALIDA_HAIKU) };
  if (Object.keys(otros).length) salida.output_config = otros;
  // «Bajo» es responder casi directo: en Haiku, sin razonar. El resto
  // razona con lo que su nivel reserva, dejando sitio para el texto.
  if (thinking && effort !== "low") {
    const presupuesto = Math.min(MARGEN_RAZONAMIENTO[effort] ?? MARGEN_RAZONAMIENTO.high, salida.max_tokens - 2_000);
    if (presupuesto >= 1_024) salida.thinking = { type: "enabled", budget_tokens: presupuesto };
  }
  if (Array.isArray(resto.tools)) {
    salida.tools = resto.tools.map((t) => (WEB_BASICA[t?.type] ? { ...t, type: WEB_BASICA[t.type] } : t));
  }
  return salida;
}

/**
 * Abre una llamada en streaming. Reintenta UNA vez si falla antes de
 * empezar a llegar nada (429, 5xx, red); a mitad del flujo no se
 * reintenta. Un rechazo se lanza como RechazoAnthropic, con su motivo.
 */
export async function abrirFlujo(env, peticion, { signal } = {}) {
  const meta = esMuse(peticion?.model);
  const proveedor = meta ? "meta" : "anthropic";
  const nombre = meta ? "Meta" : "Anthropic";
  const url = meta ? `${(env.META_BASE || "https://api.meta.ai/v1").replace(/\/$/, "")}/messages` : "https://api.anthropic.com/v1/messages";
  const llave = meta ? llaveMeta(env) : env.ANTHROPIC_API_KEY;
  // Meta toma la llave como «auth token» (Bearer); se manda también como
  // x-api-key, que es lo que pone el SDK de Anthropic.
  const cabeceras = {
    "Content-Type": "application/json",
    "x-api-key": llave,
    "anthropic-version": "2023-06-01",
    ...(meta ? { Authorization: `Bearer ${llave}` } : {}),
  };
  for (let intento = 0; intento <= 1; intento++) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        signal,
        headers: cabeceras,
        // Toda llamada de texto lleva la regla del español neutro (src/lib/idioma.js).
        body: JSON.stringify({ ...adaptarAlModelo(conReglaIdioma(peticion)), stream: true }),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      if (intento < 1) { await dormir(2000); continue; }
      throw new Error(`No se pudo contactar con ${nombre}.`, { cause: e });
    }
    if ((res.status === 429 || res.status >= 500) && intento < 1) { await dormir(2000); continue; }
    if (!res.ok) {
      const cuerpoError = await res.text().catch(() => "");
      console.error(`${proveedor}: rechazo`, res.status, cuerpoError);
      let detalle = {};
      try { detalle = JSON.parse(cuerpoError)?.error ?? {}; } catch { /* no era JSON */ }
      throw new RechazoAnthropic(res.status, detalle.type ?? "", detalle.message ?? "", proveedor);
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
