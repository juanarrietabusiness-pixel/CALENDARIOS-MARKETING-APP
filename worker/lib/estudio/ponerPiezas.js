// ============================================================
// «Poner en una publicación…» desde el Estudio: lo que YA está en la galería, a un post de cualquier mes
//
// Lo creado en la pestaña Estudio (y en su visor) no se podía poner en una publicación desde ahí: había que abrir el
// post, ir a «De la galería» y buscarlo otra vez (fase 4 de docs/propuesta-lo-mejor-y-creacion.md). Aquí va por el
// MISMO camino que lo que el servidor pone solo (fase 5, ponerEnPost.js): el calendario se escribe con su
// `updated_at` como condición (no pisa a quien guarda a la vez), la cola se mueve y las pantallas abiertas releen. Lo
// que cambia en la publicación es lo de `poner_en_publicacion` de Claude (`postConPiezas`: un carrusel entero en su
// orden o piezas sueltas, reemplazando o añadiendo; con dos imágenes o más el post pasa a carrusel), con su historia
// encajada si recibe su primera imagen, y se apunta el uso de cada pieza (la papelera no se la lleva). Una imagen a un
// REEL con su video va como su PORTADA («Como portada del video», o sola por la regla de `postConPiezas`).
// No crea ni cobra nada.
// ============================================================

import { NULO } from "../acceso.js";
import { archivoPublico, carpetaPublica, marcarUso } from "./galeria.js";
import { cambiarPublicacion } from "./ponerEnPost.js";
import { COLUMNAS_ARCHIVO } from "./encargos.js";
import { conHistoriaEncajada } from "../redesServidor.js";
import { piezasDeGrupo, postConPiezas } from "../../../src/lib/galeriaPura.js";
import { LIMITES } from "../../../src/lib/publicacion.js";

export class ErrorPoner extends Error {
  constructor(mensaje, estado = 400) { super(mensaje); this.estado = estado; }
}

const ID = /^[\w-]{1,80}$/;

/**
 * Las piezas que se ponen, en su orden: las de una carpeta de carrusel o de reel (`carpetaId`, como la galería las
 * enseña) o las sueltas (`archivoIds`, en el orden en que llegan). Todas del cliente y fuera de la papelera.
 */
async function piezasPedidas(acceso, cliente, { carpetaId = "", archivoIds = [] }) {
  if (carpetaId) {
    if (!ID.test(String(carpetaId))) throw new ErrorPoner("Ese grupo no existe.", 404);
    const carpeta = await acceso.leerUno("estudio_carpetas", { id: String(carpetaId), client_id: cliente.id });
    if (!carpeta) throw new ErrorPoner("No encontré ese grupo en la galería del cliente.", 404);
    const dentro = (await acceso.leer("estudio_archivos", { client_id: cliente.id, carpeta_id: carpeta.id, borrado_at: NULO }, "created_at asc", 200)).map(archivoPublico);
    const piezas = piezasDeGrupo(carpetaPublica(carpeta), dentro);
    // Un reel: su video (el primero de su orden). Un carrusel: sus láminas.
    const lista = carpeta.tipo === "reel" ? piezas.filter((a) => a.tipo === "video").slice(0, 1) : piezas.filter((a) => a.tipo === "imagen");
    if (!lista.length) throw new ErrorPoner("Ese grupo no tiene nada que poner todavía.", 409);
    return lista;
  }
  const ids = [...new Set((Array.isArray(archivoIds) ? archivoIds : []).map(String).filter((x) => ID.test(x)))].slice(0, LIMITES.instagram.carruselMax);
  if (!ids.length) throw new ErrorPoner("Falta qué poner.");
  const filas = new Map((await acceso.leerVarios("estudio_archivos", COLUMNAS_ARCHIVO, "id", ids, { client_id: cliente.id })).map((f) => [f.id, f]));
  const piezas = [];
  for (const id of ids) {
    const f = filas.get(id);
    if (!f || f.borrado_at) throw new ErrorPoner("Una de las piezas ya no está en la galería del cliente.", 404);
    if (f.tipo !== "imagen" && f.tipo !== "video") throw new ErrorPoner("Sólo se ponen imágenes y videos.");
    piezas.push(archivoPublico(f));
  }
  return piezas;
}

/**
 * Pone las piezas en la publicación `postId` del cliente (en `calendarId`, o en el mes en que esté). `modo`:
 * «reemplazar» (lo de antes sigue en la galería) o «anadir» al final. `como`: «portada» (UNA imagen, la portada del
 * video de un reel), «medio» (entre los archivos: lo escogió la persona) o nada (la regla de `postConPiezas`: a un reel
 * con su video, una imagen va de portada). → { calendarId, postId, n, formato, puestas, portada }.
 */
export async function ponerPiezasEnPost(env, acceso, cliente, { postId, calendarId = null, carpetaId = "", archivoIds = [], modo = "reemplazar", como = "" } = {}) {
  if (!ID.test(String(postId ?? ""))) throw new ErrorPoner("Falta la publicación.");
  const piezas = await piezasPedidas(acceso, cliente, { carpetaId, archivoIds });
  // La galería con varias escogidas no dice de qué tipo es la única que se pone: un video no es una portada, va por la regla.
  if (como === "portada" && piezas.some((a) => a.tipo !== "imagen")) como = "";
  let rechazo = "";
  let portada = false;
  const r = await cambiarPublicacion(env, acceso, {
    clienteId: cliente.id, calendarId: calendarId && ID.test(String(calendarId)) ? String(calendarId) : null, postId: String(postId),
    cambiar: async (post) => {
      const res = postConPiezas(post, piezas, modo === "anadir" ? "anadir" : "reemplazar", { como: ["portada", "medio"].includes(como) ? como : "" });
      if (res.error) { rechazo = res.error; return null; }
      portada = Boolean(res.portada);
      if (portada) return res.post;
      // Si el post RECIBE su primera imagen, su historia encajada (9:16), como el panel: en el Container (si no hay, sin ella).
      return conHistoriaEncajada(env, { antes: post, despues: res.post, clienteId: cliente.id, colorMarca: cliente.primary_color }).catch(() => res.post);
    },
  });
  if (rechazo) throw new ErrorPoner(rechazo, 409);
  if (!r?.postId) throw new ErrorPoner(r?.aviso ?? "No se pudo poner en la publicación.", 409);
  for (const a of piezas) await marcarUso(acceso, cliente.id, a.id, { calendarId: r.calendarId, postId: r.postId }).catch(() => null);
  const medios = Array.isArray(r.post?.medios) ? r.post.medios : [];
  return { calendarId: r.calendarId, postId: r.postId, n: medios.length, formato: r.post?.format ?? "", puestas: piezas.length, portada };
}
