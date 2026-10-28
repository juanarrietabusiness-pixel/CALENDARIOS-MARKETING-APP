// ============================================================
// Editar una imagen ya hecha: el pedido, con qué modelo y en qué proporción
//
// Puro. Lo usan la pantalla (lib/estudio.js lo reexporta, lib/controlEstudio.js)
// y el Worker: los encargos del servidor corrigen y recomponen sin el navegador
// (worker/lib/estudio/encargos.js), con EXACTAMENTE el mismo pedido.
// ============================================================

import { MODELOS, MAX_PROMPT, modeloQueRespeta } from "./estudioCatalogo";
import { lineaDeReferencia } from "./referencias";

/** La proporción más cercana, entre las que ofrecen los modelos, a unas medidas. `null` si no se sabe. */
export function proporcionDeMedidas(ancho, alto) {
  if (!(ancho > 0 && alto > 0)) return null;
  const r = ancho / alto;
  const candidatas = [["9:16", 9 / 16], ["4:5", 4 / 5], ["1:1", 1], ["16:9", 16 / 9]];
  return candidatas.reduce((mejor, c) => (Math.abs(c[1] - r) < Math.abs(mejor[1] - r) ? c : mejor))[0];
}

/**
 * El prompt de una edición: lo que la persona pide y la orden de no tocar
 * lo demás. Va tal cual al motor y queda en la galería: lo que se mandó es
 * lo que se ve.
 */
export function promptDeEdicion(instruccion, { ejemplos = [] } = {}) {
  const pedido = String(instruccion ?? "").trim().replace(/[.\s]+$/, "");
  if (!pedido) return "";
  const conserva = "Conserva todo lo demás exactamente igual: la composición, el encuadre, las personas, el producto, los colores, la luz y cualquier texto o logo que no se pida cambiar.";
  if (!ejemplos.length) return `Edita la imagen de referencia: ${pedido}. ${conserva}`.slice(0, MAX_PROMPT);
  // Con ejemplos de la galería: la 1 es la que se edita; las demás, guía de lo que se pide (no se copian enteras).
  const lineas = ejemplos.map((r, i) => lineaDeReferencia(r, i + 2)
    || `Imagen de referencia ${i + 2}: es un EJEMPLO de lo que se pide; tómala como guía, no la copies entera.`);
  return [`Edita la imagen de referencia 1: ${pedido}. ${conserva}`, ...lineas].join("\n").slice(0, MAX_PROMPT);
}

/**
 * Corregir una imagen con una indicación y, si se quiere, ejemplos de la galería: la imagen va PRIMERO y los
 * ejemplos detrás, los que quepan en el modelo (las líneas del pedido dicen sólo los que van). → { prompt, medios }. Pura.
 */
export function pedidoDeCorreccion({ clave, instruccion, ejemplos = [], modelo = null }) {
  const caben = (ejemplos ?? []).filter((e) => e?.clave && e.clave !== clave)
    .filter((e, i, l) => l.findIndex((x) => x.clave === e.clave) === i)
    .slice(0, Math.max(0, (modelo?.referencias ?? 1) - 1));
  return { prompt: promptDeEdicion(instruccion, { ejemplos: caben }), medios: { reference: [clave, ...caben.map((e) => e.clave)] }, ejemplos: caben };
}

/**
 * Con qué modelo se edita: Muse Image si hay llave de Meta (edita y cuesta
 * 0,01 $), si no Nano Banana, si no el primero de imagen con referencias que
 * tenga llave; sin ninguno, la prueba. `activos`: { motor: bool }.
 */
export function modeloParaEditar(activos = {}) {
  const preferidos = ["muse-image", "nano-banana"];
  const con = (m) => m.tipo === "imagen" && m.referencias > 0 && activos[m.motor];
  return preferidos.map((id) => MODELOS.find((m) => m.id === id)).find((m) => m && con(m))
    ?? MODELOS.find((m) => con(m) && m.motor !== "prueba")
    ?? MODELOS.find((m) => m.id === "prueba");
}

/**
 * Con qué se corrige el texto: el mismo modelo que hizo la pieza si edita (así no cambia el estilo), si no Nano
 * Banana, y si no el que diga `modeloParaEditar`. `activos`: { motor: bool }. Pura.
 */
export function modeloParaCorregir(activos = {}, original = "", aspecto = "") {
  const sirve = (m) => m && m.tipo === "imagen" && m.referencias > 0 && activos[m.motor] && m.motor !== "prueba";
  const delOriginal = MODELOS.find((m) => m.id === original);
  const nano = MODELOS.find((m) => m.id === "nano-banana");
  const m = sirve(delOriginal) ? delOriginal : sirve(nano) ? nano : modeloParaEditar(activos);
  // Editar es pedir CON referencia (la misma imagen): un modelo que así no respeta la proporción cede al que sí, o la
  // pieza corregida saldría de otro tamaño.
  return modeloQueRespeta(m, activos, aspecto, 1);
}
