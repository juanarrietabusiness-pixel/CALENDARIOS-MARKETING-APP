import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE, clientesPermitidos } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { DEFINICIONES_CAMPANAS } from "../../worker/lib/herramientasCampanas.js";
import { idDelCiclo, errorDeReparto } from "../../worker/lib/planCampanas.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { planATextoCiclo } from "../../src/lib/planCiclo.js";
import { dineroCorto } from "../../src/lib/numerosNegocio.js";
import { ACCION_MENSAJE } from "../../src/lib/anuncios.js";
import { cifrarMeta } from "../../worker/lib/meta.js";

// ============================================================
// CAMPAÑAS Y NÚMEROS por MCP, contra una D1 de verdad y una IA de mentira
//
// Lo que importa:
//   1. numeros_del_negocio da EL número mágico de la aplicación (el mismo de la ficha de la pantalla), cada dato con su
//      origen, o qué le falta; con proponer, lo que propone la IA SIN guardar.
//   2. guardar_numeros_negocio: sin confirmado no escribe nada y dice de qué a qué; con el sí, guarda con la misma
//      limpieza que la pantalla y no pisa a otra persona (el `antes`).
//   3. escribir_textos_anuncios escribe por el motor del plan (escribirTextosDelPlan), lo guarda en el plan y en la
//      publicación sin pisar, y dice los textos.
//   4. ajustar_plan_campanas guarda «¿Qué vas a hacer?» y los huecos al momento; el reparto, sólo con confirmado.
//   5. Otro espacio u otro colaborador: «no encontré»; plan_de_campanas dice el hueco de cada anuncio (lo que se copia
//      en la pantalla, no).
//
// Ninguna petición sale a Internet: el `fetch` falso revienta con cualquiera que no sea Anthropic.
// ============================================================

const JEFE = "u-jefe";
const COLAB = "u-colab";
const LECTOR = "u-lector";
const OTRA = "u-otra";

let db;
let env;
let eventos;
let pedidosIA;
let respuestaIA;
let pendientes;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

const NEGOCIO = {
  v: 1, tipo: "productos", destino: "whatsapp", cuenta: "historial",
  ticket: { valor: 20, origen: "cliente" }, invertir: { valor: 16, origen: "agencia" }, metaVentas: { valor: 1000, origen: "agencia" },
  tasaCierre: { valor: 9, origen: "cliente" }, itbms: { valor: 0, origen: "cliente" },
  costos: [{ nombre: "Producto", pct: 40, origen: "cliente" }],
};
const MALETAS = {
  publico: "Mujeres de 28 a 45 años en Ciudad de Panamá.", problema: "El sofá viejo se hunde.", solucion: "Un sofá que se abre en cama.",
  diferenciales: "Fabricado en Panamá.", testimonios: "", objeciones: "", garantia: "",
};
const post = (id, extra = {}) => ({ id, format: "post", title: `Pieza ${id}`, descripcion: "¿Tu sofá se hunde? El sofá cama que se abre en diez segundos. Escríbenos por WhatsApp.", ...extra });

