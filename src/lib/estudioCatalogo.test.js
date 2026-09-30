import { describe, it, expect } from "vitest";
import {
  MODELOS, PRECIOS_AL, CONFIRMAR_DESDE, MAX_POR_PEDIDO, MAX_VIDEOS_POR_PEDIDO, ajustesDe, duracionDe, modeloPorId, modeloPorDefecto, estimar, textoCosto,
  pideConfirmar, normalizarAjustes, validarPedido, diasQueQuedan, DIAS_PAPELERA, proporcionDe, MEDIDAS,
} from "./estudioCatalogo.js";
import { claveDeArchivo, claveDelCliente, slugCorto, medidasDe, tipoPorBytes, extensionDe, esDelEstudio } from "../../worker/lib/estudio/archivos.js";

describe("el catálogo cumple sus propias reglas", () => {
  it("tiene modelos, con id único", () => {
    expect(MODELOS.length).toBeGreaterThan(3);
    expect(new Set(MODELOS.map((m) => m.id)).size).toBe(MODELOS.length);
  });

  it("todo modelo declara motor, nombre, tipo y un costo numérico", () => {
    for (const m of MODELOS) {
      expect(m.motor, m.id).toBeTruthy();
      expect(m.nombre, m.id).toBeTruthy();
      expect(["imagen", "video"]).toContain(m.tipo);
      expect(Number.isFinite(m.costo) && m.costo >= 0, `${m.id} sin costo`).toBe(true);
    }
  });

  it("todo ajuste trae su valor por defecto entre los permitidos", () => {
    for (const m of MODELOS) {
      for (const [nombre, def] of Object.entries(m.ajustes)) {
        expect(def.valores, `${m.id}.${nombre}`).toContain(def.defecto);
      }
    }
  });

  it("un modelo de imagen no acepta fotogramas ni video (eso es de los modelos de video)", () => {
    for (const m of MODELOS.filter((x) => x.tipo === "imagen")) {
      expect(m, m.id).not.toHaveProperty("inicial");
      expect(m, m.id).not.toHaveProperty("final");
      expect(Object.keys(m.ajustes), m.id).not.toContain("duration");
    }
  });

  it("todo modelo con proporción tiene sus medidas, y los gemini llevan el id que espera Google", () => {
    for (const m of MODELOS) {
      for (const p of m.ajustes.aspectRatio?.valores ?? []) expect(MEDIDAS[p], `${m.id} ${p}`).toBeTruthy();
      if (m.motor === "gemini") expect(m.gid, m.id).toMatch(/^(gemini|veo)-/);
    }
  });

  it("los precios están fechados y no pasan de 90 días sin revisarse", () => {
    expect(PRECIOS_AL).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dias = (Date.now() - Date.parse(PRECIOS_AL)) / 86_400_000;
    expect(dias, `Los precios del Estudio son del ${PRECIOS_AL}: revísalos en las páginas de cada proveedor y actualiza PRECIOS_AL`).toBeLessThan(90);
  });

  it("los que no son exactos se rotulan como estimados", () => {
    for (const m of MODELOS.filter((x) => x.motor === "gemini" && x.gid !== "gemini-2.5-flash-image")) {
      expect(m.estimado, m.id).toBe(true);
      expect(m.nota, m.id).toMatch(/aproximado/i);
    }
  });
});

describe("costo y confirmación", () => {
  it("estima por imagen, redondeado, y sin salirse de los límites", () => {
    expect(estimar("nano-banana", 1)).toBe(0.039);
    expect(estimar("nano-banana", 3)).toBe(0.117);
    expect(estimar("prueba", 5)).toBe(0);
    expect(estimar("nano-banana", 99)).toBe(estimar("nano-banana", MAX_POR_PEDIDO));
    expect(estimar("nano-banana", 0)).toBe(0.039);
    expect(estimar("no-existe", 2)).toBe(0);
  });

  it("dice el costo en español", () => {
    expect(textoCosto(0)).toBe("gratis");
    expect(textoCosto(0.039)).toBe("≈ 0,039 $");
    expect(textoCosto(1.072)).toBe("≈ 1,07 $");
  });

  it("pide confirmar a partir de 0,50 $", () => {
    expect(pideConfirmar(CONFIRMAR_DESDE - 0.001)).toBe(false);
    expect(pideConfirmar(CONFIRMAR_DESDE)).toBe(true);
  });
});

