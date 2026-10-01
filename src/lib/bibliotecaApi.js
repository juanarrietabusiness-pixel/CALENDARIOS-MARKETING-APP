// ============================================================
// La Biblioteca de anuncios, desde el navegador
//
// Llama a /api/biblioteca (worker/rutas/biblioteca.js). El navegador no
// habla con Meta: `connect-src 'self'`, y el token es del Worker.
// ============================================================

import { pedir } from "./db";

/** Si Meta está conectado y los filtros guardados del espacio. */
export const estadoBiblioteca = () => pedir("/biblioteca");

/** Una página de resultados. `after` es el cursor de la anterior; `pagina`, cuántas van. */
export function buscarAnuncios(consulta, { after = "", pagina = 1 } = {}) {
  const q = new URLSearchParams({ c: JSON.stringify(consulta), pagina: String(pagina) });
  if (after) q.set("after", after);
  return pedir(`/biblioteca/buscar?${q}`);
}

export const guardarFiltro = ({ nombre, clientId = null, consulta }) =>
  pedir("/biblioteca/filtros", { method: "POST", body: JSON.stringify({ nombre, clientId, consulta }) });

export const cambiarFiltro = (id, cambios) =>
  pedir(`/biblioteca/filtros/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(cambios) });

export const borrarFiltro = (id) => pedir(`/biblioteca/filtros/${encodeURIComponent(id)}`, { method: "DELETE" });
