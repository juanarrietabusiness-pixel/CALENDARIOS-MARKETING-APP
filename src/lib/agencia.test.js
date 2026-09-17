import { describe, it, expect } from "vitest";
import { buscarCliente, consultarPublicaciones, resumenAgencia, indiceParaPrompt } from "./agencia.js";

// Octubre de 2026: el 1 es jueves, el 5 y el 12 son lunes.
const clients = [
  {
    id: "c1", name: "Baby Caleb", industry: "infantil",
    calendars: [{
      name: "Octubre", month: 9, year: 2026,
      days: [
        { date: "2026-10-01", posts: [
          { id: "a1", format: "post", category: "venta", status: "approved",
            idea: "Idea A", descripcion: "Desc A", publishTime: "09:00" },
        ] },
        { date: "2026-10-05", posts: [
          { id: "a2", format: "reel", category: "educativo", status: "pending",
            idea: "Idea B", descripcion: "", guion: "", publishTime: "" },
        ] },
      ],
    }],
  },
  {
    id: "c2", name: "Panadería Rosa", industry: "alimentos",
    calendars: [{
      name: "Septiembre", month: 8, year: 2026,
      days: [
        { date: "2026-09-03", posts: [
          { id: "b1", format: "post", category: "venta", status: "published",
            idea: "Idea C", descripcion: "Desc C", publishTime: "18:00" },
        ] },
      ],
    }],
  },
];

describe("encontrar al cliente como lo nombra una persona", () => {
  it("por id, por nombre exacto y por trozo del nombre", () => {
    expect(buscarCliente(clients, "c1").name).toBe("Baby Caleb");
    expect(buscarCliente(clients, "Baby Caleb").name).toBe("Baby Caleb");
    expect(buscarCliente(clients, "baby").name).toBe("Baby Caleb");
    expect(buscarCliente(clients, "PANADERÍA rosa").name).toBe("Panadería Rosa");
  });

  it("y devuelve null cuando no existe, en vez del primero de la lista", () => {
    expect(buscarCliente(clients, "no existe")).toBeNull();
    expect(buscarCliente(clients, "")).toBeNull();
  });
});

describe("consultar publicaciones de toda la agencia", () => {
  it("sin filtros trae las de todos los clientes, con su dueño", () => {
    const r = consultarPublicaciones(clients);
    expect(r.total).toBe(3);
    // Sin el nombre del cliente, una lista que mezcla clientes no sirve.
    expect(r.publicaciones.map((p) => p.cliente)).toEqual(["Baby Caleb", "Baby Caleb", "Panadería Rosa"]);
  });

  it("filtra por cliente", () => {
    const r = consultarPublicaciones(clients, { cliente: "baby" });
    expect(r.total).toBe(2);
  });

  it("el mes se pide 1-12 aunque se guarde 0-11", () => {
    // Pedir «mes 10» y recibir septiembre es el fallo silencioso clásico.
    expect(consultarPublicaciones(clients, { mes: 10 }).total).toBe(2);
    expect(consultarPublicaciones(clients, { mes: 9 }).total).toBe(1);
  });

  it("filtra por estado, formato y día", () => {
    expect(consultarPublicaciones(clients, { estado: "pending" }).total).toBe(1);
    expect(consultarPublicaciones(clients, { formato: "reel" }).total).toBe(1);
    expect(consultarPublicaciones(clients, { dia: "lunes" }).total).toBe(1);
  });

  it("filtra por rango de fechas", () => {
    const r = consultarPublicaciones(clients, { desde: "2026-10-01", hasta: "2026-10-03" });
    expect(r.total).toBe(1);
    expect(r.publicaciones[0].id).toBe("a1");
  });

  it("encuentra lo que está a medias: sin descripción, sin guion, sin hora", () => {
    expect(consultarPublicaciones(clients, { sin_descripcion: true }).total).toBe(1);
    expect(consultarPublicaciones(clients, { sin_hora: true }).total).toBe(1);
    expect(consultarPublicaciones(clients, { sin_descripcion: true }).publicaciones[0].id).toBe("a2");
  });

  it("dice la hora en el formato en que se lee, y avisa cuando no hay", () => {
    const r = consultarPublicaciones(clients, { cliente: "baby" });
    expect(r.publicaciones[0].hora).toBe("9:00 AM");
    expect(r.publicaciones[1].hora).toBe("sin asignar");
  });

  it("numera la semana igual que los conceptos semanales", () => {
    const r = consultarPublicaciones(clients, { cliente: "baby" });
    expect(r.publicaciones.map((p) => p.semana)).toEqual([1, 1]);
  });

  it("un cliente que no existe se dice, no se devuelve vacío", () => {
    // Devolver «0 publicaciones» haría que la IA informara de que no hay
    // nada, que es una respuesta distinta de «ese cliente no existe».
    const r = consultarPublicaciones(clients, { cliente: "Zzz" });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toMatch(/no encontré/i);
  });
});

describe("el resumen de la agencia", () => {
  it("cuenta por estado y por cliente", () => {
    const r = resumenAgencia(clients);
    expect(r.clientes).toBe(2);
    expect(r.publicaciones).toBe(3);
    expect(r.pendientes).toBe(1);
    expect(r.detalle[0].approved).toBe(1);
    expect(r.detalle[1].published).toBe(1);
  });

  it("cuenta las que están sin hora", () => {
    expect(resumenAgencia(clients).detalle[0].sin_hora).toBe(1);
  });

  it("aguanta una agencia vacía", () => {
    const r = resumenAgencia([]);
    expect(r.clientes).toBe(0);
    expect(r.publicaciones).toBe(0);
  });
});

describe("el índice que va en el prompt", () => {
  it("una línea por cliente, con su id para poder preguntar por él", () => {
    const texto = indiceParaPrompt(clients);
    expect(texto.split("\n")).toHaveLength(2);
    expect(texto).toContain("Baby Caleb");
    expect(texto).toContain("ID: c1");
    expect(texto).toContain("10/2026");
  });

  it("y lo dice en alto cuando no hay clientes", () => {
    expect(indiceParaPrompt([])).toMatch(/sin clientes/i);
  });
});
