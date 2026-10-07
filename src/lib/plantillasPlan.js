// ============================================================
// Las plantillas de plan de la agencia (puro)
//
// Qué se publica cada día de la semana según el plan que contrató el
// cliente. Tres objetivos —Centrado en ventas, Ventas y seguidores,
// Marketing 360— por tres tipos de negocio —productos, servicios, marca
// personal—: nueve plantillas de arranque que la agencia puede cambiar,
// duplicar o sustituir por las suyas, y que cada cliente puede
// PERSONALIZAR para él solo.
//
// Una plantilla dice, por día (0 = domingo), qué publicaciones van: su
// FORMATO y su TIPO de contenido (pilares.js). Un tipo vacío quiere decir
// «el del ritmo del cliente ese día» (lunes Anuncio, martes Beneficios…):
// así el ritmo y los ajustes de temporada siguen mandando, y la plantilla
// sólo añade lo que su objetivo pide (los reels virales, la comunidad).
//
// Dónde vive cada cosa:
//   · las de arranque, aquí (`PLANTILLAS_BASE`);
//   · lo que la agencia cambia o crea, en `plantillas_plan` (D1). Una
//     guardada con el id de una de arranque la SUSTITUYE; borrarla la
//     restaura;
//   · la del cliente, en `clients.plan_contenido`: { plantilla, personalizada }.
//
// Lo usan «Planificar mes» (precargado con la del cliente), la ficha del
// cliente, Ajustes → Plantillas de plan, y lo que la IA sabe del cliente
// (`lineaDelPlan`).
// ============================================================

import { pilarDe, nombreDePilar } from "./pilares";

export const FORMATOS_PLAN = Object.freeze(["post", "reel", "carrusel", "historia", "live"]);
const NOMBRE_FORMATO = { post: "post", reel: "reel", carrusel: "carrusel", historia: "historia", live: "directo" };
const PLURAL_FORMATO = { post: "posts", reel: "reels", carrusel: "carruseles", historia: "historias", live: "directos" };

export const OBJETIVOS_PLAN = Object.freeze([
  { id: "ventas", nombre: "Centrado en ventas", ayuda: "El ritmo de la agencia: cada día un tipo de contenido que vende o prepara la venta.",
    ia: "El objetivo del plan es VENDER: cada publicación empuja a la compra o la prepara." },
  { id: "seguidores", nombre: "Ventas y seguidores", ayuda: "Lo mismo, más reels virales pensados para que los compartan y lleguen seguidores nuevos.",
    ia: "El plan tiene dos objetivos: vender y ganar seguidores. Las publicaciones «Viral / alcance» buscan que las compartan y no venden; las demás venden." },
  { id: "360", nombre: "Marketing 360", ayuda: "Más intensivo: ventas, tres reels virales por semana y contenido de comunidad (equipo, proceso, clientes).",
    ia: "Plan de presencia completa: vender, crecer (las virales) y construir confianza y comunidad (detrás de cámaras, equipo, clientes reales)." },
]);

export const NEGOCIOS_PLAN = Object.freeze([
  { id: "productos", nombre: "Productos" },
  { id: "servicios", nombre: "Servicios" },
  { id: "marca", nombre: "Marca personal" },
]);

export const MAX_POR_DIA = 4;
export const MAX_PLANTILLAS = 40;

const objetivoDe = (id) => OBJETIVOS_PLAN.find((o) => o.id === id) ?? null;
const negocioDe = (id) => NEGOCIOS_PLAN.find((n) => n.id === id) ?? null;

/** El formato del día del ritmo, según el negocio (lunes a sábado). */
const FORMATO_DEL_RITMO = {
  productos: { 1: "post", 2: "carrusel", 3: "reel", 4: "carrusel", 5: "reel", 6: "post" },
  servicios: { 1: "post", 2: "carrusel", 3: "reel", 4: "carrusel", 5: "reel", 6: "carrusel" },
  marca: { 1: "reel", 2: "carrusel", 3: "reel", 4: "reel", 5: "carrusel", 6: "reel" },
};
/** Lo que cada objetivo AÑADE al ritmo: día → publicaciones de más. */
const EXTRAS = {
  ventas: () => ({}),
  seguidores: () => ({ 2: [{ format: "reel", pilar: "viral" }], 4: [{ format: "reel", pilar: "viral" }] }),
  360: (negocio) => ({
    1: [{ format: "reel", pilar: "viral" }],
    3: [{ format: "reel", pilar: "viral" }, { format: negocio === "marca" ? "reel" : "carrusel", pilar: "comunidad" }],
    5: [{ format: "reel", pilar: "viral" }],
    6: [{ format: negocio === "marca" ? "reel" : "post", pilar: "comunidad" }],
  }),
};

