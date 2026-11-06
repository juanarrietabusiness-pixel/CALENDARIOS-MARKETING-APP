import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { limpiarGuionReel } from "../../worker/lib/estudio/encargoReel.js";
import { rellenarVacios } from "../../src/lib/resultadoEnPost.js";
import { EJEMPLO_GUION } from "../../src/lib/videoFormatoIA.js";

// ============================================================
// Las ESTRUCTURAS DE GUION de la agencia (antes «fórmulas UGC»): UGC y VOZ EN OFF
//
// Lo que importa:
//   1. Son del ESPACIO y llevan `para`: «ugc», «voz» o las dos. Las de antes (sin `para`) valen para las dos. La
//      ruta de siempre y su otro nombre (/api/estructuras-guion) son la misma.
//   2. La voz en off las sigue: el video animado («escribir») y el reel por planos llevan la escogida, en la duración
//      del video, o la lista de las de voz para que la IA escoja y diga cuál; lo escrito recuerda cuál (el proyecto en
//      `origen.estructuraId`, la publicación en `estructuraVoz`). Una escogida que ya no está es un 400.
//   3. El motor de ideas sólo ofrece las de UGC a un guion UGC.
//   4. «Guardar como estructura» desde una voz en off: la IA la ABSTRAE, sólo para voz en off, sin guardar nada.
//   5. Claude las ve (ver_estructuras, sin cliente) y las pasa en crear_video y crear_reel (estructura_id).
// Anthropic es de mentira: nada llama a un servicio de verdad.
// ============================================================

let db;
let env;
let peticiones;
let respuestas;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

function anthropic(lista) {
  peticiones = [];
  respuestas = [...lista];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      peticiones.push(JSON.parse(opciones.body));
      return flujo(respuestas.shift() ?? "");
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}

const textoDe = (p) => p.messages.map((m) => (typeof m.content === "string" ? m.content : m.content.map((b) => b.text ?? "").join(""))).join("\n");

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

const TRAMOS = [{ desde: 0, hasta: 3, funcion: "una pregunta que nombra el problema" }, { desde: 3, hasta: 24, funcion: "tres razones" }, { desde: 24, hasta: 30, funcion: "el llamado" }];
const DE_ANTES = { nombre: "Pregunta incómoda → demostración → precio", duracion: 30, tramos: TRAMOS, cuando: "productos con antes y después" };
const DE_VOZ = { nombre: "Pregunta → tres razones → llamado", duracion: 30, tramos: TRAMOS, para: ["voz"], gancho: "una pregunta" };
const DE_UGC = { nombre: "Me pasó a mí", duracion: 30, tramos: TRAMOS, para: ["ugc"] };

