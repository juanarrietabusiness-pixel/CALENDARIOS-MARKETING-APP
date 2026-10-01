import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mesActual } from "../../worker/lib/configIA.js";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { avanzarPendientes, MAX_INTENTOS, RESERVA_MS } from "../../worker/lib/estudio/trabajos.js";

// ============================================================
// El Estudio, contra una D1 de verdad
//
// La base son las migraciones aplicadas en SQLite; R2 es de mentira pero
// guarda los bytes; Gemini es un `fetch` falso. Lo que se comprueba, por
// orden de gravedad:
//
//   1. Un cliente ajeno —de otro espacio o que un colaborador no lleva— da
//      «no encontrado» en TODAS las rutas, y una referencia de otro
//      cliente se rechaza.
//   2. Dos pasos a la vez NO generan (ni cobran) la imagen dos veces.
//   3. Un paso repetido tras un fallo no cuenta dos veces lo mismo.
//   4. Lo que cuesta se apunta, se pide confirmar desde 0,50 $ y el
//      presupuesto agotado frena antes de gastar.
//   5. La papelera no se lleva lo que una publicación usa ni el objeto de
//      R2 de algo que el Estudio no creó.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const COLAB = "u-colab";
const LECTOR = "u-lector";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra", [COLAB]: "t-colab", [LECTOR]: "t-lector" };

// Un PNG de 1×1 de verdad: se reconoce por sus primeros bytes.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG = Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));

let db;
let env;
let fetchReal;

function r2() {
  const objetos = new Map();
  const bytesDe = async (valor) => (valor instanceof Uint8Array ? valor : new Uint8Array(await new Response(valor).arrayBuffer()));
  return {
    objetos,
    async head(clave) { return objetos.has(clave) ? { size: objetos.get(clave).bytes.length } : null; },
    async get(clave) {
      const o = objetos.get(clave);
      if (!o) return null;
      return {
        body: o.bytes, size: o.bytes.length, httpEtag: '"x"', httpMetadata: { contentType: o.tipo },
        arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength),
        writeHttpMetadata: (h) => h.set("content-type", o.tipo),
      };
    },
    async put(clave, valor, opciones) { objetos.set(clave, { bytes: await bytesDe(valor), tipo: opciones?.httpMetadata?.contentType }); },
    async delete(clave) { objetos.delete(clave); },
  };
}

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRA, "otra@b.com"], [COLAB, "colab@a.com"], [LECTOR, "lector@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#123456");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Colab", "#654321", '["c1"]');
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura) values (?,?,?,?,?,1)").run(LECTOR, JEFE, "editor", "Lector", "#111111");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, ...(opciones.body !== undefined && !(opciones.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(opciones.headers ?? {}) },
    body: opciones.body === undefined || opciones.body instanceof FormData ? opciones.body : JSON.stringify(opciones.body),
  }), env);

const pedirTrabajo = (quien, cliente, datos) => pedir(quien, `/api/estudio/${cliente}/trabajos`, { method: "POST", body: { modelo: "prueba", prompt: "una taza de café", n: 1, ...datos } });
const avanzar = async (quien, cliente, id) => (await (await pedir(quien, `/api/estudio/${cliente}/trabajos/${id}/avanzar`, { method: "POST" })).json());
const galeria = async (quien, cliente) => (await (await pedir(quien, `/api/estudio/${cliente}`)).json());

/** Avanza hasta que el trabajo termina; nunca más de `tope` pasos. */
async function hastaElFinal(quien, cliente, id, tope = 12) {
  let r;
  for (let i = 0; i < tope; i++) {
    r = await avanzar(quien, cliente, id);
    if (!["en_cola", "en_marcha"].includes(r.trabajo.estado)) return r.trabajo;
  }
  return r.trabajo;
}

/** Google devuelve la imagen dentro del JSON. */
const respuestaGemini = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG_B64 } }] } }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 1290 },
}), { status: 200 });

const consumo = () => db.sqlite.prepare("select * from consumo_ia").all();

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") } };
  fetchReal = globalThis.fetch;
  await sembrar();
});
afterEach(() => { globalThis.fetch = fetchReal; vi.restoreAllMocks(); });

describe("pedir con el motor de prueba, que no gasta ni pide llave", () => {
  it("crea el trabajo en cola y cada paso da UNA imagen, hasta terminar", async () => {
    const res = await pedirTrabajo(JEFE, "c1", { n: 3 });
    expect(res.status).toBe(201);
    const { trabajo } = await res.json();
    expect(trabajo).toMatchObject({ estado: "en_cola", modelo: "prueba", n: 3, archivos: [], costoEstimado: 0 });

    const uno = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(uno).toMatchObject({ estado: "en_marcha" });
    expect(uno.archivos).toHaveLength(1);
    const dos = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(dos.archivos).toHaveLength(2);
    const fin = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(fin).toMatchObject({ estado: "hecho" });
    expect(fin.archivos).toHaveLength(3);
    expect(fin.terminado).toBeTruthy();

    // Un paso de más no añade nada.
    const de_mas = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(de_mas.archivos).toHaveLength(3);
    expect((await galeria(JEFE, "c1")).archivos).toHaveLength(3);
  });

  it("cada archivo queda en la galería con su prompt, su modelo y su clave de R2 bajo clientes/<id>/estudio/", async () => {
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { prompt: "Una taza de café ☕ con niebla", ajustes: { aspectRatio: "4:5" } })).json();
    await hastaElFinal(JEFE, "c1", trabajo.id);
    const { archivos } = await galeria(JEFE, "c1");
    expect(archivos).toHaveLength(1);
    const a = archivos[0];
    expect(a.clave).toMatch(/^clientes\/c1\/estudio\/\d{4}-\d{2}\/\d{4}-\d{2}-\d{2}-una-taza-de-cafe-con-niebla-[0-9a-f]{8}\.svg$/);
    expect(a).toMatchObject({ prompt: "Una taza de café ☕ con niebla", modelo: "prueba", origen: "estudio", mime: "image/svg+xml", ancho: 1024, alto: 1280 });
    expect(a.src).toBe(`/api/media/${a.clave}`);
    expect(env.MEDIA.objetos.has(a.clave)).toBe(true);
  });

  it("el archivo se sirve por /api/media, y un SVG sale en una caja sin permisos", async () => {
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1")).json();
    await hastaElFinal(JEFE, "c1", trabajo.id);
    const { archivos } = await galeria(JEFE, "c1");
    const res = await pedir(JEFE, archivos[0].src);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("content-security-policy")).toMatch(/^sandbox/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    // Y otro espacio no lo ve.
    expect((await pedir(OTRA, archivos[0].src)).status).toBe(404);
  });

  it("el texto del prompt va escapado dentro de la tarjeta", async () => {
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { prompt: '<script>alert("x")</script> & más' })).json();
    await hastaElFinal(JEFE, "c1", trabajo.id);
    const { archivos } = await galeria(JEFE, "c1");
    const svg = new TextDecoder().decode(env.MEDIA.objetos.get(archivos[0].clave).bytes);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("no apunta consumo: la prueba es gratis", async () => {
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1")).json();
    await hastaElFinal(JEFE, "c1", trabajo.id);
    expect(consumo()).toHaveLength(0);
  });
});

