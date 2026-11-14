import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";

// ============================================================
// «Desglosar toma por toma» y el reel que sigue la forma de un video, por las rutas de verdad
//
//   1. Gemini VE el video con el pedido del desglose; lo leído queda en la ficha y la segunda vez no se paga.
//   2. Una imagen no se desglosa; un video de otro cliente, tampoco.
//   3. El guion del reel con un video desglosado lleva su mapa de secuencia RESUMIDO; sin desglose, 400 sin llamar a nadie.
//   4. Claude: deconstruir_video devuelve el desglose guardado sin pagar y crear_reel con video_referencia lo sigue.
// Nada llama a un servicio de verdad: `fetch` de mentira con la forma de Gemini y de Anthropic.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;
let llamadas;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const o = objetos.get(clave);
      return { httpMetadata: { contentType: o.tipo }, size: o.bytes.byteLength, arrayBuffer: async () => o.bytes };
    },
    async head(clave) { return objetos.has(clave) ? { httpMetadata: { contentType: objetos.get(clave).tipo } } : null; },
    async put(clave, valor, op) {
      const bytes = valor instanceof ReadableStream ? new Uint8Array(await new Response(valor).arrayBuffer()) : new Uint8Array(valor);
      objetos.set(clave, { bytes, tipo: op?.httpMetadata?.contentType });
    },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, ...(opciones.body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: opciones.body === undefined || opciones.body instanceof FormData ? opciones.body : JSON.stringify(opciones.body),
  }), env);

const MP4 = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);

const DESGLOSE = {
  ficha: { duracion: 12, proporcion: "9:16", origen: "teléfono", produccion: "telefono", produccionPorque: "cámara en mano", postproduccion: "texto encima" },
  recurrentes: { sujetos: "Una mujer de unos 30 años", lugares: "Una cocina", color: "cálido", luz: "ventana a la izquierda", audio: "voz en cuadro" },
  tomas: [
    { desde: 0, hasta: 3, plano: "primer plano", angulo: "altura de ojos", movimiento: "cámara en mano", contenido: "La mujer mira a cámara con cara de cansancio.", dice: "¿Te pasa?", texto: "", transicion: "corte directo" },
    { desde: 3, hasta: 7, plano: "plano detalle", angulo: "cenital", movimiento: "fijo", contenido: "Las manos abren una caja.", transicion: "corte directo" },
    { desde: 7, hasta: 12, plano: "plano medio", angulo: "altura de ojos", movimiento: "acercamiento", contenido: "La mujer sonríe con el producto.", transicion: "" },
  ],
  montaje: { ritmo: "parejo", musica: "cortes en los golpes" },
  noSeSabe: [],
};

const REEL = {
  hilo: "luz cálida de cocina", gancho: "¿Te pasa?", llamado: "Escríbenos",
  planos: [
    { desde: 0, hasta: 3, escena: "Una mamá cansada mira a cámara", camara: "cámara en mano", toma: "movimiento", dice: "¿Te pasa?" },
    { desde: 3, hasta: 7, escena: "Las manos abren la caja de pañales", camara: "fija", toma: "fija", dice: "Llegó la solución." },
    { desde: 7, hasta: 10, escena: "La mamá sonríe con el producto", camara: "acercamiento", toma: "fija", dice: "Escríbenos." },
  ],
  musica: "pop suave", locucion: "¿Te pasa? Llegó la solución. Escríbenos.", efectos: "", descripcion: "Para tu bebé.",
};

function gemini(respuesta = DESGLOSE) {
  llamadas = [];
  vi.stubGlobal("fetch", async (url, op = {}) => {
    const u = String(url);
    if (u.includes("/upload/v1beta/files")) return new Response("{}", { headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/subida/1" } });
    if (u.endsWith("/subida/1")) return Response.json({ file: { name: "files/1", state: "ACTIVE", uri: "https://g/files/1", mimeType: "video/mp4" } });
    if (u.includes(":generateContent")) {
      llamadas.push(JSON.parse(op.body));
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(respuesta) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 } });
    }
    if (op.method === "DELETE") return new Response("{}");
    throw new Error(`fetch inesperado a ${u}`);
  });
}

