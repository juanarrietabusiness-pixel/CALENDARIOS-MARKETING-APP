import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";

// ============================================================
// El control de calidad dentro de un encargo (sin la pantalla)
//
// El control de verdad MIRA la imagen con la IA; aquí se simula su respuesta
// para comprobar lo que hace el servidor con ella: una corrección como mucho,
// y la corregida se queda SÓLO si mejoró (la misma regla que el navegador).
// ============================================================

const controles = [];
vi.mock("../../worker/lib/estudio/control.js", () => ({
  controlarPieza: vi.fn(async (_env, _acceso, _cliente, archivoId, opciones) => {
    controles.push({ archivoId, ...opciones });
    return { control: controles.length === 1 ? MAL : BIEN };
  }),
}));

const MAL = { estado: "revisar", corregible: true, texto: "Sofá cama", ficha: "Pieza: x", errores: [{ escrito: "Sofa", esperado: "Sofá" }] };
let BIEN = { estado: "ok", errores: [] };

const { crearEncargo, avanzarEncargo } = await import("../../worker/lib/estudio/encargos.js");
const { bombear } = await import("../../worker/lib/estudio/bomba.js");
const { ESCENA } = await import("../../src/lib/encargos.js");

const JEFE = "u-jefe";
let db;
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
  controles.length = 0;
  BIEN = { estado: "ok", errores: [] };
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2() };
  db.sqlite.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "j@a.com", "x", "x");
  db.sqlite.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
});
afterEach(() => vi.useRealTimers());

async function lote() {
  const acceso = crearAcceso(db, JEFE);
  const cliente = await acceso.leerUno("clients", { id: "c1" });
  const e = await crearEncargo(env, acceso, cliente, {
    tipo: "lote", mejorar: false, controlar: true,
    pasos: [{ id: "a", escena: "Un sofá cama", texto: "Sofá cama", controlar: true, pedido: { modelo: "prueba", prompt: `Escena: ${ESCENA}`, n: 1, ajustes: { aspectRatio: "4:5" }, medios: {} } }],
  });
  for (let i = 0; i < 30; i++) {
    if ((await bombear(env, JEFE)) == null) break;
    vi.setSystemTime(new Date(Date.now() + 5000));
  }
  return JSON.parse((await acceso.leerUno("estudio_encargos", { id: e.id })).pasos)[0];
}

describe("el control dentro del encargo", () => {
  it("una letra mal escrita: UNA corrección editando la misma imagen; se queda la corregida porque mejoró", async () => {
    const p = await lote();
    expect(p.fase).toBe("hecho");
    const [o] = p.opciones;
    expect(o.corregida).toBe(true);
    expect(o.descartada).toBeTruthy();
    expect(o.id).not.toBe(o.descartada);
    // La corrección es una EDICIÓN (la imagen de referencia) con lo que hay que cambiar.
    const edicion = db.sqlite.prepare("select prompt, medios from estudio_trabajos order by created_at").all()[1];
    expect(edicion.prompt).toMatch(/Edita la imagen de referencia/);
    expect(edicion.prompt).toContain('donde dice "Sofa" debe decir "Sofá"');
    // La segunda vez se controla contra la ficha de la ORIGINAL.
    expect(controles[1]).toMatchObject({ ficha: "Pieza: x", texto: "Sofá cama" });
  });

  it("si la corregida no mejoró, se queda la original", async () => {
    BIEN = { estado: "revisar", corregible: true, errores: [{ escrito: "Sofa", esperado: "Sofá" }, { escrito: "cma", esperado: "cama" }] };
    const p = await lote();
    expect(p.opciones[0].corregida).toBeFalsy();
    expect(controles).toHaveLength(2);
    // Nunca una segunda corrección: el costo tiene techo.
    expect(db.sqlite.prepare("select count(*) n from estudio_trabajos").get().n).toBe(2);
  });

  it("no se avanza dos veces a la vez ni sin el permiso", async () => {
    const acceso = crearAcceso(db, JEFE);
    const cliente = await acceso.leerUno("clients", { id: "c1" });
    const e = await crearEncargo(env, acceso, cliente, { tipo: "lote", mejorar: false, pasos: [{ id: "a", escena: "x", pedido: { modelo: "prueba", prompt: ESCENA, n: 1 } }] });
    db.sqlite.prepare("update estudio_encargos set bloqueado_hasta = ? where id = ?").run("2099-01-01T00:00:00.000Z", e.id);
    expect((await avanzarEncargo(env, acceso, e.id)).ocupado).toBe(true);
  });
});
