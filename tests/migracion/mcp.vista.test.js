import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { crearEjecutor } from "../../worker/lib/herramientasServidor.js";
import { HERRAMIENTAS_CON_VISTA } from "../../worker/rutas/mcp.js";
import {
  URI_VISTA, MIME_VISTA, CON_VISTA, SOLO_DE_LA_VISTA, conMetaDeVista, vistaDe, piezaDe, conEnlace, leerResultado, imagenesDe,
  idsConImagen, proximaVuelta, MAX_VUELTAS, mensajeDeCambio, mensajeDeCrear,
} from "../../worker/lib/mcpVista/modelo.js";
import { PAGINA_VISTA } from "../../worker/lib/mcpVista/pagina.generada.js";
import { generar, SALIDA } from "../../scripts/mcp/generar-vista.mjs";

// ============================================================
// La VISTA PREVIA del conector en el chat de Claude (MCP Apps)
//
//   · El conector declara el recurso `ui://` y lo sirve (resources/list, resources/read) con su tipo
//     `text/html;profile=mcp-app`; las herramientas de imagen lo nombran en `_meta.ui` y las de la vista no se le dan
//     al modelo (`visibility: ["app"]`).
//   · Las herramientas devuelven, además de su texto y sus imágenes, la vista (`structuredContent`) con las piezas en
//     orden; mientras algo sigue, `seguir` dice qué herramienta llama la página, que sólo recibe lo que aún no tiene.
//   · La página es UN HTML sin nada de fuera, generado de navegador.js (un test lo regenera y compara).
//   · Nada de otro espacio.
// ============================================================

const ANA = "u-ana";
const OTRO = "u-otro";
const ORIGEN = "https://calendarios.test";
const VUELTA = "https://claude.ai/api/mcp/auth_callback";
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const FICHA = [
  "Pieza: post de producto, 4:5.",
  "Composición: el estuche abajo a la derecha; titular arriba.",
  "Fondo: azul noche liso.",
  "Texto exacto: «Lentes que se ven bien»",
].join("\n");

let db;
let env;
let acceso;
let objetos;

function r2() {
  objetos = new Map();
  return {
    async head(clave) { return objetos.has(clave) ? { size: 1 } : null; },
    async get(clave) {
      const b = objetos.get(clave);
      if (!b) return null;
      return { size: b.length, httpMetadata: { contentType: "image/png" }, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
    },
    async put(clave, valor) { objetos.set(clave, valor); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[ANA, "ana@a.com"], [OTRO, "otro@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(`sesion-${id}`), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into clients (id, owner_id, name, industry) values (?,?,?,?)").run("c1", ANA, "Feria del Lente", "Óptica");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRO, "Ajeno");
}

function pieza(id, cliente = "c1") {
  const clave = `clientes/${cliente}/estudio/${id}.png`;
  objetos.set(clave, PNG);
  db.sqlite.prepare(
    "insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, ancho, alto, prompt, modelo, origen, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(id, cliente === "c9" ? OTRO : ANA, cliente, clave, "imagen", "image/png", 1024, 1280, "un estuche", "nano-banana", "estudio", "2026-11-05T00:00:00.000Z");
}

function encargo(id, { estado = "en_marcha", pasos, cliente = "c1", tipo = "lote" }) {
  db.sqlite.prepare("insert into estudio_encargos (id, owner_id, client_id, tipo, titulo, estado, datos, pasos, nota, error, creado_por, bloqueado_hasta, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, cliente === "c9" ? OTRO : ANA, cliente, tipo, "Lentes de noviembre", estado, "{}", JSON.stringify(pasos), "", "", ANA, "", "2026-11-05T00:00:00.000Z", "2026-11-05T00:00:00.000Z");
}

const hecho = (id, archivo, control = null) => ({ id, titulo: `Pieza ${id}`, fase: "hecho", opciones: [{ id: archivo, fase: "hecho", control }], finales: [archivo], error: "" });
const enMarcha = (id) => ({ id, titulo: `Pieza ${id}`, fase: "generando", opciones: [], error: "" });

const mcp = () => crearHerramientasMCP({ env, acceso, usuario: { id: ANA, nombre: "Ana" } });
const imagenes = (r) => r.content.filter((b) => b.type === "image");

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), GOOGLE_AI_KEY: "llave-de-prueba", ASSETS: { fetch: () => new Response("spa") } };
  acceso = crearAcceso(db, ANA);
  await sembrar();
});

