// ============================================================
// «Desglosar toma por toma»: el motor de video del espacio VE un video y lo describe sin opinar
//
// El video es uno de la galería de ESTE cliente (un anuncio de la competencia, uno de «Lo mejor» traído, uno propio).
// Lo ve Gemini (imagen y audio) o, si el motor del espacio es Meta, sus FOTOGRAMAS (sin audio: lo dice el desglose y
// las tomas son aproximadas). Es caro en tokens de video: sólo se pide a pedido y queda en la ficha
// (`ajustes.deconstruccion`); la segunda vez no se paga, salvo «otra vez». Lo puro, en src/lib/deconstructor.js.
//
// Lo usan la ruta POST /api/estudio/<c>/archivos/<id>/deconstruir y la herramienta `deconstruir_video` (Claude y el
// asistente). Después lo leen el guion del reel por planos (worker/lib/estudio/reel.js) y el del video animado de «Lo
// mejor» (worker/lib/loMejor.js) para seguir su FORMA.
// ============================================================

import { verVideo, ErrorVideo, MAX_BYTES_VIDEO } from "../geminiVideo.js";
import { bloqueoPorPresupuesto } from "../configIA.js";
import { ErrorEstudio } from "./trabajos.js";
import { pedidoDeDeconstruccion, leerDeconstruccion, resumenDeSecuencia } from "../../../src/lib/deconstructor.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) ?? d : (t ?? d); } catch { return d; } };

/** El desglose ya guardado en una ficha de la galería, o null. Pura. */
export function desgloseDe(archivo) {
  const d = leerJSON(archivo?.ajustes, {})?.deconstruccion;
  return d && Array.isArray(d.tomas) && d.tomas.length ? d : null;
}

/** El desglose del video `archivoId` de ESTE cliente si ya se hizo (sin pagar nada), o null. */
export async function desgloseGuardado(acceso, clienteId, archivoId) {
  if (!archivoId) return null;
  const f = await acceso.leerUno("estudio_archivos", { id: String(archivoId), client_id: clienteId }).catch(() => null);
  return f && !f.borrado_at ? desgloseDe(f) : null;
}

/**
 * Lo que va al pedido de un guion que SIGUE la forma de un video desglosado: el mapa de secuencia RESUMIDO (tomas, ritmo
 * de cortes, tipos de plano y movimiento, orden), nunca su marca, sus personas ni su texto. Sin desglose, null: no se
 * paga nada aquí (desglosar es aparte, a pedido). `unidad`/`cuantos`: lo que tendrá lo nuevo («planos», «escenas»).
 * → { texto, tomas, archivoId } o null.
 */
export async function secuenciaDeVideo(acceso, clienteId, archivoId, { unidad = "planos", cuantos = 0 } = {}) {
  const d = await desgloseGuardado(acceso, clienteId, archivoId);
  if (!d) return null;
  const texto = resumenDeSecuencia(d, { unidad, cuantos });
  return texto ? { texto, tomas: d.tomas.length, archivoId: String(archivoId) } : null;
}

/**
 * El desglose de un video de la galería. → { deconstruccion, guardada } (`guardada`: venía de antes, sin pagar).
 * Lanza ErrorEstudio con el estado que toca (con Meta y sin fotogramas: 409 `fotogramas`, el navegador los saca).
 */
export async function deconstruirVideo(env, acceso, cliente, { archivoId = "", otraVez = false, fotogramas = null } = {}) {
  const archivo = archivoId ? await acceso.leerUno("estudio_archivos", { id: String(archivoId), client_id: cliente.id }) : null;
  if (!archivo || archivo.borrado_at) throw new ErrorEstudio("Ese video no está en la galería de este cliente.", 404);
  if (archivo.tipo !== "video" || !/^video\//.test(archivo.mime ?? "")) throw new ErrorEstudio("Sólo se desglosan videos.", 400);
  const ajustes = leerJSON(archivo.ajustes, {});
  const ya = desgloseDe(archivo);
  if (ya && !otraVez) return { deconstruccion: ya, guardada: true };

  const bloqueo = await bloqueoPorPresupuesto(acceso);
  if (bloqueo) throw new ErrorEstudio(bloqueo, 402);
  const obj = await env.MEDIA.get(archivo.clave);
  if (!obj) throw new ErrorEstudio("El video ya no está en el almacenamiento.", 404);
  if (obj.size > MAX_BYTES_VIDEO) throw new ErrorEstudio("El video es demasiado grande para desglosarlo.", 413);
  const nombre = archivo.clave.split("/").pop();
  let texto;
  try {
    texto = await verVideo(env, acceso, {
      bytes: await obj.arrayBuffer(), mime: archivo.mime, nombre, clienteId: cliente.id,
      prompt: pedidoDeDeconstruccion({ nombre: String(archivo.prompt ?? "").slice(0, 80) || nombre }),
      funcion: "desglose de video", json: true, fotogramas,
    });
  } catch (e) {
    if (e instanceof ErrorVideo) throw new ErrorEstudio(e.message, e.estado, e.codigo ? { codigo: e.codigo } : {});
    throw e;
  }
  const leido = leerDeconstruccion(texto);
  if (!leido) throw new ErrorEstudio("La IA no devolvió un desglose que se pueda leer. Inténtalo otra vez.", 502);
  const deconstruccion = { ...leido, at: new Date().toISOString(), porFotogramas: Boolean(fotogramas?.length) };
  await acceso.actualizar("estudio_archivos", { id: archivo.id, client_id: cliente.id }, { ajustes: JSON.stringify({ ...ajustes, deconstruccion }) }).catch(() => {});
  return { deconstruccion, guardada: false };
}
