// ============================================================
// Cliente de /api/ventas (la agencia) y /api/publico-ventas (el enlace del cliente, sin sesión)
//
// Aparte de db.js a propósito: lo cargan sólo la página del cliente y la pantalla de Números del negocio, las dos en
// diferido. Ver worker/rutas/ventas.js.
// ============================================================

import { pedir } from "./db.js";

const cuerpo = (metodo, datos) => ({ method: metodo, body: JSON.stringify(datos ?? {}) });

/** Lo que ve el cliente por su enlace: su nombre, tres semanas y las conversaciones de cada una. */
export const ventasPublicas = (testigo) => pedir(`/publico-ventas/${encodeURIComponent(testigo)}`);

/** El cliente guarda una semana: `{ semana, ventas, monto, deAnuncios?, otrosCanales?, nota? }`. */
export const guardarVentasPublicas = (testigo, datos) => pedir(`/publico-ventas/${encodeURIComponent(testigo)}`, cuerpo("POST", datos));

/** Las ocho últimas semanas del cliente, con la pauta, la tasa medida y el ROAS real (la agencia). */
export const ventasDelCliente = (clientId) => pedir(`/ventas/${encodeURIComponent(clientId)}`);

/** La agencia escribe o corrige una semana (su lunes). */
export const guardarSemanaAgencia = (clientId, semana, datos) =>
  pedir(`/ventas/${encodeURIComponent(clientId)}/${encodeURIComponent(semana)}`, cuerpo("PUT", datos));

/** Quita lo apuntado de una semana. */
export const borrarSemanaAgencia = (clientId, semana) =>
  pedir(`/ventas/${encodeURIComponent(clientId)}/${encodeURIComponent(semana)}`, { method: "DELETE" });

/** El enlace del cliente (se crea una vez y se reutiliza): `{ testigo, url }`. */
export const enlaceDeVentasDelCliente = (clientId) => pedir(`/ventas/${encodeURIComponent(clientId)}/enlace`, cuerpo("POST"));
