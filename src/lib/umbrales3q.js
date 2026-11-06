// ============================================================
// Los UMBRALES de la revisión 3Q (curso de campañas, entrega 5): a partir de qué número una métrica secundaria
// avisa, y cuándo se espera o se pausa. Puro y pequeño a propósito: lo leen el Manual de campañas
// (src/lib/estratega.js, `limpiarManual`) y la revisión (src/lib/tresQ.js) sin arrastrar nada más.
//
// Los valores de partida salen de los rangos del curso, con palabras propias: se avisa en el extremo bajo del rango
// («por debajo de 50-60 %» → 50) y la frecuencia distingue los públicos fríos (presentación, temporada) de los que ya
// conocen la marca (evaluación, conversión, ascensión), que son chicos por diseño y repiten más.
// Se cambian en Ajustes → Cómo trabajamos → Manual de campañas sin tocar código.
// ============================================================

/** Los umbrales de partida. Todos los % van de 0 a 100. */
export const UMBRALES_3Q = Object.freeze({
  pctMensajes: 50,
  ctrUnico: 2,
  tasa3s: 20,
  tiempoVideo: 5,
  frecuencia: 3,
  frecuenciaCalida: 5,
  cpm: 30,
  diasCambio: 5,
  apagar: 1.5,
  gastoParaApagar: 2,
});

/** Cada umbral: qué es, en qué unidad y entre qué valores se acepta (lo de fuera vuelve al de partida). */
export const CAMPOS_UMBRALES_3Q = Object.freeze([
  { id: "pctMensajes", nombre: "% de mensajes por debajo de", unidad: "%", min: 1, max: 100, ayuda: "De cada 100 que dan clic, cuántos escriben. Por debajo, el llamado a escribir no es claro." },
  { id: "ctrUnico", nombre: "CTR único por debajo de", unidad: "%", min: 0.1, max: 20, ayuda: "De cada 100 personas que lo ven, cuántas dan clic. Por debajo, la pieza no para el dedo." },
  { id: "tasa3s", nombre: "Reproducciones de 3 s por debajo de", unidad: "%", min: 1, max: 100, ayuda: "De cada 100 impresiones de un video, cuántas se quedan 3 segundos. Por debajo, el gancho no engancha." },
  { id: "tiempoVideo", nombre: "Tiempo de reproducción por debajo de", unidad: "s", min: 1, max: 60, ayuda: "Lo que se queda de media la gente en el video. Por debajo, el guion o la edición sueltan." },
  { id: "frecuencia", nombre: "Frecuencia (públicos nuevos) por encima de", unidad: "veces", min: 1, max: 20, ayuda: "Cuántas veces vio lo mismo cada persona en 7 días, en presentación y temporada." },
  { id: "frecuenciaCalida", nombre: "Frecuencia (quien ya conoce la marca) por encima de", unidad: "veces", min: 1, max: 30, ayuda: "Lo mismo en evaluación, conversión y ascensión: públicos chicos que repiten más." },
  { id: "cpm", nombre: "CPM por encima de su mes en", unidad: "%", min: 5, max: 300, ayuda: "Cuánto más caras las mil impresiones de esta semana frente a las de los 30 días." },
  { id: "diasCambio", nombre: "Esperar tras un cambio", unidad: "días", min: 1, max: 14, ayuda: "Tras crear o cambiar algo, cuántos días se espera antes de juzgarlo (el algoritmo aprende)." },
  { id: "apagar", nombre: "Fuera del número mágico: más de", unidad: "veces", min: 1, max: 5, ayuda: "Cuántas veces lo que aguanta su etapa tiene que costar un resultado para pausarlo." },
  { id: "gastoParaApagar", nombre: "Gastado antes de pausar", unidad: "veces", min: 1, max: 10, ayuda: "Cuántas veces el número mágico tiene que haber gastado para poder juzgarlo." },
]);

/** Un número de lo que llegue («2,5», 3); NaN si no hay. Pura. */
const numero = (v) => (typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".").trim() || NaN));

/** Los umbrales guardados, limpios: cada uno en su rango o el de partida. Pura. */
export function limpiarUmbrales3q(x) {
  const e = x && typeof x === "object" && !Array.isArray(x) ? x : {};
  const salida = {};
  for (const c of CAMPOS_UMBRALES_3Q) {
    const n = numero(e[c.id]);
    salida[c.id] = Number.isFinite(n) && n >= c.min && n <= c.max ? Math.round(n * 100) / 100 : UMBRALES_3Q[c.id];
  }
  return salida;
}
