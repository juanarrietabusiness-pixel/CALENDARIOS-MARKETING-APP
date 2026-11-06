import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasEstudio } from "../../worker/lib/estudio/herramientas.js";
import { HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { palabrasDe } from "../../src/lib/videoEscenas.js";
import { lineasDeLetra } from "../../src/lib/videoCancion.js";
import { estiloDeGuion, MAX_ESTILOS_VIDEO } from "../../src/lib/estilosVideo.js";
import { fondosPendientes } from "../../src/lib/fondosVideo.js";

// ============================================================
// Los ESTILOS DE VIDEO guardados por las rutas de verdad (D1 en memoria, R2 de mentira) y por las herramientas de Claude:
//   · «Guardar como estilo» de un video: las reglas al kit del cliente (no la letra ni las imágenes); listar, cambiar el
//     nombre, quitar; con 8, 409; el PUT del kit (otra pestaña con el kit de antes) no se los lleva;
//   · aplicar uno a otro video: una versión nueva en borrador, sin tocar lo que se dice;
//   · «Video con canción» con un estilo: la prueba de sincronía y lo que diseña la IA salen en su forma, con una imagen de
//     fondo cada 2 líneas aunque no se marcara «con fondos», y el video recuerda con qué estilo se hizo;
//   · estilos_video, guardar_estilo_video, aplicar_estilo_video y crear_video con estilo_id.
// ============================================================

const JEFE = "u-jefe";
const OTRO = "u-otro";
const TESTIGO = "t-jefe";
const EL = "https://api.elevenlabs.io";
let db;
let env;
let llamadas;

const LETRA = `Hoy canto sin miedo lo que llevo dentro
mi voz se levanta aunque el mundo no quiera
camino seguro por la luz que me guía
no cambio mi nombre por una promesa`;
const LINEAS = lineasDeLetra(LETRA);
const PALABRAS = palabrasDe(LINEAS.join(" "));

/** Un guion «diseñado»: texto gigante palabra por palabra, un fondo cada 2 escenas y cierre negro con el logo pequeño. */
function disenado() {
  return {
    version: 1, titulo: "Lyric de prueba", formatos: ["9:16"],
    estilo: { grano: 0.55, ritmo: "rapido", ilustracion: "poster" },
    subtitulos: { activo: false },
    escenas: [
      ...LINEAS.map((habla, i) => ({
        id: `s${i + 1}`, tipo: "explicacion", habla, pantalla: habla.slice(0, 20),
        fondo: { tipo: "plano", color: "fondo" },
        transicion: i % 2 === 1 ? { tipo: "corte", dur: 0.2 } : { tipo: i === 2 ? "barrido" : "corte", dur: 0.35 },
        capas: [
          { id: "fondo", tipo: "imagen", archivo: `f${Math.floor(i / 2) + 1}`, encuadre: "completo", recorte: "cubrir", movimiento: "acercar", oscurecer: 0.5, tratamiento: "byn" },
          { id: "t1", tipo: "texto", rol: "gigante", mayusculas: true, porPalabra: true, pulso: true, color: "claro", animacion: { entrada: "golpe" }, texto: habla.toUpperCase().split(" ").slice(0, 4).join(" ") },
        ],
      })),
      { id: "cierre", tipo: "cierre", habla: "", pausa: 2, fondo: { tipo: "plano", color: "#000000" }, capas: [{ id: "logo", tipo: "logo", pos: { x: 0.5, y: 0.5 }, tam: 0.2 }] },
    ],
  };
}
/** Uno «normal», como sale sin estilo: titulares con rebote y fundidos. */
function normal() {
  const g = disenado();
  g.titulo = "Otro video";
  g.estilo = { ritmo: "medio" };
  g.subtitulos = { activo: true };
  for (const s of g.escenas) {
    s.transicion = { tipo: "fundido", dur: 0.4 };
    s.capas = s.capas.filter((c) => c.encuadre !== "completo").map((c) => (c.tipo === "texto" ? { id: c.id, tipo: "texto", rol: "titular", texto: c.texto, animacion: { entrada: "rebote" } } : c));
  }
  g.escenas.at(-1).capas = [{ id: "logo", tipo: "logo", pos: "centro", tam: 0.5 }];
  g.escenas.at(-1).fondo = { tipo: "plano", color: "acento" };
  return g;
}

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
  sse("message_start", { message: { model: "x", usage: { input_tokens: 4000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 900 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

/** ElevenLabs (la letra se encuentra entera) y Anthropic de mentira (`ia`: sus respuestas, en orden). */
function servicios({ ia = [] } = {}) {
  llamadas = [];
  vi.stubGlobal("fetch", async (url, init = {}) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    if (u === `${EL}/v1/forced-alignment`) {
      return Response.json({ words: PALABRAS.map((t, i) => ({ text: t, start: +(1 + i * 0.5).toFixed(2), end: +(1 + i * 0.5 + 0.4).toFixed(2), loss: 0.1 })), loss: 0.1 });
    }
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) return flujo(ia.shift() ?? "");
    throw new Error(`fetch inesperado a ${u}`);
  });
}

const pedir = (ruta, { method = "POST", body } = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  method, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
}), env);
const kit = (cliente = "bc") => JSON.parse(db.sqlite.prepare("select kit_marca from clients where id = ?").get(cliente).kit_marca || "{}");
const fila = (id) => db.sqlite.prepare("select * from videos_proyectos where id = ?").get(id);
const crear = async (guion, cliente = "bc") => (await (await pedir(`/videos/${cliente}`, { body: { guion } })).json()).video;
const conEstiloEnElKit = (para = "cancion") => {
  const e = estiloDeGuion(disenado(), { id: "ev-guardado01", nombre: "Lyric en blanco y negro", para });
  db.sqlite.prepare("update clients set kit_marca = ? where id = 'bc'").run(JSON.stringify({ estilosVideo: [e] }));
  return e;
};

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") }, ELEVENLABS_API_KEY: "el", ANTHROPIC_API_KEY: "k" };
  const s = db.sqlite;
  for (const [id, mail] of [[JEFE, "jefe@a.com"], [OTRO, "otro@a.com"]]) s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, mail, "x", "y");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRO, OTRO, "admin", "Otra agencia", "#FF0000");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("bc", JEFE, "57DMC");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("ajeno", OTRO, "De otro espacio");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)").run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo, prompt, ajustes, bytes, created_at) values (?,?,?,?,?,?,?,?,?,?,?)")
    .run("can1", JEFE, "bc", "clientes/bc/estudio/cancion.mp3", "audio", "audio/mpeg", "musica-subida", "La canción", "{}", 320000, "2026-10-01T00:00:00.000Z");
  env.MEDIA.objetos.set("clientes/bc/estudio/cancion.mp3", { bytes: mp3(20), tipo: "audio/mpeg" });
}, 30_000);
afterEach(() => { vi.unstubAllGlobals(); });

