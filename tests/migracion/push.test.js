import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { avisar } from "../../worker/lib/equipo.js";
import { aBase64Url, deBase64Url } from "../../worker/lib/firmas.js";
import {
  cifrarParaPush, autorizacionVapid, clavesVapid, olvidarClavesVapid, esAvisoParaElTelefono, endpointValido, llavesValidas,
  enlaceSeguro, CLAVE_VAPID,
} from "../../worker/lib/push.js";

// ============================================================
// Los avisos en el teléfono (Web Push, worker/lib/push.js)
//
// El cifrado (RFC 8291) se comprueba con el EJEMPLO del propio RFC y descifrando como lo haría el navegador; la firma
// VAPID (RFC 8292), verificándola con la llave pública. El envío habla con un `fetch` de mentira: nada de esto se ha
// probado contra los servicios de push de Google, Mozilla o Apple.
// ============================================================

const enc = new TextEncoder();
const dec = new TextDecoder();

/** El ejemplo del apéndice A del RFC 8291. */
const RFC = {
  claro: "When I grow up, I want to be a watermelon",
  asPublica: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivada: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublica: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivada: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  sal: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  cuerpo: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

async function parDesde(publica, privada) {
  const p = deBase64Url(publica);
  const jwk = { kty: "EC", crv: "P-256", d: privada, x: aBase64Url(p.slice(1, 33)), y: aBase64Url(p.slice(33, 65)) };
  return {
    privateKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]),
    publicKey: await crypto.subtle.importKey("raw", p, { name: "ECDH", namedCurve: "P-256" }, true, []),
  };
}

async function hkdf(sal, ikm, info, bytes) {
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sal, info }, base, bytes * 8));
}
const juntar = (...partes) => { const s = new Uint8Array(partes.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of partes) { s.set(p, i); i += p.length; } return s; };

/** Descifra como lo haría el navegador (el receptor), con SU llave privada. */
async function descifrar(cuerpo, uaPrivada, uaPublicaB64, authB64) {
  const salt = cuerpo.slice(0, 16);
  const largo = cuerpo[20];
  const asPublica = cuerpo.slice(21, 21 + largo);
  const cifrado = cuerpo.slice(21 + largo);
  const uaPublica = deBase64Url(uaPublicaB64);
  const asClave = await crypto.subtle.importKey("raw", asPublica, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asClave }, uaPrivada, 256));
  const ikm = await hkdf(deBase64Url(authB64), compartido, juntar(enc.encode("WebPush: info\0"), uaPublica, asPublica), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const llave = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const claro = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, llave, cifrado));
  expect(claro[claro.length - 1]).toBe(2);
  return dec.decode(claro.slice(0, -1));
}

describe("el cifrado del cuerpo (RFC 8291, aes128gcm)", () => {
  it("da EXACTAMENTE el ejemplo del RFC con su llave efímera y su sal", async () => {
    const efimera = await parDesde(RFC.asPublica, RFC.asPrivada);
    const cuerpo = await cifrarParaPush({ p256dh: RFC.uaPublica, auth: RFC.auth }, RFC.claro, { efimera, sal: deBase64Url(RFC.sal) });
    expect(aBase64Url(cuerpo)).toBe(RFC.cuerpo);
  });

  it("lo que cifra lo descifra el receptor con su llave (y la sal y la llave efímera cambian cada vez)", async () => {
    const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const p256dh = aBase64Url(await crypto.subtle.exportKey("raw", ua.publicKey));
    const auth = aBase64Url(crypto.getRandomValues(new Uint8Array(16)));
    const texto = JSON.stringify({ titulo: "No se publicó", texto: "«Promo de octubre» no se publicó en instagram: ñandú." });
    const a = await cifrarParaPush({ p256dh, auth }, texto);
    const b = await cifrarParaPush({ p256dh, auth }, texto);
    expect(aBase64Url(a)).not.toBe(aBase64Url(b));
    expect(await descifrar(a, ua.privateKey, p256dh, auth)).toBe(texto);
    expect(new DataView(a.buffer).getUint32(16)).toBe(4096);
  });
});

