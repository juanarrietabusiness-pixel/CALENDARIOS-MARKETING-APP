// ============================================================
// Cliente de /api/chat/conversaciones (lo usa sólo el asistente, que va lazy)
//
// `clienteId` vacío o null es el asistente general. La conversación que se
// abrió la última vez se recuerda POR NAVEGADOR y por cliente: cada persona
// vuelve a la suya, aunque la lista sea de todo el equipo.
// ============================================================

import { pedir } from "./db";

const BASE = "/chat/conversaciones";
const json = (metodo, datos) => ({ method: metodo, body: JSON.stringify(datos ?? {}) });

export async function listarConversaciones(clienteId) {
  const r = await pedir(`${BASE}${clienteId ? `?cliente=${encodeURIComponent(clienteId)}` : ""}`);
  return r?.conversaciones ?? [];
}

export async function crearConversacion(clienteId, titulo) {
  return (await pedir(BASE, json("POST", { clienteId: clienteId || null, titulo })))?.conversacion;
}

export async function renombrarConversacion(id, titulo) {
  return (await pedir(`${BASE}/${encodeURIComponent(id)}`, json("PATCH", { titulo })))?.conversacion;
}

export const borrarConversacion = (id) => pedir(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" });

export async function leerMensajes(id) {
  return (await pedir(`${BASE}/${encodeURIComponent(id)}/mensajes`))?.mensajes ?? [];
}

export const guardarMensaje = (id, role, content) => pedir(`${BASE}/${encodeURIComponent(id)}/mensajes`, json("POST", { role, content }));

/** La IA le pone título con el primer intercambio. → la conversación con su título. */
export async function titularConversacion(id) {
  return (await pedir(`${BASE}/${encodeURIComponent(id)}/titulo`, json("POST", {})))?.conversacion;
}

const claveUltima = (clienteId) => `chat-ultima:${clienteId || "general"}`;

/** La conversación que esta persona tuvo abierta la última vez en este cliente (o en el general). */
export function leerUltima(clienteId) {
  try { return localStorage.getItem(claveUltima(clienteId)) || ""; } catch { return ""; }
}

export function guardarUltima(clienteId, id) {
  try {
    if (id) localStorage.setItem(claveUltima(clienteId), id);
    else localStorage.removeItem(claveUltima(clienteId));
  } catch { /* sin almacenamiento: se abre la más reciente */ }
}
