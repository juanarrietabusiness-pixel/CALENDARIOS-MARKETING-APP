import { describe, it, expect } from "vitest";
import { tareasParaPurgar, terminadasBorrables } from "../../worker/lib/tareas.js";

const AHORA = Date.parse("2026-09-24T12:00:00Z");
const hace = (dias) => new Date(AHORA - dias * 86_400_000).toISOString();
const t = (id, extra) => ({ id, status: "completed", recurrence: "none", completed_at: hace(10), ...extra });

describe("tareasParaPurgar", () => {
  it("con «nunca» no borra nada", () => {
    expect(tareasParaPurgar([t("a")], "nunca", AHORA)).toEqual([]);
  });

  it("semanal: las terminadas hace más de 7 días, y no las de ayer", () => {
    const r = tareasParaPurgar([t("vieja"), t("ayer", { completed_at: hace(1) })], "semanal", AHORA);
    expect(r.map((x) => x.id)).toEqual(["vieja"]);
  });

  it("mensual: 10 días no es bastante, 31 sí", () => {
    const r = tareasParaPurgar([t("diez"), t("treinta-y-uno", { completed_at: hace(31) })], "mensual", AHORA);
    expect(r.map((x) => x.id)).toEqual(["treinta-y-uno"]);
  });

  it("cuenta desde que se terminó, no desde que se creó", () => {
    const r = tareasParaPurgar([t("vieja-cerrada-ayer", { created_at: hace(90), completed_at: hace(1) })], "semanal", AHORA);
    expect(r).toEqual([]);
  });

  it("una recurrente no se borra nunca: es la definición de algo que vuelve", () => {
    expect(tareasParaPurgar([t("r", { recurrence: "weekly", completed_at: hace(60) })], "semanal", AHORA)).toEqual([]);
  });

  it("las pendientes y las que no tienen fecha de cierre se quedan", () => {
    const r = tareasParaPurgar([t("p", { status: "pending" }), t("sin", { completed_at: null })], "semanal", AHORA);
    expect(r).toEqual([]);
  });

  it("las tareas rápidas, que no tienen recurrencia, sí entran", () => {
    expect(tareasParaPurgar([{ id: "q", status: "completed", completed_at: hace(8) }], "semanal", AHORA)).toHaveLength(1);
  });
});

describe("terminadasBorrables", () => {
  it("todas las terminadas menos las recurrentes", () => {
    const r = terminadasBorrables([t("a"), t("r", { recurrence: "monthly" }), t("p", { status: "pending" })]);
    expect(r.map((x) => x.id)).toEqual(["a"]);
  });
});