/** Mete una estructura como fila (sin pasar por la ruta: las de antes no llevaban `para`). → su id. */
function fila(id, datos) {
  db.sqlite.prepare("insert into formulas_ugc (id, owner_id, datos, creada_por) values (?,?,?,?)").run(id, "u-jefe", JSON.stringify(datos), "u-jefe");
  return id;
}

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: { get: async () => null, put: async () => {}, head: async () => null, delete: async () => {} }, ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  await sesion(s, "u-jefe", "u-jefe", "admin", "t-jefe");
  await sesion(s, "u-colab", "u-jefe", "editor", "t-colab", '["bc"]');
  await sesion(s, "u-otra", "u-otra", "admin", "t-otra");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("bc", "u-jefe", "Baby Caleb");
  s.prepare("insert into calendars (id, owner_id, client_id, month, year, days) values (?,?,?,?,?,?)").run("cal1", "u-jefe", "bc", 10, 2026,
    JSON.stringify([{ date: "2026-11-20", posts: [{ id: "p1", format: "reel", title: "Toallitas sin alcohol", idea: "Por qué la piel del bebé se irrita" }] }]));
}, 30_000);
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("/api/formulas-ugc (y /api/estructuras-guion): para UGC y voz en off", () => {
  it("las de antes valen para las dos; `para` filtra; las dos direcciones son la misma ruta", async () => {
    fila("antes", DE_ANTES);
    let r = await pedir("/api/estructuras-guion", { method: "POST", body: { formula: DE_VOZ } });
    expect(r.status).toBe(201);
    const voz = (await r.json()).formula;
    expect(voz.para).toEqual(["voz"]);
    await pedir("/api/formulas-ugc", { method: "POST", body: { formula: DE_UGC } });

    const todas = (await (await pedir("/api/formulas-ugc")).json()).formulas;
    expect(todas).toHaveLength(3);
    expect(todas.find((f) => f.id === "antes").para).toEqual(["ugc", "voz"]);
    const deVoz = (await (await pedir("/api/estructuras-guion?para=voz")).json()).formulas.map((f) => f.nombre).sort();
    expect(deVoz).toEqual([DE_ANTES.nombre, DE_VOZ.nombre].sort());
    const deUgc = (await (await pedir("/api/formulas-ugc?para=ugc", { testigo: "t-colab" })).json()).formulas.map((f) => f.nombre).sort();
    expect(deUgc).toEqual([DE_ANTES.nombre, DE_UGC.nombre].sort());
    // Otra agencia no las ve; un colaborador no las cambia.
    expect((await (await pedir("/api/estructuras-guion", { testigo: "t-otra" })).json()).formulas).toHaveLength(0);
    expect((await pedir(`/api/estructuras-guion/${voz.id}`, { method: "PUT", testigo: "t-colab", body: { formula: DE_VOZ } })).status).toBe(403);
    // Corregida para que sirva a las dos.
    r = await pedir(`/api/estructuras-guion/${voz.id}`, { method: "PUT", body: { formula: { ...DE_VOZ, para: ["ugc", "voz"] } } });
    expect((await r.json()).formulas.find((f) => f.id === voz.id).para).toEqual(["ugc", "voz"]);
  });

  it("«Guardar como estructura» desde una voz en off: la IA la abstrae, sólo para voz en off, sin guardar nada", async () => {
    anthropic([JSON.stringify({ nombre: "Pregunta → tres razones → llamado", duracion: 20, tramos: [{ desde: 0, hasta: 3, funcion: "una pregunta" }, { desde: 3, hasta: 20, funcion: "las razones" }] })]);
    const voz = {
      titulo: "Toallitas", duracion: 20,
      tramos: [{ desde: 0, hasta: 3, dice: "[emocionada] ¿Tu bebé se irrita?", pantalla: "¿Se irrita?", tipo: "gancho" }, { desde: 3, hasta: 20, dice: "Sin alcohol ni perfume.", tipo: "beneficio" }],
    };
    const r = await pedir("/api/estructuras-guion/proponer", { method: "POST", testigo: "t-colab", body: { voz, clienteId: "bc" } });
    expect(r.status).toBe(200);
    const { formula } = await r.json();
    expect(formula).toMatchObject({ nombre: "Pregunta → tres razones → llamado", para: ["voz"], duracion: 20 });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/VOZ EN OFF que salió bien/);
    expect(t).toContain("[0–3 s] (gancho) dice: «¿Tu bebé se irrita?» · en pantalla: «¿Se irrita?»");
    expect(t).not.toContain("[emocionada]");
    expect(db.sqlite.prepare("select count(*) n from formulas_ugc").get().n).toBe(0);
    // Sin al menos dos tramos con voz, no se pide nada.
    anthropic([]);
    expect((await pedir("/api/formulas-ugc/proponer", { method: "POST", body: { voz: { tramos: [voz.tramos[0]] } } })).status).toBe(400);
    expect(peticiones).toHaveLength(0);
  });
});

