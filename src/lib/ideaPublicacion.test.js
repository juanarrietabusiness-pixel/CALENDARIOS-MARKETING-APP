import { describe, it, expect } from "vitest";
import { ideaComoElLote, usadosDelMes, notaDePublicacion, rellenarConIdea, casillasDelPlan, casillasSinIdea, estrategiaDelCalendario } from "./ideaPublicacion.js";

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

  it("también el caption, los hashtags y la forma (composición y gancho), sólo si faltan", () => {
    const { cambios } = rellenarConIdea({ format: "post", descripcion: "Mío" }, { ...idea, descripcion: "De la IA", hashtags: "#a #b", composicion: "uso", tactica: "pregunta" });
    expect(cambios).toMatchObject({ hashtagsFinales: "#a #b", composicion: "uso", tactica: "pregunta" });
    expect(cambios.descripcion).toBeUndefined();
  });

  it("las casillas del plan: una por publicación con su clave, su formato y su matriz; sin directos; la idea de la persona", () => {
    const dias = [
      { date: "2030-03-04", wk: 1, impDate: { name: "Día de la madre" }, formats: [{ format: "post" }, { format: "carrusel" }, { format: "live" }] },
      { date: "2030-03-11", wk: 2, formats: [{ format: "reel" }] },
    ];
    const matriz = new Map([["2030-03-04|0", { pilar: "beneficios", productoId: "sofa", nivel: "solucion", deseo: "", perfil: "" }]]);
    const ideas = { "2030-03-04": [{}, { idea: "Errores al comprar un sofá", pilar: "educativo" }] };
    expect(casillasDelPlan(dias, { matriz, semanas: ["Descanso", "Visitas"], ideas })).toEqual([
      { clave: "2030-03-04|0", fecha: "2030-03-04", formato: "post", pilar: "beneficios", productoId: "sofa", nivel: "solucion", semana: "Descanso", especial: "Día de la madre" },
      { clave: "2030-03-04|1", fecha: "2030-03-04", formato: "carrusel", pilar: "educativo", semana: "Descanso", especial: "Día de la madre", idea: "Errores al comprar un sofá" },
      { clave: "2030-03-11|0", fecha: "2030-03-11", formato: "reel", semana: "Visitas" },
    ]);
  });

  it("«Completar los textos»: sólo las publicaciones sin idea ni publicar, por su id; la estrategia sale del calendario", () => {
    const cal = { campaign: "Marzo", offers: "10 %", promoCode: "X", weekConcepts: ["A"], days: [
      { date: "2030-03-04", concept: "A", posts: [{ id: "p1", format: "post", pilar: "anuncio" }, { id: "p2", format: "post", idea: "Ya" }, { id: "p3", format: "carrusel", status: "published" }] },
    ] };
    expect(casillasSinIdea(cal)).toEqual([{ clave: "p1", fecha: "2030-03-04", formato: "post", pilar: "anuncio", semana: "A" }]);
    expect(estrategiaDelCalendario(cal)).toEqual({ campana: "Marzo", ofertas: "10 %", codigo: "X", semanas: ["A"] });
    expect(estrategiaDelCalendario(null)).toEqual({ campana: "", ofertas: "", codigo: "", semanas: [] });
  });
});

describe("«Otra» de una publicación", () => {
  it("la casilla lleva la que había y lo que pide la agencia; la nueva REEMPLAZA lo escrito por la IA y deja lo demás", async () => {
    const { casillaParaOtra, reemplazarConIdea } = await import("./ideaPublicacion.js");
    const post = { id: "p1", format: "post", title: "Duerme mejor", idea: "Vieja", pilar: "beneficios", productoId: "sofa", publishTime: "09:00", medios: [{ src: "x" }] };
    expect(casillaParaOtra(post, { date: "2030-03-04", concept: "Descanso" }, { pide: "más divertida" })).toEqual({
      clave: "p1", fecha: "2030-03-04", formato: "post", pilar: "beneficios", productoId: "sofa", semana: "Descanso", antes: "Duerme mejor", pide: "más divertida",
    });
    expect(casillaParaOtra({ format: "live" })).toBeNull();
    const nueva = reemplazarConIdea(post, { titulo: "Visitas", brief: "Nueva", escena: "Sala", textoPieza: "¿Visitas?", composicion: "uso" });
    expect(nueva).toMatchObject({ title: "Visitas", idea: "Nueva", escena: "Sala", textoPieza: "¿Visitas?", composicion: "uso", publishTime: "09:00", productoId: "sofa" });
    expect(nueva.medios).toEqual([{ src: "x" }]);
    expect(reemplazarConIdea({ format: "carrusel" }, { titulo: "T", guion: "Portada: x", textoPieza: "no" })).toMatchObject({ guion: "Portada: x", textoPieza: "" });
  });
});