describe("guardar un video como estilo", () => {
  it("las reglas pasan al kit del cliente (sin la letra ni las imágenes); se listan, se renombran y se quitan", async () => {
    const v = await crear(disenado());
    const res = await pedir(`/videos/bc/${v.id}/estilo`, { body: { nombre: "Lyric en blanco y negro", nota: "líneas doradas que tachan" } });
    expect(res.status).toBe(201);
    const { estilo } = await res.json();
    expect(estilo).toMatchObject({
      nombre: "Lyric en blanco y negro", para: "voz", nota: "líneas doradas que tachan",
      texto: { rol: "gigante", porPalabra: true, entrada: "golpe" }, fondo: { imagen: true, tratamiento: "byn", escenas: 2 },
      cierre: { color: "#000000", logo: { pos: { x: 0.5, y: 0.5 }, tam: 0.2 } }, de: { video: v.id, version: 1, titulo: "Lyric de prueba" },
    });
    expect(estilo.id).toMatch(/^ev-[a-z0-9]{12}$/);
    expect(estilo.resumen.join(" ")).toMatch(/Texto principal gigante/);
    expect(JSON.stringify(kit().estilosVideo)).not.toMatch(/canto sin miedo|"f1"/);
    expect(kit().estilosVideo).toHaveLength(1);

    // Otro con el mismo nombre: 409.
    expect((await pedir(`/videos/bc/${v.id}/estilo`, { body: { nombre: "lyric EN blanco y negro" } })).status).toBe(409);

    const lista = await (await pedir("/videos/bc/estilos", { method: "GET" })).json();
    expect(lista.estilos.map((e) => e.nombre)).toEqual(["Lyric en blanco y negro"]);
    expect(lista.estilos[0].resumen.length).toBeGreaterThan(3);

    const cambiado = await (await pedir(`/videos/bc/estilos/${estilo.id}`, { method: "PATCH", body: { nombre: "Lyric B/N", para: "cancion" } })).json();
    expect(cambiado.estilo).toMatchObject({ nombre: "Lyric B/N", para: "cancion", texto: estilo.texto });
    expect((await pedir("/videos/bc/estilos/ev-noexiste001", { method: "PATCH", body: { nombre: "X" } })).status).toBe(404);

    expect((await (await pedir(`/videos/bc/estilos/${estilo.id}`, { method: "DELETE" })).json()).estilos).toEqual([]);
    expect(kit().estilosVideo).toBeUndefined();
  });

  it("el PUT del kit (otra pestaña con el kit de antes) no se los lleva; con 8, 409", async () => {
    const v = await crear(disenado());
    await pedir(`/videos/bc/${v.id}/estilo`, { body: { nombre: "Uno" } });
    const put = await pedir("/estudio/bc/kit", { method: "PUT", body: { kit: { estilo: "editorial", estilosVideo: [] } } });
    expect(put.status).toBe(200);
    expect(kit()).toMatchObject({ estilo: "editorial" });
    expect(kit().estilosVideo.map((e) => e.nombre)).toEqual(["Uno"]);

    const ocho = Array.from({ length: MAX_ESTILOS_VIDEO }, (_, i) => estiloDeGuion(disenado(), { id: `ev-lleno${String(i).padStart(4, "0")}`, nombre: `E${i}` }));
    db.sqlite.prepare("update clients set kit_marca = ? where id = 'bc'").run(JSON.stringify({ estilosVideo: ocho }));
    const lleno = await pedir(`/videos/bc/${v.id}/estilo`, { body: { nombre: "Nueve" } });
    expect(lleno.status).toBe(409);
    expect((await lleno.json()).error).toMatch(/ya tiene 8 estilos/);
  });

  it("un video de otro espacio no se puede guardar ni aplicar", async () => {
    db.sqlite.prepare("insert into videos_proyectos (id, client_id, owner_id, titulo, estado, version, guion, locucion, render, origen, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("v-ajeno", "ajeno", OTRO, "Ajeno", "borrador", 1, JSON.stringify(disenado()), "{}", "{}", "{}", "2026-11-01", "2026-11-01");
    expect((await pedir("/videos/ajeno/v-ajeno/estilo", { body: { nombre: "X" } })).status).toBe(404);
    expect((await pedir("/videos/bc/v-ajeno/estilo", { body: { nombre: "X" } })).status).toBe(404);
  });
});

describe("aplicar un estilo a un video", () => {
  it("una versión nueva en borrador con la forma del estilo; lo que se dice no cambia; con la versión de antes, 409", async () => {
    const e = conEstiloEnElKit("todos");
    const v = await crear(normal());
    const res = await pedir(`/videos/bc/${v.id}/aplicar-estilo`, { body: { estiloId: e.id, version: 1 } });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.cambios).toBeGreaterThan(5);
    expect(r.video).toMatchObject({ version: 2, estado: "borrador" });
    const g = JSON.parse(fila(v.id).guion);
    expect(g.escenas.map((s) => s.habla)).toEqual(normal().escenas.map((s) => s.habla));
    expect(g.escenas[0].capas.find((c) => c.id === "t1")).toMatchObject({ rol: "gigante", mayusculas: true, porPalabra: true, animacion: { entrada: "golpe" } });
    expect(g.escenas.at(-1)).toMatchObject({ fondo: { color: "#000000" }, capas: [{ tipo: "logo", pos: { x: 0.5, y: 0.5 }, tam: 0.2 }] });
    expect(g.subtitulos.activo).toBe(false);
    expect((await pedir(`/videos/bc/${v.id}/aplicar-estilo`, { body: { estiloId: e.id, version: 1 } })).status).toBe(409);
    expect((await pedir(`/videos/bc/${v.id}/aplicar-estilo`, { body: { estiloId: "ev-noexiste001", version: 2 } })).status).toBe(404);
  });
});

