// ============================================================
// «Generar» la idea de UNA publicación, como el Estudio
//
// Antes, la Idea / Brief de un post vacío se pedía con una frase genérica
// («una idea creativa… máximo 2 oraciones») y «publicación de post» sin decir
// qué es un post: salían ideas planas, a veces de carrusel o de reel para un
// post. Ahora va por el MISMO camino que el lote (worker/lib/estudio/lote.js,
// modo «publicacion»): el formato dicho con todas sus letras, el tipo, el
// producto, el nivel, el deseo y el perfil que ya trae la publicación, el
// estudio de mercado, el catálogo con su precio exacto, la fecha especial del
// día, la campaña y la semana, y lo que ya hay en el mes para no repetirlo.
//
// Sólo RELLENA: título, idea, qué se ve, el texto de la pieza (no en carrusel
// ni en video), el guion (carrusel y reel), el caption, los hashtags y la forma
// (composición y gancho). Lo que ya tiene texto se queda.
//
// «Planificar mes» va por el MISMO motor, todo el mes de una vez (modo «plan»,
// `ideasDelPlan`): cada casilla con su formato, su tipo y su matriz, más la
// estrategia del mes (campaña, ofertas, el concepto de cada semana).
// Con una idea ya escrita, «Completar» va por el mismo motor en su modo
// «campos» (src/lib/escribirTextos.js): mejora la de la persona, no la cambia
// por otra. Lo mismo el guion, el caption y el texto de la pieza.
// ============================================================

import { pedir } from "./db";
import { estrategiaDelCalendario } from "./estrategiaMes.js";
import { camposDePromptListo } from "./promptImagen.js";
import { FORMATO_DEL_LOTE, formatoDelPlan, usadosDelMes } from "./ideaPublicacionPura.js";

// Lo puro (lo que también lee el Worker: el conector de Claude) vive en ideaPublicacionPura.js: se reexporta aquí, donde
// lo buscan las pantallas.
export { FORMATO_DEL_LOTE, formatoDelPlan, usadosDelMes, casillasSinIdea, rellenarConIdea, conIdea } from "./ideaPublicacionPura.js";

/** ¿Esta publicación se escribe como el lote? (formato conocido e idea vacía). Pura. */
export const ideaComoElLote = (post = {}) => Boolean(FORMATO_DEL_LOTE[post.format]) && !String(post.idea ?? "").trim();

/** El contexto que no está en la matriz: la campaña, la semana, la fecha y el título si ya lo tiene. Pura. */
export function notaDePublicacion(post = {}, day = {}, cal = {}) {
  return [
    cal?.campaign ? `campaña del mes: ${cal.campaign}` : "",
    day?.concept ? `semana: ${day.concept}` : "",
    post.title ? `título: ${post.title}` : "",
    post.escena ? `qué se ve (ya escrito): ${post.escena}` : "",
  ].filter(Boolean).join(" · ").slice(0, 600);
}

/** Pide la idea al servidor → la idea (titulo, brief, titular, apoyo, escena, textoPieza, guion…). */
export async function ideaParaPublicacion(clienteId, { post, day, cal }) {
  const r = await pedir(`/estudio/${encodeURIComponent(clienteId)}/lote/ideas`, {
    method: "POST",
    body: JSON.stringify({
      modo: "publicacion", formato: FORMATO_DEL_LOTE[post.format] ?? "post",
      publicacion: {
        fecha: day?.date ?? "", pilar: post.pilar ?? "", pilarSub: post.pilarSub ?? "", productoId: post.productoId ?? "",
        nivel: post.nivel ?? "", deseo: post.deseo ?? "", perfil: post.perfil ?? "",
        ...(post.format === "reel" && post.rostro ? { rostro: true } : {}),
        // Va a pauta: la idea sale escrita como anuncio, con sus textos aparte (lo limpia el servidor; lib/pauta.js).
        ...(post.pauta && typeof post.pauta === "object" ? { pauta: post.pauta } : {}),
      },
      nota: notaDePublicacion(post, day, cal), usados: usadosDelMes(cal, post.id), semilla: Date.now() % 997,
      // La estrategia del mes entera (objetivo, foco, ofertas, código, cada semana con su etapa), no sólo la campaña.
      ...(cal ? { estrategia: estrategiaDelCalendario(cal) } : {}),
    }),
  });
  const idea = r?.ideas?.[0];
  if (!idea) throw new Error("La IA no devolvió una idea que se pueda leer. Inténtalo otra vez.");
  return idea;
}

/**
 * Las casillas del plan para el motor: una por publicación del alcance, con su clave «fecha|índice», su formato, su
 * tipo y su matriz, el concepto de su semana, la fecha especial del día y la idea que ya escribió una persona.
 * `dias`: [{ date, wk, impDate, formats: [{ format, pilar }] }]; `matriz`: Map clave → campos; `ideas`: fecha → [post].
 * Los directos se quedan fuera. Pura.
 */
