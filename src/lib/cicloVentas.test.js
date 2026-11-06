import { describe, it, expect } from "vitest";
import { ETAPAS_CICLO, idEtapaCiclo, nombreEtapaCiclo, TIPOS_NEGOCIO, DESTINOS_NEGOCIO } from "./cicloVentas.js";
import { OBJETIVOS_CICLO, CICLO_POR_NEGOCIO, cicloDe } from "./cicloNegocio.js";
import { TIPOS_ARTE } from "./tiposArte.js";
import { OBJETIVOS } from "./anuncios.js";

describe("las etapas del ciclo y sus alias", () => {
  it("lo de antes (embudo del mes y estratega) se lee con las etapas del curso", () => {
    expect(["atraer", "considerar", "convertir", "fidelizar"].map(idEtapaCiclo)).toEqual(["presentacion", "evaluacion", "conversion", "ascension"]);
    expect(["frio", "frío", "tibio", "caliente"].map(idEtapaCiclo)).toEqual(["presentacion", "presentacion", "evaluacion", "conversion"]);
    expect(idEtapaCiclo("Ascensión")).toBe("ascension");
    expect(idEtapaCiclo("inventada")).toBe("");
    expect(nombreEtapaCiclo("considerar")).toBe("Evaluación");
  });
});

describe("qué pieza va en cada etapa según el negocio y el destino", () => {
  const artes = new Set(TIPOS_ARTE.map((t) => t.id));

  it("cada combinación de tipo de negocio y destino da las cuatro etapas, con tipos de arte que existen", () => {
    for (const t of TIPOS_NEGOCIO) {
      for (const d of DESTINOS_NEGOCIO) {
        const c = cicloDe(t.id, d.id);
        expect(c.tipo).toBe(t.id);
        expect(c.etapas.map((e) => e.id)).toEqual(ETAPAS_CICLO.map((e) => e.id));
        for (const e of c.etapas) {
          expect(e.contenido.length, `${t.id}:${d.id}:${e.id}`).toBeGreaterThan(20);
          expect(e.lleva).toBeTruthy();
          expect(e.artes.length).toBeGreaterThan(0);
          for (const a of e.artes) expect(artes.has(a), `${t.id}:${d.id}:${e.id} → ${a}`).toBe(true);
        }
        expect(OBJETIVOS[c.objetivoMeta], c.objetivoMeta).toBeTruthy();
      }
    }
    for (const [clave, ciclo] of Object.entries(CICLO_POR_NEGOCIO)) {
      expect(Object.keys(ciclo.etapas), clave).toEqual(ETAPAS_CICLO.map((e) => e.id));
      expect(OBJETIVOS_CICLO[ciclo.objetivo], clave).toBeTruthy();
    }
  });

  it("por WhatsApp el objetivo es interacción; productos en la web, ventas; servicios en la web, clientes potenciales", () => {
    expect(cicloDe("productos", "whatsapp")).toMatchObject({ objetivo: "interaccion", objetivoMeta: "OUTCOME_ENGAGEMENT", deducido: false });
    expect(cicloDe("productos", "web")).toMatchObject({ objetivo: "ventas", objetivoMeta: "OUTCOME_SALES" });
    expect(cicloDe("servicios", "web").objetivo).toBe("clientes");
    // La conversión de productos por WhatsApp es la experiencia de quien ya lo tiene.
    const conversion = cicloDe("productos", "whatsapp").etapas.find((e) => e.id === "conversion");
    expect(conversion.artes).toContain("testimonio");
    expect(conversion.lleva).toBe("a WhatsApp");
  });

  it("lo que la tabla no trae se deduce de lo más parecido, y lo dice", () => {
    const c = cicloDe("suscripcion", "whatsapp");
    expect(c.deducido).toBe(true);
    expect(c.objetivo).toBe("interaccion");
    expect(c.nota).toMatch(/Deducido de suscripción en la web/);
    expect(c.etapas.every((e) => e.lleva === "a WhatsApp")).toBe(true);
    expect(cicloDe("servicios", "whatsapp").deducido).toBe(false);
  });

  it("un curso no se vende por WhatsApp: pasa a la web y lo dice", () => {
    const c = cicloDe("cursos", "whatsapp");
    expect(c.destino).toBe("web");
    expect(c.nota).toMatch(/no se venden por WhatsApp/);
    expect(c.etapas.find((e) => e.id === "conversion").artes).toContain("testimonio");
  });

  it("una cuenta nueva arranca con presentación y evaluación; las variantes de una tienda web", () => {
    const nueva = cicloDe("productos", "whatsapp", { cuenta: "nueva" });
    expect(nueva.etapas.filter((e) => e.ahora).map((e) => e.id)).toEqual(["presentacion", "evaluacion"]);
    expect(cicloDe("productos", "whatsapp").etapas.every((e) => e.ahora)).toBe(true);
    expect(cicloDe("productos", "web", { variante: "educativo" })).toMatchObject({ variante: "educativo" });
    expect(cicloDe("productos", "web", { variante: "educativo" }).etapas[0].lleva).toBe("a la clase gratis");
    // Una variante que no existe para ese tipo se ignora.
    expect(cicloDe("servicios", "web", { variante: "educativo" }).variante).toBe("");
  });

  it("lo que no se conoce vale productos por WhatsApp, y el resultado no comparte listas con la tabla", () => {
    expect(cicloDe("inventado", "fax")).toMatchObject({ tipo: "productos", destino: "whatsapp" });
    const a = cicloDe("productos", "whatsapp");
    a.etapas[0].artes.push("x");
    expect(cicloDe("productos", "whatsapp").etapas[0].artes).not.toContain("x");
  });
});
