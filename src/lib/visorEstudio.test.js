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
    crearCarpeta: vi.fn(async (_c, nombre) => {
      carpetas.push(nombre);
      if (carpetas.length === 1) throw new Error("Ya hay una carpeta con ese nombre.");
      return { carpeta: { id: "cv", nombre } };
    }),
    cambiarArchivo: vi.fn(async (_c, id, cambios) => { movidos.push({ id, ...cambios }); return {}; }),
  };
});
const carpetas = [];
const movidos = [];

const { pedirOtraIgual, pedirVersiones, pedirEdicion, textoTrasEditar } = await import("./visorEstudio.js");
const estudio = await import("./estudio.js");
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

describe("«Variaciones para anuncios» desde el visor", () => {
  beforeEach(() => { encargos.length = 0; versiones.length = 0; carpetas.length = 0; movidos.length = 0; });

  it("el director mira la maestra; van juntas a su carpeta (con la maestra si estaba suelta), revisadas y sin ponerse en ningún post", async () => {
    const fichas = [1, 2, 3].map((n) => `Pieza: post 4:5 — variación ${n}.\nComposición: el sofá ${n}.\nTexto (exacto): titular «Variación ${n}»; apoyo «Desde 399 $».`);
    estudio.versionesDeIdea.mockImplementationOnce(async (_c, datos) => { versiones.push(datos); return { versiones: fichas, ejes: ["gancho", "angulo", "composicion"] }; });
    const suelta = { ...a, carpetaId: "" };
    const r = await pedirVersiones({ clienteId: "c1", a: suelta, p: { ...p, carpetaId: null }, kit, n: 3, para: "anuncios", uso: { calendarId: "cal", postId: "p1" } });
    expect(versiones[0]).toMatchObject({ n: 3, tipo: "imagen", para: "anuncios", original: a.src, texto: "Desde 399 $", sinTexto: false });
    // La primera ya existía: « (2)».
    expect(carpetas).toEqual(["Variaciones · Desde 399 $", "Variaciones · Desde 399 $ (2)"]);
    expect(movidos).toEqual([{ id: "a1", carpetaId: "cv" }]);
    expect(encargos[0].carpetaId).toBe("cv");
    expect(encargos[0].pasos).toHaveLength(3);
    expect(encargos[0].pasos.map((x) => x.texto)).toEqual(["Variación 1\nDesde 399 $", "Variación 2\nDesde 399 $", "Variación 3\nDesde 399 $"]);
    for (const paso of encargos[0].pasos) {
      expect(paso.controlar).toBe(true);
      expect(paso.pedido.postId).toBeUndefined();
    }
    expect(r.texto).toMatch(/^Pedidas 3 variaciones para anuncios con .+ \(otro gancho \(beneficio\), otro ángulo de la escena, otra composición\): quedan juntas en la carpeta «Variaciones · Desde 399 \$ \(2\)», con la maestra, ya revisadas\./);
  });

  it("con el texto de la plantilla encima, sin gancho: el mismo texto se pone otra vez encima", async () => {
    estudio.versionesDeIdea.mockImplementationOnce(async (_c, datos) => { versiones.push(datos); return { versiones: ["Pieza: post 4:5.\nComposición: x."], ejes: ["angulo"] }; });
    const conPlantilla = { ...a, ajustes: { ...a.ajustes, plantilla: { texto: "Hola", plantilla: "banda" } } };
    await pedirVersiones({ clienteId: "c1", a: conPlantilla, p, kit, n: 3, para: "anuncios" });
    expect(versiones[0]).toMatchObject({ texto: "", sinTexto: true });
    expect(movidos).toEqual([]);
  });
});
