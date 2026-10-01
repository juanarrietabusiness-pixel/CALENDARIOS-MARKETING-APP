import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { borradorVacio } from "../../src/lib/anuncios.js";

// ============================================================
// /api/anuncios contra una D1 de verdad y una Meta de mentira
//
// Lo que importa, por orden de gravedad:
//
//   1. Nada se crea activo: las cuatro llamadas que crean algo llevan
//      `status=PAUSED`.
//   2. Activar exige administrador (403) y `confirmado: true` (409) en el
//      SERVIDOR; pausar, cualquiera que pueda escribir.
//   3. Una campaña, un cliente o una cuenta de otro (espacio, colaborador,
//      cuenta publicitaria) no existe.
//   4. Queda apuntado quién creó, activó o pausó qué.
//
// Ninguna petición sale a Internet: el `fetch` falso revienta con
// cualquier host que no sea el de la Graph API.
// ============================================================

const JEFE = "u-jefe";
const EDITOR = "u-editor";
const COLAB = "u-colab";
const OTRA = "u-otra";
const TESTIGO = { [JEFE]: "t-jefe", [EDITOR]: "t-editor", [COLAB]: "t-colab", [OTRA]: "t-otra" };
const SECRETO = "secreto-meta";

let db;
let env;
let llamadas;
let campanasMeta;
let videoListo;

function r2() {
  const objetos = new Map([
    ["clientes/c1/estudio/foto.png", { tipo: "image/png", datos: new Uint8Array([137, 80, 78, 71]) }],
    ["clientes/c1/posts/reel.mp4", { tipo: "video/mp4", datos: new Uint8Array([0, 0, 0, 24]) }],
    ["clientes/c1/posts/doc.pdf", { tipo: "application/pdf", datos: new Uint8Array([37, 80]) }],
  ]);
  return {
    objetos,
    async get(clave) {
      const o = objetos.get(clave);
      if (!o) return null;
      return {
        body: o.datos, size: o.datos.length, httpMetadata: { contentType: o.tipo }, httpEtag: '"x"',
        arrayBuffer: async () => o.datos.buffer, writeHttpMetadata: (h) => h.set("content-type", o.tipo),
      };
    },
    async put() {},
    async delete() {},
  };
}

const respuesta = (datos, estado = 200) => new Response(JSON.stringify(datos), { status: estado, headers: { "content-type": "application/json" } });

