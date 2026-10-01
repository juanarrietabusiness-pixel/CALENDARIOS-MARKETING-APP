// ============================================================
// El webhook de Meta: la firma y lo que dice un aviso
//
// `/api/webhooks/meta` no tiene sesión —quien llama es Meta—, así que lo
// único que dice que un aviso es de Meta es su firma: `X-Hub-Signature-256`
// = «sha256=» + HMAC-SHA256 del CUERPO CRUDO con el secreto de la app
// (META_APP_SECRET). Crudo quiere decir los bytes tal como llegaron:
// Meta firma su JSON con los caracteres no ASCII escapados («á»), y
// volver a serializar lo leído daría otra cadena y otra firma. La
// comparación va en tiempo constante (`igualSeguro`).
//
// La suscripción (el GET con `hub.challenge`) la hace una persona desde el
// panel de Meta, con un testigo que ella misma inventa y que el Worker
// guarda como META_WEBHOOK_VERIFY_TOKEN. Ver DEPLOY.md.
//
// `desmenuzar()` es puro: convierte el aviso en una lista de sucesos con
// una sola forma, sin mirar a quién pertenecen. Eso lo decide almacen.js.
//
// NO PROBADO CONTRA META: los tests usan avisos escritos a mano con la
// forma de la documentación (Webhooks → Page «feed» y «messages»;
// Instagram «comments», «live_comments» y «messages»).
// ============================================================

import { igualSeguro } from "../ids.js";

const aHex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** El tope de un aviso. Meta agrupa, pero un aviso de más de 1 MB no es suyo. */
export const TOPE_AVISO = 1024 * 1024;

/**
 * ¿La firma casa con el cuerpo? `cuerpo` son los BYTES (ArrayBuffer o
 * Uint8Array). Cualquier cosa que no sea exactamente «sha256=<64 hex>» es
 * no: sin secreto, sin cabecera, con otro algoritmo o con otra longitud.
 */
export async function firmaValida(secreto, cuerpo, cabecera) {
  if (!secreto || typeof cabecera !== "string") return false;
  const m = /^sha256=([0-9a-fA-F]{64})$/.exec(cabecera.trim());
  if (!m) return false;
  const clave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const esperada = aHex(await crypto.subtle.sign("HMAC", clave, cuerpo));
  return igualSeguro(esperada, m[1].toLowerCase());
}

/** Para los tests y para quien quiera firmar como Meta. */
export async function firmar(secreto, cuerpo) {
  const clave = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const bytes = typeof cuerpo === "string" ? new TextEncoder().encode(cuerpo) : cuerpo;
  return `sha256=${aHex(await crypto.subtle.sign("HMAC", clave, bytes))}`;
}

/**
 * La verificación de la suscripción: Meta manda `hub.mode=subscribe`,
 * `hub.verify_token` y `hub.challenge`, y espera el challenge de vuelta
 * tal cual. Devuelve el challenge, o null si no casa.
 */
export function retoDeSuscripcion(url, testigoEsperado) {
  const p = url.searchParams;
  if (!testigoEsperado || p.get("hub.mode") !== "subscribe") return null;
  if (!igualSeguro(p.get("hub.verify_token") ?? "", testigoEsperado)) return null;
  const reto = p.get("hub.challenge") ?? "";
  // El challenge es un número; nada de lo que se devuelva puede ser HTML.
  return /^[A-Za-z0-9_-]{1,128}$/.test(reto) ? reto : null;
}

/** Una marca de tiempo de Meta (segundos, milisegundos o ISO) en ISO. */
export function fechaMeta(valor, respaldo = Date.now()) {
  if (valor === undefined || valor === null || valor === "") return new Date(respaldo).toISOString();
  if (typeof valor === "number" || /^\d+$/.test(String(valor))) {
    const n = Number(valor);
    return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  }
  const t = Date.parse(String(valor).replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return new Date(Number.isFinite(t) ? t : respaldo).toISOString();
}

const texto = (v, tope = 4000) => String(v ?? "").slice(0, tope);

function adjuntos(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, 10).map((a) => ({
    tipo: texto(a?.type, 20) || "archivo",
    url: /^https:\/\//.test(a?.payload?.url ?? "") ? texto(a.payload.url, 2000) : "",
  }));
}

/**
 * El aviso de Meta → sucesos con una sola forma. `red` sale del objeto
 * (`page` = Facebook, `instagram`) y `cuenta` es el id de la página o de
 * la cuenta de Instagram (`entry.id`): con él se sabe de quién es.
 *
 *   { tipo: "comentario", red, cuenta, verbo, externoId, padreId, publicacionId,
 *     autorId, autor, texto, creadoAt }
 *   { tipo: "mensaje", red, cuenta, externoId, propio, usuarioId, texto, adjuntos, enviadoAt }
 *
 * Lo que no es un comentario ni un mensaje (reacciones, lecturas,
 * entregas, publicaciones nuevas) se ignora.
 */
export function desmenuzar(aviso) {
  const red = aviso?.object === "page" ? "facebook" : aviso?.object === "instagram" ? "instagram" : null;
  const salida = [];
  if (!red || !Array.isArray(aviso.entry)) return salida;

  for (const entrada of aviso.entry.slice(0, 100)) {
    const cuenta = String(entrada?.id ?? "");
    if (!cuenta) continue;

    for (const cambio of Array.isArray(entrada.changes) ? entrada.changes : []) {
      const v = cambio?.value ?? {};
      if (red === "facebook" && cambio?.field === "feed" && v.item === "comment" && v.comment_id) {
        const verbo = ["add", "edited", "remove", "hide", "unhide"].includes(v.verb) ? v.verb : "add";
        const post = String(v.post_id ?? "");
        salida.push({
          tipo: "comentario", red, cuenta, verbo,
          externoId: String(v.comment_id),
          // En Facebook, un comentario de primer nivel trae como padre la publicación.
          padreId: v.parent_id && String(v.parent_id) !== post ? String(v.parent_id) : null,
          publicacionId: post,
          autorId: String(v.from?.id ?? ""), autor: texto(v.from?.name, 200),
          texto: texto(v.message),
          creadoAt: fechaMeta(v.created_time ?? entrada.time),
        });
      }
      if (red === "instagram" && (cambio?.field === "comments" || cambio?.field === "live_comments") && v.id) {
        salida.push({
          tipo: "comentario", red, cuenta, verbo: "add",
          externoId: String(v.id),
          padreId: v.parent_id ? String(v.parent_id) : null,
          publicacionId: String(v.media?.id ?? ""),
          autorId: String(v.from?.id ?? ""), autor: texto(v.from?.username, 200),
          texto: texto(v.text),
          creadoAt: fechaMeta(v.timestamp ?? entrada.time),
        });
      }
    }

    for (const m of Array.isArray(entrada.messaging) ? entrada.messaging : []) {
      const msj = m?.message;
      if (!msj?.mid || msj.is_deleted) continue;
      const remitente = String(m.sender?.id ?? "");
      const destinatario = String(m.recipient?.id ?? "");
      // Un eco (lo que envió la propia cuenta, desde aquí o desde Business Suite).
      const propio = Boolean(msj.is_echo) || remitente === cuenta;
      const usuarioId = propio ? destinatario : remitente;
      if (!usuarioId) continue;
      salida.push({
        tipo: "mensaje", red, cuenta, propio, usuarioId,
        externoId: String(msj.mid),
        texto: texto(msj.text),
        adjuntos: adjuntos(msj.attachments),
        enviadoAt: fechaMeta(m.timestamp ?? entrada.time),
      });
    }
  }
  return salida;
}
