// La escena de un pedido compuesto del Estudio, sola: lo que dice qué ES la pieza. Vive aparte de kitMarca.js (que la
// reexporta: nada cambia de import) para que la galería la use sin cargar el kit entero (src/lib/galeriaVistas.js).

/** La escena de un pedido compuesto (sin el preset, la marca ni la línea del video); si no lo es, el texto tal cual. Pura. */
export function ideaDelPedido(prompt) {
  const t = String(prompt ?? "");
  const m = t.match(/(?:^|\n\n)Escena: ([\s\S]*?)(?:\n\n|$)/);
  return m ? m[1].trim() : t.trim();
}
