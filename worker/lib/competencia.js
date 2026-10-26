// ============================================================
// El contenido de la competencia en Instagram (y un enlace compartido)
//
// `business_discovery` desde una cuenta de Instagram conectada del espacio
// (la del cliente si la tiene; si no, cualquiera): las últimas publicaciones
// de otra cuenta de EMPRESA o CREADOR —una personal no se puede leer así—.
// Lo puro (ordenar, el código de un enlace) está en src/lib/competencia.js.
//
// «Traer» baja el archivo de la publicación (imagen o video) desde el CDN de
// Instagram a la galería del cliente, carpeta «Competencia»: desde ahí se
// analiza como referencia, se extrae su guion o se recrea. La dirección del
// archivo se pide otra vez al traerlo (las del CDN caducan) y sólo se sigue
// si es del CDN de Meta. Un reel con música de la biblioteca de Instagram NO
// trae archivo (Meta lo omite): se puede traer su miniatura (`miniatura`).
//
// Un enlace compartido (`/reel/<código>/?igsh=…`) no dice de quién es, y la
// API no busca por enlace. El @ se busca así, y se para en el primero:
//   1. el que trae el enlace o el que escribió la persona;
//   2. la memoria (`instagram_enlaces`) y el feed de Inspiración guardado;
//   3. entre las últimas de las cuentas fijas del cliente (oficial);
//   4. la página pública de «insertar» de Instagram, SÓLO para el @;
//   5. si nada, se pregunta (409 `codigo: "usuario"`).
// Lo que se resuelve se recuerda. Nada de esto se ha probado contra Meta real.
// ============================================================

import { graph, descifrarMeta, mensajeMeta, ErrorMeta } from "./meta.js";
import { subirArchivo } from "./estudio/galeria.js";
import { carpetaCompetencia } from "./mercado.js";
import { usuarioInstagram } from "../../src/lib/auditoria.js";
import { publicacionesDeGraph, ordenarPorRendimiento, codigoDeInstagram, formatoDeMedia, usuarioDelEmbed } from "../../src/lib/competencia.js";
import { usuariosInstagram } from "../../src/lib/inspiracion.js";

const CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_EMBED = 800 * 1024;
const PLAZO_EMBED_MS = 6000;
export const CAMPOS_MEDIA = "id,caption,media_type,media_product_type,like_count,comments_count,timestamp,permalink,media_url,thumbnail_url";

export const MENSAJE_MUSICA = "Este reel usa música de Instagram y Meta no entrega su video. Puedes analizarlo sin el video (con su miniatura, el texto y las cifras) o guardarlo desde el teléfono y compartirlo a la app.";

/** Un fallo que se le dice a la persona, con su estado (y `codigo: "usuario"` si falta el @, «musica» si no hay archivo). */
export class ErrorCompetencia extends Error {
  constructor(mensaje, estado = 400, codigo = "") {
    super(mensaje);
    this.estado = estado;
    if (codigo) this.codigo = codigo;
  }
}

/** Desde qué cuenta se mira: la del cliente si tiene Instagram conectado; si no, cualquiera del espacio. */
export async function cuentaDesde(env, acceso, clienteId) {
  const cuentas = (await acceso.leer("cuentas_sociales", { red: "instagram" })).filter((c) => c.token_cifrado);
  const desde = cuentas.find((c) => c.client_id === clienteId) ?? cuentas[0];
  if (!desde) throw new ErrorCompetencia("Para ver el contenido de otra cuenta hace falta un Instagram conectado (Ajustes → Integraciones).", 409);
  return { token: await descifrarMeta(env, desde.token_cifrado), ig: desde.externo_id };
}

/** `business_discovery` de @usuario con un token ya leído (una llamada a Meta). */
export async function descubrirCon(env, { token, ig }, usuario, limite) {
  const u = usuarioInstagram(usuario);
  if (!u) throw new ErrorCompetencia("Escribe el @ de la cuenta de Instagram.", 400, "usuario");
  let r;
  try {
    r = await graph(env, token, `/${ig}`, {
      params: { fields: `business_discovery.username(${u}){username,name,profile_picture_url,followers_count,media_count,media.limit(${limite}){${CAMPOS_MEDIA}}}` },
    });
  } catch (e) {
    if (e instanceof ErrorMeta) throw new ErrorCompetencia(`Instagram no deja leer @${u}: sólo se puede con cuentas de empresa o de creador. (${mensajeMeta(e)})`, 409);
    throw e;
  }
  if (!r?.business_discovery) throw new ErrorCompetencia(`No encontré @${u}.`, 404);
  return r.business_discovery;
}

