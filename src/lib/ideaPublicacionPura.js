// ============================================================
// Lo PURO de la idea de una publicación: lo que necesitan la pantalla y el Worker
//
// ideaPublicacion.js (el cliente de POST /api/estudio/<c>/lote/ideas) importa
// `./db`, el cliente HTTP del navegador, y el Worker no puede cargarlo. Lo que
// no habla con nadie vive aquí y ideaPublicacion.js lo reexporta, así las
// pantallas no cambian: las casillas del plan sin idea, lo que ya hay en el mes
// (para no repetirlo) y cómo se pone una idea del motor en su publicación (sólo
// rellena). Lo usan «Completar los textos», el asistente del mes y la
// herramienta escribir_textos del conector de Claude (worker/lib/herramientasTextos.js).
//
// En el navegador, sólo ideaPublicacion.js importa este archivo (las pantallas importan de allí): con otro importador,
// rollup lo saca a un chunk propio que entra en la precarga del chunk del Estudio, y eso lo pasa de su tope de 20 kB.
// ============================================================

import { semanaDelMes } from "./semanas.js";
import { llevaCaption } from "./reglasFormato.js";
import { camposDePromptListo } from "./promptImagen.js";

/** Los formatos que se escriben por el camino del lote; un directo sigue con el de siempre. */
export const FORMATO_DEL_LOTE = Object.freeze({ post: "post", historia: "historia", carrusel: "carrusel", reel: "reel" });

/** Los formatos que el motor sabe escribir; un directo («live») sigue por el camino de siempre. */
export const formatoDelPlan = (format) => FORMATO_DEL_LOTE[format] ?? "";

/** Lo que ya hay en el mes (título o primera línea del texto de la pieza), para no repetirlo. Pura. */
export function usadosDelMes(cal, postId = "") {
  const fuera = [];
  for (const d of cal?.days ?? []) {
    for (const p of d.posts ?? []) {
      if (p.id === postId) continue;
      const t = String(p.title || String(p.textoPieza ?? "").split("\n")[0] || "").trim();
      if (t && !fuera.includes(t)) fuera.push(t.slice(0, 80));
    }
  }
  return fuera.slice(0, 30);
}

/**
 * Las casillas de las publicaciones de un calendario que NO tienen idea (para «Completar los textos que faltan»): la
 * clave es el id de la publicación, y van su formato, su tipo y su matriz, el concepto de su semana y la fecha especial
 * del día. Pura.
 */
export function casillasSinIdea(cal) {
  const fuera = [];
  for (const d of cal?.days ?? []) {
    // La semana es la FILA de la rejilla (lunes a domingo, la de la tarjeta de la campaña); el concepto del día, respaldo.
    const semana = String((cal?.weekConcepts ?? [])[semanaDelMes(d.date) - 1] || d.concept || "").trim();
    for (const p of d.posts ?? []) {
      const formato = formatoDelPlan(p.format);
      if (!formato || String(p.idea ?? "").trim() || p.status === "published") continue;
      fuera.push({
        clave: p.id, fecha: d.date, formato,
        ...Object.fromEntries(["pilar", "pilarSub", "productoId", "nivel", "deseo", "perfil"].map((k) => [k, p[k] || ""]).filter(([, v]) => v)),
        ...(semana ? { semana } : {}),
        ...(d.specialDate ? { especial: d.specialDate } : {}),
        ...(formato === "reel" && p.rostro ? { rostro: true } : {}),
        // Va a pauta: el motor la escribe como anuncio (lo limpia el servidor; lib/pauta.js).
        ...(p.pauta && typeof p.pauta === "object" ? { pauta: p.pauta } : {}),
      });
    }
  }
  return fuera;
}

