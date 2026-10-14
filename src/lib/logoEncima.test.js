import { describe, it, expect } from "vitest";
import { posicionLogo, posicionDelKit } from "./logoEncima.js";

describe("el logo estampado", () => {
  it("abajo a la derecha, al 16 % del ancho y con margen, por defecto", () => {
    expect(posicionLogo({ ancho: 1000, alto: 1250, logoAncho: 200, logoAlto: 100 })).toEqual({ x: 800, y: 1130, w: 160, h: 80 });
  });

  it("cada esquina, y el centro de abajo", () => {
    const base = { ancho: 1000, alto: 1000, logoAncho: 100, logoAlto: 100, tamano: 0.1, margen: 0.05 };
    expect(posicionLogo({ ...base, esquina: "arriba-izquierda" })).toEqual({ x: 50, y: 50, w: 100, h: 100 });
    expect(posicionLogo({ ...base, esquina: "arriba-derecha" })).toMatchObject({ x: 850, y: 50 });
    expect(posicionLogo({ ...base, esquina: "abajo-izquierda" })).toMatchObject({ x: 50, y: 850 });
    expect(posicionLogo({ ...base, esquina: "abajo-centro" })).toMatchObject({ x: 450, y: 850 });
  });

  it("un logo vertical no tapa media pieza: se limita también por el alto", () => {
    const p = posicionLogo({ ancho: 1080, alto: 1080, logoAncho: 100, logoAlto: 400, tamano: 0.2, margen: 0 });
    expect(p.h).toBe(216);
    expect(p.w).toBe(54);
  });

  it("lo guardado se limpia: esquina que no existe, tamaños fuera de rango", () => {
    expect(posicionDelKit({ esquina: "en-medio", tamano: 2, margen: -1 })).toEqual({ esquina: "abajo-derecha", tamano: 0.3, margen: 0 });
    expect(posicionDelKit(null)).toEqual({ esquina: "abajo-derecha", tamano: 0.16, margen: 0.04 });
  });
});
