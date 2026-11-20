// ============================================================
// Cliente de /api/manual-editor: el manual del editor de videos grabados, con sus versiones
// (worker/rutas/manualEditor.js). Un 409 trae `e.datos.actual` con la última versión guardada.
// ============================================================

import { pedir } from "./db";

export const leerManualEditor = () => pedir("/manual-editor");
export const leerVersionEditor = (n) => pedir(`/manual-editor/versiones/${encodeURIComponent(n)}`);
export const guardarManualEditor = ({ version, partes, motivo }) =>
  pedir("/manual-editor", { method: "PUT", body: JSON.stringify({ version, partes, motivo }) });
export const volverAVersionEditor = ({ a, version }) =>
  pedir("/manual-editor/volver", { method: "POST", body: JSON.stringify({ a, version }) });
