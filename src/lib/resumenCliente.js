// ============================================================
// Lo que se ve al entrar en un cliente, sin abrir nada (puro)
//
// Antes, saber qué faltaba por aprobar o qué publicaciones estaban a
// medias obligaba a recorrer el mes entero. Esto lo cuenta.
// ============================================================

import { completitud } from "./completitud.js";

/** Cuántas publicaciones hay en cada estado y cuántas están a medias. */
export function resumenCalendario(cal) {
  const r = { publicaciones: 0, porAprobar: 0, conCambios: 0, aprobadas: 0, publicadas: 0, incompletas: 0 };
  for (const day of cal?.days ?? []) {
    for (const post of day.posts ?? []) {
      r.publicaciones += 1;
      if (post.status === "approved") r.aprobadas += 1;
      else if (post.status === "rejected") r.conCambios += 1;
      else if (post.status === "published") r.publicadas += 1;
      else r.porAprobar += 1;
      if (completitud(post, day).faltan.length) r.incompletas += 1;
    }
  }
  return r;
}

/**
 * El calendario que se abre al entrar en un cliente sin decir cuál: el
 * del mes en curso si existe, y si no el más reciente. `hoy` es
 * AAAA-MM-DD; `month` de un calendario va de 0 a 11.
 */
export function calendarioPorDefecto(cals = [], hoy) {
  if (!cals.length) return null;
  const anio = Number(hoy.slice(0, 4));
  const mes = Number(hoy.slice(5, 7)) - 1;
  const actual = cals.find((c) => Number(c.year) === anio && Number(c.month) === mes);
  if (actual) return actual;
  return [...cals].sort((a, b) => (Number(b.year) * 12 + Number(b.month)) - (Number(a.year) * 12 + Number(a.month)))[0];
}
