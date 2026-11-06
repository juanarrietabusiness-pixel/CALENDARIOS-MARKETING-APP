import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { avanzarEncargo } from "../../worker/lib/estudio/encargos.js";
import { crearHerramientasEstudio } from "../../worker/lib/estudio/herramientas.js";
import { HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { formatoParaLaIA } from "../../src/lib/videoFormatoIA.js";
import { EJEMPLO_GUION } from "../../src/lib/videoFormatoIA.js";
import { marcaParaElVideo, paletaEnTokens, lineaDeReferenciasVideo } from "../../src/lib/estiloVideo.js";
import { pedidoDeGuionAnimado, pedidoDeGuionCancion } from "../../src/lib/guionAnimadoIA.js";
import { fondosPendientes, conFondosPuestos, erroresDeFondos, MAX_FONDOS, encargoDeFondo } from "../../src/lib/fondosVideo.js";
import { limpiarKit, fundirKit, clavesDeLaMarca } from "../../src/lib/kitMarca.js";

// ============================================================
// El ESTILO del video animado: el kit entero llega al guion (paleta en tokens, estilo, letra, reglas, lo aprendido,
// logo, música y el «estilo del video» obligatorio), sus imágenes de referencia van COMO IMÁGENES (y si el modelo no las
// recibe, sigue sin ellas y lo dice), y las IMÁGENES DE FONDO por sección: la IA las pide con «pide», el director las crea
// por un encargo (con su costo antes) y, al cerrarse, quedan puestas en el guion guardado. Con un Anthropic de mentira.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;
let peticiones;

/** El kit de 57DMC: negro dominante, dorado de acento, blanco para el texto, y el estilo de sus videos. */
const KIT_57 = {
  paleta: [
    { hex: "#000000", nombre: "Negro", rol: "fondo dominante" },
    { hex: "#D19E03", nombre: "Dorado", rol: "acento — CTA, líneas curvas" },
    { hex: "#FFFFFF", nombre: "Blanco", rol: "texto y títulos" },
  ],
  estilo: "serio, bíblico y editorial, pictórico dramático, alto contraste",
  tipografia: "sans muy pesada en mayúsculas",
  evitar: "colores saturados, emojis",
  reglas: ["El texto nunca encima de una cara"],
  logo: "clientes/bc/estudio/logo.png",
  modelos: { imagen: "gemini-2.5-flash-image" },
  presets: { anuncio: "PRESET SECRETO DE IMAGEN" },
  musica: { estilo: "rap cristiano con coros épicos", evitar: "reguetón" },
  estiloVideo: "Grabados bíblicos en blanco y negro (estilo Doré), oscurecidos, con grano y viñeta, zoom lento.\nTexto gigante arriba o abajo.",
  referenciasVideo: ["clientes/bc/estudio/ref1.png", "clientes/otro/estudio/ajena.png"],
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (t) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 4000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 900 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

/** Anthropic de mentira: cada respuesta es un texto, o `{ estado, mensaje }` para rechazar. */
function anthropic(respuestas) {
  peticiones = [];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      peticiones.push(JSON.parse(opciones.body));
      const r = respuestas.shift();
      if (r && typeof r === "object") return Response.json({ type: "error", error: { type: "invalid_request_error", message: r.mensaje } }, { status: r.estado });
      return flujo(r);
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}
const bloques = (p) => p.messages[0].content;
const textoPedido = (p) => (typeof bloques(p) === "string" ? bloques(p) : bloques(p).map((b) => b.text ?? "").join(""));
const imagenesDe = (p) => (typeof bloques(p) === "string" ? [] : bloques(p).filter((b) => b.type === "image"));

const pedir = (metodo, ruta, body) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  method: metodo, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
}), env);

/** Un guion con fondos por crear: el gancho y el cierre con su imagen (el mismo `pide` en las dos escenas del medio). */
function guionConFondos() {
  const g = JSON.parse(JSON.stringify(EJEMPLO_GUION));
  const fondo = (pide) => ({ tipo: "imagen", id: "fondo", encuadre: "completo", recorte: "cubrir", movimiento: "acercar", oscurecer: 0.45, tratamiento: "byn", pide });
  g.escenas[0].capas.unshift(fondo("Grabado de unas manos abiertas hacia la luz"));
  g.escenas[1].capas.unshift(fondo("Grabado de una multitud en el desierto"));
  g.escenas[2].capas.unshift(fondo("grabado de una multitud en el desierto "));
  return g;
}

