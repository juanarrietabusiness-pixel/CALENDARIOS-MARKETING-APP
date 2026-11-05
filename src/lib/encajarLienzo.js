// ============================================================
// Encajar una imagen en la medida de una red, dibujado en un lienzo que se le da (puro: lo comparten el navegador
// —medios.js, al programar— y el Container —«Programar al aprobar» sin pantalla—; así sale lo mismo en los dos)
//
// `crear(ancho, alto)` → un lienzo nuevo (en el navegador, un <canvas>; en el Container, el de @napi-rs/canvas).
// ============================================================

/** Dibuja `img` ocupando todo `w`×`h` (recortando lo que sobre). */
export function cubrirEn(ctx, img, w, h) {
  const e = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, (w - img.width * e) / 2, (h - img.height * e) / 2, img.width * e, img.height * e);
}

/** Dibuja `img` entera y centrada en `w`×`h` (dejando márgenes). */
export function contenerEn(ctx, img, w, h) {
  const e = Math.min(w / img.width, h / img.height);
  ctx.drawImage(img, (w - img.width * e) / 2, (h - img.height * e) / 2, img.width * e, img.height * e);
}

/**
 * La imagen encajada en `ancho`×`alto`:
 *   · difuminado: entera, sobre la misma imagen ampliada y desenfocada (lo que hace Metricool). El desenfoque se hace
 *     reduciendo y ampliando, que funciona igual en Safari y en el Container, sin `ctx.filter`.
 *   · color: entera, sobre el color de la marca.
 *   · recorte: llenando el lienzo, recortada al centro.
 */
export function encajarEn(crear, img, { ancho, alto }, modo = "difuminado", color = "#ffffff") {
  const lienzo = crear(ancho, alto);
  const ctx = lienzo.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  if (modo === "recorte") {
    cubrirEn(ctx, img, ancho, alto);
    return lienzo;
  }
  if (modo === "color") {
    ctx.fillStyle = color || "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
  } else {
    const chico = crear(Math.max(8, Math.round(ancho / 28)), Math.max(8, Math.round(alto / 28)));
    cubrirEn(chico.getContext("2d"), img, chico.width, chico.height);
    ctx.drawImage(chico, 0, 0, ancho, alto);
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.fillRect(0, 0, ancho, alto);
  }
  contenerEn(ctx, img, ancho, alto);
  return lienzo;
}

/**
 * La imagen REDUCIDA (nunca agrandada) para que quepa en `maxAncho`×`maxAlto`, sobre blanco (un PNG con transparencia
 * saldría con fondo negro en JPEG). Para pasar a JPEG al tamaño de publicar y para la copia de TikTok.
 */
export function reducirEn(crear, img, { maxAncho, maxAlto }) {
  const escala = Math.min(1, maxAncho / img.width, maxAlto / img.height);
  const lienzo = crear(Math.max(1, Math.round(img.width * escala)), Math.max(1, Math.round(img.height * escala)));
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return lienzo;
}
