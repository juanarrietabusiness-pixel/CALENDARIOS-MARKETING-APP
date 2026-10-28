import { describe, it, expect } from "vitest";
import { DIAS_SEMANA, diaDeLaSemana, semanasDe, diasDe, filtrarProduccion, ordenarProduccion, resultadosDeProduccion } from "./produccion.js";

// Octubre de 2026 empieza en jueves: la semana 1 va del 1 al 4.
const lista = ["2026-10-06", "2026-10-05", "2026-10-12", "2026-10-02", "2026-10-13", "2026-10-04"].map((date) => ({ date }));

describe("producir por semanas y días", () => {
  it("lunes primero, y el día de la semana sin zona horaria", () => {
    expect(DIAS_SEMANA.map((d) => d.corto)).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]);
    expect(diaDeLaSemana("2026-10-05")).toBe(1);
    expect(diaDeLaSemana("2026-10-04")).toBe(0);
  });

  it("las semanas y los días que tienen algo", () => {
    expect(semanasDe(lista)).toEqual([1, 2, 3]);
    expect(diasDe(lista).map((d) => d.nombre)).toEqual(["Lunes", "Martes", "Viernes", "Domingo"]);
  });

  it("filtra por semanas y por días (vacío = todas)", () => {
    expect(filtrarProduccion(lista).length).toBe(6);
    expect(filtrarProduccion(lista, { semanas: new Set([2]) }).map((c) => c.date)).toEqual(["2026-10-06", "2026-10-05"]);
    expect(filtrarProduccion(lista, { dias: new Set([1]) }).map((c) => c.date)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(filtrarProduccion(lista, { semanas: new Set([3]), dias: new Set([2]) }).map((c) => c.date)).toEqual(["2026-10-13"]);
  });

  it("de lunes a domingo (y por fecha dentro), o corrido", () => {
    expect(ordenarProduccion(lista).map((c) => c.date)).toEqual(["2026-10-05", "2026-10-12", "2026-10-06", "2026-10-13", "2026-10-02", "2026-10-04"]);
    expect(ordenarProduccion(lista, "fecha").map((c) => c.date)).toEqual(["2026-10-02", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-12", "2026-10-13"]);
    expect(lista[0].date).toBe("2026-10-06"); // no toca la de entrada
  });
});

describe("lo que sale del servidor («Producir el mes» con encargos)", () => {
  const posts = new Map([
    ["p1", { post: { id: "p1", format: "post", title: "Sofá" }, date: "2026-11-02" }],
    ["p2", { post: { id: "p2", format: "post", title: "Mesa" }, date: "2026-11-03" }],
    ["c1", { post: { id: "c1", format: "carrusel", title: "Errores" }, date: "2026-11-04" }],
  ]);
  const a = (id) => ({ id, src: `/api/media/${id}.png` });
  const archivos = new Map(["x1", "x2", "y1", "l1", "l2", "f1"].map((id) => [id, a(id)]));
  const metas = [{ id: "e1", tipo: "lote" }, { id: "e2", tipo: "carrusel", postId: "c1", laminas: 3 }];

  it("en marcha: el avance de cada publicación; nada que poner todavía", () => {
    const r = resultadosDeProduccion(metas, {
      e1: { encargo: { estado: "en_marcha", pasos: [{ id: "p1", fase: "generando", opciones: [] }, { id: "p2", fase: "nuevo", opciones: [] }] }, archivos },
      e2: { encargo: { estado: "en_marcha", pasos: [{ fase: "hecho", opciones: [{ id: "l1" }] }, { fase: "generando", opciones: [] }] }, archivos },
    }, posts);
    expect(r.trabajos.map((t) => [t.postId, t.estado])).toEqual([["p1", "creando"], ["p2", "creando"], ["c1", "creando"]]);
    expect(r.trabajos[2]).toMatchObject({ laminas: 2, hechas: 1 });
    expect(r.mejores).toEqual({});
    expect(r.listo).toBe(false);
  });

  it("terminado: se propone la versión que pasó el control; el carrusel, sus láminas en orden (con lo puesto encima)", () => {
    const r = resultadosDeProduccion(metas, {
      e1: {
        fin: true, archivos,
        encargo: { estado: "hecho", pasos: [
          { id: "p1", fase: "hecho", opciones: [{ id: "x1", control: { estado: "revisar" } }, { id: "x2", control: { estado: "ok" } }], finales: ["x1", "x2"], deDirector: true, escena: "Pieza: x" },
          { id: "p2", fase: "fallido", error: "sin llave", opciones: [] },
        ] },
      },
      e2: { fin: true, archivos, encargo: { estado: "hecho", pasos: [{ fase: "hecho", opciones: [{ id: "l1" }], finales: ["f1"] }, { fase: "hecho", opciones: [{ id: "l2", control: { estado: "revisar" } }] }] } },
    }, posts);
    expect(r.mejores.p1.id).toBe("x2");
    expect(r.controles.p1.estado).toBe("ok");
    expect(r.versiones.p1.map((x) => x.id)).toEqual(["x1", "x2"]);
    expect(r.trabajos.find((t) => t.postId === "p2")).toMatchObject({ estado: "fallido", error: "sin llave" });
    expect(r.mejores.c1.map((x) => x.id)).toEqual(["f1", "l2"]);
    expect(r.controles.c1.estado).toBe("revisar");
    expect(r.fichas).toEqual({ p1: "Pieza: x" });
    expect(r.listo).toBe(true);
  });
});
