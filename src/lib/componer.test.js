import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import {
  elegirTamano, resolverInterlinea, elegirAnclaje, componerPieza, avisosDeComposicion,
} from "./componer";

// ============================================================
// La composición es lo que separa nuestro entregable del de PanaClaw.
// Su skill lo dice en una línea: «se entrega resuelta, no como regla: si
// Meta tiene que decidirlo, no lo hace». Estas pruebas comprueban que se
// resuelve, y que se resuelve bien.
// ============================================================

const RAIZ = "/home/user/Agencia_Workspace";
const receta = (c) => JSON.parse(readFileSync(`${RAIZ}/${c}/01_ADN_y_Memoria/05_receta.json`, "utf8"));
const hay = existsSync(RAIZ);

describe.skipIf(!hay)("elegirTamano", () => {
  const r = receta("Dcasa");

  it("el número de líneas propone", () => {
    expect(elegirTamano(r, ["UNA", "DOS"]).px).toBe(128);        // 2–3 líneas → XL
    expect(elegirTamano(r, ["A", "B", "C", "D"]).px).toBe(104);  // 4–5 líneas → L
  });

  it("el carácter más largo dispone", () => {
    // Dos líneas caerían en XL (16 caracteres máximo), pero una tiene 24:
    // baja un escalón sola.
    const t = elegirTamano(r, ["UNA LÍNEA MUY LARGUÍSIMA", "CORTA"]);
    expect(t.px).toBe(104);
    expect(t.bajoUnEscalon).toBe(true);
  });

  it("no cuenta los corchetes del acento como caracteres", () => {
    const con = elegirTamano(r, ["⟦DÉCIMO⟧ VA", "AQUÍ"]);
    const sin = elegirTamano(r, ["DÉCIMO VA", "AQUÍ"]);
    expect(con.caracteresMaximos).toBe(sin.caracteresMaximos);
  });
});

describe.skipIf(!hay)("resolverInterlinea", () => {
  const r = receta("Dcasa");
  const px = { px: 128, interlinea: "0.92" };

  it("deja la base cuando no hay tildes ni descendentes", () => {
    const [par] = resolverInterlinea(r, ["SIN NADA", "TAMPOCO"], px);
    expect(par.avanceEm).toBe(0.92);
    expect(par.porque).toMatch(/interlínea base/);
  });

  it("suma la holgura cuando la línea de ABAJO lleva tilde", () => {
    const [par] = resolverInterlinea(r, ["ARRIBA", "DÉCIMO"], px);
    expect(par.holguraSuperior).toBe(0.24);
    expect(par.avanceEm).toBe(1.16);
    expect(par.porque).toContain("É en la línea 2");
  });

  it("suma la holgura cuando la línea de ARRIBA lleva descendente", () => {
    const [par] = resolverInterlinea(r, ["COSAS QUE", "ABAJO"], px);
    expect(par.holguraInferior).toBe(0.11);
    expect(par.avanceEm).toBe(1.03);
    expect(par.porque).toContain("Q en la línea 1");
  });

  it("suma las dos cuando coinciden", () => {
    const [par] = resolverInterlinea(r, ["ALGO, ASÍ", "PÁGINA"], px);
    expect(par.avanceEm).toBeCloseTo(0.92 + 0.24 + 0.11, 4);
  });

  it("calcula CADA par, no sólo el primero", () => {
    // Es el error que la skill de PanaClaw señala como el más caro: aplicar
    // la fórmula al primer par que se nota y dejar el resto en la base.
    const pares = resolverInterlinea(r, ["LIMPIA", "CON TILDÉ", "CON EÑE Ñ", "FINAL"], px);
    expect(pares).toHaveLength(3);
    expect(pares[0].holguraSuperior).toBe(0.24);  // TILDÉ en la 2
    expect(pares[1].holguraSuperior).toBe(0.21);  // Ñ en la 3
    expect(pares[2].holguraSuperior).toBe(0);     // FINAL, limpia
  });

  it("da el avance también en píxeles, para el exportador", () => {
    const [par] = resolverInterlinea(r, ["ARRIBA", "DÉCIMO"], px);
    expect(par.avancePx).toBe(Math.round(1.16 * 128));
  });

  it("no devuelve nada con una sola línea", () => {
    expect(resolverInterlinea(r, ["UNA"], px)).toBeNull();
  });
});

describe.skipIf(!hay)("elegirAnclaje", () => {
  it("manda la plantilla en las marcas con base fija", () => {
    const r = receta("Dcasa");
    expect(elegirAnclaje(r, { plantilla: "B" }, 3).donde).toContain("y=1258");
    expect(elegirAnclaje(r, { plantilla: "D" }, 3).donde).toContain("y=594");
  });

  it("manda el número de líneas cuando el bloque flota", () => {
    const r = receta("Juancito Ads");
    expect(elegirAnclaje(r, {}, 7).nombre).toBe("Alto");
    expect(elegirAnclaje(r, {}, 4).nombre).toBe("Medio");
  });

  it("devuelve null si la receta no los declara", () => {
    expect(elegirAnclaje({}, {}, 3)).toBeNull();
  });
});

describe.skipIf(!hay)("componerPieza", () => {
  it("deja la pieza lista para el prompt, sin nada por decidir", () => {
    const r = receta("Dcasa");
    const p = componerPieza(r, {
      n: 1, plantilla: "B",
      titular: ["EL ⟦DÉCIMO⟧ SE VA", "EN COSAS QUE", "NO RECUERDAS."],
    });
    expect(p._tamano.px).toBe(128);
    expect(p._anclaje.donde).toContain("y=1258");
    expect(p._interlinea).toHaveLength(2);
    expect(p._interlinea[1].avanceEm).toBe(1.03);
  });

  it("no rompe una pieza sin titular", () => {
    expect(componerPieza(receta("Dcasa"), { n: 1 }).n).toBe(1);
  });
});

describe.skipIf(!hay)("avisosDeComposicion", () => {
  it("avisa cuando un titular no cabe ni en el cuerpo más pequeño", () => {
    const r = receta("Dcasa");
    const avisos = avisosDeComposicion(r, [
      { n: 3, titular: ["ESTA LÍNEA ES DEMASIADO LARGA PARA CUALQUIER CUERPO DE ESTA MARCA"] },
    ]);
    expect(avisos.join(" ")).toMatch(/Hay que acortarla/);
  });

  it("no avisa de lo que cabe", () => {
    expect(avisosDeComposicion(receta("Dcasa"), [{ n: 1, titular: ["CORTO", "Y BIEN"] }])).toEqual([]);
  });
});
