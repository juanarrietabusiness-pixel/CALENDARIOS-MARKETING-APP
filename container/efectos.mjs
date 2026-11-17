// ============================================================
// Los EFECTOS DE SONIDO dentro del Container: leer los del CATÁLOGO (vienen en la imagen, public/efectos/v1) y los de la
// BIBLIOTECA (sus bytes llegan en el pedido), decidir cuándo suena cada uno (src/lib/efectosColocados.js) y armar el
// audio por PISTAS (src/lib/efectosSonido.js). Lo usan el render (container/render.mjs) y la escucha (container/escuchar.mjs):
// el MISMO audio, así lo que se escucha es lo que se renderiza.
//
// Los del catálogo se decodifican una vez y quedan en memoria mientras el Container vive (son 4 MB de MP3 en total y un
// video usa unos pocos). Si uno no se puede leer, el whoosh y el pop automáticos se sintetizan: nunca se queda sin ellos.
// ============================================================

import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { efectoDelCatalogo, CARPETA_EFECTOS } from "../src/lib/catalogoEfectos.js";
import { muestrasDeEfecto, picoDeEfecto, sintetizar, armarSonido, MAX_EFECTO_CATALOGO, MAX_EFECTO_PROPIO } from "../src/lib/efectosSonido.js";
import { momentosColocados, colocadosAutomaticos, bajadasDeMusica, limpiarColocados, EFECTO_AUTOMATICO } from "../src/lib/efectosColocados.js";
import { RENDER, armarPcm, tramosDeAudio } from "../src/lib/renderVideo.js";
import { mezclarClip } from "../src/lib/sonidoVideo.js";
import { audioDe } from "./clips.mjs";

/** La raíz de la aplicación en la imagen (/app) o en el repositorio: el catálogo está en <raíz>/public/efectos/v1. */
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
/** Lo ya decodificado del catálogo (id → Float32Array). */
const cache = new Map();
/** El sintetizado que sustituye a cada automático si su archivo no se pudiera leer. */
const SINTETIZADO = Object.freeze({ [EFECTO_AUTOMATICO.transicion]: "whoosh", [EFECTO_AUTOMATICO.sello]: "pop" });

/** Las muestras de un efecto del catálogo (o null). `decodificar(bytes, nombre)` → PCM s16le estéreo al muestreo del render. */
export async function muestrasDelCatalogo(id, decodificar) {
  if (cache.has(id)) return cache.get(id);
  const e = efectoDelCatalogo(id);
  if (!e) return null;
  try {
    const bytes = await readFile(join(RAIZ, CARPETA_EFECTOS, e.archivo));
    const s = muestrasDeEfecto(await decodificar(bytes, `catalogo-${id}`), RENDER.muestreo, { max: MAX_EFECTO_CATALOGO });
    if (!s.length) throw new Error("no suena nada");
    cache.set(id, s);
    return s;
  } catch (err) {
    console.error(`efectos: no se pudo leer ${id} del catálogo:`, err?.message ?? err);
    return SINTETIZADO[id] ? sintetizar(SINTETIZADO[id], RENDER.muestreo) : null;
  }
}

/**
 * Qué suena y cuándo: la lista colocada (o la automática), con las muestras de cada efecto ya leídas.
 * `libreria` ({ archivoId: bytes }) trae los de la biblioteca; `propios` ({ transicion?, sello? }: { archivoId, nombre })
 * los que sustituyen a los automáticos. → { lista, automaticos, momentos, muestras, sinSitio, movidos, bajadas, avisos }.
 */
