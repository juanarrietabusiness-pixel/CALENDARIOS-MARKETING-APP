import { describe, it, expect } from "vitest";
import { construirPromptHistoria, informacionDelPost, VARIANTES_HISTORIA } from "../../worker/rutas/imagen.js";

// ============================================================
// Las historias con IA COMPLEMENTAN el post: la misma información, otra
// pieza. Antes las tres variantes eran la misma imagen (ampliada, en
// tarjeta y de cerca) y la agencia veía tres veces el post.
// ============================================================

describe("la historia que acompaña al post", () => {
  const info = informacionDelPost({ titulo: "Muebles de TV", producto: "Mueble Oslo", textoPieza: "Desde $39.99", idea: "Top muebles de TV" });

  it("cada variante pide una pieza NUEVA con la información del post, no la imagen encogida", () => {
    for (const id of Object.keys(VARIANTES_HISTORIA)) {
      const p = construirPromptHistoria(id, { clientName: "D'CASA", info });
      expect(p).toMatch(/NO repitas ni encojas la imagen del post/);
      expect(p).toContain("Texto de la pieza del post: «Desde $39.99»");
      expect(p).toMatch(/no inventes precios/);
    }
  });

  it("las tres son distintas", () => {
    const pedidos = Object.keys(VARIANTES_HISTORIA).map((id) => construirPromptHistoria(id, { info }));
    expect(new Set(pedidos).size).toBe(3);
  });

  it("los ids de antes siguen dando una historia, y uno inventado también", () => {
    expect(construirPromptHistoria("adaptacion", { info })).toContain(VARIANTES_HISTORIA.beneficio.pedido);
    expect(construirPromptHistoria("anuncio", { info })).toContain(VARIANTES_HISTORIA.accion.pedido);
    expect(construirPromptHistoria("otra-cosa", { info })).toContain(VARIANTES_HISTORIA.beneficio.pedido);
  });

  it("sin información no queda un bloque vacío; el texto largo se recorta", () => {
    expect(construirPromptHistoria("pregunta", {})).not.toMatch(/LO QUE DICE EL POST/);
    expect(informacionDelPost({ descripcion: "a".repeat(5000) }).length).toBeLessThan(700);
  });
});
