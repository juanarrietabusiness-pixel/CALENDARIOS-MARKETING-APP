import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearHerramientasEstudio } from "../../worker/lib/estudio/herramientas.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { claveDePropuesta } from "../../worker/lib/estudio/directorMusical.js";
import { palabrasDe, textoDeLocucion } from "../../src/lib/videoEscenas.js";

// ============================================================
// El DIRECTOR MUSICAL por las rutas de verdad, con un Anthropic y un Kie de mentira (nada se paga):
//
//   · «Proponer la música»: lee el guion guardado (con la locución si está lista), el kit y al cliente; la música de la
//     marca va delante; apunta su costo como «director musical»; no toca el video;
//   · generar sin estilo para un video: el 409 trae la propuesta y la confirmación pide a Suno EXACTAMENTE eso sin
//     pagar otra vez al director; con estilo dicho, manda la persona (ni se le pregunta);
//   · sin la IA, el respaldo (la música de la marca con el tempo de los cortes) y el aviso;
//   · «Me gusta esta»: la música generada pasa a referencia de la marca en el kit, y la siguiente propuesta la lee.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
const API = "https://api.kie.ai";
let db;
let env;
let fetchReal;
let anthropic;
let kie;

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
    async head(k) { return objetos.has(k) ? { size: objetos.get(k).bytes.length, httpMetadata: { contentType: objetos.get(k).tipo } } : null; },
    async get(k) {
      const o = objetos.get(k);
      if (!o) return null;
      return { body: o.bytes, size: o.bytes.length, httpMetadata: { contentType: o.tipo }, arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength) };
    },
    async put(k, v, op) { objetos.set(k, { bytes: await bytesDe(v), tipo: op?.httpMetadata?.contentType }); },
    async delete(k) { for (const x of [].concat(k)) objetos.delete(x); },
  };
}

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (t) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 3000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

const PROPUESTA = {
  estilo: "warm acoustic folk, gentle ukulele, soft claps, round upright bass, tender and bright, soft intro under the hook, builds at 0:05, resolves at 0:11",
  evitar: "vocals, heavy distortion, aggressive drops",
  bpm: 100, genero: "Folk acústico cálido", instrumentos: "ukelele, palmas, contrabajo", energia: "suave al inicio, sube en el beneficio",
  titulo: "Piel tranquila", porque: "Cálida y cercana como la voz de la marca, con el tempo de sus cortes.",
};

/** Anthropic (el director) y Kie (Suno) de mentira, en un solo `fetch`. */
function servicios({ respuesta = JSON.stringify(PROPUESTA) } = {}) {
  anthropic = [];
  kie = [];
  let i = 0;
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) { anthropic.push(JSON.parse(init.body)); return flujo(respuesta); }
    if (u === `${API}/api/v1/jobs/createTask`) { kie.push(JSON.parse(init.body)); return Response.json({ code: 200, data: { taskId: "t-suno" } }); }
    if (u.startsWith(`${API}/api/v1/jobs/recordInfo`)) {
      const state = i++ ? "success" : "generating";
      const data = [1, 2].map((n) => ({ id: `audio-${n}`, audio_url: `https://tempfile.kie.test/m${n}.mp3`, title: "Piel tranquila", duration: 20 }));
      return Response.json({ code: 200, data: { taskId: "t-suno", state, ...(state === "success" ? { response: { data }, creditsConsumed: 12 } : {}) } });
    }
    if (/^https:\/\/tempfile\.kie\.test\/m\d\.mp3$/.test(u)) {
      const b = mp3(6);
      return new Response(b, { status: 200, headers: { "content-length": String(b.length), "content-type": "audio/mpeg" } });
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}
const textoPedido = (p) => p.messages.map((m) => (typeof m.content === "string" ? m.content : m.content.map((b) => b.text ?? "").join(""))).join("\n");

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    method: opciones.method ?? "GET",
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

const fila = (id) => db.sqlite.prepare("select * from videos_proyectos where id = ?").get(id);
const kitGuardado = () => JSON.parse(db.sqlite.prepare("select kit_marca from clients where id = 'bc'").get().kit_marca ?? "{}");

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

