import { describe, it, expect, beforeEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearEjecutor, DEFINICIONES, NOMBRES, NOTA_ENTERA } from "../../worker/lib/herramientasServidor.js";

// ============================================================
// El asistente responde con el CEREBRO del cliente
//
// Lo que se cuida: que lo encuentre ENTERO cuando es corto (con dos pasajes por
// nota, la estructura de un guion llegaba a medias), que pueda pedir una nota
// larga completa, que para escribir lo que se publica no le llegue lo interno,
// y que ya no tenga las herramientas del repositorio de GitHub, que daban datos
// de antes de corregirlos en el cerebro.
// ============================================================

let db;
let env;
let acceso;

const r2 = () => {
  const objetos = new Map();
  return {
    async get(k) { return objetos.has(k) ? { text: async () => objetos.get(k) } : null; },
    async put(k, v) { objetos.set(k, String(v)); },
    async delete(k) { objetos.delete(k); },
  };
};

const nota = (id, ruta, titulo, texto, { tipo = "marca", interna = 0, cliente = "c1", dueno = "u-ana" } = {}) => db.sqlite.prepare(
  "insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, texto, tipo, interna, caracteres) values (?,?,?,?,?,?,?,?,?)",
).run(id, dueno, cliente, ruta, titulo, texto, tipo, interna, texto.length);

const usar = async (name, input) => {
  const r = await crearEjecutor({ env, acceso, clienteActual: { id: "c1", name: "Café Luna" } }).ejecutar({ id: "t1", name, input });
  return { texto: String(r.content), error: Boolean(r.is_error) };
};

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2() };
  const s = db.sqlite;
  for (const id of ["u-ana", "u-otro"]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
  }
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", "u-ana", "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", "u-otro", "Cliente Ajeno");
  acceso = crearAcceso(db, "u-ana");
});

describe("el asistente y el cerebro", () => {
  it("ya no tiene las herramientas del repositorio de GitHub", () => {
    expect(NOMBRES.has("listar_repositorio")).toBe(false);
    expect(NOMBRES.has("leer_archivo_repositorio")).toBe(false);
    expect(DEFINICIONES.map((d) => d.name)).toEqual(expect.arrayContaining(["buscar_cerebro", "leer_nota_cerebro"]));
  });

  it("una nota corta llega ENTERA, no en dos pasajes", async () => {
    // Siete bloques de unos 300 caracteres: el índice la parte en varios pasajes y la búsqueda daba sólo dos.
    const bloques = Array.from({ length: 7 }, (_, i) => `Paso ${i + 1} del guion de reels: ${"gancho con pregunta al inicio y cierre con llamado a la acción ".repeat(4)}`);
    const texto = bloques.join("\n\n");
    expect(texto.length).toBeLessThan(NOTA_ENTERA);
    nota("n1", "estructura-reels", "Estructura de los reels", texto);
    const r = await usar("buscar_cerebro", { consulta: "estructura del guion de reels" });
    expect(r.error).toBe(false);
    expect(r.texto).toContain("(entera)");
    for (let i = 1; i <= 7; i++) expect(r.texto).toContain(`Paso ${i} del guion`);
  });

  it("de una nota larga da pasajes con su ruta, y leer_nota_cerebro la trae completa", async () => {
    const larga = Array.from({ length: 30 }, (_, i) => `Sección ${i + 1}: ${"la garantía de los sofás cubre la estructura y el tapizado ".repeat(5)}`).join("\n\n");
    expect(larga.length).toBeGreaterThan(NOTA_ENTERA);
    nota("n2", "garantia", "Garantía", larga);
    const r = await usar("buscar_cerebro", { consulta: "garantía de los sofás" });
    expect(r.texto).toContain("[garantia]");
    expect(r.texto).toMatch(/pasajes: pide el resto con leer_nota_cerebro/);
    expect(r.texto).not.toContain("Sección 30:");

    const entera = await usar("leer_nota_cerebro", { nota: "garantia" });
    expect(entera.error).toBe(false);
    expect(entera.texto).toContain("Sección 1:");
    expect(entera.texto).toContain("Sección 30:");
    const porTitulo = await usar("leer_nota_cerebro", { nota: "Garantía" });
    expect(porTitulo.texto).toContain("Sección 30:");
    expect((await usar("leer_nota_cerebro", { nota: "no existe" })).error).toBe(true);
  });

  it("para escribir lo que se publica, lo interno no existe; para el equipo sale marcado", async () => {
    nota("n3", "costos", "Costos", "El costo del kilo de café es de cinco dólares.", { interna: 1 });
    const equipo = await usar("buscar_cerebro", { consulta: "costo del kilo de café" });
    expect(equipo.texto).toContain("cinco dólares");
    expect(equipo.texto).toMatch(/INTERNA/);
    const publicar = await usar("buscar_cerebro", { consulta: "costo del kilo de café", para_publicar: true });
    expect(publicar.texto).not.toContain("cinco dólares");
    expect((await usar("leer_nota_cerebro", { nota: "costos", para_publicar: true })).error).toBe(true);
    expect((await usar("leer_nota_cerebro", { nota: "costos" })).texto).toContain("cinco dólares");
  });

  it("el cerebro de un cliente de otro espacio no se alcanza", async () => {
    nota("n9", "secreto", "Secreto", "El café del cliente ajeno se vende a domicilio.", { cliente: "c9", dueno: "u-otro" });
    const r = await usar("buscar_cerebro", { cliente: "Cliente Ajeno", consulta: "café" });
    expect(r.error).toBe(true);
    expect(r.texto).not.toContain("a domicilio");
    expect((await usar("leer_nota_cerebro", { cliente: "Cliente Ajeno", nota: "secreto" })).texto).not.toContain("a domicilio");
  });

  it("sin nada que responda, le pide probar otras palabras antes de decir que no lo sabe", async () => {
    nota("n1", "horario", "Horario", "Abrimos de lunes a sábado.");
    const r = await usar("buscar_cerebro", { consulta: "programa de lealtad puntos" });
    expect(r.texto).toMatch(/no tiene nada/);
    expect(r.texto).toMatch(/otras palabras/);
  });
});
