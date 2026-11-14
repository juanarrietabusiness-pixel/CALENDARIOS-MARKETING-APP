import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { lecturaDeInsights } from "../../worker/lib/negocio.js";
import { ACCION_MENSAJE } from "../../src/lib/anuncios.js";

// ============================================================
// Los números del negocio contra una D1 de verdad, una Meta y una IA de mentira
//
// Lo que importa:
//   1. Se guarda limpio, con quién y cuándo, sin pisar las columnas del informe de anuncios (la misma fila), y no se
//      pisa lo que otra persona guardó entremedias (409).
//   2. Un colaborador sólo ve los suyos; uno de sólo lectura lee pero no escribe; otra agencia no existe.
//   3. Lo de Meta es UNA llamada de sólo lectura a los 30 días de la cuenta (dos si Meta rechaza un campo), y sin
//      cuenta, sin permisos o sin Meta la ficha se abre igual y dice por qué.
//   4. La IA PROPONE, no guarda, y todo lo suyo vuelve «estimado»; con todo confirmado, ni se la llama.
//   5. El diagnóstico usa el número mágico guardado si nadie teclea otro, y el estratega toma de ahí el margen y la
//      tasa de cierre.
//
// Ninguna petición sale a Internet: el `fetch` falso revienta con cualquier host que no sea Meta o Anthropic.
// ============================================================

const JEFE = "u-jefe";
const EDITOR = "u-editor";
const COLAB = "u-colab";
const LECTOR = "u-lector";
const OTRA = "u-otra";
const TESTIGO = { [JEFE]: "t-jefe", [EDITOR]: "t-editor", [COLAB]: "t-colab", [LECTOR]: "t-lector", [OTRA]: "t-otra" };

let db;
let env;
let llamadas;
let peticionesIA;
let respuestasIA;
let insights;
let eventos;

const respuesta = (datos, estado = 200) => new Response(JSON.stringify(datos), { status: estado, headers: { "content-type": "application/json" } });
const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 1500 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 300 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

/** La fila de /insights de la cuenta en 30 días, como la documenta Meta. */
const FILA_30 = {
  spend: "420.50", impressions: "100000", reach: "50000", frequency: "2", cpm: "4.205",
  unique_inline_link_clicks: "2000", unique_inline_link_click_ctr: "4", cost_per_unique_inline_link_click: "0.21",
  outbound_clicks: [{ action_type: "outbound_click", value: "1800" }], outbound_clicks_ctr: [{ action_type: "outbound_click", value: "1.8" }],
  actions: [
    { action_type: ACCION_MENSAJE, value: "700" }, { action_type: "landing_page_view", value: "900" },
    { action_type: "omni_purchase", value: "18" }, { action_type: "purchase", value: "18" },
  ],
  action_values: [{ action_type: "omni_purchase", value: "1620" }, { action_type: "purchase", value: "1620" }],
  date_start: "2026-10-07", date_stop: "2026-11-05",
};