beforeEach(async () => {
  db = d1EnMemoria();
  env = {
    DB: db, ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") },
    MEDIA: {
      get: async (k) => (k === "clientes/bc/estudio/ref1.png" ? { size: PNG.length, arrayBuffer: async () => PNG.buffer.slice(0), httpMetadata: { contentType: "image/png" } } : null),
      put: async () => {}, head: async () => null, delete: async () => {},
    },
  };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "y");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name, kit_marca) values (?,?,?,?)").run("bc", JEFE, "57DMC", JSON.stringify(limpiarKit(KIT_57)));
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, prompt) values (?,?,?,?,?,?,?)")
    .run("grabado1", JEFE, "bc", "clientes/bc/estudio/grabado.png", "imagen", "image/png", "Grabado de Doré: Moisés en el monte");
}, 30_000);
afterEach(() => { vi.unstubAllGlobals(); });

describe("el kit contado al video (puro)", () => {
  it("la paleta va en TOKENS del motor, con el nombre y el papel de cada color", () => {
    const { lineas } = paletaEnTokens(KIT_57.paleta);
    const texto = lineas.join("\n");
    expect(texto).toMatch(/«fondo» = #000000 \(Negro — fondo dominante\)/);
    expect(texto).toMatch(/«acento» = #D19E03 \(Dorado/);
    expect(texto).toMatch(/«texto» = #FFFFFF \(Blanco — texto y títulos\)/);
  });

  it("lleva el estilo, la letra, lo que nunca, las reglas, el logo, la música y el ESTILO DEL VIDEO obligatorio; nada de lo interno", () => {
    const b = marcaParaElVideo(KIT_57);
    for (const algo of [/serio, bíblico y editorial/, /sans muy pesada/, /letra de la casa, Anton/, /Nunca: colores saturados/, /El texto nunca encima de una cara/,
      /el kit tiene logo/, /rap cristiano con coros épicos/, /ESTILO OBLIGATORIO[\s\S]*Grabados bíblicos[\s\S]*Texto gigante arriba/]) {
      expect(b).toMatch(algo);
    }
    expect(b).not.toMatch(/clientes\/|PRESET SECRETO|gemini-2\.5/);
    expect(marcaParaElVideo({})).toMatch(/letra de la casa/);
    expect(marcaParaElVideo({ paleta: [] })).not.toMatch(/ESTILO OBLIGATORIO/);
  });

  it("el kit guarda y conserva el estilo del video y sus referencias (y la papelera no las borra)", () => {
    const k = limpiarKit(KIT_57);
    expect(k.estiloVideo).toMatch(/^Grabados bíblicos[\s\S]*\nTexto gigante/);
    expect(k.referenciasVideo).toEqual(["clientes/bc/estudio/ref1.png", "clientes/otro/estudio/ajena.png"]);
    expect(limpiarKit({}).estiloVideo).toBeUndefined();
    const fundido = fundirKit(k, limpiarKit({ estilo: "otro" }));
    expect(fundido.estiloVideo).toBe(k.estiloVideo);
    expect(fundido.referenciasVideo).toEqual(k.referenciasVideo);
    expect(clavesDeLaMarca(k).get("clientes/bc/estudio/ref1.png")?.que).toMatch(/estilo de los videos/);
  });

  it("los pedidos llevan el kit, la línea de las referencias y, con fondos, las reglas de los fondos", () => {
    const marcaVideo = marcaParaElVideo(KIT_57);
    const p = pedidoDeGuionAnimado({ marca: "57DMC", idea: "x", segundos: 30, marcaVideo, referencias: 2, conFondos: true, galeria: "· grabado1 — Moisés" });
    expect(p).toMatch(/LA MARCA EN EL VIDEO/);
    expect(p).toMatch(/Las 2 imágenes de arriba son referencias del ESTILO/);
    expect(p).toMatch(/IMÁGENES DE FONDO[\s\S]*SIN «archivo»[\s\S]*GALERÍA DEL CLIENTE[\s\S]*grabado1/);
    const c = pedidoDeGuionCancion({ marca: "57DMC", duracion: 30, lineas: [{ desde: 0, hasta: 3, texto: "Hola", coro: false }], marcaVideo, conFondos: true });
    expect(c).toMatch(/TODO SALE DE LA CANCIÓN/);
    expect(c).toMatch(/el coro, cada vez que vuelve, con la misma/);
    expect(lineaDeReferenciasVideo(0)).toBe("");
  });
});

describe("los fondos por crear (puro)", () => {
  it("uno por cada «pide» distinto (sin mayúsculas ni espacios de más), con sus escenas", () => {
    expect(fondosPendientes(guionConFondos())).toEqual([
      { pide: "Grabado de unas manos abiertas hacia la luz", escenas: ["e1"] },
      { pide: "Grabado de una multitud en el desierto", escenas: ["e2", "e3"] },
    ]);
  });

  it("al ponerlos, sólo las capas sin archivo con ese «pide»; lo demás no se toca", () => {
    const { guion, n } = conFondosPuestos(guionConFondos(), { "grabado de una multitud en el desierto": "img2" });
    expect(n).toBe(2);
    expect(guion.escenas[1].capas[0].archivo).toBe("img2");
    expect(guion.escenas[0].capas[0].archivo).toBeUndefined();
    expect(fondosPendientes(guion)).toHaveLength(1);
  });

  it("más de la cuenta es un error para la vuelta de corrección", () => {
    const g = guionConFondos();
    g.escenas[0].capas.splice(0, 1, ...Array.from({ length: MAX_FONDOS + 1 }, (_, i) => ({ tipo: "imagen", encuadre: "completo", pide: `fondo ${i}` })));
    expect(erroresDeFondos(g)[0].mensaje).toMatch(/como mucho 8/);
  });

  it("el director recibe lo que muestra, el estilo del video y la orden de no poner texto ni logo", () => {
    const e = encargoDeFondo("Manos hacia la luz", { estiloVideo: "Grabados de Doré", marca: "57DMC" });
    expect(e).toMatchObject({ formato: "historia", proporcion: "9:16", sinTexto: true, escena: "Manos hacia la luz" });
    expect(e.idea).toMatch(/Grabados de Doré/);
    expect(e.indicacion).toMatch(/SIN ningún texto, letra, logo/);
  });
});

describe("POST /api/videos/<c>/escribir con el kit", () => {
  it("manda las referencias del estilo COMO IMÁGENES (sólo las de este cliente) y el kit en el texto", async () => {
    anthropic([JSON.stringify(EJEMPLO_GUION)]);
    const r = await pedir("POST", "/videos/bc/escribir", { idea: "Las manos más bellas de la historia" });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.referencias).toBe(1);
    expect(imagenesDe(peticiones[0])).toHaveLength(1);
    const t = textoPedido(peticiones[0]);
    expect(t).toMatch(/«fondo» = #000000/);
    expect(t).toMatch(/ESTILO OBLIGATORIO[\s\S]*Grabados bíblicos/);
    expect(t).toMatch(/La imagen de arriba es una referencia del ESTILO/);
  });

  it("si el modelo no recibe imágenes, escribe sin ellas y lo dice", async () => {
    anthropic([{ estado: 400, mensaje: "Image input is not supported for this request" }, JSON.stringify(EJEMPLO_GUION)]);
    const r = await pedir("POST", "/videos/bc/escribir", { idea: "x" });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.referencias).toBe(0);
    expect(j.aviso).toMatch(/no recibió las imágenes de referencia/);
    expect(imagenesDe(peticiones[1])).toHaveLength(0);
    expect(textoPedido(peticiones[1])).not.toMatch(/imagen de arriba/);
  });

  it("con imágenes de fondo: el pedido lleva sus reglas y la galería; la respuesta dice cuántos fondos faltan", async () => {
    anthropic([JSON.stringify(guionConFondos())]);
    const r = await pedir("POST", "/videos/bc/escribir", { idea: "x", conFondos: true });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.fondos).toBe(2);
    expect(textoPedido(peticiones[0])).toMatch(/IMÁGENES DE FONDO[\s\S]*grabado1 — Grabado de Doré/);
    expect(j.guion.escenas[0].capas[0]).toMatchObject({ pide: expect.stringMatching(/manos/), tratamiento: "byn", encuadre: "completo" });
  });
});

describe("crear las imágenes de fondo de un video guardado", () => {
  async function videoGuardado() {
    const r = await pedir("POST", "/videos/bc", { guion: guionConFondos(), titulo: "Las manos" });
    expect(r.status).toBe(201);
    return (await r.json()).video;
  }

  it("dice cuántos faltan y su costo; sin «confirmado», 409 con el costo y sin crear nada", async () => {
    const video = await videoGuardado();
    const e = await (await pedir("GET", `/videos/bc/${video.id}/fondos`)).json();
    expect(e.pendientes).toBe(2);
    expect(e.enCurso).toBeNull();
    const r = await pedir("POST", `/videos/bc/${video.id}/fondos`, {});
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j).toMatchObject({ codigo: "confirmar", fondos: 2 });
    expect(db.sqlite.prepare("select count(*) n from estudio_encargos").get().n).toBe(0);
  });

  it("con el sí: un encargo del director (9:16, sin texto ni logo); un segundo pedido mientras va, 409", async () => {
    const video = await videoGuardado();
    const r = await pedir("POST", `/videos/bc/${video.id}/fondos`, { confirmado: true });
    expect(r.status).toBe(202);
    const fila = db.sqlite.prepare("select * from estudio_encargos").get();
    const datos = JSON.parse(fila.datos);
    const pasos = JSON.parse(fila.pasos);
    expect(datos.fondosVideo.videoId).toBe(video.id);
    expect(datos.mejorar).toBe(true);
    expect(pasos).toHaveLength(2);
    expect(pasos[0].encargo).toMatchObject({ proporcion: "9:16", sinTexto: true });
    expect(pasos[0].pedido.prompt).not.toMatch(/ÚLTIMA imagen de referencia es el logo/);
    expect(pasos[0].pedido.medios.reference ?? []).not.toContain("clientes/bc/estudio/logo.png");
    expect(pasos[0].controlar).toBe(false);
    const otra = await pedir("POST", `/videos/bc/${video.id}/fondos`, { confirmado: true });
    expect(otra.status).toBe(409);
    expect((await otra.json()).codigo).toBe("en_curso");
  });

  it("al cerrarse el encargo, cada fondo queda en las capas de su «pide» del guion guardado (otra versión)", async () => {
    const video = await videoGuardado();
    await pedir("POST", `/videos/bc/${video.id}/fondos`, { confirmado: true });
    const fila = db.sqlite.prepare("select * from estudio_encargos").get();
    const pasos = JSON.parse(fila.pasos).map((p, i) => ({ ...p, fase: "hecho", opciones: [{ id: `img${i + 1}`, fase: "hecho" }], finales: [`img${i + 1}`] }));
    db.sqlite.prepare("update estudio_encargos set pasos = ? where id = ?").run(JSON.stringify(pasos), fila.id);
    await avanzarEncargo(env, crearAcceso(db, JEFE), fila.id);
    const despues = db.sqlite.prepare("select * from videos_proyectos where id = ?").get(video.id);
    const g = JSON.parse(despues.guion);
    expect(g.escenas[0].capas[0].archivo).toBe("img1");
    expect(g.escenas[1].capas[0].archivo).toBe("img2");
    expect(g.escenas[2].capas[0].archivo).toBe("img2");
    expect(despues.version).toBe(video.version + 1);
    expect(JSON.parse(db.sqlite.prepare("select datos from estudio_encargos").get().datos).fondosPuestos).toEqual({ n: 3 });
  });

  it("sin fondos por crear, 409 sin crear nada", async () => {
    const r0 = await pedir("POST", "/videos/bc", { guion: EJEMPLO_GUION, titulo: "Sin fondos" });
    const v = (await r0.json()).video;
    const r = await pedir("POST", `/videos/bc/${v.id}/fondos`, { confirmado: true });
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe("sin_fondos");
  });
});

