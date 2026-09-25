import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// Conectar Claude (MCP), por la puerta del Worker y contra una D1 de verdad
//
// Lo que importa: que Claude se pueda conectar SOLO siguiendo el estándar
// (descubrimiento, registro, permiso con PKCE, canje, renovación), que el
// token quede atado a la persona y a SU espacio, que un código sirva una
// vez, que desconectar corte, y que lo que escribe llegue a la base.
// ============================================================

const ORIGEN = "https://calendarios.test";
const VUELTA = "https://claude.ai/api/mcp/auth_callback";
let db;
let env;

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email, nombre] of [["u-ana", "ana@a.com", "Ana"], ["u-otro", "otro@b.com", "Otro"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", nombre, "#1E90FF");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(`sesion-${id}`), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into clients (id, owner_id, name, industry) values (?,?,?,?)").run("c1", "u-ana", "Café Luna", "Cafetería");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", "u-otro", "Cliente Ajeno");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal1", "c1", "u-ana", "Octubre", 9, 2026, JSON.stringify([{ date: "2026-10-05", dayName: "Lunes", posts: [{ id: "p1", format: "post", title: "Latte", status: "approved", publishTime: "10:00" }] }]));
}

const pedir = (ruta, opciones = {}) => worker.fetch(new Request(`${ORIGEN}${ruta}`, opciones), env, {});
const conSesion = (ruta, quien, opciones = {}) => pedir(ruta, {
  ...opciones, headers: { Cookie: `${COOKIE}=sesion-${quien}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
});

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function pkce() {
  const verificador = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const reto = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador)));
  return { verificador, reto };
}

/** El baile entero, como lo hace claude.ai. Devuelve los tokens. */
async function conectar(quien = "u-ana") {
  const reg = await (await pedir("/oauth/register", { method: "POST", body: JSON.stringify({ client_name: "Claude", redirect_uris: [VUELTA] }), headers: { "Content-Type": "application/json" } })).json();
  const { verificador, reto } = await pkce();
  const { redirect } = await (await conSesion("/api/mcp/autorizar", quien, {
    method: "POST", body: JSON.stringify({ clientId: reg.client_id, redirectUri: VUELTA, reto, metodo: "S256", state: "xyz" }),
  })).json();
  const code = new URL(redirect).searchParams.get("code");
  const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: VUELTA, client_id: reg.client_id, code_verifier: verificador });
  const tokens = await (await pedir("/oauth/token", { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } })).json();
  return { ...tokens, clientId: reg.client_id, redirect, code, verificador };
}

let n = 0;
const mcp = (token, method, params = {}) => pedir("/mcp", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }),
});
const llamar = async (token, name, args = {}) => (await (await mcp(token, "tools/call", { name, arguments: args })).json()).result;

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, ASSETS: { fetch: () => new Response("spa") } };
  await sembrar();
});

describe("descubrir y conectar", () => {
  it("sin token, 401 con dónde leer cómo conectarse; los metadatos dicen el resto", async () => {
    const r = await pedir("/mcp", { method: "POST", body: "{}" });
    expect(r.status).toBe(401);
    expect(r.headers.get("WWW-Authenticate")).toBe(`Bearer resource_metadata="${ORIGEN}/.well-known/oauth-protected-resource"`);
    const recurso = await (await pedir("/.well-known/oauth-protected-resource")).json();
    expect(recurso).toMatchObject({ resource: `${ORIGEN}/mcp`, authorization_servers: [ORIGEN] });
    const servidor = await (await pedir("/.well-known/oauth-authorization-server")).json();
    expect(servidor).toMatchObject({
      authorization_endpoint: `${ORIGEN}/conectar-claude`, token_endpoint: `${ORIGEN}/oauth/token`,
      registration_endpoint: `${ORIGEN}/oauth/register`, code_challenge_methods_supported: ["S256"],
    });
  });

  it("el registro sólo acepta vueltas https (o locales)", async () => {
    const mal = await pedir("/oauth/register", { method: "POST", body: JSON.stringify({ redirect_uris: ["http://malo.com/cb"] }), headers: { "Content-Type": "application/json" } });
    expect(mal.status).toBe(400);
    const bien = await pedir("/oauth/register", { method: "POST", body: JSON.stringify({ redirect_uris: ["http://localhost:3000/cb"] }), headers: { "Content-Type": "application/json" } });
    expect(bien.status).toBe(201);
  });

  it("permiso con PKCE → código → token; el state vuelve; el código no sirve dos veces", async () => {
    const t = await conectar();
    expect(new URL(t.redirect).searchParams.get("state")).toBe("xyz");
    expect(t).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
    expect(t.access_token).toMatch(/^[0-9a-f]{64}$/);
    const otra = new URLSearchParams({ grant_type: "authorization_code", code: t.code, redirect_uri: VUELTA, client_id: t.clientId, code_verifier: t.verificador });
    expect((await pedir("/oauth/token", { method: "POST", body: otra })).status).toBe(400);
    // Sólo se guardan huellas.
    expect(JSON.stringify(db.sqlite.prepare("select * from mcp_tokens").all())).not.toContain(t.access_token);
  });

  it("un verificador que no casa con el reto no da token", async () => {
    const reg = await (await pedir("/oauth/register", { method: "POST", body: JSON.stringify({ redirect_uris: [VUELTA] }), headers: { "Content-Type": "application/json" } })).json();
    const { reto } = await pkce();
    const { redirect } = await (await conSesion("/api/mcp/autorizar", "u-ana", { method: "POST", body: JSON.stringify({ clientId: reg.client_id, redirectUri: VUELTA, reto, metodo: "S256" }) })).json();
    const form = new URLSearchParams({ grant_type: "authorization_code", code: new URL(redirect).searchParams.get("code"), redirect_uri: VUELTA, client_id: reg.client_id, code_verifier: "otro-verificador-que-no-es-el-bueno-0000000000" });
    expect((await pedir("/oauth/token", { method: "POST", body: form })).status).toBe(400);
  });

  it("una vuelta distinta de la registrada no recibe código", async () => {
    const reg = await (await pedir("/oauth/register", { method: "POST", body: JSON.stringify({ redirect_uris: [VUELTA] }), headers: { "Content-Type": "application/json" } })).json();
    const { reto } = await pkce();
    const r = await conSesion("/api/mcp/autorizar", "u-ana", { method: "POST", body: JSON.stringify({ clientId: reg.client_id, redirectUri: "https://malo.com/cb", reto, metodo: "S256" }) });
    expect(r.status).toBe(400);
  });

  it("renovar rota el token; el de renovación viejo ya no sirve", async () => {
    const t = await conectar();
    const renovar = (rt) => pedir("/oauth/token", { method: "POST", body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: rt, client_id: t.clientId }) });
    const nuevo = await (await renovar(t.refresh_token)).json();
    expect(nuevo.access_token).not.toBe(t.access_token);
    expect((await renovar(t.refresh_token)).status).toBe(400);
    expect((await mcp(t.access_token, "ping")).status).toBe(401);
    expect((await mcp(nuevo.access_token, "ping")).status).toBe(200);
  });

  it("desconectar desde Ajustes corta el acceso", async () => {
    const t = await conectar();
    const [conexion] = await (await conSesion("/api/mcp/conexiones", "u-ana")).json();
    expect(conexion).toMatchObject({ nombre: "Claude", persona: "tú" });
    await conSesion(`/api/mcp/conexiones/${conexion.id}`, "u-ana", { method: "DELETE" });
    expect((await mcp(t.access_token, "ping")).status).toBe(401);
  });
});

describe("el protocolo y las herramientas", () => {
  it("initialize, tools/list y una notificación sin respuesta", async () => {
    const { access_token: tk } = await conectar();
    const ini = await (await mcp(tk, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude" } })).json();
    expect(ini.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "juancito-ads" } });
    const notif = await pedir("/mcp", { method: "POST", headers: { Authorization: `Bearer ${tk}` }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    expect(notif.status).toBe(202);
    const { result } = await (await mcp(tk, "tools/list")).json();
    const nombres = result.tools.map((x) => x.name);
    expect(nombres).toEqual(expect.arrayContaining(["listar_clientes", "ver_calendario", "crear_publicacion", "programar_lo_aprobado", "eliminar_publicacion"]));
    expect(result.tools.find((x) => x.name === "eliminar_publicacion").annotations.destructiveHint).toBe(true);
    expect(result.tools.every((x) => x.inputSchema?.type === "object")).toBe(true);
  });

  it("cada token ve SÓLO su espacio", async () => {
    const { access_token: tk } = await conectar("u-ana");
    const r = await llamar(tk, "listar_clientes");
    expect(r.content[0].text).toContain("Café Luna");
    expect(r.content[0].text).not.toContain("Cliente Ajeno");
    const ajeno = await llamar(tk, "ver_calendario", { cliente: "Cliente Ajeno" });
    expect(ajeno.isError).toBe(true);
  });

  it("crear, editar, mover y borrar llegan a la base", async () => {
    const { access_token: tk } = await conectar();
    const dias = () => JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal1'").get().days);

    const creada = await llamar(tk, "crear_publicacion", { cliente: "café luna", fecha: "2026-10-08", formato: "reel", titulo: "Receta", hora: "6:30 pm" });
    expect(creada.isError).toBeUndefined();
    const nueva = dias().find((d) => d.date === "2026-10-08").posts[0];
    expect(nueva).toMatchObject({ format: "reel", title: "Receta", publishTime: "18:30", status: "pending" });

    expect((await llamar(tk, "editar_publicacion", { publicacion_id: nueva.id, hora: "a las mil" })).isError).toBe(true);
    await llamar(tk, "editar_publicacion", { publicacion_id: nueva.id, descripcion: "Nuevo texto" });
    expect(dias().find((d) => d.date === "2026-10-08").posts[0].descripcion).toBe("Nuevo texto");

    await llamar(tk, "mover_publicacion", { publicacion_id: nueva.id, fecha: "2026-10-09" });
    expect(dias().find((d) => d.date === "2026-10-09").posts.map((p) => p.id)).toEqual([nueva.id]);
    expect((await llamar(tk, "mover_publicacion", { publicacion_id: nueva.id, fecha: "2026-11-01" })).isError).toBe(true);

    await llamar(tk, "eliminar_publicacion", { publicacion_id: nueva.id });
    expect(dias().flatMap((d) => d.posts).map((p) => p.id)).toEqual(["p1"]);
  });

  it("tareas e ideas", async () => {
    const { access_token: tk } = await conectar();
    const r = await llamar(tk, "crear_tarea", { cliente: "Café", titulo: "Grabar el reel", fecha_limite: "2026-10-07" });
    const id = /id ([\w-]+)\)/.exec(r.content[0].text)[1];
    expect(db.sqlite.prepare("select title, due_date, owner_id from client_tasks where id = ?").get(id)).toEqual({ title: "Grabar el reel", due_date: "2026-10-07", owner_id: "u-ana" });
    await llamar(tk, "completar_tarea", { tarea_id: id });
    expect(db.sqlite.prepare("select status from client_tasks where id = ?").get(id).status).toBe("completed");
    await llamar(tk, "anadir_idea", { cliente: "Café Luna", idea: "Latte art en cámara lenta", formato: "reel" });
    expect(JSON.parse(db.sqlite.prepare("select ideas_bank from clients where id = 'c1'").get().ideas_bank)[0]).toMatchObject({ idea: "Latte art en cámara lenta", format: "reel" });
  });

  it("programar sin Meta conectado devuelve el motivo, no un fallo del servidor", async () => {
    const { access_token: tk } = await conectar();
    const r = await llamar(tk, "programar_lo_aprobado", { cliente: "Café Luna" });
    expect(r.content[0].text).toMatch(/No se pudo|cuenta/);
    const una = await llamar(tk, "programar_publicacion", { publicacion_id: "p1" });
    expect(una.isError).toBe(true);
    expect(una.content[0].text).toMatch(/cuenta|Meta/);
  });

  it("una herramienta que no existe es un error de JSON-RPC", async () => {
    const { access_token: tk } = await conectar();
    const r = await (await mcp(tk, "tools/call", { name: "borrar_todo" })).json();
    expect(r.error.code).toBe(-32602);
  });
});
