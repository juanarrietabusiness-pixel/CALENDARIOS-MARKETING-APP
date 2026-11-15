// ============================================================
// Web Push: los avisos IMPORTANTES también en el teléfono
//
// La campana sólo la ve quien abre la aplicación (de 269 avisos en un mes, 267 sin leer). Lo que no puede esperar —una
// publicación que no salió, el cliente que pidió cambios o terminó su revisión, el Estudio que terminó o falló lo que se
// pidió, «es la hora» de lo que se publica a mano, un saldo que se acabó, el cerebro que necesita una decisión— llega
// además al teléfono de quien lo recibe, si en ese dispositivo pulsó «Recibir avisos en este dispositivo» (Ajustes →
// Salud y avisos). Lo manda `avisar()` (worker/lib/equipo.js) con una línea: `pushDeAvisos`, que nunca lanza.
//
// SIN LIBRERÍAS (WebCrypto):
//   · VAPID (RFC 8292): un par de llaves P-256 del servidor, creado SOLO la primera vez y guardado en R2 fuera de
//     `clientes/` (`firmas/push-vapid.json`, como el secreto de la vista: ni /api/media ni nada lo sirve). La pública va
//     al navegador (`applicationServerKey`) y en cada envío; la privada firma un JWT ES256 para el servicio de push.
//   · El cuerpo cifrado aes128gcm (RFC 8291): ECDH con la llave del navegador (`p256dh`) y su secreto (`auth`), HKDF y
//     AES-GCM, en UN registro de 4096 (el aviso cabe de sobra).
// Una suscripción que el servicio contesta 404/410 ya no existe (se desinstaló, se revocó el permiso): se BORRA.
// Sólo se manda a los servicios de push conocidos (Google, Mozilla, Apple, Microsoft): la dirección la manda el navegador.
// ============================================================

import { aBase64Url, deBase64Url } from "./firmas.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Dónde vive el par de llaves VAPID (en R2, fuera de `clientes/`). */
export const CLAVE_VAPID = "firmas/push-vapid.json";
/** Cuánto guarda el servicio de push un aviso que no pudo entregar (el teléfono apagado): un día. */
const TTL_S = 86_400;
/** El tamaño del registro aes128gcm. El aviso (unos cientos de bytes) cabe en uno. */
const REGISTRO = 4096;
/** Lo más que se manda por aviso (dispositivos). */
const MAX_DISPOSITIVOS = 10;

/** Los servicios de push que se aceptan (la dirección la manda el navegador: nada de mandar a cualquier sitio). */
const HOSTS_PUSH = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)$/i;

/** ¿Es una dirección de un servicio de push conocido? Pura. */
export function endpointValido(endpoint) {
  try {
    const u = new URL(String(endpoint ?? ""));
    return u.protocol === "https:" && HOSTS_PUSH.test(u.hostname) && String(endpoint).length <= 1000;
  } catch {
    return false;
  }
}

