import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso, TABLAS_CON_DUENO, TABLAS_CON_CLIENTE } from "../../worker/lib/acceso.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// Trabajar en equipo, contra una D1 de verdad
//
// Lo que aquí importa no se ve con una sola cuenta: que un colaborador
// NO vea los clientes que no son suyos (la capa lo acota, como al dueño),
// que sólo lectura no escriba, y que los avisos lleguen a quien toca.
// ============================================================

const JEFE = "u-jefe";
const BRUNO = "u-bruno";
const CARLA = "u-carla";
const T = { [JEFE]: "testigo-jefe-de-prueba", [BRUNO]: "testigo-bruno-de-prueba", [CARLA]: "testigo-carla-de-prueba" };

let db;
let env;

const post = (extra = {}) => ({ id: "p1", format: "post", title: "Lanzamiento", descripcion: "Hola", status: "pending", ...extra });

async function sembrar({ bruno = {}, carla = {} } = {}) {
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [BRUNO, "bruno@a.com"], [CARLA, "carla@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(T[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  const m = s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura, clientes) values (?,?,?,?,?,?,?)");
  m.run(JEFE, JEFE, "admin", "Juan", "#1E90FF", 0, null);
  m.run(BRUNO, JEFE, "editor", "Bruno Díaz", "#EC4899", bruno.soloLectura ? 1 : 0, bruno.clientes ? JSON.stringify(bruno.clientes) : null);
  m.run(CARLA, JEFE, "editor", "Carla", "#22C55E", carla.soloLectura ? 1 : 0, carla.clientes ? JSON.stringify(carla.clientes) : null);
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Baby Caleb");
  const cal = s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)");
  cal.run("cal1", "c1", JEFE, "Octubre", 9, 2026, JSON.stringify([{ date: "2026-10-05", posts: [post()] }]));
  cal.run("cal2", "c2", JEFE, "Octubre", 9, 2026, JSON.stringify([{ date: "2026-10-06", posts: [post({ id: "p2" })] }]));
}

