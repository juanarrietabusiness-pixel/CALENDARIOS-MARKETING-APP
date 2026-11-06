// ============================================================
// /api/sonidos — la BIBLIOTECA DE SONIDO: la música y los efectos de cada cliente y los de la AGENCIA
//
//   GET    /api/sonidos/agencia                 { musica, efectos, puedeCambiar }: la biblioteca de la agencia
//   POST   /api/sonidos/agencia                 Subir (multipart: archivo, categoria «musica»|«efecto», nombre?, duracion?)
//   PATCH  /api/sonidos/agencia/<id>            { nombre?, etiquetas?, bpm?, favorita? }
//   DELETE /api/sonidos/agencia/<id>?forzar=1   Quitarla (si la usa un video, 409 `en_uso` con cuáles; con `forzar`, sí)
//   GET    /api/sonidos/agencia/<id>/audio      El audio, por trozos (Range): sin eso el iPhone no lo reproduce
//
//   GET    /api/sonidos/<c>                     { musica, efectos, agencia: { musica, efectos }, puedeCambiarAgencia }
//   POST   /api/sonidos/<c>                     Subir a la del cliente (como arriba). Gratis
//   PATCH  /api/sonidos/<c>/<id>                { nombre?, etiquetas?, bpm?, favorita? } (la favorita de la música es UNA:
//                                               la música de la marca, la que llevan por defecto sus videos nuevos)
//   DELETE /api/sonidos/<c>/<id>?forzar=1       A la papelera (409 `en_uso` si la usa un video)
//   POST   /api/sonidos/<c>/<id>/recuperar      «Deshacer»: vuelve de la papelera
//   POST   /api/sonidos/<c>/de-agencia          { id }: «Usar de la agencia» (la copia a la del cliente)
//   POST   /api/sonidos/<c>/<id>/a-agencia      «Pasar a la agencia» (la copia a la de la agencia: reutilizar lo de Suno)
//
// Lo de la AGENCIA lo cambian quien administra y los editores sin clientes asignados (403 a un colaborador), como las
// estructuras de guion; verla y usarla, todos. Lo de un cliente, quien puede escribir en él (la capa lo acota).
// Nada aquí gasta: lo que se genera con Suno sigue en POST /api/videos/<c>/musicas/generar.
// ============================================================

import { json, error, cuerpo, noEncontrado, rangoServido } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import {
  sonidosDelCliente, sonidosDeLaAgencia, subirSonido, cambiarSonido, quitarSonido, recuperarSonido, copiarDeAgencia,
  pasarALaAgencia, puedeCambiarAgencia, ErrorSonido,
} from "../lib/estudio/sonidos.js";

const ID = /^[\w-]{1,80}$/;

/** El aviso al espacio: quien tenga una biblioteca (o «Sonido» de un video) abierta la relee. */
const avisar = (env, acceso, usuario, req, clienteId = null) =>
  difundir(env, acceso.ownerId, { tipo: "sonidos", clienteId, por: firma(usuario, req) });

const respuestaDeError = (e) => json({ error: e.message, ...e.extra }, e.estado ?? 400);

/** Un audio de R2 por trozos (como `sirveMedia`): Safari en el iPhone pide `bytes=0-1` antes de reproducir. */
async function sirveAudio(env, clave, req) {
  const rango = req.headers.get("Range") ?? "";
  let objeto;
  try {
    objeto = await env.MEDIA.get(clave, /^bytes=/.test(rango) ? { range: req.headers } : undefined);
  } catch {
    return new Response(null, { status: 416, headers: { "Content-Range": "bytes */*" } });
  }
  if (!objeto) return noEncontrado("Audio");
  const cabeceras = new Headers();
  objeto.writeHttpMetadata?.(cabeceras);
  if (!cabeceras.get("content-type")) cabeceras.set("Content-Type", objeto.httpMetadata?.contentType ?? "audio/mpeg");
  if (objeto.httpEtag) cabeceras.set("etag", objeto.httpEtag);
  cabeceras.set("Accept-Ranges", "bytes");
  cabeceras.set("Cache-Control", "private, max-age=3600");
  cabeceras.set("X-Content-Type-Options", "nosniff");
  const trozo = rango && objeto.range ? rangoServido(objeto.range, objeto.size) : null;
  if (trozo) {
    cabeceras.set("Content-Range", `bytes ${trozo.inicio}-${trozo.fin}/${objeto.size}`);
    return new Response(objeto.body, { status: 206, headers: cabeceras });
  }
  return new Response(objeto.body, { headers: cabeceras });
}

/** Lo que llega al subir (multipart). */
async function datosDeSubida(req) {
  const form = await req.formData().catch(() => null);
  return {
    archivo: form?.get("archivo"),
    categoria: String(form?.get("categoria") ?? "musica"),
    nombre: String(form?.get("nombre") ?? ""),
    duracion: form?.get("duracion") ?? null,
  };
}