export function casillasDelPlan(dias = [], { matriz = new Map(), semanas = [], ideas = {} } = {}) {
  const fuera = [];
  for (const d of dias) {
    (d.formats ?? []).forEach((f, j) => {
      const formato = formatoDelPlan(f.format);
      if (!formato) return;
      const clave = `${d.date}|${j}`;
      const m = matriz.get(clave) ?? {};
      const previa = (ideas[d.date] ?? [])[j] ?? {};
      fuera.push({
        clave, fecha: d.date, formato,
        ...Object.fromEntries(["pilar", "pilarSub", "productoId", "nivel", "deseo", "perfil"].map((k) => [k, previa[k] || m[k] || ""]).filter(([, v]) => v)),
        ...(semanas[(d.wk ?? 1) - 1] ? { semana: semanas[(d.wk ?? 1) - 1] } : {}),
        ...(d.impDate?.name ? { especial: d.impDate.name } : {}),
        ...(String(previa.idea ?? "").trim() ? { idea: String(previa.idea).trim() } : {}),
        ...(String(previa.estructuraRef ?? "").trim() ? { estructuraRef: String(previa.estructuraRef).trim() } : {}),
        ...(formato === "reel" && f.rostro ? { rostro: true } : {}),
      });
    });
  }
  return fuera;
}

// La estrategia del mes que va al motor vive en estrategiaMes.js (la lee también el Worker): se reexporta aquí, donde
// la buscan las pantallas.
export { estrategiaDelCalendario };

/** Pide al motor las ideas de una tanda del plan → { ideas (cada una con su `clave`), total, aviso }. */
/** «Proponer la estrategia con IA» → { estrategia, mejores, semanas, aviso }. Propone: no guarda nada. */
export const estrategiaConIA = (clienteId, cuerpo) =>
  pedir(`/estudio/${encodeURIComponent(clienteId)}/estrategia`, { method: "POST", body: JSON.stringify(cuerpo) });

export const ideasDelPlan = (clienteId, cuerpo) =>
  pedir(`/estudio/${encodeURIComponent(clienteId)}/lote/ideas`, { method: "POST", body: JSON.stringify({ ...cuerpo, modo: "plan" }) });

/**
 * «Otra» de una publicación (revisión interna o el lote): su casilla con su formato, su tipo y su matriz, la idea que
 * había (para que la nueva sea distinta) y lo que pide la agencia. Null si el formato no se escribe por el motor. Pura.
 */
export function casillaParaOtra(post = {}, day = {}, { pide = "" } = {}) {
  const formato = formatoDelPlan(post.format);
  if (!formato) return null;
  return {
    clave: post.id, ...(day?.date ? { fecha: day.date } : {}), formato,
    ...Object.fromEntries(["pilar", "pilarSub", "productoId", "nivel", "deseo", "perfil"].map((k) => [k, post[k] || ""]).filter(([, v]) => v)),
    ...(day?.concept ? { semana: day.concept } : {}),
    ...(day?.specialDate ? { especial: day.specialDate } : {}),
    antes: String(post.title || post.idea || "").trim().slice(0, 200),
    ...(String(pide).trim() ? { pide: String(pide).trim().slice(0, 300) } : {}),
    ...(post.pauta && typeof post.pauta === "object" ? { pauta: post.pauta } : {}),
  };
}

/**
 * La idea nueva SOBRE la publicación («Otra»: se pidió otra, así que se reemplaza lo que escribió la IA): título, idea,
 * qué se ve, texto de la pieza o guion, caption, hashtags y forma. Lo demás (fecha, hora, medios, matriz) se queda. Pura.
 */
export function reemplazarConIdea(post = {}, idea = {}) {
  const guiado = post.format === "carrusel" || post.format === "reel";
  const nueva = {
    ...post,
    title: idea.titulo || idea.titular || post.title || "",
    idea: idea.brief || idea.escena || post.idea || "",
    escena: idea.escena || "",
    textoPieza: guiado ? "" : idea.textoPieza || "",
    guion: guiado ? idea.guion || "" : post.guion || "",
    descripcion: idea.descripcion || post.descripcion || "",
    hashtagsFinales: idea.hashtags || post.hashtagsFinales || "",
    composicion: idea.composicion || "",
    tactica: idea.tactica || "",
    // La forma del gancho y el ángulo de la idea nueva (se pidió otra: se reemplazan).
    formaGancho: idea.formaGancho || "",
    angulo: idea.angulo || "",
    ...(guiado && idea.estructura ? { estructura: idea.estructura } : {}),
    ...(post.format === "reel" && post.rostro && idea.ganchos?.length ? { ganchosUgc: idea.ganchos } : {}),
    // Lo que va a pauta: los textos de anuncio de la idea nueva (se pidió otra: también se reemplazan).
    ...(idea.anuncio?.textos?.length ? { anuncio: idea.anuncio } : {}),
    sugerencia: "",
    promptImagen: "",
    promptImagenDe: "",
    promptImagenPor: "",
  };
  return idea.imagen && !guiado ? { ...nueva, ...camposDePromptListo(nueva, idea.imagen) } : nueva;
}
