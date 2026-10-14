// ============================================================
// Crear el reel en el Estudio: los fotogramas, el video y las correcciones
//
// Los fotogramas se piden EN ORDEN (cada uno con el anterior, el primero y
// los personajes de referencia: así parecen planos de la misma pieza), como
// las láminas de un carrusel. El video va con los fotogramas como storyboard
// (o, si el modelo no admite referencias, con el primero como imagen
// inicial). Todo queda en la galería, en la carpeta del reel.
// ============================================================

import * as api from "./estudio";
import { ajustesDe, MODELOS, modeloPorId, porPrecio } from "./estudioCatalogo";
import { esperarArchivo } from "./carruselEstudio";
import { pedidoDeFotograma, promptDeReel, promptDeTramo, fotogramasParaVideo } from "./reel";
import { lineaDeReferencia } from "./referencias";
import { ajusteDeDuracion } from "./videoCorto";

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

/** UN fotograma: el plano en 9:16, con el anterior, el primero, los personajes y el producto de referencia. → archivo. */
export async function crearFotograma({ clienteId, modelo, plano, total, hilo = "", estilo = "", personajes = [], fotos = [], referencias = [], anterior = null, primero = null, carpetaId = null, seguir }) {
  const max = modelo.referencias || 0;
  // Por importancia: el anterior y el primero (continuidad), los personajes, el producto y lo puesto a mano.
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
  const { trabajo } = await api.pedirImagenes(clienteId, {
    modelo: modelo.id, prompt, n: 1, ajustes: ajustesDe(modelo, { aspectRatio: "9:16", imageSize: "2K" }, medios), medios,
    confirmado: true, ...(carpetaId ? { carpetaId } : {}),
  });
  return esperarArchivo(clienteId, trabajo, { seguir });
}

/** Todos los fotogramas en orden. `alAvanzar(i, { archivo } | { error })`. Un error de presupuesto para todo. */
export async function crearFotogramas({ planos, alAvanzar = () => {}, seguir = () => true, ...comun }) {
  const salida = [];
  let primero = null;
  let anterior = null;
  for (const [i, plano] of planos.entries()) {
    if (!seguir()) break;
    try {
      const archivo = await crearFotograma({ ...comun, plano, total: planos.length, anterior, primero: primero !== anterior ? primero : null, seguir });
      salida[i] = { archivo };
      anterior = archivo;
      primero ??= archivo;
    } catch (e) {
      salida[i] = { error: e.message };
      alAvanzar(i, salida[i]);
      if (e.datos?.codigo === "presupuesto") break;
      continue;
    }
    alAvanzar(i, salida[i]);
  }
  return salida;
}

/** Editar UNA imagen con una indicación (lo demás se conserva): sale una nueva. → archivo. */
export async function editarImagen({ clienteId, modelo, archivo, instruccion, ejemplos = [], aspectRatio = "9:16", carpetaId = null, seguir }) {
  const { prompt, medios } = api.pedidoDeCorreccion({ clave: archivo.clave, instruccion, ejemplos, modelo });
  const { trabajo } = await api.pedirImagenes(clienteId, {
    modelo: modelo.id, prompt, n: 1, ajustes: ajustesDe(modelo, { aspectRatio, imageSize: "2K" }, medios), medios,
    confirmado: true, ...(carpetaId ? { carpetaId } : {}),
  });
  return esperarArchivo(clienteId, trabajo, { seguir });
}

/**
 * El pedido del VIDEO (sin pedirlo): con referencias, el storyboard (repartido en los huecos del modelo); si el modelo
 * sólo admite imagen inicial, el primer fotograma. Pura salvo por los imports.
 */
export function pedidoDeVideo({ modelo, planos, hilo = "", sonido = "", musica = "", locucion = "", efectos = "", voz = "", segundos = 10, estilo = "", personajes = "", fotogramas = [] }) {
  const max = modelo.referencias || 0;
  const storyboard = max >= 2 ? fotogramasParaVideo(fotogramas, max).map((a) => a.clave) : [];
  const medios = storyboard.length ? { reference: storyboard } : modelo.inicial && fotogramas[0] ? { start: [fotogramas[0].clave] } : {};
  const duracion = ajusteDeDuracion(modelo, segundos) ?? undefined;
  // La voz escogida sólo la entiende el modelo que la tiene en su catálogo (Omni por Kie), y no con imagen inicial.
  const conVoz = voz && modelo.ajustes?.voz?.valores?.includes(voz) && !medios.start;
  return {
    modelo: modelo.id, n: 1, medios,
    prompt: promptDeReel({ planos, hilo, sonido, musica, locucion, efectos, segundos, estilo, personajes, conStoryboard: storyboard.length > 0 }),
    ajustes: ajustesDe(modelo, { aspectRatio: "9:16", ...(duracion ? { duration: duracion } : {}), ...(conVoz ? { voz } : {}) }, medios),
  };
}

/** Pide el video y espera a que llegue (tarda minutos). → archivo. */
export async function crearVideo({ clienteId, pedido, carpetaId = null, calendarId = null, postId = null, seguir }) {
  const { trabajo } = await api.pedirImagenes(clienteId, {
    ...pedido, confirmado: true, ...(carpetaId ? { carpetaId } : {}), ...(calendarId && postId ? { calendarId, postId } : {}),
  });
  return esperarArchivo(clienteId, trabajo, { seguir });
}

/** «Del segundo X al Y: …»: el video hecho va de referencia y sale una versión nueva. → archivo. */
export async function corregirTramo({ clienteId, modelo, video, desde, hasta, cambio, ejemplos = [], segundos = 10, carpetaId = null, seguir }) {
  // Con el video caben 5 imágenes en Omni (el video ocupa dos de los 7 huecos): los ejemplos de la galería, como guía.
  const caben = ejemplos.filter((e) => e?.clave).slice(0, Math.max(0, Math.min(5, (modelo.referencias || 0))));
  const medios = { video: [video.clave], ...(caben.length ? { reference: caben.map((e) => e.clave) } : {}) };
  const lineas = caben.map((r, i) => lineaDeReferencia(r, i + 1) || `Imagen de referencia ${i + 1}: es un EJEMPLO de lo que se pide en ese tramo.`);
  const { trabajo } = await api.pedirImagenes(clienteId, {
    modelo: modelo.id, n: 1, prompt: [promptDeTramo({ desde, hasta, cambio }), ...lineas].join("\n"), medios,
    ajustes: ajustesDe(modelo, { aspectRatio: "9:16", duration: ajusteDeDuracion(modelo, segundos) ?? undefined }, medios),
    confirmado: true, ...(carpetaId ? { carpetaId } : {}),
  });
  return esperarArchivo(clienteId, trabajo, { seguir });
}
