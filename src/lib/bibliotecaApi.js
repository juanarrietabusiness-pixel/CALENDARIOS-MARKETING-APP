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

// ---- Scrape Creators: la Biblioteca entera (cada pedido gasta un crédito; lo repetido sale de la caché) ----

export const empresasSC = (q) => pedir(`/biblioteca/sc/empresas?${new URLSearchParams({ q })}`);

export function anunciosSC(consulta, cursor = "") {
  const q = new URLSearchParams({ c: JSON.stringify(consulta) });
  if (cursor) q.set("cursor", cursor);
  return pedir(`/biblioteca/sc/anuncios?${q}`);
}

export const anuncioSC = (id, { transcripcion = false } = {}) =>
  pedir(`/biblioteca/sc/anuncio/${encodeURIComponent(id)}${transcripcion ? "?transcripcion=1" : ""}`);

/** El archivo de un anuncio a la galería del cliente (carpeta «Competencia»): devuelve { archivo }. */
export const traerAnuncioSC = ({ clientId, url, tipo, id, pagina }) =>
  pedir("/biblioteca/sc/traer", { method: "POST", body: JSON.stringify({ clientId, url, tipo, id, pagina }) });
