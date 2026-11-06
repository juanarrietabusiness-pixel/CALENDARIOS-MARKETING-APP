// ============================================================
// Lo que el servidor PONE SOLO en una publicación al terminar algo (puro; lo usa el Worker)
//
// Un reel del encargo, el mp4 del montaje o las piezas que pidió Claude con `post_id` llegan a su publicación sin que
// nadie pulse «Poner»: el archivo en su sitio y, si la publicación los tiene VACÍOS, el caption, el guion y la portada.
// Sólo rellena: lo que escribió una persona gana siempre (la misma regla que «Generar guiones»).
// ============================================================

import { imagenDelReelAPortada } from "./publicacion.js";

const vacio = (v) => !String(v ?? "").trim();

/**
 * Los campos de texto que se rellenan (sólo si están vacíos) y cómo se llaman en la publicación. `estructura`: el id de
 * la ESTRUCTURA de guion de la agencia que siguió la voz en off (lib/formulasUgc.js), que la publicación recuerda.
 */
const CAMPOS = Object.freeze({ descripcion: "descripcion", guion: "guion", portada: "portada", hashtags: "hashtagsFinales", estructura: "estructuraVoz" });

/**
 * La publicación con `campos` puestos donde está vacía: { descripcion, guion, portada, hashtags, estructura }. Una descripción
 * vacía que tenía el campo heredado `script` cuenta como escrita. → { post, rellenados: [nombres] }. Pura.
 */
export function rellenarVacios(post = {}, campos = {}) {
  const salida = { ...post };
  const rellenados = [];
  for (const [nombre, campo] of Object.entries(CAMPOS)) {
    const valor = String(campos[nombre] ?? "").trim();
    if (!valor) continue;
    const escrito = nombre === "descripcion" ? !vacio(post.descripcion) || !vacio(post.script) : !vacio(post[campo]);
    if (escrito) continue;
    salida[campo] = valor;
    rellenados.push(nombre);
  }
  // La portada que se puso no la fija un milisegundo del video.
  if (rellenados.includes("portada")) salida.portadaMs = null;
  return { post: salida, rellenados };
}

/**
 * El VIDEO puesto en la publicación: en el sitio del que `esSuyo(medio)` reconoce (la versión anterior de ESTE
 * resultado), o el primero (lo demás se queda: lo puso una persona). Se trabaja sobre `post.medios` tal cual, para no
 * perder las marcas (`videoAnimado`, `deReel`). → la publicación nueva. Pura.
 */
export function conVideoEnPost(post = {}, medio, esSuyo = () => false) {
  const medios = Array.isArray(post.medios) ? post.medios.filter((m) => m?.src) : (post.image ? [{ src: post.image, tipo: "imagen", nombre: "" }] : []);
  const k = medios.findIndex((m) => esSuyo(m));
  const lista = [...medios];
  if (k >= 0) lista[k] = medio; else lista.unshift(medio);
  // Sin duplicados del mismo archivo (pasa al reponer lo que ya estaba).
  const vistos = new Set();
  const limpia = lista.filter((m) => !vistos.has(m.src) && vistos.add(m.src));
  const primeraImagen = limpia.find((m) => m.tipo !== "video")?.src ?? null;
  const con = { ...post, medios: limpia, image: primeraImagen, mediosCambiadosAt: new Date().toISOString() };
  // Un REEL no lleva imágenes: la que estaba esperando al video (la portada que Claude diseñó antes de que el reel
  // terminara) pasa a su portada, si aún no tenía. Con varias, o con portada ya puesta, se queda: lo dice la revisión.
  return con.format === "reel" && !String(con.portada ?? "").trim() ? imagenDelReelAPortada(con) : con;
}
