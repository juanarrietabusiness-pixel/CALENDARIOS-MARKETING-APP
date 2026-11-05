// ============================================================
// Las tendencias de TikTok por tema, por Scrape Creators
//
// Cada cliente puede tener hasta MAX_PALABRAS palabras o #hashtags de su rubro
// («cuna para bebé», «#babyshower») en `tendencias_palabras` (0068). Una vez
// por semana cada palabra se busca en TikTok —UNA petición: un crédito, dentro
// del tope semanal del espacio, que comparte con los anuncios y las cuentas de
// TikTok— y se guardan los videos que más vistas tienen de lo publicado esa
// semana (`tendencias_videos`): otra fuente de «Lo mejor», ordenada por su
// percentil dentro de la fuente y con «1,2 M de vistas» en la tarjeta.
//
// Lo lee el cron de «Lo mejor» (worker/lib/loMejor.js), una palabra por vuelta,
// lo más viejo primero y sin pasarse del tope. El interruptor del espacio
// (`lo_mejor_ajustes.tiktok_tendencias`, en Ajustes → Integraciones) las apaga
// todas. Lo que lleva más de un mes sin aparecer en su búsqueda se borra.
//
// Nada de esto se ha probado contra Scrape Creators real.
// ============================================================

import { uuid, ahora } from "./ids.js";
import { difundir } from "./vivo.js";
import { buscarTendencia, ajustesSC } from "./scrapeCreators.js";
import { limpiarPalabras } from "../../src/lib/scrapeCreators.js";

/** Cuántos videos se guardan de cada palabra en cada lectura (los de más vistas). */
export const POR_PALABRA = 12;
/** Lo que lleva más que esto sin aparecer en su búsqueda ya no es «del momento». */
const DIAS_GUARDADOS = 35;

const SISTEMA = { userId: "sistema", nombre: "Lo mejor", color: "", tab: null };

/** Las palabras de un cliente y si las tendencias están encendidas en el espacio → { activas, palabras }. */
export async function tendenciasDe(acceso, clienteId) {
  const [filas, ajustes] = await Promise.all([
    acceso.leer("tendencias_palabras", { client_id: clienteId }, "created_at asc").catch(() => []),
    ajustesSC(acceso),
  ]);
  return {
    activas: ajustes ? ajustes.tiktok_tendencias !== 0 : true,
    palabras: filas.map((f) => ({ id: f.id, palabra: f.palabra, leidaAt: f.leida_at ?? null, error: f.error ?? "", videos: f.videos ?? 0 })),
  };
}

/**
 * Cambia las palabras de un cliente (la lista entera). Las que se quedan conservan cuándo se leyeron; las nuevas
 * esperan a la siguiente vuelta del cron con sitio en el tope; las que se quitan se llevan sus videos.
 */
export async function guardarTendencias(env, acceso, cliente, lista) {
  const palabras = limpiarPalabras(lista);
  const previas = await acceso.leer("tendencias_palabras", { client_id: cliente.id });
  const quedan = new Set(palabras);
  const quitar = previas.filter((f) => !quedan.has(f.palabra)).map((f) => f.id);
  if (quitar.length) {
    // Los videos de esas palabras se van con ellas (la cascada lo haría también; así no depende de ella).
    const fuera = new Set(quitar);
    const videos = (await acceso.leerColumnas("tendencias_videos", ["id", "palabra_id"], { client_id: cliente.id })).filter((v) => fuera.has(v.palabra_id));
    if (videos.length) await acceso.borrarVarios("tendencias_videos", videos.map((v) => v.id));
    await acceso.borrarVarios("tendencias_palabras", quitar);
  }
  const ya = new Set(previas.map((f) => f.palabra));
  for (const palabra of palabras.filter((p) => !ya.has(p))) {
    await acceso.insertar("tendencias_palabras", { id: uuid(), client_id: cliente.id, palabra, leida_at: null, error: "", videos: 0, created_at: ahora() });
  }
  difundir(env, acceso.ownerId, { tipo: "inspiracion", clientId: cliente.id });
  return tendenciasDe(acceso, cliente.id);
}

/** Un video de la búsqueda como fila de `tendencias_videos`. Pura. */
export function filaDeTendencia(v, palabra, momento = ahora()) {
  return {
    id: `${palabra.id}:${v.id}`.slice(0, 160), client_id: palabra.client_id, palabra_id: palabra.id, palabra: palabra.palabra,
    externo_id: v.id, usuario: v.usuario, nombre: v.nombre, formato: v.formato, enlace: v.enlace, texto: String(v.texto ?? "").slice(0, 2200),
    miniatura: String(v.miniatura ?? "").slice(0, 1500), video: String(v.video ?? "").slice(0, 1500), publicada_at: v.publicada,
    vistas: v.vistas, me_gusta: v.meGusta, comentarios: v.comentarios, compartidos: v.compartidos, visto_at: momento, updated_at: momento,
  };
}

/**
 * Busca UNA palabra y guarda sus videos con más vistas. `fuente`: «auto» (el cron, dentro del tope) o «manual». Un
 * fallo queda en la palabra con su fecha: no se repite cada minuto. → { videos: n, cache, error }.
 */
export async function leerTendencia(env, acceso, palabraId, { fuente = "auto" } = {}) {
  const palabra = await acceso.leerUno("tendencias_palabras", { id: String(palabraId) });
  if (!palabra) return { videos: 0, cache: false, error: "Esa palabra ya no está." };
  const momento = ahora();
  try {
    const { videos, cache } = await buscarTendencia(env, acceso, palabra.palabra, { fuente });
    const mejores = videos.slice().sort((a, b) => b.vistas - a.vistas).slice(0, POR_PALABRA);
    const filas = mejores.map((v) => filaDeTendencia(v, palabra, momento));
    if (filas.length) await acceso.guardarVarios("tendencias_videos", filas);
    const corte = new Date(Date.now() - DIAS_GUARDADOS * 86_400_000).toJSON();
    const viejos = (await acceso.leerColumnas("tendencias_videos", ["id", "visto_at"], { palabra_id: palabra.id }))
      .filter((v) => String(v.visto_at ?? "") < corte).map((v) => v.id);
    if (viejos.length) await acceso.borrarVarios("tendencias_videos", viejos);
    await acceso.actualizar("tendencias_palabras", { id: palabra.id }, { leida_at: momento, error: "", videos: filas.length });
    difundir(env, acceso.ownerId, { tipo: "lo-mejor", que: "tendencias", n: filas.length, por: SISTEMA });
    return { videos: filas.length, cache, error: "" };
  } catch (e) {
    const error = String(e?.message ?? e).slice(0, 300);
    await acceso.actualizar("tendencias_palabras", { id: palabra.id }, { leida_at: momento, error });
    return { videos: 0, cache: false, error };
  }
}
