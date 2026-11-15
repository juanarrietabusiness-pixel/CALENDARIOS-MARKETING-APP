import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// GET /api/primeros-pasos/<cliente> (worker/rutas/primerosPasos.js), contra una D1 de verdad
//
//   · Lee lo que cuenta de cada fila: la ficha, el logo del kit, el catálogo con sus fotos, el estudio APROBADO, la
//     ficha técnica del cerebro, sus redes y si algún mes tiene publicaciones.
//   · Sólo GET; un cliente de otro espacio (o de otro colaborador) no existe.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const COLAB = "u-colab";
let db;
let env;

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, ASSETS: { fetch: async () => new Response("") }, HUB: { idFromName: (n) => n, get: () => ({ fetch: async () => new Response("ok") }) } };
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRA, "otra@b.com"], [COLAB, "colab@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
  }
  for (const [token, user] of [["t-jefe", JEFE], ["t-colab", COLAB]]) {
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(token), user, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#123456");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Leo", "#654321", '["c2"]');

  // Dcasa lo tiene casi todo; Baby Caleb, recién creado; Ajeno, de otro espacio.
  s.prepare("insert into clients (id, owner_id, name, industry, descripcion, kit_marca, plan_semanal) values (?,?,?,?,?,?,?)")
    .run("c1", JEFE, "Dcasa", "Muebles", "Fábrica de sofás", JSON.stringify({ logo: "clientes/c1/logo.png" }), JSON.stringify({ dias: null }));
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  s.prepare("insert into mercado_clientes (id, owner_id, client_id, catalogo, estudio, borrador) values (?,?,?,?,?,?)").run("m1", JEFE, "c1",
    JSON.stringify([
      { id: "p1", nombre: "Sofá", activo: true, fotos: ["clientes/c1/sofa.jpg"] },
      { id: "p2", nombre: "Mesa", activo: true, fotos: [] },
      { id: "p3", nombre: "Viejo", activo: false, fotos: [] },
    ]),
    JSON.stringify({ aprobadoAt: "2026-10-01T00:00:00.000Z", general: {}, productos: {} }), null);
  s.prepare("insert into mercado_clientes (id, owner_id, client_id, catalogo, estudio, borrador) values (?,?,?,?,?,?)").run("m2", JEFE, "c2", "[]", null, JSON.stringify({ general: { rubro: "Bebés" } }));
  s.prepare("insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, tipo) values (?,?,?,?,?,?)").run("n1", JEFE, "c1", "ficha-tecnica", "Ficha técnica", "ficha");
  s.prepare("insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, tipo) values (?,?,?,?,?,?)").run("n2", JEFE, "c2", "precios", "Precios", "cifras");
  s.prepare("insert into cuentas_sociales (id, owner_id, client_id, red, externo_id, nombre) values (?,?,?,?,?,?)").run("k1", JEFE, "c1", "instagram", "ig1", "Dcasa");
  s.prepare("insert into calendars (id, client_id, owner_id, month, year, days) values (?,?,?,?,?,?)").run("cal1", "c1", JEFE, 10, 2026, JSON.stringify([{ date: "2026-11-02", posts: [{ id: "p1" }] }]));
  s.prepare("insert into calendars (id, client_id, owner_id, month, year, days) values (?,?,?,?,?,?)").run("cal2", "c2", JEFE, 10, 2026, JSON.stringify([{ date: "2026-11-02", posts: [] }]));
});

const pedir = (ruta, token = "t-jefe", metodo = "GET") =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, { method: metodo, headers: { Cookie: `${COOKIE}=${token}` } }), env);

describe("GET /api/primeros-pasos/<cliente>", () => {
  it("cuenta lo de cada fila: el catálogo activo con sus fotos, el estudio aprobado, la ficha técnica, las redes y el mes", async () => {
    const r = await pedir("/api/primeros-pasos/c1");
    expect(r.status).toBe(200);
    expect((await r.json()).estado).toEqual({
      ficha: true, logo: true, productos: 2, conFotos: 1, estudio: true, conBorrador: false, fichaTecnica: true, plan: true, redes: ["instagram"], mes: true,
    });
  });

  it("un cliente recién creado: nada hecho; un borrador del estudio se dice; un mes sin publicaciones no cuenta", async () => {
    const r = await pedir("/api/primeros-pasos/c2");
    expect((await r.json()).estado).toEqual({
      ficha: false, logo: false, productos: 0, conFotos: 0, estudio: false, conBorrador: true, fichaTecnica: false, plan: false, redes: [], mes: false,
    });
  });

  it("de otro espacio o de otro colaborador no existe; un colaborador ve los suyos", async () => {
    expect((await pedir("/api/primeros-pasos/c9")).status).toBe(404);
    expect((await pedir("/api/primeros-pasos/c1", "t-colab")).status).toBe(404);
    expect((await pedir("/api/primeros-pasos/c2", "t-colab")).status).toBe(200);
  });

  it("sólo lee: otro método o una ruta de más no existen", async () => {
    expect((await pedir("/api/primeros-pasos/c1", "t-jefe", "POST")).status).toBe(404);
    expect((await pedir("/api/primeros-pasos/c1/otra")).status).toBe(404);
  });
});
