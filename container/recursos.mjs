// ============================================================
// Lo que el motor del video animado necesita EN EL CONTAINER (el gemelo de src/lib/motorVideoNavegador.js)
//
// El motor (src/lib/motorVideo.js) no carga nada: recibe las imágenes ya cargadas, las familias de letra ya
// registradas y la textura del grano. En el navegador lo prepara motorVideoNavegador.js; aquí, lo mismo con el lienzo
// de Node (@napi-rs/canvas, Skia). Las dos tienen que hacer LO MISMO —quitar el borde transparente, la misma textura
// de grano, la letra del kit— o el cuadro del Container no sería el de la vista previa.
//
// Nada llega por red: el Worker manda las imágenes y las fuentes dentro del pedido (base64), ya leídas de R2 y ya
// comprobadas como de ESE cliente. El Container no tiene llaves ni salida a internet.
// ============================================================

import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { ruidoDeGrano, cajaOpaca } from "../src/lib/motorVideo.js";

/**
 * La letra de RESPALDO (la que usa un kit sin fuente): Roboto, que el motor nombra en `FUENTE_RESPALDO`. Llega por npm
 * (los TTF de Google Fonts, licencia OFL) y se registra aquí, sin depender de lo que traiga el sistema. Todos los
 * pesos con la misma familia: Skia escoge el peso que pide el motor (500, 700, 800, 900…).
 */
export function registrarRespaldo() {
  const base = dirname(createRequire(import.meta.url).resolve("@expo-google-fonts/roboto/package.json"));
  let n = 0;
  for (const carpeta of readdirSync(base, { withFileTypes: true })) {
    if (!carpeta.isDirectory()) continue;
    for (const f of readdirSync(join(base, carpeta.name))) if (f.endsWith(".ttf") && GlobalFonts.registerFromPath(join(base, carpeta.name, f), "Roboto")) n++;
  }
  return n;
}

/** Lo que se recorta como mínimo para que valga la pena una copia (fracción del lado). Igual que en el navegador. */
const MIN_RECORTE = 0.02;
const huella = (b) => createHash("sha256").update(b).digest("hex").slice(0, 16);

// El Container se queda despierto unos minutos entre pedidos: lo ya decodificado y registrado se reutiliza.
const imagenes = new Map();
const fuentes = new Map();

/** La imagen sin su borde transparente (como `sinBordeTransparente` del navegador). */
function sinBordeTransparente(img) {
  const w = img.width; const h = img.height;
  if (!w || !h) return img;
  const k = Math.min(1, 1024 / Math.max(w, h));
  const mw = Math.max(1, Math.round(w * k)); const mh = Math.max(1, Math.round(h * k));
  const prueba = createCanvas(mw, mh);
  const pc = prueba.getContext("2d");
  pc.drawImage(img, 0, 0, mw, mh);
  const caja = cajaOpaca(pc.getImageData(0, 0, mw, mh).data, mw, mh);
  if (!caja || (caja.w >= mw * (1 - MIN_RECORTE) && caja.h >= mh * (1 - MIN_RECORTE))) return img;
  const x = Math.max(0, Math.floor(caja.x / k) - 1); const y = Math.max(0, Math.floor(caja.y / k) - 1);
  const cw = Math.min(w - x, Math.ceil(caja.w / k) + 2); const ch = Math.min(h - y, Math.ceil(caja.h / k) + 2);
  const lienzo = createCanvas(cw, ch);
  lienzo.getContext("2d").drawImage(img, x, y, cw, ch, 0, 0, cw, ch);
  return lienzo;
}

/** Una imagen en base64 → lista para el motor (sin borde), o null si no se pudo leer. */
async function cargarImagen(base64) {
  if (!base64) return null;
  const bytes = Buffer.from(base64, "base64");
  const k = huella(bytes);
  if (!imagenes.has(k)) {
    imagenes.set(k, loadImage(bytes).then(sinBordeTransparente).catch(() => { imagenes.delete(k); return null; }));
  }
  return imagenes.get(k);
}

/** Registra una fuente (base64) una vez y devuelve su familia, o "" si no se pudo. */
function registrarFuente(f) {
  if (!f?.datos) return "";
  const bytes = Buffer.from(f.datos, "base64");
  const k = huella(bytes);
  if (!fuentes.has(k)) {
    const familia = `Marca${k}`;
    fuentes.set(k, GlobalFonts.register(bytes, familia) ? familia : "");
  }
  return fuentes.get(k);
}

let grano = null;
/** La textura del grano (256 × 256), la misma que en el navegador. */
function texturaDeGrano() {
  if (grano) return grano;
  const lado = 256;
  const lienzo = createCanvas(lado, lado);
  const ctx = lienzo.getContext("2d");
  const datos = ctx.createImageData(lado, lado);
  datos.data.set(ruidoDeGrano(lado, 7));
  ctx.putImageData(datos, 0, 0);
  grano = lienzo;
  return grano;
}

/**
 * Del pedido a lo que recibe el motor → { recursos, fuentes, faltan }.
 *   imagenes — { [id de la galería]: base64 }   logo — base64 | null
 *   fuentes  — { titular: { datos }, cuerpo: { datos } } (la del kit, o la que pida el guion)
 */
export async function prepararRecursos({ imagenes: imgs = {}, logo = null, fuentes: fs = {} } = {}) {
  const ids = Object.keys(imgs);
  const [cargadas, logoImg] = await Promise.all([
    Promise.all(ids.map(async (id) => [id, await cargarImagen(imgs[id])])),
    cargarImagen(logo),
  ]);
  const mapa = new Map(cargadas);
  const titular = registrarFuente(fs.titular);
  const cuerpo = registrarFuente(fs.cuerpo) || titular;
  // La de respaldo del motor nombra Roboto (registrada al arrancar): el texto sale aunque el kit no tenga letra.
  const familia = (f) => (f ? `"${f}", Roboto, sans-serif` : "");
  return {
    recursos: { imagen: (id) => mapa.get(id) ?? null, logo: logoImg, grano: texturaDeGrano() },
    fuentes: { titular: familia(titular), cuerpo: familia(cuerpo) },
    faltan: cargadas.filter(([, img]) => !img).map(([id]) => id),
  };
}
