import { describe, it, expect } from "vitest";
import { instruccionIdea } from "./api.js";

// El botón de la idea (Idea / Brief) del panel y del banco.
describe("el botón de la idea", () => {
  it("vacía: genera una idea nueva, como siempre", () => {
    const t = instruccionIdea({ format: "reel", idea: "  " });
    expect(t).toMatch(/Genera UNA idea creativa/);
    expect(t).not.toMatch(/YA ESCRIBIÓ/);
  });

  it("con algo escrito: la completa o la mejora, sin cambiarla por otra", () => {
    const t = instruccionIdea({ format: "post", idea: "Curso de maquillaje gratis por la compra de" });
    expect(t).toMatch(/IDEA QUE YA ESCRIBIÓ EL EQUIPO:\n«Curso de maquillaje gratis por la compra de»/);
    expect(t).toMatch(/no la cambies por otra idea/);
    expect(t).toMatch(/Si está a medias, termínala/);
    expect(t).not.toMatch(/Genera UNA idea creativa/);
  });
});

describe("la idea respeta el formato", () => {
  it("dice qué es el formato y que no proponga otro", () => {
    expect(instruccionIdea({ format: "post" })).toMatch(/POST de UNA sola imagen fija.*no propongas otro/s);
    expect(instruccionIdea({ format: "carrusel" })).toMatch(/CARRUSEL de varias láminas/);
    expect(instruccionIdea({ format: "reel", idea: "Algo" })).toMatch(/REEL.*ni por otro formato/s);
  });
});
