import { describe, it, expect } from "vitest";
import { estadoDePrimerosPasos, pasosDelCliente, resumenDePasos } from "./primerosPasos";

describe("estadoDePrimerosPasos (lo que dice cada fila)", () => {
  it("un cliente recién creado no tiene nada", () => {
    expect(estadoDePrimerosPasos({ cliente: { name: "Nuevo" } })).toEqual({
      ficha: false, logo: false, productos: 0, conFotos: 0, estudio: false, conBorrador: false, fichaTecnica: false, plan: false, redes: [], mes: false,
    });
  });

  it("lee el kit en texto, el estudio aprobado, las fotos y las redes sin repetir", () => {
    const e = estadoDePrimerosPasos({
      cliente: { industry: "Muebles", descripcion: "Fábrica de sofás", kit_marca: JSON.stringify({ logo: "clientes/c1/logo.png" }), plan_semanal: '{"dias":null}' },
      productos: [{ fotos: ["clientes/c1/a.jpg"] }, { fotos: [] }],
      estudio: JSON.stringify({ aprobadoAt: "2026-10-01T00:00:00.000Z" }),
      conFicha: true,
      redes: ["instagram", "facebook", "instagram"],
      conMes: true,
    });
    expect(e).toMatchObject({ ficha: true, logo: true, productos: 2, conFotos: 1, estudio: true, fichaTecnica: true, plan: true, mes: true });
    expect(e.redes).toEqual(["instagram", "facebook"]);
  });

  it("la ficha pide el rubro Y de qué va (o a quién); un estudio sin aprobar no cuenta", () => {
    expect(estadoDePrimerosPasos({ cliente: { industry: "Muebles" } }).ficha).toBe(false);
    expect(estadoDePrimerosPasos({ cliente: { industry: "Muebles", audiencia: "Familias" } }).ficha).toBe(true);
    expect(estadoDePrimerosPasos({ cliente: {}, estudio: "{}", conBorrador: true })).toMatchObject({ estudio: false, conBorrador: true });
    // El plan de antes (plantilla o ritmo) también cuenta: lo de antes sigue valiendo.
    expect(estadoDePrimerosPasos({ cliente: { ritmo_contenido: "{}" } }).plan).toBe(true);
  });
});

describe("pasosDelCliente", () => {
  it("sin estado, nada; con estado, los ocho pasos en orden y cada uno con su arreglo", () => {
    expect(pasosDelCliente(null)).toEqual([]);
    const pasos = pasosDelCliente(estadoDePrimerosPasos({ cliente: {} }));
    expect(pasos.map((p) => p.id)).toEqual(["ficha", "logo", "fotos", "estudio", "cerebro", "plan", "redes", "mes"]);
    for (const p of pasos) {
      expect(p.hecho, p.id).toBe(false);
      expect(p.arreglo?.etiqueta, p.id).toBeTruthy();
      expect(Boolean(p.arreglo.ir || p.arreglo.ruta || p.arreglo.accion), p.id).toBe(true);
    }
    expect(pasos.find((p) => p.id === "fotos").arreglo).toMatchObject({ ir: ["marca", "cerebro"], mercado: "catalogo", etiqueta: "Escribir el catálogo" });
    expect(pasos.find((p) => p.id === "redes").arreglo.ruta).toBe("/ajustes#integraciones");
    expect(pasos.find((p) => p.id === "mes").arreglo.accion).toBe("mes");
  });

  it("dice lo que falta con cifras y nombres de verdad", () => {
    const pasos = pasosDelCliente({ productos: 3, conFotos: 1, redes: ["instagram", "tiktok"], conBorrador: true });
    const de = (id) => pasos.find((p) => p.id === id);
    expect(de("fotos")).toMatchObject({ hecho: true, texto: "1 con fotos; 2 todavía sin ellas." });
    expect(de("redes")).toMatchObject({ hecho: true, texto: "Instagram, TikTok: se programa desde aquí." });
    expect(de("estudio").arreglo.etiqueta).toBe("Revisarlo y aprobarlo");
  });

  it("el resumen: cuántos hechos y si está completo", () => {
    const todo = { ficha: true, logo: true, productos: 1, conFotos: 1, estudio: true, fichaTecnica: true, plan: true, redes: ["instagram"], mes: true };
    expect(resumenDePasos(pasosDelCliente(todo))).toEqual({ hechos: 8, total: 8, completo: true });
    expect(resumenDePasos(pasosDelCliente({ ...todo, logo: false }))).toEqual({ hechos: 7, total: 8, completo: false });
    expect(resumenDePasos([])).toEqual({ hechos: 0, total: 0, completo: false });
  });
});
