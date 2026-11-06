import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasEstudio } from "../../worker/lib/estudio/herramientas.js";
import { ejecutarRender } from "../../worker/lib/estudio/render.js";
import { tipoPorBytes } from "../../worker/lib/estudio/archivos.js";
import { claveDeSonido } from "../../worker/lib/estudio/sonidos.js";

// ============================================================
// La BIBLIOTECA DE SONIDO por las rutas de verdad (D1 en memoria, R2 y servicios de mentira: nada se paga):
//
//   · la del cliente: lo que ya había (Suno, subidas) entra solo y la locución no; subir música y efectos (MP3, WAV,
//     M4A) con sus topes; nombre, etiquetas, BPM y UNA favorita de música (la música de la marca); quitar dice qué
//     videos la usan y sólo con un segundo toque la manda a la papelera; «Deshacer»;
//   · la de la agencia: la cambian admin y editores sin clientes (403 a un colaborador); su audio se sirve por trozos
//     y fuera de `clientes/`; «Usar de la agencia» y «Pasar a la agencia» copian sin repetir;
//   · las dos se usan en el video: la lista de músicas suma la de la agencia (la favorita del cliente primero), el
//     sonido acepta su música y un efecto para las transiciones y otro para los sellos, y el render los manda;
//   · un video nuevo nace con la música de la marca;
//   · el director musical ofrece GRATIS la que ya encaja antes de pagar a Suno; las herramientas de Claude la ven.
// ============================================================

const JEFE = "u-jefe";
const COLA = "u-cola";
let db;
let env;
let fetchReal;

const ejemplo = () => {
  const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
  return JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1]);
};

/** Un MP3 de mentira (etiqueta ID3 y cuadros). `semilla` cambia sus bytes: dos subidas distintas no son la misma. */
function mp3(kb = 40, semilla = 1) {
  const b = new Uint8Array(kb * 1024);
  b.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]);
  for (let i = 10; i + 4 < b.length; i += 417) b.set([0xff, 0xfb, 0x90, semilla & 0xff], i);
  return b;
}
const wav = (kb = 8) => {
  const b = new Uint8Array(kb * 1024);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
  return b;
};
const m4a = () => {
  const b = new Uint8Array(4096);
  b.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
  return b;
};

/** R2 de mentira, con rangos (como el de verdad: `range` puede ser las cabeceras de la petición). */
function r2() {
  const objetos = new Map();
  const bytesDe = async (v) => (v instanceof Uint8Array ? v : new Uint8Array(await new Response(v).arrayBuffer()));
  return {
    objetos,
    async head(k) { return objetos.has(k) ? { size: objetos.get(k).bytes.length } : null; },
    async get(k, opciones) {
      const o = objetos.get(k);
      if (!o) return null;
      const m = /^bytes=(\d+)-(\d*)$/.exec(opciones?.range?.get?.("Range") ?? "");
      const inicio = m ? Number(m[1]) : 0;
      const fin = m && m[2] ? Number(m[2]) + 1 : o.bytes.length;
      const trozo = o.bytes.slice(inicio, fin);
      return {
        body: trozo, size: o.bytes.length, httpMetadata: { contentType: o.tipo }, httpEtag: '"e"',
        ...(m ? { range: { offset: inicio, length: trozo.length } } : {}),
        writeHttpMetadata(h) { if (o.tipo) h.set("Content-Type", o.tipo); },
        arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength),
      };
    },
    async put(k, v, op) { objetos.set(k, { bytes: await bytesDe(v), tipo: op?.httpMetadata?.contentType }); },
    async delete(k) { for (const x of [].concat(k)) objetos.delete(x); },
  };
}

const pedir = (ruta, { method = "GET", body, form, testigo = "t-jefe", headers = {} } = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    method,
    headers: { Cookie: `${COOKIE}=${testigo}`, ...(form ? {} : { "Content-Type": "application/json" }), ...headers },
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  }), env);

