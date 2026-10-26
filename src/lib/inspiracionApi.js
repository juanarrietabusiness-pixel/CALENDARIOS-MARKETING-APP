// ============================================================
// Cliente de /api/inspiracion: lo que publican las cuentas de cada cliente
//
// Las cuentas se cambian con la ficha del cliente (`competidores`); aquí se
// lee el feed guardado, se pone al día, se trae el archivo de una
// publicación a la galería y se pide el resumen de lo que funciona. Lo que
// gasta IA relee el medidor de la cabecera al terminar.
// ============================================================

import { pedir } from "./db";

const base = (clienteId) => `/inspiracion/${encodeURIComponent(clienteId)}`;
const post = (cuerpo) => ({ method: "POST", body: JSON.stringify(cuerpo ?? {}) });

/** El feed guardado → { cuentas, faltan, publicaciones }. Sólo lee. */
export const leerInspiracion = (clienteId) => pedir(base(clienteId));

/** Leer otra vez las cuentas (todas, o las claves «red:usuario» de `cuentas`) → el feed, con `errores` y `avisos`. */
export const actualizarInspiracion = (clienteId, cuentas = null) => pedir(`${base(clienteId)}/actualizar`, post(cuentas?.length ? { cuentas } : {}));

/** El archivo de una publicación del feed a la galería («Competencia») → { archivo, publicacion, usuario }. */
export const traerDeInspiracion = (clienteId, id, { miniatura = false } = {}) =>
  pedir(`${base(clienteId)}/traer`, post({ id, ...(miniatura ? { miniatura: true } : {}) }));

/** «Lo que funciona en tu competencia»: la IA lo propone → { titulo, texto, existente, publicaciones, aviso }. No guarda. */
export async function proponerResumen(clienteId) {
  try {
    return await pedir(`${base(clienteId)}/resumen`, post({}));
  } finally {
    try { window.dispatchEvent(new Event("ia:gasto")); } catch { /* sin ventana */ }
  }
}
