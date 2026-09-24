import { describe, it, expect } from "vitest";
import {
  fechaEnZona, sumarDias, diasEntre, diaSemana, periodoVigente, debeReabrirse,
  fechaObjetivo, clasificar, textoAtraso, textoFecha, tareaDesdeIA,
} from "./agenda";

// Jueves 24 de septiembre de 2026.
const HOY = "2026-09-24";

describe("fechas como texto", () => {
  it("el día en Panamá no es el de UTC a partir de las siete de la tarde", () => {
    // 01:30 UTC del 25 son las 20:30 del 24 en Panamá.
    expect(fechaEnZona(new Date("2026-09-25T01:30:00Z"))).toBe("2026-09-24");
  });

  it("suma, resta y cuenta días cruzando meses", () => {
    expect(sumarDias("2026-09-30", 1)).toBe("2026-10-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(diasEntre("2026-09-22", HOY)).toBe(2);
    expect(diaSemana(HOY)).toBe(4);
  });
});

describe("periodoVigente", () => {
  it("una que no se repite no tiene periodo", () => {
    expect(periodoVigente({ recurrence: "none" }, HOY)).toBeNull();
  });

  it("la diaria es hoy", () => {
    expect(periodoVigente({ recurrence: "daily" }, HOY)).toEqual({ inicio: HOY, vence: HOY });
  });

  it("la semanal de los lunes: el lunes de esta semana", () => {
    expect(periodoVigente({ recurrence: "weekly", recurrence_day: 1 }, HOY))
      .toEqual({ inicio: "2026-09-21", vence: "2026-09-21" });
  });

  it("la semanal de los viernes, un jueves: la del viernes pasado", () => {
    expect(periodoVigente({ recurrence: "weekly", recurrence_day: "5" }, HOY).vence).toBe("2026-09-18");
  });

  it("la semanal de cualquier día empieza el lunes y vence el domingo", () => {
    expect(periodoVigente({ recurrence: "weekly", recurrence_day: null }, HOY))
      .toEqual({ inicio: "2026-09-21", vence: "2026-09-27" });
  });

  it("la mensual del 15 ya pasó este mes", () => {
    expect(periodoVigente({ recurrence: "monthly", recurrence_day: "15" }, HOY).vence).toBe("2026-09-15");
  });

  it("la del último viernes todavía no llega: cuenta la del mes pasado", () => {
    // Último viernes de septiembre 2026: el 25. El de agosto: el 28.
    expect(periodoVigente({ recurrence: "monthly", recurrence_day: "last_friday" }, HOY).vence).toBe("2026-08-28");
    expect(periodoVigente({ recurrence: "monthly", recurrence_day: "last_friday" }, "2026-09-25").vence).toBe("2026-09-25");
  });

  it("un día 31 en un mes de 30 cae el 30, no desaparece", () => {
    expect(periodoVigente({ recurrence: "monthly", recurrence_day: "31" }, "2026-09-30").vence).toBe("2026-09-30");
  });
});

describe("debeReabrirse", () => {
  const cerrada = (extra) => ({ status: "completed", ...extra });

  it("la diaria que se hizo ayer vuelve", () => {
    expect(debeReabrirse(cerrada({ recurrence: "daily", completed_at: "2026-09-23T15:00:00Z" }), HOY)).toBe(true);
  });

  it("la diaria que se hizo hoy no", () => {
    expect(debeReabrirse(cerrada({ recurrence: "daily", completed_at: "2026-09-24T15:00:00Z" }), HOY)).toBe(false);
  });

  it("la diaria hecha a las 8 de la noche de ayer en Panamá tampoco se confunde con hoy", () => {
    // 01:00 UTC del 24 = 20:00 del 23 en Panamá: fue AYER.
    expect(debeReabrirse(cerrada({ recurrence: "daily", completed_at: "2026-09-24T01:00:00Z" }), HOY)).toBe(true);
  });

  it("la de los lunes hecha el lunes sigue cerrada hasta el lunes que viene", () => {
    const t = cerrada({ recurrence: "weekly", recurrence_day: 1, completed_at: "2026-09-21T14:00:00Z" });
    expect(debeReabrirse(t, HOY)).toBe(false);
    expect(debeReabrirse(t, "2026-09-28")).toBe(true);
  });

  it("una que no se repite no se reabre nunca", () => {
    expect(debeReabrirse(cerrada({ recurrence: "none", completed_at: "2020-01-01T00:00:00Z" }), HOY)).toBe(false);
  });

  it("una pendiente no se toca", () => {
    expect(debeReabrirse({ status: "pending", recurrence: "daily" }, HOY)).toBe(false);
  });
});

describe("fechaObjetivo", () => {
  it("gana la más temprana: vencía ayer aunque la marcaste para hoy", () => {
    expect(fechaObjetivo({ due_date: "2026-09-23", today_date: HOY }, HOY)).toBe("2026-09-23");
  });

  it("marcada para hoy y vence la semana que viene: es de hoy", () => {
    expect(fechaObjetivo({ due_date: "2026-10-01", today_date: HOY }, HOY)).toBe(HOY);
  });

  it("sin nada, sin fecha", () => {
    expect(fechaObjetivo({ title: "x" }, HOY)).toBeNull();
  });
});

describe("clasificar", () => {
  const tareas = [
    { id: "vieja", status: "pending", due_date: "2026-09-20", client_id: "a" },
    { id: "marcada-ayer", status: "pending", today_date: "2026-09-23", client_id: "b" },
    { id: "diaria", status: "pending", recurrence: "daily", client_id: "a" },
    { id: "hoy-b", status: "pending", today_date: HOY, client_id: "b", position: 0 },
    { id: "manana", status: "pending", due_date: "2026-09-25", client_id: "" },
    { id: "suelta", status: "pending", client_id: "" },
    { id: "hecha", status: "completed", completed_at: "2026-09-24T16:00:00Z", client_id: "a" },
    { id: "hecha-antes", status: "completed", completed_at: "2026-09-20T16:00:00Z", client_id: "a" },
  ];

  it("reparte en los bloques", () => {
    const b = clasificar(tareas, HOY);
    const ids = (xs) => xs.map((x) => x.tarea.id);
    expect(ids(b.atrasadas)).toEqual(["vieja", "marcada-ayer"]);
    expect(ids(b.proximas)).toEqual(["manana"]);
    expect(ids(b.sinFecha)).toEqual(["suelta"]);
    expect(ids(b.hechasHoy)).toEqual(["hecha"]);
    expect(new Set(ids(b.hoy))).toEqual(new Set(["diaria", "hoy-b"]));
  });

  it("marcada para ayer y no hecha pasa sola a atrasadas, con sus días", () => {
    const b = clasificar(tareas, HOY);
    expect(b.atrasadas.find((x) => x.tarea.id === "marcada-ayer").atraso).toBe(1);
    expect(b.atrasadas.find((x) => x.tarea.id === "vieja").atraso).toBe(4);
  });

  it("la empresa en foco va delante", () => {
    const b = clasificar(tareas, HOY, { foco: "b" });
    expect(b.hoy[0].tarea.id).toBe("hoy-b");
    expect(b.atrasadas[0].tarea.id).toBe("marcada-ayer");
  });
});

describe("textos", () => {
  it("atraso en singular y plural", () => {
    expect(textoAtraso(0)).toBe("");
    expect(textoAtraso(1)).toBe("Atrasada 1 día");
    expect(textoAtraso(3)).toBe("Atrasada 3 días");
  });

  it("fechas cercanas con nombre", () => {
    expect(textoFecha(HOY, HOY)).toBe("Hoy");
    expect(textoFecha("2026-09-25", HOY)).toBe("Mañana");
    expect(textoFecha("2026-10-02", HOY)).toBe("2 oct");
  });
});

describe("tareaDesdeIA", () => {
  it("pasa recurrencia, fecha límite y «para hoy» a columnas", () => {
    expect(tareaDesdeIA({ recurrencia: "daily", fecha_limite: "2026-09-30", para_hoy: true }, HOY))
      .toEqual({ recurrence: "daily", due_date: "2026-09-30", today_date: HOY });
  });

  it("una recurrencia que no existe se queda en «una vez»", () => {
    expect(tareaDesdeIA({ recurrencia: "cada rato" }, HOY).recurrence).toBe("none");
  });

  it("una fecha mal escrita se rechaza con motivo, no se guarda", () => {
    expect(tareaDesdeIA({ fecha_limite: "el viernes" }, HOY).error).toMatch(/AAAA-MM-DD/);
  });
});
