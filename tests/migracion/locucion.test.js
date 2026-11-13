import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { tipoPorBytes } from "../../worker/lib/estudio/archivos.js";
import { verVideo } from "../../worker/lib/geminiVideo.js";
import { crearHerramientasEstudio, DEFINICIONES_ESTUDIO } from "../../worker/lib/estudio/herramientas.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { VOCES_DE_SERIE } from "../../src/lib/voces.js";
import { HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { olvidarModelos } from "../../worker/lib/estudio/elevenlabs.js";
import { limpiarKit, fundirKit } from "../../src/lib/kitMarca.js";
import { palabrasDe, textoDeLocucion, lineaDeTiempo } from "../../src/lib/videoEscenas.js";

// ============================================================
// La VOZ del video animado, por las rutas y la cola de verdad, con un Kie.ai y un Gemini de mentira (nada se paga):
//
//   · las voces y la muestra: gratis si ya está hecha; si no, SIEMPRE 409 con el costo hasta `confirmado: true`;
//   · la locución: sólo del guion aprobado, con voz, y SIEMPRE confirmada (aunque cueste centavos);
//   · la cola: createTask con el cuerpo de v3 o v2, recordInfo, bajar el MP3 y el proyecto en «Con voz» con UN
//     tiempo por palabra del guion (del motor, verificado por Gemini o estimado);
//   · el asistente y Claude: la confirmación vuelve como texto con la cifra, nunca se salta.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
const API = "https://api.kie.ai";
const GOOGLE = "https://generativelanguage.googleapis.com";
let db;
let env;
let fetchReal;

const ejemplo = () => {
  const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
  return JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1]);
};

/** Un MP3 CBR de 128 kb/s y `segundos` de largo: lo que `duracionMp3` sabe medir. */
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

/** Kie entero: crear la tarea, mirarla y el MP3. `resultado` es lo que trae `resultJson` además de la dirección. */
function kie({ resultado = {}, estados = ["generating", "success"] } = {}) {
  const llamadas = [];
  let i = 0;
  const gemini = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    if (u === `${API}/api/v1/jobs/createTask`) return json({ code: 200, msg: "success", data: { taskId: "t-voz" } });
    if (u.startsWith(`${API}/api/v1/jobs/recordInfo`)) {
      const state = estados[Math.min(i++, estados.length - 1)];
      return json({ code: 200, data: { taskId: "t-voz", state, ...(state === "success" ? { resultJson: JSON.stringify({ resultUrls: ["https://tempfile.kie.test/voz.mp3"], ...resultado }) } : {}) } });
    }
    if (u === "https://tempfile.kie.test/voz.mp3") {
      const b = mp3(6);
      return new Response(b, { status: 200, headers: { "content-length": String(b.length), "content-type": "audio/mpeg" } });
    }
    // Gemini (la verificación posterior): subir, y transcribir con tiempos.
    if (u === `${GOOGLE}/upload/v1beta/files`) return new Response("{}", { status: 200, headers: { "x-goog-upload-url": "https://subida.google.test/1" } });
    if (u === "https://subida.google.test/1") return json({ file: { name: "files/locucion", state: "ACTIVE", uri: "https://g/files/locucion", mimeType: "audio/mpeg" } });
    if (u.includes(":generateContent")) {
      gemini.push(JSON.parse(init.body));
      const palabras = palabrasDe(textoDeLocucion(ejemplo())).map((t, n) => ({ t, d: n * 0.3, h: n * 0.3 + 0.25 }));
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ palabras }) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 } });
    }
    if (u.startsWith(`${GOOGLE}/v1beta/files/`)) return json({});
    return new Response("{}", { status: 404 });
  });
  return { llamadas, gemini };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    method: opciones.method ?? "GET",
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

const trabajos = () => db.sqlite.prepare("select * from estudio_trabajos").all();
const video = (id) => db.sqlite.prepare("select * from videos_proyectos where id = ?").get(id);

/** Avanza un trabajo hasta el final, adelantando el reloj del motor entre pasos. */
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

/** Un video con su guion aprobado. */
async function videoAprobado() {
  const { video: v } = await (await pedir("/videos/bc", { method: "POST", body: { guion: ejemplo() } })).json();
  await pedir(`/videos/bc/${v.id}/aprobar`, { method: "POST", body: { version: v.version } });
  return v;
}

const kitConVoz = (locucion) => db.sqlite.prepare("update clients set kit_marca = ? where id = 'bc'").run(JSON.stringify({ locucion }));

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

