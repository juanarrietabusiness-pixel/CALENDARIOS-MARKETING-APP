import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { conEnlace } from "../../worker/lib/mcpVista/modelo.js";
import { MAX_ARCHIVOS_ZIP, VIDA_ZIP_MS, nombreEnZip, tituloDePieza, zipPorFlujo } from "../../worker/lib/exportarPiezas.js";
import { crc32, crc32Seguir } from "../../src/lib/zip.js";

// ============================================================
// exportar_piezas: las piezas de la galería en un ZIP, por un enlace sin sesión de 15 minutos
// ============================================================

const ANA = "u-ana";
const OTRO = "u-otro";
const ORIGEN = "https://calendarios.test";
let db;
let env;
let acceso;

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async head(k) { const o = objetos.get(k); return o ? { size: o.bytes.length } : null; },
    async get(k) {
      const o = objetos.get(k);
      if (!o) return null;
      // En trozos pequeños, como llega de R2: el CRC se calcula por partes.
      const b = o.bytes;
      const body = new ReadableStream({ start(c) { for (let i = 0; i < b.length; i += 7) c.enqueue(b.slice(i, i + 7)); c.close(); } });
      return { body, size: b.length, arrayBuffer: async () => b.buffer.slice(0) };
    },
    async put(k, v) { objetos.set(k, { bytes: v instanceof Uint8Array ? v : new Uint8Array(await new Response(v).arrayBuffer()) }); },
    async delete(k) { objetos.delete(k); },
  };
}

const bytesDe = (txt) => new TextEncoder().encode(txt);

function archivo(id, { cliente = "c1", mime = "image/png", prompt = "", ajustes = {}, borrado = null, contenido = `contenido ${id}`, bytes = null } = {}) {
  const clave = `clientes/${cliente}/estudio/${id}.${mime === "video/mp4" ? "mp4" : "png"}`;
  const datos = bytesDe(contenido);
  env.MEDIA.objetos.set(clave, { bytes: datos });
  db.sqlite.prepare(
    "insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, bytes, prompt, ajustes, borrado_at) values (?,?,?,?,?,?,?,?,?,?)",
  ).run(id, cliente === "c9" ? OTRO : ANA, cliente, clave, mime.startsWith("video") ? "video" : "imagen", mime, bytes ?? datos.length, prompt, JSON.stringify(ajustes), borrado);
}

const mcp = () => crearHerramientasMCP({ env, acceso, usuario: { id: ANA, ownerId: ANA, nombre: "Ana" } });
const textoDe = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
const enlaceDe = (texto) => /(\/api\/exportar\/\S+)/.exec(texto)?.[1];

