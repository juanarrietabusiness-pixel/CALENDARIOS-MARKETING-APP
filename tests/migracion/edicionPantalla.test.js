import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { KIT_EDICION } from "../../src/lib/kitEdicionVersion.js";

// ============================================================
// El editor de video grabado en la pantalla (/api/edicion, Fase 5) contra una D1 de verdad: las últimas ediciones del
// espacio (y sólo las de sus clientes, a un colaborador).
// ============================================================

const JEFE = "u-jefe";
const COLAB = "u-colab";
const OTRA = "u-otra";
const TESTIGO = { [JEFE]: "t-jefe", [COLAB]: "t-colab", [OTRA]: "t-otra" };

let db;
let env;

async function sembrar() {
  const s = db.sqlite;
  for (const [id, owner, rol, clientes] of [[JEFE, JEFE, "admin", null], [COLAB, JEFE, "editor", JSON.stringify(["c1"])], [OTRA, OTRA, "admin", null]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)").run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(id, owner, rol, id === JEFE ? "Juan" : id, "#1E90FF", clientes);
  }
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Rofer Service");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Baby Caleb");
  const acta = (id, cliente, cuando, correcciones) => s.prepare("insert into edicion_actas (id, owner_id, client_id, tipo, kit_version, manual_version, resumen, correcciones, created_at) values (?,?,?,?,?,?,?,?,?)")
    .run(id, JEFE, cliente, "persona-a-camara", "0.2.1", 1, JSON.stringify({ duracion: 40.1, lufs: -14 }), JSON.stringify(correcciones), cuando);
  acta("a1", "c1", "2026-11-21T10:00:00.000Z", [{ cita: "más arriba" }]);
  acta("a2", "c2", "2026-11-21T11:00:00.000Z", []);
}

const pedir = (quien, ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  ...opciones,
  headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env);

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
});

describe("/api/edicion/actas", () => {
  it("las últimas ediciones, las más nuevas primero, con su cliente y la versión del kit vigente", async () => {
    const r = await (await pedir(JEFE, "/edicion/actas")).json();
    expect(r.kit).toEqual(KIT_EDICION);
    expect(r.actas.map((a) => [a.id, a.cliente.nombre, a.correcciones])).toEqual([["a2", "Baby Caleb", 0], ["a1", "Rofer Service", 1]]);
    expect(r.actas[1]).toMatchObject({ tipo: "persona-a-camara", kitVersion: "0.2.1", manualVersion: 1, resumen: { duracion: 40.1, lufs: -14 } });
  });

  it("un colaborador ve sólo las de sus clientes; otro espacio, ninguna", async () => {
    expect((await (await pedir(COLAB, "/edicion/actas")).json()).actas.map((a) => a.id)).toEqual(["a1"]);
    expect((await (await pedir(OTRA, "/edicion/actas")).json()).actas).toEqual([]);
  });

  it("sin sesión no hay nada", async () => {
    const r = await worker.fetch(new Request("https://calendarios.test/api/edicion/actas"), env);
    expect(r.status).toBe(401);
  });
});

describe("/api/edicion/<cliente>/estilos", () => {
  const ROFER = { nombre: "Alex en obra", tipo: "persona-a-camara", gancho: "dolor gigante detrás desde el cuadro 0", camara: { abierto: 1.13, medio: 1.47 } };
  const kit = (id = "c1") => JSON.parse(db.sqlite.prepare("select kit_marca from clients where id = ?").get(id).kit_marca || "{}");

  it("leer trae lo que se puede escoger; guardar crea uno con id, y con su id lo REEMPLAZA entero", async () => {
    let r = await (await pedir(JEFE, "/edicion/c1/estilos")).json();
    expect(r.estilos).toEqual([]);
    expect(Object.keys(r.piezas)).toContain("textoDetras");
    expect(Object.keys(r.transiciones)).toContain("barrido-diagonal");
    r = await (await pedir(JEFE, "/edicion/c1/estilos", { method: "PUT", body: ROFER })).json();
    const [e] = r.estilos;
    expect(e).toMatchObject({ ...ROFER, id: expect.stringMatching(/^ee-/) });
    r = await (await pedir(JEFE, "/edicion/c1/estilos", { method: "PUT", body: { id: e.id, nombre: "Alex en obra", ritmo: "más lento" } })).json();
    expect(r.estilos).toEqual([{ id: e.id, nombre: "Alex en obra", ritmo: "más lento" }]);
    expect(kit().estilosEdicion).toHaveLength(1);
  });

  it("lo que no se entiende es un 400 con cada cosa, y no se guarda nada", async () => {
    const r = await pedir(JEFE, "/edicion/c1/estilos", { method: "PUT", body: { nombre: "Malo", transiciones: { entreClips: "estrella" }, camara: { medio: 9 } } });
    expect(r.status).toBe(400);
    const { error } = await r.json();
    expect(error).toMatch(/estrella/);
    expect(error).toMatch(/camara\.medio: 9 está fuera/);
    expect(kit().estilosEdicion).toBeUndefined();
  });

  it("quitar; y un colaborador no toca los estilos de un cliente que no lleva", async () => {
    const { estilos: [e] } = await (await pedir(JEFE, "/edicion/c1/estilos", { method: "PUT", body: ROFER })).json();
    expect((await pedir(COLAB, "/edicion/c2/estilos", { method: "PUT", body: ROFER })).status).toBe(404);
    expect((await (await pedir(JEFE, `/edicion/c1/estilos/${e.id}`, { method: "DELETE" })).json()).estilos).toEqual([]);
    expect((await pedir(JEFE, "/edicion/c1/estilos/ee-noexiste01", { method: "DELETE" })).status).toBe(404);
  });
});

