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
//   · La letra es la del kit (`kit.fuente`), registrada con `cargarFuente`; un guion
//     puede pedir otra con su clave del kit.
// ============================================================

import { ruidoDeGrano, cajaOpaca } from "./motorVideo";
import { cargarFuente } from "./muestraFuente";

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

/** Una imagen de /api/media/<clave>, una sola vez por clave → sin su borde transparente, o null si no carga. */
function cargarImagen(clave) {
  if (!clave) return Promise.resolve(null);
  if (!imagenes.has(clave)) {
    imagenes.set(clave, new Promise((resolver) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolver(sinBordeTransparente(img));
      img.onerror = () => { imagenes.delete(clave); resolver(null); };
      img.src = `/api/media/${clave}`;
    }));
  }
  return imagenes.get(clave);
}

/** Los ids de la galería que nombra un guion (imágenes, teléfonos, antes y después). Pura. */
export function archivosDelGuion(guion) {
  const ids = new Set();
  for (const e of guion?.escenas ?? []) {
    for (const c of e.capas ?? []) for (const k of ["archivo", "archivoAntes", "archivoDespues"]) if (c[k]) ids.add(c[k]);
  }
  return [...ids];
}

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

/**
 * Todo lo que necesita el motor para un guion → { recursos, fuentes, faltan }.
 *   archivos — la galería del cliente (`{ id, clave }`), para pasar del id a la clave
 *   kit      — el kit limpio (`logo`, `fuente`)
 * `faltan` son los ids que no están en la galería (salen como marcador).
 */
export async function prepararRecursos(guion, { archivos = [], kit = {} } = {}) {
  const porId = new Map(archivos.map((a) => [a.id, a]));
  const ids = archivosDelGuion(guion);
  const faltan = ids.filter((id) => !porId.has(id));
  const [cargadas, logo, titular, cuerpo] = await Promise.all([
    Promise.all(ids.map(async (id) => [id, await cargarImagen(porId.get(id)?.clave)])),
    cargarImagen(kit?.logo || ""),
    familiaDe(guion?.estilo?.fuentes?.titular, kit),
    familiaDe(guion?.estilo?.fuentes?.cuerpo, kit),
  ]);
  const mapa = new Map(cargadas);
  return {
    recursos: { imagen: (id) => mapa.get(id) ?? null, logo, grano: texturaDeGrano() },
    fuentes: { titular: titular ? `"${titular}", system-ui, sans-serif` : "", cuerpo: cuerpo ? `"${cuerpo}", system-ui, sans-serif` : "" },
    faltan: [...faltan, ...cargadas.filter(([id, img]) => porId.has(id) && !img).map(([id]) => id)],
  };
}

async function familiaDe(fuente, kit) {
  if (fuente && typeof fuente === "object" && fuente.clave) return cargarFuente({ clave: fuente.clave, nombre: fuente.nombre });
  return kit?.fuente?.clave ? cargarFuente(kit.fuente) : "";
}
