import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarTikTok, trozosDe } from "../../worker/lib/tiktok.js";
import { programar, procesarCola } from "../../worker/lib/publicador.js";
import { fotografiarCuenta } from "../../worker/lib/metricas.js";

// ============================================================
// TikTok, contra una D1 de verdad y una API de TikTok de mentira
//
// Lo que importa: que el video suba en trozos con sus Content-Range, que
// no se abra una segunda subida (sería un segundo video), que el token
// de 24 horas se renueve solo, y que el enlace del cliente deje la
// cuenta asignada a SU ficha y a nadie más.
// ============================================================

const DUENO = "u-jefe";
const TESTIGO = "testigo-de-sesion-de-prueba";
const VIDEO = "/api/media/clientes/c1/posts/v.mp4";
let db;
let env;
let llamadas;
let respuestas;

const MB = 1024 * 1024;
function r2(tamano) {
  return {
    async head(clave) { return clave === "clientes/c1/posts/v.mp4" ? { size: tamano } : null; },
    async get(clave, { range } = {}) {
      if (clave !== "clientes/c1/posts/v.mp4") return null;
      return { body: new Uint8Array(range?.length ?? tamano), httpMetadata: { contentType: "video/mp4" } };
    },
  };
}

const post = (extra = {}) => ({
  id: "p1", format: "reel", descripcion: "Receta de otoño", hashtagsFinales: "#cafe", publishTime: "10:00",
  redes: ["tiktok"], medios: [{ src: VIDEO, tipo: "video" }], ...extra,
});

async function sembrar({ expira = "2099-01-01T00:00:00.000Z", modo = "borrador", conCuenta = true } = {}) {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", DUENO, "Café Luna");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal1", "c1", DUENO, "Octubre", 9, 2026, JSON.stringify([{ date: "2026-10-05", posts: [post()] }]));
  if (conCuenta) {
    s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, usuario, token_cifrado, refresh_cifrado, expira, client_id, datos) values (?,?,?,?,?,?,?,?,?,?)")
      .run("tk", DUENO, "tiktok", "open-1", "cafeluna", await cifrarTikTok(env, "acceso-viejo"), await cifrarTikTok(env, "renovar-1"), expira, "c1", JSON.stringify({ modo }));
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, TIKTOK_CLIENT_KEY: "clave", TIKTOK_CLIENT_SECRET: "secreto", MEDIA: r2(10 * MB) };
  llamadas = [];
  const ok = (data) => ({ data, error: { code: "ok", message: "" } });
  respuestas = {
    "POST /v2/oauth/token/": (f) => (f.grant_type === "refresh_token"
      ? { access_token: "acceso-nuevo", refresh_token: "renovar-2", expires_in: 86400, open_id: "open-1" }
      : { access_token: "acceso-1", refresh_token: "renovar-1", expires_in: 86400, open_id: "open-9" }),
    "GET /v2/user/info/": ok({ user: { open_id: "open-9", display_name: "Café Luna", username: "cafeluna", follower_count: 3400, video_count: 50, likes_count: 90000 } }),
    "POST /v2/post/publish/inbox/video/init/": ok({ publish_id: "pub-1", upload_url: "https://open-upload.tiktokapis.com/subir/1" }),
    "POST /v2/post/publish/creator_info/query/": ok({ privacy_level_options: ["SELF_ONLY"] }),
    "POST /v2/post/publish/video/init/": ok({ publish_id: "pub-2", upload_url: "https://open-upload.tiktokapis.com/subir/2" }),
    "POST /v2/post/publish/status/fetch/": ok({ status: "SEND_TO_USER_INBOX" }),
    "PUT /subir/1": null,
    "PUT /subir/2": null,
    "POST /v2/video/list/": ok({ videos: [{ id: "v1", title: "Latte", create_time: 1759000000, share_url: "https://tiktok.com/@cafeluna/video/v1", like_count: 300, comment_count: 20, share_count: 15, view_count: 12000, cover_image_url: "https://p16-sign.tiktokcdn-us.com/x.jpg" }] }),
  };
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const metodo = init.method ?? "GET";
    let cuerpo = null;
    if (init.body instanceof URLSearchParams) cuerpo = Object.fromEntries(init.body);
    else if (typeof init.body === "string") cuerpo = JSON.parse(init.body);
    llamadas.push({ metodo, ruta: u.pathname, cuerpo, cabeceras: init.headers ?? {}, tamano: init.body?.length ?? init.body?.byteLength });
    const clave = `${metodo} ${u.pathname}`;
    if (!(clave in respuestas)) return new Response(JSON.stringify({ error: { code: "not_found", message: clave } }), { status: 404 });
    const r = typeof respuestas[clave] === "function" ? respuestas[clave](cuerpo) : respuestas[clave];
    if (r === null) return new Response(null, { status: 201 });
    if (r.__estado) return new Response(JSON.stringify(r.cuerpo), { status: r.__estado });
    return new Response(JSON.stringify(r), { status: 200 });
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const acceso = () => crearAcceso(db, DUENO);
const filas = () => db.sqlite.prepare("select * from publicaciones_programadas").all().map((f) => ({ ...f }));
const rutas = () => llamadas.map((l) => `${l.metodo} ${l.ruta}`);