/** Lo que contesta Meta, según su documentación. */
async function meta(entrada, init = {}) {
  const u = new URL(String(entrada));
  if (u.hostname !== "graph.facebook.com" && u.hostname !== "graph-video.facebook.com") {
    throw new Error(`Petición a Internet en un test: ${u.href}`);
  }
  const metodo = init.method ?? "GET";
  let cuerpo = {};
  if (init.body instanceof FormData) cuerpo = Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === "string" ? v : `<archivo ${v.type}>`]));
  else if (init.body) cuerpo = Object.fromEntries(new URLSearchParams(String(init.body)));
  const ruta = u.pathname.replace(/^\/v[\d.]+/, "");
  llamadas.push({ metodo, host: u.hostname, ruta, params: Object.fromEntries(u.searchParams), cuerpo });

  if (ruta === "/me/adaccounts") {
    return respuesta({ data: [
      { id: "act_111", account_id: "111", name: "Café Luna Ads", currency: "USD", account_status: 1, timezone_name: "America/Panama", min_daily_budget: 100, business: { name: "Café Luna" } },
      { id: "act_222", account_id: "222", name: "Otra marca", currency: "COP", account_status: 1, timezone_name: "America/Bogota" },
    ] });
  }
  if (ruta === "/act_111/campaigns" && metodo === "GET") {
    return respuesta({ data: Object.values(campanasMeta).map((c) => ({ ...c, insights: { data: [{ spend: "12.50", impressions: "3000", reach: "2100", clicks: "90", cpm: "4.16", cpc: "0.13", ctr: "3", actions: [{ action_type: "link_click", value: "80" }] }] } })) });
  }
  if (ruta.startsWith("/act_111/insights")) {
    return respuesta({ data: u.searchParams.get("time_increment")
      ? [{ date_start: "2026-09-29", spend: "5" }, { date_start: "2026-09-30", spend: "7.5" }]
      : [{ spend: "12.5", impressions: "3000", reach: "2100", clicks: "90" }] });
  }
  if (ruta === "/act_111/campaigns" && metodo === "POST") {
    campanasMeta["900"] = { id: "900", name: cuerpo.name, status: cuerpo.status, effective_status: cuerpo.status, objective: cuerpo.objective, account_id: "111" };
    return respuesta({ id: "900" });
  }
  if (ruta === "/act_111/adsets" && metodo === "POST") return respuesta({ id: "901" });
  if (ruta === "/act_111/adcreatives" && metodo === "POST") return respuesta({ id: "902" });
  if (ruta === "/act_111/ads" && metodo === "POST") return respuesta({ id: "903" });
  if (ruta === "/act_111/adimages" && metodo === "POST") return respuesta({ images: { "foto.png": { hash: "HASH123", url: "https://scontent.fbcdn.net/x.png" } } });
  if (ruta === "/act_111/advideos" && metodo === "POST") return respuesta({ id: "7001" });
  if (ruta === "/act_111/adspixels") return respuesta({ data: [{ id: "555", name: "Píxel web" }] });
  if (ruta === "/search") return respuesta({ data: [{ key: "2510", name: "David", region: "Chiriquí", country_code: "PA" }] });
  if (ruta === "/7001") return respuesta({ status: { video_status: videoListo ? "ready" : "processing" }, thumbnails: { data: [{ uri: "https://scontent.fbcdn.net/t.jpg", is_preferred: true }] } });
  const id = ruta.slice(1).split("/")[0];
  if (/^\d+$/.test(id) && metodo === "GET" && !ruta.includes("/", 1)) {
    const c = campanasMeta[id];
    return c ? respuesta({ ...c, adsets: { data: [{ id: "901", status: "PAUSED", daily_budget: "1000", start_time: "2026-10-01T00:00:00-0500", end_time: "2026-10-15T23:59:59-0500" }] } })
      : respuesta({ error: { message: "Unsupported get request", code: 100 } }, 400);
  }
  if (/^\d+$/.test(id) && ruta.endsWith("/adsets")) return respuesta({ data: [{ id: "901", name: "Conjunto", status: "PAUSED", daily_budget: "1000" }] });
  if (/^\d+$/.test(id) && ruta.endsWith("/ads")) return respuesta({ data: [{ id: "903", name: "Anuncio", status: "PAUSED", creative: { title: "2x1", body: "Ven", thumbnail_url: "https://scontent.fbcdn.net/t.jpg" } }] });
  if (/^\d+$/.test(id) && ruta.endsWith("/insights")) return respuesta({ data: [{ date_start: "2026-09-30", spend: "3" }] });
  if (/^\d+$/.test(id) && metodo === "POST") {
    if (campanasMeta[id]) campanasMeta[id] = { ...campanasMeta[id], status: cuerpo.status, effective_status: cuerpo.status };
    return respuesta({ success: true });
  }
  if (/^\d+$/.test(id) && metodo === "DELETE") return respuesta({ success: true });
  return respuesta({ error: { message: `ruta no prevista: ${ruta}`, code: 100 } }, 400);
}

