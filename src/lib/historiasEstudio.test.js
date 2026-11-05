import { describe, it, expect } from "vitest";
import { modeloDeHistorias, opcionesParaHistorias } from "./historiasEstudio";
import { limpiarKit } from "./kitMarca";

// El modelo de las 3 historias con IA se escoge por cliente («Modelo de las 3 con IA», en el panel del post).
describe("el modelo de las historias", () => {
  const activos = { meta: true, gemini: true };

  it("manda el fijado para las historias, si tiene llave y admite la imagen del post", () => {
    expect(modeloDeHistorias(activos, { modelos: { historias: "muse-image" } }).id).toBe("muse-image");
    expect(modeloDeHistorias(activos, { modelos: { imagen: "nano-banana", historias: "muse-image" } }).id).toBe("muse-image");
  });

  it("sin llave para el fijado, vuelve al de siempre", () => {
    const m = modeloDeHistorias({ gemini: true }, { modelos: { historias: "muse-image" } });
    expect(m.id).not.toBe("muse-image");
    expect(m.motor).toBe("gemini");
  });

  it("la lista: sólo imagen con llave y con referencias, la más barata primero", () => {
    const lista = opcionesParaHistorias(activos);
    expect(lista.length).toBeGreaterThan(1);
    expect(lista.map((m) => m.id)).toContain("muse-image");
    expect(lista.every((m) => m.costo)).toBe(true);
    expect(lista.some((m) => m.id === "prueba")).toBe(false);
  });

  it("el kit lo guarda junto a los de imagen y video", () => {
    expect(limpiarKit({ modelos: { imagen: "nano-banana", historias: "muse-image", raro: "x" } }).modelos).toEqual({ imagen: "nano-banana", historias: "muse-image" });
  });
});

// El costo de las 3 con IA se enseña ANTES de crear (es la confirmación).
describe("lo que cuestan las 3 historias con IA", () => {
  it("tres veces una historia 9:16 con el modelo escogido", async () => {
    const { costoDeHistorias } = await import("./historiasEstudio");
    const { modeloPorId, estimar, ajustesDe } = await import("./estudioCatalogo");
    const m = modeloPorId("nano-banana");
    expect(costoDeHistorias(m)).toBeCloseTo(estimar(m, 1, ajustesDe(m, { aspectRatio: "9:16", imageSize: "2K" }, { reference: ["x"] })) * 3, 3);
    expect(costoDeHistorias(null)).toBe(0);
  });
});