async function falso(entrada, init = {}) {
  const u = new URL(String(entrada));
  if (u.hostname === "api.anthropic.com") {
    if (u.pathname.startsWith("/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    const cuerpo = JSON.parse(init.body);
    peticionesIA.push(cuerpo);
    const r = respuestasIA.length > 1 ? respuestasIA.shift() : respuestasIA[0];
    return typeof r === "function" ? r(cuerpo) : r;
  }
  if (u.hostname !== "graph.facebook.com") throw new Error(`Petición a Internet en un test: ${u.href}`);
  const ruta = u.pathname.replace(/^\/v[\d.]+/, "");
  llamadas.push({ ruta, params: Object.fromEntries(u.searchParams) });
  // La revisión 3Q (el diagnóstico) lee la cuenta por nivel: una campaña con un conjunto que gastó 60 y dio 5 conversaciones.
  if (ruta === "/act_111/insights" && u.searchParams.get("level")) {
    const fila = { spend: "60", impressions: "6000", reach: "3000", clicks: "200", frequency: "2", actions: [{ action_type: ACCION_MENSAJE, value: "5" }] };
    const nivel = u.searchParams.get("level");
    return respuesta({ data: nivel === "campaign" ? [{ campaign_id: "800", ...fila }] : nivel === "adset" ? [{ campaign_id: "800", adset_id: "901", ...fila }] : [] });
  }
  if (ruta === "/act_111/adsets") return respuesta({ data: [{ id: "901", name: "Intereses", campaign_id: "800", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "1000" }] });
  if (ruta === "/act_111/ads") return respuesta({ data: [] });
  if (ruta === "/act_111/insights") return typeof insights === "function" ? insights(u) : respuesta({ data: insights ? [insights] : [] });
  if (ruta === "/act_111/campaigns") {
    return respuesta({ data: [{ id: "800", name: "WhatsApp octubre", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_ENGAGEMENT", account_id: "111",
      insights: { data: [{ spend: "60", impressions: "6000", reach: "3000", clicks: "200", actions: [{ action_type: ACCION_MENSAJE, value: "5" }] }] } }] });
  }
  if (ruta === "/800/adsets") {
    return respuesta({ data: [{ id: "901", name: "Intereses", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "1000",
      insights: { data: [{ spend: "60", impressions: "6000", reach: "3000", clicks: "200", frequency: "2", actions: [{ action_type: ACCION_MENSAJE, value: "5" }] }] } }] });
  }
  if (ruta === "/800/ads") return respuesta({ data: [] });
  return respuesta({ error: { message: `ruta no prevista: ${ruta}`, code: 100 } }, 400);
}

function anthropic(...lista) {
  respuestasIA = [...lista];
}

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const o = objetos.get(clave);
      const bytes = typeof o.bytes === "string" ? new TextEncoder().encode(o.bytes) : o.bytes;
      return { httpMetadata: { contentType: o.tipo }, arrayBuffer: async () => bytes, text: async () => new TextDecoder().decode(bytes) };
    },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor, op) {
      const bytes = typeof valor === "string" ? valor : new Uint8Array(await new Response(valor).arrayBuffer());
      objetos.set(clave, { bytes, tipo: op?.httpMetadata?.contentType });
    },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const negocio = (quien, cliente = "c1", resto = "", opciones) => pedir(quien, `/anuncios/clientes/${cliente}/negocio${resto}`, opciones);
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};

async function sembrar() {
  const s = db.sqlite;
  for (const id of [JEFE, EDITOR, COLAB, LECTOR, OTRA]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(EDITOR, JEFE, "editor", "Ana", "#123456");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Colab", "#654321", '["c2"]');
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura) values (?,?,?,?,?,?)").run(LECTOR, JEFE, "editor", "Lector", "#777777", 1);
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#abcdef");
  s.prepare("insert into clients (id, owner_id, name, industry) values (?,?,?,?)").run("c1", JEFE, "Dcasa", "Muebles");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
}

/** Meta conectado, con permisos de anuncios, y la cuenta act_111 asignada a c1. */
async function conMeta({ permisos = ["pages_show_list", "ads_read", "ads_management"] } = {}) {
  const s = db.sqlite;
  s.prepare("insert into integracion_meta (id, owner_id, nombre, token_cifrado, origen, permisos) values (?,?,?,?,?,?)")
    .run(JEFE, JEFE, "Juan", await cifrarMeta(env, "token-persona"), "https://calendarios.test", JSON.stringify(permisos));
  s.prepare("insert into cuentas_anuncios (id, owner_id, externo_id, nombre, moneda, client_id) values (?,?,?,?,?,?)")
    .run(`${JEFE}:act_111`, JEFE, "act_111", "Dcasa Ads", "USD", "c1");
}

const NUMEROS = {
  tipo: "productos", destino: "whatsapp", cuenta: "historial",
  ticket: { valor: 20, origen: "cliente" }, invertir: { valor: 16, origen: "agencia" }, metaVentas: { valor: 1000, origen: "agencia" },
  tasaCierre: { valor: 9, origen: "cliente" }, itbms: { valor: 0, origen: "cliente" },
  costos: [{ nombre: "Producto", pct: 40, origen: "cliente" }],
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T15:00:00.000Z"));
  db = d1EnMemoria();
  eventos = [];
  env = {
    DB: db, MEDIA: r2(), META_APP_ID: "app", META_APP_SECRET: "secreto-meta", ANTHROPIC_API_KEY: "k",
    ASSETS: { fetch: async () => new Response("") },
    HUB: { idFromName: (x) => x, get: () => ({ fetch: (req) => { eventos.push(req); return Promise.resolve(new Response("")); } }) },
  };
  llamadas = [];
  peticionesIA = [];
  respuestasIA = [];
  insights = FILA_30;
  vi.stubGlobal("fetch", vi.fn(falso));
  await sembrar();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); olvidarModelos(); });

