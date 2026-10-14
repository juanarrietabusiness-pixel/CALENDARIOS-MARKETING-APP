import { describe, it, expect } from "vitest";
import { ideaParaMejorar, ideaSinMejorar, apoyosDePieza, pedidoDePieza, conAltaResolucion, lineaDeTexto, lineaSinTexto } from "./pieza";
import { modeloPorId } from "./estudioCatalogo";
import { ESTILOS_VISUALES } from "./kitMarca";

const kit = { paleta: [{ hex: "#112233", nombre: "azul" }], logo: "clientes/c1/logo.png", referencias: { anuncio: ["clientes/c1/ref-tipo.png"] } };
const archivos = [{ id: "a1", clave: "clientes/c1/ref-tipo.png", src: "/api/media/clientes/c1/ref-tipo.png" }];
const foto = (n) => ({ clave: `clientes/c1/foto-${n}.jpg`, producto: { nombre: "Sofá", marca: "" } });

describe("una pieza, por el mismo camino", () => {
  it("la idea que se mejora: escena, composición sugerida, producto que no sale, texto exacto y contexto, en ese orden", () => {
    const m = ideaParaMejorar({ escena: "Una sala", composicion: "Composición: plano medio.", texto: "Duerme mejor\nDesde $399", contexto: "Brief", conProducto: false });
    expect(m.split("\n\n")).toEqual([
      "Una sala", "Composición sugerida: plano medio.", "El producto NO aparece en esta imagen: se habla del problema.",
      'Texto en la imagen, exacto, legible y bien jerarquizado (lo primero grande): "Duerme mejor" / "Desde $399".', "Contexto de la publicación: Brief",
    ]);
    expect(ideaSinMejorar({ escena: "Una sala", contexto: "Brief" })).toBe("Una sala");
    expect(lineaDeTexto("")).toBe("");
    expect(lineaSinTexto("el centro")).toMatch(/Deja el centro limpio/);
  });

  it("las referencias: producto primero, lo puesto a mano, la del tipo, los «Me gusta»; sin repetir y dejando sitio al logo", () => {
    const modelo = modeloPorId("nano-banana"); // 3 referencias: 2 + el logo
    const a = apoyosDePieza({ kit, preset: "anuncio", archivos, fotos: [foto(1)], manuales: [{ clave: "clientes/c1/mano.png" }], modelo });
    expect(a.map((x) => x.clave)).toEqual(["clientes/c1/foto-1.jpg", "clientes/c1/mano.png"]);
    const grande = modeloPorId("nano-banana-2");
    const b = apoyosDePieza({ kit, preset: "anuncio", archivos, fotos: [foto(1), foto(1)], gustos: [{ clave: "clientes/c1/gusta.png", toma: ["estilo"] }], modelo: grande, tomaTipo: ["estilo"] });
    expect(b.map((x) => x.clave)).toEqual(["clientes/c1/foto-1.jpg", "clientes/c1/ref-tipo.png", "clientes/c1/gusta.png"]);
    expect(b[1].toma).toEqual(["estilo"]);
    // Si el producto no sale, sus fotos no van.
    expect(apoyosDePieza({ kit, preset: "anuncio", archivos, fotos: [foto(1)], modelo: grande, conProducto: false }).map((x) => x.clave)).toEqual(["clientes/c1/ref-tipo.png"]);
  });

  it("el pedido: la escena, el estilo del tipo con su acabado, las referencias con lo que se toma, el logo el último y en 2K", () => {
    const modelo = modeloPorId("nano-banana-2");
    const p = pedidoDePieza({ kit, idea: "Una sala luminosa", extra: "Composición: En uso.", preset: "anuncio", apoyos: [foto(1)], modelo, marca: "Dcasa", aspectRatio: "4:5" });
    expect(p.medios.reference).toEqual(["clientes/c1/foto-1.jpg", "clientes/c1/logo.png"]);
    expect(p.prompt).toMatch(/^Escena: Una sala luminosa Composición: En uso\./);
    expect(p.prompt).toContain(ESTILOS_VISUALES.fotografico.linea);
    expect(p.ajustes).toMatchObject({ aspectRatio: "4:5", imageSize: "2K" });
    // A mano la resolución la escoge la persona; un modelo sin tamaño no cambia.
    expect(pedidoDePieza({ kit, idea: "x", modelo, altaResolucion: false, ajustes: { imageSize: "1K" } }).ajustes.imageSize).toBe("1K");
    expect(conAltaResolucion(modeloPorId("nano-banana"), { aspectRatio: "1:1" })).toEqual({ aspectRatio: "1:1" });
    expect(conAltaResolucion(modelo, { imageSize: "4K" }).imageSize).toBe("4K");
    // Sin kit encendido: ni la marca ni el logo.
    const sin = pedidoDePieza({ kit, idea: "x", modelo, usarKit: false });
    expect(sin.prompt).not.toMatch(/Identidad de la marca/);
    expect(sin.medios).toEqual({});
  });
});