function anthropic(texto) {
  llamadas = [];
  vi.stubGlobal("fetch", async (url, op = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) { llamadas.push(JSON.parse(op.body)); return flujo(texto); }
    throw new Error(`fetch inesperado a ${u}`);
  });
}

async function subir(bytes = MP4, nombre = "reel.mp4", tipo = "video/mp4", cliente = "c1") {
  const form = new FormData();
  form.set("archivo", new File([bytes], nombre, { type: tipo }));
  const r = await pedir(`/api/estudio/${cliente}/archivos`, { method: "POST", body: form });
  expect(r.status).toBe(201);
  return (await r.json()).archivo;
}

const ajustesDe = (id) => JSON.parse(db.sqlite.prepare("select ajustes from estudio_archivos where id = ?").get(id).ajustes || "{}");
const conDesglose = (id) => db.sqlite.prepare("update estudio_archivos set ajustes = ? where id = ?")
  .run(JSON.stringify({ deconstruccion: { ...DESGLOSE, tomas: DESGLOSE.tomas.map((t, i) => ({ ...t, n: i + 1, dura: t.hasta - t.desde })) } }), id);
const textoDelPedido = (b) => [b.system, ...(b.messages ?? []).flatMap((m) => (Array.isArray(m.content) ? m.content.map((c) => c.text ?? "") : [m.content]))].flat().map((x) => (typeof x === "string" ? x : x?.text ?? "")).join("\n");

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", GOOGLE_AI_KEY: "g", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-otro", "otro@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Dcasa");
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("«Desglosar toma por toma»", () => {
  it("Gemini lo ve con el pedido del desglose, queda en la ficha y la segunda vez no se paga", async () => {
    const archivo = await subir();
    gemini();
    const r = await pedir(`/api/estudio/c1/archivos/${archivo.id}/deconstruir`, { method: "POST", body: {} });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.guardada).toBe(false);
    expect(d.deconstruccion.tomas.map((t) => [t.n, t.desde, t.hasta])).toEqual([[1, 0, 3], [2, 3, 7], [3, 7, 12]]);
    expect(d.deconstruccion.cuenta).toMatchObject({ tomas: 3, duracion: 12 });
    // El pedido es el del desglose: describir, sin opinar.
    expect(JSON.stringify(llamadas[0])).toMatch(/TOMA POR TOMA/);
    expect(ajustesDe(archivo.id).deconstruccion.tomas).toHaveLength(3);
    // Se apunta el gasto con su función.
    expect(db.sqlite.prepare("select count(*) n from consumo_ia where funcion = ?").get("desglose de video").n).toBe(1);

    const otra = await (await pedir(`/api/estudio/c1/archivos/${archivo.id}/deconstruir`, { method: "POST", body: {} })).json();
    expect(otra.guardada).toBe(true);
    expect(llamadas).toHaveLength(1);
    // «Otra vez» sí se paga.
    await pedir(`/api/estudio/c1/archivos/${archivo.id}/deconstruir`, { method: "POST", body: { otraVez: true } });
    expect(llamadas).toHaveLength(2);
  });

  it("una imagen no se desglosa y el video de otro cliente no se encuentra; sin llamar a nadie", async () => {
    const imagen = await subir(PNG, "foto.png", "image/png");
    const video = await subir(MP4, "otro.mp4", "video/mp4", "c2");
    gemini();
    expect((await pedir(`/api/estudio/c1/archivos/${imagen.id}/deconstruir`, { method: "POST", body: {} })).status).toBe(400);
    expect((await pedir(`/api/estudio/c1/archivos/${video.id}/deconstruir`, { method: "POST", body: {} })).status).toBe(404);
    expect(llamadas).toHaveLength(0);
  });

  it("una respuesta sin tomas es un 502 y no se guarda nada", async () => {
    const archivo = await subir();
    gemini({ ficha: {}, tomas: [] });
    expect((await pedir(`/api/estudio/c1/archivos/${archivo.id}/deconstruir`, { method: "POST", body: {} })).status).toBe(502);
    expect(ajustesDe(archivo.id).deconstruccion).toBeUndefined();
  });
});

