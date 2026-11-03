import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// /api/biblioteca/sc/*: la Biblioteca de anuncios por Scrape Creators, contra
// una D1 de verdad y un Scrape Creators de mentira que contesta como su
// documentación. NADA de esto se ha probado contra el servicio real.
//
// Por orden de gravedad:
//   1. La llave va en la cabecera del Worker y nunca sale al navegador.
//   2. La misma búsqueda no se paga dos veces (caché del espacio, que no ve otro).
//   3. 402 (sin créditos), 404 y el reintento de un 5xx dicen qué pasó.
//   4. «Traer» sólo baja del CDN de Meta y a un cliente del espacio.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra" };
const LLAVE = "sc-llave-secreta";
const IMG = "https://scontent.xx.fbcdn.net/v/anuncio.jpg";
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);

let db;
let env;
let pedidos;
let respuestaSC;

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) { return objetos.has(clave) ? { arrayBuffer: async () => objetos.get(clave) } : null; },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor) { objetos.set(clave, valor); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const ANUNCIOS = {
  success: true,
  results: [{
    ad_archive_id: "111222333", page_name: "Competidor", page_id: "555", is_active: true, start_date: 1767225600,
    publisher_platform: ["FACEBOOK"], snapshot: { body: { text: "Sofá a $299" }, images: [{ original_image_url: IMG }] },
  }],
  cursor: "SIGUIENTE",
  searchResultsCount: 40,
  credits_remaining: 990,
};

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRA, "otra@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

const anuncios = (quien, c, cursor = "") =>
  pedir(quien, `/api/biblioteca/sc/anuncios?c=${encodeURIComponent(JSON.stringify(c))}${cursor ? `&cursor=${cursor}` : ""}`);

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") }, SCRAPECREATORS_API_KEY: LLAVE };
  pedidos = [];
  respuestaSC = () => ({ cuerpo: ANUNCIOS });
  vi.stubGlobal("fetch", vi.fn(async (entrada, init = {}) => {
    const u = new URL(String(entrada));
    if (u.hostname === "api.scrapecreators.com") {
      pedidos.push({ u, llave: init.headers?.["x-api-key"] });
      const r = respuestaSC(u);
      return new Response(JSON.stringify(r.cuerpo), { status: r.estado ?? 200, headers: { "content-type": "application/json" } });
    }
    if (u.hostname.endsWith("fbcdn.net")) return new Response(JPG, { headers: { "content-type": "image/jpeg" } });
    return new Response("no", { status: 404 });
  }));
  await sembrar();
});
afterEach(() => vi.unstubAllGlobals());

describe("la llave y la caché", () => {
  it("GET /api/biblioteca dice si está configurado, sin enseñar la llave", async () => {
    const res = await pedir(JEFE, "/api/biblioteca");
    const texto = await res.text();
    expect(JSON.parse(texto).sc).toBe(true);
    expect(texto).not.toContain(LLAVE);
    delete env.SCRAPECREATORS_API_KEY;
    expect((await (await pedir(JEFE, "/api/biblioteca")).json()).sc).toBe(false);
  });

  it("sin llave contesta 503 y no llama a nadie", async () => {
    delete env.SCRAPECREATORS_API_KEY;
    const res = await anuncios(JEFE, { modo: "palabra", q: "sofá" });
    expect(res.status).toBe(503);
    expect(pedidos).toHaveLength(0);
  });

  it("la llave va en x-api-key, la respuesta no la lleva y la segunda búsqueda igual sale de la caché", async () => {
    const res = await anuncios(JEFE, { modo: "empresa", pageId: "555", pais: "PA" });
    expect(res.status).toBe(200);
    const texto = await res.text();
    expect(texto).not.toContain(LLAVE);
    const d = JSON.parse(texto);
    expect(d.cache).toBe(false);
    expect(d.anuncios[0]).toMatchObject({ id: "111222333", pagina: "Competidor", imagenes: [IMG] });
    expect(d).toMatchObject({ cursor: "SIGUIENTE", total: 40, creditos: 990 });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].llave).toBe(LLAVE);
    expect(pedidos[0].u.pathname).toBe("/v1/facebook/adLibrary/company/ads");
    expect(pedidos[0].u.searchParams.get("pageId")).toBe("555");
    expect(pedidos[0].u.searchParams.get("trim")).toBe("true");

    const otra = await (await anuncios(JEFE, { modo: "empresa", pageId: "555", pais: "PA" })).json();
    expect(otra.cache).toBe(true);
    expect(pedidos).toHaveLength(1);
  });

  it("la caché es del espacio: otra agencia paga su propia búsqueda", async () => {
    await anuncios(JEFE, { modo: "palabra", q: "sofá" });
    const d = await (await anuncios(OTRA, { modo: "palabra", q: "sofá" })).json();
    expect(d.cache).toBe(false);
    expect(pedidos).toHaveLength(2);
  });

  it("otra página (cursor) es otra búsqueda", async () => {
    await anuncios(JEFE, { modo: "palabra", q: "sofá" });
    await anuncios(JEFE, { modo: "palabra", q: "sofá" }, "SIGUIENTE");
    expect(pedidos).toHaveLength(2);
    expect(pedidos[1].u.searchParams.get("cursor")).toBe("SIGUIENTE");
  });

  it("una búsqueda sin lo necesario es un 400 sin gastar", async () => {
    const res = await anuncios(JEFE, { modo: "palabra" });
    expect(res.status).toBe(400);
    expect(pedidos).toHaveLength(0);
  });
});

