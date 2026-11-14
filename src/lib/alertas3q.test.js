import { describe, it, expect } from "vitest";
import {
  ritmoDeGasto, alertasDeDestino, cpmAnomalo, anunciosCansados, formatoDominante, formatoDeAnuncio, alertasDelDia,
  alertasGravesDiarias, desdeDeLaSerie, cifrasDelDia, POCOS_RESULTADOS,
} from "./alertas3q";
import { semanaAnterior, fraseDeLaSemana, semaforoDe } from "./tresQ";
import { sumarDias } from "./agenda";
import { ACCION_MENSAJE } from "./anuncios";

// Una fila DIARIA de /insights (`time_increment=1`), como la da Meta.
const fila = (fecha, { campana = "800", nombre = "Café · Presentación", gasto = 10, imp = 1000, clics = 20, conv = 2, ad = null, objetivo = "OUTCOME_ENGAGEMENT" } = {}) => ({
  date_start: fecha, date_stop: fecha, campaign_id: campana, campaign_name: nombre, objective: objetivo,
  ...(ad ? { ad_id: ad, ad_name: `Anuncio ${ad}` } : {}),
  spend: String(gasto), impressions: String(imp), clicks: String(clics), inline_link_clicks: String(clics),
  actions: [{ action_type: ACCION_MENSAJE, value: String(conv) }],
});
const HOY = "2026-11-16";
const AYER = "2026-11-15";
// Los días de `desde` a `hasta`.
const dias = (desde, hasta) => {
  const s = [];
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) s.push(d);
  return s;
};

describe("el ritmo de gasto frente al plan del mes", () => {
  const filas = (porDia) => dias("2026-11-01", AYER).map((f) => fila(f, { gasto: porDia }));

  it("en línea (±10 %): lo que tocaba a estas alturas y lo que se proyecta a fin de mes", () => {
    // 600 $ al mes → 20 al día; 15 días pasados → tocaban 300. Gastó 20 al día = 300.
    const r = ritmoDeGasto({ filas: filas(20), presupuesto: { total: 600 }, hoy: HOY });
    expect(r.semaforo.id).toBe("sana");
    expect(r.cifras).toMatchObject({ gastado: 300, ideal: 300, pasados: 15, diasMes: 30, proyeccion: 600 });
    expect(r.porque).toMatch(/tocaban/);
  });

  it("más de un 30 % adelantado es grave (mala) y dice cuánto de más a fin de mes; entre 10 y 30, a vigilar", () => {
    const mal = ritmoDeGasto({ filas: filas(30), presupuesto: { total: 600 }, hoy: HOY });
    expect(mal).toMatchObject({ grave: true, semaforo: { id: "mala", texto: "Mala" } });
    expect(mal.titulo).toMatch(/50 % por encima del plan/);
    expect(mal.porque).toMatch(/cierra en/);
    expect(mal.donde).toMatch(/Ads Manager/);
    expect(ritmoDeGasto({ filas: filas(23), presupuesto: { total: 600 }, hoy: HOY }).semaforo.id).toBe("vigilar");
    // Por debajo: a vigilar, y busca lo que no entrega.
    const bajo = ritmoDeGasto({ filas: filas(10), presupuesto: { total: 600 }, hoy: HOY });
    expect(bajo.semaforo.id).toBe("vigilar");
    expect(bajo.titulo).toMatch(/por debajo/);
  });

  it("lo de otro mes y lo de hoy no cuentan; sin presupuesto dice dónde completarlo; el día 1 no dice nada", () => {
    const conViejo = [fila("2026-10-31", { gasto: 500 }), fila(HOY, { gasto: 500 }), ...filas(20)];
    expect(ritmoDeGasto({ filas: conViejo, presupuesto: { total: 600 }, hoy: HOY }).cifras.gastado).toBe(300);
    const sin = ritmoDeGasto({ filas: filas(20), presupuesto: null, hoy: HOY });
    expect(sin.semaforo.id).toBe("sin-datos");
    expect(sin.donde).toMatch(/Números del negocio/);
    expect(ritmoDeGasto({ filas: [], presupuesto: { total: 600 }, hoy: "2026-11-01" })).toBeNull();
  });
});

