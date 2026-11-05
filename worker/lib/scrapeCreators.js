// ============================================================
// La Biblioteca de anuncios por Scrape Creators (lo que toca la red, D1 y R2)
//
// Lo puro (la consulta, los parámetros, leer cada anuncio) está en
// src/lib/scrapeCreators.js. Aquí: la llamada con la llave (SÓLO en el Worker,
// `SCRAPECREATORS_API_KEY`), los errores dichos para la persona, un reintento
// si su servidor falla y la CACHÉ: cada pedido gasta un crédito, y la misma
// búsqueda en las próximas horas se contesta desde D1 (`biblioteca_cache`) sin
// pagar. El detalle y la transcripción de un anuncio piden además la caché
// de Scrape Creators (`cache_max_age`), que no cobra.
//
// Traer un anuncio a la galería es bajar su archivo del CDN de Meta, con los
// mismos topes que la competencia orgánica (`bajarALaGaleria`): sólo de
// fbcdn.net / cdninstagram.com y hasta 50 MB. Sus direcciones caducan: lo que
// importa se baja a R2.
//
// TikTok (las cuentas de cada cliente y las tendencias por tema) va por aquí
// también: la agencia usa Scrape Creators SÓLO para anuncios y para TikTok, y
// todo comparte el MISMO tope semanal de créditos del espacio
// (`lo_mejor_ajustes.sc_tope_semana`), que se cuenta con `creditos_sc`.
//
// Nada de esto se ha probado contra el servicio real: los tests hablan con un
// `fetch` de mentira que contesta como su documentación.
// ============================================================

import { sha256, uuid, ahora } from "./ids.js";
import { bajarALaGaleria, yaBajado } from "./competencia.js";
import { semanaDe } from "../../src/lib/loMejor.js";
import { fechaEnZona } from "../../src/lib/agenda.js";
import {
  SC_BASE, consultaSC, pedidoDeAnuncios, anuncioSC, empresaSC, mensajeErrorSC, claveDeCache, esDelCdnDeMeta,
  RUTAS_TIKTOK, HOSTS_TIKTOK, esDeTikTok, pedidoPerfilTikTok, pedidoDeTendencia, pedidoDeVideoTikTok, videosDeRespuesta,
  cuentaTikTok, videoDelDetalle,
} from "../../src/lib/scrapeCreators.js";

export class ErrorSC extends Error {
  constructor(mensaje, status = 502) {
    super(mensaje);
    this.status = status;
  }
}

export const scConfigurado = (env) => Boolean(env?.SCRAPECREATORS_API_KEY);

/** Cuántas horas vale una respuesta guardada. Los anuncios activos cambian poco de un día para otro. */
export const HORAS_CACHE = 12;
/** Una respuesta más grande no se guarda (D1 corta la fila a 2 MB). */
const MAX_CACHE = 1_500_000;

/** El estado que le toca a la pantalla por cada código de la API. */
const estadoPara = (s) => (s === 402 ? 402 : s === 404 ? 404 : s === 400 ? 400 : s === 403 ? 409 : 502);

async function pedirSC(env, ruta, params) {
  if (!scConfigurado(env)) throw new ErrorSC("Falta la llave de Scrape Creators (SCRAPECREATORS_API_KEY en los secretos del Worker).", 503);
  const url = `${SC_BASE}${ruta}?${new URLSearchParams(params)}`;
  let ultimo = 0;
  // Un 5xx se reintenta UNA vez: su documentación lo pide; dos seguidos ya son un fallo.
  for (let intento = 0; intento < 2; intento++) {
    const r = await fetch(url, { headers: { "x-api-key": env.SCRAPECREATORS_API_KEY, accept: "application/json" } });
    if (r.ok) {
      const datos = await r.json().catch(() => null);
      if (!datos || datos.success === false) throw new ErrorSC(mensajeErrorSC(502, datos?.message ?? ""), 502);
      return datos;
    }
    ultimo = r.status;
    if (r.status < 500) {
      const detalle = await r.json().then((j) => String(j?.message ?? j?.error ?? "").slice(0, 200)).catch(() => "");
      throw new ErrorSC(mensajeErrorSC(r.status, detalle), estadoPara(r.status));
    }
  }
  throw new ErrorSC(mensajeErrorSC(ultimo), 502);
}

