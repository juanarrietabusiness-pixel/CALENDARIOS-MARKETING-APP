import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { sha256 } from "../../worker/lib/ids.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { cifrar, firmarEstado, olvidarToken } from "../../worker/lib/google.js";
import { firmar as firmarComoMeta } from "../../worker/lib/bandeja/webhook.js";
import { cifrarMeta } from "../../worker/lib/meta.js";

// ============================================================
// La puerta del Worker, pedida de verdad
//
// POR QUÉ ESTE FICHERO NO ES OTRO TEST ESTÁTICO
//
// `tests/despliegue/funciones.test.js` comprueba que todo lo escrito en
// `worker/rutas/` está enrutado, porque `ai-chat` corrió semanas con
// código que no estaba en ningún commit. Pero no llega DENTRO de
// `worker/index.js`, y ahí cabe el mismo fallo: una rama escrita, en el
// commit, desplegada, y a la que no llega ninguna petición porque otra
// de más arriba contestó primero.
//
// Eso es exactamente lo que le pasaba a la subida de imágenes. `POST
// /api/media` no lleva clave en la ruta, la comprobación de clave iba
// delante, y devolvía 404 antes de mirar el método. Leyendo el fichero
// las dos ramas están ahí y parecen bien.
//
// La única forma de verlo es pedirlo. Eso es lo que hace esto.
// ============================================================

const TESTIGO = "un-testigo-de-sesion-de-prueba";

/** D1 de mentira: reconoce las tres consultas que hace esta puerta. */
function dbFalsa({ clientes = ["cliente-1"], huella, ajustes = null, rol = "admin", gasto = 0, driveFolder = "", integracion = null } = {}) {
  const responder = (sql, binds) => {
    const s = sql.toLowerCase().replace(/\s+/g, " ");

    if (s.includes("from sessions s")) {
      if (binds[0] !== huella) return null;
      return {
        id: "u-jefe", email: "jefe@a.com",
        owner_id: "u-jefe", rol, nombre: "Juan", color: "#1E90FF",
      };
    }

    if (s.startsWith("select * from ajustes_espacio where id = ? and owner_id = ?")) return ajustes;
    if (s.startsWith("select coalesce(sum(costo_usd), 0) as total from consumo_ia")) return { total: gasto };

    // acceso.leerUno("clients", { id }) — acotado por el espacio.
    if (s.startsWith("select * from clients where id = ? and owner_id = ?")) {
      return clientes.includes(binds[0]) && binds[1] === "u-jefe" ? { id: binds[0], drive_folder: driveFolder } : null;
    }
    if (s.startsWith("select * from integracion_drive where id = ? and owner_id = ?")) return integracion;
    return null;
  };

  return {
    prepare(sql) {
      const llamada = { sql, binds: [] };
      return {
        bind(...args) { llamada.binds = args; return this; },
        first: async () => responder(sql, llamada.binds),
        all: async () => ({ results: [] }),
        run: async () => ({ meta: { changes: 1 } }),
      };
    },
  };
}

/** R2 de mentira, con lo justo que usa `sirveMedia`. */
function r2Falso(inicial = {}) {
  const objetos = new Map(Object.entries(inicial));
  return {
    objetos,
    async get(clave, opciones) {
      if (!objetos.has(clave)) return null;
      const cuerpo = objetos.get(clave);
      // Como R2: `range` puede ser las cabeceras de la petición.
      const cabecera = opciones?.range?.get?.("Range") ?? "";
      const m = /^bytes=(\d+)-(\d*)$/.exec(cabecera);
      const range = m ? { offset: Number(m[1]), length: (m[2] ? Number(m[2]) : cuerpo.length - 1) - Number(m[1]) + 1 } : undefined;
      return {
        body: range ? cuerpo.slice(range.offset, range.offset + range.length) : cuerpo,
        size: cuerpo.length,
        range,
        httpEtag: '"abc"',
        writeHttpMetadata: (h) => h.set("content-type", "image/jpeg"),
      };
    },
    async put(clave, cuerpo) { objetos.set(clave, cuerpo); },
    async delete(clave) { objetos.delete(clave); },
  };
}

async function entorno(opciones = {}) {
  return {
    DB: dbFalsa({ ...opciones, huella: await sha256(TESTIGO) }),
    MEDIA: r2Falso(opciones.r2),
    ASSETS: { fetch: async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) },
  };
}

const conSesion = (ruta, opciones = {}) =>
  new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, ...(opciones.headers ?? {}) },
  });

/** Un formulario de subida como el que manda el navegador. */
function formularioConImagen(clientId, nombre = "foto.JPG") {
  const form = new FormData();
  form.append("archivo", new File([new Uint8Array([1, 2, 3])], nombre, { type: "image/jpeg" }));
  form.append("clientId", clientId);
  return form;
}

describe("subir un archivo a /api/media", () => {
  it("llega a la rama de subida en vez de morir en la comprobación de clave", async () => {
    // LA REGRESIÓN. Antes esto era 404: `partes` vale ["media"], la clave
    // sale vacía, y el `if (!m) return noEncontrado("Archivo")` que iba
    // delante contestaba antes de que nadie mirase el método.
    const env = await entorno();
    const res = await worker.fetch(
      conSesion("/api/media", { method: "POST", body: formularioConImagen("cliente-1") }),
      env,
    );

    expect(res.status, "la subida vuelve a ser inalcanzable").toBe(201);
    const { clave } = await res.json();
    expect(clave).toMatch(/^clientes\/cliente-1\/posts\/[0-9a-f-]+\.jpg$/);
    expect(env.MEDIA.objetos.has(clave), "no se escribió en R2").toBe(true);
  });

  it("la clave la inventa el servidor: el navegador no elige dónde escribe", async () => {
    // Si la clave viniera del formulario, bastaría mandar
    // `clientes/otro-cliente/…` para escribir en la carpeta de otro.
    const env = await entorno();
    const form = formularioConImagen("cliente-1");
    form.append("clave", "clientes/cliente-de-otro/posts/colado.jpg");

    const res = await worker.fetch(conSesion("/api/media", { method: "POST", body: form }), env);
    const { clave } = await res.json();
    expect(clave).not.toContain("cliente-de-otro");
    expect(env.MEDIA.objetos.has("clientes/cliente-de-otro/posts/colado.jpg")).toBe(false);
  });

  it("la carpeta se limpia: no se puede salir de la del cliente", async () => {
    const env = await entorno();
    const form = formularioConImagen("cliente-1");
    form.append("carpeta", "../../otro");

    const { clave } = await (await worker.fetch(
      conSesion("/api/media", { method: "POST", body: form }), env,
    )).json();
    expect(clave).not.toContain("..");
    expect(clave).toMatch(/^clientes\/cliente-1\/otro\//);
  });

  it("a un cliente de otro espacio, no", async () => {
    const env = await entorno({ clientes: ["cliente-1"] });
    const res = await worker.fetch(
      conSesion("/api/media", { method: "POST", body: formularioConImagen("cliente-de-otro") }),
      env,
    );
    expect(res.status).toBe(404);
    expect(env.MEDIA.objetos.size).toBe(0);
  });

  it("sin archivo es un 400 con motivo, no un 500", async () => {
    const env = await entorno();
    const form = new FormData();
    form.append("clientId", "cliente-1");
    const res = await worker.fetch(conSesion("/api/media", { method: "POST", body: form }), env);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/archivo/i);
  });

  it("y sin sesión, ni eso", async () => {
    const env = await entorno();
    const res = await worker.fetch(
      new Request("https://calendarios.test/api/media", { method: "POST", body: formularioConImagen("cliente-1") }),
      env,
    );
    expect(res.status).toBe(401);
    expect(env.MEDIA.objetos.size).toBe(0);
  });
});