describe("lo que se rechaza antes de gastar", () => {
  it("un modelo que no existe, un prompt vacío y demasiadas imágenes", async () => {
    expect((await pedirTrabajo(JEFE, "c1", { modelo: "inventado" })).status).toBe(400);
    expect((await pedirTrabajo(JEFE, "c1", { prompt: "   " })).status).toBe(400);
    expect((await pedirTrabajo(JEFE, "c1", { n: 9 })).status).toBe(400);
    expect((await pedirTrabajo(JEFE, "c1", { prompt: "x".repeat(4001) })).status).toBe(400);
  });

  it("un motor sin llave dice qué llave falta, y no crea nada", async () => {
    const res = await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana" });
    expect(res.status).toBe(503);
    const cuerpo = await res.json();
    expect(cuerpo.codigo).toBe("sin_llave");
    expect(cuerpo.error).toMatch(/GOOGLE_AI_KEY/);
    expect(db.sqlite.prepare("select count(*) as n from estudio_trabajos").get().n).toBe(0);
  });

  it("los ajustes que el modelo no conoce se descartan y los valores inventados vuelven al defecto", async () => {
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { ajustes: { aspectRatio: "7:3", imageSize: "8K", cosa: 1 } })).json();
    expect(trabajo.ajustes).toEqual({ aspectRatio: "1:1" });
  });

  it("desde 0,50 $ pide una segunda confirmación, con el costo, y con ella sigue", async () => {
    env.GOOGLE_AI_KEY = "k";
    const sin = await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana-pro", n: 4 });
    expect(sin.status).toBe(409);
    expect(await sin.json()).toMatchObject({ codigo: "confirmar", costo: 0.536 });
    expect(db.sqlite.prepare("select count(*) as n from estudio_trabajos").get().n).toBe(0);
    const con = await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana-pro", n: 4, confirmado: true });
    expect(con.status).toBe(201);
    expect((await con.json()).trabajo.costoEstimado).toBe(0.536);
  });

  it("con el presupuesto agotado y «detener», no se crea el trabajo", async () => {
    env.GOOGLE_AI_KEY = "k";
    db.sqlite.prepare("insert into ajustes_espacio (id, owner_id, presupuesto_usd, al_limite) values (?,?,?,?)").run(JEFE, JEFE, 1, "detener");
    db.sqlite.prepare("insert into consumo_ia (id, owner_id, mes, funcion, modelo, costo_usd) values (?,?,?,?,?,?)")
      .run("g1", JEFE, mesActual(), "x", "claude-sonnet-5", 5);
    const res = await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana" });
    expect(res.status).toBe(402);
    expect((await res.json()).codigo).toBe("presupuesto");
    // La prueba, que no gasta, sigue pudiendo.
    expect((await pedirTrabajo(JEFE, "c1")).status).toBe(201);
  });
});

