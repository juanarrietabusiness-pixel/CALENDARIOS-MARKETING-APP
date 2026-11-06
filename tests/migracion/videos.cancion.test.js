import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { mesActual } from "../../worker/lib/configIA.js";
import { crearHerramientasEstudio } from "../../worker/lib/estudio/herramientas.js";
import { ejecutarRender } from "../../worker/lib/estudio/render.js";
import { HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { CON_VISTA } from "../../worker/lib/mcpVista/modelo.js";
import { palabrasDe, lineaDeTiempo } from "../../src/lib/videoEscenas.js";
import { lineasDeLetra, limpiarLetra } from "../../src/lib/videoCancion.js";

// ============================================================
// «Video con tu canción» por las rutas de verdad (D1 en memoria, R2 de mentira) con un ElevenLabs, un Gemini y un
// Anthropic de MENTIRA, con la forma de su documentación (nada se paga):
//
//   · sincronizar: SIEMPRE 409 con el costo hasta `confirmado: true`; con él, Forced Alignment con la canción y la
//     letra (multipart), lo que costó en consumo_ia, la sincronía guardada fuera de `clientes/` y, la segunda vez, gratis;
//   · si la letra no se encuentra en la mezcla, se AÍSLA la voz y se alinea otra vez; sin llave de ElevenLabs (o si
//     todo falla), Gemini la oye; si nada, estimado y lo dice; con el presupuesto agotado, 402 sin llamar a nadie;
//   · la canción tiene que ser de ESE cliente o de la agencia de ESTE espacio;
//   · el borrador con la canción de locución (la prueba de sincronía o la IA, con su vuelta de corrección); aprobarlo
//     lo deja «Con locución» mientras diga la letra; el ajuste fino; la voz no la pisa; el render manda la canción
//     como pista, sin la música de «Sonido»;
//   · la herramienta de Claude: «NO SE CREÓ NADA» con el costo y, con el sí, el video.
// ============================================================

const JEFE = "u-jefe";
const OTRO = "u-otro";
const TESTIGO = "t-jefe";
const EL = "https://api.elevenlabs.io";
const GOOGLE = "https://generativelanguage.googleapis.com";
let db;
let env;
let llamadas;

const LETRA = `[Coro]
Toallitas suaves para tu bebé
sin alcohol y sin perfume
[Verso]
cuidan su piel desde el primer día
Toallitas suaves para tu bebé`;
const PALABRAS = palabrasDe(lineasDeLetra(LETRA).join(" "));

/** Un MP3 CBR de 128 kb/s de `segundos` (lo que `duracionMp3` sabe medir). `marca` cambia un byte (otra canción). */
function mp3(segundos = 20, marca = 0x44) {
  const b = new Uint8Array(Math.round(segundos * 16000));
  b.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
  for (let i = 10; i + 4 < b.length; i += 417) b.set([0xff, 0xfb, 0x90, marca], i);
  return b;
}

function r2() {
  const objetos = new Map();
  const bytesDe = async (v) => (v instanceof Uint8Array ? v : typeof v === "string" ? new TextEncoder().encode(v) : new Uint8Array(await new Response(v).arrayBuffer()));
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

/** Las palabras de la letra con tiempo (una cada 0,45 s desde `inicio`), como las devuelve Forced Alignment. */
const palabrasAlineadas = ({ inicio = 3, aplastadas = false } = {}) => PALABRAS.map((t, i) => (aplastadas
  ? { text: t, start: 19.99, end: 19.99, loss: 3.2 }
  : { text: t, start: +(inicio + i * 0.45).toFixed(2), end: +(inicio + i * 0.45 + 0.4).toFixed(2), loss: 0.12 }));

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (t) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 4000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 900 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

/**
 * Los servicios de mentira. `mezcla`: lo que contesta Forced Alignment con la canción tal cual («bien», «aplastada» o un
 * estado de error); `aislada`: con la voz aislada; `gemini`: si Gemini la oye; `ia`: las respuestas de Anthropic.
 */
function servicios({ mezcla = "bien", aislada = "bien", gemini = true, ia = [] } = {}) {
  llamadas = [];
  vi.stubGlobal("fetch", async (url, init = {}) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    if (u === `${EL}/v1/forced-alignment`) {
      const f = init.body;
      const audio = new Uint8Array(await f.get("file").arrayBuffer());
      // La voz aislada es otro MP3 (su marca, en el primer cuadro).
      const esAislada = audio[13] === 0x45;
      const modo = esAislada ? aislada : mezcla;
      if (typeof modo === "number") return Response.json({ detail: { status: "fallo", message: "No se pudo" } }, { status: modo });
      return Response.json({ characters: [{ text: "T", start: 3, end: 3.05 }], words: palabrasAlineadas({ aplastadas: modo === "aplastada" }), loss: modo === "aplastada" ? 3.2 : 0.1 },
        { headers: { "character-cost": "120" } });
    }
    if (u === `${EL}/v1/audio-isolation`) {
      if (!init.body.get("audio")) return Response.json({ detail: "falta el audio" }, { status: 422 });
      return new Response(mp3(20, 0x45), { headers: { "content-type": "audio/mpeg" } });
    }
    if (u === `${GOOGLE}/upload/v1beta/files`) return new Response("{}", { status: 200, headers: { "x-goog-upload-url": "https://subida.google.test/1" } });
    if (u === "https://subida.google.test/1") return Response.json({ file: { name: "files/cancion", state: "ACTIVE", uri: "https://g/files/cancion", mimeType: "audio/mpeg" } });
    if (u.includes(":generateContent")) {
      if (!gemini) return Response.json({ error: { message: "no" } }, { status: 400 });
      const palabras = PALABRAS.map((t, i) => ({ t, d: 2 + i * 0.5, h: 2 + i * 0.5 + 0.4 }));
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ palabras }) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } });
    }
    if (u.startsWith(`${GOOGLE}/v1beta/files/`)) return Response.json({});
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) return flujo(ia.shift() ?? "");
    throw new Error(`fetch inesperado a ${u}`);
  });
}

