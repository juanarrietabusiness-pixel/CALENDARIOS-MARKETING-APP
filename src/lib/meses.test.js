import { describe, it, expect } from "vitest";
import { calendarioVirtual, esVirtual, mesMas, mesDeFecha, fusionarEnMes, diasVecinos, diasPorSemanaDelMes, nombreDelDia } from "./meses.js";
import { slugDeMes, mesDeSlug } from "./rutas.js";

describe("el mes en la dirección", () => {
  it("octubre-2026 ida y vuelta", () => {
    expect(slugDeMes(2026, 9)).toBe("octubre-2026");
    expect(mesDeSlug("octubre-2026")).toEqual({ year: 2026, month: 9 });
    expect(mesDeSlug("enero-2027")).toEqual({ year: 2027, month: 0 });
  });

  it("lo que no es un mes no lo parece", () => {
    expect(mesDeSlug("campana-navidad")).toBeNull();
    expect(mesDeSlug("octubre")).toBeNull();
    expect(mesDeSlug("otoño-2026")).toBeNull();
  });
});

describe("recorrer meses", () => {
  it("pasa de diciembre a enero y de enero a diciembre", () => {
    expect(mesMas({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(mesMas({ year: 2027, month: 0 }, -1)).toEqual({ year: 2026, month: 11 });
    expect(mesDeFecha("2026-10-05")).toEqual({ year: 2026, month: 9 });
  });

  it("un mes sin cajón es un calendario vacío que se reconoce", () => {
    const v = calendarioVirtual(2026, 10);
    expect(esVirtual(v)).toBe(true);
    expect(v).toMatchObject({ name: "Noviembre 2026", days: [], month: 10, year: 2026 });
  });
});

describe("fusionarEnMes: lo escrito en un mes vacío, a su cajón", () => {
  const p = (id) => ({ id, format: "post" });

  it("añade sin quitar lo que ya había (otra persona lo creó a la vez)", () => {
    const real = { id: "nov", days: [{ date: "2026-11-02", posts: [p("a")] }], weekConcepts: [] };
    const cambiado = { days: [{ date: "2026-11-02", posts: [p("b")] }, { date: "2026-11-09", posts: [p("c")] }], weekConcepts: [{ semana: 1 }] };
    const r = fusionarEnMes(real, cambiado);
    expect(r.id).toBe("nov");
    expect(r.days.flatMap((d) => d.posts.map((x) => x.id))).toEqual(["a", "b", "c"]);
    expect(r.weekConcepts).toEqual([{ semana: 1 }]);
  });

  it("no duplica una publicación que ya está", () => {
    const real = { days: [{ date: "2026-11-02", posts: [p("a")] }] };
    expect(fusionarEnMes(real, real).days[0].posts).toHaveLength(1);
  });

  it("no pisa lo del mes que el cajón ya tenía", () => {
    expect(fusionarEnMes({ days: [], campaign: "Navidad" }, { days: [], campaign: "Otra" }).campaign).toBe("Navidad");
  });
});

describe("los días de los meses vecinos", () => {
  it("sólo el anterior y el siguiente, y sólo días con publicaciones", () => {
    const cals = [
      { id: "sep", year: 2026, month: 8, days: [{ date: "2026-09-29", posts: [{ id: "x" }] }, { date: "2026-09-30", posts: [] }] },
      { id: "ago", year: 2026, month: 7, days: [{ date: "2026-08-31", posts: [{ id: "y" }] }] },
    ];
    const v = diasVecinos(cals, { year: 2026, month: 9 });
    expect([...v.keys()]).toEqual(["2026-09-29"]);
    expect(v.get("2026-09-29").cal.id).toBe("sep");
  });
});

describe("los días de la semana del mes, para el asistente", () => {
  it("octubre de 2026: el domingo 4 sí existe (el asistente decía que no)", () => {
    const texto = diasPorSemanaDelMes({ year: 2026, month: 9 });
    expect(texto.split("\n")[0]).toBe("lunes: 5, 12, 19, 26");
    expect(texto).toMatch(/^domingo: 4, 11, 18, 25$/m);
    expect(texto).toMatch(/^jueves: 1, 8, 15, 22, 29$/m);
    expect(nombreDelDia("2026-10-04")).toBe("domingo");
  });

  it("febrero bisiesto tiene 29 días", () => {
    expect(diasPorSemanaDelMes({ year: 2028, month: 1 })).toMatch(/29/);
  });
});
