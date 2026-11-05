// ============================================================
// El plan semanal de una empresa (puro)
//
// La barra de encima del mes («Lun · Anuncio · Post · 9:00 a. m.») enseña y
// edita lo que se publica cada día de la semana en ESA empresa, fijo todos
// los meses: lo leen el lote del Estudio, «Planificar mes», el asistente del
// mes y la IA.
//
// EL PLAN SEMANAL ÚNICO (fase 6): formato, tipo, HORA y NOTA de cada día en
// un solo sitio, `clients.plan_semanal` (0066), con un solo editor
// (calendario/PlanSemanal.jsx: la barra, el asistente del mes y la ficha).
// Antes vivía en cinco: la copia de la plantilla del cliente, el ritmo de la
// ficha, la plantilla elegida, las notas de los días y los `dayLabels` del mes.
//   · LEER: `semanaDelCliente`, `notasDelCliente`, `ritmoDelCliente` y
//     `plantillaDeLaSemana` miran primero `planSemanal`; sin él, lo de antes
//     (plantilla + ritmo + `notas_semana`), sin migrar nada a la fuerza.
//   · ESCRIBIR: `planSemanalParaGuardar` da el formato nuevo Y las columnas
//     de antes DERIVADAS de él (`plan_contenido` con su línea para la IA,
//     `ritmo_contenido`, `notas_semana`), que siguen leyendo api.js y una
//     ficha abierta desde antes. Lo escribe SÓLO `PUT /api/clientes/<id>/
//     plan-semanal`: `clientToRow` no lleva la columna nueva.
//
// La convención de la copia de antes se conserva al derivar: la PRIMERA
// publicación de cada día va con el tipo vacío = «el del ritmo», y su tipo se
// guarda en el ritmo; así la temporada (un día delicado deja de vender) sigue
// ajustándola. En el plan único, en cambio, cada publicación lleva su tipo.
// Sólo tipos de la agencia (`PILARES`). «UGC · guion para grabar» es un reel
// que graba una persona (`rostro: true`).
// ============================================================

import {
  limpiarPlanCliente, plantillaDelCliente, planParaGuardar, lineaDelPlan, MAX_POR_DIA, FORMATOS_PLAN, HORA_PLAN, OBJETIVOS_PLAN,
  NEGOCIOS_PLAN,
} from "./plantillasPlan.js";
import { limpiarRitmo, idDePilar, pilarDe, RITMO_POR_DEFECTO } from "./pilares.js";
import { limpiarNotasSemana } from "./notasSemana.js";

const texto = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Lo que se escoge como formato en la barra: los del plan y el UGC (un reel que graba una persona con su guion). */
export const FORMATOS_SEMANA = Object.freeze([
  { valor: "post", nombre: "Post" },
  { valor: "carrusel", nombre: "Carrusel" },
  { valor: "reel", nombre: "Reel" },
  { valor: "rostro", nombre: "UGC · guion para grabar" },
  { valor: "historia", nombre: "Historia" },
  { valor: "live", nombre: "Directo" },
]);
const NOMBRE_FORMATO = Object.fromEntries(FORMATOS_SEMANA.map((f) => [f.valor, f.nombre]));
NOMBRE_FORMATO.rostro = "UGC";

/** Cómo se llama cada tipo en la barra, corto (cabe en la celda de un día). */
const CORTO = { anuncio: "Anuncio", beneficios: "Beneficios", servicios: "Productos", educativo: "Educativo", diferenciador: "Diferenciador", maletas: "7 maletas", humano: "Humano" };
export const nombreCortoDeTipo = (id) => CORTO[idDePilar(id)] ?? "";

/** El valor del selector de formato de una publicación del plan («rostro» para un UGC). Pura. */
export const valorDeFormato = (h) => (h?.format === "reel" && h?.rostro ? "rostro" : h?.format ?? "post");
/** Del valor del selector a la publicación del plan. Pura. */
export const conFormato = (h, valor) => {
  const resto = { ...(h ?? {}) };
  delete resto.rostro;
  return valor === "rostro" ? { ...resto, format: "reel", rostro: true } : { ...resto, format: valor };
};
/** «Post», «UGC»… Pura. */
export const nombreDeFormato = (h) => NOMBRE_FORMATO[valorDeFormato(h)] ?? "";

/** «09:00» si es una hora del plan; si no, "". Pura. */
export const limpiarHoraPlan = (h) => (HORA_PLAN.test(String(h ?? "")) ? String(h) : "");

