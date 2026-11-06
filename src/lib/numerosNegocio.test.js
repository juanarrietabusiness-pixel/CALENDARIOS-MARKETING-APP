import { describe, it, expect } from "vitest";
import {
  limpiarNegocio, numero, objetivo, equilibrio, utilidadA, aUnRoas, roasDeCosto, tablaUtilidad, numeroMagico,
  costoAceptable, conLecturaMeta, conTasaMedida, simular, escenarios, entradasDelSimulador, ticketDelCatalogo,
  pedidoPropuesta, leerPropuesta, aplicarPropuesta, confirmarDato, modoDe, origenDe, valoresDe, tieneNumeros,
  TASA_CIERRE_DEFECTO, ITBMS_DEFECTO, MAX_COSTOS, MODOS_SIMULADOR,
} from "./numerosNegocio.js";

// ============================================================
// Las cuentas tienen que dar EXACTAMENTE lo que dan las de la agencia: los Excel del curso (Calculadora de
// presupuesto y Simulador) y la calculadora de deeplook. Los números esperados salen de las celdas de los Excel y de
// las líneas de `render()` de deeplook con sus valores por defecto (rehechas a mano, una a una).
// ============================================================

// Los valores por defecto de deeplook: producción 25 %, envíos 5 %, transacciones 4 %, devoluciones 3 %, IVA 0,
// fijos 10.000, pauta 6.000, ticket 90, tasa de cierre 20 %, «todo el negocio».
const DEEPLOOK = {
  destino: "web", modo: "negocio",
  costos: [{ nombre: "Producción", pct: 25 }, { nombre: "Envíos", pct: 5 }, { nombre: "Transacciones", pct: 4 }],
  devoluciones: 3, itbms: 0, fijos: 10000, presupuesto: 6000, ticket: 90, tasaCierre: 20,
};

describe("leer lo que se escribe", () => {
  it("entiende números como los escribe una persona", () => {
    expect(numero("12,5")).toBe(12.5);
    expect(numero("0,125")).toBe(0.125);
    expect(numero("1,200")).toBe(1200);
    expect(numero("$1,200.50")).toBe(1200.5);
    expect(numero("1.200.000")).toBe(1200000);
    expect(numero("1.234,5")).toBe(1234.5);
    expect(numero("Desde $45")).toBe(45);
    expect(numero("B/. 19.99")).toBe(19.99);
    expect(numero("0.03")).toBe(0.03);
    expect(Number.isNaN(numero("sin precio"))).toBe(true);
    expect(Number.isNaN(numero(""))).toBe(true);
  });

  it("limpia el perfil, los números con su origen y los costos", () => {
    const n = limpiarNegocio({
      tipo: "productos", destino: "whatsapp", cuenta: "nueva", modo: "inventado",
      ticket: { valor: "45,5", origen: "cliente", nota: "Ventas ÷ pedidos de octubre" },
      itbms: 7, devoluciones: { valor: 250, origen: "raro" }, fijos: "", presupuesto: null, tasaCierre: { valor: -3 },
      costos: [{ nombre: "Producción", pct: "30" }, { nombre: "", pct: 5 }, { nombre: "Sin número" }],
      actualizado: "2026-11-06T10:00:00.000Z", por: "Juan",
    });
    expect(n).toEqual({
      v: 1, tipo: "productos", destino: "whatsapp", cuenta: "nueva", modo: "",
      ticket: { valor: 45.5, origen: "cliente", nota: "Ventas ÷ pedidos de octubre" },
      itbms: { valor: 7, origen: "agencia" },
      devoluciones: { valor: 100, origen: "agencia" },
      tasaCierre: { valor: 0, origen: "agencia" },
      costos: [{ nombre: "Producción", pct: 30, origen: "agencia" }, { nombre: "Otro costo", pct: 5, origen: "agencia" }],
      actualizado: "2026-11-06T10:00:00.000Z", por: "Juan",
    });
    // Limpiar dos veces da lo mismo.
    expect(limpiarNegocio(n)).toEqual(n);
  });

  it("no guarda más de seis costos, ni orígenes inventados, ni tipos que no existen", () => {
    const n = limpiarNegocio({ tipo: "inventado", destino: "fax", costos: Array.from({ length: 9 }, (_, i) => ({ nombre: `C${i}`, pct: 1, origen: "ia" })) });
    expect(n.costos).toHaveLength(MAX_COSTOS);
    expect(n.costos.every((c) => c.origen === "agencia")).toBe(true);
    expect(n.tipo).toBe("");
    expect(n.destino).toBe("");
    expect(limpiarNegocio(null)).toEqual({ v: 1, tipo: "", destino: "", cuenta: "", modo: "", costos: [] });
    expect(tieneNumeros(null)).toBe(false);
    expect(tieneNumeros({ ticket: 5 })).toBe(true);
  });

  it("el modo sale del destino si no se escoge: WhatsApp mide todo el negocio y la web sólo la pauta", () => {
    expect(modoDe({ destino: "whatsapp" })).toBe("negocio");
    expect(modoDe({ destino: "web" })).toBe("plataforma");
    expect(modoDe({})).toBe("negocio");
    expect(modoDe({ destino: "web", modo: "negocio" })).toBe("negocio");
  });

  it("el ITBMS vale 7 y la tasa de cierre 5 mientras nadie escriba otra cosa (la del Manual si se da)", () => {
    expect(TASA_CIERRE_DEFECTO).toBe(5);
    expect(ITBMS_DEFECTO).toBe(7);
    expect(valoresDe({})).toMatchObject({ itbms: 7, tasaCierre: 5, devoluciones: 0, fijos: 0 });
    expect(valoresDe({}, { tasaDefecto: 12 }).tasaCierre).toBe(12);
    expect(valoresDe({ tasaCierre: 9 }, { tasaDefecto: 12 }).tasaCierre).toBe(9);
    expect(valoresDe({ itbms: 0 }).itbms).toBe(0);
    expect(origenDe({}, "itbms")).toBe("defecto");
    expect(origenDe({}, "tasaCierre")).toBe("defecto");
    expect(origenDe({}, "ticket")).toBe(null);
    expect(origenDe({ ticket: { valor: 3, origen: "meta" } }, "ticket")).toBe("meta");
  });
});

