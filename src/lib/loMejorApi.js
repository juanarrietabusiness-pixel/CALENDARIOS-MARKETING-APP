// ============================================================
// Cliente de /api/lo-mejor: «Lo mejor del momento»
//
// Leer una ventana (esta semana, este mes, nuevo) con sus filtros, pedir que
// se clasifique lo que falta, recrear una pieza para un cliente (primero el
// costo: el servidor contesta 409 «confirmar»), traer el original a la galería,
// «Crear con Claude» con la pieza de referencia y el tope de créditos de
// Scrape Creators. Lo que gasta IA relee el medidor de la cabecera al terminar.
// ============================================================

import { pedir } from "./db";

const post = (cuerpo) => ({ method: "POST", body: JSON.stringify(cuerpo ?? {}) });
const gasto = () => { try { window.dispatchEvent(new Event("ia:gasto")); } catch { /* sin ventana */ } };

/** Una ventana → { ventana, total, sinClasificar, piezas, sc }. */
export function leerLoMejor({ ventana = "semana", cliente = "", red = "", formato = "", tipo = "", fuente = "", pieza = "" } = {}) {
  const q = new URLSearchParams(Object.entries({ ventana, cliente, red, formato, tipo, fuente, pieza }).filter(([, v]) => v));
  return pedir(`/lo-mejor?${q}`);
}

/** Que la IA clasifique unas pocas piezas sin tipo (las de `claves`, o las mejores). → { clasificadas, fallo }. */
export async function clasificarLoMejor({ claves = null, clienteId = "" } = {}) {
  try {
    return await pedir("/lo-mejor/clasificar", post({ ...(claves?.length ? { claves } : {}), ...(clienteId ? { clienteId } : {}) }));
  } finally { gasto(); }
}

/**
 * Recrear una pieza para un cliente. Sin `confirmado`, el servidor no crea nada y contesta 409 con el costo, el día y
 * el camino: aquí se devuelve como { confirmar: { costo, costoTexto, detalle, fecha, camino, caminos } }.
 * Con `confirmado`: { fecha, calendarId, postId, camino, encargoId?, videoId?, aviso }.
 */
export async function recrearLoMejor({ clave, clienteId, camino = "", productoId = "", confirmado = false }) {
  try {
    return await pedir("/lo-mejor/recrear", post({ clave, clienteId, camino, productoId, confirmado }));
  } catch (e) {
    if (e?.estado === 409 && e?.datos?.codigo === "confirmar") return { confirmar: e.datos };
    throw e;
  } finally {
    if (confirmado) gasto();
  }
}

/** El archivo del original en la galería del cliente (lo ya bajado no se baja otra vez) → { archivo }. */
export const traerLoMejor = (clave, clienteId, { miniatura = false } = {}) =>
  pedir("/lo-mejor/traer", post({ clave, clienteId, ...(miniatura ? { miniatura: true } : {}) }));

/**
 * «Crear con Claude» con la pieza de referencia: guarda el pedido (con el original en la galería y lo que se sabe de
 * él) y abre claude.ai. La ventana se abre ANTES de esperar al servidor (si no, el navegador la bloquea).
 * → { mensaje, enlace, copiado }.
 */
export async function crearConClaudeLoMejor(clave, clienteId, recetaId = "recrear-referencia") {
  const ventana = window.open("about:blank", "_blank");
  try {
    const r = await pedir("/lo-mejor/claude", post({ clave, clienteId, recetaId }));
    let copiado = false;
    try { await navigator.clipboard.writeText(r.mensaje); copiado = true; } catch { /* sin permiso: se enseña */ }
    if (ventana) ventana.location.href = r.enlace;
    return { mensaje: r.mensaje, enlace: r.enlace, copiado };
  } catch (e) {
    ventana?.close();
    throw e;
  }
}

/**
 * El tope de créditos de Scrape Creators por semana, lo gastado y lo que espera su lectura → { semana, tope, manual,
 * auto, total, libres, releidoAt, tendencias, lleno, espera: { tiktok, palabras, anuncios, busquedas }, sc }.
 */
export const leerCreditosSC = () => pedir("/lo-mejor/creditos");
export const guardarTopeSC = (tope) => pedir("/lo-mejor/creditos", { method: "PUT", body: JSON.stringify({ tope }) });
/** Enciende o apaga las tendencias de TikTok del espacio (las palabras de cada cliente). */
export const guardarTendenciasSC = (activas) => pedir("/lo-mejor/creditos", { method: "PUT", body: JSON.stringify({ tendencias: activas === true }) });
/** Releer YA los anuncios de las búsquedas guardadas (dentro del tope). */
export const releerAnunciosSC = () => pedir("/lo-mejor/anuncios", post({}));
