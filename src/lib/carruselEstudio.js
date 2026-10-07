// ============================================================
// Crear las láminas de un carrusel en el Estudio, una a una
//
// Cada lámina es un trabajo del Estudio (se cobra y queda en la galería
// como cualquier otro). Se piden EN ORDEN porque cada una lleva de
// referencia la anterior y la portada: es lo que las hace de la misma
// serie. En el modo plantilla, lo que va de referencia es la imagen SIN
// texto (la cruda): con el texto puesto, el modelo lo copiaría.
//
// Lo usan «Crear carrusel con IA» (panel de la publicación) y «Producir
// el mes»: los dos en chunks aparte, porque esto arrastra el catálogo.
// ============================================================

import * as api from "./estudio";
import { ajustesDe, modeloPorId, MODELOS } from "./estudioCatalogo";
import { pedidoDeLamina, referenciasDeLamina } from "./carrusel";
import { componerLamina } from "./textoSobreImagen";

const TERMINADO = new Set(["hecho", "fallido", "cancelado"]);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * El modelo para un carrusel: Nano Banana si Google tiene llave (es el que hace bien los carruseles), si no el de
 * imagen por defecto que admita referencias, y si no hay ninguno, el de prueba.
 */
export function modeloParaCarrusel(activos = {}) {
  const deImagen = MODELOS.filter((m) => m.tipo === "imagen" && m.motor !== "prueba" && activos[m.motor] && m.referencias >= 2);
  return deImagen.find((m) => m.id === "nano-banana") ?? deImagen.find((m) => m.predeterminado) ?? deImagen[0] ?? modeloPorId("prueba");
}

/** Los modelos que sirven para un carrusel (imagen, con al menos dos referencias), el recomendado primero. */
export function modelosParaCarrusel(activos = {}) {
  const lista = MODELOS.filter((m) => m.tipo === "imagen" && m.referencias >= 2 && (m.motor === "prueba" || activos[m.motor]));
  const rec = modeloParaCarrusel(activos);
  return [rec, ...lista.filter((m) => m.id !== rec.id)];
}

/** Espera a que un trabajo termine, avanzándolo. Devuelve el archivo creado o lanza el motivo. */
async function esperarArchivo(clienteId, trabajo, { seguir = () => true } = {}) {
  let t = trabajo;
  while (!TERMINADO.has(t.estado)) {
    if (!seguir()) throw new Error("Se detuvo.");
    try {
      const r = await api.avanzarTrabajo(clienteId, t.id);
      if (r?.trabajo) t = r.trabajo;
    } catch (e) {
      if (e.estado !== 409) throw e;
    }
    if (!TERMINADO.has(t.estado)) await dormir(2000);
  }
  if (t.estado !== "hecho") throw new Error(t.error || "La lámina no salió.");
  const g = await api.leerEstudio(clienteId);
  const archivo = (g?.archivos ?? []).find((a) => a.trabajoId === t.id);
  if (!archivo) throw new Error("La lámina se creó pero no aparece en la galería.");
  return archivo;
}

/**
 * Crea UNA lámina. `anterior` y `portada` son los archivos crudos (sin texto de plantilla) ya hechos.
 * → { crudo, final } (en el modo «ia», los dos son el mismo archivo).
 */
export async function crearLamina({
  clienteId, modelo, lamina, total, idea = "", preset = "", modo = "ia", plantilla = "banda",
  anterior = null, portada = null, fotos = [], logo = "", colores, familia = "", calendarId = null, postId = null, seguir,
}) {
  const reference = referenciasDeLamina({ anterior: anterior?.clave, portada: portada?.clave, fotos, logo, max: modelo.referencias || 0 });
  const prompt = pedidoDeLamina({
    lamina, total, idea, preset, modo, plantilla,
    conAnteriores: Boolean(anterior || portada), conFotos: fotos.some((f) => reference.includes(f)),
  });
  const medios = reference.length ? { reference } : {};
  const { trabajo } = await api.pedirImagenes(clienteId, {
    modelo: modelo.id, prompt, n: 1, ajustes: ajustesDe(modelo, { aspectRatio: "4:5" }, medios), medios,
    confirmado: true, ...(calendarId && postId ? { calendarId, postId } : {}),
  });
  const crudo = await esperarArchivo(clienteId, trabajo, { seguir });
  if (modo !== "plantilla") return { crudo, final: crudo };
  const blob = await componerLamina({ src: crudo.src, texto: lamina.texto, plantilla, colores, familia });
  const { archivo: final } = await api.subirImagen(clienteId, new File([blob], `lamina-${lamina.n}.jpg`, { type: "image/jpeg" }));
  return { crudo, final };
}

/**
 * Todas las láminas, en orden. `alAvanzar(i, resultado)` se llama con cada una ({ crudo, final } o { error }).
 * Una que falla no para las demás: la siguiente toma de referencia la última que sí salió.
 * Un error de presupuesto sí para todo (las siguientes fallarían igual).
 */
export async function crearCarrusel({ laminas, alAvanzar = () => {}, seguir = () => true, ...comun }) {
  const salida = [];
  let portada = null;
  let anterior = null;
  for (const [i, lamina] of laminas.entries()) {
    if (!seguir()) break;
    try {
      const r = await crearLamina({ ...comun, lamina, total: laminas.length, anterior, portada: portada !== anterior ? portada : null, seguir });
      salida[i] = r;
      anterior = r.crudo;
      portada ??= r.crudo;
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
