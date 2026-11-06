import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { revision3qPendiente } from "../../worker/lib/revision3q.js";
import { crearHerramientasMCP } from "../../worker/lib/mcp.js";
import { ACCION_MENSAJE } from "../../src/lib/anuncios.js";

// ============================================================
// CERRAR EL CICLO (curso de campañas, entrega 7) contra una D1 de verdad, una Meta y una IA de mentira
//
// Lo que importa:
//   1. La revisión 3Q lee el creativo de cada anuncio en la MISMA llamada de la lista (12 llamadas, como antes), lo
//      casa con su publicación del calendario por el id que guardó la cola, y lo guarda en `anuncios_clientes.en_pauta`
//      sin pisar las otras columnas de la fila. Si Meta rechaza un campo del creativo, baja de escalón; si no deja
//      leer ninguno, lo guardado no se toca.
//   2. GET …/en-pauta no pregunta a Meta (es lo que lee el panel de cada publicación).
//   3. El cron lo pone al día con dos llamadas más.
//   4. «Para pautar»: lo orgánico que rindió y no corre; «Marcar Va a pauta» escribe en su publicación, también
//      publicada, sin tocar las demás.
//   5. El asistente y Claude lo dicen; el motor de ideas y el director leen lo aprendido sólo para lo que va a pauta.
//
// Ninguna petición sale a Internet: el `fetch` falso revienta con cualquier host que no sea Meta o Anthropic.
// ============================================================

const JEFE = "u-jefe";
const COLAB = "u-colab";
const LECTOR = "u-lector";
const OTRA = "u-otra";
const TESTIGO = { [JEFE]: "t-jefe", [COLAB]: "t-colab", [LECTOR]: "t-lector", [OTRA]: "t-otra" };

let db;
let env;
let llamadas;
let rechazarCreativo; // subcampos del creativo que Meta rechaza con un #100
let pausado; // anuncios que ya no están encendidos
let peticionesIA;
let respuestaIA;

const respuesta = (datos, estado = 200) => new Response(JSON.stringify(datos), { status: estado, headers: { "content-type": "application/json" } });
const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 1500 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 300 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

const fila = (gasto, conv) => ({
  spend: String(gasto), impressions: "6000", reach: "3000", frequency: "1.5", cpm: "6", clicks: "200",
  unique_inline_link_clicks: "100", unique_inline_link_click_ctr: "3.3", cost_per_unique_inline_link_click: String(gasto / 100),
  actions: [{ action_type: ACCION_MENSAJE, value: String(conv) }],
});

/** La campaña 800 (presentación) con dos anuncios de publicaciones del calendario; la 700 con un anuncio nuevo. */
function insightsDe(nivel, preset) {
  const de7 = preset === "last_7d";
  if (nivel === "campaign") return [{ campaign_id: "800", ...(de7 ? fila(20, 25) : fila(80, 90)) }, { campaign_id: "700", ...fila(20, 10) }];
  if (nivel === "adset") return [{ campaign_id: "800", adset_id: "901", ...(de7 ? fila(20, 25) : fila(80, 90)) }, { campaign_id: "700", adset_id: "701", ...fila(20, 10) }];
  return [
    { campaign_id: "800", adset_id: "901", ad_id: "9011", ...(de7 ? fila(12, 15) : fila(50, 60)) },
    { campaign_id: "800", adset_id: "901", ad_id: "9012", ...(de7 ? fila(8, 10) : fila(30, 30)) },
    { campaign_id: "700", adset_id: "701", ad_id: "7011", ...fila(20, 10) },
  ];
}

const ANUNCIOS = [
  { id: "9011", name: "Reel receta", campaign_id: "800", adset_id: "901", status: "ACTIVE", effective_status: "ACTIVE", creative: { id: "c1", thumbnail_url: "https://scontent.fbcdn.net/t.jpg", title: "Receta", effective_object_story_id: "555_999", effective_instagram_media_id: "17900001" } },
  { id: "9012", name: "Foto sofá", campaign_id: "800", adset_id: "901", status: "ACTIVE", effective_status: "ACTIVE", creative: { id: "c2", title: "Sofá", effective_object_story_id: "555_777", object_story_id: "555_777" } },
  { id: "7011", name: "Subido", campaign_id: "700", adset_id: "701", status: "ACTIVE", effective_status: "ACTIVE", creative: { id: "c3", title: "Nuevo", effective_object_story_id: "555_000", effective_instagram_media_id: "17999999" } },
];

