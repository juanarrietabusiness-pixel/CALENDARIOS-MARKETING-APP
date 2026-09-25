// ============================================================
// Cifrar y firmar con el secreto de una integración
//
// Lo mismo que hace google.js para Drive, pero con la clave como
// parámetro: Meta cifra sus tokens con META_APP_SECRET y TikTok con el
// suyo. Cada uso deriva su propia clave (HKDF con `uso`), así que el
// mismo secreto nunca cifra y firma con la misma clave.
// ============================================================

const enc = new TextEncoder();
const dec = new TextDecoder();

export function aBase64Url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deBase64Url(texto) {
  const b = String(texto).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function clave(secreto, uso, algoritmo) {
  const base = await crypto.subtle.importKey("raw", enc.encode(String(secreto)), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("calendarios-integraciones"), info: enc.encode(uso) },
    base,
    algoritmo,
    false,
    algoritmo.name === "HMAC" ? ["sign", "verify"] : ["encrypt", "decrypt"],
  );
}

export async function cifrarCon(secreto, texto) {
  const k = await clave(secreto, "token", { name: "AES-GCM", length: 256 });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const datos = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, enc.encode(texto));
  return `${aBase64Url(iv)}.${aBase64Url(datos)}`;
}

export async function descifrarCon(secreto, cifrado) {
  const [iv, datos] = String(cifrado).split(".");
  const k = await clave(secreto, "token", { name: "AES-GCM", length: 256 });
  return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deBase64Url(iv) }, k, deBase64Url(datos)));
}

/** Un objeto firmado y con caducidad: «cuerpo.firma», en base64url. */
export async function firmarCon(secreto, uso, datos, vidaMs) {
  const cuerpo = aBase64Url(enc.encode(JSON.stringify({ ...datos, e: Date.now() + vidaMs })));
  const k = await clave(secreto, uso, { name: "HMAC", hash: "SHA-256", length: 256 });
  return `${cuerpo}.${aBase64Url(await crypto.subtle.sign("HMAC", k, enc.encode(cuerpo)))}`;
}

/** El objeto si la firma cuadra y no caducó; si no, null. */
export async function leerFirmado(secreto, uso, testigo) {
  const [cuerpo, firma] = String(testigo ?? "").split(".");
  if (!cuerpo || !firma) return null;
  try {
    const k = await clave(secreto, uso, { name: "HMAC", hash: "SHA-256", length: 256 });
    if (!(await crypto.subtle.verify("HMAC", k, deBase64Url(firma), enc.encode(cuerpo)))) return null;
    const d = JSON.parse(dec.decode(deBase64Url(cuerpo)));
    return d?.e > Date.now() ? d : null;
  } catch {
    return null;
  }
}