describe("leer y guardar", () => {
  it("sin nada guardado ni cuenta: los números vacíos, la tasa del Manual y por qué no hay cifras de Meta", async () => {
    const r = await negocio(JEFE);
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d).toMatchObject({ negocio: { v: 1, costos: [] }, tasaDefecto: 5, cuenta: null, lectura: null, medida: null });
    expect(d.avisoMeta).toMatch(/Sin cuenta publicitaria/);
    expect(llamadas).toEqual([]);
  });

  it("la tasa por defecto es la del Manual de campañas si se cambió", async () => {
    await pedir(JEFE, "/anuncios/manual", { method: "PUT", body: { tasaCierre: 8 } });
    expect((await (await negocio(JEFE)).json()).tasaDefecto).toBe(8);
  });

  it("se guarda limpio con quién y cuándo, avisa al espacio y no pisa el informe de anuncios", async () => {
    await pedir(JEFE, "/anuncios/clientes/c1/ajustes-informe", { method: "PUT", body: { automatico: true, mostrarCosto: false } });
    const r = await negocio(EDITOR, "c1", "", { method: "PUT", body: { negocio: { ...NUMEROS, modo: "raro", ticket: { valor: "20,5", origen: "cliente" }, inventado: 3 } } });
    expect(r.status).toBe(200);
    const { negocio: guardado } = await r.json();
    expect(guardado).toMatchObject({ tipo: "productos", destino: "whatsapp", modo: "", ticket: { valor: 20.5, origen: "cliente" }, por: "Ana", actualizado: "2026-11-06T15:00:00.000Z" });
    expect(guardado.inventado).toBeUndefined();
    const fila = db.sqlite.prepare("select * from anuncios_clientes where client_id = ?").get("c1");
    expect(fila.informe_automatico).toBe(1);
    expect(fila.mostrar_costo).toBe(0);
    expect(JSON.parse(fila.negocio).ticket).toEqual({ valor: 20.5, origen: "cliente" });
    // Y al revés: guardar los ajustes del informe no se lleva los números.
    await pedir(JEFE, "/anuncios/clientes/c1/ajustes-informe", { method: "PUT", body: { automatico: false } });
    expect((await (await negocio(JEFE)).json()).negocio.ticket).toEqual({ valor: 20.5, origen: "cliente" });
    // El aviso de tiempo real: el evento de anuncios de siempre (App.jsx lo atiende con el pulso).
    expect(eventos.length).toBeGreaterThan(0);
    expect(await eventos[0].json()).toMatchObject({ tipo: "anuncios", clientId: "c1" });
  });

  it("sin fila previa también crea la suya", async () => {
    const r = await negocio(JEFE, "c2", "", { method: "PUT", body: { negocio: { ticket: 12 } } });
    expect(r.status).toBe(200);
    expect(db.sqlite.prepare("select count(*) as n from anuncios_clientes where client_id = 'c2'").get().n).toBe(1);
  });

  it("si otra persona guardó desde que se leyó, 409 con lo de ahora y no se pisa", async () => {
    const primero = await (await negocio(JEFE, "c1", "", { method: "PUT", body: { negocio: NUMEROS, antes: null } })).json();
    vi.setSystemTime(new Date("2026-11-06T15:05:00.000Z"));
    const r = await negocio(EDITOR, "c1", "", { method: "PUT", body: { negocio: { ticket: 99 }, antes: null } });
    expect(r.status).toBe(409);
    const d = await r.json();
    expect(d.error).toMatch(/Juan cambió los números/);
    expect(d.negocio.ticket.valor).toBe(20);
    // Con lo que se leyó, sí.
    const ok = await negocio(EDITOR, "c1", "", { method: "PUT", body: { negocio: { ...NUMEROS, ticket: 25 }, antes: primero.negocio.actualizado } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).negocio.ticket).toEqual({ valor: 25, origen: "agencia" });
  });

  it("un PUT sin números es 400", async () => {
    expect((await negocio(JEFE, "c1", "", { method: "PUT", body: {} })).status).toBe(400);
  });
});

