import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { revision3qPendiente, agenciaDelMes } from "../../worker/lib/revision3q.js";
import { crearEjecutor, DEFINICIONES } from "../../worker/lib/herramientasServidor.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { ACCION_MENSAJE } from "../../src/lib/anuncios.js";

// ============================================================
// La revisión 3Q contra una D1 de verdad, una Meta y una IA de mentira
//
// Lo que importa:
//   1. Sólo LEE de Meta, por nivel y no campaña a campaña: 12 llamadas (tres listas y 30, 14 y 7 días de campañas,
//      conjuntos y anuncios), con los campos nuevos y, si Meta rechaza alguno (#100), sin ellos y diciéndolo.
//   2. Abrirla la marca como revisada (quien sólo mira, no) y Mi día deja de pedirla; la etapa escogida a mano se
//      guarda sin pisar los números del negocio.
//   3. El cron: un cliente por vuelta, desde las 7:00, una vez al día; a la campana sólo lo grave y sólo lo nuevo; si
//      falla, se apunta igual (si no, lo miraría cada minuto). Tres llamadas a Meta.
//   4. El asistente y Claude (MCP) leen lo mismo, sin gastar.
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
let rechazar; // qué campos rechaza Meta con un #100
let estadoAnuncio;
let gastoAyer;
let peticionesIA;

const respuesta = (datos, estado = 200) => new Response(JSON.stringify(datos), { status: estado, headers: { "content-type": "application/json" } });
const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 1500 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 300 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

/** Una fila de /insights como la documenta Meta, con lo nuevo del curso (clics únicos, video, rankings). */
const fila = (gasto, conv, { unicos = 100, rep3s = 0, freq = "1.5", extra = {} } = {}) => ({
  spend: String(gasto), impressions: "6000", reach: "3000", frequency: freq, cpm: "6", clicks: "200",
  unique_inline_link_clicks: String(unicos), unique_inline_link_click_ctr: "3.3", cost_per_unique_inline_link_click: String(gasto / unicos),
  video_avg_time_watched_actions: [{ action_type: "video_view", value: "6.5" }],
  actions: [{ action_type: ACCION_MENSAJE, value: String(conv) }, ...(rep3s ? [{ action_type: "video_view", value: String(rep3s) }] : [])],
  ...extra,
});

/** La campaña 800 «Café · Presentación · Octubre»: un conjunto que va bien (901), uno caro (902) y sus anuncios. */
function insightsDe(nivel, preset) {
  const de7 = preset === "last_7d";
  if (nivel === "campaign") return [{ campaign_id: "800", ...(de7 ? fila(40, 25) : fila(150, 100)) }, { campaign_id: "700", ...fila(20, 10) }];
  if (nivel === "adset") {
    return [
      { campaign_id: "800", adset_id: "901", ...(de7 ? fila(20, 25) : fila(80, 90)) },
      { campaign_id: "800", adset_id: "902", ...(de7 ? fila(20, 2, { unicos: 60, rep3s: 600 }) : fila(70, 10)) },
    ];
  }
  return [
    { campaign_id: "800", adset_id: "901", ad_id: "9011", quality_ranking: "BELOW_AVERAGE_20", ...(de7 ? fila(10, 1, { freq: "4" }) : fila(30, 20)) },
    { campaign_id: "800", adset_id: "902", ad_id: "9021", quality_ranking: "AVERAGE", ...(de7 ? fila(12, 1, { rep3s: 300 }) : fila(40, 5)) },
  ];
}

