import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { ruta } from "../utils/repo.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarYouTube, TROZO_YOUTUBE, segundosISO, urlConsentimientoYouTube } from "../../worker/lib/youtube.js";
import { programar, procesarCola } from "../../worker/lib/publicador.js";
import { fotografiarCuenta } from "../../worker/lib/metricas.js";
import {
  tituloYouTube, descripcionYouTube, etiquetasYouTube, esShortYouTube, revisarPublicacion, piezasDe, LIMITES,
} from "../../src/lib/publicacion.js";
import { resumenDestino, queSaleEn } from "../../src/lib/subir.js";

// ============================================================
// YouTube, contra una D1 de verdad y una API de Google de mentira
//
// Lo que importa: que la sesión de subida se GUARDE antes de mandar un
// byte (abrir otra podría crear un segundo video), que los trozos vayan
// en múltiplos de 256 KiB y sigan el `Range` que dice Google, que tras un
// fallo a medias se pregunte dónde iba, que una vuelta del cron no pase de
// cuatro trozos (el plan gratuito), y que la migración que cambia el CHECK
// de `red` no se lleve por delante las métricas en cascada.
//
// NADA DE ESTO SE HA PROBADO CONTRA LA API REAL DE GOOGLE: el `fetch` de
// abajo contesta como dice su documentación.
// ============================================================

const DUENO = "u-jefe";
const TESTIGO = "testigo-de-sesion-de-prueba";
const VIDEO = "/api/media/clientes/c1/posts/v.mp4";
const PORTADA = "/api/media/clientes/c1/posts/portada.jpg";
const SESION = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=SES1";
const MB = 1024 * 1024;

let db;
let env;
let llamadas;
let google;

function r2(tamano) {
  return {
    async head(clave) { return clave === "clientes/c1/posts/v.mp4" ? { size: tamano, httpMetadata: { contentType: "video/mp4" } } : null; },
    async get(clave, { range } = {}) {
      if (clave === "clientes/c1/posts/portada.jpg") return { body: new Uint8Array(10), size: 10, httpMetadata: { contentType: "image/jpeg" } };
      if (clave !== "clientes/c1/posts/v.mp4") return null;
      return { body: new Uint8Array(range?.length ?? tamano), size: range?.length ?? tamano, httpMetadata: { contentType: "video/mp4" } };
    },
  };
}

const post = (extra = {}) => ({
  id: "p1", format: "reel", descripcion: "Latte de calabaza en 30 segundos\nLa receta completa.", hashtagsFinales: "#cafe #otono",
  publishTime: "10:00", redes: ["youtube"], medios: [{ src: VIDEO, tipo: "video", ancho: 1080, alto: 1920, duracion: 30 }], ...extra,
});

async function sembrar({ expira = "2099-01-01T00:00:00.000Z", privacidad = "public", conCuenta = true, p = post() } = {}) {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", DUENO, "Café Luna");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal1", "c1", DUENO, "Octubre", 9, 2026, JSON.stringify([{ date: "2026-10-05", posts: [p] }]));
  if (conCuenta) {
    s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, nombre, usuario, token_cifrado, refresh_cifrado, expira, client_id, datos) values (?,?,?,?,?,?,?,?,?,?,?)")
      .run("yt", DUENO, "youtube", "UC1", "Café Luna", "cafeluna", await cifrarYouTube(env, "acceso-viejo"), await cifrarYouTube(env, "renovar-1"), expira, "c1", JSON.stringify({ privacidad }));
  }
}