/** «9:00 a. m.», «3:30 p. m.»: la hora del plan como se lee. "" sin hora. Pura. */
export function horaCorta(h) {
  const v = limpiarHoraPlan(h);
  if (!v) return "";
  const [hh, mm] = v.split(":").map(Number);
  return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "a. m." : "p. m."}`;
}

/** Una publicación de la semana, limpia: { format, pilar, rostro?, hora? }. Null sin formato o sin tipo de la agencia. */
function limpiarPub(h) {
  const format = FORMATOS_PLAN.includes(h?.format) ? h.format : null;
  const pilar = idDePilar(h?.pilar);
  if (!format || !pilarDe(pilar)) return null;
  const hora = limpiarHoraPlan(h?.hora);
  return { format, pilar, ...(format === "reel" && h?.rostro === true ? { rostro: true } : {}), ...(hora ? { hora } : {}) };
}

/**
 * `clients.plan_semanal`, limpio: { v: 1, base, nombre, objetivo, negocio, dias, notas, linea } o null. `dias` null es
 * «el estándar de la agencia» (la plantilla `base` o el ritmo de siempre); con `dias`, la semana PROPIA de la empresa,
 * cada publicación con su tipo escrito y, si la tiene, su hora. Pura (también la usa el Worker).
 */
export function limpiarPlanSemanal(x) {
  if (!x || typeof x !== "object" || Number(x.v) !== 1) return null;
  let dias = null;
  if (x.dias && typeof x.dias === "object") {
    dias = {};
    for (let dow = 0; dow < 7; dow++) {
      const l = x.dias[dow] ?? x.dias[String(dow)];
      dias[dow] = (Array.isArray(l) ? l : []).map(limpiarPub).filter(Boolean).slice(0, MAX_POR_DIA);
    }
  }
  return {
    v: 1,
    base: /^[\w-]{1,60}$/.test(String(x.base ?? "")) ? String(x.base) : "",
    nombre: texto(x.nombre, 60),
    objetivo: OBJETIVOS_PLAN.some((o) => o.id === x.objetivo) ? x.objetivo : "ventas",
    negocio: NEGOCIOS_PLAN.some((n) => n.id === x.negocio) ? x.negocio : "productos",
    dias,
    notas: limpiarNotasSemana(x.notas),
    linea: texto(x.linea, 400),
  };
}

/** El ritmo (dow → tipo) de una semana propia: el tipo de la PRIMERA publicación de cada día. Pura. */
const ritmoDeDias = (dias) => Object.fromEntries(Array.from({ length: 7 }, (_, dow) => [dow, dias?.[dow]?.[0]?.pilar ?? ""]));

/** Las notas fijas de los días de una empresa (del plan único o, si no lo tiene, de su columna de antes). Pura. */
export function notasDelCliente(cliente) {
  const ps = limpiarPlanSemanal(cliente?.planSemanal);
  return ps ? ps.notas : limpiarNotasSemana(cliente?.notasSemana);
}

/** El ritmo de una empresa (dow → tipo): el de su semana propia, o el guardado de antes, o el de la agencia. Pura. */
export function ritmoDelCliente(cliente) {
  const ps = limpiarPlanSemanal(cliente?.planSemanal);
  if (ps?.dias) return ritmoDeDias(ps.dias);
  return limpiarRitmo(ps ? null : cliente?.ritmoContenido);
}

/**
 * El plan de la empresa como PLANTILLA (lo que leen «Planificar mes», el lote del mes y `configDeFormatos`), con la
 * convención de siempre: la primera publicación de cada día con el tipo vacío = «el del ritmo» (así la temporada la
 * sigue ajustando). Null si la empresa no tiene formatos fijos. Pura.
 */
export function plantillaDeLaSemana(cliente, lista = []) {
  const ps = limpiarPlanSemanal(cliente?.planSemanal);
  if (!ps?.dias) return plantillaDelCliente(ps ? { plantilla: ps.base } : cliente?.planContenido, lista);
  const base = lista.find((p) => p.id === ps.base);
  return {
    id: "cliente", nombre: ps.nombre || `Plan de ${cliente?.name || "este cliente"}`, objetivo: ps.objetivo, negocio: ps.negocio,
    personalizada: true, origen: base?.nombre ?? "",
    dias: Object.fromEntries(Object.entries(ps.dias).map(([dow, l]) => [dow, l.map((h, i) => ({ ...h, pilar: i === 0 ? "" : h.pilar }))])),
  };
}

/**
 * La semana de una empresa: { dias: { 0–6 → [{ format, pilar, rostro?, hora? }] }, conPlan, personalizada }. El tipo es
 * el EFECTIVO (el escrito o, si va vacío, el del ritmo ese día). Sin formatos fijos, cada día con tipo en el ritmo lleva
 * una publicación SIN formato (`format: null`): es lo que hace hoy el lote del mes sin plan (el formato se escoge allí).
 * `lista`: las plantillas de la agencia (para resolver la elegida). Pura.
 */
export function semanaDelCliente(cliente, lista = []) {
  const ps = limpiarPlanSemanal(cliente?.planSemanal);
  if (ps?.dias) {
    return { dias: Object.fromEntries(Object.entries(ps.dias).map(([dow, l]) => [dow, l.map((h) => ({ ...h }))])), conPlan: true, personalizada: true };
  }
  // Sin semana propia: «el estándar» del plan único (su plantilla base y el ritmo de la agencia) o lo de antes.
  const ritmo = limpiarRitmo(ps ? null : cliente?.ritmoContenido);
  const plantilla = plantillaDelCliente(ps ? { plantilla: ps.base } : cliente?.planContenido, lista);
  const dias = {};
  for (let dow = 0; dow < 7; dow++) {
    dias[dow] = plantilla
      ? (plantilla.dias?.[dow] ?? []).map((h) => ({
        format: h.format, pilar: idDePilar(h.pilar) || ritmo[dow] || "", ...(h.format === "reel" && h.rostro ? { rostro: true } : {}),
        ...(limpiarHoraPlan(h.hora) ? { hora: h.hora } : {}),
      }))
      : ritmo[dow] ? [{ format: null, pilar: ritmo[dow] }] : [];
  }
  return { dias, conPlan: Boolean(plantilla), personalizada: Boolean(plantilla?.personalizada) };
}

/**
 * Lo que dice la barra de los días: dow → [«Productos · Carrusel · 9:00 a. m.», «Humano · UGC»]. La barra va en el
 * arranque y esto no: CalendarView lo pide en diferido y la rejilla sólo pinta texto. Pura.
 */
export function lineasDeLaSemana(cliente, lista = []) {
  const { dias } = semanaDelCliente(cliente, lista);
  return Object.fromEntries(Object.entries(dias).map(([dow, l]) => [dow, l.map((h) => [nombreCortoDeTipo(h.pilar), h.format ? nombreDeFormato(h) : "", horaCorta(h.hora)].filter(Boolean).join(" · "))]));
}

/**
 * La hora del plan para una publicación de esa fecha y ese formato: la de la publicación del plan de ese día con el
 * mismo formato (la primera libre de las que coinciden, por su orden en el día), o la primera hora del día. "" si el
 * plan no la dice. `indice`: el lugar de la publicación entre las de su formato ese día. Pura.
 */
export function horaDelPlan(semana, fecha, format, indice = 0) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha ?? ""));
  if (!m) return "";
  const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  const del = semana?.dias?.[dow] ?? [];
  const mismas = del.filter((h) => h.format === format && limpiarHoraPlan(h.hora));
  return limpiarHoraPlan((mismas[indice] ?? mismas[0] ?? del.find((h) => limpiarHoraPlan(h.hora)))?.hora);
}

/**
 * Lo que se guarda en la empresa al editar la semana: { planContenido, ritmoContenido } (las columnas de antes).
 * `dias`: la semana editada (dow → [{ format, pilar, rostro?, hora? }], con el tipo de cada publicación escrito). La
 * plantilla elegida se conserva (para «Volver al estándar»). Una publicación sin formato toma «post» (lo que haría el
 * lote sin plan). Pura.
 */
export function semanaParaGuardar(cliente, lista, dias, nombreCliente = "") {
  const plan = limpiarPlanCliente(cliente?.planContenido);
  const base = plantillaDelCliente(plan, lista);
  const ritmo = {};
  const nuevos = {};
  for (let dow = 0; dow < 7; dow++) {
    const l = (dias?.[dow] ?? []).filter((h) => pilarDe(h?.pilar)).slice(0, MAX_POR_DIA);
    ritmo[dow] = l[0] ? idDePilar(l[0].pilar) : "";
    nuevos[dow] = l.map((h, i) => {
      const format = h.format || "post";
      const hora = limpiarHoraPlan(h.hora);
      return { format, pilar: i === 0 ? "" : idDePilar(h.pilar), ...(format === "reel" && h.rostro ? { rostro: true } : {}), ...(hora ? { hora } : {}) };
    });
  }
  const nombre = nombreCliente || cliente?.name || "este cliente";
  const personalizada = {
    id: "cliente",
    nombre: (base?.personalizada ? base.nombre : base ? `${base.nombre} · ${nombre}` : `Plan de ${nombre}`).slice(0, 60),
    objetivo: base?.objetivo ?? "ventas",
    negocio: base?.negocio ?? "productos",
    dias: nuevos,
  };
  return { planContenido: planParaGuardar({ plantilla: plan.plantilla, personalizada }, lista), ritmoContenido: ritmo };
}

/**
 * Lo que se guarda al editar la semana en su editor (barra, asistente del mes o ficha): el plan ÚNICO
 * (`planSemanal`, el formato nuevo) y las columnas de antes DERIVADAS de él, que siguen leyendo la IA (`linea`) y una
 * ficha abierta desde antes. `dias`: dow → [{ format, pilar, rostro?, hora? }] con el tipo escrito; `notas`: dow →
 * texto; `base`: la plantilla de la agencia de la que sale (para «Volver al estándar»; sin pasarla, la de antes). Pura.
 */
export function planSemanalParaGuardar(cliente, lista = [], { dias, notas = null, base, nombreCliente = "" } = {}) {
  const previo = limpiarPlanSemanal(cliente?.planSemanal);
  const plan = limpiarPlanCliente(cliente?.planContenido);
  const laBase = base ?? (previo ? previo.base : plan.plantilla);
  // Con la plantilla nueva como base y sin la copia de antes: el nombre y el objetivo salen de la base.
  const { planContenido, ritmoContenido } = semanaParaGuardar({ ...cliente, planContenido: { plantilla: laBase, personalizada: base === undefined ? plan.personalizada : null } }, lista, dias, nombreCliente);
  const notasLimpias = limpiarNotasSemana(notas);
  const p = planContenido?.personalizada;
  const propios = {};
  for (let dow = 0; dow < 7; dow++) {
    // En la copia la primera va con el tipo vacío (es el del ritmo); en el plan único, escrito.
    propios[dow] = (p?.dias?.[dow] ?? []).map((h, i) => ({ ...h, pilar: i === 0 ? ritmoContenido[dow] : h.pilar }));
  }
  return {
    planContenido, ritmoContenido, notasSemana: notasLimpias,
    planSemanal: limpiarPlanSemanal({
      v: 1, base: laBase, nombre: p?.nombre ?? "", objetivo: p?.objetivo, negocio: p?.negocio, dias: propios, notas: notasLimpias,
      linea: planContenido?.linea ?? "",
    }),
  };
}

/**
 * «Volver al estándar de la agencia»: sin semana propia (la plantilla elegida, si la había, y el ritmo de la agencia).
 * Las notas fijas de los días se QUEDAN: son el tema de cada día, no los formatos. Pura.
 */
export function semanaEstandar(cliente, lista = []) {
  const ps = limpiarPlanSemanal(cliente?.planSemanal);
  const plan = limpiarPlanCliente(cliente?.planContenido);
  const base = ps ? ps.base : plan.plantilla;
  const planContenido = base ? planParaGuardar({ plantilla: base, personalizada: null }, lista) : null;
  const notas = notasDelCliente(cliente);
  const elegida = lista.find((p) => p.id === base);
  return {
    planContenido, ritmoContenido: null, notasSemana: notas,
    planSemanal: limpiarPlanSemanal({
      v: 1, base, nombre: "", objetivo: elegida?.objetivo, negocio: elegida?.negocio, dias: null, notas, linea: planContenido?.linea ?? (elegida ? lineaDelPlan(elegida) : ""),
    }),
  };
}

/** ¿La empresa tiene su propia semana (copia o ritmo cambiado)? Para ofrecer «Volver al estándar». Pura. */
export function semanaPropia(cliente) {
  const ps = limpiarPlanSemanal(cliente?.planSemanal);
  if (ps) return Boolean(ps.dias);
  const plan = limpiarPlanCliente(cliente?.planContenido);
  const ritmo = limpiarRitmo(cliente?.ritmoContenido);
  return Boolean(plan.personalizada) || Object.keys(RITMO_POR_DEFECTO).some((d) => ritmo[d] !== RITMO_POR_DEFECTO[d]);
}

/**
 * El plan único de la empresa entero, para quien lo enseña o lo lee de una vez (el asistente del mes): la semana, las
 * notas, el ritmo y la plantilla derivada. Pura.
 */
export function planDeLaEmpresa(cliente, lista = []) {
  return {
    semana: semanaDelCliente(cliente, lista),
    notas: notasDelCliente(cliente) ?? {},
    ritmo: ritmoDelCliente(cliente),
    plantilla: plantillaDeLaSemana(cliente, lista),
    propia: semanaPropia(cliente),
  };
}

/**
 * Lo mismo leído de una FILA de D1 (el Worker): { ritmo, notas }. Con el plan único, el ritmo es el tipo de la primera
 * publicación de cada día; sin él, las columnas de antes. Pura.
 */
export function planSemanalDeFila(fila) {
  const leer = (v) => {
    if (v == null || typeof v === "object") return v ?? null;
    try { return JSON.parse(v); } catch { return null; }
  };
  const cliente = { planSemanal: leer(fila?.plan_semanal), notasSemana: leer(fila?.notas_semana), ritmoContenido: leer(fila?.ritmo_contenido) };
  return { ritmo: ritmoDelCliente(cliente), notas: notasDelCliente(cliente) };
}
