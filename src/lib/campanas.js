// ============================================================
// La campaña del mes y las de cada semana (puro)
//
// `calendar.campaign` y `calendar.weekConcepts` existían desde el asistente
// de planificar, pero sólo se veían en una línea gris sobre la rejilla y en
// un «S1:» diminuto dentro del primer día. Aquí está lo que necesita la
// pantalla para enseñarlos bien y la IA para proponerlos:
//
//   · las semanas del mes tal como las pinta la rejilla (filas de lunes a
//     domingo, recortadas al mes): la fila 1 es la semana 1 del concepto,
//     igual que `semanaDelMes()` de la lista;
//   · el pedido a la IA y la lectura de su respuesta.
// ============================================================

import { MONTHS } from "../constants";
import { fechasParaLaIA } from "./fechasEspeciales";

const dos = (n) => String(n).padStart(2, "0");
const iso = (a, m0, d) => `${a}-${dos(m0 + 1)}-${dos(d)}`;

/** Las semanas del mes (lunes a domingo, recortadas al mes): [{ numero, desde, hasta }]. */
export function semanasDelMes(year, month) {
  const ultimo = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const desfase = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // 0 = lunes
  const semanas = [];
  for (let dia = 1; dia <= ultimo;) {
    const numero = semanas.length + 1;
    const fin = Math.min(ultimo, numero === 1 ? 7 - desfase : dia + 6);
    semanas.push({ numero, desde: iso(year, month, dia), hasta: iso(year, month, fin) });
    dia = fin + 1;
  }
  return semanas;
}

/** El nombre de la campaña de una semana: el del mes guardado o, si no, el que lleven sus días. */
export function conceptoDeSemana(cal, numero) {
  const propio = (cal?.weekConcepts ?? [])[numero - 1];
  if (propio && String(propio).trim()) return String(propio).trim();
  const dia = (cal?.days ?? []).find((d) => Number(d.weekNumber) === numero && d.concept);
  return dia ? String(dia.concept).trim() : "";
}

/** Los nombres de las semanas, uno por semana del mes (vacío si no tiene). */
export function conceptosDelMes(cal) {
  return semanasDelMes(cal.year, cal.month).map((s) => conceptoDeSemana(cal, s.numero));
}

/** Lo que se le pide a la IA para nombrar la campaña del mes y las semanas. Pura. */
export function pedidoDeNombres({ contexto = "", year, month, fechas = [], ofertas = "", campana = "", semanas = [] }) {
  const lista = semanasDelMes(year, month);
  const txtFechas = fechasParaLaIA(fechas);
  return [
    ...(contexto ? [contexto, ""] : []),
    `Propón el nombre de la campaña de ${MONTHS[month]} ${year} para esta marca y el de cada una de sus ${lista.length} semanas.`,
    "",
    "Reglas:",
    "- Nombres cortos y atractivos (2 a 6 palabras), que se puedan usar como título en redes. Sin comillas, sin emojis, sin hashtags.",
    "- La campaña del mes es el paraguas; cada semana es un capítulo de esa historia, con un ángulo distinto.",
    "- Si una semana tiene una fecha especial importante para la marca, úsala. En las fechas delicadas, nada de promociones ni tono festivo.",
    "- No inventes ofertas, precios ni productos que no estén en la ficha o en las ofertas del mes.",
    ...(campana ? [`- El mes ya se llama «${campana}»: mantenlo.`] : []),
    ...(semanas.some(Boolean) ? [`- Semanas que ya tienen nombre (mantenlos): ${semanas.map((x, i) => (x ? `S${i + 1}: ${x}` : "")).filter(Boolean).join(" · ")}`] : []),
    "",
    "Semanas:",
    ...lista.map((x) => `S${x.numero}: del ${+x.desde.slice(8)} al ${+x.hasta.slice(8)}`),
    ...(txtFechas ? ["", "Fechas especiales del mes:", txtFechas] : []),
    ...(ofertas ? ["", `Ofertas del mes: ${ofertas}`] : []),
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    `{"campana":"…","semanas":[${lista.map(() => '"…"').join(",")}]}`,
  ].join("\n");
}

const limpio = (t) => String(t ?? "").replace(/^["«“\s]+|["»”\s]+$/g, "").replace(/\s+/g, " ").slice(0, 80);

/**
 * La respuesta de la IA → { campana, semanas[n] }. Lo que ya tenía nombre
 * se queda (la IA sólo rellena lo vacío). Null si no hay JSON. Pura.
 */
export function leerNombres(texto, n, { campana = "", semanas = [] } = {}) {
  const m = String(texto ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[0]); } catch { return null; }
  const propuestas = Array.isArray(d.semanas) ? d.semanas : [];
  return {
    campana: campana || limpio(d.campana),
    semanas: Array.from({ length: n }, (_, i) => semanas[i] || limpio(propuestas[i])),
  };
}
