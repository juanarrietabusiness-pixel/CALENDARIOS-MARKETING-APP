import { describe, it, expect } from "vitest";
import { limpiarSeleccion, entraRed, describirSeleccion } from "./informeRedes";

describe("informeRedes", () => {
  it("sin nada guardado entra todo, como antes", () => {
    expect(limpiarSeleccion(null)).toEqual({ redes: null, anuncios: true });
    expect(entraRed(limpiarSeleccion(null), "tiktok")).toBe(true);
  });
  it("lee texto o JSON, descarta redes que no existen y una lista vacía vale «todas»", () => {
    expect(limpiarSeleccion('{"redes":["instagram","x","instagram"],"anuncios":false}')).toEqual({ redes: ["instagram"], anuncios: false });
    expect(limpiarSeleccion({ redes: [] })).toEqual({ redes: null, anuncios: true });
  });
  it("deja TikTok fuera si no se escogió", () => {
    const s = limpiarSeleccion({ redes: ["instagram", "facebook"] });
    expect(entraRed(s, "tiktok")).toBe(false);
    expect(describirSeleccion(s, ["instagram", "facebook", "tiktok"])).toBe("Instagram y Facebook");
    expect(describirSeleccion({ redes: null, anuncios: false }, ["instagram"])).toBe("Instagram, sin anuncios");
  });
});
