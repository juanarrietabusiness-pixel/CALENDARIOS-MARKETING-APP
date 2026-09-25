// ============================================================
// Meta: Facebook e Instagram
//
// QUIÉN ENTRA
//
// La cuenta de Facebook de la agencia, con OAuth, una vez. Con eso se
// listan las páginas que gestiona —las suyas y las que los clientes le
// compartieron como socio— y la cuenta profesional de Instagram de cada
// una. Cada cuenta se asigna a un cliente en Ajustes → Integraciones.
//
// Con acceso ESTÁNDAR (sin revisión de Meta) basta mientras quienes
// publican tengan un rol en la app de Meta. Ver DEPLOY.md.
//
// LOS TOKENS
//
// El de la persona se cambia por uno de larga duración (60 días) y con
// él se piden los de cada página, que no caducan mientras nadie cambie
// la contraseña ni retire el permiso. Todos se guardan CIFRADOS con una
// clave derivada de META_APP_SECRET, que vive en Cloudflare y no en D1.
// ============================================================

import { cifrarCon, descifrarCon, firmarCon, leerFirmado } from "./firmas.js";

export const VERSION_GRAPH = "v23.0";
export const COOKIE_META = "__Host-meta-oauth";

/**
 * Lo que se pide al conectar. Publicar, leer métricas y comentar el
 * primer comentario; `business_management` para ver las páginas que
 * llegan por un portafolio comercial (el acceso de socio de un cliente).
 */
export const PERMISOS_META = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "read_insights",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "instagram_manage_comments",
];

export const metaConfigurado = (env) => Boolean(env.META_APP_ID && env.META_APP_SECRET);
const version = (env) => env.META_GRAPH_VERSION || VERSION_GRAPH;
export const urlGraph = (env) => `https://graph.facebook.com/${version(env)}`;
/** Los videos de Facebook se suben por su propio host. */
export const urlGraphVideo = (env) => `https://graph-video.facebook.com/${version(env)}`;
export const urlVueltaMeta = (req) => `${new URL(req.url).origin}/api/redes/meta/callback`;

export class ErrorMeta extends Error {
  constructor(error = {}, estado = 0) {
    super(error?.message || `Meta respondió ${estado}`);
    this.name = "ErrorMeta";
    this.estado = estado;
    this.codigo = Number(error?.code ?? 0);
    this.subcodigo = Number(error?.error_subcode ?? 0);
    this.titulo = error?.error_user_title || "";
    this.detalle = error?.error_user_msg || "";
    // Saturación, límites de uso o fallos de Meta: se reintenta. Lo demás
    // (permisos, formato) no se arregla solo.
    // Que Meta no pudiera DESCARGAR el medio también: suele ser un
    // tropiezo de red entre los dos lados.
    this.transitorio = Boolean(error?.is_transient) || [1, 2, 4, 17, 32, 341, 613, 9004].includes(this.codigo) ||
      [2207052, 2207003, 2207042].includes(this.subcodigo) || estado >= 500;
  }
}

/** Lo que se le enseña a la agencia, en español y con qué hacer. */
export function mensajeMeta(e) {
  if (!(e instanceof ErrorMeta)) return e?.message || "No se pudo completar la operación con Meta.";
  if (e.codigo === 190) return "El permiso de Meta caducó o se retiró. Vuelve a conectar Meta en Ajustes → Integraciones.";
  if (e.subcodigo === 2207042 || e.codigo === 9) return "Llegaste al límite de publicaciones por API de Instagram (50 cada 24 horas). Se reintentará más tarde.";
  if (e.codigo === 36003 || e.subcodigo === 2207009) return "Instagram no acepta la proporción de esta imagen: en el feed va de 4:5 (vertical) a 1.91:1 (horizontal).";
  if ([2207026, 2207001, 2207008].includes(e.subcodigo)) return "Instagram no acepta ese video: usa MP4 (H.264, audio AAC), de 3 a 90 segundos para reels.";
  if ([2207052, 2207003].includes(e.subcodigo) || e.codigo === 9004) return "Meta no pudo descargar la imagen o el video. Se reintentará en unos minutos.";
  if (e.codigo === 10 || (e.codigo >= 200 && e.codigo < 300)) {
    return `Meta no dio permiso: ${e.detalle || e.message}. Revisa que tu usuario tenga acceso a esta página y a su Instagram.`;
  }
  if (e.transitorio) return "Meta está saturado o limitó las peticiones. Se reintentará en unos minutos.";
  return `Meta respondió: ${e.detalle || e.message}`;
}

/**
 * Una llamada a la Graph API. GET lleva los parámetros en la dirección;
 * POST, en el cuerpo como formulario (lo que Graph espera). El token va
 * siempre como parámetro, nunca en la URL de un registro.
 */
export async function graph(env, token, ruta, { metodo = "GET", params = {}, host = null } = {}) {
  const u = new URL(`${host ?? urlGraph(env)}${ruta}`);
  const limpios = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  let body;
  if (metodo === "GET") {
    for (const [k, v] of Object.entries(limpios)) u.searchParams.set(k, String(v));
    if (token) u.searchParams.set("access_token", token);
  } else {
    body = new URLSearchParams({ ...Object.fromEntries(Object.entries(limpios).map(([k, v]) => [k, String(v)])), ...(token ? { access_token: token } : {}) });
  }
  let res;
  try {
    res = await fetch(u, { method: metodo, body });
  } catch (e) {
    throw new ErrorMeta({ message: `No se pudo contactar con Meta (${e.message})`, is_transient: true }, 0);
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok || datos?.error) throw new ErrorMeta(datos?.error ?? {}, res.status);
  return datos;
}

