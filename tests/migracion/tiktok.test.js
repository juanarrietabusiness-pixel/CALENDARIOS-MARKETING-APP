import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { inspiracionPendiente } from "../../worker/lib/inspiracion.js";
import { loMejorPendiente } from "../../worker/lib/loMejor.js";
import { semanaDe } from "../../src/lib/loMejor.js";
import { fechaEnZona } from "../../src/lib/agenda.js";

// ============================================================
// TikTok por Scrape Creators contra una D1 de verdad y un Scrape Creators de
// mentira que contesta como su documentación (NADA se ha probado contra el
// servicio real: gasta créditos).
//
// Lo que importa, por orden:
//   1. Nunca se pasa del tope semanal en lo automático: las cuentas de TikTok,
//      las tendencias y los anuncios comparten el MISMO tope, lo más viejo va
//      primero y lo que no cabe espera al lunes (sin mirarlo cada minuto).
//   2. Una cuenta se lee como mucho una vez por semana; el cron de cada 20 h de
//      Inspiración no la lee (y no borra lo leído).
//   3. Lo de a mano cuenta y NO se bloquea, pero se avisa.
//   4. «rinde» en vistas, la misma pieza es UNA, y las tendencias salen en «Lo
//      mejor» con su cifra («1,2 M de vistas»).
//   5. El archivo se baja SIN la llave y sólo de los dominios de TikTok, sin
//      pagar dos veces; si TikTok no lo da, se dice.
// ============================================================

const DUENO = "u-jefe";
const TESTIGO = "testigo-tiktok";
const LLAVE = "sc-llave-secreta";
const DIA = 86_400_000;
const MP4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3]);

let db;
let env;
let pedidosSC;
let bajadas;
let caducado;

const hace = (dias) => Math.floor((Date.now() - dias * DIA) / 1000);

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) { return objetos.has(clave) ? { arrayBuffer: async () => objetos.get(clave), httpMetadata: { contentType: "image/jpeg" } } : null; },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor) { objetos.set(clave, valor instanceof ReadableStream ? new Uint8Array(await new Response(valor).arrayBuffer()) : valor); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

/** Un video de TikTok como lo da su app («aweme»). */
const aweme = (id, vistas, { usuario = "latienda", dias = 2, video = true } = {}) => ({
  aweme_id: id, desc: `Video ${id} #bebe`, create_time: hace(dias),
  author: { unique_id: usuario, nickname: usuario === "latienda" ? "La Tienda" : "Alguien" },
  statistics: { play_count: vistas, digg_count: Math.round(vistas / 20), comment_count: 10, share_count: 5 },
  video: {
    cover: { url_list: [`https://p16-sign-va.tiktokcdn.com/${id}.jpeg`] },
    ...(video ? { play_addr: { url_list: [`https://v16m.tiktokcdn.com/${id}.mp4`] } } : {}),
    duration: 20000,
  },
});

async function sembrar() {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, competidores) values (?,?,?,?)")
    .run("c1", DUENO, "Baby Caleb", JSON.stringify([{ red: "tiktok", usuario: "latienda", tipo: "competencia" }]));
}

