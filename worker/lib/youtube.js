// ============================================================
// YouTube: conectar el canal de cada cliente, subir videos y medir
//
// UNA CONEXIÓN POR CLIENTE, COMO TIKTOK
//
// Cada canal se conecta entrando con la cuenta de Google que lo tiene:
// «Conectar aquí» (si la agencia tiene ese acceso) o el enlace firmado
// que el cliente abre en SU teléfono. Se usa el mismo proyecto de Google
// que Drive (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET), con otros alcances
// y otra dirección de vuelta: /api/redes/youtube/callback.
//
// Si la cuenta tiene varios canales, Google suele preguntar cuál en su
// propia pantalla; si aun así llegan varios, se guardan todos SIN cliente
// y la agencia elige uno en Ajustes (`datos.elegirPara`).
//
// LA SUBIDA ES REANUDABLE Y VA POR TROZOS
//
//   1. Se abre una sesión de subida (`uploadType=resumable`) con el título,
//      la descripción y la privacidad. Google devuelve su dirección en
//      `Location`, y se GUARDA antes de mandar un solo byte.
//   2. Cada paso manda UN trozo de R2 (múltiplo de 256 KiB). Google
//      contesta 308 con el `Range` que ya tiene: eso manda, no la cuenta
//      propia. Tras un fallo se le PREGUNTA dónde iba (`bytes */total`).
//   3. El último trozo devuelve el video: su id se guarda lo primero.
//
// Una sesión que no terminó no crea ningún video, así que abrir otra no
// duplica nada. Lo que no se repite nunca es lo que va después del id.
//
// LO QUE GOOGLE IMPONE
//
//   · Un proyecto de Google Cloud SIN AUDITAR deja en PRIVADO todo video
//     subido por la API, pida la privacidad que pida (desde julio de 2020).
//     Se avisa en Ajustes y en la fila publicada si la privacidad no cuadra.
//   · La portada propia (`thumbnails.set`) exige un canal verificado.
//   · La subida gasta de un cupo diario del proyecto.
//
// NADA DE ESTO SE HA PROBADO CONTRA EL SERVICIO REAL: los tests usan un
// `fetch` de mentira que contesta como dice la documentación de Google.
// ============================================================

import { cifrarCon, descifrarCon, firmarCon, leerFirmado } from "./firmas.js";

const API = "https://www.googleapis.com";
const ANALYTICS = "https://youtubeanalytics.googleapis.com";
export const COOKIE_YOUTUBE = "__Host-youtube-oauth";
export const ALCANCES_YOUTUBE = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

/** Un trozo de subida: Google exige múltiplos de 256 KiB (salvo el último). 16 MiB son 64. */
export const TROZO_YOUTUBE = 64 * 256 * 1024;

/** Privacidades de YouTube, con su nombre en la pantalla. */
export const PRIVACIDADES_YOUTUBE = Object.freeze({ public: "Público", unlisted: "Oculto", private: "Privado" });

