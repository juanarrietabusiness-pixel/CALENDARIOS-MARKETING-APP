// ============================================================
// Cliente de la revisión 3Q (worker/lib/revision3q.js): lo que corre en el Ads Manager de un cliente
//
// Aparte de anunciosApi.js a propósito: lo cargan Mi día (sólo `pendientes`) y la pantalla de la revisión, en diferido.
// ============================================================

import { pedir } from "./db.js";

const deCliente = (clientId, resto) => `/anuncios/clientes/${encodeURIComponent(clientId)}${resto}`;

/** La revisión de un cliente (y la marca «revisada»). Con `conIA`, la IA la explica (cuesta unos centavos). */
export const revisionCampanas = (clientId, { conIA = false } = {}) =>
  conIA
    ? pedir(deCliente(clientId, "/revision"), { method: "POST", body: JSON.stringify({ conIA: true }) })
    : pedir(deCliente(clientId, "/revision"));

/** La etapa de una campaña cuyo nombre no la dice ("" la quita). */
export const guardarEtapaCampana = (clientId, campanaId, etapa) =>
  pedir(deCliente(clientId, "/etapas"), { method: "PUT", body: JSON.stringify({ campanaId, etapa }) });

/** Mi día: los clientes con cuenta publicitaria sin revisar hace 6 días o más: `{ pendientes: [{ clientId, dias }] }`. */
export const revisionesPendientes = () => pedir("/anuncios/revision/pendientes");
