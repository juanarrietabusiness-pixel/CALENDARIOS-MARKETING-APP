import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { bombear } from "../../worker/lib/estudio/bomba.js";
import { prepararYProgramar, crearLoteProgramar, avanzarLoteProgramar, lotePublico, PLAZO_LOTE_MS } from "../../worker/lib/programarServidor.js";
import { avisarRespuestaCliente, reasignarTrabajoDe, destinatariosDe, textoDeRespuestas, VENTANA_RESPUESTAS_MS } from "../../worker/lib/equipo.js";
import { crearEjecutor } from "../../worker/lib/herramientasServidor.js";
import { cifrasDelMes } from "../../worker/lib/informes.js";

// ============================================================
// Publicar desde el SERVIDOR y lo que responde el cliente, contra una D1 de verdad
//
// · «Programar lo aprobado» como lote del servidor: el Container (de mentira, contesta como el de verdad) prepara cada
//   publicación y la cola la programa, paso a paso, aunque nadie mire la pantalla.
// · Claude programa una pieza PNG del Estudio (antes: «programa desde el panel»).
// · Lo que respondió el cliente (approvals) lo leen Claude y el informe aunque nadie haya abierto el mes.
// · «Aprobar todas» en UNA petición, avisos agrupados por mes, «Enviar mi revisión» en la campana.
// · Sacar a alguien del equipo no deja su trabajo sin dueño.
// ============================================================

const DUENO = "u-jefe";
const ANA = "u-ana";
const TESTIGO = "testigo-de-sesion-de-prueba";
const ENLACE = "e".repeat(48);
const PNG = "/api/media/clientes/c1/estudio/pieza.png";

let db;
let env;
let pedidosContainer;

function post(extra = {}) {
  return {
    id: "p1", format: "post", title: "Lanzamiento", descripcion: "Hola mundo", hashtagsFinales: "#cafe",
    image: PNG, medios: [{ src: PNG, tipo: "imagen", nombre: "pieza.png" }], publishTime: "10:00", redes: ["instagram"], ...extra,
  };
}

/** Un Container de los cuadros de mentira: contesta /imagen-redes como el de verdad (un JPEG de la medida pedida). */
const contenedor = () => ({
  idFromName: (n) => n,
  get: () => ({
    fetch: async (req) => {
      const cuerpo = await req.json();
      pedidosContainer.push(cuerpo.salida);
      const s = cuerpo.salida;
      const medida = s.tipo === "encajar" ? { ancho: s.ancho, alto: s.alto } : { ancho: 1080, alto: 1350 };
      return Response.json(s.tipo === "medir" ? medida : { ...medida, mime: "image/jpeg", datos: btoa("\xff\xd8\xff jpeg") });
    },
  }),
});
const r2 = (objetos) => ({
  objetos,
  async get(k) { const b = objetos.get(k); return b ? { size: b.length, arrayBuffer: async () => b.buffer.slice(0) } : null; },
  async put(k, v) { objetos.set(k, v instanceof Uint8Array ? v : new Uint8Array(v)); },
});

async function sembrar({ posts = [post()], ana = true } = {}) {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  if (ana) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(ANA, "ana@a.com", "x", "x");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(ANA, DUENO, "editor", "Ana", "#F5A623");
  }
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", DUENO, "Café Luna");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days, share_token, share_enabled) values (?,?,?,?,?,?,?,?,1)")
    .run("cal1", "c1", DUENO, "Octubre 2026", 9, 2026, JSON.stringify([{ date: "2026-10-05", posts }]), ENLACE);
  s.prepare("insert into integracion_meta (id, owner_id, token_cifrado, origen) values (?,?,?,?)")
    .run(DUENO, DUENO, await cifrarMeta(env, "token-de-usuario"), "https://calendarios.test");
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, pagina_id, token_cifrado, client_id) values (?,?,?,?,?,?,?)")
    .run(`${DUENO}:instagram:IG1`, DUENO, "instagram", "IG1", "PAGE1", await cifrarMeta(env, "token-de-pagina"), "c1");
}

