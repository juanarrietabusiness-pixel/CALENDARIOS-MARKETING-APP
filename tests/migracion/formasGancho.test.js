import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";

// ============================================================
// El motor de ideas con la FORMA del gancho, los ÁNGULOS de venta y el LENGUAJE DEL CLIENTE (por el Worker de verdad,
// sobre una D1 de verdad):
//   1. Los ángulos del estudio APROBADO llegan a la línea de cada pieza y la idea vuelve con el suyo.
//   2. La nota «Lenguaje del cliente» va en todos los modos (lote, plan, publicación, campos); interna, no.
//   3. Con publicaciones medidas suficientes, las formas que no le rinden al cliente no salen y las que sí, se repiten.
//   4. Sin nada de eso (un cliente de antes), el pedido sale como siempre, con su forma de gancho.
// ============================================================

let db;
let env;
let peticiones;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

function anthropic(texto) {
  peticiones = [];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      peticiones.push(JSON.parse(opciones.body));
      return flujo(texto);
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}

function r2() {
  const objetos = new Map();
  return {
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const bytes = new TextEncoder().encode(objetos.get(clave));
      return { arrayBuffer: async () => bytes, text: async () => objetos.get(clave) };
    },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor) { objetos.set(clave, typeof valor === "string" ? valor : new TextDecoder().decode(valor)); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=t-jefe`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const lote = (datos) => pedir("/api/estudio/c1/lote/ideas", { method: "POST", body: datos });
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};

const ESTUDIO = {
  aprobadoAt: "2030-01-01T00:00:00Z",
  productos: {
    sofa: {
      nombre: "Sofá cama",
      elementos: { publico: "Parejas jóvenes", problema: "Las visitas no tienen dónde dormir", solucion: "Se abre en un gesto" },
      angulos: [
        { id: "visitas", nombre: "Las visitas", problemaExterno: "No hay dónde duerman", publico: "frio" },
        { id: "espacio", nombre: "El espacio", diferencial: "Ocupa lo de un sofá", publico: "tibio" },
      ],
    },
  },
};

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-jefe", "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run("u-jefe", "u-jefe", "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("t-jefe"), "u-jefe", "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", "u-jefe", "Dcasa");
  s.prepare("insert into mercado_clientes (id, client_id, owner_id, catalogo, estudio) values (?,?,?,?,?)").run(
    "m1", "c1", "u-jefe", JSON.stringify([{ id: "sofa", nombre: "Sofá cama", precio: "$399", activo: true }]), JSON.stringify(ESTUDIO),
  );
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("los ángulos del estudio aprobado", () => {
  it("van en la línea de la pieza (el de público frío en un nivel frío) y la idea vuelve con el suyo", async () => {
    anthropic(JSON.stringify({ ideas: [{ n: 1, titular: "¿Dónde duermen?", escena: "Una sala", porque: "Nombra el problema." }] }));
    const r = await lote({ modo: "plan", casillas: [{ clave: "a", fecha: "2030-03-04", formato: "post", pilar: "anuncio", nivel: "problema", productoId: "sofa" }] });
    expect(r.status).toBe(200);
    const { ideas } = await r.json();
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/ángulo de venta: «Las visitas» — problema \(lo que se ve\): No hay dónde duerman/);
    expect(t).toMatch(/forma del gancho: «[^»]+» — /);
    expect(ideas[0]).toMatchObject({ angulo: "visitas", anguloNombre: "Las visitas", porque: "Nombra el problema." });
    expect(ideas[0].formaGancho).toBeTruthy();
    // Lo que sólo era para el pedido no vuelve.
    expect(ideas[0].anguloLinea).toBeUndefined();
  });

  it("sin ángulos en el estudio (uno de antes), como siempre", async () => {
    db.sqlite.prepare("update mercado_clientes set estudio = ? where client_id = 'c1'").run(JSON.stringify({ ...ESTUDIO, productos: { sofa: { ...ESTUDIO.productos.sofa, angulos: [] } } }));
    anthropic(JSON.stringify({ ideas: [{ n: 1, titular: "Uno", escena: "Una sala" }] }));
    const { ideas } = await (await lote({ modo: "plan", casillas: [{ clave: "a", fecha: "2030-03-04", formato: "post", pilar: "anuncio", nivel: "problema", productoId: "sofa" }] })).json();
    expect(textoDe(peticiones[0])).not.toMatch(/ángulo de venta/);
    expect(ideas[0].angulo).toBeUndefined();
  });
});

describe("el lenguaje del cliente", () => {
  it("va en TODOS los modos, con su regla; interna, no", async () => {
    await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Lenguaje del cliente", texto: "«Me da pena cuando llegan visitas»", tipo: "nota" } });
    expect(db.sqlite.prepare("select ruta from cerebro_notas").get().ruta).toBe("lenguaje-del-cliente");
    anthropic(JSON.stringify({ ideas: [{ n: 1, titular: "Uno", escena: "Una sala" }], textos: [{ n: 1, descripcion: "Escríbenos." }] }));
    await lote({ modo: "plan", casillas: [{ clave: "a", fecha: "2030-03-04", formato: "post", pilar: "educativo" }] });
    await lote({ modo: "publicacion", formato: "post", publicacion: { fecha: "2030-03-04" } });
    await lote({ modo: "niveles", cuantas: { problema: 1 } });
    await lote({ modo: "campos", publicaciones: [{ clave: "p1", formato: "post", escrito: { idea: "Sofá" }, campos: ["descripcion"] }] });
    expect(peticiones).toHaveLength(4);
    for (const p of peticiones) {
      expect(textoDe(p)).toMatch(/EL LENGUAJE DEL CLIENTE[^\n]*usa SUS palabras[^\n]*no inventes citas[\s\S]*Me da pena cuando llegan visitas/);
    }
    db.sqlite.prepare("update cerebro_notas set interna = 1").run();
    anthropic(JSON.stringify({ ideas: [{ n: 1, titular: "Uno", escena: "Una sala" }] }));
    await lote({ modo: "plan", casillas: [{ clave: "a", fecha: "2030-03-04", formato: "post", pilar: "educativo" }] });
    expect(textoDe(peticiones[0])).not.toMatch(/LENGUAJE DEL CLIENTE/);
  });
});

describe("qué formas de gancho le rinden a este cliente", () => {
  /** Nueve publicaciones publicadas hace tiempo: tres «Lista» que rinden, tres «Mito» que no, tres «Historia» normales. */
  function sembrarResultados() {
    const s = db.sqlite;
    s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, client_id) values (?,?,?,?,?)").run("cta1", "u-jefe", "instagram", "ig-1", "c1");
    const formas = [["lista", 300], ["lista", 300], ["lista", 300], ["mito", 20], ["mito", 20], ["mito", 20], ["historia", 100], ["historia", 100], ["historia", 100]];
    const posts = formas.map(([forma], i) => ({ id: `p${i}`, format: "post", formaGancho: forma, status: "published" }));
    s.prepare("insert into calendars (id, client_id, owner_id, month, year, days) values (?,?,?,?,?,?)")
      .run("k1", "c1", "u-jefe", 1, 2020, JSON.stringify([{ date: "2020-02-10", posts }]));
    formas.forEach(([, valor], i) => {
      s.prepare(`insert into publicaciones_programadas (id, owner_id, client_id, calendar_id, post_id, red, cuenta_id, programada_para, estado, externo_id, variante)
        values (?,?,?,?,?,?,?,?,?,?,?)`).run(`q${i}`, "u-jefe", "c1", "k1", `p${i}`, "instagram", "cta1", "2020-02-10T14:00:00Z", "publicada", `m${i}`, "post");
      s.prepare(`insert into metricas_publicacion (id, owner_id, client_id, cuenta_id, red, externo_id, publicada_at, interacciones)
        values (?,?,?,?,?,?,?,?)`).run(`x${i}`, "u-jefe", "c1", "cta1", "instagram", `m${i}`, "2020-02-10T14:00:00Z", valor);
    });
  }
  const casillas = Array.from({ length: 6 }, (_, i) => ({ clave: `c${i}`, fecha: `2030-03-0${i + 1}`, formato: "post", pilar: "educativo", nivel: "problema" }));
  const formasDelPedido = (t) => [...t.matchAll(/forma del gancho: «([^»]+)»/g)].map((m) => m[1]);

  it("con muestra: «Mito» (no le rinde) no sale y «Lista» (sí) va en una de cada dos", async () => {
    sembrarResultados();
    anthropic(JSON.stringify({ ideas: [] }));
    await lote({ modo: "plan", casillas });
    const formas = formasDelPedido(textoDe(peticiones[0]));
    expect(formas).toHaveLength(6);
    expect(formas).not.toContain("Mito o creencia falsa");
    expect(formas.filter((f) => f === "Lista con número").length).toBeGreaterThanOrEqual(3);
  });

  it("sin muestra (las publicaciones de antes no tienen forma), nada se aprende: cada pieza con su forma y sin repetir la vecina", async () => {
    anthropic(JSON.stringify({ ideas: [] }));
    await lote({ modo: "plan", casillas });
    const formas = formasDelPedido(textoDe(peticiones[0]));
    expect(formas).toHaveLength(6);
    for (let i = 1; i < formas.length; i++) expect(formas[i]).not.toBe(formas[i - 1]);
  });

  it("las formas de los últimos meses no se repiten si se puede", async () => {
    sembrarResultados();
    // Sin las métricas no hay aprendizaje, pero las formas usadas siguen contando como recientes.
    db.sqlite.prepare("delete from metricas_publicacion").run();
    anthropic(JSON.stringify({ ideas: [] }));
    await lote({ modo: "plan", casillas: casillas.slice(0, 2) });
    const formas = formasDelPedido(textoDe(peticiones[0]));
    for (const f of formas) expect(["Lista con número", "Mito o creencia falsa", "Historia personal"]).not.toContain(f);
  });
});

describe("las UGC: tres ganchos, cada uno con una forma", () => {
  it("en el lote se piden y van a la idea; en «campos» la línea nombra las tres formas", async () => {
    anthropic(JSON.stringify({ ideas: [{ n: 1, titular: "Mira", escena: "Ana", guion: "[0–3 s] VOZ: «Hola» | SE VE: Ana | TEXTO:", ganchos: ["Uno", "Dos", "Tres"] }] }));
    const { ideas } = await (await lote({ modo: "plan", casillas: [{ clave: "u", fecha: "2030-03-04", formato: "reel", pilar: "humano", rostro: true }] })).json();
    expect(ideas[0].ganchos).toEqual(["Uno", "Dos", "Tres"]);
    expect(ideas[0].formasGanchos).toBeUndefined();
    expect(textoDe(peticiones[0])).toMatch(/ganchos \(3 alternativos para el primer tramo, uno con CADA forma, en este orden\): «[^»]+» \([^)]+\); «/);
    anthropic(JSON.stringify({ textos: [{ n: 1, guion: "[0–3 s] VOZ: «Hola» | SE VE: Ana | TEXTO:", ganchos: ["a", "b", "c"] }] }));
    await lote({ modo: "campos", publicaciones: [{ clave: "u1", formato: "reel", pilar: "humano", rostro: true, escrito: { idea: "Ana" }, campos: ["guion"] }] });
    expect(textoDe(peticiones[0])).toMatch(/uno con CADA forma/);
    // Pedir sólo los hashtags no lleva ni la forma ni los ganchos.
    anthropic(JSON.stringify({ textos: [] }));
    await lote({ modo: "campos", publicaciones: [{ clave: "u1", formato: "reel", pilar: "humano", rostro: true, escrito: { idea: "Ana" }, campos: ["hashtags"] }] });
    expect(textoDe(peticiones[0])).not.toMatch(/forma del gancho|uno con CADA forma/);
  });
});