describe("quién puede", () => {
  it("un colaborador sólo ve los de sus clientes: los demás no existen", async () => {
    expect((await negocio(COLAB, "c1")).status).toBe(404);
    expect((await negocio(COLAB, "c1", "", { method: "PUT", body: { negocio: { ticket: 5 } } })).status).toBe(404);
    expect((await negocio(COLAB, "c2")).status).toBe(200);
    expect((await negocio(COLAB, "c2", "", { method: "PUT", body: { negocio: { ticket: 5 } } })).status).toBe(200);
  });

  it("un cliente de otra agencia no existe", async () => {
    expect((await negocio(JEFE, "c9")).status).toBe(404);
    expect((await negocio(OTRA, "c1")).status).toBe(404);
  });

  it("sólo lectura: lee, pero ni guarda ni pide a la IA", async () => {
    expect((await negocio(LECTOR, "c1")).status).toBe(200);
    expect((await negocio(LECTOR, "c1", "", { method: "PUT", body: { negocio: { ticket: 5 } } })).status).toBe(403);
    expect((await negocio(LECTOR, "c1", "/proponer", { method: "POST", body: {} })).status).toBe(403);
    expect(peticionesIA).toEqual([]);
  });

  it("una acción que no existe es 404", async () => {
    expect((await negocio(JEFE, "c1", "/otra", { method: "POST", body: {} })).status).toBe(404);
  });
});

describe("lo que sabe Meta (30 días, sólo lectura)", () => {
  it("una llamada a los insights de la cuenta, y cada métrica en su unidad", async () => {
    await conMeta();
    const d = await (await negocio(JEFE)).json();
    // La cuenta entera y, aparte, por campaña (el costo por conversación sólo de las de mensajes).
    expect(llamadas).toHaveLength(2);
    expect(llamadas[1].params).toMatchObject({ level: "campaign", fields: "campaign_id,objective,spend,actions" });
    expect(llamadas[0].ruta).toBe("/act_111/insights");
    expect(llamadas[0].params).toMatchObject({ date_preset: "last_30d", access_token: "token-persona" });
    expect(llamadas[0].params.fields).toContain("unique_inline_link_clicks");
    expect(d.cuenta).toEqual({ nombre: "Dcasa Ads", moneda: "USD" });
    expect(d.avisoMeta).toBe(null);
    expect(d.lectura).toMatchObject({
      gasto: 420.5, cpm: 4.205, frecuencia: 2, clicsUnicos: 2000, ctrUnico: 4, conversaciones: 700,
      clicsSalientes: 1800, ctrSaliente: 1.8, visitas: 900, compras: 18, valorCompras: 1620,
    });
    // % de mensajes = conversaciones ÷ clics únicos; % de visitas = visitas ÷ clics salientes; % de compras = ÷ visitas.
    expect(d.lectura.pctMensajes).toBe(35);
    expect(d.lectura.pctVisitas).toBe(50);
    expect(d.lectura.pctCompras).toBe(2);
    expect(d.lectura.costoConversacion).toBeCloseTo(0.6007, 4);
    expect(d.lectura.roas).toBeCloseTo(3.8526, 4);
  });

  it("con ?meta=0 no le pregunta a Meta", async () => {
    await conMeta();
    const d = await (await negocio(JEFE, "c1", "?meta=0")).json();
    expect(llamadas).toEqual([]);
    expect(d.lectura).toBe(null);
  });

  it("si Meta rechaza un campo (#100), otra llamada con los de siempre", async () => {
    await conMeta();
    insights = (u) => (u.searchParams.get("fields").includes("unique_inline_link_clicks")
      ? respuesta({ error: { message: "(#100) unknown field", code: 100 } }, 400)
      : respuesta({ data: [{ spend: "100", impressions: "20000", reach: "10000", cpm: "5", actions: [{ action_type: ACCION_MENSAJE, value: "50" }] }] }));
    const d = await (await negocio(JEFE)).json();
    expect(llamadas).toHaveLength(3);
    expect(d.lectura).toMatchObject({ gasto: 100, conversaciones: 50, costoConversacion: 2, frecuencia: 2 });
  });

  it("sin permisos de anuncios, o sin gasto, la ficha se abre igual y dice por qué", async () => {
    await conMeta({ permisos: ["pages_show_list"] });
    let d = await (await negocio(JEFE)).json();
    expect(d.lectura).toBe(null);
    expect(d.avisoMeta).toMatch(/permisos de anuncios/);
    expect(llamadas).toEqual([]);
    db.sqlite.prepare("update integracion_meta set permisos = ?").run(JSON.stringify(["ads_read", "ads_management"]));
    insights = null;
    d = await (await negocio(JEFE)).json();
    expect(d.avisoMeta).toMatch(/no gastó/);
  });

  it("un error de Meta no tumba la ficha", async () => {
    await conMeta();
    insights = () => respuesta({ error: { message: "Invalid OAuth access token", code: 190 } }, 400);
    const r = await negocio(JEFE);
    expect(r.status).toBe(200);
    expect((await r.json()).avisoMeta).toBeTruthy();
  });

  it("lecturaDeInsights sin la fila da null y sin clics no divide por cero", () => {
    expect(lecturaDeInsights(null)).toBe(null);
    expect(lecturaDeInsights({ spend: "10" })).toMatchObject({ gasto: 10, pctMensajes: null, costoConversacion: null, roas: null });
  });
});

