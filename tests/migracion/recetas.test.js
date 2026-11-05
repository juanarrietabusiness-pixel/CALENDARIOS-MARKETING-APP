import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { RECETAS_CASA, REGLA_RECETAS } from "../../src/lib/recetas.js";

// ============================================================
// Las recetas de la agencia y «Crear con Claude», contra una D1 de verdad: la ruta (/api/recetas), el pedido que se
// guarda un día (handoff) y lo que lee Claude por el conector (ver_recetas, receta).
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const COLAB = "u-colab";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra", [COLAB]: "t-colab" };
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

let db;
let env;
const objetos = new Map();

function r2() {
  return {
    async head(clave) { return objetos.has(clave) ? { size: 1 } : null; },
    async get(clave) { const b = objetos.get(clave); return b ? { size: b.length, httpMetadata: { contentType: "image/png" }, arrayBuffer: async () => b.slice().buffer } : null; },
    async put(clave, valor) { objetos.set(clave, valor); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email, owner, rol, clientes] of [[JEFE, "jefe@a.com", JEFE, "admin", null], [OTRA, "otra@b.com", OTRA, "admin", null], [COLAB, "colab@a.com", JEFE, "editor", JSON.stringify(["c1"])]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)").run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(id, owner, rol, id, "#1E90FF", clientes);
  }
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Feria del Lente");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)").run("cal1", "c1", JEFE, "Noviembre", 10, 2026, JSON.stringify([
    { date: "2026-11-16", dayName: "Lunes", posts: [{ id: "p1", format: "post", title: "40 minutos", idea: "Fabricamos tus lentes en 40 minutos", textoPieza: "Tus lentes en 40 minutos", status: "pending" }] },
  ]));
  for (const [id, cliente, owner] of [["ref1", "c1", JEFE], ["ref9", "c9", OTRA]]) {
    const clave = `clientes/${cliente}/estudio/${id}.png`;
    objetos.set(clave, PNG);
    s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, ancho, alto, prompt, modelo, origen, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, owner, cliente, clave, "imagen", "image/png", 1, 1, "una referencia", "subida", "subida", "2026-11-01T00:00:00.000Z");
  }
}

const pedir = (quien, ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  ...opciones,
  headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env);
const mcp = (owner = JEFE) => crearHerramientasMCP({ env, acceso: crearAcceso(db, owner), usuario: { id: owner, nombre: "x" } });
const textoDe = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T15:00:00.000Z"));
  objetos.clear();
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
});
afterEach(() => { vi.useRealTimers(); });

describe("/api/recetas", () => {
  it("lista las de la casa; una propia se suma y una de la casa se puede cambiar y restaurar", async () => {
    const { recetas } = await (await pedir(JEFE, "/recetas")).json();
    expect(recetas.map((r) => r.id)).toEqual(RECETAS_CASA.map((r) => r.id));
    expect(recetas.every((r) => r.casa)).toBe(true);

    const propia = await pedir(JEFE, "/recetas/r-mi-receta", { method: "PUT", body: { receta: { titulo: "Mi receta", salida: "imagen", instrucciones: "1. Hazlo bien." } } });
    expect(propia.status).toBe(200);
    const cambiada = await (await pedir(JEFE, "/recetas/foto-heroe", { method: "PUT", body: { receta: { titulo: "Foto héroe (la nuestra)", instrucciones: "1. Lo nuestro." } } })).json();
    expect(cambiada.recetas.find((r) => r.id === "foto-heroe")).toMatchObject({ titulo: "Foto héroe (la nuestra)", casa: true, cambiada: true });
    expect(cambiada.recetas.at(-1)).toMatchObject({ id: "r-mi-receta", casa: false });

    const restaurada = await (await pedir(JEFE, "/recetas/foto-heroe", { method: "DELETE" })).json();
    expect(restaurada.recetas.find((r) => r.id === "foto-heroe").titulo).toBe("Foto héroe del producto");
    // Otro espacio no ve lo de este.
    expect((await (await pedir(OTRA, "/recetas")).json()).recetas.some((r) => r.id === "r-mi-receta")).toBe(false);
  });

  it("sin título o sin método no se guarda; un colaborador no cambia lo de toda la agencia", async () => {
    expect((await pedir(JEFE, "/recetas/r-x", { method: "PUT", body: { receta: { titulo: "Sin método" } } })).status).toBe(400);
    expect((await pedir(COLAB, "/recetas/r-x", { method: "PUT", body: { receta: { titulo: "x", instrucciones: "y" } } })).status).toBe(403);
  });
});

