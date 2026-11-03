import { describe, it, expect } from "vitest";
import { mencionesEn, etapaDe, detalleEtapa, marcarEnviadas, visibleParaCliente, cambiosEntre, cargaDelEquipo } from "./trabajo.js";

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
  const MEDIO = { medios: [{ src: "/api/media/clientes/c/a.jpg" }] };
  it("salen solas: idea sin archivos, producción con archivos, cliente al mandarla, programada y publicada", () => {
    expect(etapaDe({})).toBe("idea");
    expect(etapaDe(MEDIO)).toBe("produccion");
    expect(etapaDe({ ...MEDIO, enviadoAt: "2026-11-03T10:00:00Z" })).toBe("cliente");
    expect(etapaDe({ status: "approved" }, { estadoCola: "programada" })).toBe("programada");
    expect(etapaDe({ status: "published" })).toBe("publicada");
    expect(detalleEtapa({ status: "published" })).toMatchObject({ paso: 3, texto: "Publicada" });
  });
  it("marcar la etapa a mano ya no cuenta: `etapa` es sólo lo interno", () => {
    expect(etapaDe({ ...MEDIO, etapa: "revision" })).toBe("produccion");
    expect(etapaDe({ etapa: "cliente" })).toBe("idea");
  });
  it("en el paso «Cliente» dice en qué quedó", () => {
    expect(detalleEtapa({ ...MEDIO, status: "approved" }).texto).toBe("Aprobada por el cliente");
    expect(detalleEtapa({ ...MEDIO, status: "rejected", cambiosAt: "2026-11-02" })).toMatchObject({ etapa: "cliente", texto: "Pidió cambios" });
    expect(detalleEtapa({ ...MEDIO, status: "rejected", cambiosAt: "2026-11-02", actualizadaAt: "2026-11-03" }).texto).toBe("Corregida · falta que la vea");
  });
  it("idea aprobada: a producir", () => {
    expect(detalleEtapa({ status: "approved", aprobadaComo: "idea" })).toMatchObject({ etapa: "produccion", texto: "Idea aprobada · por producir" });
  });
  it("los meses mandados antes de apuntar el envío: con enlace, con el cliente", () => {
    expect(etapaDe(MEDIO, { compartido: true })).toBe("cliente");
  });
  it("con revisión interna: falta aprobarla por dentro; aprobada por dentro, lista para mandar", () => {
    expect(detalleEtapa(MEDIO, { revisionInterna: true }).texto).toBe("Falta la revisión interna");
    expect(detalleEtapa({ ...MEDIO, etapa: "cliente" }, { revisionInterna: true }).texto).toMatch(/Aprobada por dentro/);
    expect(etapaDe(MEDIO, { compartido: true, revisionInterna: true }), "con enlace, pero el cliente no la ve").toBe("produccion");
  });
  it("marcarEnviadas: sólo las pendientes que el cliente ve y que no estaban mandadas", () => {
    const days = [{ date: "2026-11-03", posts: [
      { id: "a", ...MEDIO }, { id: "b", status: "approved" }, { id: "c", enviadoAt: "antes" }, { id: "d", etapa: "revision" },
    ] }];
    const r = marcarEnviadas(days, { cuando: "ahora" });
    expect(r[0].posts.map((p) => p.enviadoAt)).toEqual(["ahora", undefined, "antes", "ahora"]);
    const conRevision = marcarEnviadas(days, { cuando: "ahora", revisionInterna: true });
    expect(conRevision[0].posts.find((p) => p.id === "d").enviadoAt, "con revisión interna, lo que no pasó no se manda").toBeUndefined();
    expect(marcarEnviadas(r, { cuando: "otra" }), "nada nuevo que marcar: los mismos días").toBe(r);
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
      "La devolvió a revisión interna",
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
