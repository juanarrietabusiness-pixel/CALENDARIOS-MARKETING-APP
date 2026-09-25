// ============================================================
// La conexión con Google Drive
//
// QUIÉN ENTRA EN EL DRIVE
//
// La cuenta de Google de la AGENCIA, con OAuth, una sola vez. Cada
// cliente comparte su carpeta con esa cuenta y la aplicación la ve.
// No una «cuenta de servicio»: no tienen espacio propio y Google no les
// deja subir archivos a un Drive personal de Gmail.
//
// DOS TRAMPAS DE GOOGLE QUE ESTO ESQUIVA
//
//   · Con la app de Google «en prueba», el permiso caduca a los 7 días y
//     Drive se desconectaría solo cada semana. Tiene que estar «en
//     producción» (DEPLOY.md). Si aun así Google lo revoca, la conexión
//     se borra y la pantalla lo dice, en vez de fallar cada petición.
//   · El selector de archivos de Google (Picker) carga scripts de Google
//     en el navegador y rompería `connect-src 'self'`. Todo pasa por el
//     Worker, como el resto de APIs.
//
// LO QUE SE GUARDA
//
// El permiso de larga duración (refresh token), CIFRADO con AES-GCM y una
// clave derivada de GOOGLE_CLIENT_SECRET —que vive en Cloudflare, no en
// D1—. El `state` del OAuth va FIRMADO (HMAC) con el espacio dentro, y
// además atado a una cookie de la pestaña que lo pidió: sin la cookie,
// un enlace de conexión reenviado a otra persona conectaría SU Drive al
// espacio de quien lo generó.
// ============================================================

import { idDeCarpeta } from "../../src/lib/drive.js";
import { error } from "./respuesta.js";

export { idDeCarpeta };

export const ALCANCE_DRIVE = "https://www.googleapis.com/auth/drive";
export const COOKIE_OAUTH = "__Host-drive-oauth";
const API = "https://www.googleapis.com";
const VIDA_STATE_MS = 10 * 60_000;

export class DriveDesconectado extends Error {
  constructor(mensaje = "Google Drive no está conectado. Conéctalo en Ajustes → Integraciones.") {
    super(mensaje);
    this.name = "DriveDesconectado";
  }
}

export class ErrorDrive extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.name = "ErrorDrive";
    this.estado = estado;
  }
}

export const driveConfigurado = (env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

/** La dirección a la que Google devuelve: la MISMA que se registró en Google Cloud. */
export const urlRedireccion = (req) => `${new URL(req.url).origin}/api/drive/callback`;

// ------------------------------------------------------------
// Criptografía
// ------------------------------------------------------------

const enc = new TextEncoder();
const dec = new TextDecoder();

function aBase64Url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto) {
  const b = String(texto).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function claveDerivada(env, uso, algoritmo) {
  const base = await crypto.subtle.importKey("raw", enc.encode(env.GOOGLE_CLIENT_SECRET), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("calendarios-drive"), info: enc.encode(uso) },
    base,
    algoritmo,
    false,
    algoritmo.name === "HMAC" ? ["sign", "verify"] : ["encrypt", "decrypt"],
  );
}

export async function cifrar(env, texto) {
  const clave = await claveDerivada(env, "refresh-token", { name: "AES-GCM", length: 256 });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const datos = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, enc.encode(texto));
  return `${aBase64Url(iv)}.${aBase64Url(datos)}`;
}

export async function descifrar(env, cifrado) {
  const [iv, datos] = String(cifrado).split(".");
  const clave = await claveDerivada(env, "refresh-token", { name: "AES-GCM", length: 256 });
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deBase64Url(iv) }, clave, deBase64Url(datos));
  return dec.decode(claro);
}

/** El `state` del OAuth: quién lo pidió, para qué espacio, y hasta cuándo vale. */
export async function firmarEstado(env, { ownerId, userId, nonce }) {
  const cuerpo = aBase64Url(enc.encode(JSON.stringify({ o: ownerId, u: userId, n: nonce, e: Date.now() + VIDA_STATE_MS })));
  const clave = await claveDerivada(env, "oauth-state", { name: "HMAC", hash: "SHA-256", length: 256 });
  const firma = await crypto.subtle.sign("HMAC", clave, enc.encode(cuerpo));
  return `${cuerpo}.${aBase64Url(firma)}`;
}

