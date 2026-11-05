import { describe, it, expect, vi, beforeEach } from "vitest";

// El servidor, de mentira: lo que se comprueba es lo que se le manda (un encargo con el control) y lo que se devuelve.
const creados = [];
const terminados = [];
let lecturas = [];
vi.mock("./encargosApi", () => ({
  crearEncargo: vi.fn(async (_c, datos) => { creados.push(datos); return { encargo: { id: "e1", estado: "en_marcha", pasos: [] } }; }),
  seguirEncargo: vi.fn(async ({ alCambio }) => {
    let ultimo = null;
    for (const [e, archivos] of lecturas) { alCambio(e, archivos); ultimo = e; }
    return ultimo;
  }),
  terminarEncargo: vi.fn(async ({ encargo }) => { terminados.push(encargo.estado); }),
}));

const { pasoListo, crearUnaEnServidor, resultadosDe } = await import("./piezaServidor.js");

const pedido = { modelo: "nano-banana", prompt: "Escena: un sofá.\n\nIdentidad de la marca (obligatoria): …", n: 1, ajustes: { aspectRatio: "4:5" }, medios: { reference: ["clientes/c1/p.png"] } };

describe("una pieza por el servidor, con las reglas del lote", () => {
  beforeEach(() => { creados.length = 0; terminados.length = 0; lecturas = []; });

  it("el paso lleva el control, el texto a comparar y, si el kit lo pide, el logo estampado", () => {
    const p = pasoListo({ pedido: { ...pedido, calendarId: "cal", postId: "p1" }, texto: "Desde 399 $", kit: { logo: "clientes/c1/logo.png", logoModo: "estampado" } });
    expect(p.controlar).toBe(true);
    expect(p.texto).toBe("Desde 399 $");
    expect(p.navegador).toEqual({ plantilla: null, logo: true });
    expect(p.pedido).toMatchObject({ modelo: "nano-banana", calendarId: "cal", postId: "p1" });
    // La escena va DENTRO del pedido: el paso no espera al director.
    expect(p.encargo).toBeNull();
    expect(p.escena).toBe("un sofá.");
  });

  it("con el texto de una plantilla encima no se controla (lo pone la aplicación); una edición no se estampa otra vez", () => {
    const conPlantilla = pasoListo({ pedido, texto: "x", plantilla: { texto: "Hola", plantilla: "banda", nombre: "v" } });
    expect(conPlantilla.controlar).toBe(false);
    expect(conPlantilla.navegador.plantilla.texto).toBe("Hola");
    expect(pasoListo({ pedido, kit: { logo: "l.png", logoModo: "estampado" }, estampar: false }).navegador).toBeNull();
  });

  it("manda UN encargo sin director y con el control, y devuelve la pieza FINAL (la del logo)", async () => {
    const hecho = { id: "e1", estado: "hecho", pasos: [{ id: "p1", fase: "hecho", opciones: [{ id: "a1", control: { estado: "ok" } }], finales: ["a2"] }] };
    lecturas = [
      [{ id: "e1", estado: "en_marcha", pasos: [{ id: "p1", fase: "generando" }] }, new Map()],
      [hecho, new Map([["a1", { id: "a1", src: "/a1" }], ["a2", { id: "a2", src: "/a2" }]])],
    ];
    const progreso = [];
    const final = await crearUnaEnServidor({ clienteId: "c1", paso: pasoListo({ pedido }), alProgresar: (t) => progreso.push(t) });
    expect(creados[0]).toMatchObject({ tipo: "lote", mejorar: false, controlar: true, paralelo: 1 });
    expect(creados[0].pasos).toHaveLength(1);
    expect(final.id).toBe("a2");
    expect(progreso).toContain("Creando la imagen…");
    // Lo que necesita lienzo, sólo con el encargo ya cerrado (si no, el Container y la pantalla estamparían dos veces).
    expect(terminados).toEqual(["hecho"]);
  });

  it("si la pieza no salió, lanza con el motivo del servidor", async () => {
    lecturas = [[{ id: "e1", estado: "fallido", pasos: [{ id: "p1", fase: "fallido", error: "Sin presupuesto." }] }, new Map()]];
    await expect(crearUnaEnServidor({ clienteId: "c1", paso: pasoListo({ pedido }) })).rejects.toThrow("Sin presupuesto.");
  });

  it("los resultados, paso a paso y en orden", () => {
    const e = { estado: "hecho", pasos: [{ id: "a", fase: "hecho", opciones: [{ id: "x" }] }, { id: "b", fase: "fallido", error: "no" }] };
    expect(resultadosDe(e, new Map([["x", { id: "x" }]]))).toEqual([
      { id: "a", archivo: { id: "x" }, control: null, error: "" },
      { id: "b", archivo: null, control: null, error: "no" },
    ]);
  });
});
