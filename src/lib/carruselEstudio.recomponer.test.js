import { describe, it, expect, vi, beforeEach } from "vitest";

// La red de seguridad de la proporción: una pieza de Muse que salió 2:3 se recompone con MUSE (la serie no se mezcla
// con otro motor); sólo si vuelve a salir de otra medida, con el relevo.
const estado = { galeria: [], pedidos: [] };
vi.mock("./estudio", async (original) => ({
  ...(await original()),
  leerMotores: async () => ({ motores: { meta: { activo: true }, kie: { activo: true } } }),
  avanzarTrabajo: async () => ({}),
  leerEstudio: async () => ({ archivos: estado.galeria }),
  pedirImagenes: async (_c, pedido) => {
    estado.pedidos.push(pedido.modelo);
    const id = `t${estado.pedidos.length}`;
    const salida = estado.salidas.shift();
    estado.galeria.unshift({ id: `a-${id}`, trabajoId: id, tipo: "imagen", modelo: pedido.modelo, clave: `clientes/c1/${id}.png`, ...salida });
    return { trabajo: { id, estado: "hecho", ajustes: { aspectRatio: "4:5" } } };
  },
}));

const { esperarArchivos } = await import("./carruselEstudio");

beforeEach(() => {
  estado.galeria = [{ id: "a0", trabajoId: "t0", tipo: "imagen", modelo: "muse-image", clave: "clientes/c1/a0.png", ancho: 1024, alto: 1536 }];
  estado.pedidos = [];
});

describe("recomponer una pieza fuera de su proporción", () => {
  it("con el MISMO modelo que la hizo (Muse), y queda la nueva", async () => {
    estado.salidas = [{ ancho: 1024, alto: 1280 }];
    const [a] = await esperarArchivos("c1", { id: "t0", estado: "hecho", ajustes: { aspectRatio: "4:5" } });
    expect(estado.pedidos).toEqual(["muse-image"]);
    expect(a.id).toBe("a-t1");
  });

  it("si Muse vuelve a sacarla de otra medida, entonces el relevo", async () => {
    estado.salidas = [{ ancho: 1024, alto: 1536 }, { ancho: 896, alto: 1152 }];
    const [a] = await esperarArchivos("c1", { id: "t0", estado: "hecho", ajustes: { aspectRatio: "4:5" } });
    expect(estado.pedidos).toEqual(["muse-image", "nano-banana-2-kie"]);
    expect(a.modelo).toBe("nano-banana-2-kie");
  });
});
