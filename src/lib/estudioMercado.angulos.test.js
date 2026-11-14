import { describe, it, expect } from "vitest";
import { limpiarAngulos, angulosDeProducto, anguloDe, lineaDeAngulo, limpiarDeProducto, MAX_ANGULOS } from "./estudioMercado.js";

describe("los ángulos de venta de un producto", () => {
  it("limpia: nombre obligatorio, id estable sin repetir, sus campos, hasta 5 ganchos y el público", () => {
    const a = limpiarAngulos([
      { nombre: "Sin irritación", dolor: "Ver a su bebé incómodo", ganchos: ["¿Por qué se irrita?", "", "Lo natural no siempre es suave", "a", "b", "c"], publico: "frio" },
      { nombre: "Sin irritación", solucion: "Tela de bambú", publico: "otro" },
      { solucion: "sin nombre" },
      "nada",
    ]);
    expect(a.map((x) => x.id)).toEqual(["sin-irritacion", "sin-irritacion-2"]);
    expect(a[0]).toMatchObject({ nombre: "Sin irritación", dolor: "Ver a su bebé incómodo", publico: "frio" });
    expect(a[0].ganchos).toHaveLength(5);
    expect(a[1].publico).toBeUndefined();
    expect(limpiarAngulos(Array.from({ length: 9 }, (_, i) => ({ nombre: `Ángulo ${i}` })))).toHaveLength(MAX_ANGULOS);
  });

  it("viajan con el estudio de un producto (uno de antes no los trae) y se leen por producto", () => {
    const base = { elementos: { problema: "a", solucion: "b", diferenciador: "c" } };
    expect(limpiarDeProducto(base).angulos).toBeUndefined();
    const p = limpiarDeProducto({ ...base, angulos: [{ nombre: "Ahorro de tiempo", problemaExterno: "No le alcanza el día" }] });
    expect(p.angulos[0].id).toBe("ahorro-de-tiempo");
    const estudio = { productos: { sofa: p } };
    expect(angulosDeProducto(estudio, "sofa")).toHaveLength(1);
    expect(angulosDeProducto(estudio, "mesa")).toEqual([]);
    expect(anguloDe(estudio, "sofa", "ahorro-de-tiempo").nombre).toBe("Ahorro de tiempo");
    expect(lineaDeAngulo(p.angulos[0])).toBe("«Ahorro de tiempo» — problema (lo que se ve): No le alcanza el día");
  });
});
