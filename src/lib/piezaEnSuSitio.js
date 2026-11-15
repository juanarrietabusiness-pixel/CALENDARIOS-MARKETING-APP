// ============================================================
// La pieza que se crea DESDE una publicación, puesta en SU sitio (la pantalla y el servidor, la misma regla)
//
// «Otra versión», «Corregir» y «Recrear con mi marca» de una imagen del post y «Diseñar con el director» de un post sin
// imagen se hacen por un encargo del servidor. Si el panel sigue abierto cuando sale, lo pone él (en su formulario);
// si se cerró, lo pone el SERVIDOR al terminar (`poner: true` del encargo, worker/lib/estudio/encargos.js). Los dos
// con esta función, para que la lámina 3 de un carrusel siga siendo la 3 y no se pongan dos veces:
//
//   · `sitio.reemplaza`: el src de la imagen que se tocó. Ocupa ESE sitio; si ya no está (se quitó a mano), no se pone.
//   · sin `reemplaza` (la imagen nueva de un post vacío): se AÑADE al final.
//   · si la publicación ya lleva la pieza (la puso el panel, o el servidor antes), no cambia nada.
//
// La marca `piezaEnCurso` ({ encargoId, reemplaza, at }) va en la publicación mientras se hace: el panel guarda al
// cerrarse (y pisaría lo que el servidor puso si llegó en ese instante), así que al volver a abrirlo la retoma y la pone.
// Se quita cuando se pone. Pura: también la importa el Worker.
// ============================================================

import { conMedios, mediosDe } from "./publicacion.js";
import { medioDeArchivo } from "./galeriaPura.js";

/** Pasado un día, la marca ya no vale (el encargo se cerró por plazo hace mucho). */
export const MAX_HORAS_EN_CURSO = 24;
/** La marca de lo que se está creando para esta publicación (o null). Pura. */
export function piezaEnCurso(post, ahora = Date.now()) {
  const m = post?.piezaEnCurso;
  if (!m || typeof m !== "object" || !m.encargoId) return null;
  const at = Date.parse(m.at ?? "");
  if (Number.isFinite(at) && ahora - at > MAX_HORAS_EN_CURSO * 3_600_000) return null;
  return { encargoId: String(m.encargoId), reemplaza: typeof m.reemplaza === "string" ? m.reemplaza : "", at: m.at ?? "" };
}

/** La publicación sin la marca de ESE encargo (con otro encargo, la deja). Pura. */
export function sinMarca(post, encargoId = "") {
  if (!post?.piezaEnCurso || (encargoId && post.piezaEnCurso.encargoId !== encargoId)) return post;
  const { piezaEnCurso: _m, ...resto } = post;
  return resto;
}

/** Lo que guarda un paso del encargo sobre su sitio: el src a reemplazar (≤ 400) o «añadir». Pura. */
export function limpiarSitio(s) {
  if (!s || typeof s !== "object") return null;
  if (typeof s.reemplaza === "string" && s.reemplaza.trim()) return { reemplaza: s.reemplaza.trim().slice(0, 400) };
  return s.anadir === true ? { anadir: true } : null;
}

/**
 * Pone `archivo` (de la galería) en su sitio de la publicación. → { post, cambio: bool, aviso? }. `encargoId`: quita la
 * marca de ese encargo. Lo que cambia los archivos pone `mediosCambiadosAt` (si el cliente ya la aprobó, se sabe que
 * cambió después), como el panel.
 */
export function postConPiezaEnSuSitio(post, archivo, sitio = null, { encargoId = "", ahora = new Date().toISOString() } = {}) {
  const sin = sinMarca(post, encargoId);
  const nuevo = medioDeArchivo(archivo);
  const antes = mediosDe(post);
  if (antes.some((m) => m.src === nuevo.src)) return { post: sin, cambio: sin !== post };
  const reemplaza = sitio?.reemplaza ?? "";
  if (reemplaza) {
    const i = antes.findIndex((m) => m.src === reemplaza);
    if (i < 0) return { post: sin, cambio: sin !== post, aviso: "La imagen que se tocó ya no está en la publicación: la nueva quedó en la galería." };
    const medios = antes.map((m, k) => (k === i ? nuevo : m));
    return { post: { ...conMedios(sin, medios), mediosCambiadosAt: ahora }, cambio: true };
  }
  return { post: { ...conMedios(sin, [...antes, nuevo]), mediosCambiadosAt: ahora }, cambio: true };
}
