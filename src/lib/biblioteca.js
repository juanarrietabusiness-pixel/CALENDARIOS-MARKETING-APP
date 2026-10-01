// ============================================================
// La Biblioteca de anuncios de Meta (Ad Library API, `/ads_archive`)
//
// Puro: sin red ni base. Lo usan la página /biblioteca y el Worker
// (worker/lib/biblioteca.js), así que la consulta que se valida en el
// navegador es LA MISMA que se manda a Meta.
//
// EL LÍMITE QUE NO SE PUEDE ESCONDER
//
// Fuera de la Unión Europea (y el Reino Unido), la API sólo devuelve
// anuncios sobre temas sociales, elecciones o política
// (`ad_type=POLITICAL_AND_ISSUE_ADS`). Los anuncios COMERCIALES sólo
// salen si se entregaron en la UE o el Reino Unido (el último año). Para
// una agencia de Panamá eso quiere decir que la competencia de un
// cliente NO aparece por la API: aparece en la web de la Biblioteca. Por
// eso cada búsqueda lleva su enlace a la web con lo mismo rellenado
// (`urlBibliotecaWeb`), y la pantalla lo dice arriba y no en letra chica.
//
// Nada de esto se ha probado contra el servicio real: los tests hablan con
// un `fetch` de mentira que contesta como la documentación.
// ============================================================

/** Lo que cabe en una respuesta de Meta y lo que se sigue de una misma búsqueda. */
export const LIMITE_POR_DEFECTO = 25;
export const LIMITE_MAX = 50;
export const MAX_PAGINAS = 10;
export const MAX_PAGINAS_FB = 10; // `search_page_ids`: hasta diez páginas por consulta
export const MAX_PAISES = 10;
export const MAX_TEXTO = 100; // `search_terms`: Meta corta en 100 caracteres

/** Donde la API devuelve también anuncios comerciales: la UE (27) y el Reino Unido. */
export const PAISES_UE = Object.freeze([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "GB",
]);

/** Los que se ofrecen en la pantalla. Cualquier otro código ISO de dos letras vale igual. */
export const PAISES = Object.freeze([
  { codigo: "PA", nombre: "Panamá" },
  { codigo: "CR", nombre: "Costa Rica" },
  { codigo: "CO", nombre: "Colombia" },
  { codigo: "MX", nombre: "México" },
  { codigo: "GT", nombre: "Guatemala" },
  { codigo: "SV", nombre: "El Salvador" },
  { codigo: "HN", nombre: "Honduras" },
  { codigo: "NI", nombre: "Nicaragua" },
  { codigo: "DO", nombre: "República Dominicana" },
  { codigo: "PR", nombre: "Puerto Rico" },
  { codigo: "VE", nombre: "Venezuela" },
  { codigo: "EC", nombre: "Ecuador" },
  { codigo: "PE", nombre: "Perú" },
  { codigo: "CL", nombre: "Chile" },
  { codigo: "AR", nombre: "Argentina" },
  { codigo: "US", nombre: "Estados Unidos" },
  { codigo: "ES", nombre: "España (UE)" },
  { codigo: "DE", nombre: "Alemania (UE)" },
  { codigo: "FR", nombre: "Francia (UE)" },
  { codigo: "IT", nombre: "Italia (UE)" },
  { codigo: "PT", nombre: "Portugal (UE)" },
  { codigo: "GB", nombre: "Reino Unido" },
]);

export const ESTADOS = Object.freeze([
  { valor: "ACTIVE", nombre: "Activos" },
  { valor: "INACTIVE", nombre: "Inactivos" },
  { valor: "ALL", nombre: "Todos" },
]);

export const TIPOS = Object.freeze([
  { valor: "ALL", nombre: "Todos (sólo UE y Reino Unido)" },
  { valor: "POLITICAL_AND_ISSUE_ADS", nombre: "Temas sociales, elecciones o política" },
  { valor: "HOUSING_ADS", nombre: "Vivienda" },
  { valor: "EMPLOYMENT_ADS", nombre: "Empleo" },
  { valor: "FINANCIAL_PRODUCTS_AND_SERVICES_ADS", nombre: "Productos y servicios financieros" },
]);

export const PLATAFORMAS = Object.freeze([
  { valor: "FACEBOOK", nombre: "Facebook" },
  { valor: "INSTAGRAM", nombre: "Instagram" },
  { valor: "MESSENGER", nombre: "Messenger" },
  { valor: "AUDIENCE_NETWORK", nombre: "Audience Network" },
  { valor: "WHATSAPP", nombre: "WhatsApp" },
]);

