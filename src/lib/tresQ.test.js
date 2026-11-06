import { describe, it, expect } from "vitest";
import {
  revisar, cifras3q, q2De, accionesQ3, estadoQ1, referencia, etapaDeNombre, etapaDeCampana, limpiarEtapas, enlaceAdsManager,
  tipoDeResultado, q1DeCuenta, alertasGraves, comoDiagnostico, textoDeRevision, pedidoRevisionIA, agenciaDelInforme,
  rankingsDe, sumarFilas, valorQ2, EXIGENCIA_ETAPA, ETAPAS_REVISION, METRICAS_Q2,
} from "./tresQ.js";
import { UMBRALES_3Q, limpiarUmbrales3q, CAMPOS_UMBRALES_3Q } from "./umbrales3q.js";
import { ACCION_MENSAJE } from "./anuncios.js";

// Una fila de /insights con lo que pide la revisión: conversaciones de WhatsApp, clics únicos y video.
const fila = ({ gasto = 10, conv = 5, imp = 5000, alcance = 2500, unicos = 100, ctrU = null, freq = null, cpm = null, rep3s = 0, tiempo = null, sinNuevos = false } = {}) => ({
  spend: String(gasto), impressions: String(imp), reach: String(alcance), clicks: "150", ctr: "3",
  ...(cpm != null ? { cpm: String(cpm) } : {}),
  ...(freq != null ? { frequency: String(freq) } : {}),
  ...(sinNuevos ? {} : { unique_inline_link_clicks: String(unicos), ...(ctrU != null ? { unique_inline_link_click_ctr: String(ctrU) } : {}) }),
  ...(tiempo != null ? { video_avg_time_watched_actions: [{ action_type: "video_view", value: String(tiempo) }] } : {}),
  actions: [{ action_type: ACCION_MENSAJE, value: String(conv) }, ...(rep3s ? [{ action_type: "video_view", value: String(rep3s) }] : [])],
});
const O = "OUTCOME_ENGAGEMENT";
const NUMEROS = { conversacion: { objetivo: 1, equilibrio: 3 }, compra: { objetivo: 20, equilibrio: 40 } };
const tres = (f30, f14, f7) => ({ 30: f30, 14: f14 ?? f30, 7: f7 ?? f30 });

/** Una campaña con un conjunto (con presupuesto propio) y sus anuncios. */
const campana = ({ nombre = "Café · Evaluación · Octubre", i, conjunto = {}, anuncios = [], ...resto } = {}) => ({
  id: "800", nombre, objetivo: O, estado: "ACTIVE", status: "ACTIVE", i: i ?? tres(fila({ gasto: 60, conv: 60 })),
  conjuntos: [{ id: "901", nombre: "Intereses", estado: "ACTIVE", status: "ACTIVE", presupuestoDiario: 10, i: tres(fila({ gasto: 60, conv: 60 })), ...conjunto }],
  anuncios: anuncios.map((a, n) => ({ id: `90${n + 2}`, nombre: `Anuncio ${n + 1}`, conjuntoId: "901", estado: "ACTIVE", status: "ACTIVE", ...a })),
  ...resto,
});
const opciones = { numeros: NUMEROS, hoy: "2026-11-06", cuenta: "act_111" };