describe("Gemini, con un fetch falso", () => {
  beforeEach(() => { env.GOOGLE_AI_KEY = "clave-de-prueba"; });

  it("guarda la imagen por sus bytes, apunta lo que costó y manda la petición al modelo pedido", async () => {
    const peticiones = [];
    globalThis.fetch = vi.fn(async (url, init) => { peticiones.push({ url: String(url), init }); return respuestaGemini(); });
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana", ajustes: { aspectRatio: "4:5" } })).json();
    const fin = await hastaElFinal(JEFE, "c1", trabajo.id);
    expect(fin.estado).toBe("hecho");

    expect(peticiones).toHaveLength(1);
    expect(peticiones[0].url).toContain("/models/gemini-2.5-flash-image:generateContent");
    // La llave va en la cabecera, no en la dirección.
    expect(peticiones[0].url).not.toContain("clave-de-prueba");
    expect(peticiones[0].init.headers["x-goog-api-key"]).toBe("clave-de-prueba");
    const enviado = JSON.parse(peticiones[0].init.body);
    expect(enviado.generationConfig.imageConfig).toEqual({ aspectRatio: "4:5" });

    const { archivos } = await galeria(JEFE, "c1");
    expect(archivos[0]).toMatchObject({ mime: "image/png", ancho: 1, alto: 1 });
    const filas = consumo();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ proveedor: "gemini", funcion: "estudio-imagen", client_id: "c1", modelo: "gemini-2.5-flash-image" });
    // Un modelo con tarifa por tokens conocida cuenta tokens; el costo del trabajo es el mismo.
    expect(fin.costo).toBeCloseTo(filas[0].costo_usd, 6);
  });

  it("un modelo con imageSize lo manda; uno sin él, no", async () => {
    const cuerpos = [];
    globalThis.fetch = vi.fn(async (_url, init) => { cuerpos.push(JSON.parse(init.body)); return respuestaGemini(); });
    const a = await (await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana-2", ajustes: { imageSize: "2K" } })).json();
    await hastaElFinal(JEFE, "c1", a.trabajo.id);
    const b = await (await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana" })).json();
    await hastaElFinal(JEFE, "c1", b.trabajo.id);
    expect(cuerpos[0].generationConfig.imageConfig.imageSize).toBe("2K");
    expect(cuerpos[1].generationConfig.imageConfig).not.toHaveProperty("imageSize");
    // Un modelo cuyo precio por tokens no se conoce cuenta la estimación del catálogo, y se ve como estimada.
    expect(consumo()[0].costo_usd).toBe(0.067);
  });

  it("lo que devuelve el motor sin ser una imagen se rechaza, y no queda nada guardado", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: btoa("<html>no soy una imagen</html>") } }] } }],
    })));
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana" })).json();
    const fin = await hastaElFinal(JEFE, "c1", trabajo.id);
    expect(fin).toMatchObject({ estado: "fallido", error: "El motor devolvió algo que no es una imagen." });
    expect((await galeria(JEFE, "c1")).archivos).toHaveLength(0);
    expect(consumo()).toHaveLength(0);
  });

  it("el filtro de contenido de Google se dice tal cual", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" }, candidates: [] })));
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana" })).json();
    const fin = await hastaElFinal(JEFE, "c1", trabajo.id);
    expect(fin.estado).toBe("fallido");
    expect(fin.error).toMatch(/filtro de contenido de Google/);
  });

  it("un modelo que la cuenta no tiene dice cuál, en vez de un error genérico", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "models/gemini-3.1-flash-image is not found" } }), { status: 404 }));
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana-2" })).json();
    const fin = await hastaElFinal(JEFE, "c1", trabajo.id);
    expect(fin).toMatchObject({ estado: "fallido" });
    expect(fin.error).toMatch(/no tiene el modelo «gemini-3\.1-flash-image»/);
  });

  it("una saturación pasajera se reintenta sola, y si sigue, falla con el motivo", async () => {
    let llamadas = 0;
    globalThis.fetch = vi.fn(async () => { llamadas++; return new Response("{}", { status: 429 }); });
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana" })).json();
    const primero = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(primero.estado).toBe("en_cola");
    expect(primero.nota).toMatch(/saturado.*reintenta/i);
    const fin = await hastaElFinal(JEFE, "c1", trabajo.id);
    expect(fin).toMatchObject({ estado: "fallido" });
    expect(fin.error).toMatch(/saturado/);
    expect(llamadas).toBe(MAX_INTENTOS + 1);
    expect(consumo()).toHaveLength(0);
  });

  it("si se cae después de entregar una, lo entregado se queda, se cobra sólo eso y se dice", async () => {
    let n = 0;
    globalThis.fetch = vi.fn(async () => (++n === 1 ? respuestaGemini() : new Response(JSON.stringify({ error: { message: "boom" } }), { status: 400 })));
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana", n: 3 })).json();
    const fin = await hastaElFinal(JEFE, "c1", trabajo.id);
    expect(fin.estado).toBe("hecho");
    expect(fin.archivos).toHaveLength(1);
    expect(fin.nota).toMatch(/Llegaron 1 de 3/);
    expect(consumo()).toHaveLength(1);
  });

  it("si el presupuesto se agota entre dos imágenes, para con lo entregado", async () => {
    globalThis.fetch = vi.fn(async () => respuestaGemini());
    db.sqlite.prepare("insert into ajustes_espacio (id, owner_id, presupuesto_usd, al_limite) values (?,?,?,?)").run(JEFE, JEFE, 1, "detener");
    db.sqlite.prepare("insert into consumo_ia (id, owner_id, mes, funcion, modelo, costo_usd) values (?,?,?,?,?,?)")
      .run("g1", JEFE, mesActual(), "x", "claude-sonnet-5", 0.95);
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana", n: 3 })).json();
    const fin = await hastaElFinal(JEFE, "c1", trabajo.id);
    expect(fin.estado).toBe("hecho");
    expect(fin.archivos.length).toBeGreaterThanOrEqual(1);
    expect(fin.archivos.length).toBeLessThan(3);
    expect(fin.nota).toMatch(/Llegaron .* de 3.*presupuesto/);
  });

  it("las referencias van como imágenes en la petición, y sólo si son de este cliente", async () => {
    const cuerpos = [];
    globalThis.fetch = vi.fn(async (_url, init) => { cuerpos.push(JSON.parse(init.body)); return respuestaGemini(); });
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/ref.png", { bytes: PNG, tipo: "image/png" });
    env.MEDIA.objetos.set("clientes/c2/estudio/2026-09/otro.png", { bytes: PNG, tipo: "image/png" });

    const mala = await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana", medios: { reference: ["clientes/c2/estudio/2026-09/otro.png"] } });
    expect(mala.status).toBe(400);
    expect((await mala.json()).error).toMatch(/no es de este cliente/);
    expect((await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana", medios: { reference: ["clientes/c1/../c2/x.png"] } })).status).toBe(400);
    expect((await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana", medios: { reference: ["clientes/c1/estudio/2026-09/no-existe.png"] } })).status).toBe(404);
    expect((await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana", medios: { reference: ["a", "b", "c", "d"] } })).status).toBe(400);

    const ok = await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana", medios: { reference: ["/api/media/clientes/c1/estudio/2026-09/ref.png"] } });
    expect(ok.status).toBe(201);
    await hastaElFinal(JEFE, "c1", (await ok.json()).trabajo.id);
    const partes = cuerpos[0].contents[0].parts;
    expect(partes.filter((p) => p.inlineData)).toHaveLength(1);
    expect(partes.find((p) => p.inlineData).inlineData.mimeType).toBe("image/png");
  });

  it("una tarjeta de prueba no sirve de referencia para un motor real", async () => {
    globalThis.fetch = vi.fn(async () => respuestaGemini());
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/tarjeta.svg", { bytes: new TextEncoder().encode("<svg/>"), tipo: "image/svg+xml" });
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana", medios: { reference: ["clientes/c1/estudio/2026-09/tarjeta.svg"] } })).json();
    const fin = await hastaElFinal(JEFE, "c1", trabajo.id);
    expect(fin.estado).toBe("fallido");
    expect(fin.error).toMatch(/no sirve de imagen para un motor real/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("un paso a la vez, y reanudar", () => {
  it("dos pasos a la vez generan UNA imagen, no dos: el segundo ve que el primero tiene el permiso", async () => {
    env.GOOGLE_AI_KEY = "k";
    // Google tarda: mientras responde, el primer paso tiene el permiso.
    let llamadas = 0;
    globalThis.fetch = vi.fn(async () => { llamadas++; await new Promise((r) => setTimeout(r, 40)); return respuestaGemini(); });
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { modelo: "nano-banana", n: 1 })).json();
    const [a, b] = await Promise.all([avanzar(JEFE, "c1", trabajo.id), avanzar(JEFE, "c1", trabajo.id)]);
    expect([a.ocupado, b.ocupado].filter(Boolean)).toHaveLength(1);
    expect(llamadas).toBe(1);
    expect(db.sqlite.prepare("select count(*) as n from estudio_archivos").get().n).toBe(1);
    expect(consumo()).toHaveLength(1);
    expect((await galeria(JEFE, "c1")).archivos).toHaveLength(1);
  });

  it("mientras alguien tiene el permiso, otro no avanza; cuando caduca, sí", async () => {
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { n: 2 })).json();
    const futuro = new Date(Date.now() + 60_000).toISOString();
    db.sqlite.prepare("update estudio_trabajos set bloqueado_hasta = ? where id = ?").run(futuro, trabajo.id);
    const ocupado = await avanzar(JEFE, "c1", trabajo.id);
    expect(ocupado.ocupado).toBe(true);
    expect(ocupado.trabajo.archivos).toHaveLength(0);

    db.sqlite.prepare("update estudio_trabajos set bloqueado_hasta = ? where id = ?").run(new Date(Date.now() - 1000).toISOString(), trabajo.id);
    const libre = await avanzar(JEFE, "c1", trabajo.id);
    expect(libre.ocupado).toBe(false);
    expect(libre.trabajo.archivos).toHaveLength(1);
    // Y el permiso se suelta al terminar.
    expect(db.sqlite.prepare("select bloqueado_hasta from estudio_trabajos where id = ?").get(trabajo.id).bloqueado_hasta).toBe("");
  });

  it("si el Worker muere entre guardar el archivo y anotarlo, el permiso caduca y el trabajo no se queda colgado", async () => {
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { n: 2 })).json();
    // Simula el permiso de un paso que nunca volvió.
    db.sqlite.prepare("update estudio_trabajos set bloqueado_hasta = ? where id = ?").run(new Date(Date.now() + RESERVA_MS).toISOString(), trabajo.id);
    expect((await avanzar(JEFE, "c1", trabajo.id)).ocupado).toBe(true);
    db.sqlite.prepare("update estudio_trabajos set bloqueado_hasta = ? where id = ?").run(new Date(Date.now() - 1).toISOString(), trabajo.id);
    const fin = await hastaElFinal(JEFE, "c1", trabajo.id);
    expect(fin).toMatchObject({ estado: "hecho" });
    expect(fin.archivos).toHaveLength(2);
  });

  it("un trabajo que lleva demasiado vivo se da por perdido, con el motivo", async () => {
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1")).json();
    db.sqlite.prepare("update estudio_trabajos set created_at = ? where id = ?").run(new Date(Date.now() - 31 * 60_000).toISOString(), trabajo.id);
    const r = await avanzar(JEFE, "c1", trabajo.id);
    expect(r.trabajo).toMatchObject({ estado: "fallido", error: expect.stringMatching(/a tiempo/) });
  });

  it("cancelar deja lo ya hecho, y reintentar sigue desde ahí", async () => {
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { n: 3 })).json();
    await avanzar(JEFE, "c1", trabajo.id);
    const cancelado = await (await pedir(JEFE, `/api/estudio/c1/trabajos/${trabajo.id}/cancelar`, { method: "POST" })).json();
    expect(cancelado.trabajo).toMatchObject({ estado: "cancelado" });
    expect(cancelado.trabajo.archivos).toHaveLength(1);
    // Cancelado no avanza.
    expect((await avanzar(JEFE, "c1", trabajo.id)).trabajo.archivos).toHaveLength(1);

    const otra = await (await pedir(JEFE, `/api/estudio/c1/trabajos/${trabajo.id}/reintentar`, { method: "POST" })).json();
    expect(otra.trabajo.estado).toBe("en_cola");
    const fin = await hastaElFinal(JEFE, "c1", trabajo.id);
    expect(fin.archivos).toHaveLength(3);
  });

  it("el cron avanza lo que nadie está mirando, y deja en paz lo que se acaba de tocar", async () => {
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { n: 1 })).json();
    // Recién creado: alguien lo está mirando.
    expect(await avanzarPendientes(env, new Date())).toBe(0);
    // Pasados unos segundos sin que nadie lo avance, el cron lo toma.
    const hace = new Date(Date.now() - 20_000).toISOString();
    db.sqlite.prepare("update estudio_trabajos set updated_at = ? where id = ?").run(hace, trabajo.id);
    expect(await avanzarPendientes(env, new Date())).toBe(1);
    expect((await galeria(JEFE, "c1")).trabajos[0]).toMatchObject({ estado: "hecho" });
    expect(await avanzarPendientes(env, new Date())).toBe(0);
  });
});

