// ============================================================
// TikTok: conectar la cuenta de cada cliente, subir y medir
//
// A DIFERENCIA DE META, UNA CONEXIÓN POR CLIENTE
//
// En Meta la agencia gestiona las páginas de todos desde su usuario. En
// TikTok no existe eso: cada cuenta se conecta entrando con ELLA. Por
// eso hay dos caminos: conectar aquí (si la agencia tiene el acceso del
// cliente) o mandarle al cliente un enlace firmado que abre el permiso
// de TikTok en SU teléfono y deja la cuenta asignada a su ficha.
//
// DOS FORMAS DE PUBLICAR
//
//   · Borrador (por defecto): el video llega a la bandeja de TikTok del
//     cliente y se publica desde la app con un toque. Funciona con la
//     app sin auditar.
//   · Directo: sale publicado. Hasta que TikTok audite la app, SÓLO en
//     privado («solo yo»): TikTok lo impone, no es un fallo de aquí.
//
// Los videos se SUBEN (FILE_UPLOAD) desde R2 en trozos: la otra forma,
// que TikTok los descargue de una URL, exige verificar el dominio.
//
// LAS FOTOS (carrusel de fotos) NO SE PUEDEN SUBIR: TikTok sólo las acepta
// por URL (PULL_FROM_URL) y de un dominio VERIFICADO en su portal, y
// workers.dev no se puede verificar. Por eso van por `TIKTOK_MEDIOS_BASE`
// (p. ej. https://juancitoads.com/calendario-medios), un dominio propio
// que reenvía a /api/medio-publico/ de este Worker —la misma dirección
// firmada que descarga Meta—. Sin esa variable, una publicación de fotos
// a TikTok falla diciendo qué falta.
//
// LOS TOKENS
//
// El de acceso dura 24 horas y el de renovación, un año. Los dos se
// guardan cifrados con una clave derivada de TIKTOK_CLIENT_SECRET, y el
// de acceso se renueva solo cuando le quedan menos de diez minutos.
// ============================================================

import { cifrarCon, descifrarCon, firmarCon, leerFirmado } from "./firmas.js";

const API = "https://open.tiktokapis.com";
export const COOKIE_TIKTOK = "__Host-tiktok-oauth";
export const PERMISOS_TIKTOK = ["user.info.basic", "user.info.profile", "user.info.stats", "video.list", "video.upload", "video.publish"];
const CAMPOS_USUARIO = "open_id,avatar_url,display_name,username,follower_count,following_count,likes_count,video_count";
const CAMPOS_VIDEO = "id,title,video_description,create_time,cover_image_url,share_url,duration,like_count,comment_count,share_count,view_count";

/** Un trozo de subida: TikTok pide de 5 a 64 MB; el último puede llegar a 128. */
export const TROZO = 20 * 1024 * 1024;
const UN_SOLO_TROZO = 64 * 1024 * 1024;

export const tiktokConfigurado = (env) => Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET);
export const urlVueltaTikTok = (origen) => `${origen}/api/redes/tiktok/callback`;

export class ErrorTikTok extends Error {
  constructor(error = {}, estado = 0) {
    super(error?.message || `TikTok respondió ${estado}`);
    this.name = "ErrorTikTok";
    this.codigo = String(error?.code ?? "");
    this.estado = estado;
    this.transitorio = estado >= 500 || estado === 429 || ["rate_limit_exceeded", "internal_error", "spam_risk_too_many_pending_share"].includes(this.codigo);
  }
}

