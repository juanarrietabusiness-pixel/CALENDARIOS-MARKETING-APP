import { describe, it, expect } from "vitest";
import {
  PERMISOS_ANUNCIOS, permisosAnunciosQueFaltan, OBJETIVOS, borradorVacio, validarBorrador, erroresDelPaso,
  cuerpoCampana, cuerpoConjunto, cuerpoCreativo, cuerpoAnuncio, segmentacion, ESTADO_AL_CREAR,
  aMenores, deMenores, factorMoneda, rangoInsights, modificadorInsights, resultadosDe, resumenInsights,
  serieDiaria, desfaseZona, momentoEnZona, estadoAnuncio, resumenPresupuesto, objetivoODAX, diasEntre,
} from "./anuncios";
import { PERMISOS_META } from "../../worker/lib/meta.js";

// Un borrador que pasa la validación entera.
const HOY = "2026-10-01";
const bueno = (cambios = {}) => {
  const b = borradorVacio(HOY);
  return {
    ...b,
    nombre: "Octubre · Tráfico",
    presupuesto: { tipo: "diario", monto: "10" },
    anuncio: { medio: { clave: "clientes/c1/estudio/a.png", tipo: "imagen", hash: "abc123" }, texto: "Ven a probar", titulo: "2x1", enlace: "https://cafe.pa", boton: "LEARN_MORE" },
    ...cambios,
  };
};

describe("los permisos de anuncios van aparte", () => {
  it("no están en PERMISOS_META: tienen App Review y romperían «Conectar Meta»", () => {
    for (const p of PERMISOS_ANUNCIOS) expect(PERMISOS_META).not.toContain(p);
    expect(PERMISOS_ANUNCIOS).toEqual(["ads_read", "ads_management"]);
  });

  it("dice cuáles faltan, y null si no se sabe", () => {
    expect(permisosAnunciosQueFaltan(["ads_read"])).toEqual(["ads_management"]);
    expect(permisosAnunciosQueFaltan(["ads_read", "ads_management"])).toEqual([]);
    expect(permisosAnunciosQueFaltan(null)).toBeNull();
  });
});

describe("todo se crea EN PAUSA", () => {
  it("campaña, conjunto y anuncio llevan status PAUSED, se pida lo que se pida", () => {
    const b = { ...bueno(), status: "ACTIVE", estado: "ACTIVE" };
    expect(ESTADO_AL_CREAR).toBe("PAUSED");
    expect(cuerpoCampana(b).status).toBe("PAUSED");
    expect(cuerpoConjunto(b, { campanaId: "1", hoy: HOY }).status).toBe("PAUSED");
    expect(cuerpoAnuncio(b, { conjuntoId: "2", creativoId: "3" }).status).toBe("PAUSED");
  });

  it("con todos los objetivos", () => {
    for (const objetivo of Object.keys(OBJETIVOS)) {
      const b = bueno({ objetivo, pixelId: "999" });
      expect(cuerpoCampana(b).status).toBe("PAUSED");
      expect(cuerpoConjunto(b, { campanaId: "1", hoy: HOY }).status).toBe("PAUSED");
    }
  });
});

describe("el cuerpo de la campaña", () => {
  it("lleva los obligatorios de la API: categorías (vacías), sin compartir presupuesto entre conjuntos, subasta", () => {
    const c = cuerpoCampana(bueno());
    expect(c).toMatchObject({
      name: "Octubre · Tráfico", objective: "OUTCOME_TRAFFIC", buying_type: "AUCTION",
      special_ad_categories: "[]", is_adset_budget_sharing_enabled: "false",
    });
    expect(c).not.toHaveProperty("special_ad_category_country");
    expect(c).not.toHaveProperty("daily_budget");
  });

  it("con categoría especial la declara, con su país", () => {
    const c = cuerpoCampana(bueno({ categorias: ["HOUSING"], paisCategoria: "PA" }));
    expect(JSON.parse(c.special_ad_categories)).toEqual(["HOUSING"]);
    expect(JSON.parse(c.special_ad_category_country)).toEqual(["PA"]);
  });
});

