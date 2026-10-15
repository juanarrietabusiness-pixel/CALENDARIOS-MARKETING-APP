// ============================================================
// El lote del MES completo (puro)
//
// Lo que ya camina en el calendario, en una tanda del Estudio: se escoge el
// mes y qué días de la semana se publica, y cada día toma su tipo de
// contenido del RITMO del cliente (lunes Anuncio, martes Beneficios…), con
// los ajustes de temporada de sus fechas especiales (`sugerenciasDeTemporada`:
// sin promociones en un día delicado, promoción en una fecha comercial). La
// MATRIZ del mes (`asignarMatriz`) le da a cada uno su producto, su nivel de
// consciencia, su deseo y su perfil, rotando como en «Planificar mes».
//
// Lo demás —la forma de cada pieza, el pedido a la IA, la lectura y la
// publicación— es lo de toda la producción en lote (loteAnuncios.js).
//
// Lo usan la pantalla (EstudioLote.jsx) y el Worker (worker/lib/estudio/loteMes.js).
// ============================================================

import { ritmoDelMes, sugerenciasDeTemporada, asignarMatriz } from "./pilares.js";
import { darForma } from "./loteAnuncios.js";

export const MAX_MES = 31;
/** Lunes primero, como la rejilla del calendario. [día de la semana (0 = domingo), nombre corto]. */
export const DIAS_LOTE = Object.freeze([[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [0, "Dom"]]);

const dos = (n) => String(n).padStart(2, "0");
const diaDeSemana = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay();

/**
 * Los días del lote → [{ fecha, pilar, cambio? }]: los del mes cuyo día de la semana esté en `dias`, con su tipo del
 * ritmo y los cambios de temporada aplicados (`cambio`: por qué). Los días sin tipo (el domingo libre) no entran, ni
 * los anteriores a `desde` (hoy, si es el mes en curso). Pura.
 */
export function diasDelLote({ year, month, ritmo = null, fechas = [], dias = [], desde = "" }) {
  const cambios = sugerenciasDeTemporada({ year, month, ritmo, fechas });
  const porFecha = ritmoDelMes(year, month, ritmo, cambios);
  const motivos = new Map(cambios.map((c) => [c.fecha, c.motivo]));
  const quiere = new Set((dias ?? []).map(Number));
  return Object.entries(porFecha)
    .filter(([fecha, pilar]) => pilar && quiere.has(diaDeSemana(fecha)) && (!desde || fecha >= desde))
    .slice(0, MAX_MES)
    .map(([fecha, pilar]) => ({ fecha, pilar, ...(motivos.has(fecha) ? { cambio: motivos.get(fecha) } : {}) }));
}

/** Los días de la semana que tienen tipo en el ritmo: los que se marcan solos. Pura. */
export function diasConTipo(ritmo, year, month) {
  const porFecha = ritmoDelMes(year, month, ritmo);
  return DIAS_LOTE.map(([d]) => d).filter((d) => Object.entries(porFecha).some(([f, p]) => p && diaDeSemana(f) === d));
}

/**
 * El plan: la matriz del mes (producto, nivel, deseo, perfil, la maleta que toca) y la forma de cada pieza
 * (`darForma`: si el producto se ve, composición, fondo, gancho y dónde va el texto). `productos`: los del plan
 * (`productosParaPlan`); `orden`: las composiciones que funcionan con este cliente. Pura.
 */
export function planDelMes(dias, { productos = [], deseos = [], perfiles = [], semilla = 0, formato = "post", orden = null } = {}) {
  const matriz = asignarMatriz(dias.map((d) => ({ fecha: d.fecha, pilar: d.pilar, ...(d.cambio ? { cambio: d.cambio } : {}) })), { productos, deseos, perfiles })
    .map((p) => ({ ...p, tipo: p.pilar }));
  return darForma(matriz, { productos, semilla, formato, orden });
}

/** «Lote octubre 2026». Pura. */
export const carpetaDelMes = (year, month) =>
  `Lote ${new Date(Date.UTC(year, month, 15)).toLocaleDateString("es-PA", { month: "long", year: "numeric", timeZone: "UTC" })}`;

/** «lun 12 oct». Pura. */
export const fechaCortaLote = (fecha) => new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-PA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** El año y el mes (0–11) de una «AAAA-MM». */
export const mesDe = (texto) => {
  const [y, m] = String(texto ?? "").split("-").map(Number);
  return Number.isInteger(y) && m >= 1 && m <= 12 ? { year: y, month: m - 1 } : null;
};
export const textoMes = (year, month) => `${year}-${dos(month + 1)}`;

/**
 * Los días de un mes («AAAA-MM») que ya tienen alguna publicación en el calendario del cliente: el lote del mes los
 * SALTA (`omitir` en el servidor). Lo que ya hay se diseña con «Diseñar las que ya hay» del calendario. Pura.
 */
export function diasConPublicacion(calendarios = [], mes = "") {
  const m = mesDe(mes);
  if (!m) return [];
  const fechas = new Set();
  for (const cal of calendarios ?? []) {
    for (const d of cal?.days ?? []) {
      if (String(d?.date ?? "").startsWith(`${mes}-`) && (d.posts ?? []).length) fechas.add(d.date);
    }
  }
  return [...fechas].sort();
}

/** Los formatos del plan que el lote sabe hacer (un directo no se diseña). */
const FORMATO_DE_PLAN = Object.freeze({ post: "post", historia: "historia", carrusel: "carrusel", reel: "reel" });
/** Las casillas de un mes como mucho (cuatro por día). */
export const MAX_CASILLAS_MES = 124;

/**
 * El mes con la PLANTILLA de plan del cliente (`formatos`: { día de la semana → [{ format, pilar }] }, de
 * `configDeFormatos`): una casilla por cada publicación de cada día escogido, con su formato y su tipo (el de la
 * plantilla o, si va vacío, el del ritmo ese día, con los ajustes de temporada). Sin los anteriores a `desde` ni las
 * fechas de `omitir` (ya tienen publicación). → [{ clave: "fecha|i", fecha, formato, pilar, cambio? }]. Pura.
 */
export function casillasConPlantilla({ year, month, ritmo = null, fechas = [], formatos = {}, dias = [], desde = "", omitir = [] }) {
  const delRitmo = new Map(diasDelLote({ year, month, ritmo, fechas, dias: [0, 1, 2, 3, 4, 5, 6] }).map((d) => [d.fecha, d]));
  const quiere = new Set((dias ?? []).map(Number));
  const fuera = new Set(omitir ?? []);
  const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const casillas = [];
  for (let dia = 1; dia <= total; dia++) {
    const fecha = `${year}-${dos(month + 1)}-${dos(dia)}`;
    const dow = diaDeSemana(fecha);
    if (!quiere.has(dow) || (desde && fecha < desde) || fuera.has(fecha)) continue;
    (formatos?.[dow] ?? []).forEach((h, j) => {
      const formato = FORMATO_DE_PLAN[h?.format];
      if (!formato) return;
      const r = delRitmo.get(fecha);
      casillas.push({ clave: `${fecha}|${j}`, fecha, formato, pilar: h.pilar || r?.pilar || "", ...(r?.cambio && !h.pilar ? { cambio: r.cambio } : {}) });
    });
  }
  return casillas.slice(0, MAX_CASILLAS_MES);
}

/** Los días de la semana que tienen algo en la plantilla: los que se marcan solos con ella. Pura. */
export const diasConPlantilla = (formatos = {}) => DIAS_LOTE.map(([d]) => d).filter((d) => (formatos?.[d] ?? []).some((h) => FORMATO_DE_PLAN[h?.format]));
