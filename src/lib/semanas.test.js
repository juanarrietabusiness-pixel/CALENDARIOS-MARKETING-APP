import { describe, it, expect } from "vitest";
import { semanaDelMes, agruparPorSemana, semanaInicial, rangoSemana } from "./semanas.js";

describe("la lista por semanas", () => {
  it("la semana natural del mes, de lunes a domingo", () => {
    // Octubre de 2026 empieza en jueves.
    expect(semanaDelMes("2026-10-01")).toBe(1);
    expect(semanaDelMes("2026-10-04")).toBe(1); // domingo
    expect(semanaDelMes("2026-10-05")).toBe(2); // lunes
    expect(semanaDelMes("2026-10-31")).toBe(5);
  });

  it("agrupa por la semana del calendario y resume cada una", () => {
    const days = [
      { date: "2026-10-08", weekNumber: 2, concept: "Lanzamiento", posts: [{ status: "approved" }, { status: "rejected" }] },
      { date: "2026-10-01", weekNumber: 1, posts: [{ status: "published" }, {}] },
      { date: "2026-10-06", weekNumber: 2, posts: [] },
    ];
    const g = agruparPorSemana(days);
    expect(g.map((x) => x.numero)).toEqual([1, 2]);
    expect(g[1]).toMatchObject({ desde: "2026-10-06", hasta: "2026-10-08", concepto: "Lanzamiento", total: 2, aprobadas: 1, cambios: 1, pendientes: 0 });
    expect(g[1].dias.map((d) => d.date)).toEqual(["2026-10-06", "2026-10-08"]);
    expect(g[0]).toMatchObject({ total: 2, aprobadas: 1, publicadas: 1, pendientes: 1 });
  });

  it("un día sin semana cae en la natural", () => {
    const g = agruparPorSemana([{ date: "2026-10-05", posts: [] }, { date: "2026-10-12", weekNumber: 3, posts: [] }]);
    expect(g.map((x) => x.numero)).toEqual([2, 3]);
  });

  it("abre la semana de hoy; la primera si el mes no empezó; la última si ya pasó", () => {
    const g = agruparPorSemana([
      { date: "2026-10-01", weekNumber: 1, posts: [] },
      { date: "2026-10-08", weekNumber: 2, posts: [] },
      { date: "2026-10-15", weekNumber: 3, posts: [] },
    ]);
    expect(semanaInicial(g, "2026-10-08")).toBe(2);
    expect(semanaInicial(g, "2026-10-10")).toBe(3); // entre semanas: la siguiente
    expect(semanaInicial(g, "2026-09-20")).toBe(1);
    expect(semanaInicial(g, "2026-11-20")).toBe(3);
  });

  it("el rango se lee corto", () => {
    expect(rangoSemana("2026-10-05", "2026-10-11")).toMatch(/^5 – 11 oct/);
    expect(rangoSemana("2026-09-28", "2026-10-04")).toMatch(/^28 sept?\.? – 4 oct/);
  });
});
