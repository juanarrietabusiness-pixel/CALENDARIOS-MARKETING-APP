import { describe, it, expect, beforeEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearEjecutor } from "../../worker/lib/herramientasServidor.js";

// ============================================================
// `ver_tareas` da el id de cada tarea
//
// `completar_tarea` lo pide («el id sale de ver_tareas») y la lista no lo traía:
// ni Claude por MCP ni la agenda personal (que sincroniza lo hecho en los dos
// sentidos) podían cerrar una tarea que no hubieran creado ellos.
// ============================================================

let db;
let acceso;
const usar = async (input) => String((await crearEjecutor({ env: { DB: db }, acceso }).ejecutar({ id: "t1", name: "ver_tareas", input })).content);

beforeEach(() => {
  db = d1EnMemoria();
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-ana", "ana@a.com", "x", "x");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", "u-ana", "Café Luna");
  s.prepare("insert into client_tasks (id, owner_id, client_id, title, status) values (?,?,?,?,?)").run("t-abierta", "u-ana", "c1", "Revisar copys", "pending");
  s.prepare("insert into client_tasks (id, owner_id, client_id, title, status) values (?,?,?,?,?)").run("t-hecha", "u-ana", "c1", "Mandar factura", "completed");
  s.prepare("insert into quick_tasks (id, owner_id, title, status) values (?,?,?,?)").run("q-1", "u-ana", "Llamar al banco", "pending");
  acceso = crearAcceso(db, "u-ana");
});

describe("ver_tareas", () => {
  it("cada línea lleva su id, también las rápidas y las hechas", async () => {
    const todas = await usar({ estado: "todas" });
    expect(todas).toContain("· Revisar copys (id t-abierta)");
    expect(todas).toContain("· Mandar factura (hecha) (id t-hecha)");
    expect(todas).toContain("· Llamar al banco (id q-1)");
  });

  it("con cliente, igual", async () => {
    expect(await usar({ cliente: "Café Luna" })).toContain("(id t-abierta)");
  });
});
