import { describe, it, expect } from "vitest";
import { publicacionesParaPoner, direccionDePublicacion } from "./ponerPiezas.js";

const cal = (id, days) => ({ id, days });
const calendars = [
  cal("nov", [
    { date: "2026-10-20", posts: [{ id: "viejo", format: "post", title: "De hace un mes" }] },
    { date: "2026-11-02", posts: [{ id: "semana", format: "post", title: "De hace tres días" }] },
    { date: "2026-11-10", posts: [
      { id: "reel", format: "reel", title: "Reel del sofá" },
      { id: "post", format: "post", title: "Sofá cama", medios: [{ src: "/api/media/clientes/c1/a.png" }] },
      { id: "salio", format: "post", title: "Ya publicado", status: "published" },
    ] },
  ]),
  cal("dic", [{ date: "2026-12-04", posts: [{ id: "dic", format: "carrusel", title: "Navidad" }] }]),
];

describe("«Poner en una publicación…»: a cuáles", () => {
  it("de una semana atrás en adelante, de cualquier mes, sin lo ya publicado", () => {
    const l = publicacionesParaPoner(calendars, { hoy: "2026-11-05" });
    expect(l.map((p) => p.postId)).toEqual(["semana", "post", "reel", "dic"]);
    expect(l.find((p) => p.postId === "post")).toMatchObject({ calendarId: "nov", medios: 1, etiqueta: "10 nov · Post · Sofá cama" });
    expect(l.find((p) => p.postId === "dic").calendarId).toBe("dic");
  });

  it("un video pone primero, en su día, los reels y las historias", () => {
    expect(publicacionesParaPoner(calendars, { hoy: "2026-11-05", tipo: "video" }).map((p) => p.postId)).toEqual(["semana", "reel", "post", "dic"]);
  });

  it("buscando entran también las pasadas (sin tildes)", () => {
    expect(publicacionesParaPoner(calendars, { hoy: "2026-11-05", buscar: "mes" }).map((p) => p.postId)).toEqual(["viejo"]);
    expect(publicacionesParaPoner(calendars, { hoy: "2026-11-05", buscar: "sofa" }).map((p) => p.postId)).toEqual(["post", "reel"]);
  });

  it("la dirección abre la publicación en su calendario", () => {
    expect(direccionDePublicacion("c1", "dic", "p 1")).toBe("/cliente/c1/dic?publicacion=p%201");
  });
});
