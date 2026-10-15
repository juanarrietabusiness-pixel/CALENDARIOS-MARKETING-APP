import { describe, it, expect } from "vitest";
import { diasDelLote, diasConTipo, planDelMes, carpetaDelMes, mesDe, diasConPublicacion, casillasConPlantilla, diasConPlantilla } from "./loteMes";
import { pedidoDeProduccion, leerProduccion, publicacionDePieza } from "./loteAnuncios";

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
    const p = pedidoDeProduccion({ marca: "Dcasa", plan, mes: true, productos: { a: "Sofá · $399" }, fechasEspeciales: ["2026-10-12 · Día de la Raza"] });
    expect(p).toMatch(/^1\. lunes, 5 de octubre · Anuncio: Pieza de venta directa/m);
    expect(p).toMatch(/producto: Sofá · \$399/);
    expect(p).toMatch(/Fechas especiales:\n- 2026-10-12 · Día de la Raza/);
    const ideas = leerProduccion(JSON.stringify({ ideas: [{ n: 1, titular: "Tu sala, hoy", apoyo: "Desde $399", escena: "Un sofá", descripcion: "Escríbenos." }, { n: 2, titular: "", escena: "x" }] }), plan);
    expect(ideas).toHaveLength(1);
    expect(ideas[0]).toMatchObject({ fecha: "2026-10-05", pilar: "anuncio", productoId: "a", titular: "Tu sala, hoy", descripcion: "Escríbenos.", elegida: true });
    const post = publicacionDePieza({ id: "p1", idea: ideas[0], archivo: { src: "/api/media/clientes/c1/x.jpg" } });
    expect(post).toMatchObject({ id: "p1", format: "post", pilar: "anuncio", productoId: "a", producto: "Sofá", status: "pending", textoPieza: "Tu sala, hoy\nDesde $399", descripcion: "Escríbenos." });
  });

  it("nombres y meses", () => {
    expect(carpetaDelMes(2026, 9)).toBe("Lote octubre de 2026");
    expect(mesDe("2026-10")).toEqual({ year: 2026, month: 9 });
    expect(mesDe("2026-13")).toBeNull();
  });
});

describe("los días que ya tienen publicación (el lote del mes los salta)", () => {
  it("sólo los del mes pedido y con alguna publicación, sin repetir y en orden", () => {
    const calendarios = [
      { days: [{ date: "2026-10-12", posts: [{ id: "a" }] }, { date: "2026-10-05", posts: [{ id: "b" }, { id: "c" }] }, { date: "2026-10-07", posts: [] }] },
      { days: [{ date: "2026-11-02", posts: [{ id: "d" }] }, { date: "2026-10-12", posts: [{ id: "e" }] }] },
    ];
    expect(diasConPublicacion(calendarios, "2026-10")).toEqual(["2026-10-05", "2026-10-12"]);
    expect(diasConPublicacion(calendarios, "2026-12")).toEqual([]);
    expect(diasConPublicacion(calendarios, "otro")).toEqual([]);
    expect(diasConPublicacion(undefined, "2026-10")).toEqual([]);
  });
});

describe("el mes con la plantilla de plan del cliente", () => {
  // Marzo 2030: el 4 es lunes. Lunes: un post del ritmo y un reel de contenido humano; miércoles: un carrusel; jueves: un directo.
  const formatos = { 1: [{ format: "post", pilar: "" }, { format: "reel", pilar: "humano" }], 3: [{ format: "carrusel", pilar: "" }], 4: [{ format: "live", pilar: "" }] };

  it("una casilla por publicación de cada día escogido, con su formato y su tipo (el de la plantilla o el del ritmo); sin directos", () => {
    const c = casillasConPlantilla({ year: 2030, month: 2, formatos, dias: [1, 3, 4], desde: "2030-03-10", omitir: ["2030-03-13"] });
    expect(c.slice(0, 3)).toEqual([
      { clave: "2030-03-11|0", fecha: "2030-03-11", formato: "post", pilar: "anuncio" },
      { clave: "2030-03-11|1", fecha: "2030-03-11", formato: "reel", pilar: "humano" },
      { clave: "2030-03-18|0", fecha: "2030-03-18", formato: "post", pilar: "anuncio" },
    ]);
    expect(c.some((x) => x.fecha === "2030-03-13")).toBe(false);
    expect(c.filter((x) => x.formato === "carrusel").map((x) => [x.fecha, x.pilar])).toEqual([["2030-03-20", "servicios"], ["2030-03-27", "servicios"]]);
    expect(c.some((x) => x.formato === "live")).toBe(false);
  });

  it("los días que se marcan solos: los que tienen algo que el lote sabe hacer", () => {
    expect(diasConPlantilla(formatos)).toEqual([1, 3]);
  });
});
