// ============================================================
// La historia de una publicación ya publicada, dibujada en el navegador
//
// La imagen del post ENTERA, un poco más chica que el ancho, sobre ella
// misma ampliada y difuminada (como «Usar la imagen del post»), y una frase
// corta en una placa que pisa su borde de arriba. Fuera de las franjas que
// tapa Instagram: el 14 % de arriba (la barra del perfil) y el 20 % de abajo
// (responder). Sale en JPEG porque Instagram no publica otra cosa.
// ============================================================

const ANCHO = 1080;
const ALTO = 1920;

async function bitmap(src) {
  const r = await fetch(src, { credentials: "same-origin" });
  if (!r.ok) throw new Error("No se pudo leer la imagen de la publicación.");
  return createImageBitmap(await r.blob());
}

function cubrir(ctx, img, w, h) {
  const e = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, (w - img.width * e) / 2, (h - img.height * e) / 2, img.width * e, img.height * e);
}

/** ¿Texto claro u oscuro sobre este color? (luminancia relativa, sin librerías). */
function textoSobre(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ""));
  if (!m) return "#111111";
  const n = parseInt(m[1], 16);
  const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111111" : "#ffffff";
}

function placa(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** El lienzo de la historia. `color`: el de la placa (el de la marca, si lo hay). */
export function dibujarHistoria(img, frase, { color = "#ffffff" } = {}) {
  const lienzo = document.createElement("canvas");
  lienzo.width = ANCHO;
  lienzo.height = ALTO;
  const ctx = lienzo.getContext("2d");
  ctx.imageSmoothingQuality = "high";

  // El fondo: la misma imagen, chiquita y ampliada (difumina igual en Safari, sin `ctx.filter`).
  const chico = document.createElement("canvas");
  // Muy chica a propósito: con 40 × 70 aún se leía el titular del post detrás.
  chico.width = 14;
  chico.height = 25;
  cubrir(chico.getContext("2d"), img, chico.width, chico.height);
  ctx.drawImage(chico, 0, 0, ANCHO, ALTO);
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // La imagen entera, entre la franja de arriba y la de abajo.
  const arriba = ALTO * 0.2;
  const abajo = ALTO * 0.8;
  const e = Math.min((ANCHO * 0.86) / img.width, (abajo - arriba) / img.height);
  const w = img.width * e;
  const h = img.height * e;
  const x = (ANCHO - w) / 2;
  const y = arriba + (abajo - arriba - h) / 2;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  placa(ctx, x, y, w, h, 28);
  ctx.clip();
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();

  // La frase, en una placa que pisa el borde de arriba de la imagen.
  const texto = String(frase ?? "").trim();
  if (texto) {
    ctx.font = "700 56px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    const tw = Math.min(ctx.measureText(texto).width, ANCHO * 0.78);
    const pw = tw + 96;
    const ph = 104;
    const px = (ANCHO - pw) / 2;
    const py = Math.max(ALTO * 0.15, y - ph / 2);
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = color;
    placa(ctx, px, py, pw, ph, ph / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = textoSobre(color);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(texto, ANCHO / 2, py + ph / 2 + 2, ANCHO * 0.78);
  }
  return lienzo;
}

/** La historia lista para subir: un File JPEG de 1080 × 1920. */
export async function historiaDeRepost(src, frase, opciones = {}) {
  const img = await bitmap(src);
  const lienzo = dibujarHistoria(img, frase, opciones);
  img.close?.();
  const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.9));
  if (!blob) throw new Error("No se pudo dibujar la historia.");
  return new File([blob], "historia.jpg", { type: "image/jpeg" });
}