async function falso(entrada, init = {}) {
  const u = new URL(String(entrada));
  if (u.hostname === "api.anthropic.com") {
    if (u.pathname.startsWith("/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    peticionesIA.push(JSON.parse(init.body));
    return flujo("Va bien en general: el conjunto Abierto pide un llamado más claro.");
  }
  if (u.hostname !== "graph.facebook.com") throw new Error(`Petición a Internet en un test: ${u.href}`);
  const ruta = u.pathname.replace(/^\/v[\d.]+/, "");
  const params = Object.fromEntries(u.searchParams);
  llamadas.push({ metodo: init.method ?? "GET", ruta, params });
  const campos = params.fields ?? "";
  for (const c of rechazar) {
    if (campos.split(",").some((f) => f === c || f.startsWith(`${c}{`))) return respuesta({ error: { message: `(#100) ${c} is not valid`, code: 100 } }, 400);
  }
  if (ruta === "/act_111/campaigns") {
    return respuesta({ data: [
      { id: "800", name: "Café · Presentación · Octubre", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_ENGAGEMENT", created_time: "2026-09-01T00:00:00-0500", insights: { data: [{ spend: String(gastoAyer) }] } },
      { id: "700", name: "Sofás sin etapa", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_ENGAGEMENT", created_time: "2026-09-01T00:00:00-0500", insights: { data: [{ spend: "3" }] } },
      { id: "600", name: "Vieja", status: "PAUSED", effective_status: "PAUSED", objective: "OUTCOME_ENGAGEMENT" },
    ] });
  }
  if (ruta === "/act_111/adsets") {
    return respuesta({ data: [
      { id: "901", name: "Intereses", campaign_id: "800", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "1000", learning_stage_info: { status: "SUCCESS" } },
      { id: "902", name: "Abierto", campaign_id: "800", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "1000", learning_stage_info: { status: "SUCCESS" } },
    ] });
  }
  if (ruta === "/act_111/ads") {
    const todos = [
      { id: "9011", name: "Reel bebé", campaign_id: "800", adset_id: "901", status: "ACTIVE", effective_status: "ACTIVE", creative: { thumbnail_url: "https://scontent.fbcdn.net/t.jpg", title: "Reel" } },
      { id: "9021", name: "Foto", campaign_id: "800", adset_id: "902", status: "ACTIVE", effective_status: estadoAnuncio },
    ];
    const filtro = params.effective_status ? JSON.parse(params.effective_status) : null;
    return respuesta({ data: filtro ? todos.filter((a) => filtro.includes(a.effective_status)) : todos });
  }
  // Como Meta: sólo los campos que se piden (y los ids del nivel).
  if (ruta === "/act_111/insights") {
    const pedidos = new Set(campos.split(","));
    return respuesta({ data: insightsDe(params.level, params.date_preset).map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => pedidos.has(k)))) });
  }
  return respuesta({ error: { message: `ruta no prevista: ${ruta}`, code: 100 } }, 400);
}

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
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  s.prepare("insert into integracion_meta (id, owner_id, nombre, token_cifrado, origen, permisos) values (?,?,?,?,?,?)")
    .run(JEFE, JEFE, "Juan", await cifrarMeta(env, "token-persona"), "https://calendarios.test", JSON.stringify(["pages_show_list", "ads_read", "ads_management"]));
  s.prepare("insert into cuentas_anuncios (id, owner_id, externo_id, nombre, moneda, client_id) values (?,?,?,?,?,?)")
    .run(`${JEFE}:act_111`, JEFE, "act_111", "Café Ads", "USD", "c1");
}

/** El número mágico de Café Luna: 20 × 25 % × 10 % = 0,50 $ por conversación (objetivo). */
const NUMEROS = {
  tipo: "productos", destino: "whatsapp", cuenta: "historial",
  ticket: { valor: 20, origen: "cliente" }, invertir: { valor: 25, origen: "agencia" }, metaVentas: { valor: 2000, origen: "agencia" },
  tasaCierre: { valor: 10, origen: "cliente" }, itbms: { valor: 0, origen: "cliente" },
  costos: [{ nombre: "Producto", pct: 40, origen: "cliente" }],
};

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const revision = (quien = JEFE, cliente = "c1", opciones) => pedir(quien, `/anuncios/clientes/${cliente}/revision`, opciones);
const conNumeros = () => pedir(JEFE, "/anuncios/clientes/c1/negocio", { method: "PUT", body: { negocio: NUMEROS } });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T15:00:00.000Z"));
  db = d1EnMemoria();
  env = {
    DB: db, META_APP_ID: "app", META_APP_SECRET: "secreto-meta", ANTHROPIC_API_KEY: "k",
    ASSETS: { fetch: async () => new Response("") },
  };
  llamadas = [];
  rechazar = [];
  estadoAnuncio = "ACTIVE";
  gastoAyer = 5;
  peticionesIA = [];
  vi.stubGlobal("fetch", vi.fn(falso));
  await sembrar();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); olvidarModelos(); });

