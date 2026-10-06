import { describe, it, expect } from "vitest";
import {
  ideaDelPedido, limpiarKit, kitVacio, textoPaleta, textoPreset, componerPedido, ponerLogo, pedidoDeKit, leerKit, fundirKit,
  pedidoDeRevision, leerRevision, TIPOS_PRESET, LINEA_VIDEO,
} from "./kitMarca";

const KIT = {
  paleta: [{ hex: "#152473", nombre: "azul marino", rol: "dominante" }, { hex: "#ffb400", nombre: "amarillo", rol: "solo acento" }, { hex: "rojo" }],
  tipografia: "Anton y Barlow",
  estilo: "industrial, sólido y confiable",
  luz: "fuerte y directa",
  evitar: "Sin elementos recargados",
  logo: "clientes/c1/logo.png",
};

describe("el kit", () => {
  it("se limpia: colores sin hex fuera, hex en mayúsculas, logo sólo de clientes/", () => {
    const k = limpiarKit(KIT);
    expect(k.paleta.map((c) => c.hex)).toEqual(["#152473", "#FFB400"]);
    expect(k.logo).toBe("clientes/c1/logo.png");
    expect(limpiarKit({ logo: "../../secreto" }).logo).toBe("");
    expect(limpiarKit({ logo: "https://otro.com/a.png" }).logo).toBe("");
    expect(kitVacio(null)).toBe(true);
    expect(kitVacio(KIT)).toBe(false);
  });

  it("la paleta se escribe con su papel", () => {
    expect(textoPaleta(limpiarKit(KIT).paleta)).toBe("azul marino #152473 (dominante), amarillo #FFB400 (solo acento)");
  });
});

describe("los presets", () => {
  it("sin preset escrito, la plantilla del tipo con el kit", () => {
    const t = textoPreset(KIT, "producto", { marca: "Rofer Service", rubro: "maquinaria pesada" });
    expect(t).toMatch(/^Fotografía publicitaria de producto para Rofer Service \(maquinaria pesada\)/);
    expect(t).toContain("Paleta estrictamente limitada a: azul marino #152473 (dominante), amarillo #FFB400 (solo acento).");
    expect(t).toContain("Tipografía únicamente Anton y Barlow.");
    expect(t).toContain("Sin colores fuera de la paleta.");
    expect(t).toContain("Sin texto inventado ni logos de otras marcas.");
  });

  it("el escrito (por la IA o a mano) manda", () => {
    expect(textoPreset({ ...KIT, presets: { anuncio: "Mi preset de anuncio." } }, "anuncio")).toBe("Mi preset de anuncio.");
  });

  it("hay cuatro tipos", () => {
    expect(Object.keys(TIPOS_PRESET)).toEqual(["producto", "anuncio", "corporativo", "creativo"]);
  });
});

describe("el pedido", () => {
  it("preset + escena, y en video el movimiento; sin preset, la idea tal cual", () => {
    expect(componerPedido({ idea: "Una excavadora al atardecer", preset: "PRESET." })).toBe("PRESET.\n\nEscena: Una excavadora al atardecer");
    expect(componerPedido({ idea: "x", preset: "P.", video: true })).toBe(`P.\n\nEscena: x\n\n${LINEA_VIDEO}`);
    expect(componerPedido({ idea: " sola " })).toBe("sola");
  });

  it("de un pedido compuesto se recupera la escena", () => {
    expect(ideaDelPedido(componerPedido({ idea: "Una excavadora", preset: "P.", video: true }))).toBe("Una excavadora");
    expect(ideaDelPedido("una idea suelta")).toBe("una idea suelta");
  });

  it("el logo va de referencia sólo en imágenes con hueco", () => {
    const m = { referencias: 3 };
    expect(ponerLogo({ kit: KIT, tipo: "imagen", modelo: m, referencias: [] })).toBe(true);
    expect(ponerLogo({ kit: KIT, tipo: "video", modelo: m, referencias: [] })).toBe(false);
    expect(ponerLogo({ kit: KIT, tipo: "imagen", modelo: { referencias: 0 }, referencias: [] })).toBe(false);
    expect(ponerLogo({ kit: KIT, tipo: "imagen", modelo: { referencias: 1 }, referencias: ["clientes/c1/x.png"] })).toBe(false);
    expect(ponerLogo({ kit: KIT, tipo: "imagen", modelo: m, referencias: ["clientes/c1/logo.png"] })).toBe(false);
    expect(ponerLogo({ kit: { ...KIT, logo: "" }, tipo: "imagen", modelo: m })).toBe(false);
  });
});

describe("la IA", () => {
  it("el pedido del kit lleva lo que sabemos y los ejemplos de la agencia", () => {
    const p = pedidoDeKit({ marca: "Baby Caleb", rubro: "bebés", guia: "Colores: azul #1B3246", ficha: "Marca orgánica" });
    expect(p).toContain("Baby Caleb (bebés)");
    expect(p).toContain("azul #1B3246");
    expect(p).toContain("no inventes colores");
    expect(p).toMatch(/Ejemplo 2 \(maquinaria pesada\)/);
  });

  it("lee el kit sin tocar el logo, y al fundir conserva el que había", () => {
    const r = leerKit('Listo: {"paleta":[{"hex":"#1b3246","rol":"estructura"}],"tipografia":"Montserrat","presets":{"producto":"P"},"logo":"clientes/x/y.png","dudas":"ninguna"}');
    expect(r.kit.paleta[0].hex).toBe("#1B3246");
    expect(r.kit.logo).toBe("");
    expect(r.dudas).toBe("ninguna");
    const f = fundirKit({ logo: "clientes/c1/logo.png" }, r.kit, "2026-10-06T00:00:00Z");
    expect(f).toMatchObject({ logo: "clientes/c1/logo.png", tipografia: "Montserrat", preparadoAt: "2026-10-06T00:00:00Z" });
    expect(leerKit("nada")).toBeNull();
  });

  it("la revisión: el pedido lleva el kit y se lee el puntaje entre 0 y 10", () => {
    const p = pedidoDeRevision({ marca: "Rofer", kit: KIT, prompt: "Excavadora" });
    expect(p).toContain("azul marino #152473 (dominante)");
    expect(p).toContain("Lo que se pidió: Excavadora");
    expect(leerRevision('{"puntaje":14,"cumple":["paleta"],"falla":["texto inventado"],"sugerencia":"sin texto"}'))
      .toEqual({ puntaje: 10, cumple: ["paleta"], falla: ["texto inventado"], sugerencia: "sin texto" });
    expect(leerRevision("no")).toBeNull();
  });
});
