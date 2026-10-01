import { describe, it, expect } from "vitest";
import { redesDe } from "./publicacion.js";
import {
  formatoDeMedios, redesPorDefecto, rellenarDesdeContenido, ponerEnDia, moverEnCalendario, tieneContenido,
  queSaleEn, resumenDestino, publicacionVacia, deIdeaAPublicacion,
} from "./subir.js";

const img = (n) => ({ src: `/api/media/clientes/c/${n}.jpg`, tipo: "imagen" });
const vid = { src: "/api/media/clientes/c/v.mp4", tipo: "video" };

describe("subir contenido", () => {
  it("el formato sale del archivo", () => {
    expect(formatoDeMedios([])).toBeNull();
    expect(formatoDeMedios([img(1)])).toBe("post");
    expect(formatoDeMedios([img(1), img(2)])).toBe("carrusel");
    expect(formatoDeMedios([vid])).toBe("reel");
  });

  it("las redes: TODAS las que el cliente tiene y pueden llevarla", () => {
    const reel = { format: "reel", medios: [vid] };
    expect(redesPorDefecto(["facebook", "instagram", "tiktok"], reel)).toEqual(["instagram", "facebook", "tiktok"]);
    // Una imagen no sale en TikTok: no se marca sola.
    expect(redesPorDefecto(["facebook", "instagram", "tiktok"], { format: "post", medios: [img(1)] })).toEqual(["instagram", "facebook"]);
    // Un reel aún sin archivo sí: lo tendrá.
    expect(redesPorDefecto(["instagram", "tiktok"], { format: "reel" })).toEqual(["instagram", "tiktok"]);
    // Ni historias ni directos en las redes de video.
    expect(redesPorDefecto(["instagram", "tiktok"], { format: "historia", medios: [vid] })).toEqual(["instagram"]);
    expect(redesPorDefecto(["tiktok"], reel)).toEqual(["tiktok"]);
    expect(redesPorDefecto([], reel)).toEqual(["instagram"]);
  });

  it("lo elegido gana sobre lo de por defecto", () => {
    expect(redesDe({ redes: ["facebook"] }, ["instagram", "facebook"])).toEqual(["facebook"]);
    expect(redesDe({ redes: [] }, ["instagram", "facebook"])).toEqual(["instagram", "facebook"]);
    expect(redesDe({}, [])).toEqual(["instagram"]);
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

  it("dice qué sale en cada red", () => {
    expect(queSaleEn({ format: "historia", medios: [img(1)] }, "instagram")).toBe("historia");
    expect(queSaleEn({ format: "historia", medios: [img(1)] }, "facebook")).toBe("historia");
    expect(queSaleEn({ format: "post", medios: [img(1), img(2)] }, "instagram")).toBe("carrusel");
    expect(queSaleEn({ format: "reel", medios: [vid] }, "instagram")).toBe("reel");
    expect(queSaleEn({ format: "post", medios: [img(1)] }, "facebook")).toBe("publicación");
  });

  it("el resumen dice dónde sale y también dónde NO", () => {
    const historia = { format: "historia", medios: [img(1)] };
    expect(resumenDestino(historia, ["instagram"])).toBe("Sale en Instagram (historia). No sale en Facebook y TikTok.");
    const conSuHistoria = { format: "post", medios: [img(1)], historiaTambien: true, historias: [img(2)] };
    expect(resumenDestino(conSuHistoria, ["instagram", "facebook", "tiktok"]))
      .toBe("Sale en Instagram (post en el feed + historia), Facebook (publicación + historia) y TikTok (video).");
    expect(resumenDestino(historia, [])).toMatch(/ninguna red/);
  });

  it("una publicación recién creada y sin tocar está vacía", () => {
    expect(publicacionVacia({ id: "x", format: "post", status: "pending", title: "", idea: "" })).toBe(true);
    expect(publicacionVacia({ idea: "Latte de otoño" })).toBe(false);
    expect(publicacionVacia({ medios: [img(1)] })).toBe(false);
    expect(publicacionVacia({ comment: "  " })).toBe(true);
  });

  it("una idea del banco entra pendiente, con id nuevo y sin sus marcas", () => {
    const idea = { id: "banco-1", idea: "Visita de obra", format: "reel", status: "approved", _originDate: "2026-10-01", _originCal: "c", _addedAt: "x" };
    const post = deIdeaAPublicacion(idea, "nuevo");
    expect(post).toEqual({ id: "nuevo", idea: "Visita de obra", format: "reel", status: "pending" });
    expect(idea._originDate).toBe("2026-10-01"); // no toca la idea del banco
    // Y entra aunque el día no exista todavía en el mes (el mes sin cajón no tiene días).
    const cal = ponerEnDia({ days: [] }, "2026-11-12", post);
    expect(cal.days).toHaveLength(1);
    expect(cal.days[0].posts[0].id).toBe("nuevo");
  });
});
