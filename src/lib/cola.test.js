import { describe, it, expect } from "vitest";
import { colaDe, resumenCola, filtrarCola, ordenarProgramacion, aprobadasSinProgramar, nombreDia, revisarAprobadas } from "./cola.js";

const fila = (red, estado, extra = {}) => ({ id: `${red}-${estado}`, postId: "p1", red, estado, programadaPara: "2026-10-05T15:00:00.000Z", ...extra });

describe("la cola en el navegador", () => {
  it("una fila por red, la última, y sin las canceladas", () => {
    const c = colaDe([fila("instagram", "error"), fila("instagram", "programada"), fila("facebook", "cancelada")], "p1");
    expect(Object.keys(c)).toEqual(["instagram"]);
    expect(c.instagram.estado).toBe("programada");
  });
  it("la historia de un post es otra pieza de la misma red", () => {
    const c = colaDe([fila("instagram", "programada"), fila("instagram", "programada", { id: "h", variante: "historia" })], "p1");
    expect(Object.keys(c).sort()).toEqual(["instagram", "instagram:historia"]);
  });
  it("el resumen: lo que falló manda; publicada sólo si salió en todas", () => {
    expect(resumenCola([], "p1")).toBeNull();
    expect(resumenCola([fila("instagram", "publicada"), fila("facebook", "error")], "p1").estado).toBe("error");
    expect(resumenCola([fila("instagram", "publicada"), fila("facebook", "programada")], "p1").estado).toBe("programada");
    expect(resumenCola([fila("instagram", "publicada"), fila("facebook", "publicada")], "p1").texto).toBe("Publicada");
  });
  it("programada dice cuándo, en la hora de Panamá", () => {
    expect(resumenCola([fila("instagram", "programada")], "p1").texto).toMatch(/10:00/);
  });
});

describe("la página Programación", () => {
  const hoy = "2026-10-05";
  const f = (id, estado, cuando, extra = {}) => ({ id, postId: id, clientId: "c1", red: "instagram", estado, programadaPara: cuando, ...extra });
  const filas = [
    f("a", "programada", "2026-10-05T20:00:00.000Z"),
    f("b", "programada", "2026-10-09T15:00:00.000Z", { clientId: "c2", red: "facebook" }),
    f("c", "programada", "2026-10-30T15:00:00.000Z"),
    f("d", "error", "2026-09-01T15:00:00.000Z"),
    f("e", "publicada", "2026-10-04T15:00:00.000Z", { publicadaAt: "2026-10-04T15:01:00.000Z" }),
    f("x", "cancelada", "2026-10-05T15:00:00.000Z"),
  ];
  it("el rango corta lo que va a salir; lo que falló sale siempre", () => {
    expect(filtrarCola(filas, { rango: 1 }, hoy).map((x) => x.id).sort()).toEqual(["a", "d", "e"]);
    expect(filtrarCola(filas, { rango: 7 }, hoy).map((x) => x.id).sort()).toEqual(["a", "b", "d", "e"]);
    expect(filtrarCola(filas, { rango: 30 }, hoy).map((x) => x.id)).toContain("c");
  });
  it("filtra por cliente, red y estado", () => {
    expect(filtrarCola(filas, { rango: 30, cliente: "c2" }, hoy).map((x) => x.id)).toEqual(["b"]);
    expect(filtrarCola(filas, { rango: 30, red: "facebook" }, hoy).map((x) => x.id)).toEqual(["b"]);
    expect(filtrarCola(filas, { rango: 30, estado: "pendiente" }, hoy).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(filtrarCola(filas, { rango: 30, estado: "error" }, hoy).map((x) => x.id)).toEqual(["d"]);
  });
  it("tres bloques: fallidas, próximas por día (en Panamá) y publicadas", () => {
    const o = ordenarProgramacion(filtrarCola(filas, { rango: 7 }, hoy), hoy);
    expect(o.fallidas.map((x) => x.id)).toEqual(["d"]);
    expect(o.proximas.map((g) => [g.fecha, g.nombre])).toEqual([["2026-10-05", "Hoy"], ["2026-10-09", "Viernes, 9 de octubre"]]);
    expect(o.publicadas[0]).toMatchObject({ fecha: "2026-10-04", nombre: "Ayer" });
  });
  it("las 20:00 UTC del 6 siguen siendo el día 6 en Panamá; las 03:00 UTC, el día anterior", () => {
    const o = ordenarProgramacion([f("n", "programada", "2026-10-07T03:00:00.000Z")], hoy);
    expect(o.proximas[0].fecha).toBe("2026-10-06");
    expect(nombreDia("2026-10-06", hoy)).toBe("Mañana");
  });
  it("aprobadas sin programar: ni las pasadas, ni las que ya están en cola, ni los directos", () => {
    const days = [
      { date: "2026-10-04", posts: [{ id: "vieja", status: "approved" }] },
      { date: "2026-10-06", posts: [
        { id: "lista", status: "approved" }, { id: "encola", status: "approved" }, { id: "fallo", status: "approved" },
        { id: "pend", status: "pending" }, { id: "vivo", status: "approved", format: "live" },
      ] },
    ];
    const cola = [f("encola", "programada", "2026-10-06T15:00:00.000Z"), f("fallo", "error", "2026-10-06T15:00:00.000Z")];
    expect(aprobadasSinProgramar(days, cola, hoy).map((x) => x.post.id)).toEqual(["lista", "fallo"]);
  });
});

describe("revisar lo aprobado antes de programarlo", () => {
  const imagen = { src: "/api/media/clientes/c1/a.jpg", tipo: "imagen", ancho: 1080, alto: 1350 };
  const post = (extra = {}) => ({ id: "p", format: "post", status: "approved", descripcion: "Hola", medios: [imagen], publishTime: "10:00", ...extra });
  const ahora = Date.parse("2026-10-05T12:00:00Z");
  it("lista si tiene lo que pide la red y su hora no pasó", () => {
    const [r] = revisarAprobadas([{ post: post(), fecha: "2026-10-06" }], ["instagram", "facebook"], ahora);
    expect(r).toMatchObject({ lista: true, redes: ["instagram"], errores: [] });
  });
  it("sin medios, con la hora pasada o sin cuenta: no, y dice por qué", () => {
    const [a, b, c] = revisarAprobadas([
      { post: post({ medios: [] }), fecha: "2026-10-06" },
      { post: post({ publishTime: "06:00" }), fecha: "2026-10-05" },
      { post: post({ redes: ["tiktok"] }), fecha: "2026-10-06" },
    ], ["instagram"], ahora);
    expect(a.lista).toBe(false);
    expect(b.errores).toContain("Su día y hora ya pasaron.");
    expect(c.errores[0]).toMatch(/TikTok/);
  });
  it("sólo las redes que el cliente tiene: la otra la salta, no la bloquea", () => {
    const [r] = revisarAprobadas([{ post: post({ redes: ["instagram", "facebook"] }), fecha: "2026-10-06" }], ["facebook"], ahora);
    expect(r).toMatchObject({ lista: true, redes: ["facebook"] });
  });
});
