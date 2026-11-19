// ============================================================
// Qué motor conviene para recrear un video, y por qué (puro)
//
// La IA no escoge el modelo: con lo que el análisis ya sabe (cuánto dura la
// referencia) y el modo, una REGLA recorre una lista de preferencia y se queda
// con el primero que TIENE LLAVE y admite lo que hace falta. Así no puede
// proponer un modelo que no existe o que está sin llave. La frase de «por qué»
// es fija por modelo: dice lo que el modelo hace de verdad (su catálogo).
//
//   mismo     editar el MISMO video con nuestro producto: hace falta un modelo
//             que reciba el video de referencia (`video`).
//   version   un video NUEVO que transmita lo mismo: el que llegue a la duración
//             de la referencia, con referencias para las fotos del producto.
// ============================================================

import { modeloPorId } from "./estudioCatalogo";

// Los diez motores de prioridad de la agencia (src/lib/motoresVideo.js) van primero. La única excepción es «mismo»:
// EDITAR el video original sigue empezando por Omni 1.2, el único cuyo pedido con video se comprobó contra Kie (el
// 17-11-2026; el Omni de calidad alta manda el video como el 1.1, sin probar). Detrás, el Omni completo y los diez.
const PREFERENCIA = Object.freeze({
  mismo: [
    ["gemini-omni-1-2-kie", "Gemini Omni 1.2 edita el video original (hasta 15 s): conserva el escenario, la cámara y la música, y cambia sólo lo que se le pide. Es el que edita con el pedido ya comprobado."],
    ["gemini-omni-video-kie", "Gemini Omni en calidad alta (de los diez de prioridad): edita el video original conservando el escenario, con la física más creíble."],
    ["kling-3-omni-kie", "Kling 3.0 Omni (de los diez de prioridad) sigue el video de referencia con las fotos del producto, con voz y labios en español."],
    ["seedance-2-5-kie", "Seedance 2.5 (de los diez de prioridad) sigue el video de referencia, con las fotos del producto y música propia."],
    ["minimax-h3-kie", "MiniMax H3 (de los diez de prioridad) sigue el video de referencia en 2K con las fotos del producto."],
    ["seedance-2-kie", "Seedance 2.0 (de los diez de prioridad) sigue el video de referencia con las fotos del producto."],
    ["wan-3-kie", "Wan 3.0 (de los diez de prioridad) sigue el video de referencia a 1080p."],
    ["gemini-omni-kie", "Gemini Omni edita el video original: conserva el escenario, la cámara y la música, y cambia sólo lo que se le pide."],
  ],
  version: [
    ["seedance-2-5-kie", "Seedance 2.5 (de los diez de prioridad) hace hasta 30 s con varios planos en un solo pedido, la misma cara en todos, música propia y las fotos del producto de referencia."],
    ["kling-3-omni-kie", "Kling 3.0 Omni (de los diez de prioridad) hace hasta 15 s con varios planos, voz y labios en español y las fotos del producto."],
    ["gemini-omni-video-kie", "Gemini Omni en calidad alta (de los diez de prioridad): hasta 10 s con la física más creíble y las fotos del producto."],
    ["minimax-h3-kie", "MiniMax H3 (de los diez de prioridad): hasta 15 s en 2K con las fotos del producto."],
    ["seedance-2-kie", "Seedance 2.0 (de los diez de prioridad) hace hasta 15 s con varios planos y las fotos del producto."],
    ["wan-3-kie", "Wan 3.0 (de los diez de prioridad): 1080p con las fotos del producto de referencia."],
    ["gemini-omni-1-2-kie", "Gemini Omni 1.2: hasta 15 s con varios planos y las fotos del producto."],
    ["gemini-omni-kie", "Gemini Omni: hasta 10 s con varios planos y las fotos del producto."],
  ],
});

const disponible = (m, activos) => Boolean(m) && (m.motor === "prueba" || activos[m.motor]);
const duraciones = (m) => (m?.ajustes?.duration?.valores ?? []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);

/** La duración que admite el modelo más cercana a la que se quiere (la primera que llega; si ninguna, la más larga). Pura. */
export function duracionAdmitida(modelo, segundos = 10) {
  const lista = duraciones(modelo);
  if (!lista.length) return 0;
  const quiero = Math.max(1, Math.round(Number(segundos) || 10));
  return lista.find((d) => d >= quiero) ?? lista.at(-1);
}

/**
 * El motor para recrear: `{ modelo, segundos, porque }` o null si no hay ninguno con llave que sirva.
 * `activos`: { motor: bool }; `segundos`: lo que dura la referencia (del análisis). Pura.
 */
export function motorParaRecrear(activos = {}, { modo = "version", segundos = 10 } = {}) {
  const lista = (PREFERENCIA[modo] ?? PREFERENCIA.version)
    .map(([id, porque]) => ({ modelo: modeloPorId(id), porque }))
    .filter(({ modelo }) => disponible(modelo, activos) && (modo !== "mismo" || modelo.video));
  if (!lista.length) return null;
  const quiero = Math.max(4, Math.round(Number(segundos) || 10));
  // En «version», el primero que llegue a la duración de la referencia; si ninguno llega, el primero de la lista.
  const elegido = (modo === "version" ? lista.find(({ modelo }) => (duraciones(modelo).at(-1) ?? 0) >= quiero) : null) ?? lista[0];
  return { modelo: elegido.modelo, segundos: duracionAdmitida(elegido.modelo, quiero), porque: elegido.porque };
}