/** Sube un audio por multipart a `ruta` (la del cliente o la de la agencia). */
function subir(ruta, bytes, { nombre = "tema.mp3", categoria = "musica", duracion = null, testigo } = {}) {
  const form = new FormData();
  form.append("archivo", new File([bytes], nombre, { type: "application/octet-stream" }));
  form.append("categoria", categoria);
  if (duracion !== null) form.append("duracion", String(duracion));
  return pedir(ruta, { method: "POST", form, testigo });
}

const archivo = (id) => db.sqlite.prepare("select * from estudio_archivos where id = ?").get(id);

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") }, RENDER: { idFromName: (n) => n, get: () => ({ fetch: async () => new Response("{}", { status: 202 }) }) } };
  fetchReal = globalThis.fetch;
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "y");
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(COLA, "cola@a.com", "x", "y");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLA, JEFE, "editor", "Cola", "#FF0000", JSON.stringify(["bc"]));
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("bc", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("otro", JEFE, "Otro cliente");
  for (const [t, u] of [["t-jefe", JEFE], ["t-cola", COLA]]) {
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)").run(await sha256(t), u, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  // Lo que ya había: una música de Suno (con su estilo), una subida y una locución (que NO es de la biblioteca).
  const ins = s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo, prompt, ajustes, bytes, created_at) values (?,?,?,?,?,?,?,?,?,?,?)");
  ins.run("suno1", JEFE, "bc", "clientes/bc/estudio/manana.mp3", "audio", "audio/mpeg", "musica-suno", "Mañana (1)",
    JSON.stringify({ pedido: { estilo: "warm acoustic folk, ukulele, soft claps, upbeat, 100 BPM" }, duracion: 30.2 }), 9000, "2026-10-01T00:00:00.000Z");
  ins.run("sub1", JEFE, "bc", "clientes/bc/estudio/tema.mp3", "audio", "audio/mpeg", "musica-subida", "Tema alegre.mp3", "{}", 8000, "2026-10-02T00:00:00.000Z");
  ins.run("voz1", JEFE, "bc", "clientes/bc/estudio/voz.mp3", "audio", "audio/mpeg", "elevenlabs-v4", "Locución", "{}", 7000, "2026-10-03T00:00:00.000Z");
  env.MEDIA.objetos.set("clientes/bc/estudio/manana.mp3", { bytes: mp3(9, 7), tipo: "audio/mpeg" });
  env.MEDIA.objetos.set("clientes/bc/estudio/tema.mp3", { bytes: mp3(8, 8), tipo: "audio/mpeg" });
}, 30_000);
afterEach(() => { globalThis.fetch = fetchReal; });

describe("el M4A se reconoce por su marca", () => {
  it("«M4A » es audio; cualquier otro ftyp sigue siendo video", () => {
    expect(tipoPorBytes(m4a())).toBe("audio/mp4");
    const mp4 = m4a();
    mp4.set([0x69, 0x73, 0x6f, 0x6d], 8);
    expect(tipoPorBytes(mp4)).toBe("video/mp4");
  });
});

