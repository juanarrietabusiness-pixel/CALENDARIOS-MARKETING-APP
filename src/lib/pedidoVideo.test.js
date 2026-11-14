import { describe, it, expect } from "vitest";
import { armarPedidoVideo, cortarTexto, acortarParte, limiteDeStoryboard, MAX_PEDIDO_VIDEO, TOPE_PARTE } from "./pedidoVideo";
import { promptDeReel } from "./reel";
import { pedidoDeClip } from "./reelPedidos";
import { promptDeVideoProducto, MAX_PROMPT_VIDEO_PRODUCTO } from "./videoProducto";
import { modeloPorId } from "./estudioCatalogo";
import { SIN_TEXTO_VIDEO } from "./videoLimpio";

const largo = (n, palabra = "luz") => Array.from({ length: n }, (_, i) => `${palabra}${i}`).join(" ");

describe("el pedido de video: corto y en orden", () => {
  it("se arma SIEMPRE en el mismo orden: lo fijo, sujeto, acción, luz, cámara, movimiento, sonido y lo fijo del final", () => {
    const t = armarPedidoVideo({
      inicio: "INICIO.", sonido: "SONIDO.", movimiento: "MOVIMIENTO.", camara: "CAMARA.", luz: "LUZ.", accion: "ACCION.", sujeto: "SUJETO.", fin: "FIN.",
    });
    expect(t.split("\n")).toEqual(["INICIO.", "SUJETO.", "ACCION.", "LUZ.", "CAMARA.", "MOVIMIENTO.", "SONIDO.", "FIN."]);
  });

  it("lo que cabe no se toca", () => {
    const partes = { inicio: "Video de 8 segundos.", sujeto: "Una mamá joven.", accion: "Abre la caja.", camara: "Cámara: lenta." };
    expect(armarPedidoVideo(partes)).toBe("Video de 8 segundos.\nUna mamá joven.\nAbre la caja.\nCámara: lenta.");
  });

  it("si pasa de 1.000 recorta al revés: primero el sonido y el movimiento, lo último el sujeto; nunca lo fijo", () => {
    const t = armarPedidoVideo({
      inicio: "Video vertical de 10 segundos.",
      sujeto: `Sujeto: ${largo(40, "mama")}.`,
      accion: `Acción: ${largo(40, "abre")}.`,
      luz: `Luz: ${largo(40, "luz")}.`,
      camara: `Cámara: ${largo(30, "dolly")}.`,
      movimiento: `Movimiento: ${largo(30, "gira")}.`,
      sonido: `Sonido: ${largo(60, "pop")}.`,
      fin: "Voz: «Duerme mejor desde hoy».",
    });
    expect(t.length).toBeLessThanOrEqual(MAX_PEDIDO_VIDEO);
    expect(t.startsWith("Video vertical de 10 segundos.")).toBe(true);
    expect(t.endsWith("Voz: «Duerme mejor desde hoy».")).toBe(true);
    // El sujeto queda entero; lo de atrás se fue o se acortó.
    expect(t).toContain(`Sujeto: ${largo(40, "mama")}.`);
    const sonido = t.split("\n").find((l) => l.startsWith("Sonido:")) ?? "";
    expect(sonido.length).toBeLessThan(`Sonido: ${largo(60, "pop")}.`.length);
  });

  it("un bloque de la marca larguísimo se COMPRIME a su tope antes de quitarle nada a la cámara", () => {
    const t = armarPedidoVideo({
      inicio: "Video.", sujeto: "La mamá.", accion: "Abre la caja.", luz: largo(400, "marca"), camara: "Cámara: acercamiento lento.", movimiento: "Gira suave.",
    });
    expect(t.length).toBeLessThanOrEqual(MAX_PEDIDO_VIDEO);
    expect(t).toContain("Cámara: acercamiento lento.");
    expect(t).toContain("Gira suave.");
    const luz = t.split("\n")[3];
    expect(luz.length).toBeLessThan(largo(400, "marca").length);
    // Con lo demás largo también, la luz baja hasta cerca de su tope (lo justo para caber) y nada más se corta.
    const dos = armarPedidoVideo({ inicio: "Video.", sujeto: largo(40, "mama"), accion: largo(60, "abre"), luz: largo(400, "marca"), camara: "Cámara: acercamiento lento." });
    expect(dos.length).toBeLessThanOrEqual(MAX_PEDIDO_VIDEO);
    expect(dos).toContain("Cámara: acercamiento lento.");
    expect(dos.split("\n")[3].length).toBeLessThan(TOPE_PARTE.luz + 60);
  });

  it("un storyboard acorta TODOS los planos por igual: ninguno desaparece mientras se pueda", () => {
    const planos = Array.from({ length: 6 }, (_, i) => `[${i}–${i + 1} s] ${largo(40, `p${i}x`)}`);
    const t = armarPedidoVideo({ inicio: "Reel.", accion: planos, max: 900 });
    expect(t.length).toBeLessThanOrEqual(900);
    for (let i = 0; i < 6; i++) expect(t).toContain(`[${i}–${i + 1} s]`);
  });

  it("cortar no parte palabras ni deja un conector colgando, y termina en punto", () => {
    expect(cortarTexto("La mamá abre la caja con cuidado y sonríe a la cámara", 30)).toBe("La mamá abre la caja.");
    expect(cortarTexto("corto", 30)).toBe("corto");
    expect(cortarTexto("Uno. Dos tres cuatro cinco seis", 8)).toBe("Uno.");
    expect(cortarTexto("algo", 1)).toBe("");
    expect(acortarParte(["a b c d e f g h i j k l m n o p"], 10)).toEqual([]);
  });

  it("un storyboard puede medir algo más que un plano: 1.000 y 250 por cada plano más, hasta 2.500", () => {
    expect(limiteDeStoryboard(1)).toBe(1000);
    expect(limiteDeStoryboard(4)).toBe(1750);
    expect(limiteDeStoryboard(20)).toBe(2500);
    expect(limiteDeStoryboard()).toBe(1000);
  });
});

