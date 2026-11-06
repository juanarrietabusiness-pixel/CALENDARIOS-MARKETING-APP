import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { bombear } from "../../worker/lib/estudio/bomba.js";
import { avanzarEncargo } from "../../worker/lib/estudio/encargos.js";
import { validarGuion } from "../../src/lib/videoEscenas.js";
import { comprobarMontaje } from "../../src/lib/montajeReel.js";

// ============================================================
// El REEL por planos como encargo del servidor (worker/lib/estudio/encargoReel.js), contra una D1 de verdad
//
// Lo que importa: que siga SIN la pantalla (sólo la bomba, como cuando se cierra la aplicación), en orden (cada
// fotograma con el anterior de referencia), que se pare para revisar y se retome, que el video y los clips salgan por
// la cola de video, que el resultado se ponga SOLO en su publicación (sólo rellena) y que «Montarlo aquí» deje un
// video animado válido ligado a ella. Motores de prueba: sin llave ni costo.
// ============================================================

const JEFE = "u-jefe";
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
      return o ? { body: o.bytes, size: o.bytes.length, httpEtag: '"x"', httpMetadata: { contentType: o.tipo }, arrayBuffer: async () => o.bytes.buffer, writeHttpMetadata: (h) => h.set("content-type", o.tipo) } : null;
    },
    async put(clave, valor, opciones) { objetos.set(clave, { bytes: await bytesDe(valor), tipo: opciones?.httpMetadata?.contentType }); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const POSTS = [{ id: "p1", format: "reel", status: "pending", idea: "Wipes", descripcion: "", guion: "" }];

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("t-jefe"), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal1", "c1", JEFE, "Noviembre", 10, 2026, JSON.stringify([{ date: "2026-11-20", posts: POSTS }]));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const pedir = (ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  ...opciones,
  headers: { Cookie: `${COOKIE}=t-jefe`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env);

const REEL = {
  segundos: 8, hilo: "Una mamá y su bebé en casa, luz cálida",
  planos: [
    { desde: 0, escena: "El bebé llora en su cuna", camara: "Acercamiento", dice: "¿Tu bebé tiene la piel sensible?" },
    { desde: 3, escena: "La mamá abre la caja de wipes", camara: "Fija", dice: "Los wipes Nateen la cuidan." },
    { desde: 5, escena: "El bebé sonríe con la caja al lado", camara: "Abre", dice: "Escríbenos y pídelos hoy." },
  ],
  musica: "Acústica suave", locucion: "", descripcion: "Piel sensible protegida desde el primer uso.", gancho: "¿Piel sensible?", llamado: "Pídelos hoy",
};
const lanzar = async (extra = {}) => pedir("/estudio/c1/encargos", {
  method: "POST",
  body: {
    tipo: "reel", titulo: "Wipes Nateen", reel: REEL,
    comun: { modelo: "prueba", estilo: "Foto cálida", personajes: [], fotos: [] },
    salida: "uno", video: { modelo: "prueba-video" }, calendarId: "cal1", postId: "p1", ...extra,
  },
});
const encargo = async (id) => (await (await pedir(`/estudio/c1/encargos/${id}`)).json());
const dias = () => JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal1'").get().days);

async function bombearHastaElFinal(tope = 60) {
  for (let i = 0; i < tope; i++) {
    const siguiente = await bombear(env, JEFE);
    if (siguiente == null) return i;
    vi.setSystemTime(new Date(Date.now() + 5000));
  }
  return tope;
}

describe("el reel por planos sigue en el servidor", () => {
  it("storyboard EN ORDEN (cada fotograma con el anterior de referencia), el video y a su publicación, sin pantalla", async () => {
    const res = await lanzar();
    expect(res.status).toBe(201);
    const { encargo: e } = await res.json();
    expect(e).toMatchObject({ tipo: "reel", estado: "en_marcha" });
    expect(e.pasos.map((p) => p.id)).toEqual(["f1", "f2", "f3"]);
    await bombearHastaElFinal();
    const { encargo: fin, archivos } = await encargo(e.id);
    expect(fin.estado).toBe("hecho");
    expect(fin.reel.video.fase).toBe("hecho");
    // Los fotogramas, en orden: el segundo lleva al primero de referencia; el tercero, al segundo y al primero.
    const imagenes = db.sqlite.prepare("select medios, ajustes from estudio_trabajos where tipo = 'imagen' order by created_at").all();
    expect(imagenes).toHaveLength(3);
    const claveDe = (id) => archivos.find((a) => a.id === id)?.clave;
    const finales = fin.pasos.map((p) => p.finales[0]);
    expect(JSON.parse(imagenes[1].medios).reference).toEqual([claveDe(finales[0])]);
    expect(JSON.parse(imagenes[2].medios).reference).toEqual([claveDe(finales[1]), claveDe(finales[0])]);
    expect(JSON.parse(imagenes[0].ajustes).aspectRatio).toBe("9:16");
    // El video, con el storyboard (los tres fotogramas) y unido a la publicación.
    const video = db.sqlite.prepare("select medios, post_id from estudio_trabajos where tipo = 'video'").get();
    expect(JSON.parse(video.medios).reference).toHaveLength(3);
    expect(video.post_id).toBe("p1");
    // Puesto SOLO en la publicación, con el caption, el guion y la portada (estaban vacíos).
    const post = dias()[0].posts[0];
    expect(post.medios[0]).toMatchObject({ tipo: "video", deReel: e.id });
    expect(post.descripcion).toBe(REEL.descripcion);
    expect(post.guion).toMatch(/\[0–3 s\] SE VE: El bebé llora en su cuna \| VOZ: «¿Tu bebé tiene la piel sensible\?» \| TEXTO: ¿Piel sensible\?/);
    expect(post.portada).toBe(`/api/media/${claveDe(finales[0])}`);
    expect(fin.reel.puesto).toMatchObject({ postId: "p1" });
  });

  it("sólo rellena: el caption que escribió una persona se queda", async () => {
    const d = dias();
    d[0].posts[0].descripcion = "El mío";
    db.sqlite.prepare("update calendars set days = ? where id = 'cal1'").run(JSON.stringify(d));
    const { encargo: e } = await (await lanzar()).json();
    await bombearHastaElFinal();
    expect((await encargo(e.id)).encargo.estado).toBe("hecho");
    expect(dias()[0].posts[0].descripcion).toBe("El mío");
  });

  it("con «revisar» se para tras el storyboard; se retoma con los clips (uno por fotograma) y lo corregido a mano manda", async () => {
    const { encargo: e } = await (await lanzar({ revisar: true })).json();
    await bombearHastaElFinal();
    let r = await encargo(e.id);
    expect(r.encargo.estado).toBe("hecho");
    expect(r.encargo.reel.video.fase).toBe("espera");
    expect(db.sqlite.prepare("select count(*) n from estudio_trabajos where tipo = 'video'").get().n).toBe(0);
    // La persona corrigió el fotograma 2: una imagen suya de la galería.
    const otra = r.archivos.find((a) => a.id === r.encargo.pasos[0].finales[0]);
    const res = await pedir(`/estudio/c1/encargos/${e.id}/continuar`, { method: "POST", body: { salida: "clips", video: { modelo: "prueba-video" }, finales: { f2: otra.id } } });
    expect(res.status).toBe(200);
    expect((await res.json()).encargo.estado).toBe("en_marcha");
    await bombearHastaElFinal();
    r = await encargo(e.id);
    expect(r.encargo.estado).toBe("hecho");
    expect(r.encargo.pasos.map((p) => p.clip.fase)).toEqual(["hecho", "hecho", "hecho"]);
    const clips = db.sqlite.prepare("select medios, prompt from estudio_trabajos where tipo = 'video' order by created_at").all();
    expect(clips).toHaveLength(3);
    // Cada clip arranca en SU fotograma; el del plano 2, en el que se puso a mano.
    expect(JSON.parse(clips[1].medios).start).toEqual([otra.clave]);
    expect(clips[0].prompt).toMatch(/Sin voz ni música/);
    // Los clips están en lo que recibe la pantalla (para el ZIP).
    expect(r.encargo.pasos.every((p) => r.archivos.some((a) => a.id === p.clip.archivoId))).toBe(true);
  });

  it("«Montarlo aquí»: un video animado válido, una escena por plano con su clip a sangre, el gancho, el logo y el llamado", async () => {
    const { encargo: e } = await (await lanzar({ salida: "clips", video: { modelo: "prueba-video" } })).json();
    await bombearHastaElFinal();
    const res = await pedir(`/estudio/c1/encargos/${e.id}/montar`, { method: "POST", body: {} });
    expect(res.status).toBe(200);
    const { encargo: fin } = await res.json();
    expect(fin.reel.montaje).toMatchObject({ fase: "hecho" });
    const v = db.sqlite.prepare("select * from videos_proyectos where id = ?").get(fin.reel.montaje.videoId);
    expect(v).toMatchObject({ estado: "borrador", calendar_id: "cal1", post_id: "p1" });
    expect(JSON.parse(v.origen)).toEqual({ tipo: "reel", encargoId: e.id });
    const guion = JSON.parse(v.guion);
    expect(validarGuion(guion).ok).toBe(true);
    // Lo que se dice es todo lo de los planos, en orden (una frase más larga que su clip corto se parte en dos escenas:
    // la segunda con el fotograma del plano, y nada se pierde).
    expect(guion.escenas.map((x) => x.habla).join(" ")).toBe(REEL.planos.map((p) => p.dice).join(" "));
    expect(comprobarMontaje({ ...REEL, planos: REEL.planos }, guion)).toEqual([]);
    const capas = guion.escenas.map((x) => x.capas.map((c) => c.tipo));
    expect(capas[0]).toEqual(["video", "texto"]);
    expect(capas.at(-1).at(-1)).toBe("llamado");
    expect(guion.escenas[0].capas[1].texto).toBe("¿Piel sensible?");
    expect(guion.escenas.at(-1).capas.at(-1).texto).toBe("Pídelos hoy");
    // Los clips de prueba duran poco: una escena que no cabe en su clip sigue con el FOTOGRAMA de su plano.
    for (const x of guion.escenas.filter((y) => y.capas[0].tipo === "imagen")) expect(fin.pasos.map((p) => p.finales?.[0] ?? p.opciones?.[0]?.id)).toContain(x.capas[0].archivo);
    expect(guion.escenas[0].capas[0]).toMatchObject({ encuadre: "completo", archivo: fin.pasos[0].clip.archivoId });
    expect(guion.subtitulos.activo).toBe(true);
  });

  it("B9/C12 · con montaje, la toma FIJA no paga clip: se monta con su fotograma, y la frase de cada plano se dice", async () => {
    const reel = { ...REEL, planos: REEL.planos.map((p, i) => ({ ...p, toma: i === 2 ? "fija" : "movimiento" })) };
    const { encargo: e } = await (await lanzar({ reel, salida: "clips", video: { modelo: "prueba-video" }, montaje: {} })).json();
    await bombearHastaElFinal();
    // Sólo dos clips pedidos: el plano 3 (el producto, el cierre) no paga.
    expect(db.sqlite.prepare("select count(*) n from estudio_trabajos where tipo = 'video'").get().n).toBe(2);
    const { encargo: fin } = await encargo(e.id);
    expect(fin.pasos[2].clip).toMatchObject({ fase: "omitido" });
    expect(fin.reel.montaje).toMatchObject({ fase: "hecho" });
    const g = JSON.parse(db.sqlite.prepare("select guion from videos_proyectos where id = ?").get(fin.reel.montaje.videoId).guion);
    expect(g.escenas.map((x) => x.habla).join(" ")).toBe(REEL.planos.map((p) => p.dice).join(" "));
    const ultima = g.escenas.at(-1);
    expect(ultima.capas[0]).toMatchObject({ tipo: "imagen", encuadre: "completo", archivo: fin.pasos[2].finales?.[0] ?? fin.pasos[2].opciones[0].id });
    // Sobre clips reales, los efectos de transición vienen apagados (A4).
    expect(JSON.parse(db.sqlite.prepare("select sonido from videos_proyectos where id = ?").get(fin.reel.montaje.videoId).sonido)).toMatchObject({ efectos: false });
  });

  it("montaje automático: sin la voz confirmada se queda esperando con su costo (el 409 de siempre); con el sí, la pide", async () => {
    // Una vía de voz (Kie) con su lista de voces: sin red para leer la cuenta.
    env.KIE_API_KEY = "k";
    const kit = { locucion: { voz: "iCrDUkL56s3C8sCRl7wb", modelo: "v3" } };
    db.sqlite.prepare("update clients set kit_marca = ? where id = 'c1'").run(JSON.stringify(kit));
    const { encargo: e } = await (await lanzar({ salida: "clips", video: { modelo: "prueba-video" } })).json();
    await bombearHastaElFinal();
    let r = await (await pedir(`/estudio/c1/encargos/${e.id}/montar`, { method: "POST", body: { automatico: true } })).json();
    const acceso = crearAcceso(db, JEFE);
    for (let i = 0; i < 6 && r.encargo.estado === "en_marcha"; i++) r = { encargo: (await avanzarEncargo(env, acceso, e.id)).encargo };
    const fila = db.sqlite.prepare("select datos, estado from estudio_encargos where id = ?").get(e.id);
    const m = JSON.parse(fila.datos).montaje;
    expect(m.fase).toBe("confirmar");
    expect(m.costo).toBeGreaterThan(0);
    expect(db.sqlite.prepare("select estado from videos_proyectos where id = ?").get(m.videoId).estado).toBe("aprobado");
    expect(db.sqlite.prepare("select count(*) n from estudio_trabajos where tipo = 'audio'").get().n).toBe(0);
    // El sí de la persona: la voz se pide (un trabajo de audio) y el montaje espera a que llegue.
    const res = await pedir(`/estudio/c1/encargos/${e.id}/montar`, { method: "POST", body: { confirmadoVoz: true } });
    expect(res.status).toBe(200);
    for (let i = 0; i < 3; i++) await avanzarEncargo(env, acceso, e.id);
    expect(JSON.parse(db.sqlite.prepare("select datos from estudio_encargos where id = ?").get(e.id).datos).montaje.fase).toBe("esperaVoz");
    expect(db.sqlite.prepare("select count(*) n from estudio_trabajos where tipo = 'audio'").get().n).toBe(1);
  });

  it("no se continúa un storyboard a medias, ni se monta antes del video", async () => {
    const { encargo: e } = await (await lanzar({ revisar: true })).json();
    const r1 = await pedir(`/estudio/c1/encargos/${e.id}/continuar`, { method: "POST", body: { salida: "uno", video: { modelo: "prueba-video" } } });
    expect(r1.status).toBe(409);
    const r2 = await pedir(`/estudio/c1/encargos/${e.id}/montar`, { method: "POST", body: {} });
    expect(r2.status).toBe(409);
  });

  it("un reel sin modelo de video (o con uno que no anima una imagen, o que no hace esa duración) no se crea", async () => {
    expect((await lanzar({ video: { modelo: "" } })).status).toBe(400);
    expect((await lanzar({ reel: { ...REEL, segundos: 30 } })).status).toBe(400);
    expect((await lanzar({ salida: "clips", video: { modelo: "gemini-omni-video-kie" } })).status).toBe(400);
    expect(db.sqlite.prepare("select count(*) n from estudio_encargos").get().n).toBe(0);
  });

  it("cerrado por plazo: lo que esperaba (el video) se da por fallido y no se queda colgado", async () => {
    const { encargo: e } = await (await lanzar()).json();
    vi.setSystemTime(new Date(Date.now() + 9 * 3600_000));
    const r = await avanzarEncargo(env, crearAcceso(db, JEFE), e.id);
    expect(r.encargo.estado).not.toBe("en_marcha");
  });
});

describe("lo que pide Claude con su post_id se pone solo en la publicación", () => {
  const paso = (id) => ({
    id, titulo: `Pieza ${id}`, escena: `Una taza ${id}`, sinMejorar: "una taza",
    pedido: { modelo: "prueba", prompt: "Escena: {{ESCENA}}", n: 1, ajustes: { aspectRatio: "4:5" }, medios: {}, calendarId: "cal1", postId: "p1" },
  });
  it("al terminar el lote, sus piezas van a su post y se apunta su uso", async () => {
    const { encargo: e } = await (await pedir("/estudio/c1/encargos", { method: "POST", body: { tipo: "lote", mejorar: false, poner: true, pasos: [paso("a"), paso("b")] } })).json();
    await bombearHastaElFinal();
    const fin = (await encargo(e.id)).encargo;
    expect(fin.estado).toBe("hecho");
    expect(fin.puestos).toEqual([{ postId: "p1", archivos: fin.pasos.map((p) => p.finales[0]) }]);
    const post = dias()[0].posts[0];
    expect(post.medios).toHaveLength(2);
    const usos = JSON.parse(db.sqlite.prepare("select usado_en from estudio_archivos where id = ?").get(fin.pasos[0].finales[0]).usado_en);
    expect(usos[0]).toMatchObject({ postId: "p1" });
  });
  it("la pieza de un REEL que ya tiene su video va a su PORTADA (no como una imagen más); dos a un reel, no se ponen", async () => {
    const VIDEO = { src: "/api/media/clientes/c1/posts/v.mp4", tipo: "video", nombre: "v.mp4" };
    db.sqlite.prepare("update calendars set days = ? where id = 'cal1'").run(JSON.stringify([{ date: "2026-11-20", posts: [{ ...POSTS[0], medios: [VIDEO] }] }]));
    const { encargo: e } = await (await pedir("/estudio/c1/encargos", { method: "POST", body: { tipo: "lote", mejorar: false, poner: true, pasos: [paso("a")] } })).json();
    await bombearHastaElFinal();
    const fin = (await encargo(e.id)).encargo;
    expect(fin.puestos).toEqual([{ postId: "p1", archivos: [fin.pasos[0].finales[0]] }]);
    const post = dias()[0].posts[0];
    expect(post.medios).toEqual([VIDEO]);
    expect(post.portada).toMatch(/^\/api\/media\/clientes\/c1\//);
    expect(post.portadaMs).toBeNull();
    // Dos piezas para el mismo reel: un reel no lleva imágenes; se dice y la publicación no cambia.
    const { encargo: e2 } = await (await pedir("/estudio/c1/encargos", { method: "POST", body: { tipo: "lote", mejorar: false, poner: true, pasos: [paso("b"), paso("c")] } })).json();
    await bombearHastaElFinal();
    const fin2 = (await encargo(e2.id)).encargo;
    expect(fin2.puestos).toEqual([{ postId: "p1", aviso: expect.stringMatching(/No se puso: Un reel es UN video/) }]);
    expect(dias()[0].posts[0]).toMatchObject({ medios: [VIDEO], portada: post.portada });
  });

  it("sin `poner` (el lote de la pantalla, que escoge entre versiones) no toca la publicación", async () => {
    const { encargo: e } = await (await pedir("/estudio/c1/encargos", { method: "POST", body: { tipo: "lote", mejorar: false, pasos: [paso("a")] } })).json();
    await bombearHastaElFinal();
    expect((await encargo(e.id)).encargo.estado).toBe("hecho");
    expect(dias()[0].posts[0].medios ?? []).toHaveLength(0);
  });
});
