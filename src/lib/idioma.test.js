import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { REGLA_IDIOMA, conReglaIdioma } from "./idioma.js";

// ============================================================
// Español latino neutro: la regla va en TODA llamada de texto
//
// No se comprueba que el modelo obedezca —eso sólo se ve leyendo lo que
// escribe—, sino que no haya forma de llamarlo sin la regla delante.
// ============================================================

const raiz = join(import.meta.dirname, "..", "..");
const archivos = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? archivos(p) : /\.(js|mjs)$/.test(n) && !/\.test\./.test(n) ? [p] : [];
});

describe("la regla del idioma", () => {
  it("se pone delante del sistema, en cualquier forma que venga", () => {
    expect(conReglaIdioma({ messages: [] }).system).toEqual([{ type: "text", text: REGLA_IDIOMA }]);
    expect(conReglaIdioma({ system: "Eres un redactor." }).system).toEqual([
      { type: "text", text: REGLA_IDIOMA }, { type: "text", text: "Eres un redactor." },
    ]);
    const cacheado = { type: "text", text: "ADN", cache_control: { type: "ephemeral" } };
    // Lo marcado para la caché se conserva igual y detrás: la regla no cambia nunca, el prefijo tampoco.
    expect(conReglaIdioma({ system: [cacheado] }).system).toEqual([{ type: "text", text: REGLA_IDIOMA }, cacheado]);
  });

  it("no se duplica si la petición pasa dos veces", () => {
    const una = conReglaIdioma({ system: "x" });
    expect(conReglaIdioma(una)).toBe(una);
    expect(conReglaIdioma({ system: REGLA_IDIOMA }).system).toBe(REGLA_IDIOMA);
  });

  it("dice lo que hay que evitar, con ejemplos", () => {
    for (const t of ["vos", "vosotros", "vení", "tenés", "usted"]) expect(REGLA_IDIOMA).toContain(t);
  });

  it("Anthropic sólo se llama desde abrirFlujo, y abrirFlujo pone la regla", () => {
    const llaman = archivos(join(raiz, "worker")).filter((p) => readFileSync(p, "utf8").includes("api.anthropic.com/v1/messages"));
    expect(llaman.map((p) => p.slice(raiz.length + 1))).toEqual(["worker/lib/anthropic.js"]);
    expect(readFileSync(join(raiz, "worker/lib/anthropic.js"), "utf8")).toMatch(/adaptarAlModelo\(conReglaIdioma\(peticion\)\)/);
  });

  it("el análisis de video de Gemini, que también escribe, la lleva", () => {
    expect(readFileSync(join(raiz, "worker/rutas/video.js"), "utf8")).toMatch(/\$\{REGLA_IDIOMA\}/);
  });
});