export async function rutasSonidos(req, env, { acceso, usuario, partes, metodo }) {
  try {
    if (partes[1] === "agencia") return await rutasAgencia(req, env, { acceso, usuario, partes, metodo });
    return await rutasCliente(req, env, { acceso, usuario, partes, metodo });
  } catch (e) {
    if (e instanceof ErrorSonido) return respuestaDeError(e);
    throw e;
  }
}

async function rutasAgencia(req, env, { acceso, usuario, partes, metodo }) {
  const [, , id, accion] = partes;
  if (!id && metodo === "GET") return json({ ...(await sonidosDeLaAgencia(acceso)), puedeCambiar: puedeCambiarAgencia(usuario) });
  if (id && accion === "audio" && (metodo === "GET" || metodo === "HEAD")) {
    if (!ID.test(id)) return noEncontrado("Audio");
    const f = await acceso.leerUno("biblioteca_sonidos", { id });
    return f ? sirveAudio(env, f.clave, req) : noEncontrado("Audio");
  }
  if (!puedeCambiarAgencia(usuario)) return error("La biblioteca de la agencia es de todos los clientes: la cambia quien administra o un editor.", 403);
  if (!id && metodo === "POST") {
    const r = await subirSonido(env, acceso, { ...(await datosDeSubida(req)), usuario });
    avisar(env, acceso, usuario, req);
    return json(r, r.repetido ? 200 : 201);
  }
  if (!id || !ID.test(id) || accion) return noEncontrado("Pista");
  if (metodo === "PATCH") {
    const pista = await cambiarSonido(acceso, { id, cambios: (await cuerpo(req)) ?? {} });
    if (!pista) return noEncontrado("Pista");
    avisar(env, acceso, usuario, req);
    return json({ pista });
  }
  if (metodo === "DELETE") {
    const r = await quitarSonido(env, acceso, { id, forzar: new URL(req.url).searchParams.get("forzar") === "1" });
    if (!r) return noEncontrado("Pista");
    avisar(env, acceso, usuario, req);
    return json(r);
  }
  return error("Método no permitido.", 405);
}

async function rutasCliente(req, env, { acceso, usuario, partes, metodo }) {
  const [, clienteId, id, accion] = partes;
  if (!ID.test(String(clienteId ?? ""))) return noEncontrado("Cliente");
  const cliente = await acceso.leerUno("clients", { id: clienteId });
  if (!cliente) return noEncontrado("Cliente");

  if (!id) {
    if (metodo === "GET") {
      const [suya, agencia] = await Promise.all([sonidosDelCliente(acceso, clienteId), sonidosDeLaAgencia(acceso)]);
      return json({ ...suya, agencia, puedeCambiarAgencia: puedeCambiarAgencia(usuario) });
    }
    if (metodo === "POST") {
      const r = await subirSonido(env, acceso, { cliente, ...(await datosDeSubida(req)), usuario });
      avisar(env, acceso, usuario, req, clienteId);
      return json(r, r.repetido ? 200 : 201);
    }
    return error("Método no permitido.", 405);
  }

  if (id === "de-agencia" && !accion) {
    if (metodo !== "POST") return error("Método no permitido.", 405);
    const b = (await cuerpo(req)) ?? {};
    const r = await copiarDeAgencia(env, acceso, cliente, typeof b.id === "string" ? b.id : "");
    avisar(env, acceso, usuario, req, clienteId);
    return json(r, r.repetido ? 200 : 201);
  }

  if (!ID.test(id)) return noEncontrado("Pista");
  if (accion === "recuperar" && metodo === "POST") {
    const pista = await recuperarSonido(acceso, clienteId, id);
    if (!pista) return noEncontrado("Pista");
    avisar(env, acceso, usuario, req, clienteId);
    return json({ pista });
  }
  if (accion === "a-agencia" && metodo === "POST") {
    if (!puedeCambiarAgencia(usuario)) return error("La biblioteca de la agencia es de todos los clientes: la cambia quien administra o un editor.", 403);
    const r = await pasarALaAgencia(env, acceso, cliente, id, { usuario });
    avisar(env, acceso, usuario, req);
    return json(r, r.repetido ? 200 : 201);
  }
  if (accion) return noEncontrado("Pista");
  if (metodo === "PATCH") {
    const pista = await cambiarSonido(acceso, { clienteId, id, cambios: (await cuerpo(req)) ?? {} });
    if (!pista) return noEncontrado("Pista");
    avisar(env, acceso, usuario, req, clienteId);
    return json({ pista });
  }
  if (metodo === "DELETE") {
    const r = await quitarSonido(env, acceso, { clienteId, id, forzar: new URL(req.url).searchParams.get("forzar") === "1" });
    if (!r) return noEncontrado("Pista");
    avisar(env, acceso, usuario, req, clienteId);
    return json(r);
  }
  return error("Método no permitido.", 405);
}