describe("el cuerpo del conjunto", () => {
  it("el presupuesto va en centavos, con puja por menor costo y facturación por impresión", () => {
    const s = cuerpoConjunto(bueno(), { campanaId: "c1", moneda: "USD", zona: "America/Panama", hoy: HOY });
    expect(s).toMatchObject({
      campaign_id: "c1", daily_budget: "1000", billing_event: "IMPRESSIONS", bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      optimization_goal: "LINK_CLICKS", destination_type: "WEBSITE",
    });
    expect(s).not.toHaveProperty("lifetime_budget");
    // Empieza hoy: no se manda la hora; empieza al activar.
    expect(s).not.toHaveProperty("start_time");
  });

  it("presupuesto total, con fechas en la zona de la cuenta", () => {
    const s = cuerpoConjunto(bueno({ presupuesto: { tipo: "total", monto: "300" }, inicio: "2026-10-05", fin: "2026-10-15" }),
      { campanaId: "c1", moneda: "USD", zona: "America/Panama", hoy: HOY });
    expect(s.lifetime_budget).toBe("30000");
    expect(s.start_time).toBe("2026-10-05T00:00:00-05:00");
    expect(s.end_time).toBe("2026-10-15T23:59:59-05:00");
  });

  it("una moneda sin decimales no se multiplica por cien", () => {
    const s = cuerpoConjunto(bueno({ presupuesto: { tipo: "diario", monto: "20000" } }), { campanaId: "c1", moneda: "COP", hoy: HOY });
    expect(s.daily_budget).toBe("20000");
  });

  it("ventas y clientes potenciales optimizan por conversiones del píxel", () => {
    const v = cuerpoConjunto(bueno({ objetivo: "OUTCOME_SALES", pixelId: "777" }), { campanaId: "c", hoy: HOY });
    expect(v.optimization_goal).toBe("OFFSITE_CONVERSIONS");
    expect(JSON.parse(v.promoted_object)).toEqual({ pixel_id: "777", custom_event_type: "PURCHASE" });
    const l = cuerpoConjunto(bueno({ objetivo: "OUTCOME_LEADS", pixelId: "777" }), { campanaId: "c", hoy: HOY });
    expect(JSON.parse(l.promoted_object).custom_event_type).toBe("LEAD");
  });

  it("reconocimiento optimiza por alcance y no lleva destino", () => {
    const s = cuerpoConjunto(bueno({ objetivo: "OUTCOME_AWARENESS" }), { campanaId: "c", hoy: HOY });
    expect(s.optimization_goal).toBe("REACH");
    expect(s).not.toHaveProperty("destination_type");
  });
});

describe("el público", () => {
  it("dice advantage_audience: 0 (obligatorio desde la v23) y respeta edad y sexo", () => {
    const t = segmentacion({ paises: ["PA"], ciudades: [], edadMin: 25, edadMax: 45, sexo: "mujeres" });
    expect(t.targeting_automation).toEqual({ advantage_audience: 0 });
    expect(t).toMatchObject({ age_min: 25, age_max: 45, genders: [2] });
    expect(t.geo_locations.countries).toEqual(["PA"]);
  });

  it("todos los sexos no manda `genders`; las ciudades van con su radio en km", () => {
    const t = segmentacion({ paises: [], ciudades: [{ key: "123", radio: 17 }], edadMin: 18, edadMax: 65, sexo: "todos" });
    expect(t).not.toHaveProperty("genders");
    expect(t.geo_locations.cities).toEqual([{ key: "123", radius: 17, distance_unit: "kilometer" }]);
  });
});

describe("el creativo", () => {
  it("imagen: link_data con el hash, el enlace y el botón; Instagram con instagram_user_id", () => {
    const c = cuerpoCreativo(bueno(), { paginaId: "P1", instagramId: "IG1" });
    const h = JSON.parse(c.object_story_spec);
    expect(h).toMatchObject({ page_id: "P1", instagram_user_id: "IG1" });
    expect(h).not.toHaveProperty("instagram_actor_id");
    expect(h.link_data).toMatchObject({
      image_hash: "abc123", link: "https://cafe.pa", message: "Ven a probar", name: "2x1",
      call_to_action: { type: "LEARN_MORE", value: { link: "https://cafe.pa" } },
    });
  });

  it("video: video_data con su miniatura", () => {
    const b = bueno();
    b.anuncio.medio = { clave: "clientes/c1/x.mp4", tipo: "video", videoId: "55", listo: true };
    const h = JSON.parse(cuerpoCreativo(b, { paginaId: "P1", miniatura: "https://scontent.fbcdn.net/t.jpg" }).object_story_spec);
    expect(h.video_data).toMatchObject({ video_id: "55", image_url: "https://scontent.fbcdn.net/t.jpg", message: "Ven a probar" });
    expect(h).not.toHaveProperty("link_data");
  });

  it("el anuncio apunta al conjunto y al creativo", () => {
    expect(cuerpoAnuncio(bueno(), { conjuntoId: "S", creativoId: "C" })).toMatchObject({ adset_id: "S", creative: '{"creative_id":"C"}' });
  });
});

