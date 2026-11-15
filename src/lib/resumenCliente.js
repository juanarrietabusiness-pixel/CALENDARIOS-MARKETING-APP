// ============================================================
// Lo que se ve al entrar en un cliente, sin abrir nada (puro)
//
// Antes, saber qué faltaba por aprobar o qué publicaciones estaban a
// medias obligaba a recorrer el mes entero. Esto lo cuenta.
// ============================================================

import { completitud } from "./completitud.js";
import { diasConRespuestas } from "./aprobacion.js";

/**
 * Cuántas publicaciones hay en cada estado y cuántas están a medias. `respuestas` (opcional): las del cliente de todo el
 * espacio, Map «calendario:publicación» → respuesta (`aprobacionesDelEspacio`, lo mismo que lee Producción). Sin ellas
 * se cuenta con el `status` guardado en el mes, que no sabe lo que el cliente respondió si nadie abrió ese mes.
 */
export function resumenCalendario(cal, respuestas = null) {
  const r = { publicaciones: 0, porAprobar: 0, conCambios: 0, aprobadas: 0, publicadas: 0, incompletas: 0 };
  const calId = cal?.dbId || cal?.id;
  const dias = respuestas ? diasConRespuestas(cal?.days, (id) => respuestas.get(`${calId}:${id}`)) : cal?.days;
  for (const day of dias ?? []) {
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