const pedir = (ruta, { method = "POST", body } = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  method, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
}), env);
const sincronizar = (body) => pedir("/videos/bc/cancion", { body: { musicaId: "can1", letra: LETRA, ...body } });
const video = (id) => db.sqlite.prepare("select * from videos_proyectos where id = ?").get(id);
const consumo = () => db.sqlite.prepare("select proveedor, funcion, modelo, costo_usd from consumo_ia").all();

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") }, ELEVENLABS_API_KEY: "el-secreta", GOOGLE_AI_KEY: "g", ANTHROPIC_API_KEY: "k" };
  const s = db.sqlite;
  for (const [id, mail] of [[JEFE, "jefe@a.com"], [OTRO, "otro@a.com"]]) s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, mail, "x", "y");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRO, OTRO, "admin", "Otra agencia", "#FF0000");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("bc", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("ot", JEFE, "Otro cliente");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)").run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  const ins = s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo, prompt, ajustes, bytes, created_at) values (?,?,?,?,?,?,?,?,?,?,?)");
  // La canción del cliente (20 s), una de OTRO cliente y la música de la marca (que el video de canción no lleva).
  ins.run("can1", JEFE, "bc", "clientes/bc/estudio/cancion.mp3", "audio", "audio/mpeg", "musica-subida", "Toallitas (la canción)", "{}", 320000, "2026-10-01T00:00:00.000Z");
  ins.run("can-otro", JEFE, "ot", "clientes/ot/estudio/suya.mp3", "audio", "audio/mpeg", "musica-subida", "Suya", "{}", 320000, "2026-10-01T00:00:00.000Z");
  ins.run("fondo", JEFE, "bc", "clientes/bc/estudio/fondo.mp3", "audio", "audio/mpeg", "musica-subida", "Fondo", "{}", 9000, "2026-10-02T00:00:00.000Z");
  env.MEDIA.objetos.set("clientes/bc/estudio/cancion.mp3", { bytes: mp3(20), tipo: "audio/mpeg" });
  env.MEDIA.objetos.set("clientes/ot/estudio/suya.mp3", { bytes: mp3(20, 0x46), tipo: "audio/mpeg" });
  env.MEDIA.objetos.set("clientes/bc/estudio/fondo.mp3", { bytes: mp3(2, 0x47), tipo: "audio/mpeg" });
  // La música de la agencia de ESTE espacio y la de OTRO espacio.
  s.prepare("insert into biblioteca_sonidos (id, owner_id, categoria, clave, mime, bytes, nombre, duracion, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?)")
    .run("ag1", JEFE, "musica", `biblioteca/${JEFE}/musica/2026-10/jingle.mp3`, "audio/mpeg", 320000, "Jingle de la agencia", 20, "2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z");
  s.prepare("insert into biblioteca_sonidos (id, owner_id, categoria, clave, mime, bytes, nombre, duracion, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?)")
    .run("ag-ajena", OTRO, "musica", `biblioteca/${OTRO}/musica/2026-10/ajena.mp3`, "audio/mpeg", 320000, "Ajena", 20, "2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z");
  env.MEDIA.objetos.set(`biblioteca/${JEFE}/musica/2026-10/jingle.mp3`, { bytes: mp3(20, 0x48), tipo: "audio/mpeg" });
  env.MEDIA.objetos.set(`biblioteca/${OTRO}/musica/2026-10/ajena.mp3`, { bytes: mp3(20, 0x49), tipo: "audio/mpeg" });
}, 30_000);
afterEach(() => { vi.unstubAllGlobals(); });

