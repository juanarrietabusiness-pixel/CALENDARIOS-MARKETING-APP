// ============================================================
// Cliente de «Cerrar el ciclo» (worker/lib/enPauta.js): lo que está en pauta y lo que conviene pautar
//
// Aparte de anunciosApi.js a propósito: lo carga el panel de una publicación (que no debe arrastrar el cliente de las
// campañas) y la revisión de Resultados → Anuncios, en diferido.
// ============================================================

import { pedir } from "./db.js";

const ruta = (clientId, sub) => `/anuncios/clientes/${encodeURIComponent(clientId)}/${sub}`;

/** Lo de un cliente se pide una vez cada dos minutos: el panel se abre y se cierra mucho, y lo guardado cambia al día. */
const VIGENCIA_MS = 120_000;
const recordado = new Map();

/**
 * Lo que está en pauta de un cliente (sólo lo guardado: ni una llamada a Meta): `{ leidoAt, moneda, publicaciones:
 * [{ calendarId, postId, activo, linea, nombreEtapa, d7, d30, anuncios: [{ id, nombre, campana, enlace }] }],
 * preferencias }`. `fresco`: sin lo recordado.
 */
export function enPautaDelCliente(clientId, { fresco = false } = {}) {
  const r = recordado.get(clientId);
  if (!fresco && r && Date.now() - r.t < VIGENCIA_MS) return r.promesa;
  const promesa = pedir(ruta(clientId, "en-pauta"));
  recordado.set(clientId, { t: Date.now(), promesa });
  promesa.catch(() => recordado.delete(clientId));
  return promesa;
}

/** Tras leer la revisión (o marcar algo), lo recordado ya no vale. */
export const olvidarEnPauta = (clientId) => recordado.delete(clientId);

/** Lo orgánico que rindió y no se ha pautado: `{ candidatas, destino, preferencias, leidoAt }`. */
export const paraPautarDelCliente = (clientId) => pedir(ruta(clientId, "para-pautar"));

/** «Marcar Va a pauta» con su etapa: `{ calendarId, postId, pauta }`. */
export function marcarParaPautar(clientId, { calendarId, postId, etapa }) {
  olvidarEnPauta(clientId);
  return pedir(ruta(clientId, "para-pautar"), { method: "POST", body: JSON.stringify({ calendarId, postId, etapa }) });
}
