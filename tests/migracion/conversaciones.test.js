import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { ruta } from "../utils/repo.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { tituloLimpio, pedidoDeTitulo, tituloProvisional, ordenarConversaciones, cuandoFue, TITULO_NUEVA } from "../../src/lib/conversaciones.js";

// ============================================================
// Las conversaciones del asistente, por tema, contra una D1 de verdad
//
// Lo que se cuida: que lo de antes no se pierda (pasa a «Conversación
// anterior»), que las vea TODO el equipo y nadie de fuera, que cada una lea
// sólo lo suyo (mensajes y resumen), que borrar una no toque las demás y que
// el asistente general tenga las suyas aunque no tenga cliente.
// ============================================================

const JEFE = "u-jefe";
const ANA = "u-ana";
const OTRA = "u-otra";
const COLAB = "u-colab";
const TESTIGO = { [JEFE]: "t-jefe", [ANA]: "t-ana", [OTRA]: "t-otra", [COLAB]: "t-colab" };
let db;
let env;

async function sembrar() {
  const s = db.sqlite;
  for (const id of [JEFE, ANA, OTRA, COLAB]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  // Ana es del mismo equipo (otra persona, mismo espacio); Otra, de otra agencia.
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(ANA, JEFE, "editor", "Ana", "#00AA00");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#123456");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Colab", "#654321", '["c1"]');
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
}

const pedir = (quien, camino, opciones = {}) => worker.fetch(new Request(`https://calendarios.test${camino}`, {
  ...opciones,
  headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env, {});

const crear = async (quien, clienteId, titulo) => (await (await pedir(quien, "/api/chat/conversaciones", { method: "POST", body: { clienteId, titulo } })).json()).conversacion;
const lista = async (quien, cliente = "") => (await (await pedir(quien, `/api/chat/conversaciones${cliente ? `?cliente=${cliente}` : ""}`)).json()).conversaciones;
const decir = (quien, id, content, role = "user") => pedir(quien, `/api/chat/conversaciones/${id}/mensajes`, { method: "POST", body: { role, content } });
const mensajes = async (quien, id) => (await (await pedir(quien, `/api/chat/conversaciones/${id}/mensajes`)).json()).mensajes;

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("lo puro", () => {
  it("el título queda en una línea, sin comillas ni punto, y corto", () => {
    expect(tituloLimpio("Título: «Guiones de reels de octubre».")).toBe("Guiones de reels de octubre");
    expect(tituloLimpio("\n\n  Campaña de Navidad\nOtra línea")).toBe("Campaña de Navidad");
    expect(tituloLimpio("x ".repeat(100)).length).toBeLessThanOrEqual(80);
    expect(tituloLimpio("")).toBe("");
  });

  it("el provisional son las primeras palabras; sin texto, «Nueva conversación»", () => {
    expect(tituloProvisional("Escríbeme los guiones de los reels de la semana dos para Dcasa")).toBe("Escríbeme los guiones de los reels de…");
    expect(tituloProvisional("Hola")).toBe("Hola");
    expect(tituloProvisional("  ")).toBe(TITULO_NUEVA);
  });

  it("el pedido del título lleva el primer intercambio y el cliente", () => {
    const p = pedidoDeTitulo({ pregunta: "Guiones de reels", respuesta: "Aquí van", cliente: "Dcasa" });
    expect(p).toMatch(/sobre el cliente Dcasa/);
    expect(p).toMatch(/LA PERSONA: Guiones de reels/);
    expect(p).toMatch(/EL ASISTENTE: Aquí van/);
  });

  it("la lista va por la última vez que se habló y se filtra sin tildes", () => {
    const l = [{ titulo: "Campaña", updated_at: "2026-10-01" }, { titulo: "Guiones de reels", updated_at: "2026-10-05" }, { titulo: "Precios del sofá", updated_at: "2026-10-03" }];
    expect(ordenarConversaciones(l).map((c) => c.titulo)).toEqual(["Guiones de reels", "Precios del sofá", "Campaña"]);
    expect(ordenarConversaciones(l, "sofa").map((c) => c.titulo)).toEqual(["Precios del sofá"]);
  });

  it("cuándo fue, en corto y en hora de Panamá", () => {
    const ahora = new Date("2026-10-20T15:00:00Z");
    expect(cuandoFue("2026-10-20T14:30:00Z", ahora)).toMatch(/^hoy, 9:30/);
    expect(cuandoFue("2026-10-19T15:00:00Z", ahora)).toBe("ayer");
    expect(cuandoFue("2026-10-12T15:00:00Z", ahora)).toMatch(/12/);
    expect(cuandoFue("no", ahora)).toBe("");
  });
});

describe("la migración 0043 no pierde nada", () => {
  it("lo que había en cada cliente pasa a «Conversación anterior», con su resumen", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("pragma foreign_keys = on");
    const dir = ruta("migraciones", "d1");
    const ficheros = readdirSync(dir).filter((n) => n.endsWith(".sql")).sort();
    for (const f of ficheros.filter((n) => n < "0043")) sqlite.exec(readFileSync(`${dir}/${f}`, "utf8"));
    const s = (q, ...a) => sqlite.prepare(q).run(...a);
    s("insert into users (id, email, password_hash, salt) values ('u','u@a','x','x')");
    s("insert into clients (id, owner_id, name) values ('c','u','C'), ('d','u','D'), ('e','u','E')");
    s("insert into chat_messages (id, client_id, owner_id, role, content, created_at) values ('m1','c','u','user','hola','2026-10-01T10:00:00Z'), ('m2','c','u','assistant','qué tal','2026-10-01T10:01:00Z'), ('m3','d','u','user','otra','2026-10-02T10:00:00Z')");
    s("insert into chat_resumenes (id, client_id, owner_id, content, hasta) values ('c','c','u','Resumen de C','2026-10-01T10:00:00Z'), ('e','e','u','Resumen sin mensajes',null)");
    sqlite.exec(readFileSync(`${dir}/0043_conversaciones.sql`, "utf8"));
    const conv = sqlite.prepare("select id, client_id, titulo, created_at, updated_at from chat_conversaciones order by id").all().map((f) => ({ ...f }));
    expect(conv).toEqual([
      { id: "anterior-c", client_id: "c", titulo: "Conversación anterior", created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-01T10:01:00Z" },
      { id: "anterior-d", client_id: "d", titulo: "Conversación anterior", created_at: "2026-10-02T10:00:00Z", updated_at: "2026-10-02T10:00:00Z" },
    ]);
    expect(sqlite.prepare("select id, conversacion_id from chat_messages order by id").all().map((f) => [f.id, f.conversacion_id])).toEqual([["m1", "anterior-c"], ["m2", "anterior-c"], ["m3", "anterior-d"]]);
    expect(sqlite.prepare("select id, conversacion_id, content from chat_resumenes").all().map((f) => ({ ...f }))).toEqual([{ id: "anterior-c", conversacion_id: "anterior-c", content: "Resumen de C" }]);
    // El asistente general ya puede guardar sin cliente; y borrar la conversación se lleva sus mensajes.
    s("insert into chat_conversaciones (id, owner_id, titulo) values ('g','u','General')");
    s("insert into chat_messages (id, owner_id, conversacion_id, role, content) values ('m4','u','g','user','de todos')");
    s("delete from chat_conversaciones where id = 'anterior-c'");
    expect(sqlite.prepare("select id from chat_messages order by id").all().map((f) => f.id)).toEqual(["m3", "m4"]);
    expect(sqlite.prepare("select count(*) n from chat_resumenes").get().n).toBe(0);
    // Borrar un cliente sigue llevándose lo suyo.
    s("delete from clients where id = 'd'");
    expect(sqlite.prepare("select id from chat_messages").all().map((f) => f.id)).toEqual(["m4"]);
    expect(sqlite.prepare("pragma foreign_key_check").all()).toEqual([]);
  });
});

describe("las rutas", () => {
  it("crear, listar (la última arriba), hablar y leer sólo lo de esa conversación", async () => {
    const a = await crear(JEFE, "c1", "Guiones de reels");
    const b = await crear(JEFE, "c1");
    expect(b.titulo).toBe(TITULO_NUEVA);
    expect((await decir(JEFE, a.id, "Quiero cinco guiones")).status).toBe(201);
    await decir(JEFE, a.id, "Aquí van los cinco", "assistant");
    await decir(JEFE, b.id, "Otro tema: precios");
    expect((await mensajes(JEFE, a.id)).map((m) => m.content)).toEqual(["Quiero cinco guiones", "Aquí van los cinco"]);
    expect((await mensajes(JEFE, b.id)).map((m) => m.content)).toEqual(["Otro tema: precios"]);
    expect((await lista(JEFE, "c1")).map((c) => c.id)).toEqual([b.id, a.id]);
    expect(await lista(JEFE, "c2")).toEqual([]);
  });

  it("las de DISEÑO (tema «diseno», desde la pestaña Diseño) son las mismas: se listan con las demás, con su tema", async () => {
    const d = (await (await pedir(JEFE, "/api/chat/conversaciones", { method: "POST", body: { clienteId: "c1", titulo: "Noviembre", tema: "diseno" } })).json()).conversacion;
    const n = await crear(JEFE, "c1", "Otra");
    const mala = (await (await pedir(JEFE, "/api/chat/conversaciones", { method: "POST", body: { clienteId: "c1", tema: "cualquiera" } })).json()).conversacion;
    expect(d.tema).toBe("diseno");
    expect(n.tema).toBe("");
    expect(mala.tema).toBe("");
    // Otra persona del equipo la ve igual.
    expect((await lista(ANA, "c1")).find((c) => c.id === d.id).tema).toBe("diseno");
  });

  it("el asistente con un cliente es también su DIRECTOR CREATIVO: el manual, la ficha y lo que exige su kit", async () => {
    const pedidos = [];
    vi.stubGlobal("fetch", async (url, init = {}) => {
      const u = String(url);
      if (u.includes("/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
      pedidos.push(JSON.parse(init.body));
      const ev = (t, d) => `event: ${t}\ndata: ${JSON.stringify(d)}\n\n`;
      return new Response([
        ev("message_start", { type: "message_start", message: { model: "claude-sonnet-5", content: [], usage: { input_tokens: 10, output_tokens: 0 } } }),
        ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
        ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hola" } }),
        ev("content_block_stop", { type: "content_block_stop", index: 0 }),
        ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }),
        ev("message_stop", { type: "message_stop" }),
      ].join(""), { headers: { "content-type": "text/event-stream" } });
    });
    env.ANTHROPIC_API_KEY = "k";
    db.sqlite.prepare("insert into ajustes_espacio (id, owner_id) values (?, ?) on conflict(id) do nothing").run(JEFE, JEFE);
    db.sqlite.prepare("update ajustes_espacio set manual_campanas = ? where id = ?").run(JSON.stringify({ diseno: "Siempre fondo hueso y placa azul." }), JEFE);
    const leer = async (r) => { await r.text(); };
    await leer(await pedir(JEFE, "/api/ia/chat", { method: "POST", body: { messages: [{ role: "user", content: "Hola" }], clienteId: "c1" } }));
    const sistema = pedidos[0].system.map((b) => b.text).join("\n");
    expect(sistema).toMatch(/ERES EL DIRECTOR CREATIVO/);
    expect(sistema).toMatch(/Siempre fondo hueso y placa azul\./);
    expect(sistema).toMatch(/KIT DE MARCA DE DCASA: NO está preparado/);
    // Sin cliente (el asistente general), no.
    await leer(await pedir(JEFE, "/api/ia/chat", { method: "POST", body: { messages: [{ role: "user", content: "Hola" }] } }));
    expect(pedidos[1].system.map((b) => b.text).join("\n")).not.toMatch(/DIRECTOR CREATIVO/);
  });

  it("las ve todo el equipo: otra persona del espacio la abre y sigue en ella", async () => {
    const a = await crear(JEFE, "c1", "Guiones de reels");
    await decir(JEFE, a.id, "Quiero cinco guiones");
    expect((await lista(ANA, "c1")).map((c) => c.titulo)).toEqual(["Guiones de reels"]);
    expect((await decir(ANA, a.id, "Ana: cámbiale el gancho al tercero")).status).toBe(201);
    expect((await mensajes(JEFE, a.id)).map((m) => m.content)).toEqual(["Quiero cinco guiones", "Ana: cámbiale el gancho al tercero"]);
  });

  it("nadie de otro espacio las ve ni escribe en ellas", async () => {
    const a = await crear(JEFE, "c1", "Secreto");
    await decir(JEFE, a.id, "algo interno");
    expect((await pedir(OTRA, "/api/chat/conversaciones?cliente=c1")).status).toBe(404);
    expect((await pedir(OTRA, `/api/chat/conversaciones/${a.id}/mensajes`)).status).toBe(404);
    expect((await decir(OTRA, a.id, "me cuelo")).status).toBe(404);
    expect((await pedir(OTRA, `/api/chat/conversaciones/${a.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await pedir(OTRA, "/api/chat/conversaciones", { method: "POST", body: { clienteId: "c1" } })).status).toBe(404);
    expect(await lista(OTRA)).toEqual([]);
  });

  it("el asistente general tiene las suyas, sin cliente, aparte de las de cada cliente", async () => {
    const g = await crear(JEFE, null, "Resumen de la semana");
    await crear(JEFE, "c1", "Del cliente");
    await decir(JEFE, g.id, "¿Cómo van todos?");
    const generales = await lista(JEFE);
    expect(generales.map((c) => [c.titulo, c.clientId])).toEqual([["Resumen de la semana", null]]);
    expect((await mensajes(ANA, g.id)).map((m) => m.content)).toEqual(["¿Cómo van todos?"]);
  });

  it("un colaborador ve las de sus clientes; ni las de otros clientes ni las del asistente general", async () => {
    const mia = await crear(JEFE, "c1", "De Dcasa");
    const ajena = await crear(JEFE, "c2", "De Baby Caleb");
    await crear(JEFE, null, "General");
    expect((await lista(COLAB, "c1")).map((c) => c.id)).toEqual([mia.id]);
    expect((await pedir(COLAB, "/api/chat/conversaciones?cliente=c2")).status).toBe(404);
    expect((await pedir(COLAB, `/api/chat/conversaciones/${ajena.id}/mensajes`)).status).toBe(404);
    expect(await lista(COLAB)).toEqual([]);
    expect((await pedir(COLAB, "/api/chat/conversaciones", { method: "POST", body: { clienteId: null } })).status).toBe(403);
  });

  it("renombrar y borrar: borrar se lleva sus mensajes y su resumen, y no toca las demás", async () => {
    const a = await crear(JEFE, "c1", "Uno");
    const b = await crear(JEFE, "c1", "Dos");
    await decir(JEFE, a.id, "mensaje de uno");
    await decir(JEFE, b.id, "mensaje de dos");
    db.sqlite.prepare("insert into chat_resumenes (id, owner_id, client_id, conversacion_id, content) values (?,?,?,?,?)").run(a.id, JEFE, "c1", a.id, "resumen de uno");
    const r = await pedir(JEFE, `/api/chat/conversaciones/${a.id}`, { method: "PATCH", body: { titulo: "  «Campaña de diciembre».  " } });
    expect((await r.json()).conversacion.titulo).toBe("Campaña de diciembre");
    expect((await pedir(JEFE, `/api/chat/conversaciones/${a.id}`, { method: "PATCH", body: { titulo: "  " } })).status).toBe(400);
    expect((await pedir(JEFE, `/api/chat/conversaciones/${a.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await lista(JEFE, "c1")).map((c) => c.titulo)).toEqual(["Dos"]);
    expect(db.sqlite.prepare("select content from chat_messages").all().map((f) => f.content)).toEqual(["mensaje de dos"]);
    expect(db.sqlite.prepare("select count(*) n from chat_resumenes").get().n).toBe(0);
  });

  it("sólo lectura no crea ni escribe", async () => {
    db.sqlite.prepare("update memberships set solo_lectura = 1 where user_id = ?").run(ANA);
    const a = await crear(JEFE, "c1", "Uno");
    expect((await pedir(ANA, "/api/chat/conversaciones", { method: "POST", body: { clienteId: "c1" } })).status).toBe(403);
    expect((await decir(ANA, a.id, "x")).status).toBe(403);
    expect((await lista(ANA, "c1")).map((c) => c.id)).toEqual([a.id]);
  });

  it("el título lo propone la IA con el primer intercambio, y se apunta en el consumo", async () => {
    const pedidos = [];
    vi.stubGlobal("fetch", async (url, init = {}) => {
      const u = String(url);
      if (u.includes("/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
      pedidos.push(JSON.parse(init.body));
      const ev = (t, d) => `event: ${t}\ndata: ${JSON.stringify(d)}\n\n`;
      return new Response([
        ev("message_start", { type: "message_start", message: { model: "claude-sonnet-5", content: [], usage: { input_tokens: 10, output_tokens: 0 } } }),
        ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
        ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "«Guiones de reels de octubre»." } }),
        ev("content_block_stop", { type: "content_block_stop", index: 0 }),
        ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 8 } }),
        ev("message_stop", { type: "message_stop" }),
      ].join(""), { headers: { "content-type": "text/event-stream" } });
    });
    env.ANTHROPIC_API_KEY = "k";
    const a = await crear(JEFE, "c1");
    expect((await pedir(JEFE, `/api/chat/conversaciones/${a.id}/titulo`, { method: "POST", body: {} })).status).toBe(400);
    await decir(JEFE, a.id, "Escríbeme los guiones de los reels de octubre");
    await decir(JEFE, a.id, "Aquí van los guiones", "assistant");
    const r = await pedir(JEFE, `/api/chat/conversaciones/${a.id}/titulo`, { method: "POST", body: {} });
    expect(r.status).toBe(200);
    expect((await r.json()).conversacion.titulo).toBe("Guiones de reels de octubre");
    const texto = JSON.stringify(pedidos.at(-1).messages);
    expect(texto).toMatch(/Escríbeme los guiones/);
    expect(texto).toMatch(/Dcasa/);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("título de conversación");
  });

  it("el resumen de una conversación larga es SUYO: no mezcla otra", async () => {
    const a = await crear(JEFE, "c1", "Uno");
    const r = await pedir(JEFE, `/api/ia/chat/resumen?conversacion=${a.id}`);
    expect(await r.json()).toEqual({ resumen: "", hasta: null });
    expect((await pedir(OTRA, `/api/ia/chat/resumen?conversacion=${a.id}`)).status).toBe(404);
  });
});
