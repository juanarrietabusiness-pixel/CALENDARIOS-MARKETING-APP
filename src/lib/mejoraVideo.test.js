import { describe, it, expect } from "vitest";
import { planDeMejora, tramosDeAngulos, modeloQueEdita, duracionPara, proporcionPara, promptDeLook, promptDeAngulo, LOOKS, ANGULOS, textoDeMejora } from "./mejoraVideo.js";
import { modeloPorId, estimar, validarPedido } from "./estudioCatalogo.js";

const video = (extra = {}) => ({ clave: "clientes/c1/estudio/v.mp4", ancho: 1080, alto: 1920, duracion: 8, bytes: 10 * 1024 * 1024, ...extra });
const kie = { kie: true };

describe("«Mejorar mi video»: el plan", () => {
  it("sin la llave de Kie, ni el modo, ni lo que dura el video, no hay plan", () => {
    expect(planDeMejora({ modo: "look", look: "dorada", video: video(), activos: {} }).error).toMatch(/KIE_API_KEY/);
    expect(planDeMejora({ modo: "otro", video: video(), activos: kie }).ok).toBe(false);
    // Lo que no usa IA no necesita la llave de Kie.
    expect(planDeMejora({ modo: "color", color: "calido", video: video(), activos: {} }).ok).toBe(true);
    expect(planDeMejora({ modo: "look", look: "dorada", video: video({ duracion: 0 }), activos: kie }).error).toMatch(/medir/);
  });

  it("escalar: Topaz con el video y su factor, cobrado por lo que dura de verdad; hasta 50 MB", () => {
    const p = planDeMejora({ modo: "escalar", factor: "4", video: video({ duracion: 42 }), activos: kie });
    expect(p.ok).toBe(true);
    expect(p.pasos).toHaveLength(1);
    expect(p.pasos[0].pedido).toMatchObject({ modelo: "topaz-video-kie", ajustes: { factor: "4" }, medios: { video: ["clientes/c1/estudio/v.mp4"] } });
    expect(p.costo).toBeCloseTo(0.12 * 42, 3);
    expect(p.union.versiones).toEqual([{ tramos: [{ fuente: 0, desde: 0, hasta: 42 }], copiar: true }]);
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
    // Seedance 2.5 admite 22 s exactos: no se pagan 30.
    expect(medio.pasos[0].pedido.ajustes).toMatchObject({ aspectRatio: "16:9", duration: "22", resolution: "720p", sonido: "no" });
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
    expect(p.union.versiones[0].copiar).toBe(false);
    expect(p.pasos[1].pedido.prompt).toContain(ANGULOS.find((a) => a.id === "lateral").texto);
  });
});

describe("lo nuevo: color, ganchos, entrada y cierre con IA, alargar", () => {
  it("color: gratis, sin pasos, una versión del video entero con su color", () => {
    const p = planDeMejora({ modo: "color", color: "cine", video: video({ duracion: 40 }), activos: {} });
    expect(p).toMatchObject({ costo: 0, pasos: [] });
    expect(p.union.versiones).toEqual([{ tramos: [{ fuente: "original", desde: 0, hasta: 40 }], copiar: false, color: "cine", titulo: "Cine" }]);
    expect(planDeMejora({ modo: "color", color: "inventado", video: video(), activos: {} }).ok).toBe(false);
  });

  it("ganchos sin IA: una versión por texto, abre con el momento fuerte (con el texto encima) y sigue con el video", () => {
    const p = planDeMejora({ modo: "ganchos", textos: ["¿Duermes con calor?", "Mira esto antes de comprar", "  "], momento: { desde: 6, hasta: 8 }, saltar: 1, video: video({ duracion: 20 }), activos: {}, paleta: ["#1340B1", "#FED00F"] });
    expect(p.costo).toBe(0);
    expect(p.union.versiones).toHaveLength(2);
    const v = p.union.versiones[0];
    expect(v.tramos).toEqual([{ fuente: "original", desde: 6, hasta: 8 }, { fuente: "original", desde: 1, hasta: 20 }]);
    expect(v.texto).toMatchObject({ texto: "¿Duermes con calor?", fondo: "#1340B1", color: "#FED00F" });
    // El momento no pasa de 4 s.
    const largo = planDeMejora({ modo: "ganchos", textos: ["Hola mundo"], momento: { desde: 0, hasta: 9 }, video: video({ duracion: 20 }), activos: {} });
    expect(largo.union.versiones[0].tramos[0].hasta).toBe(4);
    expect(planDeMejora({ modo: "ganchos", textos: [], video: video(), activos: {} }).ok).toBe(false);
  });

  it("entrada nueva con IA: Seedance 2.5 termina en el cuadro donde sigue el video; su audio, luego el original", () => {
    const p = planDeMejora({ modo: "gancho-ia", textos: ["Alguien cae de espaldas sobre la cama y rebota", "Primer plano de una mano que se hunde"], saltar: 2, video: video({ duracion: 20 }), activos: kie });
    expect(p.pasos).toHaveLength(2);
    expect(p.pasos[0].pedido).toMatchObject({ modelo: "seedance-2-5-kie", medios: { end: ["fotograma:2"] }, ajustes: { duration: "5", sonido: "si" } });
    expect(validarPedido({ ...p.pasos[0].pedido, medios: { end: ["clientes/c1/x.jpg"] } }).ok).toBe(true);
    expect(p.costo).toBeCloseTo(2 * estimar(modeloPorId("seedance-2-5-kie"), 1, p.pasos[0].pedido.ajustes), 3);
    expect(p.union.versiones[1]).toMatchObject({ requiere: [1], tramos: [{ fuente: 1, desde: 0, hasta: 5, audio: { fuente: 1, desde: 0 } }, { fuente: "original", desde: 2, hasta: 20 }] });
    expect(p.aviso).toMatch(/hablando a cámara/);
  });

  it("cierre nuevo con IA: sale del cuadro del corte y va después del video", () => {
    const p = planDeMejora({ modo: "cierre-ia", textos: ["La cama armada y la familia sonriendo"], saltar: 3, video: video({ duracion: 20 }), activos: kie });
    expect(p.pasos[0].pedido.medios).toEqual({ start: ["fotograma:17"] });
    expect(p.union.versiones[0].tramos).toEqual([{ fuente: "original", desde: 0, hasta: 17 }, { fuente: 0, desde: 0, hasta: 5, audio: { fuente: 0, desde: 0 } }]);
  });

  it("alargar: al final desde el último cuadro, al principio terminando en el primero", () => {
    const fin = planDeMejora({ modo: "alargar", segundos: 8, video: video({ duracion: 12 }), activos: kie });
    expect(fin.pasos[0].pedido).toMatchObject({ medios: { start: ["fotograma:-0.05"] }, ajustes: { duration: "8" } });
    expect(fin.union.versiones[0].tramos).toEqual([{ fuente: "original", desde: 0, hasta: 12 }, { fuente: 0, desde: 0, hasta: 8, audio: { fuente: 0, desde: 0 } }]);
    const ini = planDeMejora({ modo: "alargar", segundos: 5, hacia: "inicio", video: video({ duracion: 12 }), activos: kie });
    expect(ini.pasos[0].pedido.medios).toEqual({ end: ["fotograma:0"] });
    expect(ini.union.versiones[0].tramos[0].fuente).toBe(0);
    // Una duración que no se ofrece cae en 6.
    expect(planDeMejora({ modo: "alargar", segundos: 7, video: video(), activos: kie }).pasos[0].pedido.ajustes.duration).toBe("6");
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
