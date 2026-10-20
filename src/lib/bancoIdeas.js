// ============================================================
// El banco de ideas de la agencia (lo puro; también lo importa el Worker)
//
// UN banco para todos los clientes: cada idea lleva su cliente o ninguno
// (`clientId` vacío = general, sale en el banco de todos). Una REFERENCIA es
// una idea con enlace (`referenceLink`): el video de Instagram o TikTok que
// se encuentra en el teléfono para hacer después una versión propia.
// ============================================================

/** Las vistas del banco de un cliente. */
export const VISTAS_BANCO = Object.freeze([
  { id: "cliente", nombre: "De este cliente" },
  { id: "generales", nombre: "Generales" },
  { id: "todas", nombre: "Todas" },
]);

export const PLATAFORMAS = Object.freeze({
  instagram: { nombre: "Instagram", icono: "photo" },
  tiktok: { nombre: "TikTok", icono: "video" },
  youtube: { nombre: "YouTube", icono: "play" },
  facebook: { nombre: "Facebook", icono: "globe" },
  web: { nombre: "Enlace", icono: "link" },
});

/** Lo que cabe en una idea (el JSON de su fila). D1 corta la fila a 2 MB. */
export const MAX_DATOS = 400_000;
export const MAX_ENLACE = 2000;
const FORMATOS = ["post", "reel", "carrusel", "historia", "live"];

/**
 * El primer enlace http(s) de lo que se pegó. Desde el teléfono se comparte
 * «Mira este video https://vm.tiktok.com/ZMabc/» y lo que vale es el enlace.
 */
export function enlaceLimpio(texto) {
  const m = String(texto ?? "").match(/https?:\/\/[^\s<>"'«»]+/i);
  if (!m) return "";
  const crudo = m[0].replace(/[.,;:!?)\]]+$/, "");
  try {
    const u = new URL(crudo);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return u.toString().slice(0, MAX_ENLACE);
  } catch {
    return "";
  }
}

/** De qué red es un enlace: instagram, tiktok, youtube, facebook o web. Vacío si no es un enlace. */
export function plataformaDe(url) {
  let host;
  try { host = new URL(String(url ?? "")).hostname.toLowerCase(); } catch { return ""; }
  const es = (d) => host === d || host.endsWith(`.${d}`);
  if (es("instagram.com") || es("instagr.am")) return "instagram";
  if (es("tiktok.com")) return "tiktok";
  if (es("youtube.com") || es("youtu.be")) return "youtube";
  if (es("facebook.com") || es("fb.watch") || es("fb.com")) return "facebook";
  return "web";
}

/** El formato que sugiere el enlace: un reel, un short o un TikTok son video corto; una publicación de Instagram, post. */
export function formatoPorEnlace(url) {
  const p = plataformaDe(url);
  const camino = (() => { try { return new URL(url).pathname; } catch { return ""; } })();
  if (p === "instagram") return /^\/(reels?|tv)\//.test(camino) ? "reel" : /^\/stories\//.test(camino) ? "historia" : "post";
  if (p === "tiktok" || p === "youtube") return "reel";
  if (p === "facebook") return /\/(reel|videos?|watch)/.test(camino) ? "reel" : "post";
  return "post";
}

/** ¿Es una referencia? (lleva enlace). */
export const esReferencia = (idea) => Boolean(String(idea?.referenceLink ?? "").trim());

/** Lo que se enseña como título de una idea. */
export function tituloDeIdea(idea) {
  const t = String(idea?.idea || idea?.title || idea?.enlaceTitulo || idea?.descripcion || "").trim();
  if (t) return t.length > 90 ? `${t.slice(0, 89)}…` : t;
  if (esReferencia(idea)) return `Referencia de ${PLATAFORMAS[plataformaDe(idea.referenceLink)]?.nombre ?? "un enlace"}`;
  return "Idea sin título";
}

/** Una idea nueva con la forma de siempre (la que lleva al calendario `deIdeaAPublicacion`). */
export function nuevaIdea({ id, idea = "", format, referenceLink = "", descripcion = "", guion = "" } = {}, cuando = new Date().toISOString()) {
  const enlace = enlaceLimpio(referenceLink);
  return {
    id,
    format: FORMATOS.includes(format) ? format : enlace ? formatoPorEnlace(enlace) : "post",
    idea: String(idea).trim(),
    guion: String(guion),
    descripcion: String(descripcion),
    hashtagsFinales: "",
    script: "",
    status: "pending",
    image: null,
    referenceLink: enlace,
    comment: "",
    publishTime: "",
    _addedAt: cuando,
  };
}

/**
 * Lo que el servidor guarda de una idea que manda el navegador: un objeto, sin `id` propio distinto (manda la fila),
 * con el enlace limpio y el formato válido. El resto viaja tal cual: una idea que vino del calendario lleva campos de
 * publicación que tienen que volver a él.
 */
export function limpiarIdea(datos, id) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) return null;
  const limpia = { ...datos, id };
  delete limpia.clientId;
  if ("referenceLink" in limpia) limpia.referenceLink = enlaceLimpio(limpia.referenceLink);
  if (!FORMATOS.includes(limpia.format)) limpia.format = limpia.referenceLink ? formatoPorEnlace(limpia.referenceLink) : "post";
  for (const k of ["idea", "descripcion", "guion", "enlaceTitulo", "enlaceAutor"]) {
    if (k in limpia) limpia[k] = String(limpia[k] ?? "").slice(0, 20_000);
  }
  return limpia;
}

/**
 * Lo que se ve en el banco. La lista que llega del servidor ya es la del cliente (sus ideas y las generales) o la de
 * todos; aquí se filtra por la vista y por «sólo referencias». Las más nuevas, arriba.
 */
export function filtrarBanco(lista, { clienteId = null, vista = "cliente", soloReferencias = false } = {}) {
  return (lista ?? [])
    .filter((i) => {
      if (soloReferencias && !esReferencia(i)) return false;
      if (vista === "generales") return !i.clientId;
      if (vista === "cliente") return clienteId ? i.clientId === clienteId || !i.clientId : true;
      return true;
    })
    .sort((a, b) => String(b._addedAt ?? b.created_at ?? "").localeCompare(String(a._addedAt ?? a.created_at ?? "")));
}

/** De la fila de D1 (`banco_ideas`) a la idea que ve la pantalla: sus datos, su id y su cliente. */
export function ideaDeFila(f) {
  let datos = {};
  try { datos = JSON.parse(f?.datos || "{}"); } catch { /* fila rota: la idea vacía */ }
  return { ...datos, id: f.id, clientId: f.client_id ?? null, creadaPor: f.creada_por ?? null, created_at: f.created_at };
}

/** Para el asistente y Claude: una idea en una línea. */
export function lineaDeIdea(idea, nombreCliente = "") {
  const enlace = esReferencia(idea) ? ` · ${PLATAFORMAS[plataformaDe(idea.referenceLink)]?.nombre ?? "Enlace"}: ${idea.referenceLink}` : "";
  const donde = nombreCliente ? ` (${nombreCliente})` : " (general)";
  const desc = idea.descripcion ? ` — ${String(idea.descripcion).slice(0, 200)}` : "";
  return `· [${idea.format ?? "post"}]${donde} ${tituloDeIdea(idea)}${desc}${enlace}`;
}
