import { describe, it, expect, vi } from "vitest";

// Lo que la pantalla hace con un encargo del servidor: enseñar sus láminas, contar un carrusel del lote y poner encima
// lo que necesita lienzo UNA vez (aunque lo pidan la pantalla que sigue y el repaso al abrir a la vez).

const pedidos = [];
vi.mock("./db", () => ({ pedir: vi.fn(async (ruta, op) => { pedidos.push({ ruta, cuerpo: op?.body ? JSON.parse(op.body) : null }); return {}; }) }));
const logos = [];
vi.mock("./logoEstudio", () => ({ conLogoSiToca: vi.fn(async ({ archivo }) => { logos.push(archivo.id); await new Promise((ok) => setTimeout(ok, 5)); return { ...archivo, id: `${archivo.id}-logo` }; }) }));
vi.mock("./loteEstudio", () => ({ ponerTexto: vi.fn(async ({ crudo }) => ({ ...crudo, id: `${crudo.id}-texto` })) }));

const { laminasDeEncargo, resultadoDeCarrusel, comunParaServidor, terminarPaso } = await import("./encargosApi.js");

const archivos = new Map([["a", { id: "a" }], ["b", { id: "b" }], ["f", { id: "f" }]]);

describe("las láminas de un carrusel del servidor", () => {
  it("por su número: en marcha, falló o salió (con lo puesto encima, si ya)", () => {
    const r = laminasDeEncargo({ pasos: [
      { lamina: { n: 1 }, fase: "hecho", opciones: [{ id: "a", control: { estado: "ok" } }], finales: ["f"] },
      { lamina: { n: 2 }, fase: "generando", opciones: [] },
      { lamina: { n: 3 }, fase: "fallido", error: "sin llave" },
    ] }, archivos);
    expect(r[0]).toMatchObject({ crudo: { id: "a" }, final: { id: "f" }, control: { estado: "ok" } });
    expect(r[1]).toEqual({ cargando: true });
    expect(r[2]).toEqual({ error: "sin llave" });
  });

  it("como pieza del lote: su avance y, al terminar, las láminas en orden", () => {
    expect(resultadoDeCarrusel({ estado: "en_marcha", pasos: [] }, archivos).paso).toMatch(/director/);
    const r = resultadoDeCarrusel({ estado: "hecho", pasos: [{ fase: "hecho", opciones: [{ id: "a" }] }, { fase: "hecho", opciones: [{ id: "b" }], finales: ["f"] }] }, archivos);
    expect(r.opciones[0].archivos.map((x) => x.id)).toEqual(["a", "f"]);
  });

  it("lo común viaja con ids y claves, no con objetos", () => {
    const c = comunParaServidor({ modelo: { id: "nano-banana" }, personajes: [{ clave: "clientes/c1/p.png", nota: "el bebé", toma: ["persona"] }], tipografia: null, fotos: ["clientes/c1/f.png"] });
    expect(c).toMatchObject({ modelo: "nano-banana", personajes: [{ clave: "clientes/c1/p.png", nota: "el bebé" }], tipografia: null, fotos: ["clientes/c1/f.png"] });
  });
});

describe("terminar en la pantalla", () => {
  it("el texto de la plantilla y luego el logo; se apunta en el servidor; dos llamadas a la vez lo hacen UNA vez", async () => {
    const paso = { id: "p1", fase: "hecho", opciones: [{ id: "a" }], navegador: { plantilla: { texto: "Hola", plantilla: "banda" }, logo: true } };
    const encargo = { id: "e1", pasos: [paso] };
    const [r1, r2] = await Promise.all([terminarPaso({ clienteId: "c1", encargo, paso, archivos, kit: {} }), terminarPaso({ clienteId: "c1", encargo, paso, archivos, kit: {} })]);
    expect([r1, r2].filter(Boolean)).toHaveLength(1);
    expect(logos).toEqual(["a-texto"]);
    expect(pedidos.at(-1)).toMatchObject({ ruta: "/estudio/c1/encargos/e1/final", cuerpo: { pasoId: "p1", finales: ["a-texto-logo"] } });
  });
});