describe("la voz en off del video animado sigue la estructura", () => {
  it("con una escogida: va en el pedido repartida en la duración y vuelve con su id; el borrador la guarda en `origen`", async () => {
    const id = fila("voz1", DE_VOZ);
    anthropic([JSON.stringify(EJEMPLO_GUION)]);
    const r = await pedir("/api/videos/bc/escribir", { method: "POST", body: { idea: "Tres errores", segundos: 20, estructuraId: id } });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.estructura).toEqual({ id, nombre: DE_VOZ.nombre });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/ESTRUCTURA DEL GUION/);
    expect(t).toContain(`SIGUE ESTA ESTRUCTURA DE GUION DE LA AGENCIA «${DE_VOZ.nombre}»`);
    expect(t).toContain("[0–2 s] una pregunta que nombra el problema");
    expect(t).toMatch(/– 20 s\] el llamado|–20 s\] el llamado/);

    // Al guardar el borrador, el proyecto la recuerda; una que no existe no se apunta.
    const creado = await (await pedir("/api/videos/bc", { method: "POST", body: { guion: j.guion, estructuraId: id } })).json();
    expect(creado.video.origen).toEqual({ estructuraId: id });
    const otro = await (await pedir("/api/videos/bc", { method: "POST", body: { guion: j.guion, estructuraId: "no-existe" } })).json();
    expect(otro.video.origen).toEqual({});
  });

  it("sin escoger, la IA escoge entre las de VOZ (no las de sólo UGC) y dice cuál en el JSON, que no queda en el guion", async () => {
    fila("antes", DE_ANTES);
    fila("ugc1", DE_UGC);
    const id = fila("voz1", DE_VOZ);
    anthropic([JSON.stringify({ ...EJEMPLO_GUION, estructura: "pregunta → tres razones → llamado" })]);
    const r = await pedir("/api/videos/bc/escribir", { method: "POST", body: { idea: "Tres errores", segundos: 30 } });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.estructura).toEqual({ id, nombre: DE_VOZ.nombre });
    expect(j.guion.estructura).toBeUndefined();
    expect(j.avisos).toEqual([]);
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/ESTRUCTURAS DE GUION DE LA AGENCIA \(para la voz en off/);
    expect(t).toContain(`«${DE_ANTES.nombre}»`);
    expect(t).not.toContain(`«${DE_UGC.nombre}»`);
    expect(t).toMatch(/campo "estructura" del JSON/);
  });

  it("sin estructuras de voz, el pedido no cambia; una escogida que ya no está es un 400 sin llamar a la IA", async () => {
    anthropic([JSON.stringify(EJEMPLO_GUION)]);
    const r = await pedir("/api/videos/bc/escribir", { method: "POST", body: { idea: "Tres errores" } });
    expect((await r.json()).estructura).toBeNull();
    expect(textoDe(peticiones[0])).not.toMatch(/ESTRUCTURA/);

    anthropic([]);
    const mal = await pedir("/api/videos/bc/escribir", { method: "POST", body: { idea: "Tres errores", estructuraId: "ya-no-esta" } });
    expect(mal.status).toBe(400);
    expect((await mal.json()).error).toMatch(/ya no está/);
    expect(peticiones).toHaveLength(0);
  });
});

describe("la voz en off del reel sigue la estructura", () => {
  const REEL = {
    hilo: "luz cálida", gancho: "¿Piel sensible?", llamado: "Pídelos hoy", descripcion: "Para la piel de tu bebé.", locucion: "Hola",
    planos: [{ desde: 0, hasta: 3, escena: "El bebé llora", dice: "¿Se irrita?" }, { desde: 3, hasta: 6, escena: "La caja", dice: "Sin alcohol." }, { desde: 6, hasta: 10, escena: "El bebé sonríe", dice: "Escríbenos." }],
  };

  it("escogida o escogida por la IA, el guion vuelve con su id y su nombre", async () => {
    const id = fila("voz1", DE_VOZ);
    anthropic([JSON.stringify(REEL)]);
    let r = await pedir("/api/estudio/bc/reel/guion", { method: "POST", body: { idea: "Toallitas", segundos: 10, estructuraId: id } });
    expect(r.status).toBe(200);
    let g = await r.json();
    expect(g).toMatchObject({ estructuraId: id, estructuraNombre: DE_VOZ.nombre });
    let t = textoDe(peticiones[0]);
    expect(t).toContain(`SIGUE ESTA ESTRUCTURA DE GUION DE LA AGENCIA «${DE_VOZ.nombre}»`);
    expect(t).not.toMatch(/"estructura":"el nombre exacto/);

    anthropic([JSON.stringify({ ...REEL, estructura: DE_VOZ.nombre })]);
    r = await pedir("/api/estudio/bc/reel/guion", { method: "POST", body: { idea: "Toallitas", segundos: 10 } });
    g = await r.json();
    expect(g.estructuraId).toBe(id);
    expect(g.estructura).toBeUndefined();
    t = textoDe(peticiones[0]);
    expect(t).toMatch(/"estructura":"el nombre exacto de la estructura de guion que seguiste"\}/);

    anthropic([]);
    expect((await pedir("/api/estudio/bc/reel/guion", { method: "POST", body: { idea: "Toallitas", estructuraId: "nada" } })).status).toBe(400);
  });

  it("el encargo la conserva y la publicación la recuerda (sólo si no tenía otra)", () => {
    const limpio = limpiarGuionReel({ ...REEL, segundos: 10, estructuraId: "voz1", estructuraNombre: "Pregunta" });
    expect(limpio).toMatchObject({ estructuraId: "voz1", estructuraNombre: "Pregunta" });
    expect(limpiarGuionReel({ ...REEL, segundos: 10, estructuraId: "a b" }).estructuraId).toBeUndefined();
    expect(rellenarVacios({ id: "p1" }, { estructura: "voz1" }).post.estructuraVoz).toBe("voz1");
    expect(rellenarVacios({ id: "p1", estructuraVoz: "otra" }, { estructura: "voz1" }).post.estructuraVoz).toBe("otra");
  });
});

