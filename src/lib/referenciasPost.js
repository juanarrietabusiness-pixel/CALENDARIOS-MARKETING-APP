// ============================================================
// Los archivos de REFERENCIA de una publicación (puro)
//
// El video de otra cuenta que se trajo a la galería (por «Guardar
// referencia» o desde «Inspiración») acompaña a la publicación como
// referencia: se ve, se recrea con la marca o se le saca el guion, pero NO
// se publica. Por eso va en `referencias` y no en `medios`, que es lo que
// sale en el perfil del cliente. Va aparte de lib/inspiracion.js porque lo
// usa `deIdeaAPublicacion` (lib/subir.js), que está en el arranque.
// ============================================================

const LIMITE_REFERENCIAS = 5;

/** Una referencia de la publicación, limpia: { src, tipo, id?, cuenta?, enlace? } o null. Pura. */
export function referenciaLimpia(r) {
  if (!r || typeof r !== "object" || typeof r.src !== "string" || !r.src) return null;
  return {
    src: r.src,
    tipo: r.tipo === "video" ? "video" : "imagen",
    ...(r.id ? { id: String(r.id) } : {}),
    ...(r.cuenta ? { cuenta: String(r.cuenta).slice(0, 80) } : {}),
    ...(r.enlace ? { enlace: String(r.enlace).slice(0, 600) } : {}),
  };
}

/**
 * Los archivos de REFERENCIA de una publicación (el video de otra cuenta que se trajo): van aparte de `medios`, que es
 * lo que se publica, para que lo de otra cuenta no salga nunca en el perfil del cliente. Una idea del banco los trae en
 * `archivos` (lo que llegó por «Guardar referencia»); una publicación, en `referencias`. Pura.
 */
export function referenciasDe(post) {
  const lista = [...(Array.isArray(post?.referencias) ? post.referencias : []), ...(Array.isArray(post?.archivos) ? post.archivos : [])];
  const vistas = new Set();
  return lista.map(referenciaLimpia).filter((r) => r && !vistas.has(r.src) && vistas.add(r.src)).slice(0, LIMITE_REFERENCIAS);
}

