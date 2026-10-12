import { describe, it, expect } from "vitest";
import {
  limpiarAprendido, lineasAprendidas, faltaParaAprender, pedidoDeAprendizaje, leerAprendizaje, textoDeRespaldoVisual, deMisGustos,
  MAX_APRENDIDO, MAX_TEXTO_REGLA, MIN_GUSTAN,
} from "./aprendizajeVisual";
import { bloqueDeMarca, kitVacio, fundirKit, limpiarKit } from "./kitMarca";

describe("las reglas aprendidas en el kit", () => {
  it("se limpian: cortas, sin repetidas (sin tildes ni mayúsculas) y con tope", () => {
    const r = limpiarAprendido([
      { texto: "  Fondos claros. ", tipo: "gusta" }, { texto: "fondos CLAROS" }, { texto: "x" }, { texto: "Texto arriba", tipo: "evitar" },
      { texto: "y".repeat(400), tipo: "raro" },
    ]);
    expect(r[0]).toEqual({ texto: "Fondos claros", tipo: "gusta" });
    expect(r[1]).toEqual({ texto: "Texto arriba", tipo: "evitar" });
    expect(r[2].tipo).toBe("gusta");
    expect(r[2].texto.length).toBe(MAX_TEXTO_REGLA);
    expect(r).toHaveLength(3);
    expect(limpiarAprendido(Array.from({ length: 20 }, (_, i) => ({ texto: `regla número ${i}` })))).toHaveLength(MAX_APRENDIDO);
    expect(limpiarAprendido("no")).toEqual([]);
  });

  it("van en el bloque de la marca (toda pieza) y cuentan como kit", () => {
    const kit = { aprendido: [{ texto: "fondos claros", tipo: "gusta" }, { texto: "luz natural", tipo: "gusta" }, { texto: "texto arriba", tipo: "evitar" }] };
    expect(lineasAprendidas(kit.aprendido)).toBe("Lo que funciona en esta marca: fondos claros; luz natural. Evita: texto arriba.");
    expect(bloqueDeMarca(kit)).toMatch(/Lo que funciona en esta marca: fondos claros; luz natural\. Evita: texto arriba\./);
    expect(kitVacio(kit)).toBe(false);
    expect(lineasAprendidas([])).toBe("");
    expect(limpiarKit({}).aprendido).toEqual([]);
  });

  it("volver a preparar el kit con IA no se las lleva", () => {
    const antes = { estilo: "a", aprendido: [{ texto: "fondos claros", tipo: "gusta" }] };
    expect(fundirKit(antes, { estilo: "b" }).aprendido).toEqual([{ texto: "fondos claros", tipo: "gusta" }]);
  });
});

describe("lo que se le pide a la IA y cómo se lee", () => {
  it("hacen falta al menos tres «Me gusta»", () => {
    expect(faltaParaAprender({ gustan: MIN_GUSTAN })).toBe("");
    expect(faltaParaAprender({ gustan: 1 })).toMatch(/al menos 3 .*llevas 1/);
  });

  it("el pedido numera lo que gustó (G) y lo descartado (D) con su escena, y dice lo que el kit ya tiene", () => {
    const p = pedidoDeAprendizaje({
      marca: "Dcasa", kit: { estilo: "cálido", aprendido: [{ texto: "fondos claros", tipo: "gusta" }] },
      gustan: [{ prompt: "PRESET\n\nEscena: Un sofá en la sala\n\nMARCA" }, { prompt: "" }], descartadas: [{ prompt: "Una mesa" }],
    });
    expect(p).toMatch(/G1: Un sofá en la sala\nG2: \(subida a mano\)\nD1: Una mesa/);
    expect(p).toMatch(/· estilo: cálido\n· funciona: fondos claros/);
    expect(p).toMatch(/DOS imágenes o más, y al menos una G/);
    expect(p).toMatch(/NINGUNA/);
  });

  it("sólo pasan las reglas con dos respaldos reales y al menos uno que gustó; ni repetidas ni lo que el kit ya dice", () => {
    const texto = [
      "Aquí van:",
      "- GUSTA | Fondos claros | G1, G2",
      "GUSTA | fondos claros | G2, G3",            // repetida
      "GUSTA | sólo una | G1",                     // un respaldo
      "EVITAR | sólo descartadas | D1, D2",        // ninguna G
      "EVITAR | texto arriba | D1, G4",            // G4 no se mandó
      "GUSTA | cálido | G1, G2",                   // el kit ya lo dice
      "evitar | colores saturados | d1, g3",
      "NINGUNA",
    ].join("\n");
    expect(leerAprendizaje(texto, { gustan: 3, descartadas: 2, kit: { estilo: "Cálido" } })).toEqual([
      { texto: "Fondos claros", tipo: "gusta", respaldo: ["G1", "G2"] },
      { texto: "colores saturados", tipo: "evitar", respaldo: ["D1", "G3"] },
    ]);
    expect(leerAprendizaje("NINGUNA", { gustan: 3 })).toEqual([]);
  });

  it("el respaldo se dice en palabras", () => {
    expect(textoDeRespaldoVisual(["G1", "G2", "D1"])).toBe("2 que te gustaron y 1 descartada");
    expect(textoDeRespaldoVisual(["G1", "D1", "D2"])).toBe("1 que te gustó y 2 descartadas");
  });
});

describe("usar mis «Me gusta» como referencia de estilo", () => {
  const a = (id, extra = {}) => ({ id, clave: `k/${id}`, tipo: "imagen", favorito: true, creado: `2026-10-0${id}`, ...extra });
  it("las últimas que gustan, sólo por su estilo, sin las puestas, perdidas, borradas ni videos", () => {
    const archivos = [a("1"), a("2"), a("3"), a("4", { tipo: "video" }), a("5", { favorito: false }), a("6", { borradoAt: "x" }), a("7")];
    const r = deMisGustos(archivos, { yaPuestas: ["k/3"], perdidos: new Set(["7"]), cuantas: 2 });
    expect(r.map((x) => x.id)).toEqual(["2", "1"]);
    expect(r[0].toma).toEqual(["estilo"]);
    expect(deMisGustos(archivos, { cuantas: 0 })).toEqual([]);
  });
});