// ------------------------------------------------------------
// Lo puro
// ------------------------------------------------------------

describe("qué herramientas llevan la vista", () => {
  it("las de imagen nombran el recurso (también con la clave plana de antes); las de la vista no se le dan al modelo", () => {
    const nombres = new Set(HERRAMIENTAS_MCP.map((h) => h.name));
    for (const n of [...CON_VISTA, ...SOLO_DE_LA_VISTA]) expect(nombres.has(n), n).toBe(true);
    const por = Object.fromEntries(HERRAMIENTAS_CON_VISTA.map((h) => [h.name, h]));
    for (const n of CON_VISTA) {
      expect(por[n]._meta.ui).toEqual({ resourceUri: URI_VISTA, visibility: ["model", "app"] });
      expect(por[n]._meta["ui/resourceUri"]).toBe(URI_VISTA);
    }
    for (const n of SOLO_DE_LA_VISTA) {
      expect(por[n]._meta.ui).toEqual({ visibility: ["app"] });
      expect(por[n]._meta["ui/resourceUri"]).toBeUndefined();
    }
    expect(por.listar_clientes._meta).toBeUndefined();
    expect(conMetaDeVista({ name: "otra" })).toEqual({ name: "otra" });
    expect(URI_VISTA.startsWith("ui://")).toBe(true);
  });

  it("vistaDe sólo deja `seguir` con una herramienta de la vista y limpia lo demás", () => {
    expect(vistaDe({ seguir: { herramienta: "estado_encargo", argumentos: {} } }).seguir).toBeUndefined();
    expect(vistaDe({ seguir: { herramienta: "vista_encargo", argumentos: { encargo_id: "e1" }, cada: 999 } }).seguir).toEqual({ herramienta: "vista_encargo", argumentos: { encargo_id: "e1" }, cada: 30 });
    expect(vistaDe({ tipo: "rara" }).tipo).toBe("piezas");
    expect(piezaDe({ id: "a", estado: "inventado", imagen: -1 })).toMatchObject({ estado: "lista", imagen: null, archivo: true });
    expect(piezaDe({ id: "a", control: { estado: "ok", puntajeDiseno: 8 } }).control).toEqual({ estado: "ok", puntaje: 8 });
  });

  it("conEnlace pone la dirección del Estudio del cliente en ESTA aplicación", () => {
    const r = conEnlace({ content: [], structuredContent: vistaDe({ cliente: { id: "c1", nombre: "Feria" } }) }, ORIGEN);
    expect(r.structuredContent.cliente.enlace).toBe(`${ORIGEN}/cliente/c1/estudio`);
    expect(conEnlace({ content: [] }, ORIGEN)).toEqual({ content: [] });
  });
});

