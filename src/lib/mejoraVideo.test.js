import { describe, it, expect } from "vitest";
import { planDeMejora, tramosDeAngulos, modeloQueEdita, duracionPara, proporcionPara, promptDeLook, promptDeAngulo, LOOKS, ANGULOS, textoDeMejora } from "./mejoraVideo.js";
import { modeloPorId, estimar, validarPedido } from "./estudioCatalogo.js";

const video = (extra = {}) => ({ clave: "clientes/c1/estudio/v.mp4", ancho: 1080, alto: 1920, duracion: 8, bytes: 10 * 1024 * 1024, ...extra });
const kie = { kie: true };

describe("«Mejorar mi video»: el plan", () => {
  it("sin la llave de Kie, ni el modo, ni lo que dura el video, no hay plan", () => {
    expect(planDeMejora({ modo: "look", look: "dorada", video: video(), activos: {} }).error).toMatch(/KIE_API_KEY/);
    expect(planDeMejora({ modo: "otro", video: video(), activos: kie }).ok).toBe(false);
    expect(planDeMejora({ modo: "look", look: "dorada", video: video({ duracion: 0 }), activos: kie }).error).toMatch(/medir/);
  });

  it("escalar: Topaz con el video y su factor, cobrado por lo que dura de verdad; hasta 50 MB", () => {
    const p = planDeMejora({ modo: "escalar", factor: "4", video: video({ duracion: 42 }), activos: kie });
    expect(p.ok).toBe(true);
    expect(p.pasos).toHaveLength(1);
    expect(p.pasos[0].pedido).toMatchObject({ modelo: "topaz-video-kie", ajustes: { factor: "4" }, medios: { video: ["clientes/c1/estudio/v.mp4"] } });
    expect(p.costo).toBeCloseTo(0.12 * 42, 3);
    expect(p.union.tramos).toEqual([{ fuente: 0, desde: 0, hasta: 42 }]);
    // El pedido pasa la validación del catálogo (prompt fijo, un video, sin referencias).
    expect(validarPedido(p.pasos[0].pedido).ok).toBe(true);
    expect(planDeMejora({ modo: "escalar", video: video({ bytes: 60 * 1024 * 1024 }), activos: kie }).error).toMatch(/50 MB/);
  });

  it("look: Omni 1.2 hasta 15 s (a 1080p), Seedance 2.5 hasta 30 s, y más largo no", () => {
    const corto = planDeMejora({ modo: "look", look: "estudio", video: video({ duracion: 8 }), activos: kie });
    expect(corto.modelo.id).toBe("gemini-omni-1-2-kie");
    expect(corto.pasos[0].pedido.ajustes).toEqual({ aspectRatio: "9:16", duration: "8", resolution: "1080p" });
    expect(corto.pasos[0].pedido.prompt).toMatch(/SOLO la luz y el color/);
    expect(corto.pasos[0].pedido.prompt).toContain(LOOKS.find((l) => l.id === "estudio").texto);
    expect(corto.costo).toBe(estimar(modeloPorId("gemini-omni-1-2-kie"), 1, corto.pasos[0].pedido.ajustes));
    expect(validarPedido(corto.pasos[0].pedido).ok).toBe(true);

    const medio = planDeMejora({ modo: "look", look: "noche", video: video({ duracion: 22, ancho: 1920, alto: 1080 }), activos: kie });
    expect(medio.modelo.id).toBe("seedance-2-5-kie");
    expect(medio.pasos[0].pedido.ajustes).toMatchObject({ aspectRatio: "16:9", duration: "30", resolution: "720p", sonido: "no" });
    expect(validarPedido(medio.pasos[0].pedido).ok).toBe(true);

    expect(planDeMejora({ modo: "look", look: "noche", video: video({ duracion: 45 }), activos: kie }).error).toMatch(/hasta 30 s/);
    expect(planDeMejora({ modo: "look", look: "inventado", video: video(), activos: kie }).ok).toBe(false);
  });

  it("cambiar: la instrucción en el prompt y las fotos como referencias (hasta 3)", () => {
    const p = planDeMejora({ modo: "cambiar", instruccion: "que la taza sea la de la foto", referencias: ["r1", "r2", "r3", "r4"], video: video(), activos: kie });
    expect(p.pasos[0].pedido.medios.reference).toEqual(["r1", "r2", "r3"]);
    expect(p.pasos[0].pedido.prompt).toMatch(/Cambia SOLO esto: que la taza sea la de la foto\./);
    expect(p.pasos[0].pedido.prompt).toMatch(/imágenes de referencia/);
    expect(validarPedido(p.pasos[0].pedido).ok).toBe(true);
    expect(planDeMejora({ modo: "cambiar", instruccion: "", video: video(), activos: kie }).ok).toBe(false);
  });

  it("ángulos: de 3 a 5, un paso por ángulo, el costo de todos, el aviso de la boca y el montaje sin copiar", () => {
    expect(planDeMejora({ modo: "angulos", angulos: ["cerca", "lateral"], video: video(), activos: kie }).ok).toBe(false);
    const p = planDeMejora({ modo: "angulos", angulos: ["cerca", "lateral", "picado"], video: video({ duracion: 10 }), activos: kie });
    expect(p.pasos.map((x) => x.id)).toEqual(["angulo-cerca", "angulo-lateral", "angulo-picado"]);
    expect(p.costo).toBeCloseTo(3 * estimar(modeloPorId("gemini-omni-1-2-kie"), 1, p.pasos[0].pedido.ajustes), 3);
    expect(p.aviso).toMatch(/boca no coincidirá/);
    expect(p.union.copiar).toBe(false);
    expect(p.pasos[1].pedido.prompt).toContain(ANGULOS.find((a) => a.id === "lateral").texto);
  });
});