describe("el objetivo: la Calculadora de presupuesto del curso", () => {
  it("hoja Ventas: 2.000 de meta, ticket 2.000 y 20 % → 1 venta, 400 por compra, 400 de inversión, ROAS 5", () => {
    const o = objetivo({ metaVentas: 2000, ticket: 2000, invertir: 20 });
    expect(o.ventasNecesarias).toBe(1);
    expect(o.costoCompra).toBe(400);
    expect(o.inversion).toBe(400);
    expect(o.roas).toBe(5);
    expect(o.faltan).toEqual([]);
  });

  it("hoja Interacción con el 16 % como porcentaje (la copia tenía «16»): 50 ventas, 3,2 por compra, 0,288 por conversación, 160, ROAS 6,25", () => {
    const o = objetivo({ metaVentas: 1000, ticket: 20, invertir: 16, tasaCierre: 9 });
    expect(o.ventasNecesarias).toBe(50);
    expect(o.costoCompra).toBeCloseTo(3.2, 10);
    expect(o.costoConversacion).toBeCloseTo(0.288, 10);
    expect(o.inversion).toBeCloseTo(160, 10);
    expect(o.roas).toBeCloseTo(6.25, 10);
  });

  it("sin la tasa medida usa el 5 % del curso; sin meta, el ROAS objetivo sale igual (1 ÷ %)", () => {
    const o = objetivo({ ticket: 20, invertir: 16 });
    expect(o.costoConversacion).toBeCloseTo(3.2 * 0.05, 10);
    expect(o.tasaCierre).toBe(5);
    expect(o.roas).toBeCloseTo(6.25, 10);
    expect(o.inversion).toBe(null);
    expect(o.ventasNecesarias).toBe(null);
    expect(o.faltan).toEqual(["metaVentas"]);
  });

  it("avisa si el % a invertir se come el margen", () => {
    const o = objetivo({ ticket: 20, invertir: 70, costos: [{ nombre: "Producto", pct: 40 }], itbms: 0 });
    expect(o.avisos.map((a) => a.codigo)).toEqual(["invierteElMargen"]);
    expect(objetivo({ ticket: 20, invertir: 20, costos: [{ nombre: "Producto", pct: 40 }] }).avisos).toEqual([]);
  });
});

