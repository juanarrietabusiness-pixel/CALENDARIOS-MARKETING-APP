// ============================================================
// TikTok por PostPeer (postpeer.dev)
//
// La app propia de TikTok nunca pasó la auditoría: en Sandbox todo caía
// en el BORRADOR del cliente (o salía en «solo yo»), y alguien tenía que
// entrar a publicarlo. PostPeer publica con SU app, ya auditada, así que
// el video sale público. La integración de TikTok de antes (OAuth propio,
// subida por trozos, carrusel de fotos por dominio verificado) se quitó.
//
// LA CUENTA
//
// Cada cliente conecta su TikTok en PostPeer: se le crea un perfil con su
// nombre (`/profiles`), PostPeer da la dirección del permiso
// (`/connect/tiktok`) y, ya autorizado, la cuenta sale en
// `/connect/integrations`. Su id (`accountId`) se guarda como una cuenta
// más de `cuentas_sociales` (red «tiktok», `externo_id` = accountId,
// `datos.via` = «postpeer», SIN token: la llave es una sola, del Worker).
// Así el resto de la aplicación —redes por defecto, «¿Qué sale y dónde?»,
// la cola— no tiene que saber nada de PostPeer.
//
// PUBLICAR
//
// La hora la sigue cumpliendo el cron, como en las demás redes: a su hora
// se manda con `publishNow`. No se usa `scheduledFor` de PostPeer a
// propósito: mover o cancelar en el calendario ya mueve o cancela la fila
// de la cola, y una publicación programada DENTRO de PostPeer habría que
// moverla o cancelarla también allí, o saldría igual.
//
// PostPeer DESCARGA el video —o las fotos: una, o un carrusel de hasta 32—
// de una dirección pública: la firmada de `/api/medio-publico/`, la misma
// que descarga Meta.
//
// Todo lo que se lee de PostPeer se lee con tolerancia (`datosDe`,
// `idDelPost`…): la documentación da los campos, no siempre el sobre en
// que llegan. Un campo que no llega no se inventa: se deja vacío.
// ============================================================

export const API_POSTPEER = "https://api.postpeer.dev/v1";

/** La privacidad que se pide: pública. La prueba es mirar el perfil. */
export const PRIVACIDAD_PUBLICA = "PUBLIC_TO_EVERYONE";

export const postpeerConfigurado = (env) => Boolean(env?.POSTPEER_API_KEY);

export class ErrorPostPeer extends Error {
  constructor(mensaje, estado = 0, { red = false } = {}) {
    super(mensaje || `PostPeer respondió ${estado}`);
    this.name = "ErrorPostPeer";
    this.estado = estado;
    // `red`: la petición no llegó a tener respuesta. Al CREAR una
    // publicación eso no es reintentable: no se sabe si PostPeer la recibió.
    this.sinRespuesta = red;
    this.transitorio = red || estado >= 500 || estado === 429;
  }
}

/** Lo que se le enseña a la agencia. */
export function mensajePostPeer(e) {
  if (!(e instanceof ErrorPostPeer)) return e?.message || "No se pudo completar la operación con PostPeer.";
  if (e.estado === 401 || e.estado === 403) return "PostPeer no aceptó la llave (POSTPEER_API_KEY). Revísala en Cloudflare.";
  if (e.estado === 402) return `PostPeer no tiene créditos para publicar: ${e.message}`;
  if (e.estado === 429) return "PostPeer limitó las peticiones. Se reintentará en unos minutos.";
  if (e.sinRespuesta) return e.message;
  return `PostPeer: ${e.message}`;
}

/** El motivo de un error de PostPeer, sea cual sea su forma. */
function motivoDe(datos, estado) {
  const e = datos?.error;
  if (typeof e === "string" && e) return datos?.message ? `${e}: ${datos.message}` : e;
  if (e && typeof e === "object") return e.message || e.code || JSON.stringify(e).slice(0, 300);
  if (datos?.message) return String(datos.message);
  return `respondió ${estado}`;
}

