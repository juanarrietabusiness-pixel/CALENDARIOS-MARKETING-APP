import { describe, it, expect } from "vitest";
import { resumenCalendario, calendarioPorDefecto } from "./resumenCliente.js";

describe("resumenCalendario", () => {
  it("cuenta por estado, y lo que no está aprobado ni con cambios está por aprobar", () => {
    const cal = {
      days: [
        { date: "2026-09-01", posts: [{ status: "approved" }, { status: "pending" }] },
        { date: "2026-09-02", posts: [{ status: "rejected" }, {}] },
      ],
    };
    const r = resumenCalendario(cal);
    expect(r).toMatchObject({ publicaciones: 4, aprobadas: 1, conCambios: 1, porAprobar: 2 });
    expect(r.incompletas).toBe(4);
  });

  it("sin calendario, todo a cero", () => {
    expect(resumenCalendario(null).publicaciones).toBe(0);
  });
});

describe("calendarioPorDefecto", () => {
  const cals = [
    { id: "jul", month: 6, year: 2026 },
    { id: "sep", month: 8, year: 2026 },
    { id: "ago", month: 7, year: 2026 },
  ];

  it("abre el del mes en curso", () => {
    expect(calendarioPorDefecto(cals, "2026-09-25").id).toBe("sep");
  });

  it("si no hay del mes, el más reciente", () => {
    expect(calendarioPorDefecto(cals, "2026-12-01").id).toBe("sep");
    expect(calendarioPorDefecto([], "2026-12-01")).toBeNull();
  });
});
