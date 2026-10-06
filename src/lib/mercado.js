// ============================================================
// El estudio de mercado, desde el navegador
//
// Llama a /api/mercado por `pedir()` (db.js): la misma cookie, la misma
// cabecera de pestaña y el error con el motivo del servidor en español.
// Lo que gasta IA relee el medidor de la cabecera al terminar (vaya bien o
// mal: una llamada que falla a medias también cuesta), y lo que cambia el
// cerebro suelta lo que el asistente recordaba de él.
// ============================================================

import { pedir } from "./db";
import { contextoDelChat } from "./cerebroCliente";

const base = (clienteId) => `/mercado/${encodeURIComponent(clienteId)}`;
const post = (cuerpo) => ({ method: "POST", body: JSON.stringify(cuerpo ?? {}) });
const put = (cuerpo) => ({ method: "PUT", body: JSON.stringify(cuerpo ?? {}) });

async function gastando(hacer) {
  try {
    return await hacer();
  } finally {
    window.dispatchEvent(new Event("ia:gasto"));
  }
}

async function cambiandoCerebro(clienteId, hacer) {
  try {
    return await hacer();
  } finally {
    contextoDelChat.olvidar(clienteId);
  }
}

/** { catalogo, estudio, borrador, referencias, actualizado }. */
export const leerMercado = (clienteId) => pedir(base(clienteId));

export const guardarCatalogo = (clienteId, catalogo) =>
  cambiandoCerebro(clienteId, () => pedir(`${base(clienteId)}/catalogo`, put({ catalogo })));

/** La IA propone el catálogo desde el cerebro; no guarda. */
export const proponerCatalogo = (clienteId) => gastando(() => pedir(`${base(clienteId)}/catalogo/proponer`, post()));

/** Paso 1: lo general del mercado (con búsqueda web). */
export const estudiarGeneral = (clienteId, material = "") =>
  gastando(() => pedir(`${base(clienteId)}/estudio/general`, post({ material })));

/** Un producto o servicio del catálogo. */
export const estudiarProducto = (clienteId, productoId, material = "") =>
  gastando(() => pedir(`${base(clienteId)}/estudio/producto`, post({ productoId, material })));

/** Guarda lo corregido a mano; `null` descarta el borrador. */
export const guardarBorrador = (clienteId, borrador) => pedir(`${base(clienteId)}/estudio/borrador`, put({ borrador }));

/** Aprueba el borrador: al cerebro y a Drive. → { estudio, notas, drive, avisoDrive }. */
export const aprobarEstudio = (clienteId) => cambiandoCerebro(clienteId, () => pedir(`${base(clienteId)}/estudio/aprobar`, post()));

/** Una captura de la competencia ya subida a la galería: se analiza y va al cerebro. → { referencia, aviso }. */
export const agregarReferencia = (clienteId, datos) =>
  cambiandoCerebro(clienteId, () => gastando(() => pedir(`${base(clienteId)}/referencias`, post(datos))));

export const reanalizarReferencia = (clienteId, id) =>
  cambiandoCerebro(clienteId, () => gastando(() => pedir(`${base(clienteId)}/referencias/${encodeURIComponent(id)}/analizar`, post())));

export const borrarReferencia = (clienteId, id) =>
  cambiandoCerebro(clienteId, () => pedir(`${base(clienteId)}/referencias/${encodeURIComponent(id)}`, { method: "DELETE" }));
