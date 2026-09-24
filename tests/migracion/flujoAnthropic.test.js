import { describe, it, expect } from "vitest";
import { partirSSE, crearAcumulador } from "../../worker/lib/flujoAnthropic.js";

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;

const GRABADO = [
  sse("message_start", { type: "message_start", message: { model: "claude-opus-5-5", usage: { input_tokens: 10, cache_read_input_tokens: 900 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: "Miro el " } }),
  sse("content_block_delta", { index: 0, delta: { type: "thinking_delta", thinking: "calendario." } }),
  sse("content_block_delta", { index: 0, delta: { type: "signature_delta", signature: "firma-abc" } }),
  sse("content_block_stop", { index: 0 }),
  sse("content_block_start", { index: 1, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 1, delta: { type: "text_delta", text: "Voy a " } }),
  sse("content_block_delta", { index: 1, delta: { type: "text_delta", text: "buscarlo." } }),
  sse("content_block_stop", { index: 1 }),
  sse("content_block_start", { index: 2, content_block: { type: "tool_use", id: "tu_1", name: "ver_tareas", input: {} } }),
  sse("content_block_delta", { index: 2, delta: { type: "input_json_delta", partial_json: "{\"clien" } }),
  sse("content_block_delta", { index: 2, delta: { type: "input_json_delta", partial_json: "te\": \"Baby Caleb\"}" } }),
  sse("content_block_stop", { index: 2 }),
  sse("message_delta", { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 42 } }),
  sse("message_stop", {}),
].join("");

describe("partirSSE", () => {
  it("separa los eventos y deja el trozo a medias para la siguiente lectura", () => {
    const corte = GRABADO.length - 7;
    const a = partirSSE(GRABADO.slice(0, corte));
    const b = partirSSE(a.resto + GRABADO.slice(corte));
    expect(a.eventos.length + b.eventos.length).toBe(16);
    expect(b.resto).toBe("");
  });

  it("un evento que no es JSON no rompe nada", () => {
    expect(partirSSE(": ping\n\ndata: no-json\n\n").eventos).toEqual([]);
  });
});

describe("crearAcumulador", () => {
  const reconstruir = (texto) => {
    const acc = crearAcumulador();
    const salidas = partirSSE(texto).eventos.map((e) => acc.consumir(e)).filter(Boolean);
    return { salidas, m: acc.mensaje() };
  };

  it("reconstruye el content igual que sin streaming", () => {
    const { m } = reconstruir(GRABADO);
    expect(m.content).toEqual([
      { type: "thinking", thinking: "Miro el calendario.", signature: "firma-abc" },
      { type: "text", text: "Voy a buscarlo." },
      { type: "tool_use", id: "tu_1", name: "ver_tareas", input: { cliente: "Baby Caleb" } },
    ]);
    expect(m.stop_reason).toBe("tool_use");
    expect(m.usage).toMatchObject({ input_tokens: 10, cache_read_input_tokens: 900, output_tokens: 42 });
  });

  it("va soltando el texto y el razonamiento según llegan", () => {
    const { salidas } = reconstruir(GRABADO);
    expect(salidas.filter((s) => s.tipo === "texto").map((s) => s.texto).join("")).toBe("Voy a buscarlo.");
    expect(salidas.filter((s) => s.tipo === "pensando").map((s) => s.texto).join("")).toBe("Miro el calendario.");
  });

  it("una entrada de herramienta cortada se marca, no se ejecuta a medias", () => {
    const cortado = [
      sse("content_block_start", { index: 0, content_block: { type: "tool_use", id: "tu_x", name: "editar", input: {} } }),
      sse("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: "{\"post_id\": \"a" } }),
      sse("content_block_stop", { index: 0 }),
      sse("message_delta", { delta: { stop_reason: "max_tokens" } }),
    ].join("");
    const { m } = reconstruir(cortado);
    expect(m.entradasRotas).toEqual(["tu_x"]);
    expect(m.content[0]).not.toHaveProperty("_entradaRota");
  });

  it("avisa de las búsquedas web del servidor", () => {
    const busqueda = [
      sse("content_block_start", { index: 0, content_block: { type: "server_tool_use", id: "srv_1", name: "web_search", input: {} } }),
      sse("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: "{\"query\":\"tendencias reels 2026\"}" } }),
      sse("content_block_stop", { index: 0 }),
    ].join("");
    const { salidas } = reconstruir(busqueda);
    expect(salidas).toEqual([{ tipo: "servidor", nombre: "web_search", entrada: { query: "tendencias reels 2026" } }]);
  });

  it("un evento de error queda en el mensaje", () => {
    const { m } = reconstruir(sse("error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }));
    expect(m.error).toEqual({ type: "overloaded_error", message: "Overloaded" });
  });
});