describe("las piezas del plan", () => {
  it("el montaje de ángulos salta de cámara empezando por el original y cubre el video entero", () => {
    const t = tramosDeAngulos(10, 3);
    expect(t.map((x) => x.fuente)).toEqual(["original", 0, 1, 2, "original"]);
    expect(t[0].desde).toBe(0);
    expect(t.at(-1).hasta).toBe(10);
    for (let i = 1; i < t.length; i++) expect(t[i].desde).toBe(t[i - 1].hasta);
    // Un video corto: al menos un tramo por cámara.
    expect(tramosDeAngulos(3, 4)).toHaveLength(5);
  });

  it("modelo, duración y proporción", () => {
    expect(modeloQueEdita(15).id).toBe("gemini-omni-1-2-kie");
    expect(modeloQueEdita(15.5).id).toBe("seedance-2-5-kie");
    expect(modeloQueEdita(31)).toBeNull();
    expect(duracionPara(modeloPorId("gemini-omni-1-2-kie"), 7.2)).toBe(8);
    expect(duracionPara(modeloPorId("gemini-omni-1-2-kie"), 40)).toBe(15);
    expect(proporcionPara(modeloPorId("seedance-2-5-kie"), 1080, 1080)).toBe("1:1");
    expect(proporcionPara(modeloPorId("gemini-omni-1-2-kie"), 1080, 1350)).toBe("9:16");
  });

  it("los prompts piden conservar todo lo demás y van limpios", () => {
    expect(promptDeLook(LOOKS[0])).toMatch(/Conserva EXACTAMENTE/);
    expect(promptDeAngulo(ANGULOS[0])).toMatch(/misma toma/);
    expect(promptDeAngulo(ANGULOS[0])).toMatch(/Sin texto/);
  });

  it("cómo va la unión, en palabras", () => {
    expect(textoDeMejora({ union: { fase: "uniendo" } })).toMatch(/audio original/);
    expect(textoDeMejora({ union: { fase: "fallido", error: "Sin Container" } })).toBe("Sin Container");
    expect(textoDeMejora({ union: { fase: "nuevo" } })).toBe("");
  });
});