/**
 * Apunta un crédito gastado (una búsqueda que NO salió de la caché) en la semana: el tope semanal de «Lo mejor» se
 * cuenta con esto, lo buscado a mano (`manual`) y lo que relee el cron (`auto`). No puede tumbar la búsqueda.
 */
async function apuntarCredito(acceso, ruta, fuente) {
  await acceso.insertar("creditos_sc", {
    id: uuid(), semana: semanaDe(), fuente: fuente === "auto" ? "auto" : "manual", creditos: 1, ruta: String(ruta).slice(0, 120),
    created_at: new Date().toISOString(),
  }).catch(() => {});
}

/** Un pedido con la caché del espacio delante. Devuelve los datos y si salieron de la caché (no costaron). */
async function consultar(env, acceso, ruta, params, { horas = HORAS_CACHE, fuente = "manual" } = {}) {
  const id = `${acceso.ownerId}:${(await sha256(claveDeCache(ruta, params))).slice(0, 40)}`;
  const guardada = await acceso.leerUno("biblioteca_cache", { id });
  if (guardada && Date.now() - Date.parse(guardada.created_at) < horas * 3_600_000) {
    try { return { datos: JSON.parse(guardada.respuesta), cache: true }; } catch { /* rota: se vuelve a pedir */ }
  }
  const datos = await pedirSC(env, ruta, params);
  await apuntarCredito(acceso, ruta, fuente);
  const texto = JSON.stringify(datos);
  if (texto.length <= MAX_CACHE) {
    // Guardar la caché no puede tumbar la búsqueda: si falla, la próxima se vuelve a pagar y ya.
    await acceso.guardar("biblioteca_cache", { id, ruta, respuesta: texto, created_at: new Date().toISOString() }).catch(() => {});
  }
  return { datos, cache: false };
}

const creditos = (d) => (Number.isFinite(Number(d?.credits_remaining)) ? Number(d.credits_remaining) : null);

/** Empresas por su nombre: para escoger la buena antes de pedir sus anuncios. */
export async function buscarEmpresas(env, acceso, q) {
  const query = String(q ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!query) throw new ErrorSC("Escribe el nombre de la empresa.", 400);
  const { datos, cache } = await consultar(env, acceso, "/v1/facebook/adLibrary/search/companies", { query }, { horas: 72 });
  const empresas = (datos.searchResults ?? []).map(empresaSC).filter((e) => e.pageId).slice(0, 30);
  return { empresas, creditos: creditos(datos), cache };
}

/** Los anuncios de una empresa o de una palabra clave, una página. `fuente`: «auto» si la pide la relectura semanal. */
export async function buscarAnunciosSC(env, acceso, entrada, cursor = "", { fuente = "manual" } = {}) {
  const { consulta, errores } = consultaSC(entrada);
  if (errores.length) throw new ErrorSC(errores.join(" "), 400);
  const { ruta, params } = pedidoDeAnuncios(consulta, cursor);
  const { datos, cache } = await consultar(env, acceso, ruta, params, { fuente });
  const lista = datos.results ?? datos.searchResults ?? [];
  return {
    consulta,
    anuncios: lista.map(anuncioSC).filter((a) => a.id),
    cursor: typeof datos.cursor === "string" ? datos.cursor : "",
    total: Number.isFinite(Number(datos.searchResultsCount)) ? Number(datos.searchResultsCount) : null,
    creditos: creditos(datos),
    cache,
  };
}

