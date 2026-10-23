import { describe, it, expect } from "vitest";
import { consultaDelPlan, materialDelPlan, conEducativo, claveDeTipo, lineaDeLoQueFalta, avisoDeLoQueFalta, pedidoDeRubro, leerRubro } from "./materialTipo.js";

describe("qué busca el cerebro según el tipo", () => {
  it("la consulta junta las palabras de los tipos de la tanda, sin repetir", () => {
    const q = consultaDelPlan([{ tipo: "educativo" }, { pilar: "maletas", pilarSub: "testimonio" }, { tipo: "educativo" }], { producto: "Sofá cama" });
    expect(q).toMatch(/^sofá cama consejos/);
    expect(q).toContain("testimonios");
    expect(q.split(" ").filter((p) => p === "consejos")).toHaveLength(1);
    expect(consultaDelPlan([])).toBe("beneficios objeciones público contenido");
  });
  it("cada tipo dice qué material necesita; los alias viejos cuentan como el de hoy", () => {
    expect(claveDeTipo({ pilar: "maletas", pilarSub: "garantia" })).toBe("maletas:garantia");
    expect(materialDelPlan([{ tipo: "maletas", pilarSub: "testimonio" }, { tipo: "humano" }, { tipo: "anuncio" }])).toEqual(["testimonios", "equipo"]);
    expect(materialDelPlan([{ tipo: "viral" }])).toEqual(["equipo"]);
    expect(conEducativo([{ pilar: "educativo" }])).toBe(true);
  });
  it("lo que falta: una línea para la IA y un aviso para la persona", () => {
    expect(lineaDeLoQueFalta([])).toBe("");
    expect(lineaDeLoQueFalta(["garantia"])).toMatch(/no lo inventes.*la garantía/);
    expect(avisoDeLoQueFalta(["rubro"])).toMatch(/«Saber del rubro»/);
  });
});

describe("«Saber del rubro»", () => {
  it("el pedido trae la forma, la nota de ahora y lo que se sabe de la marca; sin precios", () => {
    const p = pedidoDeRubro({ marca: "Dcasa", rubro: "Muebles", contexto: "Vende sofás", actual: "## Viejo", conWeb: true });
    expect(p).toMatch(/Dcasa \(Muebles\)/);
    expect(p).toMatch(/## Errores comunes/);
    expect(p).toMatch(/nada de precios/);
    expect(p).toContain("## Viejo");
    expect(p).toMatch(/búsqueda en internet: úsala/);
  });
  it("se lee sin la introducción ni los ```", () => {
    expect(leerRubro("Claro, aquí está:\n```\n## Consejos\n- Uno\n```")).toBe("## Consejos\n- Uno");
  });
});
