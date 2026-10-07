// ============================================================
// Leer un video para el asistente
//
// La API de Claude no recibe video: sólo imagen y documento. Así que el
// video lo VE Gemini —imagen y audio, entero— y devuelve un análisis
// escrito (transcripción, texto en pantalla, escenas, estructura), que
// es lo que el asistente recibe junto a unos fotogramas que saca el
// navegador. Claude escribe; Gemini mira.
//
// El video sube por la Files API de Gemini y no en línea: en línea
// habría que pasarlo a base64 AQUÍ, y codificar decenas de megas se
// come el tiempo de CPU del Worker. La subida es un `fetch` con los
// bytes tal cual.
//
// Sólo videos de un cliente de este espacio: los de R2 se comprueban
// por la clave, igual que en /api/media; los de Drive, subiendo por sus
// carpetas hasta la del cliente (worker/rutas/drive.js).
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { REGLA_IDIOMA } from "../../src/lib/idioma.js";
import { bloqueoPorPresupuesto } from "../lib/configIA.js";
import { verVideo, ErrorVideo, MAX_BYTES_VIDEO } from "../lib/geminiVideo.js";
import { leerDeDrive, respuestaDeFallo as respuestaDeFalloDrive } from "../lib/google.js";

const MAX_BYTES = MAX_BYTES_VIDEO;

const PROMPT = `Analiza este video de redes sociales para que un redactor pueda escribir guiones inspirados en él.
Responde en español, con estas secciones y en este orden:

1. TRANSCRIPCIÓN: todo lo que se dice, literal, con marcas de tiempo [mm:ss]. Si no hay voz, dilo.
2. TEXTO EN PANTALLA: rótulos, subtítulos y textos superpuestos, con su momento.
3. ESCENAS: plano a plano, con marcas de tiempo: qué se ve, encuadre, acción, personas, producto y lugar.
4. ESTRUCTURA: el gancho de los primeros 3 segundos, el desarrollo, el cierre y la llamada a la acción.
5. ESTILO: duración, ritmo de edición, música o sonido, tono y tipo de pieza (tutorial, testimonio, tendencia…).
6. POR QUÉ FUNCIONA: los recursos que lo hacen atractivo y que se podrían reutilizar.

Sé fiel a lo que hay: no inventes nada que no se vea o no se oiga. La transcripción es literal: se copia como se dice.

${REGLA_IDIOMA}`;

export async function rutaAnalizarVideo(req, env, { acceso }) {
  if (!env.GOOGLE_AI_KEY) {
    return error("El servidor no tiene configurada la clave de Google AI, que es la que lee los videos", 503);
  }

  const pedido = (await cuerpo(req)) ?? {};
  const pesado = (tamano) => error(
    `El video pesa ${Math.round(tamano / 1048576)} MB; el máximo para analizarlo es ${MAX_BYTES / 1048576} MB.`, 413,
  );

  // Dos orígenes: el banco de antes (una clave de R2) o Google Drive
  // (cliente + id del archivo, que se comprueba dentro de su carpeta).
  let bytes, tipo, nombre, clienteId;
  if (pedido.drive) {
    clienteId = String(pedido.drive.clienteId ?? "");
    const fileId = String(pedido.drive.fileId ?? "");
    if (!clienteId || !fileId) return error("Falta el video de Drive");
    const bloqueo = await bloqueoPorPresupuesto(acceso);
    if (bloqueo) return error(bloqueo, 402);
    let leido;
    try {
      leido = await leerDeDrive(env, acceso, clienteId, fileId, { maxBytes: MAX_BYTES });
    } catch (e) {
      return respuestaDeFalloDrive(e);
    }
    if (!leido) return noEncontrado("Archivo");
    if (leido.demasiado) return pesado(leido.demasiado);
    ({ bytes, nombre } = leido);
    tipo = leido.mime || "video/mp4";
  } else {
    const { clave } = pedido;
    const m = /^clientes\/([^/]+)\//.exec(String(clave ?? ""));
    if (!m || String(clave).includes("..")) return error("Falta la clave del video");
    if (!(await acceso.leerUno("clients", { id: m[1] }))) return noEncontrado("Archivo");
    clienteId = m[1];
    const bloqueo = await bloqueoPorPresupuesto(acceso);
    if (bloqueo) return error(bloqueo, 402);

    const objeto = await env.MEDIA.get(clave);
    if (!objeto) return noEncontrado("Archivo");
    if (objeto.size > MAX_BYTES) return pesado(objeto.size);
    tipo = objeto.httpMetadata?.contentType || "video/mp4";
    nombre = clave.split("/").pop();
    bytes = await objeto.arrayBuffer();
  }

  try {
    const analisis = await verVideo(env, acceso, { bytes, mime: tipo, nombre, clienteId, prompt: PROMPT, funcion: "análisis de video" });
    return json({ analisis });
  } catch (e) {
    if (e instanceof ErrorVideo) return error(e.message, e.estado);
    throw e;
  }
}
