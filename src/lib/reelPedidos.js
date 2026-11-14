// ============================================================
// Los PEDIDOS del reel por planos, sin pedir nada (puro: lo usan la pantalla y el Worker)
//
// Vivían en lib/reelEstudio.js, que importa el cliente HTTP del Estudio (lib/estudio.js): el Worker no podía armarlos.
// Ahora el reel es un ENCARGO del servidor (worker/lib/estudio/encargoReel.js) que sigue aunque se cierre la pantalla,
// y para que salga IGUAL que a mano el servidor arma cada fotograma, el video y cada clip con estas mismas funciones.
// lib/reelEstudio.js las sigue exportando: nada de la pantalla cambia de import.
// ============================================================

import { ajustesDe, MODELOS, modeloPorId, porPrecio } from "./estudioCatalogo.js";
import { pedidoDeFotograma, promptDeReel, fotogramasParaVideo, sinVozPropia } from "./reel.js";
import { lineaDeReferencia } from "./referencias.js";
import { ajusteDeDuracion } from "./videoCorto.js";
import { SIN_TEXTO_VIDEO } from "./videoLimpio.js";
import { armarPedidoVideo } from "./pedidoVideo.js";

/** Los modelos que sirven para el VIDEO de un reel (storyboard o imagen inicial), del más barato al más caro. */
export function modelosParaReel(activos = {}) {
  return porPrecio(MODELOS.filter((m) => m.tipo === "video" && (m.referencias >= 2 || m.inicial) && !m.necesitaVideo && (m.motor === "prueba" || activos[m.motor])), activos);
}

/** El que se escoge si nadie escoge: Omni por Kie (storyboard de 7 y corregir un tramo), luego los que le siguen. */
export function modeloRecomendadoParaReel(activos = {}) {
  const lista = modelosParaReel(activos);
  return ["gemini-omni-kie", "kling-3-omni-kie", "seedance-2-kie", "gemini-omni-flash", "kling-3-kie", "veo-3-1-fast-kie"]
    .map((id) => lista.find((m) => m.id === id)).find(Boolean) ?? lista.find((m) => m.motor !== "prueba") ?? lista[0] ?? null;
}

/** ¿Este modelo puede corregir un tramo de un video ya hecho? (admite un video de referencia). */
export const corrigeTramos = (modelo) => (modelo?.video ?? 0) > 0;

/** El modelo para corregir un tramo: Gemini Omni por Kie si hay llave; si no, otro que admita un video. */
export function modeloParaTramo(activos = {}) {
  return ["gemini-omni-kie", "kling-3-omni-kie", "seedance-2-kie"].map(modeloPorId).find((m) => m && activos[m.motor]) ?? null;
}

/**
 * El pedido de UN fotograma (imagen 9:16), con las referencias por importancia: el anterior y el primero (la
 * continuidad), los personajes, el producto y lo puesto a mano, hasta lo que admita el modelo. `anterior`/`primero`:
 * { clave } o null; `personajes`: [{ clave, nota }]; `fotos`: claves; `referencias`: [{ clave, toma, nota }]. Pura.
 */
export function pedidoDeFotogramaReel({ modelo, plano, total, hilo = "", estilo = "", personajes = [], fotos = [], referencias = [], anterior = null, primero = null }) {
  const max = modelo?.referencias || 0;
  const claves = [anterior?.clave, primero?.clave, ...personajes.map((p) => p.clave), ...fotos, ...referencias.map((r) => r.clave)].filter(Boolean);
  const reference = [...new Set(claves)].slice(0, max);
  const quienes = personajes.filter((p) => reference.includes(p.clave)).map((p) => `Una de las referencias ${p.nota}.`);
  // Lo puesto a mano dice qué se toma de ello, con su número en el orden en que se manda.
  const deLaMano = referencias.map((r) => (reference.includes(r.clave) ? lineaDeReferencia(r, reference.indexOf(r.clave) + 1) : "")).filter(Boolean);
  const prompt = [pedidoDeFotograma({
    plano, total, hilo, estilo, personajes: [...new Set(quienes)].join(" "),
    conAnteriores: Boolean(anterior || primero), conFotos: fotos.some((f) => reference.includes(f)),
  }), ...deLaMano].join("\n\n").slice(0, 3800);
  const medios = reference.length ? { reference } : {};
  return { modelo: modelo.id, prompt, n: 1, ajustes: ajustesDe(modelo, { aspectRatio: "9:16", imageSize: "2K" }, medios), medios };
}

/**
 * El pedido del VIDEO (sin pedirlo): con referencias, el storyboard (repartido en los huecos del modelo); si el modelo
 * sólo admite imagen inicial, el primer fotograma. `sinVoz`: la locución la pondrá el MONTAJE (ElevenLabs), así que el
 * modelo no dice nada: música y efectos. Pura salvo por los imports.
 */
