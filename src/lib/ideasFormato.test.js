import { describe, it, expect } from "vitest";
import { pedidoDeIdeasFormato, leerIdeasFormato, MAX_IDEAS_FORMATO } from "./ideasFormato";
import { partirGuion } from "./carrusel";

describe("«Dame ideas» de carrusel y de reel", () => {
  it("el pedido: carrusel con guion por láminas o reel con su duración; variadas si no hay tipo; lo que ya salió no se repite", () => {
    const c = pedidoDeIdeasFormato({ formato: "carrusel", marca: "Dcasa", n: 9, producto: "Sofá cama · $399", usados: ["Duerme mejor"] });
    expect(c).toMatch(/Propón 5 ideas de CARRUSEL/);
    expect(c).toMatch(/Variadas/);
    expect(c).toMatch(/precio EXACTO/);
    expect(c).toMatch(/«Duerme mejor»/);
    expect(c).toMatch(/"guion":"Portada:/);
    const r = pedidoDeIdeasFormato({ formato: "reel", tipo: "Educativo", segundos: 8, n: 1 });
    expect(r).toMatch(/Propón 3 ideas de REEL vertical de 8 segundos/);
    expect(r).toMatch(/Tipo de pieza: Educativo\./);
    expect(r).toMatch(/"idea":/);
  });

  it("la lectura: el guion del carrusel lo entiende partirGuion; las vacías fuera; el reel trae su idea", () => {
    const texto = `Aquí van: ${JSON.stringify({ ideas: [
      { titulo: "Mitos del sofá", tema: "Tres mitos", guion: "Portada: ¿Sabías esto?\nSlide 2: Mito 1\nCTA: Escríbenos" },
      { titulo: "", tema: "", guion: "" },
      ...Array.from({ length: 6 }, (_, i) => ({ titulo: `T${i}`, guion: "Portada: a\nCTA: b" })),
    ] })}`;
    const ideas = leerIdeasFormato(texto, "carrusel");
    expect(ideas.length).toBeLessThanOrEqual(MAX_IDEAS_FORMATO);
    expect(ideas[0]).toMatchObject({ titulo: "Mitos del sofá", tema: "Tres mitos" });
    expect(partirGuion(ideas[0].guion).map((l) => l.texto)).toEqual(["¿Sabías esto?", "Mito 1", "Escríbenos"]);
    expect(ideas.some((i) => !i.guion && !i.tema)).toBe(false);
    expect(leerIdeasFormato(JSON.stringify({ ideas: [{ titulo: "Gancho", idea: "Una mamá abre la caja…" }, { idea: "" }] }), "reel"))
      .toEqual([{ id: "idea-1", titulo: "Gancho", idea: "Una mamá abre la caja…" }]);
    expect(leerIdeasFormato("sin json", "reel")).toEqual([]);
  });
});
