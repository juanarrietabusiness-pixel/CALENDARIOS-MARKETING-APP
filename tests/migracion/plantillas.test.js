import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// Las plantillas de plan de la agencia (/api/plantillas-plan)
//
//   1. Sin nada guardado, las nueve de arranque.
//   2. Guardar una de arranque la sustituye; borrarla la restaura. Una propia
//      se crea, se edita y se borra.
//   3. Son del espacio: otra agencia no ve lo de esta, y la misma id puede
//      existir en las dos.
//   4. Las cambian quien administra y los editores; un colaborador, no.
//   5. El plan del cliente se guarda con su ficha (plan_contenido).
// ============================================================

let db;
let env;

async function sesion(s, usuario, owner, rol, testigo, clientes = null) {
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(usuario, `${usuario}@a.com`, "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(usuario, owner, rol, usuario, "#1E90FF", clientes);
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
  await sesion(s, "u-colab", "u-jefe", "editor", "t-colab", '["c1"]');
  await sesion(s, "u-otra", "u-otra", "admin", "t-otra");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", "u-jefe", "Dcasa");
});

describe("las plantillas de plan", () => {
  it("sin nada guardado, las nueve de arranque", async () => {
    const d = await (await pedir("/api/plantillas-plan")).json();
    expect(d.plantillas).toHaveLength(9);
    expect(d.plantillas.every((p) => p.base && !p.editada)).toBe(true);
  });

  it("cambiar una de arranque la sustituye y borrarla la restaura", async () => {
    const plantilla = { nombre: "Ventas, la nuestra", objetivo: "ventas", negocio: "productos", dias: { 1: [{ format: "reel", pilar: "" }] } };
    let d = await (await pedir("/api/plantillas-plan/ventas-productos", { method: "PUT", body: { plantilla } })).json();
    expect(d.plantillas.find((p) => p.id === "ventas-productos")).toMatchObject({ nombre: "Ventas, la nuestra", editada: true });
    // Guardar otra vez la misma no duplica.
    await pedir("/api/plantillas-plan/ventas-productos", { method: "PUT", body: { plantilla: { ...plantilla, nombre: "Otra vez" } } });
    expect(db.sqlite.prepare("select count(*) n from plantillas_plan").get().n).toBe(1);

    d = await (await pedir("/api/plantillas-plan/ventas-productos", { method: "DELETE" })).json();
    expect(d.plantillas.find((p) => p.id === "ventas-productos")).toMatchObject({ nombre: "Centrado en ventas · Productos", editada: false });
  });

  it("una propia se crea y se borra; una que no existe da «no encontrado»", async () => {
    let d = await (await pedir("/api/plantillas-plan/p-dcasa", { method: "PUT", body: { plantilla: { nombre: "Dcasa intensivo", dias: { 2: [{ format: "live" }] } } } })).json();
    expect(d.plantillas).toHaveLength(10);
    expect(d.plantillas.at(-1)).toMatchObject({ id: "p-dcasa", base: false });
    expect((await pedir("/api/plantillas-plan/p-dcasa", { method: "DELETE" })).status).toBe(200);
    expect((await pedir("/api/plantillas-plan/p-dcasa", { method: "DELETE" })).status).toBe(404);
    expect((await pedir("/api/plantillas-plan/p-x", { method: "PUT", body: { plantilla: { nombre: " " } } })).status).toBe(400);
  });

  it("son del espacio: la otra agencia no ve lo de esta y puede tener la suya con la misma id", async () => {
    await pedir("/api/plantillas-plan/ventas-marca", { method: "PUT", body: { plantilla: { nombre: "De Juancito" } } });
    let d = await (await pedir("/api/plantillas-plan", { testigo: "t-otra" })).json();
    expect(d.plantillas.find((p) => p.id === "ventas-marca").editada).toBe(false);
    expect((await pedir("/api/plantillas-plan/ventas-marca", { testigo: "t-otra", method: "PUT", body: { plantilla: { nombre: "De la otra" } } })).status).toBe(200);
    d = await (await pedir("/api/plantillas-plan")).json();
    expect(d.plantillas.find((p) => p.id === "ventas-marca").nombre).toBe("De Juancito");
  });

  it("un colaborador las ve pero no las cambia", async () => {
    expect((await pedir("/api/plantillas-plan", { testigo: "t-colab" })).status).toBe(200);
    expect((await pedir("/api/plantillas-plan/p-x", { testigo: "t-colab", method: "PUT", body: { plantilla: { nombre: "X" } } })).status).toBe(403);
  });

  it("el plan del cliente viaja con su ficha", async () => {
    const plan = { plantilla: "seguidores-productos", personalizada: null };
    const actual = await (await pedir("/api/espacio")).json();
    const cliente = actual.clients.find((c) => c.id === "c1");
    const r = await pedir("/api/clientes/c1", { method: "PUT", body: { ...cliente, plan_contenido: plan } });
    expect(r.status).toBeLessThan(300);
    const fila = db.sqlite.prepare("select plan_contenido from clients where id = 'c1'").get();
    expect(JSON.parse(fila.plan_contenido)).toEqual(plan);
  });
});
