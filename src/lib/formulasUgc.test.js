import { describe, it, expect } from "vitest";
import {
  limpiarFormula, tramosEnDuracion, lineaDeFormula, bloqueDeFormulas, formulaUsada, pedidoDeFormula, leerFormula, MAX_TRAMOS_FORMULA,
  paraDe, sirvePara, estructurasPara, idDeEstructura, limpiarGuionVoz, tramosDeEscenas, tramosDeReel, pedidoDeEstructuraVoz,
} from "./formulasUgc";

const F = {
  id: "f1", nombre: "Pregunta → demostración → precio", duracion: 30, gancho: "una pregunta", porQue: "toca un dolor", cuando: "productos con antes y después",
  tramos: [{ desde: 0, hasta: 3, funcion: "una pregunta" }, { desde: 3, hasta: 24, funcion: "la demostración" }, { desde: 24, hasta: 30, funcion: "el precio" }],
};

describe("las fórmulas UGC", () => {
  it("se limpian: sin nombre o con menos de dos tramos no valen; la duración, una de las que hay; la fuente, sólo lo seguro", () => {
    expect(limpiarFormula({ ...F, nombre: " " })).toBeNull();
    expect(limpiarFormula({ ...F, tramos: [F.tramos[0]] })).toBeNull();
    expect(limpiarFormula({ ...F, duracion: 22 }).duracion).toBe(30);
    expect(limpiarFormula({ ...F, tramos: Array.from({ length: 15 }, (_, i) => ({ funcion: `t${i}` })) }).tramos).toHaveLength(MAX_TRAMOS_FORMULA);
    expect(limpiarFormula({ ...F, fuente: { cuenta: "@x", enlace: "javascript:alert(1)", archivoId: "a b" } }).fuente).toEqual({ cuenta: "@x" });
  });

  it("los tramos se reparten en otra duración conservando su proporción; sin tiempos, a partes iguales", () => {
    expect(tramosEnDuracion(F, 60).map((t) => [t.desde, t.hasta])).toEqual([[0, 6], [6, 48], [48, 60]]);
    expect(tramosEnDuracion(F, 15).at(-1).hasta).toBe(15);
    const sinTiempo = { ...F, tramos: F.tramos.map((t) => ({ funcion: t.funcion })) };
    expect(tramosEnDuracion(sinTiempo, 30).map((t) => [t.desde, t.hasta])).toEqual([[0, 10], [10, 20], [20, 30]]);
  });

  it("la línea para la IA dice la forma, no el contenido, ya en la duración pedida", () => {
    const l = lineaDeFormula(F, 15);
    expect(l).toMatch(/^SIGUE ESTA FÓRMULA «Pregunta → demostración → precio» \(la forma, no el contenido\)/);
    expect(l).toContain("[0–2 s] una pregunta");
    expect(l).toContain("Por qué funciona: toca un dolor.");
    expect(lineaDeFormula({ nombre: "" }, 30)).toBe("");
  });

  it("para que la IA escoja: la lista, y la orden de decir cuál usó; la que dice se reconoce aunque cambie tildes o comillas", () => {
    const b = bloqueDeFormulas([F, { ...F, id: "f2", nombre: "Error común" }], 30);
    expect(b).toMatch(/^FÓRMULAS DE LA AGENCIA/);
    expect(b).toContain("- «Error común» (conviene: productos con antes y después)");
    expect(b).toMatch(/FÓRMULA: <el nombre exacto/);
    expect(bloqueDeFormulas([], 30)).toBe("");
    const lista = [F, { ...F, id: "f2", nombre: "Error común" }];
    expect(formulaUsada("FORMULA: «error comun»\n[0–3 s] VOZ: «Hola»", lista)).toBe("f2");
    expect(formulaUsada("Fórmula: Pregunta → demostración → precio.", lista)).toBe("f1");
    expect(formulaUsada("[0–3 s] VOZ: «Hola»", lista)).toBe("");
  });

  it("de un video a su fórmula: el pedido lleva el video tramo a tramo y la respuesta se lee con su fuente", () => {
    const p = pedidoDeFormula({ estructura: "problema → solución", tramos: [{ desde: 0, hasta: 3, voz: "¿Te pasa?", seVe: "una cocina" }] });
    expect(p).toMatch(/SIN su contenido/);
    expect(p).toContain("[0–3 s] dice: «¿Te pasa?» · se ve: una cocina");
    expect(p).toContain("Estructura según quien lo vio: problema → solución.");
    const f = leerFormula('```json\n{"nombre":"X","duracion":44,"tramos":[{"funcion":"a"},{"funcion":"b"}]}\n```', { fuente: { cuenta: "@c" } });
    expect(f).toMatchObject({ nombre: "X", duracion: 45, fuente: { cuenta: "@c" } });
    expect(leerFormula("nada")).toBeNull();
  });
});

