// ============================================================
// Google Drive: lo que el navegador y el Worker comparten (puro)
// ============================================================

/**
 * El id de una carpeta a partir de lo que se pegue: el enlace en
 * cualquiera de sus formas —/drive/folders/…, /drive/u/0/folders/…, con
 * ?usp=sharing detrás, ?id=…— o el id a secas. "" si no hay ninguno.
 *
 * Se guarda el id y no el enlace porque el enlace cambia de forma según
 * desde dónde se copie, y el id no.
 */
export function idDeCarpeta(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return "";
  const m = /\/folders\/([A-Za-z0-9_-]{10,})/.exec(t) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(t);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(t) ? t : "";
}

export const MIME_CARPETA = "application/vnd.google-apps.folder";

/** «imagen», «video», «carpeta» u «otro», según el tipo MIME. */
export function tipoDeArchivo(mime = "") {
  if (mime === MIME_CARPETA) return "carpeta";
  if (mime.startsWith("image/")) return "imagen";
  if (mime.startsWith("video/")) return "video";
  return "otro";
}

/** «3,4 MB». */
export function tamanoLegible(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1048576).toLocaleString("es-PA", { maximumFractionDigits: 1 })} MB`;
}

/** El enlace para abrir una carpeta en Drive. */
export const enlaceCarpeta = (id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

/**
 * Qué archivos de una publicación hay que copiar en Drive al programarla:
 * los suyos y los de su historia que viven en la aplicación (subidos desde
 * el equipo, del Estudio o generados con IA). Lo que vino de Drive
 * (`clientes/<id>/drive/…`) ya está allí, y lo ya copiado (`copiasDrive`)
 * no se copia dos veces.
 */
export function mediosParaCopiar(post) {
  const lista = [...(Array.isArray(post?.medios) ? post.medios : []), ...(Array.isArray(post?.historias) ? post.historias : [])]
    .map((m) => (typeof m === "string" ? m : m?.src))
    .filter((src) => typeof src === "string" && src.startsWith("/api/media/clientes/"));
  if (!lista.length && typeof post?.image === "string" && post.image.startsWith("/api/media/clientes/")) lista.push(post.image);
  const hechas = new Set(Object.keys(post?.copiasDrive ?? {}));
  return [...new Set(lista)].filter((src) => !/^\/api\/media\/clientes\/[^/]+\/drive\//.test(src) && !hechas.has(src));
}
