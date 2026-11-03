import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE, hashearContrasena } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// Cambiar la contraseña, y que el administrador la restablezca
//
// Hasta ahora no había forma: la agencia seguía con la contraseña larga del
// alta. Lo que importa:
//   · hace falta la ACTUAL; con la nueva se entra y con la vieja no;
//   · se cierran las OTRAS sesiones de la persona, la de esta pestaña sigue;
//   · el administrador pone una temporal a otra persona de SU espacio (no al
//     fundador, no a alguien de fuera), y eso le cierra todas las sesiones;
//   · quien es de sólo lectura también cambia la suya.
// ============================================================

const JEFE = "u-jefe";
const ANA = "u-ana";
let db;
let env;

const pedir = (ruta, testigo, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    method: opciones.method ?? "GET",
    headers: { Cookie: `${COOKIE}=${testigo}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

const entrar = (email, password) =>
  worker.fetch(new Request("https://calendarios.test/api/acceso", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
  }), env);

async function sesion(usuario, testigo) {
  db.sqlite.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(testigo), usuario, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
}
const sesiones = (usuario) => db.sqlite.prepare("select count(*) as n from sessions where user_id = ?").get(usuario).n;

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  const jefe = await hashearContrasena("la-contraseña-larga-del-alta");
  const ana = await hashearContrasena("contraseña-de-ana-1");
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", jefe.password_hash, jefe.salt);
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(ANA, "ana@a.com", ana.password_hash, ana.salt);
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura) values (?,?,?,?,?,?)").run(ANA, JEFE, "editor", "Ana", "#22AA88", 1);
  await sesion(JEFE, "t-jefe");
  await sesion(JEFE, "t-jefe-movil");
  await sesion(ANA, "t-ana");
}, 30_000);

describe("cambiar mi contraseña", () => {
  it("con la actual, cambia; se entra con la nueva y no con la vieja; las otras sesiones se cierran", async () => {
    const r = await pedir("/equipo/yo/contrasena", "t-jefe", { method: "PUT", body: { actual: "la-contraseña-larga-del-alta", nueva: "una frase fácil de recordar" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, cerradas: 1 });
    expect(sesiones(JEFE), "sigue la de esta pestaña").toBe(1);
    expect((await pedir("/yo", "t-jefe")).status).toBe(200);
    expect((await pedir("/yo", "t-jefe-movil")).status).toBe(401);
    expect((await entrar("jefe@a.com", "una frase fácil de recordar")).status).toBe(200);
    expect((await entrar("jefe@a.com", "la-contraseña-larga-del-alta")).status).toBe(401);
  }, 30_000);

  it("sin la actual correcta, o con una nueva corta, no cambia nada", async () => {
    const mal = await pedir("/equipo/yo/contrasena", "t-jefe", { method: "PUT", body: { actual: "otra", nueva: "una frase fácil de recordar" } });
    expect(mal.status).toBe(400);
    expect((await mal.json()).error).toMatch(/actual no es correcta/);
    const corta = await pedir("/equipo/yo/contrasena", "t-jefe", { method: "PUT", body: { actual: "la-contraseña-larga-del-alta", nueva: "corta" } });
    expect(corta.status).toBe(400);
    expect(sesiones(JEFE)).toBe(2);
    expect((await entrar("jefe@a.com", "la-contraseña-larga-del-alta")).status).toBe(200);
  }, 30_000);

  it("quien es de sólo lectura también cambia la suya", async () => {
    const r = await pedir("/equipo/yo/contrasena", "t-ana", { method: "PUT", body: { actual: "contraseña-de-ana-1", nueva: "contraseña-de-ana-2" } });
    expect(r.status).toBe(200);
  }, 30_000);
});

describe("restablecer la de otra persona", () => {
  it("el administrador le pone una temporal: con ella se entra y sus sesiones se cierran", async () => {
    const r = await pedir(`/equipo/miembro/${ANA}/contrasena`, "t-jefe", { method: "POST" });
    expect(r.status).toBe(200);
    const { temporal } = await r.json();
    expect(temporal).toMatch(/^[A-Za-z2-9]{16}$/);
    expect(sesiones(ANA)).toBe(0);
    expect((await entrar("ana@a.com", temporal)).status).toBe(200);
  }, 30_000);

  it("no lo hace quien no administra, ni sobre el fundador ni sobre alguien de fuera", async () => {
    expect((await pedir(`/equipo/miembro/${JEFE}/contrasena`, "t-ana", { method: "POST" })).status).toBe(403);
    expect((await pedir(`/equipo/miembro/${JEFE}/contrasena`, "t-jefe", { method: "POST" })).status).toBe(400);
    expect((await pedir("/equipo/miembro/u-desconocido/contrasena", "t-jefe", { method: "POST" })).status).toBe(404);
  }, 30_000);
});