// ------------------------------------------------------------
// OAuth
// ------------------------------------------------------------

export async function firmarEstadoMeta(env, datos) {
  return firmarCon(env.META_APP_SECRET, "oauth-state", datos, 10 * 60_000);
}

export async function leerEstadoMeta(env, state) {
  return leerFirmado(env.META_APP_SECRET, "oauth-state", state);
}

export function urlConsentimientoMeta(env, req, state) {
  const u = new URL(`https://www.facebook.com/${version(env)}/dialog/oauth`);
  u.searchParams.set("client_id", env.META_APP_ID);
  u.searchParams.set("redirect_uri", urlVueltaMeta(req));
  u.searchParams.set("state", state);
  u.searchParams.set("response_type", "code");
  // Una app de tipo Empresa usa «Inicio de sesión con Facebook para
  // empresas», que pide los permisos por CONFIGURACIÓN (config_id) en vez
  // de por lista. Con la clásica, la lista.
  if (env.META_CONFIG_ID) u.searchParams.set("config_id", env.META_CONFIG_ID);
  else u.searchParams.set("scope", PERMISOS_META.join(","));
  return u.toString();
}

/** Código → token de larga duración (60 días) de la persona. */
export async function canjearCodigoMeta(env, req, codigo) {
  const corto = await graph(env, null, "/oauth/access_token", {
    params: { client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: urlVueltaMeta(req), code: codigo },
  });
  const largo = await graph(env, null, "/oauth/access_token", {
    params: {
      grant_type: "fb_exchange_token", client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET,
      fb_exchange_token: corto.access_token,
    },
  });
  return {
    token: largo.access_token,
    expira: largo.expires_in ? new Date(Date.now() + Number(largo.expires_in) * 1000).toISOString() : null,
  };
}

export const cifrarMeta = (env, texto) => cifrarCon(env.META_APP_SECRET, texto);
export const descifrarMeta = (env, cifrado) => descifrarCon(env.META_APP_SECRET, cifrado);

// ------------------------------------------------------------
// Las cuentas: páginas de Facebook y sus Instagram
// ------------------------------------------------------------

const CAMPOS_PAGINA = "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}";

/** Todas las páginas que la persona gestiona, página a página de resultados. */
export async function paginasDeMeta(env, tokenUsuario) {
  const salida = [];
  let datos = await graph(env, tokenUsuario, "/me/accounts", { params: { fields: CAMPOS_PAGINA, limit: 100 } });
  for (let vuelta = 0; vuelta < 10; vuelta++) {
    salida.push(...(datos?.data ?? []));
    const siguiente = datos?.paging?.next;
    if (!siguiente) break;
    const res = await fetch(siguiente);
    datos = await res.json();
    if (datos?.error) throw new ErrorMeta(datos.error, res.status);
  }
  return salida;
}

/**
 * Guarda (o actualiza) las cuentas que llegan de Meta, conservando a qué
 * cliente estaba asignada cada una. Devuelve cuántas hay.
 */
export async function sincronizarCuentasMeta(env, acceso, tokenUsuario) {
  const paginas = await paginasDeMeta(env, tokenUsuario);
  const ahora = new Date().toISOString();
  let total = 0;
  for (const p of paginas) {
    const tokenPagina = await cifrarMeta(env, p.access_token);
    const filas = [{
      red: "facebook", externo_id: p.id, nombre: p.name, usuario: "", avatar: p.picture?.data?.url ?? "", pagina_id: p.id,
    }];
    const ig = p.instagram_business_account;
    if (ig?.id) {
      filas.push({
        red: "instagram", externo_id: ig.id, nombre: ig.name || p.name, usuario: ig.username ?? "",
        avatar: ig.profile_picture_url ?? "", pagina_id: p.id,
      });
    }
    for (const f of filas) {
      const id = `${acceso.ownerId}:${f.red}:${f.externo_id}`;
      const previa = await acceso.leerUno("cuentas_sociales", { id });
      await acceso.guardar("cuentas_sociales", {
        id, ...f,
        token_cifrado: tokenPagina,
        client_id: previa?.client_id ?? null,
        datos: previa?.datos ?? "{}",
        created_at: previa?.created_at ?? ahora,
        updated_at: ahora,
      });
      total += 1;
    }
  }
  return total;
}

// ------------------------------------------------------------
// Medios públicos: lo que Meta descarga al publicar
// ------------------------------------------------------------

/**
 * Meta no sube archivos: los DESCARGA de una dirección pública. Los medios
 * viven en R2 detrás de la sesión, así que se firma una dirección que
 * sólo abre ESE archivo y caduca en tres días.
 */
export async function urlMedioPublico(env, origen, src) {
  const clave = String(src ?? "").replace(/^\/api\/media\//, "");
  if (!/^clientes\/[^/]+\//.test(clave) || clave.includes("..")) throw new Error(`Medio no válido: ${src}`);
  const testigo = await firmarCon(env.META_APP_SECRET, "medio-publico", { c: clave }, 3 * 24 * 3600_000);
  const nombre = clave.split("/").pop();
  return `${origen}/api/medio-publico/${testigo}/${encodeURIComponent(nombre)}`;
}

/** La clave de R2 de una dirección firmada, o null si no vale o caducó. */
export async function claveDeMedioPublico(env, testigo) {
  if (!env.META_APP_SECRET) return null;
  const d = await leerFirmado(env.META_APP_SECRET, "medio-publico", testigo);
  return typeof d?.c === "string" ? d.c : null;
}