describe("la firma VAPID (RFC 8292)", () => {
  it("es un JWT ES256 para el origen del servicio, que caduca en menos de 24 h, y se verifica con la llave pública", async () => {
    const media = r2();
    const claves = await clavesVapid({ MEDIA: media });
    const cabecera = await autorizacionVapid(claves, "https://fcm.googleapis.com", "https://calendario.test", 1_800_000_000);
    const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(cabecera);
    expect(k).toBe(claves.publica);
    const [h, c, f] = t.split(".");
    expect(JSON.parse(dec.decode(deBase64Url(h)))).toEqual({ typ: "JWT", alg: "ES256" });
    const cuerpo = JSON.parse(dec.decode(deBase64Url(c)));
    expect(cuerpo).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_800_000_000 + 12 * 3600, sub: "https://calendario.test" });
    const publica = await crypto.subtle.importKey("raw", deBase64Url(claves.publica), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, publica, deBase64Url(f), enc.encode(`${h}.${c}`))).toBe(true);
  });

  it("las llaves se crean UNA vez y se guardan en R2 fuera de clientes/; otra instancia lee las mismas", async () => {
    const media = r2();
    const una = await clavesVapid({ MEDIA: media });
    expect(media.objetos.has(CLAVE_VAPID)).toBe(true);
    expect(CLAVE_VAPID.startsWith("clientes/")).toBe(false);
    olvidarClavesVapid({ MEDIA: media });
    const otra = await clavesVapid({ MEDIA: media });
    expect(otra.publica).toBe(una.publica);
    expect(await clavesVapid({})).toBeNull();
  });
});

describe("qué va al teléfono y adónde", () => {
  it("sólo lo importante", () => {
    for (const t of ["fallo", "cambios", "encargo", "encargo-fallo", "render-fallo", "a-mano", "saldo", "salud", "limite", "revision-cliente", "cerebro-conflicto"]) {
      expect(esAvisoParaElTelefono(t), t).toBe(true);
    }
    for (const t of ["aprobada", "mencion", "nota", "tarea", "publicacion", "inspiracion", "", undefined]) expect(esAvisoParaElTelefono(t), String(t)).toBe(false);
  });

  it("sólo a servicios de push conocidos, con llaves de verdad, y el enlace nunca sale del sitio", () => {
    expect(endpointValido("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(endpointValido("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(endpointValido("https://web.push.apple.com/QGh")).toBe(true);
    expect(endpointValido("https://db5p.notify.windows.com/w/?token=x")).toBe(true);
    expect(endpointValido("https://evil.example.com/fcm.googleapis.com")).toBe(false);
    expect(endpointValido("http://fcm.googleapis.com/x")).toBe(false);
    expect(llavesValidas({ p256dh: RFC.uaPublica, auth: RFC.auth })).toBe(true);
    expect(llavesValidas({ p256dh: RFC.auth, auth: RFC.auth })).toBe(false);
    expect(enlaceSeguro("/cliente/c1/cal")).toBe("/cliente/c1/cal");
    expect(enlaceSeguro("//evil.com")).toBe("/");
    expect(enlaceSeguro("https://evil.com")).toBe("/");
  });
});

// ------------------------------------------------------------
// Las rutas y el envío desde avisar()
// ------------------------------------------------------------

const JEFE = "u-jefe";
const ANA = "u-ana";
const LECTORA = "u-lee";
const TESTIGO = { [JEFE]: "t-jefe", [ANA]: "t-ana", [LECTORA]: "t-lee" };
let db;
let env;

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) { const o = objetos.get(clave); return o ? { text: async () => dec.decode(o), arrayBuffer: async () => o.buffer } : null; },
    async put(clave, valor) { objetos.set(clave, valor instanceof Uint8Array ? valor : enc.encode(String(valor))); },
    async delete(clave) { objetos.delete(clave); },
  };
}

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [ANA, "ana@a.com"], [LECTORA, "lee@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(ANA, JEFE, "editor", "Ana", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura) values (?,?,?,?,?,?)").run(LECTORA, JEFE, "editor", "Lee", "#1E90FF", 1);
}