describe("las cifras de una fila (las métricas que faltaban)", () => {
  it("el % de mensajes es conversaciones ÷ clics únicos; la tasa de 3 s, reproducciones ÷ impresiones", () => {
    const c = cifras3q(fila({ gasto: 30, conv: 40, unicos: 100, rep3s: 1000, imp: 5000, tiempo: 6.2 }), O);
    expect(c).toMatchObject({ gasto: 30, conversaciones: 40, costoConversacion: 0.75, clicsUnicos: 100, pctMensajes: 40, tasa3s: 20, tiempoVideo: 6.2, resultados: 40 });
    // El CTR único, el de Meta si llega; si no, clics únicos ÷ alcance.
    expect(cifras3q(fila({ ctrU: 3.3 }), O).ctrUnico).toBe(3.3);
    expect(cifras3q(fila({ unicos: 50, alcance: 2500 }), O).ctrUnico).toBe(2);
  });

  it("sin los campos nuevos (Meta los rechazó) es «no se sabe», no 0", () => {
    const c = cifras3q(fila({ sinNuevos: true }), O);
    expect(c.clicsUnicos).toBeNull();
    expect(c.pctMensajes).toBeNull();
    expect(c.ctrUnico).toBeNull();
    expect(c.tiempoVideo).toBeNull();
    expect(cifras3q(null)).toBeNull();
  });

  it("varias filas se suman en una (la cuenta desde sus campañas)", () => {
    const s = cifras3q(sumarFilas([fila({ gasto: 10, conv: 2 }), fila({ gasto: 5, conv: 3 })]));
    expect(s).toMatchObject({ gasto: 15, conversaciones: 5, costoConversacion: 3 });
  });

  it("qué cuenta como resultado depende del objetivo y de lo que llegó", () => {
    expect(tipoDeResultado(fila(), O)).toBe("conversacion");
    expect(tipoDeResultado({ actions: [{ action_type: "link_click", value: "3" }] }, "OUTCOME_TRAFFIC")).toBe("clic");
    expect(tipoDeResultado({ actions: [{ action_type: "omni_purchase", value: "3" }] }, "OUTCOME_SALES")).toBe("compra");
    expect(tipoDeResultado(null, "OUTCOME_SALES", "whatsapp")).toBe("conversacion");
    expect(tipoDeResultado(null, "OUTCOME_SALES", "web")).toBe("compra");
  });
});

describe("Q1: frente al número mágico", () => {
  it("lo que aguanta: el número mágico por la exigencia de su etapa, nunca por encima del equilibrio", () => {
    expect(referencia({ tipo: "conversacion", etapa: "evaluacion", numeros: NUMEROS })).toMatchObject({ ref: 1, objetivo: 1, equilibrio: 3, de: "numero-magico" });
    expect(referencia({ tipo: "conversacion", etapa: "presentacion", numeros: NUMEROS }).ref).toBe(1.3);
    expect(referencia({ tipo: "conversacion", etapa: "conversion", numeros: NUMEROS }).ref).toBe(0.8);
    // Presentación aguanta más, pero el equilibrio manda.
    expect(referencia({ tipo: "conversacion", etapa: "presentacion", numeros: { conversacion: { objetivo: 1, equilibrio: 1.1 } } }).ref).toBe(1.1);
    // Sin objetivo, el equilibrio; sin ninguno, el promedio de 30 días; lo tecleado manda.
    expect(referencia({ tipo: "conversacion", numeros: { conversacion: { objetivo: null, equilibrio: 2 } } })).toMatchObject({ ref: 2, de: "equilibrio" });
    expect(referencia({ tipo: "clic", numeros: NUMEROS, c30: { costoPorResultado: 0.4 } })).toMatchObject({ ref: 0.4, de: "promedio" });
    expect(referencia({ tipo: "conversacion", numeros: NUMEROS, costoMax: 5 })).toMatchObject({ ref: 5, de: "escrito" });
    // Una compra en la web se mide con su costo por compra.
    expect(referencia({ tipo: "compra", numeros: NUMEROS }).ref).toBe(20);
  });

  it("los estados: sano, caro, fuera, pierde, sin resultados y pronto", () => {
    const R = { ref: 1, equilibrio: 3 };
    expect(estadoQ1({ gasto: 10, resultados: 20, costoPorResultado: 0.5 }, R)).toBe("sano");
    expect(estadoQ1({ gasto: 12, resultados: 10, costoPorResultado: 1.2 }, R)).toBe("caro");
    expect(estadoQ1({ gasto: 20, resultados: 10, costoPorResultado: 2 }, R)).toBe("fuera");
    expect(estadoQ1({ gasto: 40, resultados: 10, costoPorResultado: 4 }, R)).toBe("pierde");
    expect(estadoQ1({ gasto: 2, resultados: 0 }, R)).toBe("sin-resultados");
    expect(estadoQ1({ gasto: 0.5, resultados: 0 }, R)).toBe("pronto");
    expect(estadoQ1({ gasto: 0 }, R)).toBe("sin-gasto");
    expect(estadoQ1(null, R)).toBe("sin-gasto");
  });
});

