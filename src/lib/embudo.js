// ============================================================
// El EMBUDO del mes: objetivos, etapas y la estrategia guardada (puro y pequeño)
//
// Vive aparte de estrategiaMes.js (que lo reexporta) porque lo lee la tarjeta
// de la campaña del mes (calendario/campanaMes.jsx), que va en la carga
// inicial: la estrategia del mes se VE y se edita después de planificar, no
// sólo dentro de «Planificar mes».
// ============================================================

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();

/** Lo que el mes persigue. `embudo`: cómo se reparten las semanas por defecto (la IA puede cambiarlo). */
export const OBJETIVOS_MES = Object.freeze([
  { id: "ventas", nombre: "Vender", ayuda: "Llevar a la compra: más piezas que convierten, con precio y llamado a la acción.", embudo: ["atraer", "considerar", "convertir", "convertir", "fidelizar"] },
  { id: "seguidores", nombre: "Crecer en seguidores", ayuda: "Alcance y comunidad: contenido que se comparte y que trae gente nueva.", embudo: ["atraer", "atraer", "considerar", "atraer", "fidelizar"] },
  { id: "lanzamiento", nombre: "Lanzar un producto", ayuda: "Expectativa, presentación y primeras ventas de algo nuevo.", embudo: ["atraer", "considerar", "convertir", "convertir", "fidelizar"] },
  { id: "marca", nombre: "Marca y confianza", ayuda: "Que la conozcan y confíen: diferenciador, proceso, garantías, testimonios.", embudo: ["atraer", "considerar", "fidelizar", "considerar", "fidelizar"] },
]);
export const objetivoDe = (id) => OBJETIVOS_MES.find((o) => o.id === id) ?? null;

/** Las etapas del embudo y los niveles de consciencia que tocan. */
export const ETAPAS = Object.freeze({
  atraer: { nombre: "Atraer", niveles: ["inconsciente", "problema"], ayuda: "gente nueva: el problema, curiosidad, contenido que se comparte" },
  considerar: { nombre: "Considerar", niveles: ["solucion", "producto"], ayuda: "la solución y por qué esta marca: beneficios, diferenciador, prueba" },
  convertir: { nombre: "Convertir", niveles: ["producto", "decision"], ayuda: "la compra: oferta, precio exacto, garantía, llamado a la acción" },
  fidelizar: { nombre: "Fidelizar", niveles: ["producto", "decision"], ayuda: "quien ya compró o ya sigue: testimonios, comunidad, detrás de cámaras" },
});
const IDS_ETAPA = Object.keys(ETAPAS);

/** El nombre de una etapa («Atraer»), o vacío. Pura. */
export const etapaDe = (id) => ETAPAS[id]?.nombre ?? "";

/** El reparto por defecto de las semanas según el objetivo (sin objetivo, el de vender). Pura. */
export function embudoDelMes(objetivo, semanas = 5) {
  const base = (objetivoDe(objetivo) ?? OBJETIVOS_MES[0]).embudo;
  return Array.from({ length: Math.max(0, semanas) }, (_, i) => base[Math.min(i, base.length - 1)]);
}

/** La estrategia guardada en el calendario (`opciones.estrategia`), limpia. Pura. */
export function limpiarEstrategia(e) {
  if (!e || typeof e !== "object") return null;
  const salida = {
    objetivo: objetivoDe(e.objetivo)?.id ?? "",
    focoId: corto(e.focoId, 80),
    foco: corto(e.foco, 160),
    razon: corto(e.razon, 500),
    etapas: (Array.isArray(e.etapas) ? e.etapas : []).slice(0, 6).map((x) => (IDS_ETAPA.includes(x) ? x : "")),
  };
  return salida.objetivo || salida.focoId || salida.etapas.some(Boolean) ? salida : null;
}

/** La estrategia guardada, dicha en una línea para enseñarla («Vender · foco: Sofá cama · 3 semanas con etapa»). Pura. */
export function resumenEstrategia(e) {
  const x = limpiarEstrategia(e);
  if (!x) return "";
  const conEtapa = x.etapas.filter(Boolean).length;
  return [
    objetivoDe(x.objetivo)?.nombre ?? "",
    x.foco ? `foco: ${x.foco}` : "",
    conEtapa ? `${conEtapa} ${conEtapa === 1 ? "semana" : "semanas"} con etapa del embudo` : "",
  ].filter(Boolean).join(" · ");
}
