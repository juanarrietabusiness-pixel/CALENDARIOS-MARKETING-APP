import { describe, it, expect } from "vitest";
import {
  limpiarCuantas, totalDeCuantas, cuantasPorDefecto, pedidoDeIdeasLote, leerIdeasLote, escenaDeAnuncio, textoDeIdea,
  publicacionDeAnuncio, nombreCarpetaLote, plantillaDeFormato, MAX_LOTE, MAX_POR_NIVEL, POR_NIVEL,
} from "./loteAnuncios";
import { pedidoDeLote } from "./loteEstudio";
import { modeloPorId } from "./estudioCatalogo";
import { ideaDelPedido } from "./kitMarca";

describe("cuántas por nivel", () => {
  it("por defecto, cinco en cada uno de los cinco niveles", () => {
    expect(cuantasPorDefecto()).toEqual({ inconsciente: POR_NIVEL, problema: POR_NIVEL, solucion: POR_NIVEL, producto: POR_NIVEL, decision: POR_NIVEL });
    expect(totalDeCuantas(cuantasPorDefecto())).toBe(25);
  });
  it("sólo niveles que existen, de 0 a 10, y el total con tope", () => {
    expect(limpiarCuantas({ inconsciente: 3, inventado: 4, problema: -2, solucion: "x", producto: 99 })).toEqual({ inconsciente: 3, producto: MAX_POR_NIVEL });
    expect(totalDeCuantas({ inconsciente: 10, problema: 10, solucion: 10, producto: 10 })).toBe(MAX_LOTE);
  });
});

describe("lo que se le pide a la IA y cómo se lee", () => {
  it("el pedido dice cuántas por nivel, el producto con su precio y que no invente precios", () => {
    const p = pedidoDeIdeasLote({ marca: "Dcasa", producto: "Sofá cama (producto) · precio: $399", estudio: "ESTUDIO", contexto: "CEREBRO", cuantas: { inconsciente: 2, decision: 1 } });
    expect(p).toMatch(/para Dcasa, para este producto:\nSofá cama \(producto\) · precio: \$399/);
    expect(p).toMatch(/- inconsciente \(Inconsciente: .*el dolor\): 2/);
    expect(p).toMatch(/- decision \(Listo para comprar: .*la ganancia\): 1/);
    expect(p).not.toMatch(/- problema/);
    expect(p).toMatch(/EXACTOS como allí\. No inventes precios/);
    expect(p).toMatch(/ESTUDIO DE MERCADO:\nESTUDIO/);
    expect(p).toMatch(/LO QUE SE SABE DE LA MARCA:\nCEREBRO/);
  });

  it("lee las ideas: como mucho las pedidas por nivel, en el orden de los niveles, sin las vacías", () => {
    const texto = "```json\n" + JSON.stringify({ ideas: [
      { nivel: "decision", titular: "«Llévatelo hoy»", apoyo: "Desde $399", escena: "El sofá cama en una sala" },
      { nivel: "inconsciente", titular: "¿Duermes mal?", apoyo: "", escena: "Una persona cansada" },
      { nivel: "inconsciente", titular: "Tu espalda lo sabe", escena: "Una espalda" },
      { nivel: "inconsciente", titular: "De más", escena: "Sobra" },
      { nivel: "problema", titular: "No pedido", escena: "x" },
      { nivel: "decision", titular: "", escena: "sin titular" },
    ] }) + "\n```";
    const ideas = leerIdeasLote(texto, { inconsciente: 2, decision: 2 });
    expect(ideas.map((i) => [i.id, i.titular])).toEqual([["inconsciente-1", "¿Duermes mal?"], ["inconsciente-2", "Tu espalda lo sabe"], ["decision-1", "Llévatelo hoy"]]);
    expect(ideas[0].elegida).toBe(true);
    expect(leerIdeasLote("nada", { inconsciente: 2 })).toEqual([]);
  });
});

describe("cada pieza", () => {
  const idea = { id: "producto-1", nivel: "producto", titular: "Duerme mejor", apoyo: "Desde $399", escena: "Un sofá cama abierto en un estudio" };

  it("con plantilla, el motor deja el hueco; con «lo escribe la IA», el texto va EXACTO", () => {
    expect(escenaDeAnuncio(idea, { modo: "plantilla" })).toBe("Un sofá cama abierto en un estudio NO escribas ningún texto, letra ni número en la imagen: el texto se pone después. Deja el tercio inferior limpio y despejado, con buen contraste.");
    expect(escenaDeAnuncio(idea, { modo: "plantilla", formato: "historia" })).toMatch(/Deja el centro de la lámina limpio/);
    expect(escenaDeAnuncio(idea, { modo: "ia" })).toMatch(/EXACTO.*"Duerme mejor" \/ "Desde \$399"\. Ningún otro texto\./);
    expect(plantillaDeFormato("historia")).toBe("centro");
    expect(textoDeIdea(idea)).toBe("Duerme mejor\nDesde $399");
  });

  it("el pedido lleva el kit, la foto REAL del producto y el logo si cabe, en la proporción del formato", () => {
    const kit = { paleta: [{ hex: "#112233", nombre: "azul" }], logo: "clientes/c1/logo.png" };
    const fotos = [{ clave: "clientes/c1/sofa.jpg", producto: { nombre: "Sofá cama", marca: "" } }];
    const p = pedidoDeLote({ idea, kit, preset: "anuncio", modo: "plantilla", formato: "historia", modelo: modeloPorId("nano-banana"), fotos, marca: "Dcasa" });
    expect(p.medios.reference).toEqual(["clientes/c1/sofa.jpg", "clientes/c1/logo.png"]);
    expect(p.ajustes.aspectRatio).toBe("9:16");
    expect(p.prompt).toMatch(/^Pieza publicitaria de venta directa para Dcasa/);
    expect(p.prompt).toMatch(/Imagen de referencia 1: es la foto REAL del producto «Sofá cama»/);
    expect(p.prompt).toMatch(/Paleta estrictamente limitada a: azul #112233/);
    expect(ideaDelPedido(p.prompt)).toMatch(/^Un sofá cama abierto en un estudio NO escribas/);
  });

  it("al calendario va como un anuncio pendiente, con su nivel, su producto, el texto y la imagen", () => {
    const post = publicacionDeAnuncio({ id: "p1", idea, archivo: { src: "/api/media/clientes/c1/a.jpg", ancho: 1080, alto: 1350 }, formato: "historia", producto: { id: "sofa", nombre: "Sofá cama" } });
    expect(post).toEqual({
      id: "p1", format: "historia", title: "Duerme mejor", idea: "Un sofá cama abierto en un estudio", textoPieza: "Duerme mejor\nDesde $399",
      pilar: "anuncio", nivel: "producto", productoId: "sofa", producto: "Sofá cama", status: "pending",
      medios: [{ src: "/api/media/clientes/c1/a.jpg", tipo: "imagen", ancho: 1080, alto: 1350 }],
    });
    expect(nombreCarpetaLote("Sofá cama", new Date("2026-10-12T15:00:00Z"))).toBe("Lote Sofá cama · 12 oct");
  });
});
