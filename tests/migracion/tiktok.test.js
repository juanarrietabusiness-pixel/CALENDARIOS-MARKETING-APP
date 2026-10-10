import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso, cuentasSinFoto } from "../../worker/lib/acceso.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { programar, procesarCola } from "../../worker/lib/publicador.js";
import { cuerpoPublicacion, leerPublicacion, firmaWebhook } from "../../worker/lib/postpeer.js";

// ============================================================
// TikTok por PostPeer, contra una D1 de verdad y un PostPeer de mentira
//
// Lo que importa: que salga PÚBLICO y en el acto (draft: false,
// publishNow), que nunca se mande dos veces la misma publicación (gasta
// créditos y saldría repetida en el perfil), que lo que la cuenta no deja
// se diga ANTES de gastar, que la llave no se vea en ningún sitio, y que
// el webhook sólo valga con su firma.
//
// Nada de esto se ha probado contra PostPeer real: el `fetch` contesta
// con la forma de su documentación.
// ============================================================

const DUENO = "u-jefe";
const TESTIGO = "testigo-de-sesion-de-prueba";
const LLAVE = "pp_llave_secreta_123";
const VIDEO = "/api/media/clientes/c1/posts/v.mp4";
let db;
let env;
let llamadas;
let respuestas;

const post = (extra = {}) => ({
  id: "p1", format: "reel", descripcion: "Receta de otoño", hashtagsFinales: "#cafe", publishTime: "10:00",
  redes: ["tiktok"], medios: [{ src: VIDEO, tipo: "video", duracion: 20 }], ...extra,
});

const datosPostPeer = (extra = {}) => JSON.stringify({ via: "postpeer", profileId: "perfil-1", origen: "https://calendario.test", ...extra });

async function sembrar({ cuenta = "postpeer", posts = [post()] } = {}) {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", DUENO, "Dcasa");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal1", "c1", DUENO, "Octubre", 9, 2026, JSON.stringify([{ date: "2026-10-05", posts }]));
  if (cuenta === "postpeer") {
    s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, usuario, client_id, datos) values (?,?,?,?,?,?,?)")
      .run("tk", DUENO, "tiktok", "acc-1", "dcasa", "c1", datosPostPeer());
  } else if (cuenta === "anterior") {
    s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, usuario, token_cifrado, client_id, datos) values (?,?,?,?,?,?,?,?)")
      .run("tk", DUENO, "tiktok", "open-1", "dcasa", "cifrado", "c1", JSON.stringify({ modo: "borrador" }));
  }
}