describe("la biblioteca de un cliente", () => {
  it("lo que ya había entra solo (Suno con su BPM, la subida); la locución no; la de la agencia va aparte", async () => {
    const j = await (await pedir("/sonidos/bc")).json();
    expect(j.musica.map((p) => p.id)).toEqual(["sub1", "suno1"]);
    expect(j.efectos).toEqual([]);
    const suno = j.musica.find((p) => p.id === "suno1");
    expect(suno).toMatchObject({ nombre: "Mañana (1)", categoria: "musica", de: "cliente", origen: "suno", bpm: 100, duracion: 30.2, src: "/api/media/clientes/bc/estudio/manana.mp3" });
    expect(j.musica.find((p) => p.id === "sub1").nombre).toBe("Tema alegre");
    expect(j.agencia).toEqual({ musica: [], efectos: [] });
    expect(j.puedeCambiarAgencia).toBe(true);
  });

  it("sube música (MP3, WAV, M4A) y efectos con sus topes; lo que no es audio, no; la misma otra vez es la que había", async () => {
    let r = await subir("/sonidos/bc", mp3(30, 3), { nombre: "Pop alegre.mp3", duracion: 31.86 });
    expect(r.status).toBe(201);
    const { pista } = await r.json();
    expect(pista).toMatchObject({ nombre: "Pop alegre", categoria: "musica", origen: "subida", duracion: 31.9, de: "cliente" });
    expect(pista.src).toMatch(/^\/api\/media\/clientes\/bc\/estudio\/.+\.mp3$/);
    expect(archivo(pista.id)).toMatchObject({ tipo: "audio", modelo: "musica-subida", subido: 1 });
    // La misma: 200 con la de antes.
    r = await subir("/sonidos/bc", mp3(30, 3), { nombre: "Otra vez.mp3" });
    expect(r.status).toBe(200);
    expect((await r.json())).toMatchObject({ repetido: true, pista: { id: pista.id } });
    // Un efecto WAV y un M4A.
    r = await subir("/sonidos/bc", wav(), { nombre: "ding.wav", categoria: "efecto" });
    expect((await r.json()).pista).toMatchObject({ categoria: "efecto", mime: "audio/wav", nombre: "ding" });
    r = await subir("/sonidos/bc", m4a(), { nombre: "nota.m4a" });
    expect((await r.json()).pista.src).toMatch(/\.m4a$/);
    // Un efecto de más de 2 MB, no; una imagen, tampoco.
    expect((await subir("/sonidos/bc", mp3(2100, 4), { categoria: "efecto" })).status).toBe(413);
    const png = new Uint8Array(100); png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect((await subir("/sonidos/bc", png)).status).toBe(415);
    const j = await (await pedir("/sonidos/bc")).json();
    expect(j.efectos.map((p) => p.nombre)).toEqual(["ding"]);
    expect(j.musica).toHaveLength(4);
  });

  it("nombre, etiquetas y BPM; UNA favorita de música (la música de la marca), que va primero", async () => {
    let r = await pedir("/sonidos/bc/sub1", { method: "PATCH", body: { nombre: "Tema de la marca", etiquetas: "Alegre, acústica", bpm: 98, favorita: true } });
    expect((await r.json()).pista).toMatchObject({ nombre: "Tema de la marca", etiquetas: ["alegre", "acústica"], bpm: 98, favorita: true });
    r = await pedir("/sonidos/bc/suno1", { method: "PATCH", body: { favorita: true } });
    expect((await r.json()).pista.favorita).toBe(true);
    // Lo que dura lo apunta el navegador después de subirla (medido de su dirección).
    r = await pedir("/sonidos/bc/sub1", { method: "PATCH", body: { duracion: 31.86 } });
    expect((await r.json()).pista.duracion).toBe(31.9);
    expect(archivo("sub1").favorito).toBe(0);
    const j = await (await pedir("/sonidos/bc")).json();
    expect(j.musica[0].id).toBe("suno1");
    // La locución no se puede tocar desde aquí, ni lo de otro cliente.
    expect((await pedir("/sonidos/bc/voz1", { method: "PATCH", body: { nombre: "x" } })).status).toBe(404);
    expect((await pedir("/sonidos/otro/sub1", { method: "PATCH", body: { nombre: "x" } })).status).toBe(404);
  });

  it("quitar una que usa un video lo dice (409 con cuáles); con el segundo toque va a la papelera; «Deshacer» la trae", async () => {
    const v = (await (await pedir("/videos/bc", { method: "POST", body: { guion: ejemplo(), titulo: "Video de prueba" } })).json()).video;
    expect((await pedir(`/videos/bc/${v.id}/sonido`, { method: "PUT", body: { efectos: true, musica: { archivoId: "sub1", volumen: 0 } } })).status).toBe(200);
    let r = await pedir("/sonidos/bc/sub1", { method: "DELETE" });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j).toMatchObject({ codigo: "en_uso", usos: [{ id: v.id, titulo: "Video de prueba" }] });
    expect(j.error).toMatch(/La usa un video: «Video de prueba»/);
    r = await pedir("/sonidos/bc/sub1?forzar=1", { method: "DELETE" });
    expect(await r.json()).toEqual({ quitada: true, papelera: true });
    expect(archivo("sub1").borrado_at).toBeTruthy();
    // El archivo sigue en R2 (el render no se rompe) y ya no sale en la biblioteca.
    expect(env.MEDIA.objetos.has("clientes/bc/estudio/tema.mp3")).toBe(true);
    expect((await (await pedir("/sonidos/bc")).json()).musica.map((p) => p.id)).toEqual(["suno1"]);
    r = await pedir("/sonidos/bc/sub1/recuperar", { method: "POST" });
    expect((await r.json()).pista.id).toBe("sub1");
    expect(archivo("sub1").borrado_at).toBeNull();
  });
});

