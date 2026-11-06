// ============================================================
// GET|HEAD /api/vista-medio/<testigo>/<nombre> — un audio o un video para la vista previa del chat de Claude
//
// Sin sesión (la página corre en un iframe de claude.ai): abre SÓLO el archivo que dice el testigo firmado
// (worker/lib/medioVista.js) y sólo mientras no caduque. Contesta POR TROZOS (`Range` → 206), porque Safari en el
// iPhone no reproduce nada que no se lo dé así: pide `bytes=0-1` antes de empezar. El <nombre> es sólo para que el
// archivo se llame bien al abrirlo; lo que manda es el testigo.
//
// Cabeceras: `nosniff`; `sandbox` (abierto suelto en una pestaña no ejecuta nada; a un <audio> o <video> no le afecta);
// `Cache-Control` privado (son archivos de clientes: ninguna caché compartida); `Cross-Origin-Resource-Policy:
// cross-origin`, para que el iframe de claude.ai (otro origen, quizá aislado) lo pueda reproducir.
// ============================================================

import { claveDeTestigoVista } from "../lib/medioVista.js";
import { noEncontrado, rangoServido } from "../lib/respuesta.js";

const TIPO_MEDIO = /^(audio|video)\/[a-z0-9.+-]+$/i;

export async function rutaVistaMedio(req, env, partes) {
  const clave = await claveDeTestigoVista(env, partes[1] ?? "");
  if (!clave) return noEncontrado("Archivo");
  const cabeza = req.method === "HEAD";
  const rango = req.headers.get("Range") ?? "";
  let objeto;
  try {
    objeto = cabeza ? await env.MEDIA.head(clave) : await env.MEDIA.get(clave, /^bytes=/.test(rango) ? { range: req.headers } : undefined);
  } catch {
    // Un rango que no existe (más allá del final): R2 lanza.
    return new Response(null, { status: 416, headers: { "Content-Range": "bytes */*" } });
  }
  if (!objeto) return noEncontrado("Archivo");
  const tipo = String(objeto.httpMetadata?.contentType ?? "");
  // Sólo audio y video: una imagen, un HTML o un índice del cerebro no salen por aquí aunque alguien firmara su clave.
  if (!TIPO_MEDIO.test(tipo)) {
    // El cuerpo que se abrió se cierra (no se va a leer).
    Promise.resolve(objeto.body?.cancel?.()).catch(() => {});
    return noEncontrado("Archivo");
  }
  const cabeceras = new Headers({
    "Content-Type": tipo,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Referrer-Policy": "no-referrer",
  });
  if (objeto.httpEtag) cabeceras.set("ETag", objeto.httpEtag);
  const trozo = !cabeza && rango && objeto.range ? rangoServido(objeto.range, objeto.size) : null;
  if (trozo) {
    cabeceras.set("Content-Range", `bytes ${trozo.inicio}-${trozo.fin}/${objeto.size}`);
    cabeceras.set("Content-Length", String(trozo.fin - trozo.inicio + 1));
    return new Response(objeto.body, { status: 206, headers: cabeceras });
  }
  if (Number.isFinite(objeto.size)) cabeceras.set("Content-Length", String(objeto.size));
  return new Response(cabeza ? null : objeto.body, { headers: cabeceras });
}
