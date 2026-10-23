// ============================================================
// Qué busca el cerebro según el TIPO de contenido, y qué material falta (puro)
//
// El motor de ideas buscaba en el cerebro siempre lo mismo («beneficios
// objeciones público contenido»): un educativo y un testimonio recibían los
// mismos pasajes, y cuando el cliente no tenía testimonios o garantía
// escritos la IA los adivinaba o hacía piezas genéricas. Ahora:
//
//   · la consulta se arma con las palabras de los tipos de la tanda
//     (`consultaDelPlan`);
//   · lo que un tipo NECESITA de verdad (testimonios reales, la garantía, el
//     equipo, qué los hace distintos, lo que saben del rubro) se busca aparte
//     y, si no hay nada, se avisa (`faltan`) y se le dice a la IA que no lo
//     invente (`lineaDeLoQueFalta`);
//   · el educativo lee la nota «Saber del rubro» entera (RUTA_RUBRO), que la
//     IA propone y una persona aprueba en la pestaña Cerebro.
//
// También lo importa el Worker.
// ============================================================

import { idDePilar } from "./pilares.js";

/** La ruta fija de la nota «Saber del rubro» en el cerebro del cliente. */
export const RUTA_RUBRO = "saber-del-rubro";
export const TITULO_RUBRO = "Saber del rubro";

/** Las palabras con que se busca en el cerebro para cada tipo de contenido (y cada maleta). */
export const BUSQUEDA_POR_TIPO = Object.freeze({
  anuncio: "oferta precio beneficio llamado a la acción promoción",
  beneficios: "beneficios promociones ofertas descuentos ventajas",
  servicios: "productos servicios características materiales cómo funciona",
  educativo: "consejos cómo elegir cuidar errores comunes preguntas frecuentes rubro",
  diferenciador: "diferenciador por qué elegirnos proceso calidad experiencia",
  humano: "equipo historia fundadores detrás de cámaras taller clientes",
  maletas: "garantía testimonios objeciones solución resultados",
  "maletas:garantia": "garantía devolución respaldo cobertura",
  "maletas:testimonio": "testimonios clientes opiniones reseñas resultados",
  "maletas:objeciones": "objeciones dudas preguntas frecuentes precio",
  "maletas:solucion": "problema solución antes después",
});

/**
 * Lo que un tipo necesita de verdad para no inventar: { clave, que (para la persona), buscar (en el cerebro) }. Un
 * testimonio sin testimonios reales es inventado; un diferenciador sin saber qué los hace distintos, genérico.
 */
export const MATERIAL = Object.freeze({
  testimonios: { que: "testimonios reales de clientes (lo que dijeron, con su nombre o inicial)", buscar: "testimonio testimonios reseña reseñas" },
  garantia: { que: "la garantía (qué cubre y por cuánto tiempo)", buscar: "garantía garantiza garantizamos" },
  equipo: { que: "quién es el equipo o la historia de la marca", buscar: "equipo fundador fundadora fundó historia" },
  diferenciador: { que: "qué los hace distintos de la competencia", buscar: "diferenciador diferenciadores diferencia distintos" },
  rubro: { que: "lo que la marca sabe de su rubro (la nota «Saber del rubro»)", buscar: "" },
});
const NECESITA = Object.freeze({
  "maletas:testimonio": ["testimonios"],
  "maletas:garantia": ["garantia"],
  humano: ["equipo"],
  diferenciador: ["diferenciador"],
  educativo: ["rubro"],
});

/** La clave de búsqueda de una casilla: su tipo, y en las 7 maletas, la suya. Pura. */
export function claveDeTipo(c = {}) {
  const tipo = idDePilar(c.tipo ?? c.pilar ?? "");
  const sub = String(c.pilarSub ?? "").toLowerCase();
  return tipo === "maletas" && BUSQUEDA_POR_TIPO[`maletas:${sub}`] ? `maletas:${sub}` : tipo;
}