/** Las llaves del navegador, comprobadas: p256dh es un punto P-256 sin comprimir (65 bytes, 0x04…) y auth, 16 bytes. Pura. */
export function llavesValidas(keys) {
  try {
    const p = deBase64Url(String(keys?.p256dh ?? ""));
    const a = deBase64Url(String(keys?.auth ?? ""));
    return p.length === 65 && p[0] === 4 && a.length === 16;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// Qué avisos van al teléfono
// ------------------------------------------------------------

const IMPORTANTES = new Set(["fallo", "cambios", "encargo", "encargo-fallo", "render", "render-fallo", "a-mano", "campanas", "saldo", "salud", "limite"]);
/** ¿Este tipo de aviso va también al teléfono? Lo de poco valor (una aprobación suelta, una mención) se queda en la campana. Pura. */
export function esAvisoParaElTelefono(tipo) {
  const t = String(tipo ?? "");
  // El cliente terminó su revisión (`revision-cliente`, `revision-enviada`…) y lo que decide el cerebro (conflictos).
  return IMPORTANTES.has(t) || /^revision-/.test(t) || /cerebro|conflicto/.test(t);
}

const TITULOS = {
  fallo: "No se publicó", cambios: "El cliente pidió cambios", encargo: "Listo en el Estudio", "encargo-fallo": "No salió en el Estudio",
  render: "Listo el video", "render-fallo": "Falló el render", "a-mano": "Es la hora de publicar", campanas: "Ojo con las campañas",
  saldo: "Se acabó un saldo", salud: "Algo dejó de funcionar", limite: "Venció la fecha del cliente",
};
/** El título de la notificación según el tipo de aviso. Pura. */
export function tituloDeAviso(tipo) {
  const t = String(tipo ?? "");
  if (TITULOS[t]) return TITULOS[t];
  if (/^revision-/.test(t)) return "El cliente terminó su revisión";
  if (/cerebro|conflicto/.test(t)) return "El cerebro necesita tu decisión";
  return "Juancito Ads";
}

/** Sólo direcciones de esta aplicación («/cliente/…»): lo que abre la notificación nunca sale del sitio. Pura. */
export function enlaceSeguro(enlace) {
  const e = String(enlace ?? "");
  return e.startsWith("/") && !e.startsWith("//") && !e.includes("\\") ? e.slice(0, 500) : "/";
}

// ------------------------------------------------------------
// Las llaves VAPID
// ------------------------------------------------------------

const recordadas = new WeakMap();

async function leerTexto(obj) {
  if (!obj) return "";
  if (typeof obj.text === "function") return String(await obj.text());
  if (typeof obj.arrayBuffer === "function") return dec.decode(await obj.arrayBuffer());
  return "";
}

const parValido = (j) => typeof j?.publica === "string" && deBase64UrlSeguro(j.publica)?.length === 65 && typeof j?.privada?.d === "string";
function deBase64UrlSeguro(t) { try { return deBase64Url(t); } catch { return null; } }

/** Un par de llaves P-256 nuevo, como se guarda: { publica (b64url, 65 bytes), privada (JWK) }. */
export async function nuevoParVapid() {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const { kty, crv, d, x, y } = await crypto.subtle.exportKey("jwk", par.privateKey);
  const publica = aBase64Url(await crypto.subtle.exportKey("raw", par.publicKey));
  return { publica, privada: { kty, crv, d, x, y } };
}

/**
 * Las llaves VAPID del servidor: las de R2 o, la primera vez, unas nuevas que se guardan (si dos instancias las crean a
 * la vez, gana la que quede escrita: se relee). Se recuerdan por instancia y por bucket. Sin R2, null (no hay avisos al
 * teléfono). → { publica, firmar }.
 */
export function clavesVapid(env) {
  const media = env?.MEDIA;
  if (!media) return Promise.resolve(null);
  if (!recordadas.has(media)) {
    const p = (async () => {
      let par = null;
      try { par = JSON.parse(await leerTexto(await media.get(CLAVE_VAPID))); } catch { par = null; }
      if (!parValido(par)) {
        const nuevo = await nuevoParVapid();
        await media.put(CLAVE_VAPID, enc.encode(JSON.stringify(nuevo)), { httpMetadata: { contentType: "application/json" } });
        try { par = JSON.parse(await leerTexto(await media.get(CLAVE_VAPID))); } catch { par = null; }
        if (!parValido(par)) par = nuevo;
      }
      const privada = await crypto.subtle.importKey("jwk", { ...par.privada, ext: false }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
      return { publica: par.publica, privada };
    })();
    // Un fallo (R2 caído) no se queda recordado.
    p.catch(() => recordadas.delete(media));
    recordadas.set(media, p);
  }
  return recordadas.get(media);
}

/** Para los tests: olvida las llaves recordadas de un bucket. */
export const olvidarClavesVapid = (env) => env?.MEDIA && recordadas.delete(env.MEDIA);

/**
 * El JWT de VAPID para un servicio de push (RFC 8292): ES256, `aud` = su origen, caduca en 12 h (el máximo es 24) y `sub`
 * = el origen de la aplicación (Apple lo exige). → la cabecera Authorization entera.
 */
export async function autorizacionVapid(claves, audiencia, sujeto, ahoraS = Math.floor(Date.now() / 1000)) {
  const cabecera = aBase64Url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const cuerpo = aBase64Url(enc.encode(JSON.stringify({ aud: audiencia, exp: ahoraS + 12 * 3600, sub: sujeto })));
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, claves.privada, enc.encode(`${cabecera}.${cuerpo}`));
  return `vapid t=${cabecera}.${cuerpo}.${aBase64Url(firma)}, k=${claves.publica}`;
}

// ------------------------------------------------------------
// El cuerpo cifrado (RFC 8291, aes128gcm)
// ------------------------------------------------------------

const juntar = (...partes) => {
  const salida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of partes) { salida.set(p, i); i += p.length; }
  return salida;
};

async function hkdf(sal, ikm, info, bytes) {
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sal, info }, base, bytes * 8));
}

