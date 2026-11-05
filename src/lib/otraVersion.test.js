import { describe, it, expect, vi, beforeEach } from "vitest";

// La red del Estudio, de mentira: lo que se comprueba es el PEDIDO que sale (y que sale por el SERVIDOR, como el lote).
const pedidos = [];
const pasos = [];
const mejoras = [];
const kitBase = { logo: "clientes/c1/logo.png" };
vi.mock("./estudio", async (original) => {
  const real = await original();
  return {
    ...real,
    leerEstudio: vi.fn(async () => ({ kit: kitBase, archivos: [], trabajos: [], productos: [] })),
    leerMotores: vi.fn(async () => ({ motores: { gemini: { activo: true } } })),
    versionesDeIdea: vi.fn(async () => ({ versiones: ["El sofá en un balcón al atardecer."] })),
    mejorarIdea: vi.fn(async (_c, datos) => { mejoras.push(datos); return { idea: "Pieza: post 4:5.\nImagen principal: el sofá en un balcón al atardecer.", ficha: true }; }),
    pedirImagenes: vi.fn(async (_c, datos) => { pedidos.push(datos); return { trabajo: { id: "t1", estado: "hecho" } }; }),
    apuntarUso: vi.fn(async () => null),
  };
});
vi.mock("./carruselEstudio", () => ({ esperarArchivos: vi.fn(async () => [{ id: "a2", clave: "clientes/c1/estudio/n.png", src: "/api/media/clientes/c1/estudio/n.png", tipo: "imagen" }]) }));
vi.mock("./piezaServidor", async (original) => {
  const real = await original();
  return {
    ...real,
    crearUnaEnServidor: vi.fn(async ({ paso }) => { pasos.push(paso); pedidos.push(paso.pedido); return { id: "a2", clave: "clientes/c1/estudio/n.png", src: "/api/media/clientes/c1/estudio/n.png", tipo: "imagen" }; }),
  };
});

const { recrearConLaMarca, otraVersionDelPost, recrearAnuncioConLaMarca } = await import("./otraVersion.js");

const client = { id: "c1", name: "Dcasa" };
const post = { id: "p1", format: "post", idea: "Sofá cama en oferta", textoPieza: "Sofá cama 399 $" };

