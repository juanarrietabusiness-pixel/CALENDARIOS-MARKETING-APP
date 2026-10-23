import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";

// ============================================================
// Las fórmulas UGC de la agencia y la «Voz UGC» de cada cliente
//
// Lo que importa:
//   1. Las fórmulas son del ESPACIO, no de un cliente: las ve todo el equipo,
//      las cambian quien administra y los editores; un colaborador, no (403);
//      otra agencia no ve las de esta.
//   2. «Proponer» saca la fórmula del video transcrito SIN guardar nada.
//   3. La «Voz UGC» la propone la IA leyendo los guiones UGC del cliente (los
//      aprobados primero) y no guarda: se guarda como nota con la ruta fija.
//   4. El lote, con una casilla UGC, lleva la voz y las fórmulas, y la idea
//      vuelve con la fórmula que siguió (su id).
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
    async delete(clave) { objetos.delete(clave); },
  };
}

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
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};

const FORMULA = {
  nombre: "Pregunta incómoda → demostración → precio", duracion: 30, gancho: "una pregunta", porQue: "toca un dolor", cuando: "productos con antes y después",
  tramos: [{ desde: 0, hasta: 3, funcion: "una pregunta que toca un dolor" }, { desde: 3, hasta: 25, funcion: "la demostración" }, { desde: 25, hasta: 30, funcion: "el precio y a dónde escribir" }],
};

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  await sesion(s, "u-jefe", "u-jefe", "admin", "t-jefe");
  await sesion(s, "u-ed", "u-jefe", "editor", "t-ed");
  await sesion(s, "u-colab", "u-jefe", "editor", "t-colab", '["c1"]');
  await sesion(s, "u-otra", "u-otra", "admin", "t-otra");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", "u-jefe", "Dcasa");
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("/api/formulas-ugc", () => {
  it("se guarda, se corrige y se quita; la ve todo el equipo y no otra agencia", async () => {
    let r = await pedir("/api/formulas-ugc", { method: "POST", body: { formula: FORMULA } });
    expect(r.status).toBe(201);
    const { formula } = await r.json();
    expect(formula).toMatchObject({ nombre: FORMULA.nombre, duracion: 30 });
    expect(formula.tramos).toHaveLength(3);
    expect((await (await pedir("/api/formulas-ugc", { testigo: "t-colab" })).json()).formulas).toHaveLength(1);
    expect((await (await pedir("/api/formulas-ugc", { testigo: "t-otra" })).json()).formulas).toHaveLength(0);
    r = await pedir(`/api/formulas-ugc/${formula.id}`, { method: "PUT", testigo: "t-ed", body: { formula: { ...FORMULA, nombre: "La pregunta" } } });
    expect((await r.json()).formulas[0].nombre).toBe("La pregunta");
    // Otra agencia no la encuentra para cambiarla.
    expect((await pedir(`/api/formulas-ugc/${formula.id}`, { method: "DELETE", testigo: "t-otra" })).status).toBe(404);
    r = await pedir(`/api/formulas-ugc/${formula.id}`, { method: "DELETE" });
    expect((await r.json()).formulas).toHaveLength(0);
  });

  it("un colaborador no las cambia, y una sin nombre o con un solo tramo no se guarda", async () => {
    expect((await pedir("/api/formulas-ugc", { method: "POST", testigo: "t-colab", body: { formula: FORMULA } })).status).toBe(403);
    expect((await pedir("/api/formulas-ugc", { method: "POST", body: { formula: { ...FORMULA, nombre: "" } } })).status).toBe(400);
    expect((await pedir("/api/formulas-ugc", { method: "POST", body: { formula: { ...FORMULA, tramos: FORMULA.tramos.slice(0, 1) } } })).status).toBe(400);
    expect(db.sqlite.prepare("select count(*) n from formulas_ugc").get().n).toBe(0);
  });

  it("«proponer» saca la fórmula del video transcrito, sin su contenido y sin guardar nada", async () => {
    anthropic(JSON.stringify({ nombre: "Error común → solución", duracion: 28, tramos: [{ desde: 0, hasta: 4, funcion: "el error que todos cometen" }, { desde: 4, hasta: 28, funcion: "cómo se hace bien" }], gancho: "un error", porQue: "identifica", cuando: "educativo" }));
    const original = { duracion: 28, estructura: "error → solución", tramos: [{ desde: 0, hasta: 4, voz: "¿Sigues lavando tu sofá con jabón de LimpiaYa?", seVe: "una mujer frente a un sofá" }, { desde: 4, hasta: 28, voz: "Mira cómo se hace", seVe: "la demostración" }] };
    const r = await pedir("/api/formulas-ugc/proponer", { method: "POST", testigo: "t-colab", body: { original, fuente: { cuenta: "@limpiaya", enlace: "https://www.instagram.com/reel/abc123/" }, clienteId: "c1" } });
    expect(r.status).toBe(200);
    const d = await r.json();
    // La duración se lleva a la más cercana de las que hay (28 → 30) y la fuente queda apuntada.
    expect(d.formula).toMatchObject({ nombre: "Error común → solución", duracion: 30, fuente: { cuenta: "@limpiaya", enlace: "https://www.instagram.com/reel/abc123/" } });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/SIN su contenido/);
    expect(t).toContain("¿Sigues lavando tu sofá con jabón de LimpiaYa?");
    expect(db.sqlite.prepare("select count(*) n from formulas_ugc").get().n).toBe(0);
    expect(db.sqlite.prepare("select funcion, client_id from consumo_ia").get()).toEqual({ funcion: "fórmula UGC", client_id: "c1" });
  });
});

