import { describe, it, expect, vi, beforeEach } from "vitest";

// Lo que sale del visor: por el servidor (un encargo con el control), con la marca de hoy y el director en las versiones.
const encargos = [];
const versiones = [];
vi.mock("./piezaServidor", async (original) => {
  const real = await original();
  return {
    ...real,
    lanzarEnServidor: vi.fn(async (datos) => { encargos.push(datos); return { id: "e1" }; }),
    esperarEnServidor: vi.fn(async () => [{ id: "v1", archivo: { id: "n" }, error: "" }]),
  };
});
vi.mock("./estudio", async (original) => {
  const real = await original();
  return {
    ...real,
    versionesDeIdea: vi.fn(async (_c, datos) => { versiones.push(datos); return { versiones: ["Pieza: post 4:5.\nComposición: a la izquierda.\nTexto (exacto): titular «Desde 399 $»."] }; }),
    pedirImagenes: vi.fn(async () => ({ trabajo: { id: "t9" } })),
  };
});

const { pedirOtraIgual, pedirVersiones, pedirEdicion, textoTrasEditar } = await import("./visorEstudio.js");
const { modeloPorId } = await import("./estudioCatalogo.js");

const kit = { logo: "clientes/c1/logo.png", paleta: [{ hex: "#123456", nombre: "Azul", rol: "dominante" }] };
const a = {
  id: "a1", tipo: "imagen", src: "/api/media/clientes/c1/estudio/a1.png", clave: "clientes/c1/estudio/a1.png", carpetaId: "car",
  prompt: "Escena: Un sofá cama en una sala con el texto «Desde 399 $».\n\nIdentidad de la marca (obligatoria): Paleta estrictamente limitada a: rojo #FF0000. Sin texto inventado ni logos de otras marcas.",
  ajustes: { aspectRatio: "4:5", control: { texto: "Desde 399 $" } },
};
const p = { modelo: modeloPorId("nano-banana"), medios: { reference: ["clientes/c1/p/sofa.png"], faltaron: ["x"] }, ajustes: { aspectRatio: "4:5" }, carpetaId: "car" };

describe("lo que crea el visor, con las mismas reglas que el lote", () => {
  beforeEach(() => { encargos.length = 0; versiones.length = 0; });

  it("«Otra igual»: el mismo pedido con la marca de HOY, por el servidor y con el control", async () => {
    const r = await pedirOtraIgual({ clienteId: "c1", a, p, kit });
    const paso = encargos[0].pasos[0];
    expect(encargos[0].carpetaId).toBe("car");
    expect(paso.controlar).toBe(true);
    expect(paso.texto).toBe("Desde 399 $");
    expect(paso.pedido.prompt).toContain("Escena: Un sofá cama en una sala");
    expect(paso.pedido.prompt).toContain("#123456");
    expect(paso.pedido.prompt).not.toContain("#FF0000");
    expect(paso.pedido.medios).toEqual({ reference: ["clientes/c1/p/sofa.png", "clientes/c1/logo.png"] });
    expect(r.texto).toMatch(/ya revisada/);
  });

  it("«Versión distinta»: la pide al DIRECTOR mirando la original y con el mismo texto, aunque no tuviera ficha", async () => {
    await pedirVersiones({ clienteId: "c1", a, p, kit, n: 1 });
    expect(versiones[0]).toMatchObject({ n: 1, tipo: "imagen", original: a.src, texto: "Desde 399 $" });
    const paso = encargos[0].pasos[0];
    expect(paso.pedido.prompt.startsWith("Escena: Pieza: post 4:5.")).toBe(true);
    expect(paso.texto).toBe("Desde 399 $");
  });

  it("con el logo estampado, la versión se estampa; una pieza con el texto de plantilla, se le pone el mismo texto", async () => {
    const conPlantilla = { ...a, ajustes: { ...a.ajustes, plantilla: { texto: "Hola", plantilla: "banda" } } };
    await pedirOtraIgual({ clienteId: "c1", a: conPlantilla, p, kit: { ...kit, logoModo: "estampado" } });
    expect(encargos[0].pasos[0].navegador).toEqual({ plantilla: { texto: "Hola", plantilla: "banda", nombre: "version" }, logo: true });
    expect(encargos[0].pasos[0].controlar).toBe(false);
  });

  it("«Editar»: la misma imagen por el servidor; una ya estampada no se estampa otra vez", async () => {
    const estampada = { ...a, ajustes: { ...a.ajustes, plantilla: { texto: "", plantilla: "logo" } } };
    await pedirEdicion({ clienteId: "c1", a: estampada, instruccion: "el titular más arriba", activos: { gemini: true }, kit: { ...kit, logoModo: "estampado" } });
    const paso = encargos[0].pasos[0];
    expect(paso.pedido.medios.reference[0]).toBe(a.clave);
    expect(paso.pedido.prompt).toMatch(/^Edita la imagen de referencia: el titular más arriba/);
    expect(paso.navegador).toBeNull();
    expect(paso.texto).toBe("Desde 399 $");
  });

  it("el texto que debe quedar tras editar: el de antes, con el cambio si se dice «X» → «Y», o nada si no se sabe", () => {
    expect(textoTrasEditar("Desde 399 $", "el fondo más claro")).toBe("Desde 399 $");
    expect(textoTrasEditar("Sofa cama", "donde dice «Sofa» debe decir «Sofá»")).toBe("Sofá cama");
    expect(textoTrasEditar("Sofa cama", "pon «Oferta»")).toBe("");
  });
});
