import { describe, it, expect } from "vitest";
import { coloresDePortada, aclarar, cubrir, logoEnFoto, nombreDePortada, ESTILOS_PORTADA, LOGO_EN_FOTO, FOTO } from "./portadas";

describe("las piezas del perfil", () => {
  it("los colores salen del kit, con el icono en contraste; sin paleta, los de la agencia", () => {
    expect(coloresDePortada([{ hex: "#152473" }, { hex: "#FFB400" }])).toEqual({ principal: "#152473", acento: "#FFB400", icono: "#FFFFFF" });
    expect(coloresDePortada([{ hex: "#F9F6ED" }, { hex: "#1B3246" }]).icono).toBe("#0B1220");
    expect(coloresDePortada([], {}).principal).toBe("#1E3A6B");
    expect(coloresDePortada([{ hex: "#152473" }, { hex: "#FFB400" }], { principal: "#FFB400" })).toMatchObject({ principal: "#FFB400", acento: "#152473" });
  });

  it("geometría: cubrir, el logo dentro del círculo y aclarar", () => {
    expect(cubrir(2000, 1000, 1080, 1920)).toEqual({ x: -1380, y: 0, w: 3840, h: 1920 });
    const l = logoEnFoto(1000, 500);
    expect(l.w).toBeCloseTo(FOTO.lado * LOGO_EN_FOTO);
    expect(l.x).toBeCloseTo((FOTO.lado - l.w) / 2);
    expect(aclarar("#000000", 0.5)).toBe("#808080");
    expect(aclarar("nada")).toBe("#F5F6F7");
  });

  it("seis estilos y nombres de archivo limpios", () => {
    expect(ESTILOS_PORTADA).toHaveLength(6);
    expect(nombreDePortada("Reseñas ⭐")).toBe("destacado-resenas.png");
    expect(nombreDePortada("", 2)).toBe("destacado-3.png");
  });
});
