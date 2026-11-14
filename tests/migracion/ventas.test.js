import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { ACCION_MENSAJE } from "../../src/lib/anuncios.js";

// ============================================================
// «Tus ventas de la semana» (curso de campañas, E.1): el enlace del cliente y lo que ve la agencia
//
// Lo que importa:
//   1. El enlace va SIN sesión y por su testigo, que se crea una vez y se reutiliza siempre.
//   2. El cliente sólo escribe la semana actual y las dos anteriores, y nunca ve un costo.
//   3. Lo que dice Meta (conversaciones y pauta por semana) es UNA llamada a /insights, sólo lectura; si falla, las
//      ventas salen igual.
//   4. La tasa de cierre cruza cada semana de ventas con las conversaciones de la ANTERIOR.
//   5. Cada escritura avisa al espacio en el momento (evento `ventas`).
//   6. Otro espacio o un colaborador sin ese cliente no ven nada.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const COLAB = "u-colab";
const LECTOR = "u-lector";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra", [COLAB]: "t-colab", [LECTOR]: "t-lector" };
const SECRETO = "secreto-de-meta-para-pruebas";
// Viernes 6 de noviembre de 2026, 10:00 en Panamá: la semana del 2 al 8.
const AHORA = new Date("2026-11-06T15:00:00Z");

let db;
let env;
let eventos;
let llamadasMeta;
let metaFalla;

/** El día a día de Meta (sólo los días en que gastó), filtrado por el `time_range` que se le pida. */
const DIAS = [
  { date_start: "2026-10-13", spend: "30", actions: [{ action_type: ACCION_MENSAJE, value: "50" }] },
  { date_start: "2026-10-20", spend: "20", actions: [{ action_type: ACCION_MENSAJE, value: "40" }] },
  { date_start: "2026-10-22", spend: "10", actions: [{ action_type: ACCION_MENSAJE, value: "20" }, { action_type: "link_click", value: "99" }] },
  { date_start: "2026-10-27", spend: "40", actions: [{ action_type: ACCION_MENSAJE, value: "80" }] },
  { date_start: "2026-11-03", spend: "20", actions: [{ action_type: ACCION_MENSAJE, value: "84" }] },
];

function falsos() {
  llamadasMeta = [];
  vi.stubGlobal("fetch", async (url) => {
    const u = new URL(String(url));
    if (u.hostname !== "graph.facebook.com") throw new Error(`fetch inesperado a ${u}`);
    llamadasMeta.push(u);
    if (metaFalla) return Response.json({ error: { message: "Error validating access token", type: "OAuthException", code: 190 } }, { status: 400 });
    if (u.pathname.endsWith("/act_111/insights")) {
      const { since, until } = JSON.parse(u.searchParams.get("time_range"));
      return Response.json({ data: DIAS.filter((d) => d.date_start >= since && d.date_start <= until) });
    }
    throw new Error(`Meta inesperado: ${u}`);
  });
}

