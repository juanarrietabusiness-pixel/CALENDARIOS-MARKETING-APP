import { describe, it, expect } from "vitest";
import { lineaDeReferencia, lineasDeReferencias, productoNombrado, TOMAS, MAX_NOTA } from "./referencias";
import { componerPedido, conOtraEscena, ideaDelPedido } from "./kitMarca";
import { fotosDelProducto } from "./estudio";

describe("qué se toma de cada referencia", () => {
  it("sin elegir nada ni nota, no se dice nada: el modelo hace lo de siempre", () => {
    expect(lineaDeReferencia({}, 1)).toBe("");
    expect(lineaDeReferencia({ toma: [], nota: "  " }, 1)).toBe("");
    expect(lineasDeReferencias([{}, {}])).toBe("");
  });

  it("dice SÓLO lo elegido, y que lo demás (su producto, su texto, sus logos) no se copia", () => {
    const l = lineaDeReferencia({ toma: ["estilo", "composicion"] }, 2);
    expect(l).toBe("Imagen de referencia 2: toma SÓLO su estilo, su luz y sus colores y su composición y su encuadre; lo demás de esa imagen (su producto, su texto, sus logos) no se copia.");
  });

  it("descarta lo que no es una toma y recorta la nota a una línea", () => {
    const l = lineaDeReferencia({ toma: ["fondo", "inventado"], nota: `  me gusta\nla luz.  ${"x".repeat(300)}` }, 1);
    expect(l).toMatch(/toma SÓLO el fondo o el lugar;/);
    expect(l).not.toMatch(/inventado|\n/);
    expect(l.length).toBeLessThan(200 + MAX_NOTA);
    expect(lineaDeReferencia({ nota: "la luz." }, 3)).toBe("Imagen de referencia 3: úsala como referencia. Nota: la luz.");
  });

  it("todas las tomas tienen su frase", () => {
    for (const [id] of TOMAS) expect(lineaDeReferencia({ toma: [id] }, 1)).not.toMatch(/undefined/);
  });

  it("la foto del catálogo es el producto REAL; si es de otra marca, sin el logo del cliente", () => {
    expect(lineaDeReferencia({ producto: { nombre: "Sofá cama" } }, 1, { cliente: "Dcasa" }))
      .toBe("Imagen de referencia 1: es la foto REAL del producto «Sofá cama»: cópialo tal cual (forma, etiqueta, marca y colores), sin inventar otro.");
    expect(lineaDeReferencia({ producto: { nombre: "Crema", marca: "Nivea" }, toma: ["estilo"] }, 1, { cliente: "Farmacia" }))
      .toMatch(/Es de la marca Nivea: respeta su empaque y su logo, y no le pongas el logo de Farmacia\.$/);
  });

  it("numera en el orden en que se mandan, saltándose las mudas", () => {
    const t = lineasDeReferencias([{ producto: { nombre: "Sofá" } }, {}, { toma: ["persona"] }]);
    expect(t.split("\n")).toHaveLength(2);
    expect(t).toMatch(/^Imagen de referencia 1: es la foto REAL/);
    expect(t).toMatch(/\nImagen de referencia 3: toma SÓLO la persona o su pose/);
  });

  it("las fotos del catálogo llegan al compositor con su producto y su marca", () => {
    const f = fotosDelProducto([{ id: "p1", nombre: "Crema", marca: "Nivea", fotos: ["clientes/c1/a.jpg"] }], "p1");
    expect(f[0].producto).toEqual({ nombre: "Crema", marca: "Nivea" });
    expect(lineasDeReferencias(f)).toMatch(/marca Nivea/);
  });
});

describe("el producto que nombra la idea", () => {
  const productos = [
    { id: "p1", nombre: "Sofá", fotos: ["clientes/c1/s.jpg"] },
    { id: "p2", nombre: "Sofá cama", fotos: ["clientes/c1/sc.jpg"] },
    { id: "p3", nombre: "Mesa", fotos: [] },
  ];
  it("lo encuentra sin tildes ni mayúsculas, y el nombre más largo gana", () => {
    expect(productoNombrado(productos, "Un SOFA CAMA abierto en la sala")?.id).toBe("p2");
    expect(productoNombrado(productos, "Un sofá junto a la ventana")?.id).toBe("p1");
  });
  it("nada si no tiene fotos, si no se nombra o si sus fotos ya van", () => {
    expect(productoNombrado(productos, "Una mesa de madera")).toBeNull();
    expect(productoNombrado(productos, "Una taza de café")).toBeNull();
    expect(productoNombrado(productos, "Un sofá cama", ["clientes/c1/sc.jpg"])?.id).toBe("p1");
    expect(productoNombrado([{ id: "x", nombre: "TV", fotos: ["k"] }], "una tv")).toBeNull(); // nombres de menos de 3 letras, no
  });
});

describe("el pedido con las referencias y otra escena", () => {
  it("las líneas de las referencias van detrás de la escena y delante de la marca", () => {
    const p = componerPedido({ idea: "Un sofá", preset: "PRESET", referencias: "Imagen de referencia 1: X", marca: "MARCA" });
    expect(p).toBe("PRESET\n\nEscena: Un sofá\n\nImagen de referencia 1: X\n\nMARCA");
    expect(ideaDelPedido(p)).toBe("Un sofá");
    // Sólo con referencias ya se compone (si no, el modelo no sabría de qué imagen habla).
    expect(componerPedido({ idea: "Un sofá", referencias: "Imagen de referencia 1: X" })).toBe("Escena: Un sofá\n\nImagen de referencia 1: X");
  });

  it("«Otra versión distinta» cambia SÓLO la escena", () => {
    const p = componerPedido({ idea: "Un sofá", preset: "PRESET", referencias: "REFS", marca: "MARCA", logo: true });
    const otra = conOtraEscena(p, "Un sofá visto desde arriba");
    expect(otra).toBe(p.replace("Escena: Un sofá", "Escena: Un sofá visto desde arriba"));
    expect(ideaDelPedido(otra)).toBe("Un sofá visto desde arriba");
    // Al final del pedido también.
    expect(conOtraEscena("PRESET\n\nEscena: Un sofá", "Otra")).toBe("PRESET\n\nEscena: Otra");
    // Un pedido sin componer: la escena nueva es todo.
    expect(conOtraEscena("Un sofá en la sala", "Otra cosa")).toBe("Otra cosa");
  });
});
