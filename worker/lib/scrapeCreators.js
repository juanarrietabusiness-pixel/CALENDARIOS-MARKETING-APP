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
// Nada de esto se ha probado contra el servicio real: los tests hablan con un
// `fetch` de mentira que contesta como su documentación.
// ============================================================

import { sha256 } from "./ids.js";
import { bajarALaGaleria } from "./competencia.js";
import {
  SC_BASE, consultaSC, pedidoDeAnuncios, anuncioSC, empresaSC, mensajeErrorSC, claveDeCache, esDelCdnDeMeta,
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

/** Un pedido con la caché del espacio delante. Devuelve los datos y si salieron de la caché (no costaron). */
async function consultar(env, acceso, ruta, params, { horas = HORAS_CACHE } = {}) {
  const id = `${acceso.ownerId}:${(await sha256(claveDeCache(ruta, params))).slice(0, 40)}`;
  const guardada = await acceso.leerUno("biblioteca_cache", { id });
  if (guardada && Date.now() - Date.parse(guardada.created_at) < horas * 3_600_000) {
    try { return { datos: JSON.parse(guardada.respuesta), cache: true }; } catch { /* rota: se vuelve a pedir */ }
  }
  const datos = await pedirSC(env, ruta, params);
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

/** Los anuncios de una empresa o de una palabra clave, una página. */
export async function buscarAnunciosSC(env, acceso, entrada, cursor = "") {
  const { consulta, errores } = consultaSC(entrada);
  if (errores.length) throw new ErrorSC(errores.join(" "), 400);
  const { ruta, params } = pedidoDeAnuncios(consulta, cursor);
  const { datos, cache } = await consultar(env, acceso, ruta, params);
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
