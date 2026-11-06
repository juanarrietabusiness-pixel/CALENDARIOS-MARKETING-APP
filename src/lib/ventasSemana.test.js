import { describe, it, expect } from "vitest";
import {
  lunesDe, lunesDeHoy, semanasHacia, ventanaDelCliente, semanaQueToca, etiquetaSemana, nombreSemana,
  leerEntero, leerMonto, limpiarVentas, agruparPorSemana, tasaDeCierreMedida, tasaParaUsar, roasReal,
  sinMedirDesde, textoSinMedir, resumenVentas, pct, dinero, enlaceDeVentas, mensajeDeLosLunes,
  TASA_POR_DEFECTO, MAX_NOTA,
} from "./ventasSemana.js";

const ACCION = "onsite_conversion.messaging_conversation_started_7d";

describe("las semanas, por su lunes y en Panamá", () => {
  it("el lunes de cualquier día de la semana", () => {
    expect(lunesDe("2026-11-02")).toBe("2026-11-02"); // lunes
    expect(lunesDe("2026-11-06")).toBe("2026-11-02"); // viernes
    expect(lunesDe("2026-11-08")).toBe("2026-11-02"); // domingo: todavía es la semana del 2
    expect(lunesDe("2026-11-09")).toBe("2026-11-09");
    expect(lunesDe("2027-01-01")).toBe("2026-12-28"); // cruza el año
    expect(lunesDe("no")).toBe("");
  });

  it("el lunes de hoy sale de la hora de Panamá, no de UTC", () => {
    // Domingo 8 de noviembre a las 21:00 en Panamá = lunes 9 a las 02:00 UTC: sigue siendo la semana del 2.
    expect(lunesDeHoy(new Date("2026-11-09T02:00:00Z"))).toBe("2026-11-02");
    expect(lunesDeHoy(new Date("2026-11-09T06:00:00Z"))).toBe("2026-11-09");
  });

  it("la ventana del cliente: la semana actual y las dos anteriores", () => {
    expect(ventanaDelCliente("2026-11-06")).toEqual(["2026-11-02", "2026-10-26", "2026-10-19"]);
    expect(semanasHacia("2026-11-04", 2)).toEqual(["2026-11-02", "2026-10-26"]);
  });

  it("la semana que se pregunta: de lunes a miércoles, la que acaba de terminar", () => {
    expect(semanaQueToca("2026-11-09")).toBe("2026-11-02"); // lunes
    expect(semanaQueToca("2026-11-11")).toBe("2026-11-02"); // miércoles
    expect(semanaQueToca("2026-11-12")).toBe("2026-11-09"); // jueves
    expect(semanaQueToca("2026-11-15")).toBe("2026-11-09"); // domingo
  });

  it("cómo se dice una semana", () => {
    expect(etiquetaSemana("2026-11-02")).toBe("del 2 al 8 de noviembre");
    expect(etiquetaSemana("2026-11-30")).toBe("del 30 de noviembre al 6 de diciembre");
    expect(etiquetaSemana("2026-12-28")).toBe("del 28 de diciembre de 2026 al 3 de enero de 2027");
    expect(nombreSemana("2026-11-02", "2026-11-06")).toBe("Esta semana");
    expect(nombreSemana("2026-10-26", "2026-11-06")).toBe("La semana pasada");
    expect(nombreSemana("2026-10-19", "2026-11-06")).toBe("Hace 2 semanas");
    expect(nombreSemana("2026-08-03", "2026-11-06")).toBe("Semana del 3 al 9 de agosto");
  });
});

describe("lo que se teclea", () => {
  it("un entero, con separador de miles o sin él, pero nunca un decimal", () => {
    expect(leerEntero("12")).toBe(12);
    expect(leerEntero(" 1,200 ")).toBe(1200);
    expect(leerEntero("1.200")).toBe(1200);
    expect(leerEntero("")).toBeNull();
    expect(leerEntero("1.5")).toBeNaN();
    expect(leerEntero("-3")).toBeNaN();
    expect(leerEntero(3.5)).toBeNaN();
    expect(leerEntero(7)).toBe(7);
  });

  it("un monto, como se escribe en Panamá y como se escribe en otros sitios", () => {
    expect(leerMonto("1250")).toBe(1250);
    expect(leerMonto("$1,250.50")).toBe(1250.5);
    expect(leerMonto("1.250,50")).toBe(1250.5);
    expect(leerMonto("B/. 80")).toBe(80);
    expect(leerMonto("12,5")).toBe(12.5);
    expect(leerMonto("1,250")).toBe(1250);
    expect(leerMonto("1.000.000")).toBe(1000000);
    expect(leerMonto("80.456")).toBe(80.46); // un solo punto es el decimal, redondeado al centavo
    expect(leerMonto("")).toBeNull();
    expect(leerMonto("mil")).toBeNaN();
    expect(leerMonto("-5")).toBeNaN();
  });
});

