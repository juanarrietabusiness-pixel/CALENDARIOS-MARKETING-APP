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
//   · La letra es la del kit (`kit.fuente`), registrada con `cargarFuente`; un guion
//     puede pedir otra con su clave del kit.
// ============================================================

import { ruidoDeGrano } from "./motorVideo";
import { cargarFuente } from "./muestraFuente";

const imagenes = new Map();

/** Una imagen de /api/media/<clave>, una sola vez por clave → HTMLImageElement, o null si no carga. */
function cargarImagen(clave) {
  if (!clave) return Promise.resolve(null);
  if (!imagenes.has(clave)) {
    imagenes.set(clave, new Promise((resolver) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolver(img);
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
