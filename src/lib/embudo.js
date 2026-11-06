// ============================================================
// El EMBUDO del mes: objetivos, etapas y la estrategia guardada (puro y pequeño)
//
// Vive aparte de estrategiaMes.js (que lo reexporta) porque lo lee la tarjeta
// de la campaña del mes (calendario/campanaMes.jsx), que va en la carga
// inicial: la estrategia del mes se VE y se edita después de planificar, no
// sólo dentro de «Planificar mes».
//
// Las etapas son las del CICLO DE VENTAS del curso (cicloVentas.js:
// presentación, evaluación, conversión, ascensión), las mismas del plan de
// campañas. Lo guardado con las de antes (atraer, considerar, convertir,
// fidelizar en `opciones.estrategia.etapas`) se lee por alias
// (`idEtapaCiclo`) sin reescribir ninguna fila.
// ============================================================

import { ETAPAS_CICLO, idEtapaCiclo } from "./cicloVentas.js";

export { idEtapaCiclo };

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();

/** Lo que el mes persigue. `embudo`: cómo se reparten las semanas por defecto (la IA puede cambiarlo). */
export const OBJETIVOS_MES = Object.freeze([
  { id: "ventas", nombre: "Vender", ayuda: "Llevar a la compra: más piezas que convierten, con precio y llamado a la acción.", embudo: ["presentacion", "evaluacion", "conversion", "conversion", "ascension"] },
  { id: "seguidores", nombre: "Crecer en seguidores", ayuda: "Alcance y comunidad: contenido que se comparte y que trae gente nueva.", embudo: ["presentacion", "presentacion", "evaluacion", "presentacion", "ascension"] },
  { id: "lanzamiento", nombre: "Lanzar un producto", ayuda: "Expectativa, presentación y primeras ventas de algo nuevo.", embudo: ["presentacion", "evaluacion", "conversion", "conversion", "ascension"] },
  { id: "marca", nombre: "Marca y confianza", ayuda: "Que la conozcan y confíen: diferenciador, proceso, garantías, testimonios.", embudo: ["presentacion", "evaluacion", "ascension", "evaluacion", "ascension"] },
]);
export const objetivoDe = (id) => OBJETIVOS_MES.find((o) => o.id === id) ?? null;

// Qué contenido del mes toca a cada etapa (en minúscula: va dentro de una frase, también a la IA).
const AYUDA_DEL_MES = {
  presentacion: "quien no conoce la marca: la necesidad o el problema, lo más vendido, contenido que se comparte",
  evaluacion: "quien ya la vio y compara: detalles, beneficios, diferenciales, pruebas y objeciones respondidas",
  conversion: "quien ya decidió: testimonio, garantía, la oferta con su precio exacto y un llamado claro",
  ascension: "quien ya compró: recompra, lo que complementa o el combo, y que la recomiende",
};

/** Las etapas del ciclo de ventas, por id, con los niveles de consciencia que tocan (los de cicloVentas.js). */
export const ETAPAS = Object.freeze(Object.fromEntries(ETAPAS_CICLO.map((e) => [
  e.id, Object.freeze({ nombre: e.nombre, niveles: e.niveles, ayuda: AYUDA_DEL_MES[e.id] }),
])));

/** El nombre de una etapa («Presentación») por su id o por uno de antes («atraer», «tibio»), o vacío. Pura. */
export const etapaDe = (id) => ETAPAS[idEtapaCiclo(id)]?.nombre ?? "";

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
    // La de antes se lee por alias («atraer» → «presentacion»): lo guardado no se reescribe, se entiende.
    etapas: (Array.isArray(e.etapas) ? e.etapas : []).slice(0, 6).map((x) => idEtapaCiclo(x)),
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
    conEtapa ? `${conEtapa} ${conEtapa === 1 ? "semana" : "semanas"} con etapa del ciclo de ventas` : "",
  ].filter(Boolean).join(" · ");
}
