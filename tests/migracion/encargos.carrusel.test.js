import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";

// ============================================================
// El carrusel que lleva el servidor (encargo «carrusel»), contra una D1 de verdad
//
// Lo que hacía `crearCarrusel` en la pantalla, sin ella: las láminas EN ORDEN,
// cada una con la anterior y la portada (las crudas) de referencia, el sistema
// de diseño de la portada en el pedido de las demás, y la carpeta ordenada al
// terminar. El director y el control MIRAN con la IA: aquí se simulan.
// ============================================================

let sistemaPedido = 0;
vi.mock("../../worker/lib/estudio/control.js", () => ({
  controlarPieza: vi.fn(async () => ({ control: { estado: "ok", errores: [] } })),
  sistemaDePortada: vi.fn(async () => { sistemaPedido += 1; return { sistema: { titular: { tamano: "18 % de la altura" }, zonaTexto: "tercio superior" } }; }),
}));
let propuesta = null;
vi.mock("../../worker/lib/estudio/carrusel.js", () => ({
  propuestaDeCarrusel: vi.fn(async () => { if (!propuesta) throw new Error("sin director"); return propuesta; }),
}));

const { crearEncargo, encargoPublico } = await import("../../worker/lib/estudio/encargos.js");
const { bombear } = await import("../../worker/lib/estudio/bomba.js");

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
  sistemaPedido = 0;
  propuesta = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2() };
  db.sqlite.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "j@a.com", "x", "x");
  db.sqlite.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  db.sqlite.prepare("insert into estudio_carpetas (id, owner_id, client_id, nombre, tipo) values (?,?,?,?,?)").run("k1", JEFE, "c1", "Carrusel · x", "carrusel");
});
afterEach(() => vi.useRealTimers());

const laminas = (n) => Array.from({ length: n }, (_, i) => ({ n: i + 1, texto: `Texto ${i + 1}`, rol: i === 0 ? "portada" : "contenido" }));
const comun = (extra = {}) => ({ modelo: "prueba", idea: "Tres errores", preset: "Estilo de la marca.", modo: "ia", ...extra });

async function lanzar(cuerpo) {
  const acceso = crearAcceso(db, JEFE);
  const cliente = await acceso.leerUno("clients", { id: "c1" });
  const e = await crearEncargo(env, acceso, cliente, { tipo: "carrusel", carpetaId: "k1", ...cuerpo });
  for (let i = 0; i < 60; i++) {
    if ((await bombear(env, JEFE)) == null) break;
    vi.setSystemTime(new Date(Date.now() + 5000));
  }
  return encargoPublico(await acceso.leerUno("estudio_encargos", { id: e.id }), { conPedidos: true });
}

const trabajos = () => db.sqlite.prepare("select prompt, medios from estudio_trabajos order by created_at").all()
  .map((t) => ({ prompt: t.prompt, refs: JSON.parse(t.medios).reference ?? [] }));
const clavesDe = (e) => e.pasos.map((p) => db.sqlite.prepare("select clave from estudio_archivos where id = ?").get(p.opciones[0].id).clave);

