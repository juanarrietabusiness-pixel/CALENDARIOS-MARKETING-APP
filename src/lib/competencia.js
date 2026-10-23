// ============================================================
// El contenido de la competencia en Instagram (puro)
//
// Lo que se puede ver de otra cuenta de empresa o de creador por
// `business_discovery` (la misma consulta que la auditoría y la foto de la
// competencia): sus últimas publicaciones con el texto, el formato, los
// «me gusta» y los comentarios. Se ordenan por lo que funcionó. Y un enlace
// de Instagram (lo que se comparte desde el teléfono) se resuelve a su
// publicación por su código: la API no deja buscar por enlace, así que se
// busca entre las últimas de la cuenta (por eso hace falta su @).
//
// También lo importa el Worker.
// ============================================================

const RESERVADAS = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct"]);

/**
 * El código de una publicación de Instagram y, si el enlace lo trae, la cuenta: { codigo, usuario } o null.
 * Entiende /p/<código>, /reel/<código>, /reels/<código>, /tv/<código> y /<usuario>/p|reel/<código>. Pura.
 */
export function codigoDeInstagram(enlace) {
  const t = String(enlace ?? "").trim();
  const m = t.match(/https?:\/\/(?:www\.|m\.)?instagram\.com\/([^?#\s]+)/i);
  if (!m) return null;
  const partes = m[1].split("/").filter(Boolean);
  const i = partes.findIndex((p) => ["p", "reel", "reels", "tv"].includes(p.toLowerCase()));
  if (i < 0 || !partes[i + 1] || !/^[\w-]{5,40}$/.test(partes[i + 1])) return null;
  const antes = i > 0 ? partes[i - 1].toLowerCase() : "";
  const usuario = antes && !RESERVADAS.has(antes) && /^[a-z0-9._]{1,30}$/.test(antes) ? antes : "";
  return { codigo: partes[i + 1], usuario };
}

/** El formato de una publicación de Graph: reel, carrusel o imagen. Pura. */
export const formatoDeMedia = (m) => (m?.media_product_type === "REELS" || m?.media_type === "VIDEO" ? "reel" : m?.media_type === "CAROUSEL_ALBUM" ? "carrusel" : "imagen");

const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

/**
 * Las publicaciones de Graph a lo que enseña la pantalla. `miniatura` es la dirección del CDN: la pantalla la pasa por
 * el proxy (`/api/metricas/miniatura`, la CSP no deja pintarla directa). Pura.
 */
export function publicacionesDeGraph(lista = []) {
  return (Array.isArray(lista) ? lista : []).filter((m) => m?.id).map((m) => {
    const formato = formatoDeMedia(m);
    const meGusta = num(m.like_count);
    const comentarios = num(m.comments_count);
    return {
      id: String(m.id),
      formato,
      video: formato === "reel",
      texto: String(m.caption ?? "").slice(0, 2200),
      meGusta, comentarios,
      // Un comentario cuesta más que un «me gusta»: pesa el doble.
      interacciones: meGusta + comentarios * 2,
      fecha: m.timestamp ?? null,
      enlace: String(m.permalink ?? ""),
      miniatura: String((formato === "reel" ? m.thumbnail_url : m.media_url) || m.thumbnail_url || ""),
    };
  });
}

/** Las mejores primero; a igualdad, la más nueva. `tasa`: interacciones por cada 100 seguidores. Pura. */
export function ordenarPorRendimiento(publicaciones = [], seguidores = null) {
  const s = num(seguidores);
  return [...publicaciones]
    .map((p) => ({ ...p, tasa: s > 0 ? Math.round((p.interacciones / s) * 10_000) / 100 : null }))
    .sort((a, b) => b.interacciones - a.interacciones || String(b.fecha ?? "").localeCompare(String(a.fecha ?? "")));
}

/** «hace 3 días», para la tarjeta. Pura. */
export function haceCuanto(fecha, ahora = Date.now()) {
  const t = Date.parse(fecha ?? "");
  if (!Number.isFinite(t)) return "";
  const dias = Math.floor((ahora - t) / 86_400_000);
  if (dias < 1) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "hace un mes" : `hace ${meses} meses`;
}
