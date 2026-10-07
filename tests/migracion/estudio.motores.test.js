import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { MODELOS, modeloPorId, MEDIDAS, validarPedido } from "../../src/lib/estudioCatalogo.js";
import { generar, texto, SALIDA, MODELOS_HF, PROPORCIONES_CONOCIDAS } from "../../scripts/estudio/generar-higgsfield.mjs";
import ESQUEMAS_JSON from "../../worker/lib/estudio/higgsfield-schemas.json";
import { pedidoHiggsfield, rutaDe, cuerpoDe, esDeHiggsfield } from "../../worker/lib/estudio/higgsfield.js";
import { MODELOS_FAL, pedidoFal, esDeLaCola } from "../../worker/lib/estudio/fal.js";

// ============================================================
// Los motores de fal.ai y Higgsfield
//
// SIN LLAVE Y SIN GASTAR. Lo que se puede comprobar sin el servicio real se comprueba entero:
//
//   · Higgsfield: cada modelo, con cada combinación de imágenes que admite y cada valor de cada
//     ajuste, tiene que armar un cuerpo cuyos campos existen en su ruta, con valores que acepta y
//     con todo lo obligatorio. (Es la prueba de Agents Office, contra el mismo esquema.)
//   · El catálogo generado está al día con su generador, y cada modelo de fal tiene su ruta.
//   · El recorrido de un pedido —enviar, mirar, bajar, cobrar— contra un `fetch` de mentira que
//     habla como ellos, con lo que importa: la llave sólo viaja a SU servidor, una dirección que
//     devuelve el servicio y no es suya no la recibe, y lo que falla dice por qué.
//
// LO QUE NO SE PUEDE COMPROBAR AQUÍ es que el servicio real conteste como su documentación. Eso pide
// una llave: el primer pedido con ella ha de ser uno barato.
// ============================================================

const ESQUEMAS = ESQUEMAS_JSON.endpoints;
const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const PNG = Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));
const MP4 = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8]);

let db;
let env;
let fetchReal;

// ------------------------------------------------------------
// 1. Higgsfield contra su esquema
// ------------------------------------------------------------

