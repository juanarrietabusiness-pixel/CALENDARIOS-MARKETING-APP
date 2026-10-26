import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { inspiracionPendiente } from "../../worker/lib/inspiracion.js";

// ============================================================
// Inspiración contra una D1 de verdad y una Meta y una YouTube de mentira
//
// Lo que importa: que cada cuenta fija se lea por su vía (Instagram por
// business_discovery, YouTube por la Data API, TikTok no se puede), que
// «rinde» se mida contra la mediana de la propia cuenta, que una cuenta que
// falla deje su error sin tumbar a las demás, que lo que ya no está se borre,
// que lo nuevo que rinde mucho avise UNA vez, que el archivo se traiga sólo
// de Instagram y que el cron no lea dos veces el mismo cliente.
// ============================================================

const DUENO = "u-jefe";
const TESTIGO = "testigo-de-sesion-de-prueba";
const DIA = 86_400_000;
let db;
let env;
let medios;
let llamadas;

const hace = (dias) => new Date(Date.now() - dias * DIA).toISOString().replace("Z", "+0000");
const MP4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 1, 2, 3, 4]);

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

const CUENTAS = [
  { red: "instagram", usuario: "mueblesx", tipo: "competencia" },
  { red: "instagram", usuario: "personal", tipo: "inspiracion" },
  { red: "youtube", usuario: "canalbueno", tipo: "inspiracion" },
  { red: "tiktok", usuario: "latienda", tipo: "competencia" },
];