describe("la IA propone lo que falta, sin guardar", () => {
  const CATALOGO = [
    { id: "p-sofa", nombre: "Sofá cama", precio: "$450", activo: true },
    { id: "p-mesa", nombre: "Mesa", precio: "Desde $150", activo: true },
  ];
  beforeEach(() => {
    db.sqlite.prepare("insert into mercado_clientes (id, owner_id, client_id, catalogo) values (?,?,?,?)").run("m1", JEFE, "c1", JSON.stringify(CATALOGO));
  });

  it("lee el catálogo y el cerebro (también lo interno), y lo que vuelve es «estimado»", async () => {
    await pedir(JEFE, "/cerebro/c1/nota", { method: "PUT", body: { titulo: "Costos", texto: "El costo del producto es el 45 % del precio y Tafi cobra el 3,5 %.", tipo: "documento", interna: true } });
    anthropic(flujo(JSON.stringify({
      ticket: { valor: 280, explicacion: "Entre la mesa y el sofá; la mayoría compra uno" },
      costos: [{ nombre: "Producto", pct: 45, explicacion: "La nota de costos" }, { nombre: "Tafi", pct: 3.5, explicacion: "La nota de costos" }],
      devoluciones: { valor: 1, explicacion: "Muebles: casi no se devuelven" },
      invertir: { valor: 20, explicacion: "Deja unos 25 puntos de ganancia" },
    })));
    const r = await negocio(JEFE, "c1", "/proponer", { method: "POST", body: { negocio: { tipo: "productos", destino: "whatsapp" } } });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.datos.ticket).toEqual({ valor: 280, origen: "estimado", nota: "Entre la mesa y el sofá; la mayoría compra uno" });
    expect(d.datos.invertir.origen).toBe("estimado");
    expect(d.costos.map((c) => [c.nombre, c.pct, c.origen])).toEqual([["Producto", 45, "estimado"], ["Tafi", 3.5, "estimado"]]);
    expect(d.ticketCatalogo).toEqual({ valor: 300, precios: 2 });
    const t = textoDe(peticionesIA[0]);
    expect(t).toContain("Sofá cama");
    expect(t).toContain("Tafi cobra el 3,5 %");
    expect(t).toContain("«estimado»");
    // No guardó nada.
    expect((await (await negocio(JEFE)).json()).negocio.ticket).toBeUndefined();
    expect(db.sqlite.prepare("select count(*) as n from consumo_ia where funcion = ?").get("números del negocio").n).toBe(1);
  });

  it("si la IA no da el ticket, el promedio del catálogo (también estimado)", async () => {
    anthropic(flujo(JSON.stringify({ costos: [] })));
    const d = await (await negocio(JEFE, "c1", "/proponer", { method: "POST", body: {} })).json();
    expect(d.datos.ticket).toEqual({ valor: 300, origen: "estimado", nota: "El promedio de los 2 precios del catálogo." });
  });

  it("con todo confirmado, ni se llama a la IA", async () => {
    const d = await (await negocio(JEFE, "c1", "/proponer", { method: "POST", body: { negocio: { ...NUMEROS, devoluciones: { valor: 0, origen: "cliente" } } } })).json();
    expect(peticionesIA).toEqual([]);
    expect(d.datos).toEqual({});
    expect(d.avisos[0]).toMatch(/Ya está todo/);
  });

  it("una respuesta que no se puede leer es un error con motivo", async () => {
    anthropic(flujo("no tengo idea"));
    const r = await negocio(JEFE, "c1", "/proponer", { method: "POST", body: {} });
    expect(r.status).toBe(502);
    expect((await r.json()).error).toMatch(/propuesta/);
  });
});

