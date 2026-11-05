// ============================================================
// Lo que se dibuja ENCIMA de una pieza ya hecha: el texto de la plantilla y el logo estampado
//
// Lo comparten el navegador (textoSobreImagen.js, logoEncima.js) y el Container (container/servidor.mjs → /acabado),
// así una pieza que el servidor termina sin pantalla sale IGUAL que la que termina la pantalla. Puro: recibe el
// contexto 2D ya creado y lo ya cargado (la imagen, el logo, la familia de letra registrada). No crea lienzos ni
// carga nada, y no toca `document`: en el Container no existe.
// ============================================================

import { partirLineas, titularYApoyo } from "./carrusel.js";
import { posicionLogo } from "./logoEncima.js";

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
 * La familia de letra para el lienzo: la de la marca primero y, si no está, la de respaldo. En el navegador, la del
 * sistema; en el Container, Roboto (la que registra al arrancar). Pura.
 */
export function letraDe(familia = "", respaldo = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif') {
  const f = String(familia ?? "").replace(/["\\]/g, "").split(/[,/]/)[0].trim();
  return `${f ? `"${f}", ` : ""}${respaldo}`;
}

/**
 * El texto de una lámina encima de la imagen (ya dibujada en `ctx`), en una de las plantillas de PLANTILLAS_TEXTO
 * (lib/carrusel.js): banda abajo, titular arriba, tarjeta al centro o sobre un degradado. Pura (dibuja en `ctx`).
 * @param colores { fondo, texto, acento } (coloresPlantilla)
 * @param letra   la familia ya armada (`letraDe`)
 */
export function dibujarTextoPlantilla(ctx, { ancho, alto, texto, plantilla = "banda", colores, letra }) {
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
  } else if (plantilla === "degradado") {
    // Sin caja ni raya: la imagen se funde con el color de fondo hacia abajo y el texto queda encima.
    const h = bloque + relleno * 4;
    const g = ctx.createLinearGradient(0, alto - h, 0, alto);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.45, colores.fondo);
    g.addColorStop(1, colores.fondo);
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = g;
    ctx.fillRect(0, alto - h, ancho, h);
    ctx.globalAlpha = 1;
    y = alto - bloque - relleno * 1.3;
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
  return { lineasT, lineasA };
}

/**
 * El logo encima de la pieza (ya dibujada en `ctx`), en la esquina y al tamaño del kit (`posicionLogo`). `logo` es la
 * imagen ya cargada, con su ancho y su alto. Pura (dibuja en `ctx`). → la caja donde quedó.
 */
export function dibujarLogo(ctx, logo, { ancho, alto, posicion = {} }) {
  const caja = posicionLogo({ ancho, alto, logoAncho: logo.naturalWidth || logo.width, logoAlto: logo.naturalHeight || logo.height, ...posicion });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(logo, caja.x, caja.y, caja.w, caja.h);
  return caja;
}
