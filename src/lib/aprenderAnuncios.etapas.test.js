import { describe, it, expect } from "vitest";
import { preferenciasDeAnuncios } from "./aprenderAnuncios.js";

const pieza = (n, { gasto, resultados, composicion, etapa }) => [
  `cal1|p${n}`,
  {
    calendarId: "cal1", postId: `p${n}`, red: "instagram", activo: true, visto: "2026-11-06", etapa, nombreEtapa: "",
    tipoResultado: "conversacion", nombreResultado: "conversaciones",
    d7: { gasto: gasto / 4, resultados: Math.round(resultados / 4), costo: null },
    d30: { gasto, resultados, costo: resultados ? gasto / resultados : null },
    anuncios: [], post: { titulo: `Pieza ${n}`, composicion, pilar: "anuncio", nivel: "problema" },
  },
];

// Presentación (gente que no conoce la marca) cuesta más que Conversión siempre. Las «En uso» corrieron todas en
// Presentación y las «Producto héroe» en Conversión: mezclando etapas, «héroe» parecía mejor y la presentación peor.
const mezcla = {
  moneda: "USD", referencia: 0.5,
  publicaciones: Object.fromEntries([
    pieza(1, { gasto: 30, resultados: 10, composicion: "uso", etapa: "presentacion" }),
    pieza(2, { gasto: 30, resultados: 10, composicion: "uso", etapa: "presentacion" }),
    pieza(3, { gasto: 30, resultados: 10, composicion: "uso", etapa: "presentacion" }),
    pieza(4, { gasto: 30, resultados: 30, composicion: "heroe", etapa: "conversion" }),
    pieza(5, { gasto: 30, resultados: 30, composicion: "heroe", etapa: "conversion" }),
    pieza(6, { gasto: 30, resultados: 30, composicion: "heroe", etapa: "conversion" }),
  ]),
};

describe("lo que se aprende de los anuncios compara DENTRO de cada etapa", () => {
  it("no compara una composición de presentación con una de conversión ni concluye nada de la etapa", () => {
    const p = preferenciasDeAnuncios(mezcla);
    // Cada composición vive en una sola etapa: dentro de cada etapa no hay dos valores con que comparar.
    expect(p.mejores).toEqual([]);
    expect(p.peores).toEqual([]);
    expect([...p.mejores, ...p.peores].some((x) => x.rasgo === "etapa")).toBe(false);
    expect(p.linea).toBe("");
    expect(p.linea).not.toMatch(/evita.*[Pp]resentación/);
  });

  it("dentro de una etapa sí compara, y dice en cuál", () => {
    const mas = {
      ...mezcla,
      publicaciones: {
        ...mezcla.publicaciones,
        ...Object.fromEntries([7, 8, 9].map((n) => pieza(n, { gasto: 30, resultados: 30, composicion: "heroe", etapa: "presentacion" }))),
      },
    };
    const p = preferenciasDeAnuncios(mas);
    const comp = p.mejores.find((x) => x.rasgo === "composicion");
    expect(comp).toMatchObject({ id: "heroe", etapa: "presentacion" });
    expect(p.linea).toMatch(/en Presentación, sale más barato/);
    expect(p.linea).toMatch(/no dejes ninguna/);
  });
});