describe("Q2 y Q3: cada métrica con su umbral y su acción", () => {
  const c = (f7, f30 = f7) => ({ 7: cifras3q(f7, O), 14: cifras3q(f7, O), 30: cifras3q(f30, O) });
  const mal = (q) => q.metricas.filter((m) => m.mal).map((m) => m.id);

  it("% de mensajes por debajo del 50 %: un llamado más claro (sólo si es de conversaciones)", () => {
    expect(mal(q2De({ c: c(fila({ conv: 30, unicos: 100 })), tipo: "conversacion" }))).toContain("pctMensajes");
    expect(mal(q2De({ c: c(fila({ conv: 60, unicos: 100 })), tipo: "conversacion" }))).not.toContain("pctMensajes");
    expect(q2De({ c: c(fila({ conv: 30, unicos: 100 })), tipo: "clic" }).metricas.map((m) => m.id)).not.toContain("pctMensajes");
    // Con pocos clics no dice nada todavía.
    expect(q2De({ c: c(fila({ conv: 1, unicos: 5 })), tipo: "conversacion" }).metricas.map((m) => m.id)).not.toContain("pctMensajes");
  });

  it("CTR único por debajo de 2 %, 3 s por debajo de 20 %, tiempo por debajo de 5 s", () => {
    const q = q2De({ c: c(fila({ ctrU: 1.2, rep3s: 500, imp: 5000, tiempo: 3.5 })), tipo: "conversacion" });
    expect(mal(q)).toEqual(expect.arrayContaining(["ctrUnico", "tasa3s", "tiempoVideo"]));
    const bien = q2De({ c: c(fila({ conv: 80, ctrU: 3, rep3s: 1500, imp: 5000, tiempo: 7 })), tipo: "conversacion" });
    expect(mal(bien)).toEqual([]);
    // Sin video, no hay métricas de video.
    expect(q2De({ c: c(fila()), tipo: "conversacion" }).metricas.map((m) => m.id)).not.toContain("tasa3s");
  });

  it("la frecuencia avisa por encima de 3 en públicos nuevos y de 5 en los que ya conocen la marca", () => {
    expect(mal(q2De({ c: c(fila({ freq: 3.6 })), etapa: "presentacion" }))).toContain("frecuencia");
    expect(mal(q2De({ c: c(fila({ freq: 3.6 })), etapa: "conversion" }))).not.toContain("frecuencia");
    expect(mal(q2De({ c: c(fila({ freq: 5.4 })), etapa: "conversion" }))).toContain("frecuencia");
  });

  it("el CPM se compara con su propio mes (30 % más caro avisa)", () => {
    expect(mal(q2De({ c: c(fila({ cpm: 14 }), fila({ cpm: 10 })) }))).toContain("cpm");
    expect(mal(q2De({ c: c(fila({ cpm: 12 }), fila({ cpm: 10 })) }))).not.toContain("cpm");
  });

  it("los umbrales son del Manual", () => {
    const u = { ...UMBRALES_3Q, ctrUnico: 1, frecuencia: 4 };
    expect(mal(q2De({ c: c(fila({ ctrU: 1.2, freq: 3.6 })), etapa: "presentacion" }, u))).toEqual([]);
  });

  it("los rankings por debajo del promedio y el aprendizaje limitado también avisan", () => {
    const rankings = rankingsDe({ quality_ranking: "BELOW_AVERAGE_20", engagement_rate_ranking: "AVERAGE", conversion_rate_ranking: "UNKNOWN" });
    expect(rankings.map((r) => [r.campo, r.bajo])).toEqual([["quality_ranking", true], ["engagement_rate_ranking", false]]);
    const q = q2De({ c: c(fila()), rankings, aprendizaje: "FAIL" });
    expect(mal(q)).toEqual(expect.arrayContaining(["ranking", "aprendizaje"]));
  });

  it("la Q3: una acción por métrica, por orden de peso, y a dónde se va", () => {
    const q = q2De({ c: c(fila({ conv: 10, unicos: 100, ctrU: 1, rep3s: 200, imp: 5000, freq: 4 })), tipo: "conversacion", etapa: "presentacion" });
    const a = accionesQ3(q);
    expect(a.map((x) => x.id)).toEqual(["pctMensajes", "ctrUnico", "tasa3s", "frecuencia"]);
    expect(a.find((x) => x.id === "tasa3s")).toMatchObject({ ir: "ganchos", que: "gancho" });
    expect(a.find((x) => x.id === "pctMensajes")).toMatchObject({ ir: "anuncios", que: "texto" });
    expect(Object.values(METRICAS_Q2).every((m) => m.accion && m.titulo)).toBe(true);
  });

  it("los valores se dicen con su unidad", () => {
    expect(valorQ2("%", 35)).toBe("35 %");
    expect(valorQ2("s", 4.5)).toBe("4,5 s");
    expect(valorQ2("veces", 1)).toBe("1 vez");
  });
});