describe("lo leen el diagnóstico y el estratega", () => {
  it("el diagnóstico compara con el número mágico guardado si nadie teclea otro", async () => {
    await conMeta();
    // Sin números: cada campaña se compara con su promedio de 30 días (60 ÷ 5 = 12): nada que apagar.
    let d = await (await pedir(JEFE, "/anuncios/clientes/c1/diagnostico", { method: "POST", body: {} })).json();
    // Sin números NO se compara con el promedio del mes (decisión del 14-nov): no se pausa nada por costo.
    expect(d.origenCosto).toBe("sin-numero");
    expect(d.hallazgos.filter((h) => h.accion === "apagar")).toEqual([]);
    // Con números: 20 × 16 % × 9 % = 0,288 por conversación; 12 es más de 1,5 veces eso → apagar.
    await negocio(JEFE, "c1", "", { method: "PUT", body: { negocio: NUMEROS } });
    d = await (await pedir(JEFE, "/anuncios/clientes/c1/diagnostico", { method: "POST", body: {} })).json();
    expect(d.origenCosto).toBe("numero-magico");
    expect(d.costoMax).toBe(0.29);
    expect(d.hallazgos.map((h) => [h.nivel, h.accion])).toContainEqual(["conjunto", "apagar"]);
    // Lo tecleado manda.
    d = await (await pedir(JEFE, "/anuncios/clientes/c1/diagnostico", { method: "POST", body: { costoMax: 30 } })).json();
    expect(d).toMatchObject({ origenCosto: "escrito", costoMax: 30 });
  });

  it("el estratega toma el margen efectivo y la tasa de cierre de los números del cliente", async () => {
    db.sqlite.prepare("insert into mercado_clientes (id, owner_id, client_id, catalogo) values (?,?,?,?)")
      .run("m1", JEFE, "c1", JSON.stringify([{ id: "p-lavado", nombre: "Lavado", precio: "$45", activo: true }]));
    await negocio(JEFE, "c1", "", { method: "PUT", body: { negocio: NUMEROS } });
    // Una función: cada llamada lleva su propia respuesta (un cuerpo se lee una vez).
    anthropic(() => flujo(JSON.stringify({
      resumen: "x", embudo: [], costos: { esperado: 1 }, presupuesto: { diario: 10, dias: 30 }, ofertas: [], maletas: {},
      campana: { objetivo: "OUTCOME_SALES", destino: "whatsapp", conjuntos: [{ tipo: "abierto", presupuestoDiario: 10 }], anuncios: [{ formato: "unico", texto: "Hola" }] },
      pasos: [], riesgos: [],
    })));
    const r = await pedir(JEFE, "/anuncios/estratega", { method: "POST", body: { clientId: "c1", productoId: "p-lavado" } });
    expect(r.status).toBe(200);
    const d = await r.json();
    // Con los números del negocio, EL número mágico del cliente (el mismo de la ficha y la revisión, con su ticket de
    // 20): el límite es el equilibrio, 20 × 60 % × 9 % = 1,08, y el objetivo, 20 × 16 % × 9 % = 0,29.
    expect(d.eco).toMatchObject({ precio: 45, ganancia: 27, tasaCierre: 9, costoMaxResultado: 1.08, costoObjetivo: 0.29 });
    expect(d.eco.de).toMatch(/números del negocio/);
    expect(d.deNumeros).toBe(true);
    // Lo tecleado sigue mandando.
    const t = await (await pedir(JEFE, "/anuncios/estratega", { method: "POST", body: { clientId: "c1", productoId: "p-lavado", margen: 50, tasaCierre: 10 } })).json();
    expect(t.eco).toMatchObject({ ganancia: 22.5, tasaCierre: 10 });
    expect(t.deNumeros).toBe(false);
  });
});