describe("la biblioteca de la agencia", () => {
  it("la cambian admin y editores sin clientes: 403 a un colaborador, que sí la ve", async () => {
    expect((await subir("/sonidos/agencia", mp3(20, 9), { testigo: "t-cola" })).status).toBe(403);
    const r = await subir("/sonidos/agencia", mp3(20, 9), { nombre: "Corporativa.mp3", duracion: 45 });
    expect(r.status).toBe(201);
    const { pista } = await r.json();
    expect(pista).toMatchObject({ nombre: "Corporativa", de: "agencia", categoria: "musica", duracion: 45 });
    expect(pista.src).toBe(`/api/sonidos/agencia/${pista.id}/audio`);
    const fila = db.sqlite.prepare("select * from biblioteca_sonidos where id = ?").get(pista.id);
    expect(fila.clave).toMatch(new RegExp(`^biblioteca/${JEFE}/musica/.+\\.mp3$`));
    // El colaborador la ve, pero no la cambia.
    const vista = await (await pedir("/sonidos/agencia", { testigo: "t-cola" })).json();
    expect(vista).toMatchObject({ puedeCambiar: false, musica: [{ id: pista.id }] });
    expect((await pedir(`/sonidos/agencia/${pista.id}`, { method: "PATCH", body: { nombre: "x" }, testigo: "t-cola" })).status).toBe(403);
    expect((await (await pedir("/sonidos/bc", { testigo: "t-cola" })).json()).puedeCambiarAgencia).toBe(false);
    // El admin sí: etiquetas, BPM y favorita.
    const c = await (await pedir(`/sonidos/agencia/${pista.id}`, { method: "PATCH", body: { etiquetas: ["corporativa"], bpm: 110, favorita: true } })).json();
    expect(c.pista).toMatchObject({ etiquetas: ["corporativa"], bpm: 110, favorita: true });
  });

  it("su audio se sirve con sesión y por trozos (el iPhone pide bytes=0-1); /api/media no lo sirve", async () => {
    const { pista } = await (await subir("/sonidos/agencia", mp3(20, 10))).json();
    let r = await pedir(`/sonidos/agencia/${pista.id}/audio`, { headers: { Range: "bytes=0-1" } });
    expect(r.status).toBe(206);
    expect(r.headers.get("Content-Range")).toBe(`bytes 0-1/${20 * 1024}`);
    expect(r.headers.get("Accept-Ranges")).toBe("bytes");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([0x49, 0x44]));
    r = await pedir(`/sonidos/agencia/${pista.id}/audio`);
    expect(r.status).toBe(200);
    const clave = db.sqlite.prepare("select clave from biblioteca_sonidos where id = ?").get(pista.id).clave;
    expect((await pedir(`/media/${clave}`)).status).toBe(404);
    // Sin sesión, nada.
    const sin = await worker.fetch(new Request(`https://calendarios.test/api/sonidos/agencia/${pista.id}/audio`), env);
    expect(sin.status).toBe(401);
  });

  it("«Usar de la agencia» la copia al cliente (con su estilo y sus etiquetas) sin repetir; «Pasar a la agencia», al revés", async () => {
    // Una música de Suno del cliente pasa a la agencia: con su estilo, para reutilizarla en otros clientes.
    let r = await pedir("/sonidos/bc/suno1/a-agencia", { method: "POST" });
    expect(r.status).toBe(201);
    const enAgencia = (await r.json()).pista;
    expect(enAgencia).toMatchObject({ de: "agencia", nombre: "Mañana (1)", origen: "cliente", bpm: 100 });
    expect(enAgencia.estilo).toMatch(/warm acoustic folk/);
    expect((await pedir("/sonidos/bc/suno1/a-agencia", { method: "POST" })).status).toBe(200);
    expect((await pedir("/sonidos/bc/suno1/a-agencia", { method: "POST", testigo: "t-cola" })).status).toBe(403);
    // Y de la agencia a OTRO cliente: su copia, con el estilo de Suno (así «Me gusta» la sabe repetir).
    r = await pedir("/sonidos/otro/de-agencia", { method: "POST", body: { id: enAgencia.id } });
    expect(r.status).toBe(201);
    const copia = (await r.json()).pista;
    expect(copia).toMatchObject({ de: "cliente", origen: "agencia", modelo: "musica-agencia", bpm: 100 });
    expect(copia.estilo).toMatch(/warm acoustic folk/);
    expect(copia.src).toMatch(/^\/api\/media\/clientes\/otro\//);
    expect(env.MEDIA.objetos.get(copia.src.replace("/api/media/", "")).bytes).toEqual(env.MEDIA.objetos.get("clientes/bc/estudio/manana.mp3").bytes);
    expect((await pedir("/sonidos/otro/de-agencia", { method: "POST", body: { id: enAgencia.id } })).status).toBe(200);
    // Quitar la de la agencia la borra (la copia del cliente se queda).
    expect((await pedir(`/sonidos/agencia/${enAgencia.id}`, { method: "DELETE" })).status).toBe(200);
    expect(db.sqlite.prepare("select count(*) n from biblioteca_sonidos").get().n).toBe(0);
    expect(archivo(copia.id).borrado_at).toBeNull();
  });
});