/** Lo que se le enseña a la agencia, en español y con qué hacer. */
export function mensajeTikTok(e) {
  if (!(e instanceof ErrorTikTok)) return e?.message || "No se pudo completar la operación con TikTok.";
  const porCodigo = {
    access_token_invalid: "El permiso de TikTok caducó. Vuelve a conectar la cuenta en Ajustes → Integraciones.",
    scope_not_authorized: "La cuenta no dio todos los permisos. Vuelve a conectarla y acepta todo.",
    spam_risk_too_many_posts: "TikTok frenó las publicaciones de esta cuenta por hoy. Prueba mañana.",
    spam_risk_too_many_pending_share: "Hay demasiados videos esperando en la bandeja de TikTok del cliente: que publique o descarte alguno.",
    spam_risk_user_banned_from_posting: "TikTok no deja publicar a esta cuenta ahora mismo.",
    unaudited_client_can_only_post_to_private_accounts: "Hasta que TikTok revise la app, sólo se publica en privado. Usa el modo Borrador.",
    privacy_level_option_mismatch: "Esa privacidad no está permitida para esta cuenta.",
    url_ownership_unverified: "TikTok no reconoce el dominio de las fotos: hay que verificarlo en el portal de desarrolladores de TikTok (ver TIKTOK_MEDIOS_BASE en DEPLOY.md).",
    file_format_check_failed: "TikTok no aceptó el formato: las fotos tienen que ser JPG o WEBP.",
    picture_size_check_failed: "TikTok no aceptó el tamaño de alguna foto (máximo 1080 px de ancho recomendado, 20 MB).",
    rate_limit_exceeded: "TikTok limitó las peticiones. Se reintentará en unos minutos.",
  };
  return porCodigo[e.codigo] ?? `TikTok respondió: ${e.message}`;
}

async function api(ruta, { token, metodo = "POST", cuerpo = null, formulario = null } = {}) {
  let res;
  try {
    res = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        "Content-Type": formulario ? "application/x-www-form-urlencoded" : "application/json; charset=UTF-8",
      },
      body: formulario ? new URLSearchParams(formulario) : cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (e) {
    throw new ErrorTikTok({ code: "internal_error", message: `No se pudo contactar con TikTok (${e.message})` }, 0);
  }
  const datos = await res.json().catch(() => ({}));
  // El OAuth devuelve el error arriba; la API, dentro de `error` con code «ok» si fue bien.
  if (datos?.error && typeof datos.error === "string") throw new ErrorTikTok({ code: datos.error, message: datos.error_description || datos.error }, res.status);
  if (!res.ok || (datos?.error?.code && datos.error.code !== "ok")) throw new ErrorTikTok(datos?.error ?? {}, res.status);
  return datos;
}

// ------------------------------------------------------------
// OAuth
// ------------------------------------------------------------

export const firmarEstadoTikTok = (env, datos, vidaMs = 10 * 60_000) => firmarCon(env.TIKTOK_CLIENT_SECRET, "oauth-state", datos, vidaMs);
export const leerEstadoTikTok = (env, estado) => leerFirmado(env.TIKTOK_CLIENT_SECRET, "oauth-state", estado);
/** El enlace que se le manda al cliente: firmado y de una semana. */
export const firmarEnlaceTikTok = (env, datos) => firmarCon(env.TIKTOK_CLIENT_SECRET, "enlace-cliente", datos, 7 * 24 * 3600_000);
export const leerEnlaceTikTok = (env, t) => leerFirmado(env.TIKTOK_CLIENT_SECRET, "enlace-cliente", t);

export function urlConsentimientoTikTok(env, origen, state) {
  const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
  u.searchParams.set("client_key", env.TIKTOK_CLIENT_KEY);
  u.searchParams.set("scope", PERMISOS_TIKTOK.join(","));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", urlVueltaTikTok(origen));
  u.searchParams.set("state", state);
  return u.toString();
}

export async function canjearCodigoTikTok(env, origen, codigo) {
  return api("/v2/oauth/token/", {
    formulario: {
      client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code: codigo,
      grant_type: "authorization_code", redirect_uri: urlVueltaTikTok(origen),
    },
  });
}

export async function revocarTikTok(env, token) {
  return api("/v2/oauth/revoke/", { formulario: { client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, token } });
}

export const cifrarTikTok = (env, t) => cifrarCon(env.TIKTOK_CLIENT_SECRET, t);
const descifrarTikTok = (env, t) => descifrarCon(env.TIKTOK_CLIENT_SECRET, t);

