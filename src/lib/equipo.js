// ------------------------------------------------------------
// El equipo, desde el navegador
//
// Nada de esto manda un `ownerId`: el espacio sale de la sesión, en el
// servidor. Si viajara desde aquí sería un campo más del cuerpo, y un
// campo del cuerpo lo escribe quien quiera.
// ------------------------------------------------------------

import { pedir } from "./db";

export async function cargarEquipo() {
  return pedir("/equipo");
}

/**
 * Crea una invitación y devuelve su testigo.
 *
 * El testigo llega UNA sola vez, aquí: en la base sólo queda su huella.
 * Por eso la pantalla lo enseña para copiar en el momento y no ofrece
 * «volver a verlo» —no existe— sino «invitar otra vez».
 */
export async function invitar({ email = "", nombre = "", rol = "editor", papel = null, clientes = null } = {}) {
  return pedir("/equipo/invitacion", {
    method: "POST",
    body: JSON.stringify({ email, nombre, rol, papel: papel ?? rol, clientes }),
  });
}

/** Administrador, editor, colaborador (sólo `clientes`) o sólo lectura. */
export async function cambiarPapel(userId, { papel, clientes = null }) {
  return pedir(`/equipo/miembro/${encodeURIComponent(userId)}`, { method: "PUT", body: JSON.stringify({ papel, clientes }) });
}

/** El papel que se enseña, a partir de lo que guarda el servidor. */
export function papelDe(m) {
  if (m?.rol === "admin") return "admin";
  if (m?.soloLectura) return "lectura";
  if (Array.isArray(m?.clientes)) return "colaborador";
  return "editor";
}

export const PAPELES = [
  ["admin", "Administra", "Todo: invitar, cambiar papeles, borrar clientes o calendarios y publicar al momento."],
  ["editor", "Edita", "Todos los clientes. No borra clientes ni calendarios enteros ni publica al momento."],
  ["colaborador", "Colaborador", "Como Edita, pero sólo ve y toca los clientes que elijas."],
  ["lectura", "Sólo lectura", "Mira todo, no cambia nada."],
];

export async function retirarInvitacion(id) {
  await pedir(`/equipo/invitacion/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function sacarMiembro(userId) {
  await pedir(`/equipo/miembro/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export async function guardarMiPerfil({ nombre, color }) {
  return pedir("/equipo/yo", { method: "PUT", body: JSON.stringify({ nombre, color }) });
}

/** El enlace entero, listo para pegar en un mensaje. */
export function enlaceDeInvitacion(testigo) {
  return `${window.location.origin}/invitacion/${encodeURIComponent(testigo)}`;
}

// ---- lo público: lo llama quien todavía no tiene cuenta --------------

export async function leerInvitacion(testigo) {
  return pedir(`/invitacion/${encodeURIComponent(testigo)}`);
}

export async function aceptarInvitacion(testigo, { email, password, nombre }) {
  return pedir(`/invitacion/${encodeURIComponent(testigo)}`, {
    method: "POST",
    body: JSON.stringify({ email, password, nombre }),
  });
}
