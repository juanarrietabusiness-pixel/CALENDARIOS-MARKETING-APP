// ============================================================
// Las pestañas del panel de una publicación: Idea · Pieza · Publicar (puro)
//
// Eran dos, «Idea» y «Subir»; «Subir» mezclaba el archivo con la salida (unos
// 25 controles de IA en una columna). Ahora el archivo es «Pieza» y lo de salir
// (redes, texto, vista previa, revisión, «¿Cuándo sale?») es «Publicar».
//
// Lo que pedía la pestaña de antes sigue abriendo lo suyo: «contenido» era Idea
// y «publicar» era «Subir», que se abría para subir el archivo («Agregar
// publicación» → «Subir contenido», CalendarView): ahora es Pieza.
// ============================================================

/** Las pestañas, en su orden: [clave, nombre, icono]. */
export const PESTANAS_PANEL = Object.freeze([["idea", "Idea", "bulb"], ["pieza", "Pieza", "image"], ["salida", "Publicar", "send"]]);

/** La pestaña que se pide, también con los nombres de antes. → «idea» | «pieza» | «salida» | null. Pura. */
export function pestanaDelPanel(valor) {
  return { idea: "idea", contenido: "idea", pieza: "pieza", publicar: "pieza", subir: "pieza", salida: "salida" }[valor] ?? null;
}

/** La pestaña a la que llevan las flechas, Inicio y Fin (en círculo), o null si la tecla no mueve. Pura. */
export function pestanaPorTecla(actual, tecla) {
  const claves = PESTANAS_PANEL.map(([k]) => k);
  const i = Math.max(0, claves.indexOf(actual));
  if (tecla === "ArrowRight") return claves[(i + 1) % claves.length];
  if (tecla === "ArrowLeft") return claves[(i - 1 + claves.length) % claves.length];
  if (tecla === "Home") return claves[0];
  if (tecla === "End") return claves[claves.length - 1];
  return null;
}