describe("Higgsfield: cada pedido que el Estudio puede mandar cabe en su ruta", () => {
  const hf = MODELOS.filter((m) => m.motor === "higgsfield");
  const u = "https://x.test/a.png";
  const combos = [{}, { start: [u] }, { start: [u], end: [u] }, { end: [u] }, { reference: [u] }, { reference: [u, u, u] }, { start: [u], reference: [u] }];

  it("el catálogo generado está al día con su generador: nadie lo edita a mano", () => {
    expect(fs.readFileSync(SALIDA, "utf8")).toBe(texto());
  });

  it("todos los modelos salen del esquema: sus rutas existen y sólo los de video de referencia exigen un video", () => {
    expect(hf).toHaveLength(MODELOS_HF.length);
    for (const m of hf) {
      for (const [, eid] of Object.entries(m.rutas)) {
        expect(ESQUEMAS[eid], `${m.id}: la ruta ${eid} no está en el esquema`).toBeTruthy();
        const exige = ESQUEMAS[eid].req.some((c) => /^video_urls?$/.test(c));
        if (exige) expect(m.video, `${m.id}: ${eid} exige un video y el modelo no lo declara`).toBe(1);
      }
    }
    expect(hf.filter((m) => m.necesitaVideo).map((m) => m.id)).toEqual(["kling-omni-video", "kling-motion", "kling-motion-pro"]);
  });

  it("con video de referencia: la ruta lo exige, el cuerpo lo lleva, y sin él se rechaza con palabras", () => {
    const omni = modeloPorId("kling-omni-video");
    expect(rutaDe(omni, { video: 1 })).toBe("kling-video/omni/video-reference");
    expect(rutaDe(omni, { video: 1, reference: 2 })).toBe("kling-video/omni/video-reference");
    expect(() => rutaDe(omni, {})).toThrow(/necesita una imagen|no admite/);
    const { cuerpo } = pedidoHiggsfield(omni, { prompt: "x", ajustes: { duration: "10", aspectRatio: "9:16" }, urls: { video: ["https://x.test/v.mp4"], reference: ["https://x.test/a.png"] } });
    expect(cuerpo).toMatchObject({ prompt: "x", video_urls: ["https://x.test/v.mp4"], image_urls: ["https://x.test/a.png"], duration: 10, aspect_ratio: "9:16" });
    const mov = modeloPorId("kling-motion");
    expect(mov).toMatchObject({ inicial: 1, video: 1, necesitaImagen: true, necesitaVideo: true });
    const c2 = pedidoHiggsfield(mov, { prompt: "", ajustes: {}, urls: { start: ["https://x.test/a.png"], video: ["https://x.test/v.mp4"] } }).cuerpo;
    expect(c2).toMatchObject({ image_url: "https://x.test/a.png", video_url: "https://x.test/v.mp4" });
    expect(() => rutaDe(modeloPorId("kling-3-std"), { video: 1 })).toThrow(/no admite un video/);
    expect(validarPedido({ modelo: "kling-motion", prompt: "x", medios: { start: ["clientes/c/a.png"] } }).error).toMatch(/necesita un video de referencia/);
    expect(validarPedido({ modelo: "kling-3-std", prompt: "x", medios: { video: ["clientes/c/v.mp4"] } }).error).toMatch(/no admite un video/);
    expect(validarPedido({ modelo: "kling-omni-video", prompt: "x", medios: { video: ["clientes/c/v.mp4"] } }).pedido.medios.video).toEqual(["clientes/c/v.mp4"]);
  });

  it("las proporciones que ofrece son las que la pantalla sabe medir", () => {
    expect(PROPORCIONES_CONOCIDAS.every((p) => MEDIDAS[p])).toBe(true);
    expect(Object.keys(MEDIDAS).sort()).toEqual([...PROPORCIONES_CONOCIDAS].sort());
  });

  it("todo cuerpo lleva sólo campos de su ruta, con valores permitidos y lo obligatorio", () => {
    const malos = [];
    let enviados = 0;
    for (const m of hf) {
      const variantes = [{}];
      for (const [k, def] of Object.entries(m.ajustes)) for (const v of def.valores) variantes.push({ [k]: v });
      for (const c of combos) {
        if ((c.start && !m.inicial) || (c.end && !m.final) || (c.reference && !m.referencias)) continue;
        if (c.reference && c.reference.length > m.referencias) continue;
        let ruta;
        try { ruta = rutaDe(m, { start: c.start?.length ?? 0, end: c.end?.length ?? 0, reference: c.reference?.length ?? 0 }); } catch { continue; } // una combinación que no admite se rechaza con palabras, antes de enviar
        for (const v of variantes) {
          const ajustes = Object.fromEntries(Object.entries(m.ajustes).map(([k, d]) => [k, d.defecto]));
          Object.assign(ajustes, v);
          const { ruta: r, cuerpo } = pedidoHiggsfield(m, { prompt: "una prueba", ajustes, urls: { start: c.start ?? [], end: c.end ?? [], reference: c.reference ?? [] } });
          enviados++;
          expect(r).toBe(ruta);
          const sc = ESQUEMAS[r];
          const por = (t) => malos.push(`${m.id} → ${r} ${JSON.stringify(v)} ${Object.keys(c)}: ${t}`);
          for (const [campo, valor] of Object.entries(cuerpo)) {
            const f = sc.p[campo];
            if (!f) { por(`campo desconocido ${campo}`); continue; }
            if (f.e && !f.e.includes(valor)) por(`${campo}=${JSON.stringify(valor)} no permitido`);
            if (typeof valor === "number" && ((f.min !== undefined && valor < f.min) || (f.max !== undefined && valor > f.max))) por(`${campo}=${valor} fuera de rango`);
            if (Array.isArray(valor) && f.maxItems && valor.length > f.maxItems) por(`${campo}: más de ${f.maxItems}`);
          }
          for (const req of sc.req) if (cuerpo[req] === undefined) por(`falta ${req}`);
        }
      }
    }
    expect(enviados, "peticiones comprobadas").toBeGreaterThan(400);
    expect(malos.slice(0, 10)).toEqual([]);
  });

  it("la ruta sigue a las imágenes: sin nada es texto, una inicial anima, las referencias van a su ruta", () => {
    const k = modeloPorId("kling-3-std");
    expect(rutaDe(k, {})).toBe("kling-video/v3.0/std/text-to-video");
    expect(rutaDe(k, { start: 1 })).toBe("kling-video/v3.0/std/image-to-video");
    expect(rutaDe(modeloPorId("seedance-2.5"), { reference: 2 })).toBe("bytedance/seedance-2.5/reference-to-video");
    expect(rutaDe(modeloPorId("qwen-image-3"), {})).toBe("alibaba/qwen-image-3/text-to-image");
    expect(rutaDe(modeloPorId("qwen-image-3"), { reference: 1 })).toBe("alibaba/qwen-image-3/edit");
  });

  it("lo que un modelo no admite se rechaza con palabras", () => {
    expect(() => rutaDe(modeloPorId("kling-2.5"), {})).toThrow(/necesita una imagen/);
    expect(() => rutaDe(modeloPorId("kling-3-std"), { reference: 1 })).toThrow(/no admite esa combinación/);
    expect(() => rutaDe(modeloPorId("z-image-turbo"), { start: 1 })).toThrow(/no admite esa combinación/);
  });

  it("un valor que la ruta no tiene se deja fuera (manda el suyo), y uno numérico se acerca al que admite", () => {
    const soul = modeloPorId("soul-2");
    expect(cuerpoDe(soul, "higgsfield-ai/soul/v2/standard", { prompt: "x", ajustes: { aspectRatio: "21:9", resolution: "720p" } })).toEqual({ prompt: "x", resolution: "720p" });
    const hailuo = modeloPorId("minimax-hailuo-2.3");
    expect(cuerpoDe(hailuo, "minimax/hailuo-2.3/standard/text-to-video", { prompt: "x", ajustes: { duration: "10" } }).duration).toBe(10);
    const ltx = modeloPorId("ltx-2.5-pro");
    // La duración de LTX es obligatoria: aunque no se pida, va.
    expect(cuerpoDe(ltx, "lightricks/ltx-2.5/text-to-video/pro", { prompt: "x", ajustes: {} }).duration).toBeGreaterThan(0);
  });

  it("los modelos de fal traen su ruta, y sólo esos", () => {
    const deFal = MODELOS.filter((m) => m.motor === "fal").map((m) => m.id).sort();
    expect(Object.keys(MODELOS_FAL).sort()).toEqual(deFal);
    const imagenes = { start: [{ mime: "image/png", bytes: PNG }], end: [{ mime: "image/png", bytes: PNG }], reference: [{ mime: "image/png", bytes: PNG }] };
    for (const id of deFal) {
      const m = modeloPorId(id);
      const ajustes = Object.fromEntries(Object.entries(m.ajustes).map(([k, d]) => [k, d.defecto]));
      const solo = pedidoFal(m, { prompt: "x", ajustes, medios: {} });
      expect(solo.ruta, id).toMatch(/^[a-z0-9][a-z0-9._/-]*$/i);
      expect(solo.cuerpo.prompt, id).toBe("x");
      const con = pedidoFal(m, { prompt: "x", ajustes, medios: { start: m.inicial ? imagenes.start : [], end: m.final ? imagenes.end : [], reference: m.referencias ? imagenes.reference : [] } });
      expect(JSON.stringify(con.cuerpo), id).not.toContain("undefined");
    }
  });

  it("los formatos de fal por `image_size` son los exactos", () => {
    const ajustes = (aspectRatio) => ({ aspectRatio });
    const tamano = (id, ar) => pedidoFal(modeloPorId(id), { prompt: "x", ajustes: ajustes(ar), medios: {} }).cuerpo.image_size;
    expect(tamano("seedream-4", "1:1")).toBe("square_hd");
    expect(tamano("seedream-4", "9:16")).toBe("portrait_16_9");
    expect(tamano("flux-schnell", "16:9")).toBe("landscape_16_9");
    expect(tamano("ideogram-3-fal", "3:4")).toBe("portrait_4_3");
  });
});

