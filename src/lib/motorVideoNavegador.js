// ============================================================
// Lo que el motor del video animado necesita EN EL NAVEGADOR (no es puro)
//
// El motor (motorVideo.js) no carga nada: recibe las imágenes ya cargadas, las
// familias de letra ya registradas y la textura del grano. Esto lo prepara en la
// pantalla; en el Container (fase 2) habrá su gemelo con un Canvas de Node, y el
// motor no cambia.
//
//   · Las imágenes se piden por /api/media (mismo origen: la CSP dice `img-src 'self'`).
//     Un `archivo` del guion es el id de la galería del cliente; uno que no está en la
//     galería se queda sin cargar y el motor pinta su marcador.
//   · Las imágenes llegan SIN su borde transparente (`sinBordeTransparente`, con `cajaOpaca` del
//     motor): un logo exportado con mucho aire se dibujaba diminuto dentro de su caja.
//   · El LOGO llega además sin su fondo liso (`quitarFondoLiso`: el blanco de un JPEG se veía como una tarjeta) y con
//     su tono (`logoTono`: las luces de lo que se ve), para que el motor sepa si necesita una placa detrás.
//   · La letra es la del kit (`kit.fuente`), registrada con `cargarFuente`; un guion
//     puede pedir otra con su clave del kit.
//   · Los CLIPS (capas `video`) son elementos <video> (también por /api/media) que el motor dibuja en el lienzo: el
//     proveedor (`proveedorDeVideos`) los lleva al segundo que pide cada cuadro. Mientras se reproduce, el clip corre
//     solo y sólo se corrige si se desfasa; parado, se busca el cuadro y al llegar se repinta (`alCambiar`). Suena si su
//     capa lleva `sonido` (si el navegador no deja sonar sin un toque, sigue mudo).
// ============================================================

import { ruidoDeGrano, cajaOpaca, FUENTE_CASA } from "./motorVideo";
import { quitarFondoLiso, tonoDeImagen } from "./motorPiezas";
import { archivosDelGuion, videosDelGuion } from "./videoEscenas";
import { cargarFuente } from "./muestraFuente";
// La LETRA DE LA CASA (Anton, OFL) para el rol gigante y el énfasis cuando el kit no tiene letra: el MISMO archivo que
// registra el Container (container/recursos.mjs), servido desde el propio sitio (`font-src 'self'`). Sólo en este
// chunk: nada de la carga inicial.
import archivoCasa from "@fontsource/anton/files/anton-latin-400-normal.woff2?url";

const imagenes = new Map();

/** Lo que se recorta como mínimo para que valga la pena una copia (fracción del lado). */
const MIN_RECORTE = 0.02;

/**
 * La imagen sin su borde transparente: un lienzo con sólo lo que se ve, o la misma imagen si no hay borde (o no se
 * pudo leer). Se mide sobre una copia de como mucho 1024 px de lado; el recorte se hace sobre el original.
 */
function sinBordeTransparente(img) {
  try {
    const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height;
    if (!w || !h || typeof document === "undefined") return img;
    const k = Math.min(1, 1024 / Math.max(w, h));
    const mw = Math.max(1, Math.round(w * k)); const mh = Math.max(1, Math.round(h * k));
    const prueba = document.createElement("canvas");
    prueba.width = mw; prueba.height = mh;
    const pc = prueba.getContext("2d", { willReadFrequently: true });
    if (!pc) return img;
    pc.drawImage(img, 0, 0, mw, mh);
    const caja = cajaOpaca(pc.getImageData(0, 0, mw, mh).data, mw, mh);
    if (!caja || (caja.w >= mw * (1 - MIN_RECORTE) && caja.h >= mh * (1 - MIN_RECORTE))) return img;
    // De la copia reducida al original, con un píxel de margen por el redondeo.
    const x = Math.max(0, Math.floor(caja.x / k) - 1); const y = Math.max(0, Math.floor(caja.y / k) - 1);
    const cw = Math.min(w - x, Math.ceil(caja.w / k) + 2); const ch = Math.min(h - y, Math.ceil(caja.h / k) + 2);
    const lienzo = document.createElement("canvas");
    lienzo.width = cw; lienzo.height = ch;
    const lc = lienzo.getContext("2d");
    if (!lc) return img;
    lc.drawImage(img, x, y, cw, ch, 0, 0, cw, ch);
    return lienzo;
  } catch {
    return img;
  }
}