describe("las estructuras de guion: UGC y voz en off", () => {
  it("«para» dice en qué guiones se ofrece; una de antes, sin él, vale para las dos", () => {
    expect(paraDe({})).toEqual(["ugc", "voz"]);
    expect(paraDe({ para: ["voz", "otra"] })).toEqual(["voz"]);
    expect(paraDe({ para: "ugc" })).toEqual(["ugc"]);
    expect(paraDe({ para: [] })).toEqual(["ugc", "voz"]);
    expect(limpiarFormula(F).para).toEqual(["ugc", "voz"]);
    expect(limpiarFormula({ ...F, para: ["voz"] }).para).toEqual(["voz"]);
    const lista = [F, { ...F, id: "v", para: ["voz"] }, { ...F, id: "u", para: ["ugc"] }];
    expect(estructurasPara(lista, "voz").map((f) => f.id)).toEqual(["f1", "v"]);
    expect(estructurasPara(lista, "ugc").map((f) => f.id)).toEqual(["f1", "u"]);
    expect(estructurasPara(lista).map((f) => f.id)).toEqual(["f1", "v", "u"]);
    expect(sirvePara({ para: ["voz"] }, "ugc")).toBe(false);
  });

  it("se reparten en cualquier duración (8, 10, 20 s…), contiguas y sin tramos vacíos", () => {
    const ocho = tramosEnDuracion(F, 8);
    expect(ocho[0].desde).toBe(0);
    expect(ocho.at(-1).hasta).toBe(8);
    for (let i = 0; i < ocho.length; i++) {
      expect(ocho[i].hasta).toBeGreaterThan(ocho[i].desde);
      if (i) expect(ocho[i].desde).toBe(ocho[i - 1].hasta);
    }
    // Muchos tramos en poco tiempo: a medios segundos, todos con su sitio.
    const muchos = { ...F, tramos: Array.from({ length: 8 }, (_, i) => ({ funcion: `t${i}` })) };
    const diez = tramosEnDuracion(muchos, 10);
    expect(diez.at(-1).hasta).toBe(10);
    expect(diez.every((t) => t.hasta > t.desde)).toBe(true);
    expect(tramosEnDuracion(F, 20).at(-1).hasta).toBe(20);
  });

  it("para la voz en off: su línea y su bloque dicen ESTRUCTURA, sólo con las de voz, y piden el nombre en el JSON", () => {
    const l = lineaDeFormula(F, 10, { uso: "voz" });
    expect(l).toMatch(/^SIGUE ESTA ESTRUCTURA DE GUION DE LA AGENCIA «Pregunta → demostración → precio»/);
    expect(l).toMatch(/La voz en off la recorre/);
    const lista = [{ ...F, para: ["ugc"] }, { ...F, id: "v", nombre: "Tres razones", para: ["voz"] }];
    const b = bloqueDeFormulas(lista, 20, { uso: "voz", campo: "estructura" });
    expect(b).toMatch(/^ESTRUCTURAS DE GUION DE LA AGENCIA/);
    expect(b).toContain("«Tres razones»");
    expect(b).not.toContain("«Pregunta → demostración → precio»");
    expect(b).toMatch(/campo "estructura" del JSON/);
    expect(bloqueDeFormulas(lista, 20, { uso: "voz" })).toMatch(/ESTRUCTURA: <el nombre exacto/);
    expect(bloqueDeFormulas([{ ...F, para: ["ugc"] }], 20, { uso: "voz" })).toBe("");
    // El nombre que dice la IA, con otras tildes o comillas, da su id.
    expect(idDeEstructura("«tres razones»", lista)).toBe("v");
    expect(idDeEstructura("", lista)).toBe("");
    expect(formulaUsada("ESTRUCTURA: Tres razones", lista)).toBe("v");
  });

  it("de una voz en off a su estructura: los tramos de las escenas o los planos, limpios, y el pedido sin su contenido", () => {
    const guion = { escenas: [
      { tipo: "gancho", habla: "[emocionada] ¿Te pasa esto?", pantalla: "¿Te pasa?" },
      { tipo: "problema", habla: "La piel se irrita.", pantalla: "" },
      { tipo: "cierre", habla: "Escríbenos hoy.", pantalla: "WhatsApp" },
    ] };
    const linea = { escenas: [{ desde: 0, hasta: 2.04 }, { desde: 2.04, hasta: 5 }, { desde: 5, hasta: 8 }] };
    const tramos = tramosDeEscenas(guion, linea);
    expect(tramos[0]).toEqual({ desde: 0, hasta: 2, dice: "¿Te pasa esto?", pantalla: "¿Te pasa?", tipo: "gancho" });
    expect(tramosDeReel({ planos: [{ desde: 0, hasta: 3, dice: "Hola", pantalla: "" }, { desde: 3, hasta: 10, escena: "x" }] })).toEqual([{ desde: 0, hasta: 3, dice: "Hola", pantalla: "" }]);
    const v = limpiarGuionVoz({ titulo: "Toallitas", duracion: 8, tramos });
    expect(v.tramos).toHaveLength(3);
    expect(limpiarGuionVoz({ tramos: [tramos[0]] })).toBeNull();
    expect(limpiarGuionVoz({ tramos: [{ dice: "a" }, { dice: "b" }] }).duracion).toBe(30);
    const p = pedidoDeEstructuraVoz(v);
    expect(p).toMatch(/VOZ EN OFF que salió bien/);
    expect(p).toMatch(/SIN su contenido/);
    expect(p).toContain("[0–2 s] (gancho) dice: «¿Te pasa esto?» · en pantalla: «¿Te pasa?»");
    // Leída como de voz: sólo para la voz en off, y la duración original, la más cercana (8 → 10).
    const f = leerFormula('{"nombre":"Pregunta → problema → llamado","duracion":8,"tramos":[{"funcion":"a"},{"funcion":"b"}]}', { para: ["voz"] });
    expect(f).toMatchObject({ para: ["voz"], duracion: 10 });
  });
});