export function pedidoDeVideo({ modelo, planos, hilo = "", sonido = "", musica = "", locucion = "", efectos = "", voz = "", segundos = 10, estilo = "", personajes = "", fotogramas = [], sinVoz: sinVozPedido = false }) {
  const max = modelo.referencias || 0;
  const storyboard = max >= 2 ? fotogramasParaVideo(fotogramas, max).map((a) => a.clave) : [];
  const medios = storyboard.length ? { reference: storyboard } : modelo.inicial && fotogramas[0] ? { start: [fotogramas[0].clave] } : {};
  const duracion = ajusteDeDuracion(modelo, segundos) ?? undefined;
  // Seedance y Wan inventan la voz (mal, en español): van sin ella, con música y efectos. Con montaje, nadie habla aquí.
  const sinVoz = sinVozPedido || sinVozPropia(modelo);
  // La voz escogida sólo la entiende el modelo que la tiene en su catálogo (Omni por Kie), y no con imagen inicial.
  const conVoz = !sinVoz && voz && modelo.ajustes?.voz?.valores?.includes(voz) && !medios.start;
  return {
    modelo: modelo.id, n: 1, medios,
    prompt: promptDeReel({ planos, hilo, sonido, musica, locucion: sinVoz ? "" : locucion, efectos, segundos, estilo, personajes, conStoryboard: storyboard.length > 0, sinVoz }),
    ajustes: ajustesDe(modelo, { aspectRatio: "9:16", ...(duracion ? { duration: duracion } : {}), ...(conVoz ? { voz } : {}) }, medios),
  };
}

// ------------------------------------------------------------
// «Un clip limpio por fotograma»: cada fotograma del storyboard arranca su propio clip (sin texto, sin voz ni música).
// Se montan AQUÍ («Montarlo aquí»: lib/montajeReel.js) o se bajan juntos en un ZIP para CapCut.
// ------------------------------------------------------------

/** Los modelos que animan un fotograma (imagen inicial), del más barato al más caro. */
export function modelosParaClips(activos = {}) {
  return porPrecio(MODELOS.filter((m) => m.tipo === "video" && m.inicial && !m.necesitaVideo && (m.motor === "prueba" || activos[m.motor])), activos);
}

/**
 * El orden de los modelos para los CLIPS de un reel (cada uno arranca de su fotograma revisado). Primero Veo 3.1 Lite por
 * Kie: en la prueba del método de agencia fue el más barato (~0,03 $/s) que deja el producto fiel. Luego Kling 3.0 y
 * los que le siguen.
 */
export const PREFERIDOS_CLIPS = Object.freeze(["veo-3-1-lite-kie", "kling-3-kie", "seedance-2-5-kie", "seedance-2-kie", "wan-3-kie", "hailuo-2-3-kie", "minimax-h3-kie"]);

/** El que se escoge si nadie escoge: el primero de `PREFERIDOS_CLIPS` con llave. */
export function modeloParaClips(activos = {}) {
  const lista = modelosParaClips(activos);
  return PREFERIDOS_CLIPS
    .map((id) => lista.find((m) => m.id === id)).find(Boolean) ?? lista.find((m) => m.motor !== "prueba") ?? lista[0] ?? null;
}

/** El pedido de UN clip limpio que arranca en su fotograma (sin pedirlo). `fotograma`: { clave }. Pura salvo por los imports. */
export function pedidoDeClip({ modelo, plano, fotograma, hilo = "", estilo = "", personajes = "", segundos = 5 }) {
  const medios = { start: [fotograma.clave] };
  const duracion = ajusteDeDuracion(modelo, segundos) ?? undefined;
  return {
    modelo: modelo.id, n: 1, medios,
    // En el orden fijo (sujeto → acción → luz → cámara) y como mucho 1.000 caracteres (pedidoVideo.js): lo que no se
    // recorta nunca es que arranca en la imagen, un solo plano, sin voz ni música y sin texto.
    prompt: armarPedidoVideo({
      inicio: `Video vertical 9:16${duracion ? ` de ${duracion} segundos` : ""} que arranca EXACTAMENTE en esta imagen y la anima, calidad de anuncio profesional.`,
      sujeto: personajes,
      accion: `Qué pasa: ${String(plano.escena ?? "").trim()}`,
      luz: [hilo ? `Lo que se mantiene: ${hilo}` : "", estilo],
      camara: plano.camara ? `Cámara: ${plano.camara}.` : "",
      fin: [
        "Un solo plano continuo, sin cortes; los personajes, el producto y la luz, iguales a la imagen.",
        "Sin voz ni música: el sonido se pone en la edición.",
        SIN_TEXTO_VIDEO,
      ],
    }),
    ajustes: ajustesDe(modelo, { aspectRatio: "9:16", ...(duracion ? { duration: duracion } : {}), sonido: "no" }, medios),
  };
}