describe("validar un pedido", () => {
  it("lo deja limpio", () => {
    const r = validarPedido({ modelo: "nano-banana", prompt: "  una taza  ", n: "2", ajustes: { aspectRatio: "4:5", raro: 1 } });
    expect(r.ok).toBe(true);
    expect(r.pedido).toMatchObject({ prompt: "una taza", n: 2, ajustes: { aspectRatio: "4:5" }, costoEstimado: 0.078, medios: {} });
  });

  it("rechaza con un motivo en español", () => {
    expect(validarPedido({ modelo: "x", prompt: "a" })).toMatchObject({ ok: false, error: expect.stringMatching(/no existe/) });
    expect(validarPedido({ modelo: "prueba", prompt: "" })).toMatchObject({ ok: false, error: expect.stringMatching(/Escribe/) });
    expect(validarPedido({ modelo: "prueba", prompt: "a", n: 0 }).ok).toBe(false);
    expect(validarPedido({ modelo: "prueba", prompt: "a", n: 1.5 }).ok).toBe(false);
  });

  it("cuenta las referencias contra lo que admite el modelo", () => {
    const r4 = ["a", "b", "c", "d"];
    expect(validarPedido({ modelo: "nano-banana", prompt: "a", medios: { reference: r4 } }).ok).toBe(false);
    expect(validarPedido({ modelo: "nano-banana-2", prompt: "a", medios: { reference: r4 } }).ok).toBe(true);
    // Repetir la misma no cuenta dos veces.
    expect(validarPedido({ modelo: "nano-banana", prompt: "a", medios: { reference: ["a", "a", "a", "a"] } }).ok).toBe(true);
  });

  it("los ajustes se normalizan al modelo", () => {
    expect(normalizarAjustes("nano-banana", { imageSize: "4K" })).toEqual({ aspectRatio: "1:1" });
    expect(normalizarAjustes("nano-banana-pro", { imageSize: "4K", aspectRatio: "9:16" })).toEqual({ aspectRatio: "9:16", imageSize: "4K" });
    expect(proporcionDe({ aspectRatio: "9:16" })).toBe("9:16");
    expect(proporcionDe({ aspectRatio: "raro" })).toBe("1:1");
  });

  it("el modelo por defecto es uno real si su motor tiene llave, y la prueba si no", () => {
    expect(modeloPorDefecto({ gemini: true }).id).toBe("nano-banana");
    expect(modeloPorDefecto({}).id).toBe("prueba");
    // Y lo mismo para video: Veo Lite (el más barato) con llave, la prueba sin ella.
    expect(modeloPorDefecto({ gemini: true }, "video").id).toBe("veo-3.1-lite");
    expect(modeloPorDefecto({}, "video").id).toBe("prueba-video");
    expect(modeloPorId("nano-banana").motor).toBe("gemini");
  });
});

describe("la papelera", () => {
  it("dice cuántos días quedan", () => {
    const hoy = Date.parse("2026-10-01T12:00:00Z");
    expect(diasQueQuedan("2026-10-01T12:00:00Z", hoy)).toBe(DIAS_PAPELERA);
    expect(diasQueQuedan("2026-09-20T12:00:00Z", hoy)).toBe(DIAS_PAPELERA - 11);
    expect(diasQueQuedan("2026-08-01T12:00:00Z", hoy)).toBe(0);
    expect(diasQueQuedan("no es fecha", hoy)).toBe(DIAS_PAPELERA);
  });
});

describe("claves y archivos", () => {
  it("la clave cuelga del cliente, lleva la fecha y NUNCA se repite", () => {
    const fecha = new Date("2026-09-30T10:00:00Z");
    const a = claveDeArchivo("c1", "Café con ñandú", "image/png", { fecha });
    const b = claveDeArchivo("c1", "Café con ñandú", "image/png", { fecha });
    expect(a).toMatch(/^clientes\/c1\/estudio\/2026-09\/2026-09-30-cafe-con-nandu-[0-9a-f]{8}\.png$/);
    expect(a).not.toBe(b);
  });

  it("el slug es corto, sin acentos ni símbolos, y nunca queda vacío", () => {
    expect(slugCorto("¡Hola, Mundo! ☕")).toBe("hola-mundo");
    expect(slugCorto("")).toBe("imagen");
    expect(slugCorto("a".repeat(100)).length).toBeLessThanOrEqual(40);
  });

  it("la extensión sale del tipo, no de lo que traiga el proveedor", () => {
    expect(extensionDe("image/jpeg")).toBe("jpg");
    expect(extensionDe("text/html")).toBe("bin");
  });

  it("sólo se acepta una clave del cliente, sin subir directorios", () => {
    expect(claveDelCliente("/api/media/clientes/c1/estudio/x.png", "c1")).toBe("clientes/c1/estudio/x.png");
    expect(claveDelCliente("clientes/c2/x.png", "c1")).toBeNull();
    expect(claveDelCliente("clientes/c1/../c2/x.png", "c1")).toBeNull();
    expect(claveDelCliente("cerebro/c1/indice.json", "c1")).toBeNull();
    expect(esDelEstudio("clientes/c1/estudio/x.png")).toBe(true);
    expect(esDelEstudio("clientes/c1/generadas/x.png")).toBe(false);
  });

  it("reconoce los tipos por sus primeros bytes", () => {
    expect(tipoPorBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0]))).toBe("image/png");
    expect(tipoPorBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(tipoPorBytes(new TextEncoder().encode("<svg xmlns=…"))).toBeNull();
    expect(tipoPorBytes(new TextEncoder().encode("<html>"))).toBeNull();
  });

  it("lee las medidas de un PNG y de un JPEG mirando sólo su cabecera", () => {
    const png = new Uint8Array(33);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    new DataView(png.buffer).setUint32(16, 896);
    new DataView(png.buffer).setUint32(20, 1152);
    expect(medidasDe(png, "image/png")).toEqual({ ancho: 896, alto: 1152 });
    // SOI, un APP0 de 16 bytes y un SOF0 de 1080×1350.
    const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0x46, 0x04, 0x38, 0x03]);
    expect(medidasDe(jpg, "image/jpeg")).toEqual({ ancho: 1080, alto: 1350 });
    expect(medidasDe(new Uint8Array(4), "image/png")).toEqual({ ancho: 0, alto: 0 });
  });
});

