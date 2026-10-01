import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { instruccionApego, presupuestoMemoria, pedidoDePrompt, leerPrompts, MAX_DIAPOSITIVAS } from "../../worker/lib/estudio/prompt.js";

// ============================================================
// «Escribir el prompt»: la IA lee la idea, MIRA las referencias y escribe
//
// Lo que importa:
//   1. Las referencias van como IMÁGENES y son del mismo cliente.
//   2. La memoria de la marca entra según el deslizador, y nunca lo interno.
//   3. Un carrusel trae un prompt por diapositiva, con el estilo común dentro.
//   4. Es texto: no crea ningún trabajo ni llama a ningún motor de imagen.
// ============================================================

describe("lo puro", () => {
  it("el apego a las referencias, en tres tramos", () => {
    expect(instruccionApego(0)).toMatch(/sólo como inspiración/);
    expect(instruccionApego(50)).toMatch(/estilo, su paleta/);
    expect(instruccionApego(100)).toMatch(/Replica su composición/);
    expect(instruccionApego(500)).toMatch(/100 %/);
  });

  it("la memoria: 0 es nada; más, más presupuesto y más notas", () => {
    expect(presupuestoMemoria(0)).toBeNull();
    const poca = presupuestoMemoria(10);
    const mucha = presupuestoMemoria(100);
    expect(mucha.presupuesto).toBeGreaterThan(poca.presupuesto);
    expect(mucha.n).toBeGreaterThan(poca.n);
  });

  it("un carrusel pide el estilo común y un prompt COMPLETO por diapositiva", () => {
    const p = pedidoDePrompt({ idea: "5 consejos para elegir pisos", diapositivas: 5, referencias: 0 });
    expect(p).toMatch(/CARRUSEL DE 5 DIAPOSITIVAS/);
    expect(p).toMatch(/"estilo"/);
    expect(pedidoDePrompt({ idea: "x", diapositivas: 99 })).toMatch(new RegExp(`CARRUSEL DE ${MAX_DIAPOSITIVAS} `));
    expect(pedidoDePrompt({ idea: "x" })).not.toMatch(/CARRUSEL/);
  });

  it("sin memoria se le dice que no use la marca", () => {
    expect(pedidoDePrompt({ idea: "x", guia: null })).toMatch(/No uses nada de la identidad de la marca/);
    expect(pedidoDePrompt({ idea: "x", guia: "Azul marino", memoria: 70 })).toMatch(/APEGO A LA MEMORIA DE LA MARCA: 70 %[\s\S]*Azul marino/);
  });

  it("lee la respuesta aunque traiga texto alrededor; sin JSON, el texto vale de prompt", () => {
    expect(leerPrompts('Aquí va:\n{"estilo": "azul", "prompts": ["uno", "dos", "tres"]}\nListo', 2)).toEqual({ estilo: "azul", prompts: ["uno", "dos"] });
    expect(leerPrompts("Una taza de café sobre madera", 1)).toEqual({ estilo: "", prompts: ["Una taza de café sobre madera"] });
    expect(leerPrompts("", 1).prompts).toEqual([]);
  });
});

// ------------------------------------------------------------
// La ruta, con Anthropic de mentira
// ------------------------------------------------------------

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG = Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));
let db;
let env;
let peticiones;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

