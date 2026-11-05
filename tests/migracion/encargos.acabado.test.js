import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { bombear } from "../../worker/lib/estudio/bomba.js";
import { ESCENA } from "../../src/lib/encargos.js";

// ============================================================
// El ACABADO sin pantalla: lo que un encargo del Estudio dejaba esperando a que alguien abriera la aplicación (el
// texto de la plantilla encima, el logo estampado) lo pone el Container (POST /acabado) y la pieza queda terminada.
// Sin Container, o si falla, sigue como antes: lo pone la pantalla («por terminar»).
// El Container es de mentira: contesta como container/servidor.mjs (la prueba de humo prueba el de verdad).
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
/** Un PNG de 1 × 1 de verdad: lo que «dibuja» el Container de mentira (la galería reconoce la imagen por sus bytes). */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let db;
let env;
let pedidos;

function r2() {
  const objetos = new Map();
  const bytesDe = async (v) => (v instanceof Uint8Array ? v : new Uint8Array(await new Response(v).arrayBuffer()));
  return {
    objetos,
    async head(clave) { return objetos.has(clave) ? { size: objetos.get(clave).bytes.length } : null; },
    async get(clave) {
      const o = objetos.get(clave);
      return o ? { body: o.bytes, size: o.bytes.length, httpEtag: '"x"', httpMetadata: { contentType: o.tipo }, arrayBuffer: async () => o.bytes.slice().buffer, writeHttpMetadata: (h) => h.set("content-type", o.tipo) } : null;
    },
    async put(clave, valor, opciones) { objetos.set(clave, { bytes: await bytesDe(valor), tipo: opciones?.httpMetadata?.contentType }); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

/** El Container de mentira: apunta lo que se le pide y contesta con un PNG (o con `falla`, un error). */
function contenedor({ falla = false } = {}) {
  return {
    idFromName: () => "contenedor",
    get: () => ({
      async fetch(req) {
        const ruta = new URL(req.url).pathname;
        const cuerpo = await req.json();
        pedidos.push({ ruta, cuerpo });
        if (falla) return Response.json({ error: "se cayó" }, { status: 503 });
        return Response.json({ datos: PNG, mime: "image/png", ancho: 1, alto: 1 });
      },
    }),
  };
}

const pedir = (ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  ...opciones,
  headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env);

const paso = (id, extra = {}) => ({
  id, titulo: `Pieza ${id}`, escena: `Una taza de café número ${id}`, sinMejorar: "una taza",
  pedido: { modelo: "prueba", prompt: `Escena: ${ESCENA}\n\nTipo de pieza: anuncio.`, n: 1, ajustes: { aspectRatio: "4:5" }, medios: {} },
  ...extra,
});
const lanzar = async (pasos) => (await (await pedir("/estudio/c1/encargos", { method: "POST", body: { tipo: "lote", mejorar: false, pasos } })).json()).encargo;
const encargo = async (id) => (await (await pedir(`/estudio/c1/encargos/${id}`)).json());

async function bombearHastaElFinal(tope = 40) {
  for (let i = 0; i < tope; i++) {
    if ((await bombear(env, JEFE)) == null) return;
    vi.setSystemTime(new Date(Date.now() + 5000));
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T15:00:00.000Z"));
  db = d1EnMemoria();
  pedidos = [];
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") }, VIDEO: contenedor() };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)").run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Jefe", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name, kit_marca) values (?,?,?,?)").run("c1", JEFE, "Feria", JSON.stringify({
    paleta: [{ hex: "#D91B19", nombre: "Rojo" }, { hex: "#F2EDE4", nombre: "Crema" }], logo: "clientes/c1/estudio/logo.png",
    logoPosicion: { esquina: "arriba-derecha", tamano: 0.2 },
  }));
  await env.MEDIA.put("clientes/c1/estudio/logo.png", new Uint8Array([137, 80, 78, 71]), { httpMetadata: { contentType: "image/png" } });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("el acabado de una pieza en el Container", () => {
  it("el texto de la plantilla: lo dibuja el Container, la pieza nueva recuerda su cruda y el encargo se cierra terminado", async () => {
    const e = await lanzar([paso("a", { navegador: { plantilla: { texto: "Tus lentes en 40 minutos\nCiudad de Panamá", plantilla: "degradado", nombre: "anuncio" } } })]);
    await bombearHastaElFinal();
    const { encargo: fin, archivos } = await encargo(e.id);
    expect(fin.estado).toBe("hecho");
    const p = fin.pasos[0];
    expect(p.finales).toHaveLength(1);
    expect(p.finales[0]).not.toBe(p.opciones[0].id);
    const nueva = archivos.find((a) => a.id === p.finales[0]);
    expect(nueva.ajustes.plantilla).toMatchObject({ texto: "Tus lentes en 40 minutos\nCiudad de Panamá", plantilla: "degradado", origenId: p.opciones[0].id });
    expect(nueva.origen).toBe("estudio");
    // Lo que se le pidió: la imagen, el texto, la plantilla y los colores del kit (los mismos que usa la pantalla).
    const [pedido] = pedidos.filter((x) => x.ruta === "/acabado");
    expect(pedido.cuerpo.texto).toMatchObject({ plantilla: "degradado", colores: { fondo: "#D91B19" } });
    expect(pedido.cuerpo.imagen.length).toBeGreaterThan(10);
    expect(pedido.cuerpo.logo).toBeUndefined();
    // Ya no espera a ninguna pantalla.
    expect((await (await pedir("/encargos/por-terminar")).json()).encargos).toEqual([]);
  });

  it("el logo estampado: con el original del kit y su posición, como una versión nueva de la cruda", async () => {
    const e = await lanzar([paso("a", { navegador: { logo: true } })]);
    await bombearHastaElFinal();
    const { encargo: fin, archivos } = await encargo(e.id);
    const p = fin.pasos[0];
    const nueva = archivos.find((a) => a.id === p.finales[0]);
    // Como la que estampa la pantalla: una versión de su cruda (la galería las apila), sin texto encima.
    expect(nueva.ajustes.deArchivo).toBe(p.opciones[0].id);
    expect(nueva.ajustes.plantilla).toBeUndefined();
    const [pedido] = pedidos.filter((x) => x.ruta === "/acabado");
    expect(pedido.cuerpo.logo.posicion).toMatchObject({ esquina: "arriba-derecha", tamano: 0.2 });
    expect(pedido.cuerpo.texto).toBeUndefined();
  });

  it("texto y logo: primero el texto y el logo sobre ESA (dos piezas, como la pantalla)", async () => {
    const e = await lanzar([paso("a", { navegador: { plantilla: { texto: "Hola", plantilla: "banda" }, logo: true } })]);
    await bombearHastaElFinal();
    const { encargo: fin, archivos } = await encargo(e.id);
    expect(pedidos.filter((x) => x.ruta === "/acabado")).toHaveLength(2);
    const final = archivos.find((a) => a.id === fin.pasos[0].finales[0]);
    // La final (con el logo) sale de la del texto, que sale de la cruda.
    const conTexto = db.sqlite.prepare("select id, ajustes from estudio_archivos where id = ?").get(final.ajustes.deArchivo);
    expect(JSON.parse(conTexto.ajustes).plantilla).toMatchObject({ texto: "Hola", plantilla: "banda", origenId: fin.pasos[0].opciones[0].id });
    expect(pedidos.filter((x) => x.ruta === "/acabado").map((x) => Boolean(x.cuerpo.texto))).toEqual([true, false]);
  });

  it("si el Container falla, se queda como antes: lo pone la pantalla («por terminar») y no se reintenta en bucle", async () => {
    env.VIDEO = contenedor({ falla: true });
    const e = await lanzar([paso("a", { navegador: { plantilla: { texto: "Hola", plantilla: "banda" } } })]);
    await bombearHastaElFinal();
    const { encargo: fin } = await encargo(e.id);
    expect(fin.estado).toBe("hecho");
    expect(fin.pasos[0].finales).toBeNull();
    expect(pedidos.filter((x) => x.ruta === "/acabado")).toHaveLength(1);
    expect((await (await pedir("/encargos/por-terminar")).json()).encargos.map((x) => x.encargo.id)).toEqual([e.id]);
  });

  it("sin Container (en local), ni lo intenta: la pantalla, como siempre", async () => {
    delete env.VIDEO;
    const e = await lanzar([paso("a", { navegador: { logo: true } })]);
    await bombearHastaElFinal();
    const { encargo: fin } = await encargo(e.id);
    expect(fin.estado).toBe("hecho");
    expect(fin.pasos[0].finales).toBeNull();
    expect(pedidos).toEqual([]);
  });
});
