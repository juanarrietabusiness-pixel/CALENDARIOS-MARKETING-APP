import { describe, it, expect } from "vitest";
import { evaluar, diagnosticar, cifrasDe, pedidoDiagnosticoIA, ACCIONES_DIAGNOSTICO } from "./diagnostico.js";

// Una fila de /insights: gasto, impresiones, alcance, clics y conversaciones de WhatsApp (ventas).
const fila = ({ gasto, imp = 5000, alcance = 2500, ctr = 2, res = 0, freq } = {}) => ({
  spend: String(gasto), impressions: String(imp), reach: String(alcance), ctr: String(ctr), clicks: "100",
  ...(freq ? { frequency: String(freq) } : {}),
  actions: res ? [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: String(res) }] : [],
});
const O = "OUTCOME_SALES";

describe("las reglas de un conjunto o un anuncio", () => {
  it("apagar: gastó el doble de lo aceptable sin resultados, o cada resultado cuesta más de 1,5 veces", () => {
    expect(evaluar({ nivel: "anuncio", estado: "ACTIVE", objetivo: O, i7: fila({ gasto: 10 }) }, { ref: 4 }).accion).toBe("apagar");
    expect(evaluar({ nivel: "conjunto", estado: "ACTIVE", objetivo: O, i7: fila({ gasto: 30, res: 4 }) }, { ref: 4 }).accion).toBe("apagar");
    // Con 6 $ sin resultados y 4 $ aceptables, todavía no: es pronto.
    expect(evaluar({ nivel: "anuncio", estado: "ACTIVE", objetivo: O, i7: fila({ gasto: 6 }) }, { ref: 4 })).toBeNull();
  });

  it("revisar: activo y sin gastar", () => {
    expect(evaluar({ nivel: "conjunto", estado: "ACTIVE", objetivo: O, i7: null }, { ref: 4 }).accion).toBe("revisar");
    expect(evaluar({ nivel: "conjunto", estado: "PAUSED", objetivo: O, i7: null }, { ref: 4 })).toBeNull();
  });

  it("renovar: un anuncio cansado (frecuencia 3 o el CTR cae un 30 %)", () => {
    expect(evaluar({ nivel: "anuncio", estado: "ACTIVE", objetivo: O, i7: fila({ gasto: 10, res: 5, freq: 3.4 }) }, { ref: 4 }).motivo).toMatch(/3,4 veces/);
    const caida = evaluar({ nivel: "anuncio", estado: "ACTIVE", objetivo: O, i7: fila({ gasto: 10, res: 5, ctr: 1 }), i30: fila({ gasto: 40, res: 20, ctr: 2 }) }, { ref: 4 });
    expect(caida).toMatchObject({ accion: "renovar" });
    expect(caida.motivo).toMatch(/1.00 % esta semana frente a 2.00 %/);
    // A un conjunto no se le pide «renovar».
    expect(evaluar({ nivel: "conjunto", estado: "ACTIVE", objetivo: O, i7: fila({ gasto: 10, res: 5, freq: 3.4 }) }, { ref: 4 })?.accion).not.toBe("renovar");
  });

  it("escalar un 20 % lo que funciona; con el público agotado, duplicar con otro", () => {
    const e = evaluar({ nivel: "conjunto", estado: "ACTIVE", objetivo: O, presupuestoDiario: 10, i7: fila({ gasto: 15, res: 10, freq: 1.5 }) }, { ref: 4 });
    expect(e).toMatchObject({ accion: "escalar", sugerencia: { diarioActual: 10, diarioNuevo: 12 } });
    const d = evaluar({ nivel: "conjunto", estado: "ACTIVE", objetivo: O, presupuestoDiario: 10, i7: fila({ gasto: 15, res: 10, freq: 2.8 }) }, { ref: 4 });
    expect(d.accion).toBe("duplicar");
    // Sin presupuesto propio (lo lleva la campaña) no se propone subir.
    expect(evaluar({ nivel: "conjunto", estado: "ACTIVE", objetivo: O, presupuestoDiario: null, i7: fila({ gasto: 15, res: 10 }) }, { ref: 4 })).toBeNull();
  });

  it("vigilar: el costo por resultado sube un 30 % frente al mes", () => {
    const v = evaluar({ nivel: "anuncio", estado: "ACTIVE", objetivo: O, i7: fila({ gasto: 15, res: 5 }), i30: fila({ gasto: 40, res: 20 }) }, { ref: 0 });
    expect(v.accion).toBe("vigilar");
  });

  it("la frecuencia sale de Meta o de impresiones ÷ alcance", () => {
    expect(cifrasDe(fila({ gasto: 1, imp: 3000, alcance: 1000 }), O).frecuencia).toBe(3);
    expect(cifrasDe(fila({ gasto: 1, freq: 1.25 }), O).frecuencia).toBe(1.3);
  });
});