describe("lo que hace la página con un resultado", () => {
  const img = (data) => ({ type: "image", data, mimeType: "image/jpeg" });

  it("cada pieza toma su imagen por el índice; una vuelta sin la imagen conserva la que ya tenía", () => {
    const primero = leerResultado({
      content: [{ type: "text", text: "x" }, img("AAA")],
      structuredContent: vistaDe({ piezas: [piezaDe({ id: "a1", imagen: 0 }), piezaDe({ id: "paso-p2", estado: "en_marcha", archivo: false })], seguir: { herramienta: "vista_encargo", argumentos: { encargo_id: "e1" } } }),
    });
    expect(primero.piezas[0].src).toBe("data:image/jpeg;base64,AAA");
    expect(primero.piezas[1].src).toBeNull();
    expect(idsConImagen(primero)).toEqual(["a1"]);
    const segundo = leerResultado({
      content: [{ type: "text", text: "x" }, img("BBB")],
      structuredContent: vistaDe({ piezas: [piezaDe({ id: "a1" }), piezaDe({ id: "a2", imagen: 0 })] }),
    }, primero);
    expect(segundo.piezas.map((p) => p.src)).toEqual(["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB"]);
    expect(segundo.seguir).toBeNull();
  });

  it("un «Me gusta» tocado en la página gana mientras no vuelva; un error conserva lo que se veía", () => {
    const a = leerResultado({ content: [img("AAA")], structuredContent: vistaDe({ piezas: [piezaDe({ id: "a1", imagen: 0 })] }) });
    a.gustos = { a1: true };
    const b = leerResultado({ content: [], structuredContent: vistaDe({ piezas: [piezaDe({ id: "a1" })] }) }, a);
    expect(b.piezas[0].gusta).toBe(true);
    const mal = leerResultado({ content: [{ type: "text", text: "No encontré el encargo." }], isError: true }, b);
    expect(mal.error).toMatch(/No encontré/);
    expect(mal.piezas[0].src).toBe("data:image/jpeg;base64,AAA");
    expect(mal.seguir).toBeNull();
  });

  it("sin la vista (otra herramienta), las imágenes del resultado y su primera línea; sólo imágenes de verdad", () => {
    const m = leerResultado({ content: [{ type: "text", text: "Cuadro de «X»\notra línea" }, img("AAA"), { type: "image", data: "x", mimeType: "image/svg+xml" }] });
    expect(m.titulo).toBe("Cuadro de «X»");
    expect(m.piezas).toHaveLength(1);
    expect(imagenesDe({ content: [{ type: "image", data: "x", mimeType: "text/html" }] })).toEqual([]);
  });

  it("vuelve a preguntar mientras haya `seguir`, y no para siempre", () => {
    const m = { seguir: { herramienta: "vista_encargo", argumentos: {}, cada: 5 } };
    expect(proximaVuelta(m, 0)).toBe(5000);
    expect(proximaVuelta(m, MAX_VUELTAS)).toBeNull();
    expect(proximaVuelta({ ...m, error: "x" }, 0)).toBeNull();
    expect(proximaVuelta({}, 0)).toBeNull();
  });

  it("los mensajes que escribe en el chat nombran la pieza y, al crear, la cifra que vio la persona", () => {
    expect(mensajeDeCambio({ pieza: { id: "a1", titulo: "Estuche" }, cliente: { nombre: "Feria del Lente" }, indicacion: " el titular más grande " }))
      .toBe("En la pieza a1 de Feria del Lente («Estuche»): el titular más grande");
    expect(mensajeDeCambio({ pieza: { id: "a1" }, indicacion: "  " })).toBe("");
    expect(mensajeDeCrear({ plan: { costo: "0,12 $" } })).toBe("Sí, créalo (vi el costo: unos 0,12 $).");
  });
});