describe("los tres pedidos de video, ya cortos", () => {
  const estiloLargo = largo(500, "marca");

  it("el clip de un plano: como mucho 1.000, con la escena, la cámara, sin voz y SIN_TEXTO_VIDEO aunque el kit sea enorme", () => {
    const c = pedidoDeClip({ modelo: modeloPorId("kling-3-kie"), plano: { escena: "La mamá abre la caja", camara: "acercamiento lento" }, fotograma: { clave: "clientes/c1/f.png" }, hilo: "fondo crema, luz cálida", estilo: estiloLargo, segundos: 5 });
    expect(c.prompt.length).toBeLessThanOrEqual(MAX_PEDIDO_VIDEO);
    expect(c.prompt).toContain("Qué pasa: La mamá abre la caja");
    expect(c.prompt).toContain("Cámara: acercamiento lento.");
    expect(c.prompt).toContain("Sin voz ni música");
    expect(c.prompt).toContain(SIN_TEXTO_VIDEO);
    // El orden: lo que pasa antes que la luz y la luz antes que la cámara.
    expect(c.prompt.indexOf("Qué pasa:")).toBeLessThan(c.prompt.indexOf("Lo que se mantiene"));
    expect(c.prompt.indexOf("Lo que se mantiene")).toBeLessThan(c.prompt.indexOf("Cámara:"));
  });

  it("el video con storyboard: la voz entre comillas y la duración sobreviven al recorte; los planos, todos", () => {
    const planos = Array.from({ length: 5 }, (_, i) => ({ desde: i * 2, hasta: i * 2 + 2, escena: `Plano ${i}: ${largo(30, "escena")}`, camara: "dolly" }));
    const v = promptDeReel({ planos, estilo: estiloLargo, hilo: largo(60, "hilo"), musica: largo(80, "pop"), locucion: "Duerme mejor desde hoy", segundos: 10, conStoryboard: true });
    expect(v.length).toBeLessThanOrEqual(limiteDeStoryboard(5));
    expect(v).toMatch(/^Reel vertical 9:16 de 10 segundos/);
    expect(v).toContain("«Duerme mejor desde hoy»");
    expect(v).toContain(SIN_TEXTO_VIDEO);
    for (const p of planos) expect(v).toContain(`[${p.desde}–${p.hasta} s] Plano`);
  });

  it("el del producto: como mucho 1.000, la voz exacta, sin texto y la imagen final", () => {
    const guion = {
      segundos: 12,
      tramos: [{ desde: 0, hasta: 4, accion: largo(80, "gancho") }, { desde: 4, hasta: 9, accion: largo(80, "uso") }, { desde: 9, hasta: 12, accion: "Cierre en el producto." }],
      camara: largo(40, "cam"), musica: largo(40, "mus"), locucion: "Tu bebé seco toda la noche.",
    };
    const v = promptDeVideoProducto(guion);
    expect(MAX_PROMPT_VIDEO_PRODUCTO).toBe(1000);
    expect(v.length).toBeLessThanOrEqual(MAX_PROMPT_VIDEO_PRODUCTO);
    expect(v).toContain("dice exactamente: «Tu bebé seco toda la noche.»");
    expect(v).toMatch(/termina exactamente en la imagen final/);
    expect(v).toMatch(/Sin texto ni subtítulos/);
    expect(v).toContain("9–12 s: Cierre en el producto.");
  });
});
