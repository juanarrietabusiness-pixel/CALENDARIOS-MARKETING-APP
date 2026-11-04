import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// /api/videos/<cliente>: los proyectos de video animado, por las rutas de verdad
//
//   · un guion con errores no se guarda: 400 con cada error y su sitio;
//   · cambiar el guion sube la versión y lo devuelve a borrador; el título solo, no;
//   · guardar o aprobar con una versión vieja es 409 (otra persona lo cambió);
//   · aprobar fija la versión aprobada: es lo que dejará pagar la voz;
//   · el cliente de otro espacio no existe; quien es de sólo lectura no escribe.
// ============================================================

const JEFE = "u-jefe";
const OTRO = "u-otro";
const LECTOR = "u-lector";
let db;
let env;

const ejemplo = () => {
  const md = readFileSync(new URL("../../docs/formato-escenas-v1.md", import.meta.url), "utf8");
  return JSON.parse(/```json\n([\s\S]*?)\n```/.exec(md)[1]);
};

const pedir = (ruta, testigo, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    method: opciones.method ?? "GET",
    headers: { Cookie: `${COOKIE}=${testigo}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

async function sesion(usuario, testigo) {
  db.sqlite.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(testigo), usuario, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
}

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRO, "otro@b.com"], [LECTOR, "lector@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "y");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRO, OTRO, "admin", "Otra", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura) values (?,?,?,?,?,?)").run(LECTOR, JEFE, "editor", "Lector", "#22AA88", 1);
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("bc", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("ajeno", OTRO, "Ajeno");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year) values (?,?,?,?,?,?)").run("nov", "bc", JEFE, "Noviembre 2026", 10, 2026);
  await sesion(JEFE, "t-jefe");
  await sesion(OTRO, "t-otro");
  await sesion(LECTOR, "t-lector");
}, 30_000);

const crear = async (extra = {}) => (await pedir("/videos/bc", "t-jefe", { method: "POST", body: { guion: ejemplo(), ...extra } })).json();

describe("los proyectos de video animado", () => {
  it("se crean en borrador, con su guion limpio y su duración estimada", async () => {
    const r = await pedir("/videos/bc", "t-jefe", { method: "POST", body: { guion: ejemplo(), calendarId: "nov", postId: "p1" } });
    expect(r.status).toBe(201);
    const { video } = await r.json();
    expect(video).toMatchObject({ estado: "borrador", version: 1, aprobadaVersion: null, calendarId: "nov", postId: "p1", valido: true, titulo: "Toallitas Nateen · piel tranquila" });
    expect(video.segundos).toBeGreaterThan(10);
    const lista = await (await pedir("/videos/bc", "t-jefe")).json();
    expect(lista.videos.map((v) => v.id)).toEqual([video.id]);
    expect(lista.videos[0]).not.toHaveProperty("guion");
  });

  it("un guion con errores no se guarda y dice dónde está cada uno", async () => {
    const g = ejemplo();
    g.escenas[0].capas[0].tipo = "cohete";
    const r = await pedir("/videos/bc", "t-jefe", { method: "POST", body: { guion: g } });
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.errores[0].donde).toBe("escenas[0].capas[0].tipo");
    expect(db.sqlite.prepare("select count(*) n from videos_proyectos").get().n).toBe(0);
  });

  it("un calendario de otro cliente no se acepta", async () => {
    db.sqlite.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("dc", JEFE, "D'CASA");
    const r = await pedir("/videos/dc", "t-jefe", { method: "POST", body: { guion: ejemplo(), calendarId: "nov" } });
    expect(r.status).toBe(400);
  });

  it("cambiar el guion sube la versión y lo devuelve a borrador; el título solo, no", async () => {
    const { video } = await crear();
    await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } });
    const titulo = await (await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { titulo: "Otro título", version: 1 } })).json();
    expect(titulo.video).toMatchObject({ titulo: "Otro título", version: 1, estado: "aprobado" });
    const g = ejemplo();
    g.escenas[1].pantalla = "Cambia";
    const r = await (await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { guion: g, version: 1 } })).json();
    expect(r.video).toMatchObject({ version: 2, estado: "borrador", aprobadaVersion: 1 });
    const igual = await (await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { guion: g, version: 2 } })).json();
    expect(igual.video.version).toBe(2);
  });

  it("guardar o aprobar con la versión vieja es 409, sin pisar nada", async () => {
    const { video } = await crear();
    const g = ejemplo();
    g.escenas[0].pantalla = "Primera";
    await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { guion: g, version: 1 } });
    g.escenas[0].pantalla = "Segunda";
    expect((await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { guion: g, version: 1 } })).status).toBe(409);
    expect((await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } })).status).toBe(409);
    const leido = await (await pedir(`/videos/bc/${video.id}`, "t-jefe")).json();
    expect(leido.video.guion.escenas[0].pantalla).toBe("Primera");
  });

  it("aprobar fija la versión aprobada, y no se aprueba dos veces", async () => {
    const { video } = await crear();
    const r = await (await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } })).json();
    expect(r.video).toMatchObject({ estado: "aprobado", aprobadaVersion: 1, aprobadoPor: JEFE });
    expect((await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } })).status).toBe(409);
  });

  it("un video con locución no se «aprueba» otra vez (lo devolvía a «Guion aprobado», como si no tuviera voz)", async () => {
    const { video } = await crear();
    await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } });
    db.sqlite.prepare("update videos_proyectos set estado = 'con_voz' where id = ?").run(video.id);
    expect((await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } })).status).toBe(409);
    const leido = await (await pedir(`/videos/bc/${video.id}`, "t-jefe")).json();
    expect(leido.video.estado).toBe("con_voz");
  });

  it("el cliente de otro espacio no existe, y quien es de sólo lectura no escribe", async () => {
    const { video } = await crear();
    expect((await pedir("/videos/bc", "t-otro")).status).toBe(404);
    expect((await pedir(`/videos/bc/${video.id}`, "t-otro")).status).toBe(404);
    expect((await pedir("/videos/ajeno", "t-jefe", { method: "POST", body: { guion: ejemplo() } })).status).toBe(404);
    expect((await pedir("/videos/bc", "t-lector")).status).toBe(200);
    expect((await pedir("/videos/bc", "t-lector", { method: "POST", body: { guion: ejemplo() } })).status).toBe(403);
  });

  it("se borra", async () => {
    const { video } = await crear();
    expect((await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "DELETE" })).status).toBe(200);
    expect((await pedir(`/videos/bc/${video.id}`, "t-jefe")).status).toBe(404);
  });
});

// ------------------------------------------------------------
// El sonido (efectos y música), el historial del guion y la voz que sigue valiendo
// ------------------------------------------------------------

import { textoParaVoz, MODELO_VOZ_POR_DEFECTO } from "../../src/lib/voces.js";

/** Le pone al video una locución LISTA de su versión 1, con el texto que se le mandó a la voz en su trabajo. */
function conLocucion(video, guion) {
  db.sqlite.prepare("insert into estudio_trabajos (id, owner_id, client_id, estado, tipo, motor, modelo, prompt) values (?,?,?,?,?,?,?,?)")
    .run("tr-voz", JEFE, "bc", "hecho", "audio", "elevenlabs", "elevenlabs-v4", textoParaVoz(guion, MODELO_VOZ_POR_DEFECTO));
  const locucion = { estado: "lista", clave: "clientes/bc/estudio/voz.mp3", trabajoId: "tr-voz", modelo: MODELO_VOZ_POR_DEFECTO, version: 1, duracion: 20 };
  db.sqlite.prepare("update videos_proyectos set estado = 'con_voz', locucion = ? where id = ?").run(JSON.stringify(locucion), video.id);
}

describe("el sonido, el historial y la voz que sigue valiendo", () => {
  it("el sonido va aparte: cambiarlo no sube la versión ni toca la voz; una música de otro cliente no entra", async () => {
    const { video } = await crear();
    expect(video.sonido).toEqual({ efectos: true, musica: null });
    db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo, prompt) values (?,?,?,?,?,?,?,?)")
      .run("m1", JEFE, "bc", "clientes/bc/estudio/tema.mp3", "audio", "audio/mpeg", "musica-subida", "Tema alegre.mp3");
    const r = await pedir(`/videos/bc/${video.id}/sonido`, "t-jefe", { method: "PUT", body: { efectos: false, musica: { archivoId: "m1", volumen: -3 } } });
    expect(r.status).toBe(200);
    const { video: v } = await r.json();
    expect(v.sonido).toEqual({ efectos: false, musica: { archivoId: "m1", clave: "clientes/bc/estudio/tema.mp3", nombre: "Tema alegre", volumen: -3 } });
    expect(v).toMatchObject({ version: 1, estado: "borrador" });
    // Una locución (audio, pero no música) tampoco es de otro cliente: un id que no es suyo da 404.
    expect((await pedir(`/videos/bc/${video.id}/sonido`, "t-jefe", { method: "PUT", body: { musica: { archivoId: "no-existe" } } })).status).toBe(404);
    // La lista de músicas sólo trae las músicas (no las locuciones).
    db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo) values (?,?,?,?,?,?,?)")
      .run("voz1", JEFE, "bc", "clientes/bc/estudio/voz.mp3", "audio", "audio/mpeg", "elevenlabs-v4");
    const { musicas } = await (await pedir("/videos/bc/musicas", "t-jefe")).json();
    expect(musicas.map((m) => m.id)).toEqual(["m1"]);
    expect(musicas[0].nombre).toBe("Tema alegre");
  });

  it("cada cambio del guion guarda el de antes en el historial, y se puede volver a él (versión nueva, en borrador)", async () => {
    const { video } = await crear();
    const g = ejemplo();
    g.escenas[1].pantalla = "Cambio uno";
    await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { guion: g, version: 1 } });
    g.escenas[1].pantalla = "Cambio dos";
    await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { guion: g, version: 2 } });
    const h = await (await pedir(`/videos/bc/${video.id}/versiones`, "t-jefe")).json();
    expect(h.actual).toBe(3);
    expect(h.versiones.map((v) => v.version)).toEqual([2, 1]);
    expect(h.versiones[0]).toMatchObject({ por: "Juan", escenas: ejemplo().escenas.length });
    // Volver a la 1: es la versión 4, con el guion de la 1, y la 3 queda en el historial.
    const r = await (await pedir(`/videos/bc/${video.id}/versiones`, "t-jefe", { method: "POST", body: { version: 3, aVersion: 1 } })).json();
    expect(r.video).toMatchObject({ version: 4, estado: "borrador" });
    expect(r.video.guion.escenas[1].pantalla).toBe(ejemplo().escenas[1].pantalla);
    const h2 = await (await pedir(`/videos/bc/${video.id}/versiones`, "t-jefe")).json();
    expect(h2.versiones.map((v) => v.version)).toEqual([3, 2, 1]);
    // Con la versión vieja, 409; a una que no existe, 404.
    expect((await pedir(`/videos/bc/${video.id}/versiones`, "t-jefe", { method: "POST", body: { version: 3, aVersion: 1 } })).status).toBe(409);
    expect((await pedir(`/videos/bc/${video.id}/versiones`, "t-jefe", { method: "POST", body: { version: 4, aVersion: 9 } })).status).toBe(404);
    // Otro espacio no ve el historial.
    expect((await pedir(`/videos/bc/${video.id}/versiones`, "t-otro")).status).toBe(404);
  });

  it("si sólo cambió lo que SE VE, al aprobar la voz de antes sigue valiendo (no se paga otra); si cambió lo que se dice, no", async () => {
    const { video } = await crear();
    await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 1 } });
    conLocucion(video, ejemplo());
    // Sólo lo que se ve.
    const g = ejemplo();
    g.escenas[1].pantalla = "Otro texto en pantalla";
    await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { guion: g, version: 1 } });
    const a = await (await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 2 } })).json();
    expect(a.vozReutilizada).toBe(true);
    expect(a.video).toMatchObject({ estado: "con_voz", aprobadaVersion: 2 });
    expect(a.video.locucion).toMatchObject({ estado: "lista", version: 2, deVersion: 1 });
    // Lo que se dice.
    g.escenas[1].habla = `${g.escenas[1].habla} Y algo más.`;
    await pedir(`/videos/bc/${video.id}`, "t-jefe", { method: "PUT", body: { guion: g, version: 2 } });
    const b = await (await pedir(`/videos/bc/${video.id}/aprobar`, "t-jefe", { method: "POST", body: { version: 3 } })).json();
    expect(b.vozReutilizada).toBe(false);
    expect(b.video).toMatchObject({ estado: "aprobado", aprobadaVersion: 3 });
    expect(b.video.locucion.version).toBe(2);
  });
});
