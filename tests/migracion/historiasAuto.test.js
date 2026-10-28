import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { procesarCola } from "../../worker/lib/publicador.js";
import { historiasAutomaticasPendiente } from "../../worker/lib/historiasAuto.js";

// ============================================================
// Historias automáticas, contra una D1 de verdad
//
// Lo publicado se prepara (la imagen la hace el navegador: aquí se da por
// subida), el cron pone UNA al día en la cola sin calendario, y la cola la
// publica como historia sin buscarla en ningún mes.
// ============================================================

const DUENO = "u-jefe";
const TESTIGO = "testigo-de-sesion-de-prueba";
const IMAGEN = "/api/media/clientes/c1/posts/foto.jpg";
const HISTORIA = "/api/media/clientes/c1/posts/historia.jpg";

let db;
let env;
let llamadas;

async function sembrar() {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", DUENO, "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", DUENO, "Otro");
  const post = { id: "p1", format: "post", title: "Lanzamiento", image: IMAGEN, publishTime: "10:00" };
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal1", "c1", DUENO, "Septiembre", 8, 2026, JSON.stringify([{ date: "2026-09-25", posts: [post] }]));
  s.prepare("insert into integracion_meta (id, owner_id, token_cifrado, origen) values (?,?,?,?)")
    .run(DUENO, DUENO, await cifrarMeta(env, "token-de-usuario"), "https://calendarios.test");
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, pagina_id, token_cifrado, client_id) values (?,?,?,?,?,?,?)")
    .run(`${DUENO}:instagram:IG1`, DUENO, "instagram", "IG1", "PAGE1", await cifrarMeta(env, "token-de-pagina"), "c1");
  s.prepare(`insert into publicaciones_programadas (id, owner_id, client_id, calendar_id, post_id, red, cuenta_id, programada_para,
      estado, externo_id, publicada_at, carga, variante) values (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run("f1", DUENO, "c1", "cal1", "p1", "instagram", `${DUENO}:instagram:IG1`, "2026-09-25T15:00:00.000Z", "publicada", "media9",
      "2026-09-25T15:00:01.000Z", JSON.stringify({ post }), "post");
}

const pedir = (ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
}), env, {});
const cola = () => db.sqlite.prepare("select * from publicaciones_programadas where variante = 'historia' order by created_at").all();

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T12:00:00.000Z")); // 07:00 en Panamá
  db = d1EnMemoria();
  env = {
    DB: db, META_APP_ID: "app", META_APP_SECRET: "secreto-de-la-app-de-meta", ASSETS: { fetch: async () => new Response("") },
    MEDIA: { async head(clave) { return ["clientes/c1/posts/historia.jpg", "clientes/c2/posts/h.jpg"].includes(clave) ? { size: 10 } : null; } },
  };
  llamadas = [];
  vi.stubGlobal("fetch", vi.fn(async (entrada, init = {}) => {
    const u = new URL(String(entrada));
    const ruta = u.pathname.replace(/^\/v[\d.]+/, "");
    const params = Object.fromEntries(new URLSearchParams(String(init.body ?? "")));
    llamadas.push({ metodo: init.method ?? "GET", ruta, params });
    if (ruta === "/IG1/media") return Response.json({ id: "st1" });
    if (ruta === "/st1") return Response.json({ status_code: "FINISHED" });
    if (ruta === "/IG1/media_publish") return Response.json({ id: "hist1" });
    return Response.json({ error: { message: `sin respuesta para ${ruta}` } }, { status: 400 });
  }));
  await sembrar();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function preparar() {
  const { pendientes } = await (await pedir("/historias-auto/c1/pendientes")).json();
  expect(pendientes).toHaveLength(1);
  expect(pendientes[0]).toMatchObject({ filaId: "f1", src: IMAGEN });
  expect(pendientes[0].frase).toBeTruthy();
  const r = await pedir("/historias-auto/c1/piezas", { method: "POST", body: JSON.stringify({ filaId: "f1", src: HISTORIA, frase: pendientes[0].frase }) });
  expect(r.status).toBe(201);
}

describe("preparar", () => {
  it("lo publicado sale en pendientes hasta que tiene su historia", async () => {
    await preparar();
    expect((await (await pedir("/historias-auto/c1/pendientes")).json()).pendientes).toEqual([]);
    const datos = await (await pedir("/historias-auto/c1")).json();
    expect(datos.piezas).toHaveLength(1);
    expect(datos.piezas[0].src).toBe(HISTORIA);
  });

  it("la imagen tiene que ser de ESE cliente y estar subida, y la publicación, publicada", async () => {
    const ajena = await pedir("/historias-auto/c1/piezas", { method: "POST", body: JSON.stringify({ filaId: "f1", src: "/api/media/clientes/c2/posts/h.jpg" }) });
    expect(ajena.status).toBe(400);
    const sinSubir = await pedir("/historias-auto/c1/piezas", { method: "POST", body: JSON.stringify({ filaId: "f1", src: "/api/media/clientes/c1/posts/no.jpg" }) });
    expect(sinSubir.status).toBe(404);
    db.sqlite.prepare("update publicaciones_programadas set estado = 'programada' where id = 'f1'").run();
    const sinPublicar = await pedir("/historias-auto/c1/piezas", { method: "POST", body: JSON.stringify({ filaId: "f1", src: HISTORIA }) });
    expect(sinPublicar.status).toBe(404);
  });
});

describe("el cron", () => {
  it("apagadas, no hace nada (una consulta)", async () => {
    await preparar();
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(0);
    expect(cola()).toHaveLength(0);
  });

  it("encendidas: UNA en la cola, a su hora de Panamá, sin calendario; y no la pone dos veces", async () => {
    await preparar();
    await pedir("/historias-auto/c1", { method: "PUT", body: JSON.stringify({ activa: true, hora: "18:00" }) });
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(1);
    const [f] = cola();
    expect(f).toMatchObject({ calendar_id: null, red: "instagram", programada_para: "2026-10-05T23:00:00.000Z", estado: "programada" });
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(0);
    expect(cola()).toHaveLength(1);
    const datos = await (await pedir("/historias-auto/c1")).json();
    expect(datos.piezas[0].usos).toBe(1);
    expect(datos.nota).toMatch(/Lanzamiento/);

    // Programación la enseña (sin «Abrir»: no tiene calendario) y se puede quitar.
    const lista = await (await pedir("/publicar?todo=1&dias=14")).json();
    expect(lista.find((x) => x.id === f.id)).toMatchObject({ calendarId: null, formato: "historia", miniatura: HISTORIA });
  });

  it("la cola la publica como historia, con la imagen hecha, sin buscarla en ningún mes", async () => {
    await preparar();
    await pedir("/historias-auto/c1", { method: "PUT", body: JSON.stringify({ activa: true, hora: "18:00" }) });
    await historiasAutomaticasPendiente(env, new Date());
    vi.setSystemTime(new Date("2026-10-05T23:01:00.000Z"));
    await procesarCola(env);
    const [f] = cola();
    expect(f.estado).toBe("publicada");
    const crear = llamadas.find((l) => l.ruta === "/IG1/media");
    expect(crear.params.media_type).toBe("STORIES");
    expect(crear.params.image_url).toContain("/api/medio-publico/");
  });

  it("al día siguiente vuelve a mirar; sin nada que pueda salir, lo dice y no pone nada", async () => {
    await preparar();
    await pedir("/historias-auto/c1", { method: "PUT", body: JSON.stringify({ activa: true, hora: "18:00" }) });
    await historiasAutomaticasPendiente(env, new Date());
    vi.setSystemTime(new Date("2026-10-06T12:00:00.000Z"));
    // La única pieza salió ayer: hasta dentro de cuatro días no se repite.
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(1);
    expect(cola()).toHaveLength(1);
    expect((await (await pedir("/historias-auto/c1")).json()).nota).toMatch(/salió hace poco/);
  });

  it("«Que no salga» es para siempre: no se vuelve a preparar ni sale, y «Que vuelva a salir» la devuelve", async () => {
    await preparar();
    const { piezas } = await (await pedir("/historias-auto/c1")).json();
    const r = await pedir(`/historias-auto/c1/piezas/${piezas[0].id}`, { method: "DELETE" });
    const quitada = await r.json();
    expect(quitada.piezas).toEqual([]);
    expect(quitada.quitadas).toHaveLength(1);
    // Antes se borraba la fila y, al abrir la aplicación, la publicación volvía a «sin historia» y se preparaba otra vez.
    expect((await (await pedir("/historias-auto/c1/pendientes")).json()).pendientes).toEqual([]);
    // Volver a subirla (otra pestaña que la preparaba a la vez) no la devuelve a la rotación.
    await pedir("/historias-auto/c1/piezas", { method: "POST", body: JSON.stringify({ filaId: "f1", src: HISTORIA }) });
    expect((await (await pedir("/historias-auto/c1")).json()).quitadas).toHaveLength(1);
    // Encendidas, el cron no la pone: no hay ninguna que pueda salir.
    await pedir("/historias-auto/c1", { method: "PUT", body: JSON.stringify({ activa: true }) });
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(1);
    expect(cola()).toHaveLength(0);
    expect((await (await pedir("/historias-auto/c1")).json()).nota).toMatch(/apartadas con «Que no salga»/);
    // «Que vuelva a salir».
    const v = await (await pedir(`/historias-auto/c1/piezas/${piezas[0].id}/volver`, { method: "POST" })).json();
    expect(v.piezas).toHaveLength(1);
    expect(v.quitadas).toEqual([]);
    // Una de otro cliente no se toca desde este.
    expect((await pedir(`/historias-auto/c2/piezas/${piezas[0].id}`, { method: "DELETE" })).status).toBe(404);
  });
});