describe("el equilibrio: la calculadora de deeplook", () => {
  it("con sus valores por defecto da lo mismo que su render()", () => {
    const e = equilibrio(DEEPLOOK);
    expect(e.costosVariables).toBe(34);
    expect(e.margenBruto).toBe(66);
    expect(e.margenEfectivo).toBeCloseTo(64.02, 10);
    expect(e.piso).toBeCloseTo(1.5620118712902218, 12);
    expect(e.roas).toBeCloseTo(4.165364990107259, 12);
    expect(e.cac).toBeCloseTo(21.60675, 10);
    expect(e.costoConversacion).toBeCloseTo(21.60675 * 0.2, 10);
    expect(e.pisoManda).toBe(false);
    expect(e.cargaTodosLosFijos).toBe(false);
    expect(utilidadA(DEEPLOOK, 5)).toBeCloseTo(3206, 8);
    expect(utilidadA(DEEPLOOK, 0)).toBeCloseTo(-16000, 8);
  });

  it("el escenario a un ROAS de 5 (el objetivo por defecto de deeplook)", () => {
    const s = aUnRoas(DEEPLOOK, 5);
    expect(s.utilidad).toBeCloseTo(3206, 8);
    expect(s.ventas).toBe(30000);
    expect(s.clientes).toBeCloseTo(333.3333333, 6);
    expect(s.cac).toBe(18);
    expect(s.costoConversacion).toBeCloseTo(3.6, 10);
    expect(s.conversaciones).toBeCloseTo(1666.6666667, 6);
  });

  it("en mensajes con ITBMS 7 %: el margen se lleva a la venta con impuesto", () => {
    const e = equilibrio({ ...DEEPLOOK, destino: "whatsapp", itbms: 7 });
    expect(e.margenEfectivo).toBeCloseTo(59.83177570093458, 10);
    expect(e.piso).toBeCloseTo(1.6713527022805375, 12);
    expect(e.roas).toBeCloseTo(4.4569405394147665, 12);
    expect(e.cac).toBeCloseTo(20.19322429906542, 10);
    expect(e.costoConversacion).toBeCloseTo(4.038644859813084, 10);
    expect(utilidadA({ ...DEEPLOOK, itbms: 7 }, 5)).toBeCloseTo(1949.5327102803712, 8);
  });

  it("sólo la pauta: las ventas de otros canales pagan los fijos y, si los cubren, manda el piso", () => {
    const e = equilibrio({ ...DEEPLOOK, modo: "plataforma", otrosCanales: 20000 });
    expect(e.pisoManda).toBe(true);
    expect(e.roas).toBeCloseTo(1.5620118712902218, 12);
    expect(e.cac).toBeCloseTo(57.618, 8);
    expect(e.aporteOtros).toBeCloseTo(12804, 8);
    expect(utilidadA({ ...DEEPLOOK, modo: "plataforma", otrosCanales: 20000 }, 5)).toBeCloseTo(16010, 8);
    // En «todo el negocio» las ventas de otros canales ya van dentro del ROAS: no cuentan aparte.
    expect(equilibrio({ ...DEEPLOOK, modo: "negocio", otrosCanales: 20000 }).roas).toBeCloseTo(4.165364990107259, 12);
  });

  it("sólo la pauta con ITBMS, un costo más y ventas de otros canales que no cubren los fijos", () => {
    const n = { ...DEEPLOOK, modo: "plataforma", otrosCanales: 5000, itbms: 7, costos: [...DEEPLOOK.costos, { nombre: "Comisión", pct: 6 }] };
    const e = equilibrio(n);
    expect(e.costosVariables).toBe(40);
    expect(e.margenEfectivo).toBeCloseTo(54.39252336448597, 10);
    expect(e.roas).toBeCloseTo(4.069301260022911, 12);
    expect(e.cac).toBeCloseTo(22.116819141449675, 10);
    expect(utilidadA(n, 5)).toBeCloseTo(3037.383177570089, 8);
  });

  it("con fijos y sin ventas de otros canales en «sólo la pauta» AVISA, sin cambiar la cifra", () => {
    const con = equilibrio({ ...DEEPLOOK, modo: "plataforma" });
    const sin = equilibrio({ ...DEEPLOOK, modo: "negocio" });
    expect(con.cargaTodosLosFijos).toBe(true);
    expect(con.roas).toBe(sin.roas);
    expect(equilibrio({ ...DEEPLOOK, modo: "plataforma", fijos: 0 }).cargaTodosLosFijos).toBe(false);
    expect(equilibrio({ ...DEEPLOOK, modo: "plataforma", otrosCanales: 100 }).cargaTodosLosFijos).toBe(false);
    // Sin fijos, el equilibrio es el piso.
    expect(equilibrio({ ...DEEPLOOK, fijos: 0 }).roas).toBeCloseTo(1.5620118712902218, 12);
  });

  it("con los fijos dentro, el equilibrio depende del presupuesto (más pauta reparte los fijos)", () => {
    const poco = equilibrio(DEEPLOOK, { presupuesto: 3000 }).roas;
    const mucho = equilibrio(DEEPLOOK, { presupuesto: 12000 }).roas;
    expect(poco).toBeGreaterThan(mucho);
    expect(equilibrio(DEEPLOOK, { presupuesto: 12000 }).presupuestoDe).toBe("simulado");
  });

  it("sin presupuesto escrito usa la inversión que pide la meta, y lo dice", () => {
    const n = { ...DEEPLOOK, presupuesto: null, metaVentas: 30000, invertir: 20 };
    const e = equilibrio(n);
    expect(e.presupuesto).toBe(6000);
    expect(e.presupuestoDe).toBe("objetivo");
    expect(e.roas).toBeCloseTo(4.165364990107259, 12);
  });

  it("sin margen o sin presupuesto no inventa nada", () => {
    const sinMargen = equilibrio({ ...DEEPLOOK, costos: [{ nombre: "Todo", pct: 100 }] });
    expect(sinMargen.roas).toBe(null);
    expect(sinMargen.sinMargen).toBe(true);
    expect(sinMargen.faltan).toContain("costos");
    const sinPauta = equilibrio({ ...DEEPLOOK, presupuesto: null });
    expect(sinPauta.roas).toBe(null);
    expect(sinPauta.faltan).toContain("presupuesto");
    expect(utilidadA({ ...DEEPLOOK, presupuesto: null }, 5)).toBe(null);
    expect(tablaUtilidad({ ...DEEPLOOK, presupuesto: null })).toBe(null);
  });

  it("la tabla presupuesto × ROAS tiene los rangos y las celdas de deeplook", () => {
    const t = tablaUtilidad(DEEPLOOK, { roas: 5 });
    expect(t.eje).toBe("roas");
    expect(t.columnas.map((c) => c.presupuesto)).toEqual([
      2400, 3017.840231239045, 3794.7331922020553, 4771.624372602304, 6000,
      7544.600578097613, 9486.832980505138, 11929.060931505759, 15000, 18861.50144524403,
    ].map((x) => expect.closeTo(x, 8)));
    expect(t.columnas[4].actual).toBe(true);
    expect(t.filas[0].valor).toBeCloseTo(6.5, 10);
    expect(t.filas[9].valor).toBeCloseTo(1.327710090596689, 10);
    expect(t.filas[0].celdas[0]).toBeCloseTo(-2412.88, 6);
    expect(t.filas[9].celdas[4]).toBeCloseTo(-10900, 6);
    // La fila más cercana al objetivo queda marcada: 5 cae entre 5,35 y 4,78 → la de 4,78.
    expect(t.filas.filter((f) => f.actual).map((f) => f.valor)).toEqual([expect.closeTo(4.77590336353223, 8)]);
  });

  it("en WhatsApp la tabla va por costo por conversación (con el rango de deeplook)", () => {
    const n = { ...DEEPLOOK, destino: "whatsapp", itbms: 7 };
    const beCpl = 4.038644859813084;
    const t = tablaUtilidad(n);
    expect(t.eje).toBe("costo");
    // Sin objetivo, el de deeplook: el 80 % del equilibrio, redondeado.
    expect(t.objetivo).toBe(3.23);
    expect(t.filas[0].valor).toBeCloseTo(Math.min(beCpl, 3.23) * 0.5, 10);
    expect(t.filas[9].valor).toBeCloseTo(beCpl * 1.5, 10);
    // Cada fila es un ROAS: ticket × tasa ÷ costo.
    expect(t.filas[3].roas).toBeCloseTo((90 * 0.2) / t.filas[3].valor, 10);
    expect(roasDeCosto(n, 3.6)).toBeCloseTo(5, 10);
  });
});

