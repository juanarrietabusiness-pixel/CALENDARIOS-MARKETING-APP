import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { crearEjecutor } from "../../worker/lib/herramientasServidor.js";
import { HERRAMIENTAS_CON_VISTA } from "../../worker/rutas/mcp.js";
import { firmarCon } from "../../worker/lib/firmas.js";
import {
  claveServible, direccionDeVista, claveDeTestigoVista, secretoDeVista, CLAVE_SECRETO_VISTA, VIDA_MEDIO_VISTA_MS,
} from "../../worker/lib/medioVista.js";
import { vistaDeEncargo } from "../../worker/lib/estudio/vistaEstudio.js";
import {
  URI_VISTA, MIME_VISTA, CON_VISTA, SOLO_DE_LA_VISTA, vistaDe, medioDe, direccionValida, conEnlace, leerResultado, conFallo,
  tocaRenovar, conRenovados, reloj, metaDeVista, MARGEN_CADUCA,
} from "../../worker/lib/mcpVista/modelo.js";
import { PAGINA_VISTA } from "../../worker/lib/mcpVista/pagina.generada.js";

// ============================================================
// OÍR y VER en la vista previa del chat de Claude (MCP Apps)
//
//   · Una dirección FIRMADA y de corta vida para un audio o un video de R2 (/api/vista-medio/<testigo>/<nombre>): sin
//     sesión, por trozos (Range → 206), sólo lo que dice el testigo, sólo audio o video, sólo de `clientes/` o `voces/`,
//     y caduca. Se firma con un secreto que se crea solo (en R2, fuera de `clientes/`).
//   · El recurso de la vista (vista-2) declara el origen del conector en su `csp.resourceDomains` (sin eso el iframe
//     no cargaría ningún audio); nada más.
//   · Las herramientas que suenan o se reproducen (previsualizar_voz, generar_locucion, generar_musica, estado_trabajo,
//     ver_video, renderizar_video, estado_reel) devuelven la vista con sus reproductores, y la dirección también en el
//     texto. El asistente de la aplicación sigue recibiendo sólo el texto.
//   · Una dirección que caducó se renueva (vista_medios), por la capa de acceso.
// ============================================================

const ANA = "u-ana";
const OTRO = "u-otro";
const ORIGEN = "https://calendarios.test";
const VUELTA = "https://claude.ai/api/mcp/auth_callback";
const VOZ = "hpp4J3VqNfWAUOO0d1Us";
const MUESTRA = `voces/elevenlabs/v3/${VOZ}.mp3`;

let db;
let env;
let acceso;

/** Un MP3 de mentira (su cabecera ID3 basta: la ruta no lo abre). */
const mp3 = (n = 64) => { const b = new Uint8Array(n); b.set([0x49, 0x44, 0x33, 4]); for (let i = 4; i < n; i++) b[i] = i % 251; return b; };

/** R2 de mentira, con trozos como R2 (`range` con las cabeceras de la petición) y su tipo. */
function r2() {
  const objetos = new Map();
  const bytesDe = async (v) => (v instanceof Uint8Array ? v : new Uint8Array(await new Response(v).arrayBuffer()));
  return {
    objetos,
    async head(k) { const o = objetos.get(k); return o ? { size: o.bytes.length, httpMetadata: { contentType: o.tipo }, httpEtag: '"e"' } : null; },
    async get(k, opciones) {
      const o = objetos.get(k);
      if (!o) return null;
      const cabecera = opciones?.range?.get?.("Range") ?? "";
      const m = /^bytes=(\d+)-(\d*)$/.exec(cabecera);
      if (m && Number(m[1]) >= o.bytes.length) throw new Error("rango fuera");
      const range = m ? { offset: Number(m[1]), length: Math.min(o.bytes.length - 1, m[2] ? Number(m[2]) : o.bytes.length - 1) - Number(m[1]) + 1 } : undefined;
      const trozo = range ? o.bytes.slice(range.offset, range.offset + range.length) : o.bytes;
      return {
        body: new Response(trozo).body, size: o.bytes.length, range, httpEtag: '"e"', httpMetadata: { contentType: o.tipo },
        arrayBuffer: async () => trozo.buffer.slice(trozo.byteOffset, trozo.byteOffset + trozo.byteLength),
      };
    },
    async put(k, v, op) { objetos.set(k, { bytes: await bytesDe(v), tipo: op?.httpMetadata?.contentType }); },
    async delete(k) { for (const x of [].concat(k)) objetos.delete(x); },
  };
}
const poner = (clave, tipo, bytes = mp3()) => env.MEDIA.objetos.set(clave, { bytes, tipo });

