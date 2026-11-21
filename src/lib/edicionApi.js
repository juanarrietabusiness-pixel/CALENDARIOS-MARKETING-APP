// ============================================================
// Cliente de /api/edicion: el editor de video grabado en la pantalla (worker/rutas/edicion.js)
// ============================================================

import { pedir } from "./db";

/** Las últimas ediciones del espacio (las actas) y la versión vigente del kit. */
export const leerActasEdicion = () => pedir("/edicion/actas");
