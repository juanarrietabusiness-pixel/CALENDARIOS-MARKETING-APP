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

export const CONFIG_IA_POR_DEFECTO = Object.freeze({
  ia_modelo: "sonnet",
  ia_razonamiento: "alto",
  ia_razonamiento_chat: null,
  presupuesto_usd: 30,
  al_limite: "avisar",
});

/** Qué pasa al llegar al presupuesto del mes. */
export const ACCIONES_LIMITE = Object.freeze([
  { id: "avisar", nombre: "Sólo avisar", nota: "La IA sigue igual; el medidor se pone en rojo." },
  { id: "bajar", nombre: "Bajar a nivel Bajo", nota: "Sigue funcionando con Sonnet en nivel Bajo, el más barato." },
  { id: "detener", nombre: "Detener la IA", nota: "Nada de IA (texto, imágenes ni video) hasta el mes siguiente o hasta subir el presupuesto." },
]);

/**
 * «Sonnet 5 · Alto». Con `para: "chat"`, el nivel del asistente si el
 * espacio le puso uno propio.
 */
export function etiquetaIA(config, { para = "texto" } = {}) {
  const c = { ...CONFIG_IA_POR_DEFECTO, ...(config ?? {}) };
  const modelo = MODELOS_IA.find((m) => m.id === c.ia_modelo)?.nombre ?? "Sonnet 5";
  const idNivel = para === "chat" && c.ia_razonamiento_chat ? c.ia_razonamiento_chat : c.ia_razonamiento;
  const nivel = NIVELES_IA.find((n) => n.id === idNivel)?.nombre ?? "Alto";
  return `${modelo} · ${nivel}`;
}

/** Dólares con los decimales que hacen falta para que un centavo se vea: «$0.043», «$12.40». */
export function formatoUSD(n) {
  const v = Number(n) || 0;
  // Tres decimales sólo si hacen falta: «$0.043», pero «$0.60» y no «$0.600».
  const centavos = v * 100;
  const conMilesimas = v > 0 && v < 1 && Math.abs(centavos - Math.round(centavos)) > 1e-9;
  return `$${conMilesimas ? v.toFixed(3) : v.toFixed(2)}`;
}