describe("limpiar lo que manda el cliente", () => {
  const hoy = "2026-11-06";

  it("lo obligatorio y lo opcional, limpio", () => {
    const r = limpiarVentas({ semana: "2026-11-04", ventas: "7", monto: "$1,250.50", deAnuncios: "5", otrosCanales: "300", nota: "  Dos   por llamada " }, { hoy });
    expect(r.fila).toEqual({ semana: "2026-11-02", ventas: 7, monto: 1250.5, deAnuncios: 5, otrosCanales: 300, nota: "Dos por llamada" });
  });

  it("sin lo opcional, queda en null (no en 0: «no lo sé» no es «ninguna»)", () => {
    const r = limpiarVentas({ semana: "2026-11-02", ventas: 0, monto: 0 }, { hoy });
    expect(r.fila).toMatchObject({ ventas: 0, monto: 0, deAnuncios: null, otrosCanales: null, nota: "" });
  });

  it("sólo la semana actual y las dos anteriores", () => {
    expect(limpiarVentas({ semana: "2026-10-19", ventas: 1, monto: 10 }, { hoy }).fila).toBeTruthy();
    expect(limpiarVentas({ semana: "2026-10-12", ventas: 1, monto: 10 }, { hoy }).error).toMatch(/últimas 3 semanas/);
    expect(limpiarVentas({ semana: "2026-11-09", ventas: 1, monto: 10 }, { hoy }).error).toMatch(/todavía no empieza/);
    // La agencia ve ocho.
    expect(limpiarVentas({ semana: "2026-09-14", ventas: 1, monto: 10 }, { hoy, ventana: 8 }).fila).toBeTruthy();
  });

  it("los errores dicen qué arreglar", () => {
    expect(limpiarVentas({ ventas: 1, monto: 1 }, { hoy }).error).toMatch(/semana/);
    expect(limpiarVentas({ semana: "2026-11-02", monto: 1 }, { hoy }).error).toMatch(/cuántas ventas/);
    expect(limpiarVentas({ semana: "2026-11-02", ventas: "2.5", monto: 1 }, { hoy }).error).toMatch(/entero/);
    expect(limpiarVentas({ semana: "2026-11-02", ventas: 2 }, { hoy }).error).toMatch(/por cuánto/);
    expect(limpiarVentas({ semana: "2026-11-02", ventas: 2, monto: "mucho" }, { hoy }).error).toMatch(/monto/);
    expect(limpiarVentas({ semana: "2026-11-02", ventas: 0, monto: 50 }, { hoy }).error).toMatch(/cuántas ventas fueron/);
    expect(limpiarVentas({ semana: "2026-11-02", ventas: 2, monto: 50, deAnuncios: 3 }, { hoy }).error).toMatch(/no pueden ser más/);
    expect(limpiarVentas({ semana: "2026-11-02", ventas: 2, monto: 1e9 }, { hoy }).error).toMatch(/demasiado alto/);
  });

  it("la nota tiene tope", () => {
    expect(limpiarVentas({ semana: "2026-11-02", ventas: 1, monto: 1, nota: "x".repeat(900) }, { hoy }).fila.nota).toHaveLength(MAX_NOTA);
  });
});

describe("lo que dice Meta, por semana", () => {
  it("suma el gasto y las conversaciones de cada día en su lunes, y las semanas sin pauta salen en 0", () => {
    const filas = [
      { date_start: "2026-10-27", spend: "10.10", actions: [{ action_type: ACCION, value: "12" }, { action_type: "link_click", value: "40" }] },
      { date_start: "2026-11-01", spend: "5", actions: [{ action_type: ACCION, value: "3" }] },
      { date_start: "2026-11-03", spend: "7.5" },
    ];
    expect(agruparPorSemana(filas, { accion: ACCION, semanas: ["2026-11-02", "2026-10-26", "2026-10-19"] })).toEqual({
      "2026-11-02": { gasto: 7.5, conversaciones: 0 },
      "2026-10-26": { gasto: 15.1, conversaciones: 15 },
      "2026-10-19": { gasto: 0, conversaciones: 0 },
    });
  });
});