describe("leer y borrar un archivo", () => {
  const CLAVE = "clientes/cliente-1/posts/foto.jpg";

  it("se sirve el de un cliente del espacio", async () => {
    const env = await entorno({ r2: { [CLAVE]: "bytes" } });
    const res = await worker.fetch(conSesion(`/api/${""}media/${CLAVE}`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    // `private`: son imágenes de clientes, y una caché compartida que las
    // guarde es justo lo que no se quiere.
    expect(res.headers.get("Cache-Control")).toContain("private");
  });

  it("responde por trozos (206): sin eso Safari del iPhone no reproduce un video", async () => {
    const env = await entorno({ r2: { [CLAVE]: "0123456789" } });
    const res = await worker.fetch(conSesion(`/api/media/${CLAVE}`, { headers: { Range: "bytes=0-1" } }), env);
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-1/10");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(await res.text()).toBe("01");
  });

  it("el de otro espacio no existe, aunque el objeto esté en R2", async () => {
    const otro = "clientes/cliente-de-otro/posts/foto.jpg";
    const env = await entorno({ clientes: ["cliente-1"], r2: { [otro]: "bytes" } });
    const res = await worker.fetch(conSesion(`/api/media/${otro}`), env);
    expect(res.status).toBe(404);
  });

  it("una clave sin la forma de siempre tampoco", async () => {
    // En Supabase la ruta era `{clientId}/{uuid}.jpg`; en R2 todo cuelga
    // de `clientes/`, y sin ese prefijo no se sabe de qué cliente es.
    const env = await entorno({ r2: { "suelta.jpg": "bytes" } });
    expect((await worker.fetch(conSesion("/api/media/suelta.jpg"), env)).status).toBe(404);
  });

  it("borrar quita el objeto", async () => {
    const env = await entorno({ r2: { [CLAVE]: "bytes" } });
    const res = await worker.fetch(conSesion(`/api/media/${CLAVE}`, { method: "DELETE" }), env);
    expect(res.status).toBe(200);
    expect(env.MEDIA.objetos.has(CLAVE)).toBe(false);
  });

  it("un método que no se atiende dice 405, no 404", async () => {
    // 404 diría «ese archivo no existe», que es mentira y manda a buscar
    // al sitio equivocado.
    const env = await entorno({ r2: { [CLAVE]: "bytes" } });
    const res = await worker.fetch(conSesion(`/api/media/${CLAVE}`, { method: "PUT" }), env);
    expect(res.status).toBe(405);
  });
});

describe("descartar una imagen generada", () => {
  const GENERADA = "clientes/cliente-1/generadas/img.png";
  const pedir = (cuerpo) => conSesion("/api/feedback-imagen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

  it("borra la generada del cliente", async () => {
    const env = await entorno({ r2: { [GENERADA]: "bytes" } });
    const res = await worker.fetch(pedir({ clientId: "cliente-1", clave: GENERADA, liked: false }), env);
    expect(res.status).toBe(200);
    expect(env.MEDIA.objetos.has(GENERADA)).toBe(false);
  });

  it("no borra un archivo de otro espacio aunque se lo nombren", async () => {
    // El fallo: la clave llegaba del navegador y se borraba sin mirar
    // de quién era.
    const ajena = "clientes/cliente-de-otro/banco/video.mp4";
    const env = await entorno({ r2: { [ajena]: "bytes" } });
    const res = await worker.fetch(pedir({ clientId: "cliente-de-otro", clave: ajena, liked: false }), env);
    expect(res.status).toBe(404);
    expect(env.MEDIA.objetos.has(ajena)).toBe(true);
  });

  it("ni uno del banco del propio cliente: sólo las generadas", async () => {
    const banco = "clientes/cliente-1/banco/foto.jpg";
    const env = await entorno({ r2: { [banco]: "bytes" } });
    const res = await worker.fetch(pedir({ clientId: "cliente-1", clave: banco, liked: false }), env);
    expect(res.status).toBe(403);
    expect(env.MEDIA.objetos.has(banco)).toBe(true);
  });

  it("ni una clave que se salga con ..", async () => {
    const env = await entorno();
    const res = await worker.fetch(
      pedir({ clientId: "cliente-1", clave: "clientes/cliente-1/generadas/../../otro/x", liked: false }), env,
    );
    expect(res.status).toBe(403);
  });
});

describe("leer un video para el asistente", () => {
  const CLAVE = "clientes/cliente-1/banco/reel.mp4";
  const pedir = (clave) => conSesion("/api/ia/video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clave }),
  });

  /** Un R2 que sabe lo que el análisis le pregunta a un objeto. */
  function conVideo(env, tipo = "video/mp4") {
    env.MEDIA = {
      async get(clave) {
        if (clave !== CLAVE) return null;
        return { size: 3, httpMetadata: { contentType: tipo }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
      },
    };
    env.GOOGLE_AI_KEY = "clave-de-prueba";
    return env;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("sin la clave de Google dice 503 con motivo, no un 500", async () => {
    const env = await entorno();
    const res = await worker.fetch(pedir(CLAVE), env);
    expect(res.status).toBe(503);
  });

  it("el video de otro espacio no existe", async () => {
    const env = conVideo(await entorno({ clientes: ["cliente-1"] }));
    const res = await worker.fetch(pedir("clientes/cliente-de-otro/banco/reel.mp4"), env);
    expect(res.status).toBe(404);
  });

  it("llega a Gemini, espera a que procese, devuelve el análisis y borra el archivo", async () => {
    const llamadas = [];
    vi.stubGlobal("fetch", async (url, init = {}) => {
      llamadas.push(`${init.method ?? "GET"} ${String(url).replace("https://generativelanguage.googleapis.com", "")}`);
      const u = String(url);
      if (u.endsWith("/upload/v1beta/files")) return new Response("{}", { headers: { "x-goog-upload-url": "https://subida.test/1" } });
      if (u === "https://subida.test/1") return Response.json({ file: { name: "files/abc", uri: "u", state: "PROCESSING", mimeType: "video/mov" } });
      if (u.endsWith("/v1beta/files/abc") && init.method !== "DELETE") return Response.json({ name: "files/abc", uri: "u", state: "ACTIVE", mimeType: "video/mov" });
      if (u.includes(":generateContent")) {
        const cuerpo = JSON.parse(init.body);
        expect(cuerpo.contents[0].parts[0].fileData).toEqual({ mimeType: "video/mov", fileUri: "u" });
        return Response.json({ candidates: [{ content: { parts: [{ text: "1. TRANSCRIPCIÓN: hola" }] } }] });
      }
      return new Response("{}");
    });
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const env = conVideo(await entorno(), "video/quicktime");
    let res = null;
    worker.fetch(pedir(CLAVE), env).then((r) => { res = r; });
    // La espera entre consultas es un setTimeout: se avanza el reloj
    // hasta que llega la respuesta en vez de dormir de verdad.
    // Con un plazo REAL y no un número de vueltas: parte del camino es
    // asíncrono de verdad (el hash de la sesión con crypto.subtle), y en
    // un runner lento cincuenta vueltas del reloj falso se acababan antes
    // de que llegara la respuesta. `setImmediate` no está falseado y deja
    // que eso avance entre vuelta y vuelta.
    const hasta = Date.now() + 15_000;
    while (!res && Date.now() < hasta) {
      await vi.advanceTimersByTimeAsync(1000);
      await new Promise((r) => setImmediate(r));
    }
    vi.useRealTimers();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ analisis: "1. TRANSCRIPCIÓN: hola" });
    expect(llamadas.at(-1)).toBe("DELETE /v1beta/files/abc");
  });
});

describe("tareas terminadas, responsables y ajustes", () => {
  const pedirJSON = (ruta, metodo, cuerpo) => conSesion(ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });

  it("vaciar las terminadas rápidas llega a su rama, no al borrado de una tarea llamada «terminadas»", async () => {
    const res = await worker.fetch(pedirJSON("/api/tareas-rapidas/terminadas", "DELETE"), await entorno());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ borradas: 0 });
  });

  it("vaciar las terminadas de un cliente también", async () => {
    const res = await worker.fetch(pedirJSON("/api/clientes/cliente-1/tareas/terminadas", "DELETE"), await entorno());
    expect(res.status).toBe(200);
  });

  it("sin ajustes guardados, las terminadas no se borran solas", async () => {
    const res = await worker.fetch(pedirJSON("/api/ajustes", "GET"), await entorno());
    // Y la IA en sus valores por defecto: Sonnet 5 con razonamiento alto.
    expect(await res.json()).toEqual({
      purga_tareas: "nunca", ia_modelo: "sonnet", ia_razonamiento: "alto",
      ia_razonamiento_chat: null, ia_modelos: {}, presupuesto_usd: 30, al_limite: "avisar",
    });
  });

  it("un modo de borrado que no existe es 400, no se guarda", async () => {
    const res = await worker.fetch(pedirJSON("/api/ajustes", "PUT", { purga_tareas: "diario" }), await entorno());
    expect(res.status).toBe(400);
  });

  it("un responsable sin nombre es 400", async () => {
    const res = await worker.fetch(pedirJSON("/api/responsables", "POST", { nombre: "  " }), await entorno());
    expect(res.status).toBe(400);
  });
});

