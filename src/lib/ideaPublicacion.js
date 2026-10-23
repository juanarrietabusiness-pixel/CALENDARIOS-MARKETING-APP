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
// Con una idea ya escrita, «Completar» sigue en api.js (instruccionIdea): mejora
// la de la persona, no la cambia por otra.
// ============================================================

import { pedir } from "./db";
import { limpiarEstrategia, objetivoDe, semanasConEtapa } from "./estrategiaMes.js";
import { camposDePromptListo } from "./promptImagen.js";

/** Los formatos que se escriben por este camino; un directo sigue con el de siempre. */
export const FORMATO_DEL_LOTE = Object.freeze({ post: "post", historia: "historia", carrusel: "carrusel", reel: "reel" });

/** ¿Esta publicación se escribe como el lote? (formato conocido e idea vacía). Pura. */
export const ideaComoElLote = (post = {}) => Boolean(FORMATO_DEL_LOTE[post.format]) && !String(post.idea ?? "").trim();

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
      },
      nota: notaDePublicacion(post, day, cal), usados: usadosDelMes(cal, post.id), semilla: Date.now() % 997,
    }),
  });
  const idea = r?.ideas?.[0];
  if (!idea) throw new Error("La IA no devolvió una idea que se pueda leer. Inténtalo otra vez.");
  return idea;
}

/** Los formatos que el motor sabe escribir; un directo («live») sigue por el camino de siempre. */
export const formatoDelPlan = (format) => FORMATO_DEL_LOTE[format] ?? "";

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
        ...(formato === "reel" && f.rostro ? { rostro: true } : {}),
      });
    });
  }
  return fuera;
}

/**
 * Las casillas de las publicaciones de un calendario que NO tienen idea (para «Completar los textos que faltan»): la
 * clave es el id de la publicación, y van su formato, su tipo y su matriz, el concepto de su semana y la fecha especial
 * del día. Pura.
 */
export function casillasSinIdea(cal) {
  const fuera = [];
  for (const d of cal?.days ?? []) {
    for (const p of d.posts ?? []) {
      const formato = formatoDelPlan(p.format);
      if (!formato || String(p.idea ?? "").trim() || p.status === "published") continue;
      fuera.push({
        clave: p.id, fecha: d.date, formato,
        ...Object.fromEntries(["pilar", "pilarSub", "productoId", "nivel", "deseo", "perfil"].map((k) => [k, p[k] || ""]).filter(([, v]) => v)),
        ...(d.concept ? { semana: d.concept } : {}),
        ...(d.specialDate ? { especial: d.specialDate } : {}),
        ...(formato === "reel" && p.rostro ? { rostro: true } : {}),
      });
    }
  }
  return fuera;
}

/**
 * La estrategia del mes que va al motor, sacada del calendario: campaña, ofertas, código, el concepto de cada semana
 * (con su etapa del embudo) y, si se planeó con estrategia (`opciones.estrategia`), el objetivo y el producto foco. Pura.
 */
export function estrategiaDelCalendario(cal) {
  const e = limpiarEstrategia(cal?.opciones?.estrategia);
  const obj = objetivoDe(e?.objetivo);
  const conceptos = Array.isArray(cal?.weekConcepts) ? cal.weekConcepts : [];
  return {
    campana: cal?.campaign ?? "", ofertas: cal?.offers ?? "", codigo: cal?.promoCode ?? "",
    semanas: e?.etapas?.length ? semanasConEtapa(conceptos, e.etapas) : conceptos,
    ...(obj ? { objetivo: `${obj.nombre} — ${obj.ayuda}` } : {}),
    ...(e?.foco ? { foco: e.foco, focoId: e.focoId } : {}),
  };
}

/** Pide al motor las ideas de una tanda del plan → { ideas (cada una con su `clave`), total, aviso }. */
/** «Proponer la estrategia con IA» → { estrategia, mejores, semanas, aviso }. Propone: no guarda nada. */
export const estrategiaConIA = (clienteId, cuerpo) =>
  pedir(`/estudio/${encodeURIComponent(clienteId)}/estrategia`, { method: "POST", body: JSON.stringify(cuerpo) });

export const ideasDelPlan = (clienteId, cuerpo) =>
  pedir(`/estudio/${encodeURIComponent(clienteId)}/lote/ideas`, { method: "POST", body: JSON.stringify({ ...cuerpo, modo: "plan" }) });

/** Los cambios que pone la idea en la publicación, SÓLO en lo vacío → { cambios, campos } (campos: qué se rellenó). Pura. */
export function rellenarConIdea(post = {}, idea = {}) {
  const vacio = (k) => !String(post[k] ?? "").trim();
  const video = post.format === "reel";
  const carrusel = post.format === "carrusel";
  const propuesta = {
    title: idea.titulo || idea.titular || "",
    idea: idea.brief || idea.escena || "",
    escena: idea.escena || "",
    // El texto encima del diseño: en un carrusel va lámina por lámina (en el guion) y a un video no se le pide.
    textoPieza: carrusel || video ? "" : idea.textoPieza || "",
    guion: carrusel || video ? idea.guion || "" : "",
    descripcion: idea.descripcion || "",
    hashtagsFinales: idea.hashtags || "",
    composicion: idea.composicion || "",
    tactica: idea.tactica || "",
    // Lo que trae la matriz, si la publicación no lo tenía (así «Crear con IA» sabe de qué producto es).
    ...(idea.productoId ? { productoId: idea.productoId, producto: idea.producto ?? "" } : {}),
    ...(idea.nivel ? { nivel: idea.nivel } : {}),
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
  const NOMBRES = { title: "título", idea: "idea", escena: "qué se ve", textoPieza: "texto de la pieza", guion: "guion", descripcion: "descripción", hashtagsFinales: "hashtags" };
  return { cambios, campos: Object.keys(cambios).map((k) => NOMBRES[k]).filter(Boolean) };
}

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
    sugerencia: "",
    promptImagen: "",
    promptImagenDe: "",
  };
  return idea.imagen && !guiado ? { ...nueva, ...camposDePromptListo(nueva, idea.imagen) } : nueva;
}
