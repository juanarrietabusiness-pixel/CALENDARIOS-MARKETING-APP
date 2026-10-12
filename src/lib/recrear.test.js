import { describe, it, expect } from "vitest";
import { resumenDelAnalisis, versionDeAdaptacion, pedidoParaElCompositor, TOMA_DE_OTRA_MARCA, NOTA_OTRA_MARCA } from "./recrear";
import { lineasDeReferencias } from "./referencias";

describe("recrear un anuncio", () => {
  it("el análisis en pocas líneas, sin las vacías", () => {
    expect(resumenDelAnalisis({ gancho: "¿Te duele la espalda?", angulo: "", formato: "Foto de producto con fondo plano", porQueFunciona: "  Va al dolor.  " })).toEqual([
      { titulo: "Gancho", texto: "¿Te duele la espalda?" },
      { titulo: "Cómo está hecho", texto: "Foto de producto con fondo plano" },
      { titulo: "Por qué funciona", texto: "Va al dolor." },
    ]);
    expect(resumenDelAnalisis(null)).toEqual([]);
  });

  it("la versión de partida sale de lo que propuso la IA", () => {
    expect(versionDeAdaptacion({ idea: "El sofá cama abierto.", guion: "Fondo arena, luz de tarde.", textoPantalla: "Duerme mejor", descripcion: "Caption #dcasa" }))
      .toEqual({ idea: "El sofá cama abierto. Fondo arena, luz de tarde.", texto: "Duerme mejor", descripcion: "Caption #dcasa" });
    expect(versionDeAdaptacion(null)).toEqual({ idea: "", texto: "", descripcion: "" });
  });

  it("en imagen: las fotos del producto delante, el anuncio sólo por su forma, y el texto exacto", () => {
    const fotos = [{ id: "ext:f", clave: "clientes/c1/sofa.jpg", producto: { nombre: "Sofá cama", marca: "" } }];
    const archivo = { id: "a1", clave: "clientes/c1/anuncio.jpg", tipo: "imagen" };
    const p = pedidoParaElCompositor({ archivo, fotos, version: { idea: "El sofá cama abierto en una sala.", texto: "«Duerme mejor»" } });
    expect(p.tipo).toBe("imagen");
    expect(p.preset).toBe("anuncio");
    expect(p.referencias.map((r) => r.clave)).toEqual(["clientes/c1/sofa.jpg", "clientes/c1/anuncio.jpg"]);
    expect(p.referencias[1]).toMatchObject({ toma: TOMA_DE_OTRA_MARCA, nota: NOTA_OTRA_MARCA });
    expect(p.prompt).toBe('El sofá cama abierto en una sala. Texto en la imagen, exacto y legible: "Duerme mejor".');
    // Lo que el compositor dirá de cada una:
    const lineas = lineasDeReferencias(p.referencias, { cliente: "Dcasa" });
    expect(lineas).toMatch(/Imagen de referencia 1: es la foto REAL del producto «Sofá cama»/);
    expect(lineas).toMatch(/Imagen de referencia 2: toma SÓLO su composición y su encuadre y su estilo, su luz y sus colores; lo demás de esa imagen \(su producto, su texto, sus logos\) no se copia\. Nota: es un anuncio de otra marca/);
  });

  it("en video: el anuncio va como video de referencia y no se le pide texto", () => {
    const archivo = { id: "v1", clave: "clientes/c1/anuncio.mp4", tipo: "video" };
    const p = pedidoParaElCompositor({ archivo, version: { idea: "Abre con el sofá cerrado y se despliega.", texto: "No va" }, video: true });
    expect(p).toMatchObject({ tipo: "video", video: archivo, proporcion: "9:16", preset: "anuncio" });
    expect(p.prompt).toMatch(/^Sigue los planos, el ritmo y el movimiento del video de referencia/);
    expect(p.prompt).toMatch(/Abre con el sofá cerrado/);
    expect(p.prompt).not.toMatch(/No va/);
    expect(p.referencias).toBeUndefined();
  });
});