describe("sincronizar la letra", () => {
  it("sin confirmar es 409 con el costo y no llama a nadie; confirmada, alinea con ElevenLabs, apunta el costo y guarda la sincronía", async () => {
    servicios();
    const sin = await sincronizar({});
    expect(sin.status).toBe(409);
    const j = await sin.json();
    expect(j).toMatchObject({ codigo: "confirmar", duracion: expect.any(Number), palabras: PALABRAS.length, via: "elevenlabs" });
    expect(j.costo).toBeGreaterThan(j.minimo);
    expect(j.error).toMatch(/precio aproximado/);
    expect(llamadas).toHaveLength(0);
    // «true» como texto no confirma.
    expect((await sincronizar({ confirmado: "true" })).status).toBe(409);

    const con = await sincronizar({ confirmado: true });
    expect(con.status).toBe(200);
    const { sincronia, repetida } = await con.json();
    expect(repetida).toBe(false);
    expect(sincronia).toMatchObject({ fuente: "elevenlabs", coincidencia: 1, revisar: false, palabras: PALABRAS.length, nombre: "Toallitas (la canción)" });
    expect(sincronia.duracion).toBeCloseTo(20, 0);
    expect(sincronia.lineas.map((l) => l.texto)).toEqual(lineasDeLetra(LETRA));
    expect(sincronia.lineas[0]).toMatchObject({ desde: 3, coro: true });
    // El pedido: multipart con el audio y la letra limpia (sin las marcas de sección); la llave en su cabecera.
    const fa = llamadas.find((l) => l.url === `${EL}/v1/forced-alignment`);
    expect(fa.init.headers["xi-api-key"]).toBe("el-secreta");
    expect(fa.init.body.get("text")).toBe(limpiarLetra(LETRA).letra);
    expect(fa.init.body.get("text")).not.toMatch(/Coro/);
    expect(llamadas.some((l) => l.url.endsWith("/audio-isolation"))).toBe(false);
    // Lo que costó (por los créditos que dijo la respuesta), y la sincronía fuera de `clientes/`.
    expect(consumo()).toEqual([{ proveedor: "elevenlabs", funcion: "sincronizar canción", modelo: "forced-alignment", costo_usd: expect.any(Number) }]);
    const guardada = [...env.MEDIA.objetos.keys()].find((k) => k.startsWith(`canciones/${JEFE}/bc/`));
    expect(guardada).toBe(`canciones/${JEFE}/bc/${sincronia.huella}.json`);
    expect(JSON.parse(new TextDecoder().decode(env.MEDIA.objetos.get(guardada).bytes)).crudo.elevenlabs).toMatch(/"words"/);

    // La segunda vez, la misma canción con la misma letra: gratis, sin confirmar y sin llamar a nadie.
    const antes = llamadas.length;
    const otra = await (await sincronizar({})).json();
    expect(otra.repetida).toBe(true);
    expect(otra.sincronia.huella).toBe(sincronia.huella);
    expect(llamadas.length).toBe(antes);
  });

  it("si la letra no se encuentra en la mezcla, aísla la voz y alinea eso (y apunta las tres llamadas)", async () => {
    servicios({ mezcla: "aplastada", aislada: "bien" });
    const { sincronia } = await (await sincronizar({ confirmado: true })).json();
    expect(sincronia.fuente).toBe("elevenlabs-aislada");
    expect(sincronia.coincidencia).toBe(1);
    expect(sincronia.intentos.map((i) => i.fuente)).toEqual(["elevenlabs", "elevenlabs-aislada"]);
    expect(sincronia.intentos[0].coincidencia).toBe(0);
    expect(llamadas.map((l) => l.url.replace(EL, ""))).toEqual(["/v1/forced-alignment", "/v1/audio-isolation", "/v1/forced-alignment"]);
    expect(consumo().map((c) => c.modelo)).toEqual(["forced-alignment", "audio-isolation", "forced-alignment"]);
  });

  it("sin llave de ElevenLabs, Gemini la oye con la letra delante", async () => {
    delete env.ELEVENLABS_API_KEY;
    servicios();
    const precio = await (await sincronizar({})).json();
    expect(precio.via).toBe("gemini");
    const { sincronia } = await (await sincronizar({ confirmado: true })).json();
    expect(sincronia.fuente).toBe("gemini");
    expect(sincronia.lineas[0].desde).toBe(2);
    const gen = llamadas.find((l) => l.url.includes(":generateContent"));
    const prompt = JSON.parse(gen.init.body).contents[0].parts.map((p) => p.text ?? "").join(" ");
    expect(prompt).toMatch(/CANCIÓN: una voz CANTADA/);
    expect(prompt).toMatch(/Toallitas suaves para tu bebé/);
    expect(llamadas.some((l) => l.url.startsWith(EL))).toBe(false);
  });

  it("si ElevenLabs falla dos veces, Gemini; si todo falla, estimado y lo dice", async () => {
    servicios({ mezcla: 500, aislada: 500, gemini: true });
    let r = await (await sincronizar({ confirmado: true })).json();
    expect(r.sincronia.fuente).toBe("gemini");
    expect(r.sincronia.intentos.filter((i) => i.error).map((i) => i.fuente)).toEqual(["elevenlabs", "elevenlabs-aislada"]);
    // Otra letra (otra huella): todo falla.
    servicios({ mezcla: 401, aislada: 401, gemini: false });
    r = await (await sincronizar({ confirmado: true, letra: `${LETRA}\nOtra línea al final` })).json();
    expect(r.sincronia.fuente).toBe("estimado");
    expect(r.sincronia.coincidencia).toBe(0);
    expect(r.sincronia.avisos.join(" ")).toMatch(/ESTIMADOS/);
  });

  it("con el presupuesto agotado y «detener»: 402 sin llamar a nadie", async () => {
    db.sqlite.prepare("insert into ajustes_espacio (id, owner_id, presupuesto_usd, al_limite) values (?,?,?,?)").run(JEFE, JEFE, 1, "detener");
    db.sqlite.prepare("insert into consumo_ia (id, owner_id, mes, funcion, modelo, costo_usd) values (?,?,?,?,?,?)").run("g1", JEFE, mesActual(), "x", "claude-sonnet-5", 5);
    servicios();
    const r = await sincronizar({ confirmado: true });
    expect(r.status).toBe(402);
    expect(llamadas).toHaveLength(0);
  });

  it("la canción tiene que ser de ESE cliente o de la agencia de ESTE espacio; la letra, con algo que se cante", async () => {
    servicios();
    expect((await pedir("/videos/bc/cancion", { body: { musicaId: "can-otro", letra: LETRA } })).status).toBe(404);
    expect((await pedir("/videos/bc/cancion", { body: { musicaId: "ag-ajena", letra: LETRA } })).status).toBe(404);
    expect((await pedir("/videos/bc/cancion", { body: { musicaId: "no-existe", letra: LETRA } })).status).toBe(404);
    // La de la agencia de este espacio sí (y su dirección es la de la biblioteca de la agencia).
    const ag = await (await pedir("/videos/bc/cancion", { body: { musicaId: "ag1", letra: LETRA, confirmado: true } })).json();
    expect(ag.sincronia).toMatchObject({ archivo: "ag1", de: "agencia", src: "/api/sonidos/agencia/ag1/audio" });
    expect((await pedir("/videos/bc/cancion", { body: { musicaId: "can1", letra: "[Coro]\n(Verso)" } })).status).toBe(400);
    expect(llamadas.filter((l) => l.url.startsWith(EL))).toHaveLength(1);
  });
});

