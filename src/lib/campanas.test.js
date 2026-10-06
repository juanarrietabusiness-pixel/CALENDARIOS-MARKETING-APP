import { describe, it, expect } from "vitest";
import { semanasDelMes, conceptoDeSemana, conceptosDelMes, pedidoDeNombres, leerNombres } from "./campanas";
import { fechasDelMes } from "./fechasEspeciales";
import { semanaDelMes } from "./semanas";

describe("semanasDelMes", () => {
  it("octubre de 2026 empieza en jueves: cinco semanas, la primera de cuatro días", () => {
    const s = semanasDelMes(2026, 9);
    expect(s).toHaveLength(5);
    expect(s[0]).toEqual({ numero: 1, desde: "2026-10-01", hasta: "2026-10-04" });
    expect(s[4]).toEqual({ numero: 5, desde: "2026-10-26", hasta: "2026-10-31" });
  });

  it("un mes que empieza en lunes", () => {
    expect(semanasDelMes(2026, 5)[0]).toEqual({ numero: 1, desde: "2026-06-01", hasta: "2026-06-07" });
  });

  it("cuenta igual que la lista por semanas", () => {
    for (const s of semanasDelMes(2026, 1)) {
      expect(semanaDelMes(s.desde)).toBe(s.numero);
      expect(semanaDelMes(s.hasta)).toBe(s.numero);
    }
  });
});

describe("el nombre de cada semana", () => {
  const cal = { year: 2026, month: 9, weekConcepts: ["Café de otoño", ""], days: [{ date: "2026-10-06", weekNumber: 2, concept: "Lattes" }] };
  it("el del mes manda; si no, el de sus días", () => {
    expect(conceptoDeSemana(cal, 1)).toBe("Café de otoño");
    expect(conceptoDeSemana(cal, 2)).toBe("Lattes");
    expect(conceptoDeSemana(cal, 3)).toBe("");
    expect(conceptosDelMes(cal)).toEqual(["Café de otoño", "Lattes", "", "", ""]);
  });
});

describe("la IA nombra", () => {
  it("el pedido lleva las semanas, las fechas y lo que ya tiene nombre", () => {
    const p = pedidoDeNombres({ contexto: "CLIENTE: Café Luna", year: 2026, month: 9, fechas: fechasDelMes(2026, 9, { elegidas: ["cafe"] }), ofertas: "2x1 los martes", semanas: ["Café de otoño"] });
    expect(p).toContain("CLIENTE: Café Luna");
    expect(p).toContain("S1: del 1 al 4");
    expect(p).toContain("2026-10-01: Día Internacional del Café (importante para este cliente)");
    expect(p).toContain("Ofertas del mes: 2x1 los martes");
    expect(p).toContain("S1: Café de otoño");
  });

  it("lee el JSON y no pisa lo que ya tenía nombre", () => {
    const r = leerNombres('Aquí va: {"campana":"«Otoño en taza»","semanas":["A","B","C"]}', 4, { semanas: ["", "Mía"] });
    expect(r).toEqual({ campana: "Otoño en taza", semanas: ["A", "Mía", "C", ""] });
    expect(leerNombres("nada", 4)).toBeNull();
  });
});