async function sembrar() {
  const s = db.sqlite;
  const miembro = (id, owner, rol, nombre, extra = {}) => {
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, owner, rol, nombre, "#1E90FF");
    if (extra.clientes) s.prepare("update memberships set clientes = ? where user_id = ?").run(JSON.stringify(extra.clientes), id);
    if (extra.soloLectura) s.prepare("update memberships set solo_lectura = 1 where user_id = ?").run(id);
  };
  for (const id of [JEFE, OTRA, COLAB, LECTOR]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  miembro(JEFE, JEFE, "admin", "Juan");
  miembro(OTRA, OTRA, "admin", "Otra");
  miembro(COLAB, JEFE, "editor", "Colab", { clientes: ["c2"] });
  miembro(LECTOR, JEFE, "editor", "Lector", { soloLectura: true });
  s.prepare("insert into clients (id, owner_id, name, primary_color) values (?,?,?,?)").run("c1", JEFE, "Dcasa", "#0A7A5A");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Sin cuenta");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  s.prepare("insert into integracion_meta (id, owner_id, nombre, token_cifrado, origen, permisos) values (?,?,?,?,?,?)")
    .run(JEFE, JEFE, "Juan", await cifrarMeta(env, "token-persona"), "https://calendarios.test", JSON.stringify(["pages_show_list", "ads_read", "ads_management"]));
  s.prepare("insert into cuentas_anuncios (id, owner_id, externo_id, nombre, moneda, client_id) values (?,?,?,?,?,?)")
    .run(`${JEFE}:act_111`, JEFE, "act_111", "Dcasa Ads", "USD", "c1");
  // Lo que ya decidía la agencia del informe de anuncios: el enlace no puede borrarlo.
  s.prepare("insert into anuncios_clientes (id, owner_id, client_id, informe_automatico, mostrar_costo) values (?,?,?,?,?)").run("ac1", JEFE, "c1", 1, 0);
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json", "X-Pestana": "pestana-1" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const publico = (testigo, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api/publico-ventas/${testigo}`, {
    ...opciones,
    headers: { "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const enlace = async (quien = JEFE, cliente = "c1") => (await (await pedir(quien, `/ventas/${cliente}/enlace`, { method: "POST" })).json()).testigo;
const esperarEventos = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AHORA);
  eventos = [];
  metaFalla = false;
  db = d1EnMemoria();
  env = {
    DB: db, ANTHROPIC_API_KEY: "k", META_APP_ID: "app", META_APP_SECRET: SECRETO,
    ASSETS: { fetch: async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) },
    HUB: {
      idFromName: (n) => n,
      get: (espacio) => ({ fetch: async (req) => { eventos.push({ espacio, ...(await req.json()) }); return new Response("ok"); } }),
    },
  };
  await sembrar();
  falsos();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("el enlace del cliente", () => {
  it("se crea una vez y se reutiliza siempre; no borra lo que la agencia decidía del informe", async () => {
    const r = await pedir(JEFE, "/ventas/c1/enlace", { method: "POST" });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.testigo).toMatch(/^[0-9a-f]{48}$/);
    expect(d.url).toBe(`https://calendarios.test/ventas?t=${d.testigo}`);
    expect(await enlace()).toBe(d.testigo);
    const fila = db.sqlite.prepare("select * from anuncios_clientes where client_id = 'c1'").get();
    expect(fila).toMatchObject({ testigo_ventas: d.testigo, informe_automatico: 1, mostrar_costo: 0 });
  });

  it("un cliente sin fila de anuncios también tiene enlace", async () => {
    const t = await enlace(JEFE, "c2");
    expect(t).toBeTruthy();
    expect(db.sqlite.prepare("select count(*) as n from anuncios_clientes where client_id = 'c2'").get().n).toBe(1);
    expect(await enlace(JEFE, "c2")).toBe(t);
  });

  it("sin testigo válido, 404 (y sin sesión no es un 401: está antes de la sesión)", async () => {
    expect((await publico("corto")).status).toBe(404);
    expect((await publico("x".repeat(48))).status).toBe(404);
    expect((await publico("x".repeat(48), { method: "POST", body: { semana: "2026-11-02", ventas: 1, monto: 1 } })).status).toBe(404);
    expect(db.sqlite.prepare("select count(*) as n from ventas_semana").get().n).toBe(0);
  });

  it("lo de otro espacio no se crea ni se lee", async () => {
    expect((await pedir(JEFE, "/ventas/c9/enlace", { method: "POST" })).status).toBe(404);
    expect((await pedir(JEFE, "/ventas/c9")).status).toBe(404);
    expect((await pedir(OTRA, "/ventas/c1")).status).toBe(404);
  });
});

