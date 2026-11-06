import { describe, it, expect, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { leerConfigIA, topeSinPreguntar } from "../../worker/lib/configIA.js";
import { crearEjecutor } from "../../worker/lib/herramientasServidor.js";
import { crearHerramientasMCP } from "../../worker/lib/mcp.js";
import { pedirMusica, ErrorMusica } from "../../worker/lib/estudio/musica.js";
import { MODELOS, estimar, esModeloDelCliente, CONFIRMAR_DESDE } from "../../src/lib/estudioCatalogo.js";
import {
  decidirConfirmacion, limpiarSinPreguntar, topeSugerido, textoSugerencia, textoSinPreguntar, TOPE_SIN_PREGUNTAR,
} from "../../src/lib/sinPreguntar.js";

// ============================================================
// «Crear imágenes sin preguntar» (Ajustes → IA, 0074), contra una D1 de verdad
//
// La agencia no quiere un segundo «sí» por cada imagen: lo deja FIJO con un tope por pedido. Lo que se comprueba:
//
//   1. La regla (src/lib/sinPreguntar.js): sólo imágenes, con el modelo del cliente y dentro del tope; otro motor que
//      sugiere el asistente se pregunta; video, voz y música, como siempre.
//   2. El ajuste lo guarda sólo el administrador, con el CHECK de la base, y llega en GET /api/ajustes.
//   3. El SERVIDOR decide (Claude por MCP no pasa por la pantalla): crearTrabajo, crear_en_estudio y disenar_piezas
//      crean sin 409 / sin «NO SE CREÓ NADA» dentro del tope, y preguntan por encima, con otro motor y en video.
// ============================================================

const JEFE = "u-jefe";
const EDITOR = "u-editor";
const OTRA = "u-otra";
const TESTIGO = { [JEFE]: "t-jefe", [EDITOR]: "t-editor", [OTRA]: "t-otra" };
const USUARIO = { id: JEFE, nombre: "Juan" };
const POR = { userId: JEFE, nombre: "Juan", color: "#1E90FF", tab: null };

let db;
let env;
let acceso;
let fetchReal;

function r2() {
  const objetos = new Map();
  return {
    async head(clave) { return objetos.has(clave) ? { size: 1 } : null; },
    async get(clave) { const b = objetos.get(clave); return b ? { size: 1, httpMetadata: { contentType: "image/png" }, arrayBuffer: async () => new ArrayBuffer(1), text: async () => "{}", json: async () => ({}) } : null; },
    async put(clave, valor) { objetos.set(clave, valor); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [EDITOR, "editor@a.com"], [OTRA, "otra@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(EDITOR, JEFE, "editor", "Edi", "#123456");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#654321");
  // Dcasa tiene FIJADO Nano Banana Pro (caro: 4 imágenes pasan de 0,50 $); Baby Caleb, nada (va el predeterminado).
  s.prepare("insert into clients (id, owner_id, name, kit_marca) values (?,?,?,?)").run("c1", JEFE, "Dcasa", JSON.stringify({ modelos: { imagen: "nano-banana-pro" } }));
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Baby Caleb");
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, ...(opciones.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

/** Fija el ajuste del espacio como lo dejaría el administrador (null = apagado). */
const fijar = (tope) => db.sqlite.prepare(
  "insert into ajustes_espacio (id, owner_id, sin_preguntar_usd) values (?,?,?) on conflict(id) do update set sin_preguntar_usd = excluded.sin_preguntar_usd",
).run(JEFE, JEFE, tope);
const trabajos = () => db.sqlite.prepare("select * from estudio_trabajos").all();
const encargos = () => db.sqlite.prepare("select * from estudio_encargos").all().map((e) => ({ ...e, pasos: JSON.parse(e.pasos) }));
const asistente = () => crearEjecutor({ env, acceso, estudio: { usuario: USUARIO, por: POR, origen: "asistente" } });
const usar = async (name, input) => {
  const r = await asistente().ejecutar({ id: "t1", name, input });
  return { texto: String(r.content), error: Boolean(r.is_error) };
};
const mcp = () => crearHerramientasMCP({ env, acceso, usuario: USUARIO });
const textoDe = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), GOOGLE_AI_KEY: "llave-de-prueba", ASSETS: { fetch: async () => new Response("") } };
  acceso = crearAcceso(db, JEFE);
  fetchReal = globalThis.fetch;
  // Ningún servicio de verdad: lo que llame afuera, falla (el director no responde y la pieza va con la idea).
  globalThis.fetch = async () => new Response("{}", { status: 500 });
  await sembrar();
});
afterEach(() => { globalThis.fetch = fetchReal; });

describe("la regla (src/lib/sinPreguntar.js)", () => {
  it("apagado, como siempre: se pregunta desde 0,50 $ (y, donde se preguntaba siempre, siempre)", () => {
    expect(decidirConfirmacion({ costo: 0.49 })).toMatchObject({ preguntar: false, sinPreguntar: false });
    expect(decidirConfirmacion({ costo: CONFIRMAR_DESDE })).toMatchObject({ preguntar: true, motivo: "costo" });
    expect(decidirConfirmacion({ costo: 0.04, siempre: true })).toMatchObject({ preguntar: true, motivo: "costo" });
    // Sin el ajuste, otro motor barato sigue como hoy (lo decide el costo).
    expect(decidirConfirmacion({ costo: 0.04, otroMotor: true }).preguntar).toBe(false);
  });

  it("encendido: una imagen dentro del tope no pregunta, y se dice que fue el ajuste", () => {
    expect(decidirConfirmacion({ tope: 3, costo: 2.4 })).toMatchObject({ preguntar: false, sinPreguntar: true });
    expect(decidirConfirmacion({ tope: 3, costo: 0.04, siempre: true })).toMatchObject({ preguntar: false, sinPreguntar: true });
    // Barato y sin «siempre»: tampoco se preguntaba antes; no hace falta decir nada.
    expect(decidirConfirmacion({ tope: 3, costo: 0.04 })).toMatchObject({ preguntar: false, sinPreguntar: false });
  });

  it("encendido: por encima del tope, con otro motor, o si no es imagen, pregunta", () => {
    expect(decidirConfirmacion({ tope: 3, costo: 3.01 })).toMatchObject({ preguntar: true, motivo: "tope" });
    expect(decidirConfirmacion({ tope: 3, costo: 0.04, otroMotor: true })).toMatchObject({ preguntar: true, motivo: "otro_motor" });
    for (const tipo of ["video", "voz", "musica"]) {
      expect(decidirConfirmacion({ tope: 1000, costo: 0.6, tipo })).toMatchObject({ preguntar: true, motivo: "no_imagen" });
    }
  });

  it("el tope se limpia, y el que se propone es el doble del pedido o 3 $", () => {
    expect(limpiarSinPreguntar(null)).toBe(0);
    expect(limpiarSinPreguntar("2,5")).toBe(2.5);
    expect(limpiarSinPreguntar(-1)).toBe(0);
    expect(limpiarSinPreguntar(5000)).toBe(1000);
    expect(topeSugerido(0.6)).toBe(TOPE_SIN_PREGUNTAR);
    expect(topeSugerido(2.3)).toBe(5);
  });

  it("la sugerencia dice qué, en vez de qué y por qué", () => {
    expect(textoSugerencia({ sugerido: "Nano Banana Pro", fijo: "Muse Image", motivo: "porque el titular es largo." }))
      .toBe("El asistente sugiere usar Nano Banana Pro en vez de Muse Image (porque el titular es largo).");
    expect(textoSugerencia({ sugerido: "Muse Image", fijo: "Muse Image" })).toBe("");
    expect(textoSinPreguntar(3)).toMatch(/Se creó sin preguntar: la agencia lo tiene fijado en Ajustes → IA/);
  });

  it("el modelo del cliente: el fijado (o el predeterminado), el de sus historias y los relevos de proporción; otro no", () => {
    const activos = { gemini: true, kie: true };
    expect(esModeloDelCliente("nano-banana-pro", activos, { imagen: "nano-banana-pro" })).toBe(true);
    expect(esModeloDelCliente("nano-banana", activos, {})).toBe(true); // el predeterminado
    expect(esModeloDelCliente("nano-banana-2-kie", activos, { imagen: "muse-image" })).toBe(true); // un relevo
    expect(esModeloDelCliente("gpt-image-2-5-kie", activos, { historias: "gpt-image-2-5-kie" })).toBe(true);
    expect(esModeloDelCliente("gpt-image-2-5-kie", activos, { imagen: "nano-banana" })).toBe(false);
  });
});

describe("el ajuste del espacio: Ajustes → IA", () => {
  it("lo guarda el administrador, llega en GET /api/ajustes y null lo apaga", async () => {
    expect((await (await pedir(JEFE, "/api/ajustes")).json()).sin_preguntar_usd).toBe(0);
    const res = await pedir(JEFE, "/api/ajustes", { method: "PUT", body: { sin_preguntar_usd: 3 } });
    expect(res.status).toBe(200);
    expect((await res.json()).sin_preguntar_usd).toBe(3);
    expect(await topeSinPreguntar(acceso)).toBe(3);
    expect((await (await pedir(JEFE, "/api/ajustes", { method: "PUT", body: { sin_preguntar_usd: null } })).json()).sin_preguntar_usd).toBe(0);
    expect(db.sqlite.prepare("select sin_preguntar_usd from ajustes_espacio where id = ?").get(JEFE).sin_preguntar_usd).toBeNull();
  });

  it("un editor no lo cambia (403) y lo inventado se rechaza (400)", async () => {
    expect((await pedir(EDITOR, "/api/ajustes", { method: "PUT", body: { sin_preguntar_usd: 3 } })).status).toBe(403);
    for (const malo of [-1, "mucho", 5000]) {
      expect((await pedir(JEFE, "/api/ajustes", { method: "PUT", body: { sin_preguntar_usd: malo } })).status).toBe(400);
    }
    expect(await topeSinPreguntar(acceso)).toBe(0);
  });

  it("la base tiene el mismo CHECK (0074), y el ajuste es de cada espacio", async () => {
    expect(() => fijar(5000)).toThrow();
    fijar(2);
    expect((await leerConfigIA(acceso)).sin_preguntar_usd).toBe(2);
    expect(await topeSinPreguntar(crearAcceso(db, OTRA))).toBe(0);
  });
});

describe("crearTrabajo (POST /api/estudio/<c>/trabajos): el 409 «confirmar»", () => {
  const caro = { modelo: "nano-banana-pro", prompt: "un sofá cama", n: 4 }; // 0,536 $
  it("apagado, desde 0,50 $ pregunta como siempre", async () => {
    const res = await pedir(JEFE, "/api/estudio/c1/trabajos", { method: "POST", body: caro });
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe("confirmar");
  });

  it("encendido y dentro del tope, con el modelo del cliente: crea sin 409", async () => {
    fijar(3);
    const res = await pedir(JEFE, "/api/estudio/c1/trabajos", { method: "POST", body: caro });
    expect(res.status).toBe(201);
    expect(trabajos()).toHaveLength(1);
  });

  it("encendido pero por encima del tope: 409 y dice por qué", async () => {
    fijar(0.5);
    const res = await pedir(JEFE, "/api/estudio/c1/trabajos", { method: "POST", body: caro });
    expect(res.status).toBe(409);
    const cuerpo = await res.json();
    expect(cuerpo).toMatchObject({ codigo: "confirmar", motivo: "tope" });
    expect(cuerpo.error).toMatch(/tope de 0,50 \$/);
    expect(trabajos()).toHaveLength(0);
  });

  it("encendido con OTRO motor que no es el del cliente: 409", async () => {
    fijar(10);
    env.KIE_API_KEY = "k";
    const otro = MODELOS.find((m) => m.id === "gpt-image-2-5-kie");
    expect(estimar(otro, 8, { imageSize: "4K" })).toBeGreaterThanOrEqual(CONFIRMAR_DESDE);
    const res = await pedir(JEFE, "/api/estudio/c1/trabajos", { method: "POST", body: { modelo: otro.id, prompt: "un sofá", n: 8, ajustes: { imageSize: "4K" } } });
    expect(res.status).toBe(409);
    expect((await res.json()).motivo).toBe("otro_motor");
    // Con el «sí», sigue.
    expect((await pedir(JEFE, "/api/estudio/c1/trabajos", { method: "POST", body: { modelo: otro.id, prompt: "un sofá", n: 8, ajustes: { imageSize: "4K" }, confirmado: true } })).status).toBe(201);
  });

  it("un VIDEO caro pregunta aunque el tope dé para él", async () => {
    fijar(1000);
    const video = MODELOS.find((m) => m.tipo === "video" && m.motor === "gemini" && estimar(m, 1, { duration: "8" }) >= CONFIRMAR_DESDE);
    const res = await pedir(JEFE, "/api/estudio/c1/trabajos", { method: "POST", body: { modelo: video.id, prompt: "el sofá gira", n: 1, ajustes: { duration: "8" } } });
    expect(res.status).toBe(409);
  });

  it("el GET del Estudio dice el tope (el compositor lo mira antes de su «¿Seguimos?»)", async () => {
    fijar(3);
    expect((await (await pedir(JEFE, "/api/estudio/c1")).json()).sinPreguntar).toBe(3);
  });
});

describe("crear_en_estudio (el asistente y Claude por MCP)", () => {
  const pedido = { cliente: "Dcasa", prompt: "un sofá cama en una sala luminosa", cantidad: 4 }; // Nano Banana Pro × 4

  it("apagado: NO SE CREÓ NADA y pide el «sí»", async () => {
    const r = await usar("crear_en_estudio", pedido);
    expect(r.texto).toMatch(/NO SE CREÓ NADA/);
    expect(encargos()).toHaveLength(0);
  });

  it("encendido y dentro del tope: lo crea a la primera y lo dice", async () => {
    fijar(3);
    const r = await usar("crear_en_estudio", pedido);
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/Pedido creado/);
    expect(r.texto).toMatch(/Se creó sin preguntar: la agencia lo tiene fijado en Ajustes → IA/);
    expect(encargos()).toHaveLength(1);
    expect(encargos()[0].pasos[0].pedido.modelo).toBe("nano-banana-pro");
  });

  it("encendido pero por encima del tope: pregunta y dice por qué", async () => {
    fijar(0.5);
    const r = await usar("crear_en_estudio", pedido);
    expect(r.texto).toMatch(/NO SE CREÓ NADA/);
    expect(r.texto).toMatch(/Pasa del tope de 0,50 \$/);
    expect(encargos()).toHaveLength(0);
  });

  it("encendido y el asistente SUGIERE otro motor: pregunta (aunque sea barato) con la sugerencia y su porqué", async () => {
    fijar(3);
    const r = await usar("crear_en_estudio", { ...pedido, cantidad: 1, modelo: "nano-banana-2-lite", motivo_modelo: "es para una prueba rápida" });
    expect(r.texto).toMatch(/NO SE CREÓ NADA/);
    expect(r.texto).toMatch(/El asistente sugiere usar Nano Banana 2 Lite en vez de Nano Banana Pro \(porque es para una prueba rápida\)/);
    expect(r.texto).toMatch(/SIN modelo/);
    expect(encargos()).toHaveLength(0);
    // Si la persona acepta: con confirmado, el sugerido. Si se queda con el suyo: sin modelo, sale directo con el suyo.
    await usar("crear_en_estudio", { ...pedido, cantidad: 1, modelo: "nano-banana-2-lite", confirmado: true });
    expect(encargos()[0].pasos[0].pedido.modelo).toBe("nano-banana-2-lite");
    const suyo = await usar("crear_en_estudio", { ...pedido, cantidad: 1 });
    expect(suyo.texto).toMatch(/Pedido creado/);
    expect(encargos()).toHaveLength(2);
  });

  it("un video sigue preguntando con el ajuste encendido", async () => {
    fijar(1000);
    const video = MODELOS.find((m) => m.tipo === "video" && m.motor === "gemini" && estimar(m, 1, { duration: "8" }) >= CONFIRMAR_DESDE);
    const r = await usar("crear_en_estudio", { cliente: "Dcasa", tipo: "video", modelo: video.id, prompt: "el sofá gira", duracion: 8 });
    expect(r.texto).toMatch(/NO SE CREÓ NADA/);
    expect(trabajos()).toHaveLength(0);
  });

  it("su descripción dice que puede sugerir otro motor diciendo por qué", async () => {
    const d = (await import("../../worker/lib/estudio/herramientas.js")).DEFINICIONES_ESTUDIO.find((x) => x.name === "crear_en_estudio");
    expect(d.description).toMatch(/SUGERIR otro motor/);
    expect(d.input_schema.properties.motivo_modelo).toBeDefined();
  });
});

describe("disenar_piezas por MCP: la primera llamada", () => {
  const FICHA = "Pieza: post de producto, 4:5.\nComposición: el sofá al centro.\nFondo: crema.\nTexto exacto: «Duerme mejor»";
  const piezas = [{ titulo: "Sofá", ficha: FICHA }, { titulo: "Cama", idea: "La cama que se dobla", texto: "Ahorra espacio" }];

  it("apagado: NO crea nada (el plan con su costo)", async () => {
    const r = await mcp().llamar("disenar_piezas", { cliente: "Baby Caleb", piezas });
    expect(textoDe(r)).toMatch(/NO SE CREÓ NADA/);
    expect(encargos()).toHaveLength(0);
  });

  it("encendido y dentro del tope: CREA a la primera y lo dice", async () => {
    fijar(3);
    const r = await mcp().llamar("disenar_piezas", { cliente: "Baby Caleb", piezas });
    expect(r.isError).toBeUndefined();
    const t = textoDe(r);
    expect(t).toMatch(/En marcha para Baby Caleb/);
    expect(t).toMatch(/Se creó sin preguntar: la agencia lo tiene fijado en Ajustes → IA/);
    expect(encargos()).toHaveLength(1);
  });

  it("un carrusel con tema, también (contra lo MÁS que puede costar: 8 láminas)", async () => {
    fijar(3);
    const r = await mcp().llamar("disenar_piezas", { cliente: "Baby Caleb", carrusel: true, tema: "Tres consejos para dormir" });
    expect(textoDe(r)).toMatch(/Carrusel en marcha/);
    expect(encargos()).toHaveLength(1);
  });

  it("por encima del tope, pregunta y dice por qué", async () => {
    fijar(0.01);
    const r = await mcp().llamar("disenar_piezas", { cliente: "Baby Caleb", piezas });
    expect(textoDe(r)).toMatch(/NO SE CREÓ NADA/);
    expect(textoDe(r)).toMatch(/Pasa del tope/);
    expect(encargos()).toHaveLength(0);
  });

  it("con OTRO motor sugerido, pregunta con el porqué; sin modelo sale directo con el suyo; con el «sí», con el sugerido", async () => {
    fijar(3);
    const r = await mcp().llamar("disenar_piezas", { cliente: "Baby Caleb", piezas, modelo: "nano-banana-pro", motivo_modelo: "el texto es largo y Nano Banana lo escribe mal" });
    const t = textoDe(r);
    expect(t).toMatch(/NO SE CREÓ NADA/);
    expect(t).toMatch(/El asistente sugiere usar Nano Banana Pro en vez de Nano Banana \(porque el texto es largo y Nano Banana lo escribe mal\)/);
    expect(encargos()).toHaveLength(0);
    await mcp().llamar("disenar_piezas", { cliente: "Baby Caleb", piezas });
    expect(encargos()[0].pasos[0].pedido.modelo).toBe("nano-banana");
    await mcp().llamar("disenar_piezas", { cliente: "Baby Caleb", piezas, modelo: "nano-banana-pro", confirmado: true });
    expect(encargos()[1].pasos[0].pedido.modelo).toBe("nano-banana-pro");
  });

  it("un modelo que no existe o no tiene llave es un error que Claude puede corregir", async () => {
    const r = await mcp().llamar("disenar_piezas", { cliente: "Baby Caleb", piezas, modelo: "gpt-image-2-5-kie" });
    expect(r.isError).toBe(true);
    expect(textoDe(r)).toMatch(/no es un modelo de imagen con llave/);
  });
});

describe("voz y música no entran: siguen preguntando siempre", () => {
  it("una música con el ajuste encendido: 409 «confirmar»", async () => {
    fijar(1000);
    env.KIE_API_KEY = "k";
    const c = await acceso.leerUno("clients", { id: "c1" });
    const e = await pedirMusica(env, acceso, c, { estilo: "lo-fi suave, piano", duracion: 30 }).catch((x) => x);
    expect(e).toBeInstanceOf(ErrorMusica);
    expect(e.estado).toBe(409);
    expect(e.codigo).toBe("confirmar");
  });

  it("la voz y la música no miran el ajuste (lo de imágenes vive aparte)", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["worker/lib/estudio/locucion.js", "worker/lib/estudio/musica.js"]) {
      expect(readFileSync(f, "utf8")).not.toMatch(/sinPreguntar|topeSinPreguntar/);
    }
  });
});