describe("la puerta, en general", () => {
  it("lo que no es /api/ lo sirve el frontend compilado", async () => {
    const env = await entorno();
    const res = await worker.fetch(new Request("https://calendarios.test/cliente/baby-caleb"), env);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("sin sesión, 401 y no 404", async () => {
    // Un 404 en /api/yo significaría que el Worker no atiende /api/* y
    // que la API entera está muerta aunque el sitio se vea perfecto.
    const env = await entorno();
    const res = await worker.fetch(new Request("https://calendarios.test/api/yo"), env);
    expect(res.status).toBe(401);
  });

  it("/api/live sin cabecera de Upgrade es 426, no un socket a medias", async () => {
    const env = await entorno();
    const res = await worker.fetch(conSesion("/api/live"), env);
    expect(res.status).toBe(426);
  });

  it("una ruta que no existe es 404 con JSON y con las cabeceras de la API", async () => {
    const env = await entorno();
    const res = await worker.fetch(conSesion("/api/no-existe"), env);
    expect(res.status).toBe(404);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});

describe("el asistente: streaming y bucle de herramientas de servidor", () => {
  afterEach(() => vi.unstubAllGlobals());

  const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
  const respuestaTexto = (texto) => new Response([
    sse("message_start", { message: { model: "claude-opus-5-5", usage: { input_tokens: 5 } } }),
    sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
    sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
    sse("content_block_stop", { index: 0 }),
    sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }),
  ].join(""), { headers: { "content-type": "text/event-stream" } });
  const respuestaHerramienta = (id, name, input) => new Response([
    sse("message_start", { message: { model: "claude-opus-5-5", usage: {} } }),
    sse("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } }),
    sse("content_block_delta", { index: 0, delta: { type: "signature_delta", signature: "firma" } }),
    sse("content_block_stop", { index: 0 }),
    sse("content_block_start", { index: 1, content_block: { type: "tool_use", id, name, input: {} } }),
    sse("content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } }),
    sse("content_block_stop", { index: 1 }),
    sse("message_delta", { delta: { stop_reason: "tool_use" } }),
  ].join(""), { headers: { "content-type": "text/event-stream" } });

  /** Simula Anthropic: devuelve las respuestas en orden y guarda las peticiones. */
  function anthropicFalso(...respuestas) {
    const peticiones = [];
    vi.stubGlobal("fetch", async (url, opciones) => {
      if (String(url).startsWith("https://api.anthropic.com/")) {
        peticiones.push(JSON.parse(opciones.body));
        return respuestas.shift();
      }
      throw new Error(`fetch inesperado a ${url}`);
    });
    return peticiones;
  }

  const pedir = (cuerpo) => conSesion("/api/ia/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const eventos = async (res) => (await res.text())
    .split("\n\n").filter((t) => t.startsWith("data: ")).map((t) => JSON.parse(t.slice(6)));

  const BASE = {
    messages: [{ role: "user", content: "hola" }],
    system: "Eres el asistente.",
    clienteId: "cliente-1",
    tools: [
      { name: "crear_publicacion", description: "x", input_schema: { type: "object", properties: {} } },
      { name: "web_search", description: "suplantada", input_schema: { type: "object", properties: {} } },
    ],
  };

  it("sin clave de Anthropic dice 503 con motivo", async () => {
    const res = await worker.fetch(pedir(BASE), await entorno());
    expect(res.status).toBe(503);
  });

  it("un cliente de otro espacio no existe", async () => {
    const env = { ...(await entorno()), ANTHROPIC_API_KEY: "k" };
    const res = await worker.fetch(pedir({ ...BASE, clienteId: "cliente-de-otro" }), env);
    expect(res.status).toBe(404);
  });

  it("reenvía el texto según llega y cierra con «fin»", async () => {
    anthropicFalso(respuestaTexto("¡Hola!"));
    const env = { ...(await entorno()), ANTHROPIC_API_KEY: "k" };
    const res = await worker.fetch(pedir(BASE), env);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const evs = await eventos(res);
    expect(evs.filter((e) => e.t === "texto").map((e) => e.d).join("")).toBe("¡Hola!");
    const fin = evs.find((e) => e.t === "fin");
    expect(fin.stopReason).toBe("end_turn");
    expect(fin.mensajes).toEqual([{ role: "assistant", content: [{ type: "text", text: "¡Hola!" }] }]);
  });

  it("la petición: Sonnet 5 por defecto, razonamiento adaptativo alto, caché, sin tool_choice forzado", async () => {
    const peticiones = anthropicFalso(respuestaTexto("ok"));
    const env = { ...(await entorno()), ANTHROPIC_API_KEY: "k" };
    await eventos(await worker.fetch(pedir({ ...BASE, seguido: true }), env));
    const p = peticiones[0];
    expect(p.model).toBe("claude-sonnet-5");
    expect(p.thinking.type).toBe("adaptive");
    expect(p.output_config.effort).toBe("high");
    expect(p.stream).toBe(true);
    expect(p.cache_control).toEqual({ type: "ephemeral" });
    expect(p.system.at(-1)).toMatchObject({ text: "Eres el asistente.", cache_control: { type: "ephemeral" } });
    expect(p).not.toHaveProperty("tool_choice");
    const nombres = p.tools.map((t) => t.name);
    expect(nombres).toContain("crear_publicacion");
    expect(nombres).toContain("ver_tareas");
    // La web_search del navegador se descarta: la única es la de Anthropic.
    expect(p.tools.filter((t) => t.name === "web_search")).toEqual([
      expect.objectContaining({ type: "web_search_20260209" }),
    ]);
  });

  it("encadena una herramienta de servidor sin volver al navegador, con el razonamiento intacto", async () => {
    const peticiones = anthropicFalso(
      respuestaHerramienta("tu_1", "ver_tareas", {}),
      respuestaTexto("No hay tareas."),
    );
    const env = { ...(await entorno()), ANTHROPIC_API_KEY: "k" };
    const evs = await eventos(await worker.fetch(pedir(BASE), env));
    expect(peticiones).toHaveLength(2);
    const segunda = peticiones[1].messages;
    expect(segunda[1].content[0]).toEqual({ type: "thinking", thinking: "", signature: "firma" });
    expect(segunda[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu_1" });
    expect(evs.some((e) => e.t === "herramienta")).toBe(true);
    const fin = evs.find((e) => e.t === "fin");
    expect(fin.stopReason).toBe("end_turn");
    expect(fin.mensajes).toHaveLength(3);
    // Sin conversación seguida, la primera vuelta no escribe caché —
    // caduca en cinco minutos y escribirla cuesta 1,25×—; la segunda sí,
    // porque la tercera la va a leer.
    expect(peticiones[0]).not.toHaveProperty("cache_control");
    expect(peticiones[0].system.at(-1)).not.toHaveProperty("cache_control");
    expect(peticiones[1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("con el presupuesto agotado y «detener», no llama a Anthropic: 402 con el motivo", async () => {
    const peticiones = anthropicFalso(respuestaTexto("no debería"));
    const env = {
      ...(await entorno({ ajustes: { presupuesto_usd: 10, al_limite: "detener" }, gasto: 10.5 })),
      ANTHROPIC_API_KEY: "k",
    };
    const res = await worker.fetch(pedir(BASE), env);
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/presupuesto de IA del mes/);
    expect(peticiones).toHaveLength(0);
  });

  it("con el presupuesto agotado y «bajar», responde Sonnet en nivel Bajo y lo avisa", async () => {
    const peticiones = anthropicFalso(respuestaTexto("ok"));
    const env = {
      ...(await entorno({ ajustes: { ia_modelo: "opus", presupuesto_usd: 10, al_limite: "bajar" }, gasto: 12 })),
      ANTHROPIC_API_KEY: "k",
    };
    const evs = await eventos(await worker.fetch(pedir(BASE), env));
    expect(peticiones[0].model).toBe("claude-sonnet-5");
    expect(peticiones[0].output_config.effort).toBe("low");
    expect(evs.find((e) => e.t === "aviso")?.texto).toMatch(/nivel Bajo/);
  });

  it("el asistente usa su propio nivel si el espacio le puso uno", async () => {
    const peticiones = anthropicFalso(respuestaTexto("ok"));
    const env = {
      ...(await entorno({ ajustes: { ia_razonamiento: "alto", ia_razonamiento_chat: "medio" } })),
      ANTHROPIC_API_KEY: "k",
    };
    await eventos(await worker.fetch(pedir(BASE), env));
    expect(peticiones[0].output_config.effort).toBe("medium");
  });

  it("una herramienta del navegador termina el turno para que la ejecute él", async () => {
    const peticiones = anthropicFalso(respuestaHerramienta("tu_2", "crear_publicacion", { fecha: "2026-09-30" }));
    const env = { ...(await entorno()), ANTHROPIC_API_KEY: "k" };
    const evs = await eventos(await worker.fetch(pedir(BASE), env));
    expect(peticiones).toHaveLength(1);
    const fin = evs.find((e) => e.t === "fin");
    expect(fin.stopReason).toBe("tool_use");
    expect(fin.resultadosServidor).toEqual([]);
    expect(fin.mensajes[0].content[1]).toMatchObject({ type: "tool_use", name: "crear_publicacion", input: { fecha: "2026-09-30" } });
  });

  it("un error de Anthropic llega con SU motivo, no con uno genérico", async () => {
    // «El proveedor de IA devolvió un error» fue lo único que se vio
    // cuando la cuenta no tenía Opus 5.5: el motivo estaba en el cuerpo.
    anthropicFalso(new Response(JSON.stringify({
      type: "error", error: { type: "invalid_request_error", message: "tools.3: formato no admitido" },
    }), { status: 400 }));
    const env = { ...(await entorno()), ANTHROPIC_API_KEY: "k" };
    const evs = await eventos(await worker.fetch(pedir(BASE), env));
    expect(evs.filter((e) => e.t === "error")).toEqual([
      { t: "error", mensaje: "Anthropic rechazó la petición (400): tools.3: formato no admitido" },
    ]);
  });

  it("dice qué modelo responde antes de empezar", async () => {
    anthropicFalso(respuestaTexto("ok"));
    const env = { ...(await entorno()), ANTHROPIC_API_KEY: "k" };
    const evs = await eventos(await worker.fetch(pedir(BASE), env));
    expect(evs[0]).toEqual({ t: "modelo", id: "claude-sonnet-5", etiqueta: "Sonnet 5", esfuerzo: "high" });
  });
});

describe("el resumen del chat", () => {
  it("sin nada guardado devuelve un resumen vacío", async () => {
    const res = await worker.fetch(conSesion("/api/ia/chat/resumen?cliente=cliente-1"), await entorno());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resumen: "", hasta: null });
  });

  it("de un cliente de otro espacio, 404", async () => {
    const res = await worker.fetch(conSesion("/api/ia/chat/resumen?cliente=cliente-de-otro"), await entorno());
    expect(res.status).toBe(404);
  });
});

describe("la IA del espacio: modelo, razonamiento y respaldo", () => {
  afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

  const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
  const texto = (t) => new Response([
    sse("message_start", { message: { model: "x", usage: { input_tokens: 1000 } } }),
    sse("content_block_start", { index: 0, content_block: { type: "thinking", thinking: "" } }),
    sse("content_block_stop", { index: 0 }),
    sse("content_block_start", { index: 1, content_block: { type: "text", text: "" } }),
    sse("content_block_delta", { index: 1, delta: { type: "text_delta", text: t } }),
    sse("content_block_stop", { index: 1 }),
    sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 500 } }),
  ].join(""), { headers: { "content-type": "text/event-stream" } });

  /** Anthropic de mentira: /v1/models con esta lista y /v1/messages con estas respuestas. */
  function anthropic({ modelos = ["claude-sonnet-5", "claude-opus-5"], respuestas = [] } = {}) {
    const mensajes = [];
    vi.stubGlobal("fetch", async (url, opciones = {}) => {
      const u = String(url);
      if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: modelos.map((id) => ({ id })) });
      if (u.startsWith("https://api.anthropic.com/v1/messages")) {
        mensajes.push(JSON.parse(opciones.body));
        return respuestas.shift();
      }
      throw new Error(`fetch inesperado a ${u}`);
    });
    return mensajes;
  }
  const generar = (maxTokens = 4000) => conSesion("/api/ia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: [{ type: "text", text: "Escribe un guion" }], maxTokens, tier: "rapido" }),
  });

  it("el calendario escribe con Sonnet 5 y razonamiento alto, aunque el navegador pida «rapido»", async () => {
    const peticiones = anthropic({ respuestas: [texto("GUION: hola")] });
    const env = { ...(await entorno()), ANTHROPIC_API_KEY: "k" };
    const res = await worker.fetch(generar(4000), env);
    expect(res.status).toBe(200);
    const cuerpo = await res.json();
    expect(cuerpo.text).toBe("GUION: hola");
    expect(cuerpo.model).toBe("claude-sonnet-5");
    const p = peticiones[0];
    expect(p.model).toBe("claude-sonnet-5");
    expect(p.thinking).toEqual({ type: "adaptive" });
    expect(p.output_config).toEqual({ effort: "high" });
    expect(p.stream).toBe(true);
    // Lo pedido para escribir más el margen del razonamiento alto.
    expect(p.max_tokens).toBe(4000 + 16_000);
  });

  it("el bloque del ADN con cache_control llega a Anthropic tal cual, con cualquier modelo", async () => {
    // El navegador parte el contexto en «ADN» y «lo que cambia» (lib/contextoADN.js):
    // si el Worker reescribiera esos bloques, la generación pagaría el ADN
    // entero en cada tanda sin que nada fallara. Sonnet y Haiku, que pasa por adaptarAlModelo.
    const bloques = [
      { type: "text", text: "ADN del cliente", cache_control: { type: "ephemeral" } },
      { type: "text", text: "las publicaciones de esta tanda" },
    ];
    for (const ia_modelo of ["sonnet", "haiku"]) {
      const peticiones = anthropic({ respuestas: [texto("ok")] });
      const env = { ...(await entorno({ ajustes: { ia_modelo, ia_razonamiento: "medio" } })), ANTHROPIC_API_KEY: "k" };
      const res = await worker.fetch(conSesion("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: bloques, maxTokens: 2000 }),
      }), env);
      expect(res.status).toBe(200);
      expect(peticiones[0].messages).toEqual([{ role: "user", content: bloques }]);
    }
  });

  it("con Opus elegido usa el Opus más reciente que tenga la cuenta", async () => {
    const peticiones = anthropic({ modelos: ["claude-sonnet-5", "claude-opus-4-8", "claude-opus-5"], respuestas: [texto("ok")] });
    const env = { ...(await entorno({ ajustes: { ia_modelo: "opus", ia_razonamiento: "maximo" } })), ANTHROPIC_API_KEY: "k" };
    await worker.fetch(generar(), env);
    expect(peticiones[0].model).toBe("claude-opus-5");
    expect(peticiones[0].output_config).toEqual({ effort: "max" });
  });

  it("con Haiku elegido la petición sale en su idioma: presupuesto fijo y sin effort", async () => {
    const peticiones = anthropic({ respuestas: [texto("ok")] });
    const env = { ...(await entorno({ ajustes: { ia_modelo: "haiku", ia_razonamiento: "medio" } })), ANTHROPIC_API_KEY: "k" };
    const cuerpo = await (await worker.fetch(generar(4000), env)).json();
    expect(cuerpo.model).toBe("claude-haiku-4-5");
    expect(peticiones[0].model).toBe("claude-haiku-4-5");
    expect(peticiones[0].output_config).toBeUndefined();
    expect(peticiones[0].thinking).toEqual({ type: "enabled", budget_tokens: 8_000 });
  });

  it("si la cuenta rechaza el Opus, escribe con Sonnet 5 y lo dice", async () => {
    const peticiones = anthropic({
      respuestas: [
        new Response(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "model: claude-opus-5" } }), { status: 404 }),
        texto("ok"),
      ],
    });
    const env = { ...(await entorno({ ajustes: { ia_modelo: "opus", ia_razonamiento: "alto" } })), ANTHROPIC_API_KEY: "k" };
    const cuerpo = await (await worker.fetch(generar(), env)).json();
    expect(peticiones.map((p) => p.model)).toEqual(["claude-opus-5", "claude-sonnet-5"]);
    expect(cuerpo.model).toBe("claude-sonnet-5");
    expect(cuerpo.aviso).toMatch(/Sonnet 5/);
  });

  it("un rechazo que no es del modelo enseña el motivo real", async () => {
    anthropic({ respuestas: [new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "prompt demasiado largo" } }), { status: 400 })] });
    const env = { ...(await entorno()), ANTHROPIC_API_KEY: "k" };
    const res = await worker.fetch(generar(), env);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Anthropic rechazó la petición (400): prompt demasiado largo");
  });

  it("la lista de modelos de la cuenta y el que está en uso", async () => {
    anthropic({ modelos: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5"] });
    const env = { ...(await entorno({ ajustes: { ia_modelo: "opus", ia_razonamiento: "alto" } })), ANTHROPIC_API_KEY: "k" };
    const cuerpo = await (await worker.fetch(conSesion("/api/ia/modelos"), env)).json();
    expect(cuerpo.disponibles.map((m) => m.nombre)).toEqual(["Sonnet 5", "Opus 5", "Haiku 4.5"]);
    expect(cuerpo.enUso).toMatchObject({ id: "claude-opus-5", nombre: "Opus 5", esfuerzo: "high" });
  });

  const guardarAjustes = (datos) => conSesion("/api/ajustes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });

  it("el administrador cambia el modelo y el razonamiento", async () => {
    const res = await worker.fetch(guardarAjustes({ ia_modelo: "opus", ia_razonamiento: "medio" }), await entorno());
    expect(res.status).toBe(200);
  });

  it("un editor no puede cambiar la IA", async () => {
    const res = await worker.fetch(guardarAjustes({ ia_modelo: "opus" }), await entorno({ rol: "editor" }));
    expect(res.status).toBe(403);
  });

  it("pero sí el borrado de tareas, que no cuesta dinero", async () => {
    const res = await worker.fetch(guardarAjustes({ purga_tareas: "semanal" }), await entorno({ rol: "editor" }));
    expect(res.status).toBe(200);
  });

  it("un modelo o un nivel que no existen son 400", async () => {
    expect((await worker.fetch(guardarAjustes({ ia_modelo: "gpt" }), await entorno())).status).toBe(400);
    expect((await worker.fetch(guardarAjustes({ ia_modelo: "haiku" }), await entorno())).status).toBe(200);
    expect((await worker.fetch(guardarAjustes({ ia_razonamiento: "altisimo" }), await entorno())).status).toBe(400);
  });
});

// ============================================================
// Google Drive
// ============================================================

describe("Google Drive como banco de contenido", () => {
  const GOOGLE = { GOOGLE_CLIENT_ID: "id-cliente", GOOGLE_CLIENT_SECRET: "secreto-de-prueba" };
  const RAIZ = "carpetaRaizDelCliente1";

  afterEach(() => { vi.unstubAllGlobals(); olvidarToken("u-jefe"); });

  /** Un Drive de mentira: cada archivo con su padre y su tipo. */
  function googleFalso(archivos) {
    const pedidos = [];
    vi.stubGlobal("fetch", async (url, opciones = {}) => {
      const u = new URL(String(url));
      pedidos.push({ url: u, opciones });
      if (u.host === "oauth2.googleapis.com" && u.pathname === "/token") {
        return Response.json({ access_token: "token-acceso", expires_in: 3600 });
      }
      const m = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
      if (m) {
        const f = archivos[decodeURIComponent(m[1])];
        if (!f) return new Response("{}", { status: 404 });
        if (u.searchParams.get("alt") === "media") return new Response(f.contenido ?? "bytes", { headers: { "Content-Type": f.mimeType } });
        return Response.json({ id: m[1], name: f.name ?? m[1], mimeType: f.mimeType, size: "10", parents: f.parents ?? [] });
      }
      return new Response("no esperado", { status: 500 });
    });
    return pedidos;
  }

  const conDrive = async (extra = {}) => {
    const base = await entorno({ driveFolder: `https://drive.google.com/drive/folders/${RAIZ}`, ...extra });
    const env = { ...base, ...GOOGLE };
    env.DB = dbFalsa({
      driveFolder: `https://drive.google.com/drive/folders/${RAIZ}`,
      huella: await sha256(TESTIGO),
      integracion: { id: "u-jefe", refresh_cifrado: await cifrar(env, "refresh-de-prueba"), email: "agencia@gmail.com" },
      ...extra,
    });
    return env;
  };

  it("sin las claves de Google, el estado lo dice y enseña la dirección de vuelta", async () => {
    const res = await worker.fetch(conSesion("/api/drive/estado"), await entorno());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      configurado: false, conectado: false, redireccion: "https://calendarios.test/api/drive/callback",
    });
  });

  it("conectar es sólo del administrador", async () => {
    const env = { ...(await entorno({ rol: "editor" })), ...GOOGLE };
    expect((await worker.fetch(conSesion("/api/drive/conectar"), env)).status).toBe(403);
  });

  it("conectar manda a Google con el state firmado y deja la cookie que lo ata a esta pestaña", async () => {
    const env = { ...(await entorno()), ...GOOGLE };
    const res = await worker.fetch(conSesion("/api/drive/conectar"), env);
    expect(res.status).toBe(302);
    const destino = new URL(res.headers.get("Location"));
    expect(destino.host).toBe("accounts.google.com");
    expect(destino.searchParams.get("access_type")).toBe("offline");
    expect(destino.searchParams.get("redirect_uri")).toBe("https://calendarios.test/api/drive/callback");
    expect(destino.searchParams.get("state")).toMatch(/\./);
    expect(res.headers.get("Set-Cookie")).toMatch(/^__Host-drive-oauth=\w+; Secure; HttpOnly; SameSite=Lax/);
  });

  it("la vuelta de Google sin la cookie de la pestaña se rechaza", async () => {
    // Un enlace de conexión reenviado a otra persona conectaría SU Drive
    // al espacio de quien lo generó. La cookie es lo que lo impide.
    const env = { ...(await entorno()), ...GOOGLE };
    const state = await firmarEstado(env, { ownerId: "u-jefe", userId: "u-jefe", nonce: "abc" });
    const pedidos = googleFalso({});
    const res = await worker.fetch(new Request(`https://calendarios.test/api/drive/callback?code=x&state=${encodeURIComponent(state)}`), env);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("drive=error");
    expect(pedidos).toHaveLength(0);
  });

  it("un state manipulado se rechaza aunque traiga cookie", async () => {
    const env = { ...(await entorno()), ...GOOGLE };
    const state = await firmarEstado(env, { ownerId: "otro-espacio", userId: "x", nonce: "abc" });
    const [cuerpo, firma] = state.split(".");
    const trucado = `${cuerpo.slice(0, -2)}AA.${firma}`;
    const res = await worker.fetch(new Request(`https://calendarios.test/api/drive/callback?code=x&state=${encodeURIComponent(trucado)}`, {
      headers: { Cookie: "__Host-drive-oauth=abc" },
    }), env);
    expect(res.headers.get("Location")).toContain("drive=error");
  });

  it("un archivo de fuera de la carpeta del cliente no se sirve", async () => {
    googleFalso({
      ajeno: { mimeType: "image/jpeg", parents: ["otraCarpetaDeLaAgencia"] },
      otraCarpetaDeLaAgencia: { mimeType: "application/vnd.google-apps.folder", parents: [] },
    });
    const res = await worker.fetch(conSesion("/api/drive/clientes/cliente-1/archivo/ajeno"), await conDrive());
    expect(res.status).toBe(404);
  });

  it("uno de dentro, aunque esté en una subcarpeta, sí", async () => {
    googleFalso({
      foto: { mimeType: "image/jpeg", parents: ["sub"], contenido: "JPEG" },
      sub: { mimeType: "application/vnd.google-apps.folder", parents: [RAIZ] },
    });
    const res = await worker.fetch(conSesion("/api/drive/clientes/cliente-1/archivo/foto"), await conDrive());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(await res.text()).toBe("JPEG");
  });

  it("lo que podría ejecutarse (HTML, SVG) se descarga, nunca se sirve en línea", async () => {
    googleFalso({
      pagina: { name: "truco.html", mimeType: "text/html", parents: [RAIZ], contenido: "<script>alert(1)</script>" },
      dibujo: { name: "logo.svg", mimeType: "image/svg+xml", parents: [RAIZ], contenido: "<svg/>" },
    });
    for (const id of ["pagina", "dibujo"]) {
      const res = await worker.fetch(conSesion(`/api/drive/clientes/cliente-1/archivo/${id}`), await conDrive());
      expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
      expect(res.headers.get("Content-Disposition")).toMatch(/^attachment/);
      expect(res.headers.get("Content-Security-Policy")).toMatch(/sandbox/);
    }
  });

  it("un cliente sin carpeta de Drive lo dice en vez de listar nada", async () => {
    const env = { ...(await entorno()), ...GOOGLE };
    const res = await worker.fetch(conSesion("/api/drive/clientes/cliente-1/archivos"), env);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/carpeta de Drive/);
  });

  it("sin conexión con Google, 409 con el camino para arreglarlo", async () => {
    googleFalso({});
    const env = await conDrive({ integracion: null });
    const res = await worker.fetch(conSesion("/api/drive/clientes/cliente-1/archivos"), env);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Ajustes/);
  });

  it("un video de Drive también va a la publicación (reels e historias), copiado a R2", async () => {
    googleFalso({ clip: { mimeType: "video/mp4", parents: [RAIZ], contenido: "MP4" } });
    const env = await conDrive();
    const res = await worker.fetch(conSesion("/api/drive/clientes/cliente-1/a-publicacion", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: "clip" }),
    }), env);
    expect(res.status).toBe(201);
    const r = await res.json();
    expect(r.tipo).toBe("video");
    expect(r.clave).toMatch(/\.mp4$/);
  });

  it("un PDF o un SVG de Drive no va a una publicación", async () => {
    googleFalso({ doc: { mimeType: "application/pdf", parents: [RAIZ] }, svg: { mimeType: "image/svg+xml", parents: [RAIZ] } });
    for (const fileId of ["doc", "svg"]) {
      const res = await worker.fetch(conSesion("/api/drive/clientes/cliente-1/a-publicacion", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId }),
      }), await conDrive());
      expect(res.status).toBe(400);
    }
  });

  it("guardar en Drive crea Mes / Semana, sube lo del cliente con su nombre y reemplaza la copia vieja sólo si es suya", async () => {
    const subidas = [];
    const carpetas = [];
    const papelera = [];
    vi.stubGlobal("fetch", async (url, opciones = {}) => {
      const u = new URL(String(url));
      const metodo = opciones.method ?? "GET";
      if (u.host === "oauth2.googleapis.com") return Response.json({ access_token: "token-acceso", expires_in: 3600 });
      if (u.pathname === "/drive/v3/files" && metodo === "GET") return Response.json({ files: [] });
      if (u.pathname === "/drive/v3/files" && metodo === "POST") {
        const c = JSON.parse(opciones.body);
        carpetas.push(c);
        return Response.json({ id: `carpeta-${carpetas.length}` });
      }
      if (u.pathname.startsWith("/drive/v3/files/") && metodo === "GET") {
        const id = decodeURIComponent(u.pathname.split("/").pop());
        return id === "vieja-del-cliente-0001" ? Response.json({ id, parents: [RAIZ] }) : new Response("{}", { status: 404 });
      }
      if (u.pathname.startsWith("/drive/v3/files/") && metodo === "PATCH") {
        papelera.push(decodeURIComponent(u.pathname.split("/").pop()));
        return Response.json({ id: "x" });
      }
      if (u.pathname === "/upload/drive/v3/files") {
        subidas.push(JSON.parse(opciones.body));
        return new Response(null, { headers: { Location: `https://subida.test/s/${subidas.length}` } });
      }
      if (u.host === "subida.test") return Response.json({ id: `drive-${u.pathname.split("/").pop()}`, name: "x", mimeType: "image/jpeg" });
      return new Response("no esperado", { status: 500 });
    });
    const env = await conDrive({ r2: {
      "clientes/cliente-1/posts/a.jpg": "JPG", "clientes/cliente-1/drive/b.jpg": "JPG", "clientes/otro/posts/c.jpg": "JPG",
    } });
    const carpetasPieza = ["Octubre 2026", "Semana 2"];
    const res = await worker.fetch(conSesion("/api/drive/clientes/cliente-1/guardar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        piezas: [
          { src: "/api/media/clientes/cliente-1/posts/a.jpg", carpetas: carpetasPieza, nombre: "Martes 6 - Semana 2 - 8 am - 1.jpg", reemplaza: "vieja-del-cliente-0001" },
          { src: "/api/media/clientes/cliente-1/drive/b.jpg", carpetas: carpetasPieza, nombre: "Martes 6 - Semana 2 - 8 am - 2.jpg" },
          { src: "/api/media/clientes/otro/posts/c.jpg", carpetas: carpetasPieza, nombre: "ajena.jpg" },
        ],
        quitar: ["de-otro-cliente-0002"],
      }),
    }), env);
    expect(res.status).toBe(201);
    const r = await res.json();
    expect(r.guardados.map((g) => g.ruta)).toEqual(["Octubre 2026/Semana 2/Martes 6 - Semana 2 - 8 am - 1.jpg", "Octubre 2026/Semana 2/Martes 6 - Semana 2 - 8 am - 2.jpg"]);
    // Las carpetas se crean una vez, la semana dentro del mes.
    expect(carpetas).toEqual([
      expect.objectContaining({ name: "Octubre 2026", parents: [RAIZ] }),
      expect.objectContaining({ name: "Semana 2", parents: ["carpeta-1"] }),
    ]);
    expect(subidas.map((x) => [x.name, x.parents[0]])).toEqual([["Martes 6 - Semana 2 - 8 am - 1.jpg", "carpeta-2"], ["Martes 6 - Semana 2 - 8 am - 2.jpg", "carpeta-2"]]);
    // La vieja es del cliente: a la papelera. La de otro (no está bajo su carpeta): no se toca.
    expect(papelera).toEqual(["vieja-del-cliente-0001"]);
    expect(r.quitados).toEqual(["vieja-del-cliente-0001"]);
  });

  it("una imagen de Drive en una publicación se COPIA a R2 y devuelve su clave", async () => {
    googleFalso({ foto: { mimeType: "image/png", parents: [RAIZ], contenido: "PNG" } });
    const env = await conDrive();
    const res = await worker.fetch(conSesion("/api/drive/clientes/cliente-1/a-publicacion", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: "foto" }),
    }), env);
    expect(res.status).toBe(201);
    const { clave } = await res.json();
    expect(clave).toMatch(/^clientes\/cliente-1\/drive\/.+\.png$/);
    expect(env.MEDIA.objetos.has(clave)).toBe(true);
  });
});

