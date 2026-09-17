// ============================================================
// Editar muchas publicaciones de una vez
//
// Vive aquí y no dentro de `ChatPanel` porque es la clase de código que
// falla en silencio: un filtro mal entendido no da error, escribe en las
// publicaciones equivocadas —o en ninguna— y la IA contesta que hecho.
// Deshacerlo a mano son veinticinco publicaciones. Como función pura se
// puede probar caso por caso sin montar el panel ni hablar con nadie.
//
// DOS FORMAS, Y SE PUEDEN COMBINAR
//
//   aplicar_a_todas   los MISMOS valores a todo lo que pase el filtro.
//                     «Pon las 9am a todos los lunes».
//   cambios           valores DISTINTOS por ID. Los textos, que no se
//                     repiten.
//
// EL FILTRO SÓLO MANDA SOBRE `aplicar_a_todas`. Los `cambios` ya vienen
// por ID, que es lo más explícito que hay: filtrarlos además sería
// descartar en silencio lo que se pidió a propósito.
// ============================================================

import { dayName, getWeekNumber } from "../utils";
import { normalizarHora } from "./horas";

/** Lo que devuelve `leerHora` cuando la hora no se entiende. */
export const MAL = Symbol("hora ilegible");

/**
 * La hora que pidió la IA, lista para escribir en `publishTime`.
 *
 * Tres respuestas y cada una quiere decir algo distinto: `undefined`
 * —no la mencionó, no se toca—, `""` —pidió quitarla— y «HH:MM».
 * `MAL` es lo que no se entiende, y se devuelve en vez de guardarse: un
 * valor raro en `publishTime` deja el campo de hora en blanco y la
 * publicación sin hora, con la IA diciendo que sí la puso.
 */
export function leerHora(valor) {
  if (valor === undefined || valor === null) return undefined;
  const texto = String(valor).trim().toLowerCase();
  if (!texto || texto === "quitar" || texto === "ninguna" || texto === "sin hora") return "";
  return normalizarHora(texto) ?? MAL;
}

const igual = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

/**
 * Aplica la edición en lote y devuelve los días nuevos.
 *
 * No muta nada: `dias` es una copia. Devuelve `{ ok: false, mensaje }`
 * cuando no se puede hacer, con el motivo escrito para que la IA se lo
 * cuente al usuario en vez de callarse.
 */
export function aplicarLote(cal, entrada = {}) {
  const cambios = Array.isArray(entrada.cambios) ? entrada.cambios : [];
  const comun = entrada.aplicar_a_todas;

  if (!cambios.length && !comun) {
    return { ok: false, mensaje: "No se indicaron cambios." };
  }

  const filtros = {
    dia: entrada.filtro_dia,
    formato: entrada.filtro_formato,
    categoria: entrada.filtro_categoria,
    semana: entrada.filtro_semana,
  };
  const puesto = (f) => f !== undefined && f !== null && f !== "";
  const hayFiltro = Object.values(filtros).some(puesto);

  let horaComun;
  if (comun) {
    // Sin filtro, «a todas» es el mes entero. Casi nunca es lo que se
    // pidió, y no hay forma de deshacerlo de una vez.
    if (!hayFiltro) {
      return {
        ok: false,
        mensaje: "Para aplicar el mismo valor a varias publicaciones hace falta al menos un filtro (día, formato, categoría o semana). Sin filtro se cambiaría el mes entero.",
      };
    }
    horaComun = leerHora(comun.hora);
    if (horaComun === MAL) {
      return { ok: false, mensaje: `No entendí la hora «${comun.hora}». Escríbela como «9am», «21:30» o «6 pm».` };
    }
  }

  const dias = cal?.days ?? [];
  const primerDia = dias[0]?.date;

  const alcanza = (fecha, post) => {
    if (!comun) return false;
    if (puesto(filtros.dia) && !igual(dayName(fecha), filtros.dia)) return false;
    if (puesto(filtros.semana) && primerDia
        && getWeekNumber(fecha, primerDia) !== Number(filtros.semana)) return false;
    if (puesto(filtros.formato) && !igual(post.format, filtros.formato)) return false;
    if (puesto(filtros.categoria) && !igual(post.category, filtros.categoria)) return false;
    return true;
  };

  const porId = new Map(cambios.map((c) => [c.post_id, c]));
  let count = 0;

  const nuevos = dias.map((d) => ({
    ...d,
    posts: (d.posts || []).map((p) => {
      const c = porId.get(p.id);
      const enLote = alcanza(d.date, p);
      if (!c && !enLote) return p;

      count++;
      const upd = { ...p };

      if (enLote) {
        if (horaComun !== undefined) upd.publishTime = horaComun;
        if (comun.categoria !== undefined) upd.category = comun.categoria;
        if (comun.formato !== undefined) upd.format = comun.formato;
      }

      // Lo explícito por ID gana sobre lo común: si se pidieron las dos
      // cosas, lo que se dijo de ESTA publicación es lo más concreto.
      if (c) {
        if (c.idea !== undefined) upd.idea = c.idea;
        if (c.descripcion !== undefined) upd.descripcion = c.descripcion;
        if (c.guion !== undefined) upd.guion = c.guion;
        if (c.categoria !== undefined) upd.category = c.categoria;
        const h = leerHora(c.hora);
        if (h !== undefined && h !== MAL) upd.publishTime = h;
      }

      return upd;
    }),
  }));

  if (count === 0) {
    return { ok: false, mensaje: "Ninguna publicación coincide con lo indicado." };
  }

  return { ok: true, dias: nuevos, count };
}
