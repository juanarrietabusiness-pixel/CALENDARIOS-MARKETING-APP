import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { avanzarEncargo } from "../../worker/lib/estudio/encargos.js";
import { ejecutarUnion } from "../../worker/lib/estudio/mejoraVideo.js";

// ============================================================
// «Mejorar mi video» y «Varios ángulos», contra una D1 de verdad
//
// Lo que importa: que NADA se cree sin el sí al costo (409), que el video sea de ESTE cliente, que el navegador no
// pueda armar una mejora a mano por /encargos, y que el encargo no se cierre hasta saber cómo acabó la UNIÓN con el
// audio original (que hace la alarma del Durable Object del render: aquí, uno de mentira). Kie no se llama: los pasos
// se dan por hechos escribiendo la fila, como los dejaría el trabajo.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra" };

let db;
let env;

function r2() {
  const objetos = new Map();
  const bytesDe = async (v) => (v instanceof Uint8Array ? v : new Uint8Array(await new Response(v).arrayBuffer()));
  return {
    objetos,
    async head(clave) { return objetos.has(clave) ? { size: objetos.get(clave).bytes.length } : null; },
    async get(clave) {
      const o = objetos.get(clave);
      return o ? { body: o.bytes, size: o.bytes.length, arrayBuffer: async () => o.bytes.buffer, httpMetadata: { contentType: o.tipo } } : null;
    },
    async put(clave, valor, opciones) { objetos.set(clave, { bytes: await bytesDe(valor), tipo: opciones?.httpMetadata?.contentType }); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

/** Un «mp4» mínimo: lo que mira `esMp4` (la caja ftyp). */
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRA, "otra@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
  }
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  const video = (id, owner, cliente, extra = "{}") => s.prepare(
    "insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, ancho, alto, bytes, prompt, ajustes) values (?,?,?,?,?,?,?,?,?,?,?)",
  ).run(id, owner, cliente, `clientes/${cliente}/estudio/${id}.mp4`, "video", "video/mp4", 1080, 1920, 5_000_000, "Mi video de la tienda", extra);
  video("v1", JEFE, "c1", JSON.stringify({ duracion: 8 }));
  video("v9", OTRA, "c9", JSON.stringify({ duracion: 8 }));
  s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime) values (?,?,?,?,?,?)")
    .run("foto1", JEFE, "c1", "clientes/c1/estudio/foto1.png", "imagen", "image/png");
  await env.MEDIA.put("clientes/c1/estudio/v1.mp4", MP4, { httpMetadata: { contentType: "video/mp4" } });
}

const pedir = (quien, ruta, cuerpo) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  method: cuerpo === undefined ? "GET" : "POST",
  headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
  body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
}), env);

/** El Durable Object del render, de mentira: apunta lo que se le pide y contesta lo que diga `resultado`. */
function renderFalso() {
  const pedidos = [];
  const estado = { resultado: null };
  return {
    pedidos, estado,
    idFromName: (n) => n,
    get: (nombre) => ({
      fetch: async (req) => {
        const url = new URL(req.url);
        pedidos.push({ nombre, metodo: req.method, ruta: url.pathname, cuerpo: req.method === "POST" ? await req.json() : null, intento: url.searchParams.get("intento") });
        if (req.method === "POST") return Response.json({ ok: true }, { status: 202 });
        return Response.json(estado.resultado ?? { estado: "uniendo" });
      },
    }),
  };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") }, KIE_API_KEY: "k" };
  await sembrar();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const trabajos = () => db.sqlite.prepare("select count(*) n from estudio_trabajos").get().n;
const encargos = () => db.sqlite.prepare("select count(*) n from estudio_encargos").get().n;

describe("pedir una mejora", () => {
  it("sin confirmado NO crea nada: 409 con el costo y lo que se hará", async () => {
    const r = await pedir(JEFE, "/estudio/c1/mejorar-video", { archivoId: "v1", modo: "look", look: "dorada" });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j).toMatchObject({ codigo: "confirmar" });
    expect(j.costo).toBeGreaterThan(0);
    expect(j.resumen).toMatch(/Omni 1\.2.*audio original/);
    expect(encargos()).toBe(0);
    expect(trabajos()).toBe(0);
  });

  it("el video tiene que ser de ESTE cliente, y una foto de referencia también", async () => {
    expect((await pedir(JEFE, "/estudio/c1/mejorar-video", { archivoId: "v9", modo: "escalar" })).status).toBe(404);
    const foto = await pedir(JEFE, "/estudio/c1/mejorar-video", { archivoId: "foto1", modo: "escalar" });
    expect(foto.status).toBe(400);
    const ajena = await pedir(JEFE, "/estudio/c1/mejorar-video", { archivoId: "v1", modo: "cambiar", instruccion: "otra taza", referencias: ["v9"] });
    expect(ajena.status).toBe(400);
  });

  it("desde una publicación, por su dirección /api/media/…", async () => {
    const r = await pedir(JEFE, "/estudio/c1/mejorar-video", { clave: "/api/media/clientes/c1/estudio/v1.mp4", modo: "escalar" });
    expect(r.status).toBe(409);
    expect((await r.json()).resumen).toMatch(/Topaz/);
  });

  it("el navegador no arma una mejora a mano por /encargos", async () => {
    const r = await pedir(JEFE, "/estudio/c1/encargos", { tipo: "mejora", pasos: [{ pedido: { modelo: "prueba", prompt: "x" } }], mejora: { modo: "look", archivoId: "v9" } });
    expect(r.status).toBe(400);
    expect(encargos()).toBe(0);
  });

  it("con el sí: un encargo «mejora» con un paso por ángulo, del video de este cliente", async () => {
    const r = await pedir(JEFE, "/estudio/c1/mejorar-video", { archivoId: "v1", modo: "angulos", angulos: ["cerca", "lateral", "general"], confirmado: true });
    expect(r.status).toBe(201);
    const { encargo: e } = await r.json();
    expect(e).toMatchObject({ tipo: "mejora", estado: "en_marcha" });
    expect(e.pasos).toHaveLength(3);
    expect(e.mejora).toMatchObject({ modo: "angulos", archivoId: "v1", union: { fase: "nuevo" } });
    const fila = db.sqlite.prepare("select pasos from estudio_encargos").get();
    const pasos = JSON.parse(fila.pasos);
    expect(pasos[0].pedido).toMatchObject({ modelo: "gemini-omni-1-2-kie", medios: { video: ["clientes/c1/estudio/v1.mp4"] } });
  });
});

