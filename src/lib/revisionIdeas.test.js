import { describe, it, expect } from "vitest";
import { aprobadaPorDentro, porRevisar, ideasDeRevision } from "./revisionIdeas.js";

describe("la revisión interna de las ideas", () => {
  it("una idea aprobada por dentro está en producción (o más allá); lo publicado no se revisa", () => {
    expect(aprobadaPorDentro({ etapa: "produccion" })).toBe(true);
    expect(aprobadaPorDentro({ etapa: "cliente" })).toBe(true);
    expect(aprobadaPorDentro({ etapa: "idea" })).toBe(false);
    expect(porRevisar({})).toBe(true);
    expect(porRevisar({ status: "published" })).toBe(false);
  });

  it("se revisan las que tienen idea y no tienen contenido, por fecha", () => {
    const cal = { days: [
      { date: "2030-03-05", posts: [{ id: "b", idea: "B" }, { id: "c", idea: "C", medios: [{ src: "x" }] }] },
      { date: "2030-03-04", posts: [{ id: "a", title: "A" }, { id: "d" }, { id: "e", idea: "E", status: "published" }] },
    ] };
    expect(ideasDeRevision(cal).map(({ post }) => post.id)).toEqual(["a", "b"]);
  });
});
