import { describe, it, expect } from "vitest";
import { limpiarNotasSemana, notaDelDia, productoDeNota, conNotasDelDia, diaDeLaSemana, lineaDeNotaDelDia, MAX_NOTA_DIA } from "./notasSemana.js";
import { pedidoDeProduccion } from "./loteAnuncios.js";
import { planDelMes } from "./loteMes.js";
import { semanaEstandar } from "./planSemanal.js";

const productos = [
  { id: "p1", nombre: "Camas" },
  { id: "p2", nombre: "Sofá cama" },
  { id: "p3", nombre: "Lentes" },
];

describe("las notas fijas de los días", () => {
  it("se limpian: sólo días con texto, una línea y con tope", () => {
    expect(limpiarNotasSemana({ 1: "  Muebles\n y camas ", 3: "", 9: "x", 5: "a".repeat(300) })).toEqual({ 1: "Muebles y camas", 5: "a".repeat(MAX_NOTA_DIA) });
    expect(limpiarNotasSemana({})).toBeNull();
    expect(limpiarNotasSemana("texto")).toBeNull();
    expect(limpiarNotasSemana(null)).toBeNull();
  });
  it("cada fecha toma la nota de SU día de la semana", () => {
    expect(diaDeLaSemana("2026-11-02")).toBe(1); // lunes
    expect(notaDelDia({ 1: "Muebles y camas" }, "2026-11-02")).toBe("Muebles y camas");
    expect(notaDelDia({ 1: "Muebles y camas" }, "2026-11-04")).toBe("");
    expect(notaDelDia({ 1: "x" }, "no-es-fecha")).toBe("");
  });
  it("encuentra el producto que nombra la nota, el de nombre más largo, sin tildes", () => {
    expect(productoDeNota("Promo SOFA CAMA de la semana", productos)?.id).toBe("p2");
    expect(productoDeNota("muebles y camas", productos)?.id).toBe("p1");
    expect(productoDeNota("Promo Feria Chorrera", productos)).toBeNull();
    // Una palabra que sólo CONTIENE el nombre no cuenta («camastro» no es «camas»).
    expect(productoDeNota("camastros", productos)).toBeNull();
  });
  it("las casillas del día llevan su nota y su producto, sin pisar el que ya tenían", () => {
    const r = conNotasDelDia([
      { fecha: "2026-11-02", pilar: "anuncio" },
      { fecha: "2026-11-09", pilar: "anuncio", productoId: "p3", producto: "Lentes" },
      { fecha: "2026-11-03", pilar: "educativo" },
    ], { 1: "Muebles y camas" }, productos);
    expect(r[0]).toMatchObject({ notaDia: "Muebles y camas", productoId: "p1", producto: "Camas" });
    expect(r[1]).toMatchObject({ notaDia: "Muebles y camas", productoId: "p3" });
    expect(r[2].notaDia).toBeUndefined();
  });
  it("NO cambia el formato ni el tipo de la casilla", () => {
    const [c] = conNotasDelDia([{ fecha: "2026-11-02", pilar: "anuncio", formato: "carrusel" }], { 1: "Camas" }, productos);
    expect(c.pilar).toBe("anuncio");
    expect(c.formato).toBe("carrusel");
  });
  it("la IA la lee en la pieza de ese día", () => {
    const plan = planDelMes(conNotasDelDia([{ fecha: "2026-11-02", pilar: "anuncio" }], { 1: "Muebles y camas" }, productos), { productos });
    expect(plan[0]).toMatchObject({ productoId: "p1", notaDia: "Muebles y camas" });
    const pedido = pedidoDeProduccion({ marca: "D'CASA", plan, productos: { p1: "Camas · 199 $" } });
    expect(pedido).toContain(lineaDeNotaDelDia("Muebles y camas"));
    expect(pedido).toContain("producto: Camas");
  });
  it("«Volver al estándar» no se lleva las notas: las conserva en el plan único y en su columna", () => {
    const e = semanaEstandar({ notasSemana: { 1: "x" } }, []);
    expect(e.notasSemana).toEqual({ 1: "x" });
    expect(e.planSemanal.notas).toEqual({ 1: "x" });
  });
});
