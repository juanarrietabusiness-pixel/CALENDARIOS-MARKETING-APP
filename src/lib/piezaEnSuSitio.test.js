import { describe, it, expect } from "vitest";
import { postConPiezaEnSuSitio, piezaEnCurso, sinMarca, limpiarSitio, MAX_HORAS_EN_CURSO } from "./piezaEnSuSitio.js";

// Lo creado desde una publicación va a SU sitio, lo ponga el panel o el servidor (y no dos veces).
const archivo = (id) => ({ id, src: `/api/media/clientes/c1/estudio/${id}.png`, mime: "image/png", prompt: `pieza ${id}`, ancho: 1080, alto: 1350 });
const medio = (id) => ({ src: `/api/media/clientes/c1/estudio/${id}.png`, tipo: "imagen", nombre: "" });
const AHORA = "2026-11-15T12:00:00.000Z";

describe("la pieza en su sitio", () => {
  it("reemplaza la lámina que se tocó y deja las demás en su orden", () => {
    const post = { id: "p1", format: "carrusel", medios: [medio("a"), medio("b"), medio("c")], piezaEnCurso: { encargoId: "e1", reemplaza: medio("b").src } };
    const r = postConPiezaEnSuSitio(post, archivo("n"), { reemplaza: medio("b").src }, { encargoId: "e1", ahora: AHORA });
    expect(r.cambio).toBe(true);
    expect(r.post.medios.map((m) => m.src)).toEqual([medio("a").src, archivo("n").src, medio("c").src]);
    expect(r.post.mediosCambiadosAt).toBe(AHORA);
    expect(r.post.piezaEnCurso).toBeUndefined();
    expect(r.post.format).toBe("carrusel");
  });

  it("sin sitio que reemplazar (un post vacío), la añade", () => {
    const r = postConPiezaEnSuSitio({ id: "p1", format: "post" }, archivo("n"), { anadir: true }, { ahora: AHORA });
    expect(r.post.medios.map((m) => m.src)).toEqual([archivo("n").src]);
    expect(r.post.image).toBe(archivo("n").src);
  });

  it("no la pone dos veces: si ya está (la puso el panel), sólo quita la marca", () => {
    const post = { id: "p1", medios: [medio("n")], piezaEnCurso: { encargoId: "e1" } };
    const r = postConPiezaEnSuSitio(post, archivo("n"), { reemplaza: medio("a").src }, { encargoId: "e1" });
    expect(r.post.medios).toHaveLength(1);
    expect(r.post.piezaEnCurso).toBeUndefined();
    expect(r.cambio).toBe(true);
    // Sin marca y ya puesta: nada que escribir.
    expect(postConPiezaEnSuSitio({ id: "p1", medios: [medio("n")] }, archivo("n"), { anadir: true }).cambio).toBe(false);
  });

  it("si la imagen que se tocó ya no está, no la pone (y lo dice)", () => {
    const r = postConPiezaEnSuSitio({ id: "p1", medios: [medio("x")] }, archivo("n"), { reemplaza: medio("b").src });
    expect(r.cambio).toBe(false);
    expect(r.aviso).toMatch(/ya no está/);
    expect(r.post.medios.map((m) => m.src)).toEqual([medio("x").src]);
  });

  it("la marca de OTRO encargo se queda", () => {
    const post = { id: "p1", piezaEnCurso: { encargoId: "otro" } };
    expect(sinMarca(post, "e1")).toBe(post);
    expect(sinMarca(post).piezaEnCurso).toBeUndefined();
  });

  it("la marca caduca a las 24 h y lo que llega del navegador se limpia", () => {
    const at = "2026-11-14T00:00:00.000Z";
    expect(piezaEnCurso({ piezaEnCurso: { encargoId: "e1", reemplaza: "x", at } }, Date.parse(at) + 1000)).toEqual({ encargoId: "e1", reemplaza: "x", at });
    expect(piezaEnCurso({ piezaEnCurso: { encargoId: "e1", at } }, Date.parse(at) + (MAX_HORAS_EN_CURSO + 1) * 3_600_000)).toBeNull();
    expect(piezaEnCurso({ piezaEnCurso: { reemplaza: "x" } })).toBeNull();
    expect(limpiarSitio({ reemplaza: ` ${"y".repeat(500)}` })).toEqual({ reemplaza: "y".repeat(400) });
    expect(limpiarSitio({ anadir: true })).toEqual({ anadir: true });
    expect(limpiarSitio({ anadir: "si" })).toBeNull();
    expect(limpiarSitio("x")).toBeNull();
  });
});
