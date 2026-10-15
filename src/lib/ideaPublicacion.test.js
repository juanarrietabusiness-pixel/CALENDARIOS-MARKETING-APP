import { describe, it, expect } from "vitest";
import { ideaComoElLote, usadosDelMes, notaDePublicacion, rellenarConIdea } from "./ideaPublicacion.js";

describe("la idea de una publicación, como el lote", () => {
  it("va por el lote con un formato conocido y la idea vacía; con algo escrito, «Completar» sigue como antes", () => {
    expect(ideaComoElLote({ format: "post" })).toBe(true);
    expect(ideaComoElLote({ format: "carrusel", idea: "  " })).toBe(true);
    expect(ideaComoElLote({ format: "post", idea: "Sofá cama en oferta" })).toBe(false);
    expect(ideaComoElLote({ format: "live" })).toBe(false);
  });

  it("le dice lo que ya hay en el mes, sin la propia ni repetidas", () => {
    const cal = { days: [{ posts: [{ id: "a", title: "Duerme mejor" }, { id: "b", textoPieza: "3 errores\nal elegir sofá" }] }, { posts: [{ id: "c", title: "Duerme mejor" }, { id: "yo", title: "Mía" }] }] };
    expect(usadosDelMes(cal, "yo")).toEqual(["Duerme mejor", "3 errores"]);
  });

  it("la nota lleva la campaña, la semana y lo que ya está escrito", () => {
    expect(notaDePublicacion({ title: "Sofá" }, { concept: "Vuelta a clases" }, { campaign: "Octubre cómodo" }))
      .toBe("campaña del mes: Octubre cómodo · semana: Vuelta a clases · título: Sofá");
  });

  const idea = { titulo: "Duerme mejor", brief: "Por qué el sofá cama cambia las visitas", titular: "¿Visitas?", apoyo: "Sofá cama $399", escena: "Una sala de tarde", textoPieza: "¿Visitas?\nSofá cama $399", guion: "Portada: …\nCTA: …", productoId: "p1", producto: "Sofá cama" };

  it("un post: título, idea, qué se ve y el texto de la pieza; nunca guion", () => {
    const { cambios, campos } = rellenarConIdea({ format: "post" }, idea);
    expect(cambios).toMatchObject({ title: "Duerme mejor", idea: idea.brief, escena: "Una sala de tarde", textoPieza: "¿Visitas?\nSofá cama $399", productoId: "p1", producto: "Sofá cama" });
    expect(cambios.guion).toBeUndefined();
    expect(campos).toEqual(["título", "idea", "qué se ve", "texto de la pieza"]);
  });

  it("un carrusel o un reel: el guion, y sin texto de la pieza", () => {
    expect(rellenarConIdea({ format: "carrusel" }, idea).cambios).toMatchObject({ guion: idea.guion });
    expect(rellenarConIdea({ format: "carrusel" }, idea).cambios.textoPieza).toBeUndefined();
    expect(rellenarConIdea({ format: "reel" }, idea).cambios.textoPieza).toBeUndefined();
  });

  it("sólo rellena: lo escrito se queda, y el producto que ya tenía no se cambia", () => {
    const { cambios } = rellenarConIdea({ format: "post", title: "Mío", escena: "La mía", productoId: "p9" }, idea);
    expect(cambios.title).toBeUndefined();
    expect(cambios.escena).toBeUndefined();
    expect(cambios.productoId).toBeUndefined();
    expect(cambios.producto).toBeUndefined();
    expect(cambios.idea).toBe(idea.brief);
  });
});