async function sembrar() {
  const s = db.sqlite;
  for (const id of [JEFE, COLAB, LECTOR, OTRA]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
  }
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)").run(await sha256("t-jefe"), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Colab", "#654321", '["c2"]');
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura) values (?,?,?,?,?,?)").run(LECTOR, JEFE, "editor", "Lector", "#777777", 1);
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#abcdef");
  s.prepare("insert into clients (id, owner_id, name, industry) values (?,?,?,?)").run("c1", JEFE, "Dcasa", "Muebles");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  s.prepare("insert into anuncios_clientes (id, client_id, owner_id, negocio, mostrar_costo) values (?,?,?,?,?)").run("ac1", "c1", JEFE, JSON.stringify(NEGOCIO), 0);
  s.prepare("insert into mercado_clientes (id, client_id, owner_id, catalogo, estudio) values (?,?,?,?,?)").run("m1", "c1", JEFE,
    JSON.stringify([{ id: "sofa", nombre: "Sofá cama", precio: "$450", activo: true }, { id: "mesa", nombre: "Mesa de centro", precio: "$150", activo: true }]),
    JSON.stringify({
      aprobadoAt: "2026-10-01T00:00:00.000Z",
      general: { resumen: "Muebles en Panamá.", perfiles: [{ nombre: "Mamá práctica", quien: "Mamás de 30 a 45" }], deseos: [] },
      productos: { sofa: { elementos: MALETAS, angulos: [
        { id: "visitas", nombre: "Las visitas que se quedan", publico: "frio", ganchos: ["¿Y si se quedan a dormir?"] },
        { id: "garantia", nombre: "Dos años sin preocuparte", publico: "tibio" },
      ] } },
    }));
  const dias = (lista) => JSON.stringify(lista);
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days, offers) values (?,?,?,?,?,?,?,?)").run("cal-11", "c1", JEFE, "Noviembre", 10, 2026, dias([
    { date: "2026-11-04", posts: [post("p3", { pauta: { etapa: "evaluacion" }, anuncio: { textos: ["Texto uno", "Texto dos", "Texto tres"], titulos: ["Sofá cama"], descripcion: "Envío gratis" } })] },
    { date: "2026-11-07", posts: [post("p6", { pauta: { etapa: "conversion" }, descripcion: "Black Friday: 15 % en el sofá cama. Escríbenos por WhatsApp." })] },
  ]), "15 % de descuento por Black Friday");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)").run("cal-10", "c1", JEFE, "Octubre", 9, 2026, dias([
    { date: "2026-10-02", posts: [post("p1", { status: "published" })] },
    { date: "2026-10-03", posts: [post("p2", { status: "published" }), post("vivo", { format: "live" })] },
  ]));
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)").run("cal-c2", "c2", JEFE, "Noviembre", 10, 2026, dias([
    { date: "2026-11-05", posts: [post("p-cafe")] },
  ]));
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, client_id) values (?,?,?,?,?)").run("ig1", JEFE, "instagram", "IG1", "c1");
  const cola = s.prepare(`insert into publicaciones_programadas (id, owner_id, client_id, calendar_id, post_id, red, cuenta_id, programada_para, estado, externo_id, enlace, variante)
    values (?,?,?,?,?,?,?,?,?,?,?,?)`);
  cola.run("q1", JEFE, "c1", "cal-10", "p1", "instagram", "ig1", "2026-10-02T14:00:00.000Z", "publicada", "m-1", "https://www.instagram.com/p/AAA/", "post");
  cola.run("q2", JEFE, "c1", "cal-10", "p2", "instagram", "ig1", "2026-10-03T14:00:00.000Z", "publicada", "m-2", "https://www.instagram.com/p/BBB/", "post");
  const metrica = s.prepare(`insert into metricas_publicacion (id, owner_id, client_id, cuenta_id, red, externo_id, tipo, publicada_at, interacciones, updated_at)
    values (?,?,?,?,?,?,?,?,?,?)`);
  [["m-1", 40], ["m-2", 10], ["m-3", 10], ["m-4", 9], ["m-5", 12]].forEach(([id, n]) =>
    metrica.run(`ig1:${id}`, JEFE, "c1", "ig1", "instagram", id, "post", "2026-10-02T14:00:00.000Z", n, "2026-10-10T00:00:00.000Z"));
}

/** El perfil como lo arma la sesión del MCP (sesion.js). */
function perfil(id) {
  const m = db.sqlite.prepare("select * from memberships where user_id = ?").get(id);
  return { id, nombre: m.nombre, ownerId: m.owner_id, rol: m.rol, soloLectura: Boolean(m.solo_lectura), clientes: m.rol !== "admin" ? clientesPermitidos(m.clientes) : null };
}
async function llamar(nombre, entrada, id = JEFE) {
  const usuario = perfil(id);
  const r = await crearHerramientasMCP({ env, acceso: crearAcceso(db, usuario.ownerId, { clientes: usuario.clientes }), usuario }).llamar(nombre, entrada);
  return { texto: r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"), error: Boolean(r.isError) };
}
const negocioGuardado = () => JSON.parse(db.sqlite.prepare("select negocio from anuncios_clientes where client_id = 'c1'").get().negocio);
const guardadoDelPlan = () => JSON.parse(db.sqlite.prepare("select datos from planes_campana where id = ?").get(idDelCiclo("c1", "2026-11"))?.datos ?? "{}");
const leerPost = (cal, id) => JSON.parse(db.sqlite.prepare("select days from calendars where id = ?").get(cal).days).flatMap((d) => d.posts).find((p) => p.id === id);
/** Los avisos al espacio de un tipo (difundir no se espera: se espera aquí a que lleguen). */
const avisosDe = async (tipo) => { await Promise.all(pendientes); return eventos.filter((e) => !tipo || e.tipo === tipo); };
const D = (n) => dineroCorto(n, "USD");

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T15:00:00.000Z"));
  db = d1EnMemoria();
  eventos = [];
  pendientes = [];
  pedidosIA = [];
  respuestaIA = () => flujo("{}");
  env = {
    DB: db, ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") },
    HUB: { idFromName: (x) => x, get: () => ({ fetch: (req) => { const p = req.json().then((j) => { eventos.push(j); }); pendientes.push(p); return p.then(() => new Response("")); } }) },
  };
  vi.stubGlobal("fetch", vi.fn(async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      const cuerpo = JSON.parse(opciones.body);
      pedidosIA.push(cuerpo);
      return respuestaIA(cuerpo);
    }
    throw new Error(`Petición a Internet en un test: ${u}`);
  }));
  await sembrar();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); olvidarModelos(); });