/**
 * El logo: sin su fondo liso (a 1024 px de lado como mucho: basta para el video) y sin el borde que quede → { img,
 * tono }. Si no se puede leer, la imagen tal cual y sin tono.
 */
function prepararLogo(img) {
  try {
    const w = img.naturalWidth || img.width; const h = img.naturalHeight || img.height;
    if (!w || !h || typeof document === "undefined") return { img, tono: null };
    const k = Math.min(1, 1024 / Math.max(w, h));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(w * k)); lienzo.height = Math.max(1, Math.round(h * k));
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { img, tono: null };
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const r = quitarFondoLiso(datos.data, lienzo.width, lienzo.height);
    if (r.quitado) ctx.putImageData(datos, 0, 0);
    return { img: r.quitado ? sinBordeTransparente(lienzo) : sinBordeTransparente(img), tono: tonoDeImagen(datos.data) };
  } catch {
    return { img, tono: null };
  }
}

/** Una imagen de /api/media/<clave>, una sola vez por clave → sin su borde transparente, o null si no carga. */
function cargarImagen(clave, { logo = false } = {}) {
  if (!clave) return Promise.resolve(logo ? { img: null, tono: null } : null);
  const k = logo ? `logo:${clave}` : clave;
  if (!imagenes.has(k)) {
    imagenes.set(k, new Promise((resolver) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolver(logo ? prepararLogo(img) : sinBordeTransparente(img));
      img.onerror = () => { imagenes.delete(k); resolver(logo ? { img: null, tono: null } : null); };
      img.src = `/api/media/${clave}`;
    }));
  }
  return imagenes.get(k);
}

const videos = new Map();

/** Un clip de /api/media/<clave> como <video>, una vez por clave → el elemento ya con sus medidas, o null si no carga. */
function cargarVideo(clave) {
  if (!clave || typeof document === "undefined") return Promise.resolve(null);
  if (!videos.has(clave)) {
    videos.set(clave, new Promise((resolver) => {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.preload = "auto";
      let hecho = false;
      const fin = (ok) => {
        if (hecho) return;
        hecho = true;
        if (!ok) { videos.delete(clave); resolver(null); return; }
        // El motor mide con `width`/`height`: en un <video> son los atributos (0), no lo que mide el clip.
        v.width = v.videoWidth; v.height = v.videoHeight;
        resolver(v);
      };
      v.addEventListener("loadeddata", () => fin(v.videoWidth > 0), { once: true });
      v.addEventListener("error", () => fin(false), { once: true });
      setTimeout(() => fin(v.videoWidth > 0), 15000);
      v.src = `/api/media/${clave}`;
    }));
  }
  return videos.get(clave);
}

/**
 * El proveedor de cuadros de video para el motor: `(uso, segundo)` → el <video> en ese segundo (o null si aún no tiene
 * imagen). Si los pedidos de un clip avanzan seguidos (se está reproduciendo), el clip corre solo y sólo se corrige un
 * desfase de más de 0,35 s; si no (se mueve la barra), se pausa y se busca el cuadro exacto, y `alCambiar` repinta al
 * llegar. Sin pedidos durante 250 ms, se pausa (deja de sonar).
 */
export function proveedorDeVideos(porArchivo, { alCambiar = () => {}, conSonido = new Set() } = {}) {
  const estado = new Map();
  for (const [archivo, v] of porArchivo) {
    v.muted = !conSonido.has(archivo);
    v.addEventListener("seeked", () => alCambiar());
  }
  return (uso, s) => {
    const v = porArchivo.get(uso?.archivo);
    if (!v) return null;
    const ahora = performance.now();
    const e = estado.get(uso.archivo) ?? {};
    const sigue = e.ultimo != null && s >= e.ultimo && s - e.ultimo < 0.3 && ahora - e.cuando < 300;
    clearTimeout(e.parar);
    const parar = setTimeout(() => { if (!v.paused) v.pause(); }, 250);
    estado.set(uso.archivo, { ultimo: s, cuando: ahora, parar });
    const destino = Math.max(0, Math.min(s, (Number.isFinite(v.duration) ? v.duration : Infinity) - 0.05));
    if (sigue && destino < s) { if (!v.paused) v.pause(); } // pasado su final: quieto en el último cuadro
    else if (sigue) {
      if (v.paused) v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
      if (Math.abs(v.currentTime - destino) > 0.35) v.currentTime = destino;
    } else {
      if (!v.paused) v.pause();
      if (!v.seeking && Math.abs(v.currentTime - destino) > 0.04) v.currentTime = destino;
    }
    return v.readyState >= 2 ? v : null;
  };
}