describe("el motor de ideas: un guion UGC sólo ve las de UGC", () => {
  it("las de sólo voz en off no se le ofrecen", async () => {
    fila("antes", DE_ANTES);
    fila("voz1", DE_VOZ);
    anthropic([JSON.stringify({ ideas: [{ n: 1, titulo: "x", brief: "b", titular: "Algo", escena: "Una sala", guion: "[0–3 s] VOZ: «Hola» | SE VE: Ana" }] })]);
    await pedir("/api/estudio/bc/lote/ideas", { method: "POST", body: { modo: "plan", casillas: [{ clave: "a", fecha: "2030-03-07", formato: "reel", pilar: "humano", rostro: true }] } });
    const t = textoDe(peticiones[0]);
    expect(t).toContain(`«${DE_ANTES.nombre}»`);
    expect(t).not.toContain(`«${DE_VOZ.nombre}»`);
  });
});

describe("Claude: ver_estructuras y estructura_id", () => {
  const mcp = () => crearHerramientasMCP({ env, acceso: crearAcceso(db, "u-jefe"), usuario: { id: "u-jefe", nombre: "Juan" } });
  const texto = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

  it("ver_estructuras no pide cliente, es de sólo lectura y lista las de voz con sus tramos en la duración pedida", async () => {
    const por = Object.fromEntries(HERRAMIENTAS_MCP.map((h) => [h.name, h]));
    expect(por.ver_estructuras.inputSchema.required).toEqual([]);
    expect(por.ver_estructuras.annotations.readOnlyHint).toBe(true);
    expect(por.crear_video.inputSchema.properties.estructura_id).toBeTruthy();
    expect(por.crear_reel.inputSchema.properties.estructura_id).toBeTruthy();
    fila("ugc1", DE_UGC);
    fila("voz1", DE_VOZ);
    const t = texto(await mcp().llamar("ver_estructuras", { para: "voz", segundos: 15 }));
    expect(t).toContain("«Pregunta → tres razones → llamado» (ID voz1) · sirve para: Voz en off");
    expect(t).toMatch(/En 15 s: \[0–2 s\] una pregunta/);
    expect(t).not.toContain("Me pasó a mí");
    expect(texto(await mcp().llamar("ver_estructuras", {}))).toContain("Me pasó a mí");
  });

  it("crear_video con estructura_id la apunta; una que no existe es un error dicho", async () => {
    fila("voz1", DE_VOZ);
    const r = await mcp().llamar("crear_video", { cliente: "Baby Caleb", guion: EJEMPLO_GUION, estructura_id: "voz1" });
    expect(r.isError).toBeFalsy();
    const v = db.sqlite.prepare("select origen from videos_proyectos").get();
    expect(JSON.parse(v.origen)).toEqual({ estructuraId: "voz1" });
    const mal = await mcp().llamar("crear_video", { cliente: "Baby Caleb", guion: EJEMPLO_GUION, estructura_id: "nada" });
    expect(mal.isError).toBe(true);
    expect(texto(mal)).toMatch(/No encontré la estructura de guion «nada»/);
  });

  it("crear_reel con un guion dado y estructura_id la lleva al encargo", async () => {
    fila("voz1", DE_VOZ);
    const GUION = {
      segundos: 9, hilo: "luz", gancho: "¿Piel sensible?", llamado: "Pídelos", descripcion: "x",
      planos: [{ desde: 0, escena: "Uno" }, { desde: 3, escena: "Dos" }, { desde: 6, escena: "Tres" }],
    };
    env.KIE_API_KEY = "k";
    const r = await mcp().llamar("crear_reel", { cliente: "Baby Caleb", guion: GUION, estructura_id: "voz1" });
    expect(texto(r)).toMatch(/Sigue la estructura de guion de la agencia «voz1»/);
    expect(texto(r)).toMatch(/"estructuraId":"voz1"/);
  });
});
