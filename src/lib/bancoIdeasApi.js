// ============================================================
// Cliente de /api/banco-ideas: el banco de ideas único de la agencia
//
// `clienteId` vacío o null = idea GENERAL (sale en el banco de todos). Tras
// añadir, quitar o asignar se lanza `banco-ideas` en `window`: el eco de la
// propia pestaña no llega por el socket, y el banco del calendario, la
// pestaña Ideas y «Guardar referencia» tienen que verse entre sí.
// ============================================================

import { pedir } from "./db";

const BASE = "/banco-ideas";
const json = (metodo, datos) => ({ method: metodo, body: JSON.stringify(datos ?? {}) });
const avisar = () => { try { window.dispatchEvent(new CustomEvent("banco-ideas", { detail: { local: true } })); } catch { /* sin ventana */ } };

/** Todas las que se pueden ver (la capa acota las de un colaborador). */
export async function listarBanco() {
  return (await pedir(BASE))?.ideas ?? [];
}

export async function anadirAlBanco(idea, clienteId) {
  const r = (await pedir(BASE, json("POST", { clienteId: clienteId || null, idea })))?.idea;
  avisar();
  return r;
}

/** Cambia la idea. Con `clienteId` (también null) la cambia de cliente; sin él, se queda donde estaba. */
export async function cambiarEnBanco(idea, { clienteId } = {}) {
  const cuerpo = { idea };
  if (clienteId !== undefined) cuerpo.clienteId = clienteId || null;
  const r = (await pedir(`${BASE}/${encodeURIComponent(idea.id)}`, json("PUT", cuerpo)))?.idea;
  if (clienteId !== undefined) avisar();
  return r;
}

export async function quitarDelBanco(id) {
  await pedir(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });
  avisar();
}

/** Abre «Guardar referencia» (vive en App: también se abre desde la cabecera y la barra del móvil). */
export function abrirGuardarReferencia(clienteId = null) {
  try { window.dispatchEvent(new CustomEvent("guardar-referencia", { detail: { clienteId } })); } catch { /* sin ventana */ }
}