async function descubrir(env, acceso, clienteId, usuario, limite) {
  const u = usuarioInstagram(usuario);
  if (!u) throw new ErrorCompetencia("Escribe el @ de la cuenta de Instagram.", 400, "usuario");
  return descubrirCon(env, await cuentaDesde(env, acceso, clienteId), u, limite);
}

const proxy = (u) => (u ? `/api/metricas/miniatura?u=${encodeURIComponent(u)}` : "");

/** Las últimas publicaciones de @usuario, las que mejor funcionaron primero. → { perfil, publicaciones }. */
export async function contenidoDe(env, acceso, cliente, usuario) {
  const bd = await descubrir(env, acceso, cliente.id, usuario, 30);
  const publicaciones = ordenarPorRendimiento(publicacionesDeGraph(bd.media?.data ?? []), bd.followers_count)
    .map((p) => ({ ...p, miniatura: proxy(p.miniatura) }));
  return {
    perfil: {
      usuario: bd.username ?? usuarioInstagram(usuario), nombre: bd.name ?? "", seguidores: bd.followers_count ?? null,
      publicaciones: bd.media_count ?? null, foto: proxy(bd.profile_picture_url ?? ""),
    },
    publicaciones,
  };
}

/** Apunta que el código de un enlace es de @usuario: la próxima vez no se busca ni se pregunta. */
async function recordar(acceso, codigo, usuario) {
  if (!codigo || !usuario) return;
  await acceso.guardar("instagram_enlaces", { id: `${acceso.ownerId}:${codigo}`, codigo, usuario }).catch(() => {});
}

/** Baja de una dirección del CDN de Meta (con tope) y lo sube a la galería del cliente, carpeta «Competencia». */
async function bajarALaGaleria(env, acceso, cliente, url, nombre, tipoPorDefecto) {
  let host = "";
  try { host = new URL(url).hostname; } catch { /* sin dirección */ }
  if (!url || !CDN.test(host)) throw new ErrorCompetencia("Instagram no da el archivo de esa publicación.", 409);
  const res = await fetch(url);
  if (!res.ok) throw new ErrorCompetencia(`No se pudo bajar el archivo de Instagram (respondió ${res.status}).`, 502);
  const largo = Number(res.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES) throw new ErrorCompetencia("El video pesa más de 50 MB: descárgalo y súbelo a mano.", 413);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new ErrorCompetencia("El video pesa más de 50 MB: descárgalo y súbelo a mano.", 413);
  const tipo = res.headers.get("content-type") || tipoPorDefecto;
  const carpeta = await carpetaCompetencia(acceso, cliente.id);
  return subirArchivo(env, acceso, cliente, new File([bytes], nombre, { type: tipo }), { carpetaId: carpeta });
}

/**
 * El archivo de una publicación ya leída (`m`, de Graph) a la galería. Con `miniatura`, su miniatura (la de un reel con
 * música, que no trae video). Sin archivo de un video: 409 `codigo: "musica"`.
 */
export async function bajarPublicacion(env, acceso, cliente, usuario, m, { miniatura = false } = {}) {
  const video = formatoDeMedia(m) === "reel";
  if (miniatura) {
    const url = String((video ? m.thumbnail_url : m.media_url) || m.thumbnail_url || "");
    if (!url) throw new ErrorCompetencia("Instagram tampoco da la miniatura de esa publicación.", 409);
    return bajarALaGaleria(env, acceso, cliente, url, `${usuario}-${m.id}-miniatura.jpg`, "image/jpeg");
  }
  const url = String(m.media_url ?? "");
  if (!url && video) throw new ErrorCompetencia(MENSAJE_MUSICA, 409, "musica");
  if (!url) throw new ErrorCompetencia("Instagram no da el archivo de esa publicación.", 409);
  return bajarALaGaleria(env, acceso, cliente, url, `${usuario}-${m.id}.${video ? "mp4" : "jpg"}`, video ? "video/mp4" : "image/jpeg");
}

/**
 * Baja el archivo de una publicación (por su `id` o por el `codigo` de su enlace) a la galería del cliente, carpeta
 * «Competencia». `bd` es lo ya leído de esa cuenta (no se pide otra vez). → { archivo, publicacion, usuario }.
 */
