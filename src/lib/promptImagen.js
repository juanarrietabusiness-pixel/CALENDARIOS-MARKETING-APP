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
// ============================================================

const limpio = (t) => String(t ?? "").replace(/\s+/g, " ").trim();

/** La huella de lo que dice la publicación para su imagen. Pura. */
export function huellaDelPrompt(post = {}) {
  const base = [limpio(post.escena) || limpio(post.idea), limpio(post.textoPieza), limpio(post.format || "post")].join("|");
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h * 33) ^ base.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** El pedido listo de la publicación, o "" si no tiene o ya no corresponde a lo que dice. Pura. */
export function promptListo(post = {}) {
  const p = limpio(post.promptImagen);
  return p && post.promptImagenDe === huellaDelPrompt(post) ? p : "";
}

/** La publicación con su pedido listo (los dos campos), calculado sobre lo que dice AHORA. Pura. */
export function conPromptListo(post = {}, prompt = "") {
  const p = limpio(prompt);
  return p ? { ...post, promptImagen: p, promptImagenDe: huellaDelPrompt(post) } : post;
}

/** Los dos campos del pedido listo para una publicación que va a quedar como `post` (para sumar a unos cambios). Pura. */
export const camposDePromptListo = (post = {}, prompt = "") => {
  const p = limpio(prompt);
  return p ? { promptImagen: p, promptImagenDe: huellaDelPrompt(post) } : {};
};