describe("la validación del asistente", () => {
  const val = (b, o = {}) => validarBorrador(b, { moneda: "USD", hoy: HOY, ...o });

  it("un borrador completo pasa", () => {
    expect(val(bueno())).toEqual([]);
  });

  it("uno vacío falla en cada paso con un motivo en español", () => {
    const e = val(borradorVacio(HOY));
    expect(erroresDelPaso(e, 1).map((x) => x.campo)).toContain("nombre");
    expect(erroresDelPaso(e, 2).map((x) => x.campo)).toContain("monto");
    expect(erroresDelPaso(e, 4).map((x) => x.campo)).toEqual(expect.arrayContaining(["medio", "texto", "enlace"]));
  });

  it("ventas sin píxel no pasa del primer paso", () => {
    expect(erroresDelPaso(val(bueno({ objetivo: "OUTCOME_SALES" })), 1)[0].campo).toBe("pixelId");
  });

  it("presupuesto total sin fecha de fin, o fin antes del inicio, no", () => {
    expect(val(bueno({ presupuesto: { tipo: "total", monto: "50" } })).map((x) => x.campo)).toContain("fin");
    expect(val(bueno({ inicio: "2026-10-10", fin: "2026-10-05" })).map((x) => x.campo)).toContain("fin");
  });

  it("una fecha de inicio pasada, no", () => {
    expect(val(bueno({ inicio: "2026-09-20" })).map((x) => x.campo)).toContain("inicio");
  });

  it("por debajo del mínimo diario de la cuenta, no (también repartiendo un total)", () => {
    expect(val(bueno({ presupuesto: { tipo: "diario", monto: "0.5" } })).map((x) => x.campo)).toContain("monto");
    expect(val(bueno({ presupuesto: { tipo: "diario", monto: "3" } }), { minimoDiario: 500 }).map((x) => x.campo)).toContain("monto");
    expect(val(bueno({ presupuesto: { tipo: "total", monto: "10" }, inicio: "2026-10-01", fin: "2026-10-20" }), { minimoDiario: 100 })
      .map((x) => x.campo)).toContain("monto");
  });

  it("un país y sus ciudades a la vez, no (Meta lo rechaza)", () => {
    const b = bueno();
    b.publico = { ...b.publico, paises: ["PA"], ciudades: [{ key: "1", nombre: "David", pais: "PA", radio: 10 }] };
    expect(val(b).map((x) => x.campo)).toContain("ciudades");
  });

  it("con categoría especial: todas las edades, los dos sexos y radios de 25 km o más", () => {
    const b = bueno({ categorias: ["EMPLOYMENT"] });
    b.publico = { paises: [], ciudades: [{ key: "1", nombre: "David", pais: "PA", radio: 10 }], edadMin: 25, edadMax: 40, sexo: "mujeres" };
    const campos = erroresDelPaso(val(b), 3).map((x) => x.campo);
    expect(campos).toEqual(expect.arrayContaining(["edad", "sexo", "ciudades"]));
  });

  it("un video que Meta aún procesa no deja crear; uno listo, sí", () => {
    const b = bueno();
    b.anuncio.medio = { clave: "clientes/c1/x.mp4", tipo: "video", videoId: "55", listo: false };
    expect(val(b).map((x) => x.campo)).toContain("medio");
    b.anuncio.medio.listo = true;
    expect(val(b)).toEqual([]);
  });

  it("el enlace tiene que ser una dirección web", () => {
    const b = bueno();
    b.anuncio.enlace = "cafe.pa";
    expect(val(b).map((x) => x.campo)).toContain("enlace");
    b.anuncio.enlace = "javascript:alert(1)";
    expect(val(b).map((x) => x.campo)).toContain("enlace");
  });

  it("una categoría o un botón inventados, no", () => {
    const b = bueno({ categorias: ["CASINOS"] });
    b.anuncio.boton = "COMPRA_YA";
    expect(val(b).map((x) => x.campo)).toEqual(expect.arrayContaining(["categorias", "boton"]));
  });
});

describe("dinero", () => {
  it("unidades menores según la moneda", () => {
    expect(factorMoneda("USD")).toBe(100);
    expect(factorMoneda("CLP")).toBe(1);
    expect(aMenores("12.345", "USD")).toBe(1235);
    expect(aMenores(5000, "COP")).toBe(5000);
    expect(deMenores("1250", "USD")).toBe(12.5);
    expect(deMenores(null, "USD")).toBeNull();
  });

  it("días entre dos fechas, contando las dos", () => {
    expect(diasEntre("2026-10-01", "2026-10-10")).toBe(10);
    expect(diasEntre("", "2026-10-10")).toBe(0);
  });
});

