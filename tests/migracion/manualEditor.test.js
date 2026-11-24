import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { guardarVersion } from "../../worker/lib/manualEditor.js";
import { PARTES_EDITOR } from "../../src/lib/manualEditor.js";

// ============================================================
// El manual del editor de videos grabados contra una D1 de verdad (/api/manual-editor): cada guardado es una versión,
// guardar con una versión vieja contesta 409 con la última, volver atrás es una versión nueva, sólo la agencia lo
// cambia y cada espacio ve el suyo.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const COLAB = "u-colab";
const EDITORA = "u-editora";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra", [COLAB]: "t-colab", [EDITORA]: "t-editora" };

let db;
let env;

async function sembrar() {
  const s = db.sqlite;
  for (const [id, owner, rol, clientes] of [[JEFE, JEFE, "admin", null], [OTRA, OTRA, "admin", null], [COLAB, JEFE, "editor", JSON.stringify(["c1"])], [EDITORA, JEFE, "editor", null]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)").run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(id, owner, rol, id === JEFE ? "Juan" : id, "#1E90FF", clientes);
  }
}

const pedir = (quien, ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  ...opciones,
  headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env);
const guardar = (quien, version, partes) => pedir(quien, "/manual-editor", { method: "PUT", body: { version, partes } });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-20T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
});
afterEach(() => { vi.useRealTimers(); });