describe("las definiciones", () => {
  it("están en el MCP con sus anotaciones y lo que piden", () => {
    const por = Object.fromEntries(HERRAMIENTAS_MCP.map((h) => [h.name, h]));
    for (const d of DEFINICIONES_CAMPANAS) expect(por[d.name]).toBe(d);
    expect(por.numeros_del_negocio.annotations.readOnlyHint).toBe(true);
    for (const n of ["guardar_numeros_negocio", "escribir_textos_anuncios", "ajustar_plan_campanas"]) {
      expect(por[n].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    }
    expect(por.numeros_del_negocio.inputSchema.required).toEqual(["cliente"]);
    expect(por.guardar_numeros_negocio.inputSchema.required).toEqual(["cliente", "datos"]);
    expect(por.escribir_textos_anuncios.inputSchema.required).toEqual(["cliente"]);
    expect(por.ajustar_plan_campanas.inputSchema.required).toEqual(["cliente"]);
    // Las que guardan con confirmación lo dicen y le piden a Claude que no la ponga por su cuenta.
    expect(por.guardar_numeros_negocio.description).toMatch(/Nunca pongas confirmado: true por tu cuenta/);
    expect(por.ajustar_plan_campanas.description).toMatch(/nunca lo pongas por tu cuenta/);
    expect(por.numeros_del_negocio.description).toMatch(/no calcules con otras calculadoras/);
    expect(por.escribir_textos_anuncios.description).toMatch(/MEJOR que escribirlos tú/);
  });
});

describe("numeros_del_negocio", () => {
  it("EL número mágico de la aplicación (el mismo de la ficha), cada dato con su origen, sin tocar Meta", async () => {
    const { texto, error } = await llamar("numeros_del_negocio", { cliente: "Dcasa" });
    expect(error).toBe(false);
    // 20 × 16 % × 9 % = 0,288 por conversación (el equilibrio es 1,08): manda lo que se decidió invertir.
    const ficha = await (await worker.fetch(new Request("https://calendarios.test/api/anuncios/clientes/c1/negocio?meta=0", { headers: { Cookie: `${COOKIE}=t-jefe` } }), env)).json();
    expect(ficha.numeroMagico.valor).toBe(0.29);
    expect(texto).toContain(`${dineroCorto(0.29, "USD")} por conversación`);
    expect(texto).toContain(`Ticket promedio: ${D(20)} (Del cliente)`);
    expect(texto).toContain("ITBMS: 0 % (Del cliente)");
    expect(texto).toContain("Devoluciones: sin dato");
    expect(texto).toContain("Costos variables (% de la venta neta): Producto 40 % (Del cliente)");
    expect(texto).toMatch(/Tasa de cierre: 9 % \(Del cliente\)/);
    expect(texto).toMatch(/ROAS de equilibrio: 1,67/);
    expect(texto).toContain(`inversión del mes ${D(160)}`);
    expect(texto).toContain(`Por etapa (el estándar del Manual): Presentación 60 % = ${D(96)}`);
    expect(texto).toMatch(/Sin cuenta publicitaria asignada/);
    expect(pedidosIA).toEqual([]);
  });

  it("sin costos no hay número mágico: lo dice y qué falta", async () => {
    db.sqlite.prepare("update anuncios_clientes set negocio = ? where client_id = 'c1'").run(JSON.stringify({ ...NEGOCIO, costos: [] }));
    const { texto } = await llamar("numeros_del_negocio", { cliente: "Dcasa" });
    expect(texto).toMatch(/Todavía no hay número mágico/);
    expect(texto).toMatch(/Falta el costo del producto/);
  });

  it("con la tasa de cierre MEDIDA por el enlace de ventas, dice cuál sería el número mágico (sin guardar) y lo de Meta", async () => {
    env.META_APP_ID = "app";
    env.META_APP_SECRET = "secreto-de-meta-para-pruebas";
    const s = db.sqlite;
    s.prepare("insert into integracion_meta (id, owner_id, nombre, token_cifrado, origen, permisos) values (?,?,?,?,?,?)")
      .run(JEFE, JEFE, "Juan", await cifrarMeta(env, "token-persona"), "https://calendarios.test", JSON.stringify(["pages_show_list", "ads_read", "ads_management"]));
    s.prepare("insert into cuentas_anuncios (id, owner_id, externo_id, nombre, moneda, client_id) values (?,?,?,?,?,?)").run(`${JEFE}:act_111`, JEFE, "act_111", "Dcasa Ads", "USD", "c1");
    // Las ventas de cada semana con las conversaciones de la ANTERIOR: 3 con 60 y 2 con 50 → 5 de 110.
    s.prepare("insert into ventas_semana (id, owner_id, client_id, semana, ventas, monto) values (?,?,?,?,?,?)").run("vs1", JEFE, "c1", "2026-10-26", 3, 450);
    s.prepare("insert into ventas_semana (id, owner_id, client_id, semana, ventas, monto) values (?,?,?,?,?,?)").run("vs2", JEFE, "c1", "2026-10-19", 2, 300);
    const DIAS = [
      { date_start: "2026-10-13", spend: "30", actions: [{ action_type: ACCION_MENSAJE, value: "50" }] },
      { date_start: "2026-10-20", spend: "30", actions: [{ action_type: ACCION_MENSAJE, value: "60" }] },
      { date_start: "2026-10-27", spend: "40", actions: [{ action_type: ACCION_MENSAJE, value: "80" }] },
    ];
    vi.stubGlobal("fetch", async (url) => {
      const u = new URL(String(url));
      if (u.hostname !== "graph.facebook.com" || !u.pathname.endsWith("/act_111/insights")) throw new Error(`fetch inesperado a ${u}`);
      if (u.searchParams.get("time_range")) {
        const { since, until } = JSON.parse(u.searchParams.get("time_range"));
        return Response.json({ data: DIAS.filter((d) => d.date_start >= since && d.date_start <= until) });
      }
      if (u.searchParams.get("level")) return Response.json({ data: [] });
      return Response.json({ data: [{ spend: "100", impressions: "20000", reach: "10000", actions: [{ action_type: ACCION_MENSAJE, value: "190" }], date_start: "2026-10-07", date_stop: "2026-11-05" }] });
    });
    const { texto, error } = await llamar("numeros_del_negocio", { cliente: "Dcasa" });
    expect(error).toBe(false);
    expect(texto).toMatch(/Medida por el enlace de ventas: 4,5 % \(5 ventas de 110 conversaciones\)/);
    // Con 4,55 %: 3,20 × 4,55 % = 0,15 por conversación.
    expect(texto).toContain(`el número mágico sería ${D(0.15)} por conversación`);
    expect(texto).toMatch(/guárdala con guardar_numeros_negocio \(tasaCierre: \{ valor: 4,55, origen: "medida" \}\)/);
    // Lo de Meta, de referencia: 100 de gasto y 190 conversaciones → 0,53 cada una, por encima del número mágico.
    expect(texto).toContain(`Gastó ${D(100)} · 190 conversaciones a ${D(100 / 190)} cada una`);
    expect(texto).toMatch(/POR ENCIMA: se pierde dinero/);
    // Nada se guardó.
    expect(negocioGuardado()).toEqual(NEGOCIO);
  });

  it("con proponer, la IA propone lo que falta como «estimado» y NO se guarda; sólo lectura no la pide", async () => {
    respuestaIA = () => flujo(JSON.stringify({
      devoluciones: { valor: 1, explicacion: "Muebles: casi no se devuelven" },
      costos: [{ nombre: "Envíos", pct: 5, explicacion: "Lo habitual del rubro" }],
    }));
    db.sqlite.prepare("update anuncios_clientes set negocio = ? where client_id = 'c1'").run(JSON.stringify({ ...NEGOCIO, costos: [{ nombre: "Producto", pct: 40, origen: "estimado" }] }));
    const antes = negocioGuardado();
    const { texto, error } = await llamar("numeros_del_negocio", { cliente: "Dcasa", proponer: true });
    expect(error).toBe(false);
    expect(pedidosIA).toHaveLength(1);
    expect(texto).toMatch(/LO QUE PROPONE LA IA \(estimado; NO SE GUARDÓ NADA\)/);
    expect(texto).toMatch(/Devoluciones: 1 % — Muebles: casi no se devuelven/);
    expect(texto).toMatch(/guardar_numeros_negocio con datos \{"devoluciones":1,"costos":\[\{"nombre":"Envíos","pct":5\}\]\} y origen "estimado"/);
    expect(negocioGuardado()).toEqual(antes);
    const lector = await llamar("numeros_del_negocio", { cliente: "Dcasa", proponer: true }, LECTOR);
    expect(lector.error).toBe(true);
    expect(lector.texto).toMatch(/sólo lectura/);
    expect(pedidosIA).toHaveLength(1);
  });
});

describe("guardar_numeros_negocio", () => {
  it("sin confirmado NO guarda nada: dice cada cambio (de → a) y cómo queda el número mágico", async () => {
    const antes = negocioGuardado();
    const { texto, error } = await llamar("guardar_numeros_negocio", { cliente: "Dcasa", datos: { ticket: 25, devoluciones: { valor: 2, origen: "cliente" } } });
    expect(error).toBe(false);
    expect(texto.startsWith("NO SE GUARDÓ NADA.")).toBe(true);
    expect(texto).toContain(`· Ticket promedio: ${D(20)} (Del cliente) → ${D(25)} (De la agencia)`);
    expect(texto).toContain("· Devoluciones: sin dato → 2 % (Del cliente)");
    expect(texto).toContain(`El número mágico: ${D(0.29)} por conversación (costo por conversación) → ${D(0.36)} por conversación`);
    expect(texto).toContain('antes: ""');
    expect(negocioGuardado()).toEqual(antes);
    expect(await avisosDe()).toEqual([]);
  });

  it("con confirmado guarda con la limpieza de la pantalla, firmado por Claude, y avisa al espacio", async () => {
    const { texto, error } = await llamar("guardar_numeros_negocio", { cliente: "Dcasa", datos: { ticket: "25,5", costos: [{ nombre: "Producto", pct: 38 }, { nombre: "Tafi", pct: 3.5 }] }, origen: "cliente", antes: "", confirmado: true });
    expect(error).toBe(false);
    expect(texto).toMatch(/^Guardado en los números del negocio de Dcasa/);
    const n = negocioGuardado();
    expect(n.ticket).toEqual({ valor: 25.5, origen: "cliente" });
    expect(n.costos.map((c) => [c.nombre, c.pct, c.origen])).toEqual([["Producto", 38, "cliente"], ["Tafi", 3.5, "cliente"]]);
    // Lo que no se nombró se queda.
    expect(n.invertir).toEqual({ valor: 16, origen: "agencia" });
    expect(n.por).toBe("Claude (Juan)");
    expect(n.actualizado).toBe("2026-11-06T15:00:00.000Z");
    expect(await avisosDe("anuncios")).toHaveLength(1);
    // Una columna: el informe de anuncios de la misma fila no se toca.
    expect(db.sqlite.prepare("select mostrar_costo from anuncios_clientes where client_id = 'c1'").get().mostrar_costo).toBe(0);
  });

  it("no pisa lo que otra persona guardó entre medias (el «antes»)", async () => {
    await llamar("guardar_numeros_negocio", { cliente: "Dcasa", datos: { ticket: 30 }, antes: "", confirmado: true });
    const r = await llamar("guardar_numeros_negocio", { cliente: "Dcasa", datos: { ticket: 99 }, antes: "", confirmado: true });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/cambió los números mientras los editabas/);
    expect(negocioGuardado().ticket.valor).toBe(30);
  });

  it("lo que no se entiende es un error, no un dato borrado; lo que no cambia, lo dice", async () => {
    let r = await llamar("guardar_numeros_negocio", { cliente: "Dcasa", datos: { ticket: "mucho" }, confirmado: true });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/No entiendo «mucho» como ticket promedio/);
    r = await llamar("guardar_numeros_negocio", { cliente: "Dcasa", datos: { destino: "tienda" } });
    expect(r.error).toBe(true);
    r = await llamar("guardar_numeros_negocio", { cliente: "Dcasa", datos: { ticket: { valor: 20, origen: "cliente" } } });
    expect(r.texto).toMatch(/No cambia nada/);
    r = await llamar("guardar_numeros_negocio", { cliente: "Dcasa", datos: { invertir: 0.15 } });
    expect(r.texto).toMatch(/¿Quisiste decir 15 %\?/);
    expect(negocioGuardado().ticket.valor).toBe(20);
  });
});

