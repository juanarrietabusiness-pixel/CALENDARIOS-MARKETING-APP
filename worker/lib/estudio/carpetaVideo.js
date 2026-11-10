// ============================================================
// La CARPETA de un video animado: sus fondos y sus renders juntos en la galería (una tarjeta «Reel»)
//
// Los fondos de IA de un video animado y cada mp4 que salía del render iban a la galería SUELTOS: un video con 13
// fondos y tres renders dejaba 16 tarjetas regadas entre las demás piezas. Ahora:
//   · el video que sale del MONTAJE de un reel usa la carpeta de su reel (la del encargo);
//   · al pedir sus fondos, el video recibe su carpeta de tipo «reel» («Video: <título>») y se apunta en `origen.carpetaId`
//     (sin subir la versión: no es el guion), y lo que ya tenía —renders y fondos de antes— entra en ella;
//   · el render va a esa carpeta si la tiene, delante en su orden. Si no la tiene (un video sin fondos), el mp4 nuevo
//     es una VERSIÓN del anterior de ese video (`deArchivo`) y la galería los enseña en una sola tarjeta.
// ============================================================

import { crearCarpeta } from "./galeria.js";

const leer = (t, d) => {
  if (t && typeof t === "object") return t;
  try { return JSON.parse(t) ?? d; } catch { return d; }
};

async function carpetaQueExiste(acceso, clienteId, id) {
  if (!id || typeof id !== "string") return null;
  return (await acceso.leerUno("estudio_carpetas", { id, client_id: clienteId }).catch(() => null)) ? id : null;
}

/**
 * El id de la carpeta del video (o null). Con `crear`, la crea si no tiene y mete en ella lo que el video ya tenía
 * suelto: sus renders (`ajustes.videoId`) y los fondos que su guion ya usa.
 */
export async function carpetaDelVideo(acceso, clienteId, fila, { crear = false } = {}) {
  if (!fila) return null;
  const origen = leer(fila.origen, {});
  const propia = await carpetaQueExiste(acceso, clienteId, origen.carpetaId);
  if (propia) return propia;
  if (origen.tipo === "reel" && origen.encargoId) {
    const e = await acceso.leerUno("estudio_encargos", { id: String(origen.encargoId), client_id: clienteId }).catch(() => null);
    const delReel = await carpetaQueExiste(acceso, clienteId, leer(e?.datos, {}).carpetaId);
    if (delReel) return delReel;
  }
  if (!crear) return null;
  const c = await crearCarpeta(acceso, clienteId, `Video: ${String(fila.titulo || "sin título").slice(0, 32)}`, { tipo: "reel" });
  await acceso.actualizar("videos_proyectos", { id: fila.id, client_id: clienteId }, { origen: JSON.stringify({ ...origen, carpetaId: c.id }) });
  await meterLoSuelto(acceso, clienteId, fila, c.id).catch((e) => console.error("carpeta del video:", e?.message ?? e));
  return c.id;
}

/** Los ids de archivo que usa el guion como imagen (los fondos y las imágenes que ya puso). */
export function archivosDeImagenDelGuion(guion) {
  const ids = new Set();
  for (const e of guion?.escenas ?? []) for (const c of e.capas ?? []) if (c?.tipo === "imagen" && typeof c.archivo === "string") ids.add(c.archivo);
  return ids;
}

async function meterLoSuelto(acceso, clienteId, fila, carpetaId) {
  const delGuion = archivosDeImagenDelGuion(leer(fila.guion, {}));
  const filas = await acceso.leerColumnas("estudio_archivos", ["id", "modelo", "ajustes", "carpeta_id", "origen"], { client_id: clienteId });
  const suyos = filas.filter((a) => !a.carpeta_id && (
    (a.modelo === "video-animado" && leer(a.ajustes, {}).videoId === fila.id)
    // Sólo lo que creó el Estudio para el video (no la foto del catálogo ni el logo que el guion también puede usar).
    || (delGuion.has(a.id) && a.origen === "estudio" && a.modelo && !String(a.modelo).startsWith("musica"))
  ));
  for (const a of suyos) await acceso.actualizar("estudio_archivos", { id: a.id, client_id: clienteId }, { carpeta_id: carpetaId });
}

/** Pone un archivo DELANTE en el orden de su carpeta, si la carpeta ya tiene orden (si no, la galería lo deduce). */
export async function alFrenteDelOrden(acceso, clienteId, carpetaId, archivoId) {
  const c = await acceso.leerUno("estudio_carpetas", { id: carpetaId, client_id: clienteId }).catch(() => null);
  const orden = leer(c?.orden, []);
  if (!c || !Array.isArray(orden) || !orden.length) return;
  await acceso.actualizar("estudio_carpetas", { id: carpetaId, client_id: clienteId }, {
    orden: JSON.stringify([archivoId, ...orden.filter((x) => x !== archivoId)].slice(0, 200)), updated_at: new Date().toISOString(),
  });
}
