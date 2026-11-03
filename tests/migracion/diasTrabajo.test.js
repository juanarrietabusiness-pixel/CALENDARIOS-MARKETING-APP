import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { rowToClient, clientToRow } from "../../src/lib/filas.js";

// ============================================================
// Los días fijos de cada empresa en Mi día por semanas
//
//   · PUT /api/clientes/<id>/dias los guarda limpios (1 lunes … 6 sábado);
//   · llegan a la pantalla como lista (`diasTrabajo`) y vacíos son null;
//   · guardar la ficha del cliente NO los pisa (`clientToRow` no lleva la columna);
//   · el cliente de otro espacio no existe; quien es de sólo lectura no los cambia.
// ============================================================

const JEFE = "u-jefe";
const OTRO = "u-otro";
const LECTOR = "u-lector";
let db;
let env;

const pedir = (ruta, testigo, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    method: opciones.method ?? "GET",
    headers: { Cookie: `${COOKIE}=${testigo}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

async function sesion(usuario, testigo) {
  db.sqlite.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(testigo), usuario, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
}
const columna = (id) => db.sqlite.prepare("select dias_trabajo from clients where id = ?").get(id).dias_trabajo;

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRO, "otro@b.com"], [LECTOR, "lector@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "y");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRO, OTRO, "admin", "Otra", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura) values (?,?,?,?,?,?)").run(LECTOR, JEFE, "editor", "Lector", "#22AA88", 1);
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("dcasa", JEFE, "D'CASA");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("ajeno", OTRO, "Ajeno");
  await sesion(JEFE, "t-jefe");
  await sesion(OTRO, "t-otro");
  await sesion(LECTOR, "t-lector");
}, 30_000);

describe("los días fijos de una empresa", () => {
  it("se guardan limpios y llegan a la pantalla como lista", async () => {
    const r = await pedir("/clientes/dcasa/dias", "t-jefe", { method: "PUT", body: { dias: [4, 1, 1, 9] } });
    expect(r.status).toBe(200);
    const fila = await r.json();
    expect(fila.dias_trabajo).toEqual([1, 4]);
    expect(rowToClient(fila).diasTrabajo).toEqual([1, 4]);
    expect(columna("dcasa")).toBe("[1,4]");

    const espacio = await (await pedir("/espacio", "t-jefe")).json();
    expect(rowToClient(espacio.clients.find((c) => c.id === "dcasa")).diasTrabajo).toEqual([1, 4]);
  }, 30_000);

  it("sin ninguno queda vacío (null), y sin lista es un 400", async () => {
    await pedir("/clientes/dcasa/dias", "t-jefe", { method: "PUT", body: { dias: [2] } });
    expect((await pedir("/clientes/dcasa/dias", "t-jefe", { method: "PUT", body: { dias: [] } })).status).toBe(200);
    expect(columna("dcasa")).toBeNull();
    expect((await pedir("/clientes/dcasa/dias", "t-jefe", { method: "PUT", body: { dias: "lunes" } })).status).toBe(400);
  }, 30_000);

  it("guardar la ficha del cliente no se los lleva", async () => {
    await pedir("/clientes/dcasa/dias", "t-jefe", { method: "PUT", body: { dias: [3] } });
    const cliente = rowToClient((await (await pedir("/espacio", "t-jefe")).json()).clients[0]);
    const fila = clientToRow({ ...cliente, name: "D'CASA Muebles" }, JEFE);
    expect("dias_trabajo" in fila).toBe(false);
    expect((await pedir("/clientes/dcasa", "t-jefe", { method: "PUT", body: fila })).status).toBe(200);
    expect(columna("dcasa")).toBe("[3]");
  }, 30_000);

  it("el cliente de otro espacio no existe, y quien es de sólo lectura no los cambia", async () => {
    expect((await pedir("/clientes/ajeno/dias", "t-jefe", { method: "PUT", body: { dias: [1] } })).status).toBe(404);
    expect(columna("ajeno")).toBeNull();
    expect((await pedir("/clientes/dcasa/dias", "t-lector", { method: "PUT", body: { dias: [1] } })).status).toBe(403);
    expect(columna("dcasa")).toBeNull();
  }, 30_000);
});
