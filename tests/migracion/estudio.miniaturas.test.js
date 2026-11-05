import { describe, it, expect, beforeEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearEjecutor } from "../../worker/lib/herramientasServidor.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { miniaturaDe, MAX_PIEZAS_VISTAS } from "../../worker/lib/estudio/miniaturas.js";
import { lineaDePieza } from "../../worker/lib/estudio/herramientas.js";

// ============================================================
// Claude VE lo que crea: las piezas del Estudio vuelven como imagen (copia reducida por el Container)
//
//   · estado_trabajo, terminado, trae las imágenes; en marcha, no (no se enseña a medias).
//   · ver_pieza enseña piezas de la galería de ESE cliente por su ID, con lo que se sabe de ellas.
//   · La copia la hace el Container (/miniatura); sin él, la original sólo si es pequeña; si no, nada (no tumba).
//   · Lo de otro cliente o de la papelera no se enseña.
// ============================================================

const ANA = "u-ana";
const OTRO = "u-otro";
const USUARIO = { id: ANA, nombre: "Ana" };
const POR = { userId: ANA, nombre: "Ana", color: "#1E90FF", tab: null };
// Un PNG de 1×1 de verdad (69 bytes): lo bastante pequeño para mandarse tal cual sin Container.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

let db;
let env;
let acceso;
let objetos;
let pedidosAlContenedor;

function r2() {
  objetos = new Map();
  return {
    async head(clave) { return objetos.has(clave) ? { size: objetos.get(clave).length } : null; },
    async get(clave) {
      const b = objetos.get(clave);
      if (!b) return null;
      return { size: b.length, httpMetadata: { contentType: "image/png" }, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
    },
    async put(clave, valor) { objetos.set(clave, valor); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

/** Un Durable Object del Container de mentira: contesta /miniatura con un «JPEG» que dice de qué tamaño se pidió. */
function contenedor({ falla = false } = {}) {
  pedidosAlContenedor = [];
  return {
    idFromName: (n) => n,
    get: () => ({
      async fetch(req) {
        const ruta = new URL(req.url).pathname;
        const cuerpo = await req.json();
        pedidosAlContenedor.push({ ruta, lado: cuerpo.lado, bytes: atob(cuerpo.imagen).length });
        if (falla) return new Response(JSON.stringify({ error: "se cayó" }), { status: 500 });
        return new Response(JSON.stringify({ datos: btoa("jpeg-reducido"), mime: "image/jpeg", ancho: 614, alto: 768, original: { ancho: 1638, alto: 2048 } }));
      },
    }),
  };
}

function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[ANA, "ana@a.com"], [OTRO, "otro@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
  }
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", ANA, "Feria del Lente");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", ANA, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRO, "Ajeno");
}

/** Una pieza en la galería y sus bytes en R2. */
function pieza(id, cliente, { bytes = PNG, mime = "image/png", tipo = "imagen", borrado = null, trabajo = null, ajustes = {}, usadoEn = [] } = {}) {
  const clave = `clientes/${cliente}/estudio/${id}.png`;
  objetos.set(clave, bytes);
  db.sqlite.prepare(
    "insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, ancho, alto, prompt, modelo, origen, borrado_at, trabajo_id, ajustes, usado_en) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(id, cliente === "c9" ? OTRO : ANA, cliente, clave, tipo, mime, 1024, 1280, "Pieza: post de lentes. Texto exacto: «2x1 en lentes»", "prueba", "estudio", borrado, trabajo, JSON.stringify(ajustes), JSON.stringify(usadoEn));
}

function trabajo(id, { estado = "hecho", archivos = [] } = {}) {
  db.sqlite.prepare(
    "insert into estudio_trabajos (id, owner_id, client_id, estado, tipo, motor, modelo, prompt, n, ajustes, medios, remoto, archivos, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(id, ANA, "c1", estado, "imagen", "prueba", "prueba", "lentes", archivos.length || 1, "{}", "{}", "[]", JSON.stringify(archivos), "2026-11-05T00:00:00.000Z", "2026-11-05T00:00:00.000Z");
}

const mcp = () => crearHerramientasMCP({ env, acceso, usuario: USUARIO });
const asistente = () => crearEjecutor({ env, acceso, estudio: { usuario: USUARIO, por: POR, origen: "asistente" } });
const imagenesDe = (r) => r.content.filter((b) => b.type === "image");
const textoDe = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), GOOGLE_AI_KEY: "llave-de-prueba" };
  acceso = crearAcceso(db, ANA);
  sembrar();
});

