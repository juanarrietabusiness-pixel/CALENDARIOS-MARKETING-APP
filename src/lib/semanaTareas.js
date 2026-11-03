// ============================================================
// Mi día por semanas: de lunes a sábado, cada día con sus empresas (puro)
//
// La agencia trabaja por días: los lunes D'CASA y ROFER, los martes Baby
// Caleb… Cada empresa tiene sus DÍAS FIJOS (`clients.dias_trabajo`, 1 =
// lunes … 6 = sábado), que son del equipo entero y se repiten cada semana
// hasta que alguien los cambie. Una columna por día; en cada una, una
// tarjeta por empresa con lo que tiene planeado ESE día arriba y lo que no
// tiene día, plegado.
//
// DÓNDE VA CADA TAREA
//
// En el día que le toca según `fechaObjetivo` (agenda.js, la misma regla que
// la lista y el contador): el plan de «Hoy»/«Mover a…», su fecha límite o su
// recurrencia. Una tarea planeada para el lunes que no se hizo SE QUEDA en el
// lunes, marcada atrasada; no salta a hoy. Sin ningún día no está atrasada
// nunca: va a «Sin día» de su empresa y a «Por agendar».
//
// Una empresa con tareas un día que no es de los suyos sale igual ese día
// (no fija): si no, la tarea no se vería. Lo del domingo va al sábado.
// ============================================================

import { fechaObjetivo, sumarDias, diaSemana, esFecha } from "./agenda.js";

/** Lo que lleva el `dataTransfer` al arrastrar una tarea (su clave, «c:<id>» o «r:<id>»). */
export const TIPO_ARRASTRE = "application/x-juancito-tarea";

export const DIAS_SEMANA = Object.freeze([
  { n: 1, corto: "Lun", largo: "Lunes", plural: "los lunes" },
  { n: 2, corto: "Mar", largo: "Martes", plural: "los martes" },
  { n: 3, corto: "Mié", largo: "Miércoles", plural: "los miércoles" },
  { n: 4, corto: "Jue", largo: "Jueves", plural: "los jueves" },
  { n: 5, corto: "Vie", largo: "Viernes", plural: "los viernes" },
  { n: 6, corto: "Sáb", largo: "Sábado", plural: "los sábados" },
]);

const hecha = (t) => t?.status === "completed" || t?.status === "done";

/** Los días fijos de una empresa, limpios: enteros del 1 al 6, sin repetir y en orden. */
export function limpiarDias(valor) {
  let v = valor;
  if (typeof v === "string") {
    try { v = JSON.parse(v); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 6))].sort((a, b) => a - b);
}

/** El lunes de la semana de `fecha` (AAAA-MM-DD). Un domingo pertenece a la semana que acaba. */
export function lunesDe(fecha) {
  return sumarDias(fecha, -((diaSemana(fecha) + 6) % 7));
}

/** El número del día de la semana para esta vista (1 lunes … 6 sábado; el domingo cuenta como sábado). */
export const numeroDeDia = (fecha) => Math.min(6, ((diaSemana(fecha) + 6) % 7) + 1);

/** «3 – 8 nov» o «28 oct – 2 nov». */
export function textoSemana(lunes) {
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const sabado = sumarDias(lunes, 5);
  const d = (f) => +f.slice(8, 10);
  const m = (f) => MESES[+f.slice(5, 7) - 1];
  return m(lunes) === m(sabado) ? `${d(lunes)} – ${d(sabado)} ${m(sabado)}` : `${d(lunes)} ${m(lunes)} – ${d(sabado)} ${m(sabado)}`;
}

const idDe = (c) => c?.dbId || c?.id;

/**
 * La semana que empieza en `lunes`, con las tareas de `tareas` (las de useTareas: las rápidas traen `_rapida` y
 * `client_id` vacío) y los días fijos de `clientes` (`diasTrabajo`).
 *
 * @returns {{
 *   dias: Array<{ n, fecha, esHoy, pasado, empresas: Array<{ clienteId, nombre, fija, items, sinDia }>, sueltas: Array }>,
 *   porAgendar: Array, deAntes: Array
 * }}
 *   · `items`: { tarea, fecha, atrasada } planeadas ese día, sin hacer primero y por su orden.
 *   · `sinDia`: las tareas de esa empresa que no tienen ningún día (las mismas en cada día en que está fija).
 *   · `sueltas`: las tareas sin empresa de ese día.
 *   · `porAgendar`: todo lo pendiente sin día, con empresa o sin ella.
 *   · `deAntes`: lo atrasado de semanas anteriores (sólo mirando la semana de hoy o una posterior): se queda en
 *     su día, pero esa semana no se está viendo.
 */
