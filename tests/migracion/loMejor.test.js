import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { loMejorPendiente } from "../../worker/lib/loMejor.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { fechaEnZona, sumarDias } from "../../src/lib/agenda.js";
import { semanaDe } from "../../src/lib/loMejor.js";

// ============================================================
// «Lo mejor» contra una D1 de verdad, con Meta, Anthropic y Scrape Creators de mentira
//
// Lo que importa: que las cuatro fuentes se junten sin repetir una pieza (la misma
// publicación seguida por dos clientes y guardada en el banco es UNA), que cada una
// se ordene por su percentil, que la clasificación sea una llamada BARATA (Haiku, sin
// razonar) que se guarda, que «Recrear» confirme el costo antes, cree la publicación en
// el próximo día libre con el original de REFERENCIA (nunca en medios) y deje al
// director mirando el original SÓLO como inspiración, que lo ya pagado no se pague otra
// vez, y que la relectura semanal de anuncios respete el tope de créditos.
// ============================================================

const DUENO = "u-jefe";
const TESTIGO = "testigo-lo-mejor";
const DIA = 86_400_000;
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3]);
const MP4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 1, 2, 3, 4]);
let db;
let env;
let llamadas;
let pedidosIA;
let respuestaIA;

const hace = (dias) => new Date(Date.now() - dias * DIA).toISOString();

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) { return objetos.has(clave) ? { arrayBuffer: async () => objetos.get(clave), httpMetadata: { contentType: "image/jpeg" }, size: objetos.get(clave).byteLength } : null; },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor) { objetos.set(clave, valor instanceof ReadableStream ? new Uint8Array(await new Response(valor).arrayBuffer()) : valor); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const sse = (texto) => {
  const ev = (t, d) => `event: ${t}\ndata: ${JSON.stringify(d)}\n\n`;
  return new Response([
    ev("message_start", { type: "message_start", message: { model: "claude-haiku-4-5", content: [], usage: { input_tokens: 10, output_tokens: 0 } } }),
    ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: texto } }),
    ev("content_block_stop", { type: "content_block_stop", index: 0 }),
    ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } }),
    ev("message_stop", { type: "message_stop" }),
  ].join(""), { headers: { "content-type": "text/event-stream" } });
};

const MEDIA_IG = [
  { id: "201", caption: "El reel que pegó", media_type: "VIDEO", media_product_type: "REELS", like_count: 900, comments_count: 80, timestamp: hace(2), permalink: "https://www.instagram.com/reel/PEGO01/", media_url: "https://scontent.cdninstagram.com/v.mp4", thumbnail_url: "https://scontent.cdninstagram.com/t.jpg" },
];

function anuncioSC(id, dias) {
  return { ad_archive_id: id, page_name: "Competidor", is_active: true, start_date: Math.floor((Date.now() - dias * DIA) / 1000), collation_count: 3, snapshot: { body: { text: `Anuncio ${id}` }, display_format: "IMAGE", images: [{ original_image_url: `https://scontent.xx.fbcdn.net/${id}.jpg` }] } };
}

