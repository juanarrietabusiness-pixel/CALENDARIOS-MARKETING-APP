// ============================================================
// Lo del Manual de campañas que lee EL PLAN DE CAMPAÑAS (puro y pequeño)
//
// El reparto del presupuesto por etapa del ciclo de ventas (60/20/10/10 por defecto, decisión 1 de
// docs/propuesta-curso-campanas.md) y cuántos anuncios lleva cada conjunto (de 4 a 6, 4 por defecto: decisión 12).
// Vive aparte de estratega.js a propósito: `limpiarManual` lo llama en una línea (`...limpiarManualCiclo(m)`) y el plan
// (lib/planCiclo.js) importa estratega.js por la nomenclatura; con esto en planCiclo.js serían dos archivos que se
// importan el uno al otro.
// ============================================================

import { ETAPAS_CICLO } from "./cicloVentas.js";

/** El reparto de la casa: el de cada etapa del ciclo de ventas (cicloVentas.js). */
export const REPARTO_POR_DEFECTO = Object.freeze(Object.fromEntries(ETAPAS_CICLO.map((e) => [e.id, e.reparto])));
export const MIN_ANUNCIOS_CONJUNTO = 4;
export const MAX_ANUNCIOS_CONJUNTO = 6;
export const ANUNCIOS_POR_DEFECTO = 4;

const entero = (v) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? Math.round(n) : NaN;
};

/** Cuánto suma un reparto (lo que no es número cuenta 0). Pura. */
export const sumaDelReparto = (r) => ETAPAS_CICLO.reduce((s, e) => s + Math.max(0, entero(r?.[e.id]) || 0), 0);

/**
 * El reparto guardado, limpio: un % entero por etapa que SUMA 100 y con presentación por encima de 0 (es la que
 * alimenta a las demás). Si no cuadra, el de la casa: un reparto que suma 90 dejaría un 10 % sin campaña sin que nadie
 * lo note. La pantalla no deja guardar uno que no sume 100 (`sumaDelReparto`). Pura.
 */
export function limpiarReparto(r) {
  if (!r || typeof r !== "object") return { ...REPARTO_POR_DEFECTO };
  const salida = {};
  for (const e of ETAPAS_CICLO) {
    const n = entero(r[e.id]);
    if (!(n >= 0 && n <= 100)) return { ...REPARTO_POR_DEFECTO };
    salida[e.id] = n;
  }
  return sumaDelReparto(salida) === 100 && salida.presentacion > 0 ? salida : { ...REPARTO_POR_DEFECTO };
}

/** Cuántos anuncios por conjunto: de 4 a 6; lo que no se entiende, 4. Pura. */
export function limpiarAnunciosPorConjunto(v) {
  const n = entero(v);
  return n >= MIN_ANUNCIOS_CONJUNTO && n <= MAX_ANUNCIOS_CONJUNTO ? n : ANUNCIOS_POR_DEFECTO;
}

/** Los campos del Manual que son del plan de campañas, limpios. Los llama `limpiarManual` (lib/estratega.js). Pura. */
export function limpiarManualCiclo(m = {}) {
  return { reparto: limpiarReparto(m?.reparto), anunciosPorConjunto: limpiarAnunciosPorConjunto(m?.anunciosPorConjunto) };
}

/** Lo que el formulario del Manual no deja guardar del plan: «suma 95: tiene que sumar 100». "" si está bien. Pura. */
export function errorDelCiclo(m) {
  const suma = sumaDelReparto(m?.reparto ?? REPARTO_POR_DEFECTO);
  if (suma !== 100) return `El reparto suma ${suma} %: tiene que sumar 100.`;
  if (!(entero(m?.reparto?.presentacion ?? REPARTO_POR_DEFECTO.presentacion) > 0)) return "Presentación necesita algo del presupuesto: es la que trae gente nueva.";
  return "";
}

/**
 * El reparto de UN cliente: el suyo a mano si lo tiene y es válido (suma 100), si no el del Manual (el estándar).
 * `propio` llega de `anuncios_clientes.reparto` (texto JSON u objeto). Devuelve { reparto, aMano }. Pura.
 */
export function repartoDelCliente(manualReparto, propio) {
  let p = propio;
  if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = null; } }
  if (p && typeof p === "object" && sumaDelReparto(p) === 100 && entero(p.presentacion) > 0) {
    return { reparto: limpiarReparto(p), aMano: true };
  }
  return { reparto: limpiarReparto(manualReparto), aMano: false };
}