describe("cada espacio y cada colaborador ve sólo lo suyo", () => {
  it("un cliente de otro espacio da «no encontrado» en todas las rutas", async () => {
    const rutas = [
      ["GET", "/api/estudio/c9"],
      ["POST", "/api/estudio/c9/trabajos", { modelo: "prueba", prompt: "x" }],
      ["GET", "/api/estudio/c9/trabajos/x"],
      ["POST", "/api/estudio/c9/trabajos/x/avanzar"],
      ["POST", "/api/estudio/c9/archivos/x/papelera"],
      ["POST", "/api/estudio/c9/carpetas", { nombre: "x" }],
      ["POST", "/api/estudio/c9/papelera/vaciar"],
    ];
    for (const [metodo, ruta, body] of rutas) {
      const res = await pedir(JEFE, ruta, { method: metodo, body });
      expect(res.status, `${metodo} ${ruta}`).toBe(404);
    }
  });

  it("un trabajo de un cliente no se avanza pidiendo otro cliente", async () => {
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1")).json();
    expect((await pedir(JEFE, `/api/estudio/c2/trabajos/${trabajo.id}/avanzar`, { method: "POST" })).status).toBe(404);
    expect((await pedir(JEFE, `/api/estudio/c2/trabajos/${trabajo.id}`)).status).toBe(404);
    expect((await galeria(JEFE, "c2")).trabajos).toEqual([]);
  });

  it("un colaborador sólo entra en los clientes que lleva", async () => {
    expect((await pedir(COLAB, "/api/estudio/c1")).status).toBe(200);
    expect((await pedirTrabajo(COLAB, "c1")).status).toBe(201);
    expect((await pedir(COLAB, "/api/estudio/c2")).status).toBe(404);
    expect((await pedirTrabajo(COLAB, "c2")).status).toBe(404);
  });

  it("sólo lectura mira la galería y no pide nada", async () => {
    expect((await pedir(LECTOR, "/api/estudio/c1")).status).toBe(200);
    expect((await pedirTrabajo(LECTOR, "c1")).status).toBe(403);
  });

  it("la lista de motores no enseña ninguna llave", async () => {
    env.GOOGLE_AI_KEY = "secreta";
    const res = await pedir(JEFE, "/api/estudio/motores");
    const texto = await res.text();
    expect(texto).not.toContain("secreta");
    expect(JSON.parse(texto).motores).toMatchObject({ gemini: { activo: true, llave: "GOOGLE_AI_KEY" }, prueba: { activo: true } });
  });
});

