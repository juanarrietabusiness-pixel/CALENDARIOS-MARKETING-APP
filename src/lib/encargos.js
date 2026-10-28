// ============================================================
// Los encargos del Estudio: lo que comparten la pantalla y el Worker
//
// Un encargo es una cadena de piezas que lleva el SERVIDOR (worker/lib/estudio/encargos.js): la pantalla la arma y se
// puede cerrar. Aquí, lo puro: el hueco de la escena en el pedido, los topes y cómo se cuenta cada pieza en pantalla.
// ============================================================

/** Donde va la escena en el pedido de cada pieza: la pone el servidor cuando el director (o la mejora) la escribe. */
export const ESCENA = "{{ESCENA}}";
export const TIPOS_ENCARGO = Object.freeze(["lote"]);
/** Piezas por encargo (un lote de 30 ideas cabe entero). */
export const MAX_PASOS = 40;
/** Cuántas piezas diseña el director por llamada. */
export const TANDA_FICHAS = 6;

export const terminadoEncargo = (e) => Boolean(e) && e.estado !== "en_marcha";

/** Por dónde va una pieza, en palabras. */
export function textoDePaso(p) {
  if (!p) return "";
  if (p.fase === "nuevo") return p.escena ? "En cola" : "Esperando al director de arte";
  if (p.fase === "generando") return "Creando la imagen…";
  if (p.fase === "opciones") {
    const o = (p.opciones ?? []).find((x) => x.fase !== "hecho");
    return o?.fase === "recomponer" ? "Ajustando la proporción…" : o?.fase === "corregir" ? "Corrigiendo el texto…" : "Revisando…";
  }
  return "";
}

/**
 * Lo que la pantalla del lote enseña de una pieza: `{ cargando, paso }` mientras va, `{ error }` si no salió y
 * `{ opciones: [{ crudo, final, control }] }` al terminar. `archivos`: Map id → archivo de la galería. `final` es lo
 * que puso el navegador encima (texto de plantilla, logo) o, si aún no, la cruda. Pura.
 */
export function resultadoDePaso(p, archivos = new Map()) {
  if (!p) return null;
  if (p.fase === "fallido") return { error: p.error || "La pieza no salió." };
  if (p.fase !== "hecho") return { cargando: true, paso: textoDePaso(p) };
  const opciones = (p.opciones ?? []).map((o, i) => {
    const crudo = archivos.get(o.id) ?? null;
    const final = (p.finales?.[i] && archivos.get(p.finales[i])) || crudo;
    return crudo ? { crudo, final, control: o.control ?? null } : null;
  }).filter(Boolean);
  return opciones.length ? { opciones, elegida: 0, enServidor: true, sinTerminar: !p.finales } : { error: "La pieza se creó pero no aparece en la galería." };
}
