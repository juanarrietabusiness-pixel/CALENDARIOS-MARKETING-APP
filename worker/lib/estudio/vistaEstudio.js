// ============================================================
// Lo que el Estudio le da a la VISTA PREVIA del chat de Claude (MCP Apps, worker/lib/mcpVista/)
//
// Las herramientas de Claude que crean o miran piezas (estado_encargo, estado_trabajo, ver_pieza, disenar_piezas,
// crear_en_estudio, corregir_pieza) devuelven, además de su texto y sus imágenes, una VISTA (`structuredContent`): las
// piezas en orden con su estado. Mientras algo sigue en marcha, la vista dice `seguir`, y la página de claude.ai llama
// cada pocos segundos una herramienta SÓLO SUYA (Claude no la ve):
//   · vista_encargo / vista_trabajo: lo mismo que estado_encargo / estado_trabajo, pero sólo con las imágenes que la
//     página aún no tiene (`ya`). Mandar las seis cada cinco segundos serían megas para nada.
//   · me_gusta_pieza: el «Me gusta» de la galería (enseña al kit, como en la aplicación).
//   · vista_video: cómo va un video animado (el mp4 y la locución, con sus reproductores) mientras se renderiza o se
//     genera su voz.
//   · vista_medios: otra dirección firmada para un audio o video cuya dirección caducó (la conversación se reabrió al
//     día siguiente): sin ella, el reproductor se quedaría roto.
// Todas pasan por la misma capa de acceso que el resto del conector: un encargo, una pieza o un video de otro espacio (o
// de un cliente que el colaborador no lleva) no existe.
// ============================================================

import { encargoPublico } from "./encargos.js";
import { cambiarArchivo } from "./galeria.js";
import { difundir } from "../vivo.js";
import { vistaDe, piezaDe } from "../mcpVista/modelo.js";
import { vistaDeTrabajo, imagenesNuevas, clienteDe, listaDeIds, esImagen } from "./vistaTrabajo.js";
import { videosDelReel, vistaDeVideo, videoParaVista, renovarMedios } from "./vistaMedios.js";

export { vistaDeTrabajo };

export class ErrorVista extends Error {}

const ESTADO_DE_FASE = { nuevo: "esperando", generando: "en_marcha", opciones: "en_marcha", hecho: "lista", fallido: "fallida" };
const finalesDe = (p) => (p.fase === "hecho" ? (p.finales?.length ? p.finales : (p.opciones ?? []).map((o) => o.id)) : []).filter(Boolean);

/**
 * La vista de un ENCARGO (lote o carrusel): un hueco por pieza que falta y la pieza por cada archivo que salió.
 * → { e (el encargo público), porId (fichas de lo listo), imagenes, vista }.
 */
export async function vistaDeEncargo(env, acceso, fila, { ya = [] } = {}) {
  const e = encargoPublico(fila);
  const ids = [...new Set(e.pasos.flatMap(finalesDe))];
  const filas = ids.length ? await acceso.leerVarios("estudio_archivos", ["id", "clave", "mime", "tipo", "favorito", "client_id"], "id", ids) : [];
  const porId = new Map(filas.filter((f) => f.client_id === fila.client_id).map((f) => [f.id, f]));
  const vistos = listaDeIds(ya);
  const { imagenes, indice, sinVista, quedan } = await imagenesNuevas(env, ids.map((x) => porId.get(x)).filter(Boolean), vistos);
  const carrusel = e.tipo === "carrusel";
  const piezas = [];
  e.pasos.forEach((p, i) => {
    const finales = finalesDe(p);
    const nombre = p.titulo || (carrusel ? `Lámina ${i + 1}` : `Pieza ${i + 1}`);
    if (!finales.length) {
      piezas.push(piezaDe({ id: `paso-${p.id}`, titulo: nombre, estado: ESTADO_DE_FASE[p.fase] ?? "en_marcha", nota: p.error ?? "", archivo: false }));
      return;
    }
    const control = p.opciones?.[0]?.control ?? null;
    finales.forEach((id, k) => {
      const f = porId.get(id);
      piezas.push(piezaDe({
        id, titulo: finales.length > 1 ? `${nombre} · ${k + 1}` : nombre, estado: "lista", imagen: indice.get(id) ?? null, control,
        gusta: Boolean(f?.favorito), sinImagen: !f || !esImagen(f) || sinVista.has(id), archivo: Boolean(f),
      }));
    });
  });
  const vivo = e.estado === "en_marcha";
  const listas = piezas.filter((p) => p.estado === "lista").length;
  // Un reel: su mp4 montado (o el video o los clips que salieron), con su reproductor.
  const videos = e.tipo === "reel" ? await videosDelReel(env, acceso, e) : [];
  const vista = vistaDe({
    tipo: "piezas",
    titulo: e.titulo || (carrusel ? "Carrusel" : "Piezas del director"),
    subtitulo: piezas.length ? `${listas} de ${piezas.length} ${carrusel ? "láminas" : "piezas"} listas${vivo ? "" : e.estado === "hecho" ? " · terminado" : ""}` : vivo ? "El director está diseñando…" : "",
    cliente: await clienteDe(acceso, fila.client_id),
    estado: vivo ? "en_marcha" : e.estado,
    piezas,
    videos,
    // Mientras siga, o mientras queden imágenes por mandar (como mucho seis por vuelta).
    seguir: vivo || quedan > 0 ? { herramienta: "vista_encargo", argumentos: { encargo_id: e.id }, cada: vivo ? 5 : 1 } : null,
    aviso: e.error ?? "",
  });
  return { e, porId, imagenes, vista };
}