describe("el reel que sigue la forma de un video desglosado", () => {
  it("el pedido del guion lleva el mapa de secuencia resumido y la respuesta dice qué video sigue", async () => {
    const archivo = await subir();
    conDesglose(archivo.id);
    anthropic(JSON.stringify(REEL));
    const r = await pedir("/api/estudio/c1/reel/guion", { method: "POST", body: { idea: "Pañales para la noche", segundos: 10, videoReferenciaId: archivo.id } });
    expect(r.status).toBe(200);
    const g = await r.json();
    expect(g.sigueVideo).toEqual({ archivoId: archivo.id, tomas: 3 });
    const pedido = textoDelPedido(llamadas[0]);
    expect(pedido).toMatch(/LA FORMA DE UN VIDEO DE REFERENCIA, TOMA POR TOMA/);
    expect(pedido).toMatch(/nunca su marca, sus personas, su texto ni lo que dice/);
    expect(pedido).toMatch(/plano detalle/);
    expect(pedido).toMatch(/Los planos de este reel siguen esa secuencia/);
  });

  it("sin video de referencia, el pedido es el de siempre", async () => {
    anthropic(JSON.stringify(REEL));
    const g = await (await pedir("/api/estudio/c1/reel/guion", { method: "POST", body: { idea: "Pañales para la noche", segundos: 10 } })).json();
    expect(g.sigueVideo).toBeUndefined();
    expect(textoDelPedido(llamadas[0])).not.toMatch(/LA FORMA DE UN VIDEO DE REFERENCIA/);
  });

  it("un video escogido sin desglose: 400 y no se llama a la IA", async () => {
    const archivo = await subir();
    anthropic(JSON.stringify(REEL));
    const r = await pedir("/api/estudio/c1/reel/guion", { method: "POST", body: { idea: "x", segundos: 10, videoReferenciaId: archivo.id } });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/desglósalo primero/);
    expect(llamadas).toHaveLength(0);
  });
});

describe("Claude: deconstruir_video y crear_reel con video_referencia", () => {
  const mcp = () => crearHerramientasMCP({ env, acceso: crearAcceso(db, JEFE), usuario: { id: JEFE, nombre: "Juan" } });
  const textoDe = (r) => (r.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");

  it("está entre las herramientas y escribe (no es de sólo lectura)", () => {
    const h = HERRAMIENTAS_MCP.find((x) => x.name === "deconstruir_video");
    expect(h).toBeTruthy();
    expect(h.annotations?.readOnlyHint).not.toBe(true);
    expect(HERRAMIENTAS_MCP.find((x) => x.name === "crear_reel").inputSchema.properties.video_referencia).toBeTruthy();
  });

  it("con el desglose guardado lo devuelve sin pagar, con el mapa de secuencia y cómo seguirlo", async () => {
    const archivo = await subir();
    conDesglose(archivo.id);
    gemini();
    const r = await mcp().llamar("deconstruir_video", { cliente: "Baby Caleb", archivo_id: archivo.id });
    expect(r.isError).toBeUndefined();
    const t = textoDe(r);
    expect(t).toMatch(/no se pagó otra vez/);
    expect(t).toMatch(/Mapa de secuencia/);
    expect(t).toContain(`video_referencia="${archivo.id}"`);
    expect(llamadas).toHaveLength(0);
  });

  it("crear_reel con un video sin desglose vuelve con el error y no crea nada", async () => {
    const archivo = await subir();
    anthropic(JSON.stringify(REEL));
    const r = await mcp().llamar("crear_reel", { cliente: "Baby Caleb", idea: "x", video_referencia: archivo.id });
    expect(r.isError).toBe(true);
    expect(textoDe(r)).toMatch(/desglósalo primero/);
    expect(db.sqlite.prepare("select count(*) n from estudio_encargos").get().n).toBe(0);
  });
});