const caducidad = (segundos) => new Date(Date.now() + Number(segundos ?? 0) * 1000).toJSON();

/** Guarda los tokens de una respuesta de /oauth/token/ en la fila de la cuenta. */
export async function filaDeTokens(env, tokens) {
  return {
    token_cifrado: await cifrarTikTok(env, tokens.access_token),
    refresh_cifrado: await cifrarTikTok(env, tokens.refresh_token),
    expira: caducidad(tokens.expires_in),
  };
}

/**
 * El token de acceso de una cuenta, renovado si le quedan menos de diez
 * minutos. La renovación se guarda: TikTok puede cambiar también el de
 * renovación, y perderlo obliga a reconectar.
 */
export async function tokenTikTok(env, acceso, cuenta) {
  if (!tiktokConfigurado(env)) throw new Error("Falta configurar TikTok en el servidor.");
  if (cuenta.expira && Date.parse(cuenta.expira) - Date.now() > 10 * 60_000) return descifrarTikTok(env, cuenta.token_cifrado);
  const tokens = await api("/v2/oauth/token/", {
    formulario: {
      client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET,
      grant_type: "refresh_token", refresh_token: await descifrarTikTok(env, cuenta.refresh_cifrado),
    },
  });
  const fila = await filaDeTokens(env, tokens);
  await acceso.actualizar("cuentas_sociales", { id: cuenta.id }, { ...fila, updated_at: new Date().toJSON() });
  Object.assign(cuenta, fila);
  return tokens.access_token;
}

export async function usuarioTikTok(token) {
  const r = await api(`/v2/user/info/?fields=${CAMPOS_USUARIO}`, { token, metodo: "GET" });
  return r?.data?.user ?? {};
}

export async function videosTikTok(token, max = 20) {
  const r = await api(`/v2/video/list/?fields=${CAMPOS_VIDEO}`, { token, cuerpo: { max_count: max } });
  return r?.data?.videos ?? [];
}

// ------------------------------------------------------------
// Publicar
// ------------------------------------------------------------

/** Cómo se trocea un video de `tamano` bytes, con las reglas de TikTok. */
export function trozosDe(tamano) {
  if (tamano <= UN_SOLO_TROZO) return { chunk_size: tamano, total_chunk_count: 1 };
  return { chunk_size: TROZO, total_chunk_count: Math.floor(tamano / TROZO) };
}

/**
 * Abre la subida: a la bandeja (borrador) o publicación directa. En
 * directo pregunta antes qué privacidades admite la cuenta: sin auditar,
 * sólo «solo yo».
 */
export async function iniciarSubida(token, { modo, tamano, titulo, portadaMs = null }) {
  const source_info = { source: "FILE_UPLOAD", video_size: tamano, ...trozosDe(tamano) };
  if (modo !== "directo") {
    const r = await api("/v2/post/publish/inbox/video/init/", { token, cuerpo: { source_info } });
    return { publishId: r.data.publish_id, uploadUrl: r.data.upload_url, privacidad: "borrador" };
  }
  const info = await api("/v2/post/publish/creator_info/query/", { token });
  const opciones = info?.data?.privacy_level_options ?? [];
  const privacidad = opciones.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : opciones[0] ?? "SELF_ONLY";
  const r = await api("/v2/post/publish/video/init/", {
    token,
    cuerpo: {
      post_info: {
        title: String(titulo ?? "").slice(0, 2200), privacy_level: privacidad, disable_duet: false, disable_comment: false, disable_stitch: false,
        // El fotograma elegido como portada en el panel. En borrador no
        // aplica: la portada la escoge el cliente al publicar desde su app.
        ...(Number.isFinite(portadaMs) && portadaMs >= 0 ? { video_cover_timestamp_ms: Math.round(portadaMs) } : {}),
      },
      source_info,
    },
  });
  return { publishId: r.data.publish_id, uploadUrl: r.data.upload_url, privacidad };
}

