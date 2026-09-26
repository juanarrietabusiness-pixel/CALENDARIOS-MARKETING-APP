import { describe, it, expect } from "vitest";
import { formatoDeMedios, redesPorDefecto, rellenarDesdeContenido, ponerEnDia, moverEnCalendario, tieneContenido } from "./subir.js";

const img = (n) => ({ src: `/api/media/clientes/c/${n}.jpg`, tipo: "imagen" });
const vid = { src: "/api/media/clientes/c/v.mp4", tipo: "video" };

describe("subir contenido", () => {
  it("el formato sale del archivo", () => {
    expect(formatoDeMedios([])).toBeNull();
    expect(formatoDeMedios([img(1)])).toBe("post");
    expect(formatoDeMedios([img(1), img(2)])).toBe("carrusel");
    expect(formatoDeMedios([vid])).toBe("reel");
  });

  it("las redes, las que el cliente tiene", () => {
    expect(redesPorDefecto(["facebook", "instagram", "tiktok"])).toEqual(["instagram", "facebook"]);
    expect(redesPorDefecto(["tiktok"])).toEqual(["tiktok"]);
    expect(redesPorDefecto([])).toEqual(["instagram"]);
  });

  it("la IA rellena lo vacío y no pisa lo escrito", () => {
    const { post, rellenados } = rellenarDesdeContenido(
      { format: "post", descripcion: "Mío", idea: "" },
      { descripcion: "De la IA", hashtags: "#a #b", primerComentario: "Pide por WhatsApp", altTexto: "Una taza", idea: "Latte", titulo: "Otoño" },
    );
    expect(post).toMatchObject({ descripcion: "Mío", hashtagsFinales: "#a #b", primerComentario: "Pide por WhatsApp", altTexto: "Una taza", idea: "Latte", title: "Otoño" });
    expect(rellenados).not.toContain("descripcion");
  });

  it("a una historia no le escribe caption", () => {
    const { post } = rellenarDesdeContenido({ format: "historia" }, { descripcion: "x", hashtags: "#a", altTexto: "y" });
    expect(post.descripcion).toBeUndefined();
    expect(post.altTexto).toBe("y");
  });

  it("poner en un día crea el día con su semana y su concepto si falta", () => {
    const cal = { days: [{ date: "2026-10-06", weekNumber: 2, concept: "Otoño", posts: [] }] };
    const r = ponerEnDia(cal, "2026-10-08", { id: "n" });
    expect(r.days.map((d) => d.date)).toEqual(["2026-10-06", "2026-10-08"]);
    expect(r.days[1]).toMatchObject({ dayName: "Jueves", weekNumber: 2, concept: "Otoño", posts: [{ id: "n" }] });
    expect(ponerEnDia(r, "2026-10-08", { id: "m" }).days[1].posts.map((p) => p.id)).toEqual(["n", "m"]);
  });

  it("mover cambia la publicación de día sin tocar las demás", () => {
    const cal = { days: [{ date: "2026-10-06", posts: [{ id: "a" }, { id: "b" }] }] };
    const r = moverEnCalendario(cal, "a", "2026-10-09");
    expect(r.days.find((d) => d.date === "2026-10-06").posts.map((p) => p.id)).toEqual(["b"]);
    expect(r.days.find((d) => d.date === "2026-10-09").posts.map((p) => p.id)).toEqual(["a"]);
  });

  it("sólo lo subido a la aplicación se le puede enseñar a la IA", () => {
    expect(tieneContenido({ medios: [img(1)] })).toBe(true);
    expect(tieneContenido({ image: "data:image/png;base64,xx" })).toBe(false);
  });
});