describe("el veredicto: desglose, aprendizaje y cuándo se pausa", () => {
  it("con el conjunto dentro del número mágico, sus anuncios NO se tocan aunque uno se vea peor", () => {
    // El conjunto: 60 $ y 60 conversaciones (1 $ c/u, aguanta 1). Un anuncio: 10 $ sin conversaciones.
    const r = revisar([campana({ anuncios: [{ i: tres(fila({ gasto: 10, conv: 0, freq: 4 })) }] })], opciones);
    const c = r.campanas[0];
    expect(c.conjuntos[0].veredicto.id).toBe("sano");
    expect(c.anuncios[0].veredicto).toMatchObject({ id: "sano", desglose: true });
    expect(c.anuncios[0].veredicto.motivo).toMatch(/no se toca/);
  });

  it("decisión 7: un anuncio se pausa fuera del número mágico y con el doble gastado, si su conjunto no va bien", () => {
    const conjuntoCaro = { i: tres(fila({ gasto: 60, conv: 20 })) }; // 3 $ c/u: fuera
    const r = revisar([campana({ conjunto: conjuntoCaro, anuncios: [
      { i: tres(fila({ gasto: 12, conv: 2 })) }, // 6 $ c/u con 12 gastados: fuera y con el doble
      { i: tres(fila({ gasto: 1.5, conv: 0 })) }, // 1,5 gastados: todavía no
    ] })], opciones);
    const [a1, a2] = r.campanas[0].anuncios;
    expect(a1.veredicto.id).toBe("apagar");
    expect(a2.veredicto.id).not.toBe("apagar");
    // El conjunto mismo también se pausa: 3 $ c/u, por encima del equilibrio (3) no, pero fuera (1,5 × 1) y con el doble gastado.
    expect(r.campanas[0].conjuntos[0].veredicto.id).toBe("apagar");
  });

  it("lo que pierde dinero (por encima del equilibrio) con el doble gastado se pausa", () => {
    const r = revisar([campana({ conjunto: { i: tres(fila({ gasto: 40, conv: 10 })) } })], { ...opciones, umbrales: { apagar: 5 } });
    expect(r.campanas[0].conjuntos[0].veredicto).toMatchObject({ id: "apagar" });
    expect(r.campanas[0].conjuntos[0].veredicto.motivo).toMatch(/equilibrio/);
  });

  it("por encima del número mágico pero no para pausar: «mejorar», con la acción que más pesa", () => {
    const r = revisar([campana({ conjunto: { i: tres(fila({ gasto: 12, conv: 10, unicos: 100 })) } })], opciones);
    const v = r.campanas[0].conjuntos[0].veredicto;
    expect(v.id).toBe("mejorar");
    expect(v.nombre).toBe(METRICAS_Q2.pctMensajes.titulo);
    expect(v.acciones[0]).toMatchObject({ id: "pctMensajes", ir: "anuncios" });
    // Con la pieza bien y aun así caro: la oferta y el destino.
    const r2 = revisar([campana({ conjunto: { i: tres(fila({ gasto: 12, conv: 10, unicos: 15, ctrU: 3 })) } })], opciones);
    expect(r2.campanas[0].conjuntos[0].veredicto.acciones[0].id).toBe("oferta");
  });

  it("la fase de aprendizaje: aprendiendo, cambiado hace poco o con un anuncio recién sumado, espera", () => {
    const caro = { i: tres(fila({ gasto: 60, conv: 20 })) };
    const aprendiendo = revisar([campana({ conjunto: { ...caro, aprendizaje: "LEARNING" } })], opciones).campanas[0].conjuntos[0].veredicto;
    expect(aprendiendo).toMatchObject({ id: "espera", espera: true });
    const cambiado = revisar([campana({ conjunto: { ...caro, actualizada: "2026-11-04T10:00:00-0500" } })], opciones).campanas[0].conjuntos[0].veredicto;
    expect(cambiado.id).toBe("espera");
    expect(cambiado.motivo).toMatch(/hace 2 días.*hasta el 9 de noviembre/);
    const conNuevo = revisar([campana({ conjunto: caro, anuncios: [{ nombre: "Nuevo", creada: "2026-11-05T09:00:00-0500", i: tres(fila({ gasto: 5, conv: 1 })) }] })], opciones);
    expect(conNuevo.campanas[0].conjuntos[0].veredicto.motivo).toMatch(/Se le sumó el anuncio «Nuevo» ayer/);
    expect(conNuevo.campanas[0].anuncios[0].veredicto.id).toBe("espera");
    // Lo cambiado desde la aplicación (el historial) también cuenta; pasados 5 días, ya no.
    expect(revisar([campana({ conjunto: caro })], { ...opciones, cambios: { 901: "2026-11-03" } }).campanas[0].conjuntos[0].veredicto.id).toBe("espera");
    expect(revisar([campana({ conjunto: caro })], { ...opciones, cambios: { 901: "2026-10-30" } }).campanas[0].conjuntos[0].veredicto.id).toBe("apagar");
    // Los días de espera son del Manual.
    expect(revisar([campana({ conjunto: { ...caro, actualizada: "2026-11-04" } })], { ...opciones, umbrales: { diasCambio: 2 } }).campanas[0].conjuntos[0].veredicto.id).toBe("apagar");
  });

  it("lo rechazado se revisa siempre, aunque su conjunto vaya bien; una campaña que no gasta, también", () => {
    const r = revisar([campana({ anuncios: [{ estado: "DISAPPROVED", i: tres(fila()) }] })], opciones);
    expect(r.campanas[0].anuncios[0].veredicto.id).toBe("revisar");
    const muerta = revisar([campana({ i: { 30: null, 14: null, 7: null } })], opciones).campanas[0];
    expect(muerta.veredicto.id).toBe("revisar");
    expect(muerta.conjuntos[0].veredicto).toMatchObject({ id: "revisar", heredado: true });
  });

  it("lo que funciona de sobra se escala un 20 % (con su botón); con el público cansado, se duplica", () => {
    const gana = revisar([campana({ conjunto: { i: tres(fila({ gasto: 30, conv: 60, freq: 1.4 })) } })], opciones).campanas[0].conjuntos[0].veredicto;
    expect(gana).toMatchObject({ id: "escalar", sugerencia: { diarioActual: 10, diarioNuevo: 12 } });
    const cansado = revisar([campana({ conjunto: { i: tres(fila({ gasto: 30, conv: 60, freq: 2.8 })) } })], opciones).campanas[0].conjuntos[0].veredicto;
    expect(cansado.id).toBe("duplicar");
  });

  it("con presupuesto de campaña, la unidad es la campaña: sus conjuntos no se tocan si va bien", () => {
    const c = campana({ presupuestoDiario: 20, i: tres(fila({ gasto: 30, conv: 60 })), conjunto: { presupuestoDiario: null, i: tres(fila({ gasto: 10, conv: 0 })) } });
    const r = revisar([c], opciones).campanas[0];
    expect(r.cbo).toBe(true);
    expect(r.veredicto.id).toBe("escalar");
    expect(r.veredicto.acciones[0].ir).toBe("adsmanager");
    expect(r.conjuntos[0].veredicto).toMatchObject({ id: "sano", desglose: true });
    // Una campaña con presupuesto Y conjuntos con el suyo (no debería pasar) se lee por conjuntos.
    expect(revisar([campana({ presupuestoDiario: 20 })], opciones).campanas[0].cbo).toBe(false);
  });

  it("la etapa sale del nombre o de lo escogido a mano, y cambia lo que se le exige", () => {
    // 1,2 $ por conversación: caro en evaluación (aguanta 1), sano en presentación (aguanta 1,3).
    const i = tres(fila({ gasto: 12, conv: 10 }));
    expect(revisar([campana({ nombre: "Café · Presentación", conjunto: { i } })], opciones).campanas[0].conjuntos[0].veredicto.id).not.toBe("mejorar");
    expect(revisar([campana({ nombre: "Café · Evaluación", conjunto: { i } })], opciones).campanas[0].conjuntos[0].veredicto.id).toBe("mejorar");
    const manual = revisar([campana({ nombre: "Sofás octubre", conjunto: { i } })], { ...opciones, etapas: { 800: "presentacion" } }).campanas[0];
    expect(manual).toMatchObject({ etapa: "presentacion", etapaDe: "manual", nombreEtapa: "Presentación" });
    // El nombre manda sobre lo escogido a mano.
    expect(revisar([campana({ nombre: "Café · Conversión" })], { ...opciones, etapas: { 800: "presentacion" } }).campanas[0]).toMatchObject({ etapa: "conversion", etapaDe: "nombre" });
  });

  it("el resumen cuenta lo que pide cambios y lo urgente va primero", () => {
    const r = revisar([
      campana({ nombre: "Buena · Evaluación" }),
      { ...campana({ nombre: "Muerta" }), id: "700", i: { 30: null, 14: null, 7: null } },
    ], opciones);
    expect(r.campanas.map((c) => c.nombre)).toEqual(["Muerta", "Buena · Evaluación"]);
    expect(r.resumen.pendientes).toBe(1);
  });
});

