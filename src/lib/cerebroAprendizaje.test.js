import { describe, it, expect } from "vitest";
import {
  NOMBRE_SENAL, etiquetaDeResultado, contarSenales, describirSenales, acumularHistorial, describirHistorial, describirPropuestas, textoDeRespaldo,
  describirMetricas, senalesParaMostrar,
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
    expect(describirPropuestas({ sinNovedades: true })).toBe("No ha pasado nada nuevo desde la última vez —ninguna respuesta, resultado ni corrección—: no se gastó nada.");
    expect(describirPropuestas({ propuestas: 0, sinReglas: true })).toBe("La IA no vio ninguna regla que valga la pena guardar con lo que hay.");
    expect(describirPropuestas({ propuestas: 0, sinReglas: false, sinRespaldo: 2, repetidas: 0 })).toBe("No quedó ninguna regla nueva. 2 quedaron fuera por no tener el respaldo suficiente.");
    expect(describirPropuestas(undefined)).toBe("");
  });

  it("lleva el aviso del servidor (p. ej. que la cuenta rechazó un modelo)", () => {
    expect(describirPropuestas({ propuestas: 1, aviso: "Se usó Sonnet 5." })).toContain("Se usó Sonnet 5.");
  });

  it("el respaldo, en singular o plural", () => {
    expect(textoDeRespaldo(1)).toBe("Se apoya en 1 caso");
    expect(textoDeRespaldo(3)).toBe("Se apoya en 3 casos");
  });
});

describe("qué señales se enseñan de entrada", () => {
  const s = (tipo, n, resultado = 0.5) => ({ id: `${tipo}${n}`, tipo, resultado, updated_at: `2026-10-${String(30 - n).padStart(2, "0")}T10:00:00.000Z` });
  const ids = (l) => l.map((x) => x.id);

  it("las decenas que deja un botón de resultados no tapan las respuestas ni las correcciones", () => {
    const respuestas = Array.from({ length: 10 }, (_, i) => s("respuesta", i));
    const metricas = Array.from({ length: 80 }, (_, i) => s("metricas", i, i === 5 ? 0.9 : i === 6 ? 0.1 : 0.5));
    const v = senalesParaMostrar([...metricas, ...respuestas], 8);
    expect(v).toHaveLength(8);
    expect(v.filter((x) => x.tipo === "metricas")).toHaveLength(3);
    // De los resultados, las más claras: la mejor y la peor.
    expect(ids(v)).toEqual(expect.arrayContaining(["metricas5", "metricas6"]));
  });

  it("si hay pocas de las otras, los resultados llenan lo que sobra", () => {
    const v = senalesParaMostrar([s("respuesta", 1), ...Array.from({ length: 20 }, (_, i) => s("metricas", i, i / 20))], 8);
    expect(v).toHaveLength(8);
    expect(v.filter((x) => x.tipo === "respuesta")).toHaveLength(1);
  });

  it("van de la más reciente a la más vieja, y lo que cabe se enseña entero", () => {
    const v = senalesParaMostrar([s("respuesta", 3), s("correccion", 1), s("metricas", 2, 0.9)], 8);
    expect(ids(v)).toEqual(["correccion1", "metricas2", "respuesta3"]);
    expect(senalesParaMostrar([], 8)).toEqual([]);
    expect(senalesParaMostrar(undefined, 8)).toEqual([]);
  });
});

describe("lo que se dice al comparar los resultados en redes", () => {
  const base = { medidas: 12, comparadas: 12, madurando: 0, pocas: {}, sinPublicacion: 0, senales: 0, senalesNuevas: 0, reforzadas: 0, minimo: 8, dias: 5 };

  it("sin nada medido, dice qué falta", () => {
    expect(describirMetricas({ ...base, medidas: 0, comparadas: 0 })).toMatch(/todavía no tiene publicaciones medidas/);
    expect(describirMetricas(undefined)).toMatch(/todavía no tiene publicaciones medidas/);
  });

  it("con pocas, dice cuántas hay y cuántas hacen falta", () => {
    expect(describirMetricas({ ...base, medidas: 5, comparadas: 0, pocas: { instagram: 5 } }))
      .toBe("Con menos de 8 publicaciones medidas no se puede saber cuáles rinden más: hay 5 de Instagram.");
    expect(describirMetricas({ ...base, medidas: 9, comparadas: 0, pocas: { instagram: 5, facebook: 3 }, madurando: 1 }))
      .toBe("Con menos de 8 publicaciones medidas no se puede saber cuáles rinden más: hay 5 de Instagram y 3 de Facebook. 1 publicación más es de hace menos de 5 días y sus cifras todavía suben.");
  });

  it("si todas son de esta semana, que vuelva", () => {
    expect(describirMetricas({ ...base, medidas: 6, comparadas: 0, madurando: 6 })).toBe("Las 6 publicaciones medidas son de hace menos de 5 días: sus cifras todavía suben. Vuelve en unos días.");
  });

  it("si ninguna salió de la aplicación, no se sabe qué notas se usaron", () => {
    expect(describirMetricas(base)).toBe("Comparó 12 publicaciones entre sí; ninguna salió desde la aplicación, así que no se sabe qué notas se usaron para escribirlas.");
  });

  it("con señales dice cuántas, cuántas son nuevas y si movió la búsqueda", () => {
    expect(describirMetricas({ ...base, senales: 4, senalesNuevas: 4, reforzadas: 3, sinPublicacion: 8 }))
      .toBe("Comparó 12 publicaciones entre sí; 4 salieron desde la aplicación y quedaron apuntadas (4 nuevas); las notas usadas para escribir 3 de ellas subieron o bajaron en la búsqueda; 8 no salieron desde la aplicación y sólo sirvieron para comparar.");
    expect(describirMetricas({ ...base, senales: 1, senalesNuevas: 0, reforzadas: 1 }))
      .toBe("Comparó 12 publicaciones entre sí; 1 salió desde la aplicación y quedó apuntada; las notas usadas para escribir esa publicación subieron o bajaron en la búsqueda.");
  });

  it("si no se sabe qué notas se usaron, dice que la búsqueda no se movió", () => {
    expect(describirMetricas({ ...base, senales: 2, senalesNuevas: 2, reforzadas: 0 })).toMatch(/la búsqueda no se movió\.$/);
  });

  it("y avisa de las que todavía maduran", () => {
    expect(describirMetricas({ ...base, senales: 2, senalesNuevas: 2, reforzadas: 2, madurando: 3 })).toMatch(/3 publicaciones más son de hace menos de 5 días y sus cifras todavía suben\.$/);
  });
});
