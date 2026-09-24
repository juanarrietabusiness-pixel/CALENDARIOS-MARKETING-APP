import { describe, it, expect } from "vitest";
import { elegirOpus, costoUSD, etiquetaModelo, RAZONAMIENTOS, POR_DEFECTO } from "../../worker/lib/configIA.js";

describe("configIA", () => {
  it("por defecto: Sonnet con razonamiento alto", () => {
    expect(POR_DEFECTO).toEqual({ ia_modelo: "sonnet", ia_razonamiento: "alto" });
    expect(RAZONAMIENTOS.alto).toBe("high");
  });

  it("elige el Opus más reciente que tenga la cuenta", () => {
    expect(elegirOpus(["claude-opus-4-8", "claude-opus-5", "claude-sonnet-5"])).toBe("claude-opus-5");
    expect(elegirOpus(["claude-opus-5-5", "claude-opus-5"])).toBe("claude-opus-5-5");
    expect(elegirOpus(["claude-sonnet-5", "claude-haiku-4-5"])).toBeNull();
  });

  it("calcula el costo con la tarifa del modelo y la de la caché", () => {
    // Sonnet 5: 2 US$ entrada, 10 US$ salida por millón; caché leída a 0,1×.
    expect(costoUSD("claude-sonnet-5", { input_tokens: 1_000_000 })).toBeCloseTo(2);
    expect(costoUSD("claude-sonnet-5", { output_tokens: 1_000_000 })).toBeCloseTo(10);
    expect(costoUSD("claude-sonnet-5", { cache_read_input_tokens: 1_000_000 })).toBeCloseTo(0.2);
    expect(costoUSD("claude-opus-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(30);
  });

  it("nombra los modelos como se leen", () => {
    expect(etiquetaModelo("claude-sonnet-5")).toBe("Sonnet 5");
    expect(etiquetaModelo("claude-opus-5-5")).toBe("Opus 5.5");
    expect(etiquetaModelo("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
  });
});
