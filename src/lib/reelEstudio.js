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
import { ajustesDe, MODELOS, modeloPorId } from "./estudioCatalogo";
import { esperarArchivo } from "./carruselEstudio";
import { pedidoDeFotograma, promptDeReel, promptDeTramo, fotogramasParaVideo } from "./reel";
import { ajusteDeDuracion } from "./videoCorto";

/** Los modelos que sirven para el VIDEO de un reel: Omni por Kie primero (storyboard y corregir un tramo). */
export function modelosParaReel(activos = {}) {
  const preferidos = ["gemini-omni-kie", "kling-3-omni-kie", "seedance-2-kie", "gemini-omni-flash", "kling-3-kie", "veo-3-1-fast-kie"];
  const usables = MODELOS.filter((m) => m.tipo === "video" && (m.referencias >= 2 || m.inicial) && !m.necesitaVideo && (m.motor === "prueba" || activos[m.motor]));
  const orden = (m) => { const i = preferidos.indexOf(m.id); return i < 0 ? 99 : i; };
  return usables.sort((a, b) => orden(a) - orden(b) || (a.motor === "prueba") - (b.motor === "prueba"));
}

/** ¿Este modelo puede corregir un tramo de un video ya hecho? (admite un video de referencia). */
export const corrigeTramos = (modelo) => (modelo?.video ?? 0) > 0;

/** El modelo para corregir un tramo: Gemini Omni por Kie si hay llave; si no, otro que admita un video. */
export function modeloParaTramo(activos = {}) {
  return ["gemini-omni-kie", "kling-3-omni-kie", "seedance-2-kie"].map(modeloPorId).find((m) => m && activos[m.motor]) ?? null;
}

/** UN fotograma: el plano en 9:16, con el anterior, el primero, los personajes y el producto de referencia. → archivo. */
export async function crearFotograma({ clienteId, modelo, plano, total, hilo = "", estilo = "", personajes = [], fotos = [], anterior = null, primero = null, carpetaId = null, seguir }) {
  const max = modelo.referencias || 0;
  const claves = [anterior?.clave, primero?.clave, ...personajes.map((p) => p.clave), ...fotos].filter(Boolean);
  const reference = [...new Set(claves)].slice(0, max);
  const quienes = personajes.filter((p) => reference.includes(p.clave)).map((p) => `Una de las referencias ${p.nota}.`);
  const prompt = pedidoDeFotograma({
    plano, total, hilo, estilo, personajes: [...new Set(quienes)].join(" "),
    conAnteriores: Boolean(anterior || primero), conFotos: fotos.some((f) => reference.includes(f)),
  });
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
export async function editarImagen({ clienteId, modelo, archivo, instruccion, aspectRatio = "9:16", carpetaId = null, seguir }) {
  const medios = { reference: [archivo.clave] };
  const { trabajo } = await api.pedirImagenes(clienteId, {
    modelo: modelo.id, prompt: api.promptDeEdicion(instruccion), n: 1, ajustes: ajustesDe(modelo, { aspectRatio, imageSize: "2K" }, medios), medios,
    confirmado: true, ...(carpetaId ? { carpetaId } : {}),
  });
  return esperarArchivo(clienteId, trabajo, { seguir });
}

/**
 * El pedido del VIDEO (sin pedirlo): con referencias, el storyboard (repartido en los huecos del modelo); si el modelo
 * sólo admite imagen inicial, el primer fotograma. Pura salvo por los imports.
 */
export function pedidoDeVideo({ modelo, planos, hilo = "", sonido = "", segundos = 10, estilo = "", personajes = "", fotogramas = [] }) {
  const max = modelo.referencias || 0;
  const storyboard = max >= 2 ? fotogramasParaVideo(fotogramas, max).map((a) => a.clave) : [];
  const medios = storyboard.length ? { reference: storyboard } : modelo.inicial && fotogramas[0] ? { start: [fotogramas[0].clave] } : {};
  const duracion = ajusteDeDuracion(modelo, segundos) ?? undefined;
  return {
    modelo: modelo.id, n: 1, medios,
    prompt: promptDeReel({ planos, hilo, sonido, segundos, estilo, personajes, conStoryboard: storyboard.length > 0 }),
    ajustes: ajustesDe(modelo, { aspectRatio: "9:16", ...(duracion ? { duration: duracion } : {}) }, medios),
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
export async function corregirTramo({ clienteId, modelo, video, desde, hasta, cambio, segundos = 10, carpetaId = null, seguir }) {
  const medios = { video: [video.clave] };
  const { trabajo } = await api.pedirImagenes(clienteId, {
    modelo: modelo.id, n: 1, prompt: promptDeTramo({ desde, hasta, cambio }), medios,
    ajustes: ajustesDe(modelo, { aspectRatio: "9:16", duration: ajusteDeDuracion(modelo, segundos) ?? undefined }, medios),
    confirmado: true, ...(carpetaId ? { carpetaId } : {}),
  });
  return esperarArchivo(clienteId, trabajo, { seguir });
}
