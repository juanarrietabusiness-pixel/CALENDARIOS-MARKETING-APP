import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearHerramientasEstudio, DEFINICIONES_ESTUDIO } from "../../worker/lib/estudio/herramientas.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";

// ============================================================
// La MÚSICA con Suno por Kie, por las rutas y la cola de verdad, con un Kie de mentira (nada se paga):
//
//   · siempre 409 con el costo hasta `confirmado: true`; sin llave, 503 sin crear nada;
//   · la cola: createTask con el cuerpo de Suno (modo personalizado), recordInfo y las DOS pistas a la galería;
//   · con un video: el estilo y la duración salen de su guion y la primera pista queda en su SONIDO (sin subir la
//     versión ni tocar la voz);
//   · el asistente y Claude: la confirmación vuelve como texto con la cifra.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
const API = "https://api.kie.ai";
let db;
let env;
let fetchReal;

const ejemplo = () => {
  const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
  return JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1]);
};

function mp3(segundos = 4) {
  const b = new Uint8Array(Math.round(segundos * 16000));
  b.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
  for (let i = 10; i + 4 < b.length; i += 417) b.set([0xff, 0xfb, 0x90, 0x44], i);
  return b;
}

function r2() {
  const objetos = new Map();
  const bytesDe = async (v) => (v instanceof Uint8Array ? v : new Uint8Array(await new Response(v).arrayBuffer()));
  return {
    objetos,
    async head(k) { return objetos.has(k) ? { size: objetos.get(k).bytes.length } : null; },
    async get(k) {
      const o = objetos.get(k);
      if (!o) return null;
      return { body: o.bytes, size: o.bytes.length, httpMetadata: { contentType: o.tipo }, arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength) };
    },
    async put(k, v, op) { objetos.set(k, { bytes: await bytesDe(v), tipo: op?.httpMetadata?.contentType }); },
    async delete(k) { for (const x of [].concat(k)) objetos.delete(x); },
  };
}

const json = (cuerpo, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado });

/** Kie con Suno: crear, mirar (dos pistas en response.data) y los MP3. */
function suno({ estados = ["generating", "success"], creditos = 14 } = {}) {
  const llamadas = [];
  let i = 0;
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    if (u === `${API}/api/v1/jobs/createTask`) return json({ code: 200, msg: "success", data: { taskId: "t-suno" } });
    if (u.startsWith(`${API}/api/v1/jobs/recordInfo`)) {
      const state = estados[Math.min(i++, estados.length - 1)];
      const data = [1, 2].map((n) => ({ id: `audio-${n}`, audio_url: `https://tempfile.kie.test/m${n}.mp3`, title: "Mañana", duration: 30.2 }));
      return json({ code: 200, data: { taskId: "t-suno", state, ...(state === "success" ? { response: { data }, creditsConsumed: creditos } : {}) } });
    }
    if (/^https:\/\/tempfile\.kie\.test\/m\d\.mp3$/.test(u)) {
      const b = mp3(8);
      return new Response(b, { status: 200, headers: { "content-length": String(b.length), "content-type": "audio/mpeg" } });
    }
    return new Response("{}", { status: 404 });
  });
  return { llamadas };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    method: opciones.method ?? "GET",
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

const trabajos = () => db.sqlite.prepare("select * from estudio_trabajos").all();
const video = (id) => db.sqlite.prepare("select * from videos_proyectos where id = ?").get(id);

async function hastaElFinal(id, tope = 10) {
  let t;
  for (let i = 0; i < tope; i++) {
    const r = JSON.parse(db.sqlite.prepare("select remoto from estudio_trabajos where id = ?").get(id).remoto);
    db.sqlite.prepare("update estudio_trabajos set remoto = ? where id = ?").run(JSON.stringify(r.map((x) => ({ ...x, proximo: new Date(Date.now() - 1000).toISOString() }))), id);
    t = (await (await pedir(`/estudio/bc/trabajos/${id}/avanzar`, { method: "POST" })).json()).trabajo;
    if (!["en_cola", "en_marcha"].includes(t.estado)) return t;
  }
  return t;
}

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") }, KIE_API_KEY: "kie-secreta" };
  fetchReal = globalThis.fetch;
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "y");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("bc", JEFE, "Baby Caleb");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
}, 30_000);
afterEach(() => { globalThis.fetch = fetchReal; });