describe("«Crear con Claude»: el pedido que viaja un día", () => {
  it("guarda la publicación y las referencias de ESE cliente y da el mensaje y el enlace de claude.ai", async () => {
    const r = await pedir(JEFE, "/recetas/pieza-del-post/handoff", { method: "POST", body: {
      clienteId: "c1", publicacion: { calendarId: "cal1", postId: "p1" }, referencias: ["ref1", "ref9"], indicacion: "Más cálida",
    } });
    expect(r.status).toBe(201);
    const h = await r.json();
    expect(h.mensaje).toBe(`/receta pieza-del-post · cliente Feria del Lente · HANDOFF: ${h.id}`);
    expect(h.enlace).toBe(`https://claude.ai/new?q=${encodeURIComponent(h.mensaje)}`);
    const fila = db.sqlite.prepare("select * from handoffs where id = ?").get(h.id);
    // La referencia de otro cliente no entra; caduca en un día.
    expect(JSON.parse(fila.datos)).toMatchObject({ publicacion: { calendarId: "cal1", postId: "p1" }, referencias: ["ref1"], indicacion: "Más cálida" });
    expect(fila.expira_at).toBe("2026-11-06T15:00:00.000Z");
  });

  it("una publicación de otro calendario, un cliente ajeno o una receta que no existe no valen", async () => {
    expect((await pedir(JEFE, "/recetas/pieza-del-post/handoff", { method: "POST", body: { clienteId: "c9" } })).status).toBe(404);
    expect((await pedir(JEFE, "/recetas/pieza-del-post/handoff", { method: "POST", body: { clienteId: "c1", publicacion: { calendarId: "otro-cal", postId: "p1" } } })).status).toBe(400);
    expect((await pedir(JEFE, "/recetas/no-existe/handoff", { method: "POST", body: { clienteId: "c1" } })).status).toBe(404);
  });
});

describe("las recetas en el conector de Claude", () => {
  it("están entre las herramientas, y las instrucciones del servidor enrutan «/receta»", () => {
    const nombres = HERRAMIENTAS_MCP.map((h) => h.name);
    expect(nombres).toContain("ver_recetas");
    expect(nombres).toContain("receta");
    expect(REGLA_RECETAS).toMatch(/«\/receta»[\s\S]*receta/);
  });

  it("ver_recetas las lista con su id; receta da el método", async () => {
    expect(textoDe(await mcp().llamar("ver_recetas"))).toMatch(/· foto-heroe — Foto héroe del producto \(Imagen\)/);
    const t = textoDe(await mcp().llamar("receta", { id: "carrusel-paso-a-paso" }));
    expect(t).toMatch(/^RECETA «Carrusel que se lee entero»/);
    expect(t).toMatch(/MÉTODO/);
    expect(t).toMatch(/crea sólo con el «sí»/);
    expect((await mcp().llamar("receta", { id: "inventada" })).isError).toBe(true);
  });

  it("con el handoff: el método, la publicación con su texto exacto, lo pedido y la referencia como imagen", async () => {
    const h = await (await pedir(JEFE, "/recetas/pieza-del-post/handoff", { method: "POST", body: {
      clienteId: "c1", publicacion: { calendarId: "cal1", postId: "p1" }, referencias: ["ref1"], indicacion: "Más cálida",
    } })).json();
    const r = await mcp().llamar("receta", { handoff_id: h.id });
    const t = textoDe(r);
    expect(t).toMatch(/RECETA «La pieza de una publicación»/);
    expect(t).toMatch(/Cliente: Feria del Lente/);
    expect(t).toMatch(/Publicación p1 del 2026-11-16 · post · «40 minutos»/);
    expect(t).toMatch(/Texto de la pieza \(EXACTO\): Tus lentes en 40 minutos/);
    expect(t).toMatch(/Lo que pide la agencia \(manda\): Más cálida/);
    expect(t).toMatch(/Referencias de la galería .*: ref1/);
    // Sin Container, la original pequeña va tal cual como imagen.
    expect(r.content.filter((b) => b.type === "image")).toHaveLength(1);
  });

  it("un handoff caducado o de otro espacio no se canjea", async () => {
    const h = await (await pedir(JEFE, "/recetas/foto-heroe/handoff", { method: "POST", body: { clienteId: "c1" } })).json();
    expect(textoDe(await mcp(OTRA).llamar("receta", { handoff_id: h.id }))).toMatch(/No encontré ese pedido/);
    vi.setSystemTime(new Date("2026-11-07T15:00:00.000Z"));
    const r = await mcp().llamar("receta", { handoff_id: h.id });
    expect(r.isError).toBe(true);
    expect(textoDe(r)).toMatch(/caducó/);
  });
});