describe("el anuncio funciona y el destino no", () => {
  const antes = dias("2026-11-02", "2026-11-12");
  const ultimos = dias("2026-11-13", AYER);

  it("clics y CERO conversaciones tres días (y antes sí llegaban): el destino está roto, con el dinero gastado", () => {
    const filas = [...antes.map((f) => fila(f, { conv: 3 })), ...ultimos.map((f) => fila(f, { conv: 0, gasto: 12 }))];
    const [a] = alertasDeDestino({ filas, hoy: HOY });
    expect(a).toMatchObject({ tipo: "destino-roto", grave: true, semaforo: { id: "mala" }, campanaId: "800", cifras: { clics: 60, resultados: 0, gasto: 36 } });
    expect(a.porque).toMatch(/se gastaron 36/);
    expect(a.pasos[0]).toMatch(/WhatsApp/);
    // Un día con muy pocos clics no dice nada.
    const pocos = [...antes.map((f) => fila(f, { conv: 3 })), ...ultimos.map((f, i) => fila(f, { conv: 0, clics: i === 0 ? 2 : 20 }))];
    expect(alertasDeDestino({ filas: pocos, hoy: HOY })).toEqual([]);
    // Una campaña de alcance no busca conversaciones.
    const alcance = filas.map((f) => ({ ...f, objective: "OUTCOME_AWARENESS" }));
    expect(alertasDeDestino({ filas: alcance, hoy: HOY })).toEqual([]);
  });

  it("las conversaciones por clic caen más de un 20 % tres días seguidos con el CTR igual: el problema está en el destino", () => {
    // Antes: 20 clics y 4 conversaciones (20 %); ahora, 20 clics y 2 (10 %), el mismo CTR.
    const filas = [...antes.map((f) => fila(f, { conv: 4 })), ...ultimos.map((f) => fila(f, { conv: 2 }))];
    const [a] = alertasDeDestino({ filas, hoy: HOY });
    expect(a).toMatchObject({ tipo: "destino-cae", grave: false, semaforo: { id: "vigilar" } });
    expect(a.porque).toMatch(/de cada 100 clics llegan 10 conversaciones y antes 20/);
    expect(a.pasos.at(-1)).toMatch(/No cambies el anuncio/);
    // Si el CTR también cayó, es el anuncio (eso lo dice la revisión), no el destino.
    const ctrCae = [...antes.map((f) => fila(f, { conv: 4 })), ...ultimos.map((f) => fila(f, { conv: 1, clics: 10 }))];
    expect(alertasDeDestino({ filas: ctrCae, hoy: HOY }).filter((x) => x.tipo === "destino-cae")).toEqual([]);
    // Un solo día malo no basta.
    const unDia = [...antes.map((f) => fila(f, { conv: 4 })), ...ultimos.map((f, i) => fila(f, { conv: i === 2 ? 1 : 4 }))];
    expect(alertasDeDestino({ filas: unDia, hoy: HOY })).toEqual([]);
  });
});

describe("el CPM fuera de lo normal", () => {
  const base = dias("2026-11-06", "2026-11-13");
  const dosDias = ["2026-11-14", AYER];

  it("toda la cuenta (y sus campañas) dos días un 25 % más caro: es de fuera", () => {
    const filas = ["800", "700"].flatMap((c) => [...base.map((f) => fila(f, { campana: c, gasto: 10 })), ...dosDias.map((f) => fila(f, { campana: c, gasto: 15 }))]);
    const r = cpmAnomalo({ filas, hoy: HOY });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ nivel: "cuenta", tipo: "cpm", semaforo: { id: "vigilar" } });
    expect(r[0].porque).toMatch(/algo de fuera/);
  });

  it("una campaña sola: es algo suyo; un solo día no cuenta", () => {
    const filas = [
      ...[...base, ...dosDias].map((f) => fila(f, { campana: "700", nombre: "Sofás", gasto: 10 })),
      ...base.map((f) => fila(f, { campana: "800", gasto: 10 })), ...dosDias.map((f) => fila(f, { campana: "800", gasto: 16 })),
      ...[...base, ...dosDias].map((f) => fila(f, { campana: "600", nombre: "Mesas", gasto: 10 })),
    ];
    const r = cpmAnomalo({ filas, hoy: HOY });
    expect(r.map((x) => x.campanaId)).toEqual(["800"]);
    expect(r[0].porque).toMatch(/algo suyo/);
    const unDia = [...base.map((f) => fila(f, { gasto: 10 })), fila("2026-11-14", { gasto: 10 }), fila(AYER, { gasto: 20 })];
    expect(cpmAnomalo({ filas: unDia, hoy: HOY })).toEqual([]);
  });
});

