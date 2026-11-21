import { describe, it, expect } from "vitest";
import { rejilla, enCompas, montarCancion, empiezaAntesDe } from "./musicaEdicion.js";
import { validarPlan, instante, efectosResueltos, tramoDeRealce } from "./planEdicion.js";

// La música de Rofer v2 (musica_suno.py): 95,35 BPM, el primer compás en 0,2133 s.
const A0 = 0.2133;
const PULSO = 0.62929;
const r = rejilla({ a0: A0, pulso: PULSO });

describe("la rejilla de compases", () => {
  it("cada compás son cuatro pulsos", () => {
    expect(r.compas).toBeCloseTo(2.51716, 5);
    expect(r.en(8)).toBeCloseTo(20.35058, 4);
    expect(enCompas(r, r.en(9))).toBe(true);
    expect(enCompas(r, r.en(9) + 0.3)).toBe(false);
  });
});

describe("montar la canción al video (Rofer v2)", () => {
  // El llamado se corta en 34,99 s; el quiebre (un compás) acaba justo ahí; el drop (5 compases) antes.
  const CTA = 34.99;
  const quiebre = empiezaAntesDe(r, CTA, 1);
  const drop = Math.round((quiebre - 5 * r.compas) * 1000) / 1000;
  const tramos = [
    { cancion: [r.en(8) - drop, r.en(8)], video: 0 },
    { cancion: [r.en(9), r.en(9) + 5 * r.compas], video: drop },
    { cancion: [r.en(8), r.en(9)], video: quiebre },
    { cancion: [r.en(9), r.en(10)], video: CTA },
    { cancion: [r.en(18), null], video: CTA + r.compas },
  ];

  it("reproduce los cortes de Rofer v2 sin errores ni avisos", () => {
    const m = montarCancion({ a0: A0, pulso: PULSO, duracionCancion: 60, duracionVideo: 1204 / 30, tramos });
    expect(m.errores).toEqual([]);
    expect(m.avisos).toEqual([]);
    expect(drop).toBeCloseTo(19.887, 2);           // el drop entra en «minis»
    expect(m.tramos[0].cancion0).toBeCloseTo(0.464, 2);
    expect(m.tramos.map((t) => t.video0)).toEqual([0, 19.887, 32.473, 34.99, 37.507]);
    expect(m.tramos[4].cancion1).toBe(60);
  });

  it("un hueco, un solape o una costura fuera de compás se dicen", () => {
    const hueco = montarCancion({ a0: A0, pulso: PULSO, duracionCancion: 60, tramos: [tramos[0], { ...tramos[1], video: drop + 0.5 }] });
    expect(hueco.errores[0]).toMatch(/hay un hueco de 0.5 s/);
    const pisa = montarCancion({ a0: A0, pulso: PULSO, duracionCancion: 60, tramos: [tramos[0], { ...tramos[1], video: drop - 0.4 }] });
    expect(pisa.errores[0]).toMatch(/se pisan 0.4 s/);
    const fuera = montarCancion({ a0: A0, pulso: PULSO, duracionCancion: 60, tramos: [tramos[0], { cancion: [r.en(9) + 0.7, r.en(10)], video: drop }] });
    expect(fuera.avisos[0]).toMatch(/no es un compás/);
    const corta = montarCancion({ a0: A0, pulso: PULSO, duracionCancion: 60, duracionVideo: 90, tramos: tramos.slice(0, 1) });
    expect(corta.avisos[0]).toMatch(/La música se acaba en/);
    expect(montarCancion({ a0: A0, pulso: PULSO, duracionCancion: 10, tramos: [{ cancion: [0, 20], video: 0 }] }).errores[0]).toMatch(/la canción dura 10 s/);
    expect(montarCancion({ a0: A0, pulso: PULSO, duracionCancion: 10, tramos: [] }).errores).toEqual(["Faltan los tramos de la música."]);
  });
});

describe("el plan de edición", () => {
  const palabras = [{ s: 0.5, e: 0.9 }, { s: 1.0, e: 1.4 }];
  const plan = {
    version: 1, fps: 30, cierre: 3.3,
    clips: [{ id: "1427", archivo: "clips/1427.mov" }, { id: "1450", archivo: "clips/1450.mov", velocidad: 1.05, excluir: [[3, 4]] }],
    realces: [{ palabra: 1, db: 11 }],
    musica: { archivo: "musica/x.mp3", a0: A0, pulso: PULSO, tramos: [{ cancion: [0, null], video: 0 }], llamado: { palabra: 1 } },
    efectos: [{ id: "impact-deep", t: 0, db: -15 }, { id: "impact-classic", palabra: 1, mas: -0.02, db: -13, alinear: "pico" }],
    apartar: [{ palabra: 0 }],
  };

  it("un plan bien escrito no tiene errores", () => {
    expect(validarPlan(plan, { palabras, catalogo: new Set(["impact-deep", "impact-classic"]) })).toEqual({ errores: [], avisos: [] });
  });

  it("dice qué falta y dónde", () => {
    const malo = {
      version: 2, fps: 29, clips: [{ id: "a b", velocidad: 2 }, { id: "x", archivo: "x.mov", excluir: [[3, 1]] }, { id: "x", archivo: "y.mov" }],
      realces: [{ t: 1, db: 30 }], efectos: [{ id: "inventado", palabra: 9, db: 3, alinear: "medio" }],
    };
    const { errores, avisos } = validarPlan(malo, { palabras, catalogo: new Set(["impact-deep"]), clipsEnDisco: new Set(["x.mov"]) });
    const todo = errores.join("\n");
    for (const frase of ["versión 2", "fps 29", "falta su «id»", "falta «archivo»", "«velocidad» va de 0,8 a 1,25", "«excluir» es una lista",
      "está dos veces", "no encuentro y.mov", "«db» entre 0 y 15", "dura", "no está en el catálogo", "la palabra 9 no existe", "«db» entre −40 y 0", "«alinear» es"]) {
      expect(todo).toContain(frase);
    }
    expect(avisos[0]).toMatch(/Sin música/);
  });

  it("resuelve los instantes por palabra o en segundos", () => {
    expect(instante({ t: 2, mas: 0.1 })).toBeCloseTo(2.1);
    expect(instante({ palabra: 1, mas: -0.02 }, palabras)).toBeCloseTo(0.98);
    expect(instante({ palabra: 7 }, palabras)).toBeNull();
    expect(efectosResueltos(plan, palabras)).toEqual([
      { id: "impact-deep", t: 0, db: -15, alinear: "inicio" },
      { id: "impact-classic", t: 0.98, db: -13, alinear: "pico" },
    ]);
    expect(tramoDeRealce({ palabra: 1 }, palabras)).toEqual([1.0, 1.4]);
    expect(tramoDeRealce({ t: 3, dura: 0.4 })).toEqual([3, 3.4]);
  });
});
