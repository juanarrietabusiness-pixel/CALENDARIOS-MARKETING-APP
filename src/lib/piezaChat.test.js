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

const { crearPiezaParaElChat } = await import("./piezaChat.js");
const cliente = { id: "c1", name: "Dcasa" };

describe("la pieza del asistente, con las reglas del lote", () => {
  beforeEach(() => { mejoras.length = 0; pasos.length = 0; kit = { modelos: { imagen: "nano-banana" } }; });

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