async function crearVideo(cambiar = (g) => g) {
  const g = ejemplo();
  g.musica = { estilo: "música corporativa alegre" };
  const r = await pedir("/videos/bc", { method: "POST", body: { guion: cambiar(g) } });
  return (await r.json()).video;
}

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") }, KIE_API_KEY: "kie-secreta", ANTHROPIC_API_KEY: "k" };
  fetchReal = globalThis.fetch;
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "y");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name, industry, audiencia, estilo_locucion, kit_marca) values (?,?,?,?,?,?,?)").run(
    "bc", JEFE, "Baby Caleb", "Productos para bebés", "Mamás primerizas de Panamá", "Cercana y tranquila",
    JSON.stringify({ musica: { estilo: "Acústica cálida y tierna, nada electrónico", evitar: "trap, reguetón" }, estilo: "Ilustración plana suave" }),
  );
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("otro", JEFE, "Otro cliente");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
}, 30_000);
afterEach(() => { globalThis.fetch = fetchReal; });

describe("«Proponer la música para este video»", () => {
  it("lee el video y la marca, apunta su costo y no toca el video ni pide nada a Suno", async () => {
    servicios();
    const v = await crearVideo();
    const r = await pedir(`/videos/bc/${v.id}/musica`, { method: "POST" });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.propuesta).toMatchObject({ bpm: 100, titulo: "Piel tranquila", instrumental: true, porque: PROPUESTA.porque, genero: "Folk acústico cálido" });
    expect(j.propuesta.estilo).toMatch(/^warm acoustic folk.*, 100 BPM$/);
    // Lo que la marca evita va siempre, primero; las voces no (las pone la aplicación al pedir una instrumental).
    expect(j.propuesta.evitar).toBe("trap, reguetón, heavy distortion, aggressive drops");
    expect(j.propuesta.duracion).toBeGreaterThanOrEqual(10);
    expect(j.video).toMatchObject({ estimado: true, conVoz: false });
    expect(j.video.escenas).toBeGreaterThan(1);
    // El pedido: la música de la marca delante, el cliente y el video escena a escena.
    expect(anthropic).toHaveLength(1);
    const p = textoPedido(anthropic[0]);
    expect(p).toMatch(/LA MÚSICA DE LA MARCA[\s\S]*Acústica cálida y tierna/);
    expect(p).toMatch(/Rubro: Productos para bebés/);
    expect(p).toMatch(/Su público: Mamás primerizas/);
    expect(p).toMatch(/Escena a escena/);
    expect(p).toMatch(/«música corporativa alegre»/);
    // Se apunta como «director musical» y no se pide nada a Suno.
    expect(db.sqlite.prepare("select count(*) n from consumo_ia where funcion = 'director musical'").get().n).toBe(1);
    expect(kie).toHaveLength(0);
    expect(fila(v.id).version).toBe(v.version);
    // La propuesta queda guardada fuera de `clientes/` (para la confirmación de generar_musica).
    expect([...env.MEDIA.objetos.keys()]).toContain(claveDePropuesta(JEFE, v.id));
  });

  it("con la locución lista, sabe lo que dura de verdad", async () => {
    servicios();
    const v = await crearVideo();
    const n = palabrasDe(textoDeLocucion(fila(v.id).guion ? JSON.parse(fila(v.id).guion) : {})).length;
    const palabras = Array.from({ length: n }, (_, i) => ({ desde: i * 0.7, hasta: i * 0.7 + 0.6 }));
    db.sqlite.prepare("update videos_proyectos set locucion = ? where id = ?").run(JSON.stringify({ estado: "lista", palabras, version: v.version, voz: { id: "XrExE9yKIg1WjnnlVkGX", nombre: "Matilda" } }), v.id);
    const j = await (await pedir(`/videos/bc/${v.id}/musica`, { method: "POST" })).json();
    expect(j.video).toMatchObject({ estimado: false, conVoz: true });
    expect(textoPedido(anthropic[0])).toMatch(/medida con la locución real/);
    expect(textoPedido(anthropic[0])).toMatch(/La voz de este video: Matilda \(cálida, cercana\)/);
  });

  it("sin la IA: el respaldo con la música de la marca y el tempo de los cortes, y el aviso", async () => {
    servicios();
    delete env.ANTHROPIC_API_KEY;
    const v = await crearVideo();
    const j = await (await pedir(`/videos/bc/${v.id}/musica`, { method: "POST" })).json();
    expect(j.propuesta.deRespaldo).toBe(true);
    expect(j.propuesta.estilo).toMatch(/^Acústica cálida y tierna, nada electrónico, \d+ BPM, soft intro under the hook/);
    expect(j.aviso).toMatch(/no respondió/);
    expect(anthropic).toHaveLength(0);
  });

  it("un video de otro cliente o un guion con errores no se propone", async () => {
    servicios();
    const v = await crearVideo();
    expect((await pedir(`/videos/otro/${v.id}/musica`, { method: "POST" })).status).toBe(404);
    db.sqlite.prepare("update videos_proyectos set guion = ? where id = ?").run(JSON.stringify({ escenas: [] }), v.id);
    expect((await pedir(`/videos/bc/${v.id}/musica`, { method: "POST" })).status).toBe(400);
    expect(anthropic).toHaveLength(0);
  });
});

