import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";

// ============================================================
// La plantilla que escoge el DIRECTOR, en el servidor
//
// En la pantalla, si el director de arte elige una plantilla del kit, su
// imagen va de referencia (pedidoDeLote). En el servidor sólo se usaba su
// ficha escrita: con la aplicación cerrada, la pieza se parecía menos a la
// plantilla. Aquí el director se simula y se mira el trabajo que se pide.
// ============================================================

vi.mock("../../worker/lib/estudio/fichas.js", () => ({
  limpiarVistas: (v) => v ?? [],
  fichasDeDiseno: vi.fn(async () => ({
    concepto: "Serie de ofertas",
    fichas: { 1: { ficha: "Pieza: oferta.\nComposición: titular arriba.", plantilla: "plantilla-oferta" }, 2: { ficha: "Pieza: otra." } },
  })),
}));

const { crearEncargo } = await import("../../worker/lib/estudio/encargos.js");
const { bombear } = await import("../../worker/lib/estudio/bomba.js");
const { ESCENA } = await import("../../src/lib/encargos.js");

const JEFE = "u-jefe";
const PLANTILLA = "clientes/c1/estudio/oferta.png";
let db;
let env;

function r2() {
  const objetos = new Map([[PLANTILLA, new Uint8Array([137, 80, 78, 71])]]);
  return {
    async head(c) { return objetos.has(c) ? { size: 1 } : null; },
    async get(c) { const o = objetos.get(c); return o ? { body: o, size: o.length, arrayBuffer: async () => o.buffer, httpMetadata: {} } : null; },
    async put(c, v) { objetos.set(c, v instanceof Uint8Array ? v : new Uint8Array(await new Response(v).arrayBuffer())); },
    async delete(c) { objetos.delete(c); },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2() };
  const kit = { plantillas: [{ id: "plantilla-oferta", nombre: "Oferta", uso: "post", clave: PLANTILLA, sistema: "Titular arriba, 12 % del alto." }] };
  db.sqlite.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "j@a.com", "x", "x");
  db.sqlite.prepare("insert into clients (id, owner_id, name, kit_marca) values (?,?,?,?)").run("c1", JEFE, "Dcasa", JSON.stringify(kit));
});
afterEach(() => vi.useRealTimers());

const paso = (id) => ({
  id, sinMejorar: "una taza", encargo: { titulo: `Pieza ${id}`, tipo: "anuncio" },
  pedido: { modelo: "prueba", prompt: `Escena: ${ESCENA}`, n: 1, ajustes: { aspectRatio: "4:5" }, medios: {} },
});

describe("la plantilla del director con la aplicación cerrada", () => {
  it("su imagen va de referencia en el trabajo, con su sistema escrito; la pieza sin plantilla no cambia", async () => {
    const acceso = crearAcceso(db, JEFE);
    const cliente = await acceso.leerUno("clients", { id: "c1" });
    await crearEncargo(env, acceso, cliente, { tipo: "lote", mejorar: true, pasos: [paso("a"), paso("b")] });
    for (let i = 0; i < 30; i++) {
      if ((await bombear(env, JEFE)) == null) break;
      vi.setSystemTime(new Date(Date.now() + 5000));
    }
    const [a, b] = db.sqlite.prepare("select prompt, medios from estudio_trabajos order by created_at").all();
    expect(JSON.parse(a.medios).reference).toEqual([PLANTILLA]);
    expect(a.prompt).toContain("Pieza: oferta.");
    expect(a.prompt).toContain("Sigue el diseño de la plantilla «Oferta»");
    expect(a.prompt).toMatch(/Imagen de referencia 1: toma SÓLO/);
    expect(JSON.parse(b.medios ?? "{}").reference ?? []).toEqual([]);
    expect(b.prompt).not.toContain("plantilla");
  });
});
