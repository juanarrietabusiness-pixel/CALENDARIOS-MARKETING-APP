import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { planSemanalParaGuardar, semanaDelCliente } from "../../src/lib/planSemanal.js";
import { plantillasDisponibles } from "../../src/lib/plantillasPlan.js";
import { rowToClient, clientToRow } from "../../src/lib/filas.js";

// ============================================================
// El plan semanal ÚNICO (0066): PUT /api/clientes/<id>/plan-semanal
//
//   1. Guarda el formato nuevo y las columnas de antes derivadas, limpias.
//   2. Es del espacio: otro espacio da «no encontrado».
//   3. La ficha entera (clientToRow) no lleva la columna: una ficha abierta
//      desde antes no lo pisa.
// ============================================================

let db;
let env;
const lista = plantillasDisponibles([]);

async function sesion(s, usuario, owner, rol, testigo) {
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(usuario, `${usuario}@a.com`, "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(usuario, owner, rol, usuario, "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(testigo), usuario, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
}

const pedir = (ruta, { testigo = "t-jefe", ...opciones } = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${testigo}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  await sesion(s, "u-jefe", "u-jefe", "admin", "t-jefe");
  await sesion(s, "u-otra", "u-otra", "admin", "t-otra");
  s.prepare("insert into clients (id, owner_id, name, notas_semana) values (?,?,?,?)").run("c1", "u-jefe", "Dcasa", JSON.stringify({ 1: "vieja" }));
});

describe("el plan semanal único", () => {
  it("guarda el formato nuevo y las columnas de antes derivadas; se lee igual", async () => {
    const dias = semanaDelCliente({ name: "Dcasa" }, lista).dias;
    dias[1] = [{ format: "post", pilar: "anuncio", hora: "09:00" }];
    const cambio = planSemanalParaGuardar({ name: "Dcasa" }, lista, { dias, notas: { 1: "Muebles y camas" } });
    const r = await pedir("/api/clientes/c1/plan-semanal", { method: "PUT", body: { ...cambio, planSemanal: { ...cambio.planSemanal, dias: { ...cambio.planSemanal.dias, 2: [{ format: "post", pilar: "inventado" }] } } } });
    expect(r.status).toBe(200);
    const fila = db.sqlite.prepare("select plan_semanal, plan_contenido, ritmo_contenido, notas_semana from clients where id = 'c1'").get();
    const ps = JSON.parse(fila.plan_semanal);
    expect(ps.dias[1]).toEqual([{ format: "post", pilar: "anuncio", hora: "09:00" }]);
    // Lo que no es de la agencia se limpia.
    expect(ps.dias[2]).toEqual([]);
    expect(JSON.parse(fila.notas_semana)).toEqual({ 1: "Muebles y camas" });
    expect(JSON.parse(fila.ritmo_contenido)[1]).toBe("anuncio");
    expect(JSON.parse(fila.plan_contenido).personalizada.dias[1][0]).toMatchObject({ format: "post", hora: "09:00" });
    // Lo que devuelve ya es la fila del cliente: la pantalla la lee con rowToClient.
    const c = rowToClient(await r.json());
    expect(semanaDelCliente(c, lista).dias[1]).toEqual([{ format: "post", pilar: "anuncio", hora: "09:00" }]);
  });

  it("sin plan, 400; de otro espacio, no encontrado", async () => {
    expect((await pedir("/api/clientes/c1/plan-semanal", { method: "PUT", body: {} })).status).toBe(400);
    const cambio = planSemanalParaGuardar({ name: "Dcasa" }, lista, { dias: {} });
    expect((await pedir("/api/clientes/c1/plan-semanal", { method: "PUT", body: cambio, testigo: "t-otra" })).status).toBe(404);
  });

  it("guardar la ficha entera no lo pisa (clientToRow no lleva la columna)", async () => {
    const cambio = planSemanalParaGuardar({ name: "Dcasa" }, lista, { dias: { 1: [{ format: "reel", pilar: "humano", hora: "18:00" }] } });
    await pedir("/api/clientes/c1/plan-semanal", { method: "PUT", body: cambio });
    const fila = clientToRow({ id: "c1", name: "Dcasa", calendars: [] }, "u-jefe");
    expect(fila).not.toHaveProperty("plan_semanal");
    await pedir("/api/clientes/c1", { method: "PUT", body: fila });
    const ps = JSON.parse(db.sqlite.prepare("select plan_semanal from clients where id = 'c1'").get().plan_semanal);
    expect(ps.dias[1]).toEqual([{ format: "reel", pilar: "humano", hora: "18:00" }]);
  });
});
