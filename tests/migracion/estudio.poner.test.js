import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// «Poner en una publicación…» desde el Estudio (POST /api/estudio/<c>/poner)
//
// Lo que ya está en la galería va a un post de CUALQUIER mes del cliente: un
// carrusel entero en su orden o piezas sueltas, reemplazando o añadiendo, con su
// uso apuntado. No crea ni cobra nada, y no toca lo de otro cliente.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;

const pedir = (ruta, cuerpo) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  method: "POST", headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo),
}), env);

const dias = (posts) => JSON.stringify([{ date: "2026-12-04", dayName: "Viernes", posts }]);

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: { head: async () => null, get: async () => null, put: async () => {}, delete: async () => {} }, ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)").run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Otro");
  // Diciembre: un mes que no es el que se mira (cualquier mes del cliente).
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal-dic", "c1", JEFE, "Diciembre 2026", 11, 2026, dias([{ id: "p1", format: "post", title: "Sofá", status: "pending", medios: [{ src: "/api/media/clientes/c1/vieja.png", tipo: "imagen" }] }]));
  s.prepare("insert into estudio_carpetas (id, owner_id, client_id, nombre, tipo, orden) values (?,?,?,?,?,?)").run("k1", JEFE, "c1", "Carrusel · sofá", "carrusel", JSON.stringify(["a2", "a1"]));
  const archivo = s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, carpeta_id) values (?,?,?,?,?,?,?)");
  archivo.run("a1", JEFE, "c1", "clientes/c1/estudio/a1.png", "imagen", "image/png", "k1");
  archivo.run("a2", JEFE, "c1", "clientes/c1/estudio/a2.png", "imagen", "image/png", "k1");
  archivo.run("a3", JEFE, "c1", "clientes/c1/estudio/a3.png", "imagen", "image/png", null);
  archivo.run("z9", JEFE, "c2", "clientes/c2/estudio/z9.png", "imagen", "image/png", null);
});

const postDe = (id) => JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal-dic'").get().days)[0].posts.find((p) => p.id === id);

describe("«Poner en una publicación…» desde el Estudio", () => {
  it("un carrusel entero, en su orden, en lugar de lo que tenía: el post pasa a carrusel y se apunta el uso", async () => {
    const r = await pedir("/estudio/c1/poner", { postId: "p1", carpetaId: "k1" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ calendarId: "cal-dic", postId: "p1", n: 2, formato: "carrusel" });
    const post = postDe("p1");
    expect(post.medios.map((m) => m.src)).toEqual(["/api/media/clientes/c1/estudio/a2.png", "/api/media/clientes/c1/estudio/a1.png"]);
    const uso = JSON.parse(db.sqlite.prepare("select usado_en from estudio_archivos where id = 'a1'").get().usado_en);
    expect(uso[0]).toMatchObject({ calendarId: "cal-dic", postId: "p1" });
  });

  it("una suelta, añadida al final de lo que había", async () => {
    const r = await pedir("/estudio/c1/poner", { postId: "p1", archivoIds: ["a3"], modo: "anadir" });
    expect(r.status).toBe(200);
    expect(postDe("p1").medios.map((m) => m.src)).toEqual(["/api/media/clientes/c1/vieja.png", "/api/media/clientes/c1/estudio/a3.png"]);
  });

  it("lo de otro cliente no se pone, y un post que no existe lo dice", async () => {
    expect((await pedir("/estudio/c1/poner", { postId: "p1", archivoIds: ["z9"] })).status).toBe(404);
    expect(postDe("p1").medios).toHaveLength(1);
    const r = await pedir("/estudio/c1/poner", { postId: "no-existe", archivoIds: ["a3"] });
    expect(r.status).toBe(409);
  });
});