describe("/api/manual-editor", () => {
  it("sin cambios de la agencia: versión 0, sin partes, vale el de la casa", async () => {
    const r = await (await pedir(JEFE, "/manual-editor")).json();
    expect(r).toEqual({ version: 0, partes: {}, guardada: null, cambiosDeLaCasa: [], versiones: [] });
  });

  it("cada guardado es una versión nueva, con quién y qué partes cambió", async () => {
    let r = await guardar(JEFE, 0, { "comun.corte": "- Corta lo nuestro.", "comun.inventada": "fuera" });
    expect(r.status).toBe(200);
    vi.setSystemTime(new Date("2026-11-20T16:00:00.000Z"));
    r = await guardar(JEFE, 1, { "comun.corte": "- Corta lo nuestro.", "comun.gancho": "- Gancho nuestro." });
    const e = await r.json();
    expect(e.version).toBe(2);
    expect(e.partes).toEqual({ "comun.corte": "- Corta lo nuestro.", "comun.gancho": "- Gancho nuestro." });
    expect(e.guardada).toMatchObject({ por: "Juan", motivo: "Editado a mano", cuando: "2026-11-20T16:00:00.000Z" });
    expect(e.versiones.map((v) => [v.version, v.cambia])).toEqual([[2, ["comun.gancho"]], [1, ["comun.corte"]]]);
  });

  it("guardar lo mismo no crea versión", async () => {
    await guardar(JEFE, 0, { "comun.corte": "A" });
    const e = await (await guardar(JEFE, 1, { "comun.corte": "A" })).json();
    expect(e.version).toBe(1);
    expect(e.versiones).toHaveLength(1);
  });

  it("con una versión vieja contesta 409 con la última y no pisa nada", async () => {
    await guardar(JEFE, 0, { "comun.corte": "de Juan" });
    const r = await guardar(EDITORA, 0, { "comun.corte": "de la editora" });
    expect(r.status).toBe(409);
    const b = await r.json();
    expect(b.actual).toEqual({ version: 1, partes: { "comun.corte": "de Juan" } });
    expect(b.error).toMatch(/Otra persona guardó el manual \(versión 1\)/);
    expect((await (await pedir(JEFE, "/manual-editor")).json()).partes).toEqual({ "comun.corte": "de Juan" });
  });

  it("si dos guardan la misma versión a la vez, entra uno y el otro recibe la última", async () => {
    const acceso = crearAcceso(db, JEFE);
    const [a, b] = await Promise.all([
      guardarVersion(acceso, { partes: { "comun.corte": "A" }, leida: 0 }),
      guardarVersion(acceso, { partes: { "comun.corte": "B" }, leida: 0 }),
    ]);
    const ok = [a, b].filter((x) => x.ok);
    const choques = [a, b].filter((x) => x.choque);
    expect(ok).toHaveLength(1);
    expect(choques).toHaveLength(1);
    expect(choques[0].choque.version).toBe(1);
  });

  it("volver atrás crea una versión NUEVA con las partes de la vieja", async () => {
    await guardar(JEFE, 0, { "comun.corte": "uno" });
    await guardar(JEFE, 1, { "comun.corte": "dos" });
    const vieja = await (await pedir(JEFE, "/manual-editor/versiones/1")).json();
    expect(vieja).toMatchObject({ version: 1, partes: { "comun.corte": "uno" } });
    const r = await pedir(JEFE, "/manual-editor/volver", { method: "POST", body: { a: 1, version: 2 } });
    expect(r.status).toBe(200);
    const e = await r.json();
    expect(e.version).toBe(3);
    expect(e.partes).toEqual({ "comun.corte": "uno" });
    expect(e.guardada.motivo).toBe("Vuelta a la versión 1");
    expect(e.versiones.map((v) => v.version)).toEqual([3, 2, 1]);
    // Con una versión leída vieja, tampoco.
    expect((await pedir(JEFE, "/manual-editor/volver", { method: "POST", body: { a: 2, version: 1 } })).status).toBe(409);
    expect((await pedir(JEFE, "/manual-editor/volver", { method: "POST", body: { a: 9, version: 3 } })).status).toBe(404);
  });

  it("avisa si la casa cambió una parte que la agencia editó", async () => {
    // Una versión guardada cuando la base del corte era otra (su huella no es la de hoy).
    db.sqlite.prepare("insert into manual_editor_versiones (id, owner_id, version, partes, bases, motivo) values (?,?,?,?,?,?)")
      .run("v1", JEFE, 1, JSON.stringify({ "comun.corte": "Lo nuestro", "comun.gancho": "G" }), JSON.stringify({ "comun.corte": "00000000" }), "");
    const e = await (await pedir(JEFE, "/manual-editor")).json();
    expect(e.cambiosDeLaCasa).toEqual(["comun.corte"]);
    // Guardar OTRA parte no borra el aviso.
    const d = await (await guardar(JEFE, 1, { "comun.corte": "Lo nuestro", "comun.gancho": "G2" })).json();
    expect(d.cambiosDeLaCasa).toEqual(["comun.corte"]);
    // Reescribir la parte (o devolverla a la casa) sí: se escribió sobre la base de hoy.
    const f = await (await guardar(JEFE, 2, { "comun.corte": "Lo nuestro, revisado", "comun.gancho": "G2" })).json();
    expect(f.cambiosDeLaCasa).toEqual([]);
  });

  it("sólo la agencia lo cambia: un colaborador lo lee pero no lo guarda", async () => {
    expect((await pedir(COLAB, "/manual-editor")).status).toBe(200);
    const r = await guardar(COLAB, 0, { "comun.corte": "no" });
    expect(r.status).toBe(403);
    expect((await guardar(EDITORA, 0, { "comun.corte": "sí" })).status).toBe(200);
    expect((await pedir(JEFE, "/manual-editor", { method: "PUT", body: { version: 1 } })).status).toBe(400);
  });

  it("cada espacio tiene el suyo", async () => {
    await guardar(JEFE, 0, { "comun.corte": "de la agencia de Juan" });
    const otra = await (await pedir(OTRA, "/manual-editor")).json();
    expect(otra.version).toBe(0);
    expect((await pedir(OTRA, "/manual-editor/versiones/1")).status).toBe(404);
    expect((await guardar(OTRA, 0, { "comun.corte": "de la otra" })).status).toBe(200);
    expect((await (await pedir(JEFE, "/manual-editor")).json()).partes["comun.corte"]).toBe("de la agencia de Juan");
  });

  it("las partes que se guardan son las de la base", () => {
    expect(PARTES_EDITOR.length).toBe(15);
  });
});
