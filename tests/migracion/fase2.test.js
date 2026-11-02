import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";

// ============================================================
// «¿Está listo este video?» y «Las piezas juntas» por las rutas de verdad
//
//   1. El video lo ve Gemini con el pedido de la revisión; la revisión queda en la ficha y la segunda vez no se paga.
//   2. Un video de otro cliente no se revisa; una imagen tampoco.
//   3. La hoja del mes va como UNA imagen a la IA con el kit, y la respuesta sólo trae números que existen.
//   4. Sin un JPEG de verdad, o con una sola pieza, no se llama a nadie.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;
let llamadas;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const o = objetos.get(clave);
      return { httpMetadata: { contentType: o.tipo }, size: o.bytes.byteLength, arrayBuffer: async () => o.bytes };
    },
    async head(clave) { return objetos.has(clave) ? { httpMetadata: { contentType: objetos.get(clave).tipo } } : null; },
    async put(clave, valor, op) {
      const bytes = valor instanceof ReadableStream ? new Uint8Array(await new Response(valor).arrayBuffer()) : new Uint8Array(valor);
      objetos.set(clave, { bytes, tipo: op?.httpMetadata?.contentType });
    },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, ...(opciones.body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: opciones.body === undefined || opciones.body instanceof FormData ? opciones.body : JSON.stringify(opciones.body),
  }), env);

const MP4 = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
const REVISION = {
  puntaje: 7, resumen: "Bien hecho, pero no dice qué hacer.",
  criterios: {
    gancho: { ok: true, nota: "Cae el jugo en el segundo 0" }, sinSonido: { ok: true, nota: "Se entiende" }, voz: { ok: null, nota: "Sin voz" },
    producto: { ok: true, nota: "" }, marca: { ok: true, nota: "Logo al final" }, cierre: { ok: false, nota: "Termina sin llamado" },
    defectos: { ok: true, nota: "" }, encuadre: { ok: true, nota: "" },
  },
  arreglos: ["Añade «Escríbenos» al final"],
};

function gemini(respuesta = REVISION) {
  llamadas = [];
  vi.stubGlobal("fetch", async (url, op = {}) => {
    const u = String(url);
    if (u.includes("/upload/v1beta/files")) return new Response("{}", { headers: { "x-goog-upload-url": "https://generativelanguage.googleapis.com/subida/1" } });
    if (u.endsWith("/subida/1")) return Response.json({ file: { name: "files/1", state: "ACTIVE", uri: "https://g/files/1", mimeType: "video/mp4" } });
    if (u.includes(":generateContent")) {
      llamadas.push(JSON.parse(op.body));
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(respuesta) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 } });
    }
    if (op.method === "DELETE") return new Response("{}");
    throw new Error(`fetch inesperado a ${u}`);
  });
}

function anthropic(texto) {
  llamadas = [];
  vi.stubGlobal("fetch", async (url, op = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) { llamadas.push(JSON.parse(op.body)); return flujo(texto); }
    throw new Error(`fetch inesperado a ${u}`);
  });
}

