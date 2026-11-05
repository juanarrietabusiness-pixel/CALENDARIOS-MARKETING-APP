import { describe, it, expect } from "vitest";
import {
  RECETAS_CASA, recetasDisponibles, limpiarReceta, idDeReceta, mensajeParaClaude, enlaceDeClaude, textoDeReceta,
  limpiarHandoff, mensajeParaElAsistente, SALIDAS_RECETA,
} from "./recetas.js";

describe("las recetas de la casa", () => {
  it("todas están limpias: id con forma, título, método, una salida que existe", () => {
    for (const r of RECETAS_CASA) {
      expect(limpiarReceta(r)).toMatchObject({ id: r.id, titulo: r.titulo, salida: r.salida });
      expect(Object.keys(SALIDAS_RECETA)).toContain(r.salida);
      // Lo que crea se confirma: ninguna receta crea sin el «sí» (o lo dice el método, o lo añade textoDeReceta).
      expect(textoDeReceta(limpiarReceta(r))).toMatch(/crea sólo con el «sí»/);
    }
    expect(new Set(RECETAS_CASA.map((r) => r.id)).size).toBe(RECETAS_CASA.length);
  });

  it("no copian a nadie: ningún método nombra a Higgsfield ni sus herramientas", () => {
    for (const r of RECETAS_CASA) expect(`${r.instrucciones} ${r.descripcion}`).not.toMatch(/higgsfield|execute_preset|get_preset/i);
  });
});

describe("juntar las de la casa con las de la agencia", () => {
  it("una guardada con el id de una de la casa la sustituye; con «oculta», la saca; las propias van detrás", () => {
    const r = recetasDisponibles([
      { id: "foto-heroe", titulo: "La nuestra", instrucciones: "1." },
      { id: "oferta-clara", titulo: "x", instrucciones: "y", oculta: true },
      { id: "r-propia", titulo: "Propia", instrucciones: "1." },
      { id: "MAL ID", titulo: "x", instrucciones: "y" },
    ]);
    expect(r.find((x) => x.id === "foto-heroe")).toMatchObject({ titulo: "La nuestra", casa: true, cambiada: true });
    expect(r.some((x) => x.id === "oferta-clara")).toBe(false);
    expect(r.at(-1)).toMatchObject({ id: "r-propia", casa: false });
    expect(r).toHaveLength(RECETAS_CASA.length);
  });

  it("el id de una nueva sale del título y no choca", () => {
    expect(idDeReceta("Video del producto en su casa")).toBe("r-video-del-producto-en-su-casa");
    expect(idDeReceta("Ñandú", ["r-nandu"])).toBe("r-nandu-2");
  });
});

describe("«Crear con Claude»", () => {
  it("el mensaje es corto (el pedido va en el handoff) y el enlace lo lleva escrito", () => {
    const m = mensajeParaClaude({ receta: { id: "foto-heroe" }, cliente: "Feria del Lente", handoffId: "abc-123" });
    expect(m).toBe("/receta foto-heroe · cliente Feria del Lente · HANDOFF: abc-123");
    expect(enlaceDeClaude(m)).toBe("https://claude.ai/new?q=%2Freceta%20foto-heroe%20%C2%B7%20cliente%20Feria%20del%20Lente%20%C2%B7%20HANDOFF%3A%20abc-123");
    expect(mensajeParaElAsistente({ id: "foto-heroe" }, "más cálida")).toBe("/receta foto-heroe — más cálida");
  });

  it("el pedido se limpia: ids con forma, como mucho 6 referencias, la indicación corta", () => {
    const h = limpiarHandoff({ publicacion: { calendarId: "cal1", postId: "p1" }, referencias: ["a", "b c", ..."cdefghij".split("")], indicacion: "x".repeat(900) });
    expect(h.publicacion).toEqual({ calendarId: "cal1", postId: "p1" });
    expect(h.referencias).toHaveLength(6);
    expect(h.referencias).not.toContain("b c");
    expect(h.indicacion).toHaveLength(600);
    expect(limpiarHandoff({ publicacion: { calendarId: "a b" } }).publicacion).toBeUndefined();
  });
});
