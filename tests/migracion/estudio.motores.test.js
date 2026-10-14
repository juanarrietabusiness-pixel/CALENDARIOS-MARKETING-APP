import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { MODELOS, modeloPorId, MEDIDAS, validarPedido, estimar, nombreDelModelo, retirado } from "../../src/lib/estudioCatalogo.js";
import { generar, texto, SALIDA, MODELOS_HF, PROPORCIONES_CONOCIDAS } from "../../scripts/estudio/generar-higgsfield.mjs";
import ESQUEMAS_JSON from "../../worker/lib/estudio/higgsfield-schemas.json";
import { pedidoHiggsfield, rutaDe, cuerpoDe, esDeHiggsfield } from "../../worker/lib/estudio/higgsfield.js";
import { MODELOS_FAL, pedidoFal, esDeLaCola } from "../../worker/lib/estudio/fal.js";
import { MODELOS_KIE, pedidoKie, urlsDelResultado, datosDe, validarKie } from "../../worker/lib/estudio/kie.js";

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

describe("Kie.ai: el recorrido de un pedido", () => {
  const API = "https://api.kie.ai";
  const SUBIDA = "https://kieai.redpandaai.co/api/file-stream-upload";

  function kie({ estados = ["waiting", "generating", "success"], crear = null, resultado = null } = {}) {
    const llamadas = [];
    let i = 0;
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url);
      llamadas.push({ url: u, init });
      if (u === SUBIDA) {
        const video = String(init.body?.get?.("uploadPath") ?? "").startsWith("videos");
        return json({ success: true, code: 200, msg: "ok", data: { downloadUrl: `https://tempfile.kie.test/ref.${video ? "mp4" : "png"}` } });
      }
      if (u === `${API}/api/v1/jobs/createTask`) return crear ?? json({ code: 200, msg: "success", data: { taskId: "t-1" } });
      if (u === `${API}/api/v1/omni/audio/create`) return json({ code: 200, msg: "success", data: { audioId: "audio_kore_1" } });
      if (u.startsWith(`${API}/api/v1/jobs/recordInfo`)) {
        const state = estados[Math.min(i++, estados.length - 1)];
        return json({ code: 200, data: { taskId: "t-1", state, ...(state === "success" ? { resultJson: resultado ?? JSON.stringify({ resultUrls: ["https://tempfile.kie.test/out.png"] }) } : {}), ...(state === "fail" ? { failMsg: "contenido no permitido" } : {}) } });
      }
      if (u.startsWith("https://tempfile.kie.test/out")) return archivo(u.endsWith(".mp4") ? MP4 : PNG);
      return new Response("{}", { status: 404 });
    });
    return llamadas;
  }

  beforeEach(() => { env.KIE_API_KEY = "kie-secreta"; });

  it("cada modelo de Kie del catálogo tiene su pedido, y al revés", () => {
    expect(Object.keys(MODELOS_KIE).sort()).toEqual(MODELOS.filter((m) => m.motor === "kie").map((m) => m.id).sort());
  });

  it("GPT Image 2: sin referencias, texto a imagen; con ellas, imagen a imagen; el 4:5 sale 3:4 y el 1:1 no pasa de 2K", () => {
    const m = modeloPorId("gpt-image-2-kie");
    expect(pedidoKie(m, { prompt: "p", ajustes: { aspectRatio: "9:16", imageSize: "2K" } })).toEqual({ model: "gpt-image-2-text-to-image", input: { prompt: "p", aspect_ratio: "9:16", resolution: "2K" } });
    expect(pedidoKie(m, { prompt: "p", ajustes: { aspectRatio: "4:5", imageSize: "1K" }, refs: ["https://a"] })).toEqual({ model: "gpt-image-2-image-to-image", input: { prompt: "p", input_urls: ["https://a"], aspect_ratio: "3:4", resolution: "1K" } });
    expect(pedidoKie(m, { prompt: "p", ajustes: { aspectRatio: "1:1", imageSize: "4K" } }).input.resolution).toBe("2K");
    expect(pedidoKie(modeloPorId("nano-banana-pro-kie"), { prompt: "p", ajustes: { aspectRatio: "4:5", imageSize: "2K" }, refs: ["https://a"] }))
      .toEqual({ model: "nano-banana-pro", input: { prompt: "p", image_input: ["https://a"], aspect_ratio: "4:5", resolution: "2K", output_format: "png" } });
  });

  it("los videos: cada modelo con su forma (texto, imagen inicial y final, referencias, video)", () => {
    const p = (id, extra = {}) => pedidoKie(modeloPorId(id), { prompt: "p", ajustes: { ...modeloPorId(id).ajustes && Object.fromEntries(Object.entries(modeloPorId(id).ajustes).map(([k, d]) => [k, d.defecto])), ...(extra.ajustes ?? {}) }, ...extra });
    // Kling 3.0: desde texto con proporción; con imagen inicial y final, sin proporción (la da la imagen).
    expect(p("kling-3-kie")).toEqual({ model: "kling-3.0/video", input: { prompt: "p", sound: true, duration: "10", mode: "std", multi_shots: false, aspect_ratio: "9:16" } });
    expect(p("kling-3-kie", { inicio: ["https://i"], fin: ["https://f"], ajustes: { sonido: "no" } }).input).toMatchObject({ image_urls: ["https://i", "https://f"], sound: false });
    expect(p("kling-3-kie", { inicio: ["https://i"] }).input.aspect_ratio).toBeUndefined();
    // Kling 3.0 Omni: la ruta sale de lo que lleva.
    expect(p("kling-3-omni-kie").model).toBe("kling-3.0-omni/text-to-video");
    expect(p("kling-3-omni-kie", { inicio: ["https://i"] })).toMatchObject({ model: "kling-3.0-omni/image-to-video", input: { image_urls: ["https://i"], duration: 10 } });
    expect(p("kling-3-omni-kie", { refs: ["https://a", "https://b"] })).toMatchObject({ model: "kling-3.0-omni/reference-to-video", input: { image_urls: ["https://a", "https://b"], duration: 10, aspect_ratio: "9:16" } });
    expect(p("kling-3-omni-kie", { videos: ["https://v"] }).input).toMatchObject({ video_urls: ["https://v"], aspect_ratio: "auto" });
    // Seedance: referencias, video y fotogramas en sus campos, la duración como número.
    expect(p("seedance-2-kie", { refs: ["https://a"], videos: ["https://v"], inicio: ["https://i"] }).input)
      .toMatchObject({ reference_image_urls: ["https://a"], reference_video_urls: ["https://v"], first_frame_url: "https://i", duration: 10, generate_audio: true });
    // Veo 3.1: el modelo de arriba es siempre «veo-3-1»; con referencias, 8 s.
    expect(p("veo-3-1-fast-kie", { refs: ["https://a"], ajustes: { duration: "4" } })).toEqual({
      model: "veo-3-1", input: { prompt: "p", model: "veo3_fast", aspect_ratio: "9:16", resolution: "720p", duration: 8, generation_type: "REFERENCE_2_VIDEO", image_urls: ["https://a"] },
    });
    expect(p("veo-3-1-kie", { inicio: ["https://i"] }).input).toMatchObject({ model: "veo3", generation_type: "FIRST_AND_LAST_FRAMES_2_VIDEO", image_urls: ["https://i"] });
    // Gemini Omni: con imagen inicial, nada más; con referencias y video, el tramo y como mucho 5 imágenes.
    expect(p("gemini-omni-kie", { inicio: ["https://i"], fin: ["https://f"] }).input).toEqual({
      prompt: "p", aspect_ratio: "9:16", resolution: "720p", duration: "10", first_frame_url: "https://i", last_frame_url: "https://f",
    });
    const omni = p("gemini-omni-kie", { refs: ["1", "2", "3", "4", "5", "6", "7"].map((x) => `https://${x}`), videos: ["https://v"] }).input;
    expect(omni.image_urls).toHaveLength(5);
    expect(omni.video_list).toEqual([{ url: "https://v", start: 0, ends: 10 }]);
    expect(p("hailuo-2-3-kie", { inicio: ["https://i"] })).toEqual({ model: "hailuo/2-3-image-to-video-pro", input: { prompt: "p", image_url: "https://i", duration: "10", resolution: "768P" } });
    expect(p("wan-2-7-kie").model).toBe("wan/2-7-text-to-video");
    expect(p("wan-2-7-kie", { inicio: ["https://i"] }).model).toBe("wan/2-7-image-to-video");
  });

  it("las imágenes nuevas: su forma; «pulir» ya no existe y sus piezas se nombran retiradas", () => {
    const p = (id, extra = {}) => pedidoKie(modeloPorId(id), { prompt: "p", ajustes: {}, ...extra });
    expect(p("ideogram-3-kie", { ajustes: { aspectRatio: "9:16", calidad: "high" } }).input).toMatchObject({ image_size: "portrait_16_9", rendering_speed: "QUALITY" });
    expect(p("gpt-image-2-5-kie", { refs: ["https://a"] }).model).toBe("gpt-image-2-5-sunburst-image-to-image");
    expect(p("seedream-5-pro-kie").model).toBe("seedream/5-pro-text-to-image");
    expect(p("nano-banana-2-1-kie", { refs: ["https://a"], ajustes: { aspectRatio: "4:5" } }).input).toMatchObject({ image_input: ["https://a"], aspect_ratio: "4:5" });
    for (const id of ["topaz-ampliar-kie", "recraft-nitidez-kie", "recraft-sin-fondo-kie"]) {
      expect(modeloPorId(id)).toBeFalsy();
      expect(nombreDelModelo(id)).toMatch(/\(retirado\)$/);
      expect(retirado(id)).toMatch(/ya no se ofrece/);
    }
  });

  it("lo que Kie no mezcla se dice al pedir; el precio cambia con la calidad", () => {
    const v = (id, medios) => validarKie(modeloPorId(id), { medios });
    expect(v("gemini-omni-kie", { start: ["a"], reference: ["b"] })).toMatch(/no mezcla la imagen inicial/);
    expect(v("gemini-omni-kie", { video: ["v"], reference: ["1", "2", "3", "4", "5", "6"] })).toMatch(/hasta 5 imágenes/);
    expect(v("gemini-omni-kie", { reference: ["a"] })).toBeNull();
    expect(v("veo-3-1-fast-kie", { start: ["a"], reference: ["b"] })).toMatch(/no mezcla/);
    expect(estimar("kling-3-kie", 1, { duration: "10" })).toBe(0.7);
    expect(estimar("kling-3-kie", 1, { duration: "10", modo: "pro" })).toBe(1);
    expect(estimar("gemini-omni-kie", 1, { duration: "10", resolution: "1080p" })).toBe(1.2);
    expect(estimar("nano-banana-2-1-kie", 1, { imageSize: "4K" })).toBe(0.1);
  });

  it("un video con imagen inicial y video de referencia: los sube cada uno a su sitio, crea la tarea y baja el MP4", async () => {
    const llamadas = kie({ resultado: JSON.stringify({ resultUrls: ["https://tempfile.kie.test/out.mp4"] }) });
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/ref.png", { bytes: PNG, tipo: "image/png" });
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/ref.mp4", { bytes: MP4, tipo: "video/mp4" });
    const { trabajo } = await (await pedirTrabajo({
      modelo: "seedance-2-kie", tipo: "video", prompt: "el bebé gatea", ajustes: { duration: "5" },
      medios: { start: ["clientes/c1/estudio/2026-09/ref.png"], video: ["clientes/c1/estudio/2026-09/ref.mp4"] }, confirmado: true,
    })).json();
    expect(trabajo.costoEstimado).toBe(0.4);
    await avanzar(trabajo.id);
    const subidas = llamadas.filter((l) => l.url === SUBIDA).map((l) => l.init.body.get("uploadPath"));
    expect(subidas).toEqual(["images/estudio", "videos/estudio"]);
    const crear = JSON.parse(llamadas.find((l) => l.url.endsWith("/createTask")).init.body);
    expect(crear).toMatchObject({ model: "bytedance/seedance-2", input: { first_frame_url: "https://tempfile.kie.test/ref.png", reference_video_urls: ["https://tempfile.kie.test/ref.mp4"], duration: 5 } });
    const fin = await hastaElFinal(trabajo.id);
    expect(fin.estado).toBe("hecho");
    const { archivos } = await galeria();
    expect(archivos[0]).toMatchObject({ tipo: "video", mime: "video/mp4", modelo: "seedance-2-kie" });
    expect(consumo()[0]).toMatchObject({ proveedor: "kie", costo_usd: 0.4 });
  });

  it("Omni con voz: registra la voz (gratis) y la manda en audio_ids; con imagen inicial no se admite", async () => {
    const llamadas = kie({ resultado: JSON.stringify({ resultUrls: ["https://tempfile.kie.test/out.mp4"] }) });
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/f1.png", { bytes: PNG, tipo: "image/png" });
    const { trabajo } = await (await pedirTrabajo({
      modelo: "gemini-omni-kie", tipo: "video", prompt: "Locución: «Duerme mejor»", ajustes: { duration: "10", voz: "kore" },
      medios: { reference: ["clientes/c1/estudio/2026-09/f1.png"] }, confirmado: true,
    })).json();
    await avanzar(trabajo.id);
    const voz = llamadas.find((l) => l.url.endsWith("/omni/audio/create"));
    expect(JSON.parse(voz.init.body)).toEqual({ audio_id: "kore", name: "Voz kore" });
    const crear = JSON.parse(llamadas.find((l) => l.url.endsWith("/createTask")).init.body);
    expect(crear.input).toMatchObject({ image_urls: ["https://tempfile.kie.test/ref.png"], audio_ids: ["audio_kore_1"], duration: "10" });
    expect(validarKie(modeloPorId("gemini-omni-kie"), { medios: { start: ["a"] }, ajustes: { voz: "kore" } })).toMatch(/no admite una voz/);
    expect(pedidoKie(modeloPorId("gemini-omni-kie"), { prompt: "p", inicio: ["https://i"], audios: ["x"] }).input.audio_ids).toBeUndefined();
  });

  it("el resultado: resultJson como texto o como objeto; el error va por `code` aunque el HTTP sea 200", () => {
    expect(urlsDelResultado({ resultJson: JSON.stringify({ resultUrls: ["https://x/1.png"] }) })).toEqual(["https://x/1.png"]);
    expect(urlsDelResultado({ resultJson: { resultUrls: ["https://x/2.png", "http://inseguro"] } })).toEqual(["https://x/2.png"]);
    expect(urlsDelResultado({ resultJson: "no es json" })).toEqual([]);
    expect(() => datosDe({ code: 402, msg: "Insufficient credits" })).toThrow(/no tiene créditos suficientes en la cuenta: Insufficient credits/);
    expect(() => datosDe({ code: 401 })).toThrow(/KIE_API_KEY/);
    expect(datosDe({ code: 200, data: { taskId: "x" } })).toEqual({ taskId: "x" });
  });

  it("una imagen con referencia: la sube a Kie, crea la tarea con su dirección, espera, la baja a R2 y la cobra al entregarla", async () => {
    const llamadas = kie();
    env.MEDIA.objetos.set("clientes/c1/estudio/2026-09/ref.png", { bytes: PNG, tipo: "image/png" });
    const { trabajo } = await (await pedirTrabajo({ modelo: "gpt-image-2-kie", ajustes: { aspectRatio: "9:16" }, medios: { reference: ["clientes/c1/estudio/2026-09/ref.png"] } })).json();
    expect(trabajo).toMatchObject({ motor: "kie", estado: "en_cola", costoEstimado: 0.05 });
    const enviado = (await avanzar(trabajo.id)).trabajo;
    expect(enviado.estado).toBe("en_marcha");
    const subida = llamadas.find((l) => l.url === SUBIDA);
    expect(subida.init.headers.Authorization).toBe("Bearer kie-secreta");
    expect(subida.init.body.get("uploadPath")).toBe("images/estudio");
    const crear = llamadas.find((l) => l.url.endsWith("/createTask"));
    expect(JSON.parse(crear.init.body)).toEqual({
      model: "gpt-image-2-image-to-image", input: { prompt: "una taza de café", input_urls: ["https://tempfile.kie.test/ref.png"], aspect_ratio: "9:16", resolution: "2K" },
    });
    expect(consumo()).toHaveLength(0);
    expect(remoto(trabajo.id)[0]).toMatchObject({ id: "t-1" });

    const fin = await hastaElFinal(trabajo.id);
    expect(fin.estado).toBe("hecho");
    const { archivos } = await galeria();
    expect(archivos[0]).toMatchObject({ modelo: "gpt-image-2-kie", mime: "image/png" });
    expect(consumo()[0]).toMatchObject({ proveedor: "kie", modelo: "gpt-image-2-kie", costo_usd: 0.05 });
    // La llave viaja a Kie y NO al servidor del archivo.
    expect(llamadas.find((l) => l.url.startsWith("https://tempfile.kie.test/out")).init.headers?.Authorization).toBeUndefined();
  });

  it("lo que Kie da por fallido dice por qué; sin créditos, lo dice sin llegar a crear nada más", async () => {
    kie({ estados: ["fail"] });
    const { trabajo } = await (await pedirTrabajo({ modelo: "nano-banana-2-kie" })).json();
    const fin = await hastaElFinal(trabajo.id);
    expect(fin.estado).toBe("fallido");
    expect(fin.error).toMatch(/Kie.ai no pudo hacerlo \(contenido no permitido\)/);

    kie({ crear: json({ code: 402, msg: "Credits insufficient" }) });
    const otro = (await (await pedirTrabajo({ modelo: "nano-banana-2-kie" })).json()).trabajo;
    const mal = await hastaElFinal(otro.id);
    expect(mal.estado).toBe("fallido");
    expect(mal.error).toMatch(/no tiene créditos suficientes/);
  });

  it("sin KIE_API_KEY el motor sale apagado", async () => {
    delete env.KIE_API_KEY;
    const { motores } = await (await pedir("/api/estudio/motores")).json();
    expect(motores.kie).toEqual({ nombre: "Kie.ai", activo: false, llave: "KIE_API_KEY" });
  });
});

describe("el catálogo generado se puede regenerar sin cambios", () => {
  it("`generar()` produce exactamente lo que hay escrito", () => {
    expect(JSON.parse(JSON.stringify(generar()))).toEqual(JSON.parse(fs.readFileSync(SALIDA, "utf8")));
  });
});
