import { describe, it, expect, beforeEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { obtenerOCrearMes, moverDeMes, ErrorMes } from "../../worker/lib/meses.js";
import worker from "../../worker/index.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// El calendario siempre activo: el mes es un cajón, uno por cliente, y
// una publicación se lleva a otro mes CON TODO lo que la señala.
//
// Contra una D1 de verdad (SQLite con todas las migraciones): lo que se
// prueba aquí es justo lo que un doble a mano no ve —el índice único, que
// el lote es todo o nada, que las seis tablas cambian de calendario—.
// ============================================================

let db;
let acceso;

const OCT = [{ date: "2026-10-05", dayName: "Lunes", posts: [
  { id: "p1", format: "post", title: "Latte", status: "approved", publishTime: "10:00" },
  { id: "p2", format: "reel", title: "Publicado", status: "published" },
] }];

beforeEach(() => {
  db = d1EnMemoria();
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u1", "a@a.com", "x", "x");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", "u1", "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", "u1", "Otro");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days, updated_at) values (?,?,?,?,?,?,?,?)")
    .run("oct", "c1", "u1", "Octubre 2026", 9, 2026, JSON.stringify(OCT), "2026-09-01T00:00:00.000Z");
  // Todo lo que señala a p1 por «calendario + publicación».
  s.prepare("insert into approvals (id, calendar_id, post_id, estado) values (?,?,?,?)").run("a1", "oct", "p1", "aprobado");
  s.prepare("insert into comentarios_aprobacion (id, calendar_id, post_id, autor, texto) values (?,?,?,?,?)").run("k1", "oct", "p1", "cliente", "¡Me encanta!");
  s.prepare("insert into publicaciones_programadas (id, owner_id, client_id, calendar_id, post_id, red, programada_para) values (?,?,?,?,?,?,?)")
    .run("q1", "u1", "c1", "oct", "p1", "instagram", "2026-10-05T15:00:00.000Z");
  s.prepare("insert into client_tasks (id, client_id, owner_id, title, calendar_id, post_id) values (?,?,?,?,?,?)").run("t1", "c1", "u1", "Diseñar", "oct", "p1");
  s.prepare("insert into notas_equipo (id, owner_id, calendar_id, post_id, autor_id, texto) values (?,?,?,?,?,?)").run("n1", "u1", "oct", "p1", "u1", "Ojo al logo");
  s.prepare("insert into historial (id, owner_id, calendar_id, post_id, accion) values (?,?,?,?,?)").run("h1", "u1", "oct", "p1", "creó");
  acceso = crearAcceso(db, "u1");
});

const calDe = (tabla, id) => db.sqlite.prepare(`select calendar_id from ${tabla} where id = ?`).get(id).calendar_id;
const posts = (calId) => JSON.parse(db.sqlite.prepare("select days from calendars where id = ?").get(calId).days).flatMap((d) => d.posts.map((p) => p.id));
const AHORA = Date.parse("2026-09-29T12:00:00Z");

describe("un solo mes por cliente", () => {
  it("obtener o crear devuelve el mismo cajón las dos veces", async () => {
    const a = await obtenerOCrearMes(acceso, "c1", 2026, 10);
    const b = await obtenerOCrearMes(acceso, "c1", 2026, 10);
    expect(a.creado).toBe(true);
    expect(b.creado).toBe(false);
    expect(b.fila.id).toBe(a.fila.id);
    expect(a.fila.name).toBe("Noviembre 2026");
  });

  it("la base rechaza un segundo octubre para el mismo cliente", () => {
    // Lo que hacía «Duplicar calendario» con «Octubre 2026 (copia)».
    expect(() => db.sqlite.prepare("insert into calendars (id, client_id, owner_id, name, month, year) values (?,?,?,?,?,?)")
      .run("oct2", "c1", "u1", "Octubre 2026 (copia)", 9, 2026)).toThrow(/UNIQUE/);
  });

  it("pero otro cliente sí tiene su octubre", async () => {
    expect((await obtenerOCrearMes(acceso, "c2", 2026, 9)).creado).toBe(true);
  });

  it("un mes o un cliente que no existen no crean nada", async () => {
    await expect(obtenerOCrearMes(acceso, "c1", 2026, 12)).rejects.toBeInstanceOf(ErrorMes);
    await expect(obtenerOCrearMes(acceso, "nadie", 2026, 1)).rejects.toBeInstanceOf(ErrorMes);
  });

  it("un colaborador no crea meses de clientes que no son suyos", async () => {
    const colaborador = crearAcceso(db, "u1", { clientes: ["c2"] });
    await expect(obtenerOCrearMes(colaborador, "c1", 2026, 11)).rejects.toThrow();
  });
});

