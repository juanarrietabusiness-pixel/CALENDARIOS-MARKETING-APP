import { describe, it, expect } from "vitest";
import { DIAS_SEMANA, diaDeLaSemana, semanasDe, diasDe, filtrarProduccion, ordenarProduccion } from "./produccion.js";

// Octubre de 2026 empieza en jueves: la semana 1 va del 1 al 4.
const lista = ["2026-10-06", "2026-10-05", "2026-10-12", "2026-10-02", "2026-10-13", "2026-10-04"].map((date) => ({ date }));

describe("producir por semanas y días", () => {
  it("lunes primero, y el día de la semana sin zona horaria", () => {
    expect(DIAS_SEMANA.map((d) => d.corto)).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]);
    expect(diaDeLaSemana("2026-10-05")).toBe(1);
    expect(diaDeLaSemana("2026-10-04")).toBe(0);
  });

  it("las semanas y los días que tienen algo", () => {
    expect(semanasDe(lista)).toEqual([1, 2, 3]);
    expect(diasDe(lista).map((d) => d.nombre)).toEqual(["Lunes", "Martes", "Viernes", "Domingo"]);
  });

  it("filtra por semanas y por días (vacío = todas)", () => {
    expect(filtrarProduccion(lista).length).toBe(6);
    expect(filtrarProduccion(lista, { semanas: new Set([2]) }).map((c) => c.date)).toEqual(["2026-10-06", "2026-10-05"]);
    expect(filtrarProduccion(lista, { dias: new Set([1]) }).map((c) => c.date)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(filtrarProduccion(lista, { semanas: new Set([3]), dias: new Set([2]) }).map((c) => c.date)).toEqual(["2026-10-13"]);
  });

  it("de lunes a domingo (y por fecha dentro), o corrido", () => {
    expect(ordenarProduccion(lista).map((c) => c.date)).toEqual(["2026-10-05", "2026-10-12", "2026-10-06", "2026-10-13", "2026-10-02", "2026-10-04"]);
    expect(ordenarProduccion(lista, "fecha").map((c) => c.date)).toEqual(["2026-10-02", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-12", "2026-10-13"]);
    expect(lista[0].date).toBe("2026-10-06"); // no toca la de entrada
  });
});