/** Google de mentira: el OAuth, la Data API, la subida reanudable y Analytics. */
function googleFalso(tamano) {
  const recibido = { bytes: 0 };
  return {
    recibido,
    privacidadFinal: null,
    fallarTrozo: false,
    canales: [{ id: "UC9", snippet: { title: "Café Luna TV", customUrl: "@cafelunatv", thumbnails: { default: { url: "https://yt3.ggpht.com/a.jpg" } } }, statistics: { subscriberCount: "1200", viewCount: "90000", videoCount: "40" }, contentDetails: { relatedPlaylists: { uploads: "UU9" } } }],
    responder(metodo, u, init) {
      const ruta = `${metodo} ${u.host}${u.pathname}`;
      if (ruta === "POST oauth2.googleapis.com/token") {
        const f = Object.fromEntries(init.body);
        return Response.json(f.grant_type === "refresh_token"
          ? { access_token: "acceso-nuevo", expires_in: 3599 }
          : { access_token: "acceso-1", refresh_token: "renovar-1", expires_in: 3599, scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly" });
      }
      if (ruta === "GET www.googleapis.com/youtube/v3/channels") return Response.json({ items: this.canales });
      if (ruta === "POST www.googleapis.com/upload/youtube/v3/videos") return new Response(null, { status: 200, headers: { Location: SESION } });
      if (ruta === "PUT www.googleapis.com/upload/youtube/v3/videos") {
        const rango = init.headers["Content-Range"];
        if (rango.startsWith("bytes */")) {
          return recibido.bytes >= tamano ? Response.json({ id: "vid1", status: { privacyStatus: "public" } }, { status: 200 })
            : new Response(null, { status: 308, headers: recibido.bytes ? { Range: `bytes=0-${recibido.bytes - 1}` } : {} });
        }
        const [, desde, hasta] = /bytes (\d+)-(\d+)\//.exec(rango).map(Number);
        if (this.fallarTrozo) { this.fallarTrozo = false; recibido.bytes = hasta + 1; throw new TypeError("conexión cortada"); }
        if (desde !== recibido.bytes) return new Response("{}", { status: 400 });
        recibido.bytes = hasta + 1;
        if (recibido.bytes >= tamano) return Response.json({ id: "vid1", status: { privacyStatus: this.privacidadFinal ?? "public" } }, { status: 201 });
        return new Response(null, { status: 308, headers: { Range: `bytes=0-${hasta}` } });
      }
      if (ruta === "POST www.googleapis.com/upload/youtube/v3/thumbnails/set") return Response.json({ items: [] });
      if (ruta === "GET youtubeanalytics.googleapis.com/v2/reports") {
        return Response.json({ columnHeaders: ["views", "likes", "comments", "shares", "subscribersGained", "subscribersLost"].map((name) => ({ name })), rows: [[350, 20, 4, 2, 9, 1]] });
      }
      if (ruta === "GET www.googleapis.com/youtube/v3/playlistItems") {
        return Response.json({ items: [{ contentDetails: { videoId: "v1", videoPublishedAt: "2026-09-20T15:00:00Z" } }, { contentDetails: { videoId: "v0", videoPublishedAt: "2025-01-01T00:00:00Z" } }] });
      }
      if (ruta === "GET www.googleapis.com/youtube/v3/videos") {
        return Response.json({ items: [{ id: "v1", snippet: { title: "Latte #Shorts", publishedAt: "2026-09-20T15:00:00Z", thumbnails: { medium: { url: "https://i.ytimg.com/vi/v1/mqdefault.jpg" } } }, statistics: { viewCount: "5000", likeCount: "300", commentCount: "12" }, contentDetails: { duration: "PT45S" } }] });
      }
      return new Response(JSON.stringify({ error: { code: 404, message: ruta, errors: [{ reason: "notFound" }] } }), { status: 404 });
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, GOOGLE_CLIENT_ID: "id-cliente", GOOGLE_CLIENT_SECRET: "secreto", MEDIA: r2(10 * MB) };
  llamadas = [];
  google = googleFalso(10 * MB);
  vi.stubGlobal("fetch", vi.fn(async (url, init = {}) => {
    const u = new URL(String(url));
    const metodo = init.method ?? "GET";
    llamadas.push({ metodo, url: u, cabeceras: init.headers ?? {}, cuerpo: typeof init.body === "string" ? JSON.parse(init.body) : null });
    return google.responder(metodo, u, init);
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const acceso = () => crearAcceso(db, DUENO);
const filas = () => db.sqlite.prepare("select * from publicaciones_programadas").all().map((f) => ({ ...f }));
const puts = () => llamadas.filter((l) => l.metodo === "PUT");
const siguienteMinuto = (n = 1) => vi.setSystemTime(new Date(Date.parse("2026-10-01T12:00:00.000Z") + n * 60_000));

describe("lo que sale en YouTube (puro)", () => {
  it("el título es la primera línea, sin < ni >, y se corta en palabra entera a 100", () => {
    expect(tituloYouTube(post())).toBe("Latte de calabaza en 30 segundos");
    expect(tituloYouTube({ descripcion: "a <b> c" })).toBe("a ‹b› c");
    expect(tituloYouTube({ descripcion: "", title: "Promo octubre" })).toBe("Promo octubre");
    const largo = tituloYouTube({ descripcion: "palabra ".repeat(30) });
    expect(largo.length).toBeLessThanOrEqual(LIMITES.youtube.titulo);
    expect(largo.endsWith("palabra…")).toBe(true);
  });

  it("un reel vertical de hasta 60 s es un Short y lleva #Shorts; uno horizontal o largo, no", () => {
    expect(esShortYouTube(post())).toBe(true);
    expect(descripcionYouTube(post())).toMatch(/#cafe #otono\n\n#Shorts$/);
    expect(descripcionYouTube(post({ descripcion: "Hola #shorts" }))).not.toMatch(/\n\n#Shorts$/);
    expect(esShortYouTube(post({ medios: [{ src: VIDEO, tipo: "video", ancho: 1920, alto: 1080, duracion: 30 }] }))).toBe(false);
    expect(esShortYouTube(post({ medios: [{ src: VIDEO, tipo: "video", duracion: 95 }] }))).toBe(false);
    expect(esShortYouTube(post({ format: "post" }))).toBe(false);
    // Sin medir, un reel se toma por Short: es vertical por definición.
    expect(esShortYouTube(post({ medios: [{ src: VIDEO, tipo: "video" }] }))).toBe(true);
  });

  it("las etiquetas son los hashtags sin #, sin repetir y hasta 500 caracteres", () => {
    expect(etiquetasYouTube(post({ hashtagsFinales: "#cafe #Otoño #cafe" }))).toEqual(["cafe", "Otoño"]);
    const muchas = Array.from({ length: 80 }, (_, i) => `#etiqueta${i}`).join(" ");
    const t = etiquetasYouTube({ hashtagsFinales: muchas });
    expect(t.join(",").length).toBeLessThanOrEqual(500);
  });

  it("sin video no se puede; con varios, sale el primero; la descripción se mide en bytes", () => {
    expect(revisarPublicacion(post({ medios: [{ src: "/api/media/clientes/c1/a.jpg", tipo: "imagen" }] }), ["youtube"]).errores[0]).toMatch(/sólo publica video/);
    const r = revisarPublicacion(post({ medios: [{ src: VIDEO, tipo: "video" }, { src: VIDEO, tipo: "video" }] }), ["youtube", "instagram"]);
    expect(r.avisos).toContain("YouTube publica un solo video: sale el primero.");
    expect(revisarPublicacion(post({ descripcion: `T\n${"ñ".repeat(2600)}` }), ["youtube"]).errores[0]).toMatch(/bytes/);
  });

  it("YouTube no tiene historias: el post sale sin su historia", () => {
    const conHistoria = post({ format: "post", historiaTambien: true, historias: [{ src: "/api/media/clientes/c1/h.jpg", tipo: "imagen" }] });
    expect(piezasDe(conHistoria, ["youtube", "instagram"])).toEqual([
      { red: "youtube", variante: "post" }, { red: "instagram", variante: "post" }, { red: "instagram", variante: "historia" },
    ]);
  });

  it("en «¿Qué sale y dónde?», YouTube sólo se nombra si es posible para el cliente", () => {
    expect(queSaleEn(post(), "youtube")).toBe("Short");
    expect(resumenDestino(post(), ["instagram"])).not.toMatch(/YouTube/);
    expect(resumenDestino(post(), ["instagram"], ["instagram", "youtube"])).toMatch(/No sale en YouTube/);
  });

  it("la duración ISO de la API, en segundos", () => {
    expect(segundosISO("PT1M5S")).toBe(65);
    expect(segundosISO("PT45S")).toBe(45);
    expect(segundosISO("P1DT1H")).toBe(90000);
    expect(segundosISO("x")).toBeNull();
  });
});

describe("publicar en YouTube", () => {
  it("abre la sesión con título, descripción, etiquetas y privacidad, y la guarda ANTES de mandar un byte", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    // La sesión se abre; un fallo en el primer trozo no la pierde.
    google.fallarTrozo = true;
    await procesarCola(env);
    const abrir = llamadas.find((l) => l.metodo === "POST" && l.url.pathname === "/upload/youtube/v3/videos");
    expect(abrir.url.searchParams.get("uploadType")).toBe("resumable");
    expect(abrir.cabeceras["X-Upload-Content-Length"]).toBe(String(10 * MB));
    expect(abrir.cuerpo).toEqual({
      snippet: { title: "Latte de calabaza en 30 segundos", description: "Latte de calabaza en 30 segundos\nLa receta completa.\n\n#cafe #otono\n\n#Shorts", tags: ["cafe", "otono"], categoryId: "22" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    });
    const [f] = filas();
    expect(f).toMatchObject({ estado: "procesando", contenedor_id: SESION, externo_id: null });
    expect(JSON.parse(f.carga).youtube).toMatchObject({ consultar: true, enviados: 0 });
  });

  it("tras un fallo a medias PREGUNTA dónde iba, sigue en la MISMA sesión y no abre otra", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    google.fallarTrozo = true;
    await procesarCola(env);
    siguienteMinuto(2);
    await procesarCola(env);
    const rangos = puts().map((l) => l.cabeceras["Content-Range"]);
    expect(rangos).toEqual([`bytes 0-${10 * MB - 1}/${10 * MB}`, `bytes */${10 * MB}`]);
    expect(llamadas.filter((l) => l.metodo === "POST" && l.url.pathname === "/upload/youtube/v3/videos")).toHaveLength(1);
    expect(filas()[0]).toMatchObject({ estado: "publicada", externo_id: "vid1", enlace: "https://www.youtube.com/shorts/vid1" });
  });

  it("un video grande va en trozos de 16 MiB (múltiplo de 256 KiB), cuatro por vuelta del cron, siguiendo el Range de Google", async () => {
    expect(TROZO_YOUTUBE % (256 * 1024)).toBe(0);
    const tamano = 5 * TROZO_YOUTUBE + 1234;
    env.MEDIA = r2(tamano);
    google = googleFalso(tamano);
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(puts()).toHaveLength(4);
    expect(puts().map((l) => l.cabeceras["Content-Length"])).toEqual(Array(4).fill(String(TROZO_YOUTUBE)));
    expect(filas()[0].estado).toBe("procesando");
    siguienteMinuto(1);
    await procesarCola(env);
    const ultimos = puts().slice(4).map((l) => l.cabeceras["Content-Range"]);
    expect(ultimos).toEqual([
      `bytes ${4 * TROZO_YOUTUBE}-${5 * TROZO_YOUTUBE - 1}/${tamano}`,
      `bytes ${5 * TROZO_YOUTUBE}-${tamano - 1}/${tamano}`,
    ]);
    expect(filas()[0]).toMatchObject({ estado: "publicada", externo_id: "vid1" });
  });

  it("pone la portada después del id, y si Google la deja en privado, lo dice", async () => {
    await sembrar({ p: post({ portada: PORTADA }) });
    google.privacidadFinal = "private";
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    const portada = llamadas.find((l) => l.url.pathname === "/upload/youtube/v3/thumbnails/set");
    expect(portada.url.searchParams.get("videoId")).toBe("vid1");
    const [f] = filas();
    expect(f.estado).toBe("publicada");
    expect(JSON.parse(f.carga).aviso).toMatch(/«Privado».*audite/);
  });

  it("una portada que falla no vuelve a subir el video: queda publicada con aviso", async () => {
    await sembrar({ p: post({ portada: PORTADA }) });
    const antes = google.responder.bind(google);
    google.responder = (m, u, i) => (u.pathname.endsWith("/thumbnails/set")
      ? new Response(JSON.stringify({ error: { code: 403, message: "x", errors: [{ reason: "forbidden" }] } }), { status: 403 })
      : antes(m, u, i));
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    const [f] = filas();
    expect(f).toMatchObject({ estado: "publicada", externo_id: "vid1" });
    expect(JSON.parse(f.carga).aviso).toMatch(/verificado/);
    expect(llamadas.filter((l) => l.metodo === "POST" && l.url.pathname === "/upload/youtube/v3/videos")).toHaveLength(1);
  });

  it("la privacidad del canal es la que se pide, y el token de una hora se renueva solo", async () => {
    await sembrar({ privacidad: "unlisted", expira: "2026-10-01T12:05:00.000Z" });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(llamadas[0].url.host).toBe("oauth2.googleapis.com");
    const abrir = llamadas.find((l) => l.metodo === "POST" && l.url.pathname === "/upload/youtube/v3/videos");
    expect(abrir.cabeceras.Authorization).toBe("Bearer acceso-nuevo");
    expect(abrir.cuerpo.status.privacyStatus).toBe("unlisted");
  });

  it("sin video subido a la app no se programa, y sin canal conectado tampoco", async () => {
    await sembrar();
    db.sqlite.prepare("update calendars set days = ?").run(JSON.stringify([{ date: "2026-10-05", posts: [post({ medios: [{ src: "https://otro.com/v.mp4", tipo: "video" }] })] }]));
    await expect(programar(env, acceso(), { calendarId: "cal1", postId: "p1" })).rejects.toThrow(/subido a la publicación/);
    db.sqlite.prepare("delete from cuentas_sociales").run();
    await expect(programar(env, acceso(), { calendarId: "cal1", postId: "p1" })).rejects.toThrow(/cuenta de YouTube/);
  });

  it("el cupo agotado no se reintenta solo: queda en error con qué hacer", async () => {
    await sembrar();
    google.responder = () => new Response(JSON.stringify({ error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } }), { status: 403 });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(filas()[0]).toMatchObject({ estado: "error", error: expect.stringMatching(/cupo diario/) });
  });
});

describe("conectar", () => {
  const conSesion = (r, opciones = {}) => new Request(`https://calendarios.test${r}`, {
    ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
  });

  async function vuelta(res) {
    const destino = new URL(res.headers.get("Location"));
    const cookie = res.headers.get("Set-Cookie").split(";")[0];
    return worker.fetch(new Request(`https://calendarios.test/api/redes/youtube/callback?code=c&state=${encodeURIComponent(destino.searchParams.get("state"))}`, {
      headers: { Cookie: cookie },
    }), env, {});
  }

  it("aquí: Google con los tres alcances, offline, y la vuelta deja el canal del cliente con sus tokens cifrados", async () => {
    await sembrar({ conCuenta: false });
    const res = await worker.fetch(conSesion("/api/redes/youtube/conectar?cliente=c1"), env, {});
    expect(res.status).toBe(302);
    expect(res.headers.get("Set-Cookie")).toMatch(/^__Host-youtube-oauth=/);
    const destino = new URL(res.headers.get("Location"));
    expect(destino.host).toBe("accounts.google.com");
    expect(destino.searchParams.get("scope").split(" ")).toEqual([
      "https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly",
    ]);
    expect(destino.searchParams.get("access_type")).toBe("offline");
    expect(destino.searchParams.get("redirect_uri")).toBe("https://calendarios.test/api/redes/youtube/callback");
    expect(destino.searchParams.has("include_granted_scopes")).toBe(false);
    const fin = await vuelta(res);
    expect(fin.headers.get("Location")).toMatch(/\/ajustes\?youtube=ok/);
    const c = db.sqlite.prepare("select * from cuentas_sociales where red = 'youtube'").get();
    expect(c).toMatchObject({ client_id: "c1", externo_id: "UC9", nombre: "Café Luna TV", usuario: "cafelunatv" });
    expect(c.refresh_cifrado).not.toContain("renovar-1");
  });

  it("con el enlace del cliente, sin sesión, y vuelve a una página suya", async () => {
    await sembrar({ conCuenta: false });
    const { url } = await (await worker.fetch(conSesion("/api/redes/youtube/enlace", { method: "POST", body: JSON.stringify({ clientId: "c1" }) }), env, {})).json();
    expect(url).toMatch(/\/api\/redes\/youtube\/inicio\//);
    const inicio = await worker.fetch(new Request(url), env, {});
    expect(inicio.status).toBe(302);
    const fin = await vuelta(inicio);
    expect(fin.headers.get("Location")).toMatch(/\/youtube-conectado\.html/);
    expect(db.sqlite.prepare("select client_id from cuentas_sociales where red = 'youtube'").get().client_id).toBe("c1");
  });

  it("si llegan varios canales, ninguno se asigna solo: se elige uno y los demás se van", async () => {
    await sembrar({ conCuenta: false });
    google.canales = [
      { ...google.canales[0] },
      { id: "UC8", snippet: { title: "Café Luna Recetas" }, statistics: {}, contentDetails: {} },
    ];
    const fin = await vuelta(await worker.fetch(conSesion("/api/redes/youtube/conectar?cliente=c1"), env, {}));
    expect(fin.headers.get("Location")).toMatch(/youtube=elegir/);
    const estado = await (await worker.fetch(conSesion("/api/redes/estado"), env, {})).json();
    const pendientes = estado.cuentas.filter((c) => c.red === "youtube");
    expect(pendientes.map((c) => [c.clientId, c.elegirPara])).toEqual([[null, "c1"], [null, "c1"]]);
    const elegida = pendientes.find((c) => c.externoId === "UC8");
    const r = await worker.fetch(conSesion("/api/redes/youtube/elegir", { method: "POST", body: JSON.stringify({ cuentaId: elegida.id }) }), env, {});
    expect(r.status).toBe(200);
    expect(db.sqlite.prepare("select externo_id, client_id from cuentas_sociales where red = 'youtube'").all().map((x) => ({ ...x }))).toEqual([{ externo_id: "UC8", client_id: "c1" }]);
  });

  it("la vuelta sin la cookie del navegador que empezó se rechaza", async () => {
    await sembrar({ conCuenta: false });
    const res = await worker.fetch(conSesion("/api/redes/youtube/conectar?cliente=c1"), env, {});
    const state = new URL(res.headers.get("Location")).searchParams.get("state");
    const fin = await worker.fetch(new Request(`https://calendarios.test/api/redes/youtube/callback?code=c&state=${encodeURIComponent(state)}`), env, {});
    expect(fin.headers.get("Location")).toMatch(/youtube=error/);
    expect(db.sqlite.prepare("select count(*) n from cuentas_sociales").get().n).toBe(0);
  });

  it("un enlace manipulado no abre nada, y el permiso se pide siempre (para que llegue el de larga duración)", async () => {
    const r = await worker.fetch(new Request("https://calendarios.test/api/redes/youtube/inicio/abc.def"), env, {});
    expect(r.headers.get("Location")).toMatch(/youtube-error\.html/);
    expect(urlConsentimientoYouTube(env, "https://x.test", "s")).toMatch(/prompt=consent/);
  });

  it("la privacidad se cambia por canal, y desconectar borra la cuenta", async () => {
    await sembrar();
    const r = await worker.fetch(conSesion("/api/redes/youtube/privacidad", { method: "PUT", body: JSON.stringify({ cuentaId: "yt", privacidad: "private" }) }), env, {});
    expect((await r.json()).privacidad).toBe("private");
    const estado = await (await worker.fetch(conSesion("/api/redes/estado"), env, {})).json();
    expect(estado.cuentas.find((c) => c.id === "yt").privacidad).toBe("private");
    expect(estado.youtube).toEqual({ configurado: true, redireccion: "https://calendarios.test/api/redes/youtube/callback" });
    const mal = await worker.fetch(conSesion("/api/redes/youtube/privacidad", { method: "PUT", body: JSON.stringify({ cuentaId: "yt", privacidad: "todos" }) }), env, {});
    expect(mal.status).toBe(400);
    await worker.fetch(conSesion("/api/redes/youtube/desconectar", { method: "POST", body: JSON.stringify({ cuentaId: "yt" }) }), env, {});
    expect(db.sqlite.prepare("select count(*) n from cuentas_sociales").get().n).toBe(0);
    expect(llamadas.some((l) => l.url.pathname === "/revoke")).toBe(true);
  });
});

describe("medir", () => {
  it("suscriptores, videos, vistas del día y cada video reciente con sus cifras", async () => {
    await sembrar();
    db.sqlite.prepare("update cuentas_sociales set externo_id = 'UC9'").run();
    const cuenta = db.sqlite.prepare("select * from cuentas_sociales where id = 'yt'").get();
    await fotografiarCuenta(env, acceso(), { ...cuenta }, "2026-09-30");
    const foto = db.sqlite.prepare("select * from metricas_cuenta").get();
    expect(foto).toMatchObject({ red: "youtube", seguidores: 1200, publicaciones: 40, vistas: 350, interacciones: 26 });
    expect(JSON.parse(foto.datos)).toMatchObject({ vistasTotales: 90000, suscriptoresGanados: 9 });
    const pubs = db.sqlite.prepare("select * from metricas_publicacion").all();
    expect(pubs).toHaveLength(1);
    expect(pubs[0]).toMatchObject({ externo_id: "v1", tipo: "short", vistas: 5000, me_gusta: 300, comentarios: 12, interacciones: 312, enlace: "https://www.youtube.com/shorts/v1" });
    const analytics = llamadas.find((l) => l.url.host === "youtubeanalytics.googleapis.com");
    expect(analytics.url.searchParams.get("ids")).toBe("channel==MINE");
    expect(analytics.url.searchParams.get("startDate")).toBe("2026-09-30");
    // Una cuenta por vuelta del cron: pocas peticiones (sin `search`).
    expect(llamadas.length).toBeLessThanOrEqual(5);
    expect(llamadas.some((l) => l.url.pathname.endsWith("/search"))).toBe(false);
  });
});

describe("la migración 0028 no pierde nada", () => {
  it("con filas en las cuatro tablas, la cascada de métricas no se dispara y las claves ajenas siguen", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("pragma foreign_keys = on");
    const dir = ruta("migraciones", "d1");
    const ficheros = readdirSync(dir).filter((n) => n.endsWith(".sql")).sort();
    for (const f of ficheros.filter((n) => n < "0028")) sqlite.exec(readFileSync(`${dir}/${f}`, "utf8"));
    const s = (q) => sqlite.prepare(q).run();
    s("insert into users (id, email, password_hash, salt) values ('u','u@a','x','x')");
    s("insert into clients (id, owner_id, name) values ('c','u','C')");
    s("insert into calendars (id, client_id, owner_id, name, month, year, days) values ('cal','c','u','O',9,2026,'[]')");
    s("insert into cuentas_sociales (id, owner_id, red, externo_id, client_id) values ('k','u','instagram','1','c')");
    s("insert into metricas_cuenta (id, owner_id, client_id, cuenta_id, red, fecha, seguidores) values ('m','u','c','k','instagram','2026-09-01', 77)");
    s("insert into metricas_publicacion (id, owner_id, client_id, cuenta_id, red, externo_id) values ('mp','u','c','k','instagram','e')");
    s("insert into publicaciones_programadas (id, owner_id, client_id, calendar_id, post_id, red, cuenta_id, programada_para, variante) values ('q','u','c','cal','p','instagram','k','2026-10-01','historia')");
    const contar = () => ["cuentas_sociales", "metricas_cuenta", "metricas_publicacion", "publicaciones_programadas"].map((t) => sqlite.prepare(`select count(*) n from ${t}`).get().n);
    const migracion = readFileSync(`${dir}/0028_youtube.sql`, "utf8");
    sqlite.exec(migracion);
    expect(contar()).toEqual([1, 1, 1, 1]);
    expect({ ...sqlite.prepare("select cuenta_id, variante from publicaciones_programadas").get() }).toEqual({ cuenta_id: "k", variante: "historia" });
    expect(sqlite.prepare("select seguidores from metricas_cuenta").get().seguidores).toBe(77);
    // Se puede volver a aplicar sin perder nada.
    sqlite.exec(migracion);
    expect(contar()).toEqual([1, 1, 1, 1]);
    expect(sqlite.prepare("pragma foreign_key_check").all()).toEqual([]);
    // 'youtube' entra; y las hijas siguen colgando de la madre DE VERDAD.
    s("insert into cuentas_sociales (id, owner_id, red, externo_id, client_id) values ('y','u','youtube','UC1','c')");
    s("insert into publicaciones_programadas (id, owner_id, client_id, calendar_id, post_id, red, cuenta_id, programada_para) values ('q2','u','c','cal','p','youtube','y','2026-10-01')");
    s("delete from cuentas_sociales where id = 'k'");
    expect(contar()).toEqual([1, 0, 0, 2]);
    expect(sqlite.prepare("select cuenta_id from publicaciones_programadas where id = 'q'").get().cuenta_id).toBeNull();
    expect(() => s("insert into metricas_cuenta (id, owner_id, cuenta_id, red, fecha) values ('z','u','no-existe','x','2026-01-01')")).toThrow(/FOREIGN KEY/);
  });
});
