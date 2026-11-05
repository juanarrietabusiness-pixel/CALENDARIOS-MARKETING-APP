// ============================================================
// La Biblioteca de anuncios por Scrape Creators (puro; también lo importa el Worker)
//
// La API oficial de Meta (/ads_archive) fuera de la UE sólo da anuncios de
// política: la competencia comercial de Panamá salía VACÍA. Scrape Creators
// lee la Biblioteca pública entera (todo anuncio, todo país) y cobra por
// crédito (uno por pedido). Aquí: qué se le puede pedir (la consulta, limpia),
// cómo se le pide (ruta y parámetros de cada endpoint) y cómo se lee lo que
// contesta (cada anuncio como una tarjeta; nada más del JSON pasa a la
// pantalla). La llave vive SÓLO en el Worker (`SCRAPECREATORS_API_KEY`).
//
// Documentación: docs.scrapecreators.com (Facebook Ad Library). Nada de esto se
// ha probado contra el servicio real: la forma sale de su documentación.
// ============================================================

export const SC_BASE = "https://api.scrapecreators.com";

export const MODOS_SC = Object.freeze([
  { id: "empresa", nombre: "Una empresa" },
  { id: "palabra", nombre: "Por palabra clave" },
]);
export const ESTADOS_SC = Object.freeze([
  { id: "ACTIVE", nombre: "Activos" },
  { id: "INACTIVE", nombre: "Ya no corren" },
  { id: "ALL", nombre: "Todos" },
]);
export const MEDIOS_SC = Object.freeze([
  { id: "ALL", nombre: "Todo" },
  { id: "VIDEO", nombre: "Video" },
  { id: "IMAGE", nombre: "Imagen" },
  { id: "MEME", nombre: "Imagen con texto" },
]);
export const ORDENES_SC = Object.freeze([
  { id: "total_impressions", nombre: "Los más vistos" },
  { id: "relevancy_monthly_grouped", nombre: "Los más recientes" },
]);

const idDe = (lista, v, porDefecto) => (lista.some((x) => x.id === v) ? v : porDefecto);
const texto = (v, max = 100) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "");

/**
 * Lo que se le puede pedir, limpio. Una empresa va por su `pageId` (lo da la búsqueda de empresas) o por su nombre;
 * por palabra, un texto. País de dos letras o «ALL» (por palabra, uno solo, como dice la API).
 * @returns {{ consulta, errores: string[] }}
 */
export function consultaSC(entrada = {}) {
  const modo = idDe(MODOS_SC, entrada.modo, "empresa");
  const pais = /^[A-Za-z]{2}$/.test(String(entrada.pais ?? "")) ? String(entrada.pais).toUpperCase() : "ALL";
  const idioma = /^[A-Za-z]{2}$/.test(String(entrada.idioma ?? "")) ? String(entrada.idioma).toUpperCase() : "";
  const consulta = {
    fuente: "sc",
    modo,
    pageId: /^\d{3,30}$/.test(String(entrada.pageId ?? "")) ? String(entrada.pageId) : "",
    empresa: texto(entrada.empresa),
    q: texto(entrada.q),
    exacta: entrada.exacta === true,
    pais,
    idioma,
    estado: idDe(ESTADOS_SC, entrada.estado, "ACTIVE"),
    medio: idDe(MEDIOS_SC, entrada.medio, "ALL"),
    orden: idDe(ORDENES_SC, entrada.orden, "total_impressions"),
    desde: fecha(entrada.desde),
    hasta: fecha(entrada.hasta),
  };
  const errores = [];
  if (modo === "empresa" && !consulta.pageId && !consulta.empresa) errores.push("Escoge una empresa (búscala por su nombre).");
  if (modo === "palabra" && !consulta.q) errores.push("Escribe la palabra clave.");
  if (consulta.desde && consulta.hasta && consulta.desde > consulta.hasta) errores.push("La fecha de inicio va después de la de fin.");
  return { consulta, errores };
}