describe("mover de mes: todo o nada", () => {
  it("la publicación y las SEIS tablas que la señalan cambian de mes", async () => {
    const r = await moverDeMes(acceso, { calId: "oct", postId: "p1", fecha: "2026-11-03", ahoraMs: AHORA });
    const nov = r.destino.id;
    expect(posts("oct")).toEqual(["p2"]);
    expect(posts(nov)).toEqual(["p1"]);
    for (const [tabla, id] of [["approvals", "a1"], ["comentarios_aprobacion", "k1"], ["publicaciones_programadas", "q1"], ["client_tasks", "t1"], ["notas_equipo", "n1"], ["historial", "h1"]]) {
      expect(calDe(tabla, id), tabla).toBe(nov);
    }
  });

  it("si alguien guardó uno de los dos meses entremedias, no se mueve NADA", async () => {
    const origen = await acceso.leerUno("calendars", { id: "oct" });
    const destino = (await obtenerOCrearMes(acceso, "c1", 2026, 10)).fila;
    // Otra persona guarda octubre después de que lo leyéramos.
    db.sqlite.prepare("update calendars set updated_at = ? where id = 'oct'").run("2026-09-02T00:00:00.000Z");
    const ok = await acceso.trasladarPublicacion({
      origen, destino, postId: "p1", diasOrigen: [], diasDestino: [{ date: "2026-11-03", posts: [OCT[0].posts[0]] }], marca: "2026-09-29T12:00:00.000Z",
    });
    expect(ok).toBe(false);
    expect(posts("oct")).toEqual(["p1", "p2"]);
    expect(posts(destino.id)).toEqual([]);
    expect(calDe("approvals", "a1")).toBe("oct");
    expect(calDe("publicaciones_programadas", "q1")).toBe("oct");
  });

  it("lo publicado no se mueve", async () => {
    await expect(moverDeMes(acceso, { calId: "oct", postId: "p2", fecha: "2026-11-03", ahoraMs: AHORA })).rejects.toThrow(/publicada/);
  });

  it("lo que se está publicando o ya salió en una red, tampoco", async () => {
    db.sqlite.prepare("update publicaciones_programadas set estado = 'procesando' where id = 'q1'").run();
    await expect(moverDeMes(acceso, { calId: "oct", postId: "p1", fecha: "2026-11-03", ahoraMs: AHORA })).rejects.toThrow(/publicando/);
  });

  it("lo programado no se lleva a un momento que ya pasó", async () => {
    await expect(moverDeMes(acceso, { calId: "oct", postId: "p1", fecha: "2026-08-03", ahoraMs: AHORA })).rejects.toThrow(/ya pasó/);
    expect(posts("oct")).toEqual(["p1", "p2"]);
  });

  it("dentro del mismo mes no es cosa de esta operación", async () => {
    await expect(moverDeMes(acceso, { calId: "oct", postId: "p1", fecha: "2026-10-20", ahoraMs: AHORA })).rejects.toThrow(/mismo mes/);
  });

  it("el destino es siempre del MISMO cliente", async () => {
    const r = await moverDeMes(acceso, { calId: "oct", postId: "p1", fecha: "2026-12-01", ahoraMs: AHORA });
    expect(r.destino.client_id).toBe("c1");
  });
});

describe("por la puerta del Worker", () => {
  let env;
  beforeEach(async () => {
    db.sqlite.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run("u1", "u1", "admin", "Ana", "#1E90FF");
    db.sqlite.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256("sesion-u1"), "u1", "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    env = { DB: db, ASSETS: { fetch: () => new Response("spa") } };
  });
  const pedir = (ruta, metodo, cuerpo) => worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    method: metodo, body: JSON.stringify(cuerpo), headers: { Cookie: `${COOKIE}=sesion-u1`, "Content-Type": "application/json" },
  }), env, {});

  it("POST /api/calendarios/mes crea el cajón una vez y después lo devuelve", async () => {
    const a = await pedir("/api/calendarios/mes", "POST", { clientId: "c1", year: 2027, month: 0 });
    expect(a.status).toBe(201);
    const b = await pedir("/api/calendarios/mes", "POST", { clientId: "c1", year: 2027, month: 0 });
    expect(b.status).toBe(200);
    expect((await b.json()).id).toBe((await a.json()).id);
  });

  it("crear otra vez un mes que ya existe devuelve 409 con el que hay, no un 500", async () => {
    const r = await pedir("/api/calendarios/nuevo", "PUT", { client_id: "c1", name: "Octubre 2026 (copia)", month: 9, year: 2026, days: [] });
    expect(r.status).toBe(409);
    expect((await r.json()).calendario.id).toBe("oct");
  });

  it("POST /api/calendarios/<id>/mover lleva la publicación y responde los dos meses", async () => {
    const r = await pedir("/api/calendarios/oct/mover", "POST", { postId: "p1", fecha: "2027-01-10" });
    expect(r.status).toBe(200);
    const { origen, destino } = await r.json();
    expect(origen.days.flatMap((d) => d.posts.map((p) => p.id))).toEqual(["p2"]);
    expect(destino.days.flatMap((d) => d.posts.map((p) => p.id))).toEqual(["p1"]);
  });

  it("y lo que no se puede mover vuelve con su motivo", async () => {
    const r = await pedir("/api/calendarios/oct/mover", "POST", { postId: "p2", fecha: "2027-01-10" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/publicada/);
  });
});