export async function prepararEfectos({ guion, linea, efectos = true, colocados = [], propios = {}, libreria = {}, decodificar }) {
  const vacio = { lista: [], automaticos: false, momentos: [], muestras: new Map(), sinSitio: [], movidos: [], bajadas: [], avisos: [] };
  if (!efectos || !guion) return vacio;
  const propia = limpiarColocados(colocados);
  const automaticos = !propia.length;
  const lista = automaticos ? colocadosAutomaticos(guion, linea, propios) : propia;
  const muestras = new Map();
  const picos = new Map();
  const avisos = [];
  for (const c of lista) {
    if (c.propio) {
      const clave = `propio:${c.propio.archivoId}`;
      if (muestras.has(clave)) continue;
      const bytes = libreria?.[c.propio.archivoId];
      let s = null;
      if (bytes?.length) {
        try { s = muestrasDeEfecto(await decodificar(bytes, `efecto-${c.propio.archivoId}`), RENDER.muestreo, { max: MAX_EFECTO_PROPIO }); } catch (e) { console.error("efectos: un efecto de la biblioteca no se pudo leer:", e?.message ?? e); }
      }
      if (!s?.length && automaticos) {
        // El de la biblioteca ya no está o no se lee: suena el de la aplicación en su lugar (y se dice).
        const sitio = c.capa ? "sello" : "transicion";
        s = await muestrasDelCatalogo(EFECTO_AUTOMATICO[sitio], decodificar);
        avisos.push(`El efecto «${c.propio.nombre || "de la biblioteca"}» no se pudo leer: sonó el de la aplicación.`);
      }
      if (s?.length) { muestras.set(clave, s); picos.set(c.propio.archivoId, picoDeEfecto(s, RENDER.muestreo)); }
    } else if (!muestras.has(c.sonido)) {
      const s = await muestrasDelCatalogo(c.sonido, decodificar);
      if (s?.length) muestras.set(c.sonido, s);
    }
  }
  const datosDe = (c) => {
    if (c.propio) return { papel: "propio", pico: picos.get(c.propio.archivoId) ?? 0, nombre: c.propio.nombre || "Efecto de la biblioteca" };
    const e = efectoDelCatalogo(c.sonido);
    return e ? { papel: e.papel, pico: e.pico, nombre: e.nombre } : null;
  };
  const { momentos, sinSitio, movidos } = momentosColocados(lista, guion, linea, datosDe);
  return { lista, automaticos, momentos, muestras, sinSitio, movidos, bajadas: bajadasDeMusica(momentos), avisos };
}

/**
 * El audio del video POR PISTAS, antes del volumen final: la toma de la voz con sus silencios hasta el último cuadro, el
 * sonido de los clips (`clips`: los usos de `usosDeVideo` con sonido), la música (`musica`: { audio, volumen }) y los
 * efectos. `decodificar(bytes, nombre)` → PCM. → { mezcla, pistas, medidas, sinArchivo, efectos (lo de
 * prepararEfectos), toma (bytes de la voz decodificada), conClips }.
 */
export async function sonidoPorPistas({ audio, linea, total, guion = null, efectos = false, colocados = [], propios = {}, libreria = {}, musica = null, clips = [], decodificar }) {
  const toma = audio?.length ? await decodificar(audio, "voz", "No se pudo leer el audio de la locución") : new Uint8Array(0);
  const voz = armarPcm(toma, tramosDeAudio(linea.silencios), total, RENDER.muestreo);
  // El sonido de los clips va con la voz (lo que «habla»): la música baja también debajo de él.
  let conClips = 0;
  const habla = clips.length ? new Uint8Array(voz) : voz;
  for (const u of clips) {
    const tramo = await audioDe(u.archivo, u.clipDesde, Math.max(0, u.hasta - u.desde)).catch(() => new Uint8Array(0));
    if (tramo.length) conClips += mezclarClip(habla, tramo, { en: u.desde, hasta: u.hasta, volumen: u.volumen, muestreo: RENDER.muestreo }) > 0 ? 1 : 0;
  }
  const fx = await prepararEfectos({ guion, linea, efectos, colocados, propios, libreria, decodificar });
  const fondo = musica?.audio?.length ? await decodificar(musica.audio, "musica", "No se pudo leer la música") : null;
  const s = armarSonido({ habla, musica: fondo, volumen: musica?.volumen ?? 0, momentos: fx.momentos, muestras: fx.muestras, bajadas: fx.bajadas, muestreo: RENDER.muestreo });
  return { ...s, efectos: fx, toma, conClips };
}

/** Los efectos de la biblioteca de un pedido ({ archivoId: base64 }) en bytes. */
export function libreriaDelPedido(p) {
  const out = {};
  for (const [id, b64] of Object.entries(p?.libreria ?? {})) {
    if (/^[\w-]{1,80}$/.test(id) && typeof b64 === "string" && b64) out[id] = Buffer.from(b64, "base64");
  }
  return out;
}

/** Los que sustituyen a los automáticos ({ transicion?, sello? }: { archivoId, nombre }), limpios. */
export function propiosDelPedido(p) {
  const out = {};
  for (const sitio of ["transicion", "sello"]) {
    const e = p?.propios?.[sitio];
    if (e && /^[\w-]{1,80}$/.test(String(e.archivoId ?? ""))) out[sitio] = { archivoId: String(e.archivoId), nombre: String(e.nombre ?? "").slice(0, 80) };
  }
  return out;
}