describe("generar la música de un video sin estilo dicho", () => {
  it("el 409 trae la propuesta y la confirmación pide a Suno EXACTAMENTE eso, sin pagar otra vez al director", async () => {
    servicios();
    const v = await crearVideo();
    const cot = await pedir("/videos/bc/musicas/generar", { method: "POST", body: { videoId: v.id } });
    expect(cot.status).toBe(409);
    const c = await cot.json();
    expect(c.pedido.estilo).toMatch(/^warm acoustic folk/);
    expect(c.propuesta).toMatchObject({ porque: PROPUESTA.porque, bpm: 100 });
    expect(anthropic).toHaveLength(1);
    const ok = await pedir("/videos/bc/musicas/generar", { method: "POST", body: { videoId: v.id, confirmado: true } });
    expect(ok.status).toBe(202);
    const { trabajoId, pedido, propuesta } = await ok.json();
    expect(anthropic).toHaveLength(1); // la guardada
    expect(pedido.estilo).toBe(c.pedido.estilo);
    expect(propuesta.porque).toBe(PROPUESTA.porque);
    const t = await hastaElFinal(trabajoId);
    expect(t.estado).toBe("hecho");
    expect(kie[0].input.style).toBe(`${c.pedido.estilo}. Instrumental, no vocals.`);
    expect(kie[0].input.negative_tags).toMatch(/^vocals, singing, voice, lyrics, spoken word, trap, reguetón/);
    expect(kie[0].input.title).toBe("Piel tranquila");
    // Lo que se le mandó a Suno queda en la ficha de la música (lo lee «Me gusta esta»).
    const { musicas } = await (await pedir("/videos/bc/musicas")).json();
    expect(musicas[0].estilo).toBe(c.pedido.estilo);
  });

  it("si el guion cambia, la propuesta guardada ya no vale: se piensa otra vez", async () => {
    servicios();
    const v = await crearVideo();
    await pedir("/videos/bc/musicas/generar", { method: "POST", body: { videoId: v.id } });
    const g = JSON.parse(fila(v.id).guion);
    g.escenas[0].habla = `${g.escenas[0].habla} Y algo más.`;
    db.sqlite.prepare("update videos_proyectos set guion = ? where id = ?").run(JSON.stringify(g), v.id);
    await pedir("/videos/bc/musicas/generar", { method: "POST", body: { videoId: v.id } });
    expect(anthropic).toHaveLength(2);
  });

  it("con estilo dicho, manda la persona: no se le pregunta al director", async () => {
    servicios();
    const v = await crearVideo();
    const c = await (await pedir("/videos/bc/musicas/generar", { method: "POST", body: { videoId: v.id, estilo: "bossa nova suave, 90 BPM" } })).json();
    expect(c.pedido.estilo).toBe("bossa nova suave, 90 BPM");
    expect(c.propuesta).toBeUndefined();
    expect(anthropic).toHaveLength(0);
  });

  it("sin video ni estilo, la música de la marca del kit", async () => {
    servicios();
    const c = await (await pedir("/videos/bc/musicas/generar", { method: "POST", body: {} })).json();
    expect(c.codigo).toBe("confirmar");
    expect(c.pedido).toMatchObject({ estilo: "Acústica cálida y tierna, nada electrónico", evitar: "trap, reguetón" });
    expect(anthropic).toHaveLength(0);
  });

  it("generar_musica (asistente y Claude) dice qué pidió y por qué, también al cotizar", async () => {
    servicios();
    const v = await crearVideo();
    const h = crearHerramientasEstudio({
      env, acceso: crearAcceso(db, JEFE), usuario: { id: JEFE }, por: null, origen: "claude",
      resolverCliente: async () => db.sqlite.prepare("select * from clients where id = 'bc'").get(),
    });
    const sin = await h.generar_musica({ video_id: v.id });
    expect(sin).toMatch(/^NO SE CREÓ NADA\./);
    expect(sin).toMatch(/El director musical escuchó el video y pide: «warm acoustic folk/);
    expect(sin).toMatch(/Por qué: Cálida y cercana/);
    const si = await h.generar_musica({ video_id: v.id, confirmado: true });
    expect(si).toMatch(/^Pedido creado: /);
    expect(si).toMatch(/Por qué: Cálida y cercana/);
    expect(anthropic).toHaveLength(1);
  });
});

