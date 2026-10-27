import { describe, it, expect, vi, beforeEach } from "vitest";

// La red del Estudio, de mentira: lo que se comprueba es el PEDIDO que sale.
const pedidos = [];
const mejoras = [];
vi.mock("./estudio", async (original) => {
  const real = await original();
  return {
    ...real,
    leerEstudio: vi.fn(async () => ({ kit: { logo: "clientes/c1/logo.png" }, archivos: [], trabajos: [], productos: [] })),
    leerMotores: vi.fn(async () => ({ motores: { gemini: { activo: true } } })),
    versionesDeIdea: vi.fn(async () => ({ versiones: ["El sofá en un balcón al atardecer."] })),
    mejorarIdea: vi.fn(async (_c, datos) => { mejoras.push(datos); return { idea: "Pieza: post 4:5.\nImagen principal: el sofá en un balcón al atardecer.", ficha: true }; }),
    pedirImagenes: vi.fn(async (_c, datos) => { pedidos.push(datos); return { trabajo: { id: "t1", estado: "hecho" } }; }),
    apuntarUso: vi.fn(async () => null),
  };
});
vi.mock("./carruselEstudio", () => ({ esperarArchivos: vi.fn(async () => [{ id: "a2", clave: "clientes/c1/estudio/n.png", src: "/api/media/clientes/c1/estudio/n.png", tipo: "imagen" }]) }));
vi.mock("./controlEstudio", () => ({ controlEncendido: () => false, controlarYCorregir: vi.fn() }));

const { recrearConLaMarca, otraVersionDelPost } = await import("./otraVersion.js");

const client = { id: "c1", name: "Dcasa" };
const post = { id: "p1", format: "post", idea: "Sofá cama en oferta", textoPieza: "Sofá cama 399 $" };

describe("otra versión y recrear, en la publicación", () => {
  beforeEach(() => { pedidos.length = 0; mejoras.length = 0; });

  it("«Recrear con mi marca»: la referencia va PRIMERO, con lo que se toma de ella, y el logo detrás", async () => {
    const nueva = await recrearConLaMarca({ client, post, medio: { src: "/api/media/clientes/c1/posts/anuncio.jpg", tipo: "imagen" } });
    expect(nueva.id).toBe("a2");
    expect(pedidos[0].medios.reference[0]).toBe("clientes/c1/posts/anuncio.jpg");
    expect(pedidos[0].medios.reference).toContain("clientes/c1/logo.png");
    expect(pedidos[0].prompt).toContain("Recrea la pieza de referencia para Dcasa");
    expect(pedidos[0].prompt).toContain("Sofá cama 399 $");
  });

  it("una referencia que no es de este cliente no se manda", async () => {
    await expect(recrearConLaMarca({ client, post, medio: { src: "/api/media/clientes/otro/x.jpg", tipo: "imagen" } })).rejects.toThrow(/almacén de este cliente/);
    expect(pedidos).toHaveLength(0);
  });

  it("«Otra versión» de una imagen subida: la diseña otra vez el director de arte, sin la imagen vieja de referencia", async () => {
    await otraVersionDelPost({ client, post, medio: { src: "/api/media/clientes/c1/posts/vieja.jpg", tipo: "imagen" } });
    expect(pedidos[0].prompt).toContain("balcón al atardecer");
    expect(mejoras[0].texto).toBe("Sofá cama 399 $");
    expect(pedidos[0].medios.reference ?? []).not.toContain("clientes/c1/posts/vieja.jpg");
  });

  it("lo que pide la agencia MANDA: va al director y delante del pedido", async () => {
    await otraVersionDelPost({ client, post, indicacion: "fondo blanco", medio: { src: "/api/media/clientes/c1/posts/vieja.jpg", tipo: "imagen" } });
    expect(mejoras[0].indicacion).toBe("fondo blanco");
    expect(pedidos[0].prompt).toMatch(/Escena: LO QUE PIDE LA AGENCIA \(manda sobre todo lo demás de este pedido\): fondo blanco\./);
  });

  it("«Crear la imagen aquí» con su pedido listo no espera al director; con un comentario, sí", async () => {
    const { crearImagenDelPost } = await import("./otraVersion.js");
    const { conPromptListo } = await import("./promptImagen.js");
    const listo = conPromptListo(post, "Pieza: la ficha lista.");
    await crearImagenDelPost({ client, post: listo });
    expect(mejoras).toHaveLength(0);
    expect(pedidos[0].prompt).toContain("Pieza: la ficha lista.");
    await crearImagenDelPost({ client, post: listo, indicacion: "más grande el precio" });
    expect(mejoras).toHaveLength(1);
    expect(mejoras[0].indicacion).toBe("más grande el precio");
  });
});
