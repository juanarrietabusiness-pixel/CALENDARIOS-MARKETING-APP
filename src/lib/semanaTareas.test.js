import { describe, it, expect } from "vitest";
import { limpiarDias, lunesDe, numeroDeDia, textoSemana, semanaDeTareas, cambioAlSoltar } from "./semanaTareas.js";

// El martes 3 de noviembre de 2026; la semana va del lunes 2 al sábado 7.
const HOY = "2026-11-03";
const LUNES = "2026-11-02";
const clientes = [
  { id: "dcasa", name: "D'CASA", diasTrabajo: [1, 4] },
  { id: "rofer", name: "ROFER", diasTrabajo: [2] },
  { id: "baby", name: "Baby Caleb", diasTrabajo: null },
];
const tarea = (id, campos = {}) => ({ id, title: id, status: "pending", client_id: "dcasa", _rapida: false, ...campos });
const dia = (s, n) => s.dias[n - 1];
const titulos = (lista) => lista.map((x) => x.tarea.title);

describe("los días fijos", () => {
  it("limpia: del 1 al 6, sin repetir, en orden; acepta el JSON de la fila", () => {
    expect(limpiarDias([4, 1, 1, 7, 0, "2", "x"])).toEqual([1, 2, 4]);
    expect(limpiarDias("[6,3]")).toEqual([3, 6]);
    expect(limpiarDias("no")).toEqual([]);
    expect(limpiarDias(null)).toEqual([]);
  });

  it("el lunes de la semana y el número del día (el domingo es de la semana que acaba)", () => {
    expect(lunesDe("2026-11-03")).toBe(LUNES);
    expect(lunesDe("2026-11-02")).toBe(LUNES);
    expect(lunesDe("2026-11-08")).toBe(LUNES);
    expect(numeroDeDia("2026-11-02")).toBe(1);
    expect(numeroDeDia("2026-11-07")).toBe(6);
    expect(numeroDeDia("2026-11-08")).toBe(6);
  });

  it("el rótulo de la semana", () => {
    expect(textoSemana(LUNES)).toBe("2 – 7 nov");
    expect(textoSemana("2026-10-26")).toBe("26 – 31 oct");
    expect(textoSemana("2026-11-30")).toBe("30 nov – 5 dic");
  });
});

