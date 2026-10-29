import { describe, it, expect } from "vitest";
import { nombreDelModelo, modelosParaAccion, relevoDe, modeloPorId } from "./estudioCatalogo.js";
import { filtrarArchivos, modelosDeLaGaleria, modeloDeLaPieza, modeloDeEdicion } from "./estudio.js";
import { modeloEscogido } from "./otraVersion.js";

// Qué hizo cada modelo y con cuál se hace lo que se va a hacer (components/SelectorModelo.jsx).

describe("el nombre de un modelo en la galería", () => {
  it("lo de «Ampliar con IA» se apunta con el id del proveedor y se nombra igual que lo del Estudio", () => {
    expect(nombreDelModelo("gemini-2.5-flash-image")).toBe("Nano Banana");
    expect(nombreDelModelo("muse-image-1.0")).toBe("Muse Image");
    expect(nombreDelModelo("nano-banana")).toBe("Nano Banana");
    expect(nombreDelModelo("otro-que-no-existe")).toBe("otro-que-no-existe");
  });

  it("filtra por modelo juntando los dos ids de Nano Banana, y cuenta cuántas hizo cada uno", () => {
    const lista = [
      { id: "1", prompt: "a", modelo: "nano-banana" },
      { id: "2", prompt: "b", modelo: "gemini-2.5-flash-image" },
      { id: "3", prompt: "c", modelo: "muse-image" },
      { id: "4", prompt: "d", subido: true },
    ];
    expect(modelosDeLaGaleria(lista)).toEqual([{ nombre: "Nano Banana", n: 2 }, { nombre: "Muse Image", n: 1 }, { nombre: "Subida", n: 1 }]);
    expect(filtrarArchivos(lista, { modelo: "Nano Banana" }).map((a) => a.id)).toEqual(["1", "2"]);
    expect(filtrarArchivos(lista, { modelo: "Subida" }).map((a) => a.id)).toEqual(["4"]);
    // El buscador también encuentra por el nombre que se lee en la tarjeta.
    expect(filtrarArchivos(lista, { texto: "nano banana" }).map((a) => a.id)).toEqual(["1", "2"]);
    expect(modeloDeLaPieza({ modelo: "" })).toBe("Aplicación");
  });
});

describe("escoger el modelo de UNA acción", () => {
  const activos = { gemini: true, meta: true, kie: true };

  it("sólo ofrece modelos de imagen con llave; con referencias, sólo los que las admiten", () => {
    const ids = modelosParaAccion({ gemini: true, meta: true }, { conReferencias: true }).map((m) => m.id);
    expect(ids).toContain("muse-image");
    expect(ids).toContain("nano-banana");
    expect(ids.every((id) => modeloPorId(id).tipo === "imagen" && modeloPorId(id).referencias > 0)).toBe(true);
    expect(ids.some((id) => modeloPorId(id).motor === "kie")).toBe(false);
  });

  it("dice con cuál saldría de verdad un modelo que no hace 4:5 (antes se cambiaba en silencio)", () => {
    expect(relevoDe("gpt-image-2-kie", activos, "4:5", true)?.id).toMatch(/^nano-banana/);
    expect(relevoDe("muse-image", activos, "4:5", true)).toBeNull();
    expect(relevoDe("nano-banana", activos, "4:5", true)).toBeNull();
    expect(relevoDe("gpt-image-2-kie", activos, "", true)).toBeNull();
  });

  it("editar con el escogido si edita y tiene llave; si no, el de siempre", () => {
    expect(modeloDeEdicion({ gemini: true, meta: true }, "nano-banana", "4:5").id).toBe("nano-banana");
    expect(modeloDeEdicion({ gemini: true, meta: true }, "", "4:5").id).toBe("muse-image");
    // Sin la llave de ese motor, no se le hace caso.
    expect(modeloDeEdicion({ gemini: true }, "muse-image", "4:5").id).toBe("nano-banana");
  });

  it("lo escogido para otra versión o recrear vale sólo si existe, es de imagen y tiene llave", () => {
    expect(modeloEscogido("muse-image", activos)?.id).toBe("muse-image");
    expect(modeloEscogido("muse-image", { gemini: true })).toBeNull();
    expect(modeloEscogido("", activos)).toBeNull();
    expect(modeloEscogido("gemini-omni-flash", activos)).toBeNull(); // es de video
  });
});

describe("otra igual / otra versión con otro modelo", () => {
  it("el escogido si es del tipo y tiene llave; si no hace la proporción con referencias, el que lo releva", async () => {
    const { modeloParaOtra } = await import("./estudio.js");
    const activos = { gemini: true, meta: true, kie: true };
    const pieza = { tipo: "imagen", ajustes: { aspectRatio: "4:5" } };
    expect(modeloParaOtra(activos, "muse-image", pieza, 1)?.id).toBe("muse-image");
    expect(modeloParaOtra(activos, "gpt-image-2-kie", pieza, 1)?.id).toMatch(/^nano-banana/);
    expect(modeloParaOtra({ gemini: true }, "muse-image", pieza)).toBeNull();
    expect(modeloParaOtra(activos, "gemini-omni-flash", pieza)).toBeNull();
    expect(modeloParaOtra(activos, "", pieza)).toBeNull();
  });
});
