import { describe, it, expect } from "vitest";
import { preferenciasDeAnuncios, piezasDeAnuncios, tipoArteDePost, MIN_PIEZAS } from "./aprenderAnuncios.js";
import { COMPOSICIONES } from "./loteAnuncios.js";

/** Una publicación pautada como la guarda `en_pauta` (lib/enPauta.js). */
const pieza = (n, { gasto, resultados, composicion, pilar = "anuncio", nivel = "problema", etapa = "presentacion", tipo = "conversacion" }) => [
  `cal1|p${n}`,
  {
    calendarId: "cal1", postId: `p${n}`, red: "instagram", activo: true, visto: "2026-11-06", etapa, nombreEtapa: "",
    tipoResultado: tipo, nombreResultado: tipo === "compra" ? "compras" : "conversaciones",
    d7: { gasto: gasto / 4, resultados: Math.round(resultados / 4), costo: null },
    d30: { gasto, resultados, costo: resultados ? gasto / resultados : null },
    anuncios: [], post: { titulo: `Pieza ${n}`, composicion, pilar, nivel },
  },
];

/** Tres piezas «En uso» a 1 $ la conversación y tres «Producto héroe» a 3 $: el mismo gasto, distinto rendimiento. */
const enPauta = (extra = []) => ({
  moneda: "USD", referencia: 0.5,
  publicaciones: Object.fromEntries([
    pieza(1, { gasto: 30, resultados: 30, composicion: "uso" }),
    pieza(2, { gasto: 30, resultados: 30, composicion: "uso" }),
    pieza(3, { gasto: 30, resultados: 30, composicion: "uso" }),
    pieza(4, { gasto: 30, resultados: 10, composicion: "heroe" }),
    pieza(5, { gasto: 30, resultados: 10, composicion: "heroe" }),
    pieza(6, { gasto: 30, resultados: 10, composicion: "heroe" }),
    ...extra,
  ]),
});

describe("el tipo de arte de una publicación", () => {
  it("el escrito; si no, el que dibuja su composición con su tipo de contenido; si no, el de la composición o el del tipo", () => {
    expect(tipoArteDePost({ tipoArte: "prensa", composicion: "uso" })).toBe("prensa");
    expect(tipoArteDePost({ composicion: "uso", pilar: "educativo" })).toBe("demostracion");
    expect(tipoArteDePost({ composicion: "heroe", pilar: "anuncio" })).toBe("producto");
    expect(tipoArteDePost({ composicion: "dividida" })).toBe("dividida");
    expect(tipoArteDePost({ pilar: "humano" })).toBe("testimonio");
    expect(tipoArteDePost({})).toBe("");
  });
});

describe("qué sale más barato para este cliente", () => {
  it("con muestra: la composición y el tipo de arte que salen más baratos y más caros, y una línea que lo dice", () => {
    const p = preferenciasDeAnuncios(enPauta(), null, { nombres: { composicion: (id) => COMPOSICIONES.find((c) => c.id === id)?.nombre } });
    expect(p.muestra).toBe(6);
    expect(p.tipoResultado).toBe("conversacion");
    expect(p.mejores).toEqual(expect.arrayContaining([
      expect.objectContaining({ rasgo: "composicion", id: "uso", nombre: "En uso", costo: 1, total: 1.5, piezas: 3 }),
      expect.objectContaining({ rasgo: "tipoArte", id: "aspiracional" }),
    ]));
    expect(p.peores).toEqual(expect.arrayContaining([expect.objectContaining({ rasgo: "composicion", id: "heroe", costo: 3 })]));
    // Todas con el mismo nivel y la misma etapa: ahí no hay nada que comparar.
    expect(p.mejores.some((m) => m.rasgo === "nivel" || m.rasgo === "etapa")).toBe(false);
    expect(p.linea).toMatch(/^Lo que ya se probó en pauta con esta marca \(costo por conversación, últimos 30 días, 6 piezas con gasto suficiente\): sale más barato /);
    expect(p.linea).toMatch(/la composición «En uso» \(1,00\sUS\$ frente a 1,50\sUS\$ del total\)/);
    expect(p.linea).toMatch(/sale más caro .*la composición «Producto héroe» \(3,00\sUS\$\)/);
    expect(p.linea).toMatch(/una pieza de cada cuatro para probar algo distinto/);
    expect(p.motivo).toBe("");
  });

  it(`sin ${MIN_PIEZAS} piezas en cada uno de dos valores no se concluye nada, y se dice qué falta`, () => {
    const pocas = { ...enPauta(), publicaciones: Object.fromEntries(Object.entries(enPauta().publicaciones).slice(0, 5)) };
    const p = preferenciasDeAnuncios(pocas);
    expect(p.linea).toBe("");
    expect(p.mejores).toEqual([]);
    expect(p.motivo).toMatch(/al menos dos valores de un mismo rasgo .* tengan 3 piezas pautadas cada uno/);
    expect(preferenciasDeAnuncios({}).motivo).toMatch(/Todavía no hay piezas del calendario/);
  });

  it("lo que gastó poco no cuenta (dos veces el número mágico, o un cuarto de lo que gasta una pieza típica)", () => {
    // Con el número mágico en 20 $, ninguna llegó a 40 $: no hay muestra.
    const caro = { ...enPauta(), referencia: 20 };
    expect(preferenciasDeAnuncios(caro).muestra).toBe(0);
    // Una pieza de 1 $ frente a las de 30: un cuarto de la típica son 7,50 $ y no cuenta.
    const p = preferenciasDeAnuncios(enPauta([pieza(7, { gasto: 1, resultados: 0, composicion: "uso" })]));
    expect(p.muestra).toBe(6);
    expect(p.minGasto).toBe(7.5);
  });

  it("sólo compara lo del mismo tipo de resultado (el que más se repite)", () => {
    const p = preferenciasDeAnuncios(enPauta([pieza(8, { gasto: 90, resultados: 1, composicion: "uso", tipo: "compra" })]));
    expect(p.tipoResultado).toBe("conversacion");
    expect(p.muestra).toBe(6);
  });

  it("las publicaciones de ahora mandan sobre lo recordado (una lista de calendarios, como los del navegador)", () => {
    const cals = [{ id: "cal1", days: [{ date: "2026-10-01", posts: [1, 2, 3].map((n) => ({ id: `p${n}`, composicion: "ugc", pilar: "humano" })) }] }];
    const piezas = piezasDeAnuncios(enPauta(), cals);
    expect(piezas.find((x) => x.clave === "cal1|p1").rasgos).toMatchObject({ composicion: "ugc", tipoArte: "testimonio" });
    expect(piezas.find((x) => x.clave === "cal1|p4").rasgos).toMatchObject({ composicion: "heroe" });
    const p = preferenciasDeAnuncios(enPauta(), cals);
    expect(p.mejores.find((m) => m.rasgo === "composicion")).toMatchObject({ id: "ugc" });
  });
});