/** Los ids de la galería que nombra un guion: vive en videoEscenas.js (lo usa también el Worker). */
export { archivosDelGuion };

let grano = null;
/** La textura del grano (256 × 256), hecha una vez. */
function texturaDeGrano() {
  if (grano || typeof document === "undefined") return grano;
  const lado = 256;
  const lienzo = document.createElement("canvas");
  lienzo.width = lado; lienzo.height = lado;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return null;
  ctx.putImageData(new ImageData(ruidoDeGrano(lado, 7), lado, lado), 0, 0);
  grano = lienzo;
  return grano;
}

let casa = null;
/** Registra la letra de la casa una vez (FontFace, como la del kit). → true si quedó lista. */
export function cargarLetraDeLaCasa() {
  if (casa) return casa;
  if (typeof FontFace === "undefined" || typeof document === "undefined" || !document.fonts) return Promise.resolve(false);
  casa = new FontFace(FUENTE_CASA, `url(${archivoCasa})`, { weight: "400", style: "normal" }).load()
    .then((f) => { document.fonts.add(f); return true; })
    .catch(() => { casa = null; return false; });
  return casa;
}

/**
 * Todo lo que necesita el motor para un guion → { recursos, fuentes, faltan }.
 *   archivos — la galería del cliente (`{ id, clave }`), para pasar del id a la clave
 *   kit      — el kit limpio (`logo`, `fuente`)
 *   alCambiar — se llama cuando llega el cuadro de un clip que se buscó (para repintar)
 * `faltan` son los ids que no están en la galería (salen como marcador).
 */
export async function prepararRecursos(guion, { archivos = [], kit = {}, alCambiar } = {}) {
  const porId = new Map(archivos.map((a) => [a.id, a]));
  const ids = archivosDelGuion(guion);
  const idsVideo = videosDelGuion(guion);
  const faltan = [...ids, ...idsVideo].filter((id) => !porId.has(id));
  const esVideo = (a) => a && (a.tipo === "video" || String(a.mime ?? "").startsWith("video/"));
  const [cargadas, logo, titular, cuerpo, clips] = await Promise.all([
    // La letra de la casa va siempre (pesa unos 18 kB): sin letra del kit, el gigante y el énfasis salen con ella.
    Promise.all(ids.map(async (id) => [id, await cargarImagen(porId.get(id)?.clave)])),
    cargarImagen(kit?.logo || "", { logo: true }),
    familiaDe(guion?.estilo?.fuentes?.titular, kit),
    familiaDe(guion?.estilo?.fuentes?.cuerpo, kit),
    Promise.all(idsVideo.map(async (id) => [id, esVideo(porId.get(id)) ? await cargarVideo(porId.get(id).clave) : null])),
    cargarLetraDeLaCasa(),
  ]);
  const mapa = new Map(cargadas);
  const porArchivo = new Map(clips.filter(([, v]) => v));
  const conSonido = new Set((guion?.escenas ?? []).flatMap((e) => e.capas ?? []).filter((c) => c.tipo === "video" && c.sonido).map((c) => c.archivo));
  return {
    recursos: {
      imagen: (id) => mapa.get(id) ?? null, logo: logo.img, logoTono: logo.tono, grano: texturaDeGrano(),
      video: proveedorDeVideos(porArchivo, { alCambiar, conSonido }),
      videoInfo: (id) => { const v = porArchivo.get(id); return v ? { ancho: v.videoWidth, alto: v.videoHeight, duracion: Number.isFinite(v.duration) ? v.duration : 0 } : null; },
    },
    fuentes: { titular: titular ? `"${titular}", system-ui, sans-serif` : "", cuerpo: cuerpo ? `"${cuerpo}", system-ui, sans-serif` : "" },
    faltan: [...faltan, ...[...cargadas, ...clips].filter(([id, x]) => porId.has(id) && !x).map(([id]) => id)],
  };
}

async function familiaDe(fuente, kit) {
  if (fuente && typeof fuente === "object" && fuente.clave) return cargarFuente({ clave: fuente.clave, nombre: fuente.nombre });
  return kit?.fuente?.clave ? cargarFuente(kit.fuente) : "";
}