describe("subir a mano, carpetas y papelera", () => {
  const subir = (quien, cliente, bytes, nombre, tipo) => {
    const form = new FormData();
    form.set("archivo", new File([bytes], nombre, { type: tipo }));
    return pedir(quien, `/api/estudio/${cliente}/archivos`, { method: "POST", body: form });
  };

  it("sube un PNG, lo reconoce por sus bytes y lo deja en la galería como subido", async () => {
    const res = await subir(JEFE, "c1", PNG, "producto.png", "image/png");
    expect(res.status).toBe(201);
    const { archivo } = await res.json();
    expect(archivo).toMatchObject({ subido: true, origen: "subida", mime: "image/png", ancho: 1, alto: 1, prompt: "producto.png" });
    expect(archivo.clave).toMatch(/^clientes\/c1\/estudio\//);
    expect(env.MEDIA.objetos.has(archivo.clave)).toBe(true);
  });

  it("rechaza lo que no es una imagen aunque diga serlo, y lo que pesa demasiado", async () => {
    expect((await subir(JEFE, "c1", new TextEncoder().encode("<svg onload=alert(1)/>"), "x.png", "image/png")).status).toBe(415);
    expect((await subir(JEFE, "c1", new TextEncoder().encode("hola"), "x.txt", "text/plain")).status).toBe(415);
    const grande = new Uint8Array(15 * 1024 * 1024 + 1);
    grande.set(PNG);
    expect((await subir(JEFE, "c1", grande, "g.png", "image/png")).status).toBe(413);
  });

  it("quitar manda a la papelera, recuperar la trae de vuelta, y las carpetas son etiquetas", async () => {
    const { archivo } = await (await subir(JEFE, "c1", PNG, "a.png", "image/png")).json();
    const carpeta = (await (await pedir(JEFE, "/api/estudio/c1/carpetas", { method: "POST", body: { nombre: "Producto" } })).json()).carpeta;
    expect((await pedir(JEFE, "/api/estudio/c1/carpetas", { method: "POST", body: { nombre: "producto" } })).status).toBe(409);

    const movido = (await (await pedir(JEFE, `/api/estudio/c1/archivos/${archivo.id}/cambiar`, { method: "POST", body: { carpetaId: carpeta.id, favorito: true } })).json()).archivo;
    expect(movido).toMatchObject({ carpetaId: carpeta.id, favorito: true });
    // No se mueve en R2: la clave es la misma.
    expect(movido.clave).toBe(archivo.clave);
    // Una carpeta de otro cliente no vale.
    expect((await pedir(JEFE, `/api/estudio/c2/carpetas`, { method: "POST", body: { nombre: "Otra" } })).status).toBe(201);

    await pedir(JEFE, `/api/estudio/c1/archivos/${archivo.id}/papelera`, { method: "POST" });
    let g = await galeria(JEFE, "c1");
    expect(g.archivos).toHaveLength(0);
    expect(g.papelera).toHaveLength(1);
    await pedir(JEFE, `/api/estudio/c1/archivos/${archivo.id}/recuperar`, { method: "POST" });
    g = await galeria(JEFE, "c1");
    expect(g.archivos).toHaveLength(1);

    // Quitar la carpeta no borra el archivo: vuelve a «sin carpeta».
    expect((await pedir(JEFE, `/api/estudio/c1/carpetas/${carpeta.id}`, { method: "DELETE" })).status).toBe(200);
    g = await galeria(JEFE, "c1");
    expect(g.archivos[0].carpetaId).toBeNull();
    expect(g.carpetas).toEqual([]);
  });

  it("borrar del todo sólo desde la papelera, y lo que usa una publicación pide confirmar", async () => {
    const { archivo } = await (await subir(JEFE, "c1", PNG, "a.png", "image/png")).json();
    expect((await pedir(JEFE, `/api/estudio/c1/archivos/${archivo.id}`, { method: "DELETE" })).status).toBe(409);
    await pedir(JEFE, `/api/estudio/c1/archivos/${archivo.id}/uso`, { method: "POST", body: { calendarId: "cal1", postId: "p1" } });
    // Repetir el mismo uso no lo duplica.
    await pedir(JEFE, `/api/estudio/c1/archivos/${archivo.id}/uso`, { method: "POST", body: { calendarId: "cal1", postId: "p1" } });
    await pedir(JEFE, `/api/estudio/c1/archivos/${archivo.id}/papelera`, { method: "POST" });
    const uso = await pedir(JEFE, `/api/estudio/c1/archivos/${archivo.id}`, { method: "DELETE" });
    expect(uso.status).toBe(409);
    expect(await uso.json()).toMatchObject({ codigo: "en_uso", usos: 1 });
    expect(env.MEDIA.objetos.has(archivo.clave)).toBe(true);
    expect((await pedir(JEFE, `/api/estudio/c1/archivos/${archivo.id}?forzar=1`, { method: "DELETE" })).status).toBe(200);
    expect(env.MEDIA.objetos.has(archivo.clave)).toBe(false);
  });

  it("a los 30 días la papelera se vacía sola al leer, salvo lo que usa una publicación", async () => {
    const a = (await (await subir(JEFE, "c1", PNG, "a.png", "image/png")).json()).archivo;
    const b = (await (await subir(JEFE, "c1", PNG, "b.png", "image/png")).json()).archivo;
    const c = (await (await subir(JEFE, "c1", PNG, "c.png", "image/png")).json()).archivo;
    await pedir(JEFE, `/api/estudio/c1/archivos/${b.id}/uso`, { method: "POST", body: { calendarId: "cal1", postId: "p1" } });
    const viejo = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const reciente = new Date(Date.now() - 5 * 86_400_000).toISOString();
    db.sqlite.prepare("update estudio_archivos set borrado_at = ? where id in (?, ?)").run(viejo, a.id, b.id);
    db.sqlite.prepare("update estudio_archivos set borrado_at = ? where id = ?").run(reciente, c.id);

    const g = await galeria(JEFE, "c1");
    expect(g.papelera.map((x) => x.id).sort()).toEqual([b.id, c.id].sort());
    expect(env.MEDIA.objetos.has(a.clave)).toBe(false);
    expect(env.MEDIA.objetos.has(b.clave)).toBe(true);
    expect(env.MEDIA.objetos.has(c.clave)).toBe(true);
  });

  it("de lo que entró por generar-imagen la papelera quita la fila y NUNCA el objeto de R2, que puede estar en una publicación", async () => {
    env.GOOGLE_AI_KEY = "k";
    globalThis.fetch = vi.fn(async () => respuestaGemini());
    const res = await pedir(JEFE, "/api/generar-imagen", { method: "POST", body: { clientId: "c1", idea: "una taza", imageFormat: "vertical" } });
    expect(res.status).toBe(201);
    const { clave, mimeType } = await res.json();
    expect(clave).toMatch(/^clientes\/c1\/generadas\//);
    expect(mimeType).toBe("image/png");

    let g = await galeria(JEFE, "c1");
    expect(g.archivos).toHaveLength(1);
    expect(g.archivos[0]).toMatchObject({ clave, origen: "app", modelo: "gemini-2.5-flash-image", prompt: "una taza" });

    await pedir(JEFE, `/api/estudio/c1/archivos/${g.archivos[0].id}/papelera`, { method: "POST" });
    db.sqlite.prepare("update estudio_archivos set borrado_at = ?").run(new Date(Date.now() - 40 * 86_400_000).toISOString());
    g = await galeria(JEFE, "c1");
    expect(g.papelera).toHaveLength(0);
    expect(env.MEDIA.objetos.has(clave)).toBe(true);
  });

  it("adaptar a 4:5 GENERA una imagen nueva con la original de referencia, sin acercarla", async () => {
    env.GOOGLE_AI_KEY = "k";
    env.MEDIA.objetos.set("clientes/c1/posts/flow.png", { bytes: PNG, tipo: "image/png" });
    let pedido = null;
    globalThis.fetch = vi.fn(async (_url, init) => { pedido = JSON.parse(init.body); return respuestaGemini(); });
    const res = await pedir(JEFE, "/api/generar-imagen", { method: "POST", body: { clientId: "c1", adaptarDe: { src: "/api/media/clientes/c1/posts/flow.png", proporcion: "4:5" } } });
    expect(res.status).toBe(201);
    const texto = pedido.contents[0].parts.filter((x) => x.text).map((x) => x.text).join("\n");
    expect(texto).toMatch(/Genera una imagen NUEVA/);
    expect(texto).toMatch(/IGUAL O MÁS ABIERTO/);
    expect(texto).not.toMatch(/Amplía/);
    expect(pedido.contents[0].parts.some((x) => x.inlineData)).toBe(true);
    expect(pedido.generationConfig.imageConfig.aspectRatio).toBe("4:5");
  });

  it("con llave de Meta, adaptar a 4:5 lo hace Muse Image (0,01 $); si Meta falla, Nano Banana", async () => {
    env.GOOGLE_AI_KEY = "k";
    env.META_API_KEY = "m";
    env.MEDIA.objetos.set("clientes/c1/posts/flow.png", { bytes: PNG, tipo: "image/png" });
    const urls = [];
    let cuerpoMeta = null;
    globalThis.fetch = vi.fn(async (url, init) => {
      urls.push(String(url));
      if (String(url).startsWith("https://api.meta.ai/v1/images/edits")) {
        cuerpoMeta = JSON.parse(init.body);
        return Response.json({ data: [{ b64_json: PNG_B64 }] });
      }
      return respuestaGemini();
    });
    const pedirAdaptar = () => pedir(JEFE, "/api/generar-imagen", { method: "POST", body: { clientId: "c1", adaptarDe: { src: "/api/media/clientes/c1/posts/flow.png", proporcion: "4:5" } } });
    expect((await pedirAdaptar()).status).toBe(201);
    expect(urls).toEqual(["https://api.meta.ai/v1/images/edits"]);
    expect(cuerpoMeta).toMatchObject({ model: "muse-image-1.0", size: "1024x1280" });
    expect(cuerpoMeta.prompt).toMatch(/Genera una imagen NUEVA/);
    expect(cuerpoMeta.images[0].image_url).toMatch(/^data:image\/png;base64,/);
    const apunte = db.sqlite.prepare("select proveedor, modelo, costo_usd from consumo_ia order by created_at desc").get();
    expect({ ...apunte }).toEqual({ proveedor: "meta", modelo: "muse-image-1.0", costo_usd: 0.01 });

    urls.length = 0;
    globalThis.fetch = vi.fn(async (url) => {
      urls.push(String(url));
      return String(url).includes("api.meta.ai") ? new Response("{}", { status: 403 }) : respuestaGemini();
    });
    expect((await pedirAdaptar()).status).toBe(201);
    expect(urls[0]).toMatch(/api\.meta\.ai/);
    expect(urls[1]).toMatch(/generativelanguage/);
  });

  it("/api/generar-imagen conserva sus mensajes de siempre", async () => {
    env.GOOGLE_AI_KEY = "k";
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 429 }));
    const saturada = await pedir(JEFE, "/api/generar-imagen", { method: "POST", body: { clientId: "c1", idea: "x" } });
    expect(saturada.status).toBe(429);
    expect((await saturada.json()).error).toBe("Google AI está saturado. Inténtalo en unos segundos.");

    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 401 }));
    const clave = await pedir(JEFE, "/api/generar-imagen", { method: "POST", body: { clientId: "c1", idea: "x" } });
    expect(clave.status).toBe(502);
    expect((await clave.json()).error).toMatch(/clave de Google AI no es válida/);
  });
});