describe("escribir_textos_anuncios", () => {
  it("escribe los que faltan por el motor del plan, los guarda sin pisar y los devuelve con su hueco", async () => {
    respuestaIA = () => flujo(JSON.stringify({ anuncios: [
      { n: 1, textos: ["no va"], titulos: ["El sofá que se abre en 10 s"], descripcion: "Envío gratis", boton: "WHATSAPP_MESSAGE" },
      { n: 2, textos: ["Tu visita se queda.", "Diez segundos.", "Hecho en Panamá."], titulos: ["Sofá cama"], descripcion: "Desde $450", boton: "WHATSAPP_MESSAGE" },
    ] }));
    const { texto, error } = await llamar("escribir_textos_anuncios", { cliente: "Dcasa", mes: "2026-11" });
    expect(error).toBe(false);
    expect(pedidosIA).toHaveLength(1);
    const prompt = pedidosIA[0].messages[0].content;
    expect(prompt).toMatch(/CÓMO SE LE HABLA A CADA NIVEL/);
    expect(prompt).toMatch(/Sofá cama[^\n]*precio: \$450/);
    expect(texto).toMatch(/Escritos los textos de 2 anuncios del plan de Dcasa \(Noviembre 2026\)/);
    expect(texto).toContain("[hueco presentacion:a1]");
    expect(texto).toContain("El sofá que se abre en 10 s");
    expect(texto).toContain("Tu visita se queda.");
    const g = guardadoDelPlan();
    expect(g.anuncios["presentacion:a1"]).toMatchObject({ ia: true, pieza: { postId: "p1" } });
    // En la publicación, sin pisar: p1 no tenía; p3 (con los suyos) no se tocó.
    expect(leerPost("cal-10", "p1").anuncio).toMatchObject({ titulos: ["El sofá que se abre en 10 s"], descripcion: "Envío gratis" });
    expect(leerPost("cal-11", "p3").anuncio.textos).toEqual(["Texto uno", "Texto dos", "Texto tres"]);
    expect((await avisosDe("anuncios")).length).toBeGreaterThan(0);
    expect((await avisosDe("calendario:recargar")).length).toBeGreaterThan(0);
    // Ya no falta ninguno: no llama a la IA otra vez.
    const otra = await llamar("escribir_textos_anuncios", { cliente: "Dcasa", mes: "2026-11" });
    expect(otra.texto).toMatch(/No hay anuncios sin textos/);
    expect(pedidosIA).toHaveLength(1);
  });

  it("un hueco por producir, uno de una persona sin reescribir o reescribir sin campaña: lo dice sin llamar a la IA", async () => {
    let r = await llamar("escribir_textos_anuncios", { cliente: "Dcasa", mes: "2026-11", hueco: "presentacion:a4" });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/por producir/);
    db.sqlite.prepare("insert into planes_campana (id, owner_id, client_id, nombre, datos) values (?,?,?,?,?)").run(idDelCiclo("c1", "2026-11"), JEFE, "c1", "Plan",
      JSON.stringify({ tipo: "ciclo", mes: "2026-11", anuncios: { "presentacion:a1": { textos: { titulos: ["El mío"], descripcion: "Mío" }, editado: true } } }));
    r = await llamar("escribir_textos_anuncios", { cliente: "Dcasa", mes: "2026-11", hueco: "presentacion:a1" });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/los escribió una persona/);
    r = await llamar("escribir_textos_anuncios", { cliente: "Dcasa", mes: "2026-11", reescribir: true });
    expect(r.error).toBe(true);
    r = await llamar("escribir_textos_anuncios", { cliente: "Dcasa", mes: "noviembre" });
    expect(r.error).toBe(true);
    expect(pedidosIA).toEqual([]);
  });

  it("un error de la IA vuelve a Claude con su motivo", async () => {
    respuestaIA = () => flujo("no sé");
    const r = await llamar("escribir_textos_anuncios", { cliente: "Dcasa", mes: "2026-11", hueco: "presentacion:a1" });
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/La IA no devolvió textos/);
  });
});

