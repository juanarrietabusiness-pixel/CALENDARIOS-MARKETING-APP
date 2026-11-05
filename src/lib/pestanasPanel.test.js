import { describe, it, expect } from "vitest";
import { PESTANAS_PANEL, pestanaDelPanel, pestanaPorTecla } from "./pestanasPanel.js";

describe("las pestañas del panel de una publicación", () => {
  it("son tres: Idea · Pieza · Publicar", () => {
    expect(PESTANAS_PANEL.map(([, nombre]) => nombre)).toEqual(["Idea", "Pieza", "Publicar"]);
  });

  it("lo que pedía la pestaña de antes abre lo suyo: «Subir» (publicar) abre Pieza; «contenido», Idea", () => {
    expect(pestanaDelPanel("publicar")).toBe("pieza");
    expect(pestanaDelPanel("subir")).toBe("pieza");
    expect(pestanaDelPanel("contenido")).toBe("idea");
    expect(pestanaDelPanel("salida")).toBe("salida");
    expect(pestanaDelPanel(null)).toBeNull();
    expect(pestanaDelPanel("otra")).toBeNull();
  });

  it("las flechas van en círculo; Inicio y Fin a los extremos", () => {
    expect(pestanaPorTecla("idea", "ArrowRight")).toBe("pieza");
    expect(pestanaPorTecla("salida", "ArrowRight")).toBe("idea");
    expect(pestanaPorTecla("idea", "ArrowLeft")).toBe("salida");
    expect(pestanaPorTecla("pieza", "End")).toBe("salida");
    expect(pestanaPorTecla("pieza", "Home")).toBe("idea");
    expect(pestanaPorTecla("pieza", "Enter")).toBeNull();
  });
});
