import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { validarGuion, ESTADOS_VIDEO } from "../../src/lib/videoEscenas.js";

// ============================================================
// La tabla de proyectos de video animado (0059), en una D1 de verdad
//
//   · un guion validado se guarda y se lee igual por la capa de acceso;
//   · la base rechaza un estado inventado y un JSON roto;
//   · otro espacio no la ve; un colaborador sólo ve los de SUS clientes y no escribe en otros;
//   · borrar el cliente la borra; borrar el calendario la deja, sin publicación;
//   · reaplicar la migración no rompe nada (todo lleva «if not exists»).
// ============================================================

let db;
let acceso;
const ejemplo = () => {
  const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
  return validarGuion(JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1])).guion;
};

beforeEach(() => {
  db = d1EnMemoria();
  const s = db.sqlite;
  for (const id of ["u1", "u2"]) s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("bc", "u1", "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("dc", "u1", "D'CASA");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("aj", "u2", "Ajeno");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year) values (?,?,?,?,?,?)").run("nov", "bc", "u1", "Noviembre 2026", 10, 2026);
  acceso = crearAcceso(db, "u1");
});

const fila = (extra = {}) => ({ id: "v1", client_id: "bc", calendar_id: "nov", post_id: "p1", titulo: "Nateen", guion: JSON.stringify(ejemplo()), ...extra });

describe("videos_proyectos", () => {
  it("guarda un guion validado y lo devuelve igual", async () => {
    await acceso.insertar("videos_proyectos", fila());
    const leida = await acceso.leerUno("videos_proyectos", { id: "v1" });
    expect(leida).toMatchObject({ owner_id: "u1", estado: "borrador", version: 1, aprobada_version: null, locucion: "{}", render: "{}" });
    expect(JSON.parse(leida.guion)).toEqual(ejemplo());
  });

  it("la base rechaza un estado que no existe y un JSON roto", () => {
    const ins = (estado, guion = "{}") => () => db.sqlite.prepare("insert into videos_proyectos (id, owner_id, client_id, estado, guion) values (?,?,?,?,?)").run(`x-${estado}-${guion.length}`, "u1", "bc", estado, guion);
    for (const e of ESTADOS_VIDEO) expect(ins(e)).not.toThrow();
    expect(ins("publicado")).toThrow(/CHECK/);
    expect(ins("borrador", "{roto")).toThrow(/CHECK/);
  });

  it("otro espacio no lo ve, y un colaborador sólo ve los de sus clientes", async () => {
    await acceso.insertar("videos_proyectos", fila());
    await acceso.insertar("videos_proyectos", fila({ id: "v2", client_id: "dc", calendar_id: null, post_id: null }));
    expect(await crearAcceso(db, "u2").leer("videos_proyectos")).toEqual([]);
    const colaborador = crearAcceso(db, "u1", { clientes: ["dc"] });
    expect((await colaborador.leer("videos_proyectos")).map((v) => v.id)).toEqual(["v2"]);
    await expect(colaborador.insertar("videos_proyectos", fila({ id: "v3" }))).rejects.toThrow();
  });

  it("borrar el cliente lo borra; borrar el calendario lo deja sin publicación", () => {
    const s = db.sqlite;
    s.prepare("insert into videos_proyectos (id, owner_id, client_id, calendar_id, post_id) values (?,?,?,?,?)").run("v1", "u1", "bc", "nov", "p1");
    s.exec("pragma foreign_keys = on");
    s.prepare("delete from calendars where id = 'nov'").run();
    expect(s.prepare("select calendar_id from videos_proyectos where id = 'v1'").get().calendar_id).toBe(null);
    s.prepare("delete from clients where id = 'bc'").run();
    expect(s.prepare("select count(*) n from videos_proyectos").get().n).toBe(0);
  });

  it("la migración se puede volver a aplicar sin perder nada", async () => {
    await acceso.insertar("videos_proyectos", fila());
    db.sqlite.exec(readFileSync(new URL("../../migraciones/d1/0059_videos_animados.sql", import.meta.url), "utf8"));
    expect(await acceso.leerUno("videos_proyectos", { id: "v1" })).toBeTruthy();
  });
});
