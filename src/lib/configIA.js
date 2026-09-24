// ============================================================
// La IA del espacio, vista desde el navegador (puro)
//
// El navegador no elige el modelo: muestra lo que eligió el
// administrador y le deja cambiarlo en Ajustes. Lo que se manda al
// servidor es «sonnet»/«opus» y un nivel; el id del modelo lo decide el
// servidor, que es quien sabe qué tiene la cuenta.
// ============================================================

export const MODELOS_IA = Object.freeze([
  { id: "sonnet", nombre: "Sonnet 5", nota: "Recomendado. Excelente para guiones y copies." },
  { id: "opus", nombre: "Opus", nota: "El más potente de tu cuenta. Más lento y unas 2,5 veces más caro." },
]);

export const NIVELES_IA = Object.freeze([
  { id: "bajo", nombre: "Bajo", nota: "Responde casi directo. El más rápido y barato." },
  { id: "medio", nombre: "Medio", nota: "Planifica la estructura antes de escribir." },
  { id: "alto", nombre: "Alto", nota: "Recomendado. Cuida gancho, ritmo, tono y las reglas del ADN." },
  { id: "maximo", nombre: "Máximo", nota: "Revisa a fondo. Para campañas clave: más lento y más caro." },
]);

export const CONFIG_IA_POR_DEFECTO = Object.freeze({ ia_modelo: "sonnet", ia_razonamiento: "alto" });

/** «Sonnet 5 · Alto». */
export function etiquetaIA(config) {
  const c = { ...CONFIG_IA_POR_DEFECTO, ...(config ?? {}) };
  const modelo = MODELOS_IA.find((m) => m.id === c.ia_modelo)?.nombre ?? "Sonnet 5";
  const nivel = NIVELES_IA.find((n) => n.id === c.ia_razonamiento)?.nombre ?? "Alto";
  return `${modelo} · ${nivel}`;
}

/** Dólares con los decimales que hacen falta para que un centavo se vea. */
export function formatoUSD(n) {
  const v = Number(n) || 0;
  return `${v < 1 ? v.toFixed(3) : v.toFixed(2)} US$`;
}