async function sembrar() {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  const cuentas = JSON.stringify([{ red: "instagram", usuario: "mueblesx", tipo: "competencia" }]);
  s.prepare("insert into clients (id, owner_id, name, competidores) values (?,?,?,?)").run("c1", DUENO, "Dcasa", cuentas);
  s.prepare("insert into clients (id, owner_id, name, competidores) values (?,?,?,?)").run("c2", DUENO, "Rofer", cuentas);
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, usuario, token_cifrado, client_id) values (?,?,?,?,?,?,?)")
    .run("ig", DUENO, "instagram", "IG1", "dcasa", await cifrarMeta(env, "token-pagina"), "c1");

  // La inspiración: la MISMA cuenta seguida por los dos clientes (cada uno con sus filas).
  const pubs = [
    ["201", "PEGO01", "reel", 980, 6.5, 2, "https://scontent.cdninstagram.com/v.mp4"],
    ["202", "NORM02", "imagen", 150, 1, 4, ""],
    ["203", "NORM03", "imagen", 140, 0.9, 5, ""],
    ["204", "VIEJO4", "imagen", 300, 2, 20, ""],
  ];
  for (const c of ["c1", "c2"]) {
    const cuenta = `${c}:instagram:mueblesx`;
    s.prepare("insert into inspiracion_cuentas (id, owner_id, client_id, red, usuario, mediana) values (?,?,?,?,?,?)").run(cuenta, DUENO, c, "instagram", "mueblesx", 150);
    for (const [ext, codigo, formato, inter, rinde, dias, video] of pubs) {
      s.prepare(`insert into inspiracion_publicaciones (id, owner_id, client_id, cuenta_id, red, usuario, externo_id, codigo, formato, enlace, texto, miniatura, publicada_at, me_gusta, comentarios, interacciones, rinde, video)
        values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(`${cuenta}:${ext}`, DUENO, c, cuenta, "instagram", "mueblesx", ext, codigo, formato,
        `https://www.instagram.com/${formato === "reel" ? "reel" : "p"}/${codigo}/`, `Texto ${codigo}`, `https://scontent.cdninstagram.com/${codigo}.jpg`, hace(dias), inter, 10, inter, rinde, video);
    }
  }
  // Lo propio de Dcasa: tres publicaciones medidas.
  for (const [ext, inter, guardados, dias] of [["m1", 120, 30, 1], ["m2", 40, 2, 3], ["m3", 50, 1, 4]]) {
    s.prepare(`insert into metricas_publicacion (id, owner_id, client_id, cuenta_id, red, externo_id, tipo, enlace, texto, miniatura, publicada_at, interacciones, guardados, compartidos)
      values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(`mp-${ext}`, DUENO, "c1", "ig", "instagram", ext, "imagen", `https://www.instagram.com/p/PROPIA${ext}/`, `Propia ${ext}`, "", hace(dias), inter, guardados, 3);
  }
  // Una referencia del banco: la MISMA publicación que la inspiración (se une) y una de TikTok (aparte).
  const idea = (enlace, extra = {}) => JSON.stringify({ idea: "Guardada", format: "reel", referenceLink: enlace, ...extra });
  s.prepare("insert into banco_ideas (id, owner_id, client_id, datos, created_at, updated_at) values (?,?,?,?,?,?)").run("b1", DUENO, "c1", idea("https://www.instagram.com/reel/PEGO01/?igsh=x"), hace(1), hace(1));
  s.prepare("insert into banco_ideas (id, owner_id, client_id, datos, created_at, updated_at) values (?,?,?,?,?,?)").run("b2", DUENO, null, idea("https://www.tiktok.com/@alguien/video/7300000000000000001"), hace(1), hace(1));
  // Un anuncio ya releído.
  s.prepare(`insert into lo_mejor_anuncios (id, owner_id, client_id, filtro_id, anuncio_id, pagina, texto, formato, miniatura, activo, inicio, versiones, visto_at)
    values (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("f0:999", DUENO, "c1", "f0", "999", "Competidor", "Compra ya", "imagen", "https://scontent.xx.fbcdn.net/999.jpg", 1, sumarDias(fechaEnZona(), -63), 3, hace(1));
  // Dcasa ya tiene publicación MAÑANA: lo recreado va al día siguiente.
  const manana = sumarDias(fechaEnZona(), 1);
  s.prepare("insert into calendars (id, owner_id, client_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal1", DUENO, "c1", "Mes", Number(manana.slice(5, 7)) - 1, Number(manana.slice(0, 4)), JSON.stringify([{ date: manana, posts: [{ id: "p-ya", format: "post" }] }]));
}

const pedir = (ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test${ruta}`, {
  ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env, { waitUntil() {} });

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), META_APP_SECRET: "secreto", META_APP_ID: "app", ANTHROPIC_API_KEY: "k" };
  llamadas = [];
  pedidosIA = [];
  respuestaIA = '{"piezas":[]}';
  vi.stubGlobal("fetch", vi.fn(async (entrada, init = {}) => {
    const u = new URL(String(entrada));
    llamadas.push(`${u.host}${u.pathname}`);
    if (u.host === "api.anthropic.com") {
      if (u.pathname.endsWith("/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
      pedidosIA.push(JSON.parse(init.body));
      return sse(typeof respuestaIA === "function" ? respuestaIA() : respuestaIA);
    }
    if (u.host === "graph.facebook.com") {
      const bd = /business_discovery\.username\(([^)]+)\)/.exec(u.searchParams.get("fields") ?? "");
      return Response.json({ business_discovery: { username: bd[1], name: "Muebles X", followers_count: 1000, media: { data: MEDIA_IG } } });
    }
    if (u.host === "api.scrapecreators.com") {
      const id = u.searchParams.get("companyName") ?? u.searchParams.get("query") ?? "x";
      return Response.json({ results: [anuncioSC(`${id.length}01`, 40), anuncioSC(`${id.length}02`, 5)], credits_remaining: 90 });
    }
    if (u.hostname.endsWith("cdninstagram.com") || u.hostname.endsWith("fbcdn.net")) {
      if (u.pathname.endsWith(".mp4")) {
        const rango = new Headers(init.headers ?? {}).get("range");
        return new Response(MP4, { status: rango ? 206 : 200, headers: { "content-type": "video/mp4", "content-length": String(MP4.byteLength), ...(rango ? { "content-range": `bytes 0-19/20` } : {}) } });
      }
      return new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
    }
    throw new Error(`fetch inesperado a ${u}`);
  }));
  await sembrar();
});

