import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";

// ============================================================
// El estratega de campañas: el manual, el plan y los planes guardados
//
// Lo que importa:
//   1. El plan de un cliente lee su catálogo, su estudio y su cerebro —con
//      lo interno: los márgenes sirven para las cuentas— y el manual de la
//      agencia va delante.
//   2. Las cuentas vienen hechas (el costo máximo por resultado no lo
//      inventa la IA).
//   3. Alguien que no es cliente también: con lo que se escriba.
//   4. El manual lo cambia la agencia, no un colaborador; un colaborador
//      no arma planes de fuera ni de clientes ajenos.
//   5. Nada de esto llama a Meta.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;
let peticiones;
let respuestas;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto, { parada = "end_turn", busquedas = 0 } = {}) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: parada }, usage: { output_tokens: 400, server_tool_use: { web_search_requests: busquedas } } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

/** Cada llamada a /v1/messages toma la siguiente respuesta de la lista (una función recibe el cuerpo). */
function anthropic(...lista) {
  peticiones = [];
  respuestas = [...lista];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      const cuerpo = JSON.parse(opciones.body);
      peticiones.push(cuerpo);
      const r = respuestas.length > 1 ? respuestas.shift() : respuestas[0];
      return typeof r === "function" ? r(cuerpo) : r;
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
    async put(clave, valor, op) {
      const bytes = typeof valor === "string" ? valor : valor instanceof ReadableStream ? new Uint8Array(await new Response(valor).arrayBuffer()) : new Uint8Array(valor);
      objetos.set(clave, { bytes, tipo: op?.httpMetadata?.contentType });
    },
    async delete(clave) { objetos.delete(clave); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, ...(opciones.body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: opciones.body === undefined || opciones.body instanceof FormData ? opciones.body : JSON.stringify(opciones.body),
  }), env);
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-otro", "otro@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, industry) values (?,?,?,?)").run("c1", JEFE, "Dcasa", "Limpieza de muebles");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("ajeno", "u-otro", "De otra agencia");
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Servicios", texto: "Lavamos muebles a domicilio desde $45. Secado en 4 horas.", tipo: "marca" } });
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Costos", texto: "El costo del químico es de 3 dólares y el margen del 70 %.", tipo: "documento", interna: true } });
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

const CATALOGO = [{ id: "p-lavado", nombre: "Lavado de muebles", tipo: "servicio", precio: "Desde $45", beneficios: "Seca en 4 horas" }];

const PLAN = {
  resumen: "Lavado a WhatsApp.", embudo: [{ etapa: "frio", objetivo: "Conversaciones", idea: "Antes y después" }],
  costos: { conservador: 3, esperado: 2, optimista: 1 }, presupuesto: { diario: 10, dias: 30 },
  ofertas: [{ tipo: "garantia", texto: "Si no queda limpio, se repite gratis" }], maletas: {},
  campana: {
    objetivo: "OUTCOME_SALES", destino: "whatsapp",
    conjuntos: [{ tipo: "intereses", presupuestoDiario: 5, edadMin: 25, edadMax: 55, intereses: ["Limpieza"], lugar: "Panamá" }, { tipo: "advantage", presupuestoDiario: 5 }],
    anuncios: [{ formato: "unico", angulo: "Dolor", texto: "¿Manchas en el sofá?", titulo: "Desde $45" }],
  },
  pasos: [], riesgos: [],
};

const plan = (cuerpoPedido) => pedir("/api/anuncios/estratega", { method: "POST", body: cuerpoPedido });

describe("el manual de campañas de la agencia", () => {
  it("se guarda limpio y lo lee el estratega, delante de todo", async () => {
    let r = await pedir("/api/anuncios/manual", { method: "PUT", body: { reglas: "Siempre a WhatsApp. Mínimo 5 $ por conjunto.", tasaCierre: 25 } });
    expect(r.status).toBe(200);
    expect((await (await pedir("/api/anuncios/manual")).json())).toMatchObject({ reglas: "Siempre a WhatsApp. Mínimo 5 $ por conjunto.", tasaCierre: 25 });
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: CATALOGO } });
    anthropic(flujo(JSON.stringify(PLAN)));
    r = await plan({ clientId: "c1", productoId: "p-lavado", margen: 70, diario: 10 });
    expect(r.status).toBe(200);
    const t = textoDe(peticiones[0]);
    expect(t.indexOf("Siempre a WhatsApp")).toBeLessThan(t.indexOf("LO QUE SE ANUNCIA"));
    // La tasa de cierre del manual entra en las cuentas: 45 × 70 % × 25 % = 7,88.
    const d = await r.json();
    expect(d.eco).toMatchObject({ precio: 45, ganancia: 31.5, tasaCierre: 25, costoMaxResultado: 7.88 });
    expect(t).toContain("Costo máximo por resultado 7.88");
  });
});

