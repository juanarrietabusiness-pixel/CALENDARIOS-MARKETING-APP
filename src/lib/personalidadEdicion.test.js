import { describe, it, expect } from "vitest";
import { PERSONALIDADES, IDS_PERSONALIDAD, personalidadDeTexto, combinacionesDe, variantesPorPersonalidad, personalidadesEnTexto } from "./personalidadEdicion.js";
import { esVariante, VARIANTES_BASE, PIEZAS_CON_VARIANTE } from "./variantesEdicion.js";
import { igualesEntreVariantes, MAX_IGUALES_ENTRE_MARCAS } from "./estilosEdicion.js";

// «Lujo: lento y elegante; tecnología: glitch y cortes secos; familiar: suave y redondeado; industrial: golpes y barridos.»

describe("la personalidad de la marca", () => {
  it("las cuatro de la agencia, cada una con variantes que existen", () => {
    expect(IDS_PERSONALIDAD).toEqual(["lujo", "tecnologia", "familiar", "industrial"]);
    for (const p of Object.values(PERSONALIDADES)) {
      for (const k of PIEZAS_CON_VARIANTE) for (const v of p.variantes[k]) expect(esVariante(k, v), `${p.nombre} ${k} ${v}`).toBe(true);
    }
    expect(PERSONALIDADES.lujo.variantes.ritmo).toEqual(["pausado"]);
    expect(PERSONALIDADES.tecnologia.variantes.transicion[0]).toBe("glitch");
    expect(PERSONALIDADES.familiar.variantes.forma).toEqual(["redonda"]);
    expect(PERSONALIDADES.industrial.variantes.transicion).toContain("barrido");
    expect(personalidadesEnTexto()).toHaveLength(4);
  });

  it("el rubro la sugiere; sin señales, ninguna", () => {
    expect(personalidadDeTexto("Alquiler de maquinaria para la construcción")).toBe("industrial");
    expect(personalidadDeTexto("Joyería y relojes de alta gama")).toBe("lujo");
    expect(personalidadDeTexto("Ropa y accesorios para bebé")).toBe("familiar");
    expect(personalidadDeTexto("Software de facturación digital")).toBe("tecnologia");
    expect(personalidadDeTexto("Consultoría")).toBeNull();
    expect(personalidadDeTexto("")).toBeNull();
  });

  it("la combinación que le va nunca es el juego de Rofer ni se parece a la de otra marca", () => {
    for (const id of IDS_PERSONALIDAD) {
      const v = variantesPorPersonalidad(id);
      expect(igualesEntreVariantes(v, VARIANTES_BASE)).toBeLessThanOrEqual(MAX_IGUALES_ENTRE_MARCAS);
    }
    const otra = variantesPorPersonalidad("industrial");
    const segunda = variantesPorPersonalidad("industrial", { evitar: [otra] });
    expect(segunda).not.toEqual(otra);
    expect(igualesEntreVariantes(segunda, otra)).toBeLessThanOrEqual(MAX_IGUALES_ENTRE_MARCAS);
    expect(combinacionesDe("nada")).toEqual([]);
  });
});