/** Abre el ZIP con `unzip` de verdad: lo que importa es que lo abra un programa que no es el nuestro. */
function listarConUnzip(bytes) {
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  try {
    const f = join(dir, "a.zip");
    writeFileSync(f, bytes);
    execFileSync("unzip", ["-tq", f]); // comprueba los CRC
    execFileSync("unzip", ["-q", f, "-d", join(dir, "x")]);
    const nombres = execFileSync("unzip", ["-Z1", f]).toString().trim().split("\n");
    return { nombres, leer: (n) => readFileSync(join(dir, "x", n), "utf8") };
  } finally {
    setTimeout(() => rmSync(dir, { recursive: true, force: true }), 0);
  }
}

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: () => new Response("spa") } };
  acceso = crearAcceso(db, ANA);
  const s = db.sqlite;
  for (const [id, email] of [[ANA, "ana@a.com"], [OTRO, "otro@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
  }
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", ANA, "Feria del Lente");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", ANA, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRO, "Ajeno");
  vi.stubGlobal("fetch", async (url) => { throw new Error(`fetch inesperado: ${url}`); });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("exportar_piezas", () => {
  it("está entre las herramientas del MCP, sólo lee", () => {
    const h = HERRAMIENTAS_MCP.find((x) => x.name === "exportar_piezas");
    expect(h.annotations.readOnlyHint).toBe(true);
    expect(h.description).toMatch(/no gasta IA/);
  });

  it("arma el ZIP: una carpeta por grupo, numerado en su orden, con el título; se abre con unzip", async () => {
    archivo("a1", { prompt: "Pieza: Portada del carrusel de lentes\nComposición: …" });
    archivo("a2", { prompt: "foto-producto.png" });
    archivo("a3", { ajustes: { titulo: "Cierre con logo" } });
    archivo("v1", { mime: "video/mp4", prompt: "Reel de los lentes" });
    const r = conEnlace(await mcp().llamar("exportar_piezas", {
      cliente: "feria",
      grupos: [{ carpeta: "Carrusel octubre", archivo_ids: ["a3", "a1", "a2"] }, { carpeta: "Reel", archivo_ids: ["v1"] }],
      nombre_zip: "Feria octubre",
    }), ORIGEN);
    expect(r.isError).toBeUndefined();
    const texto = textoDe(r);
    expect(texto).toMatch(/4 archivos/);
    expect(texto).toContain(`${ORIGEN}/api/exportar/`);
    const url = enlaceDe(texto);
    expect(url).toMatch(/\/feria-octubre\.zip$/);
    // Sin cookie: funciona.
    const res = await worker.fetch(new Request(`${ORIGEN}${url}`), env, {});
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain("feria-octubre.zip");
    const zip = new Uint8Array(await res.arrayBuffer());
    const { nombres, leer } = listarConUnzip(zip);
    expect(nombres).toEqual([
      "carrusel-octubre/01-cierre-con-logo.png",
      "carrusel-octubre/02-portada-del-carrusel-de-lentes.png",
      "carrusel-octubre/03-foto-producto.png",
      "reel/01-reel-de-los-lentes.mp4",
    ]);
    expect(leer("reel/01-reel-de-los-lentes.mp4")).toBe("contenido v1");
  });

  it("no arma nada si una pieza es de otro cliente, de otro espacio o está en la papelera", async () => {
    archivo("a1");
    archivo("b1", { cliente: "c2" });
    archivo("z1", { cliente: "c9" });
    archivo("p1", { borrado: "2026-11-01T00:00:00Z" });
    for (const otro of ["b1", "z1", "p1"]) {
      const r = await mcp().llamar("exportar_piezas", { cliente: "feria", grupos: [{ archivo_ids: ["a1", otro] }] });
      expect(r.isError).toBe(true);
      expect(textoDe(r)).toContain(otro);
    }
  });

  it("los topes: 60 archivos y 150 MB", async () => {
    archivo("a1");
    archivo("g1", { bytes: 151 * 1024 * 1024 });
    const muchos = Array.from({ length: MAX_ARCHIVOS_ZIP + 1 }, (_, i) => `x${i}`);
    let r = await mcp().llamar("exportar_piezas", { cliente: "feria", grupos: [{ archivo_ids: muchos }] });
    expect(r.isError).toBe(true);
    expect(textoDe(r)).toMatch(/como mucho 60/);
    r = await mcp().llamar("exportar_piezas", { cliente: "feria", grupos: [{ archivo_ids: ["a1", "g1"] }] });
    expect(r.isError).toBe(true);
    expect(textoDe(r)).toMatch(/150 MB/);
    r = await mcp().llamar("exportar_piezas", { cliente: "feria", grupos: [] });
    expect(r.isError).toBe(true);
  });

  it("el enlace caduca a los 15 minutos y uno inventado no abre nada", async () => {
    archivo("a1");
    const url = enlaceDe(textoDe(await mcp().llamar("exportar_piezas", { cliente: "feria", grupos: [{ archivo_ids: ["a1"] }] })));
    expect((await worker.fetch(new Request(`${ORIGEN}${url}`), env, {})).status).toBe(200);
    // Se puede abrir otra vez (el iPhone pide dos veces).
    expect((await worker.fetch(new Request(`${ORIGEN}${url}`), env, {})).status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + VIDA_ZIP_MS + 1000);
    expect((await worker.fetch(new Request(`${ORIGEN}${url}`), env, {})).status).toBe(404);
    vi.useRealTimers();
    expect((await worker.fetch(new Request(`${ORIGEN}/api/exportar/inventado/x.zip`), env, {})).status).toBe(404);
  });

  it("lo que se borró después de pedirlo no sale", async () => {
    archivo("a1");
    archivo("a2");
    const url = enlaceDe(textoDe(await mcp().llamar("exportar_piezas", { cliente: "feria", grupos: [{ carpeta: "x", archivo_ids: ["a1", "a2"] }] })));
    db.sqlite.prepare("update estudio_archivos set borrado_at = ? where id = ?").run("2026-11-11T00:00:00Z", "a2");
    const { nombres } = listarConUnzip(new Uint8Array(await (await worker.fetch(new Request(`${ORIGEN}${url}`), env, {})).arrayBuffer()));
    expect(nombres).toHaveLength(1);
  });
});

describe("las piezas sueltas", () => {
  it("el CRC por trozos es el mismo que de una vez", () => {
    const b = bytesDe("Hola, Panamá: ñandú y más bytes");
    expect(crc32Seguir(crc32Seguir(0, b.slice(0, 5)), b.slice(5))).toBe(crc32(b));
  });

  it("nombres", () => {
    expect(tituloDePieza({ prompt: "Pieza: Oferta ¡2×1! en lentes de sol\nFondo: …" })).toBe("oferta-2-1-en-lentes-de-sol");
    expect(tituloDePieza({ prompt: "" })).toBe("pieza");
    expect(nombreEnZip({ clave: "clientes/c1/x.webp", prompt: "Hola" }, 0, 3)).toBe("01-hola.webp");
  });

  it("un archivo que ya no está en R2 se salta y el ZIP sigue valiendo", async () => {
    const flujo = zipPorFlujo([
      { ruta: "a/01-uno.txt", abrir: async () => new Response("uno").body },
      { ruta: "a/02-dos.txt", abrir: async () => null },
    ]);
    const { nombres } = listarConUnzip(new Uint8Array(await new Response(flujo).arrayBuffer()));
    expect(nombres).toEqual(["a/01-uno.txt"]);
  });
});