describe("otra versión y recrear, en la publicación", () => {
  beforeEach(() => { pedidos.length = 0; pasos.length = 0; mejoras.length = 0; });

  it("«Recrear con mi marca»: el DIRECTOR mira la referencia y la imagen de otra marca NO va al motor (la copiaba)", async () => {
    const nueva = await recrearConLaMarca({ client, post, medio: { src: "/api/media/clientes/c1/posts/anuncio.jpg", tipo: "imagen" } });
    expect(nueva.id).toBe("a2");
    expect(mejoras[0].especiales).toEqual([{ papel: "inspiracion", src: "/api/media/clientes/c1/posts/anuncio.jpg" }]);
    expect(mejoras[0].idea).toContain("ligeramente distinta");
    expect(mejoras[0].texto).toBe("Sofá cama 399 $");
    expect(pedidos[0].medios.reference ?? []).not.toContain("clientes/c1/posts/anuncio.jpg");
    expect(pedidos[0].medios.reference).toContain("clientes/c1/logo.png");
    expect(pedidos[0].prompt).toContain("balcón al atardecer");
  });

  it("«Recrear con mi marca» sin director (falla): NO se crea nada y se dice por qué (la otra marca nunca va al motor)", async () => {
    const api = await import("./estudio");
    api.mejorarIdea.mockRejectedValueOnce(new Error("sin saldo"));
    await expect(recrearConLaMarca({ client, post, medio: { src: "/api/media/clientes/c1/posts/anuncio.jpg", tipo: "imagen" } })).rejects.toThrow(/director no pudo mirar la referencia \(sin saldo\)/);
    expect(pedidos).toHaveLength(0);
  });

  it("todo lo que crea va por el SERVIDOR con el control, el texto a comparar y la publicación", async () => {
    await recrearConLaMarca({ client, post, calendarId: "cal1", medio: { src: "/api/media/clientes/c1/posts/anuncio.jpg", tipo: "imagen" } });
    expect(pasos[0].controlar).toBe(true);
    expect(pasos[0].texto).toBe("Sofá cama 399 $");
    expect(pasos[0].pedido).toMatchObject({ calendarId: "cal1", postId: "p1" });
    // El logo lo pone el modelo (kit «modelo»): no se estampa.
    expect(pasos[0].navegador).toBeNull();
  });

  it("con el logo ESTAMPADO en el kit, el servidor lo estampa (y el modelo no lo recibe)", async () => {
    const api = await import("./estudio");
    api.leerEstudio.mockResolvedValueOnce({ kit: { logo: "clientes/c1/logo.png", logoModo: "estampado" }, archivos: [], trabajos: [], productos: [] });
    await otraVersionDelPost({ client, post, medio: { src: "/api/media/clientes/c1/posts/vieja.jpg", tipo: "imagen" } });
    expect(pasos[0].navegador).toEqual({ plantilla: null, logo: true });
    expect(pedidos[0].medios.reference ?? []).not.toContain("clientes/c1/logo.png");
  });

  it("las fotos de TODOS los productos de la publicación van de referencia (uno de cada uno primero)", async () => {
    const api = await import("./estudio");
    const productos = [
      { id: "s", nombre: "Sofá cama", fotos: ["clientes/c1/p/s1.png", "clientes/c1/p/s2.png"] },
      { id: "m", nombre: "Mesa", fotos: ["clientes/c1/p/m1.png"] },
    ];
    api.leerEstudio.mockResolvedValueOnce({ kit: kitBase, archivos: [], trabajos: [], productos });
    await otraVersionDelPost({ client, post: { ...post, productoId: "s", productoIds: ["s", "m"] }, medio: { src: "/api/media/clientes/c1/posts/vieja.jpg", tipo: "imagen" } });
    expect(mejoras[0].productoIds).toEqual(["s", "m"]);
    expect(pedidos[0].medios.reference.slice(0, 2)).toEqual(["clientes/c1/p/s1.png", "clientes/c1/p/m1.png"]);
  });

  it("una referencia que no es de este cliente no se manda", async () => {
    await expect(recrearConLaMarca({ client, post, medio: { src: "/api/media/clientes/otro/x.jpg", tipo: "imagen" } })).rejects.toThrow(/almacén de este cliente/);
    expect(pedidos).toHaveLength(0);
  });

  it("«Otra versión» de una imagen subida: el director MIRA la original y la rediseña con el mismo texto; la vieja no va al motor", async () => {
    await otraVersionDelPost({ client, post, medio: { src: "/api/media/clientes/c1/posts/vieja.jpg", tipo: "imagen" } });
    expect(pedidos[0].prompt).toContain("balcón al atardecer");
    expect(mejoras[0].texto).toBe("Sofá cama 399 $");
    expect(mejoras[0].especiales).toEqual([{ papel: "original", src: "/api/media/clientes/c1/posts/vieja.jpg" }]);
    expect(mejoras[0].idea).toContain("el MISMO texto exacto");
    expect(pedidos[0].medios.reference ?? []).not.toContain("clientes/c1/posts/vieja.jpg");
  });

  it("«Otra versión» de una pieza del Estudio: la marca de HOY (no la del kit viejo) y la escena acortada, nunca el final", async () => {
    const api = await import("./estudio");
    const viejo = [
      `Escena: ${"Pieza: post 4:5.\nComposición: el sofá al centro.\nTexto (exacto): titular «Sofá cama 399 $».\nFondo: madera clara con mucha luz y textura de vetas."}`,
      "Identidad de la marca (obligatoria): Paleta estrictamente limitada a: rojo #FF0000; sin colores fuera de la paleta. Sin texto inventado ni logos de otras marcas.",
      "La ÚLTIMA imagen de referencia es el logo REAL de la marca: la firma de la pieza es ése, copiado tal cual (forma, colores y letras), pequeño y nítido, sin redibujarlo, sin cambiarle nada y sin inventar otro.",
    ].join("\n\n");
    const kitHoy = { logo: "clientes/c1/logo-nuevo.png", paleta: [{ hex: "#123456", nombre: "Azul", rol: "dominante" }] };
    api.leerEstudio.mockResolvedValueOnce({
      kit: kitHoy, productos: [],
      archivos: [{ id: "a1", src: "/api/media/clientes/c1/estudio/a1.png", tipo: "imagen", prompt: viejo, modelo: "nano-banana", trabajoId: "t0", ajustes: { aspectRatio: "4:5" } }],
      trabajos: [{ id: "t0", medios: { reference: ["clientes/c1/p/s1.png", "clientes/c1/logo-viejo.png"] }, ajustes: { aspectRatio: "4:5" } }],
    });
    api.mejorarIdea.mockResolvedValueOnce({ idea: `Pieza: post 4:5.\nComposición: el sofá a la izquierda.\nTexto (exacto): titular «Sofá cama 399 $».\nFondo: ${"muy ".repeat(1200)}claro.`, ficha: true });
    await otraVersionDelPost({ client, post, medio: { src: "/api/media/clientes/c1/estudio/a1.png", tipo: "imagen" } });
    const p = pedidos[0];
    expect(p.prompt).toContain("#123456");
    expect(p.prompt).not.toContain("#FF0000");
    expect(p.medios.reference).toEqual(["clientes/c1/p/s1.png", "clientes/c1/logo-nuevo.png"]);
    // No cabía: se quitó el «Fondo» de la ficha (lo prescindible), y el final (la marca y el logo) llegó entero.
    expect(p.prompt).toContain("titular «Sofá cama 399 $»");
    expect(p.prompt).not.toContain("muy muy muy");
    expect(p.prompt.endsWith("sin inventar otro.")).toBe(true);
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

  it("«Crear la imagen aquí»: la PLANTILLA que escoge el director va al motor (su imagen y su línea)", async () => {
    const api = await import("./estudio");
    const { crearImagenDelPost } = await import("./otraVersion.js");
    const kit = { logo: "clientes/c1/logo.png", plantillas: [{ id: "plantilla-oferta", nombre: "Oferta", uso: "post", clave: "clientes/c1/estudio/plantilla.png", sistema: "Titular arriba, 20 % del alto." }] };
    api.leerEstudio.mockResolvedValueOnce({ kit, archivos: [{ id: "pl", clave: "clientes/c1/estudio/plantilla.png", src: "/api/media/clientes/c1/estudio/plantilla.png", tipo: "imagen" }], trabajos: [], productos: [] });
    api.mejorarIdea.mockResolvedValueOnce({ idea: "Pieza: post 4:5.\nComposición: como la plantilla.", ficha: true, plantilla: "plantilla-oferta" });
    await crearImagenDelPost({ client, post });
    expect(pedidos[0].medios.reference).toContain("clientes/c1/estudio/plantilla.png");
    expect(pedidos[0].prompt).toMatch(/plantilla/i);
  });

  it("«Crear la imagen aquí» con el BORRADOR del motor de ideas: lo diseña el director (no se lo salta)", async () => {
    const { crearImagenDelPost } = await import("./otraVersion.js");
    const { camposDePromptListo } = await import("./promptImagen.js");
    const conBorrador = { ...post, ...camposDePromptListo(post, "Pieza: el borrador del redactor.") };
    await crearImagenDelPost({ client, post: conBorrador });
    expect(mejoras).toHaveLength(1);
    expect(pedidos[0].prompt).not.toContain("el borrador del redactor");
  });

  it("«Recrear un anuncio» del Estudio en imagen: por el director y el servidor, sin el anuncio en el motor", async () => {
    const nueva = await recrearAnuncioConLaMarca({ client, archivo: { src: "/api/media/clientes/c1/estudio/anuncio.png" }, version: { idea: "El sofá en una sala luminosa", texto: "Desde 399 $" }, productoId: "s" });
    expect(nueva.id).toBe("a2");
    expect(mejoras[0].especiales).toEqual([{ papel: "inspiracion", src: "/api/media/clientes/c1/estudio/anuncio.png" }]);
    expect(mejoras[0].texto).toBe("Desde 399 $");
    expect(pedidos[0].medios.reference ?? []).not.toContain("clientes/c1/estudio/anuncio.png");
    expect(pasos[0].controlar).toBe(true);
  });
});
