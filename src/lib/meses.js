// ============================================================
// El calendario siempre activo, en el navegador (puro)
//
// Un calendario por cliente que se recorre por meses. Por dentro las
// publicaciones siguen guardadas por meses (una fila de `calendars` por
// cliente y mes: ver worker/lib/meses.js y docs/propuesta-calendario-
// continuo.md), pero ese cajón no se crea a mano: un mes sin cajón se
// enseña igual, VACÍO, con este calendario «virtual», y el cajón se crea
// al escribir la primera publicación.
// ============================================================

import { MONTHS } from "../constants.js";
import { ponerEnDia } from "./subir.js";

/** Un mes sin cajón todavía: se ve y se puede escribir en él. */
export function calendarioVirtual(year, month) {
  return {
    id: `mes-${year}-${String(month + 1).padStart(2, "0")}`,
    virtual: true,
    name: `${MONTHS[month]} ${year}`,
    month,
    year,
    days: [],
    weekConcepts: [],
    dayLabels: {},
    campaign: "",
    offers: "",
    promoCode: "",
    opciones: {},
  };
}

export const esVirtual = (cal) => Boolean(cal?.virtual);

/** El mes que está `delta` meses más allá. */
export function mesMas({ year, month }, delta) {
  const t = year * 12 + month + delta;
  return { year: Math.floor(t / 12), month: ((t % 12) + 12) % 12 };
}

/** «2026-10-05» → { year: 2026, month: 9 }. */
export function mesDeFecha(fecha) {
  const [a, m] = String(fecha ?? "").split("-").map(Number);
  return Number.isInteger(a) && Number.isInteger(m) ? { year: a, month: m - 1 } : null;
}

export const mismoMes = (a, b) => Boolean(a && b) && a.year === b.year && a.month === b.month;

const vacio = (v) => v == null || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);

/**
 * Lo escrito sobre un mes VACÍO (el virtual), llevado a su cajón de
 * verdad. Si otra persona creó el mismo mes a la vez, su cajón ya puede
 * tener publicaciones: lo nuevo se AÑADE, no lo sustituye. Lo del mes
 * (concepto de las semanas, campaña, ofertas) sólo entra donde el cajón
 * no tenía nada.
 */
export function fusionarEnMes(real, cambiado) {
  const ids = new Set((real?.days ?? []).flatMap((d) => (d.posts ?? []).map((p) => p.id)));
  let cal = { ...real, days: [...(real?.days ?? [])] };
  for (const d of cambiado?.days ?? []) {
    for (const p of d.posts ?? []) {
      if (ids.has(p.id)) continue;
      ids.add(p.id);
      cal = ponerEnDia(cal, d.date, p);
    }
  }
  for (const k of ["weekConcepts", "dayLabels", "campaign", "offers", "promoCode"]) {
    if (vacio(cal[k]) && !vacio(cambiado?.[k])) cal[k] = cambiado[k];
  }
  return cal;
}

/**
 * Los días de los meses vecinos que asoman en la rejilla (la semana del
 * 29 de septiembre al 5 de octubre se ve entera): fecha → { día, calendario }.
 */
export function diasVecinos(calendarios = [], { year, month }) {
  const antes = mesMas({ year, month }, -1);
  const despues = mesMas({ year, month }, 1);
  const salida = new Map();
  for (const cal of calendarios) {
    if (!mismoMes(cal, antes) && !mismoMes(cal, despues)) continue;
    for (const d of cal.days ?? []) if (d?.posts?.length) salida.set(d.date, { dia: d, cal });
  }
  return salida;
}
