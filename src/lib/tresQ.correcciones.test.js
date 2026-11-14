import { describe, it, expect } from "vitest";
import { revisar, cifras3q, etapaDeNombre, tipoDeResultado, semaforoDe, fraseDelResumen, SEMAFOROS, TEXTO_EXIGENCIA } from "./tresQ.js";
import { ACCION_MENSAJE, resultadosDe, resumenInsights } from "./anuncios.js";
import { cifrasDe, evaluar } from "./diagnostico.js";

// ============================================================
// Las correcciones de la auditoría del 14-nov en la revisión 3Q (hallazgos 1, 2 y 8 y los de media).
// ============================================================

const O = "OUTCOME_ENGAGEMENT";
const fila = ({ gasto = 10, conv = 5, imp = 5000, alcance = 2500, unicos = 100, freq = null, rep3s = 0, engagement = 0 } = {}) => ({
  spend: String(gasto), impressions: String(imp), reach: String(alcance), clicks: "150", ctr: "3",
  ...(freq != null ? { frequency: String(freq) } : {}),
  unique_inline_link_clicks: String(unicos),
  actions: [
    ...(conv ? [{ action_type: ACCION_MENSAJE, value: String(conv) }] : []),
    ...(engagement ? [{ action_type: "post_engagement", value: String(engagement) }] : []),
    ...(rep3s ? [{ action_type: "video_view", value: String(rep3s) }] : []),
  ],
});
const NUMEROS = { conversacion: { valor: 1, objetivo: 1, equilibrio: 3 }, compra: { valor: 20, objetivo: 20, equilibrio: 40 } };
const tres = (f30, f14, f7) => ({ 30: f30, 14: f14 ?? f30, 7: f7 ?? f30 });
const campana = ({ nombre = "Café · Evaluación", i, conjunto = {}, anuncios = [], ...resto } = {}) => ({
  id: "800", nombre, objetivo: O, estado: "ACTIVE", status: "ACTIVE", i: i ?? tres(fila({ gasto: 60, conv: 60 })),
  conjuntos: [{ id: "901", nombre: "Intereses", estado: "ACTIVE", status: "ACTIVE", presupuestoDiario: 10, i: tres(fila({ gasto: 60, conv: 60 })), ...conjunto }],
  anuncios: anuncios.map((a, n) => ({ id: `90${n + 2}`, nombre: `Anuncio ${n + 1}`, conjuntoId: "901", estado: "ACTIVE", status: "ACTIVE", ...a })),
  ...resto,
});
const opciones = { numeros: NUMEROS, hoy: "2026-11-06", cuenta: "act_111", destino: "whatsapp" };

describe("hallazgo 1: con WhatsApp sólo cuentan las conversaciones", () => {
  it("una campaña de Interacción sin una conversación tiene 0 resultados, no sus interacciones", () => {
    const f = fila({ conv: 0, engagement: 300, gasto: 20 });
    // Lo de antes (sin destino) contaba las 300 interacciones.
    expect(resultadosDe(f, O)).toBe(300);
    expect(resultadosDe(f, O, { destino: "whatsapp" })).toBe(0);
    expect(resultadosDe(f, "OUTCOME_SALES", { destino: "whatsapp" })).toBe(0);
    expect(resumenInsights(f, O, { destino: "whatsapp" })).toMatchObject({ resultados: 0, costoPorResultado: null });
    expect(cifras3q(f, O, { tipo: "conversacion" })).toMatchObject({ resultados: 0, costoPorResultado: null });
    expect(cifrasDe(f, O, "conversacion").resultados).toBe(0);
  });

  it("qué se mide: Interacción con WhatsApp (o que optimiza conversaciones) mide conversaciones aunque no haya ninguna", () => {
    expect(tipoDeResultado(fila({ conv: 0, engagement: 300 }), O, "whatsapp")).toBe("conversacion");
    expect(tipoDeResultado(fila({ conv: 0, engagement: 300 }), O, "")).toBe("conversacion");
    expect(tipoDeResultado(fila({ conv: 0, engagement: 300 }), O, "web", ["CONVERSATIONS"])).toBe("conversacion");
    // La de un cliente con web que optimiza interacciones (la evaluación) sí mide interacciones.
    expect(tipoDeResultado(fila({ conv: 0, engagement: 300 }), O, "web")).not.toBe("conversacion");
    expect(tipoDeResultado(fila({ conv: 0, engagement: 300 }), O, "whatsapp", ["POST_ENGAGEMENT"])).toBe("interaccion");
  });

  it("en la revisión, un conjunto de WhatsApp que gasta sin conversaciones se pausa (antes salía «sano» por sus interacciones)", () => {
    const i = tres(fila({ conv: 0, engagement: 400, gasto: 30 }));
    const r = revisar([campana({ i, conjunto: { i } })], opciones).campanas[0];
    expect(r.tipoResultado).toBe("conversacion");
    expect(r.conjuntos[0].ventanas[30].resultados).toBe(0);
    expect(r.conjuntos[0].veredicto.id).toBe("apagar");
    expect(r.conjuntos[0].semaforo).toMatchObject({ id: "mala", texto: "Mala" });
  });
});

