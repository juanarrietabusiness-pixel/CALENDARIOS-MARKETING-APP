import { describe, it, expect } from "vitest";
import { sugerirPauta, avisoCuentaNueva, etapaSugerida, problemasDePauta, problemasDeTextosAnuncio, MAX_TEXTO_ANUNCIO, MAX_PRESENTACION_AUTO } from "./pauta.js";
import { LIMITES_ANUNCIO } from "./estudioMercado.js";
import { MAX_TEXTO } from "./anuncios.js";
import { NIVELES_CONSCIENCIA, nombreDeNivel } from "./consciencia.js";

const post = (x = {}) => ({ id: "p", format: "post", status: "pending", ...x });

describe("«Decisión» es quien YA compró (decisión del 14-nov)", () => {
  it("en pantalla dice «Decisión (ya compró)» y se le habla con productos nuevos o promociones", () => {
    expect(nombreDeNivel("decision")).toBe("Decisión (ya compró)");
    expect(NIVELES_CONSCIENCIA.find((n) => n.clave === "decision").ayuda).toMatch(/Ya te compró/);
  });
  it("un «Anuncio» en nivel Decisión va a ascensión, no a conversión", () => {
    expect(etapaSugerida({ nivel: "decision" })).toBe("ascension");
    expect(etapaSugerida({ nivel: "producto" })).toBe("evaluacion");
  });
});

describe("lo que se marca solo «Va a pauta»", () => {
  it("también en Presentación: lo frío que le habla a quien no conoce la marca, con tope", () => {
    const items = [
      post({ id: "a", pilar: "educativo", nivel: "problema" }),
      post({ id: "b", pilar: "diferenciador", nivel: "solucion" }),
      post({ id: "c", pilar: "humano", nivel: "inconsciente" }),
      post({ id: "d", pilar: "educativo", nivel: "inconsciente" }),
      post({ id: "e", pilar: "educativo", nivel: "problema" }),
      post({ id: "f", pilar: "servicios", nivel: "producto" }),
    ];
    const s = sugerirPauta(items);
    expect(s.every((x) => x.pauta.etapa === "presentacion")).toBe(true);
    expect(s).toHaveLength(MAX_PRESENTACION_AUTO);
    expect(s.map((x) => x.id)).not.toContain("f");
  });

  it("en una cuenta nueva, lo de conversión o ascensión va a Evaluación y se avisa (antes se perdía sin decir nada)", () => {
    const s = sugerirPauta([post({ id: "a", pilar: "anuncio", nivel: "decision" }), post({ id: "b", pilar: "beneficios" })], { ofertas: "15 % en todo", cuenta: "nueva" });
    expect(s.map((x) => x.pauta.etapa)).toEqual(["evaluacion", "evaluacion"]);
    expect(s[0]).toMatchObject({ cuentaNueva: "ascension" });
    expect(s[0].motivo).toMatch(/cuenta nueva/);
    expect(avisoCuentaNueva(s)).toMatch(/2 publicaciones .* van a Evaluación/);
    expect(avisoCuentaNueva(sugerirPauta([post({ id: "a", pilar: "anuncio", nivel: "decision" })]))).toBe("");
  });
});

describe("la revisión de anuncio también lee los textos aparte (`post.anuncio`)", () => {
  const BUENO = "Una sala pequeña también merece un sofá cama.\n\nEscríbenos por WhatsApp y te ayudamos.";
  it("lo que caduca, lo personal y el llamado en los textos de anuncio", () => {
    const p = problemasDeTextosAnuncio({ textos: ["¡Sólo por hoy! Escríbenos por WhatsApp.", "¿Tienes sobrepeso? Escríbenos.", "Sofás cama a buen precio."] });
    expect(p.map((x) => x.codigo)).toEqual(["caduca-anuncio", "personal-anuncio", "llamado-anuncio"]);
    expect(p[2].texto).toMatch(/El texto 3 del anuncio no invita a escribir por WhatsApp/);
    expect(problemasDeTextosAnuncio({ textos: [BUENO] })).toEqual([]);
    const conPauta = post({ pauta: { etapa: "presentacion" }, descripcion: BUENO, anuncio: { textos: ["Hoy 2x1. Escríbenos por WhatsApp."] } });
    expect(problemasDePauta(conPauta).map((x) => x.codigo)).toContain("caduca-anuncio");
  });

  it("un solo tope para el texto del anuncio en toda la aplicación", () => {
    expect(MAX_TEXTO_ANUNCIO).toBe(LIMITES_ANUNCIO.textoPrincipal);
    expect(MAX_TEXTO).toBe(LIMITES_ANUNCIO.textoPrincipal);
  });
});
