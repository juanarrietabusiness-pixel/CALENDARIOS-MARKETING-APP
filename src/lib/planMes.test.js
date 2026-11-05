import { describe, it, expect } from "vitest";
import {
  claveBorrador, semanasDelPlan, unoPorSemana, diasOcupados, hayAlgoQueGuardar, leerBorrador, guardarBorrador, borrarBorrador,
  publicacionDelPlan, DIAS_BORRADOR,
} from "./planMes.js";
import { semanaDelMes } from "./semanas.js";
import { conceptoDeSemana } from "./campanas.js";
import { agruparPorSemana } from "./semanas.js";
import { camposDePromptListo, promptListo } from "./promptImagen.js";

// ============================================================
// «Planificar mes» sin trampas
// ============================================================

describe("una sola definición de semana: la FILA de la rejilla", () => {
  it("noviembre de 2026 empieza en domingo: su semana 1 tiene UN día (antes, el asistente le daba siete)", () => {
    const s = semanasDelPlan(2026, 10);
    expect(s[0]).toEqual({ n: 1, desde: "2026-11-01", hasta: "2026-11-01" });
    expect(s[1]).toEqual({ n: 2, desde: "2026-11-02", hasta: "2026-11-08" });
    expect(s).toHaveLength(6);
    for (const x of s) expect(semanaDelMes(x.desde)).toBe(x.n);
  });

  it("un concepto por semana, se conserve lo escrito y se ajuste el largo (5 o 6)", () => {
    expect(unoPorSemana(["A", "B"], 6)).toEqual(["A", "B", "", "", "", ""]);
    expect(unoPorSemana(["A", "B", "C", "D", "E", "F"], 5)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("lo guardado de antes (con `weekNumber` de bloques de siete días) se lee por la fila", () => {
    // El 5 de octubre de 2026 es el lunes de la fila 2; antes el asistente le ponía weekNumber 1.
    const days = [{ date: "2026-10-05", weekNumber: 1, concept: "Viejo", posts: [] }, { date: "2026-10-01", weekNumber: 1, posts: [] }];
    expect(agruparPorSemana(days).map((g) => g.numero)).toEqual([1, 2]);
    expect(conceptoDeSemana({ weekConcepts: [], days }, 2)).toBe("Viejo");
    expect(conceptoDeSemana({ weekConcepts: [], days }, 1)).toBe("");
  });
});

describe("los días que ya tienen publicaciones no reciben nuevas", () => {
  it("los días ocupados de ESE mes, de cualquier calendario del cliente", () => {
    const cals = [
      { days: [{ date: "2026-11-03", posts: [{ id: "a" }] }, { date: "2026-11-04", posts: [] }, { date: "2026-12-01", posts: [{ id: "b" }] }] },
    ];
    expect([...diasOcupados(cals, 2026, 10)]).toEqual(["2026-11-03"]);
    expect(diasOcupados(undefined, 2026, 10).size).toBe(0);
  });
});

describe("el borrador: cerrar ya no tira las ideas pagadas", () => {
  const almacen = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
  };

  it("por cliente y mes", () => {
    expect(claveBorrador("c1", 2026, 10)).toBe("plan-mes-borrador:c1:2026-11");
  });

  it("se guarda si hay algo, se lee, caduca a los 7 días y se borra", () => {
    const s = almacen();
    const k = claveBorrador("c1", 2026, 10);
    expect(guardarBorrador(s, k, { ideas: {}, campaign: "" }, 1000)).toBe(false);
    expect(s.m.has(k)).toBe(false);
    expect(hayAlgoQueGuardar({ ideas: { "2026-11-02": [{ idea: "Sofá" }] } })).toBe(true);
    expect(guardarBorrador(s, k, { ideas: { "2026-11-02": [{ idea: "Sofá" }] } }, 1000)).toBe(true);
    expect(leerBorrador(s, k, 2000)).toMatchObject({ ideas: { "2026-11-02": [{ idea: "Sofá" }] }, guardadoAt: 1000 });
    expect(leerBorrador(s, k, 1000 + DIAS_BORRADOR * 86_400_000 + 1)).toBeNull();
    expect(s.m.has(k)).toBe(false);
    guardarBorrador(s, k, { campaign: "Noviembre" }, 1000);
    borrarBorrador(s, k);
    expect(leerBorrador(s, k, 1000)).toBeNull();
  });

  it("sin almacenamiento (ventana privada, lleno) no rompe nada", () => {
    const roto = { getItem() { throw new Error("no"); }, setItem() { throw new Error("no"); }, removeItem() { throw new Error("no"); } };
    expect(leerBorrador(roto, "k")).toBeNull();
    expect(guardarBorrador(roto, "k", { campaign: "x" })).toBe(false);
    expect(() => borrarBorrador(roto, "k")).not.toThrow();
    expect(leerBorrador(null, "k")).toBeNull();
  });
});

describe("la publicación que sale del plan", () => {
  it("lleva TODO lo que escribió el motor, también la ficha de diseño ya pagada (sigue valiendo: es la misma pieza)", () => {
    const base = { format: "post", escena: "Una sala", textoPieza: "¿Llegan visitas?" };
    const idea = {
      id: "p1", idea: "Visitas", title: "Visitas", ...base, composicion: "uso", tactica: "pregunta", descripcion: "Ven",
      hashtagsFinales: "#a", sugerencia: "otra", ...camposDePromptListo(base, "Pieza: post 4:5\nTexto exacto: «¿Llegan visitas?»"),
      promptImagenPor: "director",
    };
    const p = publicacionDelPlan(idea, { format: "post", publishTime: "09:00" }, { pilar: "beneficios", nivel: "solucion" }, { id: "nuevo", cat: "Beneficios" });
    expect(p).toMatchObject({
      id: "p1", format: "post", title: "Visitas", escena: "Una sala", textoPieza: "¿Llegan visitas?", composicion: "uso", tactica: "pregunta",
      descripcion: "Ven", hashtagsFinales: "#a", script: "Ven", publishTime: "09:00", pilar: "beneficios", nivel: "solucion", status: "pending",
      promptImagenPor: "director",
    });
    expect(p.promptImagen).toMatch(/Pieza: post 4:5/);
    expect(p.sugerencia).toBeUndefined();
    // La huella sigue cuadrando: «Crear la imagen aquí» la usa sin volver a pagar al director.
    expect(promptListo(p)).toBeTruthy();
  });

  it("sin idea, una publicación vacía con su matriz; una UGC, marcada; un carrusel, con su estructura", () => {
    expect(publicacionDelPlan(null, { format: "reel", rostro: true }, { pilar: "humano" }, { id: "n" })).toMatchObject({ id: "n", rostro: true, idea: "", pilar: "humano" });
    expect(publicacionDelPlan({ estructura: "mitos" }, { format: "carrusel" }, {}, { id: "c" }).estructura).toBe("mitos");
    expect(publicacionDelPlan({ estructura: "mitos" }, { format: "post" }, {}, { id: "c" }).estructura).toBeUndefined();
  });
});
