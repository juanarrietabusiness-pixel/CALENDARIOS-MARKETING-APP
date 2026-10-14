import { describe, it, expect } from "vitest";
import { diasDelLote, diasConTipo, planDelMes, pedidoDelMes, leerIdeasDelMes, publicacionDelMes, carpetaDelMes, mesDe } from "./loteMes";

// Octubre 2026: el 1 es jueves. El ritmo de la agencia: lun Anuncio, mar Beneficios, mié Servicios, jue Educativo,
// vie Diferenciador, sáb 7 maletas, dom libre.
describe("el lote del mes completo", () => {
  it("los días: los de la semana escogidos, con el tipo de su ritmo; el domingo libre y lo de antes de hoy no entran", () => {
    const dias = diasDelLote({ year: 2026, month: 9, dias: [1, 4, 0] });
    expect(dias.slice(0, 3)).toEqual([{ fecha: "2026-10-01", pilar: "educativo" }, { fecha: "2026-10-05", pilar: "anuncio" }, { fecha: "2026-10-08", pilar: "educativo" }]);
    expect(dias.every((d) => d.pilar)).toBe(true);
    expect(dias).toHaveLength(9);
    expect(diasDelLote({ year: 2026, month: 9, dias: [1], desde: "2026-10-14" }).map((d) => d.fecha)).toEqual(["2026-10-19", "2026-10-26"]);
    expect(diasConTipo(null, 2026, 9)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("la temporada ajusta: un día delicado no vende, y se dice por qué", () => {
    const dias = diasDelLote({ year: 2026, month: 10, dias: [1, 2], fechas: [{ fecha: "2026-11-02", nombre: "Día de los Difuntos", tipo: "feriado", delicada: true }] });
    expect(dias.find((d) => d.fecha === "2026-11-02")).toMatchObject({ pilar: "educativo", cambio: expect.stringMatching(/Difuntos.*sin promociones/) });
  });

  it("el plan: la matriz del mes (producto, nivel, maleta) y una forma distinta por pieza", () => {
    const dias = diasDelLote({ year: 2026, month: 9, dias: [1, 2, 6] });
    const plan = planDelMes(dias, { productos: [{ id: "a", nombre: "A" }, { id: "b", nombre: "B" }] });
    expect(plan[0]).toMatchObject({ n: 1, fecha: "2026-10-03", pilar: "maletas" });
    expect(plan.find((p) => p.pilar === "maletas").pilarSub).toBeTruthy();
    expect(plan.filter((p) => p.pilar === "anuncio").every((p) => ["a", "b"].includes(p.productoId) && p.nivel)).toBe(true);
    for (let i = 1; i < plan.length; i++) expect(plan[i].composicion).not.toBe(plan[i - 1].composicion);
  });

  it("el pedido lleva cada día con su tipo y su regla; la lectura, una idea por día con su descripción", () => {
    const plan = planDelMes(diasDelLote({ year: 2026, month: 9, dias: [1] }).slice(0, 2), { productos: [{ id: "a", nombre: "Sofá" }] });
    const p = pedidoDelMes({ marca: "Dcasa", plan, productos: { a: "Sofá · $399" }, fechasEspeciales: ["2026-10-12 · Día de la Raza"] });
    expect(p).toMatch(/^1\. lunes, 5 de octubre · Anuncio: Pieza de venta directa/m);
    expect(p).toMatch(/producto: Sofá · \$399/);
    expect(p).toMatch(/Fechas especiales del mes:\n- 2026-10-12 · Día de la Raza/);
    const ideas = leerIdeasDelMes(JSON.stringify({ ideas: [{ n: 1, titular: "Tu sala, hoy", apoyo: "Desde $399", escena: "Un sofá", descripcion: "Escríbenos." }, { n: 2, titular: "", escena: "x" }] }), plan);
    expect(ideas).toHaveLength(1);
    expect(ideas[0]).toMatchObject({ fecha: "2026-10-05", pilar: "anuncio", productoId: "a", titular: "Tu sala, hoy", descripcion: "Escríbenos.", elegida: true });
    const post = publicacionDelMes({ id: "p1", idea: ideas[0], archivo: { src: "/api/media/clientes/c1/x.jpg" } });
    expect(post).toMatchObject({ id: "p1", format: "post", pilar: "anuncio", productoId: "a", producto: "Sofá", status: "pending", textoPieza: "Tu sala, hoy\nDesde $399", descripcion: "Escríbenos." });
  });

  it("nombres y meses", () => {
    expect(carpetaDelMes(2026, 9)).toBe("Lote octubre de 2026");
    expect(mesDe("2026-10")).toEqual({ year: 2026, month: 9 });
    expect(mesDe("2026-13")).toBeNull();
  });
});
