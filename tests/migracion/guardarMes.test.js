import { describe, it, expect, beforeEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import worker from "../../worker/index.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// Guardar un mes sin pisar a nadie, y releer UN mes
//
// El mes es una fila con todas sus publicaciones y el navegador la guarda entera. Con la versión leída
// (`X-Calendario-Version`, el `updated_at`) el servidor sólo escribe si nadie guardó después; si alguien lo hizo,
// 409 con lo que hay ahora, y la pantalla junta las dos (src/lib/fusionMes.js). Sin la cabecera, como siempre.
// Contra una D1 de verdad.
// ============================================================

let db;
let env;
const V1 = "2026-09-01T00:00:00.000Z";
const OCT = [{ date: "2026-10-05", dayName: "Lunes", posts: [{ id: "p1", format: "post", title: "Latte", status: "pending" }] }];

beforeEach(async () => {
  db = d1EnMemoria();
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u1", "a@a.com", "x", "x");
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u2", "b@b.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run("u1", "u1", "admin", "Ana", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run("u2", "u2", "admin", "Otro", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", "u1", "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", "u2", "De otro espacio");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days, updated_at) values (?,?,?,?,?,?,?,?)")
    .run("oct", "c1", "u1", "Octubre 2026", 9, 2026, JSON.stringify(OCT), V1);
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days, updated_at) values (?,?,?,?,?,?,?,?)")
    .run("ajeno", "c9", "u2", "Octubre 2026", 9, 2026, "[]", V1);
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("sesion-u1"), "u1", "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  env = { DB: db, ASSETS: { fetch: () => new Response("spa") } };
});

const pedir = (ruta, metodo = "GET", cuerpo, cabeceras = {}) => worker.fetch(new Request(`https://calendarios.test${ruta}`, {
  method: metodo, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  headers: { Cookie: `${COOKIE}=sesion-u1`, "Content-Type": "application/json", ...cabeceras },
}), env, {});
const fila = (id = "oct") => db.sqlite.prepare("select * from calendars where id = ?").get(id);
const mes = (days, extra = {}) => ({ client_id: "c1", name: "Octubre 2026", month: 9, year: 2026, days, ...extra });

describe("GET /api/calendarios/<id>: releer UN mes", () => {
  it("devuelve el mes con sus publicaciones (en JSON, no en texto) y su versión", async () => {
    const r = await pedir("/api/calendarios/oct");
    expect(r.status).toBe(200);
    const cal = await r.json();
    expect(cal.days[0].posts[0].id).toBe("p1");
    expect(cal.updated_at).toBe(V1);
  });

  it("uno que no existe, o de otro espacio, no se encuentra", async () => {
    expect((await pedir("/api/calendarios/nada")).status).toBe(404);
    expect((await pedir("/api/calendarios/ajeno")).status).toBe(404);
  });
});

describe("PUT /api/calendarios/<id> con la versión leída", () => {
  it("si nadie guardó después, escribe y la versión cambia", async () => {
    const dias = [{ ...OCT[0], posts: [{ ...OCT[0].posts[0], title: "Latte frío" }] }];
    const r = await pedir("/api/calendarios/oct", "PUT", mes(dias), { "X-Calendario-Version": V1 });
    expect(r.status).toBe(200);
    const guardado = await r.json();
    expect(guardado.days[0].posts[0].title).toBe("Latte frío");
    expect(guardado.updated_at).not.toBe(V1);
    expect(fila().updated_at).toBe(guardado.updated_at);
    // La fecha de creación no se toca con la condición.
    expect(fila().created_at).toBe(db.sqlite.prepare("select created_at from calendars where id = 'oct'").get().created_at);
  });

  it("si otra persona guardó entremedias, 409 con lo que hay ahora y NO escribe nada", async () => {
    db.sqlite.prepare("update calendars set days = ?, updated_at = ? where id = 'oct'")
      .run(JSON.stringify([{ ...OCT[0], posts: [...OCT[0].posts, { id: "p2", title: "Del Estudio" }] }]), "2026-09-02T00:00:00.000Z");
    const r = await pedir("/api/calendarios/oct", "PUT", mes([]), { "X-Calendario-Version": V1 });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.codigo).toBe("version");
    expect(j.calendario.updated_at).toBe("2026-09-02T00:00:00.000Z");
    expect(j.calendario.days[0].posts.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(JSON.parse(fila().days)[0].posts).toHaveLength(2);
  });

  it("sin la cabecera (pantallas de antes, lo que guarda por su cuenta), como siempre: gana la última escritura", async () => {
    db.sqlite.prepare("update calendars set updated_at = ? where id = 'oct'").run("2026-09-02T00:00:00.000Z");
    const r = await pedir("/api/calendarios/oct", "PUT", mes([]));
    expect(r.status).toBe(200);
    expect(JSON.parse(fila().days)).toEqual([]);
  });

  it("el 409 de un mes que ya existe (otro id) sigue siendo el de siempre, sin `codigo`", async () => {
    const r = await pedir("/api/calendarios/nuevo", "PUT", mes([]), { "X-Calendario-Version": V1 });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.codigo).toBeUndefined();
    expect(j.calendario.id).toBe("oct");
  });
});

describe("si la cola no se pudo poner al día al guardar", () => {
  it("se guarda igual y quien guardó lo sabe por su campana", async () => {
    // La cola no se puede leer: resincronizarCalendario lanza.
    db.sqlite.exec("alter table publicaciones_programadas rename to cola_rota");
    const r = await pedir("/api/calendarios/oct", "PUT", mes(OCT), { "X-Calendario-Version": V1 });
    expect(r.status).toBe(200);
    const avisos = db.sqlite.prepare("select * from avisos where user_id = 'u1'").all();
    expect(avisos).toHaveLength(1);
    expect(avisos[0].texto).toMatch(/Octubre 2026 de Café Luna.*cola de publicación no se pudo poner al día/);
    expect(avisos[0].enlace).toBe("/produccion");
  });
});