describe("YouTube: el canal de cada cliente", () => {
  const GOOGLE = { GOOGLE_CLIENT_ID: "id-cliente", GOOGLE_CLIENT_SECRET: "secreto-de-prueba" };

  it("conectar llega a su ruta y manda a Google con la cookie que ata la vuelta", async () => {
    const env = { ...(await entorno()), ...GOOGLE };
    const res = await worker.fetch(conSesion("/api/redes/youtube/conectar?cliente=cliente-1"), env);
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("Location")).host).toBe("accounts.google.com");
    expect(res.headers.get("Set-Cookie")).toMatch(/^__Host-youtube-oauth=.*HttpOnly/);
  });

  it("la vuelta y el enlace del cliente se atienden SIN sesión (y sin state, vuelven con error)", async () => {
    const env = { ...(await entorno()), ...GOOGLE };
    const vuelta = await worker.fetch(new Request("https://calendarios.test/api/redes/youtube/callback?code=x"), env);
    expect(vuelta.status).toBe(302);
    expect(vuelta.headers.get("Location")).toMatch(/\/ajustes\?youtube=error/);
    const enlace = await worker.fetch(new Request("https://calendarios.test/api/redes/youtube/inicio/no.vale"), env);
    expect(enlace.headers.get("Location")).toMatch(/\/youtube-error\.html/);
  });

  it("sin las claves de Google, el enlace del cliente es 503 y no 404", async () => {
    const res = await worker.fetch(conSesion("/api/redes/youtube/enlace", { method: "POST", body: JSON.stringify({ clientId: "cliente-1" }) }), await entorno());
    expect(res.status).toBe(503);
  });

  it("una acción de YouTube que no existe es 404, no cae en las rutas de Meta", async () => {
    const res = await worker.fetch(conSesion("/api/redes/youtube/no-existe", { method: "POST" }), { ...(await entorno()), ...GOOGLE });
    expect(res.status).toBe(404);
  });
});

