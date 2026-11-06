import { describe, it, expect, vi, beforeEach } from "vitest";

// `generar_imagen` del asistente con un cliente: el modelo del cliente, el DIRECTOR si no llega una ficha, y la pieza por
// el SERVIDOR (control, proporción, logo). El costo se confirma antes de pagar al director.
const mejoras = [];
const pasos = [];
let kit = { modelos: { imagen: "nano-banana" } };
vi.mock("./estudio", async (original) => {
  const real = await original();
  return {
    ...real,
    leerEstudio: vi.fn(async () => ({ kit, archivos: [], productos: [] })),
    leerMotores: vi.fn(async () => ({ motores: { gemini: { activo: true }, meta: { activo: true } } })),
    mejorarIdea: vi.fn(async (_c, datos) => { mejoras.push(datos); return { idea: "Pieza: post 1:1.\nComposición: el sofá al centro.\nTexto (exacto): titular «Duerme mejor».", ficha: true }; }),
    pedirImagenes: vi.fn(),
  };
});
vi.mock("./piezaServidor", async (original) => {
  const real = await original();
  return { ...real, crearUnaEnServidor: vi.fn(async ({ paso }) => { pasos.push(paso); return { id: "a1", clave: "clientes/c1/estudio/a1.png", src: "/api/media/clientes/c1/estudio/a1.png" }; }) };
});

// «Crear imágenes sin preguntar» del espacio: lo que devolvería GET /api/ajustes.
let ajustes = {};
vi.mock("./db", async (original) => ({ ...(await original()), loadAjustes: vi.fn(async () => ajustes) }));

const { crearPiezaParaElChat, fraseDeConfirmar, fraseSinPreguntar } = await import("./piezaChat.js");
const { olvidarTope } = await import("./sinPreguntarApi.js");
const cliente = { id: "c1", name: "Dcasa" };

describe("la pieza del asistente, con las reglas del lote", () => {
  beforeEach(() => { mejoras.length = 0; pasos.length = 0; kit = { modelos: { imagen: "nano-banana" } }; ajustes = {}; olvidarTope(); });

  it("una idea suelta la diseña el director y va por el servidor con el modelo del cliente y el control", async () => {
    const r = await crearPiezaParaElChat({ cliente, idea: "un sofá en una sala", formato: "square", estilo: "servicios" });
    expect(mejoras[0]).toMatchObject({ idea: "un sofá en una sala", tipo: "imagen", proporcion: "1:1" });
    expect(pasos[0].pedido.modelo).toBe("nano-banana");
    expect(pasos[0].pedido.prompt).toContain("titular «Duerme mejor»");
    expect(pasos[0]).toMatchObject({ controlar: true, texto: "Duerme mejor" });
    expect(r.archivo.id).toBe("a1");
  });

  it("una FICHA llega tal cual (no se paga al director otra vez); el logo estampado lo pone el servidor", async () => {
    kit = { modelos: { imagen: "nano-banana" }, logo: "clientes/c1/logo.png", logoModo: "estampado" };
    await crearPiezaParaElChat({ cliente, idea: "Pieza: post 4:5.\nComposición: a la izquierda.\nTexto (exacto): titular «Hola».", formato: "vertical" });
    expect(mejoras).toHaveLength(0);
    expect(pasos[0].navegador).toEqual({ plantilla: null, logo: true });
    expect(pasos[0].texto).toBe("Hola");
  });

  it("si cuesta desde 0,50 $, primero el «sí»: no se crea nada ni se llama al director", async () => {
    kit = { modelos: { imagen: "nano-banana-pro" } };
    const { modeloPorId, estimar } = await import("./estudioCatalogo.js");
    const pro = modeloPorId("nano-banana-pro");
    if (!pro || estimar(pro, 1, { imageSize: "2K" }) < 0.5) return; // el catálogo cambió de precios: nada que confirmar
    const r = await crearPiezaParaElChat({ cliente, idea: "un sofá", formato: "square" });
    expect(r.confirmar).toBeGreaterThanOrEqual(0.5);
    expect(mejoras).toHaveLength(0);
    expect(pasos).toHaveLength(0);
  });
});

describe("generar_imagen con «crear imágenes sin preguntar» (Ajustes → IA)", () => {
  beforeEach(() => { mejoras.length = 0; pasos.length = 0; kit = { modelos: { imagen: "nano-banana" } }; ajustes = {}; olvidarTope(); });

  it("con el ajuste encendido, OTRO motor que sugiere el asistente se pregunta aunque sea barato, con su porqué", async () => {
    ajustes = { sin_preguntar_usd: 3 };
    const r = await crearPiezaParaElChat({ cliente, idea: "un sofá", formato: "square", modelo: "nano-banana-pro", motivoModelo: "el titular es largo" });
    expect(r.confirmar).toBeGreaterThan(0);
    expect(r.sugerencia).toBe("El asistente sugiere usar Nano Banana Pro en vez de Nano Banana (porque el titular es largo).");
    expect(pasos).toHaveLength(0);
    const frase = fraseDeConfirmar(r, false);
    expect(frase).toMatch(/NO SE CREÓ NADA/);
    expect(frase).toMatch(/SIN modelo/);
  });

  it("con el «sí», sale con el sugerido; sin modelo, con el del cliente y sin preguntar", async () => {
    ajustes = { sin_preguntar_usd: 3 };
    await crearPiezaParaElChat({ cliente, idea: "un sofá", formato: "square", modelo: "nano-banana-pro", confirmado: true });
    expect(pasos[0].pedido.modelo).toBe("nano-banana-pro");
    const r = await crearPiezaParaElChat({ cliente, idea: "un sofá", formato: "square" });
    expect(r.confirmar).toBeUndefined();
    expect(pasos[1].pedido.modelo).toBe("nano-banana");
  });

  it("apagado, otro motor barato sale como siempre (lo decide el costo)", async () => {
    const r = await crearPiezaParaElChat({ cliente, idea: "un sofá", formato: "square", modelo: "nano-banana-pro" });
    expect(r.confirmar).toBeUndefined();
    expect(pasos[0].pedido.modelo).toBe("nano-banana-pro");
    expect(fraseSinPreguntar(r)).toBe("");
  });

  it("un modelo inventado es un error que el asistente puede corregir", async () => {
    await expect(crearPiezaParaElChat({ cliente, idea: "un sofá", modelo: "inventado" })).rejects.toThrow(/no es un modelo de imagen con llave/);
  });
});