describe("el número mágico", () => {
  const WHATSAPP = { destino: "whatsapp", ticket: 20, invertir: 16, tasaCierre: 9, metaVentas: 1000, costos: [{ nombre: "Producto", pct: 40 }], presupuesto: 160 };

  it("en WhatsApp es el costo por conversación: el objetivo frente al equilibrio", () => {
    const m = numeroMagico(WHATSAPP);
    expect(m.objetivoCampana).toBe("mensajes");
    expect(m.metrica).toBe("Costo por conversación");
    expect(m.objetivo).toBeCloseTo(0.288, 10);
    expect(m.equilibrio).toBeCloseTo(equilibrio(WHATSAPP).costoConversacion, 10);
    expect(m.alarma).toBe(false);
  });

  it("si el objetivo pasa del equilibrio, la alarma: con esa meta se pierde dinero", () => {
    const m = numeroMagico({ ...WHATSAPP, invertir: 60, presupuesto: 600, fijos: 500 });
    expect(m.objetivo).toBeGreaterThan(m.equilibrio);
    expect(m.alarma).toBe(true);
    expect(m.textoAlarma).toMatch(/se pierde dinero/);
  });

  it("en la web es el ROAS (más alto es mejor) y el costo por compra al lado", () => {
    const n = { ...DEEPLOOK, invertir: 20 };
    const m = numeroMagico(n);
    expect(m.objetivoCampana).toBe("ventas");
    expect(m.objetivo).toBe(5);
    expect(m.equilibrio).toBeCloseTo(4.165364990107259, 12);
    expect(m.alarma).toBe(false);
    expect(m.alterna).toMatchObject({ metrica: "Costo por compra", objetivo: 18 });
    expect(numeroMagico({ ...n, invertir: 30 }).alarma).toBe(true);
  });

  it("clientes potenciales, tráfico y visitas al negocio", () => {
    const l = { pctMensajes: 50, costoClicUnico: 0.12, cpm: 3.4, costoCliente: 2 };
    expect(numeroMagico(WHATSAPP, { objetivoCampana: "clientes", lectura: l })).toMatchObject({ metrica: "Costo por cliente potencial", real: 2 });
    const t = numeroMagico(WHATSAPP, { objetivoCampana: "trafico", lectura: l });
    expect(t.metrica).toBe("Costo por clic único en el enlace");
    expect(t.objetivo).toBeCloseTo(0.288 * 0.5, 10);
    expect(t.real).toBe(0.12);
    expect(numeroMagico(WHATSAPP, { objetivoCampana: "trafico" }).nota).toMatch(/% de mensajes/);
    const local = numeroMagico(WHATSAPP, { objetivoCampana: "local", lectura: l });
    expect(local).toMatchObject({ metrica: "CPM", objetivo: null, equilibrio: null, real: 3.4, alarma: false });
  });

  it("el costo aceptable del diagnóstico: el objetivo; sin objetivo, el equilibrio", () => {
    expect(costoAceptable(WHATSAPP)).toEqual({ valor: 0.29, metrica: "Costo por conversación", de: "objetivo" });
    const sinObjetivo = { ...WHATSAPP, invertir: null };
    expect(costoAceptable(sinObjetivo)).toMatchObject({ metrica: "Costo por conversación", de: "equilibrio" });
    expect(costoAceptable({ ...DEEPLOOK, invertir: 20 })).toEqual({ valor: 18, metrica: "Costo por compra", de: "objetivo" });
    expect(costoAceptable({})).toBe(null);
  });
});