describe("la revisión de un cliente", () => {
  it("lee por nivel con las métricas nuevas, juzga con el número mágico y la marca como revisada", async () => {
    await conNumeros();
    llamadas.length = 0;
    const r = await revision(EDITOR);
    expect(r.status).toBe(200);
    const d = await r.json();
    // Sólo lecturas: tres listas y nueve de /insights (campaña, conjunto y anuncio × 30, 14 y 7 días).
    expect(llamadas.every((l) => l.metodo === "GET")).toBe(true);
    expect(llamadas).toHaveLength(12);
    const porNivel = llamadas.filter((l) => l.ruta === "/act_111/insights").map((l) => `${l.params.level}:${l.params.date_preset}`).sort();
    expect(porNivel).toEqual(["ad:last_14d", "ad:last_30d", "ad:last_7d", "adset:last_14d", "adset:last_30d", "adset:last_7d", "campaign:last_14d", "campaign:last_30d", "campaign:last_7d"]);
    expect(llamadas.find((l) => l.params.level === "ad").params.fields).toMatch(/unique_inline_link_clicks.*quality_ranking/);
    expect(d.leidoCon).toBe("completo");
    // La Q1: el número mágico (objetivo 0,50) frente a lo real de toda la cuenta (también la campaña sin etapa).
    expect(d.numero).toMatchObject({ metrica: "Costo por conversación", objetivo: 0.5 });
    expect(d.q1Cuenta.ventanas[30]).toMatchObject({ gasto: 170, conversaciones: 110 });
    // Lo encendido: la pausada no entra. La etapa sale del nombre y cambia lo que aguanta (presentación: 0,65).
    expect(d.campanas.map((c) => c.id).sort()).toEqual(["700", "800"]);
    const c = d.campanas.find((x) => x.id === "800");
    expect(c).toMatchObject({ etapa: "presentacion", etapaDe: "nombre", referencia: { ref: 0.65, de: "numero-magico" } });
    expect(c.enlace).toBe("https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=111&selected_campaign_ids=800");
    // El conjunto que va bien (0,80 → no: 20 ÷ 25 = 0,80 > 0,65)… el de 902 sí está fuera: 10 $ por conversación.
    const [s1, s2] = c.conjuntos;
    expect(s2.veredicto.id).toBe("apagar");
    expect(s2.q2.metricas.find((m) => m.id === "pctMensajes")).toMatchObject({ valor: 3.3, mal: true });
    expect(s1.veredicto.id).toBe("mejorar");
    expect(c.anuncios.find((a) => a.id === "9011").rankings[0]).toMatchObject({ campo: "quality_ranking", bajo: true });
    expect(c.anuncios.find((a) => a.id === "9011").miniatura).toMatch(/^\/api\/metricas\/miniatura\?u=/);
    // La forma de antes también viaja (el diagnóstico de Anuncios la usa).
    expect(d.origenCosto).toBe("numero-magico");
    // Abrirla es revisarla.
    expect(db.sqlite.prepare("select revisada_at from anuncios_clientes where client_id = 'c1'").get().revisada_at).toBe("2026-11-06T15:00:00.000Z");
  });

  it("si Meta rechaza los campos nuevos (#100), se lee con los de siempre y se dice", async () => {
    rechazar = ["unique_inline_link_clicks", "learning_stage_info"];
    const d = await (await revision()).json();
    expect(d.leidoCon).toBe("basico");
    expect(d.avisoLectura).toMatch(/métricas nuevas/);
    const c = d.campanas.find((x) => x.id === "800");
    expect(c.conjuntos[1].ventanas[7].pctMensajes).toBeNull();
    // Las reproducciones de 3 s van en `actions`: llegan igual.
    expect(c.conjuntos[1].ventanas[7].tasa3s).toBe(10);
    // Cada nivel probó UNA vez lo nuevo (el de anuncios, dos escalones: con rankings y sin ellos) y siguió sin ello en
    // las otras ventanas: 9 + 1 + 1 + 2.
    const ins = llamadas.filter((l) => l.ruta === "/act_111/insights");
    expect(ins).toHaveLength(13);
  });

  it("sólo los rankings rechazados: el resto de lo nuevo llega", async () => {
    rechazar = ["quality_ranking"];
    const d = await (await revision()).json();
    expect(d.leidoCon).toBe("sin-rankings");
    expect(d.campanas.find((x) => x.id === "800").conjuntos[1].ventanas[7].pctMensajes).toBe(3.3);
  });

  it("sin cuenta, de otro colaborador, de otra agencia; quien sólo mira la ve pero no cuenta como revisada", async () => {
    expect((await revision(JEFE, "c2")).status).toBe(409);
    expect((await revision(COLAB, "c1")).status).toBe(404);
    expect((await revision(OTRA, "c1")).status).toBe(404);
    const r = await revision(LECTOR);
    expect(r.status).toBe(200);
    expect(db.sqlite.prepare("select revisada_at from anuncios_clientes where client_id = 'c1'").get()?.revisada_at ?? null).toBeNull();
    // Y la IA sólo con POST, que quien sólo mira no puede.
    expect((await revision(LECTOR, "c1", { method: "POST", body: { conIA: true } })).status).toBe(403);
  });

  it("con conIA, la IA explica la revisión (sin inventar) y se apunta su consumo", async () => {
    const d = await (await revision(JEFE, "c1", { method: "POST", body: { conIA: true } })).json();
    expect(d.explicacion).toMatch(/llamado más claro/);
    expect(peticionesIA).toHaveLength(1);
    expect(JSON.stringify(peticionesIA[0].messages)).toMatch(/no inventes ninguna cifra/);
    expect(db.sqlite.prepare("select count(*) as n from consumo_ia where funcion = ?").get("diagnóstico de campañas").n).toBe(1);
  });

  it("la etapa escogida a mano se guarda sin pisar los números ni el informe, y la revisión la usa", async () => {
    await conNumeros();
    await pedir(JEFE, "/anuncios/clientes/c1/ajustes-informe", { method: "PUT", body: { automatico: true } });
    const r = await pedir(EDITOR, "/anuncios/clientes/c1/etapas", { method: "PUT", body: { campanaId: "700", etapa: "conversion" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ etapas: { 700: "conversion" } });
    const f = db.sqlite.prepare("select * from anuncios_clientes where client_id = 'c1'").get();
    expect(f.informe_automatico).toBe(1);
    expect(JSON.parse(f.negocio).ticket.valor).toBe(20);
    const d = await (await revision()).json();
    expect(d.campanas.find((x) => x.id === "700")).toMatchObject({ etapa: "conversion", etapaDe: "manual", nombreEtapa: "Conversión" });
    // Quitarla, una que no existe, una campaña sin id, otro colaborador y quien sólo mira.
    expect(await (await pedir(EDITOR, "/anuncios/clientes/c1/etapas", { method: "PUT", body: { campanaId: "700", etapa: "" } })).json()).toEqual({ etapas: {} });
    expect((await pedir(EDITOR, "/anuncios/clientes/c1/etapas", { method: "PUT", body: { campanaId: "700", etapa: "inventada" } })).status).toBe(400);
    expect((await pedir(EDITOR, "/anuncios/clientes/c1/etapas", { method: "PUT", body: { campanaId: "abc", etapa: "conversion" } })).status).toBe(400);
    expect((await pedir(COLAB, "/anuncios/clientes/c1/etapas", { method: "PUT", body: { campanaId: "700", etapa: "conversion" } })).status).toBe(404);
    expect((await pedir(LECTOR, "/anuncios/clientes/c1/etapas", { method: "PUT", body: { campanaId: "700", etapa: "conversion" } })).status).toBe(403);
  });
});

describe("Mi día: «Revisar las campañas de…»", () => {
  const pendientes = async (quien = JEFE) => (await (await pedir(quien, "/anuncios/revision/pendientes")).json()).pendientes;

  it("sale con la cuenta sin revisar (o revisada hace 6 días o más) y se va al abrir la revisión", async () => {
    expect(await pendientes()).toEqual([{ clientId: "c1", revisadaAt: null, dias: null }]);
    await revision();
    expect(await pendientes()).toEqual([]);
    vi.setSystemTime(new Date("2026-11-11T15:00:00.000Z"));
    expect(await pendientes()).toEqual([]);
    vi.setSystemTime(new Date("2026-11-12T15:00:00.000Z"));
    expect(await pendientes()).toEqual([{ clientId: "c1", revisadaAt: "2026-11-06T15:00:00.000Z", dias: 6 }]);
  });

  it("un colaborador sólo ve sus clientes, y es una lectura de D1: nada de Meta", async () => {
    expect(await pendientes(COLAB)).toEqual([]);
    expect(llamadas).toEqual([]);
  });
});

describe("el cron: lo grave de cada día", () => {
  const avisos = () => db.sqlite.prepare("select user_id, tipo, texto, enlace from avisos order by texto, user_id").all();
  const alertas = () => JSON.parse(db.sqlite.prepare("select alertas from anuncios_clientes where client_id = 'c1'").get().alertas);
  const a = (iso) => new Date(iso);

  it("antes de las 7:00 de Panamá no mira nada; después, un cliente, con tres llamadas, y avisa lo grave", async () => {
    await conNumeros();
    llamadas.length = 0;
    expect(await revision3qPendiente(env, a("2026-11-06T11:00:00.000Z"))).toBe(0); // 6:00 en Panamá
    expect(llamadas).toEqual([]);
    gastoAyer = 0;
    estadoAnuncio = "DISAPPROVED";
    expect(await revision3qPendiente(env, a("2026-11-06T14:00:00.000Z"))).toBe(1); // 9:00
    expect(llamadas).toHaveLength(3);
    const lista = avisos();
    // No gastó ayer y un anuncio rechazado (la campaña 700 gasta y tiene conversaciones; nadie con el doble sin una).
    expect([...new Set(lista.map((x) => x.texto))]).toEqual([
      "La campaña «Café · Presentación · Octubre» de Café Luna está activa y ayer no gastó nada: puede estar en revisión, sin método de pago o con un público muy chico.",
      "Meta rechazó el anuncio «Foto» de «Café · Presentación · Octubre» de Café Luna: el motivo está en el Ads Manager.",
    ]);
    // A quien lleva al cliente: el administrador y el editor; ni el colaborador de otro cliente ni quien sólo mira.
    expect([...new Set(lista.map((x) => x.user_id))].sort()).toEqual([EDITOR, JEFE]);
    expect(lista[0]).toMatchObject({ tipo: "campanas", enlace: "/cliente/c1/resultados/anuncios" });
    expect(alertas()).toMatchObject({ fecha: "2026-11-06", claves: ["sin-gasto:800", "rechazado:9021"] });
    // Una vez al día: la siguiente vuelta ya no lo mira.
    llamadas.length = 0;
    expect(await revision3qPendiente(env, a("2026-11-06T16:00:00.000Z"))).toBe(0);
    expect(llamadas).toEqual([]);
  });

  it("al día siguiente lo mira otra vez, pero lo ya avisado no se repite; lo nuevo, sí", async () => {
    await conNumeros();
    estadoAnuncio = "DISAPPROVED";
    await revision3qPendiente(env, a("2026-11-06T14:00:00.000Z"));
    const antes = avisos().length;
    expect(await revision3qPendiente(env, a("2026-11-07T14:00:00.000Z"))).toBe(1);
    expect(avisos().length).toBe(antes);
    expect(alertas().fecha).toBe("2026-11-07");
    gastoAyer = 0;
    await revision3qPendiente(env, a("2026-11-08T14:00:00.000Z"));
    expect(avisos().length).toBe(antes + 2);
  });

  it("el doble del número mágico gastado sin una conversación también es grave", async () => {
    await conNumeros();
    vi.stubGlobal("fetch", vi.fn(async (e, init) => {
      const u = new URL(String(e));
      if (u.pathname.endsWith("/act_111/insights")) {
        llamadas.push({ ruta: "/act_111/insights", params: Object.fromEntries(u.searchParams) });
        return respuesta({ data: [{ campaign_id: "700", spend: "4", actions: [] }] });
      }
      return falso(e, init);
    }));
    await revision3qPendiente(env, a("2026-11-06T14:00:00.000Z"));
    const textos = avisos().map((x) => x.texto);
    // (Intl separa la cifra de «US$» con un espacio duro: \s lo admite.)
    expect(textos.some((t) => /^«Sofás sin etapa» de Café Luna gastó 4,00\sUS\$ en 7 días sin una conversación \(el número mágico es 0,50\sUS\$\)\.$/.test(t))).toBe(true);
    expect(alertas().claves).toEqual(["sin-resultado:700"]);
  });

  it("si Meta falla, se apunta el error y no se vuelve a mirar ese día", async () => {
    rechazar = ["id"];
    expect(await revision3qPendiente(env, a("2026-11-06T14:00:00.000Z"))).toBe(1);
    expect(alertas()).toMatchObject({ fecha: "2026-11-06" });
    expect(alertas().error).toMatch(/not valid/);
    expect(avisos()).toEqual([]);
    expect(await revision3qPendiente(env, a("2026-11-06T15:00:00.000Z"))).toBe(0);
  });

  it("sin Meta configurado, ni pregunta a la base", async () => {
    delete env.META_APP_ID;
    expect(await revision3qPendiente(env, a("2026-11-06T14:00:00.000Z"))).toBe(0);
  });
});

describe("el asistente y Claude (MCP)", () => {
  it("revisar_campanas: sólo lectura, la misma revisión en texto, y no la marca como revisada", async () => {
    await conNumeros();
    expect(DEFINICIONES.map((d) => d.name)).toContain("revisar_campanas");
    expect(HERRAMIENTAS_MCP.find((h) => h.name === "revisar_campanas").annotations.readOnlyHint).toBe(true);
    const acceso = crearAcceso(db, JEFE);
    const mcp = crearHerramientasMCP({ env, acceso, usuario: { id: JEFE, nombre: "Juan" } });
    const r = await mcp.llamar("revisar_campanas", { cliente: "Café" });
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toMatch(/Revisión 3Q de las campañas de Café Luna/);
    expect(r.content[0].text).toMatch(/Número mágico: costo por conversación/);
    expect(r.content[0].text).toMatch(/«Café · Presentación · Octubre» · Presentación/);
    expect(db.sqlite.prepare("select revisada_at from anuncios_clientes where client_id = 'c1'").get().revisada_at).toBeNull();
    // El asistente de la aplicación, igual; sin cuenta publicitaria, el motivo vuelve como error de la herramienta.
    const ej = crearEjecutor({ env, acceso });
    const ok = await ej.ejecutar({ id: "t1", name: "revisar_campanas", input: { cliente: "Café Luna" } });
    expect(ok.content).toMatch(/Q2|Q3|Número mágico/);
    const sin = await ej.ejecutar({ id: "t2", name: "revisar_campanas", input: { cliente: "Dcasa" } });
    expect(sin).toMatchObject({ is_error: true });
    expect(sin.content).toMatch(/cuenta publicitaria/);
    expect(llamadas.every((l) => l.metodo === "GET")).toBe(true);
  });
});

describe("el informe de anuncios: lo que ve sólo la agencia", () => {
  it("el % de mensajes, el CTR único y el número mágico frente al real, del total del mes", async () => {
    await conNumeros();
    const a = await agenciaDelMes(crearAcceso(db, JEFE), "c1", fila(100, 40, { unicos: 160 }));
    expect(a).toMatchObject({ pctMensajes: 25, ctrUnico: 3.3, real: 2.5, objetivo: 0.5, metrica: "Costo por conversación" });
    expect(await agenciaDelMes(crearAcceso(db, JEFE), "c1", null)).toBeNull();
  });

  it("el enlace del cliente no lo lleva", async () => {
    db.sqlite.prepare("insert into informes_anuncios (id, owner_id, client_id, mes, estado, contenido, testigo, compartido) values (?,?,?,?,?,?,?,?)")
      .run("c1:2026-10", JEFE, "c1", "2026-10", "listo", JSON.stringify({ cifras: { kpis: {} }, analisis: {}, agencia: { pctMensajes: 25 }, avisos: ["x"] }), "t".repeat(32), 1);
    const r = await worker.fetch(new Request(`https://calendarios.test/api/publico-informe-anuncios/${"t".repeat(32)}`), env);
    expect(r.status).toBe(200);
    const texto = await r.text();
    expect(texto).not.toMatch(/pctMensajes|agencia/);
  });
});
