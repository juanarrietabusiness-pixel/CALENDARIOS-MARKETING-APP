import { describe, it, expect } from "vitest";
import { leerGuionCorto, pedidoDeGuionCorto } from "./videoCorto.js";
import { leerVideoProducto } from "./videoProducto.js";
import { leerAdaptacion } from "./estudioMercado.js";

// Los hashtags van SIEMPRE aparte (lib/reglasFormato.js): estos pedidos los pedían «al final del caption» y al publicar
// salían dos veces (textoPara los junta con `hashtagsFinales`).
describe("los hashtags de los guiones de video y del estudio de mercado, aparte", () => {
  const tramos = [{ clave: "gancho", accion: "Abre el sofá" }, { clave: "uso", accion: "Se acuesta" }, { clave: "cierre", accion: "Sonríe" }];

  it("el guion corto: el caption sin hashtags y los que se colaron, en su campo", () => {
    const g = leerGuionCorto(JSON.stringify({ escena: "Sala", tramos, descripcion: "Duerme mejor hoy.\n\n#sofa #panama", hashtags: "#Sofa #hogar" }), 8);
    expect(g.descripcion).toBe("Duerme mejor hoy.");
    expect(g.hashtags).toBe("#Sofa #hogar #panama");
  });

  it("el pedido ya no pide hashtags al final del caption", () => {
    const p = pedidoDeGuionCorto({ marca: "Dcasa", idea: "Sofá cama", segundos: 8 });
    expect(p).not.toMatch(/hashtags al final/);
    expect(p).toMatch(/"hashtags"/);
  });

  it("el video del producto y la adaptación de una referencia, igual", () => {
    const v = leerVideoProducto(JSON.stringify({ inicio: "Una sala", tramos, descripcion: "Ven hoy #dcasa", hashtags: "" }), 10);
    expect(v.descripcion).toBe("Ven hoy");
    expect(v.hashtags).toBe("#dcasa");
    const a = leerAdaptacion(JSON.stringify({ idea: "x", guion: "y", descripcion: "Compra ya\n#uno #dos", hashtags: "#tres" }));
    expect(a.descripcion).toBe("Compra ya");
    expect(a.hashtags).toBe("#tres #uno #dos");
  });
});
