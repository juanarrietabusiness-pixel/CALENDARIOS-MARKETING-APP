import { describe, it, expect } from "vitest";
import {
  limpiarPlanSemanal, planSemanalParaGuardar, semanaDelCliente, semanaEstandar, semanaPropia, notasDelCliente, ritmoDelCliente,
  plantillaDeLaSemana, lineasDeLaSemana, horaDelPlan, horaCorta, planSemanalDeFila,
} from "./planSemanal.js";
import { plantillasDisponibles, configDeFormatos } from "./plantillasPlan.js";
import { casillasConPlantilla } from "./loteMes.js";
import { conNotasDelDia } from "./notasSemana.js";

// ============================================================
// El plan semanal ÚNICO (fase 6): formato, tipo, HORA y nota de cada día en
// un solo sitio (`clients.plan_semanal`), lo de antes se sigue leyendo y lo
// que lo leía (lote, «Planificar mes», notas) lee éste.
// ============================================================

const lista = plantillasDisponibles([]);
const semanaEditada = () => {
  const dias = semanaDelCliente({ name: "Dcasa" }, lista).dias;
  dias[1] = [{ format: "post", pilar: "anuncio", hora: "09:00" }, { format: "reel", pilar: "humano", rostro: true, hora: "18:30" }];
  dias[3] = [{ format: "carrusel", pilar: "educativo", hora: "12:00" }];
  dias[5] = [];
  return dias;
};

