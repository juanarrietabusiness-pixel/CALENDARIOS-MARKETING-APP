import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { EJEMPLO_GUION } from "../../src/lib/videoFormatoIA.js";
import { pedidoDeGuionAnimado, leerGuionAnimado, textoDePublicacion, duracionAnimado } from "../../src/lib/guionAnimadoIA.js";

// ============================================================
// «Escribir el guion con IA» del video animado (paso 4): con un Anthropic de mentira.
//
//   · el pedido lleva el formato contado a la IA, la idea, la publicación y el catálogo con los IDs de sus fotos;
//   · lo que vuelve se VALIDA; con errores, una sola vuelta de corrección; si tampoco, 502 sin guardar nada;
//   · nunca guarda: la pantalla lo abre como borrador.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;
let peticiones;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (t) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 4000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 900 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

function anthropic(respuestas) {
  peticiones = [];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) { peticiones.push(JSON.parse(opciones.body)); return flujo(respuestas.shift()); }
    throw new Error(`fetch inesperado a ${u}`);
  });
}
const textoPedido = (p) => p.messages.map((m) => (typeof m.content === "string" ? m.content : m.content.map((b) => b.text ?? "").join(""))).join("\n");

const pedir = (ruta, body) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  method: "POST", headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
}), env);

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: { get: async () => null, put: async () => {}, head: async () => null, delete: async () => {} }, ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "y");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("bc", JEFE, "Baby Caleb");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into calendars (id, owner_id, client_id, month, year, days) values (?,?,?,?,?,?)").run("cal1", JEFE, "bc", 11, 2026,
    JSON.stringify([{ date: "2026-11-20", posts: [{ id: "p1", format: "reel", title: "Toallitas sin alcohol", idea: "Por qué la piel del bebé se irrita", producto: "Toallitas" }] }]));
  s.prepare("insert into mercado_clientes (id, owner_id, client_id, catalogo) values (?,?,?,?)").run("m1", JEFE, "bc",
    JSON.stringify([{ id: "t1", nombre: "Toallitas", tipo: "producto", precio: "$4,50", activo: true, fotos: ["clientes/bc/estudio/toallitas.png"] }]));
  s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime) values (?,?,?,?,?,?)").run("foto1", JEFE, "bc", "clientes/bc/estudio/toallitas.png", "imagen", "image/png");
}, 30_000);
afterEach(() => { vi.unstubAllGlobals(); });

describe("lo puro", () => {
  it("el pedido lleva el formato, la duración en palabras, la publicación y, con errores, el anterior para corregir", () => {
    const p = pedidoDeGuionAnimado({ marca: "Baby Caleb", idea: "Tres errores", segundos: 20, formato: "1:1", productos: "Toallitas · fotos (archivo): foto1", publicacion: "Título: X" });
    expect(p).toMatch(/FORMATO DE ESCENAS v1/);
    expect(p).toMatch(/unos 20 segundos.*unas 50 palabras/);
    expect(p).toMatch(/formatos: \["1:1"\]/);
    expect(p).toMatch(/foto1/);
    expect(p).not.toMatch(/ERRORES/);
    const c = pedidoDeGuionAnimado({ marca: "B", idea: "x", segundos: 30, errores: [{ donde: "escenas[0].tipo", mensaje: "no existe" }], anterior: "{}" });
    expect(c).toMatch(/TU GUION ANTERIOR TENÍA ESTOS ERRORES[\s\S]*escenas\[0\]\.tipo: no existe/);
  });

  it("lee el JSON aunque venga con ``` o texto alrededor; la publicación se resume; la duración se acota", () => {
    expect(leerGuionAnimado("Aquí está:\n```json\n{\"version\":1}\n```")).toEqual({ version: 1 });
    expect(leerGuionAnimado("nada")).toBeNull();
    expect(textoDePublicacion({ title: "T", idea: "I", guion: "" })).toBe("Título: T\nIdea: I");
    expect(duracionAnimado(500)).toBe(150);
    expect(duracionAnimado("x")).toBe(30);
  });
});

