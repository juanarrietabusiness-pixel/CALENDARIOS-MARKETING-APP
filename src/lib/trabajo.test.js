import { describe, it, expect } from "vitest";
import { mencionesEn, etapaDe, visibleParaCliente, cambiosEntre, cargaDelEquipo, etapaTrasProducir } from "./trabajo.js";

const EQUIPO = [
  { userId: "a", nombre: "Ana María" },
  { userId: "b", nombre: "Bruno" },
  { userId: "c", nombre: "Ana López" },
];

describe("menciones", () => {
  it("el nombre entero o el primero, sin tildes ni mayúsculas", () => {
    expect(mencionesEn("@bruno mira esto", EQUIPO)).toEqual(["b"]);
    expect(mencionesEn("Hola @Ana María, ¿y la foto?", EQUIPO)).toEqual(["a"]);
  });
  it("un primer nombre que comparten dos no avisa a nadie (mejor que avisar a quien no era)", () => {
    expect(mencionesEn("@Ana ¿puedes?", EQUIPO)).toEqual([]);
  });
  it("un correo no es una mención", () => {
    expect(mencionesEn("escribe a bruno@x.com", EQUIPO)).toEqual([]);
    expect(mencionesEn("@Brunoso", EQUIPO)).toEqual([]);
  });
});

describe("etapas", () => {
  it("las manuales las pone el equipo; las demás salen de la aprobación y la cola", () => {
    expect(etapaDe({})).toBe("idea");
    expect(etapaDe({ medios: [{ src: "/api/media/clientes/c/a.jpg" }] })).toBe("produccion");
    expect(etapaDe({ etapa: "revision" })).toBe("revision");
    expect(etapaDe({}, { compartido: true })).toBe("cliente");
    expect(etapaDe({ status: "approved", subidaRapida: true })).toBe("aprobada");
    expect(etapaDe({ status: "approved" }, { estadoCola: "programada" })).toBe("programada");
    expect(etapaDe({ status: "published" })).toBe("publicada");
  });
  it("idea aprobada o cambios pedidos: vuelve a producción", () => {
    expect(etapaDe({ status: "approved", aprobadaComo: "idea", etapa: "cliente" })).toBe("produccion");
    expect(etapaDe({ status: "rejected", etapa: "cliente" })).toBe("produccion");
  });
  it("al terminar de producir: a revisión si el cliente la pide", () => {
    expect(etapaTrasProducir(true)).toBe("revision");
    expect(etapaTrasProducir(false)).toBe("cliente");
  });
  it("con revisión interna el cliente sólo ve lo que la pasó", () => {
    expect(visibleParaCliente({ etapa: "revision" }, true)).toBe(false);
    expect(visibleParaCliente({}, true)).toBe(false);
    expect(visibleParaCliente({ etapa: "cliente" }, true)).toBe(true);
    expect(visibleParaCliente({ status: "approved" }, true)).toBe(true);
    expect(visibleParaCliente({ etapa: "idea" }, false)).toBe(true);
  });
});

describe("historial", () => {
  const dia = (date, posts) => ({ date, posts });
  it("dice en palabras qué cambió", () => {
    const antes = [dia("2026-10-05", [{ id: "1", title: "Promo", descripcion: "a", publishTime: "09:00" }, { id: "2", title: "Vieja" }])];
    const despues = [
      dia("2026-10-06", [{ id: "1", title: "Promo", descripcion: "b", publishTime: "10:00", responsableId: "b", etapa: "revision" }]),
      dia("2026-10-07", [{ id: "3", title: "Nueva" }]),
    ];
    const c = cambiosEntre(antes, despues, (id) => ({ b: "Bruno" })[id]).map((x) => x.accion);
    expect(c).toEqual([
      "La movió del 5/10 al 6/10",
      "Cambió la hora a 10:00",
      "Cambió el texto",
      "La pasó a «Revisión interna»",
      "Se la asignó a Bruno",
      "Creó «Nueva» (7/10)",
      "Quitó «Vieja» del calendario",
    ]);
  });
  it("sin cambios, nada", () => {
    const d = [dia("2026-10-05", [{ id: "1", title: "X" }])];
    expect(cambiosEntre(d, d)).toEqual([]);
  });
});

describe("carga del equipo", () => {
  it("publicaciones que lleva y tareas, por día; lo sin dueño aparte", () => {
    const carga = cargaDelEquipo({
      miembros: [{ userId: "b", nombre: "Bruno" }],
      clients: [{ calendars: [{ days: [
        { date: "2026-10-01", posts: [{ id: "1", responsableId: "b" }, { id: "2" }] },
        { date: "2026-09-29", posts: [{ id: "3", responsableId: "b" }] },
        { date: "2026-10-02", posts: [{ id: "4", responsableId: "b", status: "published" }] },
      ] }] }],
      tareas: [{ asignado_id: "b", due_date: "2026-10-03" }, { asignado_id: "b", status: "completed", due_date: "2026-10-03" }],
      hoy: "2026-10-01",
    });
    expect(carga[0]).toMatchObject({ nombre: "Bruno", publicaciones: 2, tareas: 1, atrasadas: 1, porDia: { "2026-10-01": 1, "2026-10-03": 1 } });
    expect(carga[1]).toMatchObject({ nombre: "Sin asignar", publicaciones: 1 });
  });
});
