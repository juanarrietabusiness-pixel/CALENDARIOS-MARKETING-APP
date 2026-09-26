import { describe, it, expect } from "vitest";
import {
  tipoAprobacion, huellaPieza, aprobacionVigente, conAprobacion, porProducir, listaParaProgramar,
  cambiosTrasAprobar, avisoCambios, pedirAprobacion, resumenEnvio, aprobadasDelEspacio,
} from "./aprobacion.js";

const IMG = { src: "/api/media/clientes/c1/a.jpg", tipo: "imagen" };

describe("qué se le pide al cliente", () => {
  it("sin elegir: pieza si hay archivo, idea si no", () => {
    expect(tipoAprobacion({})).toBe("idea");
    expect(tipoAprobacion({ medios: [IMG] })).toBe("pieza");
    expect(tipoAprobacion({ medios: [IMG], aprobacion: "idea" })).toBe("idea");
  });

  it("el resumen del envío cuenta lo que falta por aprobar", () => {
    expect(resumenEnvio([{ posts: [{ status: "pending" }, { status: "pending", medios: [IMG] }, { status: "approved" }] }]))
      .toEqual({ idea: 1, pieza: 1 });
  });
});

describe("la respuesta del cliente", () => {
  const review = { estado: "aprobado", tipo: "idea", huella: "h", timestamp: "2026-10-01T10:00:00Z" };

  it("una idea aprobada queda por producir, no por programar", () => {
    const p = conAprobacion({ id: "1" }, review);
    expect(p.status).toBe("approved");
    expect(porProducir(p)).toBe(true);
    expect(listaParaProgramar(p)).toBe(false);
  });

  it("una pieza aprobada (o sin tipo, de antes) está lista para programar", () => {
    expect(listaParaProgramar(conAprobacion({ id: "1" }, { ...review, tipo: "pieza" }))).toBe(true);
    expect(listaParaProgramar(conAprobacion({ id: "1", medios: [IMG] }, { ...review, tipo: null }))).toBe(true);
    // Lo subido con «Subir»: aprobada sin pasar por el cliente.
    expect(listaParaProgramar({ status: "approved", subidaRapida: true })).toBe(true);
    expect(listaParaProgramar({ status: "approved", asistida: true })).toBe(false);
  });

  it("pedir otra vez la aprobación invalida lo que respondió antes", () => {
    const p = pedirAprobacion({ id: "1", status: "approved", aprobadaComo: "idea" }, "2026-10-02T00:00:00Z");
    expect(p).toMatchObject({ status: "pending", aprobacion: "pieza", pideAprobacionDesde: "2026-10-02T00:00:00Z" });
    expect(p.aprobadaComo).toBeUndefined();
    expect(aprobacionVigente(p, review)).toBeNull();
    expect(conAprobacion(p, review).status).toBe("pending");
    expect(aprobacionVigente(p, { ...review, timestamp: "2026-10-03T00:00:00Z" })).toBeTruthy();
  });

  it("«cambios» marca la publicación; una publicada no la pisa nadie", () => {
    expect(conAprobacion({ id: "1" }, { estado: "cambios" }).status).toBe("rejected");
    expect(conAprobacion({ id: "1", status: "published" }, review).status).toBe("published");
  });
});

describe("lo que cambió después del sí", () => {
  const base = { id: "1", descripcion: "Hola", hashtagsFinales: "#a" };
  const aprobada = { ...base, status: "approved", aprobadaComo: "pieza", huellaAprobada: huellaPieza(base), aprobadaAt: "2026-10-01T10:00:00Z" };

  it("nada: sin aviso", () => {
    expect(cambiosTrasAprobar(aprobada)).toEqual([]);
    expect(avisoCambios(aprobada)).toBe("");
  });

  it("el texto y los archivos, en palabras", () => {
    expect(cambiosTrasAprobar({ ...aprobada, descripcion: "Adiós" })).toEqual(["el texto"]);
    expect(avisoCambios({ ...aprobada, descripcion: "Adiós", mediosCambiadosAt: "2026-10-02T00:00:00Z" }))
      .toBe("Cambiaste el texto y los archivos después de que el cliente la aprobara.");
  });

  it("los archivos cambiados ANTES de aprobar no cuentan", () => {
    expect(cambiosTrasAprobar({ ...aprobada, mediosCambiadosAt: "2026-09-30T00:00:00Z" })).toEqual([]);
  });
});

describe("lo aprobado de todo el espacio", () => {
  const cal = (posts, date = "2026-10-10") => ({ id: "cal1", client_id: "c1", name: "Octubre", days: JSON.stringify([{ date, posts }]) });

  it("reparte por programar y por producir, y salta lo que ya está en la cola o ya pasó", () => {
    const r = aprobadasDelEspacio({
      calendarios: [cal([{ id: "a", medios: [IMG] }, { id: "b" }, { id: "c", medios: [IMG] }]), { ...cal([{ id: "d", medios: [IMG] }], "2026-09-01"), id: "cal2" }],
      aprobaciones: [
        { calendar_id: "cal1", post_id: "a", estado: "aprobado", tipo: "pieza", updated_at: "x" },
        { calendar_id: "cal1", post_id: "b", estado: "aprobado", tipo: "idea", updated_at: "x" },
        { calendar_id: "cal1", post_id: "c", estado: "aprobado", tipo: "pieza", updated_at: "x" },
        { calendar_id: "cal2", post_id: "d", estado: "aprobado", tipo: "pieza", updated_at: "x" },
      ],
      filas: [{ calendar_id: "cal1", post_id: "c", estado: "programada" }],
      clientes: { c1: "Café Luna" },
    }, "2026-10-01");
    expect(r.porProgramar.map((x) => x.postId)).toEqual(["a"]);
    expect(r.porProducir.map((x) => x.postId)).toEqual(["b"]);
    expect(r.porProgramar[0].cliente).toBe("Café Luna");
  });
});