describe("la semana", () => {
  it("cada empresa sale en sus días fijos aunque no tenga tareas, y hoy va marcado", () => {
    const s = semanaDeTareas([], clientes, LUNES, HOY);
    expect(dia(s, 1).empresas.map((e) => e.nombre)).toEqual(["D'CASA"]);
    expect(dia(s, 2).empresas.map((e) => e.nombre)).toEqual(["ROFER"]);
    expect(dia(s, 4).empresas.map((e) => e.nombre)).toEqual(["D'CASA"]);
    expect(dia(s, 3).empresas).toEqual([]);
    expect(s.dias.filter((d) => d.esHoy).map((d) => d.n)).toEqual([2]);
    expect(dia(s, 1).pasado).toBe(true);
    expect(dia(s, 2).pasado).toBe(false);
  });

  it("una tarea va en el día que se planeó, y si pasó sin hacerse SE QUEDA ahí, atrasada", () => {
    const s = semanaDeTareas([
      tarea("del lunes", { today_date: "2026-11-02" }),
      tarea("del jueves", { today_date: "2026-11-05" }),
    ], clientes, LUNES, HOY);
    const lunes = dia(s, 1).empresas[0];
    expect(titulos(lunes.items)).toEqual(["del lunes"]);
    expect(lunes.items[0].atrasada).toBe(true);
    expect(titulos(dia(s, 4).empresas[0].items)).toEqual(["del jueves"]);
    expect(dia(s, 4).empresas[0].items[0].atrasada).toBe(false);
    expect(titulos(dia(s, 2).empresas.flatMap((e) => e.items))).toEqual([]);
  });

  it("sin día no está atrasada: va a «Sin día» de su empresa (en cada día fijo) y a «Por agendar»", () => {
    const s = semanaDeTareas([tarea("cuando se pueda"), tarea("rápida", { client_id: "", _rapida: true })], clientes, LUNES, HOY);
    expect(titulos(dia(s, 1).empresas[0].sinDia)).toEqual(["cuando se pueda"]);
    expect(titulos(dia(s, 4).empresas[0].sinDia)).toEqual(["cuando se pueda"]);
    expect(titulos(s.porAgendar)).toEqual(["cuando se pueda", "rápida"]);
    expect(s.porAgendar.every((x) => !x.atrasada)).toBe(true);
    expect(s.deAntes).toEqual([]);
  });

  it("una empresa con tareas un día que no es suyo sale ese día, detrás de las fijas", () => {
    const s = semanaDeTareas([tarea("de baby", { client_id: "baby", today_date: "2026-11-02" })], clientes, LUNES, HOY);
    expect(dia(s, 1).empresas.map((e) => [e.nombre, e.fija])).toEqual([["D'CASA", true], ["Baby Caleb", false]]);
  });

  it("lo sin empresa va a las sueltas de su día; lo del domingo, al sábado", () => {
    const s = semanaDeTareas([
      tarea("rápida", { client_id: "", _rapida: true, today_date: "2026-11-03" }),
      tarea("domingo", { today_date: "2026-11-08" }),
    ], clientes, LUNES, HOY);
    expect(titulos(dia(s, 2).sueltas)).toEqual(["rápida"]);
    expect(titulos(dia(s, 6).empresas.flatMap((e) => e.items))).toEqual(["domingo"]);
  });

  it("lo atrasado de semanas anteriores se ve aparte en la semana de hoy, no en las otras", () => {
    const vieja = tarea("de la semana pasada", { today_date: "2026-10-28" });
    expect(titulos(semanaDeTareas([vieja], clientes, LUNES, HOY).deAntes)).toEqual(["de la semana pasada"]);
    expect(semanaDeTareas([vieja], clientes, "2026-11-09", HOY).deAntes).toEqual([]);
    // Mirando su semana, se queda en su día (miércoles 28).
    const pasada = semanaDeTareas([vieja], clientes, "2026-10-26", HOY);
    expect(titulos(dia(pasada, 3).empresas[0].items)).toEqual(["de la semana pasada"]);
  });

  it("lo hecho se ve tachado en su día si se planeó esta semana; lo hecho sin plan, no", () => {
    const s = semanaDeTareas([
      tarea("hecha", { status: "completed", today_date: "2026-11-02", completed_at: "2026-11-02T15:00:00Z" }),
      tarea("pendiente", { today_date: "2026-11-02" }),
      tarea("hecha sin día", { status: "completed" }),
    ], clientes, LUNES, HOY);
    expect(titulos(dia(s, 1).empresas[0].items)).toEqual(["pendiente", "hecha"]);
    expect(s.porAgendar).toEqual([]);
  });

  it("una recurrente diaria está hoy", () => {
    const s = semanaDeTareas([tarea("historias", { recurrence: "daily" })], clientes, LUNES, HOY);
    expect(titulos(dia(s, 2).empresas.flatMap((e) => e.items))).toEqual(["historias"]);
  });
});

describe("al soltar una tarea", () => {
  it("una de empresa cambia de día y, si se suelta en otra, de empresa", () => {
    const t = tarea("x", { today_date: "2026-11-02" });
    expect(cambioAlSoltar(t, { empresa: "dcasa", dia: "2026-11-05" })).toEqual({ datos: { today_date: "2026-11-05" } });
    expect(cambioAlSoltar(t, { empresa: "rofer", dia: "2026-11-03" })).toEqual({ datos: { client_id: "rofer", today_date: "2026-11-03" } });
    expect(cambioAlSoltar(t, { empresa: "dcasa", dia: "2026-11-02" })).toBeNull();
  });

  it("una rápida soltada en una empresa se convierte; en las sueltas sólo cambia de día", () => {
    const r = tarea("r", { client_id: "", _rapida: true });
    expect(cambioAlSoltar(r, { empresa: "rofer", dia: "2026-11-03" })).toEqual({ convertir: { empresa: "rofer", today_date: "2026-11-03" } });
    expect(cambioAlSoltar(r, { empresa: "", dia: "2026-11-03" })).toEqual({ datos: { today_date: "2026-11-03" } });
  });

  it("una de empresa no se queda sin empresa", () => {
    expect(cambioAlSoltar(tarea("x"), { empresa: "", dia: "2026-11-03" }).error).toMatch(/empresa/);
  });
});