describe("hallazgo 2: pausar va PRIMERO, y con el mes (30 días), no con una semana", () => {
  it("un conjunto que pierde dinero en el mes y además empeoró esta semana se pausa (antes salía «Vigilar»)", () => {
    // Mes: 3,50 por conversación (equilibrio 3); semana: 7 por conversación (subió más de un 30 %).
    const i = tres(fila({ gasto: 70, conv: 20 }), fila({ gasto: 35, conv: 8 }), fila({ gasto: 21, conv: 3 }));
    const v = revisar([campana({ conjunto: { i } })], opciones).campanas[0].conjuntos[0].veredicto;
    expect(v.id).toBe("apagar");
    expect(v.motivo).toMatch(/equilibrio/);
  });

  it("una mala semana dentro de un buen mes NO se pausa: se vigila", () => {
    // Mes: 0,80 por conversación (sano); la última semana: 12 gastados sin conversaciones.
    const i = tres(fila({ gasto: 80, conv: 100 }), fila({ gasto: 40, conv: 50 }), fila({ gasto: 12, conv: 0 }));
    const v = revisar([campana({ conjunto: { i } })], opciones).campanas[0].conjuntos[0].veredicto;
    expect(v.id).toBe("vigilar");
    expect(v.id).not.toBe("apagar");
  });

  it("un mes malo con una última semana buena no se pausa: se mejora y se dice que va mejor", () => {
    const i = tres(fila({ gasto: 100, conv: 25 }), fila({ gasto: 30, conv: 20 }), fila({ gasto: 10, conv: 14 }));
    const v = revisar([campana({ conjunto: { i } })], opciones).campanas[0].conjuntos[0].veredicto;
    expect(v.id).not.toBe("apagar");
    expect(v.motivo).toMatch(/última semana va mejor/);
  });
});

describe("sin número mágico NO se pausa por costo", () => {
  it("dice que hay que completar los números del negocio, aunque cueste mucho", () => {
    const i = tres(fila({ gasto: 200, conv: 10, unicos: 20 }));
    const r = revisar([campana({ conjunto: { i } })], { ...opciones, numeros: null }).campanas[0];
    expect(r.conjuntos[0].veredicto.id).toBe("completar");
    expect(r.conjuntos[0].veredicto.motivo).toMatch(/completa los números del negocio para saber si esto es caro/);
    expect(r.conjuntos[0].semaforo.pasos.join(" ")).toMatch(/Números del negocio/);
  });

  it("sí se pausa por un % de mensajes muy bajo (no depende de los números del negocio)", () => {
    // 200 clics únicos y 6 conversaciones: escriben 3 de cada 100.
    const i = tres(fila({ gasto: 50, conv: 6, unicos: 200 }));
    const v = revisar([campana({ conjunto: { i } })], { ...opciones, numeros: null }).campanas[0].conjuntos[0].veredicto;
    expect(v.id).toBe("apagar");
    expect(v.motivo).toMatch(/sólo escriben 3/);
    // El umbral es del Manual.
    expect(revisar([campana({ conjunto: { i } })], { ...opciones, numeros: null, umbrales: { pctMensajesPausar: 2 } }).campanas[0].conjuntos[0].veredicto.id).not.toBe("apagar");
  });
});

describe("presupuesto de campaña (CBO): espera al aprendizaje de sus conjuntos", () => {
  it("con un conjunto aprendiendo, la campaña espera aunque se vea cara", () => {
    const caro = tres(fila({ gasto: 60, conv: 10 }));
    const c = campana({ presupuestoDiario: 20, i: caro, conjunto: { presupuestoDiario: null, aprendizaje: "LEARNING", i: caro } });
    const r = revisar([c], opciones).campanas[0];
    expect(r.cbo).toBe(true);
    expect(r.veredicto.id).toBe("espera");
    expect(r.veredicto.motivo).toMatch(/Intereses.*aprendizaje/);
    expect(r.semaforo).toMatchObject({ id: "esperando", texto: "Esperando: aprendiendo" });
  });
});

