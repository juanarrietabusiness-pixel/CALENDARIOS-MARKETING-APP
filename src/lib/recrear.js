// ============================================================
// «Recrear un anuncio»: de una pieza de otra marca a una nuestra (puro)
//
// Se sube una imagen o un video (o se escoge de la galería o de Drive), la
// IA lo analiza —Claude mira las imágenes, Gemini ve los videos— y queda en
// el cerebro como referencia INTERNA (la ven el equipo y el asistente, nunca
// lo que se escribe para publicar: worker/lib/mercado.js). Después la IA
// propone la versión para el cliente con la misma forma y el contenido del
// cliente, una persona la corrige, y se crea en el Estudio con el kit, el
// logo y las fotos REALES del producto.
//
// Lo que va al compositor lo arma `pedidoParaElCompositor`: el anuncio
// original va de referencia diciendo QUÉ se toma de él (composición y
// estilo; nunca su producto, su texto ni su logo), las fotos del producto
// delante, y la escena con el texto exacto si lo lleva.
// ============================================================

/** Lo que se toma del anuncio de otra marca, y lo que se le dice al modelo de él. */
export const TOMA_DE_OTRA_MARCA = Object.freeze(["composicion", "estilo"]);
export const NOTA_OTRA_MARCA = "es un anuncio de otra marca: toma su forma, no su producto, su texto ni su logo";

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();

/** El análisis en pocas líneas, para la pantalla: [{ titulo, texto }] sin las vacías. Pura. */
export function resumenDelAnalisis(analisis) {
  const a = analisis ?? {};
  return [
    ["Gancho", a.gancho], ["Ángulo", a.angulo], ["Cómo está hecho", a.formato], ["Por qué funciona", a.porQueFunciona],
    ["Para nosotros", a.ideaParaNosotros],
  ].filter(([, t]) => String(t ?? "").trim()).map(([titulo, texto]) => ({ titulo, texto: corto(texto, 400) }));
}

/** La versión editable de partida a partir de lo que propuso la IA (`adaptacion`): qué se ve, el texto y el caption. Pura. */
export function versionDeAdaptacion(adaptacion) {
  const a = adaptacion ?? {};
  return {
    idea: corto([a.idea, a.guion].filter(Boolean).join(" "), 1200),
    texto: corto(a.textoPantalla, 120),
    descripcion: String(a.descripcion ?? "").trim().slice(0, 2200),
  };
}

/**
 * Lo que se le pone al compositor del Estudio. `archivo`: el anuncio de otra marca (de la galería); `fotos`: las del
 * producto (`fotosDelProducto`); `version`: { idea, texto }. En video, el anuncio va como video de referencia y el
 * texto no se pide (los modelos de video escriben mal). Pura.
 */
export function pedidoParaElCompositor({ archivo, fotos = [], version = {}, video = false }) {
  const idea = corto(version.idea, 1500);
  const texto = corto(version.texto, 120).replace(/["“”«»]/g, "");
  if (video) {
    return {
      tipo: "video", video: archivo, proporcion: "9:16", preset: "anuncio",
      prompt: [
        "Sigue los planos, el ritmo y el movimiento del video de referencia, con nuestro producto y los colores de nuestra marca. Sin su texto, su logo ni su marca; sin texto largo en pantalla.",
        idea,
      ].filter(Boolean).join(" ").slice(0, 1500),
    };
  }
  return {
    tipo: "imagen", proporcion: "4:5", preset: "anuncio",
    referencias: [...fotos, { ...archivo, toma: [...TOMA_DE_OTRA_MARCA], nota: NOTA_OTRA_MARCA }],
    prompt: [idea || "Una pieza nueva con la misma composición que la de referencia, con nuestro producto.",
      texto ? `Texto en la imagen, exacto y legible: "${texto}".` : ""].filter(Boolean).join(" ").slice(0, 1500),
  };
}
