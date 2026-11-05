// ============================================================
// «¿Está listo este video?»: el motor de video del espacio lo ve y dice si se puede publicar
//
// El video es uno de la galería (`archivoId`) o el puesto en una publicación (`clave`, siempre de ESTE cliente), como
// en «Extraer guion y adaptar». La revisión queda en `ajustes.revisionVideo` de la ficha: volver a abrirla no paga otra
// vez a Gemini (un video no cambia: una versión nueva es otro archivo), salvo con `otraVez`. Lo puro, en
// src/lib/revisionVideo.js.
// ============================================================

import { verVideo, ErrorVideo, MAX_BYTES_VIDEO } from "../geminiVideo.js";
import { bloqueoPorPresupuesto } from "../configIA.js";
import { claveDelCliente } from "./archivos.js";
import { ErrorEstudio } from "./trabajos.js";
import { kitDe } from "./kit.js";
import { leerMercado } from "../mercado.js";
import { productosActivos, lineaDeProducto } from "../../../src/lib/estudioMercado.js";
import { pedidoDeRevisionVideo, leerRevisionVideo, acabadoDelGuion, conAcabado } from "../../../src/lib/revisionVideo.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const FORMATOS = new Set(["reel", "historia", "youtube"]);

/** Lo que el render del video animado puso encima del mp4 (su guion), o null si el video no salió de ahí. */
async function acabadoDelVideo(acceso, clienteId, ajustes, conLogo) {
  if (!ajustes?.videoId) return null;
  const p = await acceso.leerUno("videos_proyectos", { id: String(ajustes.videoId), client_id: clienteId }).catch(() => null);
  if (!p) return null;
  return acabadoDelGuion(leerJSON(p.guion, {}), { conLogo });
}

/** → { revision, guardada } (`guardada`: venía de antes, sin pagar). */
export async function revisarVideo(env, acceso, cliente, { archivoId = "", clave = "", fotogramas = null, idea = "", productoId = "", formato = "reel", otraVez = false } = {}) {
  let archivo = archivoId ? await acceso.leerUno("estudio_archivos", { id: String(archivoId), client_id: cliente.id }) : null;
  if (!archivo && clave) {
    const k = claveDelCliente(clave, cliente.id);
    if (!k) throw new ErrorEstudio("Ese video no es de este cliente.", 404);
    archivo = (await acceso.leer("estudio_archivos", { client_id: cliente.id, clave: k }))[0] ?? null;
    if (!archivo) {
      const cabeza = await env.MEDIA.head(k);
      if (!cabeza) throw new ErrorEstudio("El video ya no está en el almacenamiento.", 404);
      archivo = { id: null, clave: k, tipo: "video", mime: cabeza.httpMetadata?.contentType || "video/mp4", ajustes: "{}" };
    }
  }
  if (!archivo || archivo.borrado_at) throw new ErrorEstudio("Ese video no está en la galería de este cliente.", 404);
  if (archivo.tipo !== "video" || !/^video\//.test(archivo.mime ?? "")) throw new ErrorEstudio("Sólo se revisan videos.", 400);

  const ajustes = leerJSON(archivo.ajustes, {});
  if (!otraVez && ajustes.revisionVideo?.criterios) return { revision: ajustes.revisionVideo, guardada: true };

  const bloqueo = await bloqueoPorPresupuesto(acceso);
  if (bloqueo) throw new ErrorEstudio(bloqueo, 402);
  const obj = await env.MEDIA.get(archivo.clave);
  if (!obj) throw new ErrorEstudio("El video ya no está en el almacenamiento.", 404);
  if (obj.size > MAX_BYTES_VIDEO) throw new ErrorEstudio("El video es demasiado grande para revisarlo.", 413);

  const { catalogo, inventario } = await leerMercado(acceso, cliente.id).catch(() => ({ catalogo: [], inventario: false }));
  const producto = productoId ? productosActivos(catalogo).find((p) => p.id === productoId) : null;
  const conLogo = Boolean(kitDe(cliente).logo);
  // El mp4 de un video animado (o del MONTAJE de un reel): lo que lleva encima lo puso el código, sin faltas.
  const acabado = await acabadoDelVideo(acceso, cliente.id, ajustes, conLogo);
  const prompt = pedidoDeRevisionVideo({
    marca: cliente.name, idea, formato: FORMATOS.has(formato) ? formato : "reel", conLogo, acabado,
    producto: producto ? lineaDeProducto(producto, { inventario }).slice(2) : "",
  });
  let texto;
  try {
    texto = await verVideo(env, acceso, {
      bytes: await obj.arrayBuffer(), mime: archivo.mime, nombre: archivo.clave.split("/").pop(), clienteId: cliente.id,
      prompt, funcion: "revisión de video", json: true, fotogramas,
    });
  } catch (e) {
    if (e instanceof ErrorVideo) throw new ErrorEstudio(e.message, e.estado, e.codigo ? { codigo: e.codigo } : {});
    throw e;
  }
  const revision = conAcabado(leerRevisionVideo(texto), acabado);
  if (!revision) throw new ErrorEstudio("La IA no devolvió una revisión que se pueda leer. Inténtalo otra vez.", 502);
  const guardar = { ...revision, at: new Date().toISOString(), porFotogramas: Boolean(fotogramas?.length) };
  // Sólo se recuerda en una ficha de la galería (un video suelto de una publicación no tiene dónde).
  if (archivo.id) await acceso.actualizar("estudio_archivos", { id: archivo.id, client_id: cliente.id }, { ajustes: JSON.stringify({ ...ajustes, revisionVideo: guardar }) }).catch(() => {});
  return { revision: guardar, guardada: false };
}
