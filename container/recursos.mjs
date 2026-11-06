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
import { ruidoDeGrano, cajaOpaca, FUENTE_CASA, ARCHIVO_FUENTE_CASA } from "../src/lib/motorVideo.js";
import { quitarFondoLiso, tonoDeImagen } from "../src/lib/motorPiezas.js";
import { videosEnInstante } from "../src/lib/motorVideo.js";
import { infoDe, cuadroDe } from "./clips.mjs";
import { bytesDeImagen } from "./imagenes.mjs";

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

/**
 * La LETRA DE LA CASA (Anton, OFL): la del rol gigante y el énfasis cuando el kit no tiene letra. El MISMO archivo que
 * carga el navegador (src/lib/motorVideoNavegador.js), del mismo paquete npm y con el mismo nombre: así la vista previa
 * y el render dibujan igual. → true si quedó registrada.
 */
export function registrarLetraDeLaCasa() {
  const archivo = createRequire(import.meta.url).resolve(ARCHIVO_FUENTE_CASA);
  return Boolean(GlobalFonts.registerFromPath(archivo, FUENTE_CASA));
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

/** El logo sin su fondo liso y sin borde, con su tono (como `prepararLogo` del navegador) → { img, tono }. */
async function cargarLogo(base64) {
  if (!base64) return { img: null, tono: null };
  const bytes = Buffer.from(base64, "base64");
  const k = `logo:${huella(bytes)}`;
  if (!imagenes.has(k)) {
    imagenes.set(k, loadImage(bytes).then((img) => {
      const f = Math.min(1, 1024 / Math.max(img.width, img.height));
      const lienzo = createCanvas(Math.max(1, Math.round(img.width * f)), Math.max(1, Math.round(img.height * f)));
      const ctx = lienzo.getContext("2d");
      ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
      const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
      const r = quitarFondoLiso(datos.data, lienzo.width, lienzo.height);
      if (r.quitado) ctx.putImageData(datos, 0, 0);
      return { img: sinBordeTransparente(r.quitado ? lienzo : img), tono: tonoDeImagen(datos.data) };
    }).catch(() => { imagenes.delete(k); return { img: null, tono: null }; }));
  }
  return imagenes.get(k);
}

/** Una imagen en base64 → lista para el motor (sin borde), o null si no se pudo leer. */
async function cargarImagen(base64) {
  if (!base64) return null;
  return cargarBytes(Buffer.from(base64, "base64"));
}

/** Una imagen subida antes (`PUT /imagen/<id>`, imagenes.mjs) → lista para el motor, o null si no está o no se lee. */
async function cargarSubida(id) {
  const bytes = await bytesDeImagen(id).catch(() => null);
  return bytes ? cargarBytes(bytes) : null;
}

/** Los bytes de una imagen → lista para el motor (sin borde), o null si no se pudo leer. */
async function cargarBytes(bytes) {
  const k = huella(bytes);
  if (!imagenes.has(k)) {
    imagenes.set(k, loadImage(bytes).then(sinBordeTransparente).catch(() => { imagenes.delete(k); return null; }));
  }
  return imagenes.get(k);
}

/** Registra una fuente (base64) una vez y devuelve su familia, o "" si no se pudo. */
export function registrarFuente(f) {
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
 * Del pedido a lo que recibe el motor → { recursos, fuentes, faltan, cuadros, infoVideos }.
 *   imagenes — { [id de la galería]: base64 }   logo — base64 | null
 *   fuentes  — { titular: { datos }, cuerpo: { datos } } (la del kit, o la que pida el guion)
 *   videos   — [ids de la galería] de los clips que el Worker ya SUBIÓ (`PUT /clip/<id>`, clips.mjs)
 *   imagenesSubidas — [ids de la galería] de las imágenes que no cabían en el pedido y ya SUBIÓ (`PUT /imagen/<id>`)
 * `cuadros` es el Map (uso → lienzo) que `recursos.video` lee: lo llena quien dibuja ANTES de cada cuadro
 * (`cuadrosParaUnInstante` o el decodificador del render), porque el motor no espera nada.
 */
export async function prepararRecursos({ imagenes: imgs = {}, logo = null, fuentes: fs = {}, videos = [], imagenesSubidas = [] } = {}) {
  const ids = Object.keys(imgs);
  const subidas = (Array.isArray(imagenesSubidas) ? imagenesSubidas : []).filter((v) => typeof v === "string" && !ids.includes(v));
  const vids = (Array.isArray(videos) ? videos : []).filter((v) => typeof v === "string");
  const [cargadas, logoImg, infos] = await Promise.all([
    Promise.all([
      ...ids.map(async (id) => [id, await cargarImagen(imgs[id])]),
      ...subidas.map(async (id) => [id, await cargarSubida(id)]),
    ]),
    cargarLogo(logo),
    Promise.all(vids.map(async (id) => [id, await infoDe(id).catch(() => null)])),
  ]);
  const mapa = new Map(cargadas);
  const infoVideos = new Map(infos.filter(([, i]) => i));
  const cuadros = new Map();
  const titular = registrarFuente(fs.titular);
  const cuerpo = registrarFuente(fs.cuerpo) || titular;
  // La de respaldo del motor nombra Roboto (registrada al arrancar): el texto sale aunque el kit no tenga letra.
  const familia = (f) => (f ? `"${f}", Roboto, sans-serif` : "");
  return {
    recursos: {
      imagen: (id) => mapa.get(id) ?? null, logo: logoImg.img, logoTono: logoImg.tono, grano: texturaDeGrano(),
      video: (uso) => cuadros.get(uso?.id) ?? null, videoInfo: (id) => infoVideos.get(id) ?? null,
    },
    fuentes: { titular: familia(titular), cuerpo: familia(cuerpo) },
    faltan: [...cargadas.filter(([, img]) => !img).map(([id]) => id), ...infos.filter(([, i]) => !i).map(([id]) => id)],
    cuadros, infoVideos,
  };
}

/**
 * Pone en `base.cuadros` los cuadros de video que pide el instante `t` (uno a uno, con ffmpeg: para /cuadro, /hoja y
 * /revisar, que dibujan pocos instantes). El render va con su decodificador (render.mjs).
 */
export async function cuadrosParaUnInstante(base, t) {
  base.cuadros.clear();
  for (const v of videosEnInstante(base.guion, base.linea, t)) {
    if (!base.infoVideos.has(v.archivo)) continue;
    const l = await cuadroDe(v.archivo, v.segundo).catch(() => null);
    if (l) base.cuadros.set(v.id, l);
  }
}