describe("generar la música con Suno", () => {
  it("sin confirmar, 409 con el costo y nada creado ni pedido; sin llave, 503", async () => {
    const { llamadas } = suno();
    const r = await pedir("/videos/bc/musicas/generar", { method: "POST", body: { estilo: "acústica alegre" } });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j).toMatchObject({ codigo: "confirmar", pedido: { instrumental: true, duracion: 30 } });
    expect(j.costo).toBeGreaterThan(0);
    expect(j.error).toMatch(/aproximadamente/);
    expect(trabajos()).toHaveLength(0);
    expect(llamadas).toHaveLength(0);
    // `confirmado` tiene que ser el booleano.
    expect((await pedir("/videos/bc/musicas/generar", { method: "POST", body: { estilo: "x", confirmado: "sí" } })).status).toBe(409);
    expect((await pedir("/videos/bc/musicas/generar", { method: "POST", body: {} })).status).toBe(400);
    delete env.KIE_API_KEY;
    expect((await pedir("/videos/bc/musicas/generar", { method: "POST", body: { estilo: "x", confirmado: true } })).status).toBe(503);
  });

  it("confirmada: createTask con el cuerpo de Suno y las dos pistas a la galería, con lo que Kie cobró", async () => {
    const { llamadas } = suno();
    const r = await pedir("/videos/bc/musicas/generar", { method: "POST", body: { estilo: "Lo-fi cálido", titulo: "Mañana", duracion: 20, confirmado: true } });
    expect(r.status).toBe(202);
    const { trabajoId } = await r.json();
    const t = await hastaElFinal(trabajoId);
    expect(t).toMatchObject({ estado: "hecho", tipo: "audio", modelo: "suno-v6-kie" });
    const crear = llamadas.find((l) => l.url.endsWith("/createTask"));
    const cuerpo = JSON.parse(crear.init.body);
    expect(cuerpo).toMatchObject({ model: "ai-music-api/generate", input: { custom_mode: true, instrumental: true, model: "V6", title: "Mañana", duration: 20 } });
    expect(crear.init.headers.Authorization).toBe("Bearer kie-secreta");
    const { musicas } = await (await pedir("/videos/bc/musicas")).json();
    expect(musicas.map((m) => m.nombre).sort()).toEqual(["Mañana (1)", "Mañana (2)"]);
    expect(musicas.every((m) => m.modelo === "musica-suno")).toBe(true);
    // Lo cobrado (14 créditos = 0,07 $), apuntado una vez en el consumo.
    expect(t.costo).toBeCloseTo(0.07, 5);
    const consumo = db.sqlite.prepare("select * from consumo_ia where funcion = 'estudio-musica'").all();
    expect(consumo).toHaveLength(1);
    expect(consumo[0].costo_usd).toBeCloseTo(0.07, 5);
  });

  it("con un video: el estilo lo propone el director (aquí, sin IA, el respaldo con la pista del guion y el tempo de los cortes), la duración es la del video y la primera versión queda en su sonido sin tocar la versión", async () => {
    suno();
    const g = ejemplo();
    g.musica = { estilo: "Acústica cálida con ukelele" };
    const { video: v } = await (await pedir("/videos/bc", { method: "POST", body: { guion: g } })).json();
    const cot = await (await pedir("/videos/bc/musicas/generar", { method: "POST", body: { videoId: v.id } })).json();
    expect(cot.pedido.estilo).toMatch(/^Acústica cálida con ukelele, \d+ BPM, soft intro under the hook/);
    expect(cot.propuesta).toMatchObject({ deRespaldo: true });
    expect(cot.pedido.duracion).toBeGreaterThanOrEqual(10);
    const { trabajoId } = await (await pedir("/videos/bc/musicas/generar", { method: "POST", body: { videoId: v.id, confirmado: true } })).json();
    const t = await hastaElFinal(trabajoId);
    expect(t.nota).toMatch(/puesta en el video/);
    const despues = video(v.id);
    expect(despues.version).toBe(v.version);
    const sonido = JSON.parse(despues.sonido);
    expect(sonido.musica).toMatchObject({ archivoId: t.archivos[0], nombre: expect.stringMatching(/\(1\)$/), volumen: 0 });
    expect(sonido.musica.clave).toMatch(/^clientes\/bc\//);
    // Un video de otro cliente o que no existe: 404 sin gastar.
    expect((await pedir("/videos/bc/musicas/generar", { method: "POST", body: { videoId: "no-existe", estilo: "x", confirmado: true } })).status).toBe(404);
  });

  it("Kie falla: el trabajo termina fallido con su motivo y no se apunta consumo", async () => {
    suno({ estados: ["fail"] });
    const { trabajoId } = await (await pedir("/videos/bc/musicas/generar", { method: "POST", body: { estilo: "x", confirmado: true } })).json();
    const t = await hastaElFinal(trabajoId);
    expect(t.estado).toBe("fallido");
    expect(t.error).toMatch(/Kie\.ai no pudo/);
    expect(db.sqlite.prepare("select count(*) n from consumo_ia").get().n).toBe(0);
  });
});

describe("el asistente y Claude (MCP)", () => {
  const herramientas = () => crearHerramientasEstudio({
    env, acceso: crearAcceso(db, JEFE), usuario: { id: JEFE }, por: null, origen: "asistente",
    resolverCliente: async () => db.sqlite.prepare("select * from clients where id = 'bc'").get(),
  });

  it("generar_musica está declarada, va como escritura en el MCP y sólo crea con confirmado=true", async () => {
    expect(DEFINICIONES_ESTUDIO.map((d) => d.name)).toContain("generar_musica");
    expect(Object.fromEntries(HERRAMIENTAS_MCP.map((h) => [h.name, h.annotations])).generar_musica.readOnlyHint).toBe(false);
    suno();
    const h = herramientas();
    const sin = await h.generar_musica({ estilo: "pop alegre" });
    expect(sin).toMatch(/^NO SE CREÓ NADA\./);
    expect(sin).toMatch(/confirmado=true/);
    expect(trabajos()).toHaveLength(0);
    expect(await h.generar_musica({ estilo: "pop alegre", confirmado: "sí" })).toMatch(/^NO SE CREÓ NADA/);
    const con = await h.generar_musica({ estilo: "pop alegre", confirmado: true });
    expect(con.texto).toMatch(/^Pedido creado: /);
    expect(con.vista).toMatchObject({ tipo: "medios", estado: "en_marcha", seguir: { herramienta: "vista_trabajo" } });
    expect(con.vista.titulo).toMatch(/Música/);
    expect(trabajos()[0]).toMatchObject({ tipo: "audio", origen: "asistente", modelo: "suno-v6-kie" });
    await expect(h.generar_musica({ video_id: "no-existe", estilo: "x" })).rejects.toThrow(/No encontré el video/);
  });
});
