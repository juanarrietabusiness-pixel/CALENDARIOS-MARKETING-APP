import { describe, it, expect } from "vitest";
import { normalizarColor, tresColores, textoSobre, conAlfa } from "./colores.js";

describe("normalizarColor", () => {
  it("entiende hex largo, corto y sin almohadilla", () => {
    expect(normalizarColor("#1e90ff")).toBe("#1E90FF");
    expect(normalizarColor("#1e9")).toBe("#11EE99");
    expect(normalizarColor("1E90FF")).toBe("#1E90FF");
    expect(normalizarColor("Azul corporativo #0A2540 (fondo)")).toBe("#0A2540");
  });
  it("entiende RGB", () => {
    expect(normalizarColor("rgb(30, 144, 255)")).toBe("#1E90FF");
    expect(normalizarColor("RGB 30 144 255")).toBe("#1E90FF");
  });
  it("lo que no es un color se queda vacío", () => {
    expect(normalizarColor("cafe")).toBe("");
    expect(normalizarColor("Pantone 300 C")).toBe("");
    expect(normalizarColor("rgb(300, 1, 1)")).toBe("");
    expect(normalizarColor("")).toBe("");
  });
});

describe("tresColores", () => {
  it("usa el papel que dice la paleta", () => {
    expect(tresColores([
      { hex: "#F5A623", rol: "acento para botones" },
      { hex: "#0A2540", nombre: "Azul noche", rol: "principal" },
      { hex: "#FFFFFF", rol: "secundario" },
    ])).toEqual({ principal: "#0A2540", secundario: "#FFFFFF", acento: "#F5A623" });
  });
  it("si no dice papel, por orden; lo inválido se salta", () => {
    expect(tresColores([{ hex: "nada" }, { hex: "#111" }, { hex: "#222222" }]))
      .toEqual({ principal: "#111111", secundario: "#222222", acento: "" });
  });
});

describe("contraste y alfa", () => {
  it("texto oscuro sobre fondo claro y claro sobre oscuro", () => {
    expect(textoSobre("#FFFFFF")).toBe("#0B1220");
    expect(textoSobre("#0A2540")).toBe("#FFFFFF");
  });
  it("alfa sin concatenar sufijos", () => {
    expect(conAlfa("#1E90FF", 0.15)).toBe("rgba(30, 144, 255, 0.15)");
  });
});

describe("coloresDelTexto", () => {
  it("saca los códigos del manual, sin repetir", async () => {
    const { coloresDelTexto } = await import("./colores.js");
    expect(coloresDelTexto("Primario #0A2540; texto #fff; botón rgb(245,166,35); otra vez #0a2540"))
      .toEqual(["#0A2540", "#FFFFFF", "#F5A623"]);
  });
});

describe("elegirLogo", () => {
  it("prefiere un PNG que se llame logo, y descarta SVG y favicons", async () => {
    const { elegirLogo } = await import("./colores.js");
    const assets = [
      { name: "favicon-logo.png", path: "a/favicon-logo.png" },
      { name: "logo.svg", path: "logo.svg" },
      { name: "Logo-horizontal.jpg", path: "marca/Logo-horizontal.jpg" },
      { name: "logo_principal.png", path: "marca/logos/logo_principal.png" },
    ];
    expect(elegirLogo(assets).path).toBe("marca/logos/logo_principal.png");
    expect(elegirLogo([{ name: "logo.svg", path: "logo.svg" }])).toBeNull();
  });
});
