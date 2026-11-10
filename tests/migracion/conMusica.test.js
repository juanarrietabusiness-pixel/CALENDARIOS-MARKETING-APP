import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP } from "../../worker/lib/mcp.js";
import { ejecutarRender } from "../../worker/lib/estudio/render.js";
import { sincronizarAvisosAMano, avisosAManoPendiente, aManoDelCalendario } from "../../worker/lib/avisosAMano.js";
import { volverALaFoto } from "../../src/lib/conMusica.js";

// ============================================================
// «Publicar con música», del lado del Worker, contra una D1 de verdad (SQLite con todas las migraciones)
//
//   · un post de UNA foto → un video animado de una escena (la foto a sangre con su movimiento), con la música en su
//     sonido, aprobado y renderizándose solo; sin Container, 503 antes de crear nada; sin música, 409 `sin_musica`;
//   · al terminar el render, la publicación es un reel con el mp4 de único medio y la foto de PORTADA, y recuerda lo de
//     antes para «Volver a la foto»; si la foto cambió mientras tanto, no se toca;
//   · pedirlo otra vez (otra pista) reusa el MISMO video;
//   · un carrusel no se convierte: la herramienta lo marca a mano con la canción sugerida (sin repetir la última usada);
//   · el aviso a la hora de lo que se publica a mano: una fila por publicación al guardar, 10 min antes y a la hora, una
//     sola vez; sin nada que avisar, UNA consulta; lo que dejó de ser a mano no avisa.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 1, 2, 3]);
const FOTO = "/api/media/clientes/bc/posts/foto.jpg";
const MUSICA = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 1, 2, 3, 4]);
let db;
let env;
let encargos;

function r2(objetos = new Map()) {
  return {
    objetos,
    async get(k) {
      const b = objetos.get(k);
      return b ? { size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } : null;
    },
    async head(k) { return objetos.has(k) ? { size: objetos.get(k).length } : null; },
    async put(k, v) { objetos.set(k, v instanceof Uint8Array ? v : new Uint8Array(v)); },
  };
}
const renderDO = () => ({
  idFromName: (n) => n,
  get: (n) => ({ fetch: async (req) => { encargos.push({ nombre: n, cuerpo: await req.json() }); return new Response("{}", { status: 202 }); } }),
});
function container(recibidos) {
  return async (ruta, cuerpo) => {
    recibidos.push({ ruta, cuerpo });
    return new Response(MP4, { headers: { "Content-Type": "video/mp4", "X-Duracion": "10", "X-Cuadros": "300", "X-Ancho": "1080", "X-Alto": "1920" } });
  };
}

const pedir = (ruta, init = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  ...init, headers: { Cookie: `${COOKIE}=t-jefe`, "Content-Type": "application/json", ...(init.headers ?? {}) },
}), env);
const dias = () => JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal1'").get().days);
const post = (id = "p1") => dias()[0].posts.find((p) => p.id === id);
const ponerDias = (d) => db.sqlite.prepare("update calendars set days = ?, updated_at = ? where id = 'cal1'").run(JSON.stringify(d), new Date().toJSON());