describe("el video con la canción", () => {
  async function sincronizada() {
    servicios();
    return (await (await sincronizar({ confirmado: true })).json()).sincronia;
  }

  it("la prueba de sincronía crea el borrador con la canción de locución; aprobado queda «Con locución» y se renderiza con la canción", async () => {
    const s = await sincronizada();
    // La música de la marca NO entra en un video con canción.
    db.sqlite.prepare("update estudio_archivos set favorito = 1 where id = 'fondo'").run();
    const res = await pedir("/videos/bc/cancion/video", { body: { huella: s.huella, modo: "karaoke", titulo: "Toallitas, el reel" } });
    expect(res.status).toBe(201);
    const { video: v } = await res.json();
    expect(v).toMatchObject({ estado: "borrador", version: 1, titulo: "Toallitas, el reel", valido: true });
    expect(v.guion.cancion).toEqual({ archivo: "can1", duracion: s.duracion, nombre: "Toallitas (la canción)" });
    expect(v.sonido.musica).toBeNull();
    expect(v.segundos).toBe(s.duracion);
    expect(v.locucion).toMatchObject({ origen: "cancion", estado: "lista", archivo: "can1", clave: "clientes/bc/estudio/cancion.mp3", fuente: "elevenlabs", coincidenciaGuion: 1 });
    expect(v.locucion.palabras).toHaveLength(PALABRAS.length);
    // Las palabras van con la canción: la primera línea empieza donde se canta.
    const l = lineaDeTiempo(v.guion, v.locucion.palabras);
    expect(l.silencios).toEqual([]);
    expect(l.escenas.find((e) => e.id === "l1").desde).toBe(3);

    // La voz no pisa la canción.
    const voz = await pedir(`/videos/bc/${v.id}/locucion`, { body: { version: 1, confirmado: true } });
    expect(voz.status).toBe(409);
    expect((await voz.json()).codigo).toBe("cancion");

    const ap = await (await pedir(`/videos/bc/${v.id}/aprobar`, { body: { version: 1 } })).json();
    expect(ap.video.estado).toBe("con_voz");
    expect(ap.cancion).toBe(true);

    // El render: la canción como pista, sin la música de «Sonido» (se dice) y con las palabras de la canción.
    await pedir(`/videos/bc/${v.id}/sonido`, { method: "PUT", body: { efectos: true, musica: { archivoId: "fondo", volumen: 0 } } });
    const encargos = [];
    env.RENDER = { idFromName: (n) => n, get: () => ({ fetch: async (req) => { encargos.push(await req.json()); return new Response("{}", { status: 202 }); } }) };
    expect((await pedir(`/videos/bc/${v.id}/render`, { body: { version: 1 } })).status).toBe(202);
    const recibidos = [];
    const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 1, 2, 3]);
    const listo = await ejecutarRender(env, encargos[0], async (ruta, cuerpo) => { recibidos.push(cuerpo); return new Response(MP4, { headers: { "X-Duracion": String(s.duracion) } }); });
    expect(listo.estado).toBe("listo");
    expect(recibidos[0].audio).toBe(Buffer.from(env.MEDIA.objetos.get("clientes/bc/estudio/cancion.mp3").bytes).toString("base64"));
    expect(recibidos[0].musica).toBeUndefined();
    expect(recibidos[0].efectos).toBe(true);
    expect(recibidos[0].palabras).toHaveLength(PALABRAS.length);
    expect(lineaDeTiempo(recibidos[0].guion, recibidos[0].palabras).total).toBe(s.duracion);
    expect(listo.aviso).toMatch(/la canción ya es la música/);
  });

  it("con una canción de la AGENCIA, el render la lee de su biblioteca", async () => {
    servicios();
    const s = (await (await pedir("/videos/bc/cancion", { body: { musicaId: "ag1", letra: LETRA, confirmado: true } })).json()).sincronia;
    const { video: v } = await (await pedir("/videos/bc/cancion/video", { body: { huella: s.huella } })).json();
    expect(v.locucion).toMatchObject({ de: "agencia", src: "/api/sonidos/agencia/ag1/audio" });
    await pedir(`/videos/bc/${v.id}/aprobar`, { body: { version: 1 } });
    const encargos = [];
    env.RENDER = { idFromName: (n) => n, get: () => ({ fetch: async (req) => { encargos.push(await req.json()); return new Response("{}", { status: 202 }); } }) };
    await pedir(`/videos/bc/${v.id}/render`, { body: { version: 1 } });
    const recibidos = [];
    const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 1, 2, 3]);
    await ejecutarRender(env, encargos[0], async (ruta, cuerpo) => { recibidos.push(cuerpo); return new Response(MP4); });
    expect(recibidos[0].audio).toBe(Buffer.from(env.MEDIA.objetos.get(`biblioteca/${JEFE}/musica/2026-10/jingle.mp3`).bytes).toString("base64"));
  });

  it("cambiar lo que se VE no obliga a nada; cambiar la letra del guion la deja sin valer (y no se renderiza)", async () => {
    const s = await sincronizada();
    const { video: v } = await (await pedir("/videos/bc/cancion/video", { body: { huella: s.huella } })).json();
    // Otro texto en pantalla, la misma letra: aprobado → «Con locución».
    let g = { ...v.guion, escenas: v.guion.escenas.map((e) => ({ ...e, pantalla: e.pantalla ? "Otra cosa" : e.pantalla })) };
    let r = await (await pedir(`/videos/bc/${v.id}`, { method: "PUT", body: { guion: g, version: 1 } })).json();
    expect((await (await pedir(`/videos/bc/${v.id}/aprobar`, { body: { version: r.video.version } })).json()).video.estado).toBe("con_voz");
    // Otra letra: aprobado se queda en «Guion aprobado» y el render dice por qué.
    g = { ...r.video.guion, escenas: r.video.guion.escenas.map((e) => ({ ...e, habla: e.habla ? "algo que la canción no dice nunca jamás" : "" })) };
    r = await (await pedir(`/videos/bc/${v.id}`, { method: "PUT", body: { guion: g, version: r.video.version } })).json();
    const ap = await (await pedir(`/videos/bc/${v.id}/aprobar`, { body: { version: r.video.version } })).json();
    expect(ap.video.estado).toBe("aprobado");
    env.RENDER = { idFromName: (n) => n, get: () => ({ fetch: async () => new Response("{}", { status: 202 }) }) };
    const render = await pedir(`/videos/bc/${v.id}/render`, { body: { version: r.video.version } });
    expect(render.status).toBe(409);
    expect((await render.json()).error).toMatch(/ya no coincide con la letra/);
  });

  it("el ajuste fino mueve la letra sin pagar ni cambiar la versión; «Volver a sincronizar» pide confirmar", async () => {
    const s = await sincronizada();
    const { video: v } = await (await pedir("/videos/bc/cancion/video", { body: { huella: s.huella } })).json();
    const antes = llamadas.length;
    const r = await (await pedir(`/videos/bc/${v.id}/cancion`, { method: "PUT", body: { desplazamiento: 0.5 } })).json();
    expect(r.video.version).toBe(1);
    expect(r.video.locucion.desplazamiento).toBe(0.5);
    expect(r.video.locucion.palabras[0].desde).toBeCloseTo(v.locucion.palabras[0].desde + 0.5, 3);
    expect((await (await pedir(`/videos/bc/${v.id}/cancion`, { method: "PUT", body: { desplazamiento: 9 } })).json()).video.locucion.desplazamiento).toBe(1.5);
    expect(llamadas.length).toBe(antes);
    const sin = await pedir(`/videos/bc/${v.id}/cancion`, { body: {} });
    expect(sin.status).toBe(409);
    expect((await sin.json()).codigo).toBe("confirmar");
    const con = await (await pedir(`/videos/bc/${v.id}/cancion`, { body: { confirmado: true } })).json();
    expect(con.video.locucion.desplazamiento).toBe(1.5);
    expect(llamadas.length).toBeGreaterThan(antes);
  });

  it("«Diseñar las escenas con IA»: la letra tal cual; si la cambia, una vuelta de corrección; si tampoco, 502", async () => {
    const s = await sincronizada();
    const lineas = lineasDeLetra(LETRA);
    const bueno = {
      version: 1, titulo: "La canción", formatos: ["9:16"],
      escenas: [
        { id: "intro", tipo: "gancho", habla: "", capas: [{ tipo: "logo" }] },
        ...lineas.map((t, i) => ({ id: `e${i}`, tipo: "explicacion", habla: t, pantalla: t.slice(0, 30), capas: [{ tipo: "texto", texto: t.slice(0, 30) }] })),
      ],
      musica: { estilo: "pop" },
    };
    const malo = { ...bueno, escenas: bueno.escenas.map((e, i) => (i === 1 ? { ...e, habla: "Toallitas suaves para tu niño" } : e)) };
    servicios({ ia: [JSON.stringify(malo), JSON.stringify(bueno)] });
    const res = await pedir("/videos/bc/cancion/video", { body: { huella: s.huella, modo: "ia" } });
    expect(res.status).toBe(201);
    const r = await res.json();
    expect(r.corregido).toBe(true);
    expect(r.video.guion.cancion.archivo).toBe("can1");
    expect(r.video.guion.musica).toBeNull();
    // El pedido llevó la letra por líneas con sus tiempos y, la segunda vez, el error de la letra.
    const pedidos = llamadas.filter((l) => l.url.startsWith("https://api.anthropic.com/v1/messages")).map((l) => JSON.parse(l.init.body).messages[0].content);
    expect(pedidos[0]).toMatch(/MODO CANCIÓN/);
    expect(pedidos[0]).toMatch(/\(CORO\) Toallitas suaves para tu bebé/);
    expect(pedidos[1]).toMatch(/La letra dice «bebé/);

    servicios({ ia: [JSON.stringify(malo), JSON.stringify(malo)] });
    const mal = await pedir("/videos/bc/cancion/video", { body: { huella: s.huella, modo: "ia" } });
    expect(mal.status).toBe(502);
    expect(db.sqlite.prepare("select count(*) n from videos_proyectos").get().n).toBe(1);
  });

  it("una huella que no es de esta sincronía (o de otro cliente) es 404", async () => {
    const s = await sincronizada();
    expect((await pedir("/videos/bc/cancion/video", { body: { huella: "0".repeat(24) } })).status).toBe(404);
    expect((await pedir("/videos/ot/cancion/video", { body: { huella: s.huella } })).status).toBe(404);
  });
});