describe("las dos bibliotecas en el video animado", () => {
  async function conAgencia() {
    const { pista: musica } = await (await subir("/sonidos/agencia", mp3(20, 11), { nombre: "Agencia alegre.mp3" })).json();
    const { pista: efecto } = await (await subir("/sonidos/agencia", wav(4), { nombre: "Whoosh agencia.wav", categoria: "efecto" })).json();
    const { pista: ding } = await (await subir("/sonidos/bc", mp3(6, 12), { nombre: "Ding.mp3", categoria: "efecto" })).json();
    return { musica, efecto, ding };
  }

  it("la lista de músicas suma la de la agencia (marcada) con la favorita del cliente primero; y trae los efectos", async () => {
    const { musica, ding, efecto } = await conAgencia();
    await pedir("/sonidos/bc/suno1", { method: "PATCH", body: { favorita: true } });
    const j = await (await pedir("/videos/bc/musicas")).json();
    expect(j.musicas.map((m) => m.id)).toEqual(["suno1", "sub1", musica.id]);
    expect(j.musicas[2]).toMatchObject({ de: "agencia", nombre: "Agencia alegre" });
    // La forma de siempre se conserva (id, nombre, src, bytes, modelo, fecha, estilo).
    expect(j.musicas[0]).toMatchObject({ id: "suno1", nombre: "Mañana (1)", modelo: "musica-suno", favorita: true });
    expect(j.musicas[0].estilo).toMatch(/warm acoustic/);
    expect(j.efectos.map((e) => e.id)).toEqual([ding.id, efecto.id]);
  });

  it("el sonido acepta la música de la agencia y un efecto para las transiciones y otro para los sellos; el render los manda", async () => {
    const { musica, ding, efecto } = await conAgencia();
    const v = (await (await pedir("/videos/bc", { method: "POST", body: { guion: ejemplo() } })).json()).video;
    let r = await pedir(`/videos/bc/${v.id}/sonido`, {
      method: "PUT", body: { efectos: true, musica: { archivoId: musica.id, volumen: -2 }, efectosPropios: { transicion: efecto.id, sello: ding.id } },
    });
    expect(r.status).toBe(200);
    const sonido = (await r.json()).video.sonido;
    expect(sonido.musica).toMatchObject({ archivoId: musica.id, de: "agencia", volumen: -2 });
    expect(sonido.musica.clave).toMatch(new RegExp(`^biblioteca/${JEFE}/`));
    expect(sonido.efectosPropios).toMatchObject({ transicion: { archivoId: efecto.id, de: "agencia", nombre: "Whoosh agencia" }, sello: { archivoId: ding.id, nombre: "Ding" } });
    // Sin `efectosPropios` en el cuerpo (una pantalla de antes) se quedan; un efecto que no existe, 404; una música como efecto, tampoco.
    r = await pedir(`/videos/bc/${v.id}/sonido`, { method: "PUT", body: { efectos: true, musica: null } });
    expect((await r.json()).video.sonido.efectosPropios.sello.archivoId).toBe(ding.id);
    expect((await pedir(`/videos/bc/${v.id}/sonido`, { method: "PUT", body: { efectosPropios: { sello: "no-existe" } } })).status).toBe(404);
    expect((await pedir(`/videos/bc/${v.id}/sonido`, { method: "PUT", body: { efectosPropios: { sello: "sub1" } } })).status).toBe(404);
    // La música de la agencia otra vez, y el render.
    await pedir(`/videos/bc/${v.id}/sonido`, { method: "PUT", body: { efectos: true, musica: { archivoId: musica.id, volumen: 0 }, efectosPropios: { transicion: efecto.id, sello: ding.id } } });
    db.sqlite.prepare("update videos_proyectos set estado = 'aprobado', aprobada_version = 1, locucion = ? where id = ?")
      .run(JSON.stringify({ estado: "lista", clave: "clientes/bc/estudio/voz.mp3", version: 1 }), v.id);
    env.MEDIA.objetos.set("clientes/bc/estudio/voz.mp3", { bytes: mp3(4, 13), tipo: "audio/mpeg" });
    const encargos = [];
    env.RENDER = { idFromName: (n) => n, get: () => ({ fetch: async (req) => { encargos.push(await req.json()); return new Response("{}", { status: 202 }); } }) };
    expect((await pedir(`/videos/bc/${v.id}/render`, { method: "POST", body: { version: 1 } })).status).toBe(202);
    const recibidos = [];
    const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 1, 2, 3]);
    const listo = await ejecutarRender(env, encargos[0], async (ruta, cuerpo) => { recibidos.push(cuerpo); return new Response(MP4, { headers: { "X-Duracion": "10" } }); });
    expect(listo.estado).toBe("listo");
    const claveMusica = db.sqlite.prepare("select clave from biblioteca_sonidos where id = ?").get(musica.id).clave;
    expect(recibidos[0].musica.audio).toBe(Buffer.from(env.MEDIA.objetos.get(claveMusica).bytes).toString("base64"));
    expect(Object.keys(recibidos[0].efectosPropios).sort()).toEqual(["pop", "whoosh"]);
    expect(recibidos[0].efectosPropios.pop).toBe(Buffer.from(env.MEDIA.objetos.get(ding.src.replace("/api/media/", "")).bytes).toString("base64"));
    expect(listo.efectosPropios).toEqual({ transicion: "Whoosh agencia", sello: "Ding" });
  });

  it("con los efectos apagados no se mandan; uno que ya no está suena el de la aplicación y se dice", async () => {
    const { ding } = await conAgencia();
    const v = (await (await pedir("/videos/bc", { method: "POST", body: { guion: ejemplo() } })).json()).video;
    await pedir(`/videos/bc/${v.id}/sonido`, { method: "PUT", body: { efectos: true, efectosPropios: { sello: ding.id } } });
    db.sqlite.prepare("update videos_proyectos set estado = 'aprobado', aprobada_version = 1, locucion = ? where id = ?")
      .run(JSON.stringify({ estado: "lista", clave: "clientes/bc/estudio/voz.mp3", version: 1 }), v.id);
    env.MEDIA.objetos.set("clientes/bc/estudio/voz.mp3", { bytes: mp3(4, 14), tipo: "audio/mpeg" });
    env.MEDIA.objetos.delete(ding.src.replace("/api/media/", ""));
    const encargos = [];
    env.RENDER = { idFromName: (n) => n, get: () => ({ fetch: async (req) => { encargos.push(await req.json()); return new Response("{}", { status: 202 }); } }) };
    await pedir(`/videos/bc/${v.id}/render`, { method: "POST", body: { version: 1 } });
    const recibidos = [];
    const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 1, 2, 3]);
    const listo = await ejecutarRender(env, encargos[0], async (ruta, cuerpo) => { recibidos.push(cuerpo); return new Response(MP4); });
    expect(recibidos[0].efectosPropios).toBeUndefined();
    expect(listo.aviso).toMatch(/El efecto «Ding» ya no está: sonó el de la aplicación/);
  });

  it("un video nuevo nace con la música de la marca (la favorita del cliente); sin favorita, como siempre", async () => {
    let v = (await (await pedir("/videos/bc", { method: "POST", body: { guion: ejemplo() } })).json()).video;
    expect(v.sonido).toEqual({ efectos: true, musica: null });
    await pedir("/sonidos/bc/sub1", { method: "PATCH", body: { favorita: true } });
    v = (await (await pedir("/videos/bc", { method: "POST", body: { guion: ejemplo() } })).json()).video;
    expect(v.sonido.musica).toMatchObject({ archivoId: "sub1", clave: "clientes/bc/estudio/tema.mp3", nombre: "Tema alegre", volumen: 0 });
    // Un guion que ya trae su música (por su clave) no la cambia.
    const g = ejemplo();
    g.musica = { clave: "clientes/bc/estudio/manana.mp3", volumen: 0.4 };
    v = (await (await pedir("/videos/bc", { method: "POST", body: { guion: g } })).json()).video;
    expect(v.sonido.musica).toBeNull();
  });

  it("la herramienta «musicas» lista las dos bibliotecas y «sonido_video» pone los efectos", async () => {
    const { musica, ding } = await conAgencia();
    await pedir("/sonidos/bc/suno1", { method: "PATCH", body: { favorita: true, etiquetas: ["alegre"] } });
    const acceso = crearAcceso(db, JEFE);
    const h = crearHerramientasEstudio({ env, acceso, resolverCliente: async () => db.sqlite.prepare("select * from clients where id = 'bc'").get(), usuario: { id: JEFE, nombre: "Juan" }, origen: "claude" });
    const t = await h.musicas({ cliente: "bc" });
    expect(t).toMatch(/Música de Baby Caleb:\n· suno1 — «Mañana \(1\)» · 100 BPM · alegre · 0:30 · música de la marca · generada con Suno/);
    expect(t).toMatch(new RegExp(`Música de la agencia \\(para todos los clientes\\):\\n· ${musica.id} — «Agencia alegre» · de la agencia`));
    expect(t).toMatch(new RegExp(`Efectos de Baby Caleb:\\n· ${ding.id} — «Ding»`));
    const v = (await (await pedir("/videos/bc", { method: "POST", body: { guion: ejemplo() } })).json()).video;
    let s = await h.sonido_video({ cliente: "bc", video_id: v.id, efecto_sello_id: ding.id, musica_id: musica.id });
    expect(s).toMatch(/sellos y llamados: «Ding»/);
    expect(s).toMatch(/música «Agencia alegre» \(de la agencia\)/);
    s = await h.sonido_video({ cliente: "bc", video_id: v.id, efecto_sello_id: "" });
    expect(s).toMatch(/sellos y llamados: el pop de la aplicación/);
    expect(s).toMatch(/música «Agencia alegre»/);
  });
});