function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[ANA, "ana@a.com"], [OTRO, "otro@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
  }
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", ANA, "Feria del Lente");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRO, "Ajeno");
}

function archivo(id, { cliente = "c1", tipo = "audio", mime = "audio/mpeg", prompt = "", ajustes = {} } = {}) {
  const clave = `clientes/${cliente}/estudio/${id}.${mime === "video/mp4" ? "mp4" : "mp3"}`;
  poner(clave, mime);
  db.sqlite.prepare(
    "insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, ancho, alto, prompt, modelo, origen, ajustes, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(id, cliente === "c9" ? OTRO : ANA, cliente, clave, tipo, mime, 0, 0, prompt, "prueba", "estudio", JSON.stringify(ajustes), "2026-11-06T00:00:00.000Z");
  return clave;
}

function trabajo(id, { estado = "hecho", tipo = "audio", ajustes = {}, archivos = [], n = 1 } = {}) {
  db.sqlite.prepare(
    "insert into estudio_trabajos (id, owner_id, client_id, estado, tipo, motor, modelo, prompt, n, ajustes, medios, remoto, archivos, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(id, ANA, "c1", estado, tipo, "kie", "elevenlabs-v3-kie", "Hola", n, JSON.stringify(ajustes), "{}", "[]", JSON.stringify(archivos), "2026-11-06T00:00:00.000Z", "2026-11-06T00:00:00.000Z");
}

function video(id, { estado = "renderizado", render = {}, locucion = {}, cliente = "c1" } = {}) {
  db.sqlite.prepare("insert into videos_proyectos (id, owner_id, client_id, titulo, estado, version, aprobada_version, render, locucion) values (?,?,?,?,?,?,?,?,?)")
    .run(id, cliente === "c9" ? OTRO : ANA, cliente, "Lentes en 30 s", estado, 1, 1, JSON.stringify(render), JSON.stringify(locucion));
}

const mcp = () => crearHerramientasMCP({ env, acceso, usuario: { id: ANA, nombre: "Ana" } });
const pedir = (ruta, opciones = {}) => worker.fetch(new Request(`${ORIGEN}${ruta}`, opciones), env, {});
const textoDe = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), KIE_API_KEY: "kie-de-prueba", ASSETS: { fetch: () => new Response("spa") } };
  acceso = crearAcceso(db, ANA);
  sembrar();
  // Ningún servicio de verdad: si algo llama fuera, falla.
  vi.stubGlobal("fetch", async (url) => { throw new Error(`fetch inesperado: ${url}`); });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

// ------------------------------------------------------------
// La dirección firmada
// ------------------------------------------------------------

