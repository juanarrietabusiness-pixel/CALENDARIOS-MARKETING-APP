import { describe, it, expect } from "vitest";
import {
  limpiarPedidoMusica, cuerpoSuno, pistasDeSuno, costoDeMusica, costoCobrado, modeloDelEstudio, modeloDeMusica, duracionParaVideo,
  dbDeVolumenGuion, MODELOS_MUSICA, DURACION_MUSICA,
} from "./musica.js";
import { validarGuion } from "./videoEscenas.js";
import { EJEMPLO_GUION } from "./videoFormatoIA.js";

// ============================================================
// La música de Suno por Kie: el pedido limpio, el cuerpo de createTask (docs/kie/suno.md) y leer las pistas
// ============================================================

describe("el pedido de la música", () => {
  it("instrumental por defecto, duración acotada, título del estilo y sin letra en una instrumental", () => {
    const { pedido } = limpiarPedidoMusica({ estilo: "  Acústica alegre, ukelele  ", letra: "no va", duracion: 900 });
    expect(pedido).toEqual({ modelo: "v6", estilo: "Acústica alegre, ukelele", letra: "", instrumental: true, duracion: DURACION_MUSICA.max, titulo: "Acústica alegre", evitar: "" });
    expect(limpiarPedidoMusica({ estilo: "x", duracion: 3 }).pedido.duracion).toBe(10);
    expect(limpiarPedidoMusica({ estilo: "x" }).pedido.duracion).toBe(30);
  });

  it("dice lo que falta: el estilo, la letra con voz, un modelo que no existe o una duración que no es número", () => {
    expect(limpiarPedidoMusica({}).error).toMatch(/Di qué música/);
    expect(limpiarPedidoMusica({ estilo: "pop", instrumental: false }).error).toMatch(/letra/);
    expect(limpiarPedidoMusica({ estilo: "pop", modelo: "v4" }).error).toMatch(/no existe/);
    expect(limpiarPedidoMusica({ estilo: "pop", duracion: "mucho" }).error).toMatch(/número/);
    expect(limpiarPedidoMusica({ estilo: "pop", instrumental: false, letra: "[Verse] hola" }).pedido.letra).toBe("[Verse] hola");
  });

  it("la duración para un video: lo que dura, hacia arriba", () => {
    expect(duracionParaVideo(23.2)).toBe(24);
    expect(duracionParaVideo(4)).toBe(10);
    expect(duracionParaVideo(0)).toBe(30);
  });
});

describe("el cuerpo de createTask", () => {
  it("modo personalizado con título, estilo, duración y el modelo de Suno; una instrumental sin prompt ni letra y sin voces", () => {
    const { pedido } = limpiarPedidoMusica({ estilo: "Lo-fi cálido", titulo: "Mañana", duracion: 20, modelo: "wild" });
    const c = cuerpoSuno(pedido);
    expect(c.model).toBe("ai-music-api/generate");
    expect(c.input).toMatchObject({ custom_mode: true, instrumental: true, model: "V6_WILD", title: "Mañana", duration: 20 });
    expect(c.input.style).toMatch(/^Lo-fi cálido\. Instrumental, no vocals\.$/);
    expect(c.input.negative_tags).toMatch(/vocals/);
    expect(c.input).not.toHaveProperty("prompt");
    expect(c.input).not.toHaveProperty("lyrics");
    expect(c).not.toHaveProperty("callBackUrl");
  });

  it("con voz cantada, la letra va en lyrics (nunca en prompt, que se cantaría tal cual)", () => {
    const { pedido } = limpiarPedidoMusica({ estilo: "pop latino", instrumental: false, letra: "[Chorus] Baby Caleb" });
    const c = cuerpoSuno(pedido);
    expect(c.input).toMatchObject({ instrumental: false, lyrics: "[Chorus] Baby Caleb", style: "pop latino" });
    expect(c.input).not.toHaveProperty("prompt");
    expect(c.input).not.toHaveProperty("negative_tags");
  });
});

describe("las pistas que entrega Suno", () => {
  const pista = (n) => ({ id: `a${n}`, audio_url: `https://tempfile.kie.test/${n}.mp3`, image_url: "https://x/y.jpeg", title: "Iron Man", duration: 30.5 });

  it("de response.data[], de resultJson (texto) o de resultUrls; sólo https", () => {
    expect(pistasDeSuno({ response: { data: [pista(1), pista(2)] } }).map((p) => p.url)).toEqual(["https://tempfile.kie.test/1.mp3", "https://tempfile.kie.test/2.mp3"]);
    expect(pistasDeSuno({ resultJson: JSON.stringify({ data: [pista(3)] }) })[0]).toMatchObject({ id: "a3", duracion: 30.5, titulo: "Iron Man" });
    expect(pistasDeSuno({ resultJson: JSON.stringify({ resultUrls: ["https://a/b.mp3", "http://inseguro/c.mp3"] }) }).map((p) => p.url)).toEqual(["https://a/b.mp3"]);
    expect(pistasDeSuno({ response: { data: [{ audio_url: "javascript:alert(1)" }] } })).toEqual([]);
    expect(pistasDeSuno({})).toEqual([]);
  });
});

describe("el costo y el modelo de la cola", () => {
  it("se cotiza un estimado y se apunta lo que Kie dice que cobró", () => {
    expect(costoDeMusica().usd).toBeGreaterThan(0);
    expect(costoCobrado({ creditsConsumed: 20 })).toBeCloseTo(0.1, 5);
    expect(costoCobrado({})).toBeNull();
  });

  it("cada modelo tiene su id del Estudio, de tipo audio y por la cola de Kie", () => {
    for (const m of Object.values(MODELOS_MUSICA)) {
      expect(modeloDelEstudio(m.id)).toMatchObject({ motor: "kie", tipo: "audio", musica: true, suno: m.suno });
      expect(modeloDeMusica(m.id)).toBe(m);
    }
    expect(modeloDelEstudio("elevenlabs-v3-kie")).toBeNull();
  });

  it("el volumen 0–1 del guion en los dB de la mezcla (0,35 = 0 dB)", () => {
    expect(dbDeVolumenGuion(0.35)).toBe(0);
    expect(dbDeVolumenGuion(0.7)).toBe(6);
    expect(dbDeVolumenGuion(0)).toBe(-12);
  });
});

describe("el campo «musica» del guion", () => {
  it("lleva el estilo y si es instrumental (lo lee generar_musica)", () => {
    const g = JSON.parse(JSON.stringify(EJEMPLO_GUION));
    g.musica = { estilo: "  acústica   alegre ", instrumental: false };
    const v = validarGuion(g);
    expect(v.ok).toBe(true);
    expect(v.guion.musica).toMatchObject({ estilo: "acústica alegre", instrumental: false, volumen: 0.35 });
    g.musica = { estilo: "pop" };
    expect(validarGuion(g).guion.musica).not.toHaveProperty("instrumental");
  });
});
