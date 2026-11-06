import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE, clientesPermitidos } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { estructuraDeTramosConPeso, limpiarFormula, lineaDeFormula } from "../../src/lib/formulasUgc.js";

// ============================================================
// Las ESTRUCTURAS DE GUION por MCP: Claude las crea, corrige y quita con la MISMA lógica que Ajustes → Cómo trabajamos
//
//   · guardar_estructura (con id corrige; sin él, crea) y eliminar_estructura van por las funciones de
//     worker/lib/estructurasGuion.js que usa la ruta /api/formulas-ugc: misma tabla, misma validación, mismo permiso;
//   · lo que crea Claude sale igual en la pantalla de Ajustes (la ruta lo lista) y ver_estructuras da su ID;
//   · un colaborador no puede cambiarlas; un sólo lectura ni las ve como herramienta que escribe.
// ============================================================

const JEFE = "u-jefe";
const COLAB = "u-colab";
let db;
let env;
let avisos;

beforeEach(async () => {
  db = d1EnMemoria();
  avisos = [];
  env = {
    DB: db, ASSETS: { fetch: async () => new Response("") },
    HUB: { idFromName: (n) => n, get: () => ({ fetch: async (req) => { avisos.push(await req.json()); return new Response("ok"); } }) },
  };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "y");
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(COLAB, "colab@a.com", "x", "y");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Ana", "#1E90FF", JSON.stringify(["c1"]));
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Baby Caleb");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("t-jefe"), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
});