describe("estado_trabajo enseña lo que salió", () => {
  it("terminado: el texto de siempre y las imágenes, en su orden, reducidas por el Container", async () => {
    env.VIDEO = contenedor();
    pieza("a1", "c1"); pieza("a2", "c1");
    trabajo("t1", { archivos: ["a1", "a2"] });
    const r = await mcp().llamar("estado_trabajo", { trabajo_id: "t1" });
    expect(r.isError).toBeUndefined();
    expect(textoDe(r)).toMatch(/Llevan 2 de 2/);
    expect(textoDe(r)).toMatch(/las 2 imágenes/);
    expect(imagenesDe(r)).toHaveLength(2);
    expect(imagenesDe(r)[0]).toMatchObject({ type: "image", mimeType: "image/jpeg", data: btoa("jpeg-reducido") });
    expect(pedidosAlContenedor.map((p) => p.ruta)).toEqual(["/miniatura", "/miniatura"]);
    expect(pedidosAlContenedor[0].lado).toBe(768);
  });

  it("en marcha no enseña nada (ni gasta el Container)", async () => {
    env.VIDEO = contenedor();
    pieza("a1", "c1");
    trabajo("t1", { estado: "en_marcha", archivos: ["a1"] });
    const r = await mcp().llamar("estado_trabajo", { trabajo_id: "t1" });
    expect(imagenesDe(r)).toHaveLength(0);
    expect(textoDe(r)).toMatch(/se hace solo/);
    expect(pedidosAlContenedor).toHaveLength(0);
  });

  it("el asistente también la recibe como imagen en el mismo resultado", async () => {
    env.VIDEO = contenedor();
    pieza("a1", "c1");
    trabajo("t1", { archivos: ["a1"] });
    const r = await asistente().ejecutar({ id: "x", name: "estado_trabajo", input: { trabajo_id: "t1" } });
    expect(Array.isArray(r.content)).toBe(true);
    expect(r.content.some((b) => b.type === "image" && b.source?.type === "base64")).toBe(true);
  });
});

describe("sin Container", () => {
  it("una imagen pequeña va tal cual", async () => {
    pieza("a1", "c1");
    trabajo("t1", { archivos: ["a1"] });
    const r = await mcp().llamar("estado_trabajo", { trabajo_id: "t1" });
    expect(imagenesDe(r)).toHaveLength(1);
    expect(imagenesDe(r)[0].mimeType).toBe("image/png");
  });

  it("una grande no se manda, y lo dice sin fallar", async () => {
    pieza("a1", "c1", { bytes: new Uint8Array(2_000_000) });
    trabajo("t1", { archivos: ["a1"] });
    const r = await mcp().llamar("estado_trabajo", { trabajo_id: "t1" });
    expect(r.isError).toBeUndefined();
    expect(imagenesDe(r)).toHaveLength(0);
    expect(textoDe(r)).toMatch(/No pude enseñarte las imágenes/);
  });

  it("si el Container falla, la original pequeña sigue valiendo", async () => {
    env.VIDEO = contenedor({ falla: true });
    pieza("a1", "c1");
    const v = await miniaturaDe(env, "clientes/c1/estudio/a1.png", { mime: "image/png" });
    expect(v).toMatchObject({ mime: "image/png" });
  });
});

describe("ver_pieza", () => {
  it("enseña las piezas del cliente con lo que se sabe de ellas", async () => {
    env.VIDEO = contenedor();
    pieza("a1", "c1", { ajustes: { control: { estado: "revisar", errores: [{ escrito: "lentez", esperado: "lentes" }], puntajeDiseno: 6 } }, usadoEn: ["cal|p1"] });
    const r = await mcp().llamar("ver_pieza", { cliente: "Feria del Lente", archivo_ids: ["a1"] });
    expect(r.isError).toBeUndefined();
    expect(imagenesDe(r)).toHaveLength(1);
    const t = textoDe(r);
    expect(t).toContain("a1");
    expect(t).toMatch(/control: revisar \(1 error de texto\), diseño 6\/10/);
    expect(t).toMatch(/la usa una publicación/);
    expect(t).toMatch(/2x1 en lentes/);
  });

  it("lo de otro cliente, de otro espacio o de la papelera no se enseña", async () => {
    env.VIDEO = contenedor();
    pieza("a1", "c1");
    pieza("b1", "c2");
    pieza("x1", "c9");
    pieza("z1", "c1", { borrado: "2026-11-01T00:00:00.000Z" });
    const r = await mcp().llamar("ver_pieza", { cliente: "Feria del Lente", archivo_ids: ["a1", "b1", "x1", "z1"] });
    expect(imagenesDe(r)).toHaveLength(1);
    const t = textoDe(r);
    for (const id of ["b1", "x1", "z1"]) expect(t).toContain(`${id}: no está en la galería de Feria del Lente`);
    const nada = await mcp().llamar("ver_pieza", { cliente: "Feria del Lente", archivo_ids: ["b1"] });
    expect(nada.isError).toBe(true);
  });

  it("tiene tope y pide IDs", async () => {
    const muchos = await mcp().llamar("ver_pieza", { cliente: "Feria del Lente", archivo_ids: Array.from({ length: MAX_PIEZAS_VISTAS + 1 }, (_, i) => `a${i}`) });
    expect(muchos.isError).toBe(true);
    const ninguno = await mcp().llamar("ver_pieza", { cliente: "Feria del Lente", archivo_ids: [] });
    expect(ninguno.isError).toBe(true);
  });

  it("es de sólo lectura en el MCP y pide cliente e IDs", () => {
    const d = HERRAMIENTAS_MCP.find((h) => h.name === "ver_pieza");
    expect(d.annotations.readOnlyHint).toBe(true);
    expect(d.inputSchema.required).toEqual(expect.arrayContaining(["cliente", "archivo_ids"]));
  });
});

describe("lineaDePieza", () => {
  it("sin control lo dice, y recorta un pedido largo", () => {
    const l = lineaDePieza({ id: "a9", tipo: "imagen", ancho: 0, alto: 0, modelo: "", origen: "subido", prompt: "x".repeat(400), ajustes: "{}", usado_en: "[]" }, 1);
    expect(l).toMatch(/sin control de calidad/);
    expect(l).toMatch(/…»$/);
    expect(l).not.toMatch(/publicación/);
  });
});
