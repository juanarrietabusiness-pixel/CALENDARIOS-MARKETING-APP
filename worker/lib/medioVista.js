// ============================================================
// La dirección FIRMADA y de corta vida de un AUDIO o un VIDEO de R2, para la vista previa del chat de Claude
//
// La vista previa (MCP Apps, worker/lib/mcpVista/) corre en un iframe de claude.ai, sin la sesión de la aplicación: un
// <audio> o un <video> no puede pedir `/api/media/…`. Así que cada toma, música o mp4 que se enseña ahí va por
// `/api/vista-medio/<testigo>/<nombre>` (worker/rutas/vistaMedio.js): sin sesión, abre SÓLO el archivo que dice el
// testigo y caduca en horas. La página puede pedir otra dirección cuando una caduca (`vista_medios`).
//
// Por qué no la de Meta (`/api/medio-publico/`): va firmada con META_APP_SECRET, que no tiene un espacio sin Meta
// conectado, y dura tres días. Ésta se firma con un secreto que SIEMPRE existe porque se crea solo: 32 bytes al azar
// guardados en R2 la primera vez (`firmas/vista-medios.key`, fuera de `clientes/`: ni /api/media ni esta ruta lo
// sirven), leído una vez por instancia del Worker. Quien pudiera leer R2 ya tendría los archivos: no abre nada más.
//
// Sólo se firma (y se sirve) lo que cuelga de `clientes/<cliente>/`, de `voces/` (las muestras de una voz, de toda la
// agencia; no las tomas a medio entregar de `voces/pendientes/`) o de la MÚSICA de la biblioteca de la agencia
// (`biblioteca/<espacio>/musica/`: la canción de un «video con tu canción»), sin `..`. La ruta, además, sólo sirve audio
// y video.
// ============================================================

import { firmarCon, leerFirmado, aBase64Url } from "./firmas.js";

/** Lo que dura una dirección firmada: lo que dura mirar una conversación. Pasado eso, la página pide otra. */
export const VIDA_MEDIO_VISTA_MS = 12 * 3600_000;
/** Dónde vive el secreto con que se firman (en R2, fuera de `clientes/`). */
export const CLAVE_SECRETO_VISTA = "firmas/vista-medios.key";
const USO = "vista-medio";
/** La ruta de la API (relativa: el conector le pone su origen; en la aplicación vale tal cual). */
export const RUTA_MEDIO_VISTA = "/api/vista-medio/";

const enc = new TextEncoder();
const dec = new TextDecoder();
const FORMA_SECRETO = /^[A-Za-z0-9_-]{43}$/;
const recordado = new WeakMap();

/** ¿Se puede firmar y servir esta clave de R2? Sólo de un cliente o una muestra de voz, sin rodeos. Pura. */
export function claveServible(clave) {
  const c = String(clave ?? "");
  if (!c || c.length > 400 || c.includes("..") || c.includes("\\") || c.includes("//") || [...c].some((x) => x.charCodeAt(0) < 32)) return false;
  if (/^clientes\/[^/]+\/.+/.test(c)) return true;
  if (/^biblioteca\/[^/]+\/musica\/.+/.test(c)) return true;
  return /^voces\/(?!pendientes\/).+/.test(c);
}

async function textoDe(obj) {
  if (!obj) return "";
  if (typeof obj.arrayBuffer === "function") return dec.decode(await obj.arrayBuffer()).trim();
  if (typeof obj.text === "function") return String(await obj.text()).trim();
  return "";
}

/**
 * El secreto de las direcciones de la vista: el de R2 o, la primera vez, uno nuevo que se guarda. Se recuerda por
 * instancia (y por bucket: cada prueba tiene el suyo). Si dos instancias lo crean a la vez, gana el que quede escrito.
 */
export function secretoDeVista(env) {
  const media = env?.MEDIA;
  if (!media) return Promise.resolve(null);
  if (!recordado.has(media)) {
    const p = (async () => {
      const actual = await textoDe(await media.get(CLAVE_SECRETO_VISTA)).catch(() => "");
      if (FORMA_SECRETO.test(actual)) return actual;
      const nuevo = aBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      await media.put(CLAVE_SECRETO_VISTA, enc.encode(nuevo), { httpMetadata: { contentType: "text/plain" } });
      const leido = await textoDe(await media.get(CLAVE_SECRETO_VISTA)).catch(() => "");
      return FORMA_SECRETO.test(leido) ? leido : nuevo;
    })();
    // Un fallo (R2 caído) no se queda recordado: la siguiente vez se intenta otra vez.
    p.catch(() => recordado.delete(media));
    recordado.set(media, p);
  }
  return recordado.get(media);
}

/**
 * La dirección firmada (relativa) de un audio o video de R2 → { url, caduca } o null si la clave no se puede servir o
 * no hay dónde guardar el secreto. `caduca`: el instante (ms) en que deja de valer.
 */
export async function direccionDeVista(env, clave, { vidaMs = VIDA_MEDIO_VISTA_MS } = {}) {
  const c = String(clave ?? "").replace(/^\/api\/media\//, "");
  if (!claveServible(c)) return null;
  const secreto = await secretoDeVista(env).catch(() => null);
  if (!secreto) return null;
  const vida = Math.max(60_000, Math.min(VIDA_MEDIO_VISTA_MS, Number(vidaMs) || VIDA_MEDIO_VISTA_MS));
  const testigo = await firmarCon(secreto, USO, { c }, vida);
  return { url: `${RUTA_MEDIO_VISTA}${testigo}/${encodeURIComponent(c.split("/").pop())}`, caduca: Date.now() + vida };
}

/** La clave de R2 de un testigo, o null si la firma no cuadra, caducó o la clave no se puede servir. */
export async function claveDeTestigoVista(env, testigo) {
  if (!testigo || String(testigo).length > 2000) return null;
  const secreto = await secretoDeVista(env).catch(() => null);
  if (!secreto) return null;
  const d = await leerFirmado(secreto, USO, testigo);
  return typeof d?.c === "string" && claveServible(d.c) ? d.c : null;
}
