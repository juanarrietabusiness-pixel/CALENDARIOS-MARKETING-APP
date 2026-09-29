// ============================================================
// El cerebro de un cliente, desde el navegador
//
// Llama a /api/cerebro. Las funciones lanzan `Error` con el mensaje del
// servidor, que ya viene en español y dice por qué —«Este cliente no
// tiene un repositorio…», «La carpeta … no existe»—: la pantalla lo
// enseña tal cual.
// ============================================================

import { contextoDelChat } from "./cerebroCliente";

const base = (clienteId) => `/api/cerebro/${encodeURIComponent(clienteId)}`;

async function llamar(ruta, { metodo = "GET", cuerpo } = {}) {
  let res;
  try {
    res = await fetch(ruta, {
      method: metodo,
      credentials: "same-origin",
      headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Revisa tu red.");
  }
  let datos = null;
  try { datos = await res.json(); } catch { /* la respuesta no era JSON */ }
  if (!res.ok) {
    if (datos?.error) throw new Error(datos.error);
    if (res.status === 401) throw new Error("La sesión caducó. Vuelve a entrar.");
    if (res.status === 403) throw new Error("Tu papel no permite cambiar el cerebro.");
    if (res.status === 404) throw new Error("No se encontró el cerebro de este cliente.");
    throw new Error(`El servidor respondió ${res.status}.`);
  }
  return datos;
}

/**
 * Toda llamada que cambia el cerebro suelta lo que el asistente recordaba de él: si no, quien corrige la ficha y
 * abre el chat un momento después le seguiría hablando con la de antes.
 */
async function cambiando(clienteId, hacer) {
  try {
    return await hacer();
  } finally {
    contextoDelChat.olvidar(clienteId);
  }
}

/** Las notas (sin su texto entero) y el estado del cerebro. */
export const listarCerebro = (clienteId) => llamar(base(clienteId));

/** Una nota entera. */
export const leerNota = (clienteId, notaId) => llamar(`${base(clienteId)}/nota/${encodeURIComponent(notaId)}`);

/** Crear (sin `id`) o editar (con `id`) una nota. */
export const guardarNota = (clienteId, nota) => cambiando(clienteId, () => llamar(`${base(clienteId)}/nota`, { metodo: "PUT", cuerpo: nota }));

export const borrarNota = (clienteId, notaId) =>
  cambiando(clienteId, () => llamar(`${base(clienteId)}/nota/${encodeURIComponent(notaId)}`, { metodo: "DELETE" }));

/** Buscar por pasajes. `para: "chat"` incluye lo interno: es el equipo quien mira. */
export const buscarEnCerebro = (clienteId, q, { para = "chat", n = 8 } = {}) =>
  llamar(`${base(clienteId)}/buscar?q=${encodeURIComponent(q)}&para=${para}&n=${n}`);

/** Llenar el cerebro desde el repositorio del cliente. */
export const importarAlCerebro = (clienteId, { actualizar = false } = {}) =>
  cambiando(clienteId, () => llamar(`${base(clienteId)}/importar`, { metodo: "POST", cuerpo: { actualizar } }));

/** La IA escribe la ficha técnica y las cifras. Gasta: se releé el medidor de la cabecera al terminar. */
export async function prepararFicha(clienteId, { forzar = false } = {}) {
  try {
    return await cambiando(clienteId, () => llamar(`${base(clienteId)}/preparar`, { metodo: "POST", cuerpo: { forzar } }));
  } finally {
    // Haya ido bien o mal: una llamada que falla a medias también cuesta.
    window.dispatchEvent(new Event("ia:gasto"));
  }
}