export const youtubeConfigurado = (env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export const urlVueltaYouTube = (origen) => `${origen}/api/redes/youtube/callback`;

const leerJSON = (t, d) => { try { return (typeof t === "object" && t) || JSON.parse(t) || d; } catch { return d; } };

/** La privacidad con la que sale un canal: la que eligió la agencia, o pública. */
export const privacidadDe = (cuenta) => {
  const p = leerJSON(cuenta?.datos, {})?.privacidad;
  return p in PRIVACIDADES_YOUTUBE ? p : "public";
};

/** Lo que la pantalla ve de una cuenta de YouTube además de lo común. */
export const extraCuentaYouTube = (c) => {
  const d = leerJSON(c?.datos, {});
  return { privacidad: privacidadDe(c), ...(d.elegirPara ? { elegirPara: d.elegirPara } : {}) };
};

export class ErrorYouTube extends Error {
  constructor({ estado = 0, razon = "", mensaje = "" } = {}) {
    super(mensaje || `YouTube respondió ${estado}`);
    this.name = "ErrorYouTube";
    this.estado = estado;
    this.razon = razon;
    this.transitorio = estado >= 500 || estado === 429 || estado === 0 || ["rateLimitExceeded", "userRateLimitExceeded", "backendError", "internalError"].includes(razon);
  }
}

/** Lo que se le enseña a la agencia, en español y con qué hacer. */
export function mensajeYouTube(e) {
  if (!(e instanceof ErrorYouTube)) return e?.message || "No se pudo completar la operación con YouTube.";
  const porRazon = {
    invalid_grant: "Google retiró el permiso de YouTube. Vuelve a conectar el canal en Ajustes → Integraciones.",
    youtubeSignupRequired: "Esa cuenta de Google no tiene canal de YouTube. Crea el canal y vuelve a conectarla.",
    quotaExceeded: "Se acabó el cupo diario de YouTube del proyecto de Google. Reinténtala mañana desde Programación.",
    uploadLimitExceeded: "YouTube no deja subir más videos a este canal por hoy. Reinténtala mañana desde Programación.",
    insufficientPermissions: "El canal no dio todos los permisos. Vuelve a conectarlo y acepta todo.",
    authError: "El permiso de YouTube caducó. Vuelve a conectar el canal en Ajustes → Integraciones.",
    invalidTitle: "YouTube no aceptó el título del video.",
    invalidDescription: "YouTube no aceptó la descripción del video.",
    invalidTags: "YouTube no aceptó las etiquetas (los hashtags) del video.",
    forbidden: "YouTube no dio permiso para esa operación.",
    portadaSinVerificar: "Para poner una portada propia, el canal tiene que estar verificado (youtube.com/verify).",
    rateLimitExceeded: "YouTube limitó las peticiones. Se reintentará en unos minutos.",
  };
  if (porRazon[e.razon]) return porRazon[e.razon];
  if (e.estado === 401) return porRazon.authError;
  return `YouTube respondió: ${e.message}`;
}

/** El error de una respuesta de Google, con su motivo (`errors[0].reason`). */
async function errorDe(res) {
  const d = await res.json().catch(() => ({}));
  const razon = typeof d?.error === "string" ? d.error : d?.error?.errors?.[0]?.reason ?? d?.error?.status ?? "";
  const mensaje = typeof d?.error === "string" ? d.error_description || d.error : d?.error?.message ?? "";
  return new ErrorYouTube({ estado: res.status, razon, mensaje });
}

async function llamar(url, init) {
  try {
    return await fetch(url, init);
  } catch (e) {
    throw new ErrorYouTube({ estado: 0, razon: "backendError", mensaje: `No se pudo contactar con YouTube (${e.message})` });
  }
}

/** Una llamada a la API con el token del canal. Devuelve el JSON. */
async function api(token, ruta, { metodo = "GET", query = {}, cuerpo, host = API } = {}) {
  const u = new URL(`${host}${ruta}`);
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  const res = await llamar(u, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, ...(cuerpo ? { "Content-Type": "application/json; charset=UTF-8" } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!res.ok) throw await errorDe(res);
  return res.status === 204 ? null : res.json();
}

// ------------------------------------------------------------
// OAuth
// ------------------------------------------------------------

// Con GOOGLE_CLIENT_SECRET, como Drive, pero con usos propios: un `state`
// de Drive no abre una vuelta de YouTube, ni al revés.
export const firmarEstadoYouTube = (env, datos) => firmarCon(env.GOOGLE_CLIENT_SECRET, "youtube-oauth-state", datos, 10 * 60_000);
export const leerEstadoYouTube = (env, estado) => leerFirmado(env.GOOGLE_CLIENT_SECRET, "youtube-oauth-state", estado);
/** El enlace que se le manda al cliente: firmado y de una semana. */
export const firmarEnlaceYouTube = (env, datos) => firmarCon(env.GOOGLE_CLIENT_SECRET, "youtube-enlace-cliente", datos, 7 * 24 * 3600_000);
export const leerEnlaceYouTube = (env, t) => leerFirmado(env.GOOGLE_CLIENT_SECRET, "youtube-enlace-cliente", t);

export function urlConsentimientoYouTube(env, origen, state) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", urlVueltaYouTube(origen));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", ALCANCES_YOUTUBE.join(" "));
  // offline + consent: sin los dos no llega el refresh token cuando la
  // cuenta ya había dado permiso antes. SIN `include_granted_scopes`: si
  // entra la cuenta de la agencia, el token no debe arrastrar su Drive.
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent select_account");
  u.searchParams.set("state", state);
  return u.toString();
}