describe("las voces y su muestra", () => {
  it("la lista trae las de serie, la de la marca y el precio de la muestra; no llama a nadie", async () => {
    const { llamadas } = kie();
    kitConVoz({ voz: "hpp4J3VqNfWAUOO0d1Us", modelo: "v3" });
    const r = await (await pedir("/videos/bc/voces")).json();
    expect(r.voces.length).toBe(VOCES_DE_SERIE.length);
    expect(r.voces.find((v) => v.escogida)?.nombre).toBe("Bella");
    expect(r.modelos.map((m) => m.clave)).toEqual(["v3", "v2"]);
    expect(r.modelos[0].muestra).toBeGreaterThan(0);
    expect(llamadas).toHaveLength(0);
  });

  it("sin confirmar es 409 con el costo y no crea nada; confirmada, un trabajo de audio que deja la muestra para toda la agencia", async () => {
    const { llamadas } = kie();
    const sin = await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "hpp4J3VqNfWAUOO0d1Us" } });
    expect(sin.status).toBe(409);
    const j = await sin.json();
    expect(j).toMatchObject({ codigo: "confirmar", voz: "Bella", modelo: "v3" });
    expect(j.costo).toBeGreaterThan(0);
    expect(j.costo).toBeLessThan(0.05);
    expect(trabajos()).toHaveLength(0);
    // «true» como texto no confirma: sólo el booleano.
    expect((await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "hpp4J3VqNfWAUOO0d1Us", confirmado: "true" } })).status).toBe(409);

    const con = await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "hpp4J3VqNfWAUOO0d1Us", confirmado: true } });
    expect(con.status).toBe(202);
    const { trabajoId } = await con.json();
    const fin = await hastaElFinal(trabajoId);
    expect(fin.estado).toBe("hecho");

    const crear = llamadas.find((l) => l.url.endsWith("/createTask"));
    expect(JSON.parse(crear.init.body)).toEqual({
      model: "elevenlabs/text-to-dialogue-v3",
      input: { dialogue: [{ text: expect.stringContaining("así suena la voz"), voice: "hpp4J3VqNfWAUOO0d1Us" }], stability: 0.5, language_code: "es" },
    });
    expect(env.MEDIA.objetos.has("voces/elevenlabs/v3/hpp4J3VqNfWAUOO0d1Us.mp3")).toBe(true);
    expect(db.sqlite.prepare("select funcion, costo_usd from consumo_ia").all()).toEqual([{ funcion: "estudio-voz", costo_usd: expect.any(Number) }]);

    // La segunda vez sale gratis: ni trabajo nuevo ni llamada.
    const antes = llamadas.length;
    const otra = await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "hpp4J3VqNfWAUOO0d1Us" } });
    expect(otra.status).toBe(200);
    expect(await otra.json()).toMatchObject({ lista: true, costo: 0 });
    const oir = await pedir("/videos/bc/voces/muestra?modelo=v3&voz=hpp4J3VqNfWAUOO0d1Us");
    expect(oir.status).toBe(200);
    expect(oir.headers.get("content-type")).toBe("audio/mpeg");
    expect(trabajos()).toHaveLength(1);
    expect(llamadas.length).toBe(antes);
  });

  it("con TEXTO propio: su costo por su largo, se manda tal cual a v3, queda aparte y la nota dice si llegaron los tiempos", async () => {
    const TEXTO = "[preocupada] ¿Las toallitas le dejan la piel roja a tu bebé? [pause] Muchas traen alcohol y perfume que irritan. [tranquila] Nateen limpia suave: hipoalergénicas, sin alcohol y sin perfume. Pídelas hoy por WhatsApp.";
    const { llamadas } = kie({ resultado: { words: [{ text: "¿Las", start: 0.1, end: 0.3 }, { text: "toallitas", start: 0.3, end: 0.8 }] } });
    const sin = await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "iCrDUkL56s3C8sCRl7wb", texto: TEXTO } });
    expect(sin.status).toBe(409);
    const precio = await sin.json();
    expect(precio).toMatchObject({ codigo: "confirmar", voz: "Esperanza", caracteres: TEXTO.length });
    expect(precio.creditos).toBeCloseTo((TEXTO.length * 14) / 1000, 5);
    expect(precio.huella).toMatch(/^[0-9a-f]{16}$/);
    expect(trabajos()).toHaveLength(0);

    const r = await (await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "iCrDUkL56s3C8sCRl7wb", texto: TEXTO, confirmado: true } })).json();
    expect(r.huella).toBe(precio.huella);
    const fin = await hastaElFinal(r.trabajoId);
    expect(fin.estado).toBe("hecho");
    expect(fin.nota).toMatch(/Kie devolvió el tiempo de cada palabra \(2 palabras\)/);
    expect(fin.ajustes.tiempos).toMatchObject({ delMotor: true, palabras: 2 });
    expect(fin.ajustes.crudo).toMatch(/words/);
    const cuerpo = JSON.parse(llamadas.find((l) => l.url.endsWith("/createTask")).init.body);
    expect(cuerpo.input.dialogue[0]).toEqual({ text: TEXTO, voice: "iCrDUkL56s3C8sCRl7wb" });
    // Aparte de la frase fija: la de serie sigue sin hacer, la propia suena por su huella y el mismo texto ya es gratis.
    expect(env.MEDIA.objetos.has(`voces/elevenlabs/v3/iCrDUkL56s3C8sCRl7wb-${r.huella}.mp3`)).toBe(true);
    expect(env.MEDIA.objetos.has("voces/elevenlabs/v3/iCrDUkL56s3C8sCRl7wb.mp3")).toBe(false);
    expect((await pedir(`/videos/bc/voces/muestra?modelo=v3&voz=iCrDUkL56s3C8sCRl7wb&huella=${r.huella}`)).status).toBe(200);
    expect((await pedir("/videos/bc/voces/muestra?modelo=v3&voz=iCrDUkL56s3C8sCRl7wb&huella=../../x")).status).toBe(404);
    const otra = await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "iCrDUkL56s3C8sCRl7wb", texto: TEXTO } });
    expect(otra.status).toBe(200);
    expect(await otra.json()).toMatchObject({ lista: true, costo: 0 });
  });

  it("si Kie no trae tiempos, la nota lo dice con los campos que sí llegaron; un texto de más de 500 no se pide", async () => {
    kie();
    const { trabajoId } = await (await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "hpp4J3VqNfWAUOO0d1Us", texto: "Hola, mamá.", confirmado: true } })).json();
    const fin = await hastaElFinal(trabajoId);
    expect(fin.nota).toMatch(/Kie NO devolvió tiempos por palabra \(llegó: resultUrls\)/);
    expect(fin.ajustes.tiempos.delMotor).toBe(false);
    const largo = await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "hpp4J3VqNfWAUOO0d1Us", texto: "a".repeat(501), confirmado: true } });
    expect(largo.status).toBe(400);
    expect(trabajos()).toHaveLength(1);
  });

  it("una muestra que no está hecha dice su costo; una voz que no es del cliente no existe", async () => {
    kie();
    const r = await pedir("/videos/bc/voces/muestra?modelo=v2&voz=hpp4J3VqNfWAUOO0d1Us");
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ codigo: "sin_muestra" });
    expect((await pedir("/videos/bc/voces/muestra?modelo=v3&voz=no-existe")).status).toBe(404);
    expect((await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "no-existe", confirmado: true } })).status).toBe(404);
  });

  it("una voz que Kie deja «en espera» se da por fallida a los 12 minutos, con lo que decía, sin cobrar", async () => {
    kie({ estados: ["waiting"] });
    const { trabajoId } = await (await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "hpp4J3VqNfWAUOO0d1Us", texto: "Hola, mamá.", confirmado: true } })).json();
    expect((await hastaElFinal(trabajoId, 2)).estado).toBe("en_marcha");
    db.sqlite.prepare("update estudio_trabajos set created_at = ? where id = ?").run(new Date(Date.now() - 13 * 60_000).toISOString(), trabajoId);
    const fin = await hastaElFinal(trabajoId, 1);
    expect(fin).toMatchObject({ estado: "fallido", costo: 0 });
    expect(fin.error).toMatch(/no terminó la voz en 12 minutos \(se quedó en «En espera en Kie.ai»\)/);
  });

  it("un 408 o un 501 de Kie al mirar terminan la voz con su motivo, sin reintentar", async () => {
    for (const [code, frase] of [[408, /no tuvo resultado en 10 minutos/], [501, /no pudo generarlo: falló/]]) {
      db.sqlite.prepare("delete from estudio_trabajos").run();
      kie();
      const real = globalThis.fetch;
      globalThis.fetch = vi.fn(async (url, init) => (String(url).includes("/recordInfo") ? json({ code, msg: "falló" }) : real(url, init)));
      const { trabajoId } = await (await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "hpp4J3VqNfWAUOO0d1Us", texto: "Hola, mamá.", confirmado: true } })).json();
      const fin = await hastaElFinal(trabajoId, 2);
      expect(fin.estado).toBe("fallido");
      expect(fin.error).toMatch(frase);
    }
  });

  it("sin la llave de Kie, 503 sin llamar a nadie", async () => {
    const { llamadas } = kie();
    delete env.KIE_API_KEY;
    const r = await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "hpp4J3VqNfWAUOO0d1Us", confirmado: true } });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ codigo: "sin_llave" });
    expect(llamadas).toHaveLength(0);
  });
});