describe("«Me gusta esta»: la música de la marca aprende", () => {
  it("una generada pasa a referencia de la marca (la más nueva primero) y la siguiente propuesta la lee", async () => {
    servicios();
    db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo, prompt, ajustes) values (?,?,?,?,?,?,?,?,?)")
      .run("mus1", JEFE, "bc", "clientes/bc/estudio/m1.mp3", "audio", "audio/mpeg", "musica-suno", "Piel tranquila (1)", JSON.stringify({ para: "musica", pedido: { estilo: "warm acoustic folk, ukulele, 100 BPM" } }));
    db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo, prompt) values (?,?,?,?,?,?,?,?)")
      .run("mus2", JEFE, "bc", "clientes/bc/estudio/m2.mp3", "audio", "audio/mpeg", "musica-subida", "Tema.mp3");
    const r = await pedir("/videos/bc/musicas/marca", { method: "POST", body: { archivoId: "mus1" } });
    expect(r.status).toBe(200);
    expect((await r.json()).musica.referencias[0]).toMatchObject({ estilo: "warm acoustic folk, ukulele, 100 BPM", titulo: "Piel tranquila", archivoId: "mus1" });
    // Lo que escribió la agencia se queda.
    expect(kitGuardado().musica).toMatchObject({ estilo: "Acústica cálida y tierna, nada electrónico", evitar: "trap, reguetón" });
    // Otra vez la misma: no se repite.
    await pedir("/videos/bc/musicas/marca", { method: "POST", body: { archivoId: "mus1" } });
    expect(kitGuardado().musica.referencias).toHaveLength(1);
    // Una subida a mano no dice qué se le pidió a Suno; una de otro cliente, no existe.
    expect((await pedir("/videos/bc/musicas/marca", { method: "POST", body: { archivoId: "mus2" } })).status).toBe(409);
    expect((await pedir("/videos/otro/musicas/marca", { method: "POST", body: { archivoId: "mus1" } })).status).toBe(404);
    const v = await crearVideo();
    await pedir(`/videos/bc/${v.id}/musica`, { method: "POST" });
    expect(textoPedido(anthropic[0])).toMatch(/Músicas que ya gustaron a la marca[\s\S]*«Piel tranquila»: warm acoustic folk, ukulele, 100 BPM/);
  });

  it("guardar el kit conserva la música de la marca, limpia", async () => {
    servicios();
    const r = await pedir("/estudio/bc/kit", { method: "PUT", body: { kit: { musica: { estilo: "  Jazz suave ", evitar: "rock", referencias: [{ estilo: "smooth jazz, 80 BPM", archivoId: "../x" }] } } } });
    expect(r.status).toBe(200);
    expect(kitGuardado().musica).toEqual({ estilo: "Jazz suave", evitar: "rock", referencias: [{ estilo: "smooth jazz, 80 BPM", titulo: "" }] });
  });
});
