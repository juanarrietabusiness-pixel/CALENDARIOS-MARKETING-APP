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
import { lineaDeReferenciasVideo } from "./estiloVideo.js";
import { lineaDeFondos } from "./fondosVideo.js";
import { golpesEnTramo } from "./golpes.js";

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
export function pedidoDeGuionAnimado({ marca, idea, publicacion = "", segundos, formato = "9:16", contexto = "", productos = "", personaje = null, errores = [], anterior = "", criterio = "", estructura = "", marcaVideo = "", referencias = 0, conFondos = false, galeria = "", estiloGuardado = "", maxFondos = undefined }) {
  const f = FORMATOS_VIDEO[formato] ? formato : "9:16";
  const s = duracionAnimado(segundos);
  const partes = [
    `Eres el guionista y director de arte de videos animados de la agencia Juancito Ads. Escribe el guion de UN video animado para ${marca}.`,
    "",
    formatoParaLaIA(),
    "",
    // El KIT entero (src/lib/estiloVideo.js): los tokens de su paleta, su estilo, su letra, sus reglas, lo aprendido, el
    // logo, la música y el ESTILO DEL VIDEO obligatorio; y, si van, sus imágenes de referencia de estilo.
    marcaVideo ? `${marcaVideo}\n` : "",
    lineaDeReferenciasVideo(referencias),
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
    // El ESTILO GUARDADO del cliente (src/lib/estilosVideo.js): la forma que el código impone después.
    estiloGuardado ? `\n${estiloGuardado}` : "",
    conFondos ? `\n${lineaDeFondos({ galeria, ...(maxFondos ? { maxFondos } : {}) })}` : "",
    // El criterio comercial de la agencia: el mismo de todo guion de video (lib/guionVideo.js).
    criterio ? `\n${String(criterio).trim()}` : "",
    // La ESTRUCTURA de guion de la agencia (lib/formulasUgc.js): la escogida, en esta duración, o la lista para que la
    // IA escoja y diga cuál en el campo «estructura». Manda en el orden de los momentos de la voz; el gancho del
    // principio y el cierre con el logo y el llamado se quedan.
    estructura ? `\nESTRUCTURA DEL GUION (reparte las escenas y la voz en sus tramos; el gancho y el cierre con el logo y el llamado se quedan)\n${String(estructura).trim()}` : "",
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

// ------------------------------------------------------------
// «Video con tu canción»: las escenas diseñadas sobre la LETRA de una canción ya grabada (src/lib/videoCancion.js)
// ------------------------------------------------------------

const mmss = (s) => {
  const n = Math.max(0, Number(s) || 0);
  return `${Math.floor(n / 60)}:${(n % 60).toFixed(1).padStart(4, "0")}`;
};

/**
 * La letra por líneas CON sus tiempos para la IA: cada línea con cuándo se canta y cuánto dura, el CORO marcado (las que
 * se repiten) y los HUECOS instrumentales (intro, puente, final) donde van escenas sin letra. Pura.
 */
export function letraParaLaIA(lineas = [], huecos = [], golpes = []) {
  // Los GOLPES de la canción que caen en cada línea (src/lib/golpes.js), como mucho 8: ahí caen bien los cortes y las
  // palabras que entran de golpe.
  const deLinea = (l) => {
    const g = golpesEnTramo(golpes, l.desde, l.hasta).slice(0, 8);
    return g.length ? ` · golpes en ${g.map((t) => t.toFixed(2)).join(", ")} s` : "";
  };
  const filas = [
    ...lineas.map((l) => ({ desde: l.desde, texto: `[${mmss(l.desde)}–${mmss(l.hasta)}, ${(l.hasta - l.desde).toFixed(1)} s]${l.coro ? " (CORO)" : ""} ${l.texto}${deLinea(l)}` })),
    ...huecos.map((h) => ({ desde: h.desde, texto: `[${mmss(h.desde)}–${mmss(h.hasta)}] HUECO instrumental (${h.cual}, ${(h.hasta - h.desde).toFixed(1)} s): una escena SIN habla` })),
  ];
  return filas.sort((a, b) => a.desde - b.desde).map((f) => f.texto).join("\n");
}

/**
 * El pedido a la IA para DISEÑAR las escenas de un video con canción. La `habla` es la letra TAL CUAL y en orden (lo
 * comprueba `comprobarLetra` en el servidor), sin `pausa`, con escenas sin habla en los huecos, el coro con más fuerza
 * visual y el texto en pantalla corto. `lineas` y `huecos`: los de videoCancion.js; `errores`/`anterior`: la vuelta de
 * corrección. Pura.
 */
export function pedidoDeGuionCancion({ marca, titulo = "", nombre = "", duracion, lineas = [], huecos = [], formato = "9:16", contexto = "", productos = "", personaje = null, indicacion = "", errores = [], anterior = "", marcaVideo = "", referencias = 0, conFondos = false, galeria = "", golpes = [], bpm = 0, estiloGuardado = "", maxFondos = undefined }) {
  const f = FORMATOS_VIDEO[formato] ? formato : "9:16";
  const coro = lineas.some((l) => l.coro);
  return [
    `Eres el director de arte de videos animados de la agencia Juancito Ads. Diseña las ESCENAS de UN video animado para una CANCIÓN YA GRABADA de ${marca}: el audio es la canción (voz e instrumental), no se genera voz.`,
    "",
    formatoParaLaIA(),
    "",
    marcaVideo ? `${marcaVideo}\n` : "",
    lineaDeReferenciasVideo(referencias),
    // La agencia: «todo se construye sobre lo que dice la canción: su mensaje, su estilo y su ritmo».
    "TODO SALE DE LA CANCIÓN: su MENSAJE (lo que dice la letra decide qué se ve en cada escena), su ESTILO (el género y el ánimo deciden la tipografía, el ritmo de las entradas y los fondos) y su RITMO (los cortes de escena caen donde empieza una línea; las palabras clave entran de golpe cuando se cantan).",
    "",
    "MODO CANCIÓN (manda sobre lo de arriba)",
    "· El «habla» de las escenas es la LETRA TAL CUAL y EN ORDEN: ni una palabra cambiada, añadida ni quitada (tampoco [emociones]). Pártela por líneas o frases: una escena por línea, o dos líneas cortas juntas. Toda la letra va, de principio a fin.",
    "· Sin «pausa»: nada se inserta en el audio. Donde la lista dice HUECO va una escena con «habla» vacío (intro, puente, final): dura su hueco. La primera escena empieza en el segundo 0.",
    "· Cada escena dura lo que su parte de la canción: no hagas escenas de menos de un segundo (junta líneas cortas).",
    coro ? "· El CORO (las líneas marcadas, que se repiten) con más fuerza visual: sello, cifra, icono, anillo o el personaje, y un fondo que destaque; que se reconozca cada vez que vuelve." : "",
    "· El texto en pantalla, CORTO: las palabras clave de la línea (no la línea entera si es larga); los subtítulos ya ponen la letra palabra por palabra. Las capas entran ancladas a la palabra que nombran ({\"palabra\": n}).",
    "· La última escena (o el final instrumental) lleva el logo. Sin llamado inventado: si la letra no lo dice, sólo la marca.",
    "· No escribas «cancion» ni «musica»: los pone la aplicación.",
    personaje ? `· La marca tiene PERSONAJE${personaje.nombre ? ` («${personaje.nombre}»)` : ""}: úsalo en el coro o en los huecos (variante, pose y expresión según la letra). Su aspecto lo pone el kit.` : "",
    "· Sin paleta propia: los colores salen del kit por sus tokens.",
    "· La letra en pantalla con CARÁCTER: el coro o la frase clave en rol «gigante» o con *énfasis* en la palabra clave; con «porPalabra» y la entrada «golpe», cada palabra entra cuando se canta.",
    estiloGuardado ? `\n${estiloGuardado}` : "",
    conFondos ? `\n${lineaDeFondos({ galeria, cancion: true, ...(maxFondos ? { maxFondos } : {}) })}` : "",
    indicacion ? `\nLO QUE PIDE LA AGENCIA (manda): ${String(indicacion).trim().slice(0, 600)}` : "",
    "",
    `LA CANCIÓN${nombre ? ` «${nombre}»` : ""}: dura ${Number(duracion).toFixed(1)} s${bpm > 0 ? `, a unos ${bpm} BPM` : ""}. Formato principal: ${f} (formatos: ["${f}"]).${titulo ? ` Título del video: «${titulo}».` : ""}`,
    golpes.length ? "EL RITMO: cada línea dice en qué segundos caen sus GOLPES. Lo que entra de golpe (la palabra clave, un sello, un icono) va anclado a la palabra que suena en un golpe; una capa con «pulso»: true late en cada golpe (el coro, el logo del cierre)." : "",
    "La letra por líneas, con cuándo se canta cada una (y los huecos sin letra):",
    letraParaLaIA(lineas, huecos, golpes),
    "",
    contexto ? `LA MARCA\n${contexto}` : "",
    productos ? `CATÁLOGO (las fotos son el producto REAL; en una capa «imagen» va su ID en «archivo»)\n${productos}` : "",
    "",
    errores.length
      ? `TU GUION ANTERIOR TENÍA ESTOS ERRORES (corrígelos y devuelve el guion ENTERO otra vez):\n${errores.slice(0, 20).map((e) => `· ${e.donde || "guion"}: ${e.mensaje}`).join("\n")}\n\nEl anterior:\n${String(anterior).slice(0, 14000)}`
      : "",
    "Devuelve SÓLO el JSON del guion, sin explicaciones ni ```.",
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