export function semanaDeTareas(tareas, clientes, lunes, hoy) {
  const nombres = new Map();
  for (const c of clientes ?? []) {
    nombres.set(c.id, c.name);
    if (c.dbId) nombres.set(c.dbId, c.name);
  }
  const domingo = sumarDias(lunes, 6);
  const dias = DIAS_SEMANA.map(({ n }) => {
    const fecha = sumarDias(lunes, n - 1);
    return { n, fecha, esHoy: fecha === hoy || (n === 6 && domingo === hoy), pasado: fecha < hoy && !(n === 6 && domingo >= hoy), empresas: [], sueltas: [] };
  });

  // Las empresas fijas de cada día, en el orden de la lista de clientes.
  const tarjeta = (dia, clienteId, fija) => {
    let e = dia.empresas.find((x) => x.clienteId === clienteId);
    if (!e) {
      e = { clienteId, nombre: nombres.get(clienteId) || "Empresa", fija, items: [], sinDia: [] };
      dia.empresas.push(e);
    }
    if (fija) e.fija = true;
    return e;
  };
  for (const c of clientes ?? []) {
    for (const n of limpiarDias(c.diasTrabajo)) tarjeta(dias[n - 1], idDe(c), true);
  }

  const porAgendar = [];
  const deAntes = [];
  const sinDiaDe = new Map();

  for (const t of tareas ?? []) {
    const fecha = fechaObjetivo(t, hoy);
    if (hecha(t)) {
      // Lo hecho se ve en su día (tachado) sólo si se planeó en esta semana: así se ve lo que se cumplió.
      const plan = esFecha(t.today_date) ? t.today_date : null;
      if (!plan || plan < lunes || plan > domingo) continue;
      const dia = dias[numeroDeDia(plan) - 1];
      const item = { tarea: t, fecha: plan, atrasada: false };
      if (t._rapida || !t.client_id) dia.sueltas.push(item);
      else tarjeta(dia, t.client_id, false).items.push(item);
      continue;
    }
    if (!fecha) {
      porAgendar.push({ tarea: t, fecha: null, atrasada: false });
      if (!t._rapida && t.client_id) {
        if (!sinDiaDe.has(t.client_id)) sinDiaDe.set(t.client_id, []);
        sinDiaDe.get(t.client_id).push({ tarea: t, fecha: null, atrasada: false });
      }
      continue;
    }
    const item = { tarea: t, fecha, atrasada: fecha < hoy };
    if (fecha < lunes) {
      if (lunes === lunesDe(hoy)) deAntes.push(item);
      continue;
    }
    if (fecha > domingo) continue;
    const dia = dias[numeroDeDia(fecha) - 1];
    if (t._rapida || !t.client_id) dia.sueltas.push(item);
    else tarjeta(dia, t.client_id, false).items.push(item);
  }

  const orden = (a, b) => Number(hecha(a.tarea)) - Number(hecha(b.tarea))
    || Number(b.atrasada) - Number(a.atrasada)
    || (a.tarea.position ?? 0) - (b.tarea.position ?? 0);
  const posCliente = new Map((clientes ?? []).map((c, i) => [idDe(c), i]));
  for (const dia of dias) {
    for (const e of dia.empresas) {
      e.items.sort(orden);
      e.sinDia = sinDiaDe.get(e.clienteId) ?? [];
    }
    // Primero las fijas (en el orden de los clientes); detrás, las que salen sólo por sus tareas.
    dia.empresas.sort((a, b) => Number(b.fija) - Number(a.fija) || (posCliente.get(a.clienteId) ?? 999) - (posCliente.get(b.clienteId) ?? 999));
    dia.sueltas.sort(orden);
  }
  deAntes.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { dias, porAgendar, deAntes };
}

/**
 * Lo que cambia al soltar una tarea en una tarjeta (o al «Agendar» con botones): la empresa y el día planeado.
 * `empresa` vacío = sin empresa. Devuelve null si no cambia nada.
 *   · `{ datos }`: un PUT normal sobre la tarea.
 *   · `{ convertir }`: una rápida que pasa a una empresa —van en tablas distintas—: se crea en la empresa y se
 *     borra la rápida.
 *   · `{ error }`: lo que no se puede (una tarea de empresa no se vuelve rápida arrastrándola).
 */
export function cambioAlSoltar(t, { empresa = "", dia = null } = {}) {
  if (!t) return null;
  const today_date = esFecha(dia) ? dia : null;
  if (t._rapida) {
    if (empresa) return { convertir: { empresa, today_date } };
    return t.today_date === today_date ? null : { datos: { today_date } };
  }
  if (!empresa) return { error: "Una tarea de una empresa no se puede dejar sin empresa: suéltala en la tarjeta de una empresa." };
  const datos = {};
  if (empresa !== t.client_id) datos.client_id = empresa;
  if ((t.today_date ?? null) !== today_date) datos.today_date = today_date;
  return Object.keys(datos).length ? { datos } : null;
}
