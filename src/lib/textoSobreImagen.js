// ============================================================
// Poner el texto de una lámina encima de la imagen (lienzo)
//
// El modo «plantilla» del carrusel: la IA dejó el hueco limpio y aquí se
// escribe el texto EXACTO con los colores del kit. Tres plantillas
// (lib/carrusel.js → PLANTILLAS_TEXTO): banda abajo, titular arriba,
// tarjeta al centro. La letra es la del kit si el navegador la tiene; si
// no, la del sistema, en negrita: nunca una que no se pueda leer.
// ============================================================

import { partirLineas, titularYApoyo } from "./carrusel";

/** Carga una imagen del mismo origen (también un SVG del motor de prueba) lista para el lienzo. */
async function cargar(src) {
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  await img.decode();
  return img;
}

const radio = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/**
 * Dibuja la lámina con su texto y devuelve un JPEG (Blob).
 * @param src        la imagen de la IA (`/api/media/…`)
 * @param texto      el de la lámina («Titular\nApoyo…»)
 * @param plantilla  banda | arriba | centro
 * @param colores    { fondo, texto, acento } (coloresPlantilla)
 * @param familia    la tipografía del kit, si la hay
 */
export async function componerLamina({ src, texto, plantilla = "banda", colores, familia = "" }) {
  const img = await cargar(src);
  const ancho = img.naturalWidth || 1080;
  const alto = img.naturalHeight || 1350;
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  ctx.drawImage(img, 0, 0, ancho, alto);

  const letra = `${familia ? `"${familia.replace(/["\\]/g, "").split(/[,/]/)[0].trim()}", ` : ""}system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const { titular, apoyo } = titularYApoyo(texto);
  const margen = Math.round(ancho * 0.07);
  const util = ancho - margen * 2 - (plantilla === "centro" ? margen : 0);
  const tamT = Math.round(ancho * 0.072);
  const tamA = Math.round(ancho * 0.038);
  ctx.font = `800 ${tamT}px ${letra}`;
  const lineasT = partirLineas(titular, util, (t) => ctx.measureText(t).width, 4);
  ctx.font = `500 ${tamA}px ${letra}`;
  const lineasA = partirLineas(apoyo, util, (t) => ctx.measureText(t).width, 5);
  const altoT = lineasT.length * tamT * 1.12;
  const altoA = lineasA.length ? tamA * 0.8 + lineasA.length * tamA * 1.35 : 0;
  const bloque = altoT + altoA;
  const relleno = Math.round(ancho * 0.06);

  let y; // donde empieza el titular
  let x = margen;
  if (plantilla === "arriba") {
    const g = ctx.createLinearGradient(0, 0, 0, bloque + relleno * 3);
    g.addColorStop(0, colores.fondo);
    g.addColorStop(0.7, colores.fondo);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, ancho, bloque + relleno * 3);
    ctx.globalAlpha = 1;
    y = relleno * 1.4;
  } else if (plantilla === "centro") {
    const w = ancho - margen * 2;
    const h = bloque + relleno * 2;
    const top = Math.round((alto - h) / 2);
    ctx.globalAlpha = 0.93;
    ctx.fillStyle = colores.fondo;
    radio(ctx, margen, top, w, h, Math.round(ancho * 0.03));
    ctx.fill();
    ctx.globalAlpha = 1;
    x = margen + relleno * 0.75;
    y = top + relleno;
  } else {
    const h = bloque + relleno * 2;
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = colores.fondo;
    ctx.fillRect(0, alto - h, ancho, h);
    ctx.globalAlpha = 1;
    // La raya de acento sobre la banda: lo que hace que parezca diseñada y no un rótulo.
    ctx.fillStyle = colores.acento;
    ctx.fillRect(margen, alto - h - Math.round(tamA * 0.3), Math.round(ancho * 0.16), Math.round(tamA * 0.3));
    y = alto - h + relleno;
  }

  ctx.textBaseline = "top";
  ctx.fillStyle = colores.texto;
  ctx.font = `800 ${tamT}px ${letra}`;
  for (const [i, l] of lineasT.entries()) ctx.fillText(l, x, y + i * tamT * 1.12);
  ctx.font = `500 ${tamA}px ${letra}`;
  const yA = y + altoT + tamA * 0.8;
  for (const [i, l] of lineasA.entries()) ctx.fillText(l, x, yA + i * tamA * 1.35);

  return await new Promise((ok, mal) => lienzo.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo dibujar la lámina."))), "image/jpeg", 0.92));
}
