// ============================================================
// La PERSONALIDAD de una marca y las variantes del kit que le van (puro; decisión de la agencia, 2026-11-24)
//
// «Que el manual pida elegir según la personalidad de la marca (lujo: lento y elegante; tecnología: glitch y cortes
// secos; familiar: suave y redondeado; industrial: golpes y barridos) y que nunca copie el estilo de otro cliente.» Lo
// leen el manual del editor (manualEditor.js), guia_de_edicion (la sugerida y su combinación) y la propuesta corta.
// El catálogo de variantes, en variantesEdicion.js.
// ============================================================

import { PIEZAS_CON_VARIANTE, VARIANTES_BASE } from "./variantesEdicion.js";

/**
 * Cada personalidad, con las variantes que le van en orden de preferencia y lo que no le va. `senales`: palabras de su
 * rubro o de su tono que la delatan (para SUGERIR; quien edita decide leyendo la marca).
 */
export const PERSONALIDADES = Object.freeze({
  lujo: {
    nombre: "Lujo", como: "lento y elegante",
    senales: ["lujo", "premium", "joyer", "boutique", "alta gama", "exclusiv", "elegan", "hotel", "spa", "estética", "estetica", "inmobiliaria", "bienes raíces", "vino", "perfum", "moda"],
    variantes: { transicion: ["deslizar", "destello"], entrada: ["escala", "mascara"], subtitulos: ["limpio", "placa"], cierre: ["limpio", "circulo"], ritmo: ["pausado"], forma: ["recta", "redonda"] },
    nunca: "golpes con rebote, glitch, rayas de obra ni ritmo vivo",
  },
  tecnologia: {
    nombre: "Tecnología", como: "glitch y cortes secos",
    senales: ["tecnolog", "software", "app", "digital", "electrón", "electron", "computad", "celular", "telecom", "internet", "gamer", "robót", "inteligencia artificial", "startup"],
    variantes: { transicion: ["glitch", "destello"], entrada: ["maquina", "palabra"], subtitulos: ["palabra", "limpio"], cierre: ["banda", "limpio"], ritmo: ["vivo", "normal"], forma: ["recta"] },
    nunca: "rebotes blandos, esquinas redondas ni barridos de obra",
  },
  familiar: {
    nombre: "Familiar", como: "suave y redondeado",
    senales: ["bebé", "bebe", "niño", "nino", "infantil", "familia", "mamá", "mama", "hogar", "casa", "mueble", "colchon", "colchón", "mascota", "panader", "repost", "cocina", "comida", "restaurante", "salud", "clínica", "clinica", "escuela", "colegio"],
    variantes: { transicion: ["deslizar", "paneo"], entrada: ["palabra", "escala"], subtitulos: ["placa", "limpio"], cierre: ["circulo", "limpio"], ritmo: ["normal", "pausado"], forma: ["redonda"] },
    nunca: "glitch, cortes secos, cintas de peligro ni esquinas rectas",
  },
  industrial: {
    nombre: "Industrial", como: "golpes y barridos",
    senales: ["construc", "obra", "maquinaria", "equipo pesado", "alquiler de equipo", "industria", "transporte", "camion", "camión", "taller", "ferreter", "metal", "soldad", "logística", "logistica", "minería", "mineria", "agro"],
    variantes: { transicion: ["barrido", "zoom"], entrada: ["golpe", "subir"], subtitulos: ["clasico", "placa"], cierre: ["tarjeta", "banda"], ritmo: ["vivo", "normal"], forma: ["recta", "redonda"] },
    nunca: "escala suave, ritmo pausado ni círculos que se abren",
  },
});
export const IDS_PERSONALIDAD = Object.freeze(Object.keys(PERSONALIDADES));

/** Las piezas que más se ven: dos marcas con 3 o 4 iguales de éstas se ven iguales (lo mismo que estilosEdicion.js). */
const SE_VEN = ["transicion", "entrada", "subtitulos", "cierre"];
const MAX_IGUALES = 2;
const iguales = (a, b) => SE_VEN.filter((k) => a?.[k] && a[k] === b?.[k]).length;

/** La personalidad que SUGIERE el texto de la marca (rubro, tono, cómo se describe): → id o null si no hay señales. Pura. */
export function personalidadDeTexto(texto) {
  const t = String(texto ?? "").toLowerCase();
  if (!t.trim()) return null;
  let mejor = null;
  let max = 0;
  for (const [id, p] of Object.entries(PERSONALIDADES)) {
    const n = p.senales.filter((s) => t.includes(s)).length;
    if (n > max) { max = n; mejor = id; }
  }
  return mejor;
}

/**
 * Las combinaciones de una personalidad, de la más suya a la menos (todas las de sus listas de preferencia), sin las que
 * se parecen (3 o 4 iguales de las que se ven) a alguna de `evitar`. Pura.
 */
export function combinacionesDe(personalidad, { evitar = [] } = {}) {
  const p = PERSONALIDADES[personalidad];
  if (!p) return [];
  const piezas = PIEZAS_CON_VARIANTE;
  // Todas las combinaciones de sus preferencias, con su «coste» (la suma de las posiciones: 0 es la más suya).
  let todas = [{ v: {}, coste: 0 }];
  for (const k of piezas) {
    const opciones = p.variantes[k] ?? [VARIANTES_BASE[k]];
    todas = todas.flatMap((c) => opciones.map((o, i) => ({ v: { ...c.v, [k]: o }, coste: c.coste + i })));
  }
  return todas.sort((a, b) => a.coste - b.coste).map((c) => c.v).filter((v) => evitar.every((e) => iguales(v, e) <= MAX_IGUALES));
}

/** La combinación que mejor le va a esa personalidad sin parecerse a `evitar` (el juego de siempre, siempre evitado). Pura. */
export function variantesPorPersonalidad(personalidad, { evitar = [] } = {}) {
  return combinacionesDe(personalidad, { evitar: [VARIANTES_BASE, ...evitar] })[0] ?? null;
}

/** Las personalidades en texto, para el manual: «Lujo (lento y elegante): …». Pura. */
export function personalidadesEnTexto() {
  return Object.values(PERSONALIDADES).map((p) => `${p.nombre} (${p.como}): ${PIEZAS_CON_VARIANTE.map((k) => `${k} ${p.variantes[k].join(" o ")}`).join(", ")}. Nunca: ${p.nunca}.`);
}