export const IDIOMAS = Object.freeze([
  { valor: "es", nombre: "Español" },
  { valor: "en", nombre: "Inglés" },
  { valor: "pt", nombre: "Portugués" },
  { valor: "fr", nombre: "Francés" },
]);

/** Lo que se le pide a Meta de cada anuncio. `ad_snapshot_url` NO se enseña tal cual: ver `enlaceDelAnuncio`. */
export const CAMPOS = Object.freeze([
  "id", "page_id", "page_name", "ad_creative_bodies", "ad_creative_link_titles", "ad_creative_link_descriptions",
  "ad_creative_link_captions", "ad_delivery_start_time", "ad_delivery_stop_time", "ad_creation_time",
  "publisher_platforms", "languages", "bylines", "ad_snapshot_url",
]);

export const AVISO_COBERTURA =
  "Fuera de la Unión Europea y el Reino Unido, la API de Meta sólo devuelve anuncios sobre temas sociales, elecciones o política. " +
  "Los anuncios comerciales de Panamá o Latinoamérica no salen aquí: ábrelos en la web de la Biblioteca con la misma búsqueda.";

const ESTADO_OK = new Set(ESTADOS.map((e) => e.valor));
const TIPO_OK = new Set(TIPOS.map((t) => t.valor));
const PLATAFORMA_OK = new Set(PLATAFORMAS.map((p) => p.valor));
const UE = new Set(PAISES_UE);

const lista = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,;]+/) : []);
const unicos = (arr) => [...new Set(arr)];
const esFecha = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/**
 * El id de una página de Facebook a partir de lo que alguien pega: el
 * número, o un enlace que lo lleve (`?id=123`, `view_all_page_id=123`,
 * `/profile.php?id=123`). Un enlace con el nombre de usuario de la página
 * no lleva el número y no se puede adivinar: null.
 */
export function idDePagina(texto) {
  const s = String(texto ?? "").trim();
  if (/^\d{5,20}$/.test(s)) return s;
  const m = /(?:[?&](?:id|view_all_page_id)=)(\d{5,20})/.exec(s);
  return m ? m[1] : null;
}

/** "ue" si todos los países son de la UE o el Reino Unido; "politica" si no (ver la cabecera). */
export const coberturaDe = (paises = []) => (paises.length && paises.every((p) => UE.has(p)) ? "ue" : "politica");

/**
 * La consulta tal como la entiende la aplicación, limpia y con topes, más
 * lo que no se pudo usar (`errores`, que impiden buscar) y lo que se
 * cambió para que Meta conteste (`avisos`).
 */
export function normalizarConsulta(entrada = {}) {
  const e = entrada && typeof entrada === "object" ? entrada : {};
  const errores = [];
  const avisos = [];

  const texto = String(e.texto ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXTO);
  const exacta = e.exacta === true;

  const paginasCrudas = unicos(lista(e.paginas).map((p) => String(p).trim()).filter(Boolean));
  const paginas = unicos(paginasCrudas.map(idDePagina).filter(Boolean));
  if (paginas.length < paginasCrudas.length) errores.push("Alguna página no es un id numérico de Facebook (búscalo en la web de la Biblioteca: sale en la dirección como view_all_page_id).");
  if (paginas.length > MAX_PAGINAS_FB) errores.push(`Como mucho ${MAX_PAGINAS_FB} páginas por búsqueda.`);

  let paises = unicos(lista(e.paises).map((p) => String(p).trim().toUpperCase()).filter((p) => /^[A-Z]{2}$/.test(p)));
  if (!paises.length) paises = ["PA"];
  if (paises.length > MAX_PAISES) errores.push(`Como mucho ${MAX_PAISES} países por búsqueda.`);

  const estado = ESTADO_OK.has(e.estado) ? e.estado : "ACTIVE";

  const desde = esFecha(String(e.desde ?? "")) ? e.desde : "";
  const hasta = esFecha(String(e.hasta ?? "")) ? e.hasta : "";
  if (e.desde && !desde) errores.push("La fecha «desde» no es válida.");
  if (e.hasta && !hasta) errores.push("La fecha «hasta» no es válida.");
  if (desde && hasta && desde > hasta) errores.push("La fecha «desde» va después de «hasta».");

  const cobertura = coberturaDe(paises);
  let tipo = TIPO_OK.has(e.tipo) ? e.tipo : cobertura === "ue" ? "ALL" : "POLITICAL_AND_ISSUE_ADS";
  if (tipo === "ALL" && cobertura !== "ue") {
    tipo = "POLITICAL_AND_ISSUE_ADS";
    avisos.push("Con países fuera de la UE la API sólo busca anuncios de temas sociales, elecciones o política: se buscó ese tipo.");
  }

  const plataformas = unicos(lista(e.plataformas).map((p) => String(p).toUpperCase())).filter((p) => PLATAFORMA_OK.has(p));
  const idiomas = unicos(lista(e.idiomas).map((i) => String(i).trim().toLowerCase())).filter((i) => /^[a-z]{2}$/.test(i));

  const n = Math.trunc(Number(e.limite));
  const limite = Number.isFinite(n) && n > 0 ? Math.min(n, LIMITE_MAX) : LIMITE_POR_DEFECTO;

  if (!texto && !paginas.length) errores.push("Escribe palabras clave o al menos una página.");

  return {
    consulta: { texto, exacta, paginas, paises, estado, desde, hasta, tipo, plataformas, idiomas, limite },
    cobertura,
    errores,
    avisos,
  };
}