const pedir = (ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test${ruta}`, {
  ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env, { waitUntil() {} });

const creditos = () => db.sqlite.prepare("select fuente, ruta from creditos_sc order by created_at").all();

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), SCRAPECREATORS_API_KEY: LLAVE };
  pedidosSC = [];
  bajadas = [];
  caducado = false;
  vi.stubGlobal("fetch", vi.fn(async (entrada, init = {}) => {
    const u = new URL(String(entrada));
    const cabeceras = new Headers(init.headers ?? {});
    if (u.hostname === "api.scrapecreators.com") {
      pedidosSC.push({ ruta: u.pathname, params: Object.fromEntries(u.searchParams), llave: cabeceras.get("x-api-key") });
      if (u.pathname === "/v3/tiktok/profile/videos") {
        return Response.json({ success: true, aweme_list: [aweme("7300000000000000001", 90000), aweme("7300000000000000002", 3000), aweme("7300000000000000003", 2000), aweme("7300000000000000004", 1000, { video: false })] });
      }
      if (u.pathname === "/v1/tiktok/search/keyword") {
        if (u.searchParams.has("date_posted")) return Response.json({ success: false, message: "date_posted no vale" }, { status: 400 });
        return Response.json({ search_item_list: [{ aweme_info: aweme("7400000000000000001", 1234567, { usuario: "alguien" }) }, { aweme_info: aweme("7400000000000000002", 5000, { usuario: "alguien" }) }] });
      }
      if (u.pathname === "/v1/tiktok/search/hashtag") {
        return Response.json({ aweme_list: [aweme("7500000000000000001", 800000, { usuario: "alguien" })] });
      }
      if (u.pathname === "/v2/tiktok/video") {
        return Response.json({ aweme_detail: { ...aweme("7300000000000000001", 90000), video: { download_no_watermark_addr: { url_list: ["https://v19.tiktokcdn-us.com/nuevo.mp4"] } } } });
      }
      if (u.pathname.startsWith("/v1/facebook/adLibrary")) return Response.json({ results: [], credits_remaining: 9 });
      return new Response("no", { status: 404 });
    }
    if (/(^|\.)tiktokcdn(-us)?\.com$/.test(u.hostname)) {
      // Lo de TikTok se baja SIN la llave de Scrape Creators.
      expect(cabeceras.get("x-api-key")).toBeNull();
      bajadas.push(u.pathname);
      if (u.pathname.endsWith(".mp4")) {
        if (caducado && !u.pathname.endsWith("nuevo.mp4")) return new Response("caducó", { status: 403 });
        return new Response(MP4, { headers: { "content-type": "video/mp4" } });
      }
      return new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
    }
    throw new Error(`fetch inesperado a ${u}`);
  }));
  await sembrar();
});

afterEach(() => vi.unstubAllGlobals());

const actualizar = async (body = {}) => {
  const r = await pedir("/api/inspiracion/c1/actualizar", { method: "POST", body });
  expect(r.status).toBe(200);
  return r.json();
};

describe("las cuentas de TikTok de Inspiración", () => {
  it("«Actualizar» la lee por Scrape Creators (un crédito a mano), con «rinde» en vistas, y no otra vez en la semana", async () => {
    const d = await actualizar();
    expect(pedidosSC).toHaveLength(1);
    expect(pedidosSC[0]).toMatchObject({ ruta: "/v3/tiktok/profile/videos", llave: LLAVE });
    expect(pedidosSC[0].params).toMatchObject({ handle: "latienda", sort_by: "latest" });
    const cuenta = d.cuentas.find((c) => c.clave === "tiktok:latienda");
    expect(cuenta).toMatchObject({ nombre: "La Tienda", error: "", feed: true });
    expect(cuenta.leidaAt).toBeTruthy();
    const tt = d.publicaciones.filter((p) => p.red === "tiktok");
    expect(tt).toHaveLength(4);
    // Vistas 90.000, 3.000, 2.000 y 1.000 → mediana 2.500: rinde 36×, 1,2×, 0,8× y 0,4×.
    expect(Object.fromEntries(tt.map((p) => [p.id.split(":").at(-1), p.rinde]))).toEqual({
      "7300000000000000001": 36, "7300000000000000002": 1.2, "7300000000000000003": 0.8, "7300000000000000004": 0.4,
    });
    expect(creditos()).toEqual([{ fuente: "manual", ruta: "/v3/tiktok/profile/videos" }]);
    expect(d.avisoSC).toMatch(/TikTok gastó 1 crédito.*van 1 de 10/);
    // Lo que rinde 3× o más y es nuevo avisa al equipo, como en Instagram.
    expect(db.sqlite.prepare("select enlace from avisos").all().map((a) => a.enlace)).toEqual(["/cliente/c1/inspiracion?pieza=tt%3A7300000000000000001"]);

    // Dentro de la semana no se vuelve a pedir: ni a mano.
    await actualizar();
    expect(pedidosSC).toHaveLength(1);
  });

  it("el cron de cada 20 h de Inspiración NO la lee, y conserva lo leído", async () => {
    await actualizar();
    db.sqlite.prepare("update inspiracion_cuentas set actualizada_at = ?").run(new Date(Date.now() - 2 * DIA).toJSON());
    expect(await inspiracionPendiente(env)).toBe(1);
    expect(pedidosSC).toHaveLength(1);
    expect(db.sqlite.prepare("select count(*) as n from inspiracion_publicaciones where red = 'tiktok'").get().n).toBe(4);
    // Y no se queda en bucle: la vuelta siguiente ya no tiene nada.
    expect(await inspiracionPendiente(env)).toBe(0);
  });

  it("la primera lectura de una cuenta recién añadida respeta el tope; si no cabe, espera y se dice", async () => {
    await pedir("/api/lo-mejor/creditos", { method: "PUT", body: { tope: 0 } });
    const d = await actualizar({ cuentas: ["tiktok:latienda"] });
    expect(pedidosSC).toHaveLength(0);
    expect(d.faltan).toEqual([]);
    expect(d.cuentas[0].nota).toMatch(/en cuanto quepa/);
    expect(d.avisoSC).toMatch(/espera a que haya créditos/);
  });

  it("sin la llave, la cuenta dice cómo leerla y no se llama a nadie", async () => {
    delete env.SCRAPECREATORS_API_KEY;
    const d = await actualizar();
    expect(pedidosSC).toHaveLength(0);
    expect(d.cuentas[0].error).toMatch(/TikTok no deja ver.*Scrape Creators/);
    expect(d.cuentas[0].feed).toBe(false);
  });

  it("sale en «Lo mejor» con su clave tt:, «rinde 36× en vistas» y se puede recrear para grabar", async () => {
    await actualizar();
    const lm = await (await pedir("/api/lo-mejor?ventana=semana")).json();
    const p = lm.piezas.find((x) => x.clave === "tt:7300000000000000001");
    expect(p).toMatchObject({ fuente: "inspiracion", red: "tiktok", formato: "video", conVideo: true });
    expect(p.cifra.texto).toBe("rinde 36× en vistas");
    expect(p.caminos).toContain("grabar");
    expect(p.miniatura).toMatch(/^\/api\/metricas\/miniatura\?u=/);
    expect(p.video).toMatch(/^\/api\/lo-mejor\/video\?u=/);
  });
});

describe("el video de TikTok a la galería", () => {
  it("se baja sin la llave y sólo una vez", async () => {
    await actualizar();
    const traer = () => pedir("/api/lo-mejor/traer", { method: "POST", body: { clave: "tt:7300000000000000001", clienteId: "c1" } });
    const r = await traer();
    expect(r.status).toBe(201);
    const { archivo } = await r.json();
    expect(archivo.tipo).toBe("video");
    expect(env.MEDIA.objetos.has(archivo.clave)).toBe(true);
    const otra = await (await traer()).json();
    expect(otra.archivo.repetido).toBe(true);
    expect(bajadas.filter((b) => b.endsWith(".mp4"))).toHaveLength(1);
  });

  it("si la dirección guardada caducó, el detalle del video da otra (un crédito)", async () => {
    await actualizar();
    caducado = true;
    const r = await pedir("/api/lo-mejor/traer", { method: "POST", body: { clave: "tt:7300000000000000001", clienteId: "c1" } });
    expect(r.status).toBe(201);
    expect(pedidosSC.map((p) => p.ruta)).toEqual(["/v3/tiktok/profile/videos", "/v2/tiktok/video"]);
    expect(pedidosSC[1].params.url).toBe("https://www.tiktok.com/@latienda/video/7300000000000000001");
    expect(bajadas.at(-1)).toBe("/nuevo.mp4");
  });

  it("si TikTok no da el archivo, se dice y se trabaja con la miniatura", async () => {
    await actualizar();
    delete env.SCRAPECREATORS_API_KEY;
    const r = await pedir("/api/lo-mejor/traer", { method: "POST", body: { clave: "tt:7300000000000000004", clienteId: "c1" } });
    expect(r.status).toBe(409);
    const d = await r.json();
    expect(d.codigo).toBe("sin_archivo");
    expect(d.error).toMatch(/miniatura y su texto/);
    const mini = await pedir("/api/lo-mejor/traer", { method: "POST", body: { clave: "tt:7300000000000000004", clienteId: "c1", miniatura: true } });
    expect(mini.status).toBe(201);
    expect((await mini.json()).archivo.tipo).toBe("imagen");
  });
});

describe("las tendencias por palabra", () => {
  it("se guardan limpias por cliente y salen en el feed", async () => {
    const r = await pedir("/api/inspiracion/c1/tendencias", { method: "PUT", body: { palabras: ["#BabyShower", "cuna para bebé", "x", "#babyshower"] } });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.palabras.map((p) => p.palabra)).toEqual(["#babyshower", "cuna para bebé"]);
    expect(d.activas).toBe(true);
    const feed = await (await pedir("/api/inspiracion/c1")).json();
    expect(feed.tendencias.palabras).toHaveLength(2);
    expect(feed.sc).toBe(true);
    // Quitar una se lleva sus videos.
    await pedir("/api/inspiracion/c1/tendencias", { method: "PUT", body: { palabras: ["cuna para bebé"] } });
    expect(db.sqlite.prepare("select palabra from tendencias_palabras").all()).toEqual([{ palabra: "cuna para bebé" }]);
  });

  it("el cron las lee una por vuelta (por palabra; sin la fecha si no la entiende) y salen en «Lo mejor» con sus vistas", async () => {
    // Sin cuentas de TikTok: sólo las palabras.
    db.sqlite.prepare("update clients set competidores = '[]'").run();
    await pedir("/api/inspiracion/c1/tendencias", { method: "PUT", body: { palabras: ["cuna para bebé"] } });
    expect(await loMejorPendiente(env)).toBe(1);
    // La primera vez con la fecha de esta semana (la API la rechaza con 400, que no cobra) y luego sin ella.
    expect(pedidosSC.map((p) => p.ruta)).toEqual(["/v1/tiktok/search/keyword", "/v1/tiktok/search/keyword"]);
    expect(pedidosSC[0].params).toMatchObject({ query: "cuna para bebé", date_posted: "this-week" });
    expect(creditos()).toEqual([{ fuente: "auto", ruta: "/v1/tiktok/search/keyword" }]);
    const lm = await (await pedir("/api/lo-mejor?ventana=semana")).json();
    const t = lm.piezas.filter((p) => p.fuente === "tendencia");
    expect(t.map((p) => p.clave)).toEqual(["tt:7400000000000000001", "tt:7400000000000000002"]);
    expect(t[0].cifra.texto).toBe("1,2 M de vistas");
    expect(t[0].cifra.detalle).toContain("por cuna para bebé");
    expect(t[0].percentil).toBeGreaterThan(t[1].percentil);
    expect((await (await pedir("/api/lo-mejor?ventana=semana&fuente=tendencia")).json()).piezas).toHaveLength(2);
    // Ya leída esta semana: el cron no la repite (sin IA de texto no hay nada más que hacer).
    expect(await loMejorPendiente(env)).toBe(0);
    expect(pedidosSC).toHaveLength(2);
  });

  it("con el interruptor apagado ni se leen ni se enseñan", async () => {
    db.sqlite.prepare("update clients set competidores = '[]'").run();
    await pedir("/api/inspiracion/c1/tendencias", { method: "PUT", body: { palabras: ["#babyshower"] } });
    expect(await loMejorPendiente(env)).toBe(1);
    expect(pedidosSC.map((p) => p.ruta)).toEqual(["/v1/tiktok/search/hashtag"]);
    const apagar = await pedir("/api/lo-mejor/creditos", { method: "PUT", body: { tendencias: false } });
    expect((await apagar.json()).tendencias).toBe(false);
    expect((await (await pedir("/api/lo-mejor?ventana=semana")).json()).piezas.some((p) => p.fuente === "tendencia")).toBe(false);
    db.sqlite.prepare("update tendencias_palabras set leida_at = ?").run(new Date(Date.now() - 8 * DIA).toJSON());
    expect(await loMejorPendiente(env)).toBe(0);
    expect(pedidosSC).toHaveLength(1);
  });
});

describe("el reparto del tope", () => {
  const filtro = () => db.sqlite.prepare("insert into biblioteca_filtros (id, owner_id, client_id, nombre, consulta) values (?,?,?,?,?)")
    .run("f1", DUENO, "c1", "Competidor", JSON.stringify({ fuente: "sc", modo: "empresa", empresa: "Competidor" }));

  it("lo más viejo primero, nunca se pasa y lo que no cabe espera al lunes (sin mirarlo cada minuto)", async () => {
    filtro();
    // Los anuncios se releyeron hace 8 días; la cuenta y la palabra no se han leído nunca.
    db.sqlite.prepare("insert into lo_mejor_ajustes (id, owner_id, sc_tope_semana, sc_releido_at) values (?,?,?,?)")
      .run(DUENO, DUENO, 2, new Date(Date.now() - 8 * DIA).toJSON());
    // La fila de la cuenta la crea el cron de 20 h (sin leerla por Scrape Creators).
    expect(await inspiracionPendiente(env)).toBe(1);
    await pedir("/api/inspiracion/c1/tendencias", { method: "PUT", body: { palabras: ["#bebe"] } });
    expect(pedidosSC).toHaveLength(0);

    expect(await loMejorPendiente(env)).toBe(1);
    expect(await loMejorPendiente(env)).toBe(1);
    // Las dos que nunca se leyeron, antes que los anuncios (que se releyeron hace 8 días).
    expect(pedidosSC.map((p) => p.ruta).sort()).toEqual(["/v1/tiktok/search/hashtag", "/v3/tiktok/profile/videos"]);
    // El tope (2) ya está: la tercera vuelta marca el espacio lleno y NO llama.
    expect(await loMejorPendiente(env)).toBe(1);
    expect(pedidosSC).toHaveLength(2);
    expect(db.sqlite.prepare("select sc_lleno from lo_mejor_ajustes").get().sc_lleno).toBe(semanaDe(fechaEnZona()));
    // Y ya no lo mira: los anuncios esperan a la semana que viene.
    expect(await loMejorPendiente(env)).toBe(0);
    const c = await (await pedir("/api/lo-mejor/creditos")).json();
    expect(c).toMatchObject({ total: 2, auto: 2, tope: 2, lleno: true, libres: 0 });
    expect(c.espera).toMatchObject({ tiktok: 0, palabras: 0, anuncios: true, busquedas: 1 });

    // La semana que viene, con su tope entero, van los anuncios (lo más viejo).
    const lunes = new Date(Date.now() + 8 * DIA);
    expect(await loMejorPendiente(env, lunes)).toBe(1);
    expect(pedidosSC.at(-1).ruta).toBe("/v1/facebook/adLibrary/company/ads");
  });

  it("subir el tope deja leer lo que esperaba esa misma semana", async () => {
    await pedir("/api/lo-mejor/creditos", { method: "PUT", body: { tope: 0 } });
    expect(await inspiracionPendiente(env)).toBe(1);
    expect(await loMejorPendiente(env)).toBe(1);
    expect(pedidosSC).toHaveLength(0);
    expect(db.sqlite.prepare("select sc_lleno from lo_mejor_ajustes").get().sc_lleno).toBeTruthy();
    const r = await (await pedir("/api/lo-mejor/creditos", { method: "PUT", body: { tope: 5 } })).json();
    expect(r.lleno).toBe(false);
    expect(r.espera.tiktok).toBe(1);
    expect(await loMejorPendiente(env)).toBe(1);
    expect(pedidosSC.map((p) => p.ruta)).toEqual(["/v3/tiktok/profile/videos"]);
    expect(creditos()).toEqual([{ fuente: "auto", ruta: "/v3/tiktok/profile/videos" }]);
  });

  it("lo de a mano no se bloquea aunque se pase del tope, y se avisa", async () => {
    await pedir("/api/lo-mejor/creditos", { method: "PUT", body: { tope: 0 } });
    const d = await actualizar();
    expect(pedidosSC).toHaveLength(1);
    expect(d.avisoSC).toMatch(/se pasó del tope/);
  });

  it("la cuenta que el cliente ya no sigue no se lee: se borra", async () => {
    expect(await inspiracionPendiente(env)).toBe(1);
    // Se quita de la lista sin que el cron de 20 h haya pasado todavía.
    db.sqlite.prepare("update clients set competidores = '[]'").run();
    expect(await loMejorPendiente(env)).toBe(1);
    expect(pedidosSC).toHaveLength(0);
    expect(db.sqlite.prepare("select count(*) as n from inspiracion_cuentas").get().n).toBe(0);
  });
});