/** La consulta al cerebro para una tanda: lo del producto y las palabras de sus tipos, sin repetir. Pura. */
export function consultaDelPlan(plan = [], { producto = "" } = {}) {
  const claves = [...new Set(plan.map(claveDeTipo).filter(Boolean))];
  const palabras = [producto, ...claves.map((k) => BUSQUEDA_POR_TIPO[k] ?? "")].join(" ").split(/\s+/).filter(Boolean);
  const unicas = [...new Set(palabras.map((p) => p.toLowerCase()))];
  return (unicas.length ? unicas : ["beneficios", "objeciones", "público", "contenido"]).join(" ").slice(0, 400);
}

/** Qué material necesita la tanda: [clave de MATERIAL], sin repetir. Pura. */
export const materialDelPlan = (plan = []) => [...new Set(plan.flatMap((c) => NECESITA[claveDeTipo(c)] ?? []))];

/** ¿Lleva la tanda algún educativo? (para leer «Saber del rubro»). Pura. */
export const conEducativo = (plan = []) => plan.some((c) => claveDeTipo(c) === "educativo");

/** La línea para la IA con lo que NO hay: que no lo invente. Vacía si no falta nada. Pura. */
export function lineaDeLoQueFalta(faltan = []) {
  const lista = faltan.map((k) => MATERIAL[k]?.que).filter(Boolean);
  return lista.length
    ? `Lo que NO está en lo que se sabe de la marca (no lo inventes: si una pieza lo necesitaría, enfócala en otra cosa verdadera): ${lista.join("; ")}.`
    : "";
}

/** El aviso para la persona: qué añadir al cerebro para que esas piezas salgan con material real. Pura. */
export function avisoDeLoQueFalta(faltan = []) {
  const lista = faltan.map((k) => MATERIAL[k]?.que).filter(Boolean);
  if (!lista.length) return "";
  return `Al cerebro le falta material para algunas piezas: ${lista.join("; ")}. La IA no lo inventó; añádelo en la pestaña Cerebro${faltan.includes("rubro") ? " (o pulsa «Saber del rubro»)" : ""} y vuelve a pedirlas.`;
}

// ------------------------------------------------------------
// «Saber del rubro»: lo que un experto del rubro sabe
// ------------------------------------------------------------

/** Lo que se le pide a la IA para PROPONER la nota (la persona la revisa antes de guardarla). Pura. */
export function pedidoDeRubro({ marca = "la marca", rubro = "", pais = "Panamá", contexto = "", conWeb = false, actual = "" }) {
  return [
    `Escribe la nota «${TITULO_RUBRO}» de ${marca}${rubro ? ` (${rubro})` : ""}, en ${pais}: lo que un experto de ese rubro sabe y que sirve para hacer contenido EDUCATIVO (consejos, cómo elegir, cómo cuidar, errores comunes, mitos, preguntas frecuentes).`,
    conWeb ? "Tienes búsqueda en internet: úsala para comprobar los datos (pocas búsquedas y bien elegidas) y apunta la fuente de lo que no sea de sentido común." : "Sin búsqueda en internet: escribe sólo lo que sea conocimiento general y seguro del rubro; nada de cifras que no puedas respaldar.",
    "",
    "Forma (en Markdown, sin introducción):",
    "## Consejos que da un experto (6 a 10, una línea cada uno)",
    "## Errores comunes de los clientes (4 a 6)",
    "## Mitos y verdades (3 a 5)",
    "## Preguntas frecuentes, con su respuesta corta (4 a 6)",
    "## Datos útiles (con su fuente si salen de internet)",
    "",
    "Reglas: nada de precios ni promociones (eso es del catálogo); nada que contradiga lo que se sabe de la marca; nada de la competencia por su nombre. Español neutro y claro.",
    actual ? `\nLA NOTA DE AHORA (mejórala y complétala, no la pierdas):\n${String(actual).slice(0, 6000)}` : "",
    contexto ? `\nLO QUE SE SABE DE LA MARCA:\n${String(contexto).slice(0, 6000)}` : "",
  ].filter((l, i, t) => l !== "" || t[i - 1] !== "").join("\n");
}

/** La respuesta de la IA → el texto de la nota, limpio (sin ``` ni introducción antes del primer «##»). Pura. */
export function leerRubro(texto) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "").trim();
  const i = t.indexOf("##");
  return (i > 0 ? t.slice(i) : t).trim().slice(0, 20_000);
}