describe("estadísticas", () => {
  it("el rango: preset para 7/30/90, time_range con dos fechas en orden, y 30 si llega algo raro", () => {
    expect(rangoInsights({ rango: 7 })).toEqual({ date_preset: "last_7d" });
    expect(rangoInsights({ rango: 90 })).toEqual({ date_preset: "last_90d" });
    expect(rangoInsights({ rango: 12 })).toEqual({ date_preset: "last_30d" });
    expect(rangoInsights({ desde: "2026-09-01", hasta: "2026-09-10" })).toEqual({ time_range: '{"since":"2026-09-01","until":"2026-09-10"}' });
    expect(rangoInsights({ desde: "2026-09-10", hasta: "2026-09-01" })).toEqual({ date_preset: "last_30d" });
    expect(modificadorInsights({ date_preset: "last_7d" })).toBe(".date_preset(last_7d)");
  });

  it("los resultados salen de la acción que corresponde al objetivo", () => {
    const fila = { reach: "900", actions: [{ action_type: "link_click", value: "40" }, { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" }] };
    expect(resultadosDe(fila, "OUTCOME_AWARENESS")).toBe(900);
    expect(resultadosDe(fila, "OUTCOME_TRAFFIC")).toBe(40);
    expect(resultadosDe(fila, "OUTCOME_SALES")).toBe(3);
    expect(resultadosDe(fila, "OUTCOME_LEADS")).toBe(0);
    // Un objetivo de antes de ODAX se lee con su equivalente.
    expect(objetivoODAX("LINK_CLICKS")).toBe("OUTCOME_TRAFFIC");
    expect(resultadosDe(fila, "LINK_CLICKS")).toBe(40);
  });

  it("el resumen: números, y costo por resultado sólo si hubo resultados", () => {
    const r = resumenInsights({ spend: "20.5", impressions: "1000", reach: "800", clicks: "50", cpm: "20.5", cpc: "0.41", ctr: "5", actions: [{ action_type: "link_click", value: "41" }] }, "OUTCOME_TRAFFIC");
    expect(r).toMatchObject({ gasto: 20.5, impresiones: 1000, alcance: 800, clics: 50, cpm: 20.5, cpc: 0.41, ctr: 5, resultados: 41 });
    expect(r.costoPorResultado).toBeCloseTo(0.5);
    expect(resumenInsights(null).gasto).toBe(0);
    expect(resumenInsights({ spend: "5" }, "OUTCOME_LEADS").costoPorResultado).toBeNull();
  });

  it("la serie diaria rellena con 0 los días en que no se gastó", () => {
    const s = serieDiaria([{ date_start: "2026-09-02", spend: "4" }], "spend", { desde: "2026-09-01", hasta: "2026-09-03" });
    expect(s).toEqual([{ fecha: "2026-09-01", valor: 0 }, { fecha: "2026-09-02", valor: 4 }, { fecha: "2026-09-03", valor: 0 }]);
    expect(serieDiaria([], "spend")).toEqual([]);
  });

  it("los estados se dicen en español", () => {
    expect(estadoAnuncio("ACTIVE").texto).toBe("Activa");
    expect(estadoAnuncio("CAMPAIGN_PAUSED").tono).toBe("pausa");
    expect(estadoAnuncio("DISAPPROVED").tono).toBe("mal");
  });
});

describe("fechas en la zona de la cuenta", () => {
  it("el desfase sale del nombre de la zona, con horario de verano donde lo hay", () => {
    expect(desfaseZona("America/Panama", "2026-10-01")).toBe("-05:00");
    expect(desfaseZona("Europe/Madrid", "2026-07-01")).toBe("+02:00");
    expect(desfaseZona("Europe/Madrid", "2026-12-01")).toBe("+01:00");
    expect(desfaseZona("", "2026-12-01")).toBe("+00:00");
    expect(momentoEnZona("2026-10-15", "America/Bogota", true)).toBe("2026-10-15T23:59:59-05:00");
  });

  it("el resumen del diálogo de activar lee la fecha tal como la escribe Meta, sin pasarla a UTC", () => {
    const t = resumenPresupuesto({ diario: 10, inicio: "2026-10-01T00:00:00-0500", fin: "2026-10-15T23:59:59-0500", moneda: "USD" });
    expect(t).toMatch(/al día/);
    expect(t).toMatch(/15 oct/);
    expect(t).not.toMatch(/16 oct/);
  });
});
