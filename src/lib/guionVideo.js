// ============================================================
// La BASE COMÚN de todo guion de video (puro: lo usan los generadores del Worker)
//
// Había cinco generadores casi iguales —el reel por planos, el video corto de 8–10 s, el «Video del producto», el
// video animado y la revisión del director comercial— y cada uno juntaba a su manera lo mismo: el producto con su
// precio EXACTO del catálogo, lo que la marca dice (el cerebro, sin lo interno), el criterio comercial de la agencia y
// la publicación de la que sale. Unos lo traían y otros no: el reel IGNORABA el guion que ya tenía la publicación.
//
// Ahora el contexto lo junta UNA función del Worker (worker/lib/estudio/guionVideo.js, `contextoDeGuion`) y estas
// líneas son las mismas en todos los pedidos; cada generador conserva lo suyo (planos, tramos, escenas, la receta del
// producto) y su forma de responder.
// ============================================================

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Lo más que se le cuenta del guion de la publicación. */
export const MAX_GUION_POST = 3000;

/**
 * El guion que YA tiene la publicación, para que el nuevo lo SIGA (lo que dice, el orden, el gancho) en vez de
 * inventar otro; adaptado al formato del generador. Vacío si no tiene. Pura.
 */
export function lineaDelGuionPost(guion = "") {
  const g = String(guion ?? "").trim().slice(0, MAX_GUION_POST);
  return g ? `EL GUION QUE YA TIENE LA PUBLICACIÓN (síguelo: lo que se dice, el orden y el gancho; adáptalo a este formato sin cambiar su intención ni inventar otro):\n${g}` : "";
}

/** El producto con su precio EXACTO (una línea del catálogo). Pura. */
export const lineaDelProducto = (producto = "") => (corto(producto, 600) ? `Producto (precio EXACTO si se nombra; nunca otro): ${corto(producto, 600)}` : "");

/** Lo que se sabe de la marca (el cerebro para escribir, sin lo interno). Pura. */
export const lineaDelContexto = (contexto = "", max = 3000) => (String(contexto ?? "").trim() ? `Lo que se sabe de la marca:\n${String(contexto).slice(0, max)}` : "");

/**
 * Las líneas comunes de un pedido de guion de video, en el orden en que van detrás de la consigna de cada generador:
 * el criterio comercial de la agencia, el producto, el guion de la publicación y lo que se sabe de la marca. Pura.
 */
export function lineasComunesDeGuion({ criterio = "", producto = "", guionPost = "", contexto = "", maxContexto = 3000 } = {}) {
  return [
    criterio ? String(criterio).trim() : "",
    lineaDelProducto(producto),
    lineaDelGuionPost(guionPost),
    lineaDelContexto(contexto, maxContexto),
  ].filter(Boolean);
}
