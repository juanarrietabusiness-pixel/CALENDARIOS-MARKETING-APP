// ============================================================
// El plan semanal de una empresa, en la barra del calendario (puro)
//
// La barra de encima del mes («Lun · Anuncio · Post») enseña y edita lo que
// se publica cada día de la semana en ESA empresa, fijo todos los meses. No
// es un dato nuevo: son los dos que ya leen el lote del Estudio, «Planificar
// mes» y la IA —el RITMO (qué tipo toca cada día, `clients.ritmo_contenido`)
// y la plantilla de plan (qué formatos, `clients.plan_contenido`)—. Editar
// la barra escribe la copia PERSONALIZADA de la plantilla y el ritmo a la
// vez, con la misma convención que las plantillas de arranque:
//   · la PRIMERA publicación de cada día va con el tipo vacío = «el del
//     ritmo», y su tipo se guarda en el ritmo: así la temporada (un día
//     delicado deja de vender) sigue ajustándola;
//   · las demás llevan su tipo escrito.
// Sólo tipos de la agencia (`PILARES`). «Video con rostro (UGC)» es un reel
// que graba una persona (`rostro: true`).
// ============================================================

import { limpiarPlanCliente, plantillaDelCliente, planParaGuardar, MAX_POR_DIA } from "./plantillasPlan.js";
import { limpiarRitmo, idDePilar, pilarDe, RITMO_POR_DEFECTO } from "./pilares.js";

/** Lo que se escoge como formato en la barra: los del plan y el video con rostro (un reel que graba una persona). */
export const FORMATOS_SEMANA = Object.freeze([
  { valor: "post", nombre: "Post" },
  { valor: "carrusel", nombre: "Carrusel" },
  { valor: "reel", nombre: "Reel" },
  { valor: "rostro", nombre: "Video con rostro (UGC)" },
  { valor: "historia", nombre: "Historia" },
  { valor: "live", nombre: "Directo" },
]);
const NOMBRE_FORMATO = Object.fromEntries(FORMATOS_SEMANA.map((f) => [f.valor, f.nombre]));
NOMBRE_FORMATO.rostro = "Video con rostro";

/** Cómo se llama cada tipo en la barra, corto (cabe en la celda de un día). */
const CORTO = { anuncio: "Anuncio", beneficios: "Beneficios", servicios: "Productos", educativo: "Educativo", diferenciador: "Diferenciador", maletas: "7 maletas", humano: "Humano" };
export const nombreCortoDeTipo = (id) => CORTO[idDePilar(id)] ?? "";

/** El valor del selector de formato de una publicación del plan («rostro» para un reel con rostro). Pura. */
export const valorDeFormato = (h) => (h?.format === "reel" && h?.rostro ? "rostro" : h?.format ?? "post");
/** Del valor del selector a la publicación del plan. Pura. */
export const conFormato = (h, valor) => {
  const resto = { ...(h ?? {}) };
  delete resto.rostro;
  return valor === "rostro" ? { ...resto, format: "reel", rostro: true } : { ...resto, format: valor };
};
/** «Post», «Video con rostro»… Pura. */
export const nombreDeFormato = (h) => NOMBRE_FORMATO[valorDeFormato(h)] ?? "";

/**
 * La semana de una empresa: { dias: { 0–6 → [{ format, pilar, rostro? }] }, conPlan, personalizada }. El tipo es el
 * EFECTIVO (el escrito o, si va vacío, el del ritmo ese día). Sin plantilla, cada día con tipo en el ritmo lleva una
 * publicación SIN formato (`format: null`): es lo que hace hoy el lote del mes sin plan (el formato se escoge allí).
 * `lista`: las plantillas de la agencia (para resolver la elegida). Pura.
 */
export function semanaDelCliente(cliente, lista = []) {
  const ritmo = limpiarRitmo(cliente?.ritmoContenido);
  const plantilla = plantillaDelCliente(cliente?.planContenido, lista);
  const dias = {};
  for (let dow = 0; dow < 7; dow++) {
    dias[dow] = plantilla
      ? (plantilla.dias?.[dow] ?? []).map((h) => ({ format: h.format, pilar: idDePilar(h.pilar) || ritmo[dow] || "", ...(h.format === "reel" && h.rostro ? { rostro: true } : {}) }))
      : ritmo[dow] ? [{ format: null, pilar: ritmo[dow] }] : [];
  }
  return { dias, conPlan: Boolean(plantilla), personalizada: Boolean(plantilla?.personalizada) };
}

/**
 * Lo que dice la barra de los días: dow → [«Productos · Carrusel», «Humano · Video con rostro»]. La barra va en el
 * arranque y esto no: CalendarView lo pide en diferido y la rejilla sólo pinta texto. Pura.
 */
export function lineasDeLaSemana(cliente, lista = []) {
  const { dias } = semanaDelCliente(cliente, lista);
  return Object.fromEntries(Object.entries(dias).map(([dow, l]) => [dow, l.map((h) => [nombreCortoDeTipo(h.pilar), h.format ? nombreDeFormato(h) : ""].filter(Boolean).join(" · "))]));
}

/**
 * Lo que se guarda en la empresa al editar la semana en la barra: { planContenido, ritmoContenido }. `dias`: la semana
 * editada (dow → [{ format, pilar, rostro? }], con el tipo de cada publicación escrito). La plantilla elegida se
 * conserva (para «Volver al estándar»). Una publicación sin formato toma «post» (lo que haría el lote sin plan). Pura.
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
      return { format, pilar: i === 0 ? "" : idDePilar(h.pilar), ...(format === "reel" && h.rostro ? { rostro: true } : {}) };
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
 * «Volver al estándar de la agencia»: sin copia propia (la plantilla elegida, si la había) y el ritmo de la agencia.
 * Pura.
 */
export function semanaEstandar(cliente, lista = []) {
  const plan = limpiarPlanCliente(cliente?.planContenido);
  return { planContenido: plan.plantilla ? planParaGuardar({ plantilla: plan.plantilla, personalizada: null }, lista) : null, ritmoContenido: null };
}

/** ¿La empresa tiene su propia semana (copia o ritmo cambiado)? Para ofrecer «Volver al estándar». Pura. */
export function semanaPropia(cliente) {
  const plan = limpiarPlanCliente(cliente?.planContenido);
  const ritmo = limpiarRitmo(cliente?.ritmoContenido);
  return Boolean(plan.personalizada) || Object.keys(RITMO_POR_DEFECTO).some((d) => ritmo[d] !== RITMO_POR_DEFECTO[d]);
}
