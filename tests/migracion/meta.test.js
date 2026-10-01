import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import {
  olvidarModelos, huecoDe, modeloParaHueco, limpiarModelos, motorDeImagen, resolverIA, costoUSD, etiquetaModelo,
  MODELO_MUSE_CONTRIBUIDOR, FUNCIONES_IA,
} from "../../worker/lib/configIA.js";
import { adaptarAlModelo, esRechazoDeModelo, RechazoAnthropic } from "../../worker/lib/anthropic.js";
import { peticionMuse, peticionMuseResponses, tamanoMuse, TAMANOS_MUSE, llamarMuseImage } from "../../worker/lib/estudio/meta.js";

// Un PNG de 1×1: los bytes que reconoce `tipoPorBytes`.
const PNG_MINI = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
import { MODELOS, normalizarAjustes } from "../../src/lib/estudioCatalogo.js";
import { MOTORES } from "../../worker/lib/estudio/motores.js";

// ============================================================
// Meta: Muse Spark para el texto y Muse Image para las imágenes
//
// NADA de esto se ha probado contra Meta de verdad: no hay llave. Meta es
// de mentira y habla como dice su documentación (formato de mensajes de
// Anthropic en api.meta.ai/v1/messages; imágenes como la API de OpenAI).
// Lo que importa:
//   1. Cada función escribe con su modelo; con llave de Meta, redacción y
//      guiones van a Muse Spark Contributor (decisión de la agencia).
//   2. Lo que Meta no entiende no se le manda.
//   3. Si Meta rechaza, escribe Sonnet: un texto, no un error.
//   4. El gasto se apunta como de Meta, con su precio.
// ============================================================