async function sembrar({ permisos = ["pages_show_list", "ads_read", "ads_management"] } = {}) {
  const s = db.sqlite;
  for (const id of [JEFE, EDITOR, COLAB, OTRA]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(EDITOR, JEFE, "editor", "Ana", "#123456");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Colab", "#654321", '["c2"]');
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#abcdef");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  s.prepare("insert into integracion_meta (id, owner_id, nombre, token_cifrado, origen, permisos) values (?,?,?,?,?,?)")
    .run(JEFE, JEFE, "Juan", await cifrarMeta(env, "token-persona"), "https://calendarios.test", JSON.stringify(permisos));
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, client_id) values (?,?,?,?,?)").run("fb1", JEFE, "facebook", "PAGINA1", "c1");
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, client_id) values (?,?,?,?,?)").run("ig1", JEFE, "instagram", "IG1", "c1");
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api/anuncios${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

/** Sincroniza y asigna act_111 a c1, como haría el administrador. */
async function conCuenta() {
  expect((await pedir(JEFE, "/cuentas/sincronizar", { method: "POST" })).status).toBe(200);
  expect((await pedir(JEFE, `/cuentas/${JEFE}:act_111`, { method: "PUT", body: { clientId: "c1" } })).status).toBe(200);
  llamadas.length = 0;
}

const borrador = (cambios = {}) => ({
  ...borradorVacio("2026-10-01"),
  nombre: "Octubre · Tráfico",
  presupuesto: { tipo: "diario", monto: "10" },
  anuncio: { medio: { clave: "clientes/c1/estudio/foto.png", tipo: "imagen", hash: "HASH123" }, texto: "Ven a probar", titulo: "2x1", enlace: "https://cafe.pa", boton: "LEARN_MORE" },
  ...cambios,
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), META_APP_ID: "app", META_APP_SECRET: SECRETO, ASSETS: { fetch: async () => new Response("") } };
  llamadas = [];
  campanasMeta = {
    800: { id: "800", name: "Septiembre", status: "ACTIVE", effective_status: "ACTIVE", objective: "OUTCOME_TRAFFIC", daily_budget: "500", account_id: "111" },
  };
  videoListo = false;
  vi.stubGlobal("fetch", vi.fn(meta));
  await sembrar();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("cuentas publicitarias", () => {
  it("se leen de /me/adaccounts con el token de la persona y se asignan a un cliente", async () => {
    await pedir(JEFE, "/cuentas/sincronizar", { method: "POST" });
    expect(llamadas[0]).toMatchObject({ ruta: "/me/adaccounts", params: { access_token: "token-persona" } });
    const antes = await (await pedir(JEFE, "/estado")).json();
    expect(antes.cuentas.map((c) => c.externoId)).toEqual(["act_111", "act_222"]);
    expect(antes.faltan).toEqual([]);

    await pedir(JEFE, `/cuentas/${JEFE}:act_111`, { method: "PUT", body: { clientId: "c1" } });
    // Releer conserva la asignación.
    await pedir(JEFE, "/cuentas/sincronizar", { method: "POST" });
    const despues = await (await pedir(JEFE, "/estado")).json();
    expect(despues.cuentas.find((c) => c.externoId === "act_111")).toMatchObject({ clientId: "c1", moneda: "USD", minimoDiario: 100 });
  });

  it("una cuenta por cliente: asignar otra deja libre la anterior", async () => {
    await conCuenta();
    await pedir(JEFE, `/cuentas/${JEFE}:act_222`, { method: "PUT", body: { clientId: "c1" } });
    const { cuentas } = await (await pedir(JEFE, "/estado")).json();
    expect(cuentas.find((c) => c.externoId === "act_111").clientId).toBeNull();
    expect(cuentas.find((c) => c.externoId === "act_222").clientId).toBe("c1");
  });

  it("releerlas es del administrador", async () => {
    expect((await pedir(EDITOR, "/cuentas/sincronizar", { method: "POST" })).status).toBe(403);
  });

  it("sin los permisos de anuncios lo dice, y no llama a Meta", async () => {
    db.sqlite.prepare("update integracion_meta set permisos = ?").run(JSON.stringify(["pages_show_list"]));
    const estado = await (await pedir(JEFE, "/estado")).json();
    expect(estado.faltan).toEqual(["ads_read", "ads_management"]);
    const res = await pedir(JEFE, "/cuentas/sincronizar", { method: "POST" });
    expect(res.status).toBe(409);
    expect((await res.json()).faltan).toEqual(["ads_read", "ads_management"]);
    expect(llamadas).toHaveLength(0);
  });

  it("otro espacio no ve las cuentas, y un colaborador sólo las de sus clientes", async () => {
    await conCuenta();
    expect((await (await pedir(OTRA, "/estado")).json()).cuentas).toEqual([]);
    expect((await (await pedir(COLAB, "/estado")).json()).cuentas).toEqual([]);
  });
});

describe("campañas y estadísticas", () => {
  it("la lista trae estado, objetivo, presupuesto en unidades de la moneda y las cifras del rango", async () => {
    await conCuenta();
    const res = await pedir(JEFE, "/clientes/c1/campanas?rango=7");
    expect(res.status).toBe(200);
    const { campanas, periodo, cuenta } = await res.json();
    expect(cuenta.moneda).toBe("USD");
    expect(periodo).toEqual({ desde: "2026-09-24", hasta: "2026-09-30" });
    expect(campanas[0]).toMatchObject({ id: "800", estado: "ACTIVE", objetivo: "OUTCOME_TRAFFIC", presupuesto: { diario: 5, total: null } });
    expect(campanas[0].insights.spend).toBe("12.50");
    expect(llamadas[0].params.fields).toContain("insights.date_preset(last_7d){");
  });

  it("las estadísticas de la cuenta: total y día a día, dos llamadas (el alcance no se suma)", async () => {
    await conCuenta();
    const r = await (await pedir(JEFE, "/clientes/c1/estadisticas?rango=30")).json();
    expect(r.total.spend).toBe("12.5");
    expect(r.dias).toHaveLength(2);
    expect(llamadas.filter((l) => l.ruta === "/act_111/insights")).toHaveLength(2);
  });

  it("el detalle de una campaña: conjuntos, anuncios (miniatura por el proxy) y día a día", async () => {
    await conCuenta();
    const d = await (await pedir(JEFE, "/clientes/c1/campanas/800?rango=30")).json();
    expect(d.conjuntos[0]).toMatchObject({ id: "901", presupuesto: { diario: 10 } });
    expect(d.anuncios[0].miniatura).toMatch(/^\/api\/metricas\/miniatura\?u=/);
    expect(d.dias).toHaveLength(1);
  });

  it("una campaña de OTRA cuenta publicitaria no existe para este cliente", async () => {
    await conCuenta();
    campanasMeta["850"] = { id: "850", name: "Ajena", status: "PAUSED", account_id: "999" };
    expect((await pedir(JEFE, "/clientes/c1/campanas/850")).status).toBe(404);
    expect((await pedir(JEFE, "/clientes/c1/campanas/850/pausar", { method: "POST" })).status).toBe(404);
  });

  it("un cliente sin cuenta asignada lo dice", async () => {
    await conCuenta();
    const res = await pedir(JEFE, "/clientes/c2/campanas");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/cuenta publicitaria/);
  });

  it("un cliente de otro espacio, o de otro colaborador, no existe", async () => {
    await conCuenta();
    expect((await pedir(OTRA, "/clientes/c1/campanas")).status).toBe(404);
    expect((await pedir(COLAB, "/clientes/c1/campanas")).status).toBe(404);
    expect((await pedir(JEFE, "/clientes/c9/campanas")).status).toBe(404);
  });
});

