// ============================================================
// Qué redes entran en el informe mensual (puro; también lo importa el Worker)
//
// Se escoge al generar y, con «Recordar para este cliente», vale también para
// el automático del día 1 (`clients.informe_redes`, 0054). Sin nada guardado
// entra todo, como antes.
// ============================================================

export const REDES_INFORME = Object.freeze([
  { id: "instagram", nombre: "Instagram" },
  { id: "facebook", nombre: "Facebook" },
  { id: "tiktok", nombre: "TikTok" },
  { id: "youtube", nombre: "YouTube" },
]);
const IDS = REDES_INFORME.map((r) => r.id);

/**
 * Lo que llega (del navegador o de la columna, texto o JSON) → { redes: string[] | null, anuncios: boolean }.
 * `redes: null` es «todas»; una lista vacía no vale (un informe sin redes no dice nada) y también es «todas».
 */
export function limpiarSeleccion(valor) {
  let v = valor;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  if (!v || typeof v !== "object") return { redes: null, anuncios: true };
  const redes = Array.isArray(v.redes) ? [...new Set(v.redes.filter((r) => IDS.includes(r)))] : [];
  return { redes: redes.length ? redes : null, anuncios: v.anuncios !== false };
}

/** ¿Entra esta red? */
export const entraRed = (seleccion, red) => !seleccion?.redes || seleccion.redes.includes(red);

/** «Instagram y Facebook, sin anuncios» — para la pantalla y el informe. */
export function describirSeleccion(seleccion, conectadas = IDS) {
  const s = seleccion ?? { redes: null, anuncios: true };
  const redes = (s.redes ?? conectadas).filter((r) => conectadas.includes(r)).map((r) => REDES_INFORME.find((x) => x.id === r)?.nombre ?? r);
  const lista = redes.length > 1 ? `${redes.slice(0, -1).join(", ")} y ${redes.at(-1)}` : redes[0] ?? "ninguna red";
  return `${lista}${s.anuncios ? "" : ", sin anuncios"}`;
}