/** El cursor de la página siguiente: lo da la API y se le devuelve tal cual (con tope, que no viaje cualquier cosa). */
export const cursorSC = (c) => (typeof c === "string" && c.length > 0 && c.length <= 4000 && !/[\s<>"']/.test(c) ? c : "");

/** La ruta y los parámetros de una búsqueda de anuncios. Siempre `trim`: la respuesta reducida basta para la tarjeta. */
export function pedidoDeAnuncios(consulta, cursor = "") {
  const p = { country: consulta.pais, status: consulta.estado, media_type: consulta.medio, sort_by: consulta.orden, trim: "true" };
  if (consulta.idioma) p.language = consulta.idioma;
  if (consulta.desde) p.start_date = consulta.desde;
  if (consulta.hasta) p.end_date = consulta.hasta;
  if (cursorSC(cursor)) p.cursor = cursor;
  if (consulta.modo === "palabra") {
    return {
      ruta: "/v1/facebook/adLibrary/search/ads",
      params: { query: consulta.q, search_type: consulta.exacta ? "keyword_exact_phrase" : "keyword_unordered", ad_type: "all", ...p },
    };
  }
  return {
    ruta: "/v1/facebook/adLibrary/company/ads",
    params: consulta.pageId ? { pageId: consulta.pageId, ...p } : { companyName: consulta.empresa, ...p },
  };
}

/** Una dirección https (la de un archivo del CDN, la del destino del anuncio) o vacío. */
function https(v) {
  try {
    const u = new URL(String(v ?? ""));
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

/** ¿Es del CDN de Meta? Sólo eso se puede pasar por el proxy de miniaturas y bajar a la galería. */
export function esDelCdnDeMeta(v) {
  try {
    return /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(new URL(String(v)).hostname);
  } catch {
    return false;
  }
}

// La fecha de la Biblioteca es el DÍA en UTC (así la enseña Facebook): se compone con las partes UTC, a propósito.
const dos = (n) => String(n).padStart(2, "0");
const unix = (s) => {
  if (!(Number.isFinite(Number(s)) && Number(s) > 0)) return "";
  const d = new Date(Number(s) * 1000);
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`;
};

/** Un medio del creativo: la imagen (o la portada de un video) y el video, si lo hay. */
function medios(obj = {}) {
  const imagenes = (obj.images ?? []).map((i) => https(i?.original_image_url || i?.resized_image_url)).filter(Boolean);
  const videos = (obj.videos ?? []).map((v) => ({
    video: https(v?.video_hd_url || v?.video_sd_url),
    portada: https(v?.video_preview_image_url),
  })).filter((v) => v.video || v.portada);
  // Una tarjeta del carrusel trae su archivo suelto.
  if (obj.original_image_url || obj.resized_image_url) imagenes.push(https(obj.original_image_url || obj.resized_image_url));
  if (obj.video_hd_url || obj.video_sd_url) {
    videos.push({ video: https(obj.video_hd_url || obj.video_sd_url), portada: https(obj.video_preview_image_url) });
  }
  return { imagenes: imagenes.filter(Boolean), videos };
}

const cuerpo = (b) => texto(typeof b === "string" ? b : b?.text, 2000);

/**
 * Un anuncio de la respuesta, como una tarjeta: lo que se ve y lo que hace falta para traerlo. Si tiene varias
 * versiones, el creativo está en `snapshot.cards` (lo dice la documentación): cada una es una «versión».
 */
export function anuncioSC(r = {}) {
  const s = r.snapshot ?? {};
  const base = medios(s);
  const versiones = (s.cards ?? []).slice(0, 10).map((c) => ({
    texto: cuerpo(c?.body), titulo: texto(c?.title, 200), cta: texto(c?.cta_text, 60), enlace: https(c?.link_url), ...medios(c),
  }));
  const primera = versiones[0] ?? {};
  const imagenes = base.imagenes.length ? base.imagenes : (primera.imagenes ?? []);
  const videos = base.videos.length ? base.videos : (primera.videos ?? []);
  const id = String(r.ad_archive_id ?? r.adArchiveID ?? "").replace(/\D/g, "").slice(0, 30);
  const formato = String(s.display_format ?? "").toUpperCase();
  return {
    id,
    pagina: texto(r.page_name ?? s.page_name ?? r.pageName, 120),
    pageId: String(r.page_id ?? r.pageID ?? "").replace(/\D/g, "").slice(0, 30),
    foto: https(s.page_profile_picture_url),
    activo: r.is_active === true || r.isActive === true,
    inicio: unix(r.start_date ?? r.startDate),
    fin: unix(r.end_date ?? r.endDate),
    plataformas: (r.publisher_platform ?? r.publisherPlatform ?? []).map((p) => String(p).toLowerCase()).slice(0, 6),
    texto: cuerpo(s.body) || primera.texto || "",
    titulo: texto(s.title, 200) || primera.titulo || "",
    cta: texto(s.cta_text, 60) || primera.cta || "",
    destino: https(s.link_url) || primera.enlace || "",
    formato: formato === "VIDEO" || videos.length ? "video" : versiones.length > 1 || formato === "CAROUSEL" ? "carrusel" : "imagen",
    imagenes: imagenes.slice(0, 10),
    videos: videos.slice(0, 4),
    versiones: versiones.length > 1 ? versiones : [],
    relacionados: Number(r.collation_count) > 1 ? Number(r.collation_count) : 0,
    enlace: id ? `https://www.facebook.com/ads/library/?id=${id}` : "",
  };
}

/** Una empresa de la búsqueda: lo que hace falta para escoger la buena. */
export function empresaSC(e = {}) {
  return {
    pageId: String(e.page_id ?? "").replace(/\D/g, "").slice(0, 30),
    nombre: texto(e.name, 120),
    categoria: texto(e.category, 80),
    seguidores: Number.isFinite(Number(e.likes)) ? Number(e.likes) : null,
    verificada: Boolean(e.verification && e.verification !== "NOT_VERIFIED"),
    foto: https(e.image_uri),
    pais: texto(e.country, 40),
    instagram: texto(e.ig_username, 60),
  };
}

/** Lo que se le dice a la persona por cada código de la API. */
export function mensajeErrorSC(status, detalle = "") {
  if (status === 401) return "La llave de Scrape Creators no vale: revisa SCRAPECREATORS_API_KEY en los secretos del Worker.";
  if (status === 402) return "Se acabaron los créditos de Scrape Creators: recarga la cuenta en app.scrapecreators.com.";
  if (status === 403) return "Facebook bloqueó esa consulta: prueba otra vez en un rato o con otros filtros.";
  if (status === 404) return "No se encontró: la empresa no tiene anuncios con esos filtros o el anuncio ya no existe.";
  if (status === 400) return `Scrape Creators no entendió la búsqueda${detalle ? `: ${detalle}` : ""}.`;
  return "Scrape Creators no respondió bien: vuelve a intentar en un momento.";
}

/** La clave de la caché de una consulta (la ruta y los parámetros, ordenados): la misma búsqueda no se paga dos veces. */
export function claveDeCache(ruta, params = {}) {
  const orden = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return `${ruta}?${orden}`;
}

// ------------------------------------------------------------
// TikTok por Scrape Creators (las cuentas de cada cliente y las tendencias)
// ------------------------------------------------------------
//
// La agencia lo usa SÓLO para anuncios y para TikTok (Instagram sigue por la
// API de Meta, gratis): TikTok no deja ver lo de otras cuentas por su API. Cada
// petición es un crédito y entra en el MISMO tope semanal que los anuncios.
//
// Las rutas salen de la documentación pública de Scrape Creators (sus
// tutoriales: /v3/tiktok/profile/videos con `handle`, /v1/tiktok/search/keyword
// con `query`, /v1/tiktok/search/hashtag con `hashtag` y /v2/tiktok/video con
// `url`). La respuesta es la de la app de TikTok («aweme»), y se lee con
// TOLERANCIA: `aweme_list` o `search_item_list[].aweme_info`, `statistics` o
// `stats`, `url_list` o la dirección suelta. Nada de esto se ha probado contra
// el servicio real.

export const RUTAS_TIKTOK = Object.freeze({
  perfil: "/v3/tiktok/profile/videos",
  palabra: "/v1/tiktok/search/keyword",
  hashtag: "/v1/tiktok/search/hashtag",
  video: "/v2/tiktok/video",
});

/** Las palabras de tendencia que puede tener un cliente. */
export const MAX_PALABRAS = 5;

/** El pedido de los últimos videos de una cuenta de TikTok (sin @). Pura. */
export function pedidoPerfilTikTok(usuario) {
  return { ruta: RUTAS_TIKTOK.perfil, params: { handle: String(usuario ?? "").replace(/^@+/, ""), sort_by: "latest", trim: "true" } };
}

/**
 * Una palabra de tendencia limpia: «#BabyShower» → { tipo: "hashtag", valor: "babyshower", texto: "#babyshower" }; «cuna
 * para bebé» → { tipo: "palabra", valor: "cuna para bebé", texto: "cuna para bebé" }. null si no vale. Pura.
 */
export function palabraDeTendencia(entrada) {
  const t = String(entrada ?? "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60);
  if (!t) return null;
  if (t.startsWith("#")) {
    const valor = t.replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 40);
    return valor.length >= 2 ? { tipo: "hashtag", valor, texto: `#${valor}` } : null;
  }
  const valor = t.replace(/[<>"'`{}[\]\\]/g, "").trim().slice(0, 50);
  return valor.length >= 2 ? { tipo: "palabra", valor, texto: valor } : null;
}

/** Las palabras de un cliente, limpias, sin repetir y con tope (una lista o un texto separado por comas). Pura. */
export function limpiarPalabras(lista) {
  const vistas = new Set();
  const salida = [];
  for (const x of Array.isArray(lista) ? lista : String(lista ?? "").split(/[,\n]/)) {
    const p = palabraDeTendencia(x);
    if (!p || vistas.has(p.texto)) continue;
    vistas.add(p.texto);
    salida.push(p.texto);
    if (salida.length >= MAX_PALABRAS) break;
  }
  return salida;
}

/**
 * El pedido de las tendencias de una palabra: un #hashtag por su búsqueda de hashtag; lo demás, por palabra clave con
 * lo publicado esta semana. `sinFiltros`: el mismo pedido sin la fecha ni el orden (si la API no los entiende). Pura.
 */
export function pedidoDeTendencia(palabra, { sinFiltros = false } = {}) {
  const p = palabraDeTendencia(palabra);
  if (!p) return null;
  if (p.tipo === "hashtag") return { ruta: RUTAS_TIKTOK.hashtag, params: { hashtag: p.valor, trim: "true" } };
  return {
    ruta: RUTAS_TIKTOK.palabra,
    params: sinFiltros ? { query: p.valor, trim: "true" } : { query: p.valor, date_posted: "this-week", sort_by: "relevance", trim: "true" },
  };
}

/** El pedido del detalle de un video (de ahí sale una dirección nueva de su archivo). Pura. */
export const pedidoDeVideoTikTok = (enlace) => ({ ruta: RUTAS_TIKTOK.video, params: { url: String(enlace ?? "").slice(0, 300) } });

export const HOSTS_TIKTOK = /(^|\.)(tiktokcdn\.com|tiktokcdn-us\.com|tiktokcdn-eu\.com|tiktokv\.com|tiktokv\.us|tiktokv\.eu|tiktok\.com|ibyteimg\.com|muscdn\.com)$/;

/** ¿Una dirección https de TikTok (su CDN)? Sólo eso se baja a la galería (sin la llave). Pura. */
export function esDeTikTok(v) {
  try {
    const u = new URL(String(v ?? ""));
    return u.protocol === "https:" && HOSTS_TIKTOK.test(u.hostname);
  } catch {
    return false;
  }
}

const numeroDe = (...v) => {
  for (const x of v) {
    const n = Number(x);
    if (x !== undefined && x !== null && x !== "" && Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return 0;
};

/** La primera dirección https de un campo de TikTok: una cadena, `{ url_list: [] }`, `{ url }` o una lista. Pura. */
export function direccionDe(v) {
  if (!v) return "";
  if (typeof v === "string") return https(v);
  if (Array.isArray(v)) {
    for (const x of v) { const d = direccionDe(x); if (d) return d; }
    return "";
  }
  if (typeof v === "object") return direccionDe(v.url_list ?? v.urlList ?? v.url ?? "");
  return "";
}

const segundosDe = (d) => {
  const n = Number(d);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // La app de TikTok da milisegundos; la web, segundos.
  return Math.round(n > 600 ? n / 1000 : n);
};

const fechaUnix = (s) => {
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n > 1e12 ? n : n * 1000).toJSON();
};

/**
 * Un video de TikTok de la respuesta, en la forma de la aplicación. `null` si no tiene id. El archivo prefiere la
 * dirección SIN marca de agua (`download_no_watermark_addr`), luego la de reproducir y la de descarga. Un video de
 * fotos (el carrusel de TikTok) sale como «carrusel» con la primera foto de miniatura y sin archivo. Pura.
 */
export function videoTikTok(crudo = {}) {
  const a = crudo?.aweme_info ?? crudo?.aweme_detail ?? crudo?.itemStruct ?? crudo ?? {};
  const id = String(a.aweme_id ?? a.awemeId ?? a.id ?? a.video_id ?? "").replace(/\D/g, "").slice(0, 30);
  if (!id) return null;
  const autor = a.author ?? a.authorInfo ?? {};
  const usuario = String(autor.unique_id ?? autor.uniqueId ?? autor.username ?? a.author_unique_id ?? "").replace(/^@+/, "").toLowerCase().slice(0, 40);
  const st = a.statistics ?? a.stats ?? a.statsV2 ?? {};
  const v = a.video ?? {};
  const fotos = (a.image_post_info?.images ?? a.imagePost?.images ?? []).map((i) => direccionDe(i?.display_image ?? i?.imageURL ?? i?.thumbnail ?? i)).filter(Boolean);
  const miniatura = direccionDe(v.cover) || direccionDe(v.origin_cover ?? v.originCover) || direccionDe(v.dynamic_cover ?? v.dynamicCover) || fotos[0] || "";
  const archivo = direccionDe(v.download_no_watermark_addr)
    || direccionDe(v.play_addr ?? v.playAddr) || direccionDe(v.download_addr ?? v.downloadAddr) || direccionDe(v.bit_rate?.[0]?.play_addr);
  // El enlace canónico (sin los parámetros de compartir): con él, la misma pieza es la misma clave venga de donde venga.
  const enlace = usuario ? `https://www.tiktok.com/@${usuario}/video/${id}` : https(a.share_url ?? a.shareUrl).replace(/[?#].*$/, "");
  return {
    id,
    usuario,
    nombre: texto(autor.nickname ?? autor.nickName, 80),
    texto: texto(a.desc ?? a.description ?? a.title, 2200),
    publicada: fechaUnix(a.create_time ?? a.createTime),
    vistas: numeroDe(st.play_count, st.playCount, a.play_count),
    meGusta: numeroDe(st.digg_count, st.diggCount, a.digg_count),
    comentarios: numeroDe(st.comment_count, st.commentCount, a.comment_count),
    compartidos: numeroDe(st.share_count, st.shareCount, a.share_count),
    guardados: numeroDe(st.collect_count, st.collectCount, a.collect_count),
    duracion: segundosDe(v.duration ?? a.duration),
    formato: fotos.length ? "carrusel" : "video",
    miniatura,
    video: fotos.length || !esDeTikTok(archivo) ? "" : archivo,
    enlace,
  };
}

/** La lista de videos de una respuesta de TikTok (perfil, palabra, hashtag), sin repetir. Pura. */
export function videosDeRespuesta(datos = {}) {
  const lista = datos?.aweme_list ?? datos?.search_item_list ?? datos?.videos ?? datos?.items ?? datos?.itemList ?? datos?.data ?? [];
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : []).map(videoTikTok).filter((v) => v && !vistos.has(v.id) && vistos.add(v.id));
}

/** La cuenta según la respuesta de su perfil (`author`/`user` sueltos o el autor del primer video). Pura. */
export function cuentaTikTok(datos = {}) {
  const lista = datos?.aweme_list ?? datos?.videos ?? [];
  const autor = datos?.author ?? datos?.user ?? (Array.isArray(lista) ? lista[0]?.author : null) ?? {};
  const st = datos?.stats ?? autor.stats ?? {};
  return {
    nombre: texto(autor.nickname ?? autor.nickName, 120),
    foto: direccionDe(autor.avatar_thumb ?? autor.avatarThumb ?? autor.avatar_medium ?? autor.avatarMedium),
    seguidores: numeroDe(autor.follower_count, autor.followerCount, st.followerCount, st.follower_count) || null,
    publicaciones: numeroDe(autor.aweme_count, autor.videoCount, st.videoCount) || null,
  };
}

/** El video del detalle (`/v2/tiktok/video`): lo mismo que en una lista, con la dirección de su archivo al día. Pura. */
export const videoDelDetalle = (datos = {}) => videoTikTok(datos?.aweme_detail ?? datos?.aweme ?? datos?.itemInfo?.itemStruct ?? datos);

/**
 * Una cifra grande, corta y en español: 1.234.567 → «1,2 M», 45.300 → «45 mil», 4.500 → «4,5 mil», 850 → «850». Pura.
 */
export function cifraCorta(n) {
  const v = Math.max(0, Number(n) || 0);
  const decimal = (x) => (x < 10 ? String(Math.round(x * 10) / 10).replace(".", ",") : String(Math.round(x)));
  if (v >= 1e6) return `${decimal(v / 1e6)} M`;
  if (v >= 1e3) return `${decimal(v / 1e3)} mil`;
  return String(Math.round(v));
}