async function pedirToken(env, parametros) {
  const res = await llamar("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...parametros }),
  });
  if (!res.ok) throw await errorDe(res);
  return res.json();
}

export async function canjearCodigoYouTube(env, origen, codigo) {
  const tokens = await pedirToken(env, { code: codigo, grant_type: "authorization_code", redirect_uri: urlVueltaYouTube(origen) });
  // Google deja desmarcar permisos uno a uno: sin subir, no sirve de nada.
  const dados = String(tokens.scope ?? "").split(/\s+/);
  if (tokens.scope && !dados.includes(ALCANCES_YOUTUBE[0])) {
    throw new ErrorYouTube({ estado: 403, razon: "insufficientPermissions", mensaje: "No se dio permiso para subir videos." });
  }
  if (!tokens.refresh_token) throw new ErrorYouTube({ estado: 400, razon: "invalid_grant", mensaje: "Google no devolvió el permiso de larga duración." });
  return tokens;
}

export async function revocarYouTube(token) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}

export const cifrarYouTube = (env, t) => cifrarCon(env.GOOGLE_CLIENT_SECRET, t);
export const descifrarYouTube = (env, t) => descifrarCon(env.GOOGLE_CLIENT_SECRET, t);

/** Los tokens de una respuesta de /token, listos para la fila de la cuenta. */
export async function filaDeTokensYouTube(env, tokens) {
  return {
    token_cifrado: await cifrarYouTube(env, tokens.access_token),
    ...(tokens.refresh_token ? { refresh_cifrado: await cifrarYouTube(env, tokens.refresh_token) } : {}),
    expira: new Date(Date.now() + Number(tokens.expires_in ?? 3600) * 1000).toJSON(),
  };
}

/**
 * El token de acceso de un canal (dura una hora), renovado si le quedan
 * menos de diez minutos. El de renovación no cambia: Google no lo rota.
 */
export async function tokenYouTube(env, acceso, cuenta) {
  if (!youtubeConfigurado(env)) throw new Error("Falta configurar Google en el servidor (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).");
  if (cuenta.expira && Date.parse(cuenta.expira) - Date.now() > 10 * 60_000) return descifrarYouTube(env, cuenta.token_cifrado);
  const tokens = await pedirToken(env, { grant_type: "refresh_token", refresh_token: await descifrarYouTube(env, cuenta.refresh_cifrado) });
  const fila = await filaDeTokensYouTube(env, tokens);
  await acceso.actualizar("cuentas_sociales", { id: cuenta.id }, { ...fila, updated_at: new Date().toJSON() });
  Object.assign(cuenta, fila);
  return tokens.access_token;
}

/** Los canales de la cuenta que dio permiso, con lo que hace falta para guardarlos y medirlos. */
export async function canalesYouTube(token) {
  const r = await api(token, "/youtube/v3/channels", { query: { part: "snippet,statistics,contentDetails", mine: "true", maxResults: 50 } });
  return r?.items ?? [];
}

// ------------------------------------------------------------
// Publicar
// ------------------------------------------------------------