describe("el video", () => {
  const videos = MODELOS.filter((m) => m.tipo === "video");

  it("hay modelos de video, cobran por segundo y declaran su duración", () => {
    expect(videos.length).toBeGreaterThan(2);
    for (const m of videos) {
      expect(m.por, m.id).toBe("s");
      expect(m.ajustes.duration, m.id).toBeDefined();
      expect(m.ajustes.duration.valores.map(Number).every((n) => n > 0), m.id).toBe(true);
    }
  });

  it("un modelo de imagen no lleva imagen inicial ni final; uno de video sí puede", () => {
    for (const m of MODELOS.filter((x) => x.tipo === "imagen")) { expect(m.inicial ?? 0, m.id).toBe(0); expect(m.final ?? 0, m.id).toBe(0); }
    expect(videos.some((m) => m.inicial)).toBe(true);
  });

  it("estima por segundo: 4 s de Veo Fast son 0,60 $ y 8 s de Lite, 0,40 $", () => {
    expect(estimar("veo-3.1-fast", 1, { duration: "4" })).toBe(0.6);
    expect(estimar("veo-3.1-lite", 1, { duration: "8" })).toBe(0.4);
    expect(estimar("veo-3.1-lite", 2, { duration: "8" })).toBe(0.8);
    // Sin ajustes, la duración por defecto del modelo.
    expect(estimar("veo-3.1-lite")).toBe(estimar("veo-3.1-lite", 1, { duration: "8" }));
    expect(duracionDe(modeloPorId("veo-3.1"), { duration: "6" })).toBe(6);
    expect(estimar("prueba-video", 2, { duration: "5" })).toBe(0);
  });

  it("un pedido de video pasa de 2 a rechazarse", () => {
    expect(validarPedido({ modelo: "veo-3.1-lite", prompt: "a", n: MAX_VIDEOS_POR_PEDIDO }).ok).toBe(true);
    expect(validarPedido({ modelo: "veo-3.1-lite", prompt: "a", n: MAX_VIDEOS_POR_PEDIDO + 1 })).toMatchObject({ ok: false, error: expect.stringMatching(/videos/) });
  });

  it("las reglas de Veo: 1080p sólo en 8 s, y con referencias, 720p horizontal", () => {
    expect(ajustesDe("veo-3.1", { resolution: "1080p", duration: "4" })).toMatchObject({ resolution: "1080p", duration: "8" });
    expect(ajustesDe("veo-3.1", { aspectRatio: "9:16", resolution: "1080p" }, { reference: ["a"] })).toMatchObject({ aspectRatio: "16:9", resolution: "720p" });
    const r = validarPedido({ modelo: "veo-3.1", prompt: "a", medios: { reference: ["a", "b"] }, ajustes: { aspectRatio: "9:16" } });
    expect(r.pedido.ajustes).toMatchObject({ aspectRatio: "16:9", resolution: "720p" });
  });

  it("la imagen inicial y la final: una de cada, la final necesita la inicial y Lite no lleva final", () => {
    expect(validarPedido({ modelo: "veo-3.1-fast", prompt: "a", medios: { start: ["a"], end: ["b"] } }).ok).toBe(true);
    expect(validarPedido({ modelo: "veo-3.1-fast", prompt: "a", medios: { end: ["b"] } })).toMatchObject({ ok: false, error: expect.stringMatching(/inicial/) });
    expect(validarPedido({ modelo: "veo-3.1-fast", prompt: "a", medios: { start: ["a", "b"] } }).ok).toBe(false);
    expect(validarPedido({ modelo: "veo-3.1-lite", prompt: "a", medios: { start: ["a"], end: ["b"] } })).toMatchObject({ ok: false, error: expect.stringMatching(/no admite imagen final/) });
    expect(validarPedido({ modelo: "nano-banana", prompt: "a", medios: { start: ["a"] } })).toMatchObject({ ok: false, error: expect.stringMatching(/no admite imagen inicial/) });
    expect(validarPedido({ modelo: "veo-3.1", prompt: "a", medios: { start: ["a"], reference: ["b"] } }).ok).toBe(false);
  });
});
