import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";

// ============================================================
// LO QUE VA A PAUTA, en el motor de textos (lib/pauta.js)
//
// Lo que importa:
//   1. Una publicación que va a pauta se escribe como ANUNCIO por el mismo
//      motor (modos «campos» y «plan»): la regla del anuncio, su etapa, y el
//      tipo de negocio y el destino del CLIENTE, leídos en el servidor de sus
//      números del negocio (`anuncios_clientes.negocio`).
//   2. Sus textos de anuncio aparte (el campo «anuncio») vuelven limpios, y
//      los hashtags, 3 como mucho.
//   3. Sin pauta, el motor sigue igual: ni la regla ni la lectura del negocio.
// ============================================================

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
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const bytes = new TextEncoder().encode(objetos.get(clave));
      return { arrayBuffer: async () => bytes, text: async () => objetos.get(clave) };
    },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor) { objetos.set(clave, typeof valor === "string" ? valor : new TextDecoder().decode(valor)); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=t-jefe`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const lote = (datos) => pedir("/api/estudio/c1/lote/ideas", { method: "POST", body: datos });
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-jefe", "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run("u-jefe", "u-jefe", "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("t-jefe"), "u-jefe", "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, whatsapp) values (?,?,?,?)").run("c1", "u-jefe", "Clínica Sol", "+507 6000-0000");
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

const conNegocio = (negocio) => db.sqlite.prepare("insert into anuncios_clientes (id, owner_id, client_id, negocio) values (?,?,?,?)")
  .run("a1", "u-jefe", "c1", JSON.stringify({ v: 1, ...negocio }));

describe("modo «campos»: el caption como anuncio y sus textos aparte", () => {
  it("con la regla del anuncio, la etapa y el tipo de negocio y el DESTINO del cliente", async () => {
    conNegocio({ tipo: "servicios", destino: "web" });
    anthropic(JSON.stringify({ textos: [{
      n: 1, descripcion: "¿Cansado de esperar una cita?\n\nReserva en nuestra web.", hashtags: "#a #b #c #d #e #f",
      anuncio: { textos: ["Uno", "Dos", "Tres"], titulos: ["Tu cita en línea"], descripcion: "Sin filas", boton: "otro" },
    }] }));
    const r = await lote({ modo: "campos", publicaciones: [{
      clave: "p1", formato: "post", pauta: { etapa: "considerar", como: "anuncio" }, escrito: { idea: "Citas en línea" },
      campos: ["descripcion", "hashtags", "anuncio"],
    }] });
    expect(r.status).toBe(200);
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/LO QUE VA A PAUTA \(anuncios de Meta\)/);
    expect(t).toMatch(/El destino del anuncio: Tienda web/);
    expect(t).toMatch(/El tipo de negocio: Servicios/);
    expect(t).toMatch(/- Evaluación: para quien ya vio la marca/);
    expect(t).toMatch(/VA A PAUTA · etapa Evaluación/);
    expect(t).toMatch(/- "anuncio" \(en las que van a pauta\)/);
    const { textos } = await r.json();
    expect(textos[0].campos.hashtags).toBe("#a #b #c");
    // El botón que no existe se cambia por el de su destino (la web).
    expect(textos[0].campos.anuncio).toEqual({ textos: ["Uno", "Dos", "Tres"], titulos: ["Tu cita en línea"], descripcion: "Sin filas", boton: "SHOP_NOW" });
  });

  it("sin números del negocio, la regla igual, con WhatsApp de destino", async () => {
    anthropic(JSON.stringify({ textos: [{ n: 1, descripcion: "Ven" }] }));
    await lote({ modo: "campos", publicaciones: [{ clave: "p1", formato: "post", pauta: { etapa: "presentacion" }, campos: ["descripcion"] }] });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/El destino del anuncio: WhatsApp/);
    expect(t).not.toMatch(/El tipo de negocio:/);
  });

  it("«anuncio» no se pide a lo que no va a pauta (ni con la pauta quitada: false)", async () => {
    anthropic(JSON.stringify({ textos: [{ n: 1, descripcion: "Ven" }] }));
    const r = await lote({ modo: "campos", publicaciones: [{ clave: "p1", formato: "post", pauta: false, campos: ["anuncio"] }] });
    expect(r.status).toBe(400);
    await lote({ modo: "campos", publicaciones: [{ clave: "p2", formato: "post", campos: ["descripcion", "anuncio"] }] });
    const t = textoDe(peticiones[0]);
    expect(t).not.toMatch(/VA A PAUTA/);
    expect(t).not.toMatch(/"anuncio"/);
  });
});

describe("modo «plan» (el asistente del mes): las casillas que van a pauta", () => {
  it("el bloque pide su «anuncio» en el JSON y cada idea vuelve con él, 3 hashtags y sin la línea interna", async () => {
    conNegocio({ tipo: "productos", destino: "whatsapp" });
    anthropic(JSON.stringify({ ideas: [
      { n: 1, titular: "Tu sala, más amplia", escena: "Una sala", descripcion: "Gancho.\n\nEscríbenos por WhatsApp.", hashtags: "#a #b #c #d", anuncio: { textos: ["A", "B", "C"], titulos: ["T"] } },
      { n: 2, titular: "Otra", escena: "Otra sala", descripcion: "Texto", hashtags: "#a #b #c #d" },
    ] }));
    const r = await lote({ modo: "plan", casillas: [
      { clave: "x1", fecha: "2030-03-04", formato: "post", pilar: "anuncio", pauta: { etapa: "conversion", auto: true, motivo: "La oferta del mes" } },
      { clave: "x2", fecha: "2030-03-05", formato: "post", pilar: "educativo" },
    ] });
    expect(r.status).toBe(200);
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/LO QUE VA A PAUTA/);
    expect(t).toMatch(/añade esa clave "anuncio" a su objeto del JSON/);
    expect(t).toMatch(/1\. \[Post 4:5\][\s\S]*VA A PAUTA · etapa Conversión/);
    expect(t).toMatch(/El destino del anuncio: WhatsApp/);
    const { ideas } = await r.json();
    const [a, b] = ideas;
    expect(a.anuncio).toEqual({ textos: ["A", "B", "C"], titulos: ["T"], descripcion: "", boton: "WHATSAPP_MESSAGE" });
    expect(a.hashtags).toBe("#a #b #c");
    expect(a.pauta).toMatchObject({ etapa: "conversion", auto: true });
    expect(a).not.toHaveProperty("lineaPauta");
    // La que no va a pauta, igual que siempre.
    expect(b.anuncio).toBeUndefined();
    expect(b.hashtags).toBe("#a #b #c #d");
  });

  it("modo «publicacion» («Generar» la idea de una publicación vacía que va a pauta): también como anuncio, con sus textos", async () => {
    anthropic(JSON.stringify({ ideas: [{ n: 1, titular: "Tu sala", escena: "Una sala", descripcion: "Gancho", hashtags: "#a #b #c #d", anuncio: { textos: ["A", "B", "C"] } }] }));
    const r = await lote({ modo: "publicacion", formato: "post", publicacion: { fecha: "2030-03-04", pauta: { etapa: "fidelizar" } } });
    expect(textoDe(peticiones[0])).toMatch(/VA A PAUTA · etapa Ascensión/);
    const { ideas } = await r.json();
    expect(ideas[0].anuncio.textos).toEqual(["A", "B", "C"]);
    expect(ideas[0].hashtags).toBe("#a #b #c");
  });

  it("sin ninguna casilla en pauta, el pedido no cambia", async () => {
    anthropic(JSON.stringify({ ideas: [{ n: 1, titular: "Uno", escena: "Una sala" }] }));
    await lote({ modo: "plan", casillas: [{ clave: "a", fecha: "2030-03-04", formato: "post", pilar: "educativo" }] });
    expect(textoDe(peticiones[0])).not.toMatch(/PAUTA/);
  });
});
