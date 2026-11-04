import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// /api/videos/<cliente>: los proyectos de video animado, por las rutas de verdad
//
//   · un guion con errores no se guarda: 400 con cada error y su sitio;
//   · cambiar el guion sube la versión y lo devuelve a borrador; el título solo, no;
//   · guardar o aprobar con una versión vieja es 409 (otra persona lo cambió);
//   · aprobar fija la versión aprobada: es lo que dejará pagar la voz;
//   · el cliente de otro espacio no existe; quien es de sólo lectura no escribe.
// ============================================================

const JEFE = "u-jefe";
const OTRO = "u-otro";
const LECTOR = "u-lector";
let db;
let env;

const ejemplo = () => {
  const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
  return JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1]);
};

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
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("bc", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("ajeno", OTRO, "Ajeno");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year) values (?,?,?,?,?,?)").run("nov", "bc", JEFE, "Noviembre 2026", 10, 2026);
  await sesion(JEFE, "t-jefe");
  await sesion(OTRO, "t-otro");
  await sesion(LECTOR, "t-lector");
}, 30_000);

const crear = async (extra = {}) => (await pedir("/videos/bc", "t-jefe", { method: "POST", body: { guion: ejemplo(), ...extra } })).json();

describe("los proyectos de video animado", () => {
  it("se crean en borrador, con su guion limpio y su duración estimada", async () => {
    const r = await pedir("/videos/bc", "t-jefe", { method: "POST", body: { guion: ejemplo(), calendarId: "nov", postId: "p1" } });
    expect(r.status).toBe(201);
    const { video } = await r.json();
    expect(video).toMatchObject({ estado: "borrador", version: 1, aprobadaVersion: null, calendarId: "nov", postId: "p1", valido: true, titulo: "Toallitas Nateen · piel tranquila" });
    expect(video.segundos).toBeGreaterThan(10);
    const lista = await (await pedir("/videos/bc", "t-jefe")).json();
    expect(lista.videos.map((v) => v.id)).toEqual([video.id]);
    expect(lista.videos[0]).not.toHaveProperty("guion");
  });

  it("un guion con errores no se guarda y dice dónde está cada uno", async () => {
    const g = ejemplo();
    g.escenas[0].capas[0].tipo = "cohete";
    const r = await pedir("/videos/bc", "t-jefe", { method: "POST", body: { guion: g } });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.errores[0].donde).toBe("escenas[0].capas[0].tipo");
    expect(db.sqlite.prepare("select count(*) n from videos_proyectos").get().n).toBe(0);
  });

  it("un calendario de otro cliente no se acepta", async () => {
    db.sqlite.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("dc", JEFE, "D'CASA");
    const r = await pedir("/videos/dc", "t-jefe", { method: "POST", body: { guion: ejemplo(), calendarId: "nov" } });
    expect(r.status).toBe(400);
  });

  it("cambiar el guion sube la versión y lo devuelve a borrador; el título solo, no", async () => {
    const { video } = await crear();
    await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } });
    const titulo = await (await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { titulo: "Otro título", version: 1 } })).json();
    expect(titulo.video).toMatchObject({ titulo: "Otro título", version: 1, estado: "aprobado" });
    const g = ejemplo();
    g.escenas[1].pantalla = "Cambia";
    const r = await (await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { guion: g, version: 1 } })).json();
    expect(r.video).toMatchObject({ version: 2, estado: "borrador", aprobadaVersion: 1 });
    const igual = await (await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { guion: g, version: 2 } })).json();
    expect(igual.video.version).toBe(2);
  });

  it("guardar o aprobar con la versión vieja es 409, sin pisar nada", async () => {
    const { video } = await crear();
    const g = ejemplo();
    g.escenas[0].pantalla = "Primera";
    await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { guion: g, version: 1 } });
    g.escenas[0].pantalla = "Segunda";
    expect((await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { guion: g, version: 1 } })).status).toBe(409);
    expect((await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } })).status).toBe(409);
    const leido = await (await pedir(`/videos/bc/${video.id}`, "t-jefe")).json();
    expect(leido.video.guion.escenas[0].pantalla).toBe("Primera");
  });

  it("aprobar fija la versión aprobada, y no se aprueba dos veces", async () => {
    const { video } = await crear();
    const r = await (await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } })).json();
    expect(r.video).toMatchObject({ estado: "aprobado", aprobadaVersion: 1, aprobadoPor: JEFE });
    expect((await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } })).status).toBe(409);
  });

  it("un video con locución no se «aprueba» otra vez (lo devolvía a «Guion aprobado», como si no tuviera voz)", async () => {
    const { video } = await crear();
    await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } });
    db.sqlite.prepare("update videos_proyectos set estado = 'con_voz' where id = ?").run(video.id);
    expect((await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } })).status).toBe(409);
    const leido = await (await pedir(`/videos/bc/${video.id}`, "t-jefe")).json();
    expect(leido.video.estado).toBe("con_voz");
  });

  it("el cliente de otro espacio no existe, y quien es de sólo lectura no escribe", async () => {
    const { video } = await crear();
    expect((await pedir("/videos/bc", "t-otro")).status).toBe(404);
    expect((await pedir(`/videos/bc/${video.id}`, "t-otro")).status).toBe(404);
    expect((await pedir("/videos/ajeno", "t-jefe", { method: "POST", body: { guion: ejemplo() } })).status).toBe(404);
    expect((await pedir("/videos/bc", "t-lector")).status).toBe(200);
    expect((await pedir("/videos/bc", "t-lector", { method: "POST", body: { guion: ejemplo() } })).status).toBe(403);
  });

  it("se borra", async () => {
    const { video } = await crear();
    expect((await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "DELETE" })).status).toBe(200);
    expect((await pedir(`/videos/bc/${video.id}`, "t-jefe")).status).toBe(404);
  });
});
