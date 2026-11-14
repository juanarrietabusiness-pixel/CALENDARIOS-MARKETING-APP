import { describe, it, expect } from "vitest";
import { tasaDeCierreMedida, resumenVentas, roasFrenteAlEquilibrio } from "./ventasSemana.js";

const meta = {
  "2026-10-19": { gasto: 30, conversaciones: 60 },
  "2026-10-26": { gasto: 30, conversaciones: 60 },
  "2026-11-02": { gasto: 30, conversaciones: 60 },
};
const semanas = [
  { semana: "2026-10-26", ventas: 3, monto: 300 },
  { semana: "2026-11-02", ventas: 3, monto: 300 },
  // La semana en curso (hoy es miércoles 11): van 1 venta de momento.
  { semana: "2026-11-09", ventas: 1, monto: 100 },
];

describe("la tasa de cierre medida, sólo con semanas CERRADAS", () => {
  it("la semana en curso no cuenta: va a medias y bajaría la tasa", () => {
    const sinHoy = tasaDeCierreMedida(semanas, meta);
    expect(sinHoy.semanas).toContain("2026-11-09");
    const t = tasaDeCierreMedida(semanas, meta, { hoy: "2026-11-11" });
    expect(t.semanas).toEqual(["2026-11-02", "2026-10-26"]);
    expect(t.tasa).toBeCloseTo(6 / 120);
  });

  it("mientras no se mide, la del cliente (no el 5 % fijo)", () => {
    const r = resumenVentas([], meta, { hoy: "2026-11-11", porDefecto: 0.08 });
    expect(r.tasaUsada).toBe(0.08);
    const poco = tasaDeCierreMedida([{ semana: "2026-11-02", ventas: 1 }], meta, { hoy: "2026-11-11", porDefecto: 0.08 });
    expect(poco.motivo).toMatch(/8 %/);
  });
});

describe("el ROAS real frente al de equilibrio (decisión 13)", () => {
  it("dice si la pauta deja o pierde dinero", () => {
    expect(roasFrenteAlEquilibrio(4, 2.5)).toMatchObject({ gana: true });
    expect(roasFrenteAlEquilibrio(2, 2.5)).toMatchObject({ gana: false });
    expect(roasFrenteAlEquilibrio(2, 2.5).texto).toMatch(/pierde dinero/);
    expect(roasFrenteAlEquilibrio(null, 2.5)).toBeNull();
    const r = resumenVentas(semanas, meta, { hoy: "2026-11-11", roasEquilibrio: 15 });
    // 600 vendidos con 60 de pauta: 10× frente a 15×.
    expect(r.roas).toBeCloseTo(10);
    expect(r.frenteAlEquilibrio.gana).toBe(false);
  });
});