describe("la unión con el audio original", () => {
  /** Crea la mejora y deja sus pasos hechos, con su video en la galería (como los dejaría el trabajo). */
  async function mejoraHecha(modo = "look", extra = { look: "estudio" }) {
    const { encargo: e } = await (await pedir(JEFE, "/estudio/c1/mejorar-video", { archivoId: "v1", modo, ...extra, confirmado: true })).json();
    const fila = db.sqlite.prepare("select pasos from estudio_encargos where id = ?").get(e.id);
    const pasos = JSON.parse(fila.pasos).map((p, i) => {
      const id = `gen${i}`;
      db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo) values (?,?,?,?,?,?,?)")
        .run(id, JEFE, "c1", `clientes/c1/estudio/${id}.mp4`, "video", "video/mp4", "gemini-omni-1-2-kie");
      env.MEDIA.put(`clientes/c1/estudio/${id}.mp4`, MP4, { httpMetadata: { contentType: "video/mp4" } });
      return { ...p, fase: "hecho", opciones: [{ id, fase: "hecho", clave: `clientes/c1/estudio/${id}.mp4` }], finales: [id] };
    });
    db.sqlite.prepare("update estudio_encargos set pasos = ? where id = ?").run(JSON.stringify(pasos), e.id);
    return e.id;
  }

  it("encarga la unión, espera y se cierra con el video final, que es versión del original", async () => {
    env.RENDER = renderFalso();
    const id = await mejoraHecha();
    const acceso = crearAcceso(db, JEFE);
    await avanzarEncargo(env, acceso, id);
    const post = env.RENDER.pedidos.find((p) => p.metodo === "POST");
    expect(post).toMatchObject({ nombre: `mejora-${id}`, ruta: "/unir", cuerpo: { ownerId: JEFE, clienteId: "c1", encargoId: id } });
    let e = (await (await pedir(JEFE, `/estudio/c1/encargos/${id}`)).json()).encargo;
    expect(e.estado).toBe("en_marcha");
    expect(e.mejora.union.fase).toBe("uniendo");

    // Mientras la alarma no termina, sigue en marcha.
    await avanzarEncargo(env, acceso, id);
    expect((await (await pedir(JEFE, `/estudio/c1/encargos/${id}`)).json()).encargo.estado).toBe("en_marcha");

    // La alarma: sube los clips, pide /unir y guarda el mp4 (un Container de mentira).
    const alContainer = [];
    const r = await ejecutarUnion(env, { ownerId: JEFE, clienteId: "c1", encargoId: id }, async (ruta, init = {}) => {
      alContainer.push({ ruta, metodo: init.method });
      if (init.method === "HEAD") return new Response(null, { status: 404 });
      if (init.method === "PUT") return Response.json({ ok: true });
      return new Response(MP4, { headers: { "X-Ancho": "1080", "X-Alto": "1920", "X-Duracion": "8.000", "Content-Type": "video/mp4" } });
    });
    expect(r.estado).toBe("hecho");
    const unir = alContainer.find((x) => x.ruta === "/unir");
    expect(unir).toBeTruthy();
    expect(alContainer.filter((x) => x.metodo === "PUT").map((x) => x.ruta).sort()).toEqual(["/clip/gen0", "/clip/v1"]);
    const final = db.sqlite.prepare("select * from estudio_archivos where id = ?").get(r.archivoId);
    expect(final).toMatchObject({ client_id: "c1", tipo: "video", mime: "video/mp4", modelo: "gemini-omni-1-2-kie" });
    expect(JSON.parse(final.ajustes)).toMatchObject({ deArchivo: "v1", mejora: "look", audioOriginal: true });

    env.RENDER.estado.resultado = { ...r, intento: post.cuerpo.intento };
    await avanzarEncargo(env, acceso, id);
    const leido = await (await pedir(JEFE, `/estudio/c1/encargos/${id}`)).json();
    e = leido.encargo;
    expect(e.estado).toBe("hecho");
    expect(e.mejora.union).toMatchObject({ fase: "hecho", archivoId: r.archivoId });
    expect(e.nota).toMatch(/audio original/);
    // El video final viene con el encargo (la pantalla lo enseña sin buscarlo).
    expect(leido.archivos.map((a) => a.id)).toContain(r.archivoId);
  });

  it("ángulos: un tramo por cámara, y un ángulo que no salió deja su tramo al original", async () => {
    const id = await mejoraHecha("angulos", { angulos: ["cerca", "lateral", "general"] });
    // El segundo ángulo no salió.
    const fila = db.sqlite.prepare("select pasos from estudio_encargos where id = ?").get(id);
    const pasos = JSON.parse(fila.pasos);
    pasos[1] = { ...pasos[1], fase: "fallido", opciones: [], finales: null, error: "no salió" };
    db.sqlite.prepare("update estudio_encargos set pasos = ? where id = ?").run(JSON.stringify(pasos), id);
    let cuerpo = null;
    const r = await ejecutarUnion(env, { ownerId: JEFE, clienteId: "c1", encargoId: id }, async (ruta, init = {}) => {
      if (init.method === "HEAD") return new Response(null, { status: 200 });
      if (ruta === "/unir") { cuerpo = JSON.parse(init.body); return new Response(MP4, { headers: { "X-Ancho": "1080", "X-Alto": "1920" } }); }
      return Response.json({});
    });
    expect(r.estado).toBe("hecho");
    expect(cuerpo.copiar).toBe(false);
    expect(cuerpo.original).toBe("v1");
    const clips = cuerpo.tramos.map((t) => t.clip);
    expect(clips[0]).toBe("v1");
    expect(clips).toContain("gen0");
    expect(clips).toContain("gen2");
    expect(clips).not.toContain("gen1");
  });

  it("sin el Container del render, el encargo se cierra con lo del modelo y el motivo", async () => {
    const id = await mejoraHecha();
    await avanzarEncargo(env, crearAcceso(db, JEFE), id);
    const e = (await (await pedir(JEFE, `/estudio/c1/encargos/${id}`)).json()).encargo;
    expect(e.estado).toBe("hecho");
    expect(e.mejora.union.fase).toBe("fallido");
    expect(e.nota).toMatch(/audio original/);
  });

  it("si el Container falla, la unión dice por qué (y un corte se reintenta una vez)", async () => {
    env.RENDER = renderFalso();
    const id = await mejoraHecha();
    const acceso = crearAcceso(db, JEFE);
    await avanzarEncargo(env, acceso, id);
    const post = env.RENDER.pedidos.find((p) => p.metodo === "POST");
    env.RENDER.estado.resultado = { estado: "fallido", error: "Network connection lost", corte: true, intento: post.cuerpo.intento };
    await avanzarEncargo(env, acceso, id);
    let e = (await (await pedir(JEFE, `/estudio/c1/encargos/${id}`)).json()).encargo;
    // Un corte del Container: otra vez (sin agotar los intentos).
    expect(e.estado).toBe("en_marcha");
    await avanzarEncargo(env, acceso, id);
    const otro = env.RENDER.pedidos.filter((p) => p.metodo === "POST").at(-1);
    env.RENDER.estado.resultado = { estado: "fallido", error: "ffmpeg no pudo unir el audio", intento: otro.cuerpo.intento };
    await avanzarEncargo(env, acceso, id);
    e = (await (await pedir(JEFE, `/estudio/c1/encargos/${id}`)).json()).encargo;
    expect(e.estado).toBe("hecho");
    expect(e.mejora.union).toMatchObject({ fase: "fallido", error: "ffmpeg no pudo unir el audio" });
  });
});
