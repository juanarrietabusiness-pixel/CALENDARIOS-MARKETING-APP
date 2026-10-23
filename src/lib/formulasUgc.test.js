import { describe, it, expect } from "vitest";
import { limpiarFormula, tramosEnDuracion, lineaDeFormula, bloqueDeFormulas, formulaUsada, pedidoDeFormula, leerFormula, MAX_TRAMOS_FORMULA } from "./formulasUgc";

const F = {
  id: "f1", nombre: "Pregunta → demostración → precio", duracion: 30, gancho: "una pregunta", porQue: "toca un dolor", cuando: "productos con antes y después",
  tramos: [{ desde: 0, hasta: 3, funcion: "una pregunta" }, { desde: 3, hasta: 24, funcion: "la demostración" }, { desde: 24, hasta: 30, funcion: "el precio" }],
};

describe("las fórmulas UGC", () => {
  it("se limpian: sin nombre o con menos de dos tramos no valen; la duración, una de las que hay; la fuente, sólo lo seguro", () => {
    expect(limpiarFormula({ ...F, nombre: " " })).toBeNull();
    expect(limpiarFormula({ ...F, tramos: [F.tramos[0]] })).toBeNull();
    expect(limpiarFormula({ ...F, duracion: 22 }).duracion).toBe(30);
    expect(limpiarFormula({ ...F, tramos: Array.from({ length: 15 }, (_, i) => ({ funcion: `t${i}` })) }).tramos).toHaveLength(MAX_TRAMOS_FORMULA);
    expect(limpiarFormula({ ...F, fuente: { cuenta: "@x", enlace: "javascript:alert(1)", archivoId: "a b" } }).fuente).toEqual({ cuenta: "@x" });
  });

  it("los tramos se reparten en otra duración conservando su proporción; sin tiempos, a partes iguales", () => {
    expect(tramosEnDuracion(F, 60).map((t) => [t.desde, t.hasta])).toEqual([[0, 6], [6, 48], [48, 60]]);
    expect(tramosEnDuracion(F, 15).at(-1).hasta).toBe(15);
    const sinTiempo = { ...F, tramos: F.tramos.map((t) => ({ funcion: t.funcion })) };
    expect(tramosEnDuracion(sinTiempo, 30).map((t) => [t.desde, t.hasta])).toEqual([[0, 10], [10, 20], [20, 30]]);
  });

  it("la línea para la IA dice la forma, no el contenido, ya en la duración pedida", () => {
    const l = lineaDeFormula(F, 15);
    expect(l).toMatch(/^SIGUE ESTA FÓRMULA «Pregunta → demostración → precio» \(la forma, no el contenido\)/);
    expect(l).toContain("[0–2 s] una pregunta");
    expect(l).toContain("Por qué funciona: toca un dolor.");
    expect(lineaDeFormula({ nombre: "" }, 30)).toBe("");
  });

  it("para que la IA escoja: la lista, y la orden de decir cuál usó; la que dice se reconoce aunque cambie tildes o comillas", () => {
    const b = bloqueDeFormulas([F, { ...F, id: "f2", nombre: "Error común" }], 30);
    expect(b).toMatch(/^FÓRMULAS DE LA AGENCIA/);
    expect(b).toContain("- «Error común» (conviene: productos con antes y después)");
    expect(b).toMatch(/FÓRMULA: <el nombre exacto/);
    expect(bloqueDeFormulas([], 30)).toBe("");
    const lista = [F, { ...F, id: "f2", nombre: "Error común" }];
    expect(formulaUsada("FORMULA: «error comun»\n[0–3 s] VOZ: «Hola»", lista)).toBe("f2");
    expect(formulaUsada("Fórmula: Pregunta → demostración → precio.", lista)).toBe("f1");
    expect(formulaUsada("[0–3 s] VOZ: «Hola»", lista)).toBe("");
  });

  it("de un video a su fórmula: el pedido lleva el video tramo a tramo y la respuesta se lee con su fuente", () => {
    const p = pedidoDeFormula({ estructura: "problema → solución", tramos: [{ desde: 0, hasta: 3, voz: "¿Te pasa?", seVe: "una cocina" }] });
    expect(p).toMatch(/SIN su contenido/);
    expect(p).toContain("[0–3 s] dice: «¿Te pasa?» · se ve: una cocina");
    expect(p).toContain("Estructura según quien lo vio: problema → solución.");
    const f = leerFormula('```json\n{"nombre":"X","duracion":44,"tramos":[{"funcion":"a"},{"funcion":"b"}]}\n```', { fuente: { cuenta: "@c" } });
    expect(f).toMatchObject({ nombre: "X", duracion: 45, fuente: { cuenta: "@c" } });
    expect(leerFormula("nada")).toBeNull();
  });
});
