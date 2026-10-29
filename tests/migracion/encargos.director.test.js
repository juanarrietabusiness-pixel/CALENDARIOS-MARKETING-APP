import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";

// ============================================================
// El director del lote, PIEZA A PIEZA, en el servidor
//
// Las piezas del chat salían mejores que las del lote: el chat piensa cada
// pieza, y el lote le pedía al director seis fichas de una vez (o se lo
// saltaba con el borrador del motor de ideas). Ahora la primera va sola y
// fija el concepto; después, de tres en tres, cada una en su llamada, con el
// concepto y lo ya diseñado delante. Y mientras hay una lista y sitio, se
// crea: el director sigue en el paso siguiente.
// ============================================================

const llamadas = [];
let db;
vi.mock("../../worker/lib/estudio/fichas.js", () => ({
  limpiarVistas: (v) => v ?? [],
  fichasDeDiseno: vi.fn(async (_env, _acceso, _cliente, { piezas, concepto, previas }) => {
    llamadas.push({
      piezas: piezas.map((p) => p.titulo), concepto, previas: previas ?? [],
      trabajosAntes: db.sqlite.prepare("select count(*) n from estudio_trabajos").get().n,
    });
    return { concepto: "Serie de noviembre", fichas: Object.fromEntries(piezas.map((p, j) => [j + 1, { ficha: `Pieza: ${p.titulo}.` }])) };
  }),
}));

const { crearEncargo } = await import("../../worker/lib/estudio/encargos.js");
const { bombear } = await import("../../worker/lib/estudio/bomba.js");
const { ESCENA } = await import("../../src/lib/encargos.js");

const JEFE = "u-jefe";
let env;

function r2() {
  const objetos = new Map();
  return {
    async head(c) { return objetos.has(c) ? { size: 1 } : null; },
    async get(c) { const o = objetos.get(c); return o ? { body: o, size: o.length, arrayBuffer: async () => o.buffer, httpMetadata: {} } : null; },
    async put(c, v) { objetos.set(c, v instanceof Uint8Array ? v : new Uint8Array(await new Response(v).arrayBuffer())); },
    async delete(c) { objetos.delete(c); },
  };
}

beforeEach(() => {
  llamadas.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2() };
  db.sqlite.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "j@a.com", "x", "x");
  db.sqlite.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
});
afterEach(() => vi.useRealTimers());

const paso = (id) => ({
  id, titulo: `Pieza ${id}`, sinMejorar: "una taza", encargo: { titulo: id, tipo: "anuncio" },
  pedido: { modelo: "prueba", prompt: `Escena: ${ESCENA}`, n: 1, ajustes: { aspectRatio: "4:5" }, medios: {} },
});

describe("el director del lote, pieza a pieza", () => {
  it("la primera sola (fija el concepto); luego de tres en tres con el concepto y lo ya diseñado; y se crea entre medias", async () => {
    const acceso = crearAcceso(db, JEFE);
    const cliente = await acceso.leerUno("clients", { id: "c1" });
    await crearEncargo(env, acceso, cliente, { tipo: "lote", mejorar: true, paralelo: 2, pasos: ["a", "b", "c", "d", "e"].map(paso) });
    for (let i = 0; i < 60; i++) {
      if ((await bombear(env, JEFE)) == null) break;
      vi.setSystemTime(new Date(Date.now() + 5000));
    }
    expect(llamadas.map((l) => l.piezas)).toEqual([["a"], ["b", "c", "d"], ["e"]]);
    expect(llamadas[0].concepto).toBe("");
    expect(llamadas[1].concepto).toBe("Serie de noviembre");
    expect(llamadas[1].previas).toEqual(["Pieza: a."]);
    expect(llamadas[2].previas).toEqual(["Pieza: c.", "Pieza: d."]);
    // La primera ya se estaba creando cuando el director siguió con las demás.
    expect(llamadas[1].trabajosAntes).toBe(1);
    const prompts = db.sqlite.prepare("select prompt from estudio_trabajos order by created_at").all().map((t) => t.prompt);
    expect(prompts).toHaveLength(5);
    expect(prompts.every((p) => /^Escena: Pieza: [a-e]\.$/.test(p))).toBe(true);
  });

  it("una pieza que aún espera al director no se pide sin su diseño", async () => {
    const acceso = crearAcceso(db, JEFE);
    const cliente = await acceso.leerUno("clients", { id: "c1" });
    const fila = await crearEncargo(env, acceso, cliente, { tipo: "lote", mejorar: true, paralelo: 3, pasos: ["a", "b"].map(paso) });
    const { avanzarEncargo } = await import("../../worker/lib/estudio/encargos.js");
    await avanzarEncargo(env, acceso, fila.id); // el director: a
    await avanzarEncargo(env, acceso, fila.id); // se crea a (b aún no tiene diseño: no se pide)
    expect(db.sqlite.prepare("select count(*) n from estudio_trabajos").get().n).toBe(1);
    await avanzarEncargo(env, acceso, fila.id); // el director: b
    expect(llamadas.map((l) => l.piezas)).toEqual([["a"], ["b"]]);
  });
});