describe("crear: todo en pausa", () => {
  it("campaña → conjunto → creativo → anuncio, las cuatro con status PAUSED y los campos obligatorios", async () => {
    await conCuenta();
    const res = await pedir(EDITOR, "/clientes/c1/campanas", { method: "POST", body: { borrador: borrador() } });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: "900", estado: "PAUSED" });

    const posts = llamadas.filter((l) => l.metodo === "POST");
    expect(posts.map((l) => l.ruta)).toEqual(["/act_111/campaigns", "/act_111/adsets", "/act_111/adcreatives", "/act_111/ads"]);
    for (const l of posts.filter((x) => x.ruta !== "/act_111/adcreatives")) expect(l.cuerpo.status).toBe("PAUSED");
    expect(posts[0].cuerpo).toMatchObject({ objective: "OUTCOME_TRAFFIC", special_ad_categories: "[]", is_adset_budget_sharing_enabled: "false" });
    expect(posts[1].cuerpo).toMatchObject({ campaign_id: "900", daily_budget: "1000", bid_strategy: "LOWEST_COST_WITHOUT_CAP" });
    expect(JSON.parse(posts[1].cuerpo.targeting).targeting_automation).toEqual({ advantage_audience: 0 });
    expect(JSON.parse(posts[2].cuerpo.object_story_spec)).toMatchObject({ page_id: "PAGINA1", instagram_user_id: "IG1" });
    expect(posts[3].cuerpo).toMatchObject({ adset_id: "901", creative: '{"creative_id":"902"}' });
    // El token va en el cuerpo, nunca en la dirección.
    for (const l of posts) expect(l.params.access_token).toBeUndefined();
  });

  it("queda apuntado quién la creó, cuándo y para qué cliente", async () => {
    await conCuenta();
    await pedir(EDITOR, "/clientes/c1/campanas", { method: "POST", body: { borrador: borrador() } });
    const fila = db.sqlite.prepare("select * from campanas_anuncios").get();
    expect(fila).toMatchObject({ owner_id: JEFE, client_id: "c1", campana_id: "900", anuncio_id: "903", estado: "PAUSED", creado_por: EDITOR, creado_nombre: "Ana" });
    const h = await (await pedir(JEFE, "/clientes/c1/historial")).json();
    expect(h[0]).toMatchObject({ accion: "crear", nombre: "Ana", campanaId: "900" });
    const lista = await (await pedir(JEFE, "/clientes/c1/campanas")).json();
    expect(lista.campanas.find((c) => c.id === "900").desdeApp).toMatchObject({ creadoPor: "Ana" });
  });

  it("un borrador que no valida no llega a Meta: 400 con los errores", async () => {
    await conCuenta();
    const res = await pedir(JEFE, "/clientes/c1/campanas", { method: "POST", body: { borrador: borrador({ nombre: "" }) } });
    expect(res.status).toBe(400);
    expect((await res.json()).errores[0].campo).toBe("nombre");
    expect(llamadas).toHaveLength(0);
  });

  it("sin página de Facebook asignada no se puede: los anuncios salen a nombre de una página", async () => {
    await conCuenta();
    db.sqlite.prepare("delete from cuentas_sociales where red = 'facebook'").run();
    const res = await pedir(JEFE, "/clientes/c1/campanas", { method: "POST", body: { borrador: borrador() } });
    expect(res.status).toBe(409);
    expect(llamadas).toHaveLength(0);
  });

  it("si Meta falla a medias, se borra la campaña creada y no queda fila", async () => {
    await conCuenta();
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (e, i) => (String(e).includes("/adcreatives")
      ? respuesta({ error: { message: "Invalid parameter", code: 100, error_user_title: "Enlace no válido", error_user_msg: "El enlace no funciona." } }, 400)
      : original(e, i))));
    const res = await pedir(JEFE, "/clientes/c1/campanas", { method: "POST", body: { borrador: borrador() } });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Enlace no válido/);
    expect(llamadas.some((l) => l.metodo === "DELETE" && l.ruta === "/900")).toBe(true);
    expect(db.sqlite.prepare("select count(*) as n from campanas_anuncios").get().n).toBe(0);
  });
});