describe("la bandeja: el webhook de Meta y /api/bandeja", () => {
  const SECRETO = "secreto-de-la-app";
  const conMeta = async () => ({ ...(await entorno()), META_APP_ID: "app", META_APP_SECRET: SECRETO, META_WEBHOOK_VERIFY_TOKEN: "testigo-verificar" });

  it("la verificación de la suscripción llega SIN sesión y devuelve el reto tal cual", async () => {
    const res = await worker.fetch(new Request(
      "https://calendarios.test/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=testigo-verificar&hub.challenge=1158201444",
    ), await conMeta());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("1158201444");
  });

  it("con otro testigo, 403 (y no el 401 de la sesión)", async () => {
    const res = await worker.fetch(new Request(
      "https://calendarios.test/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1",
    ), await conMeta());
    expect(res.status).toBe(403);
  });

  it("un aviso sin firma llega a la ruta y se rechaza con 403", async () => {
    const res = await worker.fetch(new Request("https://calendarios.test/api/webhooks/meta", {
      method: "POST", body: JSON.stringify({ object: "page", entry: [] }),
    }), await conMeta());
    expect(res.status).toBe(403);
  });

  it("un aviso bien firmado contesta 200 aunque no sea de nadie", async () => {
    const cuerpo = JSON.stringify({ object: "page", entry: [] });
    const res = await worker.fetch(new Request("https://calendarios.test/api/webhooks/meta", {
      method: "POST", body: cuerpo, headers: { "X-Hub-Signature-256": await firmarComoMeta(SECRETO, cuerpo) },
    }), await conMeta());
    expect(res.status).toBe(200);
  });

  it("sin META_APP_SECRET el webhook no acepta nada (503)", async () => {
    const res = await worker.fetch(new Request("https://calendarios.test/api/webhooks/meta", {
      method: "POST", body: "{}", headers: { "X-Hub-Signature-256": "sha256=" + "0".repeat(64) },
    }), await entorno());
    expect(res.status).toBe(503);
  });

  it("/api/bandeja exige sesión", async () => {
    const res = await worker.fetch(new Request("https://calendarios.test/api/bandeja/pendientes"), await conMeta());
    expect(res.status).toBe(401);
  });

  it("/api/bandeja con sesión llega a su ruta (no al 404 de datos)", async () => {
    const res = await worker.fetch(conSesion("/api/bandeja/pendientes"), await conMeta());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ comentarios: 0, mensajes: 0 });
  });

  it("«Conceder permisos de comentarios y mensajes» abre el OAuth con los permisos extra", async () => {
    const res = await worker.fetch(conSesion("/api/redes/meta/conectar?para=bandeja"), await conMeta());
    expect(res.status).toBe(302);
    const scope = new URL(res.headers.get("Location")).searchParams.get("scope").split(",");
    expect(scope).toEqual(expect.arrayContaining([
      "pages_manage_engagement", "pages_messaging", "instagram_manage_messages", "pages_manage_metadata", "instagram_basic",
    ]));
  });

  it("«Conectar» a secas NO pide los permisos con revisión", async () => {
    const res = await worker.fetch(conSesion("/api/redes/meta/conectar"), await conMeta());
    const scope = new URL(res.headers.get("Location")).searchParams.get("scope").split(",");
    expect(scope).not.toContain("pages_messaging");
    expect(scope).not.toContain("pages_manage_engagement");
  });

  it("con inicio de sesión para empresas, los permisos extra van por SU configuración", async () => {
    const env = { ...(await conMeta()), META_CONFIG_ID: "cfg-base", META_CONFIG_ID_BANDEJA: "cfg-bandeja" };
    const conBandeja = new URL((await worker.fetch(conSesion("/api/redes/meta/conectar?para=bandeja"), env)).headers.get("Location"));
    expect(conBandeja.searchParams.get("config_id")).toBe("cfg-bandeja");
    const normal = new URL((await worker.fetch(conSesion("/api/redes/meta/conectar"), env)).headers.get("Location"));
    expect(normal.searchParams.get("config_id")).toBe("cfg-base");
  });
});

