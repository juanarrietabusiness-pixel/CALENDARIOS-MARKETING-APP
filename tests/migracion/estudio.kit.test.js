import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";

// ============================================================
// El kit de marca del Estudio: guardar, preparar con la IA y revisar
//
// Lo que importa:
//   1. El logo es una imagen de ESTE cliente que existe: la clave llega del
//      navegador y no se cree.
//   2. Preparar lee el cerebro con `para: "imagen"` —nunca lo interno— y NO
//      guarda: devuelve una propuesta que una persona revisa.
//   3. Revisar MIRA la imagen (va como imagen, no como texto) con el kit delante.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
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
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};

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
  // El cerebro: su identidad visual y una nota interna que no puede salir.
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Identidad visual", texto: "Paleta azul marino y arena; fotografía cálida con luz natural; nunca fondos negros.", tipo: "marca" } });
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Costos", texto: "El costo del sofá es de 200 dólares y el margen del 40 %.", tipo: "documento", interna: true } });
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const kitGuardado = () => JSON.parse(db.sqlite.prepare("select kit_marca from clients where id = 'c1'").get().kit_marca ?? "null");

describe("guardar el kit", () => {
  it("sin kit, la galería trae uno vacío", async () => {
    const r = await (await pedir("/api/estudio/c1")).json();
    expect(r.kit).toMatchObject({ paleta: [], presets: {}, logo: "" });
  });

  it("el logo tiene que ser una imagen de este cliente y existir", async () => {
    env.MEDIA.objetos.set("clientes/c2/logo.png", { bytes: PNG, tipo: "image/png" });
    let res = await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { logo: "clientes/c2/logo.png" } } });
    expect(res.status).toBe(400);
    res = await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { logo: "clientes/c1/no-existe.png" } } });
    expect(res.status).toBe(404);
    env.MEDIA.objetos.set("clientes/c1/estudio/logo.png", { bytes: PNG, tipo: "image/png" });
    res = await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: {
      logo: "/api/media/clientes/c1/estudio/logo.png", tipografia: "Montserrat",
      paleta: [{ hex: "#1b3246", rol: "estructura" }, { hex: "azul" }], presets: { producto: "Mi preset." },
    } } });
    expect(res.status).toBe(200);
    expect(kitGuardado()).toMatchObject({ logo: "clientes/c1/estudio/logo.png", tipografia: "Montserrat", paleta: [{ hex: "#1B3246", rol: "estructura" }], presets: { producto: "Mi preset." } });
    expect((await (await pedir("/api/estudio/c1")).json()).kit.logo).toBe("clientes/c1/estudio/logo.png");
  });

  it("la ficha guardada desde el cliente no pisa el kit", async () => {
    await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { tipografia: "Montserrat" } } });
    await pedir("/api/clientes/c1", { method: "PUT", body: { name: "Dcasa", industry: "Muebles" } });
    expect(kitGuardado()).toMatchObject({ tipografia: "Montserrat" });
  });
});

describe("preparar con la IA", () => {
  it("lee el cerebro sin lo interno, propone y no guarda", async () => {
    anthropic('Listo: {"paleta":[{"hex":"#1E2A5A","nombre":"azul marino","rol":"dominante"}],"tipografia":"","estilo":"cálido","luz":"natural","evitar":"nunca fondos negros","presets":{"producto":"P","anuncio":"A","corporativo":"C","creativo":"K"},"dudas":"no hay tipografía"}');
    const res = await pedir("/api/estudio/c1/kit/preparar", { method: "POST" });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.kit.paleta[0]).toMatchObject({ hex: "#1E2A5A", rol: "dominante" });
    expect(r.kit.presets).toEqual({ producto: "P", anuncio: "A", corporativo: "C", creativo: "K" });
    expect(r.dudas).toBe("no hay tipografía");
    expect(r.conCerebro).toBe(true);
    const enviado = textoDe(peticiones[0]);
    expect(enviado).toContain("Paleta azul marino y arena");
    expect(enviado).not.toContain("margen del 40");
    expect(kitGuardado()).toBeNull();
  });
});

describe("revisar una pieza", () => {
  async function conImagen() {
    env.MEDIA.objetos.set("clientes/c1/estudio/a.png", { bytes: PNG, tipo: "image/png" });
    db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, prompt) values (?,?,?,?,?,?,?)")
      .run("a1", JEFE, "c1", "clientes/c1/estudio/a.png", "imagen", "image/png", "Un sofá en la sala");
  }

  it("sin kit, primero hay que prepararlo", async () => {
    await conImagen();
    const res = await pedir("/api/estudio/c1/revisar", { method: "POST", body: { archivoId: "a1" } });
    expect(res.status).toBe(409);
  });

  it("la IA mira la imagen con el kit delante y dice qué falla", async () => {
    await conImagen();
    await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { paleta: [{ hex: "#1E2A5A", nombre: "azul", rol: "dominante" }], estilo: "cálido" } } });
    anthropic('{"puntaje":6,"cumple":["luz cálida"],"falla":["aparece rojo fuera de la paleta"],"sugerencia":"sin rojo"}');
    const res = await pedir("/api/estudio/c1/revisar", { method: "POST", body: { archivoId: "a1" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ puntaje: 6, falla: ["aparece rojo fuera de la paleta"], sugerencia: "sin rojo" });
    const bloques = peticiones[0].messages[0].content;
    expect(bloques[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } });
    expect(textoDe(peticiones[0])).toContain("azul #1E2A5A (dominante)");
    expect(textoDe(peticiones[0])).toContain("Lo que se pidió: Un sofá en la sala");
  });

  it("la imagen de una publicación se revisa por su ruta, aunque no esté en la galería; la de otro cliente, no", async () => {
    env.MEDIA.objetos.set("clientes/c1/banco/post.png", { bytes: PNG, tipo: "image/png" });
    await pedir("/api/estudio/c1/kit", { method: "PUT", body: { kit: { paleta: [{ hex: "#1E2A5A", nombre: "azul", rol: "dominante" }] } } });
    anthropic('{"puntaje":9,"cumple":["paleta"],"falla":[],"sugerencia":""}');
    const res = await pedir("/api/estudio/c1/revisar", { method: "POST", body: { clave: "/api/media/clientes/c1/banco/post.png" } });
    expect(res.status).toBe(200);
    expect((await res.json()).puntaje).toBe(9);
    expect((await pedir("/api/estudio/c1/revisar", { method: "POST", body: { clave: "clientes/c2/banco/post.png" } })).status).toBe(400);
    expect((await pedir("/api/estudio/c1/revisar", { method: "POST", body: { clave: "clientes/c1/../c2/x.png" } })).status).toBe(400);
    expect((await pedir("/api/estudio/c1/revisar", { method: "POST", body: { clave: "clientes/c1/no-existe.png" } })).status).toBe(404);
  });

  it("una imagen de otro cliente no se revisa", async () => {
    await conImagen();
    const res = await pedir("/api/estudio/c2/revisar", { method: "POST", body: { archivoId: "a1" } });
    expect(res.status).toBe(404);
  });
});
