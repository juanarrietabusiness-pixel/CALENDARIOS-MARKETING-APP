// ============================================================
// Las recetas, desde el navegador (/api/recetas) y «Crear con Claude»
//
// La lista cambia poco: se recuerda en memoria y se olvida al guardar o borrar. «Crear con Claude» guarda el pedido en
// el servidor (un día), COPIA el mensaje y abre claude.ai con él escrito: `?q=` no está documentado, así que si un día
// deja de rellenarse, el mensaje ya está en el portapapeles para pegarlo.
// ============================================================

import { pedir } from "./db";

let recordada = null;

/** → [receta] (las de la casa con lo cambiado, y las propias). */
export async function leerRecetas({ forzar = false } = {}) {
  if (!forzar && recordada) return recordada;
  const r = await pedir("/recetas");
  recordada = r.recetas ?? [];
  return recordada;
}

export async function guardarReceta(id, receta) {
  const r = await pedir(`/recetas/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ receta }) });
  recordada = r.recetas ?? null;
  return recordada;
}

/** Una propia se borra; una de la casa vuelve a como venía. */
export async function borrarReceta(id) {
  const r = await pedir(`/recetas/${encodeURIComponent(id)}`, { method: "DELETE" });
  recordada = r.recetas ?? null;
  return recordada;
}

/**
 * «Crear con Claude»: guarda el pedido y abre claude.ai. `datos`: { clienteId, publicacion?, referencias?, indicacion? }.
 * → { mensaje, enlace, copiado }. La ventana se abre ANTES de esperar al servidor (si no, el navegador la bloquea por
 * no venir de un clic) y se le pone la dirección al volver.
 */
export async function crearConClaude(receta, datos) {
  const ventana = window.open("about:blank", "_blank");
  try {
    const r = await pedir(`/recetas/${encodeURIComponent(receta.id)}/handoff`, { method: "POST", body: JSON.stringify(datos ?? {}) });
    let copiado = false;
    try { await navigator.clipboard.writeText(r.mensaje); copiado = true; } catch { /* sin permiso: el mensaje se enseña */ }
    if (ventana) ventana.location.href = r.enlace;
    return { mensaje: r.mensaje, enlace: r.enlace, copiado };
  } catch (e) {
    ventana?.close();
    throw e;
  }
}