describe("lo que llega de Meta y del enlace de ventas", () => {
  it("el presupuesto sale de Meta si nadie lo escribió, y no pisa lo escrito", () => {
    expect(conLecturaMeta({}, { gasto: 312.456 }).presupuesto).toMatchObject({ valor: 312.46, origen: "meta" });
    expect(conLecturaMeta({ presupuesto: 500 }, { gasto: 312 }).presupuesto).toEqual({ valor: 500, origen: "agencia" });
    expect(conLecturaMeta({}, null).presupuesto).toBeUndefined();
  });

  it("la tasa medida manda sobre la escrita y la estimada", () => {
    const n = conTasaMedida({ tasaCierre: { valor: 5, origen: "estimado" } }, { tasa: 7.5, ventas: 6, conversaciones: 80, desde: "2026-10-01" });
    expect(n.tasaCierre).toEqual({ valor: 7.5, origen: "medida", nota: "Medida por el enlace de ventas: 6 ventas de 80 conversaciones, desde el 2026-10-01." });
    expect(conTasaMedida({ tasaCierre: 9 }, { tasa: 0 }).tasaCierre).toEqual({ valor: 9, origen: "agencia" });
    expect(conTasaMedida({}, null).tasaCierre).toBeUndefined();
    expect(objetivo(conTasaMedida({ ticket: 20, invertir: 16 }, { tasa: 9 })).costoConversacion).toBeCloseTo(0.288, 10);
  });
});