describe("POST /api/videos/<c>/escribir", () => {
  it("escribe el guion con la publicación y el catálogo; no guarda nada", async () => {
    anthropic([`Listo:\n${JSON.stringify(EJEMPLO_GUION)}`]);
    const r = await pedir("/videos/bc/escribir", { idea: "", postId: "p1", segundos: 30, formato: "9:16" });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.guion.escenas.length).toBe(EJEMPLO_GUION.escenas.length);
    expect(j.corregido).toBe(false);
    expect(j.publicacion).toEqual({ calendarId: "cal1", postId: "p1" });
    expect(peticiones).toHaveLength(1);
    const t = textoPedido(peticiones[0]);
    expect(t).toMatch(/Por qué la piel del bebé se irrita/);
    expect(t).toMatch(/Toallitas.*fotos \(archivo\): foto1/);
    expect(db.sqlite.prepare("select count(*) n from videos_proyectos").get().n).toBe(0);
  });

  it("si sale con errores, UNA vuelta con ellos; si tampoco valida, 502", async () => {
    const malo = { ...EJEMPLO_GUION, escenas: [{ id: "e1", tipo: "inventado", habla: "x", capas: [] }] };
    anthropic([JSON.stringify(malo), JSON.stringify(EJEMPLO_GUION)]);
    const r = await pedir("/videos/bc/escribir", { idea: "Tres errores" });
    expect(r.status).toBe(200);
    expect((await r.json()).corregido).toBe(true);
    expect(textoPedido(peticiones[1])).toMatch(/TU GUION ANTERIOR TENÍA ESTOS ERRORES/);

    anthropic(["no es json", "tampoco"]);
    const mal = await pedir("/videos/bc/escribir", { idea: "Tres errores" });
    expect(mal.status).toBe(502);
    expect((await mal.json()).error).toMatch(/no escribió un guion válido/);
    expect(peticiones).toHaveLength(2);
  });

  it("E21 · el catálogo es SÓLO el producto del video y un precio que no es suyo se corrige (o no se guarda)", async () => {
    // Otro producto de la misma marca, con su precio: no tiene que llegar a un video de las toallitas.
    db.sqlite.prepare("update mercado_clientes set catalogo = ? where id = 'm1'").run(JSON.stringify([
      { id: "t1", nombre: "Toallitas", tipo: "producto", precio: "$4,50", beneficios: "sin alcohol", activo: true, fotos: ["clientes/bc/estudio/toallitas.png"] },
      { id: "p2", nombre: "Pañales", tipo: "producto", precio: "$32,99", beneficios: "fibras de bambú", activo: true },
    ]));
    db.sqlite.prepare("update calendars set days = ? where id = 'cal1'").run(JSON.stringify([{ date: "2026-11-20", posts: [{ id: "p1", format: "reel", title: "Toallitas", idea: "La piel del bebé", productoId: "t1" }] }]));
    const conPrecio = (precio) => ({ ...EJEMPLO_GUION, escenas: EJEMPLO_GUION.escenas.map((e, i) => (i === 0 ? { ...e, habla: `${e.habla} Por solo ${precio}.` } : e)) });
    anthropic([JSON.stringify(conPrecio("$32,99")), JSON.stringify(conPrecio("$4,50"))]);
    const r = await pedir("/videos/bc/escribir", { idea: "", postId: "p1" });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.corregido).toBe(true);
    const primero = textoPedido(peticiones[0]);
    expect(primero).toMatch(/EL PRODUCTO DE ESTE VIDEO[\s\S]*Toallitas/);
    expect(primero).not.toMatch(/Pañales|fibras de bambú/);
    expect(textoPedido(peticiones[1])).toMatch(/\$32\.99.*no es el precio del producto de este video/);
    // Con el precio de otro producto también en la corrección, no se da por bueno.
    anthropic([JSON.stringify(conPrecio("$32,99")), JSON.stringify(conPrecio("$32,99"))]);
    expect((await pedir("/videos/bc/escribir", { idea: "", postId: "p1" })).status).toBe(502);
  });

  it("sin idea ni publicación, 400 sin llamar a la IA", async () => {
    anthropic([]);
    const r = await pedir("/videos/bc/escribir", { idea: "  " });
    expect(r.status).toBe(400);
    expect(peticiones).toHaveLength(0);
  });
});
