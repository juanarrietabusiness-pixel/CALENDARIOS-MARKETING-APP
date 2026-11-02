// ============================================================
// «Las piezas juntas»: el mes entero visto como una SERIE (puro; también lo importa el Worker)
//
// La revisión de marca mira cada imagen sola; esto mira todas a la vez, como las verá quien abra el perfil: si los
// colores, la letra, el logo y el estilo son de la misma familia, y cuáles desentonan. El navegador las junta en UNA
// hoja numerada (lib/hojaPiezas.js: un lienzo, unos centavos) y la IA la mira con el kit delante. Va en «Revisar el
// mes», antes de «Enviar a cliente». Nada se cambia solo: cada pieza señalada se abre y se corrige ahí.
// ============================================================

import { limpiarKit, textoPaleta } from "./kitMarca.js";

/** Como mucho, cuántas piezas entran en la hoja (6 filas de 4: se siguen viendo los detalles). */
export const MAX_PIEZAS_SERIE = 24;

/** Columnas y filas de la hoja para `n` piezas. Pura. */
export function rejillaDeHoja(n) {
  const total = Math.max(1, Math.min(MAX_PIEZAS_SERIE, Math.floor(Number(n) || 0)));
  const columnas = total <= 3 ? total : total <= 8 ? Math.ceil(total / 2) : 4;
  return { columnas, filas: Math.ceil(total / columnas) };
}

const corto = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** El pedido a la IA que mira la hoja. `total`: cuántas piezas lleva (numeradas de 1 a total, por fecha). */
export function pedidoDeSerie({ marca = "", kit: kitGuardado = {}, total = 0 } = {}) {
  const kit = limpiarKit(kitGuardado);
  return [
    `Esta imagen es una hoja con las ${total} piezas del mes de ${marca || "la marca"} para Instagram y Facebook, numeradas de 1 a ${total} en orden de fecha (el número va en la esquina de cada una).`,
    "Míralas JUNTAS, como las verá alguien que abre el perfil: ¿parecen de la MISMA marca? Sé estricto, pero no pidas que todas sean iguales: una serie varía la composición y mantiene la familia.",
    "",
    "EL KIT DE LA MARCA:",
    kit.paleta.length ? `Paleta: ${textoPaleta(kit.paleta)}` : "Paleta: (sin definir: juzga por lo que comparten la mayoría)",
    kit.tipografia ? `Tipografía: ${kit.tipografia}` : "",
    kit.estilo ? `Estilo: ${kit.estilo}` : "",
    kit.luz ? `Luz: ${kit.luz}` : "",
    "",
    "Compara: paleta y color dominante, tipografía (la misma familia, el mismo tratamiento del titular), estilo fotográfico o de ilustración, luz, dónde va el logo y cómo se ve, y el nivel de acabado. Una pieza que se vería de otra marca es la que más importa.",
    "Señala SÓLO las que desentonan, cada una con su número, qué la saca de la serie y cómo traerla de vuelta en una frase que se pueda pedir tal cual al editar la imagen.",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"puntaje":0-10,"resumen":"una frase sobre la serie","comun":["lo que comparten y está bien"],"fuera":[{"n":3,"motivo":"…","arreglo":"…"}]}',
  ].filter((l) => l !== "").join("\n");
}

/** La respuesta → { puntaje, resumen, comun, fuera: [{ n, motivo, arreglo }] }; `n` sólo de 1 a `total`, sin repetir. Null si no hay JSON. Pura. */
export function leerSerie(texto, total = MAX_PIEZAS_SERIE) {
  const m = String(texto ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[0]); } catch { return null; }
  if (!d || typeof d !== "object") return null;
  const vistos = new Set();
  const fuera = (Array.isArray(d.fuera) ? d.fuera : [])
    .map((f) => ({ n: Math.round(Number(f?.n)), motivo: corto(f?.motivo, 240), arreglo: corto(f?.arreglo, 240) }))
    .filter((f) => Number.isInteger(f.n) && f.n >= 1 && f.n <= total && f.motivo && !vistos.has(f.n) && vistos.add(f.n))
    .sort((a, b) => a.n - b.n);
  return {
    puntaje: Math.max(0, Math.min(10, Math.round(Number(d.puntaje) || 0))),
    resumen: corto(d.resumen, 300),
    comun: (Array.isArray(d.comun) ? d.comun : []).map((s) => corto(s, 200)).filter(Boolean).slice(0, 5),
    fuera,
  };
}