describe("el Simulador de campañas: los 5 modos del Excel", () => {
  it("Conversaciones: 1.000 gastados, CPM 3, frecuencia 2, CTR único 3 %, 20 % a mensaje", () => {
    const r = simular("conversaciones", { gasto: 1000, cpm: 3, frecuencia: 2, ctrUnico: 3, pctConversion: 20 });
    expect(r.impresiones).toBeCloseTo(333333.3333, 3);
    expect(r.alcance).toBeCloseTo(166666.6667, 3);
    expect(r.clics).toBeCloseTo(10000, 6);
    expect(r.conversaciones).toBeCloseTo(2000, 6);
    expect(r.costoConversacion).toBeCloseTo(0.5, 10);
  });

  it("Compras en la web: 1.000, 4 % compran, 100 de valor, 70 % visitas, 2 % clics salientes, frecuencia 2, CPM 10", () => {
    const r = simular("compras", { gasto: 1000, pctCompras: 4, valorPromedio: 100, pctVisitas: 70, ctrSaliente: 2, frecuencia: 2, cpm: 10 });
    expect(r.impresiones).toBeCloseTo(100000, 6);
    expect(r.alcance).toBeCloseTo(50000, 6);
    expect(r.clicsSalientes).toBeCloseTo(2000, 6);
    expect(r.visitas).toBeCloseTo(1400, 6);
    expect(r.compras).toBeCloseTo(56, 6);
    expect(r.costoCompra).toBeCloseTo(17.85714286, 6);
    expect(r.valor).toBeCloseTo(5600, 6);
    expect(r.roas).toBeCloseTo(5.6, 10);
  });

  it("Clientes potenciales de Meta: 1.000, 10 %, CTR 2,5 %, frecuencia 2, CPM 7", () => {
    const r = simular("clientes-meta", { gasto: 1000, pctConversion: 10, ctrUnico: 2.5, frecuencia: 2, cpm: 7 });
    expect(r.impresiones).toBeCloseTo(142857.1429, 3);
    expect(r.alcance).toBeCloseTo(71428.57143, 4);
    expect(r.clics).toBeCloseTo(3571.428571, 5);
    expect(r.clientes).toBeCloseTo(357.1428571, 6);
    expect(r.costoCliente).toBeCloseTo(2.8, 10);
  });

  it("Clientes potenciales en la web, CORREGIDO: sobre las visitas (240 y 4,17), no sobre los clics (300 y 3,33)", () => {
    const r = simular("clientes-web", { gasto: 1000, pctConversion: 20, pctVisitas: 80, ctrSaliente: 1.5, frecuencia: 1.5, cpm: 10 });
    expect(r.impresiones).toBeCloseTo(100000, 6);
    expect(r.alcance).toBeCloseTo(66666.66667, 4);
    expect(r.clicsSalientes).toBeCloseTo(1500, 6);
    expect(r.visitas).toBeCloseTo(1200, 6);
    expect(r.clientes).toBeCloseTo(240, 6);
    expect(r.costoCliente).toBeCloseTo(4.1667, 4);
  });

  it("Alcance y ThruPlays: 300, 0,7 por mil alcanzados, 0,01 por ThruPlay, frecuencia 1,2", () => {
    const r = simular("alcance", { gasto: 300, costoMil: 0.7, costoThruplay: 0.01, frecuencia: 1.2 });
    expect(r.alcance).toBeCloseTo(428571.4286, 3);
    expect(r.impresiones).toBeCloseTo(514285.7143, 3);
    expect(r.thruplays).toBeCloseTo(30000, 6);
  });

  it("cada modo enseña sus filas y sin resultados no inventa un costo", () => {
    for (const m of MODOS_SIMULADOR) expect(simular(m.id, {}).filas.length).toBeGreaterThan(2);
    expect(simular("conversaciones", { gasto: 100 }).costoConversacion).toBe(null);
  });

  it("tres escenarios moviendo el CTR y el % de conversión un 25 %, y dicho", () => {
    const e = escenarios("conversaciones", { gasto: 1000, cpm: 3, frecuencia: 2, ctrUnico: 3, pctConversion: 20 });
    expect(e.map((x) => x.id)).toEqual(["conservador", "esperado", "optimista"]);
    expect(e[1].conversaciones).toBeCloseTo(2000, 6);
    expect(e[0].conversaciones).toBeCloseTo(2000 * 0.75 * 0.75, 6);
    expect(e[2].conversaciones).toBeCloseTo(2000 * 1.25 * 1.25, 6);
    expect(e[0].como).toMatch(/25 %/);
    const w = escenarios("compras", { gasto: 1000, pctCompras: 4, valorPromedio: 100, pctVisitas: 70, ctrSaliente: 2, frecuencia: 2, cpm: 10 });
    expect(w[2].roas).toBeCloseTo(5.6 * 1.25 * 1.25, 8);
    const a = escenarios("alcance", { gasto: 300, costoMil: 0.7, costoThruplay: 0.01, frecuencia: 1.2 });
    expect(a[0].alcance).toBeLessThan(a[1].alcance);
    expect(a[2].alcance).toBeGreaterThan(a[1].alcance);
  });

  it("se prellena con lo de Meta y el negocio, cada dato con su origen", () => {
    const lectura = { gasto: 420, cpm: 4.1, frecuencia: 1.8, ctrUnico: 2.2, pctMensajes: 35, alcance: 50000, compras: 4, valorCompras: 360 };
    expect(entradasDelSimulador("conversaciones", lectura, {})).toEqual({
      valores: { gasto: 420, cpm: 4.1, frecuencia: 1.8, ctrUnico: 2.2, pctConversion: 35 },
      origen: { gasto: "meta", cpm: "meta", frecuencia: "meta", ctrUnico: "meta", pctConversion: "meta" },
    });
    // Con los clics y las impresiones, el CTR va sobre las impresiones (como el Excel) y el «esperado» repite lo real.
    const real = { gasto: 420.5, cpm: 4.205, frecuencia: 2, impresiones: 100000, clicsUnicos: 2000, ctrUnico: 4, pctMensajes: 35 };
    const e = entradasDelSimulador("conversaciones", real, {});
    expect(e.valores.ctrUnico).toBe(2);
    const sim = simular("conversaciones", e.valores);
    expect(sim.clics).toBeCloseTo(2000, 6);
    expect(sim.conversaciones).toBeCloseTo(700, 6);
    // El presupuesto escrito gana a lo gastado; el valor de una compra, el de Meta antes que el ticket.
    const w = entradasDelSimulador("compras", lectura, { presupuesto: 600, ticket: 75 });
    expect(w.valores).toMatchObject({ gasto: 600, valorPromedio: 90 });
    expect(w.origen).toMatchObject({ gasto: "negocio", valorPromedio: "meta" });
    expect(entradasDelSimulador("compras", {}, { ticket: 75 }).valores.valorPromedio).toBe(75);
    expect(entradasDelSimulador("alcance", lectura, {}).valores.costoMil).toBeCloseTo(8.4, 6);
  });
});

