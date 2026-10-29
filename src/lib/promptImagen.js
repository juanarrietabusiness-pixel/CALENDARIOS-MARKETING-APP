// ============================================================
// El pedido de la imagen de una publicación, ya listo (puro)
//
// Abrir «Crear con IA» desde un post lanzaba «Mejorar idea» cada vez: una
// llamada más a la IA (unos segundos) para resumir en una o dos frases lo que
// el motor de ideas acababa de escribir. Ahora el motor de ideas (el lote,
// «Planificar mes», «Completar los textos», «Generar») escribe además ese
// pedido —`imagen`, con el estilo de la mejora y el texto exacto entre
// comillas— y la publicación lo guarda en `promptImagen`.
//
// Sólo vale mientras la publicación diga lo mismo: `promptImagenDe` es la
// huella de lo que lo produjo (qué se ve —o la idea, si no hay—, el texto de
// la pieza, el formato). Si alguien cambia cualquiera de ellos, el pedido listo deja de valer y
// se vuelve al camino de siempre (la publicación → «Mejorar idea»).
//
// Y sólo se usa para CREAR si lo escribió el DIRECTOR DE ARTE
// (`promptImagenPor: "director"`): el del motor de ideas es un borrador que
// escribe el redactor junto con títulos y captions, de seis en seis, y con él
// las piezas salían peores que las del chat. Ese borrador sigue guardado (el
// director lo lee como «qué se ve») pero no se salta al director.
// ============================================================

const limpio = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
/** El pedido conserva sus líneas: una ficha de diseño es una línea por apartado (y así la lee el control). */
const lineas = (t) => String(t ?? "").replace(/\r/g, "").split("\n").map(limpio).filter(Boolean).join("\n");

/** La huella de lo que dice la publicación para su imagen. Pura. */
export function huellaDelPrompt(post = {}) {
  const base = [limpio(post.escena) || limpio(post.idea), limpio(post.textoPieza), limpio(post.format || "post")].join("|");
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h * 33) ^ base.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * El pedido listo de la publicación, o "" si no tiene, ya no corresponde a lo que dice o no lo diseñó el director (con
 * `cualquiera`, también el borrador del motor de ideas). Pura.
 */
export function promptListo(post = {}, { cualquiera = false } = {}) {
  const p = lineas(post.promptImagen);
  if (!p || post.promptImagenDe !== huellaDelPrompt(post)) return "";
  return cualquiera || post.promptImagenPor === "director" ? p : "";
}

/** La publicación con el pedido listo del DIRECTOR (los tres campos), calculado sobre lo que dice AHORA. Pura. */
export function conPromptListo(post = {}, prompt = "") {
  const p = lineas(prompt);
  return p ? { ...post, promptImagen: p, promptImagenDe: huellaDelPrompt(post), promptImagenPor: "director" } : post;
}

/**
 * Los campos del borrador del MOTOR DE IDEAS para una publicación que va a quedar como `post` (para sumar a unos
 * cambios). No es del director: no se salta su diseño. Pura.
 */
export const camposDePromptListo = (post = {}, prompt = "") => {
  const p = lineas(prompt);
  return p ? { promptImagen: p, promptImagenDe: huellaDelPrompt(post), promptImagenPor: "" } : {};
};
