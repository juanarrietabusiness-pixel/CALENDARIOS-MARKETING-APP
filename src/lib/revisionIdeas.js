// ============================================================
// La revisión INTERNA de las ideas del mes (pura)
//
// El cliente recibe el calendario con todo creado; las ideas las aprueba la
// agencia antes de gastar en imágenes. Una idea aprobada pasa a «En
// producción» (`etapa: "produccion"`, la misma etapa del tablero), y
// «Diseñar las que ya hay» produce primero ésas.
// ============================================================

import { mediosDe } from "./publicacion.js";

/** Las etapas que ya dejaron atrás la idea: aprobada por dentro (o más allá). */
const PASADAS = new Set(["produccion", "revision", "cliente"]);

/** ¿La agencia ya la aprobó por dentro? Pura. */
export const aprobadaPorDentro = (post) => PASADAS.has(post?.etapa);

/** ¿Está por revisar? (Sin aprobar, sin publicar.) Pura. */
export const porRevisar = (post) => !aprobadaPorDentro(post) && post?.status !== "published";

/** Las ideas del mes que se revisan: con idea o título y SIN contenido todavía, en orden de fecha → [{ post, day }]. Pura. */
export function ideasDeRevision(cal) {
  return [...(cal?.days ?? [])]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .flatMap((day) => (day.posts ?? [])
      .filter((p) => p.status !== "published" && !mediosDe(p).length && String(p.idea || p.title || "").trim())
      .map((post) => ({ post, day })));
}