/** Los campos del creativo que se piden (lo de dentro de `creative{…}`). */
const camposDelCreativo = (campos) => (/creative\{([^}]*)\}/.exec(campos)?.[1] ?? "").split(",").filter(Boolean);

async function falso(entrada, init = {}) {
  const u = new URL(String(entrada));
  if (u.hostname === "api.anthropic.com") {
    if (u.pathname.startsWith("/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    peticionesIA.push(JSON.parse(init.body));
    return flujo(respuestaIA);
  }
  if (u.hostname !== "graph.facebook.com") throw new Error(`Petición a Internet en un test: ${u.href}`);
  const ruta = u.pathname.replace(/^\/v[\d.]+/, "");
  const params = Object.fromEntries(u.searchParams);
  llamadas.push({ metodo: init.method ?? "GET", ruta, params });
  const campos = params.fields ?? "";
  if (ruta === "/act_111/campaigns") {
    return respuesta({ data: [
      { id: "800", name: "Café · Presentación · Octubre", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_ENGAGEMENT", created_time: "2026-09-01T00:00:00-0500", insights: { data: [{ spend: "5" }] } },
      { id: "700", name: "Sofás sin etapa", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_ENGAGEMENT", created_time: "2026-09-01T00:00:00-0500", insights: { data: [{ spend: "3" }] } },
    ] });
  }
  if (ruta === "/act_111/adsets") {
    return respuesta({ data: [
      { id: "901", name: "Intereses", campaign_id: "800", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "1000", learning_stage_info: { status: "SUCCESS" } },
      { id: "701", name: "Abierto", campaign_id: "700", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "1000", learning_stage_info: { status: "SUCCESS" } },
    ] });
  }
  if (ruta === "/act_111/ads") {
    const pedidos = camposDelCreativo(campos);
    const malo = rechazarCreativo.find((c) => pedidos.includes(c));
    if (malo) return respuesta({ error: { message: `(#100) Tried accessing nonexisting field (${malo})`, code: 100 } }, 400);
    // Como Meta: del creativo, sólo lo que se pide.
    const todos = ANUNCIOS.filter((a) => !pausado.includes(a.id))
      .map((a) => ({ ...a, creative: Object.fromEntries(Object.entries(a.creative).filter(([k]) => pedidos.includes(k))) }));
    return respuesta({ data: todos });
  }
  if (ruta === "/act_111/insights") {
    const pedidos = new Set(campos.split(","));
    return respuesta({ data: insightsDe(params.level, params.date_preset).map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => pedidos.has(k)))) });
  }
  return respuesta({ error: { message: `ruta no prevista: ${ruta}`, code: 100 } }, 400);
}

const DIAS = [
  { date: "2026-10-12", posts: [{ id: "p1", format: "post", status: "published", title: "Receta de café frío", descripcion: "Receta del día", image: "/api/media/clientes/c1/a.jpg", pilar: "educativo", composicion: "uso", nivel: "problema" }] },
  { date: "2026-10-14", posts: [{ id: "p2", format: "post", status: "published", title: "El sofá", descripcion: "Sofá nuevo" }] },
  {
    date: "2026-10-20", posts: [
      { id: "p5", format: "post", status: "published", title: "Antes y después", descripcion: "¡Hola! Hoy abrimos. Pasa por la tienda.\n#a #b #c #d #e", image: "/api/media/clientes/c1/b.jpg", nivel: "producto" },
      { id: "p6", format: "post", status: "pending", title: "Otra del día", descripcion: "Sin tocar" },
    ],
  },
];

async function sembrar() {
  const s = db.sqlite;
  for (const id of [JEFE, COLAB, LECTOR, OTRA]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Colab", "#654321", '["c2"]');
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura) values (?,?,?,?,?,?)").run(LECTOR, JEFE, "editor", "Lector", "#777777", 1);
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#abcdef");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Dcasa");
  s.prepare("insert into integracion_meta (id, owner_id, nombre, token_cifrado, origen, permisos) values (?,?,?,?,?,?)")
    .run(JEFE, JEFE, "Juan", await cifrarMeta(env, "token-persona"), "https://calendarios.test", JSON.stringify(["pages_show_list", "ads_read", "ads_management"]));
  s.prepare("insert into cuentas_anuncios (id, owner_id, externo_id, nombre, moneda, client_id) values (?,?,?,?,?,?)")
    .run(`${JEFE}:act_111`, JEFE, "act_111", "Café Ads", "USD", "c1");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days, offers) values (?,?,?,?,?,?,?,?)")
    .run("cal1", "c1", JEFE, "Octubre", 9, 2026, JSON.stringify(DIAS), "");
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, client_id) values (?,?,?,?,?)").run("cs-ig", JEFE, "instagram", "ig1", "c1");
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, client_id) values (?,?,?,?,?)").run("cs-fb", JEFE, "facebook", "555", "c1");
  const cola = s.prepare(`insert into publicaciones_programadas (id, owner_id, client_id, calendar_id, post_id, red, cuenta_id, programada_para, estado, externo_id, enlace, variante, publicada_at)
    values (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  cola.run("q1", JEFE, "c1", "cal1", "p1", "instagram", "cs-ig", "2026-10-12T14:00:00.000Z", "publicada", "17900001", "https://www.instagram.com/p/AAA111/", "post", "2026-10-12T14:00:00.000Z");
  cola.run("q2", JEFE, "c1", "cal1", "p2", "facebook", "cs-fb", "2026-10-14T14:00:00.000Z", "publicada", "555_777", "", "post", "2026-10-14T14:00:00.000Z");
  cola.run("q5", JEFE, "c1", "cal1", "p5", "instagram", "cs-ig", "2026-10-20T14:00:00.000Z", "publicada", "17900005", "https://www.instagram.com/p/EEE555/", "post", "2026-10-20T14:00:00.000Z");
  const met = s.prepare("insert into metricas_publicacion (id, owner_id, client_id, cuenta_id, red, externo_id, tipo, texto, miniatura, publicada_at, interacciones) values (?,?,?,?,?,?,?,?,?,?,?)");
  met.run("m1", JEFE, "c1", "cs-ig", "instagram", "17900001", "imagen", "Receta del día", "", "2026-10-12T14:00:00.000Z", 500);
  met.run("m5", JEFE, "c1", "cs-ig", "instagram", "17900005", "imagen", "¡Hola! Hoy abrimos", "https://scontent.cdninstagram.com/e.jpg", "2026-10-20T14:00:00.000Z", 340);
  met.run("m2", JEFE, "c1", "cs-ig", "instagram", "17900002", "imagen", "Normal", "", "2026-10-02T14:00:00.000Z", 100);
  met.run("m3", JEFE, "c1", "cs-ig", "instagram", "17900003", "imagen", "Normal", "", "2026-10-05T14:00:00.000Z", 100);
  met.run("m4", JEFE, "c1", "cs-ig", "instagram", "17900004", "imagen", "Normal", "", "2026-10-08T14:00:00.000Z", 90);
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const revision = (quien = JEFE) => pedir(quien, "/anuncios/clientes/c1/revision");
const guardado = () => JSON.parse(db.sqlite.prepare("select en_pauta from anuncios_clientes where client_id = 'c1'").get()?.en_pauta ?? "{}");
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};
const NUMEROS = {
  tipo: "productos", destino: "whatsapp", cuenta: "historial",
  ticket: { valor: 20, origen: "cliente" }, invertir: { valor: 25, origen: "agencia" }, metaVentas: { valor: 2000, origen: "agencia" },
  tasaCierre: { valor: 10, origen: "cliente" }, itbms: { valor: 0, origen: "cliente" }, costos: [{ nombre: "Producto", pct: 40, origen: "cliente" }],
};

function r2() {
  const objetos = new Map();
  return {
    async get(clave) { return objetos.has(clave) ? { text: async () => objetos.get(clave), arrayBuffer: async () => new TextEncoder().encode(objetos.get(clave)) } : null; },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor) { objetos.set(clave, String(valor)); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), META_APP_ID: "app", META_APP_SECRET: "secreto-meta", ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  llamadas = [];
  rechazarCreativo = [];
  pausado = [];
  peticionesIA = [];
  respuestaIA = "{}";
  vi.stubGlobal("fetch", vi.fn(falso));
  await sembrar();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); olvidarModelos(); });

describe("qué publicación es cada anuncio (la revisión 3Q)", () => {
  it("lee el creativo en la misma llamada, casa cada anuncio con su publicación y lo guarda sin pisar la fila", async () => {
    await pedir(JEFE, "/anuncios/clientes/c1/negocio", { method: "PUT", body: { negocio: NUMEROS } });
    await pedir(JEFE, "/anuncios/clientes/c1/ajustes-informe", { method: "PUT", body: { automatico: true } });
    db.sqlite.prepare("update anuncios_clientes set kit_whatsapp = ?, etapas = ? where client_id = 'c1'").run('{"bienvenida":"Hola"}', '{"700":"evaluacion"}');
    llamadas.length = 0;
    const r = await revision();
    expect(r.status).toBe(200);
    const d = await r.json();
    // Las mismas 12 llamadas de siempre: el creativo va en la lista de anuncios.
    expect(llamadas).toHaveLength(12);
    const ads = llamadas.find((l) => l.ruta === "/act_111/ads");
    expect(ads.params.fields).toMatch(/creative\{id,thumbnail_url,title,effective_object_story_id,object_story_id,effective_instagram_media_id,source_instagram_media_id,instagram_permalink_url\}/);
    expect(d.leidoCreativo).toBe("completo");
    const c800 = d.campanas.find((c) => c.id === "800");
    const a9011 = c800.anuncios.find((a) => a.id === "9011");
    expect(a9011.publicacion).toMatchObject({ calendarId: "cal1", postId: "p1", red: "instagram", post: { fecha: "2026-10-12", titulo: "Receta de café frío", miniatura: "/api/media/clientes/c1/a.jpg" } });
    expect(c800.anuncios.find((a) => a.id === "9012").publicacion).toMatchObject({ postId: "p2", red: "facebook" });
    const a7011 = d.campanas.find((c) => c.id === "700").anuncios.find((a) => a.id === "7011");
    expect(a7011.sinPublicacion).toMatchObject({ tipo: "nuevo" });
    expect(a7011.publicacionTexto).toMatch(/Anuncio nuevo, sin publicación del calendario/);

    const g = guardado();
    expect(g).toMatchObject({ v: 1, cuenta: "act_111", moneda: "USD", creativo: "completo", leidoAt: "2026-11-06T15:00:00.000Z", referencia: 0.5 });
    expect(Object.keys(g.publicaciones).sort()).toEqual(["cal1|p1", "cal1|p2"]);
    expect(g.publicaciones["cal1|p1"]).toMatchObject({
      activo: true, desde: "2026-11-06", etapa: "presentacion", nombreEtapa: "Presentación", tipoResultado: "conversacion",
      d7: { gasto: 12, resultados: 15 }, d30: { gasto: 50, resultados: 60 },
      post: { pilar: "educativo", composicion: "uso", composicionNombre: "En uso", nivel: "problema" },
    });
    expect(g.publicaciones["cal1|p1"].anuncios[0]).toMatchObject({ id: "9011", campana: "Café · Presentación · Octubre", enlace: expect.stringMatching(/selected_ad_ids=9011/) });
    expect(g.sinPublicacion).toMatchObject({ nuevo: 1, otra: 0 });
    expect(g.externos).toEqual(expect.arrayContaining(["instagram:17900001", "facebook:555_777", "instagram:17999999"]));
    // La fila tiene cinco dueños: nada de lo demás cambió.
    const f = db.sqlite.prepare("select * from anuncios_clientes where client_id = 'c1'").get();
    expect(f.informe_automatico).toBe(1);
    expect(JSON.parse(f.negocio).ticket.valor).toBe(20);
    expect(JSON.parse(f.kit_whatsapp)).toEqual({ bienvenida: "Hola" });
    expect(JSON.parse(f.etapas)).toEqual({ 700: "evaluacion" });
    expect(f.revisada_at).toBe("2026-11-06T15:00:00.000Z");
  });

  it("si Meta rechaza un campo del creativo baja de escalón; si no deja leer ninguno, lo guardado no se toca", async () => {
    rechazarCreativo = ["source_instagram_media_id"];
    const d = await (await revision()).json();
    expect(d.leidoCreativo).toBe("basico");
    // Con la publicación que CORRE (sin la escogida) también casan.
    expect(Object.keys(guardado().publicaciones).sort()).toEqual(["cal1|p1", "cal1|p2"]);
    expect(llamadas.filter((l) => l.ruta === "/act_111/ads")).toHaveLength(2);

    const antes = guardado();
    vi.setSystemTime(new Date("2026-11-07T15:00:00.000Z"));
    rechazarCreativo = ["effective_object_story_id"];
    const d2 = await (await revision()).json();
    expect(d2.leidoCreativo).toBe("sin-dato");
    expect(d2.avisoCreativo).toMatch(/no dijo qué publicación usa cada anuncio/);
    expect(d2.campanas.find((c) => c.id === "800").anuncios[0].sinPublicacion).toMatchObject({ tipo: "sin-dato" });
    expect(guardado()).toEqual(antes);
  });

  it("lo que deja de correr queda como «estuvo en pauta», con sus últimas cifras", async () => {
    await revision();
    vi.setSystemTime(new Date("2026-11-08T15:00:00.000Z"));
    pausado = ["9012"];
    await revision();
    const g = guardado();
    expect(g.publicaciones["cal1|p1"]).toMatchObject({ activo: true, visto: "2026-11-08" });
    expect(g.publicaciones["cal1|p2"]).toMatchObject({ activo: false, visto: "2026-11-06", d30: { gasto: 30, resultados: 30 } });
  });
});

describe("GET …/en-pauta (lo que lee el panel de cada publicación)", () => {
  it("es sólo D1: ni una llamada a Meta, con la línea del panel y lo que se aprende", async () => {
    await revision();
    llamadas.length = 0;
    const r = await pedir(LECTOR, "/anuncios/clientes/c1/en-pauta");
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(llamadas).toEqual([]);
    const p1 = d.publicaciones.find((p) => p.postId === "p1");
    expect(p1.linea).toMatch(/^En pauta · Presentación · 0,80\sUS\$ por conversación \(7 días\)$/);
    expect(p1.anuncios[0]).toMatchObject({ id: "9011", enlace: expect.stringMatching(/^https:\/\/adsmanager\.facebook\.com\//) });
    expect(p1.post).toMatchObject({ titulo: "Receta de café frío" });
    expect(d.preferencias.linea).toBe("");
    expect(d.preferencias.motivo).toMatch(/Todavía no hay con qué comparar/);
  });

  it("sin nada guardado, vacío; de otro colaborador o de otra agencia, 404", async () => {
    expect(await (await pedir(JEFE, "/anuncios/clientes/c1/en-pauta")).json()).toMatchObject({ publicaciones: [], leidoAt: null });
    expect((await pedir(COLAB, "/anuncios/clientes/c1/en-pauta")).status).toBe(404);
    expect((await pedir(OTRA, "/anuncios/clientes/c1/en-pauta")).status).toBe(404);
  });
});

describe("el cron también lo pone al día", () => {
  it("con lo de cada anuncio en 7 y 30 días (dos llamadas más), en la misma sentencia que lo grave", async () => {
    expect(await revision3qPendiente(env, new Date("2026-11-06T14:00:00.000Z"))).toBe(1);
    expect(llamadas).toHaveLength(5);
    expect(llamadas.filter((l) => l.ruta === "/act_111/insights" && l.params.level === "ad").map((l) => l.params.date_preset).sort()).toEqual(["last_30d", "last_7d"]);
    const g = guardado();
    expect(g.publicaciones["cal1|p1"]).toMatchObject({ activo: true, etapa: "presentacion", d7: { gasto: 12, resultados: 15 }, d30: { gasto: 50, resultados: 60 } });
    expect(g.publicaciones["cal1|p1"].anuncios[0].enlace).toMatch(/selected_ad_ids=9011/);
    expect(JSON.parse(db.sqlite.prepare("select alertas from anuncios_clientes where client_id = 'c1'").get().alertas)).toMatchObject({ fecha: "2026-11-06" });
  });
});

describe("«Para pautar»", () => {
  it("lo orgánico que rindió y no corre, con su etapa y su texto revisado como anuncio", async () => {
    await revision();
    llamadas.length = 0;
    const r = await pedir(JEFE, "/anuncios/clientes/c1/para-pautar");
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(llamadas).toEqual([]);
    // p1 rindió más, pero ya está en pauta: sale p5 (340 frente a lo normal de 100).
    expect(d.candidatas.map((x) => x.postId)).toEqual(["p5"]);
    const x = d.candidatas[0];
    expect(x).toMatchObject({ calendarId: "cal1", delCalendario: true, rinde: 3.4, etapa: "evaluacion", nombreEtapa: "Evaluación", marcada: false, fecha: "2026-10-20", miniatura: "/api/media/clientes/c1/b.jpg" });
    expect(x.frase).toBe("Rindió 3,4× su promedio: páutala en Evaluación.");
    expect(x.problemas.map((p) => p.codigo)).toEqual(expect.arrayContaining(["caduca", "primera-linea", "llamado", "hashtags"]));
    expect(d.preferencias.motivo).toMatch(/Todavía no hay/);
  });

  it("«Marcar Va a pauta» escribe la etapa en su publicación (aunque ya salió) y no toca las demás", async () => {
    const r = await pedir(JEFE, "/anuncios/clientes/c1/para-pautar", { method: "POST", body: { calendarId: "cal1", postId: "p5", etapa: "evaluacion" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ calendarId: "cal1", postId: "p5", pauta: { etapa: "evaluacion", como: "publicacion" } });
    const dias = JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal1'").get().days);
    const posts = dias.flatMap((d) => d.posts);
    expect(posts.find((p) => p.id === "p5")).toMatchObject({ status: "published", pauta: { etapa: "evaluacion", como: "publicacion" }, title: "Antes y después" });
    expect(posts.find((p) => p.id === "p6")).toEqual(DIAS[2].posts[1]);
    // Ya marcada: «Para pautar» lo dice.
    expect((await (await pedir(JEFE, "/anuncios/clientes/c1/para-pautar")).json()).candidatas.find((c) => c.postId === "p5")).toMatchObject({ marcada: true });
    // Quien sólo mira no marca; otro colaborador no lo ve; una etapa que no existe o una publicación que no está.
    expect((await pedir(LECTOR, "/anuncios/clientes/c1/para-pautar", { method: "POST", body: { calendarId: "cal1", postId: "p5" } })).status).toBe(403);
    expect((await pedir(COLAB, "/anuncios/clientes/c1/para-pautar", { method: "POST", body: { calendarId: "cal1", postId: "p5" } })).status).toBe(404);
    expect((await pedir(JEFE, "/anuncios/clientes/c1/para-pautar", { method: "POST", body: { calendarId: "cal1", postId: "p5", etapa: "inventada" } })).status).toBe(400);
    const no = await pedir(JEFE, "/anuncios/clientes/c1/para-pautar", { method: "POST", body: { calendarId: "cal1", postId: "nada" } });
    expect(no.status).toBe(409);
    expect((await no.json()).error).toMatch(/ya no está en su calendario/);
  });
});

describe("el asistente y Claude (MCP), sin gastar", () => {
  it("ver_calendario dice qué está en pauta y a cuánto; revisar_campanas, qué publicación es cada anuncio", async () => {
    const acceso = crearAcceso(db, JEFE);
    const mcp = crearHerramientasMCP({ env, acceso, usuario: { id: JEFE, nombre: "Juan" } });
    const rev = await mcp.llamar("revisar_campanas", { cliente: "Café" });
    expect(rev.content[0].text).toMatch(/Qué publicación es cada anuncio: «Reel receta»: Publicación del calendario del 12 oct «Receta de café frío» \(ID p1\)/);
    expect(rev.content[0].text).toMatch(/«Subido»: Anuncio nuevo, sin publicación del calendario/);
    llamadas.length = 0;
    const cal = await mcp.llamar("ver_calendario", { cliente: "Café Luna", mes: "2026-10" });
    expect(llamadas).toEqual([]);
    expect(cal.content[0].text).toMatch(/ID p1 .* · EN PAUTA \(En pauta · Presentación · 0,80\sUS\$ por conversación \(7 días\); leído del Ads Manager el 2026-11-06\)/);
    expect(cal.content[0].text).not.toMatch(/ID p6 .*EN PAUTA/);
  });
});

describe("lo que se aprende, en el motor de ideas y en el director (sólo para lo que va a pauta)", () => {
  /** Seis piezas pautadas: tres «En uso» a 1 $ la conversación y tres «Producto héroe» a 3 $. */
  const conMuestra = () => {
    const pub = (n, comp, resultados) => [`cal1|p${n}`, {
      calendarId: "cal1", postId: `p${n}`, red: "instagram", activo: true, visto: "2026-11-06", etapa: "presentacion", nombreEtapa: "Presentación",
      tipoResultado: "conversacion", nombreResultado: "conversaciones", d30: { gasto: 30, resultados, costo: 30 / resultados }, anuncios: [],
      post: { composicion: comp, composicionNombre: comp === "uso" ? "En uso" : "Producto héroe", pilar: "anuncio" },
    }];
    const en = { v: 1, moneda: "USD", referencia: 0.5, publicaciones: Object.fromEntries([pub(11, "uso", 30), pub(12, "uso", 30), pub(13, "uso", 30), pub(14, "heroe", 10), pub(15, "heroe", 10), pub(16, "heroe", 10)]) };
    db.sqlite.prepare("insert into anuncios_clientes (id, owner_id, client_id, en_pauta) values (?,?,?,?)").run("ac1", JEFE, "c1", JSON.stringify(en));
  };

  it("el motor de ideas: la línea va cuando alguna casilla va a pauta, y no si ninguna", async () => {
    conMuestra();
    respuestaIA = JSON.stringify({ textos: [{ n: 1, descripcion: "Escríbenos por WhatsApp" }] });
    const r = await pedir(JEFE, "/estudio/c1/lote/ideas", { method: "POST", body: { modo: "campos", publicaciones: [{ clave: "p1", formato: "post", pauta: { etapa: "presentacion" }, campos: ["descripcion"] }] } });
    expect(r.status).toBe(200);
    expect(textoDe(peticionesIA[0])).toMatch(/Lo que ya se probó en pauta con esta marca \(costo por conversación, últimos 30 días, 6 piezas con gasto suficiente\): sale más barato .*la composición «En uso»/);
    peticionesIA.length = 0;
    await pedir(JEFE, "/estudio/c1/lote/ideas", { method: "POST", body: { modo: "campos", publicaciones: [{ clave: "p2", formato: "post", campos: ["descripcion"] }] } });
    expect(textoDe(peticionesIA[0])).not.toMatch(/Lo que ya se probó en pauta/);
  });

  it("el director: sólo en la pieza que va a pauta", async () => {
    conMuestra();
    respuestaIA = JSON.stringify({ concepto: "c", piezas: [{ n: 1, ficha: "Pieza: un post\nComposición: centrada\nTexto exacto: «Hola»" }] });
    const r = await pedir(JEFE, "/estudio/c1/mejorar", { method: "POST", body: { idea: "Un café frío en la mesa", tipo: "imagen", texto: "Hola", pauta: true } });
    expect(r.status).toBe(200);
    expect(textoDe(peticionesIA[0])).toMatch(/ESTA PIEZA VA A PAUTA\. Lo que ya se probó en pauta con esta marca/);
    peticionesIA.length = 0;
    await pedir(JEFE, "/estudio/c1/mejorar", { method: "POST", body: { idea: "Un café frío en la mesa", tipo: "imagen", texto: "Hola" } });
    expect(textoDe(peticionesIA[0])).not.toMatch(/VA A PAUTA/);
  });
});
