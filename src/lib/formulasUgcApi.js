// ============================================================
// Cliente de /api/formulas-ugc: las fórmulas UGC de la agencia
//
// Tras guardar, cambiar o quitar se lanza `formulas-ugc` en `window` (con
// `local`): el eco de la propia pestaña no llega por el socket, y el panel de
// una publicación, «Extraer guion» y la lista tienen que verse entre sí.
// ============================================================

import { pedir } from "./db";

const BASE = "/formulas-ugc";
const json = (metodo, datos) => ({ method: metodo, body: JSON.stringify(datos ?? {}) });
const avisar = (formulas) => { try { window.dispatchEvent(new CustomEvent("formulas-ugc", { detail: { local: true, formulas } })); } catch { /* sin ventana */ } };

export async function listarFormulas() {
  return (await pedir(BASE))?.formulas ?? [];
}

export async function guardarFormula(formula) {
  const r = formula.id
    ? await pedir(`${BASE}/${encodeURIComponent(formula.id)}`, json("PUT", { formula }))
    : await pedir(BASE, json("POST", { formula }));
  avisar(r?.formulas);
  return r;
}

export async function quitarFormula(id) {
  const r = await pedir(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
  avisar(r?.formulas);
  return r?.formulas ?? [];
}

/** La IA abstrae la fórmula de un video transcrito → { formula, aviso }. No guarda. */
export async function proponerFormula({ original, fuente = null, duracion = null, clienteId = null }) {
  try {
    return await pedir(`${BASE}/proponer`, json("POST", { original, fuente, duracion, clienteId }));
  } finally {
    try { window.dispatchEvent(new Event("ia:gasto")); } catch { /* sin ventana */ }
  }
}