describe("activar: sólo el administrador, y confirmando", () => {
  async function creada() {
    await conCuenta();
    await pedir(JEFE, "/clientes/c1/campanas", { method: "POST", body: { borrador: borrador() } });
    llamadas.length = 0;
  }

  it("un editor recibe 403 y no se toca Meta", async () => {
    await creada();
    const res = await pedir(EDITOR, "/clientes/c1/campanas/900/activar", { method: "POST", body: { confirmado: true } });
    expect(res.status).toBe(403);
    expect(llamadas).toHaveLength(0);
  });

  it("sin `confirmado: true` es 409 con el presupuesto y las fechas para el diálogo, y nada cambia", async () => {
    await creada();
    for (const body of [{}, { confirmado: "true" }, { confirmado: 1 }]) {
      const res = await pedir(JEFE, "/clientes/c1/campanas/900/activar", { method: "POST", body });
      expect(res.status).toBe(409);
      const r = await res.json();
      expect(r.confirmar.resumen).toMatch(/10,00.*al día/);
      expect(r.confirmar.resumen).toMatch(/15 oct/);
    }
    expect(llamadas.filter((l) => l.metodo === "POST")).toHaveLength(0);
    expect(campanasMeta["900"].status).toBe("PAUSED");
  });

  it("con confirmación enciende anuncio, conjunto y, la última, la campaña; y lo apunta", async () => {
    await creada();
    const res = await pedir(JEFE, "/clientes/c1/campanas/900/activar", { method: "POST", body: { confirmado: true } });
    expect(res.status).toBe(200);
    const posts = llamadas.filter((l) => l.metodo === "POST");
    expect(posts.map((l) => [l.ruta, l.cuerpo.status])).toEqual([["/903", "ACTIVE"], ["/901", "ACTIVE"], ["/900", "ACTIVE"]]);
    expect(db.sqlite.prepare("select estado, activada_por from campanas_anuncios").get()).toEqual({ estado: "ACTIVE", activada_por: "Juan" });
    const h = await (await pedir(JEFE, "/clientes/c1/historial")).json();
    expect(h.map((x) => x.accion)).toEqual(["activar", "crear"]);
  });

  it("una campaña creada fuera de la app sólo enciende la campaña", async () => {
    await conCuenta();
    campanasMeta["800"].status = "PAUSED";
    await pedir(JEFE, "/clientes/c1/campanas/800/activar", { method: "POST", body: { confirmado: true } });
    expect(llamadas.filter((l) => l.metodo === "POST").map((l) => l.ruta)).toEqual(["/800"]);
  });
});

