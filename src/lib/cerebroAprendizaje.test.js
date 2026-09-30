import { describe, it, expect } from "vitest";
import {
  NOMBRE_SENAL, etiquetaDeResultado, contarSenales, describirSenales, acumularHistorial, describirHistorial, describirPropuestas, textoDeRespaldo,
} from "./cerebroAprendizaje";

describe("cómo salió", () => {
  it("bien, mal o regular, en palabras", () => {
    expect(etiquetaDeResultado(1)).toEqual({ texto: "Salió bien", nivel: "bien" });
    expect(etiquetaDeResultado(0.6).nivel).toBe("bien");
    expect(etiquetaDeResultado(0.2)).toEqual({ texto: "Salió mal", nivel: "mal" });
    expect(etiquetaDeResultado(0.4).nivel).toBe("mal");
    expect(etiquetaDeResultado(0.5).nivel).toBe("medio");
    expect(etiquetaDeResultado(NaN).nivel).toBe("medio");
    expect(etiquetaDeResultado(undefined).texto).toBe("Sin valorar");
  });

  it("cada clase de señal tiene su nombre", () => {
    expect(Object.keys(NOMBRE_SENAL).sort()).toEqual(["correccion", "metricas", "respuesta"]);
  });
});

describe("contar señales", () => {
  const s = [
    { tipo: "respuesta", resultado: 1 }, { tipo: "respuesta", resultado: 0.2 }, { tipo: "metricas", resultado: 0.5 }, { tipo: "respuesta", resultado: 1 },
  ];

  it("por clase y por cómo salió", () => {
    expect(contarSenales(s)).toEqual({ total: 4, bien: 2, mal: 1, porTipo: { respuesta: 3, metricas: 1 } });
    expect(contarSenales()).toEqual({ total: 0, bien: 0, mal: 0, porTipo: {} });
  });

  it("en una frase, con el singular donde toca", () => {
    expect(describirSenales(s)).toBe("4 señales: 2 salieron bien, 1 salió mal, 1 regular.");
    expect(describirSenales([{ tipo: "respuesta", resultado: 1 }])).toBe("1 señal: 1 salió bien.");
    expect(describirSenales([])).toBe("Todavía no ha aprendido nada.");
  });
});

describe("aprender del historial, calendario a calendario", () => {
  it("se junta lo que devuelve cada llamada", () => {
    let a = acumularHistorial(null, { calendarios: 3, total: 7, senales: 5, senalesNuevas: 5, notas: { creadas: 2, actualizadas: 0, conservadas: 0, quitadas: 0 } });
    a = acumularHistorial(a, { calendarios: 3, total: 7, senales: 4, senalesNuevas: 3, notas: { creadas: 1, actualizadas: 1, conservadas: 1, quitadas: 0 } });
    a = acumularHistorial(a, { calendarios: 1, total: 7, senales: 0, senalesNuevas: 0, notas: {} });
    expect(a).toEqual({ leidos: 7, total: 7, senales: 9, senalesNuevas: 8, creadas: 3, actualizadas: 1, conservadas: 1, quitadas: 0 });
  });

  it("no rompe con una respuesta a medias", () => {
    expect(acumularHistorial(null, {})).toMatchObject({ leidos: 0, senales: 0 });
    expect(acumularHistorial(null, undefined)).toMatchObject({ leidos: 0 });
  });

  it("dice lo que hizo, y sólo lo que hizo", () => {
    expect(describirHistorial(null)).toBe("No había respuestas del cliente que leer.");
    expect(describirHistorial({ leidos: 2, senales: 0 })).toBe("No había respuestas del cliente que leer.");
    expect(describirHistorial({ leidos: 1, total: 1, senales: 1, creadas: 1, actualizadas: 0, conservadas: 0, quitadas: 0 }))
      .toBe("Leyó 1 calendario y encontró 1 respuesta del cliente; dejó 1 nota nueva con sus palabras.");
    expect(describirHistorial({ leidos: 4, senales: 9, creadas: 3, actualizadas: 2, conservadas: 1, quitadas: 2 }))
      .toBe("Leyó 4 calendarios y encontró 9 respuestas del cliente; dejó 3 notas nuevas con sus palabras; 2 notas puestas al día; 1 corregida a mano se conservó; 2 viejas se quitaron para no pasar del tope.");
  });
});

describe("lo que pasó al proponer reglas", () => {
  it("dice cuántas propuso, y lo que quedó fuera y por qué", () => {
    expect(describirPropuestas({ propuestas: 2, sinRespaldo: 1, repetidas: 0 })).toBe("Propuso 2 reglas nuevas: revísalas abajo y acepta las que valgan. 1 quedó fuera por no tener el respaldo suficiente.");
    expect(describirPropuestas({ propuestas: 1, sinRespaldo: 0, repetidas: 3 })).toBe("Propuso 1 regla nueva: revísala abajo y decide. 3 ya estaban decididas o descartadas.");
  });

  it("sin nada nuevo, no se gastó; sin reglas, se dice sin dramatismo", () => {
    expect(describirPropuestas({ sinNovedades: true })).toBe("No hay respuestas nuevas desde la última vez: no se gastó nada.");
    expect(describirPropuestas({ propuestas: 0, sinReglas: true })).toBe("La IA no vio ninguna regla que valga la pena guardar con lo que hay.");
    expect(describirPropuestas({ propuestas: 0, sinReglas: false, sinRespaldo: 2, repetidas: 0 })).toBe("No quedó ninguna regla nueva. 2 quedaron fuera por no tener el respaldo suficiente.");
    expect(describirPropuestas(undefined)).toBe("");
  });

  it("lleva el aviso del servidor (p. ej. que la cuenta rechazó un modelo)", () => {
    expect(describirPropuestas({ propuestas: 1, aviso: "Se usó Sonnet 5." })).toContain("Se usó Sonnet 5.");
  });

  it("el respaldo, en singular o plural", () => {
    expect(textoDeRespaldo(1)).toBe("Se apoya en 1 respuesta");
    expect(textoDeRespaldo(3)).toBe("Se apoya en 3 respuestas");
  });
});