// ============================================================
// Video: la cola de los motores
// ============================================================

/** Un MP4 mínimo para el reconocimiento por bytes: «ftyp» en el byte 4. */
const MP4 = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
const OPERACION = "models/veo-3.1-fast-generate-preview/operations/abc123";

/** Google entero, con las direcciones que usa: enviar, sondear y el archivo. */
function googleConVideo({ hecho = true, respuesta = null, archivo = null, error = null } = {}) {
  const llamadas = [];
  const enrutador = vi.fn(async (url, init = {}) => {
    const u = String(url);
    llamadas.push({ url: u, init });
    if (u.includes(":predictLongRunning")) return new Response(JSON.stringify({ name: OPERACION }), { status: 200 });
    if (u.includes("/operations/")) {
      if (error) return new Response(JSON.stringify(error.cuerpo ?? {}), { status: error.estado });
      return new Response(JSON.stringify(hecho
        ? { done: true, response: respuesta ?? { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://storage.googleapis.com/videos/v1.mp4" } }] } } }
        : { done: false }), { status: 200 });
    }
    if (u.startsWith("https://storage.googleapis.com/")) {
      const a = archivo ?? { bytes: MP4 };
      return new Response(a.bytes, { status: a.estado ?? 200, headers: a.sinLargo ? {} : { "content-length": String(a.largo ?? a.bytes.length) } });
    }
    return new Response("{}", { status: 404 });
  });
  globalThis.fetch = enrutador;
  return { llamadas, enrutador };
}

/** Adelanta el reloj del motor: la próxima revisión de cada video ya toca. */
function yaToca(id) {
  const fila = db.sqlite.prepare("select remoto from estudio_trabajos where id = ?").get(id);
  const remoto = JSON.parse(fila.remoto).map((r) => ({ ...r, proximo: new Date(Date.now() - 1000).toISOString() }));
  db.sqlite.prepare("update estudio_trabajos set remoto = ? where id = ?").run(JSON.stringify(remoto), id);
}

const pedirVideo = (quien, cliente, datos) => pedirTrabajo(quien, cliente, { modelo: "veo-3.1-fast", ajustes: { duration: "4" }, confirmado: true, ...datos });

describe("un video, por la cola", () => {
  beforeEach(() => { env.GOOGLE_AI_KEY = "clave-de-prueba"; });

  it("un paso ENVÍA, otros MIRAN, y al estar listo se baja a R2; sólo entonces se cobra", async () => {
    const { llamadas } = googleConVideo();
    const { trabajo } = await (await pedirVideo(JEFE, "c1", { prompt: "Un sofá que gira", ajustes: { duration: "4", aspectRatio: "9:16" } })).json();
    expect(trabajo).toMatchObject({ tipo: "video", estado: "en_cola", costoEstimado: 0.6 });

    const enviado = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(enviado.estado).toBe("en_marcha");
    expect(enviado.nota).toMatch(/Enviado/);
    const envio = llamadas.find((l) => l.url.includes(":predictLongRunning"));
    expect(envio.url).toContain("veo-3.1-fast-generate-preview");
    expect(envio.init.headers["x-goog-api-key"]).toBe("clave-de-prueba");
    expect(JSON.parse(envio.init.body)).toEqual({
      instances: [{ prompt: "Un sofá que gira" }],
      parameters: { aspectRatio: "9:16", resolution: "720p", durationSeconds: 4 },
    });
    // Enviar no cuesta todavía.
    expect(consumo()).toHaveLength(0);
    // El id del motor está guardado.
    expect(JSON.parse(db.sqlite.prepare("select remoto from estudio_trabajos where id = ?").get(trabajo.id).remoto)[0].id).toBe(OPERACION);

    yaToca(trabajo.id);
    const fin = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(fin.estado).toBe("hecho");
    expect(fin.archivos).toHaveLength(1);

    const { archivos } = await galeria(JEFE, "c1");
    expect(archivos[0]).toMatchObject({ tipo: "video", mime: "video/mp4", ancho: 720, alto: 1280, modelo: "veo-3.1-fast", origen: "estudio" });
    expect(archivos[0].clave).toMatch(/\.mp4$/);
    expect(env.MEDIA.objetos.get(archivos[0].clave).bytes).toEqual(MP4);
    expect(consumo()).toHaveLength(1);
    expect(consumo()[0]).toMatchObject({ proveedor: "gemini", funcion: "estudio-video", modelo: "veo-3.1-fast-generate-preview", costo_usd: 0.6, client_id: "c1" });
    expect(fin.costo).toBeCloseTo(0.6, 6);
    // La llave viaja al bajar el archivo de Google.
    expect(llamadas.find((l) => l.url.startsWith("https://storage.googleapis.com/")).init.headers["x-goog-api-key"]).toBe("clave-de-prueba");
  });

  it("mientras el motor trabaja no se le pregunta antes de tiempo: el paso devuelve cuánto esperar y no toma el permiso", async () => {
    const { llamadas } = googleConVideo({ hecho: false });
    const { trabajo } = await (await pedirVideo(JEFE, "c1")).json();
    await avanzar(JEFE, "c1", trabajo.id); // enviar
    const antes = llamadas.length;
    const r = await avanzar(JEFE, "c1", trabajo.id);
    expect(r.espera).toBeGreaterThan(0);
    expect(r.ocupado).toBe(false);
    expect(llamadas.length).toBe(antes); // nada que preguntarle a Google
    expect(db.sqlite.prepare("select bloqueado_hasta from estudio_trabajos where id = ?").get(trabajo.id).bloqueado_hasta).toBe("");

    yaToca(trabajo.id);
    const otra = await avanzar(JEFE, "c1", trabajo.id);
    expect(otra.trabajo.estado).toBe("en_marcha");
    expect(otra.trabajo.nota).toMatch(/Generando/);
    expect(llamadas.length).toBe(antes + 1);
  });

  it("dos videos son dos envíos, uno por paso, y se entregan uno a uno", async () => {
    const { llamadas } = googleConVideo();
    const { trabajo } = await (await pedirVideo(JEFE, "c1", { n: 2 })).json();
    expect(trabajo.costoEstimado).toBe(1.2);
    await avanzar(JEFE, "c1", trabajo.id);
    await avanzar(JEFE, "c1", trabajo.id);
    expect(llamadas.filter((l) => l.url.includes(":predictLongRunning"))).toHaveLength(2);
    yaToca(trabajo.id);
    const uno = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(uno).toMatchObject({ estado: "en_marcha" });
    expect(uno.archivos).toHaveLength(1);
    yaToca(trabajo.id);
    const dos = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(dos).toMatchObject({ estado: "hecho" });
    expect(dos.archivos).toHaveLength(2);
    expect(consumo()).toHaveLength(2);
  });

  it("la imagen inicial y la final van en base64 dentro de la petición; una referencia de otro cliente no", async () => {
    const { llamadas } = googleConVideo();
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/ini.png", { bytes: PNG, tipo: "image/png" });
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/fin.png", { bytes: PNG, tipo: "image/png" });
    env.MEDIA.objetos.set("clientes/c2/estudio/2026-09/otro.png", { bytes: PNG, tipo: "image/png" });
    const mala = await pedirVideo(JEFE, "c1", { medios: { start: ["clientes/c2/estudio/2026-09/otro.png"] } });
    expect(mala.status).toBe(400);
    const { trabajo } = await (await pedirVideo(JEFE, "c1", { medios: { start: ["/api/media/clientes/c1/estudio/2026-09/ini.png"], end: ["clientes/c1/estudio/2026-09/fin.png"] } })).json();
    await avanzar(JEFE, "c1", trabajo.id);
    const instancia = JSON.parse(llamadas.find((l) => l.url.includes(":predictLongRunning")).init.body).instances[0];
    expect(instancia.image).toEqual({ bytesBase64Encoded: PNG_B64, mimeType: "image/png" });
    expect(instancia.lastFrame).toEqual({ bytesBase64Encoded: PNG_B64, mimeType: "image/png" });
    expect(instancia).not.toHaveProperty("referenceImages");
  });

  it("con referencias, Veo 3.1 sale a 720p horizontal, diga lo que diga el pedido", async () => {
    const { llamadas } = googleConVideo();
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/r.png", { bytes: PNG, tipo: "image/png" });
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", {
      modelo: "veo-3.1", confirmado: true, ajustes: { aspectRatio: "9:16", resolution: "1080p", duration: "4" }, medios: { reference: ["clientes/c1/estudio/2026-09/r.png"] },
    })).json();
    expect(trabajo.ajustes).toMatchObject({ aspectRatio: "16:9", resolution: "720p" });
    await avanzar(JEFE, "c1", trabajo.id);
    const cuerpoVeo = JSON.parse(llamadas.find((l) => l.url.includes(":predictLongRunning")).init.body);
    expect(cuerpoVeo.parameters).toMatchObject({ aspectRatio: "16:9", resolution: "720p" });
    expect(cuerpoVeo.instances[0].referenceImages[0]).toMatchObject({ referenceType: "asset" });
  });

  it("el filtro de contenido de Google se dice, y un video que no salió no se cobra", async () => {
    googleConVideo({ respuesta: { generateVideoResponse: { raiMediaFilteredCount: 1, raiMediaFilteredReasons: ["Contenido sensible."] } } });
    const { trabajo } = await (await pedirVideo(JEFE, "c1")).json();
    await avanzar(JEFE, "c1", trabajo.id);
    yaToca(trabajo.id);
    const fin = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(fin.estado).toBe("fallido");
    expect(fin.error).toMatch(/filtro de contenido de Google/);
    expect(consumo()).toHaveLength(0);
    expect((await galeria(JEFE, "c1")).archivos).toHaveLength(0);
  });

  it("Google sin facturación dice qué hacer, en vez de un error genérico", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Billing is required" } }), { status: 403 }));
    const { trabajo } = await (await pedirVideo(JEFE, "c1")).json();
    const fin = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(fin.estado).toBe("fallido");
    expect(fin.error).toMatch(/facturación/);
    expect(consumo()).toHaveLength(0);
  });

  it("lo que baja de Google se comprueba: no https, sin tamaño, demasiado grande o un HTML disfrazado de video", async () => {
    const casos = [
      [{ respuesta: { generateVideoResponse: { generatedSamples: [{ video: { uri: "http://storage.googleapis.com/v.mp4" } }] } } }, /no es https/],
      [{ archivo: { bytes: MP4, sinLargo: true } }, /no dijo cuánto pesa/],
      [{ archivo: { bytes: MP4, largo: 300 * 1024 * 1024 } }, /pesa más de 200 MB/],
      [{ archivo: { bytes: new TextEncoder().encode("<html><script>alert(1)</script></html>") } }, /no es un archivo de los que el Estudio guarda/],
    ];
    for (const [config, esperado] of casos) {
      const { llamadas } = googleConVideo(config);
      const { trabajo } = await (await pedirVideo(JEFE, "c1")).json();
      await avanzar(JEFE, "c1", trabajo.id);
      yaToca(trabajo.id);
      const fin = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
      expect(fin.estado, String(esperado)).toBe("fallido");
      expect(fin.error).toMatch(esperado);
      expect(consumo()).toHaveLength(0);
      expect(llamadas.length).toBeGreaterThan(1);
      expect([...env.MEDIA.objetos.keys()].filter((k) => k.endsWith(".mp4"))).toEqual([]);
    }
  });

  it("una redirección a otro sitio no lleva la llave, y una a http se rechaza", async () => {
    const vistas = [];
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url);
      vistas.push({ u, llave: init.headers?.["x-goog-api-key"] });
      if (u.includes(":predictLongRunning")) return new Response(JSON.stringify({ name: OPERACION }), { status: 200 });
      if (u.includes("/operations/")) return new Response(JSON.stringify({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://storage.googleapis.com/v.mp4" } }] } } }), { status: 200 });
      if (u === "https://storage.googleapis.com/v.mp4") return new Response(null, { status: 302, headers: { location: "https://cdn.otro-sitio.test/v.mp4" } });
      if (u === "https://cdn.otro-sitio.test/v.mp4") return new Response(MP4, { status: 200, headers: { "content-length": String(MP4.length) } });
      return new Response("{}", { status: 404 });
    });
    const { trabajo } = await (await pedirVideo(JEFE, "c1")).json();
    await avanzar(JEFE, "c1", trabajo.id);
    yaToca(trabajo.id);
    expect((await avanzar(JEFE, "c1", trabajo.id)).trabajo.estado).toBe("hecho");
    expect(vistas.find((v) => v.u.startsWith("https://cdn.otro-sitio.test")).llave).toBeUndefined();

    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes(":predictLongRunning")) return new Response(JSON.stringify({ name: OPERACION }), { status: 200 });
      if (u.includes("/operations/")) return new Response(JSON.stringify({ done: true, response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://storage.googleapis.com/v.mp4" } }] } } }), { status: 200 });
      return new Response(null, { status: 302, headers: { location: "http://interno.local/secreto" } });
    });
    const otro = await (await pedirVideo(JEFE, "c1")).json();
    await avanzar(JEFE, "c1", otro.trabajo.id);
    yaToca(otro.trabajo.id);
    const malo = (await avanzar(JEFE, "c1", otro.trabajo.id)).trabajo;
    expect(malo.estado).toBe("fallido");
    expect(malo.error).toMatch(/no es https/);
  });

  it("si el Worker muere después de enviar, el id ya estaba guardado y el trabajo lo encuentra al volver", async () => {
    googleConVideo();
    const { trabajo } = await (await pedirVideo(JEFE, "c1")).json();
    await avanzar(JEFE, "c1", trabajo.id);
    // Simula la muerte a medias: el permiso quedó puesto y expira.
    db.sqlite.prepare("update estudio_trabajos set bloqueado_hasta = ? where id = ?").run(new Date(Date.now() - 1000).toISOString(), trabajo.id);
    yaToca(trabajo.id);
    const fin = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(fin.estado).toBe("hecho");
    expect(fin.archivos).toHaveLength(1);
  });

  it("el presupuesto agotado frena antes de ENVIAR, y no manda nada a Google", async () => {
    const { llamadas } = googleConVideo();
    db.sqlite.prepare("insert into ajustes_espacio (id, owner_id, presupuesto_usd, al_limite) values (?,?,?,?)").run(JEFE, JEFE, 1, "detener");
    db.sqlite.prepare("insert into consumo_ia (id, owner_id, mes, funcion, modelo, costo_usd) values (?,?,?,?,?,?)")
      .run("g1", JEFE, mesActual(), "x", "claude-sonnet-5", 5);
    const res = await pedirVideo(JEFE, "c1");
    expect(res.status).toBe(402);
    expect(llamadas).toHaveLength(0);
  });

  it("un video de más de 0,50 $ pide confirmar", async () => {
    const res = await pedirTrabajo(JEFE, "c1", { modelo: "veo-3.1", ajustes: { duration: "8" } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ codigo: "confirmar", costo: 3.2 });
  });

  it("el video de prueba recorre la cola sin gastar ni tener llave, y es un archivo animado", async () => {
    const { trabajo } = await (await pedirTrabajo(JEFE, "c1", { modelo: "prueba-video", ajustes: { duration: "3", aspectRatio: "16:9" } })).json();
    expect(trabajo).toMatchObject({ tipo: "video", costoEstimado: 0 });
    await avanzar(JEFE, "c1", trabajo.id); // enviar
    yaToca(trabajo.id);
    const mirando = (await avanzar(JEFE, "c1", trabajo.id)).trabajo; // aún no está
    expect(mirando.estado).toBe("en_marcha");
    yaToca(trabajo.id);
    const fin = (await avanzar(JEFE, "c1", trabajo.id)).trabajo;
    expect(fin.estado).toBe("hecho");
    const { archivos } = await galeria(JEFE, "c1");
    expect(archivos[0]).toMatchObject({ tipo: "video", mime: "image/svg+xml", ancho: 1792, alto: 1024 });
    const svg = new TextDecoder().decode(env.MEDIA.objetos.get(archivos[0].clave).bytes);
    expect(svg).toContain("<animate");
    expect(consumo()).toHaveLength(0);
  });

  it("cancelar un video en la cola lo deja cancelado, y el cron no lo retoma", async () => {
    googleConVideo({ hecho: false });
    const { trabajo } = await (await pedirVideo(JEFE, "c1")).json();
    await avanzar(JEFE, "c1", trabajo.id);
    const cancelado = await (await pedir(JEFE, `/api/estudio/c1/trabajos/${trabajo.id}/cancelar`, { method: "POST" })).json();
    expect(cancelado.trabajo.estado).toBe("cancelado");
    yaToca(trabajo.id);
    expect(await avanzarPendientes(env, new Date(Date.now() + 60_000))).toBe(0);
  });

  it("el cron mira los videos que nadie está mirando", async () => {
    googleConVideo();
    const { trabajo } = await (await pedirVideo(JEFE, "c1")).json();
    await avanzar(JEFE, "c1", trabajo.id);
    yaToca(trabajo.id);
    db.sqlite.prepare("update estudio_trabajos set updated_at = ? where id = ?").run(new Date(Date.now() - 30_000).toISOString(), trabajo.id);
    expect(await avanzarPendientes(env, new Date())).toBe(1);
    expect((await galeria(JEFE, "c1")).trabajos[0]).toMatchObject({ estado: "hecho", tipo: "video" });
  });
});
