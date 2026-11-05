// ============================================================
// VER UN CUADRO del video animado y REVISARLO antes de renderizar (por el Container: worker/contenedor.js)
//
// El Worker no tiene lienzo; el Container sí, con el MISMO motor que la vista previa. Aquí se arma el pedido con lo
// que el Container no puede leer por su cuenta (no tiene llaves ni internet):
//   · el guion validado y los tiempos de la locución (si la hay; si no, el motor estima a 2,5 palabras por segundo);
//   · la paleta del kit del cliente;
//   · las imágenes que nombra el guion —ids de la GALERÍA de ESE cliente, nunca una clave que llegue de fuera—, el
//     logo del kit y la letra (la del kit, o la que pida el guion si es de ese cliente), leídas de R2 y en base64.
// No gasta dinero de IA: es cómputo del Container (céntimos de céntimo; ver CLAUDE.md).
// ============================================================

import { ErrorVideo } from "../videosProyectos.js";
import { kitDe } from "./kit.js";
import { conPersonajeDelKit } from "../../../src/lib/personajeVideo.js";
import { claveDelCliente } from "./archivos.js";
import { validarGuion, archivosDelGuion, FORMATOS_VIDEO } from "../../../src/lib/videoEscenas.js";

/** Lo más que pesa lo que se manda (imágenes y fuentes): el Container lo tiene en memoria. */
const TOPE_TOTAL = 24 * 1024 * 1024;
/** Una imagen o una fuente de más de esto no se manda (el motor pinta su marcador). */
const TOPE_ARCHIVO = 8 * 1024 * 1024;
/** El nombre del único Container de cuadros del espacio (worker/contenedor.js). */
const NOMBRE = "cuadros";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };

/** Bytes → base64, por trozos (un `String.fromCharCode(...bytes)` de varios MB revienta la pila). */
export function aBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Un archivo de R2 en base64, o null si no está, pesa de más o se pasa del total. */
async function deR2(env, clave, cuenta) {
  if (!clave) return null;
  const obj = await env.MEDIA.get(clave).catch(() => null);
  if (!obj || obj.size > TOPE_ARCHIVO || cuenta.bytes + obj.size > TOPE_TOTAL) return null;
  const bytes = new Uint8Array(await obj.arrayBuffer());
  cuenta.bytes += bytes.length;
  return aBase64(bytes);
}

/**
 * Todo lo que el Container necesita para dibujar este video → { pedido, guion, palabras }.
 * Sólo lee: la galería, el kit y R2 de ESE cliente.
 */
export async function pedidoDelVideo(env, acceso, cliente, fila, { formato } = {}) {
  const v = validarGuion(leerJSON(fila.guion, null));
  if (!v.ok) throw new ErrorVideo("El guion tiene errores: corrígelos antes de mirarlo.", 400, { errores: v.errores });
  const kit = kitDe(cliente);
  // El personaje se dibuja con el aspecto del kit si el guion no trae uno propio.
  const guion = conPersonajeDelKit(v.guion, kit);
  const locucion = leerJSON(fila.locucion, {});
  const palabras = locucion.estado === "lista" && Array.isArray(locucion.palabras) ? locucion.palabras : null;
  const cuenta = { bytes: 0 };

  // Las imágenes: los ids del guion que ESTÁN en la galería de este cliente (lo demás sale como marcador).
  const ids = archivosDelGuion(guion);
  const imagenes = {};
  for (const id of ids) {
    const f = await acceso.leerUno("estudio_archivos", { id: String(id), client_id: cliente.id }).catch(() => null);
    if (!f || f.borrado_at || !String(f.mime ?? "").startsWith("image/")) continue;
    const b = await deR2(env, claveDelCliente(f.clave, cliente.id), cuenta);
    if (b) imagenes[id] = b;
  }
  const logo = await deR2(env, claveDelCliente(kit.logo ?? "", cliente.id), cuenta);

  // La letra: la que pida el guion (si es de este cliente) o la del kit.
  const claveDe = (f) => (f && typeof f === "object" && f.clave ? claveDelCliente(f.clave, cliente.id) : claveDelCliente(kit.fuente?.clave ?? "", cliente.id));
  const titularClave = claveDe(guion.estilo?.fuentes?.titular);
  const cuerpoClave = claveDe(guion.estilo?.fuentes?.cuerpo);
  const titular = titularClave ? await deR2(env, titularClave, cuenta) : null;
  const cuerpo = cuerpoClave && cuerpoClave !== titularClave ? await deR2(env, cuerpoClave, cuenta) : titular;

  return {
    guion, palabras,
    pedido: {
      guion, palabras, formato: FORMATOS_VIDEO[formato] ? formato : guion.formatos[0], paleta: kit.paleta ?? [],
      imagenes, logo, fuentes: { titular: titular ? { datos: titular } : null, cuerpo: cuerpo ? { datos: cuerpo } : null },
    },
    faltan: ids.filter((id) => !imagenes[id]),
  };
}

/** Pide algo al Container del espacio → la Response. Sin Container (en local), 503 diciendo por qué. */
export async function alContenedor(env, ruta, cuerpo) {
  if (!env.VIDEO) {
    throw new ErrorVideo("El Container del video no está disponible aquí (en local no se arranca: se prueba con container/probar.mjs).", 503);
  }
  const stub = env.VIDEO.get(env.VIDEO.idFromName(NOMBRE));
  const r = await stub.fetch(new Request(`https://contenedor${ruta}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
  }));
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new ErrorVideo(j.error || `El Container del video respondió ${r.status}.`, [400, 503].includes(r.status) ? r.status : 502);
  }
  return r;
}

/** Bytes de una Response en base64 (para devolver la imagen a Claude). */
export async function respuestaEnBase64(r) {
  return aBase64(new Uint8Array(await r.arrayBuffer()));
}