describe("la Biblioteca de anuncios de Meta", () => {
  // Las rutas de /api/biblioteca, pedidas por la puerta. El acotado de los
  // filtros por espacio y colaborador va contra una D1 de verdad en
  // tests/migracion/biblioteca.test.js; aquí, que se llega a cada rama.
  const TOKEN_META = "EAAG-token";
  async function conMeta(conectado = true) {
    const env = { ...(await entorno()), META_APP_ID: "app", META_APP_SECRET: "secreto-meta" };
    const fila = conectado ? { id: "u-jefe", owner_id: "u-jefe", nombre: "Juan", token_cifrado: await cifrarMeta(env, TOKEN_META) } : null;
    const base = env.DB;
    env.DB = {
      prepare(sql) {
        if (/^select \* from integracion_meta where id = \? and owner_id = \?/.test(sql)) {
          return { bind() { return this; }, first: async () => fila, all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 0 } }) };
        }
        return base.prepare(sql);
      },
    };
    return env;
  }
  const buscarPor = (consulta) => conSesion(`/api/biblioteca/buscar?c=${encodeURIComponent(JSON.stringify(consulta))}`);

  afterEach(() => vi.unstubAllGlobals());

  it("GET /api/biblioteca dice si Meta está conectado y trae los filtros", async () => {
    const res = await worker.fetch(conSesion("/api/biblioteca"), await conMeta());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ meta: { configurado: true, conectado: true }, filtros: [] });
  });

  it("GET /api/biblioteca/buscar llega a Meta UNA vez y no devuelve el token", async () => {
    const pedidas = [];
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      pedidas.push(new URL(String(url)));
      return new Response(JSON.stringify({ data: [{ id: "99999", page_name: "P", ad_snapshot_url: `https://www.facebook.com/ads/archive/render_ad/?id=99999&access_token=${TOKEN_META}` }] }));
    }));
    const res = await worker.fetch(buscarPor({ texto: "vacunación" }), await conMeta());
    expect(res.status).toBe(200);
    expect(pedidas).toHaveLength(1);
    expect(pedidas[0].pathname).toMatch(/\/ads_archive$/);
    const texto = await res.text();
    expect(texto).not.toContain(TOKEN_META);
    expect(JSON.parse(texto).anuncios[0].enlace).toBe("https://www.facebook.com/ads/library/?id=99999");
  });

  it("buscar sin Meta conectado es un 409 que manda a Ajustes", async () => {
    const res = await worker.fetch(buscarPor({ texto: "x" }), await conMeta(false));
    expect(res.status).toBe(409);
  });

  it("una búsqueda que no es JSON es un 400, no un 500", async () => {
    const res = await worker.fetch(conSesion("/api/biblioteca/buscar?c=%7Bno"), await conMeta());
    expect(res.status).toBe(400);
  });

  it("POST, PATCH y DELETE de filtros llegan a su rama", async () => {
    const env = await conMeta();
    const post = await worker.fetch(conSesion("/api/biblioteca/filtros", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Competencia", clientId: "cliente-1", consulta: { texto: "muebles" } }),
    }), env);
    expect(post.status).toBe(201);
    // La D1 de mentira no guarda: el filtro no existe al pedirlo, y eso es el 404 de ESA rama, no el de «Ruta».
    for (const method of ["PATCH", "DELETE"]) {
      const res = await worker.fetch(conSesion("/api/biblioteca/filtros/f1", {
        method, headers: { "Content-Type": "application/json" }, body: method === "PATCH" ? "{}" : undefined,
      }), env);
      expect(res.status).toBe(404);
      expect((await res.json()).error).toMatch(/Filtro/);
    }
  });

  it("una ruta de la biblioteca que no existe es 404 «Ruta»", async () => {
    const res = await worker.fetch(conSesion("/api/biblioteca/otra", { method: "POST" }), await conMeta());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/Ruta/);
  });
});

