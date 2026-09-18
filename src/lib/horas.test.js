import { describe, it, expect } from "vitest";
import { normalizarHora, hora12 } from "./horas.js";

describe("lo que escribe el modelo se guarda como lo espera el campo", () => {
  it("acepta lo que ya está bien", () => {
    expect(normalizarHora("09:30")).toBe("09:30");
    expect(normalizarHora("21:00")).toBe("21:00");
    expect(normalizarHora("00:00")).toBe("00:00");
  });

  it("rellena el cero de delante, que el campo sí exige", () => {
    // «9:30» se ve bien y `<input type="time">` lo descarta en silencio.
    expect(normalizarHora("9:30")).toBe("09:30");
    expect(normalizarHora("9")).toBe("09:00");
  });

  it("entiende am y pm, escritos de las formas en que se escriben", () => {
    expect(normalizarHora("9am")).toBe("09:00");
    expect(normalizarHora("9 AM")).toBe("09:00");
    expect(normalizarHora("6pm")).toBe("18:00");
    expect(normalizarHora("6:45 p.m.")).toBe("18:45");
    expect(normalizarHora("  7:05 Pm  ")).toBe("19:05");
  });

  it("las 12 no se calculan sumando ni restando doce", () => {
    // El caso que se equivoca solo en cuanto se escribe con aritmética.
    expect(normalizarHora("12am")).toBe("00:00");
    expect(normalizarHora("12:30 am")).toBe("00:30");
    expect(normalizarHora("12pm")).toBe("12:00");
    expect(normalizarHora("12:15 pm")).toBe("12:15");
  });

  it("rechaza lo que no entiende en vez de guardar algo raro", () => {
    for (const malo of ["", "   ", "por la mañana", "25:00", "12:61", "9:5pm x", "abc", "-3:00"]) {
      expect(normalizarHora(malo)).toBeNull();
    }
  });

  it("con am/pm el reloj es de 12: «13pm» no significa nada", () => {
    expect(normalizarHora("13pm")).toBeNull();
    expect(normalizarHora("0am")).toBeNull();
  });

  it("no revienta con lo que no es texto", () => {
    for (const malo of [null, undefined, 9, {}, []]) {
      expect(normalizarHora(malo)).toBeNull();
    }
  });
});

describe("y se le cuenta a la IA en el formato en que se lee", () => {
  it("traduce a 12 horas", () => {
    expect(hora12("09:00")).toBe("9:00 AM");
    expect(hora12("18:45")).toBe("6:45 PM");
    expect(hora12("00:30")).toBe("12:30 AM");
    expect(hora12("12:00")).toBe("12:00 PM");
  });

  it("y devuelve vacío si no hay hora, en vez de «--:--» o «NaN»", () => {
    expect(hora12("")).toBe("");
    expect(hora12(null)).toBe("");
    expect(hora12("no es una hora")).toBe("");
  });
});
