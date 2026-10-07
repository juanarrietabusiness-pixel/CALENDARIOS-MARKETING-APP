import { describe, it, expect } from "vitest";
import {
  economia, escenarios, nombreConPlantilla, limpiarManual, leerPlan, planABorrador, planATexto, pedidoEstratega,
  NOMENCLATURA_POR_DEFECTO, TASA_CIERRE_POR_DEFECTO,
} from "./estratega.js";
import { validarBorrador, normalizarBorrador } from "./anuncios.js";

const PLAN = {
  resumen: "Ventas del sofá cama por WhatsApp.",
  embudo: [{ etapa: "frio", objetivo: "Conversaciones", idea: "Mostrar el sofá" }, { etapa: "inventada", objetivo: "x", idea: "y" }],
  costos: { conservador: "4", esperado: 2.5, optimista: "1,5", porque: "Muebles en Panamá" },
  tasaCierre: 15,
  presupuesto: { diario: 15, dias: 30, porque: "Tres públicos de 5" },
  ofertas: [{ tipo: "garantia", texto: "Garantía de 1 año" }, { tipo: "rara", texto: "Algo" }],
  maletas: { cliente: "Parejas jóvenes", dolor: "Poco espacio", deseo: "Casa ordenada", objeciones: "Precio", alternativas: "Futón", diferenciador: "Entrega gratis", confianza: "200 clientes" },
  campana: {
    objetivo: "OUTCOME_SALES", destino: "whatsapp",
    conjuntos: [
      { tipo: "intereses", presupuestoDiario: 5, edadMin: 25, edadMax: 45, sexo: "todos", intereses: ["Muebles", "Decoración de interiores"], lugar: "Panamá" },
      { tipo: "advantage", presupuestoDiario: 5, edadMin: 18, edadMax: 65, sexo: "todos", intereses: [], lugar: "Panamá" },
      { tipo: "similares", presupuestoDiario: 5, edadMin: 18, edadMax: 65, sexo: "todos", intereses: [], lugar: "Panamá" },
      { tipo: "abierto", presupuestoDiario: 5 },
    ],
    anuncios: [
      { formato: "unico", angulo: "Dolor", pieza: "Foto del sofá abierto", texto: "¿Visitas y no hay dónde dormir?", titulo: "Sofá cama $400", descripcion: "Entrega gratis" },
      { formato: "carrusel", angulo: "Colores", pieza: "Tres fotos", texto: "Escoge tu color", tarjetas: [{ titulo: "Gris" }, { titulo: "Azul" }] },
      { formato: "unico", texto: "" },
    ],
  },
  pasos: ["Conectar WhatsApp a la página"],
  riesgos: ["Sin fotos reales"],
};

describe("las cuentas las hace el código", () => {
  it("costo máximo por resultado desde el precio, el margen y cuántos compran", () => {
    const e = economia({ precio: "$400", margen: 30, tasaCierre: 20 });
    expect(e).toEqual({ precio: 400, ganancia: 120, tasaCierre: 20, costoMaxVenta: 120, costoMaxResultado: 24, costoObjetivo: 12 });
    expect(economia({ precio: 400, margen: 80, margenTipo: "$", tasaCierre: 10 })).toMatchObject({ ganancia: 80, costoMaxResultado: 8 });
    expect(economia({ precio: 0, margen: 30 })).toBeNull();
    expect(economia({ precio: 50 })).toBeNull();
    expect(economia({ precio: 100, margen: 50, tasaCierre: 0 }).tasaCierre).toBe(TASA_CIERRE_POR_DEFECTO);
  });

  it("tres escenarios con los costos de la IA (o estimados del máximo)", () => {
    const eco = economia({ precio: 400, margen: 30, tasaCierre: 20 });
    const f = escenarios({ diario: 15, dias: 30, costos: { conservador: 4, esperado: 2.5, optimista: 1.5 }, eco });
    expect(f.map((x) => [x.id, x.resultados, x.ventas])).toEqual([["conservador", 112, 22], ["esperado", 180, 36], ["optimista", 300, 60]]);
    expect(f[1]).toMatchObject({ inversion: 450, ingreso: 14400, ganancia: 3870, retorno: 32 });
    expect(escenarios({ diario: 10, dias: 10, eco }).map((x) => x.costoResultado)).toEqual([21.6, 12, 7.2]);
    expect(escenarios({ diario: 0, dias: 30, eco })).toEqual([]);
    // Sin cuentas (no se sabe el margen) salen los resultados, no las ventas.
    expect(escenarios({ diario: 10, dias: 10, costos: { esperado: 2 } })).toEqual([expect.objectContaining({ id: "esperado", resultados: 50, ventas: null })]);
  });
});

