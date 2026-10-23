import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarMeta } from "../../worker/lib/meta.js";

// ============================================================
// El contenido de la competencia y el enlace de Instagram, contra una D1 de
// verdad y una Meta de mentira (business_discovery y su CDN)
//
// Lo que importa: que se lea desde la cuenta conectada, que lo que mejor
// funcionó salga primero, que las miniaturas pasen por el proxy, que «traer»
// baje SÓLO del CDN de Meta a la galería del cliente (carpeta «Competencia»)
// y que un enlace sin @ lo pregunte.
// ============================================================

const DUENO = "u-jefe";
const TESTIGO = "testigo-de-sesion-de-prueba";
let db;
let env;
let graph;
let mediaUrl;

const MP4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 1, 2, 3, 4]);
const medios = () => ([
  { id: "101", caption: "Poco", media_type: "IMAGE", like_count: 5, comments_count: 0, timestamp: "2026-10-01T12:00:00+0000", permalink: "https://www.instagram.com/p/AAAAA1/", media_url: "https://scontent.cdninstagram.com/1.jpg" },
  { id: "102", caption: "El que funcionó", media_type: "VIDEO", media_product_type: "REELS", like_count: 300, comments_count: 40, timestamp: "2026-09-20T12:00:00+0000", permalink: "https://www.instagram.com/reel/BBBBB2/", media_url: mediaUrl, thumbnail_url: "https://scontent.cdninstagram.com/2.jpg" },
]);

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) { return objetos.has(clave) ? { arrayBuffer: async () => objetos.get(clave) } : null; },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor) { objetos.set(clave, valor instanceof ReadableStream ? new Uint8Array(await new Response(valor).arrayBuffer()) : valor); },
    async delete(clave) { objetos.delete(clave); },
  };
}

async function sembrar() {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", DUENO, "Dcasa");
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, usuario, token_cifrado, client_id) values (?,?,?,?,?,?,?)")
    .run("ig", DUENO, "instagram", "IG1", "dcasa", await cifrarMeta(env, "token-pagina"), "c1");
}

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), META_APP_SECRET: "secreto", META_APP_ID: "app" };
  graph = [];
  mediaUrl = "https://scontent.cdninstagram.com/2.mp4";
  vi.stubGlobal("fetch", vi.fn(async (entrada) => {
    const u = new URL(String(entrada));
    if (u.host === "graph.facebook.com") {
      const f = u.searchParams.get("fields") ?? "";
      graph.push({ ruta: u.pathname, fields: f });
      const bd = /business_discovery\.username\(([^)]+)\)/.exec(f);
      if (bd?.[1] === "personal") return new Response(JSON.stringify({ error: { message: "Invalid user id", code: 110 } }), { status: 400 });
      return Response.json({ business_discovery: { username: bd[1], name: "Muebles X", followers_count: 1000, media_count: 80, profile_picture_url: "https://scontent.cdninstagram.com/p.jpg", media: { data: medios() } } });
    }
    if (u.hostname.endsWith("cdninstagram.com")) return new Response(MP4, { headers: { "content-type": "video/mp4" } });
    throw new Error(`fetch inesperado a ${u}`);
  }));
  await sembrar();
});

afterEach(() => vi.unstubAllGlobals());

const pedir = (ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test${ruta}`, {
  ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env, { waitUntil() {} });

describe("el contenido de la competencia", () => {
  it("lee las últimas de @cuenta desde la cuenta del cliente; lo que mejor funcionó, primero; miniaturas por el proxy", async () => {
    const r = await pedir("/api/mercado/c1/competencia?usuario=@MueblesX");
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(graph[0].ruta).toMatch(/\/IG1$/);
    expect(graph[0].fields).toContain("business_discovery.username(mueblesx)");
    expect(d.perfil).toMatchObject({ usuario: "mueblesx", seguidores: 1000 });
    expect(d.publicaciones.map((p) => p.id)).toEqual(["102", "101"]);
    expect(d.publicaciones[0]).toMatchObject({ formato: "reel", video: true, meGusta: 300, comentarios: 40, interacciones: 380, tasa: 38 });
    expect(d.publicaciones[0].miniatura).toBe(`/api/metricas/miniatura?u=${encodeURIComponent("https://scontent.cdninstagram.com/2.jpg")}`);
    expect(JSON.stringify(d)).not.toContain("2.mp4");
  });

  it("una cuenta personal no se puede leer, y lo dice", async () => {
    const r = await pedir("/api/mercado/c1/competencia?usuario=personal");
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/empresa o de creador/);
  });

  it("«traer» baja el archivo a la galería del cliente, carpeta «Competencia»", async () => {
    const r = await pedir("/api/mercado/c1/competencia/traer", { method: "POST", body: { usuario: "mueblesx", id: "102" } });
    expect(r.status).toBe(201);
    const { archivo, usuario } = await r.json();
    expect(usuario).toBe("mueblesx");
    expect(archivo).toMatchObject({ tipo: "video", mime: "video/mp4" });
    expect(archivo.clave).toMatch(/^clientes\/c1\//);
    expect(env.MEDIA.objetos.has(archivo.clave)).toBe(true);
    const carpeta = db.sqlite.prepare("select nombre from estudio_carpetas where id = ?").get(archivo.carpetaId);
    expect(carpeta.nombre).toBe("Competencia");
  });

  it("no sigue una dirección que no sea del CDN de Meta", async () => {
    mediaUrl = "https://evil.example.com/x.mp4";
    const r = await pedir("/api/mercado/c1/competencia/traer", { method: "POST", body: { usuario: "mueblesx", id: "102" } });
    expect(r.status).toBe(409);
    expect(env.MEDIA.objetos.size).toBe(0);
  });

  it("un enlace sin @ lo pregunta; con el @ lo encuentra por su código", async () => {
    const sin = await pedir("/api/mercado/c1/competencia/enlace", { method: "POST", body: { enlace: "Mira esto https://www.instagram.com/reel/BBBBB2/?igsh=xyz" } });
    expect(sin.status).toBe(409);
    expect((await sin.json()).codigo).toBe("usuario");
    const con = await pedir("/api/mercado/c1/competencia/enlace", { method: "POST", body: { enlace: "https://www.instagram.com/reel/BBBBB2/", usuario: "@mueblesx" } });
    expect(con.status).toBe(201);
    expect((await con.json()).publicacion.id).toBe("102");
    // Con la cuenta en el enlace no hace falta preguntar; uno que no está entre las últimas, 404.
    expect((await pedir("/api/mercado/c1/competencia/enlace", { method: "POST", body: { enlace: "https://www.instagram.com/mueblesx/p/AAAAA1/" } })).status).toBe(201);
    expect((await pedir("/api/mercado/c1/competencia/enlace", { method: "POST", body: { enlace: "https://www.instagram.com/p/ZZZZZ9/", usuario: "mueblesx" } })).status).toBe(404);
  });

  it("un cliente de otro espacio no existe", async () => {
    expect((await pedir("/api/mercado/otro/competencia?usuario=mueblesx")).status).toBe(404);
  });
});