const pedir = (quien, ruta, opciones = {}) => worker.fetch(new Request(`https://calendario.test/api${ruta}`, {
  ...opciones,
  headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env);

async function suscripcion(n = 1) {
  const ua = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return {
    ua,
    cuerpo: {
      endpoint: `https://fcm.googleapis.com/fcm/send/disp-${n}`,
      keys: { p256dh: aBase64Url(await crypto.subtle.exportKey("raw", ua.publicKey)), auth: aBase64Url(crypto.getRandomValues(new Uint8Array(16))) },
      dispositivo: "Android · Chrome",
    },
  };
}

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("/api/avisos/push", () => {
  it("da la llave pública, guarda el dispositivo de QUIEN pregunta (también con sólo lectura) y lo quita", async () => {
    const r = await pedir(ANA, "/avisos/push");
    expect(r.status).toBe(200);
    const { clave, dispositivos } = await r.json();
    expect(deBase64Url(clave).length).toBe(65);
    expect(dispositivos).toEqual([]);

    const { cuerpo } = await suscripcion();
    expect((await pedir(ANA, "/avisos/push", { method: "POST", body: cuerpo })).status).toBe(200);
    // Dos veces la misma dirección es la misma fila.
    expect((await pedir(ANA, "/avisos/push", { method: "POST", body: cuerpo })).status).toBe(200);
    expect(db.sqlite.prepare("select user_id, dispositivo, origen from push_suscripciones").all())
      .toEqual([{ user_id: ANA, dispositivo: "Android · Chrome", origen: "https://calendario.test" }]);
    expect((await (await pedir(ANA, "/avisos/push")).json()).dispositivos).toHaveLength(1);
    expect((await (await pedir(JEFE, "/avisos/push")).json()).dispositivos).toHaveLength(0);

    const lectora = await suscripcion(2);
    expect((await pedir(LECTORA, "/avisos/push", { method: "POST", body: lectora.cuerpo })).status).toBe(200);

    expect((await pedir(ANA, "/avisos/push/quitar", { method: "POST", body: { endpoint: cuerpo.endpoint } })).status).toBe(200);
    expect(db.sqlite.prepare("select user_id from push_suscripciones").all()).toEqual([{ user_id: LECTORA }]);
  });

  it("rechaza un servicio desconocido o una suscripción sin sus llaves", async () => {
    const { cuerpo } = await suscripcion();
    expect((await pedir(ANA, "/avisos/push", { method: "POST", body: { ...cuerpo, endpoint: "https://evil.example.com/x" } })).status).toBe(400);
    expect((await pedir(ANA, "/avisos/push", { method: "POST", body: { ...cuerpo, keys: { p256dh: "x", auth: "y" } } })).status).toBe(400);
    expect(db.sqlite.prepare("select count(*) n from push_suscripciones").get().n).toBe(0);
  });

  it("el aviso de prueba llega cifrado al servicio de push, con su VAPID", async () => {
    const { cuerpo, ua } = await suscripcion();
    await pedir(ANA, "/avisos/push", { method: "POST", body: cuerpo });
    const llamadas = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => { llamadas.push({ url, init }); return new Response(null, { status: 201 }); }));
    const r = await pedir(ANA, "/avisos/push/prueba", { method: "POST", body: {} });
    expect(await r.json()).toEqual({ enviados: 1, quitados: 0, fallidos: 0 });
    expect(llamadas).toHaveLength(1);
    const { url, init } = llamadas[0];
    expect(url).toBe(cuerpo.endpoint);
    expect(init.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(init.headers.TTL).toBe("86400");
    expect(init.headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    const carga = JSON.parse(await descifrar(init.body, ua.privateKey, cuerpo.keys.p256dh, cuerpo.keys.auth));
    expect(carga).toMatchObject({ titulo: "Avisos en este dispositivo", enlace: "/ajustes#salud" });
    expect(db.sqlite.prepare("select ok_at from push_suscripciones").get().ok_at).toBeTruthy();
  });
});

describe("avisar() manda lo importante al teléfono", () => {
  it("un fallo llega; una aprobación suelta no; una suscripción que ya no existe se borra; un push que falla no tumba el aviso", async () => {
    const ana = await suscripcion(1);
    const vieja = await suscripcion(2);
    await pedir(ANA, "/avisos/push", { method: "POST", body: ana.cuerpo });
    await pedir(ANA, "/avisos/push", { method: "POST", body: vieja.cuerpo });
    const llamadas = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      llamadas.push({ url, init });
      return new Response(null, { status: String(url).endsWith("disp-2") ? 410 : 201 });
    }));
    const acceso = crearAcceso(db, JEFE);
    const por = { userId: "sistema", nombre: "Publicación" };

    expect(await avisar(env, acceso, { para: [ANA], tipo: "aprobada", texto: "El cliente aprobó «X».", enlace: "/x", por })).toBe(1);
    expect(llamadas).toHaveLength(0);

    expect(await avisar(env, acceso, { para: [ANA], tipo: "fallo", texto: "«Promo» no se publicó en instagram: token caducado.", enlace: "/produccion", por })).toBe(1);
    expect(llamadas.map((l) => l.url).sort()).toEqual([ana.cuerpo.endpoint, vieja.cuerpo.endpoint]);
    const carga = JSON.parse(await descifrar(llamadas.find((l) => l.url === ana.cuerpo.endpoint).init.body, ana.ua.privateKey, ana.cuerpo.keys.p256dh, ana.cuerpo.keys.auth));
    expect(carga).toEqual({ titulo: "No se publicó", texto: "«Promo» no se publicó en instagram: token caducado.", enlace: "/produccion", etiqueta: "fallo" });
    // La que contestó 410 ya no existe.
    expect(db.sqlite.prepare("select endpoint from push_suscripciones").all()).toEqual([{ endpoint: ana.cuerpo.endpoint }]);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sin red"); }));
    expect(await avisar(env, acceso, { para: [ANA], tipo: "cambios", texto: "El cliente pidió cambios.", enlace: "/x", por })).toBe(1);
    expect(db.sqlite.prepare("select count(*) n from avisos where user_id = ?").get(ANA).n).toBe(3);
  });
});
