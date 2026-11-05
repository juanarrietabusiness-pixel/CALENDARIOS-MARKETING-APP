// ============================================================
// «Escribir el guion con IA» del video animado (puro: lo arma el Worker, worker/lib/estudio/guionAnimado.js)
//
// La pantalla de creación (paso 4) ya no necesita a Claude para el primer borrador: la persona da la IDEA (o la
// publicación del calendario de la que sale), la duración y el formato, y la IA de texto escribe el guion entero en el
// formato de escenas v1 con el MISMO texto que lee Claude (`formatoParaLaIA`), la marca (cerebro, catálogo con los IDs
// de las fotos reales) y el personaje del kit si lo hay. El servidor lo VALIDA; si trae errores se le devuelven a la
// IA UNA vez para que los corrija. No se guarda nada: la pantalla lo abre como borrador sin guardar.
// ============================================================

import { formatoParaLaIA } from "./videoFormatoIA.js";
import { FORMATOS_VIDEO, MIN_SEGUNDOS, MAX_SEGUNDOS } from "./videoEscenas.js";

/** Las duraciones que ofrece la pantalla (s) y la que va por defecto. */
export const DURACIONES_ANIMADO = Object.freeze([15, 20, 30, 45, 60]);
export const DURACION_ANIMADO_POR_DEFECTO = 30;
/** Lo más que se acepta de idea. */
export const MAX_IDEA_ANIMADO = 2000;

/** La duración pedida, acotada al formato (5–150 s). Pura. */
export const duracionAnimado = (s) => {
  const n = Math.round(Number(s));
  return Number.isFinite(n) && n > 0 ? Math.max(MIN_SEGUNDOS + 5, Math.min(MAX_SEGUNDOS, n)) : DURACION_ANIMADO_POR_DEFECTO;
};

/** Lo que se le cuenta de una publicación del calendario (sólo lo que dice qué comunicar). Pura. */
export function textoDePublicacion(post) {
  if (!post || typeof post !== "object") return "";
  const linea = (nombre, v) => (String(v ?? "").trim() ? `${nombre}: ${String(v).trim().slice(0, 600)}` : "");
  return [
    linea("Título", post.titulo ?? post.title),
    linea("Idea", post.idea),
    linea("Qué se ve", post.escena),
    linea("Texto de la pieza", post.textoPieza),
    linea("Guion", post.guion),
    linea("Descripción", post.descripcion ?? post.script),
    linea("Producto", post.producto),
    linea("Tipo de contenido", post.pilar),
  ].filter(Boolean).join("\n");
}

/**
 * El pedido a la IA. `contexto`: la marca (ficha y pautas del cerebro, sin lo interno); `productos`: líneas del
 * catálogo con los IDs de la galería de sus fotos; `personaje`: el aspecto del kit (o null); `errores`: los del intento
 * anterior, para corregirlos sobre `anterior`. Pura.
 */
export function pedidoDeGuionAnimado({ marca, idea, publicacion = "", segundos, formato = "9:16", contexto = "", productos = "", personaje = null, errores = [], anterior = "" }) {
  const f = FORMATOS_VIDEO[formato] ? formato : "9:16";
  const s = duracionAnimado(segundos);
  const partes = [
    `Eres el guionista y director de arte de videos animados de la agencia Juancito Ads. Escribe el guion de UN video animado para ${marca}.`,
    "",
    formatoParaLaIA(),
    "",
    "LO QUE PIDE LA AGENCIA",
    idea ? `Idea: ${idea}` : "",
    publicacion ? `Sale de esta publicación del calendario:\n${publicacion}` : "",
    `Dura unos ${s} segundos en total (la voz, a 2,5 palabras por segundo: unas ${Math.round(s * 2.5)} palabras de «habla» entre todas las escenas). Formato principal: ${f} (formatos: ["${f}"]).`,
    "",
    "CÓMO SE ESCRIBE",
    "· La primera escena es un GANCHO que se entiende en 2 segundos; la última, un CIERRE con el logo y un llamado a la acción.",
    "· Problema antes que producto; un beneficio por escena; nada inventado: ni precios, ni cifras, ni testimonios que no estén abajo.",
    "· Cada escena con su «pantalla» (lo que se lee) y capas que se dibujen de verdad: texto, sello, icono, cifra, anillo, dibujo, forma, imagen (sólo con IDs de la galería que estén abajo), logo, llamado y personaje.",
    personaje ? `· La marca tiene PERSONAJE${personaje.nombre ? ` («${personaje.nombre}»)` : ""}: úsalo con «personaje» (variante, pose y expresión según lo que pase en la escena). Su aspecto lo pone el kit: no escribas estilo.personaje.` : "",
    "· Sin paleta propia: los colores salen del kit por sus tokens.",
    "",
    contexto ? `LA MARCA\n${contexto}` : "",
    productos ? `CATÁLOGO (las fotos son el producto REAL; en una capa «imagen» va su ID en «archivo»)\n${productos}` : "",
    "",
    errores.length
      ? `TU GUION ANTERIOR TENÍA ESTOS ERRORES (corrígelos y devuelve el guion ENTERO otra vez):\n${errores.slice(0, 20).map((e) => `· ${e.donde || "guion"}: ${e.mensaje}`).join("\n")}\n\nEl anterior:\n${String(anterior).slice(0, 12000)}`
      : "",
    "Devuelve SÓLO el JSON del guion, sin explicaciones ni ```.",
  ];
  return partes.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** El JSON del guion en lo que devolvió la IA (con o sin ```), o null. Pura. */
export function leerGuionAnimado(texto) {
  const t = String(texto ?? "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try {
    const g = JSON.parse(t.slice(i, j + 1));
    return g && typeof g === "object" && !Array.isArray(g) ? g : null;
  } catch {
    return null;
  }
}
