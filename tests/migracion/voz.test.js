import { describe, it, expect, vi, afterEach } from "vitest";
import { muestraDeVoz, wavDePcm, frecuenciaDe, MODELOS_VOZ } from "../../worker/lib/estudio/voz.js";
import { limpiarKit, fundirKit } from "../../src/lib/kitMarca.js";

// La escucha previa de las voces del kit: Google se paga una vez por voz y queda en R2.

const r2 = () => {
  const guardado = new Map();
  return {
    guardado,
    get: async (k) => (guardado.has(k) ? { body: guardado.get(k) } : null),
    put: async (k, v) => { guardado.set(k, v); },
  };
};
const acceso = { leerUno: async () => null, leer: async () => [], sumar: async () => 0, insertar: vi.fn(async () => {}) };
const pcm = btoa(String.fromCharCode(1, 2, 3, 4));

afterEach(() => vi.unstubAllGlobals());

describe("la voz de la marca", () => {
  it("el PCM de Google sale como WAV que el navegador reproduce", () => {
    const wav = wavDePcm(new Uint8Array([1, 2, 3, 4]), 24000);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe("WAVE");
    expect(wav.length).toBe(48);
    expect(frecuenciaDe("audio/L16;codec=pcm;rate=16000")).toBe(16000);
    expect(frecuenciaDe("")).toBe(24000);
  });

  it("la primera vez la pide a Google con esa voz y la guarda; la segunda, no llama a nadie", async () => {
    const MEDIA = r2();
    const llamadas = [];
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      llamadas.push({ url, cuerpo: JSON.parse(init.body) });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: pcm } }] } }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 100 } }));
    }));
    const env = { MEDIA, GOOGLE_AI_KEY: "k" };
    const r = await muestraDeVoz(env, acceso, "kore");
    expect(r.nueva).toBe(true);
    expect(llamadas[0].url).toContain(`${MODELOS_VOZ[0]}:generateContent`);
    expect(llamadas[0].cuerpo.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Kore");
    expect(MEDIA.guardado.has("voces/kore.wav")).toBe(true);
    expect(acceso.insertar).toHaveBeenCalled();
    const otra = await muestraDeVoz(env, acceso, "kore");
    expect(otra.nueva).toBe(false);
    expect(llamadas).toHaveLength(1);
  });

  it("si la llave no tiene el primer modelo de voz, prueba el siguiente", async () => {
    const urls = [];
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      urls.push(url);
      if (urls.length === 1) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: pcm } }] } }] }));
    }));
    await muestraDeVoz({ MEDIA: r2(), GOOGLE_AI_KEY: "k" }, acceso, "puck");
    expect(urls[1]).toContain(MODELOS_VOZ[1]);
  });

  it("una voz que no existe no se pide, y el kit sólo guarda nombres de voz", async () => {
    await expect(muestraDeVoz({ MEDIA: r2(), GOOGLE_AI_KEY: "k" }, acceso, "inventada")).rejects.toThrow("no existe");
    expect(limpiarKit({ voz: "kore" }).voz).toBe("kore");
    expect(limpiarKit({ voz: "<script>" }).voz).toBe("");
    // «Volver a preparar con IA» no se lleva la voz.
    expect(fundirKit({ voz: "kore" }, {}).voz).toBe("kore");
  });
});