beforeEach(async () => {
  db = d1EnMemoria();
  encargos = [];
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "y");
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(OTRA, "otra@a.com", "x", "y");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, JEFE, "editor", "Ana", "#FF0000");
  const kit = { musica: { cancionesInstagram: [{ nombre: "Flowers", artista: "Miley Cyrus" }, { nombre: "Calm Down", artista: "Rema" }, { nombre: "Ojitos lindos" }] } };
  s.prepare("insert into clients (id, owner_id, name, kit_marca) values (?,?,?,?)").run("bc", JEFE, "Cliente Uno", JSON.stringify(kit));
  const posts = [
    { id: "p1", format: "post", status: "approved", title: "Sofá cama", medios: [{ src: FOTO, tipo: "imagen", nombre: "foto.jpg", ancho: 1080, alto: 1350 }], image: FOTO },
    { id: "car", format: "carrusel", status: "approved", title: "Tres sofás", publishTime: "18:00", medios: [{ src: FOTO, tipo: "imagen" }, { src: "/api/media/clientes/bc/posts/b.jpg", tipo: "imagen" }] },
    { id: "viejo", format: "carrusel", status: "published", cancionInstagram: { nombre: "Flowers", artista: "Miley Cyrus", en: "2026-11-01T10:00:00.000Z" }, medios: [{ src: FOTO, tipo: "imagen" }] },
  ];
  s.prepare("insert into calendars (id, client_id, owner_id, month, year, days) values (?,?,?,?,?,?)")
    .run("cal1", "bc", JEFE, 10, 2026, JSON.stringify([{ date: "2026-11-20", posts }]));
  s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo, prompt) values (?,?,?,?,?,?,?,?)")
    .run("m1", JEFE, "bc", "clientes/bc/estudio/tema.mp3", "audio", "audio/mpeg", "musica-subida", "Tema.mp3");
  env = { DB: db, ASSETS: { fetch: async () => new Response("") }, RENDER: renderDO(), MEDIA: r2(new Map([["clientes/bc/estudio/tema.mp3", MUSICA], ["clientes/bc/posts/foto.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])]])) };
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("t-jefe"), JEFE, "2026-11-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
}, 30_000);

const conMusica = (cuerpo = {}) => pedir("/videos/bc/con-musica", { method: "POST", body: JSON.stringify({ postId: "p1", ...cuerpo }) });
const proyecto = () => db.sqlite.prepare("select * from videos_proyectos").all();

describe("de una foto, un reel con su música", () => {
  it("crea el video de una escena, con la música en su sonido, aprobado y renderizándose; no gasta IA", async () => {
    const r = await conMusica({ segundos: 15, movimiento: "paneo" });
    expect(r.status).toBe(202);
    const j = await r.json();
    expect(j.costo).toBe(0);
    expect(j.musica).toMatchObject({ id: "m1", nombre: "Tema" });
    expect(j.video.estado).toBe("renderizando");
    const [f] = proyecto();
    expect(f).toMatchObject({ calendar_id: "cal1", post_id: "p1", estado: "renderizando", aprobada_version: 1 });
    expect(JSON.parse(f.origen)).toEqual({ tipo: "foto", encargoId: "", foto: FOTO });
    expect(JSON.parse(f.sonido)).toMatchObject({ efectos: false, musica: { archivoId: "m1", clave: "clientes/bc/estudio/tema.mp3" } });
    const capa = JSON.parse(f.guion).escenas[0].capas[0];
    expect(capa).toMatchObject({ tipo: "imagen", encuadre: "completo", movimiento: "paneo", dura: 15, recorte: "contener" });
    // La foto quedó en la galería (apuntando al MISMO objeto de R2: origen «app», la papelera no lo borra).
    const archivo = db.sqlite.prepare("select * from estudio_archivos where id = ?").get(capa.archivo);
    expect(archivo).toMatchObject({ clave: "clientes/bc/posts/foto.jpg", tipo: "imagen", origen: "app", subido: 0 });
    expect(encargos).toHaveLength(1);
  });

  it("al terminar el render: un reel con el mp4 y la foto de portada; sin voz y con la música; y se puede volver a la foto", async () => {
    await conMusica();
    const recibidos = [];
    const listo = await ejecutarRender(env, encargos.at(-1).cuerpo, container(recibidos));
    expect(listo.estado).toBe("listo");
    expect(recibidos[0].cuerpo.audio).toBeUndefined();
    expect(recibidos[0].cuerpo.musica).toEqual({ audio: Buffer.from(MUSICA).toString("base64"), volumen: 0 });
    expect(Object.keys(recibidos[0].cuerpo.imagenes)).toHaveLength(1);
    const p = post();
    expect(p.format).toBe("reel");
    expect(p.medios).toHaveLength(1);
    expect(p.medios[0]).toMatchObject({ tipo: "video", src: `/api/media/${listo.clave}` });
    expect(p.portada).toBe(FOTO);
    expect(p.conMusica).toMatchObject({ formato: "post", foto: { src: FOTO } });
    const vuelta = volverALaFoto(p);
    expect(vuelta).toMatchObject({ format: "post", image: FOTO, portada: null });
    expect(vuelta.medios).toEqual([{ src: FOTO, tipo: "imagen", nombre: "foto.jpg", ancho: 1080, alto: 1350 }]);
  });

  it("otra vez con otra duración: el MISMO video, otra versión", async () => {
    await conMusica({ segundos: 7 });
    await ejecutarRender(env, encargos.at(-1).cuerpo, container([]));
    const r = await conMusica({ segundos: 10 });
    expect(r.status).toBe(202);
    const filas = proyecto();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ version: 2, aprobada_version: 2, estado: "renderizando" });
    await ejecutarRender(env, encargos.at(-1).cuerpo, container([]));
    // Sigue siendo un reel con un solo video y la foto apuntada.
    expect(post().medios).toHaveLength(1);
    expect(post().conMusica.foto.src).toBe(FOTO);
  });

  it("volver a la foto y pedirlo igual: el mp4 que ya había vuelve a la publicación sin renderizar otra vez", async () => {
    await conMusica();
    await ejecutarRender(env, encargos.at(-1).cuerpo, container([]));
    const d = dias();
    d[0].posts[0] = volverALaFoto(d[0].posts[0]);
    ponerDias(d);
    expect(post().format).toBe("post");
    const r = await conMusica();
    expect(r.status).toBe(202);
    expect((await r.json()).yaHecho).toBe(true);
    expect(encargos).toHaveLength(1);
    expect(post()).toMatchObject({ format: "reel", portada: FOTO });
    // Con otra música, sí se renderiza otra vez.
    db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo, prompt) values (?,?,?,?,?,?,?,?)")
      .run("m2", JEFE, "bc", "clientes/bc/estudio/otra.mp3", "audio", "audio/mpeg", "musica-subida", "Otra.mp3");
    expect((await conMusica({ musicaId: "m2" })).status).toBe(202);
    expect(encargos).toHaveLength(2);
  });

  it("si la foto cambió mientras se hacía, la publicación no se toca", async () => {
    await conMusica();
    const d = dias();
    d[0].posts[0].medios = [{ src: "/api/media/clientes/bc/posts/otra.jpg", tipo: "imagen" }];
    ponerDias(d);
    const listo = await ejecutarRender(env, encargos.at(-1).cuerpo, container([]));
    expect(listo.aviso).toMatch(/foto de la publicación cambió/);
    expect(post().format).toBe("post");
  });

  it("sin Container (en local), 503 sin crear nada; sin música en la galería, 409 sin_musica", async () => {
    delete env.RENDER;
    const r = await conMusica();
    expect(r.status).toBe(503);
    expect(proyecto()).toHaveLength(0);
    env.RENDER = renderDO();
    db.sqlite.prepare("delete from estudio_archivos").run();
    const s = await conMusica();
    expect(s.status).toBe(409);
    expect((await s.json()).codigo).toBe("sin_musica");
    expect(proyecto()).toHaveLength(0);
  });

  it("un carrusel no se convierte (409); una música que no es del cliente, 404", async () => {
    expect((await conMusica({ postId: "car" })).status).toBe(409);
    expect((await conMusica({ musicaId: "no-existe" })).status).toBe(404);
  });
});