afterEach(() => vi.unstubAllGlobals());

const leer = async (q = "") => {
  const r = await pedir(`/api/lo-mejor${q}`);
  expect(r.status).toBe(200);
  return r.json();
};

describe("reunir y ordenar", () => {
  it("una pieza es UNA aunque la sigan dos clientes y esté en el banco; cada fuente con su cifra", async () => {
    const d = await leer("?ventana=semana");
    const pego = d.piezas.filter((p) => p.clave === "ig:PEGO01");
    expect(pego).toHaveLength(1);
    expect(pego[0].fuente).toBe("inspiracion");
    expect(pego[0].clientes.sort()).toEqual(["c1", "c2"]);
    expect(pego[0].tambien).toContain("referencia");
    expect(pego[0].cifra.texto).toBe("rinde 6,5×");
    expect(pego[0].video).toMatch(/^\/api\/lo-mejor\/video\?u=/);
    expect(pego[0].miniatura).toMatch(/^\/api\/metricas\/miniatura\?u=/);
    // Lo mejor de su fuente va arriba.
    expect(d.piezas[0].percentil).toBeGreaterThanOrEqual(d.piezas.at(-1).percentil ?? 0);
    const anuncio = d.piezas.find((p) => p.fuente === "anuncio");
    expect(anuncio.cifra.texto).toBe("63 días activo");
    expect(anuncio.cifra.detalle).toContain("3 versiones");
    const propia = d.piezas.filter((p) => p.fuente === "propia");
    expect(propia[0].cifra.texto).toBe("Tu mejor de la semana");
    // Lo de hace 20 días no está en «esta semana», sí en «este mes».
    expect(d.piezas.some((p) => p.clave === "ig:VIEJO4")).toBe(false);
    expect((await leer("?ventana=mes")).piezas.some((p) => p.clave === "ig:VIEJO4")).toBe(true);
    // Una referencia de TikTok, general (sin cliente), entra en la vista global.
    expect(d.piezas.some((p) => p.clave === "tt:7300000000000000001")).toBe(true);
  });

  it("filtrada por un cliente sólo trae lo suyo, y la pieza de un aviso va primero", async () => {
    const d = await leer("?ventana=semana&cliente=c2");
    expect(d.piezas.every((p) => p.clientes.includes("c2"))).toBe(true);
    expect(d.piezas.some((p) => p.fuente === "propia")).toBe(false);
    const conAviso = await leer("?ventana=semana&pieza=ig:VIEJO4");
    expect(conAviso.piezas[0].clave).toBe("ig:VIEJO4");
    expect(conAviso.piezas[0].destacada).toBe(true);
    expect((await pedir("/api/lo-mejor?cliente=ajeno")).status).toBe(404);
  });
});

