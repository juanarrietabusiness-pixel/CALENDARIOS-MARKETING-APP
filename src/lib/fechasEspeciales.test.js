import { describe, it, expect } from "vitest";
import {
  pascua, catalogoDelAnio, fechasDelMes, fechasPorDia, preferenciasFechas,
  leerFechasDeIA, fundirEleccion, fechasParaLaIA, pedidoDeFechas, CATALOGO,
} from "./fechasEspeciales";

const fecha = (anio, id) => catalogoDelAnio(anio).find((f) => f.id === id).fecha;

describe("las fechas que se mueven", () => {
  it("Pascua", () => {
    expect(pascua(2026)).toBe("2026-04-05");
    expect(pascua(2027)).toBe("2027-03-28");
    expect(pascua(2024)).toBe("2024-03-31");
  });

  it("Carnaval, Semana Santa, Día del Padre y Black Friday", () => {
    expect(fecha(2027, "martes-carnaval")).toBe("2027-02-09");
    expect(fecha(2027, "ceniza")).toBe("2027-02-10");
    expect(fecha(2027, "sabado-carnaval")).toBe("2027-02-06");
    expect(fecha(2026, "viernes-santo")).toBe("2026-04-03");
    expect(fecha(2026, "padre")).toBe("2026-06-21");
    expect(fecha(2026, "black-friday")).toBe("2026-11-27");
    expect(fecha(2026, "cyber-monday")).toBe("2026-11-30");
  });

  it("ningún id se repite", () => {
    expect(new Set(CATALOGO.map((f) => f.id)).size).toBe(CATALOGO.length);
  });
});

describe("fechasDelMes", () => {
  it("sin elegir nada: feriados y comerciales, sin los días internacionales", () => {
    const oct = fechasDelMes(2026, 9, null);
    expect(oct.map((f) => f.id)).toEqual(["halloween"]);
    const nov = fechasDelMes(2026, 10, undefined).map((f) => f.id);
    expect(nov).toEqual(["separacion", "bandera", "colon", "grito", "black-friday", "independencia", "cyber-monday"]);
  });

  it("lo elegido se destaca (también un internacional), lo oculto no sale y lo propio se repite cada año", () => {
    const pref = {
      elegidas: ["cafe", "halloween"],
      ocultas: ["fin-de-anio"],
      propias: [{ id: "aniv", dia: "10-12", nombre: "Aniversario de la marca" }, { id: "exp", fecha: "2027-10-02", nombre: "Feria" }],
    };
    const oct = fechasDelMes(2026, 9, pref);
    expect(oct.map((f) => [f.id, f.destacada])).toEqual([["cafe", true], ["aniv", true], ["halloween", true]]);
    expect(fechasDelMes(2027, 9, pref).map((f) => f.id)).toEqual(["cafe", "exp", "aniv", "halloween"]);
    expect(fechasDelMes(2026, 11, pref).map((f) => f.id)).not.toContain("fin-de-anio");
  });

  it("agrupa por día", () => {
    const m = fechasPorDia(fechasDelMes(2026, 10, null));
    expect(m.get("2026-11-03")[0].nombre).toBe("Separación de Panamá de Colombia");
  });

  it("para la IA dice qué es importante y qué es delicado", () => {
    const txt = fechasParaLaIA(fechasDelMes(2026, 11, { elegidas: ["madre"] }));
    expect(txt).toContain("2026-12-08: Día de la Madre (importante para este cliente)");
    expect(txt).toContain("Día de Duelo Nacional (fecha delicada");
  });
});

describe("preferenciasFechas", () => {
  it("descarta lo que no se entiende", () => {
    const p = preferenciasFechas({ elegidas: ["cafe", "no-existe", "cafe"], propias: [{ nombre: "x", dia: "13-40" }, { nombre: " Feria ", fecha: "2026-10-02" }] });
    expect(p.elegidas).toEqual(["cafe"]);
    expect(p.propias).toEqual([{ id: "2026-10-02- Feria ", fecha: "2026-10-02", nombre: "Feria", porque: "" }]);
    expect(preferenciasFechas("basura")).toEqual({ elegidas: [], ocultas: [], propias: [] });
  });
});

describe("la IA escoge", () => {
  it("el pedido lleva el catálogo del año", () => {
    const p = pedidoDeFechas("CLIENTE: Café Luna", 2027);
    expect(p).toContain("CLIENTE: Café Luna");
    expect(p).toContain("martes-carnaval | 02-09 | Martes de Carnaval | feriado");
  });

  it("lee el JSON, descarta ids inventados y marca lo propio para verificar", () => {
    const r = leerFechasDeIA('Claro: {"elegidas":["cafe","inventada"],"propias":[{"dia":"10-01","nombre":"Día del Barista","porque":"rubro"},{"dia":"1 oct","nombre":"mal"}]}');
    expect(r.elegidas).toEqual(["cafe"]);
    expect(r.propias).toHaveLength(1);
    expect(r.propias[0]).toMatchObject({ dia: "10-01", nombre: "Día del Barista", verificar: true });
    expect(leerFechasDeIA("no sé")).toBeNull();
  });

  it("fundir no desoculta ni borra lo confirmado por una persona", () => {
    const antes = { ocultas: ["halloween"], propias: [{ id: "aniv", dia: "10-12", nombre: "Aniversario" }, { id: "viejo", dia: "05-05", nombre: "Propuesta vieja", verificar: true }] };
    const r = fundirEleccion(antes, { elegidas: ["halloween", "cafe"], propias: [{ id: "n", dia: "10-01", nombre: "Día del Barista", verificar: true }] }, "2026-10-06T00:00:00Z");
    expect(r.elegidas).toEqual(["cafe"]);
    expect(r.ocultas).toEqual(["halloween"]);
    expect(r.propias.map((p) => p.nombre)).toEqual(["Aniversario", "Día del Barista"]);
    expect(r.elegidasAt).toBe("2026-10-06T00:00:00Z");
  });
});
