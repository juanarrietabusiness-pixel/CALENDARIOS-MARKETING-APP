import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { descargarPiezas } from "./descargar.js";

// «Descargar» de la galería en el teléfono (Juan, 24-nov: «desde el celular no puedo descargar ninguna imagen ni video»).
// Sin navegador: `document`, `fetch` y `navigator.share` son de mentira; lo que se comprueba es qué camino se toma.

let pulsados;
let bajadas;

beforeEach(() => {
  pulsados = [];
  bajadas = 0;
  vi.useFakeTimers();
  vi.stubGlobal("document", {
    createElement: () => ({ click() { pulsados.push({ href: this.href, nombre: this.download }); }, remove() {} }),
    body: { appendChild() {} },
  });
  vi.stubGlobal("fetch", vi.fn(async (src) => { bajadas += 1; return new Response(new Blob(["x"], { type: src.endsWith(".mp4") ? "video/mp4" : "image/png" })); }));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:1", revokeObjectURL: () => {} }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const pieza = { src: "/api/media/clientes/c1/estudio/reel.mp4", nombre: "reel.mp4" };

describe("descargarPiezas", () => {
  it("en el ordenador, el enlace de siempre: sin bajar nada antes", async () => {
    const r = await descargarPiezas([pieza], { tactil: false });
    expect(r.hecho).toBe("descargado");
    expect(pulsados).toEqual([{ href: pieza.src, nombre: "reel.mp4" }]);
    expect(bajadas).toBe(0);
  });

  it("en el teléfono, la hoja de compartir con el archivo y su nombre", async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share, canShare: () => true });
    const r = await descargarPiezas([pieza], { tactil: true });
    expect(r.hecho).toBe("compartido");
    const [{ files }] = share.mock.calls[0];
    expect(files.map((f) => [f.name, f.type])).toEqual([["reel.mp4", "video/mp4"]]);
    expect(pulsados).toEqual([]);
  });

  it("si iOS no deja compartir porque bajarlo tardó, pide otro toque y entonces comparte sin volver a bajarlo", async () => {
    const share = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("no"), { name: "NotAllowedError" }))
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { share, canShare: () => true });
    const primera = await descargarPiezas([pieza], { tactil: true });
    expect(primera).toMatchObject({ hecho: "otra-vez" });
    expect(primera.texto).toMatch(/vuelve a tocar «Descargar»/);
    expect((await descargarPiezas([pieza], { tactil: true })).hecho).toBe("compartido");
    expect(bajadas).toBe(1);
  });

  it("cancelar la hoja no es un error; un navegador sin compartir archivos descarga lo ya bajado", async () => {
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "AbortError" })), canShare: () => true });
    expect(await descargarPiezas([pieza], { tactil: true })).toEqual({ hecho: "cancelado", texto: "" });
    vi.stubGlobal("navigator", {});
    const enCurso = descargarPiezas([pieza, { src: "/b.png", nombre: "b.png" }], { tactil: true });
    await vi.runAllTimersAsync();
    const r = await enCurso;
    expect(r.hecho).toBe("descargado");
    expect(pulsados.map((p) => p.nombre)).toEqual(["reel.mp4", "b.png"]);
    expect(pulsados.every((p) => p.href === "blob:1")).toBe(true);
  });
});