describe("lo nuevo: sin animación, música generada mirando la foto y el carrusel en reel", () => {
  it("«Sin animación»: la foto quieta (el guion no lleva movimiento)", async () => {
    expect((await conMusica({ movimiento: "ninguno" })).status).toBe(202);
    const capa = JSON.parse(proyecto()[0].guion).escenas[0].capas[0];
    expect(capa.movimiento ?? "ninguno").toBe("ninguno");
  });

  it("música GENERADA: sin el sí, 409 con el costo (el video ya está aprobado, sin música); con él, el trabajo de Suno, y al llegar la música se renderiza solo", async () => {
    env.KIE_API_KEY = "k";
    const r = await conMusica({ musicaId: "generar" });
    expect(r.status).toBe(409);
    const j = await r.json();
    expect(j.codigo).toBe("confirmar");
    expect(j.costo).toBeGreaterThan(0);
    expect(encargos).toHaveLength(0);
    const ok = await conMusica({ musicaId: "generar", confirmado: true });
    expect(ok.status).toBe(202);
    expect((await ok.json()).generando).toBe(true);
    const [f] = proyecto();
    expect(JSON.parse(f.origen)).toMatchObject({ tipo: "foto", renderSolo: true });
    const t = db.sqlite.prepare("select * from estudio_trabajos where tipo = 'audio'").get();
    expect(JSON.parse(t.ajustes)).toMatchObject({ para: "musica", videoId: f.id });
    expect(encargos).toHaveLength(0);
    // Llega la música (lo que hace terminarMusica: la pone en el sonido) → el render sale solo, una vez.
    db.sqlite.prepare("update videos_proyectos set sonido = ? where id = ?").run(JSON.stringify({ efectos: false, musica: { archivoId: "m1", clave: "clientes/bc/estudio/tema.mp3", nombre: "Tema", volumen: 0 } }), f.id);
    const { renderSiToca } = await import("../../worker/lib/estudio/conMusica.js");
    expect(await renderSiToca(env, crearAcceso(db, JEFE), "bc", f.id)).toBe(true);
    expect(encargos).toHaveLength(1);
    expect(await renderSiToca(env, crearAcceso(db, JEFE), "bc", f.id)).toBe(false);
  });

  it("un CARRUSEL en reel: una escena por lámina con la transición, la música en su sonido; al terminar es un reel y «Volver al carrusel» lo deja como estaba", async () => {
    env.MEDIA.objetos.set("clientes/bc/posts/b.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9]));
    const r = await conMusica({ postId: "car", reel: true, transicion: "deslizar", segundos: 2 });
    expect(r.status).toBe(202);
    const [f] = proyecto();
    const g = JSON.parse(f.guion);
    expect(g.escenas).toHaveLength(2);
    expect(g.escenas.map((e) => e.transicion.tipo)).toEqual(["corte", "deslizar"]);
    expect(g.escenas.map((e) => e.capas[0].movimiento)).toEqual(["acercar", "alejar"]);
    expect(JSON.parse(f.origen)).toMatchObject({ tipo: "carrusel", foto: FOTO });
    await ejecutarRender(env, encargos.at(-1).cuerpo, container([]));
    const p = post("car");
    expect(p.format).toBe("reel");
    expect(p.medios).toHaveLength(1);
    expect(p.portada).toBe(FOTO);
    expect(p.conMusica.medios).toHaveLength(2);
    const vuelta = volverALaFoto(p);
    expect(vuelta.format).toBe("carrusel");
    expect(vuelta.medios.map((m) => m.src)).toEqual([FOTO, "/api/media/clientes/bc/posts/b.jpg"]);
    // Pedirlo otra vez desde el reel: el MISMO video.
    expect((await conMusica({ postId: "car", reel: true, musicaId: "ninguna" })).status).toBe(202);
    expect(proyecto()).toHaveLength(1);
  });
});

describe("la herramienta del asistente y de Claude", () => {
  const herramientas = () => crearHerramientasMCP({ env, acceso: crearAcceso(db, JEFE), usuario: { id: JEFE, nombre: "Juan" } });

  it("un post de una foto: el reel, sin gastar", async () => {
    const r = await herramientas().llamar("publicar_con_musica", { cliente: "Cliente Uno", publicacion_id: "p1", movimiento: "alejar" });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toMatch(/No gasta IA/);
    expect(JSON.parse(proyecto()[0].guion).escenas[0].capas[0].movimiento).toBe("alejar");
  });

  it("un carrusel: a mano con la música de Instagram y la canción sugerida, sin repetir la última usada", async () => {
    // Estaba programado: saldría solo sin la música, así que se saca de la cola.
    db.sqlite.prepare("insert into publicaciones_programadas (id, owner_id, client_id, calendar_id, post_id, red, programada_para, estado) values (?,?,?,?,?,?,?,?)")
      .run("q1", JEFE, "bc", "cal1", "car", "instagram", "2026-11-20T23:00:00.000Z", "programada");
    const r = await herramientas().llamar("publicar_con_musica", { cliente: "Cliente Uno", publicacion_id: "car" });
    expect(db.sqlite.prepare("select estado from publicaciones_programadas where id = 'q1'").get().estado).toBe("cancelada");
    expect(r.content[0].text).toMatch(/se sacó de la cola/);
    expect(r.content[0].text).toMatch(/A MANO/);
    expect(r.content[0].text).toMatch(/Calm Down — Rema/);
    expect(r.content[0].text).toMatch(/\/a-mano\/cal1\/car/);
    const p = post("car");
    expect(p).toMatchObject({ asistida: true, conMusicaInstagram: true, cancionInstagram: { nombre: "Calm Down", artista: "Rema" } });
    expect(p.notaAsistida).toMatch(/Calm Down/);
    expect(proyecto()).toHaveLength(0);
    // Marcarla a mano dejó su aviso a la hora apuntado (al guardar el calendario).
    expect(db.sqlite.prepare("select id, para from avisos_a_mano").all()).toEqual([{ id: "cal1|car", para: "2026-11-20T23:00:00.000Z" }]);
  });
});

describe("el aviso a la hora de lo que se publica a mano", () => {
  const acceso = () => crearAcceso(db, JEFE);
  const cal = () => db.sqlite.prepare("select * from calendars where id = 'cal1'").get();
  const marcarAMano = () => {
    const d = dias();
    d[0].posts[1].asistida = true;
    ponerDias(d);
  };
  const avisos = () => db.sqlite.prepare("select user_id, tipo, texto, enlace from avisos order by created_at").all();
  const PARA = Date.parse("2026-11-20T23:00:00.000Z"); // 18:00 en Panamá

  it("lo que se publica a mano de un calendario (sin publicar y con su momento)", () => {
    const d = dias();
    d[0].posts[1].asistida = true;
    expect(aManoDelCalendario("cal1", d)).toEqual([{ id: "cal1|car", post_id: "car", para: "2026-11-20T23:00:00.000Z" }]);
  });

  it("sin nada a mano, guardar no consulta nada; con algo, una fila por publicación", async () => {
    let consultas = 0;
    const espia = crearAcceso({ prepare: (...a) => { consultas++; return db.prepare(...a); }, batch: (...a) => db.batch(...a) }, JEFE);
    expect(await sincronizarAvisosAMano(espia, cal())).toBe(0);
    expect(consultas).toBe(0);
    marcarAMano();
    expect(await sincronizarAvisosAMano(acceso(), cal())).toBe(1);
    expect(await sincronizarAvisosAMano(acceso(), cal())).toBe(0); // igual: no reescribe
  });

  it("10 minutos antes y a la hora, una vez cada uno, a todo el equipo (nadie la lleva)", async () => {
    marcarAMano();
    await sincronizarAvisosAMano(acceso(), cal());
    expect(await avisosAManoPendiente(env, new Date(PARA - 20 * 60_000))).toBe(0);
    expect(await avisosAManoPendiente(env, new Date(PARA - 9 * 60_000))).toBe(1);
    expect(await avisosAManoPendiente(env, new Date(PARA - 8 * 60_000))).toBe(0); // no repite
    const previos = avisos();
    expect(previos.map((a) => a.user_id).sort()).toEqual([JEFE, OTRA].sort());
    expect(previos[0]).toMatchObject({ tipo: "a-mano", enlace: "/a-mano/cal1/car" });
    expect(previos[0].texto).toMatch(/En 10 minutos.+Tres sofás.+Cliente Uno/);
    expect(await avisosAManoPendiente(env, new Date(PARA + 30_000))).toBe(1);
    expect(await avisosAManoPendiente(env, new Date(PARA + 90_000))).toBe(0);
    expect(avisos().at(-1).texto).toMatch(/Es la hora/);
    expect(avisos()).toHaveLength(4);
  });

  it("sin nada que avisar, el cron hace UNA consulta", async () => {
    let consultas = 0;
    const espia = { ...env, DB: { prepare: (...a) => { consultas++; return db.prepare(...a); }, batch: (...a) => db.batch(...a) } };
    expect(await avisosAManoPendiente(espia, new Date(PARA))).toBe(0);
    expect(consultas).toBe(1);
  });

  it("si cambia la hora, avisa otra vez; si dejó de ser a mano o lleva horas pasado, no avisa", async () => {
    marcarAMano();
    await sincronizarAvisosAMano(acceso(), cal());
    await avisosAManoPendiente(env, new Date(PARA + 1000));
    expect(avisos()).toHaveLength(2);
    // A las 19:00: la fila se pone al día y vuelve a avisar.
    let d = dias();
    d[0].posts[1].publishTime = "19:00";
    ponerDias(d);
    expect(await sincronizarAvisosAMano(acceso(), cal())).toBe(1);
    expect(await avisosAManoPendiente(env, new Date(PARA + 3600_000 + 1000))).toBe(1);
    expect(avisos()).toHaveLength(4);
    // Ya no es a mano (sin guardar el calendario por la vía de siempre): la fila toca, pero no avisa.
    d = dias();
    d[0].posts[1].publishTime = "20:00";
    ponerDias(d);
    await sincronizarAvisosAMano(acceso(), cal());
    d = dias();
    d[0].posts[1].asistida = false;
    ponerDias(d);
    expect(await avisosAManoPendiente(env, new Date(PARA + 2 * 3600_000 + 1000))).toBe(1);
    expect(avisos()).toHaveLength(4);
    // Un momento de hace horas se apunta sin avisar.
    d = dias();
    d[0].posts[1].asistida = true;
    d[0].posts[1].publishTime = "08:00";
    ponerDias(d);
    await sincronizarAvisosAMano(acceso(), cal());
    expect(await avisosAManoPendiente(env, new Date(PARA))).toBe(1);
    expect(avisos()).toHaveLength(4);
  });

  it("al guardar el calendario por la API, la fila se escribe sola", async () => {
    const d = dias();
    d[0].posts[1].asistida = true;
    // El PUT de siempre del calendario (lo que hace la pantalla al guardar).
    const r = await pedir("/calendarios/cal1", { method: "PUT", body: JSON.stringify({ client_id: "bc", name: "Noviembre", month: 10, year: 2026, days: d }) });
    expect(r.status).toBeLessThan(300);
    expect(db.sqlite.prepare("select id from avisos_a_mano").all()).toEqual([{ id: "cal1|car" }]);
  });
});
