// ============================================================
// QUÉ LLEVA CADA FORMATO: una sola regla (puro y pequeño)
//
// Antes cada camino tenía la suya y se contradecían: a una historia se le
// exigía guion y caption aunque no lleva ninguno; el texto en la pieza de un
// reel salía en unos sitios sí y en otros no; los hashtags iban dentro del
// caption en unos caminos y aparte en otros (y salían dos veces). Ahora lo
// leen todos de aquí: el motor de textos del servidor (loteAnuncios.js,
// worker/lib/estudio/lote.js), lo que le falta a una publicación
// (completitud.js), «Completar los textos que faltan» y el panel.
//
//   · post      caption, texto en la pieza y hashtags; sin guion
//   · carrusel  guion (las láminas), caption y hashtags; el texto va lámina a lámina
//   · reel      guion (los planos o, si lo graba una persona, el guion para grabar), caption y hashtags; sin texto en la pieza
//   · historia  sólo el texto en la pieza: ni guion, ni caption, ni hashtags
//   · live      guion (los temas del directo), caption y hashtags
//
// Los HASHTAGS van SIEMPRE aparte (`hashtagsFinales`), nunca al final del
// caption: `textoPara` (publicacion.js) los junta al publicar, y si los dos
// los traen salen dos veces.
//
// Va en la carga inicial (lo lee el chip del mes): sin dependencias.
// ============================================================

/** Lo que lleva cada formato. `guion`: false o la forma que tiene. */
export const REGLAS_FORMATO = Object.freeze({
  post: Object.freeze({ guion: false, caption: true, textoPieza: true, hashtags: true }),
  carrusel: Object.freeze({ guion: "laminas", caption: true, textoPieza: false, hashtags: true }),
  reel: Object.freeze({ guion: "planos", caption: true, textoPieza: false, hashtags: true }),
  historia: Object.freeze({ guion: false, caption: false, textoPieza: true, hashtags: false }),
  live: Object.freeze({ guion: "temas", caption: true, textoPieza: false, hashtags: true }),
});

/** La regla de un formato (un formato desconocido, como un post). */
export const reglaDe = (format) => REGLAS_FORMATO[format] ?? REGLAS_FORMATO.post;

export const llevaGuion = (format) => Boolean(reglaDe(format).guion);
export const llevaCaption = (format) => reglaDe(format).caption;
export const llevaTextoPieza = (format) => reglaDe(format).textoPieza;
export const llevaHashtags = (format) => reglaDe(format).hashtags;

/** Los campos de texto que escribe el motor, con su clave en la publicación. */
export const CAMPOS_TEXTO = Object.freeze({
  titulo: "title",
  idea: "idea",
  textoPieza: "textoPieza",
  guion: "guion",
  descripcion: "descripcion",
  hashtags: "hashtagsFinales",
});

/** ¿Lleva este campo (del motor) una publicación de este formato? El título y la idea los lleva todo. Pura. */
export function llevaCampo(format, campo) {
  if (campo === "guion") return llevaGuion(format);
  if (campo === "descripcion") return llevaCaption(format);
  if (campo === "textoPieza") return llevaTextoPieza(format);
  if (campo === "hashtags") return llevaHashtags(format);
  return campo === "titulo" || campo === "idea";
}

const HASHTAG = /#[\p{L}\p{N}_]+/gu;
const UN_HASHTAG = /#[\p{L}\p{N}_]+/u;
const lleno = (t) => Boolean(String(t ?? "").trim());

/** ¿Tiene ya hashtags? Los sueltos o, en lo de antes, los del final del caption. Pura. */
export const tieneHashtags = (post = {}) => lleno(post.hashtagsFinales) || UN_HASHTAG.test(String(post.descripcion || post.script || ""));

/**
 * Los campos del motor que le FALTAN a una publicación según su formato (los vacíos que su formato lleva). Sin la idea
 * ni el título: esos los escribe la idea (modo «plan» o «publicacion»). Pura.
 */
export function camposQueFaltan(post = {}) {
  const f = post.format;
  const falta = [];
  if (llevaGuion(f) && !lleno(post.guion)) falta.push("guion");
  if (llevaCaption(f) && !lleno(post.descripcion || post.script)) falta.push("descripcion");
  if (llevaTextoPieza(f) && !lleno(post.textoPieza)) falta.push("textoPieza");
  if (llevaHashtags(f) && !tieneHashtags(post)) falta.push("hashtags");
  return falta;
}

/**
 * Separa los hashtags del FINAL de un caption: «Ven hoy 🛋️\n\n#sofa #panama» → { texto: «Ven hoy 🛋️», hashtags:
 * «#sofa #panama» }. Sólo el bloque final (los de en medio de una frase son parte de ella). Pura.
 */
export function separarHashtags(caption = "") {
  const t = String(caption ?? "").replace(/\s+$/, "");
  const m = /(?:^|\n|\s)((?:#[\p{L}\p{N}_]+[\s,.]*)+)$/u.exec(t);
  if (!m) return { texto: t.trim(), hashtags: "" };
  const hashtags = [...new Set(m[1].match(HASHTAG) ?? [])].join(" ");
  return { texto: t.slice(0, m.index).trim(), hashtags };
}

/** Junta dos listas de hashtags sin repetir (sin distinguir mayúsculas). Pura. */
export function juntarHashtags(...listas) {
  const vistos = new Set();
  const fuera = [];
  for (const l of listas) {
    for (const h of String(l ?? "").match(HASHTAG) ?? []) {
      const k = h.toLowerCase();
      if (!vistos.has(k)) { vistos.add(k); fuera.push(h); }
    }
  }
  return fuera.join(" ");
}