function plantillaBase(objetivo, negocio) {
  const extras = EXTRAS[objetivo.id](negocio.id);
  const dias = { 0: [] };
  for (let dow = 1; dow <= 6; dow++) dias[dow] = [{ format: FORMATO_DEL_RITMO[negocio.id][dow], pilar: "" }, ...(extras[dow] ?? [])];
  return { id: `${objetivo.id}-${negocio.id}`, nombre: `${objetivo.nombre} · ${negocio.nombre}`, objetivo: objetivo.id, negocio: negocio.id, dias };
}

/** Las nueve de arranque (3 objetivos × 3 negocios). */
export const PLANTILLAS_BASE = Object.freeze(
  OBJETIVOS_PLAN.flatMap((o) => NEGOCIOS_PLAN.map((n) => Object.freeze(plantillaBase(o, n)))),
);
const IDS_BASE = new Set(PLANTILLAS_BASE.map((p) => p.id));
export const esDeArranque = (id) => IDS_BASE.has(id);

const ID = /^[\w-]{1,60}$/;

/** Una publicación de la plantilla, limpia. Null si el formato no existe. */
function limpiarHueco(h) {
  const format = FORMATOS_PLAN.includes(h?.format) ? h.format : null;
  if (!format) return null;
  return { format, pilar: pilarDe(h?.pilar) ? h.pilar : "" };
}

/** Una plantilla, limpia. Null si no tiene id o nombre. Pura. */
export function limpiarPlantilla(t) {
  const id = ID.test(String(t?.id ?? "")) ? String(t.id) : null;
  const nombre = String(t?.nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!id || !nombre) return null;
  const dias = {};
  for (let dow = 0; dow < 7; dow++) {
    const lista = t?.dias?.[dow] ?? t?.dias?.[String(dow)];
    dias[dow] = (Array.isArray(lista) ? lista : []).map(limpiarHueco).filter(Boolean).slice(0, MAX_POR_DIA);
  }
  return {
    id,
    nombre,
    objetivo: objetivoDe(t?.objetivo) ? t.objetivo : "ventas",
    negocio: negocioDe(t?.negocio) ? t.negocio : "productos",
    dias,
  };
}

/**
 * Las plantillas que ve la agencia: las de arranque (sustituidas por la versión guardada si la hay) y luego las
 * suyas, por nombre. Cada una dice si es de arranque y si se cambió. Pura.
 * @param guardadas  las filas de `plantillas_plan` ya leídas: [{ id, ...plantilla }].
 */
export function plantillasDisponibles(guardadas = []) {
  const porId = new Map();
  for (const g of Array.isArray(guardadas) ? guardadas : []) {
    const limpia = limpiarPlantilla(g);
    if (limpia) porId.set(limpia.id, limpia);
  }
  const base = PLANTILLAS_BASE.map((b) => (porId.has(b.id) ? { ...porId.get(b.id), base: true, editada: true } : { ...b, base: true, editada: false }));
  const propias = [...porId.values()].filter((p) => !IDS_BASE.has(p.id))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((p) => ({ ...p, base: false, editada: false }));
  return [...base, ...propias];
}

/**
 * Lo guardado en `clients.plan_contenido`, limpio: { plantilla, personalizada, linea }. `linea` es lo que la IA lee
 * del plan (`lineaDelPlan`), calculada al guardar la ficha: así lo que arma el contexto de la IA (api.js, en el
 * bundle principal) no tiene que pedir la lista de plantillas. Pura.
 */