/** Un anuncio entero (todas sus versiones) y, si se pide, la transcripción de su video. */
export async function detalleAnuncio(env, acceso, id, { transcripcion = false } = {}) {
  const limpio = String(id ?? "").replace(/\D/g, "").slice(0, 30);
  if (!limpio) throw new ErrorSC("Falta el anuncio.", 400);
  const { datos, cache } = await consultar(env, acceso, "/v1/facebook/adLibrary/ad", { id: limpio, trim: "true", cache_max_age: "7d" }, { horas: 72 });
  const anuncio = anuncioSC({ ...datos, ad_archive_id: datos.adArchiveID ?? datos.ad_archive_id ?? limpio });
  let texto = null;
  if (transcripcion && anuncio.formato === "video") {
    // Hasta 120 s cuesta un crédito; más largo, NO se pide (cobra por minuto): `allow_long_transcription` va apagado.
    const t = await consultar(env, acceso, "/v1/facebook/adLibrary/ad/transcript", { id: limpio, cache_max_age: "30d" }, { horas: 24 * 30 });
    texto = typeof t.datos.transcript === "string" ? t.datos.transcript.slice(0, 20_000) : null;
  }
  return { anuncio, transcripcion: texto, creditos: creditos(datos), cache };
}

/**
 * El archivo de un anuncio a la galería del cliente (carpeta «Competencia»). La dirección la manda el navegador y
 * NO se cree: sólo del CDN de Meta (lo vuelve a comprobar `bajarALaGaleria`).
 */
export async function traerAnuncio(env, acceso, cliente, { url, tipo, id = "", pagina = "" }) {
  if (!esDelCdnDeMeta(url)) throw new ErrorSC("Ese archivo no es de la Biblioteca de anuncios.", 400);
  const video = tipo === "video";
  const nombre = `anuncio-${String(pagina).replace(/[^\w-]+/g, "-").slice(0, 40) || "competencia"}-${String(id).replace(/\D/g, "").slice(-8) || "x"}.${video ? "mp4" : "jpg"}`;
  return bajarALaGaleria(env, acceso, cliente, url, nombre, video ? "video/mp4" : "image/jpeg");
}

// ------------------------------------------------------------
// El tope semanal de créditos (anuncios y TikTok comparten el mismo)
// ------------------------------------------------------------

/** El tope semanal de créditos de Scrape Creators si el espacio no puso otro. */
export const TOPE_POR_DEFECTO = 10;
/** Cada cuántos días se vuelve a leer por Scrape Creators una cuenta de TikTok, una palabra o los anuncios guardados. */
export const DIAS_SC = 7;

/** La fila de ajustes del espacio (o null si nunca se tocó). */
export const ajustesSC = (acceso) => acceso.leerUno("lo_mejor_ajustes", { id: acceso.ownerId }).catch(() => null);

/** Cambia los ajustes del espacio (crea la fila con los valores de partida si no existía). */
export async function cambiarAjustesSC(acceso, cambios) {
  const momento = ahora();
  const previo = await acceso.leerUno("lo_mejor_ajustes", { id: acceso.ownerId });
  if (previo) await acceso.actualizar("lo_mejor_ajustes", { id: acceso.ownerId }, { ...cambios, updated_at: momento });
  else await acceso.insertar("lo_mejor_ajustes", { id: acceso.ownerId, sc_tope_semana: TOPE_POR_DEFECTO, sc_releido_at: null, tiktok_tendencias: 1, sc_lleno: null, ...cambios, updated_at: momento });
}

/**
 * El tope y lo gastado esta semana (lunes a domingo, Panamá): { semana, tope, manual, auto, total, libres, releidoAt,
 * tendencias, lleno }. `libres`: lo que aún puede gastar lo automático (lo de a mano nunca se bloquea).
 */