/** El recurso del video que se crea: título, descripción, etiquetas y privacidad. */
export function recursoDeVideo({ titulo, descripcion, etiquetas = [], privacidad = "public" }) {
  return {
    snippet: { title: titulo, description: descripcion, ...(etiquetas.length ? { tags: etiquetas } : {}), categoryId: "22" },
    // Hecho para niños: no. Es una declaración obligatoria (COPPA) y la
    // agencia publica para marcas, no para público infantil.
    status: { privacyStatus: privacidad in PRIVACIDADES_YOUTUBE ? privacidad : "public", selfDeclaredMadeForKids: false },
  };
}

/** Sólo se sigue una sesión de subida si es de Google: lleva el token del canal. */
const esDeGoogle = (url) => {
  try { const u = new URL(url); return u.protocol === "https:" && /(^|\.)googleapis\.com$/.test(u.hostname); } catch { return false; }
};

/** Abre la subida reanudable y devuelve la dirección de la sesión. */
export async function abrirSubidaYouTube(token, { tamano, tipo, recurso }) {
  const res = await llamar(`${API}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(tamano),
      "X-Upload-Content-Type": tipo || "video/*",
    },
    body: JSON.stringify(recurso),
  });
  if (!res.ok) throw await errorDe(res);
  const sesion = res.headers.get("Location");
  if (!sesion || !esDeGoogle(sesion)) throw new ErrorYouTube({ estado: 502, razon: "backendError", mensaje: "YouTube no devolvió una sesión de subida válida." });
  return sesion;
}

/**
 * Lo que dice Google tras un trozo o una consulta:
 *   { hecho: true, video }     la subida terminó (200/201)
 *   { enviados }               308: los bytes que ya tiene (del `Range`)
 *   { caducada: true }         404/410: la sesión ya no existe
 */
async function leerRespuestaSubida(res) {
  if (res.status === 200 || res.status === 201) return { hecho: true, video: await res.json().catch(() => ({})) };
  if (res.status === 308) {
    const m = /bytes=(\d+)-(\d+)/.exec(res.headers.get("Range") ?? "");
    return { enviados: m ? Number(m[2]) + 1 : 0 };
  }
  if (res.status === 404 || res.status === 410) return { caducada: true };
  throw await errorDe(res);
}

/** Dónde va una subida interrumpida: se le pregunta a Google, que es quien lo sabe. */
export async function consultarSubidaYouTube(token, sesion, tamano) {
  if (!esDeGoogle(sesion)) throw new ErrorYouTube({ estado: 400, razon: "sesion", mensaje: "La sesión de subida no es de Google." });
  const res = await llamar(sesion, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Length": "0", "Content-Range": `bytes */${tamano}` },
  });
  return leerRespuestaSubida(res);
}

/**
 * Manda UN trozo desde `desde`: un rango de R2 que pasa tal cual, sin
 * cargarlo entero en memoria. El último trozo lleva lo que queda.
 */
export async function subirTrozoYouTube(env, token, { sesion, clave, desde, tamano, tipo }) {
  if (!esDeGoogle(sesion)) throw new ErrorYouTube({ estado: 400, razon: "sesion", mensaje: "La sesión de subida no es de Google." });
  const largo = Math.min(TROZO_YOUTUBE, tamano - desde);
  const objeto = await env.MEDIA.get(clave, { range: { offset: desde, length: largo } });
  if (!objeto) throw new Error("El video ya no está en el almacenamiento.");
  const res = await llamar(sesion, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": tipo || "video/*",
      "Content-Length": String(largo),
      "Content-Range": `bytes ${desde}-${desde + largo - 1}/${tamano}`,
    },
    body: objeto.body,
  });
  return leerRespuestaSubida(res);
}

/** Pone la portada (JPEG o PNG de hasta 2 MB) de R2. Exige un canal verificado. */
export async function ponerPortadaYouTube(env, token, videoId, clave) {
  const objeto = await env.MEDIA.get(clave);
  if (!objeto) throw new Error("La imagen de portada ya no está en el almacenamiento.");
  const tipo = objeto.httpMetadata?.contentType ?? "";
  if (!/^image\/(jpeg|png)$/.test(tipo)) throw new Error("La portada de YouTube tiene que ser JPEG o PNG.");
  if (objeto.size > 2 * 1024 * 1024) throw new Error("La portada de YouTube no puede pasar de 2 MB.");
  const res = await llamar(`${API}/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": tipo, "Content-Length": String(objeto.size) },
    body: objeto.body,
  });
  if (!res.ok) {
    const e = await errorDe(res);
    if (e.estado === 403) throw new ErrorYouTube({ estado: 403, razon: "portadaSinVerificar" });
    throw e;
  }
}