/** Devuelve { ownerId, userId, nonce } o null si la firma no cuadra o caducó. */
export async function leerEstado(env, state) {
  const [cuerpo, firma] = String(state ?? "").split(".");
  if (!cuerpo || !firma) return null;
  try {
    const clave = await claveDerivada(env, "oauth-state", { name: "HMAC", hash: "SHA-256", length: 256 });
    if (!(await crypto.subtle.verify("HMAC", clave, deBase64Url(firma), enc.encode(cuerpo)))) return null;
    const d = JSON.parse(dec.decode(deBase64Url(cuerpo)));
    if (!d?.o || !d?.n || !(d.e > Date.now())) return null;
    return { ownerId: d.o, userId: d.u, nonce: d.n };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------
// OAuth
// ------------------------------------------------------------

export function urlConsentimiento(env, req, state) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", urlRedireccion(req));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", ALCANCE_DRIVE);
  // offline + consent: sin los dos, Google no devuelve refresh token
  // cuando la cuenta ya había autorizado antes.
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

async function pedirToken(env, parametros) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      ...parametros,
    }),
  });
  const datos = await res.json().catch(() => ({}));
  return { ok: res.ok, datos };
}

export async function canjearCodigo(env, req, codigo) {
  const { ok, datos } = await pedirToken(env, {
    code: codigo,
    grant_type: "authorization_code",
    redirect_uri: urlRedireccion(req),
  });
  if (!ok) throw new Error(datos?.error_description || datos?.error || "Google rechazó el código");
  return datos;
}

export async function revocar(token) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}

// Un token de acceso dura una hora: se guarda por espacio en la memoria
// de la instancia, y así una rejilla de 60 miniaturas no pide 60 tokens.
const tokens = new Map();

export function olvidarToken(ownerId) {
  tokens.delete(ownerId);
}

/** Un token de acceso vigente para el espacio. Lanza DriveDesconectado si no hay conexión. */
export async function tokenDeAcceso(env, acceso) {
  const guardado = tokens.get(acceso.ownerId);
  if (guardado && guardado.hasta > Date.now() + 60_000) return guardado.token;
  if (!driveConfigurado(env)) throw new DriveDesconectado("Falta configurar Google en el servidor (GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET).");

  const fila = await acceso.leerUno("integracion_drive", { id: acceso.ownerId });
  if (!fila) throw new DriveDesconectado();
  const refresh = await descifrar(env, fila.refresh_cifrado);
  const { ok, datos } = await pedirToken(env, { refresh_token: refresh, grant_type: "refresh_token" });
  if (!ok) {
    // invalid_grant: el permiso se revocó o caducó (la app «en prueba»
    // lo corta a los 7 días). Guardarlo sólo haría fallar todo igual.
    if (datos?.error === "invalid_grant") {
      await acceso.borrar("integracion_drive", { id: acceso.ownerId });
      throw new DriveDesconectado("Google retiró el permiso de Drive. Vuelve a conectarlo en Ajustes → Integraciones.");
    }
    throw new ErrorDrive(502, `Google no dio acceso a Drive: ${datos?.error_description || datos?.error || "sin motivo"}`);
  }
  tokens.set(acceso.ownerId, { token: datos.access_token, hasta: Date.now() + Number(datos.expires_in ?? 3600) * 1000 });
  return datos.access_token;
}

// ------------------------------------------------------------
// La API de Drive
// ------------------------------------------------------------

/** Todos los parámetros de Drive que hacen falta para ver unidades compartidas. */
const COMPARTIDAS = { supportsAllDrives: "true" };

/**
 * Llama a Drive con el token del espacio. `ruta` sin el dominio
 * («/drive/v3/files»). Devuelve la Response tal cual si `crudo`.
 */
export async function drive(env, acceso, ruta, { metodo = "GET", query = {}, cuerpo, cabeceras = {}, crudo = false } = {}) {
  const token = await tokenDeAcceso(env, acceso);
  const u = new URL(`${API}${ruta}`);
  for (const [k, v] of Object.entries({ ...COMPARTIDAS, ...query })) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  const res = await fetch(u, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(cuerpo && !(cuerpo instanceof ReadableStream) && typeof cuerpo === "object" && !(cuerpo instanceof ArrayBuffer) && !ArrayBuffer.isView(cuerpo)
        ? { "Content-Type": "application/json" }
        : {}),
      ...cabeceras,
    },
    body: cuerpo === undefined ? undefined
      : (cuerpo instanceof ReadableStream || cuerpo instanceof ArrayBuffer || ArrayBuffer.isView(cuerpo) || typeof cuerpo === "string")
        ? cuerpo
        : JSON.stringify(cuerpo),
  });
  if (crudo) return res;
  if (!res.ok) throw await errorDe(res);
  return res.status === 204 ? null : res.json();
}