async function sembrar() {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, competidores) values (?,?,?,?)").run("c1", DUENO, "Dcasa", JSON.stringify(CUENTAS));
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, usuario, token_cifrado, client_id) values (?,?,?,?,?,?,?)")
    .run("ig", DUENO, "instagram", "IG1", "dcasa", await cifrarMeta(env, "token-pagina"), "c1");
  // Otro espacio, con un cliente que también sigue cuentas.
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-otro", "otro@a.com", "x", "x");
  s.prepare("insert into clients (id, owner_id, name, competidores) values (?,?,?,?)").run("c9", "u-otro", "Ajeno", "[]");
}

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), META_APP_SECRET: "secreto", META_APP_ID: "app", YOUTUBE_API_KEY: "llave-yt" };
  llamadas = [];
  medios = [
    { id: "101", caption: "Poco", media_type: "IMAGE", like_count: 5, comments_count: 0, timestamp: hace(20), permalink: "https://www.instagram.com/p/AAAAA1/", media_url: "https://scontent.cdninstagram.com/1.jpg" },
    { id: "102", caption: "El que funcionó", media_type: "VIDEO", media_product_type: "REELS", like_count: 300, comments_count: 40, timestamp: hace(2), permalink: "https://www.instagram.com/reel/BBBBB2/", media_url: "https://scontent.cdninstagram.com/2.mp4", thumbnail_url: "https://scontent.cdninstagram.com/2.jpg" },
    { id: "103", caption: "Normal", media_type: "VIDEO", media_product_type: "REELS", like_count: 90, comments_count: 3, timestamp: hace(5), permalink: "https://www.instagram.com/reel/CCCCC3/", thumbnail_url: "https://scontent.cdninstagram.com/3.jpg" },
  ];
  vi.stubGlobal("fetch", vi.fn(async (entrada) => {
    const u = new URL(String(entrada));
    llamadas.push(`${u.host}${u.pathname}`);
    if (u.host === "graph.facebook.com") {
      const bd = /business_discovery\.username\(([^)]+)\)/.exec(u.searchParams.get("fields") ?? "");
      if (bd?.[1] === "personal") return new Response(JSON.stringify({ error: { message: "Invalid user id", code: 110 } }), { status: 400 });
      return Response.json({ business_discovery: { username: bd[1], name: "Muebles X", followers_count: 1000, media_count: 80, profile_picture_url: "https://scontent.cdninstagram.com/p.jpg", media: { data: medios } } });
    }
    if (u.host === "www.googleapis.com") {
      expect(u.searchParams.get("key")).toBe("llave-yt");
      if (u.pathname.endsWith("/channels")) {
        expect(u.searchParams.get("forHandle")).toBe("@canalbueno");
        return Response.json({ items: [{ id: "UCx", snippet: { title: "Canal Bueno", thumbnails: { default: { url: "https://i.ytimg.com/c.jpg" } } }, statistics: { subscriberCount: "5000", videoCount: "40" }, contentDetails: { relatedPlaylists: { uploads: "UU1" } } }] });
      }
      if (u.pathname.endsWith("/playlistItems")) return Response.json({ items: ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"].map((videoId) => ({ contentDetails: { videoId } })) });
      if (u.pathname.endsWith("/videos")) {
        return Response.json({ items: [
          { id: "aaaaaaaaaaa", snippet: { title: "Short que pegó", publishedAt: hace(1) }, statistics: { likeCount: "900", commentCount: "50", viewCount: "40000" }, contentDetails: { duration: "PT35S" } },
          { id: "bbbbbbbbbbb", snippet: { title: "Normal", publishedAt: hace(10) }, statistics: { likeCount: "100", commentCount: "10", viewCount: "3000" }, contentDetails: { duration: "PT8M" } },
          { id: "ccccccccccc", snippet: { title: "Otro", publishedAt: hace(12) }, statistics: { likeCount: "110", commentCount: "5", viewCount: "3200" }, contentDetails: { duration: "PT9M" } },
        ] });
      }
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

const actualizar = async () => {
  const r = await pedir("/api/inspiracion/c1/actualizar", { method: "POST", body: {} });
  expect(r.status).toBe(200);
  return r.json();
};

describe("Inspiración", () => {
  it("antes de leer, el feed dice qué cuentas faltan; leerlas trae cada red por su vía", async () => {
    const antes = await (await pedir("/api/inspiracion/c1")).json();
    expect(antes.faltan).toEqual(["instagram:mueblesx", "instagram:personal", "youtube:canalbueno", "tiktok:latienda"]);
    expect(antes.publicaciones).toEqual([]);

    const d = await actualizar();
    expect(d.faltan).toEqual([]);
    const porClave = Object.fromEntries(d.cuentas.map((c) => [c.clave, c]));
    expect(porClave["instagram:mueblesx"]).toMatchObject({ nombre: "Muebles X", seguidores: 1000, error: "" });
    expect(porClave["instagram:personal"].error).toMatch(/empresa o de creador/);
    expect(porClave["youtube:canalbueno"]).toMatchObject({ nombre: "Canal Bueno", seguidores: 5000, error: "" });
    expect(porClave["tiktok:latienda"].error).toMatch(/TikTok no deja/);
    expect(d.errores.map((e) => e.cuenta)).toEqual(["instagram:personal"]);

    const ig = d.publicaciones.filter((p) => p.red === "instagram");
    expect(ig.map((p) => p.id).sort()).toEqual(["c1:instagram:mueblesx:101", "c1:instagram:mueblesx:102", "c1:instagram:mueblesx:103"]);
    // Interacciones (un comentario pesa el doble): 5, 380 y 96 → mediana 96.
    expect(Object.fromEntries(ig.map((p) => [p.id.split(":").at(-1), p.rinde]))).toEqual({ 101: 0.1, 102: 4, 103: 1 });
    expect(ig.find((p) => p.id.endsWith(":103")).sinArchivo).toBe(true); // reel sin media_url: música de Instagram
    expect(ig.find((p) => p.id.endsWith(":102")).miniatura).toBe(`/api/metricas/miniatura?u=${encodeURIComponent("https://scontent.cdninstagram.com/2.jpg")}`);
    expect(ig.every((p) => p.tipoCuenta === "competencia")).toBe(true);

    const yt = d.publicaciones.filter((p) => p.red === "youtube");
    expect(yt.map((p) => p.formato).sort()).toEqual(["short", "video", "video"]);
    expect(yt.find((p) => p.formato === "short")).toMatchObject({ enlace: "https://www.youtube.com/shorts/aaaaaaaaaaa", vistas: 40000, tipoCuenta: "inspiracion" });
  });

  it("lo nuevo que rinde 3× o más avisa al equipo UNA vez", async () => {
    const d = await actualizar();
    expect(d.avisos).toBe(2); // el reel de Instagram (4×) y el Short de YouTube
    const avisos = db.sqlite.prepare("select tipo, texto, enlace from avisos order by texto").all();
    expect(avisos).toHaveLength(2);
    expect(avisos.every((a) => a.tipo === "inspiracion" && a.enlace === "/cliente/c1/inspiracion")).toBe(true);
    expect(avisos.map((a) => a.texto).join(" ")).toMatch(/@mueblesx publicó un reel que rinde 4× su promedio \(lo sigue Dcasa\)/);
    await actualizar();
    expect(db.sqlite.prepare("select count(*) as n from avisos").get().n).toBe(2);
  });

  it("lo que ya no está entre sus últimas se borra, y también lo de una cuenta que se quitó", async () => {
    await actualizar();
    medios = medios.filter((m) => m.id !== "101");
    let d = await actualizar();
    expect(d.publicaciones.some((p) => p.id.endsWith(":101"))).toBe(false);
    db.sqlite.prepare("update clients set competidores = ? where id = ?").run(JSON.stringify([{ red: "youtube", usuario: "canalbueno" }]), "c1");
    d = await actualizar();
    expect(d.cuentas.map((c) => c.clave)).toEqual(["youtube:canalbueno"]);
    expect(db.sqlite.prepare("select count(*) as n from inspiracion_publicaciones where red = 'instagram'").get().n).toBe(0);
    expect(db.sqlite.prepare("select count(*) as n from inspiracion_cuentas where red = 'instagram'").get().n).toBe(0);
  });

  it("una cuenta que falla no borra lo que ya se había leído de ella", async () => {
    await actualizar();
    vi.mocked(fetch).mockImplementationOnce(async () => new Response(JSON.stringify({ error: { message: "Caído", code: 2 } }), { status: 500 }));
    const d = await (await pedir("/api/inspiracion/c1/actualizar", { method: "POST", body: { cuentas: ["instagram:mueblesx"] } })).json();
    expect(d.cuentas.find((c) => c.clave === "instagram:mueblesx").error).not.toBe("");
    expect(d.publicaciones.filter((p) => p.red === "instagram")).toHaveLength(3);
  });

  it("trae el archivo a la galería sólo de Instagram; de YouTube no", async () => {
    await actualizar();
    const r = await pedir("/api/inspiracion/c1/traer", { method: "POST", body: { id: "c1:instagram:mueblesx:102" } });
    expect(r.status).toBe(201);
    const { archivo } = await r.json();
    expect(archivo).toMatchObject({ tipo: "video" });
    expect(env.MEDIA.objetos.has(archivo.clave)).toBe(true);
    const yt = await pedir("/api/inspiracion/c1/traer", { method: "POST", body: { id: "c1:youtube:canalbueno:aaaaaaaaaaa" } });
    expect(yt.status).toBe(409);
    expect((await yt.json()).error).toMatch(/YouTube no deja bajar/);
    // El código de un enlace del feed ya no hace falta buscarlo.
    const enlace = await pedir("/api/mercado/c1/competencia/enlace", { method: "POST", body: { enlace: "https://www.instagram.com/reel/BBBBB2/?igsh=x" } });
    expect((await enlace.json()).encontrado).toBe("memoria");
  });

  it("el resumen necesita al menos tres publicaciones medidas", async () => {
    const r = await pedir("/api/inspiracion/c1/resumen", { method: "POST", body: {} });
    expect(r.status).toBe(409);
  });

  it("el cron lee un cliente con el feed viejo, y no lo repite hasta que pase el plazo", async () => {
    expect(await inspiracionPendiente(env)).toBe(1);
    expect(db.sqlite.prepare("select count(*) as n from inspiracion_cuentas where client_id = 'c1'").get().n).toBe(4);
    const antes = llamadas.length;
    expect(await inspiracionPendiente(env)).toBe(0);
    expect(llamadas.length).toBe(antes);
    expect(await inspiracionPendiente(env, new Date(Date.now() + 21 * 3600_000))).toBe(1);
  });

  it("un cliente de otro espacio no existe", async () => {
    expect((await pedir("/api/inspiracion/c9")).status).toBe(404);
    expect((await pedir("/api/inspiracion/c9/actualizar", { method: "POST", body: {} })).status).toBe(404);
  });
});