export const enlaceYouTube = (id, short = false) => (short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`);

// ------------------------------------------------------------
// Medir
// ------------------------------------------------------------

const num = (v) => (v !== undefined && v !== null && Number.isFinite(Number(v)) ? Number(v) : null);

/** «PT1M5S» → 65. */
export function segundosISO(duracion) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(duracion ?? ""));
  if (!m) return null;
  return (Number(m[1] ?? 0) * 86400) + (Number(m[2] ?? 0) * 3600) + (Number(m[3] ?? 0) * 60) + Number(m[4] ?? 0);
}

/**
 * Las cifras de UN día del canal (YouTube Analytics). Google tarda hasta
 * dos o tres días en cerrarlas: un día sin filas devuelve null (no se
 * sabe), no ceros (no hubo nada).
 */
export async function diaDelCanal(token, fecha) {
  const r = await api(token, "/v2/reports", {
    host: ANALYTICS,
    query: { ids: "channel==MINE", startDate: fecha, endDate: fecha, metrics: "views,likes,comments,shares,subscribersGained,subscribersLost" },
  });
  const fila = r?.rows?.[0];
  if (!fila) return null;
  const col = Object.fromEntries((r.columnHeaders ?? []).map((c, i) => [c.name, num(fila[i])]));
  return {
    vistas: col.views ?? null,
    interacciones: (col.likes ?? 0) + (col.comments ?? 0) + (col.shares ?? 0),
    ganados: col.subscribersGained ?? null,
    perdidos: col.subscribersLost ?? null,
  };
}

/**
 * Los videos recientes del canal con sus cifras. Por la lista de subidas
 * y no por `search`, que cuesta cien veces más cupo: dos llamadas.
 */
export async function videosRecientesYouTube(token, listaSubidas, desde, max = 18) {
  if (!listaSubidas) return [];
  const lista = await api(token, "/youtube/v3/playlistItems", { query: { part: "contentDetails", playlistId: listaSubidas, maxResults: 25 } });
  const ids = (lista?.items ?? [])
    .filter((i) => Date.parse(i.contentDetails?.videoPublishedAt ?? 0) >= desde)
    .map((i) => i.contentDetails?.videoId).filter(Boolean).slice(0, max);
  if (!ids.length) return [];
  const r = await api(token, "/youtube/v3/videos", { query: { part: "snippet,statistics,contentDetails", id: ids.join(","), maxResults: 50 } });
  return (r?.items ?? []).map((v) => {
    const meGusta = num(v.statistics?.likeCount) ?? 0;
    const comentarios = num(v.statistics?.commentCount) ?? 0;
    const segundos = segundosISO(v.contentDetails?.duration);
    // Un Short no se distingue por la API: se toma por uno lo que dura un
    // minuto o menos, o lo que lleva #Shorts.
    const short = (segundos !== null && segundos <= 60) || /#shorts\b/i.test(`${v.snippet?.title ?? ""} ${v.snippet?.description ?? ""}`);
    return {
      externo_id: String(v.id), tipo: short ? "short" : "video", enlace: enlaceYouTube(v.id, short),
      texto: String(v.snippet?.title ?? "").slice(0, 300),
      miniatura: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url ?? "",
      publicada_at: v.snippet?.publishedAt ? new Date(v.snippet.publishedAt).toJSON() : null,
      me_gusta: meGusta, comentarios, guardados: 0, compartidos: 0, alcance: 0, vistas: num(v.statistics?.viewCount) ?? 0,
      interacciones: meGusta + comentarios,
    };
  });
}