// ------------------------------------------------------------
// 2. El recorrido de un pedido
// ------------------------------------------------------------

function r2() {
  const objetos = new Map();
  const bytesDe = async (valor) => (valor instanceof Uint8Array ? valor : new Uint8Array(await new Response(valor).arrayBuffer()));
  return {
    objetos,
    async head(clave) { return objetos.has(clave) ? { size: objetos.get(clave).bytes.length } : null; },
    async get(clave) {
      const o = objetos.get(clave);
      if (!o) return null;
      return { body: o.bytes, size: o.bytes.length, httpMetadata: { contentType: o.tipo }, arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength) };
    },
    async put(clave, valor, opciones) { objetos.set(clave, { bytes: await bytesDe(valor), tipo: opciones?.httpMetadata?.contentType }); },
    async delete(clave) { objetos.delete(clave); },
  };
}

async function sembrar() {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)").run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, ...(opciones.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const pedirTrabajo = (datos) => pedir("/api/estudio/c1/trabajos", { method: "POST", body: { prompt: "una taza de café", n: 1, confirmado: true, ...datos } });
const avanzar = async (id) => (await (await pedir(`/api/estudio/c1/trabajos/${id}/avanzar`, { method: "POST" })).json());
const galeria = async () => (await (await pedir("/api/estudio/c1")).json());
const consumo = () => db.sqlite.prepare("select * from consumo_ia").all();
const remoto = (id) => JSON.parse(db.sqlite.prepare("select remoto from estudio_trabajos where id = ?").get(id).remoto);

