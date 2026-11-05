import { describe, it, expect, vi } from "vitest";

// Las 3 historias con IA: «¿Qué quieres?» llega al director y van por el SERVIDOR (un encargo de tres piezas: el
// control, la proporción y el logo estampado), como el lote.
const fichas = [];
const lanzados = [];
vi.mock("./estudio", async (original) => {
  const real = await original();
  return {
    ...real,
    leerEstudio: vi.fn(async () => ({ kit: { logo: "clientes/c1/logo.png", logoModo: "estampado" }, archivos: [], productos: [] })),
    leerMotores: vi.fn(async () => ({ motores: { gemini: { activo: true } } })),
    fichasDeDiseno: vi.fn(async (_c, datos) => { fichas.push(datos); return { fichas: { 1: { ficha: "Pieza: historia 9:16.\nTexto (exacto): titular «¿Duermes mal?»." } } }; }),
  };
});
vi.mock("./piezaServidor", async (original) => {
  const real = await original();
  return {
    ...real,
    lanzarEnServidor: vi.fn(async (datos) => { lanzados.push(datos); return { id: "e1" }; }),
    esperarEnServidor: vi.fn(async () => [{ id: "pregunta", archivo: { id: "h1", src: "/h1" }, error: "" }, { id: "beneficio", archivo: null, error: "Sin saldo." }]),
  };
});

const { crearHistorias } = await import("./historiasEstudio.js");

describe("las 3 historias del post, por el servidor", () => {
  it("«¿Qué quieres?» llega al director; las tres van en UN encargo con el control y el logo estampado", async () => {
    const avances = [];
    const r = await crearHistorias({
      client: { id: "c1", name: "Dcasa" }, post: { title: "Colchón", textoPieza: "Duerme mejor" }, base: "/api/media/clientes/c1/posts/a.jpg",
      indicacion: "que salga una mamá", alAvanzar: (id, x) => avances.push([id, x]),
    });
    expect(fichas[0].piezas.every((p) => p.indicacion === "que salga una mamá")).toBe(true);
    expect(lanzados[0].pasos).toHaveLength(3);
    expect(lanzados[0].pasos[0]).toMatchObject({ controlar: true, texto: "¿Duermes mal?", navegador: { plantilla: null, logo: true } });
    expect(lanzados[0].pasos[0].pedido.ajustes.aspectRatio).toBe("9:16");
    // La imagen del post va de referencia (su producto y su estilo); el logo, estampado (no al motor).
    expect(lanzados[0].pasos[0].pedido.medios.reference).toContain("clientes/c1/posts/a.jpg");
    expect(lanzados[0].pasos[0].pedido.medios.reference).not.toContain("clientes/c1/logo.png");
    expect(r.map((x) => x.archivo?.id ?? x.error)).toEqual(["h1", "Sin saldo.", "No salió."]);
    expect(avances.some(([id, x]) => id === "pregunta" && x.archivo)).toBe(true);
  });
});