describe("Claude y el asistente: video_con_cancion", () => {
  const herramientas = () => crearHerramientasEstudio({
    env, acceso: crearAcceso(db, JEFE), resolverCliente: async () => db.sqlite.prepare("select * from clients where id = 'bc'").get(),
    usuario: { id: JEFE, nombre: "Juan" }, origen: "claude", por: { userId: JEFE, nombre: "Juan" },
  });

  it("está en el MCP (escribe) y en la vista previa del chat", () => {
    const h = HERRAMIENTAS_MCP.find((x) => x.name === "video_con_cancion");
    expect(h.description).toMatch(/NO se genera voz/);
    expect(h.description).toMatch(/LETRA va EXACTA/);
    expect(h.annotations?.readOnlyHint).toBe(false);
    expect(CON_VISTA).toContain("video_con_cancion");
  });

  it("sin confirmar: NO SE CREÓ NADA con el costo; con el sí, el video con la canción y su audio en la vista", async () => {
    servicios();
    const h = herramientas();
    const sin = await h.video_con_cancion({ musica_id: "can1", letra: LETRA });
    expect(sin).toMatch(/^NO SE CREÓ NADA\. Sincronizar la letra de «Toallitas \(la canción\)»/);
    expect(llamadas).toHaveLength(0);
    expect(db.sqlite.prepare("select count(*) n from videos_proyectos").get().n).toBe(0);
    const con = await h.video_con_cancion({ musica_id: "can1", letra: LETRA, confirmado: true });
    expect(con.texto).toMatch(/con la canción «Toallitas \(la canción\)» .* como su audio: no se genera voz/);
    expect(con.texto).toMatch(/PRUEBA DE SINCRONÍA/);
    expect(con.vista.audios[0]).toMatchObject({ titulo: "La canción «Toallitas (la canción)»" });
    expect(con.vista.audios[0].url).toMatch(/^\/api\/vista-medio\//);
    const v = video(db.sqlite.prepare("select id from videos_proyectos").get().id);
    expect(JSON.parse(v.locucion).origen).toBe("cancion");
    // ver_video lo cuenta como una canción y no pide la voz.
    const ver = await h.ver_video({ video_id: v.id });
    expect(ver.texto).toMatch(/Con CANCIÓN \(no se genera voz\)/);
    expect(ver.texto).toMatch(/NUNCA generar_locucion|la canción ya es su locución/);
  });
});