describe("el diagnóstico de la cuenta", () => {
  const campanas = [{
    id: "900", nombre: "Ventas sofá", objetivo: O, estado: "ACTIVE", i7: fila({ gasto: 40, res: 12 }), i30: fila({ gasto: 150, res: 50 }),
    conjuntos: [
      { id: "901", nombre: "Intereses", estado: "ACTIVE", presupuestoDiario: 5, i7: fila({ gasto: 20, res: 10, freq: 1.2 }), i30: fila({ gasto: 80, res: 30 }) },
      { id: "902", nombre: "Abierto", estado: "ACTIVE", presupuestoDiario: 5, i7: fila({ gasto: 20, res: 2 }), i30: fila({ gasto: 70, res: 20 }) },
      { id: "905", nombre: "Pausado", estado: "PAUSED", presupuestoDiario: 5, i7: null, i30: null },
    ],
    anuncios: [
      { id: "903", nombre: "Foto", estado: "ACTIVE", i7: fila({ gasto: 20, res: 10 }), i30: fila({ gasto: 80, res: 30 }) },
      { id: "904", nombre: "Reel", estado: "ACTIVE", i7: fila({ gasto: 20, res: 2, freq: 3.5 }), i30: fila({ gasto: 70, res: 20 }) },
    ],
  }, { id: "800", nombre: "Muerta", objetivo: O, estado: "ACTIVE", i7: null, i30: null, conjuntos: [], anuncios: [] }];

  it("con el costo aceptable del plan: lo urgente primero, lo que va bien se cuenta", () => {
    const d = diagnosticar(campanas, { costoMax: 3 });
    expect(d.hallazgos.map((h) => [h.accion, h.nivel, h.nombre])).toEqual([
      ["apagar", "conjunto", "Abierto"], ["apagar", "anuncio", "Reel"], ["revisar", "campana", "Muerta"], ["escalar", "conjunto", "Intereses"],
    ]);
    expect(d.resumen).toEqual({ campanas: 2, gasto: 40, resultados: 12, costoPorResultado: 3.33, bien: 1 });
  });

  it("sin costo aceptable compara con el promedio de 30 días de cada campaña", () => {
    const d = diagnosticar(campanas);
    // 150 / 50 = 3 por resultado en el mes: lo mismo que arriba.
    expect(d.hallazgos.map((h) => h.accion)).toEqual(["apagar", "apagar", "revisar", "escalar"]);
  });

  it("la IA sólo explica: recibe las reglas y las cifras, y la orden de no inventar", () => {
    const p = pedidoDiagnosticoIA({ marca: "Dcasa", diagnostico: diagnosticar(campanas, { costoMax: 3 }), costoMax: 3 });
    expect(p).toContain("no inventes ninguna");
    expect(p).toContain(`${ACCIONES_DIAGNOSTICO.apagar.nombre} · conjunto «Abierto»`);
    expect(p).toMatch(/12 resultados/);
  });
});