/** Las definiciones (forma de MCP) de las herramientas que sólo llama la página de la vista. */
export const DEFINICIONES_VISTA = Object.freeze([
  {
    name: "vista_encargo",
    description: "Sólo para la vista previa del chat (la llama ella): cómo va un encargo del director, con las imágenes que la vista aún no tiene. Para mirar un encargo, usa estado_encargo.",
    inputSchema: { type: "object", properties: { encargo_id: { type: "string" }, ya: { type: "array", items: { type: "string" }, description: "Los ids que la vista ya enseña." } }, required: ["encargo_id"] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "vista_trabajo",
    description: "Sólo para la vista previa del chat (la llama ella): cómo va un pedido del Estudio, con las imágenes que la vista aún no tiene. Para mirar un pedido, usa estado_trabajo.",
    inputSchema: { type: "object", properties: { trabajo_id: { type: "string" }, titulo: { type: "string" }, ya: { type: "array", items: { type: "string" } } }, required: ["trabajo_id"] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "vista_video",
    description: "Sólo para la vista previa del chat (la llama ella): cómo va un video animado, con el mp4 y la locución para reproducirlos. Para mirar un video, usa ver_video.",
    inputSchema: { type: "object", properties: { video_id: { type: "string" } }, required: ["video_id"] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "vista_medios",
    description: "Sólo para la vista previa del chat (la llama ella cuando la dirección de un audio o un video caducó): las direcciones nuevas. No la uses por tu cuenta.",
    inputSchema: { type: "object", properties: { refs: { type: "array", items: { type: "string" }, description: "Lo que identifica cada audio o video (su «ref» en la vista)." } }, required: ["refs"] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "me_gusta_pieza",
    description: "Sólo para la vista previa del chat (la llama ella cuando la persona toca «Me gusta»): marca o desmarca una pieza de la galería. No la uses por tu cuenta.",
    inputSchema: { type: "object", properties: { archivo_id: { type: "string" }, me_gusta: { type: "boolean" } }, required: ["archivo_id", "me_gusta"] },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
]);

/** Las herramientas de la vista → { nombre: fn(entrada) → { texto, imagenes, vista } | texto }. */
export function crearHerramientasVista({ env, acceso, por }) {
  return {
    async vista_encargo({ encargo_id: id, ya = [] }) {
      const fila = await acceso.leerUno("estudio_encargos", { id: String(id ?? "") });
      if (!fila) throw new ErrorVista(`No encontré el encargo «${id}».`);
      const { imagenes, vista } = await vistaDeEncargo(env, acceso, fila, { ya });
      return { texto: vista.subtitulo || vista.titulo, imagenes, vista };
    },

    async vista_trabajo({ trabajo_id: id, ya = [], titulo = "" }) {
      const fila = await acceso.leerUno("estudio_trabajos", { id: String(id ?? "") });
      if (!fila) throw new ErrorVista(`No encontré el pedido «${id}».`);
      const { imagenes, vista } = await vistaDeTrabajo(env, acceso, fila, { ya, titulo: String(titulo ?? "").slice(0, 80) });
      return { texto: vista.subtitulo || vista.titulo, imagenes, vista };
    },

    async vista_video({ video_id: id }) {
      const v = await videoParaVista(acceso, id);
      if (!v) throw new ErrorVista(`No encontré el video «${id}».`);
      const vista = await vistaDeVideo(env, v);
      return { texto: vista.subtitulo || vista.titulo, imagenes: [], vista };
    },

    async vista_medios({ refs = [] }) {
      const { audios, videos } = await renovarMedios(env, acceso, refs);
      const n = audios.length + videos.length;
      return { texto: n ? `${n === 1 ? "Una dirección nueva" : `${n} direcciones nuevas`}.` : "Nada que renovar.", imagenes: [], vista: vistaDe({ tipo: "medios", titulo: "", audios, videos }) };
    },

    async me_gusta_pieza({ archivo_id: id, me_gusta: gusta }) {
      if (typeof gusta !== "boolean") throw new ErrorVista("Falta si gusta o no (me_gusta: true o false).");
      const f = await acceso.leerUno("estudio_archivos", { id: String(id ?? "") });
      if (!f || f.borrado_at) throw new ErrorVista("Esa pieza ya no está en la galería.");
      await cambiarArchivo(acceso, f.client_id, f.id, { favorito: gusta });
      difundir(env, acceso.ownerId, { tipo: "estudio", clientId: f.client_id, por });
      return gusta ? "Marcada con «Me gusta»." : "Quitado el «Me gusta».";
    },
  };
}