/** Los cambios que pone la idea en la publicación, SÓLO en lo vacío → { cambios, campos } (campos: qué se rellenó). Pura. */
export function rellenarConIdea(post = {}, idea = {}) {
  const vacio = (k) => !String(post[k] ?? "").trim();
  const video = post.format === "reel";
  const carrusel = post.format === "carrusel";
  // La regla de cada formato (lib/reglasFormato.js): una historia no lleva caption ni hashtags.
  const conCaption = llevaCaption(post.format);
  const propuesta = {
    title: idea.titulo || idea.titular || "",
    idea: idea.brief || idea.escena || "",
    escena: idea.escena || "",
    // El texto encima del diseño: en un carrusel va lámina por lámina (en el guion) y a un video no se le pide.
    textoPieza: carrusel || video ? "" : idea.textoPieza || "",
    guion: carrusel || video ? idea.guion || "" : "",
    descripcion: conCaption ? idea.descripcion || "" : "",
    hashtagsFinales: conCaption ? idea.hashtags || "" : "",
    composicion: idea.composicion || "",
    tactica: idea.tactica || "",
    // La forma del gancho y el ángulo de venta (lib/formasGancho.js, el estudio de mercado): para no repetirlos y aprender.
    formaGancho: idea.formaGancho || "",
    angulo: idea.angulo || "",
    ...(carrusel && idea.estructura ? { estructura: idea.estructura } : {}),
    // Lo que trae la matriz, si la publicación no lo tenía (así «Crear con IA» sabe de qué producto es).
    ...(idea.productoId ? { productoId: idea.productoId, producto: idea.producto ?? "" } : {}),
    ...(idea.nivel ? { nivel: idea.nivel } : {}),
    // La fórmula UGC que siguió el guion (sólo en un reel con rostro).
    ...(video && post.rostro && idea.formulaUgc ? { formulaUgc: idea.formulaUgc } : {}),
  };
  const cambios = {};
  for (const [k, v] of Object.entries(propuesta)) if (String(v ?? "").trim() && vacio(k)) cambios[k] = v;
  // El producto va con su nombre: o los dos, o ninguno (uno que ya tenía producto no lo cambia).
  if (!cambios.productoId) delete cambios.producto;
  // El pedido de la imagen, listo, sólo si la publicación queda diciendo lo que escribió la IA (qué se ve y su texto).
  const queda = { ...post, ...cambios };
  const igual = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();
  if (idea.imagen && !carrusel && !video && igual(queda.escena, idea.escena) && igual(queda.textoPieza, propuesta.textoPieza)) {
    Object.assign(cambios, camposDePromptListo(queda, idea.imagen));
  }
  // Los 3 ganchos de una UGC (uno con cada forma), si no tenía.
  if (video && post.rostro && idea.ganchos?.length && !(Array.isArray(post.ganchosUgc) && post.ganchosUgc.length)) cambios.ganchosUgc = idea.ganchos;
  // Lo que va a pauta: sus textos de anuncio aparte (un objeto), si no tenía (lib/pauta.js; aquí sin importarlo: este
  // archivo lo carga el panel y la regla del anuncio arrastra el estudio de mercado).
  if (idea.anuncio?.textos?.length && !post.anuncio?.textos?.length) cambios.anuncio = idea.anuncio;
  const NOMBRES = { title: "título", idea: "idea", escena: "qué se ve", textoPieza: "texto de la pieza", guion: "guion", descripcion: "descripción", hashtagsFinales: "hashtags", anuncio: "textos del anuncio", ganchosUgc: "ganchos" };
  return { cambios, campos: Object.keys(cambios).map((k) => NOMBRES[k]).filter(Boolean) };
}

/**
 * Una idea del motor (modo «plan») puesta en su publicación: sólo rellena lo vacío (`rellenarConIdea`) y, si la
 * publicación no la tenía, la matriz que le dio el motor (producto, nivel, deseo, perfil, la maleta). Es lo que hace el
 * paso de las ideas del asistente del mes con cada tanda. Pura.
 */
export function conIdea(p, idea) {
  const extra = Object.fromEntries(["productoId", "producto", "nivel", "deseo", "perfil", "pilarSub"].filter((k) => idea[k] && !p[k]).map((k) => [k, idea[k]]));
  return { ...p, ...rellenarConIdea(p, idea).cambios, ...extra };
}
