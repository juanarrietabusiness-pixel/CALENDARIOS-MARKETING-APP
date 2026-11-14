import { describe, it, expect } from "vitest";
import {
  numeroMagicoDelCliente, palancasDelEquilibrio, avisoDeFraccion, repartoPorEtapas, equilibrio, costoAceptable, conLecturaMeta,
  numeroMagico,
} from "./numerosNegocio.js";

// ============================================================
// EL número mágico del cliente: UNA función, la misma cifra en todas las pantallas (decisión del 14-nov). El ejemplo
// de la auditoría: según la pantalla, el máximo por conversación iba de 0,30 a 1,40.
// ============================================================

const EJEMPLO = {
  destino: "whatsapp", ticket: 50, costos: [{ nombre: "Producción", pct: 40, origen: "cliente" }], fijos: 1000,
  metaVentas: 10000, invertir: 15,
};

describe("numeroMagicoDelCliente: el número mágico ÚNICO", () => {
  it("el ejemplo de la auditoría da UNA cifra: 7,50 × 5 % = 0,375 (por debajo del equilibrio de 0,84)", () => {
    const m = numeroMagicoDelCliente(EJEMPLO, { gastoMeta30: 300, moneda: "USD", nombre: "Dcasa" });
    // Equilibrio: margen 60 % ÷ 1,07 = 56,07 %; ROAS = (1.000 + 1.500) ÷ (1.500 × 0,5607) = 2,9722; CAC = 50 ÷ 2,9722
    // = 16,82; por conversación × 5 % = 0,8411.
    expect(m.metrica).toBe("conversacion");
    expect(m.objetivo).toBe(0.38);
    expect(m.equilibrio).toBe(0.84);
    expect(m.valor).toBe(0.38);
    expect(m.limitadoPor).toBe("objetivo");
    expect(m.roasEquilibrio).toBe(2.97);
    expect(m.presupuesto).toBe(1500);
    expect(m.presupuestoDe).toBe("meta-ventas");
    expect(m.gastoMeta30).toBe(300);
    expect(m.falta).toEqual([]);
    expect(m.de).toContain("Dcasa");
    expect(m.explicacion.join(" ")).toContain("Si cierras 5 de cada 100 conversaciones");
  });

  it("lo gastado en Meta NO cambia la cifra: ni como referencia ni guardado como presupuesto con origen «meta»", () => {
    const base = numeroMagicoDelCliente(EJEMPLO).valor;
    expect(numeroMagicoDelCliente(EJEMPLO, { gastoMeta30: 9000 }).valor).toBe(base);
    expect(numeroMagicoDelCliente({ ...EJEMPLO, presupuesto: { valor: 300, origen: "meta" } }).valor).toBe(base);
    expect(numeroMagicoDelCliente(conLecturaMeta(EJEMPLO, { gasto: 300 })).equilibrio).toBe(0.84);
    // La ficha (numeroMagico) da la misma cifra.
    expect(numeroMagico(conLecturaMeta(EJEMPLO, { gasto: 300 }), { objetivoCampana: "mensajes" }).magico.valor).toBe(base);
    // El presupuesto ESCRITO sí manda (con fijos, el equilibrio depende de él).
    const escrito = numeroMagicoDelCliente({ ...EJEMPLO, presupuesto: { valor: 3000, origen: "cliente" } });
    expect(escrito.presupuestoDe).toBe("escrito");
    // (1.000 + 3.000) ÷ (3.000 × 0,5607) = 2,3778 → CAC 21,03 → × 5 % = 1,05.
    expect(escrito.equilibrio).toBe(1.05);
  });

  it("el mismo para todas las etapas: lo que cambia la cifra es el TIPO de campaña", () => {
    expect(numeroMagicoDelCliente(EJEMPLO, { objetivoCampana: "mensajes" }).valor).toBe(0.38);
    expect(numeroMagicoDelCliente(EJEMPLO, { objetivoCampana: "clientes" }).metrica).toBe("cliente_potencial");
  });

  it("sin costos NO hay número mágico: dice qué falta (antes calculaba con un margen del 100 %)", () => {
    const sin = numeroMagicoDelCliente({ ...EJEMPLO, costos: [] });
    expect(sin.valor).toBe(null);
    expect(sin.equilibrio).toBe(null);
    expect(sin.falta.map((f) => f.id)).toEqual(["costos"]);
    expect(sin.falta[0].texto).toMatch(/Falta el costo del producto/);
    expect(equilibrio({ ...EJEMPLO, costos: [] }).roas).toBe(null);
    expect(equilibrio({ ...EJEMPLO, costos: [] }).sinCostos).toBe(true);
    expect(costoAceptable({ ...EJEMPLO, costos: [] })).toBe(null);
  });

  it("con los costos sólo estimados por la IA tampoco: hay que confirmarlos", () => {
    const m = numeroMagicoDelCliente({ ...EJEMPLO, costos: [{ nombre: "Producción", pct: 40, origen: "estimado" }] });
    expect(m.valor).toBe(null);
    expect(m.falta.map((f) => f.id)).toEqual(["confirmar-costos"]);
  });

  it("sin costos fijos no hace falta presupuesto (el equilibrio no depende de él)", () => {
    const m = numeroMagicoDelCliente({ destino: "whatsapp", ticket: 50, costos: [{ nombre: "P", pct: 40 }] });
    expect(m.falta).toEqual([]);
    expect(m.presupuestoDe).toBe("sin-fijos");
    // 50 × 0,5607 × 5 % = 1,40: el equilibrio, porque no hay % a invertir.
    expect(m.valor).toBe(1.4);
    expect(m.limitadoPor).toBe("equilibrio");
    // Con fijos y sin presupuesto ni meta, sí falta.
    expect(numeroMagicoDelCliente({ ticket: 50, costos: [{ nombre: "P", pct: 40 }], fijos: 1000 }).falta.map((f) => f.id)).toEqual(["presupuesto"]);
  });

  it("el objetivo nunca pasa del equilibrio: si lo pasa, manda el equilibrio y avisa", () => {
    const m = numeroMagicoDelCliente({ ...EJEMPLO, invertir: 50 });
    expect(m.objetivo).toBe(1.25);
    expect(m.valor).toBe(1.17);
    expect(m.limitadoPor).toBe("equilibrio");
    expect(m.alarma).toBe(true);
    expect(costoAceptable({ ...EJEMPLO, invertir: 50 }).valor).toBe(1.17);
  });

  it("en la web: costo por compra y el ROAS de equilibrio", () => {
    const m = numeroMagicoDelCliente({ ...EJEMPLO, destino: "web" });
    expect(m.metrica).toBe("compra");
    expect(m.objetivo).toBe(7.5);
    expect(m.equilibrio).toBe(16.82);
    expect(m.valor).toBe(7.5);
    expect(m.roasEquilibrio).toBe(2.97);
    expect(m.roasObjetivo).toBeCloseTo(6.67, 2);
  });

  it("tráfico: el costo por clic único = el de la conversación × el % de mensajes", () => {
    const m = numeroMagicoDelCliente(EJEMPLO, { objetivoCampana: "trafico", lectura: { pctMensajes: 40 } });
    expect(m.metrica).toBe("clic");
    expect(m.valor).toBe(0.15);
    expect(numeroMagicoDelCliente(EJEMPLO, { objetivoCampana: "trafico" }).falta.map((f) => f.id)).toEqual(["pctMensajes"]);
  });

  it("las 3 palancas con los números del cliente", () => {
    const p = palancasDelEquilibrio(EJEMPLO);
    expect(p.map((x) => x.id)).toEqual(["margen", "fijos", "valor"]);
    expect(p[0].texto).toContain("Producción");
    expect(palancasDelEquilibrio({ ...EJEMPLO, costos: [] })).toEqual([]);
  });

  it("avisa de un % escrito como fracción", () => {
    expect(avisoDeFraccion("invertir", 0.15)).toContain("15 %");
    expect(avisoDeFraccion("invertir", 15)).toBe("");
    expect(avisoDeFraccion("devoluciones", 0.5)).toBe("");
  });

  it("el reparto de la ficha es el del cliente (a mano o el del Manual)", () => {
    const r = repartoPorEtapas(1000, { reparto: { presentacion: 70, evaluacion: 20, conversion: 5, ascension: 5 } });
    expect(r.map((x) => Math.round(x.monto))).toEqual([700, 200, 50, 50]);
    expect(repartoPorEtapas(1000).map((x) => Math.round(x.monto))).toEqual([600, 200, 100, 100]);
    expect(repartoPorEtapas(1000, { cuenta: "nueva" }).map((x) => Math.round(x.monto))).toEqual([750, 250]);
  });
});