describe("la «Voz UGC» de un cliente", () => {
  const calendario = (days) => db.sqlite.prepare("insert into calendars (id, owner_id, client_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal1", "u-jefe", "c1", "Octubre 2030", 9, 2030, JSON.stringify(days));

  it("la IA la propone desde sus guiones UGC (los aprobados primero) y no guarda nada; guardada, se lee", async () => {
    calendario([
      { date: "2030-10-02", posts: [{ id: "p1", format: "reel", rostro: true, title: "Borrador", guion: "[0–3 s] VOZ: «Hola, soy Ana» | SE VE: Ana", status: "pending" }] },
      { date: "2030-10-01", posts: [{ id: "p2", format: "reel", rostro: true, title: "El bueno", guion: "[0–3 s] VOZ: «¿Sabías que tu sofá…?» | SE VE: la sala", status: "approved" }] },
      { date: "2030-10-03", posts: [{ id: "p3", format: "post", title: "Un post", guion: "no cuenta" }] },
    ]);
    anthropic("Aquí la tienes:\n## Quién habla\nAna, la dueña, de tú.");
    let r = await pedir("/api/cerebro/c1/voz-ugc", { method: "POST" });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d).toMatchObject({ titulo: "Voz UGC", texto: "## Quién habla\nAna, la dueña, de tú.", existente: null, guiones: 2 });
    const t = textoDe(peticiones[0]);
    expect(t.indexOf("El bueno")).toBeLessThan(t.indexOf("Borrador"));
    expect(t).not.toContain("no cuenta");
    expect(db.sqlite.prepare("select count(*) n from cerebro_notas").get().n).toBe(0);
    expect((await (await pedir("/api/cerebro/c1/voz-ugc")).json())).toEqual({ id: null, texto: "" });
    // Guardada con su título, toma la ruta fija y se lee.
    await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: d.titulo, texto: d.texto, tipo: "nota" } });
    expect(db.sqlite.prepare("select ruta from cerebro_notas").get().ruta).toBe("voz-ugc");
    r = await (await pedir("/api/cerebro/c1/voz-ugc")).json();
    expect(r.texto).toBe("## Quién habla\nAna, la dueña, de tú.");
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("voz UGC");
  });

  it("el lote, con una casilla UGC, lleva la voz y las fórmulas, y la idea vuelve con su fórmula", async () => {
    await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Voz UGC", texto: "## Quién habla\nAna, de tú, sin tecnicismos.", tipo: "nota" } });
    const { formula } = await (await pedir("/api/formulas-ugc", { method: "POST", body: { formula: FORMULA } })).json();
    anthropic(JSON.stringify({ ideas: [{ n: 1, titulo: "x", brief: "b", titular: "Algo", escena: "Una sala", guion: "[0–3 s] VOZ: «Hola» | SE VE: Ana", formula: FORMULA.nombre }] }));
    const r = await (await pedir("/api/estudio/c1/lote/ideas", { method: "POST", body: { modo: "plan", casillas: [{ clave: "a", fecha: "2030-03-07", formato: "reel", pilar: "humano", rostro: true }] } })).json();
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/PARA LAS UGC:/);
    expect(t).toContain("Ana, de tú, sin tecnicismos.");
    expect(t).toContain(`«${FORMULA.nombre}»`);
    expect(t).toMatch(/"formula" \(SÓLO en las UGC\)/);
    expect(r.ideas[0].formulaUgc).toBe(formula.id);
    expect(r.ideas[0].formula).toBeUndefined();
  });

  it("sin casilla UGC, el lote no lleva nada de eso", async () => {
    await pedir("/api/formulas-ugc", { method: "POST", body: { formula: FORMULA } });
    anthropic(JSON.stringify({ ideas: [{ n: 1, titulo: "x", brief: "b", titular: "Algo", escena: "Una sala" }] }));
    await pedir("/api/estudio/c1/lote/ideas", { method: "POST", body: { modo: "plan", casillas: [{ clave: "a", fecha: "2030-03-07", formato: "post", pilar: "anuncio" }] } });
    expect(textoDe(peticiones[0])).not.toMatch(/PARA LAS UGC|FÓRMULAS DE LA AGENCIA/);
  });
});
