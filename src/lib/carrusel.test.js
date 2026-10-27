import { describe, it, expect } from "vitest";
import {
  partirGuion, titularYApoyo, referenciasDeLamina, pedidoDeLamina, coloresPlantilla, textoSobre, partirLineas, costoCarrusel, MAX_LAMINAS,
} from "./carrusel.js";

describe("partir el guion en láminas", () => {
  it("entiende lo que escribe la IA: Portada, Slide N, CTA", () => {
    const l = partirGuion("Portada: 5 errores al lavar tu sofá\nSlide 1: Usar cloro\nmancha y daña la tela\n**Slide 2:** Frotar fuerte\nCTA: Escríbenos y agenda");
    expect(l.map((x) => x.rol)).toEqual(["portada", "contenido", "contenido", "cierre"]);
    expect(l[1].texto).toBe("Usar cloro\nmancha y daña la tela");
    expect(l[2].texto).toBe("Frotar fuerte");
    expect(l.map((x) => x.n)).toEqual([1, 2, 3, 4]);
  });

  it("con «---», numeradas o por párrafos", () => {
    expect(partirGuion("Uno\n---\nDos\n---\nTres").map((x) => x.texto)).toEqual(["Uno", "Dos", "Tres"]);
    expect(partirGuion("1. Primero\n2) Segundo\nsigue\n3- Tercero").map((x) => x.texto)).toEqual(["Primero", "Segundo\nsigue", "Tercero"]);
    expect(partirGuion("Párrafo uno\n\nPárrafo dos").map((x) => x.rol)).toEqual(["portada", "contenido"]);
  });

  it("vacío no da láminas, y hay tope", () => {
    expect(partirGuion("")).toEqual([]);
    expect(partirGuion(Array.from({ length: 15 }, (_, i) => `Lámina ${i + 1}: t${i}`).join("\n"))).toHaveLength(MAX_LAMINAS);
  });

  it("no confunde «Portada» dentro de una frase con una etiqueta", () => {
    expect(partirGuion("La portada debe ser clara\n\nOtra cosa")).toHaveLength(2);
  });
});

describe("el texto de una lámina", () => {
  it("titular y apoyo", () => {
    expect(titularYApoyo("Usar cloro\nmancha y\ndaña la tela")).toEqual({ titular: "Usar cloro", apoyo: "mancha y daña la tela" });
    expect(titularYApoyo("Usar cloro mancha. Y daña la tela para siempre")).toEqual({ titular: "Usar cloro mancha.", apoyo: "Y daña la tela para siempre" });
    expect(titularYApoyo("Sólo un titular")).toEqual({ titular: "Sólo un titular", apoyo: "" });
    expect(titularYApoyo("")).toEqual({ titular: "", apoyo: "" });
  });
});

describe("lo que se pide", () => {
  it("las referencias: la anterior, la portada, las fotos y el logo, sin repetir y con tope", () => {
    // El logo tiene su hueco: antes se caía en cuanto había anterior, portada y una foto.
    expect(referenciasDeLamina({ anterior: "a", portada: "p", fotos: ["f1", "f2"], logo: "l", max: 3 })).toEqual(["a", "p", "l"]);
    expect(referenciasDeLamina({ anterior: "a", fotos: ["f1"], logo: "l", max: 1 })).toEqual(["a"]);
    expect(referenciasDeLamina({ anterior: "p", portada: "p", logo: "l" })).toEqual(["p", "l"]);
    expect(referenciasDeLamina({ fotos: ["f"], max: 0 })).toEqual([]);
  });

  it("con la IA, el texto exacto; con la plantilla, ningún texto y el hueco", () => {
    const lamina = { n: 2, rol: "contenido", texto: "Usar cloro\n«mancha» la tela" };
    const ia = pedidoDeLamina({ lamina, total: 5, idea: "Errores", preset: "ESTILO", conAnteriores: true });
    expect(ia).toContain("Lámina 2 de 5");
    expect(ia).toContain("ESTILO");
    expect(ia).toContain('"Usar cloro" / "mancha la tela"');
    expect(ia).toContain("láminas anteriores");
    const pl = pedidoDeLamina({ lamina: { ...lamina, n: 1, rol: "portada" }, total: 5, modo: "plantilla", plantilla: "arriba", conFotos: true });
    expect(pl).toContain("NO escribas ningún texto");
    expect(pl).toContain("el tercio superior");
    expect(pl).toContain("foto real del producto");
    expect(pl).toContain("Define un estilo");
    expect(pl).not.toContain("logo");
    const conLogo = pedidoDeLamina({ lamina: { ...lamina, n: 1, rol: "portada" }, total: 5, conLogo: true });
    expect(conLogo).toContain("ÚLTIMA imagen de referencia es el logo");
    expect(conLogo).toContain("obligatorio");
  });

  it("el costo es una imagen por lámina", () => {
    expect(costoCarrusel([1, 2, 3], 0.039)).toBe(0.117);
    expect(costoCarrusel([], 0.039)).toBe(0);
  });
});