const pedir = (ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test${ruta}`, opciones), env, {});
const conSesion = (ruta, opciones = {}) => pedir(ruta, { ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" } });
const alEnlace = (sub, cuerpo) => pedir(`/api/publico/${ENLACE}/${sub}`, { method: "POST", body: JSON.stringify(cuerpo), headers: { "Content-Type": "application/json" } });
const filasCola = () => db.sqlite.prepare("select * from publicaciones_programadas order by created_at").all().map((f) => ({ ...f }));
const avisos = () => db.sqlite.prepare("select user_id, tipo, texto, enlace, leido_at, created_at from avisos order by created_at").all().map((f) => ({ ...f }));
const diasDe = () => JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal1'").get().days);
const acceso = () => crearAcceso(db, DUENO);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
  db = d1EnMemoria();
  pedidosContainer = [];
  env = { DB: db, META_APP_ID: "app", META_APP_SECRET: "secreto", MEDIA: r2(new Map([["clientes/c1/estudio/pieza.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1])]])) };
});

afterEach(() => vi.useRealTimers());

describe("Claude programa una pieza del Estudio (PNG) como la aplicación", () => {
  it("sin Container lo dice (no hay nada que preparar en el servidor); con él, la prepara (JPEG) y entra en la cola", async () => {
    await sembrar();
    await expect(prepararYProgramar(env, acceso(), { calendarId: "cal1", postId: "p1" }))
      .rejects.toThrow(/JPEG.*Al prepararla en el servidor: no hay Container/);
    expect(filasCola()).toHaveLength(0);

    env.VIDEO = contenedor();
    const r = await prepararYProgramar(env, acceso(), { calendarId: "cal1", postId: "p1" });
    expect(r.preparada).toBe(true);
    expect(pedidosContainer.map((s) => s.tipo)).toEqual(["jpeg"]);
    const p1 = diasDe()[0].posts[0];
    expect(p1.medios[0].src).toMatch(/^\/api\/media\/clientes\/c1\/posts\/[\w-]+\.jpg$/);
    expect(filasCola()).toMatchObject([{ post_id: "p1", red: "instagram", estado: "programada" }]);
  });
});

describe("«Programar lo aprobado» como LOTE del servidor", () => {
  it("sin Container la ruta contesta sin_container (la pantalla sigue por su camino de antes)", async () => {
    await sembrar();
    const r = await conSesion("/api/publicar/lotes", { method: "POST", body: JSON.stringify({ calendarId: "cal1", postIds: ["p1"] }) });
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe("sin_container");
  });

  it("la bomba del espacio prepara y programa una por paso, guarda el avance y la que no puede queda con su motivo", async () => {
    await sembrar({ posts: [post(), post({ id: "p2", title: "Sin cuenta", redes: ["tiktok"] }), post({ id: "p3", title: "Otra", publishTime: "11:00" })] });
    env.VIDEO = contenedor();
    const r = await conSesion("/api/publicar/lotes", { method: "POST", body: JSON.stringify({ calendarId: "cal1", postIds: ["p1", "p2", "p3", "p1"] }) });
    expect(r.status).toBe(201);
    const { lote } = await r.json();
    expect(lote).toMatchObject({ estado: "en_marcha", total: 3, pendientes: 3 });

    // Una vuelta de la bomba (la alarma del Durable Object) da hasta 3 pasos: cierra el lote.
    await bombear(env, DUENO);
    const fila = db.sqlite.prepare("select * from programar_lotes where id = ?").get(lote.id);
    const l = lotePublico({ ...fila });
    expect(l).toMatchObject({ estado: "hecho", hechas: 2, pendientes: 0, total: 3 });
    expect(l.fallidas).toEqual([{ postId: "p2", motivo: expect.stringMatching(/ninguna cuenta/) }]);
    expect(filasCola().map((f) => f.post_id).sort()).toEqual(["p1", "p3"]);
    // Las dos se prepararon en el servidor (JPEG) y el mes quedó con ellas; la que no sale en ninguna red, tal cual.
    expect(diasDe()[0].posts.filter((p) => p.medios[0].src.endsWith(".jpg")).map((p) => p.id).sort()).toEqual(["p1", "p3"]);
    // A quien lo pidió le queda en la campana lo que no entró.
    expect(avisos()).toMatchObject([{ user_id: DUENO, tipo: "fallo", texto: expect.stringMatching(/Programadas 2 de 3 de Octubre 2026\. No se pudo: «Sin cuenta»/) }]);
    // Lo que ya está en un lote vivo no se mete en otro (saldría dos veces en la cola).
    const vivo = await crearLoteProgramar(env, acceso(), { calendarId: "cal1", postIds: ["p1"] });
    expect(vivo.id).not.toBe(lote.id);
  });

  it("la pantalla que lo sigue empuja un lote quieto; el que pasa de su plazo se cierra con el motivo", async () => {
    await sembrar();
    env.VIDEO = contenedor();
    const fila = await crearLoteProgramar(env, acceso(), { calendarId: "cal1", postIds: ["p1"], usuarioId: DUENO });
    vi.setSystemTime(new Date(Date.now() + 30_000));
    const r = await (await conSesion(`/api/publicar/lotes/${fila.id}`)).json();
    expect(r.lote).toMatchObject({ estado: "hecho", hechas: 1, programadas: 1 });

    const viejo = await crearLoteProgramar(env, acceso(), { calendarId: "cal1", postIds: ["p1"], usuarioId: DUENO });
    vi.setSystemTime(new Date(Date.now() + PLAZO_LOTE_MS + 1000));
    const cerrado = await avanzarLoteProgramar(env, acceso(), viejo.id);
    expect(lotePublico(cerrado.lote)).toMatchObject({ estado: "fallido", fallidas: [{ postId: "p1", motivo: expect.stringMatching(/tiempo/) }] });
  });

  it("si el Container no contesta (en local no se arranca), el lote de la pantalla se cierra YA y ella prepara por su cuenta", async () => {
    await sembrar({ posts: [post(), post({ id: "p2", title: "Dos" })] });
    env.VIDEO = { idFromName: (n) => n, get: () => ({ fetch: async () => Response.json({ error: "Sin Container en local." }, { status: 503 }) }) };
    const { lote } = await (await conSesion("/api/publicar/lotes", { method: "POST", body: JSON.stringify({ calendarId: "cal1", postIds: ["p1", "p2"] }) })).json();
    await bombear(env, DUENO);
    const l = lotePublico({ ...db.sqlite.prepare("select * from programar_lotes where id = ?").get(lote.id) });
    expect(l).toMatchObject({ estado: "fallido", sinContainer: true, pendientes: 0, hechas: 0 });
    expect(l.fallidas.map((f) => f.postId)).toEqual(["p1", "p2"]);
    expect(filasCola()).toHaveLength(0);
    expect(avisos()).toHaveLength(0);
  });

  it("un paso a la vez: con el permiso tomado, otro no lo da", async () => {
    await sembrar();
    env.VIDEO = contenedor();
    const fila = await crearLoteProgramar(env, acceso(), { calendarId: "cal1", postIds: ["p1"] });
    db.sqlite.prepare("update programar_lotes set bloqueado_hasta = ? where id = ?").run("2099-01-01T00:00:00.000Z", fila.id);
    const r = await avanzarLoteProgramar(env, acceso(), fila.id);
    expect(r).toMatchObject({ hizo: false, ocupado: true });
    expect(filasCola()).toHaveLength(0);
  });
});

describe("lo que respondió el cliente, leído en el servidor", () => {
  it("Claude (ver_calendario) y el informe ven la aprobación aunque nadie haya abierto el mes", async () => {
    await sembrar({ posts: [post({ status: "pending" }), post({ id: "p2", title: "Dos", status: "pending" })] });
    db.sqlite.prepare("insert into approvals (id, calendar_id, post_id, estado, comentario, tipo) values (?,?,?,?,?,?)").run("a1", "cal1", "p1", "aprobado", "", "pieza");
    db.sqlite.prepare("insert into approvals (id, calendar_id, post_id, estado, comentario) values (?,?,?,?,?)").run("a2", "cal1", "p2", "cambios", "Otra foto");
    const texto = (await crearEjecutor({ env, acceso: acceso() }).ejecutar({ id: "t1", name: "ver_calendario", input: { cliente: "Café Luna" } })).content;
    expect(texto).toMatch(/ID p1 .* · approved/);
    expect(texto).toMatch(/ID p2 .* · rejected \(pidió cambios\)/);
    expect(texto).toMatch(/El cliente pidió: «Otra foto»/);
    const cifras = await cifrasDelMes(acceso(), "c1", "2026-10");
    expect(cifras.plan).toMatchObject({ planificadas: 2, aprobadas: 1 });
  });
});

describe("el cliente con su enlace", () => {
  it("«Aprobar todas» en UNA petición: todas las respuestas, UN aviso y, con «Programar al aprobar», un lote que las programa", async () => {
    await sembrar({ posts: [post(), post({ id: "p2", title: "Dos", publishTime: "11:00" }), post({ id: "p3", title: "Idea", medios: [], image: "" })] });
    db.sqlite.prepare("update clients set programar_al_aprobar = 1 where id = 'c1'").run();
    env.VIDEO = contenedor();
    const r = await alEnlace("aprobaciones", { postIds: ["p1", "p2", "p3"], revisor: "María" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, aprobadas: 3 });
    expect(db.sqlite.prepare("select post_id, estado, tipo from approvals order by post_id").all().map((x) => ({ ...x })))
      .toEqual([{ post_id: "p1", estado: "aprobado", tipo: "pieza" }, { post_id: "p2", estado: "aprobado", tipo: "pieza" }, { post_id: "p3", estado: "aprobado", tipo: "idea" }]);
    // Un aviso por persona del equipo, no uno por publicación.
    const a = avisos();
    expect(a).toHaveLength(2);
    expect(a[0].texto).toBe("María aprobó 3 publicaciones de Octubre 2026 (Café Luna).");
    expect(a[0].enlace).toBe("/cliente/c1/cal1");
    // Las piezas (no la idea) entran en la cola, preparadas en el servidor.
    expect(filasCola().map((f) => f.post_id).sort()).toEqual(["p1", "p2"]);
    expect(db.sqlite.prepare("select origen, estado from programar_lotes").all().map((x) => ({ ...x }))).toEqual([{ origen: "al_aprobar", estado: "hecho" }]);
  });

  it("una publicación de otro calendario y no se aprueba ninguna", async () => {
    await sembrar();
    const r = await alEnlace("aprobaciones", { postIds: ["p1", "ajena"] });
    expect(r.status).toBe(400);
    expect(db.sqlite.prepare("select count(*) n from approvals").get().n).toBe(0);
  });

  it("las aprobaciones sueltas se JUNTAN en el aviso sin leer del mes; los cambios van aparte, con lo que pidió", async () => {
    await sembrar({ posts: [post(), post({ id: "p2", title: "Dos" }), post({ id: "p3", title: "Tres" }), post({ id: "p4", title: "Cuatro" })] });
    await alEnlace("aprobacion", { postId: "p1", estado: "aprobado", revisor: "María" });
    expect(avisos().map((x) => x.texto)).toEqual(["María aprobó «Lanzamiento».", "María aprobó «Lanzamiento»."]);
    vi.setSystemTime(new Date(Date.now() + 60_000));
    await alEnlace("aprobacion", { postId: "p2", estado: "aprobado", revisor: "María" });
    await alEnlace("aprobacion", { postId: "p3", estado: "cambios", comentario: "La foto más clara", revisor: "María" });
    const deJuan = avisos().filter((x) => x.user_id === DUENO);
    expect(deJuan.map((x) => [x.tipo, x.texto])).toEqual([
      ["aprobada", "María aprobó 2 publicaciones y pidió cambios en 1 de Octubre 2026 (Café Luna)."],
      ["cambios", "María pidió cambios en «Tres»: «La foto más clara»"],
    ]);
    expect(deJuan[0].enlace).toBe("/cliente/c1/cal1");
    // Leído (o pasada la ventana), lo siguiente abre otro aviso.
    db.sqlite.prepare("update avisos set leido_at = ? where user_id = ?").run(new Date().toISOString(), DUENO);
    vi.setSystemTime(new Date(Date.now() + 60_000));
    await alEnlace("aprobacion", { postId: "p4", estado: "aprobado", revisor: "María" });
    expect(avisos().filter((x) => x.user_id === DUENO && !x.leido_at).map((x) => x.texto)).toEqual(["María aprobó «Cuatro»."]);
    vi.setSystemTime(new Date(Date.now() + VENTANA_RESPUESTAS_MS + 60_000));
    await alEnlace("aprobacion", { postId: "p1", estado: "aprobado", revisor: "María" });
    expect(avisos().filter((x) => x.user_id === DUENO && !x.leido_at)).toHaveLength(2);
  });

  it("«Enviar mi revisión» queda en la campana con quién y cuántas", async () => {
    await sembrar({ posts: [post(), post({ id: "p2", title: "Dos" }), post({ id: "p3", title: "Tres" })] });
    await alEnlace("aprobacion", { postId: "p1", estado: "aprobado", revisor: "María" });
    await alEnlace("aprobacion", { postId: "p2", estado: "cambios", comentario: "No", revisor: "María" });
    db.sqlite.prepare("delete from avisos").run();
    const r = await alEnlace("revision", { revisor: "María" });
    expect(r.status).toBe(200);
    expect(avisos().map((x) => [x.user_id, x.tipo, x.texto])).toEqual([
      [DUENO, "revision-cliente", "María terminó de revisar Octubre 2026 (Café Luna): aprobó 1, pidió cambios en 1 y dejó 1 sin revisar."],
      [ANA, "revision-cliente", "María terminó de revisar Octubre 2026 (Café Luna): aprobó 1, pidió cambios en 1 y dejó 1 sin revisar."],
    ]);
  });

  it("al abrir el enlace se apunta cuándo; con la sesión del equipo, no", async () => {
    await sembrar();
    await pedir(`/api/publico/${ENLACE}`, { headers: { Cookie: `${COOKIE}=${TESTIGO}` } });
    expect(db.sqlite.prepare("select cliente_abrio_at from calendars").get().cliente_abrio_at).toBeNull();
    await pedir(`/api/publico/${ENLACE}`);
    expect(db.sqlite.prepare("select cliente_abrio_at from calendars").get().cliente_abrio_at).toBe("2026-10-01T12:00:00.000Z");
    const cal = await (await conSesion("/api/espacio")).json();
    expect(cal.calendars[0].cliente_abrio_at).toBe("2026-10-01T12:00:00.000Z");
  });
});

describe("sacar a alguien del equipo no deja trabajo huérfano", () => {
  it("sus publicaciones y tareas pasan a quien lo saca, con un aviso; lo del cliente le llega al equipo si el responsable ya no está", async () => {
    await sembrar({ posts: [post({ responsableId: ANA }), post({ id: "p2", title: "Dos", revisorId: ANA }), post({ id: "p3", title: "Tres" })] });
    db.sqlite.prepare("insert into client_tasks (id, owner_id, client_id, title, status, asignado_id, assigned_to) values (?,?,?,?,?,?,?)")
      .run("t1", DUENO, "c1", "Grabar", "pending", ANA, "Ana");
    // Antes de sacarla: lo que el cliente responde en lo suyo le llega a Ana.
    expect(destinatariosDe([{ userId: DUENO }, { userId: ANA }], ANA)).toEqual([ANA]);
    const r = await conSesion(`/api/equipo/miembro/${ANA}`, { method: "DELETE" });
    expect(r.status).toBe(204);
    const [p1, p2, p3] = diasDe()[0].posts;
    expect([p1.responsableId, p2.revisorId, p3.responsableId]).toEqual([DUENO, DUENO, undefined]);
    expect({ ...db.sqlite.prepare("select asignado_id, assigned_to from client_tasks").get() }).toEqual({ asignado_id: DUENO, assigned_to: "Juan" });
    expect(avisos().map((x) => x.texto)).toEqual(["Al sacar a Ana del equipo pasaron a ti 2 publicaciones y 1 tarea que llevaba. Repártelas si hace falta."]);
    // Si quedara alguna con un responsable que ya no está, avisa a todo el equipo (antes, a nadie).
    expect(destinatariosDe([{ userId: DUENO }], ANA)).toEqual([DUENO]);
    expect(await reasignarTrabajoDe(env, acceso(), { userId: DUENO, a: { id: DUENO } })).toEqual({ publicaciones: 0, tareas: 0 });
  });

  it("textoDeRespuestas: una sola con título; varias, contadas", () => {
    expect(textoDeRespuestas({ quien: "Ana", n: 1, titulo: "X" })).toBe("Ana aprobó «X».");
    expect(textoDeRespuestas({ quien: "Ana", n: 3, c: 2, mes: "Octubre 2026" })).toBe("Ana aprobó 3 publicaciones y pidió cambios en 2 de Octubre 2026.");
    expect(textoDeRespuestas({ quien: "Ana", n: 0, c: 1, mes: "Octubre 2026", cliente: "Luna" })).toBe("Ana pidió cambios en 1 de Octubre 2026 (Luna).");
  });

  it("avisarRespuestaCliente nunca lanza (un calendario que no existe no hace nada)", async () => {
    await sembrar();
    await expect(avisarRespuestaCliente(env, acceso(), { calendarId: "no", postId: "p1", estado: "aprobado" })).resolves.toBeUndefined();
  });
});
