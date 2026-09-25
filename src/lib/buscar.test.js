import { describe, it, expect } from "vitest";
import { buscarEnEspacio, normalizarBusqueda } from "./buscar.js";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const clients = [
  {
    id: "c1", name: "Café Luna", industry: "Cafetería",
    calendars: [{
      id: "k1", month: 8, year: 2026, name: "",
      days: [{ date: "2026-09-03", posts: [{ id: "p1", idea: "Receta de cold brew", status: "pending" }] }],
    }],
  },
  { id: "c2", name: "Baby Caleb", industry: "Bebés", calendars: [] },
];

describe("buscarEnEspacio", () => {
  it("sin texto ofrece acciones y clientes, no publicaciones", () => {
    const r = buscarEnEspacio({ clients, texto: "", meses: MESES });
    expect(r.some((x) => x.grupo === "Acciones")).toBe(true);
    expect(r.filter((x) => x.grupo === "Clientes")).toHaveLength(2);
    expect(r.some((x) => x.grupo === "Publicaciones")).toBe(false);
  });

  it("busca sin tildes ni mayúsculas", () => {
    const r = buscarEnEspacio({ clients, texto: "cafe", meses: MESES });
    expect(r.find((x) => x.grupo === "Clientes")?.accion).toEqual({ tipo: "cliente", clienteId: "c1" });
  });

  it("encuentra un calendario por el nombre del mes y una publicación por su idea", () => {
    expect(buscarEnEspacio({ clients, texto: "septiembre", meses: MESES }).find((x) => x.grupo === "Calendarios")?.accion)
      .toEqual({ tipo: "calendario", clienteId: "c1", calId: "k1" });
    expect(buscarEnEspacio({ clients, texto: "cold brew", meses: MESES }).find((x) => x.grupo === "Publicaciones")?.accion)
      .toEqual({ tipo: "publicacion", clienteId: "c1", calId: "k1", postId: "p1" });
  });

  it("«Nuevo calendario» sólo con un cliente abierto", () => {
    expect(buscarEnEspacio({ clients, texto: "nuevo calendario", meses: MESES }).some((x) => x.clave === "nuevo-cal")).toBe(false);
    expect(buscarEnEspacio({ clients, client: clients[0], texto: "nuevo calendario", meses: MESES }).some((x) => x.clave === "nuevo-cal")).toBe(true);
  });

  it("normaliza", () => {
    expect(normalizarBusqueda("  Ñandú ")).toBe("nandu");
  });
});