export async function traerPublicacion(env, acceso, cliente, { usuario, id = "", codigo = "", miniatura = false, bd = null }) {
  const datos = bd ?? await descubrir(env, acceso, cliente.id, usuario, 50);
  const lista = datos.media?.data ?? [];
  const m = lista.find((x) => (id && String(x.id) === String(id)) || (codigo && String(x.permalink ?? "").includes(`/${codigo}`)));
  if (!m) {
    throw new ErrorCompetencia(codigo
      ? `No encontré esa publicación entre las últimas ${lista.length} de @${datos.username}. ¿Es de esa cuenta?`
      : "Esa publicación ya no está en la cuenta.", 404);
  }
  // Se recuerda en cuanto se encuentra: si el archivo no viene (música), la miniatura ya no busca la cuenta otra vez.
  await recordar(acceso, codigoDeInstagram(m.permalink)?.codigo ?? codigo, datos.username);
  const archivo = await bajarPublicacion(env, acceso, cliente, datos.username, m, { miniatura });
  return { archivo, publicacion: publicacionesDeGraph([m])[0], usuario: datos.username };
}

/** El @ que ya se sabe de un código: la memoria o el feed de Inspiración guardado. "" si no. */
async function usuarioConocido(acceso, codigo) {
  const mem = await acceso.leerUno("instagram_enlaces", { codigo }).catch(() => null);
  if (mem?.usuario) return mem.usuario;
  const feed = await acceso.leerUno("inspiracion_publicaciones", { codigo, red: "instagram" }).catch(() => null);
  return feed?.usuario ?? "";
}

/**
 * La página pública de «insertar» de esa publicación, sólo para leer su @. Con plazo y tope: si Instagram la bloquea o
 * cambia, "" y se pregunta. NO se ha probado contra Instagram real.
 */
export async function usuarioPorEmbed(codigo) {
  const abortar = new AbortController();
  const reloj = setTimeout(() => abortar.abort(), PLAZO_EMBED_MS);
  try {
    const res = await fetch(`https://www.instagram.com/p/${encodeURIComponent(codigo)}/embed/captioned/`, {
      signal: abortar.signal,
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; JuancitoAdsCalendario/1.0)" },
      redirect: "follow",
    });
    if (!res.ok || !/text\/html/i.test(res.headers.get("content-type") ?? "")) return "";
    const texto = await res.text();
    return usuarioDelEmbed(texto.slice(0, MAX_EMBED));
  } catch {
    return "";
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Un enlace de Instagram (lo compartido desde el teléfono) → su archivo en la galería. El @ sale por la escalera de
 * arriba; si no aparece, 409 `codigo: "usuario"` (la pantalla lo pregunta y la respuesta se recuerda).
 * → { archivo, publicacion, usuario, encontrado: "enlace" | "memoria" | "cuentas" | "pagina" }.
 */
export async function traerEnlace(env, acceso, cliente, { enlace, usuario = "", miniatura = false }) {
  const c = codigoDeInstagram(enlace);
  if (!c) throw new ErrorCompetencia("Ese no es el enlace de una publicación de Instagram.", 400);

  const dado = usuarioInstagram(usuario) || c.usuario;
  if (dado) return { ...(await traerPublicacion(env, acceso, cliente, { usuario: dado, codigo: c.codigo, miniatura })), encontrado: "enlace" };

  const conocido = await usuarioConocido(acceso, c.codigo);
  if (conocido) return { ...(await traerPublicacion(env, acceso, cliente, { usuario: conocido, codigo: c.codigo, miniatura })), encontrado: "memoria" };

  // Entre las cuentas fijas del cliente: una llamada por cuenta y la misma lectura sirve para bajarlo.
  const fijas = usuariosInstagram(leerLista(cliente.competidores));
  if (fijas.length) {
    const desde = await cuentaDesde(env, acceso, cliente.id);
    for (const u of fijas) {
      const bd = await descubrirCon(env, desde, u, 50).catch(() => null);
      if (bd && (bd.media?.data ?? []).some((x) => String(x.permalink ?? "").includes(`/${c.codigo}`))) {
        return { ...(await traerPublicacion(env, acceso, cliente, { usuario: u, codigo: c.codigo, miniatura, bd })), encontrado: "cuentas" };
      }
    }
  }

  const porPagina = await usuarioPorEmbed(c.codigo);
  if (porPagina) return { ...(await traerPublicacion(env, acceso, cliente, { usuario: porPagina, codigo: c.codigo, miniatura })), encontrado: "pagina" };

  throw new ErrorCompetencia("No pude saber de qué cuenta es ese enlace (no está entre las cuentas que sigue este cliente). Escribe su @ y lo recuerdo.", 409, "usuario");
}

function leerLista(texto) {
  if (Array.isArray(texto)) return texto;
  try { return JSON.parse(texto ?? "[]") ?? []; } catch { return []; }
}