describe("pausar: cualquiera que pueda escribir", () => {
  it("un editor pausa, sólo la campaña, y queda apuntado", async () => {
    await conCuenta();
    const res = await pedir(EDITOR, "/clientes/c1/campanas/800/pausar", { method: "POST" });
    expect(res.status).toBe(200);
    expect(llamadas.filter((l) => l.metodo === "POST").map((l) => [l.ruta, l.cuerpo.status])).toEqual([["/800", "PAUSED"]]);
    const h = await (await pedir(JEFE, "/clientes/c1/historial")).json();
    expect(h[0]).toMatchObject({ accion: "pausar", nombre: "Ana" });
  });

  it("alguien de sólo lectura, no", async () => {
    await conCuenta();
    db.sqlite.prepare("update memberships set solo_lectura = 1 where user_id = ?").run(EDITOR);
    expect((await pedir(EDITOR, "/clientes/c1/campanas/800/pausar", { method: "POST" })).status).toBe(403);
  });
});

describe("los medios del anuncio", () => {
  it("lista lo del Estudio y lo de las publicaciones del cliente, con el texto de la publicación", async () => {
    db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime) values (?,?,?,?,?,?)")
      .run("a1", JEFE, "c1", "clientes/c1/estudio/foto.png", "imagen", "image/png");
    db.sqlite.prepare("insert into calendars (id, client_id, owner_id, month, year, days) values (?,?,?,?,?,?)")
      .run("cal1", "c1", JEFE, 9, 2026, JSON.stringify([{ date: "2026-10-03", posts: [{ id: "p1", idea: "Reel del latte", descripcion: "El mejor latte", medios: [{ src: "/api/media/clientes/c1/posts/reel.mp4", tipo: "video" }] }] }]));
    const lista = await (await pedir(JEFE, "/clientes/c1/medios")).json();
    expect(lista.map((m) => [m.origen, m.tipo, m.clave])).toEqual([
      ["estudio", "imagen", "clientes/c1/estudio/foto.png"],
      ["publicacion", "video", "clientes/c1/posts/reel.mp4"],
    ]);
    expect(lista[1].texto).toBe("El mejor latte");
  });

  it("una imagen sube a /adimages por partes y devuelve el hash", async () => {
    await conCuenta();
    const res = await pedir(JEFE, "/clientes/c1/medio", { method: "POST", body: { clave: "clientes/c1/estudio/foto.png" } });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ tipo: "imagen", hash: "HASH123", listo: true });
    expect(llamadas[0]).toMatchObject({ ruta: "/act_111/adimages", cuerpo: { access_token: "token-persona", filename: "<archivo image/png>" } });
  });

  it("un video lo descarga Meta de una dirección firmada; se espera a que esté listo", async () => {
    await conCuenta();
    const r = await (await pedir(JEFE, "/clientes/c1/medio", { method: "POST", body: { clave: "/api/media/clientes/c1/posts/reel.mp4" } })).json();
    expect(r).toMatchObject({ tipo: "video", videoId: "7001", listo: false });
    expect(llamadas[0].host).toBe("graph-video.facebook.com");
    expect(llamadas[0].cuerpo.file_url).toMatch(/^https:\/\/calendarios\.test\/api\/medio-publico\/.+\/reel\.mp4$/);
    expect((await (await pedir(JEFE, "/clientes/c1/video/7001")).json()).listo).toBe(false);
    videoListo = true;
    expect(await (await pedir(JEFE, "/clientes/c1/video/7001")).json()).toMatchObject({ listo: true, miniatura: "https://scontent.fbcdn.net/t.jpg" });
  });

  it("con video, crear no sale hasta que Meta lo procesó; luego va como video_data", async () => {
    await conCuenta();
    const b = borrador();
    b.anuncio.medio = { clave: "clientes/c1/posts/reel.mp4", tipo: "video", videoId: "7001", listo: true };
    expect((await pedir(JEFE, "/clientes/c1/campanas", { method: "POST", body: { borrador: b } })).status).toBe(409);
    videoListo = true;
    expect((await pedir(JEFE, "/clientes/c1/campanas", { method: "POST", body: { borrador: b } })).status).toBe(201);
    const creativo = llamadas.find((l) => l.ruta === "/act_111/adcreatives");
    expect(JSON.parse(creativo.cuerpo.object_story_spec).video_data).toMatchObject({ video_id: "7001", image_url: "https://scontent.fbcdn.net/t.jpg" });
  });

  it("un archivo de otro cliente, o que no es imagen ni video, no se sube", async () => {
    await conCuenta();
    expect((await pedir(JEFE, "/clientes/c1/medio", { method: "POST", body: { clave: "clientes/c2/posts/x.png" } })).status).toBe(403);
    expect((await pedir(JEFE, "/clientes/c1/medio", { method: "POST", body: { clave: "clientes/c1/../c2/x.png" } })).status).toBe(403);
    expect((await pedir(JEFE, "/clientes/c1/medio", { method: "POST", body: { clave: "clientes/c1/posts/doc.pdf" } })).status).toBe(415);
    expect(llamadas).toHaveLength(0);
  });
});