describe("la plantilla", () => {
  it("colores del kit con contraste", () => {
    expect(textoSobre("#FFFFFF")).toBe("#111111");
    expect(textoSobre("#152473")).toBe("#FFFFFF");
    expect(coloresPlantilla({ paleta: [{ hex: "#152473" }, { hex: "#FFB400" }] })).toEqual({ fondo: "#152473", texto: "#FFFFFF", acento: "#FFB400" });
    expect(coloresPlantilla(null)).toEqual({ fondo: "#111111", texto: "#FFFFFF", acento: "#FFFFFF" });
  });

  it("parte en líneas que caben", () => {
    const medir = (t) => t.length * 10;
    expect(partirLineas("uno dos tres cuatro", 80, medir)).toEqual(["uno dos", "tres", "cuatro"]);
    expect(partirLineas("palabralarguísima", 50, medir)).toEqual(["palabralarguísima"]);
    expect(partirLineas("a b c d e", 10, medir, 2)).toEqual(["a", "b…"]);
  });
});

describe("cada lámina en el pedido", () => {
  it("con la ficha del director, la ficha manda (y el texto exacto de la lámina va dentro aunque se cambiara después)", () => {
    const ficha = "Pieza: lámina 4:5.\nComposición: titular entre el 8 y el 22 % de la altura.\nTexto (exacto): titular «Antes»."; 
    const p = pedidoDeLamina({ lamina: { n: 2, rol: "contenido", texto: "Después", ficha }, total: 4 });
    expect(p).toMatch(/FICHA DE DISEÑO DE ESTA LÁMINA \(síguela\):\nPieza: lámina 4:5\./);
    expect(p).toMatch(/«Después»/);
    expect(p).not.toMatch(/Qué se ve en esta lámina/);
    // En plantilla el modelo no escribe: la línea del texto de la ficha no va.
    const sinTexto = pedidoDeLamina({ lamina: { n: 2, rol: "contenido", texto: "Después", ficha }, total: 4, modo: "plantilla" });
    expect(sinTexto).not.toMatch(/titular «Antes»/);
    expect(sinTexto).toMatch(/NO escribas ningún texto/);
  });

  it("cada lámina lleva qué se ve, su composición, el hilo y quién es cada personaje", () => {
    const p = pedidoDeLamina({ lamina: { n: 2, rol: "contenido", texto: "Hola", escena: "El bebé gatea", composicion: "texto arriba" }, total: 4, hilo: "fondo crema", personajes: "Una de las referencias es «Caleb»." });
    expect(p).toMatch(/Qué se ve en esta lámina: El bebé gatea/);
    expect(p).toMatch(/Composición de esta lámina: texto arriba/);
    expect(p).toMatch(/Lo que comparten TODAS las láminas: fondo crema/);
    expect(p).toMatch(/«Caleb»/);
  });
});