describe("el director musical mira la biblioteca antes de pagar", () => {
  const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
  const PROPUESTA = { estilo: "warm acoustic folk, gentle ukulele, soft claps, upbeat and cheerful", bpm: 100, genero: "Folk acústico", titulo: "Piel tranquila", porque: "Cálida." };
  function anthropic() {
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
      if (u.startsWith("https://api.anthropic.com/v1/messages")) {
        return new Response([
          sse("message_start", { message: { model: "x", usage: { input_tokens: 100 } } }),
          sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
          sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: JSON.stringify(PROPUESTA) } }),
          sse("content_block_stop", { index: 0 }),
          sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 50 } }),
        ].join(""), { headers: { "content-type": "text/event-stream" } });
      }
      throw new Error(`fetch inesperado a ${u}`);
    });
  }

  it("«Proponer la música» trae la de la biblioteca que encaja; la cotización de Suno también, y el asistente la ofrece primero", async () => {
    env.ANTHROPIC_API_KEY = "k";
    env.KIE_API_KEY = "kie";
    anthropic();
    await pedir("/sonidos/bc/sub1", { method: "PATCH", body: { etiquetas: ["alegre", "acústica"], bpm: 98 } });
    const v = (await (await pedir("/videos/bc", { method: "POST", body: { guion: ejemplo() } })).json()).video;
    const j = await (await pedir(`/videos/bc/${v.id}/musica`, { method: "POST" })).json();
    expect(j.biblioteca.map((x) => x.id)).toContain("sub1");
    expect(j.biblioteca.find((x) => x.id === "sub1").motivo).toMatch(/98 BPM \(pide 100\)/);
    // La cotización (409) también la trae: no se ha pagado nada.
    const r = await pedir("/videos/bc/musicas/generar", { method: "POST", body: { videoId: v.id } });
    expect(r.status).toBe(409);
    expect((await r.json()).biblioteca.map((x) => x.id)).toContain("sub1");
    // Y el asistente lo dice antes de preguntar si paga.
    const acceso = crearAcceso(db, JEFE);
    const h = crearHerramientasEstudio({ env, acceso, resolverCliente: async () => db.sqlite.prepare("select * from clients where id = 'bc'").get(), usuario: { id: JEFE, nombre: "Juan" }, origen: "claude" });
    const t = await h.generar_musica({ cliente: "bc", video_id: v.id });
    expect(t).toMatch(/NO SE CREÓ NADA/);
    expect(t).toMatch(/ANTES DE PAGAR: en la biblioteca ya hay/);
    expect(t).toMatch(/sub1 — «Tema alegre»/);
    expect(db.sqlite.prepare("select count(*) n from estudio_trabajos").get().n).toBe(0);
  });

  it("la clave de un sonido: la del cliente o la de la agencia de ESTE espacio, sin «..»", () => {
    expect(claveDeSonido("clientes/bc/estudio/x.mp3", "bc", JEFE)).toBe("clientes/bc/estudio/x.mp3");
    expect(claveDeSonido(`biblioteca/${JEFE}/musica/x.mp3`, "bc", JEFE)).toBe(`biblioteca/${JEFE}/musica/x.mp3`);
    expect(claveDeSonido("biblioteca/otro-espacio/musica/x.mp3", "bc", JEFE)).toBeNull();
    expect(claveDeSonido(`biblioteca/${JEFE}/../x.mp3`, "bc", JEFE)).toBeNull();
    expect(claveDeSonido("clientes/otro/estudio/x.mp3", "bc", JEFE)).toBeNull();
  });
});