describe("la dirección firmada", () => {
  it("sólo se firma lo de un cliente o una muestra de voz, sin rodeos", () => {
    for (const ok of ["clientes/c1/estudio/a.mp3", MUESTRA, "voces/v3/x.wav"]) expect(claveServible(ok), ok).toBe(true);
    for (const no of ["", "firmas/vista-medios.key", "cerebro/c1/indice.json", "turnos/u/t.json", "voces/pendientes/t1.mp3", "clientes/c1/../c9/a.mp3",
      "clientes//a.mp3", "clientes/c1/", "clientes/c1/a\nb.mp3", "suelta.mp3"]) {
      expect(claveServible(no), JSON.stringify(no)).toBe(false);
    }
  });

  it("el secreto se crea solo la primera vez (en R2, fuera de clientes/) y luego se reutiliza", async () => {
    const uno = await secretoDeVista(env);
    expect(uno).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(env.MEDIA.objetos.has(CLAVE_SECRETO_VISTA)).toBe(true);
    expect(CLAVE_SECRETO_VISTA.startsWith("clientes/")).toBe(false);
    // Otra instancia (otro recuerdo, el mismo R2) lee el mismo.
    const otraInstancia = { MEDIA: { ...env.MEDIA, get: env.MEDIA.get, put: env.MEDIA.put } };
    expect(await secretoDeVista(otraInstancia)).toBe(uno);
    expect(await secretoDeVista({})).toBeNull();
  });

  it("firma y lee la clave; con otra firma, tocada o caducada, no vale", async () => {
    const d = await direccionDeVista(env, "/api/media/clientes/c1/estudio/a.mp3");
    expect(d.url).toMatch(/^\/api\/vista-medio\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/a\.mp3$/);
    expect(d.caduca).toBeGreaterThan(Date.now() + VIDA_MEDIO_VISTA_MS - 5000);
    const testigo = d.url.split("/")[3];
    expect(await claveDeTestigoVista(env, testigo)).toBe("clientes/c1/estudio/a.mp3");
    expect(await claveDeTestigoVista(env, await firmarCon("otro-secreto", "vista-medio", { c: "clientes/c1/estudio/a.mp3" }, 60_000))).toBeNull();
    const [cuerpo, firma] = testigo.split(".");
    const tocado = Buffer.from(JSON.stringify({ c: "clientes/c9/estudio/b.mp3", e: Date.now() + 60_000 })).toString("base64url");
    expect(await claveDeTestigoVista(env, `${tocado}.${firma}`)).toBeNull();
    expect(cuerpo).not.toBe(tocado);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + VIDA_MEDIO_VISTA_MS + 1000);
    expect(await claveDeTestigoVista(env, testigo)).toBeNull();
    expect(await direccionDeVista(env, "cerebro/c1/indice.json")).toBeNull();
  });
});