/** Una llamada a PostPeer. La llave va en la cabecera y en ningún otro sitio (ni en los errores). */
export async function postpeer(env, ruta, { metodo = "GET", cuerpo = null, params = null } = {}) {
  if (!postpeerConfigurado(env)) throw new ErrorPostPeer("Falta POSTPEER_API_KEY en el Worker.", 503);
  const u = new URL(`${API_POSTPEER}${ruta}`);
  for (const [k, v] of Object.entries(params ?? {})) if (v != null && v !== "") u.searchParams.set(k, String(v));
  let res;
  try {
    res = await fetch(u.toString(), {
      method: metodo,
      headers: {
        "x-access-key": env.POSTPEER_API_KEY,
        ...(cuerpo ? { "Content-Type": "application/json" } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (e) {
    throw new ErrorPostPeer(`No se pudo contactar con PostPeer (${e.message}).`, 0, { red: true });
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok || datos?.success === false) throw new ErrorPostPeer(motivoDe(datos, res.status), res.status || 500);
  return datos;
}

/** El contenido de una respuesta: dentro de `data` o suelto. */
export const datosDe = (r) => (r && typeof r === "object" && r.data && typeof r.data === "object" ? r.data : r ?? {});

// ------------------------------------------------------------
// La llave y las cuentas
// ------------------------------------------------------------

/** GET /health/auth: ¿vale la llave? */
export const comprobarLlave = (env) => postpeer(env, "/health/auth");

/** POST /profiles: un perfil por cliente, con su nombre. Devuelve su id. */
export async function crearPerfil(env, nombre) {
  const r = datosDe(await postpeer(env, "/profiles", { metodo: "POST", cuerpo: { name: String(nombre || "Cliente").slice(0, 100) } }));
  const id = r?.profile?.id ?? r?.id ?? "";
  if (!id) throw new ErrorPostPeer("PostPeer creó el perfil pero no devolvió su id.", 502);
  return String(id);
}

/** GET /connect/tiktok: la dirección donde se autoriza la cuenta. */
export async function urlConexionTikTok(env, profileId) {
  const r = datosDe(await postpeer(env, "/connect/tiktok", { params: { profileId } }));
  const url = r?.url ?? r?.authUrl ?? "";
  if (!/^https:\/\//.test(String(url))) throw new ErrorPostPeer("PostPeer no devolvió la dirección para conectar TikTok.", 502);
  return String(url);
}

/** Lo que se sabe de una integración, con los nombres que traiga. */
export function cuentaDeIntegracion(i = {}) {
  return {
    id: String(i.id ?? i.accountId ?? ""),
    plataforma: String(i.platform ?? i.provider ?? i.type ?? "").toLowerCase(),
    usuario: String(i.username ?? i.handle ?? i.platformUsername ?? "").replace(/^@/, ""),
    nombre: String(i.name ?? i.displayName ?? i.accountName ?? i.username ?? ""),
    avatar: String(i.avatar ?? i.avatarUrl ?? i.picture ?? i.profilePicture ?? ""),
  };
}

/** GET /connect/integrations: las cuentas de TikTok conectadas (de un perfil, si se da). */
export async function cuentasTikTok(env, profileId = null) {
  const r = datosDe(await postpeer(env, "/connect/integrations", { params: { profileId } }));
  const lista = Array.isArray(r) ? r : r?.integrations ?? [];
  return lista.map(cuentaDeIntegracion).filter((c) => c.id && (!c.plataforma || c.plataforma === "tiktok"));
}

/** GET /tiktok/creator-info: qué deja hacer la cuenta (privacidad, duración, comentarios…). */
export async function infoCreador(env, accountId) {
  const r = datosDe(await postpeer(env, "/tiktok/creator-info", { params: { accountId } }));
  const info = r?.creatorInfo ?? r?.creator ?? r;
  return {
    privacidades: Array.isArray(info?.privacyLevelOptions) ? info.privacyLevelOptions.map(String) : null,
    sinComentarios: Boolean(info?.commentDisabled),
    sinDuo: Boolean(info?.duetDisabled),
    sinStitch: Boolean(info?.stitchDisabled),
    maxSegundos: Number.isFinite(Number(info?.maxVideoPostDurationSec)) && info?.maxVideoPostDurationSec != null ? Number(info.maxVideoPostDurationSec) : null,
    usuario: String(info?.creatorUsername ?? info?.username ?? "").replace(/^@/, ""),
    nombre: String(info?.creatorNickname ?? info?.nickname ?? ""),
  };
}

// ------------------------------------------------------------
// Publicar
// ------------------------------------------------------------

/**
 * Lo que la cuenta no deja, ANTES de gastar un crédito: si no admite
 * publicar en público (una cuenta privada no lo ofrece) o si el video pasa
 * de lo que admite. Devuelve el motivo, o null. Pura.
 */
export function problemaConCreador(info, { segundos = null } = {}) {
  if (info?.privacidades && !info.privacidades.includes(PRIVACIDAD_PUBLICA)) {
    return `La cuenta de TikTok no deja publicar en público (admite: ${info.privacidades.join(", ") || "nada"}). ¿Es una cuenta privada? Cámbiala a pública en TikTok.`;
  }
  if (info?.maxSegundos && Number.isFinite(segundos) && segundos > info.maxSegundos) {
    return `El video dura ${Math.round(segundos)} s y esta cuenta de TikTok admite hasta ${info.maxSegundos} s.`;
  }
  return null;
}

/**
 * El cuerpo de POST /posts para un video a TikTok, publicado en el acto y
 * en público. Pura: es lo que se enseña antes de la prueba. Los
 * interruptores de comentarios, dúos y stitch siguen lo que la cuenta
 * tiene apagado (si el creador los apagó, no se pueden encender).
 */
export function cuerpoPublicacion({ texto, accountId, urlVideo, info = {} }) {
  return {
    content: String(texto ?? ""),
    platforms: [{
      platform: "tiktok",
      accountId: String(accountId),
      platformSpecificData: {
        privacyLevel: PRIVACIDAD_PUBLICA,
        disableComment: Boolean(info.sinComentarios),
        disableDuet: Boolean(info.sinDuo),
        disableStitch: Boolean(info.sinStitch),
        draft: false,
      },
    }],
    mediaItems: [{ type: "video", url: String(urlVideo) }],
    publishNow: true,
  };
}

/**
 * El cuerpo de POST /posts para FOTOS en TikTok (una, o de 2 a 32 en
 * carrusel), en el acto y en público. En fotos `content` es el TÍTULO (90
 * caracteres) y el texto entero va en `description` (4.000). La música la
 * pone TikTok (`autoAddMusic`) y la portada es la primera foto. PostPeer
 * descarga cada imagen, la pasa a JPEG y la aloja él. Pura.
 */
export function cuerpoFotos({ titulo, descripcion, accountId, urls = [], info = {} }) {
  return {
    content: String(titulo ?? ""),
    platforms: [{
      platform: "tiktok",
      accountId: String(accountId),
      platformSpecificData: {
        description: String(descripcion ?? ""),
        privacyLevel: PRIVACIDAD_PUBLICA,
        disableComment: Boolean(info.sinComentarios),
        autoAddMusic: true,
        photoCoverIndex: 0,
        draft: false,
      },
    }],
    mediaItems: urls.map((url) => ({ type: "image", url: String(url) })),
    publishNow: true,
  };
}

/** POST /posts. Devuelve la respuesta tal cual: el id y el estado se leen con `leerPublicacion`. */
export const crearPublicacion = (env, cuerpo) => postpeer(env, "/posts", { metodo: "POST", cuerpo });

/** GET /posts/{postId}. */
export const consultarPublicacion = (env, postId) => postpeer(env, `/posts/${encodeURIComponent(postId)}`);

const ESTADOS_HECHOS = new Set(["published", "success", "completed", "complete", "posted"]);
const ESTADOS_FALLIDOS = new Set(["failed", "error", "rejected", "cancelled", "canceled"]);

/**
 * Lo que dice una respuesta de PostPeer —la de crear, la de consultar o el
 * cuerpo de un webhook— sobre la publicación en TikTok. Pura.
 *
 *   { postId, estado: "publicada" | "fallida" | "en-curso", enlace, error, aviso, crudo }
 *
 * Manda lo de la PLATAFORMA (`platforms[]` de TikTok) sobre lo del post:
 * «partial» del post no dice nada si sólo va a una red.
 */
export function leerPublicacion(r) {
  const d = datosDe(r);
  const post = d?.post && typeof d.post === "object" ? d.post : d;
  const postId = String(post?.id ?? post?.postId ?? d?.postId ?? r?.postId ?? "") || null;
  const plataformas = [d?.platforms, post?.platforms, d?.results, post?.results].find(Array.isArray) ?? [];
  const tiktok = plataformas.find((p) => String(p?.platform ?? "").toLowerCase() === "tiktok") ?? plataformas[0] ?? null;
  const estadoPost = String(post?.status ?? d?.status ?? "").toLowerCase();
  const estadoRed = String(tiktok?.status ?? "").toLowerCase();
  const estado = estadoRed || estadoPost;
  const enlace = String(tiktok?.platformPostUrl ?? tiktok?.postUrl ?? tiktok?.url ?? post?.platformPostUrl ?? "");
  const error = String(tiktok?.errorMessage ?? post?.errorMessage ?? tiktok?.error ?? "") || null;
  const aviso = String(tiktok?.warningMessage ?? post?.warningMessage ?? "") || null;
  const privacidad = String(tiktok?.privacyLevel ?? tiktok?.platformSpecificData?.privacyLevel ?? "") || null;
  return {
    postId,
    estado: ESTADOS_HECHOS.has(estado) ? "publicada" : ESTADOS_FALLIDOS.has(estado) ? "fallida" : "en-curso",
    estadoPostPeer: estado || null,
    enlace: /^https:\/\//.test(enlace) ? enlace : "",
    error, aviso, privacidad,
  };
}

// ------------------------------------------------------------
// El webhook
// ------------------------------------------------------------

/** Cuánto puede estar desfasada la marca de tiempo de un aviso. */
export const DESFASE_MAX_MS = 5 * 60_000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** HMAC-SHA256 de «<timestamp>.<cuerpo crudo>», como lo firma PostPeer: «sha256=<hex>». */
export async function firmaWebhook(secreto, marca, crudo) {
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `sha256=${hex(await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(`${marca}.${crudo}`)))}`;
}

/** La marca de tiempo en milisegundos: PostPeer puede mandarla en segundos o en milisegundos. */
export function marcaEnMs(marca) {
  const n = Number(marca);
  if (!Number.isFinite(n) || n <= 0) {
    const t = Date.parse(String(marca ?? ""));
    return Number.isFinite(t) ? t : null;
  }
  return n < 1e12 ? n * 1000 : n;
}
