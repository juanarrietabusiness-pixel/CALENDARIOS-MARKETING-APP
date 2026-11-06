// ============================================================
// Las ESTRUCTURAS DE GUION de la agencia, para quien escribe en el Worker
//
// Son las filas de `formulas_ugc` (del ESPACIO: sin cliente), limpias y con su `para` (lo puro, en
// src/lib/formulasUgc.js). Las leen la ruta (/api/formulas-ugc, y su otro nombre /api/estructuras-guion), el motor de
// ideas (los guiones UGC) y los dos que escriben una VOZ EN OFF: el video animado (worker/lib/estudio/guionAnimado.js)
// y el reel por planos (worker/lib/estudio/reel.js).
//
// `estructuraDeVoz` decide qué va al pedido: la escogida (en su duración) o, sin escoger, la lista de las de voz para
// que la IA escoja y diga cuál en el campo «estructura» de su JSON (`usadaEn` la vuelve id). Una escogida que ya no
// existe es un 400: se dice, no se escribe sin ella en silencio.
// ============================================================

import { limpiarFormula, estructurasPara, lineaDeFormula, bloqueDeFormulas, idDeEstructura, MAX_FORMULAS } from "../../src/lib/formulasUgc.js";

const ID = /^[\w-]{1,80}$/;

/** Un id de estructura tal cual llega (de la pantalla, de Claude): limpio o "". */
export const idEstructuraValido = (id) => (ID.test(String(id ?? "").trim()) ? String(id).trim() : "");

const leerDatos = (texto) => {
  try { return JSON.parse(texto); } catch { return {}; }
};

/** Una fila de `formulas_ugc` → la estructura limpia (con su id y cuándo se creó), o null si está rota. */
export function estructuraDeFila(f) {
  const e = limpiarFormula({ ...leerDatos(f?.datos), id: f?.id });
  return e ? { ...e, ...(f?.created_at ? { creada: f.created_at } : {}) } : null;
}

/** Las del espacio, las más nuevas primero. `para`: sólo las que sirven para «ugc» o «voz». */
export async function leerEstructuras(acceso, { para = "" } = {}) {
  const filas = await acceso.leer("formulas_ugc", {}, "created_at desc", MAX_FORMULAS);
  return estructurasPara(filas.map(estructuraDeFila).filter(Boolean), para);
}

/** Un error de lo pedido (la estructura escogida ya no está), con su estado HTTP. */
export class ErrorEstructura extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

/**
 * Lo que va al pedido de una VOZ EN OFF de `segundos`. Con `estructuraId`, ésa (aunque sólo sirva para UGC: la escogió
 * una persona) → { elegida, texto, lista: [elegida] }. Sin él, las de voz para que la IA escoja → { elegida: null, texto,
 * lista } (texto vacío si no hay ninguna). Lanza ErrorEstructura si la escogida no existe.
 */
export async function estructuraDeVoz(acceso, { estructuraId = "", segundos = 30 } = {}) {
  const pedida = String(estructuraId ?? "").trim();
  const id = idEstructuraValido(pedida);
  if (pedida && !id) throw new ErrorEstructura("Esa estructura de guion no existe.");
  const todas = await leerEstructuras(acceso).catch(() => []);
  if (id) {
    const elegida = todas.find((f) => f.id === id);
    if (!elegida) throw new ErrorEstructura("Esa estructura de guion ya no está: escoge otra o deja que la IA escoja.");
    return { elegida, lista: [elegida], texto: lineaDeFormula(elegida, segundos, { uso: "voz" }) };
  }
  const lista = estructurasPara(todas, "voz");
  return { elegida: null, lista, texto: bloqueDeFormulas(lista, segundos, { uso: "voz", campo: "estructura" }) };
}

/**
 * La estructura que siguió el guion: la escogida o, si la IA escogió, la que dice su campo «estructura». → { id, nombre }
 * o null.
 */
export function usadaEn(eleccion, nombreDicho = "") {
  if (eleccion?.elegida) return { id: eleccion.elegida.id, nombre: eleccion.elegida.nombre };
  const id = idDeEstructura(nombreDicho, eleccion?.lista ?? []);
  const f = id ? eleccion.lista.find((x) => x.id === id) : null;
  return f ? { id: f.id, nombre: f.nombre } : null;
}

/** ¿Existe en el espacio? (lo que manda la pantalla al guardar un video, antes de apuntarlo). → el id o "". */
export async function estructuraExistente(acceso, estructuraId) {
  const id = idEstructuraValido(estructuraId);
  if (!id) return "";
  const fila = await acceso.leerUno("formulas_ugc", { id }).catch(() => null);
  return fila ? id : "";
}