describe("GET /api/vista-medio (sin sesión)", () => {
  it("sirve el audio por trozos (206), con nosniff, sandbox, caché privada y para otro origen; HEAD sin cuerpo", async () => {
    archivo("l1");
    const { url } = await direccionDeVista(env, "clientes/c1/estudio/l1.mp3");
    const todo = await pedir(url);
    expect(todo.status).toBe(200);
    expect(todo.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(todo.headers.get("Accept-Ranges")).toBe("bytes");
    expect(todo.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(todo.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(todo.headers.get("Cache-Control")).toMatch(/^private/);
    expect(todo.headers.get("Cross-Origin-Resource-Policy")).toBe("cross-origin");
    expect(new Uint8Array(await todo.arrayBuffer())).toEqual(mp3());

    // Safari en el iPhone pide `bytes=0-1` antes de nada: sin 206 no reproduce.
    const trozo = await pedir(url, { headers: { Range: "bytes=0-1" } });
    expect(trozo.status).toBe(206);
    expect(trozo.headers.get("Content-Range")).toBe("bytes 0-1/64");
    expect(trozo.headers.get("Content-Length")).toBe("2");
    expect([...new Uint8Array(await trozo.arrayBuffer())]).toEqual([0x49, 0x44]);
    expect((await pedir(url, { headers: { Range: "bytes=500-" } })).status).toBe(416);

    const cabeza = await pedir(url, { method: "HEAD" });
    expect(cabeza.status).toBe(200);
    expect(cabeza.headers.get("Content-Length")).toBe("64");
    expect((await pedir(url, { method: "POST" })).status).not.toBe(200);
  });

  it("sin firma, con otra, caducada, o lo que no es audio ni video ni de un cliente: 404 (nunca pide sesión)", async () => {
    archivo("l1");
    poner("clientes/c1/estudio/foto.png", "image/png");
    poner("cerebro/c1/indice.json", "application/json");
    const { url } = await direccionDeVista(env, "clientes/c1/estudio/l1.mp3");
    expect((await pedir("/api/vista-medio/nada/l1.mp3")).status).toBe(404);
    expect((await pedir(`/api/vista-medio/${await firmarCon("otro", "vista-medio", { c: "clientes/c1/estudio/l1.mp3" }, 60_000)}/l1.mp3`)).status).toBe(404);
    // Firmada con el secreto de verdad, pero de algo que no sale por aquí.
    const secreto = await secretoDeVista(env);
    for (const c of ["clientes/c1/estudio/foto.png", "cerebro/c1/indice.json", CLAVE_SECRETO_VISTA]) {
      const r = await pedir(`/api/vista-medio/${await firmarCon(secreto, "vista-medio", { c }, 60_000)}/x`);
      expect(r.status, c).toBe(404);
    }
    // Un archivo que ya no está.
    env.MEDIA.objetos.delete("clientes/c1/estudio/l1.mp3");
    expect((await pedir(url)).status).toBe(404);
    poner("clientes/c1/estudio/l1.mp3", "audio/mpeg");
    expect((await pedir(url)).status).toBe(200);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + VIDA_MEDIO_VISTA_MS + 1000);
    expect((await pedir(url)).status).toBe(404);
  });
});

// ------------------------------------------------------------
// Lo puro de la vista
// ------------------------------------------------------------

describe("los audios y videos en la vista (lo puro)", () => {
  it("medioDe limpia: sólo http(s) o la relativa de la API; nada de javascript: ni data:", () => {
    expect(direccionValida("https://x.test/a.mp3")).toBe(true);
    expect(direccionValida("/api/vista-medio/t.f/a.mp3")).toBe(false);
    expect(direccionValida("/api/vista-medio/t.f/a.mp3", { relativa: true })).toBe(true);
    for (const malo of ["javascript:alert(1)", "data:audio/mpeg;base64,AAA", "/api/media/clientes/c1/a.mp3", "https://x.test/a b.mp3"]) {
      expect(direccionValida(malo, { relativa: true }), malo).toBe(false);
    }
    const m = medioDe({ id: "a1", url: "javascript:alert(1)", titulo: "Voz", duracion: 31.26, estado: "raro", caduca: 5, ref: "archivo:a1" });
    expect(m).toEqual({ id: "a1", ref: "archivo:a1", url: null, titulo: "Voz", duracion: 31.3, estado: "lista", caduca: 5 });
    const v = vistaDe({ tipo: "medios", audios: [m], videos: Array.from({ length: 20 }, (_, i) => medioDe({ id: `v${i}` })) });
    expect(v.tipo).toBe("medios");
    expect(v.audios).toHaveLength(1);
    expect(v.videos).toHaveLength(12);
    expect(vistaDe({}).audios).toBeUndefined();
    expect(reloj(31.4)).toBe("0:31");
    expect(reloj(65)).toBe("1:05");
    expect(reloj(0)).toBe("");
  });

  it("conEnlace pone el origen del conector en las direcciones (vista y texto), sin tocar las que ya lo tienen", () => {
    const rel = "/api/vista-medio/abc.def/l1.mp3";
    const r = conEnlace({
      content: [{ type: "text", text: `Oírla: ${rel}\n· otra: ${ORIGEN}${rel}` }],
      structuredContent: { texto: `(${rel})`, ...vistaDe({ tipo: "medios", audios: [medioDe({ id: "l1", url: rel })], videos: [medioDe({ id: "v1", url: "https://otro.test/v.mp4" })] }) },
    }, ORIGEN);
    expect(r.structuredContent.audios[0].url).toBe(`${ORIGEN}${rel}`);
    expect(r.structuredContent.videos[0].url).toBe("https://otro.test/v.mp4");
    expect(r.content[0].text).toBe(`Oírla: ${ORIGEN}${rel}\n· otra: ${ORIGEN}${rel}`);
    expect(r.structuredContent.texto).toBe(`(${ORIGEN}${rel})`);
    expect(conEnlace({ content: [] }, "")).toEqual({ content: [] });
  });

  it("la página no le cambia la dirección a lo que ya suena; marca lo que no cargó y renueva sólo lo caducado", () => {
    const a = (url, extra = {}) => medioDe({ id: "l1", url, ref: "archivo:l1", caduca: 1000, ...extra });
    const uno = leerResultado({ content: [], structuredContent: vistaDe({ tipo: "medios", audios: [a("https://x.test/1"), medioDe({ id: "rel", url: "/api/vista-medio/t.f/x.mp3" })] }) });
    expect(uno.audios.map((m) => m.url)).toEqual(["https://x.test/1", null]);
    // Una vuelta trae otra firma: se queda la que ya estaba en el reproductor.
    const dos = leerResultado({ content: [], structuredContent: vistaDe({ tipo: "medios", audios: [a("https://x.test/2", { caduca: 2000 })] }) }, uno);
    expect(dos.audios[0]).toMatchObject({ url: "https://x.test/1", caduca: 1000 });
    const mal = conFallo(dos, "audio", "l1");
    expect(mal.audios[0].fallo).toBe(true);
    // Con el fallo puesto, la siguiente vuelta sí trae la nueva.
    expect(leerResultado({ content: [], structuredContent: vistaDe({ tipo: "medios", audios: [a("https://x.test/3")] }) }, mal).audios[0].url).toBe("https://x.test/3");

    expect(tocaRenovar({ ref: "archivo:l1", caduca: 10_000_000 }, 10_000_000 - MARGEN_CADUCA)).toBe(true);
    expect(tocaRenovar({ ref: "archivo:l1", caduca: 10_000_000 }, 1)).toBe(false);
    expect(tocaRenovar({ ref: "archivo:l1" }, 1)).toBe(true);
    expect(tocaRenovar({ ref: "archivo:l1", renovado: true }, 1)).toBe(false);
    expect(tocaRenovar({ caduca: 1 }, 5)).toBe(false);

    const renovado = conRenovados(mal, { structuredContent: vistaDe({ tipo: "medios", audios: [medioDe({ id: "otro-id", ref: "archivo:l1", url: "https://x.test/nueva", caduca: 9 })] }) });
    expect(renovado.audios[0]).toMatchObject({ url: "https://x.test/nueva", caduca: 9, fallo: false, renovado: true });
    expect(conRenovados(mal, { structuredContent: {} })).toBe(mal);
  });

  it("el recurso declara SÓLO el origen del conector (y sólo uno de verdad)", () => {
    expect(metaDeVista(ORIGEN)).toEqual({ ui: { prefersBorder: true, csp: { connectDomains: [], resourceDomains: [ORIGEN] } } });
    for (const raro of ["", "javascript:alert(1)", `${ORIGEN}/mcp`, "ftp://x.test", "*"]) expect(metaDeVista(raro).ui.csp.resourceDomains, raro).toEqual([]);
  });
});

// ------------------------------------------------------------
// Las herramientas
// ------------------------------------------------------------

describe("qué herramientas llevan la vista", () => {
  it("las que suenan o se reproducen nombran vista-2; las nuevas de la vista no se le dan al modelo", () => {
    expect(URI_VISTA).toBe("ui://juancito-ads/vista-2.html");
    const por = Object.fromEntries(HERRAMIENTAS_CON_VISTA.map((h) => [h.name, h]));
    for (const n of ["previsualizar_voz", "generar_locucion", "generar_musica", "renderizar_video", "ver_video", "estado_trabajo", "estado_reel"]) {
      expect(CON_VISTA, n).toContain(n);
      expect(por[n]._meta.ui.resourceUri, n).toBe(URI_VISTA);
    }
    for (const n of ["vista_video", "vista_medios"]) {
      expect(SOLO_DE_LA_VISTA).toContain(n);
      expect(por[n]._meta.ui).toEqual({ visibility: ["app"] });
      expect(HERRAMIENTAS_MCP.find((h) => h.name === n).annotations.readOnlyHint).toBe(true);
    }
  });
});

describe("la voz y la música", () => {
  it("previsualizar_voz ya hecha: la muestra suena en la vista y su dirección va en el texto; el asistente sólo lee el texto", async () => {
    poner(MUESTRA, "audio/mpeg");
    const r = await mcp().llamar("previsualizar_voz", { cliente: "Feria", voz: VOZ });
    expect(r.isError).toBeUndefined();
    const a = r.structuredContent.audios[0];
    expect(r.structuredContent).toMatchObject({ vista: 1, tipo: "medios", cliente: { id: "c1" } });
    expect(a).toMatchObject({ estado: "lista", ref: `muestra:v3:${VOZ}:`, titulo: expect.stringMatching(/^Muestra de /) });
    expect(textoDe(r)).toContain(a.url);
    expect(textoDe(r)).toMatch(/caduca en 12 h/);
    const asistente = crearEjecutor({ env, acceso, estudio: { usuario: { id: ANA, nombre: "Ana" }, por: { userId: ANA, nombre: "Ana" }, origen: "app" } });
    const tr = await asistente.ejecutar({ id: "x", name: "previsualizar_voz", input: { cliente: "Feria", voz: VOZ } });
    expect(typeof tr.content).toBe("string");
    expect(tr.content).toMatch(/ya está hecha/);
  });

  it("estado_trabajo de una locución terminada: su reproductor y su dirección; en marcha, el hueco y que siga", async () => {
    archivo("l1", { ajustes: { duracion: 12.3 } });
    trabajo("t1", { ajustes: { para: "locucion", vozNombre: "Bella", modeloVoz: "v3", vozId: VOZ }, archivos: ["l1"] });
    const r = await mcp().llamar("estado_trabajo", { trabajo_id: "t1" });
    expect(r.structuredContent).toMatchObject({ tipo: "medios", titulo: "Locución · Bella", piezas: [] });
    expect(r.structuredContent.audios[0]).toMatchObject({ id: "l1", ref: "archivo:l1", voz: "Bella", duracion: 12.3, estado: "lista" });
    expect(r.structuredContent.seguir).toBeUndefined();
    expect(textoDe(r)).toContain(r.structuredContent.audios[0].url);

    trabajo("t2", { estado: "en_marcha", ajustes: { para: "locucion", vozNombre: "Bella" } });
    const enMarcha = await mcp().llamar("estado_trabajo", { trabajo_id: "t2" });
    expect(enMarcha.structuredContent.audios[0]).toMatchObject({ estado: "en_marcha", url: null });
    expect(enMarcha.structuredContent.seguir).toMatchObject({ herramienta: "vista_trabajo", argumentos: { trabajo_id: "t2" } });
  });

  it("la muestra terminada sale de voces/ (no de la galería), y la música da sus dos versiones", async () => {
    poner(MUESTRA, "audio/mpeg");
    trabajo("tm", { ajustes: { para: "muestra", vozNombre: "Bella", modeloVoz: "v3", vozId: VOZ, duracion: 3.2 } });
    const m = await mcp().llamar("vista_trabajo", { trabajo_id: "tm" });
    expect(m.structuredContent.audios).toEqual([expect.objectContaining({ ref: `muestra:v3:${VOZ}:`, duracion: 3.2, url: expect.stringMatching(new RegExp(`/${VOZ}\\.mp3$`)) })]);

    archivo("m1", { prompt: "Pop (1)" });
    archivo("m2", { prompt: "Pop (2)" });
    trabajo("tmu", { ajustes: { para: "musica", pedido: { titulo: "Pop" } }, archivos: ["m1", "m2"] });
    const mu = await mcp().llamar("estado_trabajo", { trabajo_id: "tmu" });
    expect(mu.structuredContent.titulo).toBe("Música «Pop»");
    expect(mu.structuredContent.audios.map((a) => a.titulo)).toEqual(["Pop (1)", "Pop (2)"]);
    // Las dos se oyen de verdad por su dirección.
    for (const a of mu.structuredContent.audios) expect((await pedir(a.url, { headers: { Range: "bytes=0-3" } })).status).toBe(206);
  });

  it("un video del Estudio terminado va con su reproductor, no como pieza sin imagen", async () => {
    archivo("v1", { tipo: "video", mime: "video/mp4" });
    trabajo("tv", { tipo: "video", ajustes: {}, archivos: ["v1"] });
    const r = await mcp().llamar("estado_trabajo", { trabajo_id: "tv" });
    expect(r.structuredContent.tipo).toBe("medios");
    expect(r.structuredContent.piezas).toEqual([]);
    expect(r.structuredContent.videos[0]).toMatchObject({ id: "v1", ref: "archivo:v1", estado: "lista" });
  });
});

describe("el video animado", () => {
  it("ver_video con su mp4 y su locución: los dos se reproducen; mientras renderiza, el hueco y vista_video", async () => {
    const claveMp4 = archivo("r1", { tipo: "video", mime: "video/mp4" });
    const claveVoz = archivo("l1");
    video("vid1", { render: { estado: "listo", clave: claveMp4, archivoId: "r1", duracion: 13.8, ancho: 1080, alto: 1920, version: 1 }, locucion: { estado: "lista", clave: claveVoz, archivoId: "l1", duracion: 12, voz: { nombre: "Bella" }, version: 1 } });
    const r = await mcp().llamar("ver_video", { cliente: "Feria", video_id: "vid1" });
    expect(r.isError).toBeUndefined();
    expect(textoDe(r)).toMatch(/Render: mp4 de 13\.8 s/);
    expect(r.structuredContent.videos[0]).toMatchObject({ id: "r1", ref: "archivo:r1", duracion: 13.8 });
    expect(r.structuredContent.audios[0]).toMatchObject({ id: "l1", voz: "Bella", titulo: "La locución" });
    expect(textoDe(r)).toContain(r.structuredContent.videos[0].url);
    const servido = await pedir(r.structuredContent.videos[0].url, { headers: { Range: "bytes=0-" } });
    expect(servido.status).toBe(206);
    expect(servido.headers.get("Content-Type")).toBe("video/mp4");

    video("vid2", { estado: "renderizando", render: { estado: "en_curso", pedidoAt: new Date().toISOString() } });
    const v = await mcp().llamar("vista_video", { video_id: "vid2" });
    expect(v.structuredContent.videos[0]).toMatchObject({ estado: "en_marcha", url: null });
    expect(v.structuredContent.seguir).toMatchObject({ herramienta: "vista_video", argumentos: { video_id: "vid2" } });
  });

  it("vista_video de otro espacio no existe", async () => {
    video("ajeno", { cliente: "c9" });
    expect((await mcp().llamar("vista_video", { video_id: "ajeno" })).isError).toBe(true);
  });

  it("el reel montado: su mp4 va en la vista del encargo", async () => {
    const claveMp4 = archivo("r1", { tipo: "video", mime: "video/mp4" });
    video("mont", { render: { estado: "listo", clave: claveMp4, archivoId: "r1", duracion: 30, version: 1 } });
    db.sqlite.prepare("insert into estudio_encargos (id, owner_id, client_id, tipo, titulo, estado, datos, pasos, nota, error, creado_por, bloqueado_hasta, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("e1", ANA, "c1", "reel", "Reel de lentes", "hecho", JSON.stringify({ salida: "uno", video: { fase: "hecho", archivoId: "x" }, montaje: { fase: "hecho", videoId: "mont" } }), "[]", "", "", ANA, "", "2026-11-06T00:00:00.000Z", "2026-11-06T00:00:00.000Z");
    const fila = db.sqlite.prepare("select * from estudio_encargos where id = 'e1'").get();
    const { vista } = await vistaDeEncargo(env, acceso, fila);
    expect(vista.videos).toEqual([expect.objectContaining({ id: "r1", titulo: "El reel montado", duracion: 30 })]);
  });
});

describe("vista_medios: otra dirección para lo que caducó", () => {
  it("firma otra vez lo del espacio y las muestras que existen; lo ajeno o mal escrito no", async () => {
    archivo("l1");
    archivo("z1", { cliente: "c9" });
    poner(MUESTRA, "audio/mpeg");
    const r = await mcp().llamar("vista_medios", { refs: ["archivo:l1", "archivo:z1", `muestra:v3:${VOZ}:`, "muestra:v3:../../x:", "muestra:v9:abc:", "nada", "archivo:no-existe"] });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent.audios.map((a) => a.ref)).toEqual(["archivo:l1", `muestra:v3:${VOZ}:`]);
    for (const a of r.structuredContent.audios) expect(a.url).toMatch(/^\/api\/vista-medio\//);
  });
});

// ------------------------------------------------------------
// Por la puerta del Worker, como claude.ai
// ------------------------------------------------------------

describe("el conector, de punta a punta", () => {
  const b64url = (buf) => Buffer.from(buf).toString("base64url");
  async function token() {
    const s = db.sqlite;
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)").run(await sha256(`sesion-${ANA}`), ANA, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    const reg = await (await pedir("/oauth/register", { method: "POST", body: JSON.stringify({ client_name: "Claude", redirect_uris: [VUELTA] }), headers: { "Content-Type": "application/json" } })).json();
    const verificador = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const reto = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador)));
    const { redirect } = await (await pedir("/api/mcp/autorizar", {
      method: "POST", headers: { Cookie: `${COOKIE}=sesion-${ANA}`, "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: reg.client_id, redirectUri: VUELTA, reto, metodo: "S256", state: "x" }),
    })).json();
    const form = new URLSearchParams({ grant_type: "authorization_code", code: new URL(redirect).searchParams.get("code"), redirect_uri: VUELTA, client_id: reg.client_id, code_verifier: verificador });
    return (await (await pedir("/oauth/token", { method: "POST", body: form, headers: { "Content-Type": "application/x-www-form-urlencoded" } })).json()).access_token;
  }
  let n = 0;
  const rpc = async (t, method, params = {}) => (await (await pedir("/mcp", {
    method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }),
  })).json());

  it("el recurso declara el origen del conector; la muestra llega con su dirección completa y se oye por trozos", async () => {
    const t = await token();
    const lista = await rpc(t, "resources/list");
    expect(lista.result.resources[0]).toMatchObject({ uri: URI_VISTA, mimeType: MIME_VISTA, _meta: { ui: { csp: { resourceDomains: [ORIGEN], connectDomains: [] } } } });
    const leida = await rpc(t, "resources/read", { uri: URI_VISTA });
    expect(leida.result.contents[0]).toMatchObject({ text: PAGINA_VISTA, _meta: { ui: { prefersBorder: true, csp: { resourceDomains: [ORIGEN] } } } });
    expect((await rpc(t, "resources/read", { uri: "ui://juancito-ads/vista-1.html" })).error.code).toBe(-32002);

    poner(MUESTRA, "audio/mpeg");
    const r = (await rpc(t, "tools/call", { name: "previsualizar_voz", arguments: { cliente: "Feria", voz: VOZ } })).result;
    const url = r.structuredContent.audios[0].url;
    expect(url.startsWith(`${ORIGEN}/api/vista-medio/`)).toBe(true);
    expect(r.content[0].text).toContain(url);
    expect(r.structuredContent.texto).toContain(url);
    // Lo que hará el <audio> del iframe: sin cookie ni token, por trozos.
    const res = await worker.fetch(new Request(url, { headers: { Range: "bytes=0-1" } }), env, {});
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });
});

describe("la página", () => {
  it("pinta reproductores de audio y video y sabe renovar una dirección", () => {
    for (const m of ["vista_medios", "playsinline", "preload", "Abrir", "lista-medios"]) expect(PAGINA_VISTA, m).toContain(m);
  });
});