const pedir = (quien, ruta, { method = "GET", body } = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  method, headers: { Cookie: `${COOKIE}=${T[quien]}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
}), env, {});
const avisosDe = (id) => db.sqlite.prepare("select * from avisos where user_id = ? order by created_at").all(id);

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db };
});

describe("la capa de acceso con un colaborador", () => {
  it("toda tabla con cliente está declarada: si no, un colaborador vería filas ajenas", () => {
    for (const tabla of TABLAS_CON_DUENO) {
      const cols = db.sqlite.prepare(`pragma table_info(${tabla})`).all().map((c) => c.name);
      if (cols.includes("client_id")) expect(TABLAS_CON_CLIENTE, `«${tabla}» tiene client_id y no está en TABLAS_CON_CLIENTE`).toContain(tabla);
    }
  });

  it("sólo lee sus clientes, sus calendarios y lo que cuelga de ellos", async () => {
    await sembrar();
    db.sqlite.prepare("insert into approvals (id, calendar_id, post_id, estado) values ('a1','cal1','p1','aprobado'), ('a2','cal2','p2','aprobado')").run();
    const a = crearAcceso(db, JEFE, { clientes: ["c1"] });
    expect((await a.leer("clients")).map((c) => c.id)).toEqual(["c1"]);
    expect((await a.leer("calendars")).map((c) => c.id)).toEqual(["cal1"]);
    expect((await a.leer("approvals")).map((x) => x.id)).toEqual(["a1"]);
    expect(await a.leerUno("calendars", { id: "cal2" })).toBeNull();
    // Sin ninguno, nada (y no un error de SQL).
    expect(await crearAcceso(db, JEFE, { clientes: [] }).leer("clients")).toEqual([]);
  });

  it("no escribe en otro cliente, ni pisando un id ajeno", async () => {
    await sembrar();
    const a = crearAcceso(db, JEFE, { clientes: ["c1"] });
    await expect(a.insertar("calendars", { id: "x", client_id: "c2", name: "X", month: 1, year: 2026 })).rejects.toThrow(/acceso/);
    // Mismo id que el calendario de Baby Caleb, «moviéndolo» a Café Luna: no lo toca.
    await a.guardar("calendars", { id: "cal2", client_id: "c1", name: "Robado", month: 9, year: 2026 });
    expect(db.sqlite.prepare("select client_id, name from calendars where id = 'cal2'").get()).toEqual({ client_id: "c2", name: "Octubre" });
  });

  it("por la API: el espacio de un colaborador sólo trae lo suyo", async () => {
    await sembrar({ bruno: { clientes: ["c1"] } });
    const r = await (await pedir(BRUNO, "/espacio")).json();
    expect(r.clients.map((c) => c.id)).toEqual(["c1"]);
    expect((await pedir(BRUNO, "/calendarios/cal2", { method: "PUT", body: { client_id: "c2", name: "X", month: 9, year: 2026, days: [] } })).status).toBe(403);
  });
});

describe("papeles", () => {
  it("sólo lectura mira pero no escribe (salvo su perfil y sus avisos)", async () => {
    await sembrar({ bruno: { soloLectura: true } });
    expect((await pedir(BRUNO, "/espacio")).status).toBe(200);
    expect((await pedir(BRUNO, "/calendarios/cal1", { method: "PUT", body: { client_id: "c1", name: "X", month: 9, year: 2026, days: [] } })).status).toBe(403);
    expect((await pedir(BRUNO, "/avisos/leer", { method: "POST", body: { todos: true } })).status).toBe(200);
    expect((await pedir(BRUNO, "/equipo/yo", { method: "PUT", body: { nombre: "Bruno" } })).status).toBe(200);
  });

  it("borrar un calendario entero y publicar al momento son de quien administra", async () => {
    await sembrar();
    expect((await pedir(BRUNO, "/calendarios/cal1", { method: "DELETE" })).status).toBe(403);
    expect((await pedir(BRUNO, "/publicar", { method: "POST", body: { calendarId: "cal1", postId: "p1", ahora: true } })).status).toBe(403);
    expect((await pedir(JEFE, "/calendarios/cal1", { method: "DELETE" })).status).toBe(204);
  });

  it("el administrador cambia el papel de alguien; nadie se cambia el suyo", async () => {
    await sembrar();
    const r = await pedir(JEFE, `/equipo/miembro/${BRUNO}`, { method: "PUT", body: { papel: "colaborador", clientes: ["c2"] } });
    expect(await r.json()).toMatchObject({ soloLectura: false, clientes: ["c2"] });
    expect((await pedir(BRUNO, `/equipo/miembro/${CARLA}`, { method: "PUT", body: { papel: "lectura" } })).status).toBe(403);
    expect((await pedir(JEFE, `/equipo/miembro/${JEFE}`, { method: "PUT", body: { papel: "editor" } })).status).toBe(400);
  });
});

describe("responsables y avisos", () => {
  it("asignar una tarea por nombre la casa con la persona y le avisa", async () => {
    await sembrar();
    const r = await pedir(JEFE, "/clientes/c1/tareas", { method: "POST", body: { title: "Diseñar portada", assigned_to: "bruno díaz" } });
    expect((await r.json()).asignado_id).toBe(BRUNO);
    expect(avisosDe(BRUNO)).toMatchObject([{ tipo: "tarea", texto: "Juan te asignó la tarea «Diseñar portada»." }]);
    // Asignarse algo a sí mismo no avisa.
    await pedir(BRUNO, "/clientes/c1/tareas", { method: "POST", body: { title: "Mía", assigned_to: "Bruno Díaz" } });
    expect(avisosDe(BRUNO)).toHaveLength(1);
  });

  it("cambiarse el nombre no deja las tareas sin dueño", async () => {
    await sembrar();
    await pedir(JEFE, "/clientes/c1/tareas", { method: "POST", body: { title: "X", assigned_to: "Bruno Díaz" } });
    await pedir(BRUNO, "/equipo/yo", { method: "PUT", body: { nombre: "Bruno" } });
    expect(db.sqlite.prepare("select assigned_to, asignado_id from client_tasks").get()).toEqual({ assigned_to: "Bruno", asignado_id: BRUNO });
  });

  it("asignar una publicación avisa y queda en el historial", async () => {
    await sembrar();
    const cal = { client_id: "c1", name: "Octubre", month: 9, year: 2026, days: [{ date: "2026-10-05", posts: [post({ responsableId: CARLA })] }] };
    expect((await pedir(JEFE, "/calendarios/cal1", { method: "PUT", body: cal })).status).toBe(200);
    expect(avisosDe(CARLA)).toMatchObject([{ tipo: "publicacion", texto: "Juan te asignó «Lanzamiento» de Café Luna." }]);
    const h = await (await pedir(JEFE, "/calendarios/cal1/historial?post=p1")).json();
    expect(h.map((x) => x.accion)).toEqual(["Se la asignó a Carla"]);
    // Guardar otra vez lo mismo no repite nada.
    await pedir(JEFE, "/calendarios/cal1", { method: "PUT", body: cal });
    expect(avisosDe(CARLA)).toHaveLength(1);
  });

  it("una @mención en el hilo del equipo avisa a quien se nombra, y a quien la lleva", async () => {
    await sembrar();
    db.sqlite.prepare("update calendars set days = ? where id = 'cal1'").run(JSON.stringify([{ date: "2026-10-05", posts: [post({ responsableId: CARLA })] }]));
    const r = await pedir(JEFE, "/calendarios/cal1/notas", { method: "POST", body: { postId: "p1", texto: "@Bruno cambia la foto, porfa" } });
    expect((await r.json()).menciones).toEqual([BRUNO]);
    expect(avisosDe(BRUNO)).toMatchObject([{ tipo: "mencion" }]);
    expect(avisosDe(CARLA)).toMatchObject([{ tipo: "nota" }]);
    const notas = await (await pedir(BRUNO, "/calendarios/cal1/notas?post=p1")).json();
    expect(notas).toMatchObject([{ autor_nombre: "Juan", texto: "@Bruno cambia la foto, porfa" }]);
  });

  it("la respuesta del cliente llega a quien la lleva", async () => {
    await sembrar();
    db.sqlite.prepare("update calendars set days = ?, share_token = ?, share_enabled = 1 where id = 'cal1'")
      .run(JSON.stringify([{ date: "2026-10-05", posts: [post({ responsableId: BRUNO })] }]), "t".repeat(48));
    await worker.fetch(new Request(`https://calendarios.test/api/publico/${"t".repeat(48)}/aprobacion`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: "p1", estado: "cambios", revisor: "Ana" }),
    }), env, {});
    expect(avisosDe(BRUNO)).toMatchObject([{ tipo: "cambios", texto: "Ana pidió cambios en «Lanzamiento»." }]);
    expect(avisosDe(CARLA)).toHaveLength(0);
  });

  it("la bandeja: sólo los míos, y se marcan leídos", async () => {
    await sembrar();
    await pedir(JEFE, "/clientes/c1/tareas", { method: "POST", body: { title: "X", assigned_to: "Carla" } });
    expect((await (await pedir(BRUNO, "/avisos")).json()).avisos).toEqual([]);
    let r = await (await pedir(CARLA, "/avisos")).json();
    expect(r.sinLeer).toBe(1);
    await pedir(CARLA, "/avisos/leer", { method: "POST", body: { todos: true } });
    r = await (await pedir(CARLA, "/avisos")).json();
    expect(r.sinLeer).toBe(0);
  });
});

describe("revisión interna", () => {
  it("el enlace del cliente sólo enseña lo que pasó la revisión", async () => {
    await sembrar();
    db.sqlite.prepare("update clients set revision_interna = 1 where id = 'c1'").run();
    db.sqlite.prepare("update calendars set days = ?, share_token = ?, share_enabled = 1 where id = 'cal1'").run(JSON.stringify([{ date: "2026-10-05", posts: [
      post({ id: "a", etapa: "produccion" }), post({ id: "b", etapa: "revision" }), post({ id: "c", etapa: "cliente" }), post({ id: "d", status: "approved" }),
    ] }]), "t".repeat(48));
    const r = await (await worker.fetch(new Request(`https://calendarios.test/api/publico/${"t".repeat(48)}`), env, {})).json();
    expect(r.calendar.calendar.days[0].posts.map((p) => p.id)).toEqual(["c", "d"]);
  });
});
