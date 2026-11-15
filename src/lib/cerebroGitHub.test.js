import { describe, it, expect } from "vitest";
import { sumarImportaciones, describirSincronia, loQueNoEntro, diferenciaPorLineas } from "./cerebroGitHub";

describe("varias vueltas", () => {
  it("varias vueltas se suman; lo que queda es lo de la última", () => {
    const s = sumarImportaciones(
      { archivos: { nuevos: 40, omitidos: 15, iguales: 0 }, notas: { creadas: 80 }, internas: ["A"], trajo: true },
      { archivos: { nuevos: 15, omitidos: 0, iguales: 40 }, notas: { creadas: 30 }, internas: [], trajo: false },
    );
    expect(s.archivos).toMatchObject({ nuevos: 55, omitidos: 0, iguales: 40 });
    expect(s.notas.creadas).toBe(110);
    expect(s.trajo).toBe(true);
  });
});

describe("cómo va con GitHub", () => {
  const ahora = Date.parse("2026-11-15T18:00:00Z");
  it("cuándo se miró y cuándo se trajo algo, en hora de Panamá", () => {
    expect(describirSincronia({ revisadoAt: "2026-11-15T14:12:00Z", sincronizadoAt: "2026-11-13T15:00:00Z", pendientes: 0 }, ahora))
      .toMatch(/^Revisado en GitHub hoy a las 9:12 .*· último cambio traído el 13 nov/);
    expect(describirSincronia(null)).toBe("");
  });

  it("lo que no entra se cuenta por clase y se nombra", () => {
    const l = loQueNoEntro({ truncado: true, noTexto: { pdf: 2, word: 1, imagen: 0 }, grandes: ["X/volcado.md"], profundos: ["X/a/b/c/d.md"] });
    expect(l.map((x) => x.texto).join(" ")).toMatch(/cortó la lista/);
    expect(l[1].texto).toMatch(/^No se leen 2 PDF, 1 Word:/);
    expect(l[2].lista).toEqual(["volcado"]);
    expect(loQueNoEntro({})).toEqual([]);
  });

  it("la diferencia entre la mía y la de GitHub, línea a línea, con lo igual plegado", () => {
    const mia = ["## Tono", "", "Cercano.", "a", "b", "c", "d", "e", "Fin."].join("\n");
    const gh = ["## Tono", "", "Formal.", "a", "b", "c", "d", "e", "Fin."].join("\n");
    const d = diferenciaPorLineas(mia, gh);
    expect(d.filter((x) => x.tipo === "mia").map((x) => x.texto)).toEqual(["Cercano."]);
    expect(d.filter((x) => x.tipo === "github").map((x) => x.texto)).toEqual(["Formal."]);
    expect(d.some((x) => x.tipo === "plegado" && x.n >= 1)).toBe(true);
    expect(diferenciaPorLineas("x\n".repeat(500), "y")).toBeNull();
  });
});