describe("/api/edicion/propuestas", () => {
  // Dos propuestas del acta de Rofer: una GENERAL (para el manual) y una DE LA MARCA (para su estilo, que aún no tiene).
  beforeEach(() => {
    const s = db.sqlite;
    const p = (id, cliente, destino, parte, operacion, antes, texto, cita) => s.prepare(`insert into edicion_propuestas
      (id, owner_id, client_id, acta_id, destino, parte, operacion, antes, texto, cita, created_at) values (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, JEFE, cliente, "a1", destino, parte, operacion, antes, texto, cita, "2026-11-21T10:05:00.000Z");
    p("pe-general01", null, "manual", "tipos.persona-a-camara", "anadir", "", "Sin modo celular si el video no lo tiene.", "eso debe pasar en todos los videos");
    p("pe-marca0001", "c1", "estilo", "notas", "anadir", "", "Los textos un poco más arriba.", "pudieron quedar más arriba");
  });

  it("las generales y, con cliente, las de su marca, con el texto exacto, la cita y de qué edición salieron", async () => {
    const r = await (await pedir(JEFE, "/edicion/propuestas?cliente=c1")).json();
    expect(r.puedeManual).toBe(true);
    expect(r.generales).toEqual([expect.objectContaining({ id: "pe-general01", nombreParte: expect.stringMatching(/Persona a cámara/), cita: "eso debe pasar en todos los videos", de: { cliente: "Rofer Service", cuando: "2026-11-21T10:00:00.000Z" } })]);
    expect(r.deMarca.map((x) => [x.id, x.nombreParte])).toEqual([["pe-marca0001", "notas"]]);
    expect((await (await pedir(JEFE, "/edicion/propuestas")).json()).deMarca).toEqual([]);
  });

  it("aceptar la general crea una versión nueva del manual; la de la marca crea su estilo; rechazar la deja fuera", async () => {
    let r = await (await pedir(JEFE, "/edicion/propuestas/pe-general01/aplicar", { method: "POST" })).json();
    expect(r).toMatchObject({ ok: true, hecho: true, version: 1 });
    const m = await (await pedir(JEFE, "/manual-editor")).json();
    expect(m.partes["tipos.persona-a-camara"]).toMatch(/Sin modo celular si el video no lo tiene\.$/);
    r = await (await pedir(JEFE, "/edicion/propuestas/pe-marca0001/aplicar", { method: "POST" })).json();
    expect(r).toMatchObject({ hecho: true, estilo: "Rofer Service · persona-a-camara" });
    expect((await (await pedir(JEFE, "/edicion/c1/estilos")).json()).estilos[0].notas).toBe("Los textos un poco más arriba.");
    // Otra vez, no.
    expect((await pedir(JEFE, "/edicion/propuestas/pe-general01/aplicar", { method: "POST" })).status).toBe(409);
    const s = await (await pedir(JEFE, "/edicion/propuestas?cliente=c1")).json();
    expect([...s.generales, ...s.deMarca]).toEqual([]);
  });

  it("rechazar; y un colaborador no ve ni decide lo general (sólo lo de la marca de sus clientes)", async () => {
    const c = await (await pedir(COLAB, "/edicion/propuestas?cliente=c1")).json();
    expect(c.puedeManual).toBe(false);
    expect(c.generales).toEqual([]);
    expect(c.deMarca.map((x) => x.id)).toEqual(["pe-marca0001"]);
    expect((await pedir(COLAB, "/edicion/propuestas/pe-general01/aplicar", { method: "POST" })).status).toBe(404);
    expect((await (await pedir(COLAB, "/edicion/propuestas/pe-marca0001/descartar", { method: "POST" })).json())).toMatchObject({ hecho: true });
    expect(db.sqlite.prepare("select estado from edicion_propuestas where id = 'pe-marca0001'").get().estado).toBe("descartada");
  });
});