describe("público y píxel", () => {
  it("las ciudades se buscan en Meta con el país", async () => {
    await conCuenta();
    const r = await (await pedir(JEFE, "/clientes/c1/ciudades?q=David&pais=PA")).json();
    expect(r).toEqual([{ key: "2510", nombre: "David", region: "Chiriquí", pais: "PA" }]);
    expect(llamadas[0].params).toMatchObject({ type: "adgeolocation", q: "David", country_code: "PA", location_types: '["city"]' });
  });

  it("los píxeles de la cuenta", async () => {
    await conCuenta();
    expect(await (await pedir(JEFE, "/clientes/c1/pixeles")).json()).toEqual([{ id: "555", nombre: "Píxel web" }]);
  });
});

describe("«Conceder permisos de anuncios»", () => {
  const conectar = (quien, extra = "") =>
    worker.fetch(new Request(`https://calendarios.test/api/redes/meta/conectar${extra}`, { headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}` } }), env);

  it("abre el mismo OAuth con ads_read y ads_management además de los de siempre", async () => {
    const res = await conectar(JEFE, "?para=anuncios");
    expect(res.status).toBe(302);
    const scope = new URL(res.headers.get("Location")).searchParams.get("scope").split(",");
    expect(scope).toEqual(expect.arrayContaining(["ads_read", "ads_management", "pages_show_list"]));
  });

  it("«Conectar Meta» a secas sigue sin pedirlos", async () => {
    const scope = new URL((await conectar(JEFE)).headers.get("Location")).searchParams.get("scope");
    expect(scope).not.toMatch(/ads_/);
  });

  it("con el inicio de sesión para empresas usa SU configuración, y sin ella lo dice", async () => {
    env.META_CONFIG_ID = "cfg-base";
    expect((await conectar(JEFE, "?para=anuncios")).status).toBe(503);
    env.META_CONFIG_ID_ANUNCIOS = "cfg-anuncios";
    const u = new URL((await conectar(JEFE, "?para=anuncios")).headers.get("Location"));
    expect(u.searchParams.get("config_id")).toBe("cfg-anuncios");
    expect(new URL((await conectar(JEFE)).headers.get("Location")).searchParams.get("config_id")).toBe("cfg-base");
  });

  it("es del administrador", async () => {
    expect((await conectar(EDITOR, "?para=anuncios")).status).toBe(403);
  });
});
