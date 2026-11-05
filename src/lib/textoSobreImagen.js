// ============================================================
// Poner el texto de una lámina encima de la imagen (lienzo)
//
// El modo «plantilla» del carrusel: la IA dejó el hueco limpio y aquí se
// escribe el texto EXACTO con los colores del kit. Tres plantillas
// (lib/carrusel.js → PLANTILLAS_TEXTO): banda abajo, titular arriba,
// tarjeta al centro y texto sobre un degradado (sin caja: el más editorial). La letra es la del kit si el navegador la tiene; si
// no, la del sistema, en negrita: nunca una que no se pueda leer.
// ============================================================

import { cargarFuente } from "./muestraFuente";
import { dibujarTextoPlantilla, letraDe } from "./acabadoLienzo.js";

/** Carga una imagen del mismo origen (también un SVG del motor de prueba) lista para el lienzo. */
async function cargar(src) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  return img;
}

/**
 * Dibuja la lámina con su texto y devuelve un JPEG (Blob). El dibujo es `dibujarTextoPlantilla` (acabadoLienzo.js), el
 * MISMO que hace el Container cuando el servidor termina la pieza sin pantalla.
 * @param src        la imagen de la IA (`/api/media/…`)
 * @param texto      el de la lámina («Titular\nApoyo…»)
 * @param plantilla  banda | arriba | centro | degradado
 * @param colores    { fondo, texto, acento } (coloresPlantilla)
 * @param familia    la tipografía del kit, si la hay
 */
export async function componerLamina({ src, texto, plantilla = "banda", colores, familia = "", fuente = null }) {
  const img = await cargar(src);
  // La fuente REAL de la marca (si el kit la tiene): sin ella, la del kit si el navegador la tiene, o la del sistema.
  familia = (fuente ? await cargarFuente(fuente) : "") || familia;
  const ancho = img.naturalWidth || 1080;
  const alto = img.naturalHeight || 1350;
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  ctx.drawImage(img, 0, 0, ancho, alto);
  dibujarTextoPlantilla(ctx, { ancho, alto, texto, plantilla, colores, letra: letraDe(familia) });
  return await new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo dibujar la lámina."))), "image/jpeg", 0.92));
}
