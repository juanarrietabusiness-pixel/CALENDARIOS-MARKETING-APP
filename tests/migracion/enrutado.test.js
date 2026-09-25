import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { sha256 } from "../../worker/lib/ids.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { cifrar, firmarEstado, olvidarToken } from "../../worker/lib/google.js";

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
    async get(clave) {
      if (!objetos.has(clave)) return null;
      return {
        body: objetos.get(clave),
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
      ia_razonamiento_chat: null, presupuesto_usd: 30, al_limite: "avisar",
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

  it("con Opus elegido usa el Opus más reciente que tenga la cuenta", async () => {
    const peticiones = anthropic({ modelos: ["claude-sonnet-5", "claude-opus-4-8", "claude-opus-5"], respuestas: [texto("ok")] });
    const env = { ...(await entorno({ ajustes: { ia_modelo: "opus", ia_razonamiento: "maximo" } })), ANTHROPIC_API_KEY: "k" };
    await worker.fetch(generar(), env);
    expect(peticiones[0].model).toBe("claude-opus-5");
    expect(peticiones[0].output_config).toEqual({ effort: "max" });
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

  it("poner un video en una publicación se rechaza: sólo imágenes", async () => {
    googleFalso({ clip: { mimeType: "video/mp4", parents: [RAIZ] } });
    const res = await worker.fetch(conSesion("/api/drive/clientes/cliente-1/a-publicacion", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: "clip" }),
    }), await conDrive());
    expect(res.status).toBe(400);
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
