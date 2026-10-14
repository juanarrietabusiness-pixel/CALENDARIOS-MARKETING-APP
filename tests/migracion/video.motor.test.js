import { describe, it, expect, afterEach, vi } from "vitest";
import { motorDeVideo, limpiarModelos } from "../../worker/lib/configIA.js";
import { verVideo, limpiarFotogramas, ErrorVideo } from "../../worker/lib/geminiVideo.js";

// ============================================================
// Quién VE los videos: Gemini de pago, Gemini con la llave gratuita o Meta
// por fotogramas (Ajustes → IA → «Ver videos»).
// ============================================================

const JPEG = `/9j/${"A".repeat(200)}`;
const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "muse-spark-1.3", usage: { input_tokens: 3000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 900 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

afterEach(() => vi.unstubAllGlobals());

describe("el motor que ve los videos", () => {
  it("el elegido si tiene su llave; si no, el que la tenga, y lo dice", () => {
    const todas = { GOOGLE_AI_KEY: "g", GOOGLE_AI_KEY_GRATIS: "gg", META_API_KEY: "m" };
    expect(motorDeVideo(null, todas)).toMatchObject({ motor: "gemini", llave: "g", aviso: "" });
    expect(motorDeVideo({ ia_modelos: { video: "gemini-gratis" } }, todas)).toMatchObject({ motor: "gemini-gratis", llave: "gg" });
    expect(motorDeVideo({ ia_modelos: { video: "meta" } }, todas)).toMatchObject({ motor: "meta", llave: "m" });
    const sinGratis = motorDeVideo({ ia_modelos: { video: "gemini-gratis" } }, { GOOGLE_AI_KEY: "g" });
    expect(sinGratis).toMatchObject({ motor: "gemini", llave: "g" });
    expect(sinGratis.aviso).toMatch(/GOOGLE_AI_KEY_GRATIS/);
    expect(motorDeVideo(null, { META_API_KEY: "m" })).toMatchObject({ motor: "meta" });
    expect(motorDeVideo(null, {}).motor).toBeNull();
  });

  it("se guarda en ia_modelos.video, y sólo con un motor que existe", () => {
    expect(limpiarModelos({ video: "meta", imagen: "gemini" })).toEqual({ video: "meta", imagen: "gemini" });
    expect(limpiarModelos({ video: "otro" })).toEqual({});
  });

  it("los fotogramas: sólo JPEG en base64, de tamaño razonable, como mucho diez", () => {
    expect(limpiarFotogramas([{ segundo: 1.4, base64: JPEG }, { base64: "iVBOR" + "A".repeat(200) }, { base64: "/9j/<script>" }, null])).toEqual([{ segundo: 1, base64: JPEG }]);
    expect(limpiarFotogramas(Array.from({ length: 14 }, () => ({ base64: JPEG })))).toHaveLength(10);
  });
});

describe("Meta ve el video por fotogramas", () => {
  const env = { ANTHROPIC_API_KEY: "a", META_API_KEY: "m" };
  const pedido = { bytes: new Uint8Array([1]).buffer, mime: "video/mp4", prompt: "Analiza este video." };

  it("sin fotogramas: 409 `fotogramas`, para que el navegador los saque y vuelva a pedir", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const e = await verVideo(env, null, pedido).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorVideo);
    expect(e).toMatchObject({ estado: 409, codigo: "fotogramas" });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("con fotogramas: van a Muse Spark en orden, con su segundo, y se le dice que no hay audio", async () => {
    let cuerpo = null;
    let url = "";
    vi.stubGlobal("fetch", async (u, init) => {
      url = String(u);
      cuerpo = JSON.parse(init.body);
      return flujo("ESTRUCTURA: gancho, desarrollo y cierre.");
    });
    const texto = await verVideo(env, null, { ...pedido, fotogramas: [{ segundo: 0, base64: JPEG }, { segundo: 4, base64: JPEG }] });
    expect(texto).toBe("ESTRUCTURA: gancho, desarrollo y cierre.");
    expect(url).toMatch(/api\.meta\.ai/);
    expect(cuerpo.model).toBe("muse-spark-1.3");
    const partes = cuerpo.messages[0].content;
    expect(partes.filter((p) => p.type === "image")).toHaveLength(2);
    expect(partes[0]).toEqual({ type: "text", text: "Fotograma del segundo 0:" });
    expect(partes.at(-1).text).toMatch(/No tienes el audio[\s\S]*Analiza este video\./);
  });
});