export async function creditosDeLaSemana(acceso, hoy = fechaEnZona()) {
  const semana = semanaDe(hoy);
  const [ajustes, manual, auto] = await Promise.all([
    ajustesSC(acceso),
    acceso.sumar("creditos_sc", "creditos", { semana, fuente: "manual" }).catch(() => 0),
    acceso.sumar("creditos_sc", "creditos", { semana, fuente: "auto" }).catch(() => 0),
  ]);
  const tope = Number.isInteger(ajustes?.sc_tope_semana) ? ajustes.sc_tope_semana : TOPE_POR_DEFECTO;
  const total = manual + auto;
  return {
    semana, tope, manual, auto, total, libres: Math.max(0, tope - total), releidoAt: ajustes?.sc_releido_at ?? null,
    tendencias: ajustes ? ajustes.tiktok_tendencias !== 0 : true, lleno: ajustes?.sc_lleno === semana,
  };
}

/** Cambia el tope semanal (0 apaga lo automático) y el interruptor de las tendencias de TikTok. */
export async function guardarAjustesDeCreditos(acceso, { tope, tendencias } = {}) {
  const cambios = {};
  if (tope !== undefined) {
    const n = Math.round(Number(tope));
    if (!Number.isFinite(n) || n < 0 || n > 500) throw new ErrorSC("El tope va de 0 a 500 créditos por semana.", 400);
    // Con otro tope, lo que esperaba a la semana que viene puede caber ya.
    Object.assign(cambios, { sc_tope_semana: n, sc_lleno: null });
  }
  if (tendencias !== undefined) cambios.tiktok_tendencias = tendencias === true ? 1 : 0;
  if (Object.keys(cambios).length) await cambiarAjustesSC(acceso, cambios);
  return creditosDeLaSemana(acceso);
}

/** Apunta que el tope de esta semana se llenó: lo automático no vuelve a mirar el espacio hasta el lunes. */
export const marcarLleno = (acceso, semana = semanaDe()) => cambiarAjustesSC(acceso, { sc_lleno: semana });

// ------------------------------------------------------------
// TikTok: los videos de una cuenta, las tendencias de una palabra y el archivo de un video
// ------------------------------------------------------------

/**
 * Cuántas horas vale una lectura de TikTok guardada: casi una semana. Así «Actualizar» a mano dentro de la semana sale
 * de la caché y no paga otra vez lo que el cron ya leyó.
 */
const HORAS_TIKTOK = 24 * 6;
/** El detalle de un video (la dirección nueva de su archivo) caduca pronto: vale una hora. */
const HORAS_DETALLE = 1;
const CABECERAS_TIKTOK = { "User-Agent": "Mozilla/5.0 (compatible; JuancitoAdsCalendario/1.0)", Referer: "https://www.tiktok.com/" };

export const MENSAJE_SIN_ARCHIVO_TIKTOK = "TikTok no dio el archivo de este video: se trabaja con su miniatura y su texto (recréalo con IA) o guárdalo desde el teléfono y compártelo a la app.";

/** Los últimos videos de una cuenta de TikTok → { cuenta, videos, cache }. Un crédito si no sale de la caché. */
export async function leerCuentaTikTok(env, acceso, usuario, { fuente = "manual" } = {}) {
  const { ruta, params } = pedidoPerfilTikTok(usuario);
  if (!params.handle) throw new ErrorSC("Falta el @ de la cuenta de TikTok.", 400);
  const { datos, cache } = await consultar(env, acceso, ruta, params, { horas: HORAS_TIKTOK, fuente });
  return { cuenta: cuentaTikTok(datos), videos: videosDeRespuesta(datos), cache };
}

/**
 * Los videos que más funcionan esta semana para una palabra o un #hashtag → { videos, cache }. Si la API no entiende
 * la fecha o el orden de la búsqueda por palabra (sus valores no se han probado), se repite UNA vez sin ellos: un 400
 * no cobra.
 */
