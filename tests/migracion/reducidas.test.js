import { describe, it, expect, beforeEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import worker from "../../worker/index.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { claveReducida, LADO_REDUCIDA } from "../../worker/lib/estudio/miniaturas.js";
import { reducida } from "../../src/lib/reducida.js";

// ============================================================
// La copia reducida de las imágenes (`?mini=1`): lo que pintan el chip del mes, la cuadrícula y la página del cliente
//
//   · el permiso es el del ORIGINAL (con sesión, un cliente del espacio; sin sesión, que esté en el calendario);
//   · si ya existe, se sirve la copia; si no, se redirige al original sin caché y se encarga (con el Container);
//   · lo que no es una imagen que se pueda reducir se apunta y no se vuelve a intentar;
//   · sin Container (en local), siempre el original.
// ============================================================

const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const CLAVE = "clientes/c1/posts/a.png";
const SVG = "clientes/c1/estudio/prueba.svg";

let db;
let env;
let objetos;
let pedidos;

function r2() {
  objetos = new Map();
  const objeto = (b) => ({
    size: b.cuerpo.length, httpMetadata: { contentType: b.tipo }, customMetadata: b.meta ?? {}, httpEtag: '"e"',
    body: new Blob([b.cuerpo]).stream(), arrayBuffer: async () => b.cuerpo.buffer.slice(b.cuerpo.byteOffset, b.cuerpo.byteOffset + b.cuerpo.length),
    writeHttpMetadata: (h) => h.set("Content-Type", b.tipo),
  });
  return {
    async get(clave) { return objetos.has(clave) ? objeto(objetos.get(clave)) : null; },
    async put(clave, valor, op = {}) {
      const cuerpo = valor instanceof Uint8Array ? valor : new Uint8Array(await new Response(valor).arrayBuffer());
      objetos.set(clave, { cuerpo, tipo: op.httpMetadata?.contentType ?? "application/octet-stream", meta: op.customMetadata });
    },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const contenedor = () => {
  pedidos = [];
  return {
    idFromName: (n) => n,
    get: () => ({
      async fetch(req) {
        const cuerpo = await req.json();
        pedidos.push({ ruta: new URL(req.url).pathname, lado: cuerpo.lado });
        return new Response(JSON.stringify({ datos: btoa("jpeg-reducido"), mime: "image/jpeg", ancho: 1, alto: 1 }));
      },
    }),
  };
};

beforeEach(async () => {
  db = d1EnMemoria();
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u1", "a@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run("u1", "u1", "admin", "Ana", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", "u1", "Café Luna");
  const dias = [{ date: "2026-10-05", posts: [{ id: "p1", medios: [{ src: `/api/media/${CLAVE}`, tipo: "imagen" }] }] }];
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days, share_token, share_enabled) values (?,?,?,?,?,?,?,?,?)")
    .run("oct", "c1", "u1", "Octubre 2026", 9, 2026, JSON.stringify(dias), "testigo-de-prueba-123456", 1);
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("sesion-u1"), "u1", "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  env = { DB: db, MEDIA: r2(), VIDEO: contenedor(), ASSETS: { fetch: () => new Response("spa") } };
  await env.MEDIA.put(CLAVE, PNG, { httpMetadata: { contentType: "image/png" } });
  await env.MEDIA.put(SVG, new TextEncoder().encode("<svg/>"), { httpMetadata: { contentType: "image/svg+xml" } });
});

const pedir = (ruta, { sesion = true } = {}) => worker.fetch(new Request(`https://calendarios.test${ruta}`, {
  headers: sesion ? { Cookie: `${COOKIE}=sesion-u1` } : {}, redirect: "manual",
}), env, {});

describe("la ruta de la copia en la pantalla", () => {
  it("reducida() sólo toca lo de R2", () => {
    expect(reducida(`/api/media/${CLAVE}`)).toBe(`/api/media/${CLAVE}?mini=1`);
    expect(reducida("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(reducida("/api/metricas/miniatura?u=x")).toBe("/api/metricas/miniatura?u=x");
    expect(reducida(null)).toBe(null);
  });
});

describe("con sesión: /api/media/<clave>?mini=1", () => {
  it("sin copia todavía: redirige al original sin caché y la encarga de LADO_REDUCIDA", async () => {
    const r = await pedir(`/api/media/${CLAVE}?mini=1`);
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe(`/api/media/${CLAVE}`);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(pedidos).toEqual([{ ruta: "/miniatura", lado: LADO_REDUCIDA }]);
    expect(objetos.get(claveReducida(CLAVE)).tipo).toBe("image/jpeg");
  });

  it("con copia: se sirve la copia (JPEG), no el original", async () => {
    await pedir(`/api/media/${CLAVE}?mini=1`);
    const r = await pedir(`/api/media/${CLAVE}?mini=1`);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("image/jpeg");
    expect(await r.text()).toBe("jpeg-reducido");
    expect(pedidos).toHaveLength(1);
    // Sin ?mini, el original de siempre.
    const o = await pedir(`/api/media/${CLAVE}`);
    expect(o.headers.get("Content-Type")).toBe("image/png");
  });

  it("lo que no se puede reducir (un SVG) se apunta y no se vuelve a intentar", async () => {
    expect((await pedir(`/api/media/${SVG}?mini=1`)).status).toBe(302);
    expect((await pedir(`/api/media/${SVG}?mini=1`)).status).toBe(302);
    expect(pedidos).toEqual([]);
    expect(objetos.get(claveReducida(SVG)).meta).toEqual({ sin: "1" });
  });

  it("sin Container (en local): el original y nada más", async () => {
    delete env.VIDEO;
    const r = await pedir(`/api/media/${CLAVE}?mini=1`);
    expect(r.status).toBe(302);
    expect(objetos.has(claveReducida(CLAVE))).toBe(false);
  });

  it("el permiso es el del original: sin sesión o de otro cliente, no", async () => {
    expect((await pedir(`/api/media/${CLAVE}?mini=1`, { sesion: false })).status).toBe(401);
    expect((await pedir("/api/media/clientes/otro/posts/a.png?mini=1")).status).toBe(404);
  });

  it("la copia vive fuera de clientes/: /api/media no la sirve por su cuenta", async () => {
    await pedir(`/api/media/${CLAVE}?mini=1`);
    expect((await pedir(`/api/media/${claveReducida(CLAVE)}`)).status).toBe(404);
  });
});

describe("sin sesión: la página del cliente", () => {
  it("la copia de una imagen del calendario, por su ruta pública", async () => {
    await pedir(`/api/media/${CLAVE}?mini=1`);
    const r = await pedir(`/api/publico/testigo-de-prueba-123456/media/${CLAVE}?mini=1`, { sesion: false });
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("jpeg-reducido");
  });

  it("sin copia, al original por la MISMA ruta pública (el cliente no tiene sesión)", async () => {
    const r = await pedir(`/api/publico/testigo-de-prueba-123456/media/${CLAVE}?mini=1`, { sesion: false });
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe(`/api/publico/testigo-de-prueba-123456/media/${CLAVE}`);
  });

  it("lo que no está en el calendario, tampoco reducido", async () => {
    const r = await pedir(`/api/publico/testigo-de-prueba-123456/media/${SVG}?mini=1`, { sesion: false });
    expect(r.status).toBe(404);
  });
});
