import { describe, it, expect } from "vitest";
import {
  limpiarAnclas, avisoDeAncla, anclasUsables, lineaDeAnclas, SUGERENCIAS_ANCLAS, MAX_ANCLAS, MAX_ANCLA, MAX_LINEA_ANCLAS,
} from "./anclasEstilo";
import { limpiarKit, kitVacio, bloqueDeMarca, fundirKit, leerKit, pedidoDeKit, pedidoDeRevision, pedidoConMarca } from "./kitMarca";

// ============================================================
// Las referencias de estilo de la marca (`kit.anclas`)
//
// Lo que importa:
//   1. Son SIEMPRE genéricas: lo que parece una persona o una marca se avisa y no va a las piezas.
//   2. Un kit de antes (sin referencias) no cambia: ni la clave, ni el bloque de la marca.
//   3. Van cortas en el pedido del motor (tiene tope) y enteras al director.
// ============================================================

const KIT = {
  paleta: [{ hex: "#152473", nombre: "azul marino", rol: "dominante" }],
  estilo: "industrial y confiable",
  luz: "fuerte y directa",
  tipografia: "Anton",
  evitar: "elementos recargados",
};

describe("limpiar", () => {
  it("frases cortas, sin comillas ni punto final, sin repetir (sin mirar tildes ni mayúsculas) y como mucho seis", () => {
    expect(limpiarAnclas(["  «grano cálido de los años 70».  ", "GRANO CÁLIDO DE LOS AÑOS 70", "", null, "editorial de moda audaz"]))
      .toEqual(["grano cálido de los años 70", "editorial de moda audaz"]);
    expect(limpiarAnclas(Array.from({ length: 9 }, (_, i) => `estilo ${i}`))).toHaveLength(MAX_ANCLAS);
    expect(limpiarAnclas(["x".repeat(200)])[0]).toHaveLength(MAX_ANCLA);
    expect(limpiarAnclas("no es lista")).toEqual([]);
  });
});

describe("¿parece un nombre propio?", () => {
  it("las sugerencias de la casa son genéricas (ninguna avisa)", () => {
    const todas = SUGERENCIAS_ANCLAS.flatMap((g) => g.frases);
    expect(todas.length).toBeGreaterThan(10);
    for (const f of todas) expect(avisoDeAncla(f), f).toBe("");
  });

  it("frases genéricas, también con mayúscula al principio o tras dos puntos", () => {
    for (const f of ["Minimalismo escandinavo", "Años 70 cálidos", "estética wabi-sabi: Lo natural", "luz de la tarde en Panamá", "art déco", "Bauhaus de color plano"]) {
      expect(avisoDeAncla(f), f).toBe("");
    }
  });

  it("marcas de película, cámaras y revistas, aunque vayan en minúsculas", () => {
    expect(avisoDeAncla("ciencia del color kodak portra")).toMatch(/«kodak» es una marca/);
    expect(avisoDeAncla("Tri-X empujado a 3200")).toMatch(/«tri-x» es una marca/);
    expect(avisoDeAncla("como una revista Kinfolk")).toMatch(/marca/);
  });

  it("personas: un nombre con mayúscula en medio de la frase o seguido de un número", () => {
    expect(avisoDeAncla("retrato al estilo de Annie Leibovitz")).toMatch(/«Annie» parece el nombre de una persona o de una marca/);
    expect(avisoDeAncla("luz de Rembrandt")).toMatch(/Rembrandt/);
    expect(avisoDeAncla("Velvet 50 saturada")).toMatch(/Velvet/);
  });

  it("las que avisan no van a las piezas", () => {
    expect(anclasUsables(["grano cálido de los años 70", "kodak portra", "luz de Rembrandt"])).toEqual(["grano cálido de los años 70"]);
  });
});

describe("la línea de las referencias", () => {
  it("sólo las genéricas, y con tope sólo las que quepan", () => {
    const lista = ["grano cálido de los años 70", "kodak portra", "editorial de moda audaz", "minimalismo escandinavo"];
    expect(lineaDeAnclas(lista)).toBe("Referencias de estilo de la marca (como ambiente, sin copiar a nadie): grano cálido de los años 70; editorial de moda audaz; minimalismo escandinavo.");
    const corta = lineaDeAnclas(lista, { max: 110 });
    expect(corta.length).toBeLessThanOrEqual(110);
    expect(corta).toContain("grano cálido");
    expect(corta).not.toContain("minimalismo");
    expect(lineaDeAnclas([])).toBe("");
    expect(lineaDeAnclas(["kodak portra"])).toBe("");
  });
});

describe("en el kit", () => {
  it("un kit de antes no cambia: ni la clave ni el bloque de la marca", () => {
    const k = limpiarKit(KIT);
    expect("anclas" in k).toBe(false);
    expect(bloqueDeMarca(KIT)).not.toMatch(/Referencias de estilo/);
    expect(limpiarKit({ ...KIT, anclas: [] })).toEqual(k);
  });

  it("van en el bloque de la marca (todo pedido) cortas, y en la revisión de marca", () => {
    const kit = { ...KIT, anclas: ["película de color cálida y de grano fino, de retrato", "kodak portra", "minimalismo escandinavo", "revista de diseño de interiores", "luz lateral de hora dorada", "catálogo de producto limpio"] };
    const b = bloqueDeMarca(kit);
    expect(b).toMatch(/Referencias de estilo de la marca \(como ambiente, sin copiar a nadie\): película de color cálida/);
    expect(b).not.toMatch(/kodak/i);
    const linea = b.match(/Referencias de estilo[^]*?\.(?= Si lleva texto)/)[0];
    expect(linea.length).toBeLessThanOrEqual(MAX_LINEA_ANCLAS);
    expect(pedidoConMarca({ kit, idea: "un sofá" })).toContain("Referencias de estilo de la marca");
    expect(pedidoDeRevision({ marca: "Dcasa", kit })).toContain("Referencias de estilo de la marca");
  });

  it("un kit con sólo referencias no está vacío", () => {
    expect(kitVacio({ anclas: ["minimalismo escandinavo"] })).toBe(false);
  });

  it("«Preparar con IA» las propone (sin nombres propios) y al fundir se quedan las de antes si no trae", () => {
    expect(pedidoDeKit({ marca: "Dcasa" })).toMatch(/«anclas»: de 2 a 4 REFERENCIAS DE ESTILO[^]*nunca nombres de artistas/);
    expect(pedidoDeKit({ marca: "Dcasa" })).toContain('"anclas":["…"]');
    const leido = leerKit(JSON.stringify({ estilo: "cálido", anclas: ["grano cálido de los años 70", "Kodak Portra 400", "estilo de Peter Lindbergh"] }));
    expect(leido.kit.anclas).toEqual(["grano cálido de los años 70"]);
    const antes = { ...KIT, anclas: ["minimalismo escandinavo"] };
    expect(fundirKit(antes, { estilo: "nuevo" }).anclas).toEqual(["minimalismo escandinavo"]);
    expect(fundirKit(antes, leido.kit).anclas).toEqual(["grano cálido de los años 70"]);
    expect("anclas" in fundirKit(KIT, { estilo: "nuevo" })).toBe(false);
  });
});