/**
 * Los parámetros de `GET /ads_archive`. Las listas van como JSON
 * (`["PA"]`), que es como las lee la Graph API. `after` es el cursor de
 * la página siguiente.
 */
export function parametrosAdsArchive(consulta, { after = "" } = {}) {
  const c = consulta;
  const p = {
    ad_reached_countries: JSON.stringify(c.paises),
    ad_active_status: c.estado,
    ad_type: c.tipo,
    fields: CAMPOS.join(","),
    limit: Math.min(Math.max(1, Number(c.limite) || LIMITE_POR_DEFECTO), LIMITE_MAX),
  };
  if (c.texto) {
    p.search_terms = c.texto;
    p.search_type = c.exacta ? "KEYWORD_EXACT_PHRASE" : "KEYWORD_UNORDERED";
  }
  if (c.paginas?.length) p.search_page_ids = JSON.stringify(c.paginas.slice(0, MAX_PAGINAS_FB));
  if (c.desde) p.ad_delivery_date_min = c.desde;
  if (c.hasta) p.ad_delivery_date_max = c.hasta;
  if (c.plataformas?.length) p.publisher_platforms = JSON.stringify(c.plataformas);
  if (c.idiomas?.length) p.languages = JSON.stringify(c.idiomas);
  if (after) p.after = after;
  return p;
}

/** Un cursor de Graph es base64: cualquier otra cosa no se reenvía. */
export const cursorValido = (s) => typeof s === "string" && /^[A-Za-z0-9_=+/-]{1,1000}$/.test(s);

/**
 * La misma búsqueda en la WEB de la Biblioteca, para ver lo comercial que
 * la API no da fuera de la UE. Los parámetros son los que usa la propia
 * web al buscar (no es una API con contrato: si Meta los cambia, el enlace
 * abre la Biblioteca sin rellenar, que sigue sirviendo).
 *
 * La web busca en UN país (o en todos) y por UNA página; con palabras
 * clave, las palabras mandan. `tipo` es «all» a propósito: es justo lo que
 * la API no deja ver.
 */
export function urlBibliotecaWeb(consulta, { tipo = "all" } = {}) {
  const c = consulta ?? {};
  const u = new URL("https://www.facebook.com/ads/library/");
  const q = u.searchParams;
  q.set("active_status", String(c.estado ?? "ACTIVE").toLowerCase());
  q.set("ad_type", tipo);
  q.set("country", c.paises?.length === 1 ? c.paises[0] : "ALL");
  q.set("media_type", "all");
  if (c.texto) {
    q.set("q", c.exacta ? `"${c.texto}"` : c.texto);
    q.set("search_type", c.exacta ? "keyword_exact_phrase" : "keyword_unordered");
  } else if (c.paginas?.length) {
    q.set("view_all_page_id", c.paginas[0]);
    q.set("search_type", "page");
  }
  if (c.desde) q.set("start_date[min]", c.desde);
  if (c.hasta) q.set("start_date[max]", c.hasta);
  (c.plataformas ?? []).forEach((p, i) => q.set(`publisher_platforms[${i}]`, String(p).toLowerCase()));
  (c.idiomas ?? []).forEach((l, i) => q.set(`content_languages[${i}]`, l));
  return u.toString();
}

/**
 * El enlace de un anuncio para abrir en otra pestaña.
 *
 * `ad_snapshot_url` lleva el TOKEN de quien buscó en la dirección
 * (`…/render_ad/?id=…&access_token=…`): enseñarlo, o meterlo en un CSV
 * que se manda por correo, es regalar el acceso a Meta de la agencia. Así
 * que se usa la ficha del anuncio en la Biblioteca (`?id=`), que no lleva
 * nada; y si no hay id, la instantánea SIN el token.
 */