export async function buscarTendencia(env, acceso, palabra, { fuente = "manual" } = {}) {
  const pedido = pedidoDeTendencia(palabra);
  if (!pedido) throw new ErrorSC("Esa palabra no vale: escribe una palabra o un #hashtag.", 400);
  try {
    const { datos, cache } = await consultar(env, acceso, pedido.ruta, pedido.params, { horas: HORAS_TIKTOK, fuente });
    return { videos: videosDeRespuesta(datos), cache };
  } catch (e) {
    if (!(e instanceof ErrorSC && e.status === 400 && pedido.ruta === RUTAS_TIKTOK.palabra)) throw e;
    const otro = pedidoDeTendencia(palabra, { sinFiltros: true });
    const { datos, cache } = await consultar(env, acceso, otro.ruta, otro.params, { horas: HORAS_TIKTOK, fuente });
    return { videos: videosDeRespuesta(datos), cache };
  }
}

/** El detalle de un video por su enlace (la dirección de su archivo, al día) → { video, cache }. Un crédito, a mano. */
export async function videoTikTokSC(env, acceso, enlace, { fuente = "manual" } = {}) {
  const { ruta, params } = pedidoDeVideoTikTok(enlace);
  const { datos, cache } = await consultar(env, acceso, ruta, params, { horas: HORAS_DETALLE, fuente });
  return { video: videoDelDetalle(datos), cache };
}

/**
 * El archivo de un video de TikTok a la galería del cliente (carpeta «Competencia»), SIN la llave y sólo de los
 * dominios de TikTok, hasta 50 MB. `v`: { id, usuario, video, miniatura, enlace, formato }. Lo ya bajado no se baja
 * (ni se paga) otra vez. Las direcciones de TikTok caducan en horas: si la guardada ya no vale, el detalle del video
 * da una nueva (un crédito, a mano). Con `miniatura` (o un video de fotos), su miniatura. Si TikTok no da el archivo,
 * 409 `codigo: "sin_archivo"`: se trabaja con la miniatura y el texto.
 */
export async function traerTikTok(env, acceso, cliente, v, { miniatura = false } = {}) {
  const usuario = String(v?.usuario ?? "").replace(/[^\w.-]+/g, "").slice(0, 40) || "tiktok";
  const id = String(v?.id ?? "").replace(/\D/g, "").slice(0, 30) || "x";
  const base = `tiktok-${usuario}-${id}`;
  const bajar = (url, nombre, tipo) => bajarALaGaleria(env, acceso, cliente, url, nombre, tipo, { hosts: HOSTS_TIKTOK, red: "TikTok", cabeceras: CABECERAS_TIKTOK });
  if (miniatura || v?.formato === "carrusel") {
    const nombre = `${base}-miniatura.jpg`;
    const previa = await yaBajado(env, acceso, cliente, nombre);
    if (previa) return previa;
    if (!esDeTikTok(v?.miniatura)) throw Object.assign(new ErrorSC("TikTok tampoco da la miniatura de este video.", 409), { codigo: "sin_archivo" });
    return bajar(v.miniatura, nombre, "image/jpeg");
  }
  const nombre = `${base}.mp4`;
  const previa = await yaBajado(env, acceso, cliente, nombre);
  if (previa) return previa;
  let fallo = null;
  if (esDeTikTok(v?.video)) {
    try { return await bajar(v.video, nombre, "video/mp4"); } catch (e) {
      if (e?.estado === 413) throw e;
      fallo = e;
    }
  }
  if (scConfigurado(env) && v?.enlace) {
    try {
      const { video } = await videoTikTokSC(env, acceso, v.enlace);
      if (esDeTikTok(video?.video)) return await bajar(video.video, nombre, "video/mp4");
    } catch (e) {
      if (e?.estado === 413) throw e;
      fallo = e;
    }
  }
  throw Object.assign(new ErrorSC(MENSAJE_SIN_ARCHIVO_TIKTOK, 409), { codigo: "sin_archivo", ...(fallo?.message ? { detalle: String(fallo.message).slice(0, 200) } : {}) });
}
