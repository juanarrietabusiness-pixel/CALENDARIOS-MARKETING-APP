// ============================================================
// Cliente de /api/anuncios/clientes/<c>/ciclo: el plan de campañas de un mes y su guía (worker/lib/planCampanas.js)
// ============================================================

import { pedir } from "./db";

const ruta = (clientId) => `/anuncios/clientes/${encodeURIComponent(clientId)}/ciclo`;

/** El plan del mes, lo guardado de su guía y cuánto va marcado → { plan, guardado, avance }. */
export const leerCiclo = (clientId, mes) => pedir(`${ruta(clientId)}?mes=${encodeURIComponent(mes)}`);

/** Marcar o desmarcar pasos de la guía (se funde con lo de los demás) → { guardado }. */
export const marcarPasos = (clientId, mes, marcar) => pedir(ruta(clientId), { method: "PUT", body: JSON.stringify({ mes, marcar }) });

/** Cambiar los ajustes del plan (la temporada, la inversión a mano): rehace el plan → { plan, guardado, avance }. */
export const guardarAjustesCiclo = (clientId, mes, ajustes) => pedir(ruta(clientId), { method: "PUT", body: JSON.stringify({ mes, ajustes }) });
