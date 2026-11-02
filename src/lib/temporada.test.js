import { describe, it, expect } from "vitest";
import { fechasQueVienen, fechaParaAvisar, fraseDeFalta } from "./temporada";
import { MODOS_FOTO, instruccionDeTemporada } from "./modosFoto";
import { CATALOGO } from "./fechasEspeciales";

// ============================================================
// «De temporada» y los modos de foto: rellenan «¿Qué quieres?» (300 caracteres), con las fechas del CLIENTE y nunca
// una delicada (ahí no se hace promoción).
// ============================================================

describe("las fechas que vienen", () => {
  it("las del cliente en los próximos días, en orden y con cuánto falta, cruzando de mes", () => {
    const l = fechasQueVienen(null, "2026-10-30", { dias: 30 });
    expect(l.map((f) => f.id)).toEqual(expect.arrayContaining(["halloween", "black-friday"]));
    const halloween = l.find((f) => f.id === "halloween");
    expect(halloween).toMatchObject({ fecha: "2026-10-31", faltan: 1 });
    expect(l.find((f) => f.id === "black-friday")).toMatchObject({ fecha: "2026-11-27", faltan: 28 });
    expect(l.map((f) => f.fecha)).toEqual([...l.map((f) => f.fecha)].sort());
  });

  it("nunca una delicada ni una que el cliente ocultó; las internacionales sólo si las escogió", () => {
    const todas = fechasQueVienen(null, "2026-12-01", { dias: 31, max: 50 }).map((f) => f.id);
    expect(todas).not.toContain("duelo"); // 20 de diciembre: delicada
    expect(todas).not.toContain("discapacidad"); // internacional sin escoger
    expect(todas).toContain("navidad");
    const sinNavidad = fechasQueVienen({ ocultas: ["navidad"] }, "2026-12-01", { dias: 31, max: 50 }).map((f) => f.id);
    expect(sinNavidad).not.toContain("navidad");
    expect(fechasQueVienen({ elegidas: ["discapacidad"] }, "2026-12-01", { dias: 31, max: 50 }).map((f) => f.id)).toContain("discapacidad");
  });

  it("una fecha propia del cliente también sale", () => {
    const propias = { propias: [{ id: "aniversario", dia: "11-10", nombre: "Aniversario de la tienda" }] };
    expect(fechasQueVienen(propias, "2026-11-01", { dias: 20, max: 50 }).some((f) => f.nombre === "Aniversario de la tienda")).toBe(true);
  });

  it("el aviso es por una comercial, propia o escogida en tres semanas, no por un feriado cualquiera", () => {
    expect(fechaParaAvisar(null, "2026-11-10")?.id).toBe("black-friday");
    // Del 1 al 21 de agosto sólo hay un feriado (15): no avisa.
    expect(fechaParaAvisar(null, "2026-08-01")).toBeNull();
    expect(fechaParaAvisar(null, "no es fecha")).toBeNull();
  });

  it("cómo se dice lo que falta", () => {
    expect(fraseDeFalta(0)).toBe("es hoy");
    expect(fraseDeFalta(1)).toBe("es mañana");
    expect(fraseDeFalta(9)).toBe("faltan 9 días");
  });
});

describe("los atajos de «¿Qué quieres?»", () => {
  it("todo atajo cabe en el campo (300 caracteres), también la temporada de cada fecha del catálogo", () => {
    for (const m of MODOS_FOTO) expect(m.instruccion.length, m.id).toBeLessThanOrEqual(300);
    for (const f of CATALOGO) expect(instruccionDeTemporada(f).length, f.id).toBeLessThanOrEqual(300);
  });

  it("la temporada es la MISMA pieza ambientada, sin inventar ofertas", () => {
    const t = instruccionDeTemporada({ id: "black-friday", nombre: "Black Friday" });
    expect(t).toMatch(/MISMA pieza/);
    expect(t).toMatch(/Black Friday/);
    expect(t).toMatch(/Sin precios ni ofertas/);
    expect(instruccionDeTemporada({ id: "algo-raro", nombre: "Aniversario" })).toMatch(/propios de la fecha/);
  });

  it("los modos son los que faltaban como composición, con nombres distintos", () => {
    expect(MODOS_FOTO.map((m) => m.id)).toEqual(["manos", "persona", "flotando", "salpicadura", "pinterest"]);
    expect(new Set(MODOS_FOTO.map((m) => m.etiqueta)).size).toBe(MODOS_FOTO.length);
  });
});
