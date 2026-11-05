import { describe, it, expect } from "vitest";
import { partesDelPedido, conMarcaDeHoy } from "./marcaDeHoy";
import { pedidoConMarca, LINEA_LOGO, LINEA_OFICIO, PREFIJO_TIPO } from "./kitMarca";
import { MAX_PROMPT, modeloPorId } from "./estudioCatalogo";

const kitViejo = { logo: "clientes/c1/logo-viejo.png", paleta: [{ hex: "#FF0000", nombre: "Rojo", rol: "dominante" }], reglas: ["el logo siempre abajo"] };
const kitHoy = { logo: "clientes/c1/logo-nuevo.png", paleta: [{ hex: "#123456", nombre: "Azul", rol: "dominante" }], reglas: ["el titular nunca en mayúsculas"] };
const viejo = pedidoConMarca({ kit: kitViejo, idea: "Un sofá cama en una sala luminosa.", preset: "anuncio", marca: "Dcasa", logo: true, referencias: "Imagen de referencia 1: es la foto REAL del producto «Sofá»: cópialo tal cual." });
const modelo = modeloPorId("nano-banana");

describe("un pedido de antes con la marca de HOY", () => {
  it("parte el pedido: la escena, el tipo, las referencias; reconoce que llevaba logo", () => {
    const p = partesDelPedido(viejo);
    expect(p.compuesto).toBe(true);
    expect(p.escena).toBe("Un sofá cama en una sala luminosa.");
    expect(p.tipo.startsWith(PREFIJO_TIPO)).toBe(true);
    expect(p.referencias).toContain("Imagen de referencia 1");
    expect(p.conLogo).toBe(true);
    expect(p.otros.join(" ")).not.toContain("#FF0000");
  });

  it("cambia el bloque de la marca y el logo por los del kit de hoy; el tipo, las referencias y la escena se quedan", () => {
    const r = conMarcaDeHoy({ prompt: viejo, kit: kitHoy, modelo, claves: ["clientes/c1/p/sofa.png", "clientes/c1/logo-viejo.png"] });
    expect(r.prompt).toContain("Escena: Un sofá cama en una sala luminosa.");
    expect(r.prompt).toContain("#123456");
    expect(r.prompt).toContain("el titular nunca en mayúsculas");
    expect(r.prompt).not.toContain("#FF0000");
    expect(r.prompt).not.toContain("el logo siempre abajo");
    expect(r.prompt).toContain(LINEA_LOGO);
    expect(r.prompt).toContain(LINEA_OFICIO);
    expect(r.prompt).toContain("Imagen de referencia 1");
    expect(r.reference).toEqual(["clientes/c1/p/sofa.png", "clientes/c1/logo-nuevo.png"]);
  });

  it("con otra escena, sólo cambia la escena", () => {
    const r = conMarcaDeHoy({ prompt: viejo, escena: "El sofá en un balcón.", kit: kitHoy, modelo, claves: ["clientes/c1/p/sofa.png", "clientes/c1/logo-viejo.png"] });
    expect(r.prompt.startsWith("Escena: El sofá en un balcón.")).toBe(true);
    expect(r.prompt).not.toContain("sala luminosa");
  });

  it("con el logo ESTAMPADO hoy, el modelo no lo recibe y se le dice que no dibuje ninguno", () => {
    const r = conMarcaDeHoy({ prompt: viejo, kit: { ...kitHoy, logoModo: "estampado" }, modelo, claves: ["clientes/c1/p/sofa.png", "clientes/c1/logo-viejo.png"] });
    expect(r.reference).toEqual(["clientes/c1/p/sofa.png"]);
    expect(r.prompt).not.toContain(LINEA_LOGO);
    expect(r.prompt).toMatch(/Sin logo en la imagen/);
  });

  it("si no cabe se acorta la ESCENA (lo prescindible de la ficha), nunca el final: la marca y el logo llegan enteros", () => {
    const ficha = `Pieza: post 4:5.\nComposición: el sofá al centro.\nTexto (exacto): titular «Desde 399 $».\nFondo: ${"madera ".repeat(700)}clara.`;
    const r = conMarcaDeHoy({ prompt: viejo, escena: ficha, kit: kitHoy, modelo, claves: ["clientes/c1/p/sofa.png", "clientes/c1/logo-viejo.png"] });
    expect(r.prompt.length).toBeLessThanOrEqual(MAX_PROMPT);
    expect(r.prompt).toContain("titular «Desde 399 $»");
    expect(r.prompt).not.toContain("Fondo: madera");
    expect(r.prompt.endsWith(LINEA_LOGO)).toBe(true);
  });

  it("con un modelo de menos referencias, van las que caben (y sus líneas), dejando sitio al logo", () => {
    const muse = { ...modelo, referencias: 2 };
    const conDos = pedidoConMarca({ kit: kitViejo, idea: "x", marca: "Dcasa", logo: true, referencias: "Imagen de referencia 1: toma SÓLO el estilo.\nImagen de referencia 2: toma SÓLO la composición." });
    const r = conMarcaDeHoy({ prompt: conDos, kit: kitHoy, modelo: muse, claves: ["clientes/c1/a.png", "clientes/c1/b.png", "clientes/c1/logo-viejo.png"] });
    expect(r.reference).toEqual(["clientes/c1/a.png", "clientes/c1/logo-nuevo.png"]);
    expect(r.prompt).toContain("Imagen de referencia 1");
    expect(r.prompt).not.toContain("Imagen de referencia 2");
  });

  it("un pedido sin kit ni composición se queda como estaba", () => {
    expect(conMarcaDeHoy({ prompt: "Una taza en una mesa.", kit: {}, claves: ["clientes/c1/a.png"] })).toEqual({ prompt: "Una taza en una mesa.", reference: ["clientes/c1/a.png"] });
  });
});