describe("el manual y los nombres", () => {
  it("la nomenclatura rellena y quita lo que no se sabe con su separador", () => {
    expect(nombreConPlantilla(NOMENCLATURA_POR_DEFECTO.campana, { cliente: "Dcasa", objetivo: "Ventas", producto: "", mes: "Octubre 2026" })).toBe("Dcasa · Ventas · Octubre 2026");
    expect(nombreConPlantilla("{tipo} | {edad} | {lugar}", { tipo: "Intereses", edad: "18-65", lugar: "" })).toBe("Intereses | 18-65");
    expect(nombreConPlantilla("{x}", {})).toBe("");
  });

  it("el manual limpio, con lo de siempre donde no dice nada", () => {
    const m = limpiarManual({ reglas: "  Siempre a WhatsApp.  ", nomenclatura: { campana: "{cliente} - {mes}" }, tasaCierre: 500 });
    expect(m).toEqual({ reglas: "Siempre a WhatsApp.", nomenclatura: { ...NOMENCLATURA_POR_DEFECTO, campana: "{cliente} - {mes}" }, tasaCierre: TASA_CIERRE_POR_DEFECTO });
    expect(limpiarManual(null).reglas).toBe("");
  });
});

describe("el pedido", () => {
  it("lleva el manual delante, las cuentas hechas y los 7 elementos si los hay", () => {
    const eco = economia({ precio: 400, margen: 30 });
    const p = pedidoEstratega({
      marca: "Dcasa", contexto: "CATÁLOGO: Sofá $400", producto: { nombre: "Sofá cama", precio: "$400", elementos: { cliente: "a", dolor: "b", deseo: "c" } },
      manual: { reglas: "Nunca menos de 5 $ por conjunto." }, eco, diario: 15,
    });
    expect(p.indexOf("MANUAL DE CAMPAÑAS")).toBeLessThan(p.indexOf("LO QUE SE ANUNCIA"));
    expect(p).toContain("Nunca menos de 5 $ por conjunto.");
    expect(p).toContain("Costo máximo por resultado 24");
    expect(p).toContain("SUS 7 ELEMENTOS");
    expect(p).toContain("«maletas»: déjalo vacío");
    expect(p).toContain("Presupuesto: 15 al día");
  });

  it("sin elementos pide las 7 maletas; con un plan pegado, lo pasa a limpio; con un cambio, lo aplica", () => {
    const p = pedidoEstratega({ marca: "Pan Rico", producto: { nombre: "Pan" }, planPegado: "Campaña de Felipe: intereses panadería" });
    expect(p).toMatch(/«maletas»: los 7 elementos/);
    expect(p).toContain("EL PLAN QUE ESCRIBIÓ OTRO BOT");
    expect(p).toContain("no inventes cuentas");
    const c = pedidoEstratega({ marca: "X", producto: { nombre: "Y" }, anterior: { a: 1 }, cambio: "Más agresivo" });
    expect(c).toContain("EL CAMBIO QUE PIDE LA AGENCIA: Más agresivo");
  });
});

describe("el plan", () => {
  it("se lee limpio: topes, tipos válidos y sin anuncios vacíos", () => {
    const p = leerPlan(JSON.stringify(PLAN));
    expect(p.campana.conjuntos).toHaveLength(3);
    expect(p.campana.anuncios.map((a) => a.formato)).toEqual(["unico", "carrusel"]);
    expect(p.embudo.map((e) => e.etapa)).toEqual(["frio", "frio"]);
    expect(p.ofertas.map((o) => o.tipo)).toEqual(["garantia", "bono"]);
    expect(p.costos).toMatchObject({ conservador: 4, esperado: 2.5, optimista: 1.5 });
    expect(Object.keys(p.maletas)).toHaveLength(7);
    expect(leerPlan("sin json")).toBeNull();
    expect(leerPlan('{"campana":{"conjuntos":[],"anuncios":[]}}')).toBeNull();
  });

  it("pasa a «Nueva campaña»: los nombres del manual, los intereses por buscar, y sólo faltan las piezas", () => {
    const plan = leerPlan(JSON.stringify(PLAN));
    const b = planABorrador(plan, { hoy: "2026-10-07", cliente: "Dcasa", producto: "Sofá cama" });
    expect(b.nombre).toBe("Dcasa · Ventas WhatsApp · Sofá cama · Octubre 2026");
    expect(b.conjuntos[0]).toMatchObject({ nombre: "Intereses · 25-45 · Panamá", tipo: "intereses", presupuesto: { tipo: "diario", monto: "5" }, sugeridos: ["Muebles", "Decoración de interiores"] });
    expect(b.anuncios[1].tarjetas.map((t) => t.titulo)).toEqual(["Gris", "Azul"]);
    expect(b.anuncios[0].nombre).toBe("1 · Pieza · Dolor");
    const campos = new Set(validarBorrador(normalizarBorrador(b), { hoy: "2026-10-07" }).map((e) => e.campo));
    // Lo único que falta es lo que se escoge allí: las piezas, los intereses en Meta y el público similar.
    expect([...campos].sort()).toEqual(["intereses", "medio", "similares", "tarjetas"]);
  });

  it("y como texto, para mandarlo", () => {
    const plan = leerPlan(JSON.stringify(PLAN));
    const eco = economia({ precio: 400, margen: 30 });
    const t = planATexto(plan, { marca: "Dcasa", eco, filas: escenarios({ diario: 15, dias: 30, costos: plan.costos, eco }) });
    expect(t).toMatch(/^PLAN DE CAMPAÑA · Dcasa/);
    expect(t).toContain("Costo máximo por resultado: 24");
    expect(t).toContain("Esperado: 180 resultados a 2.5 → 36 ventas");
    expect(t).toContain("Tarjeta 2: Azul");
    expect(t).toContain("LAS 7 MALETAS");
  });
});
