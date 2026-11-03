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
