// ============================================================
// La hoja de «Las piezas juntas»: las piezas del mes en un solo JPEG, numeradas (lienzo)
//
// La IA mira UNA imagen en vez de veinte: cuesta lo de una revisión y ve lo que ve quien abre el perfil. Cada pieza
// va entera (encajada en su celda, sin recortar: un recorte escondería justo el logo o el texto) sobre un fondo neutro,
// con su número en la esquina. Una imagen que no carga deja la celda con «sin imagen» y su número, para que la cuenta
// no se descuadre.
// ============================================================

import { rejillaDeHoja, MAX_PIEZAS_SERIE } from "./piezasJuntas";

const CELDA = 320;
const HUECO = 12;

function cargar(src) {
  return new Promise((resolver) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => resolver(null);
    img.src = src;
  });
}

/** `srcs`: las rutas de las imágenes, en orden. → { base64 (JPEG, sin el prefijo data:), total }. */
export async function hojaDePiezas(srcs = []) {
  const lista = srcs.slice(0, MAX_PIEZAS_SERIE);
  const { columnas, filas } = rejillaDeHoja(lista.length);
  const lienzo = document.createElement("canvas");
  lienzo.width = columnas * CELDA + (columnas + 1) * HUECO;
  lienzo.height = filas * CELDA + (filas + 1) * HUECO;
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#e9e9ec";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  const imagenes = await Promise.all(lista.map(cargar));
  imagenes.forEach((img, i) => {
    const x = HUECO + (i % columnas) * (CELDA + HUECO);
    const y = HUECO + Math.floor(i / columnas) * (CELDA + HUECO);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, CELDA, CELDA);
    if (img) {
      const escala = Math.min(CELDA / img.naturalWidth, CELDA / img.naturalHeight);
      const w = img.naturalWidth * escala;
      const h = img.naturalHeight * escala;
      ctx.drawImage(img, x + (CELDA - w) / 2, y + (CELDA - h) / 2, w, h);
    } else {
      ctx.fillStyle = "#888888";
      ctx.font = "20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("sin imagen", x + CELDA / 2, y + CELDA / 2);
    }
    // El número, en una placa oscura que se lee sobre cualquier fondo.
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(x, y, 48, 38);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), x + 24, y + 20);
    ctx.textBaseline = "alphabetic";
  });
  const url = lienzo.toDataURL("image/jpeg", 0.82);
  return { base64: url.slice(url.indexOf(",") + 1), total: lista.length };
}
