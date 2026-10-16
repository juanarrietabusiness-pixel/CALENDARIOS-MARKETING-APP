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
import { controlarYCorregir } from "./controlEstudio";
import { pedidoDeCorreccion } from "./estudio";
import { ajustesDe, modeloPorId, MODELOS, porPrecio } from "./estudioCatalogo";
import { pedidoDeLamina, referenciasDeLamina } from "./carrusel";
import { componerLamina } from "./textoSobreImagen";
import { conLogoSiToca } from "./logoEstudio";

/**
 * Con el logo ESTAMPADO en el kit (`estampar`: el kit), la lámina final lleva el logo pegado encima; la cruda no (es la
 * que va de referencia a la siguiente y la que se corrige). Sin kit, la misma.
 */
async function conSello({ crudo, final }, { clienteId, estampar, carpetaId }) {
  if (!estampar) return { crudo, final };
  return { crudo, final: await conLogoSiToca({ clienteId, archivo: final, kit: estampar, carpetaId }) };
}

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

/** Los modelos que sirven para un carrusel (imagen, con al menos dos referencias), del más barato al más caro. */
export function modelosParaCarrusel(activos = {}) {
  return porPrecio(MODELOS.filter((m) => m.tipo === "imagen" && m.referencias >= 2 && (m.motor === "prueba" || activos[m.motor])), activos);
}

/** Espera a que un trabajo termine, avanzándolo. Devuelve el (primer) archivo creado o lanza el motivo. */
export async function esperarArchivo(clienteId, trabajo, opciones = {}) {
  return (await esperarArchivos(clienteId, trabajo, opciones))[0];
}

/** Lo mismo, con TODOS los archivos del trabajo (un pedido de 2 o 3 variantes), en el orden en que salieron. */
export async function esperarArchivos(clienteId, trabajo, { seguir = () => true } = {}) {
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
  if (t.estado !== "hecho") throw new Error(t.error || "La pieza no salió.");
  const g = await api.leerEstudio(clienteId);
  // La cruda: una pieza con el texto de la plantilla encima hereda el trabajo de la suya (lib/loteEstudio.js).
  const archivos = (g?.archivos ?? []).filter((a) => a.trabajoId === t.id && !a.ajustes?.plantilla).reverse();
  if (!archivos.length) throw new Error("La pieza se creó pero no aparece en la galería.");
  return archivos;
}

/**
 * Crea UNA lámina. `anterior` y `portada` son los archivos crudos (sin texto de plantilla) ya hechos.
 * → { crudo, final } (en el modo «ia», los dos son el mismo archivo).
 */
export async function crearLamina({
  clienteId, modelo, lamina, total, idea = "", preset = "", modo = "ia", plantilla = "banda", hilo = "", personajes = [],
  anterior = null, portada = null, fotos = [], logo = "", colores, familia = "", fuente = null, calendarId = null, postId = null, carpetaId = null, seguir,
  estampar = null, tipografia = null, controlar = false, activos = {},
}) {
  // Los personajes van justo después de la serie (la anterior y la portada): que salgan IGUAL en cada lámina. La
  // muestra de la tipografía de la marca, sólo si el texto lo escribe el modelo.
  const letra = modo === "plantilla" ? null : tipografia;
  const clavesPersonajes = personajes.map((p) => p.clave);
  const reference = referenciasDeLamina({ anterior: anterior?.clave, portada: portada?.clave, fotos: [...clavesPersonajes, ...(letra ? [letra.clave] : []), ...fotos], logo, max: modelo.referencias || 0 });
  const quienes = [...personajes, ...(letra ? [letra] : [])].filter((p) => reference.includes(p.clave)).map((p) => p.nota).filter(Boolean);
  const prompt = pedidoDeLamina({
    lamina, total, idea, preset, modo, plantilla, hilo,
    personajes: [...new Set(quienes)].map((n) => `Una de las referencias ${n}.`).join(" "),
    conAnteriores: Boolean(anterior || portada), conFotos: fotos.some((f) => reference.includes(f)),
  });
  const medios = reference.length ? { reference } : {};
  const { trabajo } = await api.pedirImagenes(clienteId, {
    modelo: modelo.id, prompt, n: 1, ajustes: ajustesDe(modelo, { aspectRatio: "4:5", imageSize: "2K" }, medios), medios,
    confirmado: true, ...(calendarId && postId ? { calendarId, postId } : {}), ...(carpetaId ? { carpetaId } : {}),
  });
  let crudo = await esperarArchivo(clienteId, trabajo, { seguir });
  // El control de calidad: si el modelo escribió mal una letra, se corrige ANTES de que la lámina vaya de referencia
  // a la siguiente (si no, el error se copiaría en toda la serie).
  let control = null;
  if (controlar && modo !== "plantilla") {
    const r = await controlarYCorregir({ clienteId, archivo: crudo, texto: lamina.texto, activos, carpetaId, seguir });
    crudo = r.archivo;
    control = r.control;
  }
  const final = modo === "plantilla" ? await textoEncima({ clienteId, crudo, lamina, plantilla, colores, familia, fuente, carpetaId }) : crudo;
  return { ...(await conSello({ crudo, final }, { clienteId, estampar, carpetaId })), control };
}

/** En el modo plantilla: el texto exacto encima de la lámina cruda, subido como imagen nueva. */
async function textoEncima({ clienteId, crudo, lamina, plantilla, colores, familia, fuente = null, carpetaId = null }) {
  const blob = await componerLamina({ src: crudo.src, texto: lamina.texto, plantilla, colores, familia, fuente });
  const { archivo } = await api.subirImagen(clienteId, new File([blob], `lamina-${lamina.n}.jpg`, { type: "image/jpeg" }), { carpetaId, origenId: crudo.id, plantilla: { texto: lamina.texto, plantilla } });
  return archivo;
}

/**
 * «Corregir esta lámina» con una indicación («cambia "en ca" por "en"»): se EDITA la lámina (todo lo demás se
 * conserva) con el mismo modelo, y sale una nueva; la de antes se queda en la galería. En el modo plantilla se corrige
 * la cruda y el texto se vuelve a poner encima. → { crudo, final }.
 */
export async function corregirLamina({ clienteId, modelo, resultado, instruccion, ejemplos = [], lamina, modo = "ia", plantilla = "banda", colores, familia = "", fuente = null, carpetaId = null, seguir, estampar = null }) {
  // Se corrige la cruda (en «ia», la cruda ES la final, salvo que lleve el logo estampado encima: ése se vuelve a poner).
  const base = resultado.crudo ?? resultado.final;
  // La lámina va primero; los ejemplos de la galería (si los hay) detrás, como guía de lo que se pide.
  const { prompt, medios } = pedidoDeCorreccion({ clave: base.clave, instruccion, ejemplos, modelo });
  const { trabajo } = await api.pedirImagenes(clienteId, {
    modelo: modelo.id, prompt, n: 1, ajustes: ajustesDe(modelo, { aspectRatio: "4:5", imageSize: "2K" }, medios), medios,
    confirmado: true, ...(carpetaId ? { carpetaId } : {}),
  });
  const crudo = await esperarArchivo(clienteId, trabajo, { seguir });
  const final = modo === "plantilla" ? await textoEncima({ clienteId, crudo, lamina, plantilla, colores, familia, fuente, carpetaId }) : crudo;
  return conSello({ crudo, final }, { clienteId, estampar, carpetaId });
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