describe("el plan de un cliente", () => {
  it("lee el catálogo (precio exacto), su cerebro con lo interno, y devuelve el plan limpio", async () => {
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: CATALOGO } });
    anthropic(flujo(JSON.stringify(PLAN)));
    const r = await plan({ clientId: "c1", productoId: "p-lavado", margen: 70 });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.plan.campana.conjuntos).toHaveLength(2);
    expect(d.producto).toEqual({ nombre: "Lavado de muebles", precio: "Desde $45" });
    const t = textoDe(peticiones[0]);
    expect(t).toContain("Desde $45");
    expect(t).toContain("margen del 70 %"); // la nota interna: el estratega es de la agencia
    // Lo cuenta como gasto del estratega.
    expect(db.sqlite.prepare("select funcion from consumo_ia").all().map((x) => x.funcion)).toContain("estratega de campañas");
  });

  it("un producto que no está en el catálogo se escribe; uno inventado del catálogo, 404", async () => {
    anthropic(flujo(JSON.stringify(PLAN)));
    const r = await plan({ clientId: "c1", producto: { nombre: "Impermeabilizado", precio: "$30", descripcion: "Protege la tela" }, margen: 50, conMaletas: true });
    expect(r.status).toBe(200);
    expect(textoDe(peticiones[0])).toMatch(/Impermeabilizado · precio: \$30/);
    expect(textoDe(peticiones[0])).toMatch(/«maletas»: los 7 elementos/);
    expect((await plan({ clientId: "c1", productoId: "p-nada" })).status).toBe(404);
  });

  it("un cliente de otro espacio no existe", async () => {
    anthropic(flujo(JSON.stringify(PLAN)));
    expect((await plan({ clientId: "ajeno", producto: { nombre: "x" } })).status).toBe(404);
    expect(peticiones).toHaveLength(0);
  });

  it("si la IA no devuelve un plan, lo dice", async () => {
    anthropic(flujo("no sé"));
    const r = await plan({ clientId: "c1", producto: { nombre: "x" } });
    expect(r.status).toBe(502);
    expect((await r.json()).error).toMatch(/plan/);
  });
});

describe("alguien que no es cliente", () => {
  it("con lo que se escribe, sin cliente, y el plan se guarda sin cliente", async () => {
    anthropic(flujo(JSON.stringify(PLAN)));
    const r = await plan({ externo: { nombre: "Pan Rico", rubro: "Panadería", info: "Venden pan de masa madre a domicilio" }, producto: { nombre: "Pan de masa madre", precio: "$6" }, margen: 40 });
    expect(r.status).toBe(200);
    const t = textoDe(peticiones[0]);
    expect(t).toContain("Pan Rico (Panadería)");
    expect(t).toContain("masa madre a domicilio");
    expect(t).not.toContain("Dcasa");
    const d = await r.json();
    const g = await pedir("/api/anuncios/planes", { method: "POST", body: { nombre: "Pan Rico · Octubre", datos: d } });
    expect(g.status).toBe(201);
    const lista = await (await pedir("/api/anuncios/planes")).json();
    expect(lista.map((x) => [x.nombre, x.clientId])).toEqual([["Pan Rico · Octubre", null]]);
    expect((await pedir(`/api/anuncios/planes/${lista[0].id}`, { method: "DELETE" })).status).toBe(200);
    expect(await (await pedir("/api/anuncios/planes")).json()).toEqual([]);
    expect((await plan({ externo: { nombre: "" }, producto: { nombre: "x" } })).status).toBe(400);
  });

  it("un colaborador no cambia el manual ni arma planes de fuera", async () => {
    const s = db.sqlite;
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-colab", "c@a.com", "x", "x");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run("u-colab", JEFE, "editor", "Colab", "#111111", '["c1"]');
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256("t-colab"), "u-colab", "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    const comoColab = (ruta, opciones) => worker.fetch(new Request(`https://calendarios.test${ruta}`, {
      ...opciones, headers: { Cookie: `${COOKIE}=t-colab`, "Content-Type": "application/json" }, body: JSON.stringify(opciones.body),
    }), env);
    anthropic(flujo(JSON.stringify(PLAN)));
    expect((await comoColab("/api/anuncios/manual", { method: "PUT", body: { reglas: "x" } })).status).toBe(403);
    expect((await comoColab("/api/anuncios/estratega", { method: "POST", body: { externo: { nombre: "X" }, producto: { nombre: "y" } } })).status).toBe(403);
    expect((await comoColab("/api/anuncios/estratega", { method: "POST", body: { clientId: "c1", producto: { nombre: "y" } } })).status).toBe(200);
  });
});
