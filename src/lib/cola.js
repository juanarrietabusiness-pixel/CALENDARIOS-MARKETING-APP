// ============================================================
// La cola de publicación, vista desde el navegador (puro)
//
// Las filas llegan de /api/publicar: una por publicación y red. Aquí se
// resumen para la rejilla, la lista y el panel.
// ============================================================

const ZONA = "America/Panama";

/** «vie, 5 oct, 10:00 a. m.», en la hora de Panamá. */
export const fechaHora = (iso) => new Date(iso).toLocaleString("es-PA", {
  timeZone: ZONA, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
});

export const TEXTO_ESTADO = {
  programada: "Programada",
  procesando: "Publicando…",
  publicada: "Publicada",
  error: "No se publicó",
};

/** La clave de una pieza: la red y, si es la historia que acompaña al post, «:historia». */
export const clavePieza = (red, variante = "post") => (variante === "historia" ? `${red}:historia` : red);

/** La fila más reciente por pieza (red y variante), sin las canceladas. */
export function colaDe(filas = [], postId) {
  const porPieza = {};
  for (const f of filas) {
    if (f.postId !== postId || f.estado === "cancelada") continue;
    porPieza[clavePieza(f.red, f.variante)] = f;
  }
  return porPieza;
}

/**
 * Una línea para la rejilla y la lista: si algo falló, eso; si falta por
 * salir, «programada»; si salió todo, «publicada». null si no hay cola.
 */
export function resumenCola(filas, postId) {
  const lista = Object.values(colaDe(filas, postId));
  if (!lista.length) return null;
  if (lista.some((f) => f.estado === "error")) return { estado: "error", icono: "alert", texto: "No se publicó" };
  if (lista.every((f) => f.estado === "publicada")) return { estado: "publicada", icono: "check", texto: "Publicada" };
  const proxima = lista.filter((f) => f.estado !== "publicada").map((f) => f.programadaPara).sort()[0];
  return { estado: "programada", icono: "clock", texto: `Programada · ${fechaHora(proxima)}` };
}