export function enlaceDelAnuncio(ad = {}) {
  if (/^\d+$/.test(String(ad.id ?? ""))) return `https://www.facebook.com/ads/library/?id=${ad.id}`;
  try {
    const u = new URL(String(ad.ad_snapshot_url ?? ""));
    if (u.protocol !== "https:" || !/(^|\.)facebook\.com$/.test(u.hostname)) return null;
    u.searchParams.delete("access_token");
    return u.toString();
  } catch {
    return null;
  }
}

const textos = (v) => (Array.isArray(v) ? v.map((x) => String(x ?? "")).filter(Boolean) : []);

/** Un anuncio de Meta → lo que pinta una tarjeta (y lo que va al CSV). Sin el token. */
export function tarjetaDeAnuncio(ad = {}) {
  const fin = ad.ad_delivery_stop_time ? String(ad.ad_delivery_stop_time).slice(0, 10) : null;
  return {
    id: String(ad.id ?? ""),
    pagina: String(ad.page_name ?? ""),
    paginaId: String(ad.page_id ?? ""),
    textos: textos(ad.ad_creative_bodies),
    titulos: textos(ad.ad_creative_link_titles),
    descripciones: textos(ad.ad_creative_link_descriptions),
    leyendas: textos(ad.ad_creative_link_captions),
    inicio: ad.ad_delivery_start_time ? String(ad.ad_delivery_start_time).slice(0, 10) : null,
    fin,
    plataformas: textos(ad.publisher_platforms).map((p) => p.toLowerCase()),
    idiomas: textos(ad.languages),
    pagadoPor: String(ad.bylines ?? ""),
    enlace: enlaceDelAnuncio(ad),
  };
}

// ------------------------------------------------------------
// CSV
// ------------------------------------------------------------

export const COLUMNAS_CSV = Object.freeze([
  ["ID del anuncio", (a) => a.id],
  ["Página", (a) => a.pagina],
  ["ID de la página", (a) => a.paginaId],
  ["Texto del anuncio", (a) => a.textos.join("\n\n")],
  ["Títulos", (a) => a.titulos.join(" | ")],
  ["Descripciones", (a) => a.descripciones.join(" | ")],
  ["Inicio", (a) => a.inicio ?? ""],
  ["Fin", (a) => a.fin ?? ""],
  ["Plataformas", (a) => a.plataformas.join(", ")],
  ["Idiomas", (a) => a.idiomas.join(", ")],
  ["Pagado por", (a) => a.pagadoPor],
  ["Enlace", (a) => a.enlace ?? ""],
]);

/**
 * Una celda de CSV (RFC 4180): entre comillas si lleva coma, comilla o
 * salto, con las comillas dobladas. Y lo que empieza por = + - @ lleva un
 * apóstrofo delante: el texto de un anuncio es de un tercero, y abierto
 * en una hoja de cálculo sería una fórmula (inyección de CSV).
 */
export function celdaCSV(valor) {
  let s = String(valor ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Las tarjetas → texto CSV. Con BOM para que Excel lo abra en UTF-8 (sin
 * él, «Panamá» sale «PanamÃ¡») y fin de línea CRLF, como pide el formato.
 */
export function anunciosACSV(anuncios = []) {
  const filas = [COLUMNAS_CSV.map(([t]) => celdaCSV(t)).join(",")];
  for (const a of anuncios) filas.push(COLUMNAS_CSV.map(([, f]) => celdaCSV(f(a))).join(","));
  return `﻿${filas.join("\r\n")}\r\n`;
}

/** El nombre del archivo: «biblioteca-zapatos-2026-09-30.csv». */
export function nombreCSV(consulta = {}, hoy = "") {
  const base = String(consulta.texto || (consulta.paginas?.[0] ? `pagina-${consulta.paginas[0]}` : "busqueda"))
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `biblioteca-${base || "busqueda"}${hoy ? `-${hoy}` : ""}.csv`;
}

/** Un filtro guardado de la base → lo que usa la pantalla. */
export function filtroDeFila(f = {}) {
  let consulta = {};
  try { consulta = JSON.parse(f.consulta ?? "{}") ?? {}; } catch { consulta = {}; }
  return {
    id: f.id, nombre: f.nombre ?? "", clientId: f.client_id ?? null,
    consulta: normalizarConsulta(consulta).consulta,
    creado: f.created_at ?? null, actualizado: f.updated_at ?? null,
  };
}
