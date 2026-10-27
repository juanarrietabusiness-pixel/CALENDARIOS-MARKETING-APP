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

export async function crearConversacion(clienteId, titulo, tema = "") {
  return (await pedir(BASE, json("POST", { clienteId: clienteId || null, titulo, ...(tema ? { tema } : {}) })))?.conversacion;
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

// La del Estudio (tema «diseno») se recuerda aparte: abrir el director no cambia la del chat de siempre.
const claveUltima = (clienteId, tema = "") => `chat-ultima:${clienteId || "general"}${tema ? `:${tema}` : ""}`;

/** La conversación que esta persona tuvo abierta la última vez en este cliente (o en el general). */
export function leerUltima(clienteId, tema = "") {
  try { return localStorage.getItem(claveUltima(clienteId, tema)) || ""; } catch { return ""; }
}

export function guardarUltima(clienteId, id, tema = "") {
  try {
    if (id) localStorage.setItem(claveUltima(clienteId, tema), id);
    else localStorage.removeItem(claveUltima(clienteId, tema));
  } catch { /* sin almacenamiento: se abre la más reciente */ }
}