function anthropic(texto) {
  peticiones = [];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      peticiones.push(JSON.parse(opciones.body));
      return flujo(texto);
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const o = objetos.get(clave);
      const bytes = typeof o.bytes === "string" ? new TextEncoder().encode(o.bytes) : o.bytes;
      return { httpMetadata: { contentType: o.tipo }, arrayBuffer: async () => bytes, text: async () => new TextDecoder().decode(bytes) };
    },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor, op) { objetos.set(clave, { bytes: typeof valor === "string" ? valor : new Uint8Array(valor), tipo: op?.httpMetadata?.contentType }); },
    async delete(clave) { objetos.delete(clave); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const escribir = (datos) => pedir("/api/estudio/c1/prompt", { method: "POST", body: datos });
const textoDe = (p) => p.messages[0].content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Otro");
  env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/ref.png", { bytes: PNG, tipo: "image/png" });
  env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/prueba.svg", { bytes: "<svg/>", tipo: "image/svg+xml" });
  env.MEDIA.objetos.set("clientes/c2/estudio/2026-09/ajena.png", { bytes: PNG, tipo: "image/png" });
  // El cerebro: su identidad visual y una nota interna que no puede salir.
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Identidad visual", texto: "Paleta azul marino y arena; fotografía cálida con luz natural; nunca fondos negros.", tipo: "marca" } });
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Costos", texto: "El costo del sofá es de 200 dólares y el margen del 40 %.", tipo: "documento", interna: true } });
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("POST /api/estudio/<cliente>/prompt", () => {
  it("mira las referencias (como imágenes) y devuelve el prompt; no crea ningún trabajo", async () => {
    anthropic('{"prompts": ["Sofá color arena en una sala con luz natural, encuadre amplio"]}');
    const res = await escribir({ idea: "un sofá en una sala bonita", referencias: ["/api/media/clientes/c1/estudio/2026-09/ref.png"], apego: 80, memoria: 60 });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.prompts).toEqual(["Sofá color arena en una sala con luz natural, encuadre amplio"]);
    expect(r.referencias).toBe(1);
    const p = peticiones[0];
    expect(p.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } });
    expect(textoDe(p)).toMatch(/APEGO A LAS REFERENCIAS: 80 %/);
    expect(db.sqlite.prepare("select count(*) as n from estudio_trabajos").get().n).toBe(0);
    const apunte = db.sqlite.prepare("select funcion, client_id from consumo_ia").get();
    expect({ ...apunte }).toEqual({ funcion: "prompt de imagen", client_id: "c1" });
  });

  it("con memoria entra la identidad visual y NUNCA lo interno; con 0 %, nada de la marca", async () => {
    anthropic('{"prompts": ["x"]}');
    await escribir({ idea: "un sofá", memoria: 100 });
    expect(textoDe(peticiones[0])).toMatch(/azul marino/);
    expect(textoDe(peticiones[0])).not.toMatch(/margen|200 dólares/);
    anthropic('{"prompts": ["x"]}');
    await escribir({ idea: "un sofá", memoria: 0 });
    expect(textoDe(peticiones[0])).not.toMatch(/azul marino/);
    expect(textoDe(peticiones[0])).toMatch(/No uses nada de la identidad/);
  });

  it("un carrusel trae un prompt por diapositiva y el estilo común", async () => {
    anthropic('{"estilo": "fondo arena, tipografía serif", "prompts": ["Portada…", "Consejo 1…", "Consejo 2…"]}');
    const r = await (await escribir({ idea: "3 consejos para elegir pisos", diapositivas: 3 })).json();
    expect(r).toMatchObject({ estilo: "fondo arena, tipografía serif", prompts: ["Portada…", "Consejo 1…", "Consejo 2…"] });
    expect(textoDe(peticiones[0])).toMatch(/CARRUSEL DE 3 DIAPOSITIVAS/);
  });

  it("una referencia de otro cliente es 400; una tarjeta de prueba (SVG) no se le enseña a la IA", async () => {
    anthropic('{"prompts": ["x"]}');
    expect((await escribir({ idea: "x", referencias: ["/api/media/clientes/c2/estudio/2026-09/ajena.png"] })).status).toBe(400);
    expect(peticiones).toHaveLength(0);
    await escribir({ idea: "x", referencias: ["/api/media/clientes/c1/estudio/2026-09/prueba.svg"] });
    expect(peticiones[0].messages[0].content.some((b) => b.type === "image")).toBe(false);
  });

  it("sin idea no se llama a nadie", async () => {
    anthropic('{"prompts": ["x"]}');
    const res = await escribir({ idea: "  " });
    expect(res.status).toBe(400);
    expect(peticiones).toHaveLength(0);
  });
});