describe("la IA propone lo que falta, y nada más", () => {
  const CATALOGO = [
    { nombre: "Sofá cama", precio: "$450", activo: true },
    { nombre: "Mesa", precio: "Desde $150", activo: true },
    { nombre: "Silla vieja", precio: "$999", activo: false },
    { nombre: "Asesoría", precio: "Consultar", activo: true },
  ];

  it("el ticket del catálogo es el promedio de los precios activos", () => {
    expect(ticketDelCatalogo(CATALOGO)).toEqual({ valor: 300, precios: 2 });
    expect(ticketDelCatalogo([])).toBe(null);
  });

  it("el pedido dice qué le toca proponer y qué ya está (sin pedirle lo confirmado)", () => {
    const p = pedidoPropuesta({ marca: "Dcasa", rubro: "Muebles", negocio: { tipo: "productos", destino: "whatsapp", ticket: { valor: 280, origen: "cliente" } }, catalogo: "- Sofá cama: $450", ticketCatalogo: { valor: 300, precios: 2 } });
    expect(p).toContain("Dcasa (Muebles)");
    expect(p).toContain("Ticket promedio: 280");
    expect(p).toMatch(/TE TOCA PROPONER \(sólo esto\): los costos variables, devoluciones, % de la venta que se invierte\./);
    expect(p).not.toMatch(/TE TOCA PROPONER[^\n]*ticket/);
    expect(p).toContain("«estimado»");
  });

  it("lo propuesto vuelve «estimado» con su explicación; lo confirmado no se toca", () => {
    const negocio = { ticket: { valor: 280, origen: "cliente" }, costos: [] };
    const r = leerPropuesta(JSON.stringify({
      ticket: { valor: 999, explicacion: "No debería entrar" },
      costos: [{ nombre: "Producto", pct: 45, explicacion: "Margen habitual de muebles" }, { nombre: "Envíos", pct: "5", explicacion: "Reparto en la ciudad" }],
      devoluciones: { valor: 2, explicacion: "Poco habitual" },
      invertir: { valor: 15, explicacion: "Deja 30 % de ganancia" },
      avisos: ["Confirma el costo del producto con el cliente"],
    }), negocio);
    expect(r.datos.ticket).toBeUndefined();
    expect(r.datos.devoluciones).toEqual({ valor: 2, origen: "estimado", nota: "Poco habitual" });
    expect(r.datos.invertir).toEqual({ valor: 15, origen: "estimado", nota: "Deja 30 % de ganancia" });
    expect(r.costos).toEqual([
      { nombre: "Producto", pct: 45, origen: "estimado", nota: "Margen habitual de muebles" },
      { nombre: "Envíos", pct: 5, origen: "estimado", nota: "Reparto en la ciudad" },
    ]);
    expect(r.avisos).toHaveLength(1);
    // Aplicarlo no guarda nada: devuelve el negocio con lo propuesto, y se confirma dato a dato.
    const con = aplicarPropuesta(negocio, r);
    expect(con.ticket).toEqual({ valor: 280, origen: "cliente" });
    expect(con.costos).toHaveLength(2);
    expect(confirmarDato(con, "invertir", "cliente").invertir.origen).toBe("cliente");
    expect(confirmarDato(con, "costos").costos.every((c) => c.origen === "agencia")).toBe(true);
    expect(aplicarPropuesta(negocio, r, ["devoluciones"]).invertir).toBeUndefined();
  });

  it("descarta un % a invertir que se come el margen, y lo que no es JSON", () => {
    const r = leerPropuesta({ costos: [{ nombre: "Producto", pct: 60 }], invertir: { valor: 50, explicacion: "x" } }, {});
    expect(r.datos.invertir).toBeUndefined();
    expect(leerPropuesta("no sé", {})).toBe(null);
  });
});
