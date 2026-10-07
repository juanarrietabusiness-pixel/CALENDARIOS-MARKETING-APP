import { describe, it, expect } from "vitest";
import { nombreDelMes, cambioPct, cifrasInformeAnuncios, sinCosto, pedidoInformeAnuncios, leerAnalisisAnuncios } from "./informeAnuncios.js";

const fila = (gasto, acciones = {}, extra = {}) => ({
  spend: String(gasto), impressions: "2000", reach: "1000", clicks: "40", ctr: "2",
  actions: Object.entries(acciones).map(([action_type, value]) => ({ action_type, value: String(value) })), ...extra,
});

const BASE = {
  mes: "2026-09", desde: "2026-09-01", hasta: "2026-09-30", cuenta: { nombre: "Cuenta", moneda: "USD" },
  total: fila(60), anterior: fila(30),
  campanas: [
    { id: 1, name: "Leads", objective: "OUTCOME_LEADS", effective_status: "ACTIVE", insights: fila(40, { lead: 8 }) },
    { id: 2, name: "Tráfico", objective: "LINK_CLICKS", insights: fila(20, { link_click: 100 }) },
  ],
  campanasAnterior: [{ id: 1, objective: "OUTCOME_LEADS", insights: fila(30, { lead: 3 }) }],
  dias: [fila(10, { lead: 2 }, { date_start: "2026-09-05" })],
  anuncios: [
    { id: "x", name: "Flojo", campaign: { objective: "OUTCOME_LEADS" }, insights: fila(5, { lead: 1 }) },
    { id: "y", name: "Bueno", campaign: { name: "Leads", objective: "OUTCOME_LEADS" }, creative: { title: "T", body: "B".repeat(400) }, insights: fila(10, { lead: 6 }) },
    { id: "z", name: "Sin gasto", campaign: { objective: "OUTCOME_LEADS" }, insights: fila(0) },
  ],
  desdeApp: ["2"],
};

describe("nombres y cambios", () => {
  it("el mes en palabras y el % frente al anterior", () => {
    expect(nombreDelMes("2026-09")).toBe("septiembre de 2026");
    expect(cambioPct(150, 100)).toBe(50);
    expect(cambioPct(5, 0)).toBeNull();
    expect(cambioPct(null, 10)).toBeNull();
  });
});

describe("cifrasInformeAnuncios", () => {
  const c = cifrasInformeAnuncios(BASE);

  it("los resultados grandes son los del objetivo que más invirtió, con su costo", () => {
    expect(c.etiquetaResultados).toBe("Clientes potenciales");
    expect(c.kpis.resultados).toEqual({ valor: 8, cambio: 166.7 });
    expect(c.kpis.costoPorResultado).toEqual({ valor: 5, cambio: -50 });
    expect(c.kpis.inversion).toEqual({ valor: 60, cambio: 100 });
    expect(c.otrosObjetivos).toBe(true);
  });

  it("cada campaña con lo suyo (también las de objetivo viejo), de mayor a menor gasto, y cuál es de la app", () => {
    expect(c.campanas.map((x) => [x.id, x.objetivo, x.resultados, x.desdeApp])).toEqual([["1", "Clientes potenciales", 8, false], ["2", "Tráfico", 100, true]]);
  });

  it("el mes entero día a día, con ceros donde no hubo gasto", () => {
    expect(c.serie).toHaveLength(30);
    expect(c.serie[4]).toEqual({ fecha: "2026-09-05", gasto: 10, resultados: 2 });
    expect(c.serie[0]).toEqual({ fecha: "2026-09-01", gasto: 0, resultados: 0 });
  });

  it("los mejores anuncios por resultados, sin los que no gastaron, y el texto recortado", () => {
    expect(c.mejores.map((m) => m.id)).toEqual(["y", "x"]);
    expect(c.mejores[0].texto).toHaveLength(280);
    expect(c.mejores[0].costoPorResultado).toBeCloseTo(1.67, 2);
  });

  it("con WhatsApp, los resultados se llaman conversaciones", () => {
    const w = cifrasInformeAnuncios({
      ...BASE,
      total: fila(60, { "onsite_conversion.messaging_conversation_started_7d": 9 }),
      campanas: [{ id: 1, name: "WA", objective: "OUTCOME_SALES", insights: fila(60, { "onsite_conversion.messaging_conversation_started_7d": 9 }) }],
    });
    expect(w.etiquetaResultados).toBe("Conversaciones por WhatsApp");
    expect(w.otrosObjetivos).toBe(false);
  });

  it("sin nada que leer no se rompe", () => {
    const v = cifrasInformeAnuncios({ mes: "2026-09", desde: "2026-09-01", hasta: "2026-09-30" });
    expect(v.kpis.inversion.valor).toBe(0);
    expect(v.kpis.resultados.valor).toBe(0);
    expect(v.kpis.costoPorResultado.valor).toBeNull();
    expect(v.campanas).toEqual([]);
  });
});

describe("sinCosto", () => {
  it("lo QUITA de todas partes, no lo esconde", () => {
    const s = sinCosto(cifrasInformeAnuncios(BASE));
    expect(JSON.stringify(s)).not.toContain("costoPorResultado");
    expect(s.kpis.inversion.valor).toBe(60);
    expect(sinCosto(null)).toBeNull();
  });
});

describe("el pedido a la IA y su lectura", () => {
  const c = cifrasInformeAnuncios(BASE);
  c.mejores[0].miniatura = "data:image/jpeg;base64,AAAA";

  it("sin imágenes y, si no se enseña el costo, sin él y con la orden de no nombrarlo", () => {
    const p = pedidoInformeAnuncios(c, { marca: "Dcasa", mostrarCosto: false, rubro: "Limpieza" });
    expect(p).toContain("Dcasa (Limpieza)");
    expect(p).not.toContain("base64");
    expect(p).not.toContain("costoPorResultado");
    expect(p).toContain("NO menciones el costo por resultado");
    expect(pedidoInformeAnuncios(c, { marca: "Dcasa" })).toContain("costoPorResultado");
  });

  it("lee el JSON, descarta campañas inventadas y recorta", () => {
    const a = leerAnalisisAnuncios('```json\n{"logros":"Bien","campanas":[{"id":"1","comentario":"Buena"},{"id":"9","comentario":"No existe"}],"recomendaciones":["a","b","c","d","e","f"]}\n```', c);
    expect(a).toEqual({ logros: "Bien", campanas: { 1: "Buena" }, recomendaciones: ["a", "b", "c", "d", "e"] });
  });

  it("si no es JSON, el texto va como logros", () => {
    expect(leerAnalisisAnuncios("Un mes muy bueno.", c)).toEqual({ logros: "Un mes muy bueno.", campanas: {}, recomendaciones: [] });
  });
});