describe("el carrusel en el servidor", () => {
  it("en orden: la 2 con la anterior; la 3 con la anterior y la portada", async () => {
    const e = await lanzar({ comun: comun(), laminas: laminas(3), conSistema: false });
    expect(e.estado).toBe("hecho");
    const [l1, l2, l3] = trabajos();
    const [c1, c2] = clavesDe(e);
    expect(l1.refs).toEqual([]);
    expect(l2.refs).toEqual([c1]);
    expect(l3.refs).toEqual([c2, c1]);
    expect(l1.prompt).toMatch(/^Lámina 1 de 3/);
    expect(l3.prompt).toContain('"Texto 3"');
  });

  it("el sistema de la portada se saca UNA vez, antes de la segunda, y va en el pedido de las demás", async () => {
    await lanzar({ comun: comun(), laminas: laminas(3) });
    expect(sistemaPedido).toBe(1);
    const [l1, l2, l3] = trabajos();
    expect(l1.prompt).not.toContain("tercio superior");
    expect(l2.prompt).toContain("tercio superior");
    expect(l3.prompt).toContain("tercio superior");
  });

  it("en plantilla no hay sistema ni texto en la imagen, y espera a la pantalla (el texto encima)", async () => {
    const e = await lanzar({ comun: comun({ modo: "plantilla" }), laminas: laminas(2) });
    expect(sistemaPedido).toBe(0);
    expect(trabajos()[0].prompt).toMatch(/NO escribas ningún texto/);
    expect(e.pasos.every((p) => p.navegador?.plantilla && !p.finales)).toBe(true);
  });

  it("con el logo estampado, también espera a la pantalla; sin nada encima, la final es la que salió", async () => {
    const con = await lanzar({ comun: comun(), laminas: laminas(2), conSistema: false, logoEstampado: true });
    expect(con.pasos.every((p) => p.navegador?.logo && !p.finales)).toBe(true);
    const sin = await lanzar({ comun: comun(), laminas: laminas(2), conSistema: false });
    expect(sin.pasos.every((p) => p.finales?.[0] === p.opciones[0].id)).toBe(true);
  });

  it("al terminar, la carpeta queda ordenada (la galería lo enseña como una tarjeta, en este orden)", async () => {
    const e = await lanzar({ comun: comun(), laminas: laminas(3), conSistema: false });
    const orden = JSON.parse(db.sqlite.prepare("select orden from estudio_carpetas where id = 'k1'").get().orden);
    expect(orden).toEqual(e.pasos.map((p) => p.opciones[0].id));
  });

  it("tras aprobar la portada: sigue desde la 2 con la portada y la anterior de antes, y su sistema", async () => {
    const e = await lanzar({
      comun: comun(), laminas: laminas(3).slice(1), total: 3, previas: { portada: "clientes/c1/p.png", anterior: "clientes/c1/p.png" },
      sistema: { zonaTexto: "abajo a la izquierda" },
    });
    // Las referencias tienen que existir en R2 para pedir: sin la portada de verdad, la 2 no se puede pedir.
    expect(e.pasos[0].fase).toBe("fallido");
    await env.MEDIA.put("clientes/c1/p.png", new Uint8Array([1]));
    const bien = await lanzar({
      comun: comun(), laminas: laminas(3).slice(1), total: 3, previas: { portada: "clientes/c1/p.png", anterior: "clientes/c1/p.png" },
      sistema: { zonaTexto: "abajo a la izquierda" },
    });
    expect(bien.estado).toBe("hecho");
    const pedidos = trabajos().slice(-2);
    expect(pedidos[0].refs).toEqual(["clientes/c1/p.png"]);
    expect(pedidos[0].prompt).toMatch(/^Lámina 2 de 3/);
    expect(pedidos[0].prompt).toContain("abajo a la izquierda");
    expect(sistemaPedido).toBe(0);
  });

  it("con PROPUESTA, el director diseña la serie en el servidor; si no responde, el guion de respaldo", async () => {
    propuesta = { hilo: "Fondo crema, titular en negro", laminas: [{ n: 1, texto: "Uno", rol: "portada", ficha: "Pieza: portada\\nComposición: centrada" }, { n: 2, texto: "Dos", rol: "cierre" }] };
    const e = await lanzar({ comun: comun(), propuesta: { tema: "x" }, laminas: laminas(4), conSistema: false });
    expect(e.pasos).toHaveLength(2);
    expect(trabajos()[0].prompt).toContain("Fondo crema");
    propuesta = null;
    const respaldo = await lanzar({ comun: comun(), propuesta: { tema: "x" }, laminas: laminas(3), conSistema: false });
    expect(respaldo.pasos).toHaveLength(3);
    expect(respaldo.estado).toBe("hecho");
  });
});
