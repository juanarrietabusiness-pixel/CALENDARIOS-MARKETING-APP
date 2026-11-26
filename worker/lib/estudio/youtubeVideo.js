// ============================================================
// PREPARAR un video animado para YOUTUBE (lo puro, en src/lib/youtubeVideo.js; la herramienta, `preparar_youtube`)
//
// Del video guardado sale lo que YouTube muestra: el título, la DESCRIPCIÓN (la letra entera, los CAPÍTULOS de sus
// tiempos, las citas que enseña y las redes del cliente), las etiquetas, la categoría (Música si va con canción), la
// hora a la que se publica (si se programa) y la MINIATURA de 1280×720: la imagen principal del video (su fondo más
// usado, en 16:9 si lo tiene) con el título en la letra del kit, dibujada en el Container y guardada en la galería.
// Con una publicación, todo eso queda en ella (`post.youtube`) y el publicador lo usa al subirlo a YouTube
// (worker/lib/publicador.js). No gasta IA.
// ============================================================

import { alContenedor, aBase64 } from "./cuadros.js";
import { subirArchivo } from "./galeria.js";
import { kitDe } from "./kit.js";
import { claveDelCliente } from "./archivos.js";
import { cambiarPublicacion } from "./ponerEnPost.js";
import { coloresPlantilla } from "../../../src/lib/carrusel.js";
import { ErrorVideo } from "../videosProyectos.js";
import { lineaDeTiempo, textoDeLocucion, guionParaFormato } from "../../../src/lib/videoEscenas.js";
import { esCancion, palabrasParaLinea } from "../../../src/lib/videoCancion.js";
import {
  capitulosDelVideo, citasDelGuion, descripcionYouTubeDelVideo, publicarElDesdePanama, CATEGORIA_MUSICA, CATEGORIA_PERSONAS,
} from "../../../src/lib/youtubeVideo.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };

/** La imagen PRINCIPAL del video: el fondo a sangre que más se ve (la de 16:9 si la tiene). → { id, byn } o null. */
export function imagenPrincipal(guion, linea) {
  const peso = new Map();
  const g = guionParaFormato(guion, "16:9");
  (g?.escenas ?? []).forEach((e, i) => {
    const c = (e.capas ?? []).find((x) => x?.tipo === "imagen" && x.encuadre === "completo" && x.archivo);
    if (!c) return;
    const dura = (linea?.escenas?.[i]?.hasta ?? 0) - (linea?.escenas?.[i]?.desde ?? 0);
    const antes = peso.get(c.archivo) ?? { id: c.archivo, segundos: 0, byn: c.tratamiento === "byn" };
    antes.segundos += Math.max(0.1, dura);
    peso.set(c.archivo, antes);
  });
  return [...peso.values()].sort((a, b) => b.segundos - a.segundos)[0] ?? null;
}

/**
 * Prepara el video `fila` para YouTube. `titulo` (si no, el del video), `publicarEl` («AAAA-MM-DDTHH:mm», hora de
 * Panamá), `etiquetas`, `miniatura` (false: sin ella), `postId` (la publicación donde dejarlo). → { titulo, descripcion,
 * capitulos, citas, etiquetas, categoria, publicarEl, miniatura (la ficha de la galería) | null, puesto, avisos }.
 */
export async function prepararYouTube(env, acceso, cliente, fila, { titulo = "", publicarEl = "", etiquetas = [], miniatura = true, postId = "", intro = "" } = {}) {
  const guion = leerJSON(fila.guion, null);
  if (!guion?.escenas?.length) throw new ErrorVideo("El video no tiene escenas.", 409);
  const locucion = leerJSON(fila.locucion, {});
  const linea = lineaDeTiempo(guion, palabrasParaLinea(guion, locucion));
  const avisos = [];
  const cancion = esCancion(locucion);
  const nombre = String(titulo || fila.titulo || "").replace(/\s+/g, " ").trim().slice(0, 100);
  const capitulos = capitulosDelVideo(guion, linea);
  if (!capitulos.length) avisos.push("Sin capítulos: YouTube pide al menos 3, el primero en 0:00 y de 10 s o más cada uno (este video no los da).");
  const citas = citasDelGuion(guion);
  const letra = cancion ? String(locucion.letra ?? "") : textoDeLocucion(guion);
  const descripcion = descripcionYouTubeDelVideo({
    titulo: nombre, intro, capitulos, letra, citas, redes: { instagram: cliente.instagram ?? "", whatsapp: cliente.whatsapp ?? "" },
  });
  const publicar = publicarEl ? publicarElDesdePanama(publicarEl) : null;
  if (publicarEl && !publicar) avisos.push(`«${publicarEl}» no es una fecha con hora (AAAA-MM-DDTHH:mm, hora de Panamá): no se programa.`);
  const limpias = (Array.isArray(etiquetas) ? etiquetas : []).map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean).slice(0, 30);

  // La miniatura: la imagen principal con el título, en el Container.
  let ficha = null;
  if (miniatura !== false) {
    const principal = imagenPrincipal(guion, linea);
    if (!principal) avisos.push("Sin miniatura: el video no tiene una imagen de fondo (la portada será la de la publicación o la que escoja YouTube).");
    else if (!env.VIDEO) avisos.push("Sin miniatura: el Container no está aquí.");
    else {
      try {
        const f = await acceso.leerUno("estudio_archivos", { id: String(principal.id), client_id: cliente.id });
        const clave = f && !f.borrado_at ? claveDelCliente(f.clave, cliente.id) : null;
        const obj = clave ? await env.MEDIA.get(clave) : null;
        if (!obj) throw new Error("la imagen principal ya no está en la galería");
        const kit = kitDe(cliente);
        const fuenteObj = kit.fuente?.clave ? await env.MEDIA.get(claveDelCliente(kit.fuente.clave, cliente.id) ?? "").catch(() => null) : null;
        const r = await alContenedor(env, "/portada-youtube", {
          imagen: aBase64(new Uint8Array(await obj.arrayBuffer())), titulo: nombre, byn: principal.byn,
          colores: { texto: "#FFFFFF", acento: coloresPlantilla(kit).acento },
          familia: kit.tipografia ?? "", ...(fuenteObj ? { fuente: { datos: aBase64(new Uint8Array(await fuenteObj.arrayBuffer())) } } : {}),
        });
        const j = await r.json();
        if (!j?.datos) throw new Error(j?.error || "el Container no devolvió la imagen");
        const bin = atob(j.datos);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        ficha = await subirArchivo(env, acceso, cliente, new File([bytes], "miniatura-youtube.jpg", { type: "image/jpeg" }));
      } catch (e) {
        avisos.push(`Sin miniatura: ${String(e?.message ?? e).slice(0, 160)}.`);
      }
    }
  }

  const datos = {
    titulo: nombre, descripcion, ...(limpias.length ? { etiquetas: limpias } : {}),
    categoria: cancion ? CATEGORIA_MUSICA : CATEGORIA_PERSONAS,
    ...(publicar ? { publicarEl: publicar } : {}),
    ...(ficha?.clave ? { miniatura: `/api/media/${ficha.clave}` } : {}),
  };
  let puesto = null;
  if (postId) {
    const r = await cambiarPublicacion(env, acceso, { clienteId: cliente.id, postId: String(postId), cambiar: (post) => ({ ...post, youtube: datos }) });
    if (r?.aviso) avisos.push(r.aviso);
    else puesto = { calendarId: r.calendarId, postId: String(postId) };
  }
  return { ...datos, capitulos, citas, miniatura: ficha, puesto, avisos };
}