describe("el plan semanal único", () => {
  it("guardar da el formato nuevo con la hora y la nota, y las columnas de antes derivadas", () => {
    const g = planSemanalParaGuardar({ name: "Dcasa" }, lista, { dias: semanaEditada(), notas: { 1: "Muebles y camas" }, base: "ventas-productos" });
    expect(g.planSemanal).toMatchObject({ v: 1, base: "ventas-productos", objetivo: "ventas", negocio: "productos", notas: { 1: "Muebles y camas" } });
    expect(g.planSemanal.dias[1]).toEqual([{ format: "post", pilar: "anuncio", hora: "09:00" }, { format: "reel", pilar: "humano", rostro: true, hora: "18:30" }]);
    expect(g.planSemanal.dias[5]).toEqual([]);
    expect(g.planSemanal.linea).toMatch(/PLAN DE CONTENIDO/);
    // Lo de antes, derivado: la copia con la primera «del ritmo», el ritmo y las notas.
    expect(g.ritmoContenido).toMatchObject({ 1: "anuncio", 3: "educativo", 5: "" });
    expect(g.planContenido.plantilla).toBe("ventas-productos");
    expect(g.planContenido.personalizada.dias[1][0]).toEqual({ format: "post", pilar: "", hora: "09:00" });
    expect(g.notasSemana).toEqual({ 1: "Muebles y camas" });
  });

  it("se lee igual por cualquier camino: semana, ritmo, notas, plantilla, la barra y la fila del Worker", () => {
    const g = planSemanalParaGuardar({ name: "Dcasa" }, lista, { dias: semanaEditada(), notas: { 3: "Promo sofá" } });
    // Las columnas de antes dicen OTRA cosa: manda el plan único.
    const cliente = { name: "Dcasa", planSemanal: g.planSemanal, ritmoContenido: { 1: "beneficios" }, notasSemana: { 1: "vieja" } };
    expect(semanaDelCliente(cliente, lista).dias[1][1]).toEqual({ format: "reel", pilar: "humano", rostro: true, hora: "18:30" });
    expect(ritmoDelCliente(cliente)[1]).toBe("anuncio");
    expect(notasDelCliente(cliente)).toEqual({ 3: "Promo sofá" });
    expect(semanaPropia(cliente)).toBe(true);
    expect(lineasDeLaSemana(cliente, lista)[1]).toEqual(["Anuncio · Post · 9:00 a. m.", "Humano · UGC · 6:30 p. m."]);
    const t = plantillaDeLaSemana(cliente, lista);
    expect(t.dias[1][0].pilar).toBe("");
    // El lote del mes: la hora viaja en cada casilla.
    const casillas = casillasConPlantilla({ year: 2026, month: 10, ritmo: ritmoDelCliente(cliente), formatos: configDeFormatos(t), dias: [1] });
    expect(casillas.find((c) => c.fecha === "2026-11-02")).toMatchObject({ formato: "post", pilar: "anuncio", hora: "09:00" });
    // Las notas del motor de ideas.
    expect(conNotasDelDia([{ fecha: "2026-11-04" }], notasDelCliente(cliente))[0].notaDia).toBe("Promo sofá");
    // El Worker lee la fila en texto.
    const fila = { plan_semanal: JSON.stringify(g.planSemanal), ritmo_contenido: JSON.stringify({ 1: "beneficios" }), notas_semana: null };
    expect(planSemanalDeFila(fila)).toEqual({ ritmo: ritmoDelCliente(cliente), notas: { 3: "Promo sofá" } });
  });

  it("lo guardado de antes se sigue leyendo sin migrar (plantilla, ritmo y notas en sus columnas)", () => {
    const viejo = { name: "Rofer", planContenido: { plantilla: "seguidores-productos" }, ritmoContenido: { 2: "servicios" }, notasSemana: { 2: "Camas" } };
    expect(semanaDelCliente(viejo, lista).dias[2][0]).toEqual({ format: "carrusel", pilar: "servicios" });
    expect(notasDelCliente(viejo)).toEqual({ 2: "Camas" });
    expect(ritmoDelCliente(viejo)[2]).toBe("servicios");
    expect(planSemanalDeFila({ ritmo_contenido: '{"2":"servicios"}', notas_semana: '{"2":"Camas"}' }).notas).toEqual({ 2: "Camas" });
  });

  it("volver al estándar quita la semana propia y conserva las notas y la plantilla base", () => {
    const g = planSemanalParaGuardar({ name: "Dcasa" }, lista, { dias: semanaEditada(), notas: { 1: "Camas" }, base: "seguidores-productos" });
    const cliente = { name: "Dcasa", ...g };
    const e = semanaEstandar(cliente, lista);
    expect(e.planSemanal).toMatchObject({ v: 1, base: "seguidores-productos", dias: null, notas: { 1: "Camas" } });
    expect(e.ritmoContenido).toBeNull();
    expect(e.planContenido).toMatchObject({ plantilla: "seguidores-productos", personalizada: null });
    const despues = { name: "Dcasa", ...e };
    expect(semanaPropia(despues)).toBe(false);
    // El estándar: la plantilla base con el ritmo de la agencia (no la copia de antes).
    expect(semanaDelCliente(despues, lista).dias[2]).toEqual([{ format: "carrusel", pilar: "beneficios" }, { format: "reel", pilar: "humano" }]);
    expect(notasDelCliente(despues)).toEqual({ 1: "Camas" });
  });

  it("limpia lo que no vale: horas, tipos y formatos inventados; otra versión no se lee", () => {
    const l = limpiarPlanSemanal({ v: 1, dias: { 1: [{ format: "post", pilar: "anuncio", hora: "9am" }, { format: "tiktok", pilar: "anuncio" }, { format: "reel", pilar: "x" }] } });
    expect(l.dias[1]).toEqual([{ format: "post", pilar: "anuncio" }]);
    expect(limpiarPlanSemanal({ v: 2, dias: {} })).toBeNull();
    expect(limpiarPlanSemanal(null)).toBeNull();
  });

  it("la hora del plan de una publicación: la de su formato ese día, o la primera del día", () => {
    const semana = { dias: { 1: [{ format: "post", pilar: "anuncio", hora: "09:00" }, { format: "reel", pilar: "humano", hora: "18:30" }], 2: [{ format: "post", pilar: "anuncio" }] } };
    expect(horaDelPlan(semana, "2026-11-02", "reel")).toBe("18:30");
    expect(horaDelPlan(semana, "2026-11-02", "carrusel")).toBe("09:00");
    expect(horaDelPlan(semana, "2026-11-03", "post")).toBe("");
    expect(horaCorta("00:15")).toBe("12:15 a. m.");
  });
});