describe("«Video con canción» con un estilo guardado", () => {
  async function sincronizada(ia = []) {
    servicios({ ia });
    return (await (await pedir("/videos/bc/cancion", { body: { musicaId: "can1", letra: LETRA, confirmado: true } })).json()).sincronia;
  }

  it("la prueba de sincronía sale en su forma (gratis) y el video recuerda el estilo", async () => {
    const e = conEstiloEnElKit();
    const s = await sincronizada();
    const res = await pedir("/videos/bc/cancion/video", { body: { huella: s.huella, modo: "karaoke", estiloId: e.id } });
    expect(res.status).toBe(201);
    const r = await res.json();
    expect(r.estilo).toEqual({ id: e.id, nombre: e.nombre });
    expect(JSON.parse(fila(r.video.id).origen)).toMatchObject({ tipo: "cancion", estiloId: e.id });
    const textos = r.video.guion.escenas.flatMap((x) => x.capas).filter((c) => c.tipo === "texto" && ["gigante", "titular"].includes(c.rol));
    expect(textos.length).toBeGreaterThan(0);
    expect(textos.every((c) => c.rol === "gigante" && c.mayusculas === true)).toBe(true);
    expect(llamadas.some((l) => l.url.includes("anthropic"))).toBe(false);
    // Un estilo que no es del cliente: 404 sin crear nada.
    expect((await pedir("/videos/bc/cancion/video", { body: { huella: s.huella, estiloId: "ev-noexiste001" } })).status).toBe(404);
  });

  it("lo que diseña la IA: el estilo va en el pedido, los fondos se piden aunque no se marcaran y van de 2 en 2", async () => {
    const e = conEstiloEnElKit();
    const libre = {
      version: 1, titulo: "La canción", formatos: ["9:16"],
      escenas: LINEAS.map((t, i) => ({
        id: `e${i}`, tipo: "explicacion", habla: t, pantalla: t.slice(0, 20),
        capas: [{ tipo: "imagen", id: "fondo", encuadre: "completo", pide: `una imagen distinta para la línea ${i}` }, { tipo: "texto", id: "t", texto: t.slice(0, 40), rol: "titular" }],
      })),
    };
    const s = await sincronizada([JSON.stringify(libre)]);
    const res = await pedir("/videos/bc/cancion/video", { body: { huella: s.huella, modo: "ia", estiloId: e.id } });
    expect(res.status).toBe(201);
    const r = await res.json();
    const pedido = llamadas.filter((l) => l.url.startsWith("https://api.anthropic.com/v1/messages")).map((l) => JSON.stringify(JSON.parse(l.init.body).messages[0].content))[0];
    expect(pedido).toMatch(/ESTILO GUARDADO DE ESTE CLIENTE: «Lyric en blanco y negro»/);
    expect(pedido).toMatch(/IMÁGENES DE FONDO/);
    expect(fondosPendientes(r.video.guion).map((f) => f.escenas.length)).toEqual([2, 2]);
    expect(r.fondos).toBe(2);
    expect(r.video.guion.escenas[0].capas.find((c) => c.id === "fondo")).toMatchObject({ tratamiento: "byn", oscurecer: 0.5 });
  });
});