export async function errorDe(res) {
  const texto = await res.text().catch(() => "");
  let motivo = "";
  try { motivo = JSON.parse(texto)?.error?.message ?? ""; } catch { /* no es JSON */ }
  console.error("drive:", res.status, texto.slice(0, 400));
  if (res.status === 404) return new ErrorDrive(404, "No se encontró en Drive. ¿La carpeta sigue compartida con la cuenta de la agencia?");
  if (res.status === 403) return new ErrorDrive(403, `Drive no da permiso: ${motivo || "la carpeta no está compartida con la cuenta de la agencia"}.`);
  if (res.status === 401) return new DriveDesconectado("El permiso de Drive caducó. Vuelve a conectarlo en Ajustes → Integraciones.");
  return new ErrorDrive(502, `Drive respondió ${res.status}${motivo ? `: ${motivo}` : ""}.`);
}

// ------------------------------------------------------------
// ¿Está dentro de la carpeta del cliente?
//
// Nada fuera de la carpeta del cliente: cada id que llega del navegador
// se comprueba subiendo por sus padres hasta la raíz del cliente. Sin
// eso, con la sesión de la agencia se leería cualquier archivo suyo.
// ------------------------------------------------------------

export function respuestaDeFallo(e) {
  if (e instanceof DriveDesconectado) return error(e.message, 409);
  if (e instanceof ErrorDrive) return error(e.message, e.estado);
  throw e;
}

// ------------------------------------------------------------
// ¿Está dentro de la carpeta del cliente?
// ------------------------------------------------------------

// Lo ya comprobado se recuerda diez minutos por instancia: una rejilla
// de miniaturas pediría si no la misma cadena de padres sesenta veces.
const verificados = new Map();
const PROFUNDIDAD_MAX = 12;

export const marcarVerificado = (ownerId, raiz, id) => verificados.set(`${ownerId}|${raiz}|${id}`, Date.now() + 10 * 60_000);
export const olvidarVerificado = (ownerId, raiz, id) => verificados.delete(`${ownerId}|${raiz}|${id}`);

export async function dentroDelCliente(env, acceso, raiz, id) {
  if (!raiz || !id) return false;
  if (id === raiz) return true;
  const clave = `${acceso.ownerId}|${raiz}|${id}`;
  const hasta = verificados.get(clave);
  if (hasta && hasta > Date.now()) return true;

  let actual = id;
  const camino = [];
  for (let i = 0; i < PROFUNDIDAD_MAX; i++) {
    const res = await drive(env, acceso, `/drive/v3/files/${encodeURIComponent(actual)}`, {
      query: { fields: "id,parents" }, crudo: true,
    });
    if (!res.ok) {
      if (res.status === 404) return false;
      throw await errorDe(res);
    }
    const f = await res.json();
    camino.push(actual);
    const padres = f.parents ?? [];
    if (padres.includes(raiz)) {
      const vence = Date.now() + 10 * 60_000;
      for (const c of camino) verificados.set(`${acceso.ownerId}|${raiz}|${c}`, vence);
      return true;
    }
    if (!padres.length) return false;
    actual = padres[0];
  }
  return false;
}

/**
 * Lo que el análisis de video necesita de un archivo de Drive: sus bytes
 * y su tipo, comprobando que sea del cliente. null si no lo es.
 */
export async function leerDeDrive(env, acceso, clienteId, fileId, { maxBytes }) {
  const cliente = await acceso.leerUno("clients", { id: clienteId });
  const raiz = idDeCarpeta(cliente?.drive_folder);
  if (!raiz || !(await dentroDelCliente(env, acceso, raiz, fileId))) return null;
  const meta = await drive(env, acceso, `/drive/v3/files/${encodeURIComponent(fileId)}`, { query: { fields: "name,mimeType,size" } });
  if (Number(meta.size ?? 0) > maxBytes) return { demasiado: Number(meta.size), nombre: meta.name, mime: meta.mimeType };
  const res = await drive(env, acceso, `/drive/v3/files/${encodeURIComponent(fileId)}`, { query: { alt: "media" }, crudo: true });
  if (!res.ok) throw await errorDe(res);
  return { bytes: await res.arrayBuffer(), nombre: meta.name, mime: meta.mimeType };
}
