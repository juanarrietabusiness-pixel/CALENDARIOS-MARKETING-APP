import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import {
  correrCron, siguienteEstado, minutosDeSalto, esFalloDeSaldo, estadoDeIntegracion, anotar, volcarSalud, olvidarSalud,
  limitesVencidosPendiente, sinRespuestaDelCliente, seguido, SALTAR_TRAS,
} from "../../worker/lib/salud.js";
import { barrerRendersVencidos } from "../../worker/lib/estudio/render.js";
import { errorDeKie } from "../../worker/lib/estudio/kie.js";
import { errorDeElevenLabs } from "../../worker/lib/estudio/elevenlabs.js";
import { RechazoAnthropic, mensajeDeRechazo } from "../../worker/lib/anthropic.js";

// ============================================================
// Que nada falle en silencio (worker/lib/salud.js)
//
// El cron en cascada ya no se apaga por una tarea que falla siempre, los proveedores apuntan su salud donde ya se
// llaman, un saldo que se acaba avisa una vez al día, los renders muertos y las fechas límite vencidas avisan sin que
// nadie los mire, y Ajustes → Salud lo enseña. Con la D1 de verdad.
// ============================================================

const JEFE = "u-jefe";
const ANA = "u-ana";
const OTRO = "u-otro";
const TESTIGO = { [JEFE]: "t-jefe", [ANA]: "t-ana", [OTRO]: "t-otro" };
let db;
let env;

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [ANA, "ana@a.com"], [OTRO, "otro@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(ANA, JEFE, "editor", "Ana", "#1E90FF");
  // Otra agencia, con su propio administrador.
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRO, OTRO, "admin", "Otro", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
}

