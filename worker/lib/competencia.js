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
// si es del CDN de Meta. Nada de esto se ha probado contra Meta real.
// ============================================================

import { graph, descifrarMeta, mensajeMeta, ErrorMeta } from "./meta.js";
import { subirArchivo } from "./estudio/galeria.js";
import { carpetaCompetencia } from "./mercado.js";
import { usuarioInstagram } from "../../src/lib/auditoria.js";
import { publicacionesDeGraph, ordenarPorRendimiento, codigoDeInstagram, formatoDeMedia } from "../../src/lib/competencia.js";

const CDN = /(^|\.)(cdninstagram\.com|fbcdn\.net)$/;
const MAX_BYTES = 50 * 1024 * 1024;
const CAMPOS_MEDIA = "id,caption,media_type,media_product_type,like_count,comments_count,timestamp,permalink,media_url,thumbnail_url";

/** Un fallo que se le dice a la persona, con su estado (y `codigo: "usuario"` si falta el @). */
export class ErrorCompetencia extends Error {
  constructor(mensaje, estado = 400, codigo = "") {
    super(mensaje);
    this.estado = estado;
    if (codigo) this.codigo = codigo;
  }
}

/** Desde qué cuenta se mira: la del cliente si tiene Instagram conectado; si no, cualquiera del espacio. */
async function cuentaDesde(env, acceso, clienteId) {
  const cuentas = (await acceso.leer("cuentas_sociales", { red: "instagram" })).filter((c) => c.token_cifrado);
  const desde = cuentas.find((c) => c.client_id === clienteId) ?? cuentas[0];
  if (!desde) throw new ErrorCompetencia("Para ver el contenido de otra cuenta hace falta un Instagram conectado (Ajustes → Integraciones).", 409);
  return { token: await descifrarMeta(env, desde.token_cifrado), ig: desde.externo_id };
}

async function descubrir(env, acceso, clienteId, usuario, limite) {
  const u = usuarioInstagram(usuario);
  if (!u) throw new ErrorCompetencia("Escribe el @ de la cuenta de Instagram.", 400, "usuario");
  const { token, ig } = await cuentaDesde(env, acceso, clienteId);
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

/**
 * Baja el archivo de una publicación (por su `id` o por el `codigo` de su enlace) a la galería del cliente, carpeta
 * «Competencia». → { archivo, publicacion, usuario }.
 */
export async function traerPublicacion(env, acceso, cliente, { usuario, id = "", codigo = "" }) {
  const bd = await descubrir(env, acceso, cliente.id, usuario, 50);
  const lista = bd.media?.data ?? [];
  const m = lista.find((x) => (id && String(x.id) === String(id)) || (codigo && String(x.permalink ?? "").includes(`/${codigo}`)));
  if (!m) {
    throw new ErrorCompetencia(codigo
      ? `No encontré esa publicación entre las últimas ${lista.length} de @${bd.username}. ¿Es de esa cuenta?`
      : "Esa publicación ya no está en la cuenta.", 404);
  }
  const url = String(m.media_url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* sin dirección */ }
  if (!url || !CDN.test(host)) throw new ErrorCompetencia("Instagram no da el archivo de esa publicación (pasa con algunos reels con música).", 409);
  const res = await fetch(url);
  if (!res.ok) throw new ErrorCompetencia(`No se pudo bajar el archivo de Instagram (respondió ${res.status}).`, 502);
  const largo = Number(res.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES) throw new ErrorCompetencia("El video pesa más de 50 MB: descárgalo y súbelo a mano.", 413);
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) throw new ErrorCompetencia("El video pesa más de 50 MB: descárgalo y súbelo a mano.", 413);
  const video = formatoDeMedia(m) === "reel";
  const tipo = res.headers.get("content-type") || (video ? "video/mp4" : "image/jpeg");
  const nombre = `${bd.username}-${m.id}.${video ? "mp4" : "jpg"}`;
  const carpeta = await carpetaCompetencia(acceso, cliente.id);
  const archivo = await subirArchivo(env, acceso, cliente, new File([bytes], nombre, { type: tipo }), { carpetaId: carpeta });
  return { archivo, publicacion: publicacionesDeGraph([m])[0], usuario: bd.username };
}

/**
 * Un enlace de Instagram (lo compartido desde el teléfono) → su archivo en la galería. El @ sale del enlace si lo trae;
 * si no, hay que darlo (409 `codigo: "usuario"`: la pantalla lo pregunta).
 */
export async function traerEnlace(env, acceso, cliente, { enlace, usuario = "" }) {
  const c = codigoDeInstagram(enlace);
  if (!c) throw new ErrorCompetencia("Ese no es el enlace de una publicación de Instagram.", 400);
  const u = usuarioInstagram(usuario) || c.usuario;
  if (!u) throw new ErrorCompetencia("¿De qué cuenta es? Escribe su @ (el enlace no lo dice).", 409, "usuario");
  return traerPublicacion(env, acceso, cliente, { usuario: u, codigo: c.codigo });
}
