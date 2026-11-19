// ============================================================
// Cliente de la IDENTIDAD DE VIDEO de un cliente (/api/videos/<cliente>/identidad): leerla, guardarla por partes y la
// muestra de los estilos de subtítulos. Lo carga sólo su pantalla (IdentidadVideo.jsx, en diferido).
// ============================================================

import { pedir } from "./db";

const base = (clienteId) => `/videos/${encodeURIComponent(clienteId)}`;

/** La identidad guardada → { identidad (o null), resumen: [frases] }. */
export async function leerIdentidad(clienteId) {
  return (await pedir(`${base(clienteId)}/identidad`)) ?? { identidad: null, resumen: [] };
}

/** Guarda las partes que trae (null quita una) → { identidad, resumen }. El servidor comprueba lo que nombra. */
export async function guardarIdentidad(clienteId, cambios) {
  return pedir(`${base(clienteId)}/identidad`, { method: "PUT", body: JSON.stringify(cambios ?? {}) });
}

/** Un cuadro por estilo de subtítulos con la marca del cliente → [{ estilo, nombre, mime, datos }]. */
export async function muestraDeSubtitulos(clienteId, estilos = []) {
  const q = estilos.length ? `?estilos=${encodeURIComponent(estilos.join(","))}` : "";
  return (await pedir(`${base(clienteId)}/identidad/muestra${q}`))?.muestras ?? [];
}

/** Las músicas de la biblioteca que puede usar el cliente (las suyas y las de la agencia). */
export async function musicasDelCliente(clienteId) {
  return (await pedir(`${base(clienteId)}/musicas`))?.musicas ?? [];
}