const pedir = (quien, ruta) => worker.fetch(new Request(`https://calendario.test/api${ruta}`, {
  headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}` },
}), env);
const avisos = (quien, tipo) => db.sqlite.prepare("select tipo, texto, enlace from avisos where user_id = ? and tipo = ? order by created_at").all(quien, tipo);
const fila = (id) => db.sqlite.prepare("select * from salud where id = ?").get(id);
const minuto = (iso) => new Date(iso);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T15:00:00.000Z"));
  olvidarSalud();
  db = d1EnMemoria();
  env = { DB: db, ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("el estado de una tarea", () => {
  it("salta tras 3 fallos seguidos, cada vez más rato, y avisa una vez pasada media hora", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 9].map(minutosDeSalto)).toEqual([0, 0, 5, 10, 20, 40, 60, 60]);
    let f = null;
    const t0 = Date.parse("2026-11-15T15:00:00.000Z");
    const en = (min) => new Date(t0 + min * 60_000).toISOString();
    for (let i = 0; i < SALTAR_TRAS; i++) {
      const r = siguienteEstado(f, { id: "metricas", fallo: new Error("D1 caída") }, en(i));
      expect(r.escribir).toBe(true);
      expect(r.avisar).toBe(false);
      f = r.fila;
    }
    expect(f).toMatchObject({ id: "tarea:metricas", fallos: 3, desde: en(0), error: "D1 caída", saltar_hasta: en(2 + 5) });
    const tarde = siguienteEstado(f, { id: "metricas", fallo: new Error("D1 caída") }, en(31));
    expect(tarde.avisar).toBe(true);
    expect(siguienteEstado(tarde.fila, { id: "metricas", fallo: new Error("otra") }, en(80)).avisar).toBe(false);
    // Vuelve a ir bien: todo se limpia y se escribe.
    const bien = siguienteEstado(tarde.fila, { id: "metricas", trabajo: true }, en(90));
    expect(bien.escribir).toBe(true);
    expect(bien.fila).toMatchObject({ fallos: 0, desde: null, saltar_hasta: null, avisado_at: null, ok_at: en(90), trabajo_at: en(90) });
    // Sigue bien: no se escribe hasta el latido (15 minutos).
    expect(siguienteEstado(bien.fila, { id: "metricas" }, en(95)).escribir).toBe(false);
    expect(siguienteEstado(bien.fila, { id: "metricas" }, en(106)).escribir).toBe(true);
  });

  it("reconoce un fallo de SALDO de cada proveedor, y no un tope por minuto", () => {
    expect(esFalloDeSaldo(errorDeKie(402, "credits insufficient"))).toBe(true);
    expect(esFalloDeSaldo(errorDeElevenLabs(401, "quota_exceeded: This request exceeds your quota"))).toBe(true);
    expect(esFalloDeSaldo({ message: "Google AI devolvió un error (402): Your prepayment credits are depleted." })).toBe(true);
    expect(esFalloDeSaldo({ message: mensajeDeRechazo(new RechazoAnthropic(400, "invalid_request_error", "Your credit balance is too low")) })).toBe(true);
    expect(esFalloDeSaldo({ message: "Scrape Creators: sin créditos", estado: 402 })).toBe(true);
    expect(esFalloDeSaldo(errorDeKie(429))).toBe(false);
    expect(esFalloDeSaldo({ message: "Google AI está saturado. Inténtalo en unos segundos.", estado: 429 })).toBe(false);
    expect(esFalloDeSaldo(errorDeKie(401))).toBe(false);
    expect(estadoDeIntegracion({ configurado: false })).toBe("sin-configurar");
    expect(estadoDeIntegracion({ okAt: "2026-11-15T10:00:00Z", errorAt: "2026-11-15T11:00:00Z", saldoAt: "2026-11-15T11:00:00Z" })).toBe("sin-saldo");
    expect(estadoDeIntegracion({ okAt: "2026-11-15T12:00:00Z", errorAt: "2026-11-15T11:00:00Z" })).toBe("bien");
  });
});

describe("el cron en cascada", () => {
  it("una tarea que falla para la vuelta, a los 3 fallos se SALTA y lo de abajo corre; a la media hora avisa al administrador", async () => {
    const corridas = [];
    const pasos = [
      ["cola", async () => { corridas.push("cola"); return 0; }],
      ["metricas", async () => { corridas.push("metricas"); throw new Error("Meta no contesta"); }],
      ["informes", async () => { corridas.push("informes"); return 0; }],
    ];
    for (let i = 0; i < SALTAR_TRAS; i++) {
      expect(await correrCron(env, pasos)).toBe("metricas");
      vi.setSystemTime(new Date(Date.now() + 60_000));
    }
    expect(corridas).toEqual(["cola", "metricas", "cola", "metricas", "cola", "metricas"]);
    expect(fila("tarea:metricas")).toMatchObject({ fallos: 3, error: "Meta no contesta", tipo: "tarea", espacio: "" });
    expect(fila("tarea:informes")).toBeUndefined();

    corridas.length = 0;
    expect(await correrCron(env, pasos)).toBeNull();
    expect(corridas).toEqual(["cola", "informes"]);
    expect(fila("tarea:informes").ok_at).toBeTruthy();

    // Pasado el salto se intenta otra vez; sigue fallando y, con más de media hora, avisa UNA vez a cada administrador.
    for (let i = 0; i < 6; i++) {
      vi.setSystemTime(new Date(Date.now() + 41 * 60_000));
      await correrCron(env, pasos);
    }
    expect(avisos(JEFE, "salud")).toHaveLength(1);
    expect(avisos(JEFE, "salud")[0].texto).toMatch(/«Métricas del día» lleva más de 30 minutos fallando .*Meta no contesta/);
    expect(avisos(OTRO, "salud")).toHaveLength(1);
    expect(avisos(ANA, "salud")).toHaveLength(0);

    // Vuelve a ir bien: la tarea se limpia.
    pasos[1][1] = async () => 0;
    vi.setSystemTime(new Date(Date.now() + 61 * 60_000));
    await correrCron(env, pasos);
    expect(fila("tarea:metricas")).toMatchObject({ fallos: 0, saltar_hasta: null });
  });

  it("una tarea con trabajo para la vuelta, como antes", async () => {
    const corridas = [];
    await correrCron(env, [["cola", async () => { corridas.push("cola"); return 1; }], ["metricas", async () => { corridas.push("metricas"); return 0; }]]);
    expect(corridas).toEqual(["cola"]);
    expect(fila("tarea:cola").trabajo_at).toBeTruthy();
  });

  it("sigue bien sin escribir cada minuto (una lectura por vuelta)", async () => {
    const pasos = [["cola", async () => 0]];
    await correrCron(env, pasos);
    const antes = fila("tarea:cola").updated_at;
    const espia = vi.spyOn(db, "prepare");
    vi.setSystemTime(new Date(Date.now() + 60_000));
    await correrCron(env, pasos);
    expect(fila("tarea:cola").updated_at).toBe(antes);
    expect(espia.mock.calls.filter(([sql]) => /insert into salud/.test(sql))).toHaveLength(0);
  });
});

describe("los proveedores", () => {
  it("se apuntan en memoria y se vuelcan sólo al cambiar; un saldo que se acaba avisa UNA vez al día a cada administrador", async () => {
    anotar("kie");
    expect(await volcarSalud(env)).toBe(1);
    expect(fila("proveedor:kie")).toMatchObject({ tipo: "proveedor", espacio: "", error: "" });
    expect(await volcarSalud(env)).toBe(0);
    anotar("kie");
    expect(await volcarSalud(env)).toBe(0);

    await expect(seguido("kie", async () => { throw errorDeKie(402, "Credits insufficient"); })).rejects.toThrow(/créditos/);
    await volcarSalud(env);
    const k = fila("proveedor:kie");
    expect(k.error).toMatch(/Kie\.ai no tiene créditos/);
    expect(k.saldo_at).toBe(k.error_at);
    expect(avisos(JEFE, "saldo")).toHaveLength(1);
    expect(avisos(JEFE, "saldo")[0].texto).toMatch(/^Se acabó el saldo de Kie\.ai: .*kie\.ai/);
    expect(avisos(OTRO, "saldo")).toHaveLength(1);

    // Otra vez hoy, incluso desde otra instancia (sin memoria): no se repite.
    anotar("kie", errorDeKie(402, "otra vez"));
    await volcarSalud(env);
    olvidarSalud();
    anotar("kie", errorDeKie(402, "y otra"));
    await volcarSalud(env);
    expect(avisos(JEFE, "saldo")).toHaveLength(1);

    // Al día siguiente, sí.
    vi.setSystemTime(new Date("2026-11-16T15:00:00.000Z"));
    olvidarSalud();
    anotar("kie", errorDeKie(402, "mañana"));
    await volcarSalud(env);
    expect(avisos(JEFE, "saldo")).toHaveLength(2);
  });

  it("ignora lo que no dice nada de la cuenta (el filtro de contenido) y apunta Drive en su espacio", async () => {
    await expect(seguido("google", async () => { throw Object.assign(new Error("filtro"), { estado: 422 }); }, { ignorar: (e) => e.estado === 422 })).rejects.toThrow();
    anotar("drive", "Drive respondió 401 (/drive/v3/files).", { espacio: JEFE });
    await volcarSalud(env);
    expect(fila("proveedor:google")).toBeUndefined();
    expect(fila(`${JEFE}|drive`)).toMatchObject({ tipo: "integracion", espacio: JEFE });
  });
});

describe("lo que se queda colgado", () => {
  function sembrarRender({ porId = ANA, origen = {}, minutosAtras = 20, post = null } = {}) {
    const pedidoAt = new Date(Date.now() - minutosAtras * 60_000).toISOString();
    db.sqlite.prepare("insert into calendars (id, owner_id, client_id, name, month, year, days) values (?,?,?,?,?,?,?)")
      .run("cal1", JEFE, "c1", "Noviembre 2026", 10, 2026, JSON.stringify(post ? [{ date: "2026-11-20", posts: [post] }] : []));
    db.sqlite.prepare(`insert into videos_proyectos (id, owner_id, client_id, calendar_id, post_id, titulo, estado, render, origen, updated_at)
      values (?,?,?,?,?,?,?,?,?,?)`).run("v1", JEFE, "c1", post ? "cal1" : null, post?.id ?? null, "Reel de la foto", "renderizando",
      JSON.stringify({ estado: "en_curso", intento: "i1", pedidoAt, porId }), JSON.stringify(origen), pedidoAt);
  }

  it("un render muerto se da por fallido SIN que nadie lo lea y avisa a quien lo pidió; la foto con música deja de «hacerse»", async () => {
    sembrarRender({ origen: { tipo: "foto", foto: "/api/media/clientes/c1/f.jpg" }, post: { id: "p1", format: "post", status: "pending", conMusicaPendiente: { videoId: "v1", foto: "/api/media/clientes/c1/f.jpg" } } });
    // Fuera de su minuto no mira nada.
    expect(await barrerRendersVencidos(env, minuto("2026-11-15T15:00:00.000Z"))).toBe(0);
    expect(await barrerRendersVencidos(env, minuto("2026-11-15T15:03:00.000Z"))).toBe(1);
    const v = db.sqlite.prepare("select estado, render from videos_proyectos where id = 'v1'").get();
    expect(v.estado).toBe("fallido");
    expect(JSON.parse(v.render).error).toMatch(/no terminó a tiempo/);
    expect(avisos(ANA, "render-fallo")).toHaveLength(1);
    const post = JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal1'").get().days)[0].posts[0];
    expect(post.conMusicaPendiente).toBeUndefined();
    // La segunda vez no hay nada.
    expect(await barrerRendersVencidos(env, minuto("2026-11-15T15:08:00.000Z"))).toBe(0);
  });

  it("un render que aún está en su plazo no se toca", async () => {
    sembrarRender({ minutosAtras: 5 });
    expect(await barrerRendersVencidos(env, minuto("2026-11-15T15:03:00.000Z"))).toBe(0);
    expect(db.sqlite.prepare("select estado from videos_proyectos where id = 'v1'").get().estado).toBe("renderizando");
  });

  function sembrarMes({ limite = "2026-11-14", revision = null, posts }) {
    db.sqlite.prepare("insert into calendars (id, owner_id, client_id, name, month, year, days, share_token, opciones, revision_enviada) values (?,?,?,?,?,?,?,?,?,?)")
      .run("cal2", JEFE, "c1", "Diciembre 2026", 11, 2026, JSON.stringify([{ date: "2026-12-02", posts }]), "tok-1",
        JSON.stringify({ fechaLimite: limite }), revision);
  }

  it("la fecha límite que vence sin respuesta avisa UNA vez a la agencia", async () => {
    sembrarMes({ posts: [{ id: "a", status: "pending" }, { id: "b", status: "pending" }, { id: "c", status: "published" }] });
    db.sqlite.prepare("insert into approvals (id, calendar_id, post_id, estado) values (?,?,?,?)").run("ap1", "cal2", "a", "aprobado");
    expect(await limitesVencidosPendiente(env, minuto("2026-11-15T15:00:00.000Z"))).toBe(0);
    expect(await limitesVencidosPendiente(env, minuto("2026-11-15T15:01:00.000Z"))).toBe(1);
    expect(avisos(ANA, "limite")).toEqual([{
      tipo: "limite", enlace: "/cliente/c1/cal2",
      texto: "Venció la fecha para que Dcasa revise Diciembre 2026 (2026-11-14): 1 publicación sigue sin respuesta.",
    }]);
    expect(avisos(JEFE, "limite")).toHaveLength(1);
    expect(await limitesVencidosPendiente(env, minuto("2026-11-15T15:06:00.000Z"))).toBe(0);
    expect(avisos(ANA, "limite")).toHaveLength(1);
  });

  it("no avisa si el cliente mandó su revisión, si la fecha no ha pasado o si ya respondió todo", async () => {
    sembrarMes({ revision: "2026-11-13T10:00:00Z", posts: [{ id: "a", status: "pending" }] });
    expect(await limitesVencidosPendiente(env, minuto("2026-11-15T15:01:00.000Z"))).toBe(0);
    db.sqlite.prepare("update calendars set revision_enviada = null, opciones = ? where id = 'cal2'").run(JSON.stringify({ fechaLimite: "2026-11-15" }));
    expect(await limitesVencidosPendiente(env, minuto("2026-11-15T15:01:00.000Z"))).toBe(0);
    expect(sinRespuestaDelCliente([{ posts: [{ id: "a" }, { id: "b", status: "published" }] }], new Set(["a"]))).toBe(0);
    expect(sinRespuestaDelCliente([{ posts: [{ id: "a", status: "pending", etapa: "idea" }] }], new Set(), true)).toBe(0);
  });
});

describe("Ajustes → Salud", () => {
  it("el administrador ve las tareas, los proveedores y las integraciones de SU espacio; los demás, no", async () => {
    expect((await pedir(ANA, "/salud")).status).toBe(403);
    await correrCron(env, [["cola", async () => 0]]);
    anotar("kie", errorDeKie(402, "sin créditos"));
    anotar("drive", "Drive respondió 401.", { espacio: OTRO });
    db.sqlite.prepare("insert into publicaciones_programadas (id, owner_id, client_id, post_id, red, programada_para, estado, error, updated_at) values (?,?,?,?,?,?,?,?,?)")
      .run("q1", JEFE, "c1", "p1", "instagram", "2026-11-15T14:00:00Z", "error", "El token de la página caducó.", "2026-11-15T14:01:00.000Z");
    const r = await pedir(JEFE, "/salud");
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.cronParado).toBe(false);
    expect(d.tareas.find((t) => t.id === "cola")).toMatchObject({ estado: "bien", nombre: "Publicar lo programado" });
    expect(d.tareas.find((t) => t.id === "metricas").estado).toBe("sin-datos");
    expect(d.proveedores.find((p) => p.id === "kie")).toMatchObject({ estado: "sin-configurar", leeSaldo: true });
    expect(d.integraciones.find((i) => i.id === "meta-publicar")).toMatchObject({ error: "instagram: El token de la página caducó." });
    // El Drive de OTRO espacio no sale aquí.
    expect(d.integraciones.find((i) => i.id === "drive")).toMatchObject({ okAt: null, errorAt: null, estado: "sin-configurar" });

    env.KIE_API_KEY = "k";
    const conLlave = await (await pedir(JEFE, "/salud")).json();
    expect(conLlave.proveedores.find((p) => p.id === "kie").estado).toBe("sin-saldo");

    vi.setSystemTime(new Date(Date.now() + 2 * 3600_000));
    expect((await (await pedir(JEFE, "/salud")).json()).cronParado).toBe(true);
  });

  it("los saldos que se leen gratis: Kie y ElevenLabs (sin gastar nada)", async () => {
    env.KIE_API_KEY = "k";
    env.ELEVENLABS_API_KEY = "e";
    const urls = [];
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      urls.push(String(url));
      if (/kie/.test(url)) return Response.json({ code: 200, data: 340 });
      return Response.json({ character_count: 95_000, character_limit: 100_000, next_character_count_reset_unix: 1_765_000_000 });
    }));
    const { saldos } = await (await pedir(JEFE, "/salud/saldos?otraVez=1")).json();
    expect(urls.some((u) => /\/api\/v1\/chat\/credit$/.test(u))).toBe(true);
    expect(urls.some((u) => /\/v1\/user\/subscription$/.test(u))).toBe(true);
    expect(saldos.kie).toMatchObject({ valor: 340, bajo: false });
    expect(saldos.elevenlabs).toMatchObject({ valor: 5000, bajo: true });
    expect(saldos.elevenlabs.texto).toMatch(/^Quedan 5.000 de 100.000 créditos; se renuevan el /);
  });
});