describe("el anuncio que se cansa día a día", () => {
  // Del 2 al 15: tres primeros días con un CTR del 3 %; los últimos 7, del 1,5 %.
  const serie = (ultimo = 6) => dias("2026-11-02", AYER).map((f, i) => fila(f, { ad: "9021", imp: i < 3 ? 1000 : 400, clics: i < 3 ? 30 : f >= "2026-11-09" ? ultimo : 12 }));

  it("CTR sostenido un 25 % o más por debajo del de sus primeros días, con 1.000 impresiones o más", () => {
    const [a] = anunciosCansados({ filas: serie(), hoy: HOY, nombres: new Map([["9021", { nombre: "Foto", conjunto: "Abierto" }]]) });
    expect(a).toMatchObject({ tipo: "cansado", anuncioId: "9021", anuncio: "Foto", semaforo: { id: "vigilar" }, cifras: { ctrBase: 3, ctr: 1.5 } });
    expect(a.pasos[1]).toMatch(/DENTRO del mismo conjunto \(«Abierto»\)/);
  });

  it("no repite lo que ya dice «Renovar la pieza», no cuenta poca entrega ni una caída pequeña", () => {
    expect(anunciosCansados({ filas: serie(), hoy: HOY, yaDichos: new Set(["9021"]) })).toEqual([]);
    expect(anunciosCansados({ filas: serie(11), hoy: HOY })).toEqual([]); // 2,75 %: un 8 % menos
    const poca = serie().map((f) => (f.date_start >= "2026-11-09" ? { ...f, impressions: "100", clicks: "1" } : f));
    expect(anunciosCansados({ filas: poca, hoy: HOY })).toEqual([]);
  });
});

describe("un formato que se lleva casi todo el gasto", () => {
  const anuncio = (gasto, extra = {}) => ({ ventanas: { 30: { gasto, reproducciones3s: 0, ...extra } } });

  it("el formato sale de la publicación que usa o de sus reproducciones", () => {
    expect(formatoDeAnuncio({ publicacion: { post: { formato: "carrusel" } } })).toBe("carrusel");
    expect(formatoDeAnuncio({ publicacion: { post: { formato: "reel" } } })).toBe("video");
    expect(formatoDeAnuncio(anuncio(10, { reproducciones3s: 300 }))).toBe("video");
    expect(formatoDeAnuncio(anuncio(10))).toBe("imagen");
  });

  it("más del 80 % en un formato, con 3 anuncios o más", () => {
    const campanas = [{ anuncios: [anuncio(90, { reproducciones3s: 50 }), anuncio(85, { reproducciones3s: 9 }), anuncio(10)] }];
    const r = formatoDominante({ campanas });
    expect(r).toMatchObject({ tipo: "formato", cifras: { formato: "video" } });
    expect(r.titulo).toMatch(/94,6 % del gasto va a anuncios de video/);
    expect(formatoDominante({ campanas: [{ anuncios: [anuncio(50, { reproducciones3s: 1 }), anuncio(50)] }] })).toBeNull();
  });
});