describe("la etapa de cada campaña", () => {
  it("por el nombre: los del curso primero, los alias después, palabras enteras", () => {
    expect(etapaDeNombre("Dcasa · Presentación · Sofá")).toBe("presentacion");
    expect(etapaDeNombre("Aire frío · Conversión")).toBe("conversion");
    expect(etapaDeNombre("Atraer octubre")).toBe("presentacion");
    expect(etapaDeNombre("Black Friday · Temporada")).toBe("temporada");
    expect(etapaDeNombre("Campaña especial madres")).toBe("temporada");
    expect(etapaDeNombre("Conversiones sofá")).toBe("");
    expect(etapaDeNombre("")).toBe("");
  });

  it("lo escogido a mano se limpia: sólo ids de Meta y etapas que existen", () => {
    expect(limpiarEtapas({ 800: "presentacion", abc: "conversion", 801: "inventada", 802: "temporada" })).toEqual({ 800: "presentacion", 802: "temporada" });
    expect(etapaDeCampana({ id: "800", nombre: "X" }, { 800: "ascension" })).toEqual({ id: "ascension", de: "manual" });
    expect(etapaDeCampana({ id: "800", nombre: "X" }, {})).toEqual({ id: "", de: "" });
    expect(ETAPAS_REVISION.map((e) => e.id)).toEqual(["presentacion", "evaluacion", "conversion", "ascension", "temporada"]);
    expect(Object.keys(EXIGENCIA_ETAPA)).toEqual(expect.arrayContaining(["presentacion", "evaluacion", "conversion", "ascension", "temporada", ""]));
  });
});