describe("la tasa de cierre medida", () => {
  // Las conversaciones de la semana ANTERIOR a cada semana de ventas.
  const meta = {
    "2026-11-02": { gasto: 40, conversaciones: 90 },
    "2026-10-26": { gasto: 40, conversaciones: 80 },
    "2026-10-19": { gasto: 30, conversaciones: 60 },
    "2026-10-12": { gasto: 30, conversaciones: 50 },
    "2026-10-05": { gasto: 20, conversaciones: 40 },
    "2026-09-28": { gasto: 20, conversaciones: 30 },
  };

  it("ventas ÷ conversaciones de la semana anterior, sobre las últimas 4 semanas con datos", () => {
    const semanas = [
      { semana: "2026-11-02", ventas: 4, monto: 400 }, // cruza con 26-oct: 80
      { semana: "2026-10-26", ventas: 3, monto: 300 }, // 19-oct: 60
      { semana: "2026-10-19", ventas: 3, monto: 300 }, // 12-oct: 50
      { semana: "2026-10-12", ventas: 2, monto: 200 }, // 5-oct: 40
      { semana: "2026-10-05", ventas: 9, monto: 900 }, // la quinta: no entra
    ];
    const t = tasaDeCierreMedida(semanas, meta);
    expect(t.semanas).toEqual(["2026-11-02", "2026-10-26", "2026-10-19", "2026-10-12"]);
    expect(t.ventas).toBe(12);
    expect(t.conversaciones).toBe(230);
    expect(t.tasa).toBeCloseTo(12 / 230);
    expect(t.suficiente).toBe(true);
    expect(tasaParaUsar(t)).toBeCloseTo(12 / 230);
  });

  it("si el cliente separó las de los anuncios, cuentan ésas", () => {
    const t = tasaDeCierreMedida([
      { semana: "2026-11-02", ventas: 10, deAnuncios: 4, monto: 1000 },
      { semana: "2026-10-26", ventas: 6, monto: 600 },
    ], meta);
    expect(t.ventas).toBe(10);
    expect(t.conversaciones).toBe(140);
  });

  it("las semanas sin apuntar no cuentan como cero ventas", () => {
    const t = tasaDeCierreMedida([{ semana: "2026-11-02", ventas: 4 }, { semana: "2026-10-19", ventas: 3 }], meta);
    expect(t.semanas).toEqual(["2026-11-02", "2026-10-19"]);
    expect(t.conversaciones).toBe(130);
  });

  it("con pocos datos se dice, y se sigue usando el 5 %", () => {
    const t = tasaDeCierreMedida([{ semana: "2026-11-02", ventas: 4 }], meta);
    expect(t.tasa).toBeCloseTo(4 / 80);
    expect(t.suficiente).toBe(false);
    expect(t.motivo).toMatch(/pocos datos.*5 %/);
    expect(tasaParaUsar(t)).toBe(TASA_POR_DEFECTO);
  });

  it("sin Meta, sin semanas o sin conversaciones no hay tasa", () => {
    expect(tasaDeCierreMedida([{ semana: "2026-11-02", ventas: 4 }], null).tasa).toBeNull();
    expect(tasaDeCierreMedida([], meta).motivo).toMatch(/todavía no ha apuntado/);
    expect(tasaDeCierreMedida([{ semana: "2026-11-02", ventas: 4 }], { "2026-10-26": { gasto: 0, conversaciones: 0 } }).motivo).toMatch(/no empezaron conversaciones/);
    expect(tasaParaUsar(null)).toBe(TASA_POR_DEFECTO);
  });

  it("más de la mitad cerradas avisa: puede que cuente ventas que no vinieron de los anuncios", () => {
    const t = tasaDeCierreMedida([{ semana: "2026-11-02", ventas: 70 }, { semana: "2026-10-26", ventas: 70 }], meta);
    expect(t.tasa).toBe(1); // nunca más del 100 %
    expect(t.aviso).toMatch(/más de la mitad/);
  });
});