describe("todo junto y lo grave del cron", () => {
  it("las alertas del día van en orden (lo malo primero); lo que Meta no dio no da alertas", () => {
    const filas = [...dias("2026-11-01", "2026-11-12").map((f) => fila(f, { conv: 3, gasto: 30 })), ...dias("2026-11-13", AYER).map((f) => fila(f, { conv: 0, gasto: 30 }))];
    const r = alertasDelDia({ campanasDia: filas, anunciosDia: null, revision: { campanas: [] }, presupuesto: { total: 600 }, hoy: HOY });
    expect(r.map((a) => a.tipo)).toEqual(["ritmo", "destino-roto"]);
    expect(r.every((a) => a.semaforo.texto && a.porque && a.pasos.length)).toBe(true);
    expect(alertasDelDia({ campanasDia: null, anunciosDia: null, revision: null, hoy: HOY })).toEqual([]);
  });

  it("al cron sólo van el destino roto y el gasto muy adelantado, con su clave", () => {
    const filas = [...dias("2026-11-01", "2026-11-12").map((f) => fila(f, { conv: 3, gasto: 30 })), ...dias("2026-11-13", AYER).map((f) => fila(f, { conv: 0, gasto: 30 }))];
    const g = alertasGravesDiarias({ filas, presupuesto: { total: 600 }, hoy: HOY, nombre: "Café Luna" });
    expect(g.map((x) => x.clave)).toEqual(["destino-roto:800", "ritmo:2026-11"]);
    expect(g[0].texto).toMatch(/^«Café · Presentación» de Café Luna: 60 clics y ninguna conversación en 3 días/);
    expect(g[1].texto).toMatch(/por encima del plan del mes/);
    expect(alertasGravesDiarias({ filas: null })).toEqual([]);
  });

  it("la serie se lee desde el 1 del mes o 14 días atrás, lo que sea antes", () => {
    expect(desdeDeLaSerie("2026-11-20")).toBe("2026-11-01");
    expect(desdeDeLaSerie("2026-11-06")).toBe("2026-10-23");
    expect(desdeDeLaSerie("2026-11-20", 4)).toBe("2026-11-01");
    expect(cifrasDelDia(fila("2026-11-02", { gasto: 5, imp: 1000, clics: 10, conv: 1 }))).toMatchObject({ fecha: "2026-11-02", cpm: 5, ctr: 1, resultados: 1 });
  });
});

describe("la semana anterior y los pocos datos (revisión 3Q)", () => {
  it("los 7 días anteriores salen de 14 menos 7, y la frase dice sólo lo que se movió", () => {
    const c14 = { gasto: 100, impresiones: 20000, clics: 400, resultados: 50 };
    const c7 = { gasto: 60, impresiones: 10000, clics: 180, resultados: 20, costoPorResultado: 3 };
    const ant = semanaAnterior(c14, c7);
    expect(ant).toMatchObject({ gasto: 40, impresiones: 10000, clics: 220, resultados: 30, costoPorResultado: 1.33, ctr: 2.2 });
    expect(fraseDeLaSemana(c7, ant)).toMatch(/costo por resultado subió un 126 % \(de/);
    expect(fraseDeLaSemana({ ...c7, costoPorResultado: 1.4, resultados: 31, gasto: 41 }, ant)).toBe("Frente a los 7 días anteriores, va parecido.");
    expect(semanaAnterior(null, c7)).toBeNull();
  });

  it("con menos de 50 resultados, lo que pide un cambio fuerte se dice como pista", () => {
    const x = { nombre: "Abierto", veredicto: { id: "apagar", motivo: "Pierde dinero." }, ventanas: { 30: { resultados: 12 } } };
    expect(semaforoDe(x, "conjunto").ojo).toMatch(/pocos datos para concluir \(12 resultados en 30 días/);
    expect(semaforoDe({ ...x, ventanas: { 30: { resultados: POCOS_RESULTADOS } } }, "conjunto").ojo).toBeUndefined();
    expect(semaforoDe({ ...x, veredicto: { id: "sano", motivo: "Bien." } }, "conjunto").ojo).toBeUndefined();
  });
});
