import { describe, it, expect, vi } from "vitest";

// El lote que lleva el servidor: la pantalla arma cada pieza por el MISMO camino que antes (`pedidoDeLote`), con la
// escena en su hueco. Aquí se comprueba lo que viaja; lo que hace el servidor con ello, en tests/migracion/encargos*.

const pedidos = [];
vi.mock("./db", () => ({ pedir: vi.fn(async (ruta, op) => { pedidos.push({ ruta, cuerpo: op?.body ? JSON.parse(op.body) : null }); return { encargo: { id: "e1", pasos: [] }, archivos: [] }; }) }));
vi.mock("./estudio", async (original) => ({ ...(await original()), vistasDelCliente: vi.fn(async () => [{ media_type: "image/jpeg", data: "x" }]) }));

const { pasoDeLote, lanzarLote } = await import("./loteServidor.js");
const { pedidoDeLote } = await import("./loteEstudio.js");
const { ESCENA, resultadoDePaso } = await import("./encargos.js");
const { modeloPorId } = await import("./estudioCatalogo.js");

const kit = {};
const modelo = modeloPorId("prueba");
const pedidoDe = (idea, n = 1, escena = null) => pedidoDeLote({ idea, escena, kit, preset: "anuncio", modo: "ia", formato: "post", modelo, n, marca: "Dcasa" });
const idea = { id: "i1", titular: "Sofá cama", apoyo: "Desde 299", escena: "Un sofá en una sala luminosa", brief: "Vender el sofá", tipo: "anuncio" };

describe("cada pieza como paso del encargo", () => {
  it("el pedido es el de siempre, con el hueco donde va la escena", () => {
    const p = pasoDeLote(idea, { pedidoDe, n: 2 });
    expect(p.pedido.prompt).toContain(ESCENA);
    expect(p.pedido.modelo).toBe("prueba");
    expect(p.pedido.n).toBe(2);
    // Lo demás del pedido es idéntico a pedirlo con una escena cualquiera: sólo cambia el hueco.
    expect(p.pedido.prompt.replace(ESCENA, "X")).toBe(pedidoDe(idea, 2, "X").prompt);
  });

  it("sin ficha, el servidor la pide al director (y si no, a la mejora); con ficha, va lista", () => {
    const sin = pasoDeLote(idea, { pedidoDe, mejorar: true });
    expect(sin.escena).toBe("");
    expect(sin.encargo).toMatchObject({ formato: "post", texto: expect.stringContaining("Sofá cama") });
    expect(sin.mejora).toMatchObject({ tipo: "imagen" });
    const con = pasoDeLote({ ...idea, ficha: "Pieza: anuncio\nComposición: centrada" }, { pedidoDe, mejorar: true });
    expect(con.escena).toMatch(/^Pieza: anuncio/);
    expect(con.encargo).toBeNull();
  });

  it("sin mejorar, la escena es la de la idea tal cual; con plantilla, ni texto que controlar ni control", () => {
    const p = pasoDeLote(idea, { pedidoDe, mejorar: false, modo: "plantilla", controlar: true });
    expect(p.escena).toBe(p.sinMejorar);
    expect(p.encargo).toBeNull();
    expect(p.texto).toBe("");
    expect(p.controlar).toBe(false);
  });

  it("lanzar manda las piezas, la carpeta y las vistas para el director", async () => {
    await lanzarLote({ clienteId: "c1", ideas: [idea], pedidoDe, carpetaId: "k1", controlar: true });
    const { ruta, cuerpo } = pedidos.at(-1);
    expect(ruta).toBe("/estudio/c1/encargos");
    expect(cuerpo).toMatchObject({ tipo: "lote", carpetaId: "k1", controlar: true, mejorar: true });
    expect(cuerpo.pasos).toHaveLength(1);
    expect(cuerpo.vistas).toHaveLength(1);
  });
});

describe("lo que enseña la pantalla de cada pieza", () => {
  const archivos = new Map([["x", { id: "x", src: "/x" }], ["y", { id: "y", src: "/y" }]]);
  it("va, falló o salió (con lo que puso la pantalla encima, si ya lo hizo)", () => {
    expect(resultadoDePaso({ fase: "generando" })).toMatchObject({ cargando: true, paso: "Creando la imagen…" });
    expect(resultadoDePaso({ fase: "fallido", error: "sin llave" })).toEqual({ error: "sin llave" });
    const r = resultadoDePaso({ fase: "hecho", opciones: [{ id: "x" }], finales: ["y"] }, archivos);
    expect(r.opciones[0]).toMatchObject({ crudo: { id: "x" }, final: { id: "y" } });
    expect(r.sinTerminar).toBe(false);
    expect(resultadoDePaso({ fase: "hecho", opciones: [{ id: "x" }] }, archivos).opciones[0].final.id).toBe("x");
  });
});