describe("lo que ve y escribe el cliente, sin sesión", () => {
  it("su nombre, las tres semanas y cuántas personas le escribieron por los anuncios; nunca un costo", async () => {
    const t = await enlace();
    const r = await publico(t);
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.cliente).toEqual({ nombre: "Dcasa", color: "#0A7A5A", logo: null });
    expect(d.hoy).toBe("2026-11-06");
    expect(d.toca).toBe("2026-11-02");
    expect(d.conMeta).toBe(true);
    expect(d.semanas.map((s) => [s.semana, s.nombre, s.conversaciones, s.apuntada])).toEqual([
      ["2026-11-02", "Esta semana", 84, false],
      ["2026-10-26", "La semana pasada", 80, false],
      ["2026-10-19", "Hace 2 semanas", 60, false],
    ]);
    // Ni el gasto, ni el espacio, ni quién de la agencia escribió.
    const texto = JSON.stringify(d);
    expect(texto).not.toMatch(/gasto|spend|owner|por"/);
    // UNA llamada a Meta, sólo lectura, día a día desde la más vieja de las tres.
    expect(llamadasMeta).toHaveLength(1);
    expect(llamadasMeta[0].searchParams.get("time_increment")).toBe("1");
    expect(JSON.parse(llamadasMeta[0].searchParams.get("time_range"))).toEqual({ since: "2026-10-19", until: "2026-11-06" });
  });

  it("guarda la semana, la reemplaza si la vuelve a mandar y avisa al espacio en el momento", async () => {
    const t = await enlace();
    const r = await publico(t, { method: "POST", body: { semana: "2026-11-02", ventas: "4", monto: "$1,250.50", deAnuncios: "3" } });
    expect(r.status).toBe(200);
    expect((await r.json()).semana).toMatchObject({ semana: "2026-11-02", ventas: 4, monto: 1250.5, deAnuncios: 3, otrosCanales: null });
    await esperarEventos();
    expect(eventos).toContainEqual(expect.objectContaining({ espacio: JEFE, tipo: "ventas", clientId: "c1", semana: "2026-11-02", por: { userId: "cliente", nombre: "Dcasa" } }));

    await publico(t, { method: "POST", body: { semana: "2026-11-02", ventas: 5, monto: 1400, otrosCanales: "300", nota: "Una por llamada" } });
    const filas = db.sqlite.prepare("select * from ventas_semana").all();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ owner_id: JEFE, client_id: "c1", semana: "2026-11-02", ventas: 5, monto: 1400, de_anuncios: null, otros_canales: 300, nota: "Una por llamada", origen: "cliente", por: "" });

    const d = await (await publico(t)).json();
    expect(d.semanas[0]).toMatchObject({ apuntada: true, ventas: 5, monto: 1400, otrosCanales: 300, nota: "Una por llamada", origen: "cliente" });
  });

  it("sólo la semana actual y las dos anteriores, y lo mal escrito se dice", async () => {
    const t = await enlace();
    const vieja = await publico(t, { method: "POST", body: { semana: "2026-10-12", ventas: 1, monto: 10 } });
    expect(vieja.status).toBe(400);
    expect((await vieja.json()).error).toMatch(/últimas 3 semanas/);
    const futura = await publico(t, { method: "POST", body: { semana: "2026-11-09", ventas: 1, monto: 10 } });
    expect(futura.status).toBe(400);
    const mal = await publico(t, { method: "POST", body: { semana: "2026-11-02", ventas: "dos", monto: 10 } });
    expect(mal.status).toBe(400);
    expect((await mal.json()).error).toMatch(/entero/);
    expect(db.sqlite.prepare("select count(*) as n from ventas_semana").get().n).toBe(0);
  });

  it("sin cuenta publicitaria, la página sale igual (sin las conversaciones) y no se llama a Meta", async () => {
    const t = await enlace(JEFE, "c2");
    const d = await (await publico(t)).json();
    expect(d.conMeta).toBe(false);
    expect(d.semanas.every((s) => s.conversaciones === null)).toBe(true);
    expect(llamadasMeta).toHaveLength(0);
  });

  it("si Meta falla, el cliente apunta igual", async () => {
    metaFalla = true;
    const t = await enlace();
    const d = await (await publico(t)).json();
    expect(d.conMeta).toBe(false);
    expect((await publico(t, { method: "POST", body: { semana: "2026-10-26", ventas: 2, monto: 200 } })).status).toBe(200);
  });

  it("el enlace de un cliente borrado deja de abrir", async () => {
    const t = await enlace();
    db.sqlite.prepare("delete from clients where id = 'c1'").run();
    expect((await publico(t)).status).toBe(404);
  });
});