async function subirVideo(cliente = "c1") {
  const form = new FormData();
  form.set("archivo", new File([MP4], "reel.mp4", { type: "video/mp4" }));
  const r = await pedir(`/api/estudio/${cliente}/archivos`, { method: "POST", body: form });
  expect(r.status).toBe(201);
  return (await r.json()).archivo;
}

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", GOOGLE_AI_KEY: "g", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-otro", "otro@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, kit_marca) values (?,?,?,?)")
    .run("c1", JEFE, "Dcasa", JSON.stringify({ paleta: [{ hex: "#1B3246", nombre: "azul", rol: "dominante" }], estilo: "limpio y cálido" }));
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("ajeno", "u-otro", "De otra agencia");
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("¿Está listo este video?", () => {
  it("Gemini lo ve con el pedido de la revisión, el veredicto lo pone el código y la segunda vez no se paga", async () => {
    const archivo = await subirVideo();
    gemini();
    const r = await pedir("/api/estudio/c1/revisar-video", { method: "POST", body: { archivoId: archivo.id, idea: "El sofá como nuevo", formato: "reel" } });
    expect(r.status).toBe(200);
    const { revision, guardada } = await r.json();
    expect(guardada).toBe(false);
    expect(revision.veredicto).toBe("casi");
    expect(revision.criterios.find((c) => c.id === "cierre")).toMatchObject({ ok: false, nota: "Termina sin llamado" });
    expect(revision.criterios.find((c) => c.id === "voz").ok).toBeNull();
    const pedido = llamadas[0].contents[0].parts[1].text;
    expect(pedido).toContain("Revisa este video de Dcasa ANTES de publicarlo");
    expect(pedido).toContain("El sofá como nuevo");
    expect(llamadas[0].generationConfig.responseMimeType).toBe("application/json");
    expect(db.sqlite.prepare("select funcion from consumo_ia").all().map((x) => x.funcion)).toContain("revisión de video");

    const otra = await (await pedir("/api/estudio/c1/revisar-video", { method: "POST", body: { archivoId: archivo.id } })).json();
    expect(otra.guardada).toBe(true);
    expect(llamadas).toHaveLength(1);
    await pedir("/api/estudio/c1/revisar-video", { method: "POST", body: { archivoId: archivo.id, otraVez: true } });
    expect(llamadas).toHaveLength(2);
  });

  it("un no en el gancho deja el video «no listo» aunque el puntaje sea alto", async () => {
    const archivo = await subirVideo();
    gemini({ ...REVISION, puntaje: 9, criterios: { ...REVISION.criterios, gancho: { ok: false, nota: "Empieza con el logo" }, cierre: { ok: true, nota: "" } } });
    const { revision } = await (await pedir("/api/estudio/c1/revisar-video", { method: "POST", body: { archivoId: archivo.id } })).json();
    expect(revision.veredicto).toBe("no");
  });

  it("un video de otro cliente no se revisa, ni sin video", async () => {
    gemini();
    expect((await pedir("/api/estudio/c1/revisar-video", { method: "POST", body: { clave: "clientes/otro/estudio/x.mp4" } })).status).toBe(404);
    expect((await pedir("/api/estudio/c1/revisar-video", { method: "POST", body: {} })).status).toBe(400);
    expect((await pedir("/api/estudio/ajeno/revisar-video", { method: "POST", body: { clave: "clientes/ajeno/x.mp4" } })).status).toBe(404);
    expect(llamadas).toHaveLength(0);
  });
});

describe("Las piezas juntas", () => {
  const HOJA = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/";

  it("la hoja va como UNA imagen con el kit, y sólo vuelven números de la hoja", async () => {
    anthropic(JSON.stringify({ puntaje: 6, resumen: "Casi todas de la familia", comun: ["el azul"], fuera: [{ n: 3, motivo: "Fondo rosa", arreglo: "Fondo azul de la marca" }, { n: 9, motivo: "No existe" }] }));
    const r = await pedir("/api/estudio/c1/serie", { method: "POST", body: { imagen: HOJA, total: 4 } });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.puntaje).toBe(6);
    expect(d.fuera).toEqual([{ n: 3, motivo: "Fondo rosa", arreglo: "Fondo azul de la marca" }]);
    const contenido = llamadas[0].messages[0].content;
    expect(contenido.filter((b) => b.type === "image")).toHaveLength(1);
    const texto = contenido.find((b) => b.type === "text").text;
    expect(texto).toContain("las 4 piezas del mes de Dcasa");
    expect(texto).toContain("#1B3246");
    expect(db.sqlite.prepare("select funcion from consumo_ia").all().map((x) => x.funcion)).toContain("piezas juntas");
  });

  it("sin un JPEG de verdad o con una sola pieza no se llama a nadie", async () => {
    anthropic("{}");
    expect((await pedir("/api/estudio/c1/serie", { method: "POST", body: { imagen: "iVBORw0KGgo", total: 4 } })).status).toBe(400);
    expect((await pedir("/api/estudio/c1/serie", { method: "POST", body: { imagen: HOJA, total: 1 } })).status).toBe(400);
    expect((await pedir("/api/estudio/ajeno/serie", { method: "POST", body: { imagen: HOJA, total: 4 } })).status).toBe(404);
    expect(llamadas).toHaveLength(0);
  });
});