describe("Claude y el asistente", () => {
  const herramientas = () => crearHerramientasEstudio({
    env, acceso: crearAcceso(db, JEFE), resolverCliente: async () => db.sqlite.prepare("select * from clients where id = 'bc'").get(),
    usuario: { id: JEFE, nombre: "Juan" }, origen: "claude", por: { userId: JEFE, nombre: "Juan" },
  });

  it("formato_video explica el texto con carácter y los fondos por crear", () => {
    const f = formatoParaLaIA();
    expect(f).toMatch(/TEXTO CON CARÁCTER[\s\S]*\*asteriscos\*[\s\S]*gigante[\s\S]*porPalabra[\s\S]*golpe/);
    expect(f).toMatch(/FONDO POR CREAR[\s\S]*«pide»/);
  });

  it("fondos_video está en el MCP (escribe): sin confirmar, NO SE CREÓ NADA con el costo; con el sí, el encargo", async () => {
    const def = HERRAMIENTAS_MCP.find((x) => x.name === "fondos_video");
    expect(def.annotations?.readOnlyHint).toBe(false);
    expect(HERRAMIENTAS_MCP.find((x) => x.name === "video_con_cancion").inputSchema.properties.con_fondos).toBeDefined();
    const r0 = await pedir("POST", "/videos/bc", { guion: guionConFondos(), titulo: "Las manos" });
    const video = (await r0.json()).video;
    const h = herramientas();
    const visto = await h.ver_video({ video_id: video.id });
    expect(typeof visto === "string" ? visto : visto.texto).toMatch(/Imágenes de fondo POR CREAR: 2/);
    const sin = await h.fondos_video({ video_id: video.id });
    expect(sin).toMatch(/^NO SE CREÓ NADA\. Crear las 2 imágenes de fondo cuesta/);
    expect(db.sqlite.prepare("select count(*) n from estudio_encargos").get().n).toBe(0);
    const con = await h.fondos_video({ video_id: video.id, confirmado: true });
    expect(con).toMatch(/Pedidas las 2 imágenes de fondo/);
    expect(db.sqlite.prepare("select count(*) n from estudio_encargos").get().n).toBe(1);
  });

  it("ver_estudio dice el estilo de los videos de la marca", async () => {
    const r = await herramientas().ver_estudio({});
    expect(typeof r === "string" ? r : r.texto).toMatch(/ESTILO DE LOS VIDEOS DE LA MARCA[\s\S]*Grabados bíblicos/);
  });
});
