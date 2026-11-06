// ============================================================
// «Montarlo aquí»: el proyecto de video animado que sale de un reel por planos (lo puro en src/lib/montajeReel.js)
//
// Lo llama la etapa de montaje del encargo del reel (encargoReel.js). Con lo que salió —un clip limpio por plano, o el
// video con todo— arma el guion del montaje (una escena por plano: el clip a sangre, lo que se dice, el gancho, el
// logo y el llamado), lo VALIDA como cualquier guion (`crearProyecto`) y lo guarda ligado a su publicación, con
// `origen` = { tipo: "reel", encargoId }: así el render pone el mp4 en el sitio del video crudo de ese reel.
// Además rellena el caption, el guion y la portada de la publicación si están vacíos (sólo rellena).
// ============================================================

import { difundir } from "../vivo.js";
import { crearProyecto } from "../videosProyectos.js";
import { kitDe } from "./kit.js";
import { cambiarPublicacion } from "./ponerEnPost.js";
import { guionDeMontaje, sePuedeMontar, textoDelGuionReel, comprobarMontaje } from "../../../src/lib/montajeReel.js";
import { rellenarVacios } from "../../../src/lib/resultadoEnPost.js";

const SISTEMA = { userId: "sistema", nombre: "Estudio", color: "", tab: null };

/** El fotograma FINAL de un paso del storyboard (el que la persona corrigió manda). */
const finalDe = (p) => (p?.fase === "hecho" ? (p.finales?.[0] ?? p.opciones?.[0]?.id ?? null) : null);

/**
 * Lo que se monta de un encargo de reel: el video con todo, o los clips de cada plano (en el orden de los planos), con
 * el FOTOGRAMA revisado de cada plano: el plano cuyo clip no salió, o de toma fija, se monta con él. Pura.
 */
export function fuenteDelEncargo(datos = {}, pasos = []) {
  if (datos.salida === "uno") {
    const v = datos.video ?? {};
    return { tipo: "uno", archivoId: v.fase === "hecho" ? v.archivoId : null, duracion: Number(v.segundos) || 0 };
  }
  return {
    tipo: "clips",
    clips: pasos.map((p) => (p.clip?.fase === "hecho" && p.clip.archivoId ? { archivoId: p.clip.archivoId, duracion: Number(p.clip.segundos) || 0 } : null)),
    fotogramas: pasos.map(finalDe),
  };
}

/** La clave del primer fotograma hecho (la portada de la publicación, si no tiene). */
const portadaDe = (pasos = []) => pasos.find((p) => p.fase === "hecho" && p.opciones?.[0]?.clave)?.opciones[0].clave ?? "";

/**
 * Crea el proyecto del montaje (borrador). → { video, fila, avisos, puesto }. Lanza ErrorVideo si el guion no valida
 * (no debería: lo escribe el código) o si no hay con qué montar.
 */
export async function crearMontaje(env, acceso, cliente, { encargo, pasos, datos, usuario = null, por = SISTEMA }) {
  const fuente = fuenteDelEncargo(datos, pasos);
  if (!sePuedeMontar(fuente)) throw Object.assign(new Error("No hay ningún clip ni video que montar: crea primero los clips (o el video)."), { estado: 409 });
  const reel = datos.reel ?? {};
  const guion = guionDeMontaje({
    reel: { ...reel, titulo: encargo.titulo || reel.titulo },
    fuente,
    titulo: encargo.titulo,
    conLogo: Boolean(kitDe(cliente)?.logo),
    // El video con todo, hecho SIN voz (la pone el montaje), trae su música y su ambiente: se oyen debajo de la voz.
    sonidoClip: fuente.tipo === "uno" && datos.video?.sinVoz === true,
    voz: datos.montaje?.conVoz !== false,
  });
  // Nada de lo que dice el reel se salta al montar (el gancho, la marca, el producto): si faltara algo, no se sigue.
  const graves = comprobarMontaje(reel, guion, { voz: datos.montaje?.conVoz !== false });
  if (graves.length) throw Object.assign(new Error(`Error grave del montaje: ${graves.join(" ")}`), { estado: 500 });
  const r = await crearProyecto(acceso, cliente, {
    guion, titulo: encargo.titulo || guion.titulo, calendarId: datos.calendarId ?? null, postId: datos.postId ?? null, usuario,
    origen: { tipo: "reel", encargoId: encargo.id },
    // La estructura de guion que siguió la voz del reel (la dijo su guion): la recuerda también el montaje.
    estructuraId: reel.estructuraId ?? "",
    // Sobre clips reales los efectos de transición (whoosh, pop) sobran: la música de la marca, sí.
    ...(fuente.tipo === "clips" ? { sonido: { efectos: false } } : {}),
  });
  difundir(env, acceso.ownerId, { tipo: "videos", clienteId: cliente.id, id: r.video.id, por });
  // Los textos de la publicación (sólo si están vacíos): el caption, el guion por tramos y la portada.
  let puesto = null;
  if (datos.postId) {
    const portada = portadaDe(pasos);
    puesto = await cambiarPublicacion(env, acceso, {
      clienteId: cliente.id, calendarId: datos.calendarId ?? null, postId: datos.postId, por,
      cambiar: (post) => {
        const r2 = rellenarVacios(post, { descripcion: reel.descripcion, guion: textoDelGuionReel(reel), portada: portada ? `/api/media/${portada}` : "", estructura: reel.estructuraId ?? "" });
        return r2.rellenados.length ? r2.post : null;
      },
    }).catch(() => null);
  }
  const fila = await acceso.leerUno("videos_proyectos", { id: r.video.id, client_id: cliente.id });
  return { video: r.video, fila, avisos: r.avisos, puesto };
}