describe("Claude y el asistente: los estilos", () => {
  const herramientas = () => crearHerramientasEstudio({
    env, acceso: crearAcceso(db, JEFE), resolverCliente: async () => db.sqlite.prepare("select * from clients where id = 'bc'").get(),
    usuario: { id: JEFE, nombre: "Juan" }, origen: "claude", por: { userId: JEFE, nombre: "Juan" },
  });

  it("están en el MCP: listar es de lectura, guardar y aplicar escriben; video_con_cancion y crear_video aceptan estilo_id", () => {
    const de = (n) => HERRAMIENTAS_MCP.find((x) => x.name === n);
    expect(de("estilos_video").annotations.readOnlyHint).toBe(true);
    expect(de("guardar_estilo_video").annotations.readOnlyHint).toBe(false);
    expect(de("aplicar_estilo_video").annotations.readOnlyHint).toBe(false);
    expect(de("video_con_cancion").inputSchema.properties.estilo_id).toBeTruthy();
    expect(de("crear_video").inputSchema.properties.estilo_id).toBeTruthy();
  });

  it("guardar, listar y crear un video con el estilo impuesto", async () => {
    const h = herramientas();
    expect(await h.estilos_video({})).toMatch(/no tiene estilos de video guardados/);
    const v = await crear(disenado());
    const g = await h.guardar_estilo_video({ video_id: v.id, nombre: "Lyric B/N", para: "todos" });
    expect(g).toMatch(/^Guardado el estilo «Lyric B\/N» \(ID ev-[a-z0-9]{12}\)/);
    const id = kit().estilosVideo[0].id;
    const lista = await h.estilos_video({});
    expect(lista).toMatch(new RegExp(`Lyric B/N — ID ${id}`));
    expect(lista).toMatch(/ESTILO GUARDADO DE ESTE CLIENTE/);

    const creado = await h.crear_video({ guion: normal(), estilo_id: id });
    expect(creado).toMatch(/Con el estilo guardado «Lyric B\/N»/);
    const nuevo = db.sqlite.prepare("select * from videos_proyectos where titulo = 'Otro video'").get();
    expect(JSON.parse(nuevo.origen).estiloId).toBe(id);
    expect(JSON.parse(nuevo.guion).escenas[0].capas.find((c) => c.id === "t1").rol).toBe("gigante");

    const otro = await crear({ ...normal(), titulo: "Tercero" });
    const ap = await h.aplicar_estilo_video({ video_id: otro.id, estilo_id: id, version: 1 });
    expect(ap).toMatch(/^Estilo aplicado: \d+ cambio\(s\) de forma\. Ahora es la versión 2/);
    await expect(h.aplicar_estilo_video({ video_id: otro.id, estilo_id: "ev-noexiste001", version: 2 })).rejects.toThrow(/no está guardado/);
  });
});