/** Adelanta el reloj del motor: la próxima revisión de cada pedido ya toca. */
function yaToca(id) {
  const remotos = remoto(id).map((r) => ({ ...r, proximo: new Date(Date.now() - 1000).toISOString() }));
  db.sqlite.prepare("update estudio_trabajos set remoto = ? where id = ?").run(JSON.stringify(remotos), id);
}

/** Avanza hasta que el trabajo termina, adelantando el reloj entre pasos. */
async function hastaElFinal(id, tope = 20) {
  let r;
  for (let i = 0; i < tope; i++) {
    yaToca(id);
    r = await avanzar(id);
    if (!["en_cola", "en_marcha"].includes(r.trabajo.estado)) return r.trabajo;
  }
  return r.trabajo;
}

const json = (cuerpo, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado });
const archivo = (bytes, extra = {}) => new Response(bytes, { status: 200, headers: { "content-length": String(bytes.length), ...extra } });

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") } };
  fetchReal = globalThis.fetch;
  await sembrar();
});
afterEach(() => { globalThis.fetch = fetchReal; });

describe("Higgsfield: el recorrido de un pedido", () => {
  const BASE = "https://api.higgsfield.ai";
  const ESTADO = "https://api.higgsfield.ai/requests/req-1/status";

  /** Higgsfield entero: subir, enviar, mirar y la imagen. `estados` = lo que va diciendo el estado. */
  function higgsfield({ estados = ["queued", "in_progress", "completed"], resultado = null, envio = null, subida = null } = {}) {
    const llamadas = [];
    let i = 0;
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url);
      llamadas.push({ url: u, init });
      if (u === `${BASE}/files/generate-upload-url`) return subida ?? json({ upload_url: "https://almacen.test/subir/1", public_url: "https://almacen.test/publico/1.png" });
      if (u.startsWith("https://almacen.test/subir/")) return new Response("", { status: 200 });
      if (u === ESTADO || u.endsWith("/requests/req-1/status")) {
        const estado = estados[Math.min(i++, estados.length - 1)];
        return json(estado === "completed"
          ? (resultado ?? { status: "completed", images: [{ url: "https://cdn.higgs.test/out/1.png" }], video: { url: "https://cdn.higgs.test/out/1.mp4" } })
          : { status: estado, ...(estado === "failed" ? { error: "modelo caído" } : {}) });
      }
      if (u.startsWith("https://cdn.higgs.test/out/")) return archivo(u.endsWith(".mp4") ? MP4 : PNG);
      if (u.startsWith(`${BASE}/`)) return envio ?? json({ request_id: "req-1", status_url: ESTADO, cancel_url: `${BASE}/requests/req-1/cancel` });
      return new Response("{}", { status: 404 });
    });
    return llamadas;
  }

  beforeEach(() => { env.HF_KEY = "id123:secreto456"; });

  it("una imagen: se envía con la llave, se mira hasta que termina, se baja a R2 y se cobra al entregarla", async () => {
    const llamadas = higgsfield();
    const { trabajo } = await (await pedirTrabajo({ modelo: "soul-2", prompt: "una taza de café", ajustes: { aspectRatio: "4:3", resolution: "1080p" } })).json();
    expect(trabajo).toMatchObject({ tipo: "imagen", motor: "higgsfield", estado: "en_cola", costoEstimado: 0.03 });

    const enviado = (await avanzar(trabajo.id)).trabajo;
    expect(enviado.estado).toBe("en_marcha");
    expect(enviado.nota).toMatch(/Enviado/);
    const envio = llamadas.find((l) => l.url === `${BASE}/higgsfield-ai/soul/v2/standard`);
    expect(envio.init.method).toBe("POST");
    expect(envio.init.headers.Authorization).toBe("Key id123:secreto456");
    expect(JSON.parse(envio.init.body)).toEqual({ prompt: "una taza de café", aspect_ratio: "4:3", resolution: "1080p" });
    // Enviar no cuesta todavía; el id del motor y su dirección de seguimiento están guardados.
    expect(consumo()).toHaveLength(0);
    expect(remoto(trabajo.id)[0]).toMatchObject({ id: "req-1", datos: { estado: ESTADO } });

    const fin = await hastaElFinal(trabajo.id);
    expect(fin.estado).toBe("hecho");
    const { archivos } = await galeria();
    expect(archivos).toHaveLength(1);
    expect(archivos[0]).toMatchObject({ tipo: "imagen", mime: "image/png", modelo: "soul-2", origen: "estudio", ancho: 1, alto: 1 });
    expect(env.MEDIA.objetos.get(archivos[0].clave).bytes).toEqual(PNG);
    expect(consumo()).toHaveLength(1);
    expect(consumo()[0]).toMatchObject({ proveedor: "higgsfield", funcion: "estudio-imagen", modelo: "soul-2", costo_usd: 0.03 });
    // La llave viaja a Higgsfield y NO al servidor de los archivos.
    const descarga = llamadas.find((l) => l.url.startsWith("https://cdn.higgs.test/"));
    expect(descarga.init.headers?.Authorization).toBeUndefined();
    for (const l of llamadas.filter((x) => x.url.startsWith(BASE))) expect(l.init.headers.Authorization).toBe("Key id123:secreto456");
  });

  it("una imagen de referencia se sube a su almacén (sin la llave) y va por su dirección pública", async () => {
    const llamadas = higgsfield();
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/ref.png", { bytes: PNG, tipo: "image/png" });
    const { trabajo } = await (await pedirTrabajo({ modelo: "qwen-image-3", prompt: "ponle fondo azul", medios: { reference: ["clientes/c1/estudio/2026-09/ref.png"] } })).json();
    await avanzar(trabajo.id);
    const subida = llamadas.find((l) => l.url === `${BASE}/files/generate-upload-url`);
    expect(JSON.parse(subida.init.body)).toEqual({ content_type: "image/png" });
    const put = llamadas.find((l) => l.url === "https://almacen.test/subir/1");
    expect(put.init.method).toBe("PUT");
    expect(put.init.headers.Authorization).toBeUndefined();
    const envio = llamadas.find((l) => l.url === `${BASE}/alibaba/qwen-image-3/edit`);
    expect(JSON.parse(envio.init.body)).toMatchObject({ prompt: "ponle fondo azul", image_urls: ["https://almacen.test/publico/1.png"] });
  });

  it("un video de Higgsfield con imagen inicial va a su ruta de imagen-a-video, y se cobra por segundo", async () => {
    const llamadas = higgsfield();
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/ini.png", { bytes: PNG, tipo: "image/png" });
    const { trabajo } = await (await pedirTrabajo({ modelo: "kling-3-std", tipo: "video", prompt: "el sofá gira", ajustes: { duration: "5", aspectRatio: "9:16" }, medios: { start: ["clientes/c1/estudio/2026-09/ini.png"] } })).json();
    expect(trabajo.costoEstimado).toBe(0.4);
    const fin = await hastaElFinal(trabajo.id);
    expect(fin.estado).toBe("hecho");
    const envio = llamadas.find((l) => l.url === `${BASE}/kling-video/v3.0/std/image-to-video`);
    expect(JSON.parse(envio.init.body)).toMatchObject({ prompt: "el sofá gira", image_url: "https://almacen.test/publico/1.png", duration: 5 });
    const { archivos } = await galeria();
    // Las imágenes de Higgsfield traen `images` y el video `video`: aquí el estado trae las dos y gana la primera.
    expect(archivos[0].tipo).toBe("video");
  });

  it("la dirección de seguimiento que no es de Higgsfield no recibe la llave: se usa la de la documentación", async () => {
    const llamadas = higgsfield({ envio: json({ request_id: "req-1", status_url: "https://malo.test/robar", cancel_url: "https://malo.test/x" }) });
    const { trabajo } = await (await pedirTrabajo({ modelo: "z-image-turbo" })).json();
    await avanzar(trabajo.id);
    expect(remoto(trabajo.id)[0].datos.estado).toBe(`${BASE}/requests/req-1/status`);
    await hastaElFinal(trabajo.id);
    expect(llamadas.some((l) => l.url.startsWith("https://malo.test"))).toBe(false);
  });

  it("NSFW, un fallo y 'sin créditos' dicen por qué, y no se cobra nada", async () => {
    higgsfield({ estados: ["queued", "nsfw"] });
    const a = await (await pedirTrabajo({ modelo: "z-image-turbo" })).json();
    const finA = await hastaElFinal(a.trabajo.id);
    expect(finA.estado).toBe("fallido");
    expect(finA.error).toMatch(/NSFW/);

    higgsfield({ estados: ["failed"] });
    const b = await (await pedirTrabajo({ modelo: "z-image-turbo" })).json();
    const finB = await hastaElFinal(b.trabajo.id);
    expect(finB.error).toMatch(/modelo caído/);

    higgsfield({ envio: json({ detail: "not enough credits" }, 403) });
    const c = await (await pedirTrabajo({ modelo: "z-image-turbo" })).json();
    const finC = (await avanzar(c.trabajo.id)).trabajo;
    expect(finC.estado).toBe("fallido");
    expect(finC.error).toMatch(/créditos/);
    expect(consumo()).toHaveLength(0);
  });

  it("un modelo que necesita una imagen se rechaza al PEDIR, no a mitad del trabajo", async () => {
    higgsfield();
    const r = await pedirTrabajo({ modelo: "kling-2.5", tipo: "video", prompt: "el sofá gira" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/necesita una imagen inicial/);
    expect(db.sqlite.prepare("select count(*) as n from estudio_trabajos").get().n).toBe(0);
  });

  it("sin la llave, dice cuál falta", async () => {
    env.HF_KEY = undefined;
    const r = await pedirTrabajo({ modelo: "soul-2" });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/HF_KEY/);
    env.HF_API_KEY = "id";
    env.HF_API_SECRET = "secreto";
    expect((await pedirTrabajo({ modelo: "soul-2" })).status).toBe(201);
  });

  it("esDeHiggsfield: sólo su propio origen", () => {
    expect(esDeHiggsfield({}, "https://api.higgsfield.ai/requests/1/status")).toBe(true);
    expect(esDeHiggsfield({}, "https://api.higgsfield.ai.malo.test/x")).toBe(false);
    expect(esDeHiggsfield({}, "http://api.higgsfield.ai/x")).toBe(false);
    expect(esDeHiggsfield({}, undefined)).toBe(false);
  });
});