describe("el Ads Manager, la cuenta y lo grave", () => {
  it("el enlace al Ads Manager lleva esa campaña, conjunto o anuncio escogido", () => {
    expect(enlaceAdsManager("act_111", "campana", "800")).toBe("https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=111&selected_campaign_ids=800");
    expect(enlaceAdsManager("111", "conjunto", "901")).toBe("https://adsmanager.facebook.com/adsmanager/manage/adsets?act=111&selected_adset_ids=901");
    expect(enlaceAdsManager("act_111", "anuncio", "902")).toMatch(/manage\/ads\?act=111&selected_ad_ids=902$/);
    expect(enlaceAdsManager("act_<x>", "campana", "1")).toBe("");
  });

  it("la Q1 de la cuenta: lo real de todas las campañas en cada ventana frente al número mágico", () => {
    const q = q1DeCuenta({ 30: [fila({ gasto: 30, conv: 30 }), fila({ gasto: 30, conv: 10 })], 14: [fila({ gasto: 20, conv: 10 })], 7: [fila({ gasto: 20, conv: 4 })] }, { numeros: NUMEROS });
    expect(q).toMatchObject({ metrica: "Costo por conversación", objetivo: 1, equilibrio: 3, estado: "pierde" });
    expect(q.ventanas[30]).toMatchObject({ gasto: 60, conversaciones: 40, real: 1.5, estado: "caro" });
    expect(q.ventanas[14].estado).toBe("caro");
    const web = q1DeCuenta({ 30: [], 14: [], 7: [] }, { destino: "web", numeros: NUMEROS });
    expect(web).toMatchObject({ metrica: "Costo por compra", objetivo: 20, estado: "sin-gasto" });
  });

  it("lo grave: no gastó ayer, un anuncio rechazado y el doble del número mágico sin una conversación", () => {
    const campanas = [
      { id: "1", name: "A", status: "ACTIVE", effective_status: "ACTIVE", objective: O, created_time: "2026-10-01T00:00:00-0500", ayer: "0" },
      { id: "2", name: "Nueva", status: "ACTIVE", effective_status: "ACTIVE", objective: O, created_time: "2026-11-05T00:00:00-0500", ayer: "0" },
      { id: "3", name: "Pausada", status: "PAUSED", effective_status: "PAUSED", objective: O, ayer: "0" },
      { id: "4", name: "Tráfico", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_TRAFFIC", ayer: "5" },
    ];
    const g = alertasGraves({
      campanas,
      anuncios: [{ id: "9", name: "R", campaign_id: "1", effective_status: "DISAPPROVED" }, { id: "8", name: "P", campaign_id: "3", effective_status: "DISAPPROVED" }],
      semana: [{ campaign_id: "1", spend: "10", actions: [] }, { campaign_id: "4", spend: "50", actions: [] }, { campaign_id: "2", spend: "1", actions: [] }],
      numero: 2, hoy: "2026-11-06", nombre: "Dcasa",
    });
    expect(g.map((x) => x.clave)).toEqual(["sin-gasto:1", "rechazado:9", "sin-resultado:1"]);
    expect(g[0].texto).toMatch(/Dcasa/);
    // Sin número mágico no hay «el doble»; con el Manual pidiendo el triple, 10 $ no llegan a 3 × 4.
    expect(alertasGraves({ campanas, semana: [{ campaign_id: "1", spend: "10", actions: [] }], numero: 0, hoy: "2026-11-06" }).map((x) => x.tipo)).toEqual(["sin-gasto"]);
    expect(alertasGraves({ campanas, semana: [{ campaign_id: "1", spend: "10", actions: [] }], numero: 4, hoy: "2026-11-06", umbrales: { gastoParaApagar: 3 } }).map((x) => x.tipo)).toEqual(["sin-gasto"]);
    // En la web cuenta la compra, no la conversación.
    const web = alertasGraves({ campanas, semana: [{ campaign_id: "1", spend: "10", actions: [{ action_type: ACCION_MENSAJE, value: "4" }] }], numero: 2, destino: "web", hoy: "2026-11-06" });
    expect(web.map((x) => x.tipo)).toContain("sin-resultado");
  });
});

describe("lo de antes, en texto y en el informe", () => {
  const r = revisar([campana({ conjunto: { i: tres(fila({ gasto: 12, conv: 10, unicos: 100 })) }, anuncios: [{ i: tres(fila({ gasto: 3, conv: 3 })) }] })], opciones);

  it("la forma del diagnóstico de antes: «mejorar» se lee como «vigilar», lo sano cuenta como bien", () => {
    const d = comoDiagnostico(r);
    expect(d.hallazgos.map((h) => [h.nivel, h.accion])).toContainEqual(["conjunto", "vigilar"]);
    expect(d.resumen).toMatchObject({ campanas: 1, gasto: 60, resultados: 60 });
  });

  it("en texto: el número mágico, la etapa, el veredicto y la Q3; la IA sólo lo explica", () => {
    const t = textoDeRevision({ ...r, cliente: { nombre: "Café Luna" }, cuenta: { nombre: "Café Ads", moneda: "USD" }, numero: { tasaCierre: 5 },
      q1Cuenta: q1DeCuenta({ 30: [fila({ gasto: 60, conv: 60 })], 14: [], 7: [] }, { numeros: NUMEROS }) });
    expect(t).toMatch(/Revisión 3Q de las campañas de Café Luna/);
    expect(t).toMatch(/Número mágico: costo por conversación .*1,00.*objetivo/);
    expect(t).toMatch(/Evaluación/);
    expect(t).toMatch(/Q3 · Un llamado más claro a escribir/);
    expect(pedidoRevisionIA({ marca: "Café Luna", revision: { ...r, cliente: { nombre: "Café Luna" }, cuenta: { moneda: "USD" } } })).toMatch(/no inventes ninguna cifra/);
  });

  it("el informe de anuncios de la agencia: % de mensajes, CTR único y el número mágico frente al real", () => {
    expect(agenciaDelInforme(fila({ sinNuevos: true }))).toBeNull();
    const a = agenciaDelInforme(fila({ gasto: 50, conv: 20, unicos: 80, ctrU: 2.5 }), { numeros: NUMEROS });
    expect(a).toMatchObject({ pctMensajes: 25, ctrUnico: 2.5, real: 2.5, objetivo: 1, equilibrio: 3, metrica: "Costo por conversación", umbrales: { pctMensajes: 50, ctrUnico: 2 } });
  });
});

describe("los umbrales del Manual", () => {
  it("cada uno en su rango; lo de fuera, el de partida", () => {
    expect(limpiarUmbrales3q({})).toEqual(UMBRALES_3Q);
    expect(limpiarUmbrales3q({ pctMensajes: "60", ctrUnico: "2,5", frecuencia: 99, diasCambio: 0, cpm: "abc" })).toMatchObject({ pctMensajes: 60, ctrUnico: 2.5, frecuencia: UMBRALES_3Q.frecuencia, diasCambio: UMBRALES_3Q.diasCambio, cpm: UMBRALES_3Q.cpm });
    expect(CAMPOS_UMBRALES_3Q.map((c) => c.id).sort()).toEqual(Object.keys(UMBRALES_3Q).sort());
  });
});
