// ============================================================
// Cliente de /api/anuncios (Meta Ads). Ninguna llamada va a Meta desde
// el navegador: `connect-src 'self'`, y el token vive en el Worker.
// ============================================================

import { pedir } from "./db";

const post = (datos = {}) => ({ method: "POST", body: JSON.stringify(datos) });
const deCliente = (clientId, resto = "") => `/anuncios/clientes/${encodeURIComponent(clientId)}${resto}`;
const conRango = (rango) => `?rango=${encodeURIComponent(rango)}`;

export const estadoAnuncios = () => pedir("/anuncios/estado");
export const sincronizarCuentas = () => pedir("/anuncios/cuentas/sincronizar", post());
export const asignarCuenta = (cuentaId, clientId) =>
  pedir(`/anuncios/cuentas/${encodeURIComponent(cuentaId)}`, { method: "PUT", body: JSON.stringify({ clientId: clientId || null }) });

/** «Conceder permisos de anuncios»: el mismo OAuth de Meta, con los permisos extra. */
export const urlConcederPermisos = () => "/api/redes/meta/conectar?para=anuncios";

export const campanas = (clientId, rango) => pedir(deCliente(clientId, `/campanas${conRango(rango)}`));
export const detalleCampana = (clientId, campanaId, rango) =>
  pedir(deCliente(clientId, `/campanas/${encodeURIComponent(campanaId)}${conRango(rango)}`));
export const estadisticas = (clientId, rango) => pedir(deCliente(clientId, `/estadisticas${conRango(rango)}`));
export const historial = (clientId) => pedir(deCliente(clientId, "/historial"));

export const crearCampana = (clientId, borrador) => pedir(deCliente(clientId, "/campanas"), post({ borrador }));
export const pausarCampana = (clientId, campanaId) => pedir(deCliente(clientId, `/campanas/${encodeURIComponent(campanaId)}/pausar`), post());
/** Sin `confirmado`, el servidor contesta 409 con el resumen para el diálogo. */
export const activarCampana = (clientId, campanaId, confirmado = false) =>
  pedir(deCliente(clientId, `/campanas/${encodeURIComponent(campanaId)}/activar`), post(confirmado ? { confirmado: true } : {}));

export const buscarCiudades = (clientId, q, pais = "") =>
  pedir(deCliente(clientId, `/ciudades?q=${encodeURIComponent(q)}${pais ? `&pais=${encodeURIComponent(pais)}` : ""}`));
export const pixeles = (clientId) => pedir(deCliente(clientId, "/pixeles"));
export const medios = (clientId) => pedir(deCliente(clientId, "/medios"));
export const prepararMedio = (clientId, clave) => pedir(deCliente(clientId, "/medio"), post({ clave }));
export const estadoVideo = (clientId, videoId) => pedir(deCliente(clientId, `/video/${encodeURIComponent(videoId)}`));
export const buscarIntereses = (clientId, q) => pedir(deCliente(clientId, `/intereses?q=${encodeURIComponent(q)}`));
export const publicos = (clientId) => pedir(deCliente(clientId, "/publicos"));
export const crearSimilar = (clientId, { origenId, pais = "PA", porcentaje = 1 }) => pedir(deCliente(clientId, "/similares"), post({ origenId, pais, porcentaje }));
