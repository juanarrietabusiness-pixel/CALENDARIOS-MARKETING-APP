// ============================================================
// «Poner en una publicación…» desde el Estudio: a qué publicación y el pedido al servidor
//
// La lista sale de los meses del cliente que ya tiene la aplicación (`client.calendars`, con sus días): de una semana
// atrás en adelante, en orden de fecha, y lo que pega con lo que se pone primero en su día (un video, en un reel o una
// historia; imágenes, en un post o un carrusel). Lo ya publicado no se ofrece: no se le cambian los archivos. El cambio
// lo hace el servidor (POST /api/estudio/<c>/poner, worker/lib/estudio/ponerPiezas.js), que no pisa a quien guarde a la
// vez y apunta el uso de cada pieza.
// ============================================================

import { pedir } from "./db";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const FORMATO = { post: "Post", carrusel: "Carrusel", reel: "Reel", historia: "Historia", live: "Directo" };
const sinTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** La fecha de hace `dias` días (o de dentro de) en AAAA-MM-DD, sin pasar por UTC. Pura. */
function moverDia(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Las publicaciones donde se puede poner algo: [{ postId, calendarId, fecha, etiqueta, medios, formato }]. `tipo`
 * («imagen» | «video» | «carrusel») ordena primero las que encajan dentro de cada día; `buscar` filtra por fecha,
 * formato o título (sin tildes) y entonces también entran las pasadas. Pura.
 */
export function publicacionesParaPoner(calendars = [], { hoy = "", tipo = "imagen", buscar = "", max = 80 } = {}) {
  const limite = hoy ? moverDia(hoy, -7) : "";
  const q = sinTildes(buscar).trim();
  const encaja = (f) => (tipo === "video" ? ["reel", "historia"].includes(f) : ["post", "carrusel", "historia", "", undefined].includes(f));
  const todas = [];
  for (const cal of calendars ?? []) {
    for (const d of cal?.days ?? []) {
      for (const p of d?.posts ?? []) {
        if (!p?.id || !d.date || p.status === "published") continue;
        const [, m, dia] = d.date.split("-").map(Number);
        const titulo = String(p.title || p.idea || "sin título").replace(/\s+/g, " ").trim().slice(0, 60);
        const etiqueta = `${dia} ${MESES[m - 1] ?? ""} · ${FORMATO[p.format] ?? "Post"} · ${titulo}`;
        if (q ? !sinTildes(`${d.date} ${etiqueta}`).includes(q) : d.date < limite) continue;
        const medios = Array.isArray(p.medios) ? p.medios.filter((x) => x?.src).length : p.image ? 1 : 0;
        todas.push({ postId: p.id, calendarId: cal.dbId || cal.id, fecha: d.date, etiqueta, medios, formato: p.format || "post", orden: encaja(p.format) ? 0 : 1 });
      }
    }
  }
  todas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden);
  return todas.slice(0, max).map(({ orden: _, ...x }) => x);
}

/** Pone en la publicación lo de la galería: `{ postId, calendarId, carpetaId | archivoIds, modo }`. → { calendarId, postId, n, formato }. */
export const ponerEnPublicacion = (clienteId, datos) =>
  pedir(`/estudio/${encodeURIComponent(clienteId)}/poner`, { method: "POST", body: JSON.stringify(datos) });

/** La dirección que abre esa publicación en su calendario (App lee `?publicacion=`). Pura. */
export const direccionDePublicacion = (clienteId, calendarId, postId) =>
  `/cliente/${encodeURIComponent(clienteId)}/${encodeURIComponent(calendarId)}?publicacion=${encodeURIComponent(postId)}`;
