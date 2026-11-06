import { describe, it, expect } from "vitest";
import { loteDeLaDireccion, direccionDelLote } from "./lotePauta";

describe("el lote abierto por la dirección", () => {
  it("«?lote=mes» abre el mes completo, como siempre", () => {
    expect(loteDeLaDireccion(new URLSearchParams("lote=mes&mes=2026-12"))).toEqual({ alcance: "mes", mes: "2026-12" });
  });

  it("«?lote=pauta» abre los anuncios por niveles con su etapa, y va y vuelve por la dirección", () => {
    const url = direccionDelLote("/cliente/c1/crear/galeria", { n: 3, etapa: "presentacion", nivel: "problema", productoId: "sofa" }, "Producto o Beneficios; distintas.");
    expect(url.startsWith("/cliente/c1/crear/galeria?lote=pauta&")).toBe(true);
    const q = new URL(url, "https://x.test").searchParams;
    expect(loteDeLaDireccion(q)).toEqual({
      alcance: "anuncios", pauta: { etapa: "presentacion", nivel: "problema" }, cuantas: { problema: 3 }, productoId: "sofa", indicacion: "Producto o Beneficios; distintas.",
    });
    // Como mucho 6 (los anuncios de un conjunto), al menos 1.
    expect(loteDeLaDireccion(new URLSearchParams("lote=pauta&etapa=evaluacion&nivel=solucion&n=40")).cuantas).toEqual({ solucion: 6 });
  });

  it("otra cosa no abre nada", () => {
    expect(loteDeLaDireccion(new URLSearchParams("receta=foto"))).toBe(false);
    expect(loteDeLaDireccion(null)).toBe(false);
  });
});
