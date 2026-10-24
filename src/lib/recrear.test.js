import { describe, it, expect } from "vitest";
import { SIN_TEXTO_VIDEO } from "./videoLimpio.js";
import { modeloPorId } from "./estudioCatalogo";
import { motorParaRecrear, duracionAdmitida } from "./motorRecrear";
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

  it("en video, «mismo»: edita el video original, con las fotos del producto (5 como mucho), limpio y sin voz", () => {
    const archivo = { id: "v1", clave: "clientes/c1/anuncio.mp4", tipo: "video" };
    const fotos = Array.from({ length: 7 }, (_, i) => ({ id: `f${i}`, clave: `clientes/c1/f${i}.jpg` }));
    const modelo = modeloPorId("gemini-omni-kie");
    const p = pedidoParaElCompositor({ archivo, fotos, version: { idea: "Cambia su sofá por el nuestro.", texto: "No va" }, video: true, modo: "mismo", modelo, segundos: 10 });
    expect(p).toMatchObject({ tipo: "video", video: archivo, modelo: "gemini-omni-kie", proporcion: "9:16", ajustes: { duration: "10", sonido: "si" } });
    expect(p.referencias).toHaveLength(5);
    expect(p.prompt).toMatch(/^Edita el video de referencia: conserva su escenario/);
    expect(p.prompt).toMatch(/Cambia su sofá por el nuestro/);
    expect(p.prompt).toMatch(/producto REAL/);
    expect(p.prompt).toMatch(/Sin voz ni diálogo/);
    expect(p.prompt).toContain(SIN_TEXTO_VIDEO);
    expect(p.prompt).not.toMatch(/No va/);
  });

  it("en video, «version»: un video nuevo sin el original, con las fotos del producto", () => {
    const archivo = { id: "v1", clave: "clientes/c1/anuncio.mp4", tipo: "video" };
    const p = pedidoParaElCompositor({ archivo, fotos: [{ id: "f", clave: "clientes/c1/f.jpg" }], version: { idea: "0–3 s: …" }, video: true, modo: "version", modelo: modeloPorId("seedance-2-5-kie"), segundos: 20 });
    expect(p.video).toBeUndefined();
    expect(p.referencias).toHaveLength(1);
    expect(p).toMatchObject({ modelo: "seedance-2-5-kie", ajustes: { duration: "20", sonido: "si" } });
  });

  it("el motor lo propone una regla entre los que tienen llave, con su porqué", () => {
    // Sin Kie no hay nada que sirva: nunca propone un modelo sin llave.
    expect(motorParaRecrear({ higgsfield: false }, { modo: "mismo" })).toBeNull();
    const mismo = motorParaRecrear({ kie: true }, { modo: "mismo", segundos: 25 });
    expect(mismo.modelo.id).toBe("gemini-omni-kie");
    expect(mismo.segundos).toBe(10);
    expect(mismo.porque).toMatch(/conserva el escenario/);
    const largo = motorParaRecrear({ kie: true }, { modo: "version", segundos: 22 });
    expect(largo.modelo.id).toBe("seedance-2-5-kie");
    expect(largo.segundos).toBe(30);
    expect(duracionAdmitida(modeloPorId("seedance-2-5-kie"), 13)).toBe(15);
  });
});