describe("clasificar", () => {
  it("una llamada barata (Haiku, sin razonar) que mira la miniatura y se guarda", async () => {
    respuestaIA = () => JSON.stringify({ piezas: [1, 2, 3, 4, 5, 6].map((n) => ({ n, tipo: n === 1 ? "ugc" : "otro", otro: "Lista de precios", persona: n === 1, idea: `Idea ${n}` })) });
    const r = await pedir("/api/lo-mejor/clasificar", { method: "POST", body: {} });
    expect(r.status).toBe(200);
    expect((await r.json()).clasificadas).toBeGreaterThan(0);
    expect(pedidosIA[0].model).toBe("claude-haiku-4-5");
    expect(pedidosIA[0].thinking).toBeUndefined();
    expect(JSON.stringify(pedidosIA[0].messages)).toContain('"type":"image"');
    const d = await leer("?ventana=semana");
    expect(d.piezas.some((p) => p.tipoNombre === "UGC con rostro" || p.tipoNombre === "Lista de precios")).toBe(true);
    // El costo quedó apuntado en su función.
    const consumo = db.sqlite.prepare("select funcion from consumo_ia").all();
    expect(consumo.map((c) => c.funcion)).toContain("clasificar lo mejor");
  });

  it("si la IA falla, queda apuntado y el cron no lo repite", async () => {
    respuestaIA = "no es json";
    await pedir("/api/lo-mejor/clasificar", { method: "POST", body: {} });
    const filas = db.sqlite.prepare("select clave, tipo, clasificada_at from lo_mejor_piezas").all();
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((f) => !f.tipo && !f.clasificada_at)).toBe(true);
  });
});

