import { describe, it, expect } from "vitest";
import {
  elegirOpus, costoUSD, costoGemini, etiquetaModelo, estadoPresupuesto, RAZONAMIENTOS, POR_DEFECTO,
  resolverIA, MODELO_HAIKU,
} from "../../worker/lib/configIA.js";
import { adaptarAlModelo } from "../../worker/lib/anthropic.js";
import { rangoServido } from "../../worker/lib/respuesta.js";

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

  it("Haiku cuesta la mitad que Sonnet y se elige sin preguntar a la cuenta", async () => {
    expect(costoUSD(MODELO_HAIKU, { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(6);
    expect(await resolverIA({}, { ia_modelo: "haiku", ia_razonamiento: "medio" })).toEqual({ modelo: "claude-haiku-4-5", esfuerzo: "medium", aviso: "" });
  });
});

describe("adaptarAlModelo: la petición que acepta Haiku 4.5", () => {
  const base = {
    model: "claude-haiku-4-5",
    max_tokens: 20_000,
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: "high" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }, { type: "web_fetch_20260209", name: "web_fetch" }, { name: "ver_tareas", input_schema: {} }],
    messages: [],
  };

  it("a los demás modelos no los toca", () => {
    const p = { ...base, model: "claude-sonnet-5" };
    expect(adaptarAlModelo(p)).toBe(p);
  });

  it("sin effort ni razonamiento adaptativo: presupuesto fijo, menor que max_tokens", () => {
    // Haiku 4.5 rechaza `effort` y `adaptive` con un 400.
    const p = adaptarAlModelo(base);
    expect(p.output_config).toBeUndefined();
    expect(p.thinking).toEqual({ type: "enabled", budget_tokens: 16_000 });
    expect(p.thinking.budget_tokens).toBeLessThan(p.max_tokens);
  });

  it("con poco sitio, el razonamiento cede para que quepa el texto", () => {
    expect(adaptarAlModelo({ ...base, max_tokens: 6_000 }).thinking).toEqual({ type: "enabled", budget_tokens: 4_000 });
    expect(adaptarAlModelo({ ...base, max_tokens: 2_500 }).thinking).toBeUndefined();
  });

  it("en nivel Bajo responde sin razonar", () => {
    expect(adaptarAlModelo({ ...base, output_config: { effort: "low" } }).thinking).toBeUndefined();
  });

  it("la web en su versión básica, y la salida hasta 64.000", () => {
    const p = adaptarAlModelo({ ...base, max_tokens: 128_000 });
    expect(p.tools.map((t) => t.type)).toEqual(["web_search_20250305", "web_fetch_20250910", undefined]);
    expect(p.tools[0].max_uses).toBe(5);
    expect(p.max_tokens).toBe(64_000);
  });
});

describe("rangoServido: el trozo que se contesta con 206", () => {
  it("con principio y largo, con sólo principio y por el final", () => {
    expect(rangoServido({ offset: 0, length: 2 }, 10)).toEqual({ inicio: 0, fin: 1 });
    expect(rangoServido({ offset: 4 }, 10)).toEqual({ inicio: 4, fin: 9 });
    expect(rangoServido({ suffix: 3 }, 10)).toEqual({ inicio: 7, fin: 9 });
    expect(rangoServido({ offset: 8, length: 50 }, 10)).toEqual({ inicio: 8, fin: 9 });
  });
});
