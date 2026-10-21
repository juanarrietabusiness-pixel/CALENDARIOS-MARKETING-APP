import { describe, it, expect } from "vitest";
import {
  opcionesRepetir, fraseRepetir, fechasDeRegla, repeticionesPendientes, copiaRepetida, conRegla, claveRepeticion,
} from "./repetir.js";

// 2026-10-13 es martes, el 2.º del mes. 2026-10-27, el último (4.º).
describe("las reglas, desde la fecha de la publicación", () => {
  it("ofrece semana, el n.º día del mes, el último si lo es y el número del día", () => {
    expect(opcionesRepetir("2026-10-13").map((o) => o.etiqueta)).toEqual([
      "No se repite", "Cada semana, el martes", "Cada mes, el 2.º martes", "Cada mes, el día 13",
    ]);
    expect(opcionesRepetir("2026-10-27").map((o) => o.valor)).toEqual(["", "semana", "mes-n", "mes-ultimo", "mes-dia"]);
    // El 5.º jueves (29) no existe todos los meses: sólo «el último».
    expect(opcionesRepetir("2026-10-29").map((o) => o.valor)).toEqual(["", "semana", "mes-ultimo", "mes-dia"]);
    expect(fraseRepetir("mes-n", "2026-10-13")).toBe("Cada mes, el 2.º martes");
    expect(fraseRepetir("inventada", "2026-10-13")).toBe("");
  });

  it("calcula las fechas de un mes, siempre después del origen", () => {
    expect(fechasDeRegla("semana", "2026-10-13", "2026-10")).toEqual(["2026-10-20", "2026-10-27"]);
    expect(fechasDeRegla("semana", "2026-10-13", "2026-11")).toEqual(["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]);
    expect(fechasDeRegla("mes-n", "2026-10-13", "2026-11")).toEqual(["2026-11-10"]);
    expect(fechasDeRegla("mes-n", "2026-10-13", "2026-10")).toEqual([]);
    expect(fechasDeRegla("mes-ultimo", "2026-10-27", "2026-12")).toEqual(["2026-12-29"]);
    expect(fechasDeRegla("mes-dia", "2026-10-31", "2026-11")).toEqual([]);
    expect(fechasDeRegla("mes-dia", "2026-10-31", "2026-12")).toEqual(["2026-12-31"]);
    // Un mes de antes no tiene nada.
    expect(fechasDeRegla("semana", "2026-10-13", "2026-09")).toEqual([]);
  });
});

describe("lo que le toca a un mes", () => {
  const cal = (id, days) => ({ id, days });
  const promo = { id: "p1", title: "Promo martes", repetir: "mes-n", idea: "Oferta", descripcion: "Texto", medios: [{ src: "/api/media/x.jpg" }] };
  const octubre = cal("oct", [{ date: "2026-10-13", posts: [promo] }]);

  it("ofrece la del mes siguiente, una vez, y no la que ya tiene copia aunque se haya movido de día", () => {
    const l = repeticionesPendientes([octubre], "2026-11", { hoy: "2026-10-21" });
    expect(l.map((x) => [x.origen.id, x.fecha, x.calOrigen.id])).toEqual([["p1", "2026-11-10", "oct"]]);
    const noviembre = cal("nov", [{ date: "2026-11-12", posts: [{ id: "c1", repiteDe: "p1", repeticion: "2026-11-10" }] }]);
    expect(repeticionesPendientes([octubre, noviembre], "2026-11", { hoy: "2026-10-21" })).toEqual([]);
  });

  it("no ofrece lo que ya pasó ni lo que se dejó para después", () => {
    const semanal = cal("oct", [{ date: "2026-10-06", posts: [{ id: "s", repetir: "semana" }] }]);
    expect(repeticionesPendientes([semanal], "2026-10", { hoy: "2026-10-21" }).map((x) => x.fecha)).toEqual(["2026-10-27"]);
    expect(repeticionesPendientes([semanal], "2026-10", { hoy: "2026-10-21", omitidas: [claveRepeticion("s", "2026-10-27")] })).toEqual([]);
  });

  it("una copia no abre otra serie aunque lleve regla", () => {
    const raro = cal("nov", [{ date: "2026-11-10", posts: [{ id: "c1", repiteDe: "p1", repeticion: "2026-11-10", repetir: "mes-n" }] }]);
    expect(repeticionesPendientes([raro], "2026-12", { hoy: "2026-10-21" })).toEqual([]);
  });
});

describe("la copia", () => {
  const origen = {
    id: "p1", status: "approved", title: "Promo", idea: "Oferta del martes", pilar: "promociones", productoId: "x", format: "post",
    publishTime: "09:00", redes: ["instagram"], descripcion: "Texto", textoPieza: "2x1", escena: "Una sala", hashtagsFinales: "#a",
    medios: [{ src: "/api/media/a.jpg" }], image: "/api/media/a.jpg", adaptados: { x: 1 }, repetir: "mes-n", aprobadaComo: "pieza",
  };

  it("es una idea pendiente con la misma información, sin archivos ni regla, y sabe de dónde viene", () => {
    const c = copiaRepetida(origen, "2026-11-10", "n1");
    expect(c).toMatchObject({
      id: "n1", status: "pending", aprobacion: "idea", title: "Promo", idea: "Oferta del martes", pilar: "promociones",
      productoId: "x", publishTime: "09:00", redes: ["instagram"], repiteDe: "p1", repeticion: "2026-11-10",
    });
    for (const k of ["medios", "image", "adaptados", "repetir", "aprobadaComo", "descripcion", "textoPieza", "escena", "hashtagsFinales"]) expect(k in c, k).toBe(false);
  });

  it("con los textos iguales, los conserva", () => {
    expect(copiaRepetida(origen, "2026-11-10", "n1", { textosNuevos: false })).toMatchObject({ descripcion: "Texto", textoPieza: "2x1" });
  });

  it("dejar de repetir quita la regla sólo de esa publicación", () => {
    const c = { id: "oct", days: [{ date: "2026-10-13", posts: [origen, { id: "otra", repetir: "semana" }] }] };
    const sin = conRegla(c, "p1", "");
    expect("repetir" in sin.days[0].posts[0]).toBe(false);
    expect(sin.days[0].posts[1].repetir).toBe("semana");
    expect(conRegla(c, "otra", "mes-dia").days[0].posts[1].repetir).toBe("mes-dia");
  });
});