describe("la tasa de 3 s sólo con las impresiones de los anuncios de VIDEO", () => {
  it("un conjunto que mezcla video e imagen no se diluye", () => {
    // El conjunto: 10.000 impresiones; el video: 4.000 con 1.200 reproducciones (30 %); la imagen: 6.000 sin ninguna.
    const conj = tres(fila({ gasto: 60, conv: 60, imp: 10000, rep3s: 1200 }));
    const r = revisar([campana({ conjunto: { i: conj }, anuncios: [
      { i: tres(fila({ gasto: 30, conv: 30, imp: 4000, rep3s: 1200 })) },
      { i: tres(fila({ gasto: 30, conv: 30, imp: 6000 })) },
    ] })], opciones).campanas[0];
    // Antes: 1.200 ÷ 10.000 = 12 % (avisaba por debajo de 20). Ahora: 30 %.
    expect(r.conjuntos[0].ventanas[7].tasa3s).toBe(30);
    expect(r.conjuntos[0].q2.metricas.find((m) => m.id === "tasa3s")?.mal).toBe(false);
  });
});

describe("etapaDeNombre sin falsos positivos", () => {
  it("un producto con «frío» o «caliente» no es una etapa", () => {
    expect(etapaDeNombre("Aire frío · Ventas · Octubre")).toBe("");
    expect(etapaDeNombre("Café caliente · Noviembre")).toBe("");
    expect(etapaDeNombre("Precio especial sofás")).toBe("");
    // Como trozo propio o tras «público», sí.
    expect(etapaDeNombre("Dcasa · Frío · Sofá")).toBe("presentacion");
    expect(etapaDeNombre("Dcasa público caliente")).toBe("conversion");
    expect(etapaDeNombre("Atraer octubre")).toBe("presentacion");
    expect(etapaDeNombre("Campaña especial madres")).toBe("temporada");
  });
});

describe("el semáforo y el resumen: se entiende sin saber del curso", () => {
  it("cada veredicto con su color en texto, por qué, qué hacer en pasos y dónde en el Ads Manager", () => {
    const apagar = semaforoDe({ nombre: "Intereses", veredicto: { id: "apagar", motivo: "Pierde dinero." }, q1: "pierde" }, "conjunto");
    expect(apagar).toMatchObject({ id: "mala", texto: "Mala", porque: "Pierde dinero." });
    expect(apagar.donde).toBe("En el Ads Manager: Conjuntos de anuncios → «Intereses» → apagar el interruptor");
    expect(apagar.pasos.length).toBeGreaterThan(1);
    const escalar = semaforoDe({ nombre: "X", veredicto: { id: "escalar", motivo: "", sugerencia: { diarioActual: 10, diarioNuevo: 12 } } }, "conjunto");
    expect(escalar.pasos.join(" ")).toMatch(/de 10,00.*a 12,00/);
    expect(semaforoDe({ veredicto: { id: "espera" } }, "conjunto").texto).toBe("Esperando: aprendiendo");
    expect(semaforoDe({ veredicto: { id: "vigilar" } }, "conjunto").texto).toBe("A vigilar");
    expect(Object.values(SEMAFOROS).every((s) => s.texto)).toBe(true);
  });

  it("el resumen de arriba cuenta las campañas por su peor semáforo y dice por cuál empezar", () => {
    const f = fraseDelResumen([
      { nombre: "A", semaforoTotal: "sana" }, { nombre: "B", semaforoTotal: "sana" }, { nombre: "C", semaforoTotal: "sana" },
      { nombre: "D", semaforoTotal: "vigilar" }, { nombre: "E", semaforoTotal: "mala" },
    ]);
    expect(f).toBe("De 5 campañas, 3 están sanas, 1 hay que vigilarla y 1 va mal: empieza por «E».");
    expect(fraseDelResumen([{ nombre: "A", semaforoTotal: "sana" }])).toBe("De 1 campaña, 1 está sana: no hay nada urgente.");
    const r = revisar([campana()], opciones);
    expect(r.resumen.frase).toMatch(/^De 1 campaña/);
  });

  it("lo que se le exige es lo mismo en todas las etapas", () => {
    expect(revisar([campana()], opciones).campanas[0].exigencia).toBe(TEXTO_EXIGENCIA);
  });
});

describe("el diagnóstico de antes con conversaciones", () => {
  it("evaluar con tipo «conversacion» no cuenta interacciones", () => {
    const i7 = fila({ gasto: 20, conv: 0, engagement: 300 });
    expect(evaluar({ nivel: "conjunto", estado: "ACTIVE", i7, i30: i7, objetivo: O, tipo: "conversacion" }, { ref: 5 })?.accion).toBe("apagar");
  });
});
