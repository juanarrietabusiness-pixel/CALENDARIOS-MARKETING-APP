import { describe, it, expect } from "vitest";
import {
  elegirOpus, costoUSD, costoGemini, etiquetaModelo, estadoPresupuesto, RAZONAMIENTOS, POR_DEFECTO,
} from "../../worker/lib/configIA.js";

describe("configIA", () => {
  it("por defecto: Sonnet con razonamiento alto", () => {
    expect(POR_DEFECTO).toMatchObject({ ia_modelo: "sonnet", ia_razonamiento: "alto", ia_razonamiento_chat: null });
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

  it("el presupuesto por defecto es de 30 US$ y sólo avisa", () => {
    expect(POR_DEFECTO).toMatchObject({ presupuesto_usd: 30, al_limite: "avisar" });
  });

  it("cuenta las búsquedas web: 10 US$ por cada 1.000", () => {
    // Sin esto, un mes de preguntas con búsqueda salía gratis en el contador.
    expect(costoUSD("claude-sonnet-5", { server_tool_use: { web_search_requests: 100 } })).toBeCloseTo(1);
  });

  it("calcula el costo de Gemini con sus tokens, pensamiento incluido", () => {
    // La imagen: ~1.290 tokens de salida a 30 $/M ≈ 0,039 $.
    expect(costoGemini("gemini-2.5-flash-image", { candidatesTokenCount: 1290 })).toBeCloseTo(0.0387, 4);
    expect(costoGemini("gemini-2.5-flash", { promptTokenCount: 1_000_000, thoughtsTokenCount: 1_000_000 })).toBeCloseTo(2.8);
  });

  it("el estado del presupuesto: libre sin tope, aviso desde el 80 %, agotado desde el 100 %", () => {
    expect(estadoPresupuesto(50, 0).estado).toBe("libre");
    expect(estadoPresupuesto(10, 30).estado).toBe("ok");
    expect(estadoPresupuesto(24, 30).estado).toBe("aviso");
    expect(estadoPresupuesto(30, 30).estado).toBe("agotado");
    expect(estadoPresupuesto(15, 30).porcentaje).toBeCloseTo(50);
  });
});
