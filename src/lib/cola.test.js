import { describe, it, expect } from "vitest";
import { colaDe, resumenCola } from "./cola.js";

const fila = (red, estado, extra = {}) => ({ id: `${red}-${estado}`, postId: "p1", red, estado, programadaPara: "2026-10-05T15:00:00.000Z", ...extra });

describe("la cola en el navegador", () => {
  it("una fila por red, la última, y sin las canceladas", () => {
    const c = colaDe([fila("instagram", "error"), fila("instagram", "programada"), fila("facebook", "cancelada")], "p1");
    expect(Object.keys(c)).toEqual(["instagram"]);
    expect(c.instagram.estado).toBe("programada");
  });
  it("el resumen: lo que falló manda; publicada sólo si salió en todas", () => {
    expect(resumenCola([], "p1")).toBeNull();
    expect(resumenCola([fila("instagram", "publicada"), fila("facebook", "error")], "p1").estado).toBe("error");
    expect(resumenCola([fila("instagram", "publicada"), fila("facebook", "programada")], "p1").estado).toBe("programada");
    expect(resumenCola([fila("instagram", "publicada"), fila("facebook", "publicada")], "p1").texto).toBe("Publicada");
  });
  it("programada dice cuándo, en la hora de Panamá", () => {
    expect(resumenCola([fila("instagram", "programada")], "p1").texto).toMatch(/10:00/);
  });
});