describe("la locución de un video", () => {
  it("sólo del guion aprobado y con voz escogida", async () => {
    kie();
    const { video: v } = await (await pedir("/videos/bc", { method: "POST", body: { guion: ejemplo() } })).json();
    const borrador = await pedir(`/videos/bc/${v.id}/locucion`, { method: "POST", body: { version: v.version, confirmado: true } });
    expect(borrador.status).toBe(409);
    expect(await borrador.json()).toMatchObject({ codigo: "sin_aprobar" });

    await pedir(`/videos/bc/${v.id}/aprobar`, { method: "POST", body: { version: v.version } });
    const sinVoz = await pedir(`/videos/bc/${v.id}/locucion`, { method: "POST", body: { version: v.version, confirmado: true } });
    expect(sinVoz.status).toBe(400);
    expect(await sinVoz.json()).toMatchObject({ codigo: "sin_voz" });
    expect(trabajos()).toHaveLength(0);
  });

  it("SIEMPRE se confirma: la primera vez es 409 con el costo exacto y no crea nada", async () => {
    const { llamadas } = kie();
    kitConVoz({ voz: "hpp4J3VqNfWAUOO0d1Us", modelo: "v3" });
    const v = await videoAprobado();
    const r = await pedir(`/videos/bc/${v.id}/locucion`, { method: "POST", body: { version: v.version } });
    expect(r.status).toBe(409);
    const j = await r.json();
    const caracteres = textoDeLocucion(ejemplo()).length;
    expect(j).toMatchObject({ codigo: "confirmar", voz: "Bella", modelo: "v3", caracteres });
    expect(j.creditos).toBeCloseTo((caracteres * 14) / 1000, 5);
    expect(j.costo).toBeLessThan(0.5);
    expect(trabajos()).toHaveLength(0);
    expect(llamadas).toHaveLength(0);
  });

  it("v3 sin tiempos: la verificación posterior con Gemini da uno por palabra y el video queda «Con voz»", async () => {
    const { llamadas, gemini } = kie();
    env.GOOGLE_AI_KEY = "g-secreta";
    kitConVoz({ voz: "hpp4J3VqNfWAUOO0d1Us", modelo: "v3" });
    const v = await videoAprobado();
    const r = await pedir(`/videos/bc/${v.id}/locucion`, { method: "POST", body: { version: v.version, confirmado: true } });
    expect(r.status).toBe(202);
    const { trabajoId } = await r.json();
    expect(JSON.parse(video(v.id).locucion)).toMatchObject({ estado: "generando", trabajoId });
    // Un segundo pedido mientras va el primero no se cobra dos veces.
    expect((await pedir(`/videos/bc/${v.id}/locucion`, { method: "POST", body: { version: v.version, confirmado: true } })).status).toBe(409);

    const fin = await hastaElFinal(trabajoId);
    expect(fin.estado).toBe("hecho");
    expect(fin.nota).toMatch(/verificados al oírla/);
    const cuerpo = JSON.parse(llamadas.find((l) => l.url.endsWith("/createTask")).init.body);
    expect(cuerpo.input.dialogue[0].text).toBe(textoDeLocucion(ejemplo()));
    expect(gemini).toHaveLength(1);

    const fila = video(v.id);
    expect(fila.estado).toBe("con_voz");
    const loc = JSON.parse(fila.locucion);
    const esperadas = palabrasDe(textoDeLocucion(ejemplo()));
    expect(loc).toMatchObject({ estado: "lista", fuente: "verificado", modelo: "v3", revisar: false, voz: { nombre: "Bella" } });
    expect(loc.palabras).toHaveLength(esperadas.length);
    expect(loc.duracion).toBeGreaterThan(5);
    // Con estos tiempos la línea de tiempo deja de estimar.
    expect(lineaDeTiempo(ejemplo(), loc.palabras).estimado).toBe(false);
    // El audio va a R2 y a la galería, pero la galería no lo enseña.
    expect(env.MEDIA.objetos.get(loc.clave).tipo).toBe("audio/mpeg");
    const galeria = await (await pedir("/estudio/bc")).json();
    expect(galeria.archivos.some((a) => a.tipo === "audio")).toBe(false);
    expect(galeria.trabajos?.some?.((t) => t.tipo === "audio") ?? false).toBe(false);
    // GET del video la devuelve lista.
    const uno = await (await pedir(`/videos/bc/${v.id}`)).json();
    expect(uno.video.locucion.estado).toBe("lista");
  });

  it("v2 pide `timestamps` y, si Kie trae los tiempos, se usan sin llamar a Gemini", async () => {
    const esperadas = palabrasDe(textoDeLocucion(ejemplo()));
    const { llamadas, gemini } = kie({ resultado: { words: esperadas.map((w, n) => ({ text: w, start: n * 0.32, end: n * 0.32 + 0.3 })) } });
    env.GOOGLE_AI_KEY = "g-secreta";
    kitConVoz({ voz: "hpp4J3VqNfWAUOO0d1Us", modelo: "v2" });
    const v = await videoAprobado();
    const { trabajoId } = await (await pedir(`/videos/bc/${v.id}/locucion`, { method: "POST", body: { version: v.version, confirmado: true } })).json();
    await hastaElFinal(trabajoId);
    const cuerpo = JSON.parse(llamadas.find((l) => l.url.endsWith("/createTask")).init.body);
    expect(cuerpo.model).toBe("elevenlabs/text-to-speech-multilingual-v2");
    // v2 también por el id (Kie lo pide así) y SIN language_code (v2 no lo admite).
    expect(cuerpo.input).toMatchObject({ voice: "hpp4J3VqNfWAUOO0d1Us", timestamps: true });
    expect(cuerpo.input).not.toHaveProperty("language_code");
    expect(cuerpo.input.text).not.toMatch(/\[/);
    expect(gemini).toHaveLength(0);
    const loc = JSON.parse(video(v.id).locucion);
    expect(loc.fuente).toBe("motor");
    expect(loc.palabras).toHaveLength(esperadas.length);
  });

  it("sin tiempos y sin Gemini, los estima sobre la duración real del MP3", async () => {
    kie();
    kitConVoz({ voz: "hpp4J3VqNfWAUOO0d1Us", modelo: "v3" });
    const v = await videoAprobado();
    const { trabajoId } = await (await pedir(`/videos/bc/${v.id}/locucion`, { method: "POST", body: { version: v.version, confirmado: true } })).json();
    const fin = await hastaElFinal(trabajoId);
    expect(fin.nota).toMatch(/estimados/);
    const loc = JSON.parse(video(v.id).locucion);
    expect(loc.fuente).toBe("estimado");
    expect(loc.palabras.at(-1).hasta).toBeLessThanOrEqual(loc.duracion);
    expect(loc.palabras.at(-1).hasta).toBeGreaterThan(loc.duracion * 0.9);
  });

  it("si el guion cambió mientras se generaba, la toma se guarda pero el video no pasa a «Con voz»", async () => {
    kie();
    kitConVoz({ voz: "hpp4J3VqNfWAUOO0d1Us", modelo: "v3" });
    const v = await videoAprobado();
    const { trabajoId } = await (await pedir(`/videos/bc/${v.id}/locucion`, { method: "POST", body: { version: v.version, confirmado: true } })).json();
    const g = ejemplo();
    g.escenas[0].habla = "Otra frase distinta para el gancho.";
    expect((await pedir(`/videos/bc/${v.id}`, { method: "PUT", body: { version: v.version, guion: g } })).status).toBe(200);
    await hastaElFinal(trabajoId);
    const fila = video(v.id);
    expect(fila.estado).toBe("borrador");
    expect(JSON.parse(fila.locucion)).toMatchObject({ estado: "lista", desfasada: true });
  });

  it("si Kie falla, el video dice que la voz falló y por qué", async () => {
    kie({ estados: ["fail"] });
    kitConVoz({ voz: "hpp4J3VqNfWAUOO0d1Us", modelo: "v3" });
    const v = await videoAprobado();
    const { trabajoId } = await (await pedir(`/videos/bc/${v.id}/locucion`, { method: "POST", body: { version: v.version, confirmado: true } })).json();
    expect((await hastaElFinal(trabajoId)).estado).toBe("fallido");
    const uno = await (await pedir(`/videos/bc/${v.id}`)).json();
    expect(uno.video.locucion).toMatchObject({ estado: "fallida" });
    expect(uno.video.locucion.error).toMatch(/Kie\.ai no pudo/);
  });
});

describe("el asistente y Claude (MCP)", () => {
  const herramientas = () => crearHerramientasEstudio({
    env, acceso: crearAcceso(db, JEFE), usuario: { id: JEFE }, por: null, origen: "asistente",
    resolverCliente: async () => db.sqlite.prepare("select * from clients where id = 'bc'").get(),
  });

  it("las tres están declaradas, y en el MCP las que gastan van como escritura", () => {
    const nombres = DEFINICIONES_ESTUDIO.map((d) => d.name);
    expect(nombres).toEqual(expect.arrayContaining(["listar_voces", "previsualizar_voz", "generar_locucion"]));
    const mcp = Object.fromEntries(HERRAMIENTAS_MCP.map((h) => [h.name, h.annotations]));
    expect(mcp.listar_voces.readOnlyHint).toBe(true);
    expect(mcp.previsualizar_voz.readOnlyHint).toBe(false);
    expect(mcp.generar_locucion.readOnlyHint).toBe(false);
  });

  it("generar_locucion sin confirmar devuelve la cifra y la orden de preguntar; con confirmado=true, crea el pedido", async () => {
    kie();
    kitConVoz({ voz: "hpp4J3VqNfWAUOO0d1Us", modelo: "v3" });
    const v = await videoAprobado();
    const h = herramientas();
    const sin = await h.generar_locucion({ video_id: v.id });
    expect(sin).toMatch(/^NO SE CREÓ NADA\./);
    expect(sin).toMatch(/≈ 0,\d+ \$/);
    expect(sin).toMatch(/confirmado=true/);
    expect(trabajos()).toHaveLength(0);
    expect(await h.generar_locucion({ video_id: v.id, confirmado: "sí" })).toMatch(/^NO SE CREÓ NADA/);

    const con = await h.generar_locucion({ video_id: v.id, confirmado: true });
    expect(con.texto).toMatch(/^Pedido creado: /);
    // La vista previa del chat de Claude: el hueco de la toma, que se pone al día sola hasta que suena.
    expect(con.imagenes).toEqual([]);
    expect(con.vista).toMatchObject({ tipo: "medios", estado: "en_marcha", seguir: { herramienta: "vista_trabajo" } });
    expect(con.vista.audios[0]).toMatchObject({ estado: "en_marcha", url: null });
    expect(trabajos()).toHaveLength(1);
    expect(trabajos()[0]).toMatchObject({ tipo: "audio", origen: "asistente" });
  });

  it("una locución SUELTA (sin video): se confirma, queda en la galería con el tiempo de cada palabra y tiempos_locucion los da", async () => {
    kie();
    kitConVoz({ voz: "hpp4J3VqNfWAUOO0d1Us", modelo: "v3" });
    const h = herramientas();
    await expect(h.generar_locucion({})).rejects.toThrow(/video_id .* «texto»/);
    const sin = await h.generar_locucion({ texto: "Hola mamá, las toallitas Dany Baby cuidan su piel.", titulo: "Voz wipes" });
    expect(sin).toMatch(/^NO SE CREÓ NADA\./);
    expect(trabajos()).toHaveLength(0);
    const con = await h.generar_locucion({ texto: "Hola mamá, las toallitas Dany Baby cuidan su piel.", titulo: "Voz wipes", confirmado: true });
    expect(con.texto).toMatch(/locución suelta «Voz wipes»/);
    const t = trabajos()[0];
    expect(JSON.parse(t.ajustes).para).toBe("suelta");
    const fin = await hastaElFinal(t.id);
    expect(fin.estado).toBe("hecho");
    const archivo = db.sqlite.prepare("select * from estudio_archivos where trabajo_id = ?").get(t.id);
    expect(archivo).toMatchObject({ tipo: "audio", prompt: "Voz wipes" });
    const aj = JSON.parse(archivo.ajustes);
    expect(aj.palabras.map((p) => p.texto)).toEqual(palabrasDe("Hola mamá, las toallitas Dany Baby cuidan su piel."));
    expect(aj.palabras.every((p) => p.hasta >= p.desde)).toBe(true);
    const tiempos = await h.tiempos_locucion({ archivo_id: archivo.id });
    expect(tiempos).toMatch(/Tiempos de la locución «Voz wipes»/);
    expect(tiempos).toMatch(/1\. Hola \d+\.\d\d–\d+\.\d\d/);
    expect(tiempos.split("\n")).toHaveLength(1 + 9);
  });

  it("tiempos_locucion de un video: por escena, en segundos del VIDEO; sin voz lista, lo dice", async () => {
    kie();
    kitConVoz({ voz: "hpp4J3VqNfWAUOO0d1Us", modelo: "v3" });
    const v = await videoAprobado();
    const h = herramientas();
    expect(await h.tiempos_locucion({ video_id: v.id })).toMatch(/todavía no tiene su locución lista/);
    const { trabajoId } = await (await pedir(`/videos/bc/${v.id}/locucion`, { method: "POST", body: { version: v.version, confirmado: true } })).json();
    await hastaElFinal(trabajoId);
    const t = await h.tiempos_locucion({ video_id: v.id });
    expect(t).toMatch(/en segundos DEL VIDEO/);
    expect(t).toMatch(/^Escena 1 \(/m);
    const loc = JSON.parse(video(v.id).locucion);
    const linea = lineaDeTiempo(ejemplo(), loc.palabras);
    expect(t).toContain(`${linea.escenas[0].palabras[0].texto} ${linea.escenas[0].palabras[0].desde.toFixed(2)}`);
  });

  it("listar_voces no gasta; previsualizar_voz se confirma y, hecha, da dónde oírla", async () => {
    const { llamadas } = kie();
    const h = herramientas();
    expect(await h.listar_voces({})).toMatch(/Bella/);
    expect(await h.previsualizar_voz({ voz: "hpp4J3VqNfWAUOO0d1Us" })).toMatch(/^NO SE CREÓ NADA/);
    expect(llamadas).toHaveLength(0);
    env.MEDIA.objetos.set("voces/elevenlabs/v3/hpp4J3VqNfWAUOO0d1Us.mp3", { bytes: mp3(1), tipo: "audio/mpeg" });
    const hecha = await h.previsualizar_voz({ voz: "hpp4J3VqNfWAUOO0d1Us" });
    expect(hecha.texto).toMatch(/ya está hecha: se oye en \/api\/videos\/bc\/voces\/muestra\?modelo=v3/);
    // Y su dirección firmada (para oírla fuera de la aplicación), la misma que reproduce la vista previa del chat.
    expect(hecha.vista.audios[0]).toMatchObject({ estado: "lista", ref: "muestra:v3:hpp4J3VqNfWAUOO0d1Us:", url: expect.stringMatching(/^\/api\/vista-medio\/[^/]+\/hpp4J3VqNfWAUOO0d1Us\.mp3$/) });
    expect(hecha.texto).toContain(hecha.vista.audios[0].url);
    expect(await h.previsualizar_voz({ voz: "hpp4J3VqNfWAUOO0d1Us", texto: "[cálida] Hola, mamá." })).toMatch(/^NO SE CREÓ NADA.*\(20 caracteres\)/);
    await expect(h.generar_locucion({ video_id: "no-existe", confirmado: true })).rejects.toThrow(/No encontré el video/);
  });
});

describe("lo que no se ve", () => {
  it("el análisis de video de siempre sigue rechazando un audio: sólo la locución lo pide expresamente", async () => {
    env.GOOGLE_AI_KEY = "g-secreta";
    const { llamadas } = kie();
    await expect(verVideo(env, null, { bytes: mp3(1), mime: "audio/mpeg", prompt: "x" })).rejects.toThrow(/no es un video/);
    expect(llamadas).toHaveLength(0);
  });

  it("el audio se reconoce por sus bytes", () => {
    expect(tipoPorBytes(mp3(1))).toBe("audio/mpeg");
    expect(tipoPorBytes(new Uint8Array([0xff, 0xfb, 0x90, 0x44, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("audio/mpeg");
    const wav = new Uint8Array(44);
    wav.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
    wav.set([..."WAVE"].map((c) => c.charCodeAt(0)), 8);
    expect(tipoPorBytes(wav)).toBe("audio/wav");
  });

  it("el kit guarda la voz de la marca y «Volver a preparar» no se la lleva", () => {
    const kit = limpiarKit({ locucion: { voz: "hpp4J3VqNfWAUOO0d1Us", modelo: "v2", voces: [{ id: "JuanVozPropia2026", nombre: "Juan", genero: "masculina" }] } });
    expect(kit.locucion).toMatchObject({ voz: "hpp4J3VqNfWAUOO0d1Us", modelo: "v2" });
    expect(kit.locucion.voces[0]).toMatchObject({ id: "JuanVozPropia2026", nombre: "Juan", propia: true });
    expect(fundirKit(kit, limpiarKit({})).locucion).toEqual(kit.locucion);
    expect(limpiarKit({ locucion: { modelo: "v9" } }).locucion.modelo).toBe("v4");
  });
});

// ------------------------------------------------------------
// Con la LLAVE OFICIAL de ElevenLabs: la voz sale directo (sin Kie), con las voces de la cuenta
// ------------------------------------------------------------
const ELEVEN = "https://api.elevenlabs.io";

/** Una alineación por carácter como la de ElevenLabs para `texto` (0,05 s por carácter). */
const alineacion = (texto) => {
  const chars = [...texto];
  return { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.05), character_end_times_seconds: chars.map((_, i) => i * 0.05 + 0.04) };
};

/** ElevenLabs de mentira. `voces`: lo que da /v1/voices (null = la llave no deja leerlas); `rechazos`: estados por llamada de voz. */
function elevenlabs({ voces = [{ voice_id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", labels: { gender: "female", accent: "american", descriptive: "warm" } },
  { voice_id: "VaLeNtInA1234567890a", name: "Valentina", category: "professional", labels: { gender: "female", accent: "latin american", language: "es" } }],
rechazos = [], modelos = null, biblioteca = [] } = {}) {
  const llamadas = [];
  let n = 0;
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    llamadas.push({ url: u, init, cuerpo: init.body ? JSON.parse(init.body) : null });
    if (u.startsWith(API)) throw new Error("Kie no se debe llamar con la llave oficial");
    if (u === `${ELEVEN}/v1/voices`) return voces ? json({ voices: voces }) : json({ detail: { status: "missing_permissions", message: "voices_read" } }, 401);
    // `modelos`: los model_id de la cuenta (null = /v1/models no contesta: no se sabe).
    if (u === `${ELEVEN}/v1/models`) {
      return modelos ? json(modelos.map((m) => (typeof m === "string" ? { model_id: m, can_do_text_to_speech: true } : m))) : json({ detail: "no" }, 404);
    }
    if (u.startsWith(`${ELEVEN}/v1/shared-voices?`)) return json({ voices: biblioteca, has_more: false });
    if (u.startsWith(`${ELEVEN}/v1/voices/add/`)) return json({ voice_id: u.split("/").pop() });
    if (u.startsWith("https://storage.googleapis.com/")) return new Response(mp3(1), { status: 200, headers: { "content-type": "audio/mpeg" } });
    if (u.startsWith(`${ELEVEN}/v1/text-to-speech/`)) {
      const r = rechazos[n++];
      if (r) return json(r.cuerpo, r.estado);
      const cuerpo = JSON.parse(init.body);
      if (u.includes("/with-timestamps")) {
        return json({ audio_base64: Buffer.from(mp3(3)).toString("base64"), alignment: alineacion(cuerpo.text), normalized_alignment: alineacion(cuerpo.text) });
      }
      const b = mp3(3);
      return new Response(b, { status: 200, headers: { "content-type": "audio/mpeg" } });
    }
    if (u.startsWith(GOOGLE)) throw new Error("Gemini no hace falta: ElevenLabs da los tiempos");
    return new Response("{}", { status: 404 });
  });
  return { llamadas, voz: () => llamadas.filter((l) => l.url.includes("/text-to-speech/")) };
}

describe("con la llave oficial de ElevenLabs", () => {
  beforeEach(() => { env.ELEVENLABS_API_KEY = "el-secreta"; olvidarModelos(); });

  it("la lista sale de la CUENTA (también una voz que Kie no tiene), por la llave oficial y sin tocar Kie", async () => {
    const { llamadas } = elevenlabs();
    const r = await (await pedir("/videos/bc/voces")).json();
    expect(r).toMatchObject({ via: "elevenlabs", unidad: "créditos de ElevenLabs" });
    // Las nativas en español primero, y lo que dice ElevenLabs, en español.
    expect(r.voces.map((v) => v.nombre)).toEqual(["Valentina", "Matilda"]);
    expect(r.voces[0]).toMatchObject({ id: "VaLeNtInA1234567890a", genero: "femenina", espanol: true, nota: expect.stringContaining("acento latinoamericano") });
    expect(r.voces[1]).toMatchObject({ espanol: false, nota: "acento estadounidense, cálida" });
    expect(r.espanol).toBe(1);
    expect(llamadas[0].init.headers["xi-api-key"]).toBe("el-secreta");
    expect(JSON.stringify(r)).not.toContain("el-secreta");
  });

  it("si la llave no deja leer las voces, valen las de serie de ElevenLabs", async () => {
    elevenlabs({ voces: null });
    const r = await (await pedir("/videos/bc/voces")).json();
    expect(r.via).toBe("elevenlabs");
    expect(r.voces.map((v) => v.nombre)).toContain("Matilda");
  });

  it("la muestra: 409 con los créditos de ElevenLabs; con «sí», ElevenLabs v3 en español, con tiempos, sin Kie ni Gemini", async () => {
    const { voz } = elevenlabs();
    const TEXTO = "[preocupada] ¿Las toallitas le dejan la piel roja a tu bebé? [pause] Muchas traen alcohol y perfume que irritan.";
    const sin = await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "VaLeNtInA1234567890a", texto: TEXTO } });
    expect(sin.status).toBe(409);
    const precio = await sin.json();
    expect(precio).toMatchObject({ codigo: "confirmar", creditos: TEXTO.length, unidad: "créditos de ElevenLabs" });
    expect(precio.error).toMatch(/aproximadamente/);
    expect(voz()).toHaveLength(0);
    expect(trabajos()).toHaveLength(0);

    const r = await (await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "VaLeNtInA1234567890a", texto: TEXTO, confirmado: true } })).json();
    expect(trabajos()[0]).toMatchObject({ motor: "elevenlabs", modelo: "elevenlabs-v3", tipo: "audio" });
    const fin = await hastaElFinal(r.trabajoId);
    expect(fin.estado).toBe("hecho");
    expect(voz()).toHaveLength(1);
    expect(voz()[0].url).toBe(`${ELEVEN}/v1/text-to-speech/VaLeNtInA1234567890a/with-timestamps?output_format=mp3_44100_128`);
    expect(voz()[0].cuerpo).toMatchObject({ text: TEXTO, model_id: "eleven_v3", language_code: "es", voice_settings: { stability: 0.5 } });
    expect(fin.nota).toMatch(/ElevenLabs devolvió el tiempo de cada palabra/);
    expect(env.MEDIA.objetos.has(`voces/elevenlabs/v3/VaLeNtInA1234567890a-${r.huella}.mp3`)).toBe(true);
    // Lo pendiente (la toma y su alineación) se borra al entregarla.
    expect([...env.MEDIA.objetos.keys()].some((k) => k.startsWith("voces/pendientes/"))).toBe(false);
    // Se oye aunque la voz no esté en la lista de Kie.
    const oir = await pedir(`/videos/bc/voces/muestra?modelo=v3&voz=VaLeNtInA1234567890a&huella=${r.huella}`);
    expect(oir.status).toBe(200);
    expect(db.sqlite.prepare("select proveedor from consumo_ia").all()).toEqual([{ proveedor: "elevenlabs" }]);
  });

  it("si ElevenLabs no acepta forzar el español, repite sin language_code y la nota lo dice", async () => {
    const { voz } = elevenlabs({ rechazos: [{ estado: 400, cuerpo: { detail: { status: "unsupported_language", message: "language_code is not supported for this model" } } }] });
    const { trabajoId } = await (await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "XrExE9yKIg1WjnnlVkGX", texto: "Hola, mamá.", confirmado: true } })).json();
    const fin = await hastaElFinal(trabajoId);
    expect(fin.estado).toBe("hecho");
    expect(voz().map((l) => l.cuerpo.language_code)).toEqual(["es", undefined]);
    expect(fin.nota).toMatch(/sin language_code/);
  });

  it("la locución con v2: sin language_code, los tiempos del motor (sin Gemini) y el video a «Con voz»", async () => {
    const { voz } = elevenlabs();
    kitConVoz({ voz: "XrExE9yKIg1WjnnlVkGX", modelo: "v2" });
    const v = await videoAprobado();
    const sin = await pedir(`/videos/bc/${v.id}/locucion`, { method: "POST", body: { version: v.version } });
    expect(sin.status).toBe(409);
    expect(await sin.json()).toMatchObject({ unidad: "créditos de ElevenLabs" });
    const { trabajoId } = await (await pedir(`/videos/bc/${v.id}/locucion`, { method: "POST", body: { version: v.version, confirmado: true } })).json();
    const fin = await hastaElFinal(trabajoId);
    expect(fin.estado).toBe("hecho");
    expect(voz()[0].cuerpo.model_id).toBe("eleven_multilingual_v2");
    expect(voz()[0].cuerpo).not.toHaveProperty("language_code");
    expect(voz()[0].cuerpo.text).not.toMatch(/\[/);
    const loc = JSON.parse(video(v.id).locucion);
    expect(loc).toMatchObject({ estado: "lista", fuente: "motor" });
    expect(loc.palabras).toHaveLength(palabrasDe(textoDeLocucion(ejemplo())).length);
    expect(video(v.id).estado).toBe("con_voz");
  });

  it("una llave que ElevenLabs no acepta o una cuenta sin créditos terminan con su motivo, sin la llave en el texto", async () => {
    for (const [estado, cuerpo, frase] of [
      [401, { detail: { status: "invalid_api_key", message: "Invalid API key" } }, /no aceptó la llave/],
      [401, { detail: { status: "quota_exceeded", message: "This request exceeds your quota" } }, /no tiene créditos suficientes/],
    ]) {
      db.sqlite.prepare("delete from estudio_trabajos").run();
      elevenlabs({ rechazos: [{ estado, cuerpo }] });
      const { trabajoId } = await (await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "XrExE9yKIg1WjnnlVkGX", texto: `Hola ${estado} ${frase}`, confirmado: true } })).json();
      const fin = await hastaElFinal(trabajoId, 3);
      expect(fin.estado).toBe("fallido");
      expect(fin.error).toMatch(frase);
      expect(fin.error).not.toContain("el-secreta");
    }
  });

  it("sin ninguna de las dos llaves, 503 sin llamar a nadie", async () => {
    const { llamadas } = elevenlabs();
    delete env.ELEVENLABS_API_KEY;
    delete env.KIE_API_KEY;
    const r = await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v3", voz: "hpp4J3VqNfWAUOO0d1Us", confirmado: true } });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/ELEVENLABS_API_KEY/);
    expect(llamadas).toHaveLength(0);
  });
});

