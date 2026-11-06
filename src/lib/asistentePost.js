// ============================================================
// El asistente DENTRO de una publicación (puro)
//
// Abierto desde el panel de un post, el asistente sólo puede cambiar ESE
// post: su idea, sus textos, su diseño o una lámina de su carrusel. La
// regla no la pone el prompt —un modelo se puede equivocar de id—, la pone
// el código, en dos capas:
//   1. Las herramientas: fuera todo lo que crea, borra o mueve publicaciones,
//      lo que edita en lote y lo que escribe fuera del calendario (tareas,
//      banco de ideas, memorias).
//   2. La guarda: toda herramienta que nombre una publicación tiene que
//      nombrar ÉSTA; la que la omite la recibe puesta.
// Además el panel le da un calendario por el que sólo pasan los cambios de
// este post (PostSidePanel): lo que escriba, entra en el formulario abierto.
// ============================================================

import { mediosDe } from "./publicacion.js";
import { nombreEtapaCiclo } from "./cicloVentas.js";

/** Lo que puede usar dentro de un post. Las de servidor (cerebro, web, ver_calendario) son de lectura y siguen. */
export const HERRAMIENTAS_POST = Object.freeze(new Set([
  "editar_publicacion", "generar_imagen", "guardar_en_cerebro",
  "disenar_piezas", "corregir_pieza", "version_final", "poner_en_publicacion", "guardar_regla", "ver_lo_que_funciona",
]));

/** Las herramientas del navegador que quedan dentro de un post. Pura. */
export const herramientasDelPost = (tools = []) => tools.filter((t) => HERRAMIENTAS_POST.has(t?.name));

/**
 * Antes de ejecutar una herramienta dentro de un post: { entrada } (quizá con el post_id puesto) o { error } con lo que
 * se le contesta al modelo. Pura.
 */
export function guardaDelPost(postId, nombre, entrada = {}) {
  if (!HERRAMIENTAS_POST.has(nombre)) {
    return { error: `Dentro de esta publicación no puedes usar «${nombre}»: sólo se cambia esta publicación (${postId}).` };
  }
  const otro = (id) => id !== undefined && id !== null && String(id).trim() !== "" && String(id) !== postId;
  const e = { ...(entrada ?? {}) };
  if (otro(e.post_id)) {
    return { error: `Sólo puedes cambiar la publicación abierta (${postId}), no la ${e.post_id}.` };
  }
  if (nombre === "editar_publicacion" || nombre === "poner_en_publicacion") e.post_id = postId;
  if (nombre === "disenar_piezas") {
    const piezas = Array.isArray(e.piezas) ? e.piezas : [];
    if (piezas.some((p) => otro(p?.post_id))) return { error: `Las piezas sólo pueden ir a la publicación abierta (${postId}).` };
    // Un carrusel se pone entero en este post; las piezas sueltas, también aquí.
    if (e.carrusel === true) e.post_id = postId;
    else e.piezas = piezas.map((p) => ({ ...p, post_id: postId }));
  }
  return { entrada: e };
}

const corto = (t, n) => String(t ?? "").replace(/\s+$/g, "").slice(0, n);

/** Lo que el sistema del asistente sabe de la publicación abierta, y la regla. Pura. */
export function bloqueDelPost(post, fecha = "") {
  const medios = mediosDe(post);
  return [
    `ESTÁS DENTRO DE UNA PUBLICACIÓN (post_id ${post?.id}${fecha ? `, del ${fecha}` : ""}). Todo lo que hagas es para ELLA: no crees, borres ni muevas otras, y no cambies ninguna otra. Los cambios se ven al momento en el panel que la persona tiene abierto.`,
    "Para cambiar sus textos (título, idea, qué se ve, texto de la pieza, descripción, guion, hashtags, formato, hora, si va a pauta) usa editar_publicacion. Para su imagen o una lámina concreta del carrusel, corregir_pieza con la clave de esa imagen (las de abajo, en orden: la 1 es la portada). Para una imagen nueva, disenar_piezas (va a esta publicación). Antes de cambiar algo grande, di en una línea qué vas a cambiar.",
    `Formato: ${post?.format || "post"}${post?.publishTime ? ` · hora ${post.publishTime}` : ""}`,
    // Va a pauta (lib/pauta.js): su caption ES el texto principal del anuncio, y en el Ads Manager ya no se cambia.
    post?.pauta && typeof post.pauta === "object"
      ? `VA A PAUTA (etapa ${nombreEtapaCiclo(post.pauta.etapa) || "presentación"}): su descripción ES el texto principal del anuncio y en el Ads Manager ya no se cambia. Escríbela como anuncio: el gancho en la primera línea (unos 125 caracteres), un llamado a escribir por WhatsApp, nada que caduque («hoy», un día, un horario), 3 hashtags como mucho y nada que afirme algo de quien lee.${post?.anuncio?.textos?.length ? ` Ya tiene ${post.anuncio.textos.length} textos de anuncio aparte.` : ""}`
      : "",
    post?.title ? `Título: ${corto(post.title, 200)}` : "",
    post?.idea ? `Idea: ${corto(post.idea, 1500)}` : "",
    post?.escena ? `Qué se ve: ${corto(post.escena, 600)}` : "",
    post?.textoPieza ? `Texto de la pieza: ${corto(post.textoPieza, 600)}` : "",
    post?.descripcion ? `Descripción: ${corto(post.descripcion, 2500)}` : "",
    post?.guion ? `Guion: ${corto(post.guion, 3000)}` : "",
    post?.hashtagsFinales ? `Hashtags: ${corto(post.hashtagsFinales, 400)}` : "",
    medios.length
      ? `Sus archivos, en orden:\n${medios.map((m, i) => `${i + 1}. ${m.tipo === "video" ? "video" : "imagen"} · clave ${String(m.src).replace(/^\/api\/media\//, "")}${m.ancho ? ` · ${m.ancho}×${m.alto}` : ""}`).join("\n")}`
      : "Todavía no tiene archivos.",
  ].filter(Boolean).join("\n");
}