describe("recrear", () => {
  it("sin confirmar no crea nada: dice el costo y el próximo día libre", async () => {
    const r = await pedir("/api/lo-mejor/recrear", { method: "POST", body: { clave: "ig:NORM02", clienteId: "c1", camino: "imagen" } });
    expect(r.status).toBe(409);
    const d = await r.json();
    expect(d.codigo).toBe("confirmar");
    expect(d.fecha).toBe(sumarDias(fechaEnZona(), 2));
    expect(d.costo).toBeGreaterThan(0);
    expect(db.sqlite.prepare("select count(*) as n from estudio_encargos").get().n).toBe(0);
  });

  it("con el sí: la publicación con el original de REFERENCIA y el director mirándolo sólo como inspiración", async () => {
    const r = await pedir("/api/lo-mejor/recrear", { method: "POST", body: { clave: "ig:PEGO01", clienteId: "c1", camino: "imagen", confirmado: true } });
    expect(r.status).toBe(201);
    const d = await r.json();
    expect(d.fecha).toBe(sumarDias(fechaEnZona(), 2));
    const cal = db.sqlite.prepare("select days from calendars where id = ?").get(d.calendarId);
    const post = JSON.parse(cal.days).flatMap((x) => x.posts).find((p) => p.id === d.postId);
    expect(post.referencias).toHaveLength(1);
    expect(post.medios).toBeUndefined();
    expect(post.recreadoDe.clave).toBe("ig:PEGO01");
    const encargo = db.sqlite.prepare("select datos, pasos from estudio_encargos where id = ?").get(d.encargoId);
    const datos = JSON.parse(encargo.datos);
    expect(datos.especiales[0].papel).toBe("inspiracion");
    const [paso] = JSON.parse(encargo.pasos);
    expect(paso.pedido.postId).toBe(d.postId);
    // La imagen de otra marca no va al motor: no está en los medios del pedido.
    expect(JSON.stringify(paso.pedido.medios)).not.toContain("PEGO01");
  });

  it("para grabar de un video de YouTube ya visto: no paga a Gemini otra vez y el guion lleva qué audio usar", async () => {
    const s = db.sqlite;
    s.prepare("insert into inspiracion_cuentas (id, owner_id, client_id, red, usuario) values (?,?,?,?,?)").run("c1:youtube:canal", DUENO, "c1", "youtube", "canal");
    s.prepare(`insert into inspiracion_publicaciones (id, owner_id, client_id, cuenta_id, red, usuario, externo_id, formato, enlace, texto, publicada_at, interacciones, vistas, rinde)
      values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("yt1", DUENO, "c1", "c1:youtube:canal", "youtube", "canal", "aaaaaaaaaaa", "short", "https://www.youtube.com/shorts/aaaaaaaaaaa", "Short", hace(1), 500, 9000, 3);
    const transcripcion = { tramos: [{ desde: 0, hasta: 3, voz: "Mira esto", seVe: "Persona a cámara" }, { desde: 3, hasta: 8, voz: "Te cuento", seVe: "Producto" }], duracion: 8, gancho: "pregunta", porQue: "directo", estructura: "problema → solución" };
    s.prepare("insert into lo_mejor_piezas (id, owner_id, clave, datos) values (?,?,?,?)").run(`${DUENO}|yt:aaaaaaaaaaa`, DUENO, "yt:aaaaaaaaaaa", JSON.stringify({ transcripcion }));
    respuestaIA = "TITULO: Mira esto\nGUION:\n[0–3 s] VOZ: «Mira esto» | SE VE: tú a cámara | TEXTO: —\n[3–15 s] VOZ: «Te cuento por qué» | SE VE: el producto | TEXTO: —\nGANCHOS:\n- ¿Sabías?\nDESCRIPCION: Pruébalo. #a\nAUDIO: Un audio en tendencia de ritmo alegre.";
    const r = await pedir("/api/lo-mejor/recrear", { method: "POST", body: { clave: "yt:aaaaaaaaaaa", clienteId: "c1", camino: "grabar", confirmado: true } });
    expect(r.status).toBe(201);
    const d = await r.json();
    expect(llamadas.some((l) => l.includes("generativelanguage"))).toBe(false);
    const post = JSON.parse(db.sqlite.prepare("select days from calendars where id = ?").get(d.calendarId).days).flatMap((x) => x.posts).find((p) => p.id === d.postId);
    expect(post.rostro).toBe(true);
    expect(post.format).toBe("reel");
    expect(post.audioUgc).toContain("tendencia");
    expect(post.guion).toContain("Mira esto");
  });

  it("traer dos veces la misma publicación la baja UNA vez", async () => {
    const traer = () => pedir("/api/lo-mejor/traer", { method: "POST", body: { clave: "ig:PEGO01", clienteId: "c1" } });
    expect((await traer()).status).toBe(201);
    const bajadas = llamadas.filter((l) => l.endsWith("/v.mp4")).length;
    const segunda = await (await traer()).json();
    expect(segunda.archivo.repetido).toBe(true);
    expect(llamadas.filter((l) => l.endsWith("/v.mp4")).length).toBe(bajadas);
  });
});

describe("anuncios de cada semana y el tope de créditos", () => {
  const filtro = (id, empresa) => db.sqlite.prepare("insert into biblioteca_filtros (id, owner_id, client_id, nombre, consulta) values (?,?,?,?,?)")
    .run(id, DUENO, "c1", empresa, JSON.stringify({ fuente: "sc", modo: "empresa", empresa }));

  it("relee las búsquedas guardadas hasta el tope (lo buscado a mano cuenta)", async () => {
    env.SCRAPECREATORS_API_KEY = "llave";
    filtro("f1", "Uno");
    filtro("f2", "Dos largo");
    filtro("f3", "Tres más largo");
    // Una búsqueda a mano desde la Biblioteca: un crédito.
    expect((await pedir(`/api/biblioteca/sc/anuncios?c=${encodeURIComponent(JSON.stringify({ modo: "empresa", empresa: "Otra" }))}`)).status).toBe(200);
    expect((await (await pedir("/api/lo-mejor/creditos", { method: "PUT", body: { tope: 3 } })).json()).tope).toBe(3);
    const r = await (await pedir("/api/lo-mejor/anuncios", { method: "POST", body: {} })).json();
    expect(r.creditos).toBe(2);
    expect(r.sinCreditos).toBe(true);
    const c = await (await pedir("/api/lo-mejor/creditos")).json();
    expect(c).toMatchObject({ manual: 3, total: 3, tope: 3, semana: semanaDe() });
    expect(db.sqlite.prepare("select count(*) as n from lo_mejor_anuncios where filtro_id in ('f1','f2')").get().n).toBe(4);
  });

  it("el cron relee una vez por semana y después clasifica", async () => {
    env.SCRAPECREATORS_API_KEY = "llave";
    filtro("f1", "Uno");
    expect(await loMejorPendiente(env)).toBe(1);
    const sc = llamadas.filter((l) => l.startsWith("api.scrapecreators.com")).length;
    expect(sc).toBe(1);
    respuestaIA = JSON.stringify({ piezas: [{ n: 1, tipo: "anuncio", persona: false, idea: "Oferta" }] });
    expect(await loMejorPendiente(env)).toBe(1);
    expect(llamadas.filter((l) => l.startsWith("api.scrapecreators.com")).length).toBe(sc);
    expect(pedidosIA.length).toBe(1);
  });
});

describe("el video, por el proxy", () => {
  it("sólo del CDN de Meta y por trozos", async () => {
    const malo = await pedir(`/api/lo-mejor/video?u=${encodeURIComponent("https://evil.example.com/v.mp4")}`);
    expect(malo.status).toBe(404);
    const r = await pedir(`/api/lo-mejor/video?u=${encodeURIComponent("https://scontent.cdninstagram.com/v.mp4")}`, { headers: { Range: "bytes=0-" } });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-type")).toBe("video/mp4");
    expect(r.headers.get("content-security-policy")).toBe("sandbox");
  });
});

describe("Claude (MCP)", () => {
  const mcp = () => crearHerramientasMCP({ env, acceso: crearAcceso(db, DUENO), usuario: { id: DUENO, nombre: "Juan" } });

  it("ver_lo_mejor da la lista con sus claves, las miniaturas como imágenes y la vista previa", async () => {
    const def = HERRAMIENTAS_MCP.find((h) => h.name === "ver_lo_mejor");
    expect(def._meta.ui.resourceUri).toMatch(/^ui:\/\//);
    const r = await mcp().llamar("ver_lo_mejor", { cliente: "Dcasa" });
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toContain("[ig:PEGO01]");
    expect(r.content.some((b) => b.type === "image")).toBe(true);
    expect(r.structuredContent.piezas.length).toBeGreaterThan(0);
  });

  it("recrear sin el sí no crea nada y dice el costo; con el sí, crea", async () => {
    const r = await mcp().llamar("recrear", { clave: "ig:NORM02", cliente: "Dcasa", camino: "imagen" });
    expect(r.content[0].text).toMatch(/^NO SE CREÓ NADA/);
    expect(r.structuredContent.tipo).toBe("plan");
    expect(db.sqlite.prepare("select count(*) as n from estudio_encargos").get().n).toBe(0);
    const hecho = await mcp().llamar("recrear", { clave: "ig:NORM02", cliente: "Dcasa", camino: "imagen", confirmado: true });
    expect(hecho.content[0].text).toMatch(/^Hecho para Dcasa/);
    expect(db.sqlite.prepare("select count(*) as n from estudio_encargos").get().n).toBe(1);
  });
});
