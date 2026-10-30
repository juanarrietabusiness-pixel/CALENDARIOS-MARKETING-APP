import { describe, it, expect } from "vitest";
import {
  tramosDeProducto, duracionesDe, palabrasQueCaben, locucionQueCabeEn, pedidoDeVideoProducto, leerVideoProducto,
  escenaDelInicio, escenaDelCierre, promptDeVideoProducto, sirveParaProducto, sinVozEnProducto, MAX_PROMPT_VIDEO_PRODUCTO,
} from "./videoProducto";
import { modelosParaProducto, modeloParaProducto, pedidoDeFotograma, pedidoDeVideoProducto as pedidoDelVideo, fotosParaFotograma } from "./videoProductoEstudio";
import { modeloPorId, MODELOS } from "./estudioCatalogo";
import { LINEA_LOGO } from "./kitMarca";

// ============================================================
// La receta «Video del producto»: termina en la foto REAL del producto y el logo REAL porque no los dibuja el
// modelo de video (salen de una imagen de cierre hecha antes), y la voz va escrita en español.
// ============================================================

const RESPUESTA = JSON.stringify({
  inicio: "Un bebé gatea y se escapa de su mamá en una sala luminosa",
  inicioConProducto: false,
  tramos: [
    { clave: "gancho", accion: "El bebé se escapa riendo" },
    { clave: "uso", accion: "La mamá le sube el pañal pants como un calzoncito" },
    { clave: "cierre", accion: "Transición suave a la caja sobre la superficie beige" },
  ],
  camara: "acercamiento lento",
  locucion: "¿Tu bebé ya no se deja cambiar? Nateen pants se sube como calzoncito. Caja para todo el mes.",
  musica: "alegre y suave",
  descripcion: "Escríbenos por WhatsApp #bebe",
});

describe("los tiempos", () => {
  it("tres tramos contiguos que terminan en la duración, con el cierre al final", () => {
    for (const s of [10, 12, 15]) {
      const t = tramosDeProducto(s);
      expect(t.map((x) => x.clave)).toEqual(["gancho", "uso", "cierre"]);
      expect(t[0].desde).toBe(0);
      expect(t[1].desde).toBe(t[0].hasta);
      expect(t[2].desde).toBe(t[1].hasta);
      expect(t[2].hasta).toBe(s);
      expect(t[1].hasta).toBeGreaterThan(t[1].desde);
    }
    expect(tramosDeProducto(10).map((x) => [x.desde, x.hasta])).toEqual([[0, 3], [3, 7], [7, 10]]);
  });

  it("la duración la pone el modelo: MiniMax H3 hace 10, 12 y 15; Veo, sólo 8", () => {
    expect(duracionesDe(modeloPorId("minimax-h3-kie"))).toEqual([10, 12, 15]);
    expect(duracionesDe(modeloPorId("veo-3-1-lite-kie"))).toEqual([8]);
  });

  it("la voz cabe a 2,5 palabras por segundo y lo que sobra se corta sin partir palabras", () => {
    expect(palabrasQueCaben(10)).toBe(25);
    const largo = Array.from({ length: 40 }, (_, i) => `p${i}`).join(" ");
    expect(locucionQueCabeEn(largo, 10).split(" ")).toHaveLength(25);
    expect(locucionQueCabeEn("corta y buena", 10)).toBe("corta y buena");
  });
});

describe("el guion", () => {
  it("el pedido lleva el producto con su precio, la duración, la voz en español y que se describa el movimiento", () => {
    const p = pedidoDeVideoProducto({ marca: "Baby Caleb", segundos: 10, producto: "Pañales Nateen pants · precio: $55.00", idea: "No se deja cambiar" });
    expect(p).toContain("$55.00");
    expect(p).toContain("10 segundos");
    expect(p).toMatch(/español latino neutro/);
    expect(p).toMatch(/MOVIMIENTO/);
    expect(p).toMatch(/25 palabras como mucho/);
    expect(p).toContain("No se deja cambiar");
  });

  it("se lee la respuesta, y una sin primer fotograma o sin tramos no vale", () => {
    const g = leerVideoProducto(RESPUESTA, 10);
    expect(g.segundos).toBe(10);
    expect(g.tramos[1].accion).toMatch(/calzoncito/);
    expect(g.inicioConProducto).toBe(false);
    expect(leerVideoProducto("no es json", 10)).toBeNull();
    expect(leerVideoProducto(JSON.stringify({ tramos: [{ clave: "gancho", accion: "x" }] }), 10)).toBeNull();
  });
});

