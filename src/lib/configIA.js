// ============================================================
// La IA del espacio, vista desde el navegador (puro)
//
// El navegador no elige el modelo: muestra lo que eligió el
// administrador y le deja cambiarlo en Ajustes. Lo que se manda al
// servidor es «sonnet»/«opus»/«haiku» y un nivel; el id del modelo lo decide el
// servidor, que es quien sabe qué tiene la cuenta.
// ============================================================

export const MODELOS_IA = Object.freeze([
  { id: "sonnet", nombre: "Sonnet 5", nota: "Recomendado. Excelente para guiones y copies." },
  { id: "opus", nombre: "Opus", nota: "El más potente de tu cuenta. Más lento y unas 2,5 veces más caro." },
  { id: "haiku", nombre: "Haiku 4.5", nota: "El más barato: la mitad que Sonnet y muy rápido. Para ideas y textos cortos; en guiones largos y en el asistente se nota la diferencia." },
]);

/** Lo que se elige por función: los de Anthropic y los dos de Meta. */
export const MODELOS_FUNCION = Object.freeze([
  ...MODELOS_IA,
  { id: "muse-contribuidor", nombre: "Muse Spark Contributor (Meta)", nota: "El más barato con diferencia (≈ 0,10 $ / 0,20 $ por millón de tokens). A cambio, Meta puede usar lo que se le manda para entrenar sus modelos, y no está en todas las regiones: si Meta lo rechaza, escribe Sonnet." },
  { id: "muse", nombre: "Muse Spark 1.3 (Meta)", nota: "El de Meta sin entrenar con tus datos. Lee imagen, video y PDF; ≈ 1,25 $ / 4,25 $ por millón de tokens." },
]);

/** Cada función de la IA de texto, con lo que abarca. Las claves son las del servidor (FUNCIONES_IA). */
export const FUNCIONES_IA = Object.freeze([
  { id: "redaccion", nombre: "Redacción", nota: "Ideas del mes, descripciones y captions" },
  { id: "guiones", nombre: "Guiones", nota: "Guiones de reels y videos" },
  { id: "lectura", nombre: "Escribir mirando el contenido", nota: "Lo que la IA escribe a partir de las imágenes subidas" },
  { id: "asistente", nombre: "Asistente", nota: "El chat (con Meta no hay búsqueda web)" },
  { id: "analisis", nombre: "Análisis", nota: "Informes, auditorías, cerebro y ADN de marca" },
]);

/** Quién hace las imágenes de la aplicación (adaptar a 4:5 o 9:16). */
export const MOTORES_IMAGEN = Object.freeze([
  { id: "auto", nombre: "Automático", nota: "Muse Image si hay llave de Meta (≈ 0,01 $); si no, Nano Banana (≈ 0,04 $)." },
  { id: "meta", nombre: "Muse Image (Meta)", nota: "≈ 0,01 $ por imagen. Si Meta falla, la hace Nano Banana." },
  { id: "gemini", nombre: "Nano Banana (Google)", nota: "≈ 0,04 $ por imagen." },
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
  ia_modelos: {},
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
