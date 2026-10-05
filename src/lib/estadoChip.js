// ============================================================
// Qué dice de un vistazo el chip de una publicación en el mes (puro)
//
// Antes, un punto de color y una barrita: no se distinguía lo que tenía
// contenido subido de lo que era sólo una idea, ni lo aprobado de lo
// programado o lo publicado. Ahora:
//   · con contenido, su MINIATURA; sin él, borde punteado (es una idea);
//   · UN icono de estado, el más importante que le toque (lo que falló
//     manda sobre todo: es lo que hay que arreglar);
//   · la barrita de avance, sólo en las ideas, que es donde dice algo.
// La leyenda de debajo del mes sale de `ESTADOS_CHIP`: un sitio.
// ============================================================

import { mediosDe } from "./publicacion.js";
import { porProducir } from "./aprobacion.js";

/** Cada estado, con su icono (de Icon.jsx) y su nombre. En orden de la leyenda. */
export const ESTADOS_CHIP = Object.freeze({
  fallo: { etiqueta: "No se publicó", icono: "alert" },
  publicada: { etiqueta: "Publicada", icono: "check" },
  programada: { etiqueta: "Programada", icono: "clock" },
  cambios: { etiqueta: "El cliente pidió cambios", icono: "pencil" },
  aprobada: { etiqueta: "Aprobada", icono: "thumbsUp" },
  "idea-aprobada": { etiqueta: "Idea aprobada, falta la pieza", icono: "bulb" },
  pendiente: { etiqueta: "Pendiente de aprobar", icono: null },
});

/**
 * El estado que se enseña. `enCola` es lo de `resumenCola()` (o null).
 * La cola va primero: lo que salió o falló en redes es un hecho, y el
 * `status` del calendario puede ir por detrás.
 */
export function estadoDelChip(post, enCola = null) {
  if (enCola?.estado === "error") return "fallo";
  if (post?.status === "published" || enCola?.estado === "publicada") return "publicada";
  if (enCola?.estado === "programada") return "programada";
  if (post?.status === "rejected") return "cambios";
  if (post?.status === "approved") return porProducir(post) ? "idea-aprobada" : "aprobada";
  return "pendiente";
}

/**
 * La miniatura del chip: la primera imagen o, de un video, su portada.
 * Un video sin portada da `{ video: true }` sin imagen: se pinta su icono.
 * null si no tiene nada subido (es una idea).
 */
export function miniaturaDe(post) {
  const medios = mediosDe(post);
  if (!medios.length) return null;
  const imagen = medios.find((m) => m.tipo === "imagen");
  if (imagen) return { src: imagen.src, video: false };
  const portada = typeof post?.portada === "string" ? post.portada : post?.portada?.src;
  return { src: portada || null, video: true };
}