describe("fal.ai: el recorrido de un pedido", () => {
  const RUN = "https://fal.run";
  const COLA = "https://queue.fal.run";

  function fal({ estados = ["IN_QUEUE", "IN_PROGRESS", "COMPLETED"], respuestaImagen = null, envio = null } = {}) {
    const llamadas = [];
    let i = 0;
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url);
      llamadas.push({ url: u, init });
      if (u.startsWith(`${RUN}/`)) return respuestaImagen ?? json({ images: [{ url: "https://v3.fal.media/files/out.png", content_type: "image/png", width: 768, height: 1024 }] });
      if (u.startsWith(`${COLA}/`) && !u.includes("/requests/")) return envio ?? json({ request_id: "abc", status_url: `${COLA}/fal-ai/kling-video/requests/abc/status`, response_url: `${COLA}/fal-ai/kling-video/requests/abc` });
      if (u.endsWith("/requests/abc/status")) {
        const estado = estados[Math.min(i++, estados.length - 1)];
        return json({ status: estado, ...(estado === "IN_QUEUE" ? { queue_position: 2 } : {}) });
      }
      if (u.endsWith("/requests/abc")) return json({ video: { url: "https://v3.fal.media/files/out.mp4" } });
      if (u.startsWith("https://v3.fal.media/files/")) return archivo(u.endsWith(".mp4") ? MP4 : PNG);
      return new Response("{}", { status: 404 });
    });
    return llamadas;
  }

  beforeEach(() => { env.FAL_KEY = "fal-llave"; });

  it("una imagen contesta en el acto: se pide, se baja sin la llave y se cobra", async () => {
    const llamadas = fal();
    const { trabajo } = await (await pedirTrabajo({ modelo: "seedream-4", prompt: "un sofá", ajustes: { aspectRatio: "3:4" } })).json();
    expect(trabajo).toMatchObject({ motor: "fal", tipo: "imagen", costoEstimado: 0.03 });
    const fin = (await avanzar(trabajo.id)).trabajo;
    expect(fin.estado).toBe("hecho");
    const pedido = llamadas.find((l) => l.url === `${RUN}/fal-ai/bytedance/seedream/v4/text-to-image`);
    expect(pedido.init.headers.Authorization).toBe("Key fal-llave");
    expect(JSON.parse(pedido.init.body)).toEqual({ prompt: "un sofá", num_images: 1, image_size: "portrait_4_3" });
    expect(llamadas.find((l) => l.url.startsWith("https://v3.fal.media/")).init.headers?.Authorization).toBeUndefined();
    const { archivos } = await galeria();
    expect(archivos[0]).toMatchObject({ tipo: "imagen", mime: "image/png", modelo: "seedream-4", ancho: 768, alto: 1024 });
    expect(consumo()[0]).toMatchObject({ proveedor: "fal", funcion: "estudio-imagen", costo_usd: 0.03 });
  });

  it("con una referencia, una imagen va a su ruta de edición con la imagen como data URI", async () => {
    const llamadas = fal();
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/ref.png", { bytes: PNG, tipo: "image/png" });
    const { trabajo } = await (await pedirTrabajo({ modelo: "nano-banana-fal", prompt: "ponle fondo azul", medios: { reference: ["clientes/c1/estudio/2026-09/ref.png"] } })).json();
    await avanzar(trabajo.id);
    const pedido = llamadas.find((l) => l.url === `${RUN}/fal-ai/nano-banana/edit`);
    expect(JSON.parse(pedido.init.body).image_urls).toEqual([`data:image/png;base64,${PNG_B64}`]);
  });

  it("un video va por la cola: se envía, se mira, se pide el resultado y se baja; las direcciones que devuelve fal se siguen si son de su cola", async () => {
    const llamadas = fal();
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/ini.png", { bytes: PNG, tipo: "image/png" });
    const { trabajo } = await (await pedirTrabajo({ modelo: "kling-2.5-fal", tipo: "video", prompt: "el sofá gira", ajustes: { duration: "5" }, medios: { start: ["clientes/c1/estudio/2026-09/ini.png"] } })).json();
    expect(trabajo.costoEstimado).toBe(0.35);
    const enviado = (await avanzar(trabajo.id)).trabajo;
    expect(enviado.nota).toMatch(/Enviado/);
    const envio = llamadas.find((l) => l.url === `${COLA}/fal-ai/kling-video/v2.5-turbo/pro/image-to-video`);
    expect(JSON.parse(envio.init.body)).toEqual({ prompt: "el sofá gira", image_url: `data:image/png;base64,${PNG_B64}`, duration: "5" });
    expect(remoto(trabajo.id)[0].datos).toEqual({ estado: `${COLA}/fal-ai/kling-video/requests/abc/status`, resultado: `${COLA}/fal-ai/kling-video/requests/abc` });

    const fin = await hastaElFinal(trabajo.id);
    expect(fin.estado).toBe("hecho");
    const { archivos } = await galeria();
    expect(archivos[0]).toMatchObject({ tipo: "video", mime: "video/mp4", modelo: "kling-2.5-fal" });
    expect(env.MEDIA.objetos.get(archivos[0].clave).bytes).toEqual(MP4);
    expect(consumo()[0]).toMatchObject({ proveedor: "fal", funcion: "estudio-video", costo_usd: 0.35 });
    // El archivo se baja SIN la llave.
    expect(llamadas.find((l) => l.url.startsWith("https://v3.fal.media/")).init.headers?.Authorization).toBeUndefined();
  });

  it("una dirección de seguimiento que no es de la cola de fal no recibe la llave: se usa la reconstruida", async () => {
    const llamadas = fal({ envio: json({ request_id: "abc", status_url: "https://malo.test/estado", response_url: "https://malo.test/resultado" }) });
    const { trabajo } = await (await pedirTrabajo({ modelo: "hailuo-02-fal", tipo: "video", prompt: "el sofá gira" })).json();
    await avanzar(trabajo.id);
    const datos = remoto(trabajo.id)[0].datos;
    // fal sólo usa `dueño/aplicación` en las direcciones de su cola.
    expect(datos).toEqual({ estado: `${COLA}/fal-ai/minimax/requests/abc/status`, resultado: `${COLA}/fal-ai/minimax/requests/abc` });
    expect(llamadas.some((l) => l.url.startsWith("https://malo.test"))).toBe(false);
  });

  it("el saldo, la llave y los datos no válidos dicen qué pasó", async () => {
    fal({ respuestaImagen: json({ detail: "Exhausted balance" }, 403) });
    const a = await (await pedirTrabajo({ modelo: "flux-schnell" })).json();
    expect((await avanzar(a.trabajo.id)).trabajo.error).toMatch(/sin saldo|permiso/);

    fal({ respuestaImagen: json({ detail: [{ msg: "prompt demasiado corto" }] }, 422) });
    const b = await (await pedirTrabajo({ modelo: "flux-schnell" })).json();
    expect((await avanzar(b.trabajo.id)).trabajo.error).toMatch(/prompt demasiado corto/);

    fal({ respuestaImagen: json({}, 401) });
    const c = await (await pedirTrabajo({ modelo: "flux-schnell" })).json();
    expect((await avanzar(c.trabajo.id)).trabajo.error).toMatch(/FAL_KEY/);
    expect(consumo()).toHaveLength(0);
  });

  it("sin la llave, dice cuál falta", async () => {
    env.FAL_KEY = undefined;
    const r = await pedirTrabajo({ modelo: "flux-schnell" });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/FAL_KEY/);
  });

  it("esDeLaCola: sólo el origen de la cola de fal", () => {
    expect(esDeLaCola({}, "https://queue.fal.run/fal-ai/x/requests/1/status")).toBe(true);
    expect(esDeLaCola({}, "https://queue.fal.run.malo.test/x")).toBe(false);
    expect(esDeLaCola({}, "https://fal.run/x")).toBe(false);
    expect(esDeLaCola({}, "nada")).toBe(false);
  });
});

describe("el catálogo generado se puede regenerar sin cambios", () => {
  it("`generar()` produce exactamente lo que hay escrito", () => {
    expect(JSON.parse(JSON.stringify(generar()))).toEqual(JSON.parse(fs.readFileSync(SALIDA, "utf8")));
  });
});