// ------------------------------------------------------------
// Eleven v4 y las voces en ESPAÑOL (biblioteca, muestra gratis, voz de la marca)
// ------------------------------------------------------------
const PREVIA = "https://storage.googleapis.com/eleven-public-prod/voces/lucia/muestra.mp3";
const LUCIA = {
  voice_id: "LuCiAvozEspanol12345", public_owner_id: "duenoPublico987654", name: "Lucía - cálida y cercana", language: "es",
  accent: "latin american", gender: "female", descriptive: "warm", use_case: "advertisement", preview_url: PREVIA, cloned_by_count: 1200,
};

describe("Eleven v4 y las voces en español", () => {
  beforeEach(() => { env.ELEVENLABS_API_KEY = "el-secreta"; olvidarModelos(); });

  it("si la cuenta tiene v4, es el de partida: la muestra sale con eleven_v4 en español y su costo con el factor de la cuenta", async () => {
    const { voz, llamadas } = elevenlabs({ modelos: [{ model_id: "eleven_v4", model_rates: { character_cost_multiplier: 1 } }, "eleven_v3", "eleven_multilingual_v2"] });
    const l = await (await pedir("/videos/bc/voces")).json();
    expect(l.modelos.map((m) => m.clave)).toEqual(["v4", "v3", "v2"]);
    expect(l.modelo).toBe("v4");
    // /v1/models se recuerda: la lista y el pedido no lo preguntan dos veces.
    const sin = await (await pedir("/videos/bc/voces/muestra", { method: "POST", body: { voz: "VaLeNtInA1234567890a" } })).json();
    expect(sin).toMatchObject({ codigo: "confirmar", modelo: "v4", unidad: "créditos de ElevenLabs" });
    expect(sin.error).toMatch(/ElevenLabs v4/);
    const { trabajoId } = await (await pedir("/videos/bc/voces/muestra", { method: "POST", body: { voz: "VaLeNtInA1234567890a", confirmado: true } })).json();
    expect(trabajos()[0]).toMatchObject({ motor: "elevenlabs", modelo: "elevenlabs-v4" });
    const fin = await hastaElFinal(trabajoId);
    expect(fin.estado).toBe("hecho");
    expect(voz()[0].cuerpo).toMatchObject({ model_id: "eleven_v4", language_code: "es" });
    expect(env.MEDIA.objetos.has("voces/elevenlabs/v4/VaLeNtInA1234567890a.mp3")).toBe(true);
    expect(llamadas.filter((x) => x.url.endsWith("/v1/models"))).toHaveLength(1);
  });

  it("si la cuenta NO tiene v4, no se ofrece y quien lo pide sale con v3; por Kie, v4 tampoco existe", async () => {
    elevenlabs({ modelos: ["eleven_v3", "eleven_multilingual_v2"] });
    const l = await (await pedir("/videos/bc/voces")).json();
    expect(l.modelos.map((m) => m.clave)).toEqual(["v3", "v2"]);
    expect(l.modelo).toBe("v3");
    const sin = await (await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v4", voz: "VaLeNtInA1234567890a" } })).json();
    expect(sin).toMatchObject({ codigo: "confirmar", modelo: "v3" });

    delete env.ELEVENLABS_API_KEY;
    kie();
    const k = await (await pedir("/videos/bc/voces")).json();
    expect(k.modelos.map((m) => m.clave)).toEqual(["v3", "v2"]);
    const m = await (await pedir("/videos/bc/voces/muestra", { method: "POST", body: { modelo: "v4", voz: "hpp4J3VqNfWAUOO0d1Us" } })).json();
    expect(m).toMatchObject({ codigo: "confirmar", modelo: "v3" });
  });

  it("la biblioteca: sólo voces en español y sin tarifa propia, todo en español, gratis y sin la llave en la respuesta", async () => {
    const { llamadas } = elevenlabs({ biblioteca: [LUCIA, { voice_id: "sinDuenoValido123456", name: "X" }] });
    const r = await (await pedir("/videos/bc/voces/biblioteca?q=c%C3%A1lida&genero=female&acento=mexican")).json();
    const pedido = new URL(llamadas.find((x) => x.url.includes("/v1/shared-voices")).url);
    expect(Object.fromEntries(pedido.searchParams)).toMatchObject({ language: "es", include_custom_rates: "false", search: "cálida", gender: "female", accent: "mexican" });
    expect(r.voces).toHaveLength(1);
    expect(r.voces[0]).toMatchObject({ id: "LuCiAvozEspanol12345", nombre: "Lucía", espanol: true, publico: "duenoPublico987654", usos: 1200 });
    expect(r.voces[0].nota).toMatch(/acento latinoamericano.*cálida y cercana.*cálida.*publicidad/);
    expect(r.acentos).toMatchObject({ "latin american": "Latinoamericano" });
    expect(JSON.stringify(r)).not.toContain("el-secreta");
    expect(trabajos()).toHaveLength(0);
    // Un acento que no está en la lista no se manda.
    await pedir("/videos/bc/voces/biblioteca?acento=klingon");
    expect(new URL(llamadas.filter((x) => x.url.includes("/v1/shared-voices")).at(-1).url).searchParams.has("accent")).toBe(false);
  });

  it("añadir una voz de la biblioteca: sólo administración, con su nombre; sin la llave oficial, 409", async () => {
    const { llamadas } = elevenlabs();
    const r = await pedir("/videos/bc/voces/biblioteca", { method: "POST", body: { publico: "duenoPublico987654", voz: "LuCiAvozEspanol12345", nombre: "Lucía" } });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ voz: "LuCiAvozEspanol12345" });
    const add = llamadas.find((x) => x.url.includes("/v1/voices/add/"));
    expect(add.url).toBe(`${ELEVEN}/v1/voices/add/duenoPublico987654/LuCiAvozEspanol12345`);
    expect(add.cuerpo).toEqual({ new_name: "Lucía" });
    // Un id raro no sale hacia ElevenLabs.
    expect((await pedir("/videos/bc/voces/biblioteca", { method: "POST", body: { publico: "../x", voz: "LuCiAvozEspanol12345" } })).status).toBe(400);
    // Un editor no ocupa huecos de la cuenta.
    db.sqlite.prepare("update memberships set rol = 'editor' where user_id = ?").run(JEFE);
    expect((await pedir("/videos/bc/voces/biblioteca", { method: "POST", body: { publico: "duenoPublico987654", voz: "LuCiAvozEspanol12345" } })).status).toBe(403);
    delete env.ELEVENLABS_API_KEY;
    expect((await pedir("/videos/bc/voces/biblioteca")).status).toBe(409);
  });

  it("la muestra GRATIS de ElevenLabs se sirve desde aquí, sólo de sus almacenes", async () => {
    const { llamadas } = elevenlabs();
    const ok = await pedir(`/videos/bc/voces/previa?u=${encodeURIComponent(PREVIA)}`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("audio/mpeg");
    // La muestra pública se pide SIN la llave.
    expect(llamadas.find((x) => x.url === PREVIA).init.headers?.["xi-api-key"]).toBeUndefined();
    for (const u of ["https://malo.example/x.mp3", "http://storage.googleapis.com/x.mp3", "javascript:alert(1)"]) {
      expect((await pedir(`/videos/bc/voces/previa?u=${encodeURIComponent(u)}`)).status).toBe(400);
    }
    expect(trabajos()).toHaveLength(0);
  });

  it("fijar la voz de la marca guarda sólo eso en el kit guardado; una voz que no es de la cuenta, 404", async () => {
    elevenlabs({ modelos: ["eleven_v4", "eleven_v3"] });
    db.sqlite.prepare("update clients set kit_marca = ? where id = 'bc'").run(JSON.stringify({ reglas: ["El logo abajo"], locucion: { voz: "", modelo: "v3" } }));
    const r = await pedir("/videos/bc/voces/marca", { method: "PUT", body: { voz: "VaLeNtInA1234567890a", modelo: "v4" } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ voz: { id: "VaLeNtInA1234567890a", nombre: "Valentina" }, modelo: "v4" });
    const kit = JSON.parse(db.sqlite.prepare("select kit_marca from clients where id = 'bc'").get().kit_marca);
    expect(kit.locucion).toMatchObject({ voz: "VaLeNtInA1234567890a", modelo: "v4" });
    expect(kit.reglas).toEqual(["El logo abajo"]);
    const l = await (await pedir("/videos/bc/voces")).json();
    expect(l.voces.find((v) => v.escogida)?.nombre).toBe("Valentina");
    expect((await pedir("/videos/bc/voces/marca", { method: "PUT", body: { voz: "NoEstaEnLaCuenta1234" } })).status).toBe(404);
  });
});