describe("los dos fotogramas y el video", () => {
  const guion = leerVideoProducto(RESPUESTA, 10);
  const kit = { paleta: [{ hex: "#91C9A2", nombre: "sage" }], logo: "clientes/c1/logo.png" };
  const productos = [{ id: "pants", nombre: "Pañales Nateen pants", marca: "", fotos: ["clientes/c1/pants-1.jpg", "clientes/c1/pants-2.jpg"] }];
  const producto = productos[0];
  const modelo = modeloPorId("nano-banana-2");

  it("el primer fotograma va SIN logo (lo arrastraría el video) y sin el producto si la escena no lo enseña", () => {
    const p = pedidoDeFotograma({ cual: "inicio", guion, kit, modelo, producto, productos });
    expect(p.medios.reference ?? []).not.toContain("clientes/c1/logo.png");
    expect(p.medios.reference ?? []).toEqual([]);
    expect(p.prompt).not.toContain(LINEA_LOGO);
    expect(p.prompt).toMatch(/No dibujes ni inventes ningún logo/);
    expect(p.prompt).toContain("Primer fotograma");
    expect(p.ajustes.aspectRatio).toBe("9:16");
  });

  it("si la escena enseña el producto, el primer fotograma lleva sus fotos (y sigue sin logo)", () => {
    const p = pedidoDeFotograma({ cual: "inicio", guion: { ...guion, inicioConProducto: true }, kit, modelo, producto, productos });
    expect(p.medios.reference).toEqual(["clientes/c1/pants-1.jpg", "clientes/c1/pants-2.jpg"]);
  });

  it("el cierre lleva las fotos reales del producto y el logo del kit, el ÚLTIMO", () => {
    const p = pedidoDeFotograma({ cual: "cierre", guion, kit, modelo, producto, productos });
    expect(p.medios.reference.at(-1)).toBe("clientes/c1/logo.png");
    expect(p.medios.reference.slice(0, -1)).toEqual(["clientes/c1/pants-1.jpg", "clientes/c1/pants-2.jpg"]);
    expect(p.prompt).toContain(LINEA_LOGO);
    expect(p.prompt).toMatch(/foto REAL del producto «Pañales Nateen pants»/);
    expect(p.prompt).toContain("Último fotograma");
  });

  it("con un modelo de pocas referencias, las fotos dejan sitio al logo", () => {
    const tres = modeloPorId("nano-banana"); // 3 referencias
    expect(fotosParaFotograma([{ ...producto, fotos: ["a", "b", "c", "d"].map((x) => `clientes/c1/${x}.jpg`) }], "pants", tres, { conLogo: true })).toHaveLength(2);
  });

  it("sin logo en el kit, el cierre no lo pide", () => {
    const p = pedidoDeFotograma({ cual: "cierre", guion, kit: { ...kit, logo: "" }, modelo, producto, productos });
    expect(p.prompt).not.toContain(LINEA_LOGO);
    expect(escenaDelCierre({ producto: "X", conLogo: false })).not.toMatch(/logo de la marca/);
  });

  it("el video arranca en el primero y TERMINA en el cierre, con la voz escrita en español y corto", () => {
    const h3 = modeloPorId("minimax-h3-kie");
    const v = pedidoDelVideo({ modelo: h3, guion, inicio: { clave: "clientes/c1/ini.png" }, cierre: { clave: "clientes/c1/fin.png" } });
    expect(v.medios).toEqual({ start: ["clientes/c1/ini.png"], end: ["clientes/c1/fin.png"] });
    expect(v.ajustes.duration).toBe("10");
    expect(v.ajustes.aspectRatio).toBe("9:16");
    expect(v.prompt).toContain(`dice exactamente: «${guion.locucion}»`);
    expect(v.prompt).toContain("3–7 s: La mamá le sube el pañal pants como un calzoncito.");
    expect(v.prompt).toMatch(/termina exactamente en la imagen final/);
    expect(v.prompt).toMatch(/Sin texto ni subtítulos/);
    expect(v.prompt.length).toBeLessThanOrEqual(MAX_PROMPT_VIDEO_PRODUCTO);
  });

  it("Seedance y Wan se inventan la voz: van sin locución", () => {
    expect(sinVozEnProducto(modeloPorId("seedance-2-5-kie"))).toBe(true);
    expect(promptDeVideoProducto(guion, { conVoz: false })).toMatch(/Sin voz ni diálogo/);
    expect(promptDeVideoProducto(guion, { conVoz: false })).not.toContain("«");
  });

  it("la escena del primer fotograma no pide texto", () => {
    expect(escenaDelInicio(guion)).toMatch(/sin collage ni texto/);
  });
});

describe("qué modelo de video", () => {
  it("sólo los que hacen imagen inicial Y final, y se empieza por MiniMax H3 si hay llave de Kie", () => {
    const lista = modelosParaProducto({ kie: true });
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every(sirveParaProducto)).toBe(true);
    expect(modeloParaProducto({ kie: true }).id).toBe("minimax-h3-kie");
  });

  it("sin ninguna llave, el de prueba (gratis), para probar el recorrido", () => {
    expect(modeloParaProducto({}).motor).toBe("prueba");
  });

  it("todo modelo del catálogo que sirve tiene al menos una duración de la receta, o no sale", () => {
    for (const m of MODELOS.filter(sirveParaProducto)) {
      const enLista = modelosParaProducto({ [m.motor]: true }).some((x) => x.id === m.id);
      expect(enLista, m.id).toBe(duracionesDe(m).length > 0);
    }
  });
});