describe("los trozos", () => {
  it("hasta 64 MB, uno; más, trozos de 20 MB y el último se lleva el resto", () => {
    expect(trozosDe(10 * MB)).toEqual({ chunk_size: 10 * MB, total_chunk_count: 1 });
    expect(trozosDe(150 * MB)).toEqual({ chunk_size: 20 * MB, total_chunk_count: 7 });
  });
});

describe("publicar en TikTok", () => {
  it("borrador: abre la subida, sube el video con su Content-Range y queda en la bandeja del cliente", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(rutas()).toEqual(["POST /v2/post/publish/inbox/video/init/", "PUT /subir/1"]);
    expect(llamadas[0].cuerpo.source_info).toEqual({ source: "FILE_UPLOAD", video_size: 10 * MB, chunk_size: 10 * MB, total_chunk_count: 1 });
    expect(llamadas[1].cabeceras["Content-Range"]).toBe(`bytes 0-${10 * MB - 1}/${10 * MB}`);
    expect(filas()[0]).toMatchObject({ estado: "procesando", contenedor_id: "pub-1" });

    vi.setSystemTime(new Date("2026-10-01T12:01:00.000Z"));
    await procesarCola(env);
    const [f] = filas();
    expect(f.estado).toBe("publicada");
    expect(JSON.parse(f.carga).aviso).toMatch(/bandeja de TikTok/);
    expect(rutas().filter((r) => r.endsWith("/init/"))).toHaveLength(1);
  });

  it("un video grande sube en varios trozos, cada uno con su rango", async () => {
    env.MEDIA = r2(45 * MB + 70 * MB);
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    const puts = llamadas.filter((l) => l.metodo === "PUT");
    expect(puts.map((l) => l.cabeceras["Content-Range"])).toEqual([
      `bytes 0-${20 * MB - 1}/${115 * MB}`,
      `bytes ${20 * MB}-${40 * MB - 1}/${115 * MB}`,
      `bytes ${40 * MB}-${60 * MB - 1}/${115 * MB}`,
      `bytes ${60 * MB}-${80 * MB - 1}/${115 * MB}`,
      `bytes ${80 * MB}-${115 * MB - 1}/${115 * MB}`,
    ]);
  });

  it("directo sin auditar: pregunta la privacidad, sale en «solo yo» y lo avisa", async () => {
    await sembrar({ modo: "directo" });
    respuestas["POST /v2/post/publish/status/fetch/"] = { data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [] }, error: { code: "ok" } };
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    const init = llamadas.find((l) => l.ruta === "/v2/post/publish/video/init/");
    expect(init.cuerpo.post_info).toMatchObject({ privacy_level: "SELF_ONLY", title: "Receta de otoño\n\n#cafe" });
    vi.setSystemTime(new Date("2026-10-01T12:01:00.000Z"));
    await procesarCola(env);
    expect(JSON.parse(filas()[0].carga).aviso).toMatch(/en privado/);
  });

  it("el token de 24 horas se renueva solo, y se guarda el nuevo", async () => {
    await sembrar({ expira: "2026-10-01T12:05:00.000Z" });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(rutas()[0]).toBe("POST /v2/oauth/token/");
    expect(llamadas[0].cuerpo).toMatchObject({ grant_type: "refresh_token", refresh_token: "renovar-1" });
    const init = llamadas.find((l) => l.ruta.endsWith("/inbox/video/init/"));
    expect(init.cabeceras.Authorization).toBe("Bearer acceso-nuevo");
    expect(db.sqlite.prepare("select expira from cuentas_sociales where id = 'tk'").get().expira).toBe("2026-10-02T12:00:00.000Z");
  });

  it("un video que no está en la app no se programa para TikTok", async () => {
    await sembrar();
    db.sqlite.prepare("update calendars set days = ?").run(JSON.stringify([{ date: "2026-10-05", posts: [post({ medios: [{ src: "https://otro.com/v.mp4", tipo: "video" }] })] }]));
    await expect(programar(env, acceso(), { calendarId: "cal1", postId: "p1" })).rejects.toThrow(/subido a la publicación/);
  });

  it("si TikTok lo rechaza, queda en error con el motivo y sin reintentar", async () => {
    await sembrar();
    respuestas["POST /v2/post/publish/inbox/video/init/"] = { __estado: 403, cuerpo: { error: { code: "spam_risk_too_many_posts", message: "x" } } };
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(filas()[0]).toMatchObject({ estado: "error", error: expect.stringMatching(/frenó las publicaciones/) });
  });
});