describe("anuncios de Meta (/api/anuncios)", () => {
  // La lógica entera, contra una D1 de verdad, está en anuncios.test.js.
  // Aquí sólo que la puerta llega a sus ramas y que activar no se cuela.
  it("el estado llega a su rama: sin Meta configurado lo dice, con 200", async () => {
    const env = await entorno();
    const res = await worker.fetch(conSesion("/api/anuncios/estado"), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ configurado: false, conectado: false, cuentas: [] });
  });

  it("activar siendo editor es 403 antes de mirar nada más", async () => {
    const env = await entorno({ rol: "editor" });
    const res = await worker.fetch(conSesion("/api/anuncios/clientes/cliente-1/campanas/123/activar", {
      method: "POST", body: JSON.stringify({ confirmado: true }), headers: { "Content-Type": "application/json" },
    }), env);
    expect(res.status).toBe(403);
  });

  it("un cliente sin cuenta publicitaria es 409 con motivo, no un 500", async () => {
    const env = await entorno();
    const res = await worker.fetch(conSesion("/api/anuncios/clientes/cliente-1/campanas"), env);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/cuenta publicitaria/);
  });

  it("un cliente de otro espacio es 404", async () => {
    const env = await entorno();
    expect((await worker.fetch(conSesion("/api/anuncios/clientes/cliente-de-otro/campanas"), env)).status).toBe(404);
  });

  it("una ruta que no existe es 404, y sin sesión 401", async () => {
    const env = await entorno();
    expect((await worker.fetch(conSesion("/api/anuncios/no-existe"), env)).status).toBe(404);
    expect((await worker.fetch(new Request("https://calendarios.test/api/anuncios/estado"), env)).status).toBe(401);
  });
});