describe("qué modelo escribe cada función", () => {
  it("cada `funcion` del contador cae en su hueco; lo desconocido, en análisis", () => {
    expect(huecoDe("calendario")).toBe("redaccion");
    expect(huecoDe("publicación")).toBe("redaccion");
    expect(huecoDe("guiones")).toBe("guiones");
    expect(huecoDe("lectura de contenido")).toBe("lectura");
    expect(huecoDe("resumen del chat")).toBe("asistente");
    expect(huecoDe("informe")).toBe("analisis");
    expect(huecoDe("algo nuevo")).toBe("analisis");
  });

  it("con llave de Meta, redacción y guiones van a Muse Spark Contributor salvo que se elija otro", () => {
    const config = { ia_modelo: "sonnet", ia_modelos: {} };
    expect(modeloParaHueco(config, "redaccion", { hayMeta: true })).toBe("muse-contribuidor");
    expect(modeloParaHueco(config, "guiones", { hayMeta: true })).toBe("muse-contribuidor");
    expect(modeloParaHueco(config, "asistente", { hayMeta: true })).toBe("sonnet");
    expect(modeloParaHueco(config, "redaccion", { hayMeta: false })).toBe("sonnet");
    expect(modeloParaHueco({ ia_modelo: "opus", ia_modelos: { guiones: "haiku" } }, "guiones", { hayMeta: true })).toBe("haiku");
  });

  it("lo guardado se limpia: sólo funciones y modelos que existen", () => {
    expect(limpiarModelos('{"redaccion":"muse","guiones":"gpt","otra":"sonnet","imagen":"meta"}')).toEqual({ redaccion: "muse", imagen: "meta" });
    expect(limpiarModelos("no es json")).toEqual({});
    expect(limpiarModelos(null)).toEqual({});
  });

  it("el motor de imagen: «auto» es Meta si hay llave", () => {
    expect(motorDeImagen({ ia_modelos: {} }, { hayMeta: true })).toBe("meta");
    expect(motorDeImagen({ ia_modelos: {} }, { hayMeta: false })).toBe("gemini");
    expect(motorDeImagen({ ia_modelos: { imagen: "gemini" } }, { hayMeta: true })).toBe("gemini");
    expect(motorDeImagen({ ia_modelos: { imagen: "meta" } }, { hayMeta: false })).toBe("gemini");
  });

  it("Muse sin llave escribe Sonnet y lo dice; con llave, el id de Meta", async () => {
    expect(await resolverIA({}, { ia_modelo: "muse-contribuidor", ia_razonamiento: "alto" }))
      .toMatchObject({ modelo: "claude-sonnet-5", aviso: expect.stringMatching(/META_API_KEY/) });
    expect((await resolverIA({ META_API_KEY: "m" }, { ia_modelo: "muse-contribuidor", ia_razonamiento: "alto" })).modelo).toBe(MODELO_MUSE_CONTRIBUIDOR);
    expect((await resolverIA({ MODEL_API_KEY: "m" }, { ia_modelo: "muse", ia_razonamiento: "alto" })).modelo).toBe("muse-spark-1.3");
  });

  it("su precio y su nombre", () => {
    expect(costoUSD(MODELO_MUSE_CONTRIBUIDOR, { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(0.3);
    expect(costoUSD("muse-spark-1.3", { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBeCloseTo(5.5);
    expect(etiquetaModelo(MODELO_MUSE_CONTRIBUIDOR)).toBe("Muse Spark 1.2 Contributor");
    expect(etiquetaModelo("muse-spark-1.3")).toBe("Muse Spark 1.3");
  });
});

describe("lo que se le manda a Meta", () => {
  it("sin razonamiento adaptativo, sin effort, sin marcas de caché y sin las herramientas que ejecuta Anthropic", () => {
    const p = adaptarAlModelo({
      model: MODELO_MUSE_CONTRIBUIDOR, max_tokens: 9000,
      thinking: { type: "adaptive" }, output_config: { effort: "high" },
      system: [{ type: "text", text: "ADN", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: [{ type: "text", text: "hola", cache_control: { type: "ephemeral" } }] }],
      tools: [{ type: "web_search_20260209", name: "web_search" }, { name: "crear_publicacion", input_schema: { type: "object" } }],
    });
    expect(p.thinking).toBeUndefined();
    expect(p.output_config).toBeUndefined();
    expect(p.system).toEqual([{ type: "text", text: "ADN" }]);
    expect(p.messages[0].content[0]).toEqual({ type: "text", text: "hola" });
    expect(p.tools.map((t) => t.name)).toEqual(["crear_publicacion"]);
    expect(p.max_tokens).toBe(9000);
  });

  it("sin herramientas que le sirvan, sin `tools` ni `tool_choice`", () => {
    const p = adaptarAlModelo({ model: "muse-spark-1.3", tools: [{ type: "web_fetch_20260209", name: "web_fetch" }], tool_choice: { type: "auto" }, messages: [] });
    expect(p.tools).toBeUndefined();
    expect(p.tool_choice).toBeUndefined();
  });

  it("un rechazo de Meta por llave, permiso o modelo vuelve a Sonnet; una saturación, no", () => {
    for (const estado of [401, 403, 404]) expect(esRechazoDeModelo(new RechazoAnthropic(estado, "", "no", "meta"))).toBe(true);
    expect(esRechazoDeModelo(new RechazoAnthropic(429, "", "lento", "meta"))).toBe(false);
    expect(esRechazoDeModelo(new RechazoAnthropic(403, "", "no", "anthropic"))).toBe(false);
  });
});

describe("Muse Image en el Estudio", () => {
  const muse = MODELOS.find((m) => m.id === "muse-image");

  it("está en el catálogo, con su motor, a 0,01 $ y hasta 10 referencias", () => {
    expect(muse).toMatchObject({ motor: "meta", gid: "muse-image-1.0", costo: 0.01, referencias: 10, tipo: "imagen" });
    expect(MOTORES.meta.activo({})).toBe(false);
    expect(MOTORES.meta.activo({ META_API_KEY: "m" })).toBe(true);
  });

  it("primero la API de imágenes con el tamaño EXACTO; sin `response_format`", () => {
    const sin = peticionMuse(muse, { prompt: "una taza", ajustes: { aspectRatio: "4:5", calidad: "low" } });
    expect(sin.ruta).toBe("/images/generations");
    expect(sin.cuerpo).toEqual({ model: "muse-image-1.0", prompt: "una taza", n: 1, size: "1024x1280", output_format: "webp", reasoning_strength: "low" });
    const con = peticionMuse(muse, { prompt: "x", ajustes: { aspectRatio: "9:16" }, referencias: [{ mime: "image/png", base64: "QUJD" }] });
    expect(con.ruta).toBe("/images/edits");
    expect(con.cuerpo.size).toBe("1024x1792");
    expect(con.cuerpo.images).toEqual([{ image_url: "data:image/png;base64,QUJD" }]);
  });

  it("todas las proporciones y la calidad, como siempre", () => {
    expect(muse.ajustes.aspectRatio.valores).toEqual(expect.arrayContaining(["1:1", "4:5", "9:16", "16:9", "3:4", "2:3"]));
    expect(muse.ajustes.calidad.valores).toEqual(["high", "low"]);
    expect(normalizarAjustes(muse, { aspectRatio: "4:5" }).aspectRatio).toBe("4:5");
  });

  it("la segunda vía es la API de Responses del recetario de Meta, con sus tres tamaños", () => {
    expect(Object.values(TAMANOS_MUSE)).toEqual(["1024x1024", "1024x1536", "1536x1024"]);
    for (const r of ["4:5", "3:4", "2:3", "9:16"]) expect(tamanoMuse(r)).toBe("1024x1536");
    for (const r of ["16:9", "4:3", "3:2", "5:4", "21:9"]) expect(tamanoMuse(r)).toBe("1536x1024");
    const sin = peticionMuseResponses(muse, { prompt: "una taza", ajustes: { aspectRatio: "2:3" } });
    expect(sin).toEqual({ ruta: "/responses", cuerpo: { model: "muse-image-1.0", input: "una taza", tools: [{ type: "image_generation", size: "1024x1536", output_format: "webp" }], store: false } });
    const con = peticionMuseResponses(muse, { prompt: "x", ajustes: { formato: "png" }, referencias: [{ mime: "image/png", base64: "QUJD" }] });
    // Una lista suelta de partes es un 400: van DENTRO de { role: "user", content }.
    expect(con.cuerpo.input).toEqual([{ role: "user", content: [{ type: "input_text", text: "x" }, { type: "input_image", image_url: "data:image/png;base64,QUJD" }] }]);
  });

  describe("la llamada", () => {
    const env = { META_API_KEY: "m" };
    const original = globalThis.fetch;
    afterEach(() => { globalThis.fetch = original; });
    const imagenes = () => Response.json({ data: [{ b64_json: PNG_MINI }] });
    const responses = () => Response.json({ id: "resp_1", status: "completed", output: [{ type: "reasoning" }, { type: "image_generation_call", result: PNG_MINI }], error: null });

    it("si la API de imágenes contesta, no se prueba nada más", async () => {
      globalThis.fetch = vi.fn(async () => imagenes());
      const r = await llamarMuseImage(env, { prompt: "una taza", ajustes: { aspectRatio: "4:5" } });
      expect(r.mime).toBe("image/png");
      expect(globalThis.fetch.mock.calls.map((c) => String(c[0]))).toEqual(["https://api.meta.ai/v1/images/generations"]);
    });

    it("si la rechaza, prueba la API de Responses y lee el `image_generation_call`", async () => {
      globalThis.fetch = vi.fn(async (url) => (String(url).endsWith("/responses") ? responses() : Response.json({ error: { message: "Unknown parameter" } }, { status: 400 })));
      const r = await llamarMuseImage(env, { prompt: "una taza", ajustes: { aspectRatio: "4:5" }, referencias: [{ mime: "image/png", base64: PNG_MINI }] });
      expect(r.bytes[0]).toBe(0x89);
      expect(globalThis.fetch.mock.calls.map((c) => String(c[0]))).toEqual(["https://api.meta.ai/v1/images/edits", "https://api.meta.ai/v1/responses"]);
    });

    it("si las dos fallan, el error dice el código y lo que contestó Meta en cada una, aunque no sea JSON", async () => {
      globalThis.fetch = vi.fn(async (url) => (String(url).endsWith("/responses")
        ? new Response("Bad Request", { status: 400 })
        : Response.json({ error: { message: "Invalid size" } }, { status: 400 })));
      await expect(llamarMuseImage(env, { prompt: "x" })).rejects.toThrow("Meta rechazó el pedido. /images/generations → 400: Invalid size · /responses → 400: Bad Request");
      globalThis.fetch = vi.fn(async () => Response.json({}, { status: 400 }));
      await expect(llamarMuseImage(env, { prompt: "x" })).rejects.toThrow("/images/generations → 400: sin detalle · /responses → 400: sin detalle");
    });

    it("una llave que Meta no acepta lo dice, sin probar la otra vía; una caída de red, también", async () => {
      globalThis.fetch = vi.fn(async () => Response.json({ error: { message: "Invalid OAuth access token" } }, { status: 401 }));
      await expect(llamarMuseImage(env, { prompt: "x" })).rejects.toThrow("Meta no aceptó la llave del servidor (META_API_KEY). /images/generations → 401: Invalid OAuth access token");
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      globalThis.fetch = vi.fn(async () => { throw new TypeError("Network connection lost."); });
      await expect(llamarMuseImage(env, { prompt: "x" })).rejects.toThrow("No se pudo contactar con Meta (Network connection lost.).");
    });
  });
});

// ------------------------------------------------------------
// De punta a punta: /api/ia con Meta de mentira
// ------------------------------------------------------------

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;
let llamadas;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 1000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 500 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

function proveedores({ meta = () => flujo("de Meta") } = {}) {
  llamadas = [];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u === "https://api.meta.ai/v1/messages" || u === "https://api.anthropic.com/v1/messages") {
      llamadas.push({ url: u, cabeceras: opciones.headers, cuerpo: JSON.parse(opciones.body) });
      return u.includes("meta.ai") ? meta() : flujo("de Anthropic");
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const escribir = (funcion) => pedir("/api/ia", { method: "POST", body: { content: "Escribe un guion", funcion, clienteId: "c1" } });

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, ANTHROPIC_API_KEY: "k", META_API_KEY: "llave-meta", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("/api/ia con Meta", () => {
  it("un guion, con llave de Meta, sale de Muse Spark Contributor por la puerta de Meta, y se apunta como de Meta", async () => {
    proveedores();
    const res = await escribir("guiones");
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r).toMatchObject({ text: "de Meta", provider: "meta", model: MODELO_MUSE_CONTRIBUIDOR });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe("https://api.meta.ai/v1/messages");
    expect(llamadas[0].cabeceras.Authorization).toBe("Bearer llave-meta");
    expect(llamadas[0].cuerpo.model).toBe(MODELO_MUSE_CONTRIBUIDOR);
    expect(llamadas[0].cuerpo.thinking).toBeUndefined();
    // La regla del español neutro va también a Meta.
    expect(JSON.stringify(llamadas[0].cuerpo.system)).toMatch(/español latino neutro/);
    const apunte = db.sqlite.prepare("select proveedor, modelo, funcion from consumo_ia").get();
    expect({ ...apunte }).toEqual({ proveedor: "meta", modelo: MODELO_MUSE_CONTRIBUIDOR, funcion: "guiones" });
  });

  it("un informe (análisis) sigue con el modelo general, aunque haya llave de Meta", async () => {
    proveedores();
    const r = await (await escribir("informe")).json();
    expect(r.provider).toBe("anthropic");
    expect(llamadas[0].url).toBe("https://api.anthropic.com/v1/messages");
  });

  it("si Meta lo rechaza (región, llave), escribe Sonnet y se dice", async () => {
    proveedores({ meta: () => Response.json({ error: { type: "permission_error", message: "Not available in your region" } }, { status: 403 }) });
    const r = await (await escribir("calendario")).json();
    expect(r).toMatchObject({ text: "de Anthropic", model: "claude-sonnet-5", provider: "anthropic" });
    expect(r.aviso).toMatch(/Muse Spark 1.2 Contributor no aceptó/);
    expect(llamadas.map((l) => l.url)).toEqual(["https://api.meta.ai/v1/messages", "https://api.anthropic.com/v1/messages"]);
  });

  it("sin llave de Meta, nada va a Meta", async () => {
    delete env.META_API_KEY;
    proveedores();
    const r = await (await escribir("guiones")).json();
    expect(r.model).toBe("claude-sonnet-5");
    expect(llamadas.every((l) => l.url.startsWith("https://api.anthropic.com"))).toBe(true);
  });
});

describe("Ajustes: un modelo por función", () => {
  const guardar = (datos) => pedir("/api/ajustes", { method: "PUT", body: datos });

  it("se guarda, se fusiona con lo que había y `null` vuelve al de por defecto", async () => {
    let r = await (await guardar({ ia_modelos: { guiones: "opus", imagen: "gemini" } })).json();
    expect(r.ia_modelos).toEqual({ guiones: "opus", imagen: "gemini" });
    r = await (await guardar({ ia_modelos: { redaccion: "muse" } })).json();
    expect(r.ia_modelos).toEqual({ guiones: "opus", imagen: "gemini", redaccion: "muse" });
    r = await (await guardar({ ia_modelos: { guiones: null } })).json();
    expect(r.ia_modelos).toEqual({ imagen: "gemini", redaccion: "muse" });
  });

  it("una función o un modelo que no existen son 400", async () => {
    expect((await guardar({ ia_modelos: { guiones: "gpt-9" } })).status).toBe(400);
    expect((await guardar({ ia_modelos: { inventada: "sonnet" } })).status).toBe(400);
    expect((await guardar({ ia_modelos: { imagen: "muse" } })).status).toBe(400);
    expect((await guardar({ ia_modelos: "sonnet" })).status).toBe(400);
  });

  it("lo elegido manda: guiones con Opus no va a Meta aunque haya llave", async () => {
    await guardar({ ia_modelos: { guiones: "haiku" } });
    proveedores();
    const r = await (await escribir("guiones")).json();
    expect(r.model).toBe("claude-haiku-4-5");
  });

  it("/api/ia/modelos dice qué escribe cada función de verdad", async () => {
    proveedores();
    const r = await (await pedir("/api/ia/modelos")).json();
    expect(Object.keys(r.funciones).sort()).toEqual(Object.keys(FUNCIONES_IA).sort());
    expect(r.funciones.guiones).toMatchObject({ id: MODELO_MUSE_CONTRIBUIDOR, propio: false });
    expect(r.funciones.analisis.id).toBe("claude-sonnet-5");
    expect(r.meta).toEqual({ conectado: true });
    expect(r.imagen).toEqual({ elegido: "auto", enUso: "meta" });
  });
});