describe("ajustar_plan_campanas", () => {
  it("«¿Qué vas a hacer?» se guarda al momento (sólo lo que se nombra) y devuelve el plan con sus huecos", async () => {
    const { texto, error } = await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", que: { campanas: ["conversion", "temporada"], productos: "varios", producto_ids: ["Sofá cama", "mesa"], logro: "Vender en Black Friday." } });
    expect(error).toBe(false);
    expect(texto).toMatch(/^Guardado en el plan de campañas de Dcasa:/);
    expect(texto).toContain("EL PLAN COMO QUEDA:");
    expect(texto).toContain("[hueco conversion:a1]");
    expect(texto).not.toContain("[hueco presentacion:a1]");
    expect(guardadoDelPlan().ajustes.que).toEqual({ campanas: ["conversion", "temporada"], productos: "varios", productoIds: ["sofa", "mesa"], logro: "Vender en Black Friday." });
    // Cambiar sólo el logro no se lleva lo demás.
    await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", que: { logro: "Otro" } });
    expect(guardadoDelPlan().ajustes.que).toMatchObject({ campanas: ["conversion", "temporada"], logro: "Otro" });
    const malo = await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", que: { producto_ids: ["Lámpara"] } });
    expect(malo.error).toBe(true);
    expect(malo.texto).toMatch(/no está en el catálogo de Dcasa: Sofá cama \(sofa\), Mesa de centro \(mesa\)/);
  });

  it("un hueco: la publicación por su ID (de otro mes), cómo se monta y el ángulo; un directo u otra empresa, no", async () => {
    const { texto, error } = await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", anuncio: { hueco: "presentacion:a2", publicacion_id: "p2", como: "subir", angulo: "Las visitas que se quedan" } });
    expect(error).toBe(false);
    expect(texto).toMatch(/presentacion:a2: la publicación «Pieza p2» · se monta subiendo la pieza · ángulo «Las visitas que se quedan»/);
    expect(texto).toMatch(/\[hueco presentacion:a2\][^\n]*publicación p2/);
    expect(guardadoDelPlan().anuncios["presentacion:a2"]).toMatchObject({ pieza: { calendarId: "cal-10", postId: "p2" }, como: "subir", angulo: { productoId: "sofa", id: "visitas" }, por: "Claude (Juan)" });
    expect(await avisosDe("anuncios")).toHaveLength(1);
    // Por la clave del ángulo y «ninguno»; «sugerido» vuelve el hueco entero.
    await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", anuncios: [{ hueco: "presentacion:a3", nuevo: true, angulo: "sofa:garantia" }, { hueco: "presentacion:a4", angulo: "ninguno" }] });
    expect(guardadoDelPlan().anuncios["presentacion:a3"]).toMatchObject({ nuevo: true, angulo: { id: "garantia" } });
    expect(guardadoDelPlan().anuncios["presentacion:a4"]).toMatchObject({ angulo: false });
    await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", anuncio: { hueco: "presentacion:a3", sugerido: true } });
    expect(guardadoDelPlan().anuncios["presentacion:a3"]).toBeUndefined();

    expect((await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", anuncio: { hueco: "presentacion:a2", publicacion_id: "vivo" } })).texto).toMatch(/directo no se pauta/);
    expect((await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", anuncio: { hueco: "presentacion:a2", publicacion_id: "p-cafe" } })).texto).toMatch(/no es de Dcasa/);
    expect((await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", anuncio: { hueco: "presentacion:a9", nuevo: true } })).error).toBe(true);
    expect((await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", anuncio: { hueco: "presentacion:a2", angulo: "Otro" } })).texto).toMatch(/No hay un ángulo «Otro»/);
  });

  it("el reparto sólo con confirmado: sin él no se guarda NADA de la llamada", async () => {
    const r = await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", reparto: { presentacion: 70, evaluacion: 10, conversion: 10, ascension: 10 }, que: { logro: "Algo" } });
    expect(r.error).toBe(false);
    expect(r.texto.startsWith("NO SE GUARDÓ NADA.")).toBe(true);
    expect(r.texto).toContain(`Presentación 60 % (${D(96)} al mes)`);
    expect(r.texto).toContain(`→ Presentación 70 % (${D(112)} al mes)`);
    expect(db.sqlite.prepare("select reparto from anuncios_clientes where client_id = 'c1'").get().reparto).toBeNull();
    expect(db.sqlite.prepare("select count(*) as n from planes_campana").get().n).toBe(0);
    expect(await avisosDe()).toEqual([]);

    const ok = await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", reparto: { presentacion: 70, evaluacion: 10, conversion: 10, ascension: 10 }, que: { logro: "Algo" }, confirmado: true });
    expect(ok.error).toBe(false);
    expect(ok.texto).toMatch(/repartido a mano/);
    expect(JSON.parse(db.sqlite.prepare("select reparto from anuncios_clientes where client_id = 'c1'").get().reparto)).toEqual({ presentacion: 70, evaluacion: 10, conversion: 10, ascension: 10 });
    expect(guardadoDelPlan().ajustes.que.logro).toBe("Algo");
    // El mismo reparto otra vez no pregunta; uno que no suma 100 es un error.
    expect((await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", reparto: { presentacion: 70, evaluacion: 10, conversion: 10, ascension: 10 } })).texto).toMatch(/No cambia nada/);
    const malo = await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", reparto: { presentacion: 70, evaluacion: 20, conversion: 10, ascension: 10 } });
    expect(malo.error).toBe(true);
    expect(malo.texto).toMatch(/suma 110/);
    // Volver al estándar también se confirma.
    expect((await llamar("ajustar_plan_campanas", { cliente: "Dcasa", mes: "2026-11", reparto: null })).texto).toMatch(/^NO SE GUARDÓ NADA\.[\s\S]*el estándar del Manual/);
  });
});

describe("quién puede", () => {
  it("un cliente de otro espacio, o de otro colaborador, no existe para ninguna", async () => {
    for (const [nombre, entrada] of [
      ["numeros_del_negocio", { cliente: "Ajeno" }],
      ["guardar_numeros_negocio", { cliente: "Ajeno", datos: { ticket: 1 }, confirmado: true }],
      ["escribir_textos_anuncios", { cliente: "Ajeno" }],
      ["ajustar_plan_campanas", { cliente: "Ajeno", que: { logro: "x" } }],
    ]) {
      const r = await llamar(nombre, entrada);
      expect(r.error).toBe(true);
      expect(r.texto).toMatch(/No encontré el cliente/);
    }
    const colab = await llamar("numeros_del_negocio", { cliente: "Dcasa" }, COLAB);
    expect(colab.error).toBe(true);
    expect(colab.texto).toMatch(/No encontré el cliente/);
    expect(db.sqlite.prepare("select negocio from anuncios_clientes where client_id = 'c1'").get().negocio).toBe(JSON.stringify(NEGOCIO));
  });
});

describe("plan_de_campanas y la pantalla", () => {
  it("lo que lee Claude lleva el hueco de cada anuncio y el ID de su publicación; lo que se copia en la pantalla, no", async () => {
    const { texto } = await llamar("plan_de_campanas", { cliente: "Dcasa", mes: "2026-11" });
    expect(texto).toMatch(/1\. \[hueco presentacion:a1\] [^\n]*publicación p1/);
    expect(texto).toMatch(/\[hueco presentacion:a2\] por producir/);
    expect(texto).toMatch(/«Las visitas que se quedan» \(Sofá cama\) \[sofa:visitas\]/);
    const { plan } = await (await worker.fetch(new Request("https://calendarios.test/api/anuncios/clientes/c1/ciclo?mes=2026-11", { headers: { Cookie: `${COOKIE}=t-jefe` } }), env)).json();
    const copia = planATextoCiclo(plan);
    expect(copia).not.toContain("[hueco");
    expect(copia).not.toContain("publicación p1");
  });

  it("la ruta del plan usa la misma validación del reparto", async () => {
    expect(errorDeReparto(null)).toBe("");
    expect(errorDeReparto({ presentacion: 50, evaluacion: 50, conversion: 0, ascension: 0 })).toBe("");
    expect(errorDeReparto({ presentacion: 0, evaluacion: 50, conversion: 50, ascension: 0 })).toMatch(/Presentación necesita/);
    const r = await worker.fetch(new Request("https://calendarios.test/api/anuncios/clientes/c1/ciclo", {
      method: "PUT", headers: { Cookie: `${COOKIE}=t-jefe`, "Content-Type": "application/json" },
      body: JSON.stringify({ mes: "2026-11", reparto: { presentacion: 70, evaluacion: 20, conversion: 10, ascension: 10 } }),
    }), env);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/suma 110/);
  });
});
