import { describe, it, expect } from "vitest";
import {
  TIPOS_ARTE, MAX_TIPOS_ARTE, tipoArteDe, tiposArteDeEtapa, limpiarTiposArte, lineaDeTiposArte,
  SESGOS, MAX_SESGOS, idSesgo, sesgoDe, limpiarSesgos, nombresDeSesgos,
} from "./tiposArte.js";
import { COMPOSICIONES, TACTICAS } from "./loteAnuncios.js";
import { PILARES } from "./pilares.js";
import { ETAPAS_CICLO } from "./cicloVentas.js";

describe("los diez tipos de arte", () => {
  it("son diez, y cada uno se enlaza con composiciones, tipos de contenido y etapas que existen", () => {
    expect(TIPOS_ARTE).toHaveLength(10);
    const comps = new Set(COMPOSICIONES.map((c) => c.id));
    const pilares = new Set(PILARES.map((p) => p.id));
    const etapas = new Set(ETAPAS_CICLO.map((e) => e.id));
    for (const t of TIPOS_ARTE) {
      expect(t.composiciones.length, t.id).toBeGreaterThan(0);
      for (const c of t.composiciones) expect(comps.has(c), `${t.id} → ${c}`).toBe(true);
      for (const p of t.pilares) expect(pilares.has(p), `${t.id} → ${p}`).toBe(true);
      expect(t.etapas.length).toBeGreaterThan(0);
      for (const e of t.etapas) expect(etapas.has(e), `${t.id} → ${e}`).toBe(true);
    }
    // Los dos que no tenía la aplicación.
    expect(tipoArteDe("prensa")).toBeTruthy();
    expect(tipoArteDe("aspiracional")).toBeTruthy();
  });

  it("los de cada etapa siguen la tabla de las cuatro campañas", () => {
    const de = (e) => tiposArteDeEtapa(e).map((t) => t.id).sort();
    expect(de("presentacion")).toEqual(["aspiracional", "beneficios", "demostracion", "dividida", "educativo", "humano", "prensa"]);
    expect(de("evaluacion")).toEqual(["beneficios", "prensa", "producto", "testimonio"]);
    expect(de("conversion")).toEqual(["prensa", "producto", "promocion", "testimonio"]);
    expect(de("ascension")).toEqual(["producto", "promocion"]);
  });

  it("los de una marca: sólo ids que existen, sin repetir, como mucho cuatro; la línea para quien diseña", () => {
    expect(limpiarTiposArte(["producto", "inventado", "producto", "testimonio", "humano", "prensa", "educativo"])).toEqual(["producto", "testimonio", "humano", "prensa"]);
    expect(limpiarTiposArte(null)).toEqual([]);
    expect(limpiarTiposArte(TIPOS_ARTE.map((t) => t.id))).toHaveLength(MAX_TIPOS_ARTE);
    const l = lineaDeTiposArte(["demostracion", "testimonio"]);
    expect(l).toMatch(/^Tipos de arte de esta marca/);
    expect(l).toContain("Demostración (enseña cómo funciona");
    expect(l).toContain("Testimonio (");
    expect(lineaDeTiposArte([])).toBe("");
  });
});

describe("los seis sesgos", () => {
  it("son seis, cada uno con su táctica del gancho (las de antes y las tres nuevas)", () => {
    expect(SESGOS.map((s) => s.id)).toEqual(["reciprocidad", "empatia", "prueba-social", "autoridad", "escasez", "microcompromiso"]);
    const tacticas = new Set(TACTICAS.map(([id]) => id));
    for (const s of SESGOS) expect(tacticas.has(s.tactica), s.id).toBe(true);
    for (const nueva of ["reciprocidad", "empatia", "microcompromiso"]) expect(tacticas.has(nueva)).toBe(true);
  });

  it("se reconocen por su id o su nombre, con o sin tilde, y se limpian a cinco como mucho", () => {
    expect(idSesgo("Prueba social")).toBe("prueba-social");
    expect(idSesgo("micro-compromiso")).toBe("microcompromiso");
    expect(idSesgo("Empatía")).toBe("empatia");
    expect(idSesgo("nada")).toBe("");
    expect(sesgoDe("ESCASEZ").nombre).toBe("Escasez");
    expect(limpiarSesgos(["Reciprocidad", "reciprocidad", "x", "empatia", "autoridad", "escasez", "prueba social", "microcompromiso"])).toHaveLength(MAX_SESGOS);
    expect(nombresDeSesgos(["empatia", "prueba-social"])).toBe("Empatía, Prueba social");
  });
});
