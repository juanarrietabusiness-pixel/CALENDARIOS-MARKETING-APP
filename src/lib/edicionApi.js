// ============================================================
// Cliente de /api/edicion: el editor de video grabado en la pantalla (worker/rutas/edicion.js)
// ============================================================

import { pedir } from "./db";

/** Las últimas ediciones del espacio (las actas) y la versión vigente del kit. */
export const leerActasEdicion = () => pedir("/edicion/actas");

const base = (clienteId) => `/edicion/${encodeURIComponent(clienteId)}/estilos`;

/** Los estilos de edición del cliente y lo que se puede escoger → { estilos, max, piezas, transiciones, tipos }. */
export const leerEstilosEdicion = (clienteId) => pedir(base(clienteId));
/** Guarda un estilo ENTERO (con su id lo reemplaza) → lo mismo que leer. El servidor dice lo que no entiende (400). */
export const guardarEstiloEdicion = (clienteId, estilo) => pedir(base(clienteId), { method: "PUT", body: JSON.stringify(estilo) });
/** Quita un estilo → lo mismo que leer. */
export const quitarEstiloEdicion = (clienteId, id) => pedir(`${base(clienteId)}/${encodeURIComponent(id)}`, { method: "DELETE" });