describe("conectar", () => {
  const conSesion = (ruta, opciones = {}) => new Request(`https://calendarios.test${ruta}`, {
    ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
  });

  async function vuelta(res) {
    const destino = new URL(res.headers.get("Location"));
    const cookie = res.headers.get("Set-Cookie").split(";")[0];
    return worker.fetch(new Request(`https://calendarios.test/api/redes/tiktok/callback?code=c&state=${encodeURIComponent(destino.searchParams.get("state"))}`, {
      headers: { Cookie: cookie },
    }), env, {});
  }

  it("aquí: TikTok con los permisos, y la vuelta deja la cuenta asignada al cliente", async () => {
    await sembrar({ conCuenta: false });
    const res = await worker.fetch(conSesion("/api/redes/tiktok/conectar?cliente=c1"), env, {});
    expect(res.status).toBe(302);
    const destino = new URL(res.headers.get("Location"));
    expect(destino.host).toBe("www.tiktok.com");
    expect(destino.searchParams.get("scope")).toMatch(/video\.upload/);
    const fin = await vuelta(res);
    expect(fin.headers.get("Location")).toMatch(/\/ajustes\?tiktok=ok/);
    expect(db.sqlite.prepare("select client_id, usuario from cuentas_sociales where red = 'tiktok'").get()).toEqual({ client_id: "c1", usuario: "cafeluna" });
  });

  it("con el enlace del cliente, sin sesión, y vuelve a una página suya", async () => {
    await sembrar({ conCuenta: false });
    const { url } = await (await worker.fetch(conSesion("/api/redes/tiktok/enlace", { method: "POST", body: JSON.stringify({ clientId: "c1" }) }), env, {})).json();
    const inicio = await worker.fetch(new Request(url), env, {});
    expect(inicio.status).toBe(302);
    const fin = await vuelta(inicio);
    expect(fin.headers.get("Location")).toMatch(/\/tiktok-conectado\.html/);
    expect(db.sqlite.prepare("select client_id from cuentas_sociales where red = 'tiktok'").get().client_id).toBe("c1");
  });

  it("la vuelta sin la cookie del navegador que empezó se rechaza", async () => {
    await sembrar({ conCuenta: false });
    const res = await worker.fetch(conSesion("/api/redes/tiktok/conectar?cliente=c1"), env, {});
    const state = new URL(res.headers.get("Location")).searchParams.get("state");
    const fin = await worker.fetch(new Request(`https://calendarios.test/api/redes/tiktok/callback?code=c&state=${encodeURIComponent(state)}`), env, {});
    expect(fin.headers.get("Location")).toMatch(/tiktok=error/);
    expect(db.sqlite.prepare("select count(*) n from cuentas_sociales").get().n).toBe(0);
  });

  it("un enlace manipulado no abre nada", async () => {
    const r = await worker.fetch(new Request("https://calendarios.test/api/redes/tiktok/inicio/abc.def"), env, {});
    expect(r.headers.get("Location")).toMatch(/tiktok-error\.html/);
  });

  it("el modo de publicar se cambia por cuenta", async () => {
    await sembrar();
    const r = await worker.fetch(conSesion("/api/redes/cuentas/tk", { method: "PUT", body: JSON.stringify({ modo: "directo" }) }), env, {});
    expect((await r.json()).modo).toBe("directo");
  });
});

describe("medir", () => {
  it("seguidores y cada video con sus vistas e interacciones", async () => {
    await sembrar();
    vi.setSystemTime(new Date("2025-10-01T12:00:00.000Z"));
    const cuenta = db.sqlite.prepare("select * from cuentas_sociales where id = 'tk'").get();
    await fotografiarCuenta(env, acceso(), { ...cuenta }, "2025-09-30");
    expect(db.sqlite.prepare("select seguidores from metricas_cuenta").get().seguidores).toBe(3400);
    expect(db.sqlite.prepare("select vistas, interacciones, tipo from metricas_publicacion").get()).toEqual({ vistas: 12000, interacciones: 335, tipo: "video" });
  });
});