export function limpiarPlanCliente(x) {
  const plantilla = ID.test(String(x?.plantilla ?? "")) ? String(x.plantilla) : "";
  const personalizada = x?.personalizada ? limpiarPlantilla({ ...x.personalizada, id: x.personalizada.id || "cliente" }) : null;
  const linea = String(x?.linea ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  return { plantilla, personalizada, linea };
}

/** Lo que se guarda en la ficha al elegir (o personalizar) una plantilla. Null sin plantilla. Pura. */
export function planParaGuardar({ plantilla = "", personalizada = null } = {}, lista = []) {
  const plan = limpiarPlanCliente({ plantilla, personalizada });
  const efectiva = plantillaDelCliente(plan, lista);
  if (!efectiva) return null;
  return { ...plan, linea: lineaDelPlan(efectiva) };
}

/**
 * La plantilla con la que trabaja un cliente: la personalizada si la tiene; si no, la elegida de la lista. Null si
 * no tiene ninguna (entonces «Planificar mes» trabaja como siempre). Pura.
 */
export function plantillaDelCliente(planContenido, lista = []) {
  const plan = limpiarPlanCliente(planContenido);
  const elegida = lista.find((p) => p.id === plan.plantilla) ?? null;
  if (plan.personalizada) return { ...plan.personalizada, personalizada: true, origen: elegida?.nombre ?? "" };
  return elegida;
}

/**
 * La configuración de formatos de «Planificar mes» a partir de una plantilla: día → [{ format, pilar }]. El
 * planificador la usa como el plan «Personalizado» de siempre, con el tipo de cada publicación. Pura.
 */
export function configDeFormatos(plantilla) {
  const cfg = {};
  for (let dow = 0; dow < 7; dow++) cfg[dow] = (plantilla?.dias?.[dow] ?? []).map((h) => ({ format: h.format, pilar: h.pilar || "" }));
  return cfg;
}

/** Cuántas publicaciones de cada formato y de cada tipo «extra» lleva por semana. Pura. */
export function conteoSemanal(plantilla) {
  const formatos = {};
  const tipos = {};
  let total = 0;
  for (let dow = 0; dow < 7; dow++) {
    for (const h of plantilla?.dias?.[dow] ?? []) {
      total++;
      formatos[h.format] = (formatos[h.format] ?? 0) + 1;
      if (h.pilar) tipos[h.pilar] = (tipos[h.pilar] ?? 0) + 1;
    }
  }
  return { total, formatos, tipos };
}

/** «11 por semana · 6 reels, 3 carruseles, 2 posts · 3 Viral / alcance, 2 Comunidad». Pura. */
export function resumenPlantilla(plantilla) {
  const { total, formatos, tipos } = conteoSemanal(plantilla);
  if (!total) return "Sin publicaciones";
  const f = Object.entries(formatos).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${n === 1 ? NOMBRE_FORMATO[k] : PLURAL_FORMATO[k]}`);
  const t = Object.entries(tipos).map(([k, n]) => `${n} ${nombreDePilar(k)}`);
  return [`${total} por semana`, f.join(", "), t.join(", ")].filter(Boolean).join(" · ");
}

/** Lo que la IA tiene que saber del plan del cliente (una línea). Vacío sin plan. Pura. */
export function lineaDelPlan(plantilla) {
  if (!plantilla) return "";
  const o = objetivoDe(plantilla.objetivo);
  const n = negocioDe(plantilla.negocio);
  return `PLAN DE CONTENIDO: ${o?.nombre ?? plantilla.nombre}${n ? ` (${n.nombre.toLowerCase()})` : ""} — ${o?.ia ?? ""} ${resumenPlantilla(plantilla)}.`.replace(/\s+/g, " ").trim();
}

/** Una copia editable de una plantilla con otro id y nombre (para «Duplicar» o «Personalizar»). Pura. */
export function copiaDePlantilla(plantilla, { id, nombre }) {
  return limpiarPlantilla({ ...plantilla, id, nombre: nombre || `${plantilla.nombre} (copia)` });
}

/** Un id nuevo para una plantilla propia: «mi-plan», «mi-plan-2»… que no choque con ninguno. Pura. */
export function idNuevo(nombre, usados = []) {
  const base = `p-${String(nombre ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "plantilla"}`;
  const ya = new Set(usados);
  let id = base;
  for (let i = 2; ya.has(id) || IDS_BASE.has(id); i++) id = `${base}-${i}`;
  return id;
}