describe("lo que ve la agencia", () => {
  it("ocho semanas con la pauta y las conversaciones, la tasa medida con la semana anterior y el ROAS real", async () => {
    const t = await enlace();
    // El cliente apuntó dos semanas por su enlace; la agencia, una más vieja.
    await publico(t, { method: "POST", body: { semana: "2026-11-02", ventas: 4, monto: 600 } });
    await publico(t, { method: "POST", body: { semana: "2026-10-26", ventas: 3, monto: 450 } });
    const put = await pedir(JEFE, "/ventas/c1/2026-10-19", { method: "PUT", body: { ventas: 2, monto: 300, nota: "Por llamada" } });
    expect(put.status).toBe(200);
    expect((await put.json()).semana).toMatchObject({ semana: "2026-10-19", ventas: 2, origen: "agencia", porNombre: "Juan" });

    llamadasMeta = [];
    const r = await pedir(JEFE, "/ventas/c1");
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.semanas).toHaveLength(8);
    expect(d.semanas[0]).toMatchObject({ semana: "2026-11-02", apuntada: true, ventas: 4, gasto: 20, conversaciones: 84, origen: "cliente" });
    expect(d.semanas[1]).toMatchObject({ semana: "2026-10-26", gasto: 40, conversaciones: 80 });
    expect(d.semanas[2]).toMatchObject({ semana: "2026-10-19", gasto: 30, conversaciones: 60, origen: "agencia", por: JEFE, porNombre: "Juan", nota: "Por llamada" });
    expect(d.semanas[3]).toMatchObject({ semana: "2026-10-12", apuntada: false, gasto: 30, conversaciones: 50 });
    expect(d.semanas[7].semana).toBe("2026-09-14");
    expect(d.meta).toEqual({ estado: "ok", mensaje: "", moneda: "USD" });
    expect(d.testigo).toBe(t);
    // Las ventas de cada semana con las conversaciones de la ANTERIOR, y SÓLO semanas cerradas: la del 2 de noviembre
    // va a medias (hoy es viernes 6) y no cuenta. 3 con 60 y 2 con 50.
    expect(d.resumen.tasa).toMatchObject({ ventas: 5, conversaciones: 110, suficiente: true, semanas: ["2026-10-26", "2026-10-19"] });
    expect(d.resumen.tasa.tasa).toBeCloseTo(5 / 110);
    expect(d.resumen.tasaUsada).toBeCloseTo(5 / 110);
    // 750 vendidos con 30 + 30 de pauta.
    expect(d.resumen.gasto).toBe(60);
    expect(d.resumen.roas).toBeCloseTo(12.5);
    expect(d.resumen.costoPorVenta).toBeCloseTo(60 / 5);
    expect(d.resumen.sinMedir).toBeNull();
    // UNA llamada a Meta, una semana más atrás de las ocho (para cruzar la más vieja).
    expect(llamadasMeta).toHaveLength(1);
    expect(JSON.parse(llamadasMeta[0].searchParams.get("time_range"))).toEqual({ since: "2026-09-07", until: "2026-11-06" });
  });

  it("si el cliente no contesta, dice desde cuándo y se usa el 5 %", async () => {
    await pedir(JEFE, "/ventas/c1/2026-10-12", { method: "PUT", body: { ventas: 1, monto: 100 } });
    const d = await (await pedir(JEFE, "/ventas/c1")).json();
    expect(d.resumen.sinMedir).toEqual({ nunca: false, desde: "2026-10-19", ultima: "2026-10-12", semanas: 2 });
    expect(d.resumen.tasa.suficiente).toBe(false);
    expect(d.resumen.tasaUsada).toBe(0.05);
  });

  it("la agencia escribe ocho semanas atrás pero no una que no ha empezado, y nombra la semana por su lunes", async () => {
    expect((await pedir(JEFE, "/ventas/c1/2026-09-14", { method: "PUT", body: { ventas: 1, monto: 1 } })).status).toBe(200);
    expect((await pedir(JEFE, "/ventas/c1/2026-09-07", { method: "PUT", body: { ventas: 1, monto: 1 } })).status).toBe(400);
    expect((await pedir(JEFE, "/ventas/c1/2026-11-09", { method: "PUT", body: { ventas: 1, monto: 1 } })).status).toBe(400);
    expect((await pedir(JEFE, "/ventas/c1/2026-11-04", { method: "PUT", body: { ventas: 1, monto: 1 } })).status).toBe(400);
  });

  it("escribir y quitar avisan al espacio con la pestaña de quien lo hizo", async () => {
    await pedir(JEFE, "/ventas/c1/2026-10-26", { method: "PUT", body: { ventas: 2, monto: 90 } });
    const borrado = await pedir(JEFE, "/ventas/c1/2026-10-26", { method: "DELETE" });
    expect(borrado.status).toBe(200);
    expect((await pedir(JEFE, "/ventas/c1/2026-10-26", { method: "DELETE" })).status).toBe(404);
    await esperarEventos();
    const deVentas = eventos.filter((e) => e.tipo === "ventas");
    expect(deVentas).toHaveLength(2);
    expect(deVentas[0].por).toMatchObject({ userId: JEFE, tab: "pestana-1" });
    expect(db.sqlite.prepare("select count(*) as n from ventas_semana").get().n).toBe(0);
  });

  it("sin la cuenta publicitaria o con Meta caído, las ventas salen igual y se dice por qué", async () => {
    const sinCuenta = await (await pedir(JEFE, "/ventas/c2")).json();
    expect(sinCuenta.meta.estado).toBe("sin-cuenta");
    expect(sinCuenta.semanas.every((s) => s.gasto === null && s.conversaciones === null)).toBe(true);
    expect(sinCuenta.resumen.tasa.tasa).toBeNull();

    metaFalla = true;
    await pedir(JEFE, "/ventas/c1/2026-11-02", { method: "PUT", body: { ventas: 1, monto: 50 } });
    const caido = await (await pedir(JEFE, "/ventas/c1")).json();
    expect(caido.meta.estado).toBe("error");
    expect(caido.meta.mensaje).toBeTruthy();
    expect(caido.semanas[0]).toMatchObject({ apuntada: true, ventas: 1 });
  });

  it("sin los permisos de anuncios no se llama a Meta", async () => {
    db.sqlite.prepare("update integracion_meta set permisos = ? where id = ?").run(JSON.stringify(["pages_show_list"]), JEFE);
    const d = await (await pedir(JEFE, "/ventas/c1")).json();
    expect(d.meta.estado).toBe("sin-permisos");
    expect(llamadasMeta).toHaveLength(0);
  });

  it("la pantalla de la agencia compila aunque todavía no la monte nadie (la monta Números del negocio)", async () => {
    // El build sólo recorre lo que se importa desde la aplicación: sin esto, un error en el componente no se vería
    // hasta montarlo. La página del cliente sí la importa App.jsx (en diferido).
    const { default: VentasSemana } = await import("../../src/components/negocio/VentasSemana.jsx");
    const { default: VentasCliente } = await import("../../src/pages/VentasCliente.jsx");
    expect(typeof VentasSemana).toBe("function");
    expect(typeof VentasCliente).toBe("function");
  });

  it("un colaborador sólo ve sus clientes, y quien es de sólo lectura no escribe", async () => {
    expect((await pedir(COLAB, "/ventas/c1")).status).toBe(404);
    expect((await pedir(COLAB, "/ventas/c2")).status).toBe(200);
    expect((await pedir(COLAB, "/ventas/c1/2026-11-02", { method: "PUT", body: { ventas: 1, monto: 1 } })).status).toBe(404);
    expect((await pedir(LECTOR, "/ventas/c1")).status).toBe(200);
    expect((await pedir(LECTOR, "/ventas/c1/2026-11-02", { method: "PUT", body: { ventas: 1, monto: 1 } })).status).toBe(403);
    expect((await pedir(LECTOR, "/ventas/c1/enlace", { method: "POST" })).status).toBe(403);
  });
});
