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
let iaResponde; // lo que contesta la IA de la vigencia (texto), o null si no hay
let pedidosIA;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 500 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 60 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

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
    MEDIA: {
      async head(clave) { return ["clientes/c1/posts/historia.jpg", "clientes/c2/posts/h.jpg"].includes(clave) ? { size: 10 } : null; },
      async get(clave) {
        if (clave !== "clientes/c1/posts/historia.jpg") return null;
        return { httpMetadata: { contentType: "image/jpeg" }, async arrayBuffer() { return new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer; } };
      },
    },
  };
  llamadas = [];
  iaResponde = null;
  pedidosIA = [];
  vi.stubGlobal("fetch", vi.fn(async (entrada, init = {}) => {
    const u = new URL(String(entrada));
    if (u.hostname === "api.anthropic.com") {
      if (u.pathname.startsWith("/v1/models")) return Response.json({ data: [] });
      pedidosIA.push(JSON.parse(init.body));
      return iaResponde == null ? Response.json({ error: { message: "caída" } }, { status: 500 }) : flujo(iaResponde);
    }
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

/** Prepara TODAS las historias que da la publicación (cada estilo: la encajada de siempre y las nuevas). → cuántas. */
async function preparar() {
  const { pendientes } = await (await pedir("/historias-auto/c1/pendientes")).json();
  // La de siempre primero; la publicación da además el «detalle» (y la «frase del post» si su caption tiene una).
  expect(pendientes[0]).toMatchObject({ filaId: "f1", src: IMAGEN, estilo: "encajada" });
  expect(pendientes.map((p) => p.estilo)).toContain("detalle");
  for (const p of pendientes) {
    expect(p.frase).toBeTruthy();
    const r = await pedir("/historias-auto/c1/piezas", { method: "POST", body: JSON.stringify({ filaId: "f1", src: HISTORIA, frase: p.frase, estilo: p.estilo }) });
    expect(r.status).toBe(201);
  }
  return pendientes.length;
}

/** «Sí puede salir» en la publicación preparada (vale para todos sus estilos): sin vigencia, nada sale. */
async function vigente() {
  const { piezas } = await (await pedir("/historias-auto/c1")).json();
  const r = await pedir(`/historias-auto/c1/piezas/${piezas[0].id}/vigencia`, { method: "PUT", body: JSON.stringify({ vigencia: "siempre" }) });
  expect(r.status).toBe(200);
  return r.json();
}

describe("preparar", () => {
  it("lo publicado sale en pendientes hasta que tiene su historia", async () => {
    const n = await preparar();
    expect((await (await pedir("/historias-auto/c1/pendientes")).json()).pendientes).toEqual([]);
    const datos = await (await pedir("/historias-auto/c1")).json();
    expect(datos.piezas).toHaveLength(n);
    expect(datos.piezas.map((p) => p.estilo).sort()).toEqual(expect.arrayContaining(["detalle", "encajada"]));
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
    await vigente();
    await pedir("/historias-auto/c1", { method: "PUT", body: JSON.stringify({ activa: true, hora: "18:00" }) });
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(1);
    const [f] = cola();
    expect(f).toMatchObject({ calendar_id: null, red: "instagram", programada_para: "2026-10-05T23:00:00.000Z", estado: "programada" });
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(0);
    expect(cola()).toHaveLength(1);
    const datos = await (await pedir("/historias-auto/c1")).json();
    // UNA de las de esa publicación (no las dos: los estilos de un mismo post no salen el mismo día).
    expect(datos.piezas.reduce((t, p) => t + p.usos, 0)).toBe(1);
    expect(datos.nota).toMatch(/Lanzamiento/);

    // Programación la enseña (sin «Abrir»: no tiene calendario) y se puede quitar.
    const lista = await (await pedir("/publicar?todo=1&dias=14")).json();
    expect(lista.find((x) => x.id === f.id)).toMatchObject({ calendarId: null, formato: "historia", miniatura: HISTORIA });
  });

  it("con 3 al día pide tres horas; si sólo hay una preparada, pone ésa y dice que faltaron", async () => {
    await preparar();
    await vigente();
    const ajustes = await (await pedir("/historias-auto/c1", { method: "PUT", body: JSON.stringify({ activa: true, hora: "10:00", porDia: 3 }) })).json();
    expect(ajustes).toMatchObject({ porDia: 3, horas: ["10:00", "12:00", "14:00"] });
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(1);
    expect(cola()).toHaveLength(1);
    expect((await (await pedir("/historias-auto/c1")).json()).nota).toMatch(/Faltaron 2/);
  });

  it("la cola la publica como historia, con la imagen hecha, sin buscarla en ningún mes", async () => {
    await preparar();
    await vigente();
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
    await vigente();
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
    for (const p of piezas.slice(1)) await pedir(`/historias-auto/c1/piezas/${p.id}`, { method: "DELETE" });
    const r = await pedir(`/historias-auto/c1/piezas/${piezas[0].id}`, { method: "DELETE" });
    const quitada = await r.json();
    expect(quitada.piezas).toEqual([]);
    expect(quitada.quitadas).toHaveLength(piezas.length);
    // Antes se borraba la fila y, al abrir la aplicación, la publicación volvía a «sin historia» y se preparaba otra vez.
    expect((await (await pedir("/historias-auto/c1/pendientes")).json()).pendientes).toEqual([]);
    // Volver a subirla (otra pestaña que la preparaba a la vez) no la devuelve a la rotación.
    await pedir("/historias-auto/c1/piezas", { method: "POST", body: JSON.stringify({ filaId: "f1", src: HISTORIA }) });
    expect((await (await pedir("/historias-auto/c1")).json()).quitadas).toHaveLength(piezas.length);
    // Encendidas, el cron no la pone: no hay ninguna que pueda salir.
    await pedir("/historias-auto/c1", { method: "PUT", body: JSON.stringify({ activa: true }) });
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(1);
    expect(cola()).toHaveLength(0);
    expect((await (await pedir("/historias-auto/c1")).json()).nota).toMatch(/apartadas con «Que no salga»/);
    // «Que vuelva a salir».
    const v = await (await pedir(`/historias-auto/c1/piezas/${piezas[0].id}/volver`, { method: "POST" })).json();
    expect(v.piezas).toHaveLength(1);
    expect(v.quitadas).toHaveLength(piezas.length - 1);
    // Una de otro cliente no se toca desde este.
    expect((await pedir(`/historias-auto/c2/piezas/${piezas[0].id}`, { method: "DELETE" })).status).toBe(404);
  });
});

// ============================================================
// La VIGENCIA: lo que ya no sirve no vuelve (src/lib/vigenciaHistorias.js)
// ============================================================

/** Una segunda publicación ya publicada, con el texto que se le dé. */
function publicada(id, post, publicadaAt = "2026-09-28T15:00:01.000Z") {
  db.sqlite.prepare(`insert into publicaciones_programadas (id, owner_id, client_id, calendar_id, post_id, red, cuenta_id, programada_para,
      estado, externo_id, publicada_at, carga, variante) values (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, DUENO, "c1", "cal1", post.id, "instagram", `${DUENO}:instagram:IG1`, publicadaAt, "publicada", `m-${id}`, publicadaAt, JSON.stringify({ post }), "post");
}
const piezasDe = () => db.sqlite.prepare("select * from historias_auto_piezas where client_id = 'c1'").all();

describe("la vigencia", () => {
  it("sin revisar NO sale: sin IA, la nota lo dice y la cola queda vacía", async () => {
    await preparar();
    await pedir("/historias-auto/c1", { method: "PUT", body: JSON.stringify({ activa: true, hora: "18:00" }) });
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(1);
    expect(cola()).toHaveLength(0);
    expect((await (await pedir("/historias-auto/c1")).json()).nota).toMatch(/sin revisar/);
    expect(piezasDe().every((p) => p.vigencia === "sin_revisar")).toBe(true);
  });

  it("una felicitación ni se prepara; la promoción del mes pasado tampoco", async () => {
    vi.setSystemTime(new Date("2026-11-12T12:00:00.000Z"));
    publicada("f2", { id: "p2", format: "post", title: "¡Feliz Día de la Patria!", image: IMAGEN });
    publicada("f3", { id: "p3", format: "post", title: "Promo de octubre", textoPieza: "20% de descuento", image: IMAGEN }, "2026-10-05T15:00:01.000Z");
    const { pendientes } = await (await pedir("/historias-auto/c1/pendientes")).json();
    expect(pendientes.map((p) => p.filaId)).not.toContain("f2");
    expect(pendientes.map((p) => p.filaId)).not.toContain("f3");
    expect(pendientes.map((p) => p.filaId)).toContain("f1");
  });

  it("si ya se preparó, las reglas la marcan al guardarla y la IA no hace falta", async () => {
    vi.setSystemTime(new Date("2026-11-12T12:00:00.000Z"));
    publicada("f3", { id: "p3", format: "post", title: "Promo de octubre", textoPieza: "20% de descuento", image: IMAGEN }, "2026-10-05T15:00:01.000Z");
    const r = await pedir("/historias-auto/c1/piezas", { method: "POST", body: JSON.stringify({ filaId: "f3", src: HISTORIA }) });
    expect(r.status).toBe(201);
    const p = piezasDe().find((x) => x.fila_id === "f3");
    expect(p).toMatchObject({ vigencia: "hasta", vigente_hasta: "2026-10-31", vigencia_por: "reglas" });
    const datos = await (await pedir("/historias-auto/c1")).json();
    expect(datos.piezas[0]).toMatchObject({ vigencia: "hasta", vigente_hasta: "2026-10-31" });
  });

  it("la IA MIRA la historia: lo que dice «nunca» no sale; lo que dice «siempre», sí", async () => {
    env.ANTHROPIC_API_KEY = "sk-prueba";
    await preparar();
    await pedir("/historias-auto/c1", { method: "PUT", body: JSON.stringify({ activa: true, hora: "18:00" }) });
    iaResponde = '[{"n":1,"vigencia":"nunca","motivo":"La imagen dice Feliz Día del Niño"}]';
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(1);
    expect(cola()).toHaveLength(0);
    // Mandó la imagen como bloque de imagen.
    expect(JSON.stringify(pedidosIA[0].messages[0].content)).toContain('"type":"image"');
    expect(piezasDe().every((p) => p.vigencia === "nunca" && p.vigencia_por === "ia")).toBe(true);
    expect((await (await pedir("/historias-auto/c1")).json()).nota).toMatch(/Ninguna sigue vigente/);

    // Otro día, otra publicación que la IA da por atemporal: ésa sí sale.
    vi.setSystemTime(new Date("2026-10-06T12:00:00.000Z"));
    publicada("f4", { id: "p4", format: "post", title: "Cómo preparar un buen café", image: IMAGEN });
    await pedir("/historias-auto/c1/piezas", { method: "POST", body: JSON.stringify({ filaId: "f4", src: HISTORIA }) });
    iaResponde = '[{"n":1,"vigencia":"siempre","motivo":"Educa"}]';
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(1);
    expect(cola()).toHaveLength(1);
    expect(JSON.parse(cola()[0].carga).post.title).toBe("Cómo preparar un buen café");
  });

  it("si la IA falla, queda sin revisar con el motivo y el cron no la reintenta cada minuto", async () => {
    env.ANTHROPIC_API_KEY = "sk-prueba";
    await preparar();
    await pedir("/historias-auto/c1", { method: "PUT", body: JSON.stringify({ activa: true, hora: "18:00" }) });
    await historiasAutomaticasPendiente(env, new Date()); // programa (no sale nada) y apunta el fallo
    expect(cola()).toHaveLength(0);
    expect(piezasDe()[0].revision_error).toBeTruthy();
    const antes = pedidosIA.length;
    // Ya puesto el día y con el fallo reciente: el cron no vuelve a llamar a la IA.
    expect(await historiasAutomaticasPendiente(env, new Date())).toBe(0);
    expect(pedidosIA.length).toBe(antes);
    // «Revisar vigencia» a pedido sí lo intenta otra vez.
    iaResponde = '[{"n":1,"vigencia":"hasta","hasta":"2026-10-20","motivo":"Nombra una fecha"}]';
    const r = await (await pedir("/historias-auto/c1/revisar", { method: "POST" })).json();
    expect(r.revisadas).toBe(1);
    expect(r.piezas[0]).toMatchObject({ vigencia: "hasta", vigente_hasta: "2026-10-20" });
  });

  it("lo que ya estaba en la cola y dejó de servir sale de ella; y la cola lo para aunque nadie lo quitara", async () => {
    await preparar();
    await vigente();
    await pedir("/historias-auto/c1", { method: "PUT", body: JSON.stringify({ activa: true, hora: "18:00" }) });
    await historiasAutomaticasPendiente(env, new Date());
    expect(cola()).toHaveLength(1);
    // Una persona dice que ya no sirve: se quita de la cola con el motivo.
    const { piezas } = await (await pedir("/historias-auto/c1")).json();
    await pedir(`/historias-auto/c1/piezas/${piezas[0].id}/vigencia`, { method: "PUT", body: JSON.stringify({ vigencia: "nunca" }) });
    expect(cola()[0]).toMatchObject({ estado: "cancelada" });
    expect(cola()[0].error).toMatch(/No se reutiliza/);

    // La última barrera: si la pieza vence entre que se programa y que sale, la cola no la publica.
    db.sqlite.prepare("update publicaciones_programadas set estado = 'programada', error = null where variante = 'historia'").run();
    db.sqlite.prepare("update historias_auto_piezas set vigencia = 'hasta', vigente_hasta = '2026-10-04'").run();
    vi.setSystemTime(new Date("2026-10-05T23:01:00.000Z"));
    await procesarCola(env);
    expect(cola()[0]).toMatchObject({ estado: "cancelada" });
    expect(cola()[0].error).toMatch(/Ya no está vigente/);
    expect(llamadas.find((l) => l.ruta === "/IG1/media")).toBeUndefined();
  });
});