/**
 * Cifra `mensaje` (texto o bytes) para una suscripción ({ p256dh, auth } en base64url) → el cuerpo aes128gcm (cabecera +
 * un registro). `efimera` y `sal` sólo para los tests (el ejemplo del RFC 8291): si no, se crean al azar en cada envío.
 */
export async function cifrarParaPush({ p256dh, auth }, mensaje, { efimera = null, sal = null } = {}) {
  const uaPublica = deBase64Url(p256dh);
  const secretoAuth = deBase64Url(auth);
  const par = efimera ?? await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const uaClave = await crypto.subtle.importKey("raw", uaPublica, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaClave }, par.privateKey, 256));
  const ikm = await hkdf(secretoAuth, compartido, juntar(enc.encode("WebPush: info\0"), uaPublica, asPublica), 32);
  const salt = sal ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const claro = juntar(typeof mensaje === "string" ? enc.encode(mensaje) : new Uint8Array(mensaje), new Uint8Array([2]));
  if (claro.length + 16 > REGISTRO) throw new Error("El aviso no cabe en un registro de push.");
  const llave = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, llave, claro));
  const cabecera = new Uint8Array(16 + 4 + 1 + asPublica.length);
  cabecera.set(salt, 0);
  new DataView(cabecera.buffer).setUint32(16, REGISTRO);
  cabecera[20] = asPublica.length;
  cabecera.set(asPublica, 21);
  return juntar(cabecera, cifrado);
}

// ------------------------------------------------------------
// Mandar
// ------------------------------------------------------------

/** Lo que va dentro de la notificación (lo lee public/sw.js). Pura. */
export function cargaDeAviso({ tipo, texto, enlace }) {
  return {
    titulo: tituloDeAviso(tipo),
    texto: String(texto ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
    enlace: enlaceSeguro(enlace),
    etiqueta: String(tipo ?? "aviso").slice(0, 40),
  };
}

/**
 * Manda UNA notificación a una suscripción (fila de `push_suscripciones`). → { ok, estado } (estado 0: no hubo
 * respuesta). Nunca lanza.
 */
export async function enviarPush(env, sus, carga, { claves = null } = {}) {
  try {
    const k = claves ?? await clavesVapid(env);
    if (!k || !endpointValido(sus?.endpoint)) return { ok: false, estado: endpointValido(sus?.endpoint) ? 0 : 410 };
    const url = new URL(sus.endpoint);
    const sujeto = /^https:\/\//.test(String(sus.origen ?? "")) ? sus.origen : "https://calendario.juancitoads.com";
    const cuerpo = await cifrarParaPush(sus, JSON.stringify(carga));
    const res = await fetch(url.href, {
      method: "POST",
      headers: {
        Authorization: await autorizacionVapid(k, url.origin, sujeto),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(TTL_S),
        Urgency: "high",
      },
      body: cuerpo,
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, estado: res.status };
  } catch (e) {
    console.error("push: envío", e?.message ?? e);
    return { ok: false, estado: 0 };
  }
}

/**
 * Manda a los dispositivos de `para` (personas del espacio) un aviso que se acaba de guardar en la campana, si es de los
 * importantes. Borra las suscripciones que ya no existen. Nunca lanza. → cuántas notificaciones salieron.
 */
export async function pushDeAvisos(env, acceso, para, aviso) {
  try {
    if (!esAvisoParaElTelefono(aviso?.tipo) || !para?.length || !env?.MEDIA || typeof acceso?.leerVarios !== "function") return 0;
    const subs = await acceso.leerVarios("push_suscripciones", ["id", "user_id", "endpoint", "p256dh", "auth", "origen"], "user_id", para);
    if (!subs.length) return 0;
    return await enviarATodas(env, acceso, subs, cargaDeAviso(aviso));
  } catch (e) {
    console.error("push:", e?.message ?? e);
    return 0;
  }
}

/** Manda la misma carga a varias suscripciones (como mucho `MAX_DISPOSITIVOS`) y borra las que ya no existen. → cuántas salieron. */
export async function enviarATodas(env, acceso, subs, carga) {
  const claves = await clavesVapid(env);
  if (!claves) return 0;
  const lista = subs.slice(0, MAX_DISPOSITIVOS);
  const resultados = await Promise.all(lista.map(async (s) => ({ s, r: await enviarPush(env, s, carga, { claves }) })));
  const muertas = resultados.filter((x) => x.r.estado === 404 || x.r.estado === 410).map((x) => x.s.id);
  if (muertas.length) await acceso.borrarVarios("push_suscripciones", muertas).catch(() => 0);
  return resultados.filter((x) => x.r.ok).length;
}