/** El perfil como lo arma la sesión del MCP (sesion.js): su papel y, si no es administrador, sus clientes. */
const perfil = (id) => {
  const m = db.sqlite.prepare("select * from memberships where user_id = ?").get(id);
  return { id, nombre: m.nombre, ownerId: m.owner_id, rol: m.rol, soloLectura: false, clientes: m.rol !== "admin" ? clientesPermitidos(m.clientes) : null };
};
const mcp = (id = JEFE) => {
  const usuario = perfil(id);
  return crearHerramientasMCP({ env, acceso: crearAcceso(db, JEFE, { clientes: usuario.clientes }), usuario });
};
async function llamar(nombre, entrada, id = JEFE) {
  const r = await mcp(id).llamar(nombre, entrada);
  return { texto: r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"), error: Boolean(r.isError) };
}
const pantalla = async () => (await (await worker.fetch(new Request("https://calendarios.test/api/formulas-ugc", { headers: { Cookie: `${COOKIE}=t-jefe` } }), env)).json()).formulas;

const PEDIDO = {
  nombre: "Pregunta incómoda → demostración → precio", para: "voz", duracion: 30,
  tramos: [
    { nombre: "Gancho", papel: "una pregunta que la persona se hace en voz alta", peso: 20, ejemplo: "¿Y si no es el pañal?" },
    { nombre: "Demostración", papel: "se ve el producto resolviéndolo", peso: 50 },
    { nombre: "Llamado", papel: "precio y a dónde escribir", peso: 30 },
  ],
  tipo_gancho: "pregunta incómoda", por_que_funciona: "nombra el problema antes que la marca", cuando_conviene: "productos con un antes y un después",
  variantes: "el gancho también vale como un dato que sorprende",
};

describe("lo puro: de tramos con peso a la forma de siempre", () => {
  it("cada tramo con su nombre, su papel y su ejemplo, y su tramo en segundos por su peso", () => {
    const f = limpiarFormula(estructuraDeTramosConPeso({ ...PEDIDO, para: ["voz"], tipoGancho: PEDIDO.tipo_gancho, porQue: PEDIDO.por_que_funciona, cuando: PEDIDO.cuando_conviene }));
    expect(f.tramos.map((t) => [t.desde, t.hasta])).toEqual([[0, 6], [6, 21], [21, 30]]);
    expect(f.tramos[0].funcion).toBe("Gancho — una pregunta que la persona se hace en voz alta. Ej.: «¿Y si no es el pañal?»");
    expect(f).toMatchObject({ para: ["voz"], gancho: "pregunta incómoda", variantes: "el gancho también vale como un dato que sorprende" });
    expect(lineaDeFormula(f, 15, { uso: "voz" })).toMatch(/Variantes que también valen: el gancho también vale/);
    // Sin pesos, a partes iguales; y una de antes (sin variantes) se limpia igual que siempre.
    const iguales = limpiarFormula(estructuraDeTramosConPeso({ nombre: "X", tramos: [{ papel: "a" }, { papel: "b" }], duracion: 10 }));
    expect(iguales.tramos.map((t) => [t.desde, t.hasta])).toEqual([[0, 5], [5, 10]]);
    expect(Object.keys(limpiarFormula({ nombre: "Y", tramos: [{ funcion: "a" }, { funcion: "b" }] }))).not.toContain("variantes");
  });
});

describe("guardar_estructura y eliminar_estructura por MCP", () => {
  it("crea con la lógica de Ajustes: sale en la pantalla, ver_estructuras da su ID y avisa al espacio", async () => {
    const r = await llamar("guardar_estructura", PEDIDO);
    expect(r.error).toBe(false);
    const id = /\(ID ([0-9a-f-]{36})\)/.exec(r.texto)?.[1];
    expect(id).toBeTruthy();
    expect(r.texto).toMatch(/estructura_id = /);
    const enPantalla = await pantalla();
    expect(enPantalla).toHaveLength(1);
    expect(enPantalla[0]).toMatchObject({ id, nombre: PEDIDO.nombre, para: ["voz"], gancho: "pregunta incómoda", variantes: PEDIDO.variantes });
    expect(avisos.some((a) => a.tipo === "formulas-ugc")).toBe(true);
    const ver = await llamar("ver_estructuras", { para: "voz" });
    expect(ver.texto).toContain(`(ID ${id})`);
    expect(ver.texto).toMatch(/Variantes: el gancho también vale/);
  });

  it("con id corrige ESA (y un id que no existe lo dice); eliminar_estructura la quita de la pantalla", async () => {
    const id = /\(ID ([0-9a-f-]{36})\)/.exec((await llamar("guardar_estructura", PEDIDO)).texto)[1];
    const c = await llamar("guardar_estructura", { ...PEDIDO, id, nombre: "Corregida", para: "ambos" });
    expect(c.error).toBe(false);
    expect(c.texto).toMatch(/Corregida la estructura «Corregida»/);
    expect((await pantalla()).map((f) => [f.id, f.nombre, f.para])).toEqual([[id, "Corregida", ["ugc", "voz"]]]);
    expect((await llamar("guardar_estructura", { ...PEDIDO, id: "no-existe" })).error).toBe(true);
    const q = await llamar("eliminar_estructura", { id });
    expect(q.error).toBe(false);
    expect(q.texto).toMatch(/Quitada la estructura «Corregida»/);
    expect(await pantalla()).toEqual([]);
    expect((await llamar("eliminar_estructura", { id })).error).toBe(true);
  });

  it("valida como siempre: sin nombre, con menos de dos tramos o sin para, no se guarda", async () => {
    expect((await llamar("guardar_estructura", { ...PEDIDO, nombre: "" })).error).toBe(true);
    expect((await llamar("guardar_estructura", { ...PEDIDO, tramos: [PEDIDO.tramos[0]] })).error).toBe(true);
    expect((await llamar("guardar_estructura", { ...PEDIDO, para: "otra" })).error).toBe(true);
    expect(await pantalla()).toEqual([]);
  });

  it("las mismas reglas que la pantalla: un colaborador (editor con clientes) no las cambia", async () => {
    const r = await llamar("guardar_estructura", PEDIDO, COLAB);
    expect(r.error).toBe(true);
    expect(r.texto).toMatch(/las cambia quien administra o un editor/);
    expect(await pantalla()).toEqual([]);
  });

  it("en el MCP: escriben (eliminar, destructiva), no piden cliente y dicen si gastan", () => {
    const por = Object.fromEntries(HERRAMIENTAS_MCP.map((h) => [h.name, h]));
    expect(por.guardar_estructura.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(por.eliminar_estructura.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(por.guardar_estructura.inputSchema.required).toEqual(["nombre", "para", "tramos"]);
    expect(por.eliminar_estructura.inputSchema.required).toEqual(["id"]);
    expect(por.eliminar_estructura.description).toMatch(/SÓLO si la persona lo pidió explícitamente/);
    for (const n of ["guardar_estructura", "eliminar_estructura"]) expect(por[n].description).toMatch(/No gasta nada/);
  });
});