/**
 * Sube el video de R2 a TikTok, trozo a trozo, sin cargarlo entero en
 * memoria: cada trozo es un rango de R2 que pasa tal cual.
 */
export async function subirTrozos(env, clave, uploadUrl, tamano) {
  const { chunk_size, total_chunk_count } = trozosDe(tamano);
  for (let i = 0; i < total_chunk_count; i++) {
    const inicio = i * chunk_size;
    const fin = i === total_chunk_count - 1 ? tamano - 1 : inicio + chunk_size - 1;
    const objeto = await env.MEDIA.get(clave, { range: { offset: inicio, length: fin - inicio + 1 } });
    if (!objeto) throw new Error("El video ya no está en el almacenamiento.");
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": objeto.httpMetadata?.contentType || "video/mp4",
        "Content-Length": String(fin - inicio + 1),
        "Content-Range": `bytes ${inicio}-${fin}/${tamano}`,
      },
      body: objeto.body,
    });
    if (!res.ok && res.status !== 206 && res.status !== 201) {
      throw new ErrorTikTok({ code: res.status >= 500 ? "internal_error" : "upload_failed", message: `La subida del trozo ${i + 1} falló (${res.status}).` }, res.status);
    }
  }
}

/** Fotos que TikTok admite en una publicación, y en qué formato. */
export const MAX_FOTOS_TIKTOK = 35;
export const FORMATOS_FOTO_TIKTOK = /\.(jpe?g|webp)(\?|$)/i;

/** ¿Está el dominio verificado para que TikTok descargue fotos? */
export const fotosTikTokConfiguradas = (env) => Boolean(env?.TIKTOK_MEDIOS_BASE && env?.META_APP_SECRET);

/** La dirección del dominio verificado para una ruta firmada de /api/medio-publico/. */
export const urlFotoTikTok = (env, ruta) => `${String(env.TIKTOK_MEDIOS_BASE).replace(/\/$/, "")}/${ruta}`;

/** El cuerpo de /v2/post/publish/content/init/ para un carrusel de fotos. Pura. */
export function cuerpoFotos({ modo, privacidad = "SELF_ONLY", titulo = "", descripcion = "", urls = [], portada = 0 }) {
  const directo = modo === "directo";
  return {
    post_info: {
      title: String(titulo).slice(0, 90),
      description: String(descripcion).slice(0, 4000),
      ...(directo ? { privacy_level: privacidad, disable_comment: false, auto_add_music: true } : {}),
    },
    source_info: {
      source: "PULL_FROM_URL",
      photo_cover_index: Math.min(Math.max(0, portada | 0), Math.max(0, urls.length - 1)),
      photo_images: urls.slice(0, MAX_FOTOS_TIKTOK),
    },
    post_mode: directo ? "DIRECT_POST" : "MEDIA_UPLOAD",
    media_type: "PHOTO",
  };
}

/**
 * Publica (o deja en la bandeja) un carrusel de fotos. TikTok las DESCARGA
 * de `urls`; contesta con el `publish_id` y se sigue con `estadoSubida`.
 */
export async function iniciarFotos(token, { modo, titulo, descripcion, urls }) {
  let privacidad = "borrador";
  if (modo === "directo") {
    const info = await api("/v2/post/publish/creator_info/query/", { token });
    const opciones = info?.data?.privacy_level_options ?? [];
    privacidad = opciones.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : opciones[0] ?? "SELF_ONLY";
  }
  const r = await api("/v2/post/publish/content/init/", { token, cuerpo: cuerpoFotos({ modo, privacidad, titulo, descripcion, urls }) });
  return { publishId: r.data.publish_id, privacidad };
}

/** En qué va una subida. */
export async function estadoSubida(token, publishId) {
  const r = await api("/v2/post/publish/status/fetch/", { token, cuerpo: { publish_id: publishId } });
  return r?.data ?? {};
}