describe("el ROAS real de WhatsApp y el costo por venta", () => {
  it("monto ÷ pauta y pauta ÷ ventas, con la pauta de la semana anterior", () => {
    const meta = { "2026-10-26": { gasto: 50, conversaciones: 80 }, "2026-10-19": { gasto: 50, conversaciones: 60 } };
    const r = roasReal([{ semana: "2026-11-02", ventas: 4, monto: 600, otrosCanales: 200 }, { semana: "2026-10-26", ventas: 1, monto: 400 }], meta);
    expect(r.gasto).toBe(100);
    expect(r.monto).toBe(1000);
    expect(r.roas).toBe(10);
    expect(r.costoPorVenta).toBe(20);
    expect(r.otrosCanales).toBe(200);
  });

  it("sin pauta no hay ROAS (no es infinito)", () => {
    const r = roasReal([{ semana: "2026-11-02", ventas: 4, monto: 600 }], { "2026-10-26": { gasto: 0, conversaciones: 0 } });
    expect(r.roas).toBeNull();
    expect(r.costoPorVenta).toBeNull();
    expect(roasReal([], null).roas).toBeNull();
  });
});

describe("cuando el cliente no contesta", () => {
  it("al día si tiene la semana que acaba de terminar", () => {
    expect(sinMedirDesde([{ semana: "2026-10-26", ventas: 1 }], "2026-11-06")).toBeNull();
    expect(sinMedirDesde([{ semana: "2026-11-02", ventas: 1 }], "2026-11-06")).toBeNull();
  });

  it("si no, desde cuándo y cuántas semanas terminadas faltan", () => {
    const s = sinMedirDesde([{ semana: "2026-10-12", ventas: 1 }, { semana: "2026-10-05", ventas: 2 }], "2026-11-06");
    expect(s).toEqual({ nunca: false, desde: "2026-10-19", ultima: "2026-10-12", semanas: 2 });
    expect(textoSinMedir(s)).toBe("Sin medir desde el 19 de octubre (faltan 2 semanas).");
    expect(textoSinMedir(sinMedirDesde([], "2026-11-06"))).toMatch(/todavía no ha apuntado/);
    expect(textoSinMedir(null)).toBe("");
  });

  it("el resumen junta todo", () => {
    const r = resumenVentas([{ semana: "2026-10-12", ventas: 1, monto: 100 }], { "2026-10-05": { gasto: 10, conversaciones: 30 } }, { hoy: "2026-11-06" });
    expect(r.tasa.tasa).toBeCloseTo(1 / 30);
    expect(r.tasaUsada).toBe(TASA_POR_DEFECTO);
    expect(r.roas).toBe(10);
    expect(r.sinMedir.desde).toBe("2026-10-19");
  });
});

describe("cómo se dice", () => {
  it("porcentajes y dinero", () => {
    expect(pct(0.05)).toBe("5 %");
    expect(pct(0.125)).toBe("12,5 %");
    expect(pct(null)).toBe("—");
    expect(dinero(1250.5)).toBe("$1,250.50");
    expect(dinero(80)).toBe("$80");
    expect(dinero(null)).toBe("—");
  });

  it("el enlace del cliente", () => {
    expect(enlaceDeVentas("https://calendario.juancitoads.com/", "abc")).toBe("https://calendario.juancitoads.com/ventas?t=abc");
    expect(enlaceDeVentas("https://x", "")).toBe("");
  });

  it("el mensaje de los lunes pregunta por la semana que acaba de terminar, con el enlace", () => {
    const m = mensajeDeLosLunes({ nombre: "Dcasa", enlace: "https://x/ventas?t=abc", hoy: "2026-11-09" });
    expect(m).toMatch(/^Hola Dcasa, ¿cómo te fue la semana pasada \(del 2 al 8 de noviembre\)\?/);
    expect(m).toContain("https://x/ventas?t=abc");
    expect(m).toMatch(/30 segundos/);
    // Sin voseo: en tú.
    expect(m).not.toMatch(/\b(tenés|podés|apuntá|vendiste vos)\b/);
    // Un jueves, la que va.
    expect(mensajeDeLosLunes({ nombre: "", enlace: "e", hoy: "2026-11-12" })).toMatch(/^Hola, ¿cómo te fue esta semana \(del 9 al 15 de noviembre\)/);
  });
});
