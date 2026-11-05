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
import { ajustesDe } from "./estudioCatalogo";
import { esperarArchivo } from "./carruselEstudio";
import { promptDeTramo } from "./reel";
import { lineaDeReferencia } from "./referencias";
import { ajusteDeDuracion } from "./videoCorto";
import { pedidoDeFotogramaReel, pedidoDeClip } from "./reelPedidos.js";

// Lo puro (los pedidos y los modelos) vive en reelPedidos.js: también lo arma el Worker (el reel como encargo).
export {
  modelosParaReel, modeloRecomendadoParaReel, corrigeTramos, modeloParaTramo, pedidoDeVideo, modelosParaClips, modeloParaClips,
  pedidoDeClip, pedidoDeFotogramaReel,
} from "./reelPedidos.js";

/** UN fotograma: el plano en 9:16, con el anterior, el primero, los personajes y el producto de referencia. → archivo. */
export async function crearFotograma({ clienteId, modelo, plano, total, hilo = "", estilo = "", personajes = [], fotos = [], referencias = [], anterior = null, primero = null, carpetaId = null, seguir }) {
  const pedido = pedidoDeFotogramaReel({ modelo, plano, total, hilo, estilo, personajes, fotos, referencias, anterior, primero });
  const { trabajo } = await api.pedirImagenes(clienteId, { ...pedido, confirmado: true, ...(carpetaId ? { carpetaId } : {}) });
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

// ------------------------------------------------------------
// «Un video limpio por fotograma»: el método de la agencia en Flow. Cada fotograma del storyboard arranca su propio
// clip (sin texto, sin voz ni música: el sonido, el texto y el orden se ponen en CapCut) y se bajan juntos en un ZIP.
// ------------------------------------------------------------

/**
 * Todos los clips a la vez (cada uno es un trabajo del Estudio aparte: no dependen entre sí). `fotogramas[i]` es el
 * archivo del plano i (o null: ese plano no lleva clip). → [{ archivo } | { error } | null], en el orden de los planos.
 */
export async function crearClips({ clienteId, modelo, planos, fotogramas, hilo, estilo, personajes, segundos, carpetaId = null, alAvanzar = () => {}, seguir }) {
  return Promise.all(planos.map(async (plano, i) => {
    const fotograma = fotogramas[i];
    if (!fotograma) return null;
    try {
      const pedido = pedidoDeClip({ modelo, plano, fotograma, hilo, estilo, personajes, segundos });
      const { trabajo } = await api.pedirImagenes(clienteId, { ...pedido, confirmado: true, ...(carpetaId ? { carpetaId } : {}) });
      const r = { archivo: await esperarArchivo(clienteId, trabajo, { seguir }) };
      alAvanzar(i, r);
      return r;
    } catch (e) {
      const r = { error: e.message };
      alAvanzar(i, r);
      return r;
    }
  }));
}