const CREADOR = { privacyLevelOptions: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"], commentDisabled: false, duetDisabled: true, stitchDisabled: false, maxVideoPostDurationSec: 600 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
  db = d1EnMemoria();
  env = {
    DB: db, POSTPEER_API_KEY: LLAVE, META_APP_SECRET: "meta",
    MEDIA: { async head(clave) { return clave === "clientes/c1/posts/v.mp4" ? { size: 1000 } : null; } },
  };
  llamadas = [];
  respuestas = {
    "GET /v1/health/auth": { success: true },
    "GET /v1/tiktok/creator-info": { data: CREADOR },
    "POST /v1/posts": { postId: "pp-1", status: "processing", platforms: [{ platform: "tiktok", status: "processing" }] },
    "GET /v1/posts/pp-1": { post: { id: "pp-1", status: "published" }, platforms: [{ platform: "tiktok", status: "published", platformPostUrl: "https://www.tiktok.com/@dcasa/video/777" }] },
    "POST /v1/profiles": { profile: { id: "perfil-9" } },
    "GET /v1/connect/tiktok": { url: "https://www.tiktok.com/v2/auth/authorize/?client_key=postpeer" },
    "GET /v1/connect/integrations": { integrations: [{ id: "acc-9", platform: "tiktok", username: "dcasa.pa", name: "Dcasa" }] },
  };
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const metodo = init.method ?? "GET";
    const cuerpo = typeof init.body === "string" ? JSON.parse(init.body) : null;
    llamadas.push({ metodo, ruta: u.pathname, params: Object.fromEntries(u.searchParams), cuerpo, cabeceras: init.headers ?? {} });
    const clave = `${metodo} ${u.pathname}`;
    if (!(clave in respuestas)) return new Response(JSON.stringify({ error: `no existe ${clave}` }), { status: 404 });
    const r = typeof respuestas[clave] === "function" ? respuestas[clave](cuerpo) : respuestas[clave];
    if (r instanceof Error) throw r;
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
const envios = () => llamadas.filter((l) => l.metodo === "POST" && l.ruta === "/v1/posts");
const conSesion = (ruta, opciones = {}) => new Request(`https://calendario.test${ruta}`, {
  ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
});

describe("el cuerpo que se manda", () => {
  it("público, en el acto, sin borrador, con el video por su dirección", () => {
    expect(cuerpoPublicacion({ texto: "Hola #x", accountId: "acc-1", urlVideo: "https://a.test/v.mp4", info: { sinDuo: true } })).toEqual({
      content: "Hola #x",
      platforms: [{
        platform: "tiktok", accountId: "acc-1",
        platformSpecificData: { privacyLevel: "PUBLIC_TO_EVERYONE", disableComment: false, disableDuet: true, disableStitch: false, draft: false },
      }],
      mediaItems: [{ type: "video", url: "https://a.test/v.mp4" }],
      publishNow: true,
    });
  });

  it("lee el estado de la plataforma por encima del del post, venga el sobre que venga", () => {
    expect(leerPublicacion({ data: { post: { id: "x", status: "partial" }, platforms: [{ platform: "tiktok", status: "failed", errorMessage: "Video muy corto" }] } }))
      .toMatchObject({ postId: "x", estado: "fallida", error: "Video muy corto" });
    expect(leerPublicacion({ postId: "y", status: "published" })).toMatchObject({ postId: "y", estado: "publicada" });
    expect(leerPublicacion({ id: "z", status: "scheduled" })).toMatchObject({ postId: "z", estado: "en-curso" });
  });
});

describe("publicar en TikTok por PostPeer", () => {
  it("pregunta a la cuenta, manda una vez y queda publicada con su enlace", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(rutas()).toEqual(["GET /v1/tiktok/creator-info", "POST /v1/posts"]);
    expect(llamadas[0].params).toEqual({ accountId: "acc-1" });
    for (const l of llamadas) expect(l.cabeceras["x-access-key"]).toBe(LLAVE);
    const [envio] = envios();
    expect(envio.cuerpo).toMatchObject({
      content: "Receta de otoño\n\n#cafe", publishNow: true,
      platforms: [{ platform: "tiktok", accountId: "acc-1", platformSpecificData: { privacyLevel: "PUBLIC_TO_EVERYONE", draft: false, disableDuet: true } }],
    });
    expect(envio.cuerpo.mediaItems[0].url).toMatch(/^https:\/\/calendario\.test\/api\/medio-publico\/[^/]+\/v\.mp4$/);
    expect(filas()[0]).toMatchObject({ estado: "procesando", contenedor_id: "pp-1" });

    vi.setSystemTime(new Date("2026-10-01T12:01:00.000Z"));
    await procesarCola(env);
    expect(filas()[0]).toMatchObject({ estado: "publicada", externo_id: "pp-1", enlace: "https://www.tiktok.com/@dcasa/video/777" });
    expect(envios()).toHaveLength(1);
  });

  it("si PostPeer contesta ya publicada, queda publicada sin preguntar más", async () => {
    await sembrar();
    respuestas["POST /v1/posts"] = { postId: "pp-1", status: "published", platforms: [{ platform: "tiktok", status: "published", platformPostUrl: "https://www.tiktok.com/@dcasa/video/1" }] };
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(filas()[0]).toMatchObject({ estado: "publicada", enlace: "https://www.tiktok.com/@dcasa/video/1" });
    expect(rutas()).not.toContain("GET /v1/posts/pp-1");
  });

  it("si TikTok la deja con otra privacidad, lo avisa", async () => {
    await sembrar();
    respuestas["GET /v1/posts/pp-1"] = { post: { id: "pp-1", status: "published" }, platforms: [{ platform: "tiktok", status: "published", privacyLevel: "SELF_ONLY" }] };
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    vi.setSystemTime(new Date("2026-10-01T12:01:00.000Z"));
    await procesarCola(env);
    expect(JSON.parse(filas()[0].carga).aviso).toMatch(/«SELF_ONLY», no pública/);
  });

  it("una cuenta que no deja publicar en público falla ANTES de gastar un crédito", async () => {
    await sembrar();
    respuestas["GET /v1/tiktok/creator-info"] = { data: { ...CREADOR, privacyLevelOptions: ["SELF_ONLY"] } };
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(filas()[0]).toMatchObject({ estado: "error", error: expect.stringMatching(/no deja publicar en público/) });
    expect(envios()).toHaveLength(0);
  });

  it("un video más largo de lo que admite la cuenta, tampoco", async () => {
    await sembrar({ posts: [post({ medios: [{ src: VIDEO, tipo: "video", duracion: 900 }] })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(filas()[0].error).toMatch(/dura 900 s.*hasta 600 s/);
    expect(envios()).toHaveLength(0);
  });

  it("sin respuesta al mandarla no se vuelve a mandar sola; «Reintentar» (una persona) sí", async () => {
    await sembrar();
    respuestas["POST /v1/posts"] = new TypeError("network down");
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(filas()[0]).toMatchObject({ estado: "error", error: expect.stringMatching(/no se sabe si la recibió/) });
    vi.setSystemTime(new Date("2026-10-01T13:00:00.000Z"));
    await procesarCola(env);
    expect(envios()).toHaveLength(1);

    respuestas["POST /v1/posts"] = { postId: "pp-1", status: "processing" };
    const r = await worker.fetch(conSesion(`/api/publicar/${filas()[0].id}/reintentar`, { method: "POST" }), env, {});
    expect(r.status).toBe(200);
    expect(envios()).toHaveLength(2);
    expect(filas()[0]).toMatchObject({ estado: "procesando", contenedor_id: "pp-1" });
  });

  it("un rechazo claro de PostPeer queda en error con su motivo, y la llave no aparece en él", async () => {
    await sembrar();
    respuestas["POST /v1/posts"] = { __estado: 400, cuerpo: { error: "Invalid media URL" } };
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(filas()[0]).toMatchObject({ estado: "error", error: "PostPeer: Invalid media URL" });
    expect(JSON.stringify(filas())).not.toContain(LLAVE);
  });

  it("si PostPeer dice que falló, queda en error con lo que dijo", async () => {
    await sembrar();
    respuestas["GET /v1/posts/pp-1"] = { post: { id: "pp-1", status: "failed" }, platforms: [{ platform: "tiktok", status: "failed", errorMessage: "Video too short" }] };
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    vi.setSystemTime(new Date("2026-10-01T12:01:00.000Z"));
    await procesarCola(env);
    expect(filas()[0]).toMatchObject({ estado: "error", error: expect.stringMatching(/Video too short/) });
    expect(envios()).toHaveLength(1);
  });

  it("si nunca termina, a los 30 minutos queda en error sin mandar otra", async () => {
    await sembrar();
    respuestas["GET /v1/posts/pp-1"] = { post: { id: "pp-1", status: "processing" } };
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    vi.setSystemTime(new Date("2026-10-01T12:10:00.000Z"));
    await procesarCola(env);
    expect(filas()[0].estado).toBe("procesando");
    vi.setSystemTime(new Date("2026-10-01T12:31:00.000Z"));
    await procesarCola(env);
    expect(filas()[0]).toMatchObject({ estado: "error", error: expect.stringMatching(/más de 30 minutos.*processing/s) });
    expect(envios()).toHaveLength(1);
  });

  it("un TikTok de la app anterior no se programa: hay que conectarlo con PostPeer", async () => {
    await sembrar({ cuenta: "anterior" });
    await expect(programar(env, acceso(), { calendarId: "cal1", postId: "p1" })).rejects.toThrow(/app anterior.*PostPeer/);
  });

  it("…ni bloquea las demás redes del cliente: sin redes elegidas, sale en las que sí publican", async () => {
    await sembrar({ cuenta: "anterior", posts: [post({ redes: undefined })] });
    db.sqlite.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, token_cifrado, client_id) values (?,?,?,?,?,?)")
      .run("ig", DUENO, "instagram", "ig-1", "cifrado", "c1");
    db.sqlite.prepare("insert into integracion_meta (id, owner_id, usuario_meta, token_cifrado) values (?,?,?,?)").run(DUENO, DUENO, "m", "cifrado");
    const nuevas = await programar(env, acceso(), { calendarId: "cal1", postId: "p1" });
    expect(nuevas.map((f) => f.red)).toEqual(["instagram"]);
  });

  it("sin video no se programa para TikTok", async () => {
    await sembrar({ posts: [post({ format: "carrusel", medios: [{ src: "/api/media/clientes/c1/posts/a.jpg" }] })] });
    await expect(programar(env, acceso(), { calendarId: "cal1", postId: "p1" })).rejects.toThrow(/TikTok necesita un video/);
  });

  it("sin la llave en el Worker, error que dice qué falta", async () => {
    await sembrar();
    delete env.POSTPEER_API_KEY;
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(filas()[0].error).toMatch(/Falta POSTPEER_API_KEY/);
    expect(llamadas).toHaveLength(0);
  });
});

describe("el webhook", () => {
  const SECRETO = "whsec_prueba";
  async function avisar(cuerpo, { marca = String(Math.floor(Date.now() / 1000)), firma = null } = {}) {
    const crudo = JSON.stringify(cuerpo);
    return worker.fetch(new Request("https://calendario.test/api/webhooks/postpeer", {
      method: "POST", body: crudo,
      headers: { "X-PostPeer-Timestamp": marca, "X-PostPeer-Signature": firma ?? await firmaWebhook(SECRETO, marca, crudo) },
    }), env, {});
  }
  const publicado = { id: "evt-1", type: "post.published", data: { post: { id: "pp-1", status: "published" }, platforms: [{ platform: "tiktok", status: "published", platformPostUrl: "https://www.tiktok.com/@dcasa/video/5" }] } };

  beforeEach(async () => {
    env.POSTPEER_WEBHOOK_SECRET = SECRETO;
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
  });

  it("con su firma, cierra la publicación sin esperar al cron", async () => {
    const r = await avisar(publicado);
    expect(await r.json()).toEqual({ ok: true, aplicadas: 1 });
    expect(filas()[0]).toMatchObject({ estado: "publicada", externo_id: "pp-1", enlace: "https://www.tiktok.com/@dcasa/video/5" });
  });

  it("sin firma buena, viejo o repetido, no toca nada", async () => {
    expect((await avisar(publicado, { firma: "sha256=00" })).status).toBe(403);
    expect((await avisar(publicado, { marca: String(Math.floor(Date.now() / 1000) - 600) })).status).toBe(403);
    expect(filas()[0].estado).toBe("procesando");
    const enCurso = { id: "evt-0", type: "post.scheduled", data: { post: { id: "pp-1", status: "scheduled" } } };
    await avisar(enCurso);
    expect(await (await avisar(enCurso)).json()).toEqual({ ok: true, aplicadas: 0 });
  });

  it("un fallo deja la fila en error con el motivo", async () => {
    await avisar({ id: "evt-2", type: "post.failed", data: { post: { id: "pp-1", status: "failed" }, platforms: [{ platform: "tiktok", status: "failed", errorMessage: "Spam risk" }] } });
    expect(filas()[0]).toMatchObject({ estado: "error", error: expect.stringMatching(/Spam risk/) });
  });
});

describe("conectar la cuenta de un cliente", () => {
  it("crea su perfil en PostPeer y da la dirección del permiso", async () => {
    await sembrar({ cuenta: null });
    const r = await worker.fetch(conSesion("/api/redes/postpeer/conectar", { method: "POST", body: JSON.stringify({ clientId: "c1" }) }), env, {});
    expect(await r.json()).toEqual({ url: "https://www.tiktok.com/v2/auth/authorize/?client_key=postpeer", profileId: "perfil-9" });
    expect(llamadas.find((l) => l.ruta === "/v1/profiles").cuerpo).toEqual({ name: "Dcasa" });
    expect(llamadas.find((l) => l.ruta === "/v1/connect/tiktok").params).toEqual({ profileId: "perfil-9" });
  });

  it("con un perfil ya creado no crea otro", async () => {
    await sembrar({ cuenta: null });
    await worker.fetch(conSesion("/api/redes/postpeer/conectar", { method: "POST", body: JSON.stringify({ clientId: "c1", profileId: "perfil-1" }) }), env, {});
    expect(rutas()).toEqual(["GET /v1/connect/tiktok"]);
  });

  it("«Ya la conecté» guarda la cuenta del perfil como la del cliente y suelta la de la app anterior", async () => {
    await sembrar({ cuenta: "anterior" });
    const r = await worker.fetch(conSesion("/api/redes/postpeer/vincular", { method: "POST", body: JSON.stringify({ clientId: "c1", profileId: "perfil-9" }) }), env, {});
    expect(await r.json()).toMatchObject({ red: "tiktok", externoId: "acc-9", usuario: "dcasa.pa", clientId: "c1", via: "postpeer" });
    const nueva = db.sqlite.prepare("select * from cuentas_sociales where externo_id = 'acc-9'").get();
    expect(JSON.parse(nueva.datos)).toEqual({ via: "postpeer", profileId: "perfil-9", origen: "https://calendario.test" });
    expect(nueva.token_cifrado).toBeNull();
    expect(db.sqlite.prepare("select client_id from cuentas_sociales where id = 'tk'").get().client_id).toBeNull();
  });

  it("pegando el id, se comprueba con PostPeer antes de guardarlo", async () => {
    await sembrar({ cuenta: null });
    respuestas["GET /v1/tiktok/creator-info"] = { __estado: 404, cuerpo: { error: "Account not found" } };
    const mal = await worker.fetch(conSesion("/api/redes/postpeer/vincular", { method: "POST", body: JSON.stringify({ clientId: "c1", accountId: "otra" }) }), env, {});
    expect(mal.status).toBe(502);
    expect(db.sqlite.prepare("select count(*) n from cuentas_sociales").get().n).toBe(0);
  });

  it("la llave mala se dice sin enseñarla", async () => {
    await sembrar({ cuenta: null });
    respuestas["GET /v1/health/auth"] = { __estado: 401, cuerpo: { error: "Unauthorized" } };
    const r = await worker.fetch(conSesion("/api/redes/postpeer/llave"), env, {});
    const texto = await r.text();
    expect(r.status).toBe(502);
    expect(texto).toMatch(/no aceptó la llave/);
    expect(texto).not.toContain(LLAVE);
  });

  it("el estado de Ajustes no lleva la llave, y sí la dirección del webhook", async () => {
    await sembrar();
    const texto = await (await worker.fetch(conSesion("/api/redes/estado"), env, {})).text();
    expect(texto).not.toContain(LLAVE);
    expect(JSON.parse(texto).tiktok).toEqual({ configurado: true, webhook: false, urlWebhook: "https://calendario.test/api/webhooks/postpeer" });
  });
});

describe("medir", () => {
  it("TikTok ya no entra en la foto diaria de métricas", async () => {
    await sembrar();
    expect(await cuentasSinFoto(db, "2026-09-30", 5)).toEqual([]);
  });
});