describe("la página", () => {
  it("está al día con navegador.js, modelo.js y estilos.css (si falla: node scripts/mcp/generar-vista.mjs)", async () => {
    expect(fs.readFileSync(SALIDA, "utf8")).toBe(await generar());
  });

  it("es UN HTML sin nada de fuera, que habla el protocolo de MCP Apps", () => {
    expect(PAGINA_VISTA.startsWith("<!doctype html>")).toBe(true);
    expect(PAGINA_VISTA.match(/<\/script>/g)).toHaveLength(1);
    expect(PAGINA_VISTA).not.toMatch(/<script[^>]+src=|<link[^>]+href=|@import|url\(\s*["']?https?:/i);
    for (const m of ["ui/initialize", "ui/notifications/initialized", "ui/notifications/tool-result", "ui/notifications/size-changed", "ui/message", "ui/open-link", "tools/call", "2026-01-26"]) {
      expect(PAGINA_VISTA, m).toContain(m);
    }
  });
});

// ------------------------------------------------------------
// Por la puerta del Worker, como claude.ai
// ------------------------------------------------------------

describe("el conector sirve la vista", () => {
  const pedir = (ruta, opciones = {}) => worker.fetch(new Request(`${ORIGEN}${ruta}`, opciones), env, {});
  const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  async function token() {
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

  it("declara los recursos, lista la vista y la sirve con su tipo y su metadato", async () => {
    const t = await token();
    const ini = await rpc(t, "initialize", { protocolVersion: "2025-06-18", capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [MIME_VISTA] } } } });
    expect(ini.result.capabilities.resources).toBeDefined();
    const lista = await rpc(t, "resources/list");
    expect(lista.result.resources).toEqual([expect.objectContaining({ uri: URI_VISTA, mimeType: MIME_VISTA })]);
    const leida = await rpc(t, "resources/read", { uri: URI_VISTA });
    expect(leida.result.contents).toHaveLength(1);
    expect(leida.result.contents[0]).toMatchObject({ uri: URI_VISTA, mimeType: MIME_VISTA, text: PAGINA_VISTA, _meta: { ui: { prefersBorder: true } } });
    const otra = await rpc(t, "resources/read", { uri: "ui://otra/cosa.html" });
    expect(otra.error.code).toBe(-32002);
    expect((await rpc(t, "resources/templates/list")).result.resourceTemplates).toEqual([]);
    const herramientas = (await rpc(t, "tools/list")).result.tools;
    expect(herramientas.find((h) => h.name === "estado_encargo")._meta.ui.resourceUri).toBe(URI_VISTA);
    expect(herramientas.find((h) => h.name === "vista_encargo")._meta.ui.visibility).toEqual(["app"]);
  });

  it("el resultado lleva la vista con el enlace al Estudio del cliente en esta aplicación", async () => {
    pieza("a1");
    const t = await token();
    const r = (await rpc(t, "tools/call", { name: "ver_pieza", arguments: { cliente: "Feria", archivo_ids: ["a1"] } })).result;
    expect(r.content.some((b) => b.type === "image")).toBe(true);
    expect(r.structuredContent).toMatchObject({ vista: 1, tipo: "piezas", cliente: { id: "c1", nombre: "Feria del Lente", enlace: `${ORIGEN}/cliente/c1/estudio` } });
    expect(r.structuredContent.piezas[0]).toMatchObject({ id: "a1", imagen: 0, archivo: true });
  });
});

// ------------------------------------------------------------
// Las herramientas
// ------------------------------------------------------------

describe("estado_encargo y vista_encargo", () => {
  it("estado_encargo lleva las piezas en orden (la lista con su imagen, la que falta como hueco) y dice que siga", async () => {
    pieza("a1");
    encargo("e1", { pasos: [hecho("p1", "a1", { estado: "ok", puntajeDiseno: 8 }), enMarcha("p2")] });
    const r = await mcp().llamar("estado_encargo", { encargo_id: "e1" });
    expect(imagenes(r)).toHaveLength(1);
    const v = r.structuredContent;
    expect(v).toMatchObject({ vista: 1, tipo: "piezas", estado: "en_marcha", cliente: { id: "c1" }, seguir: { herramienta: "vista_encargo", argumentos: { encargo_id: "e1" } } });
    expect(v.piezas).toEqual([
      expect.objectContaining({ id: "a1", estado: "lista", imagen: 0, control: { estado: "ok", puntaje: 8 }, archivo: true }),
      expect.objectContaining({ id: "paso-p2", estado: "en_marcha", imagen: null, archivo: false }),
    ]);
    expect(v.subtitulo).toMatch(/1 de 2 piezas listas/);
  });

  it("vista_encargo sólo manda las imágenes que la página no tiene; terminado y sin nada por mandar, deja de seguir", async () => {
    pieza("a1");
    pieza("a2");
    encargo("e1", { estado: "hecho", pasos: [hecho("p1", "a1"), hecho("p2", "a2")] });
    const primero = await mcp().llamar("vista_encargo", { encargo_id: "e1", ya: ["a1"] });
    expect(imagenes(primero)).toHaveLength(1);
    expect(primero.structuredContent.piezas.map((p) => p.imagen)).toEqual([null, 0]);
    expect(primero.structuredContent.seguir).toBeUndefined();
    const nada = await mcp().llamar("vista_encargo", { encargo_id: "e1", ya: ["a1", "a2"] });
    expect(imagenes(nada)).toHaveLength(0);
  });

  it("con más de seis listas, la página sigue preguntando hasta tenerlas todas", async () => {
    const pasos = [];
    for (let i = 1; i <= 8; i++) { pieza(`a${i}`); pasos.push(hecho(`p${i}`, `a${i}`)); }
    encargo("e1", { estado: "hecho", pasos });
    const r = await mcp().llamar("vista_encargo", { encargo_id: "e1" });
    expect(imagenes(r)).toHaveLength(6);
    expect(r.structuredContent.seguir).toMatchObject({ herramienta: "vista_encargo", cada: 1 });
    const resto = await mcp().llamar("vista_encargo", { encargo_id: "e1", ya: ["a1", "a2", "a3", "a4", "a5", "a6"] });
    expect(imagenes(resto)).toHaveLength(2);
    expect(resto.structuredContent.seguir).toBeUndefined();
  });

  it("un encargo de otro espacio no existe", async () => {
    encargo("e9", { cliente: "c9", estado: "hecho", pasos: [] });
    const r = await mcp().llamar("vista_encargo", { encargo_id: "e9" });
    expect(r.isError).toBe(true);
  });
});

describe("me_gusta_pieza", () => {
  it("marca y desmarca el «Me gusta» de una pieza del espacio; una de otro, no", async () => {
    pieza("a1");
    pieza("z1", "c9");
    const favorito = (id) => db.sqlite.prepare("select favorito from estudio_archivos where id = ?").get(id).favorito;
    expect((await mcp().llamar("me_gusta_pieza", { archivo_id: "a1", me_gusta: true })).isError).toBeUndefined();
    expect(favorito("a1")).toBe(1);
    await mcp().llamar("me_gusta_pieza", { archivo_id: "a1", me_gusta: false });
    expect(favorito("a1")).toBe(0);
    expect((await mcp().llamar("me_gusta_pieza", { archivo_id: "a1", me_gusta: "sí" })).isError).toBe(true);
    expect((await mcp().llamar("me_gusta_pieza", { archivo_id: "z1", me_gusta: true })).isError).toBe(true);
    expect(favorito("z1")).toBe(0);
  });
});

describe("disenar_piezas y los pedidos del Estudio", () => {
  it("el plan es una vista de plan con su costo; confirmado, la vista del encargo que se va llenando", async () => {
    const plan = await mcp().llamar("disenar_piezas", { cliente: "Feria del Lente", piezas: [{ titulo: "Estuche", ficha: FICHA }, { titulo: "Consejos", idea: "Cuida tus lentes", texto: "Cuida tus lentes" }] });
    expect(plan.structuredContent).toMatchObject({ tipo: "plan", cliente: { id: "c1" } });
    expect(plan.structuredContent.plan.costo).toMatch(/\$/);
    expect(plan.structuredContent.plan.piezas.map((p) => p.titulo)).toEqual(["1. Estuche", "2. Consejos"]);
    const hechoPlan = await mcp().llamar("disenar_piezas", { cliente: "Feria del Lente", piezas: [{ titulo: "Estuche", ficha: FICHA }], confirmado: true });
    expect(hechoPlan.isError).toBeUndefined();
    const v = hechoPlan.structuredContent;
    expect(v.seguir).toMatchObject({ herramienta: "vista_encargo" });
    expect(v.piezas).toEqual([expect.objectContaining({ estado: "esperando", archivo: false })]);
  });

  it("estado_trabajo en marcha: un hueco por imagen y que siga; el asistente de la aplicación sigue recibiendo sólo el texto", async () => {
    db.sqlite.prepare(
      "insert into estudio_trabajos (id, owner_id, client_id, estado, tipo, motor, modelo, prompt, n, ajustes, medios, remoto, archivos, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run("t1", ANA, "c1", "en_marcha", "imagen", "prueba", "prueba", "lentes", 2, "{}", "{}", "[]", "[]", "2026-11-05T00:00:00.000Z", "2026-11-05T00:00:00.000Z");
    const r = await mcp().llamar("estado_trabajo", { trabajo_id: "t1" });
    expect(r.structuredContent.piezas).toHaveLength(2);
    expect(r.structuredContent.piezas.every((p) => p.estado === "en_marcha")).toBe(true);
    expect(r.structuredContent.seguir).toMatchObject({ herramienta: "vista_trabajo", argumentos: { trabajo_id: "t1" } });
    const asistente = crearEjecutor({ env, acceso, estudio: { usuario: { id: ANA, nombre: "Ana" }, por: { userId: ANA, nombre: "Ana" }, origen: "app" } });
    const tr = await asistente.ejecutar({ id: "x", name: "estado_trabajo", input: { trabajo_id: "t1" } });
    expect(typeof tr.content).toBe("string");
    expect(tr.content).toMatch(/Sigue en marcha/);
  });
});