describe("los errores de Scrape Creators", () => {
  it("402: sin créditos, dicho para la persona", async () => {
    respuestaSC = () => ({ estado: 402, cuerpo: { message: "Payment required" } });
    const res = await anuncios(JEFE, { modo: "palabra", q: "sofá" });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/créditos/);
  });

  it("404: la empresa sin anuncios", async () => {
    respuestaSC = () => ({ estado: 404, cuerpo: { message: "Not found" } });
    expect((await anuncios(JEFE, { modo: "empresa", pageId: "555" })).status).toBe(404);
  });

  it("un 5xx se reintenta UNA vez", async () => {
    let n = 0;
    respuestaSC = () => (n++ === 0 ? { estado: 500, cuerpo: {} } : { cuerpo: ANUNCIOS });
    const res = await anuncios(JEFE, { modo: "palabra", q: "sofá" });
    expect(res.status).toBe(200);
    expect(pedidos).toHaveLength(2);
  });

  it("dos 5xx seguidos son un 502 y no se guardan en la caché", async () => {
    respuestaSC = () => ({ estado: 503, cuerpo: {} });
    expect((await anuncios(JEFE, { modo: "palabra", q: "sofá" })).status).toBe(502);
    expect(pedidos).toHaveLength(2);
    expect(db.sqlite.prepare("select count(*) n from biblioteca_cache").get().n).toBe(0);
  });
});

describe("empresas y el detalle de un anuncio", () => {
  it("busca empresas por su nombre", async () => {
    respuestaSC = () => ({ cuerpo: { success: true, searchResults: [{ page_id: "555", name: "Competidor", likes: 300 }, { name: "sin id" }] } });
    const d = await (await pedir(JEFE, "/api/biblioteca/sc/empresas?q=Competidor")).json();
    expect(d.empresas).toEqual([expect.objectContaining({ pageId: "555", nombre: "Competidor" })]);
    expect(pedidos[0].u.pathname).toBe("/v1/facebook/adLibrary/search/companies");
  });

  it("la transcripción sólo se pide de un video", async () => {
    respuestaSC = (u) => (u.pathname.endsWith("/transcript")
      ? { cuerpo: { success: true, transcript: "Hola, mira este sofá" } }
      : { cuerpo: { success: true, adArchiveID: "9", snapshot: { display_format: "VIDEO", videos: [{ video_sd_url: "https://video.fbcdn.net/v.mp4" }] } } });
    const d = await (await pedir(JEFE, "/api/biblioteca/sc/anuncio/9?transcripcion=1")).json();
    expect(d.transcripcion).toBe("Hola, mira este sofá");
    expect(pedidos.map((p) => p.u.pathname)).toEqual(["/v1/facebook/adLibrary/ad", "/v1/facebook/adLibrary/ad/transcript"]);
  });
});

describe("traer un anuncio a la galería", () => {
  it("baja del CDN de Meta a la carpeta «Competencia» del cliente", async () => {
    const res = await pedir(JEFE, "/api/biblioteca/sc/traer", { method: "POST", body: { clientId: "c1", url: IMG, tipo: "imagen", id: "111222333", pagina: "Competidor" } });
    expect(res.status).toBe(201);
    const { archivo } = await res.json();
    expect(archivo.clave).toMatch(/^clientes\/c1\//);
    expect(env.MEDIA.objetos.has(archivo.clave)).toBe(true);
  });

  it("una dirección que no es del CDN de Meta no se baja", async () => {
    const res = await pedir(JEFE, "/api/biblioteca/sc/traer", { method: "POST", body: { clientId: "c1", url: "https://malo.com/a.jpg", tipo: "imagen" } });
    expect(res.status).toBe(400);
    expect(env.MEDIA.objetos.size).toBe(0);
  });

  it("un cliente de otro espacio no existe", async () => {
    const res = await pedir(JEFE, "/api/biblioteca/sc/traer", { method: "POST", body: { clientId: "c9", url: IMG, tipo: "imagen" } });
    expect(res.status).toBe(404);
  });
});

describe("los filtros guardados de Scrape Creators", () => {
  it("se guardan con su fuente y se leen igual", async () => {
    const res = await pedir(JEFE, "/api/biblioteca/filtros", {
      method: "POST", body: { nombre: "Competidor", clientId: "c1", consulta: { fuente: "sc", modo: "empresa", pageId: "555", empresa: "Competidor", pais: "PA" } },
    });
    expect(res.status).toBe(201);
    const { filtros } = await (await pedir(JEFE, "/api/biblioteca")).json();
    expect(filtros[0].consulta).toMatchObject({ fuente: "sc", modo: "empresa", pageId: "555", pais: "PA" });
  });

  it("uno sin empresa ni palabra no se guarda", async () => {
    const res = await pedir(JEFE, "/api/biblioteca/filtros", { method: "POST", body: { nombre: "x", consulta: { fuente: "sc", modo: "palabra" } } });
    expect(res.status).toBe(400);
  });
});
