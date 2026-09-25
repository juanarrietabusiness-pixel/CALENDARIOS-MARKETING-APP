import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { cifrarMeta, urlMedioPublico } from "../../worker/lib/meta.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import {
  programar, procesarCola, procesarPublicacion, resincronizarCalendario, cancelarPendientes, ErrorPublicar,
} from "../../worker/lib/publicador.js";

// ============================================================
// Publicar en Instagram y Facebook, contra una D1 de verdad
//
// La Graph API es de mentira —registra lo que se le pide y contesta como
// Meta—; la base NO: son las migraciones aplicadas en SQLite. Así se ve
// que la cola se escribe, se reserva y se relee con el esquema real.
//
// Lo que más importa aquí: que una publicación NUNCA salga dos veces.
// ============================================================

const SECRETO = "secreto-de-la-app-de-meta";
const DUENO = "u-jefe";
const TESTIGO = "testigo-de-sesion-de-prueba";
const IMAGEN = "/api/media/clientes/c1/posts/foto.jpg";

let db;
let env;
let llamadas;
let respuestas;
let contadores;
/** 0, 1, 2… por tipo: los ids que Meta devolvería uno tras otro. */
const cuenta = (tipo) => { contadores[tipo] = (contadores[tipo] ?? -1) + 1; return contadores[tipo]; };

function post(extra = {}) {
  return {
    id: "p1", format: "post", title: "Lanzamiento", descripcion: "Hola mundo", hashtagsFinales: "#cafe #panama",
    image: IMAGEN, publishTime: "10:00", redes: ["instagram"], status: "approved", ...extra,
  };
}

async function sembrar({ posts = [post()], cuentas = ["instagram", "facebook"], opciones = {} } = {}) {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", DUENO, "Café Luna");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days, opciones) values (?,?,?,?,?,?,?,?)")
    .run("cal1", "c1", DUENO, "Octubre", 9, 2026, JSON.stringify([{ date: "2026-10-05", posts }]), JSON.stringify(opciones));
  const token = await cifrarMeta(env, "token-de-pagina");
  s.prepare("insert into integracion_meta (id, owner_id, token_cifrado, origen) values (?,?,?,?)")
    .run(DUENO, DUENO, await cifrarMeta(env, "token-de-usuario"), "https://calendarios.test");
  if (cuentas.includes("instagram")) {
    s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, pagina_id, token_cifrado, client_id) values (?,?,?,?,?,?,?)")
      .run(`${DUENO}:instagram:IG1`, DUENO, "instagram", "IG1", "PAGE1", token, "c1");
  }
  if (cuentas.includes("facebook")) {
    s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, pagina_id, token_cifrado, client_id) values (?,?,?,?,?,?,?)")
      .run(`${DUENO}:facebook:PAGE1`, DUENO, "facebook", "PAGE1", "PAGE1", token, "c1");
  }
}

const filas = () => db.sqlite.prepare("select * from publicaciones_programadas order by created_at").all().map((f) => ({ ...f }));
const acceso = () => crearAcceso(db, DUENO);

/** Meta de mentira: cada ruta, una respuesta (o una función que la construye). */
function graphFalsa() {
  return vi.fn(async (entrada, init = {}) => {
    const u = new URL(String(entrada));
    const ruta = u.pathname.replace(/^\/v[\d.]+/, "");
    const metodo = init.method ?? "GET";
    const params = metodo === "GET" ? Object.fromEntries(u.searchParams) : Object.fromEntries(new URLSearchParams(String(init.body ?? "")));
    llamadas.push({ metodo, ruta, params, host: u.host });
    const r = respuestas[`${metodo} ${ruta}`];
    const datos = typeof r === "function" ? r(params) : r;
    if (datos?.__estado) return new Response(JSON.stringify(datos.cuerpo), { status: datos.__estado });
    return new Response(JSON.stringify(datos ?? { error: { message: `sin respuesta para ${metodo} ${ruta}`, code: 100 } }), {
      status: datos ? 200 : 400,
    });
  });
}

const pasos = () => llamadas.map((l) => `${l.metodo} ${l.ruta}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, META_APP_ID: "app", META_APP_SECRET: SECRETO, MEDIA: null };
  llamadas = [];
  contadores = {};
  respuestas = {
    "POST /IG1/media": (p) => ({ id: p.is_carousel_item ? `hijo-${cuenta("hijo")}` : "cont1" }),
    "GET /cont1": { status_code: "FINISHED" },
    "POST /IG1/media_publish": { id: "media1" },
    "GET /media1": { permalink: "https://www.instagram.com/p/abc/" },
    "POST /media1/comments": { id: "com1" },
    "POST /PAGE1/photos": (p) => (p.published === "false" ? { id: `foto-${cuenta("foto")}` } : { id: "ph1", post_id: "PAGE1_99" }),
    "POST /PAGE1/feed": { id: "PAGE1_100" },
    "POST /PAGE1/videos": { id: "vid1" },
  };
  vi.stubGlobal("fetch", graphFalsa());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Avanza el reloj: la reserva de una fila se basa en `updated_at`. */
const pasar = (ms = 1000) => vi.setSystemTime(new Date(Date.now() + ms));

describe("programar", () => {
  it("una fila por red, a la hora del calendario en Panamá (UTC−5)", async () => {
    await sembrar({ posts: [post({ redes: ["instagram", "facebook"] })] });
    const creadas = await programar(env, acceso(), { calendarId: "cal1", postId: "p1" });
    expect(creadas.map((f) => f.red)).toEqual(["instagram", "facebook"]);
    expect(filas().map((f) => f.programada_para)).toEqual(["2026-10-05T15:00:00.000Z", "2026-10-05T15:00:00.000Z"]);
    expect(filas().every((f) => f.estado === "programada")).toBe(true);
  });

  it("sin cuenta asignada al cliente, lo dice y no programa nada", async () => {
    await sembrar({ cuentas: ["facebook"] });
    await expect(programar(env, acceso(), { calendarId: "cal1", postId: "p1" })).rejects.toThrow(/cuenta de Instagram asignada/);
    expect(filas()).toHaveLength(0);
  });

  it("una hora que ya pasó no se programa: se publica ahora o se cambia", async () => {
    vi.setSystemTime(new Date("2026-10-06T00:00:00.000Z"));
    await sembrar();
    await expect(programar(env, acceso(), { calendarId: "cal1", postId: "p1" })).rejects.toThrow(/ya pasaron/);
  });

  it("con las reglas del panel: un reel sin video no entra", async () => {
    await sembrar({ posts: [post({ format: "reel" })] });
    await expect(programar(env, acceso(), { calendarId: "cal1", postId: "p1" })).rejects.toBeInstanceOf(ErrorPublicar);
  });

  it("Instagram sin JPEG no entra: el panel la convierte antes", async () => {
    await sembrar({ posts: [post({ image: "/api/media/clientes/c1/posts/foto.png" })] });
    await expect(programar(env, acceso(), { calendarId: "cal1", postId: "p1" })).rejects.toThrow(/JPEG/);
  });

  it("reprogramar sustituye lo anterior: nunca dos filas vivas por red", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1" });
    pasar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1" });
    expect(filas().map((f) => f.estado)).toEqual(["cancelada", "programada"]);
  });
});

describe("la cola: Instagram", () => {
  it("antes de su hora no hace nada", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1" });
    expect(await procesarCola(env)).toBe(0);
    expect(llamadas).toHaveLength(0);
  });

  it("a su hora: contenedor, estado, publicar, enlace — con el texto y una URL firmada", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1" });
    vi.setSystemTime(new Date("2026-10-05T15:00:30.000Z"));
    expect(await procesarCola(env)).toBe(1);

    expect(pasos()).toEqual(["POST /IG1/media", "GET /cont1", "POST /IG1/media_publish", "GET /media1"]);
    const crear = llamadas[0].params;
    expect(crear.caption).toBe("Hola mundo\n\n#cafe #panama");
    expect(crear.access_token).toBe("token-de-pagina");
    expect(crear.image_url).toMatch(/^https:\/\/calendarios\.test\/api\/medio-publico\/[\w-]+\.[\w-]+\/foto\.jpg$/);

    const [f] = filas();
    expect(f.estado).toBe("publicada");
    expect(f.externo_id).toBe("media1");
    expect(f.enlace).toBe("https://www.instagram.com/p/abc/");
  });

  it("los hashtags en el primer comentario van al comentario, no al texto", async () => {
    await sembrar({ posts: [post({ hashtagsEnComentario: true, primerComentario: "¡Pide el tuyo!" })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(llamadas[0].params.caption).toBe("Hola mundo");
    expect(llamadas.at(-1)).toMatchObject({ ruta: "/media1/comments", params: { message: "¡Pide el tuyo!\n\n#cafe #panama" } });
  });

  it("sale lo que hay AHORA en el calendario, no lo que había al programar", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    db.sqlite.prepare("update calendars set days = ? where id = 'cal1'")
      .run(JSON.stringify([{ date: "2026-10-05", posts: [post({ descripcion: "Texto corregido" })] }]));
    await procesarCola(env);
    expect(llamadas[0].params.caption).toMatch(/^Texto corregido/);
  });

  it("si falla DESPUÉS de publicar, no vuelve a publicar: queda publicada con aviso", async () => {
    await sembrar();
    respuestas["GET /media1"] = { __estado: 500, cuerpo: { error: { message: "caído", code: 2 } } };
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    pasar(3600_000);
    await procesarCola(env);
    expect(pasos().filter((p) => p === "POST /IG1/media_publish")).toHaveLength(1);
    expect(filas()[0].estado).toBe("publicada");
  });

  it("un error pasajero de Meta se reintenta más tarde; uno de verdad se queda en error con su motivo", async () => {
    await sembrar();
    respuestas["POST /IG1/media"] = { __estado: 503, cuerpo: { error: { message: "saturado", code: 2 } } };
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    let [f] = filas();
    expect(f.estado).toBe("programada");
    expect(f.intentos).toBe(1);
    expect(Date.parse(f.siguiente_intento)).toBeGreaterThan(Date.now());
    expect(await procesarCola(env), "no se reintenta antes de su hora").toBe(0);

    respuestas["POST /IG1/media"] = { __estado: 400, cuerpo: { error: { message: "Invalid parameter", code: 100, error_user_msg: "La imagen no vale" } } };
    pasar(2 * 60_000);
    await procesarCola(env);
    [f] = filas();
    expect(f.estado).toBe("error");
    expect(f.error).toMatch(/La imagen no vale/);
  });

  it("un reel que Meta aún procesa se deja para la siguiente vuelta y ahí se publica", async () => {
    await sembrar({ posts: [post({ format: "reel", medios: [{ src: "/api/media/clientes/c1/posts/v.mp4", tipo: "video" }] })] });
    respuestas["GET /cont1"] = { status_code: "IN_PROGRESS" };
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(llamadas[0].params).toMatchObject({ media_type: "REELS", share_to_feed: "true" });
    expect(filas()[0]).toMatchObject({ estado: "procesando", contenedor_id: "cont1" });

    respuestas["GET /cont1"] = { status_code: "FINISHED" };
    pasar(30_000);
    await procesarCola(env);
    expect(pasos().filter((p) => p === "POST /IG1/media")).toHaveLength(1);
    expect(filas()[0].estado).toBe("publicada");
  });

  it("un carrusel crea cada elemento y después el conjunto", async () => {
    const medios = ["a", "b", "c"].map((n) => ({ src: `/api/media/clientes/c1/posts/${n}.jpg`, tipo: "imagen" }));
    await sembrar({ posts: [post({ format: "carrusel", medios })] });
    respuestas["GET /hijo-0"] = respuestas["GET /hijo-1"] = respuestas["GET /hijo-2"] = { status_code: "FINISHED" };
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    const creaciones = llamadas.filter((l) => l.ruta === "/IG1/media");
    expect(creaciones.slice(0, 3).every((l) => l.params.is_carousel_item === "true")).toBe(true);
    expect(creaciones[3].params).toMatchObject({ media_type: "CAROUSEL", children: "hijo-0,hijo-1,hijo-2" });
    expect(filas()[0].estado).toBe("publicada");
  });

  it("una fila que otra vuelta ya tomó no se procesa dos veces", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    const [f] = filas();
    // Otra vuelta la reservó entre medias: su updated_at ya no es el leído.
    const original = db.prepare;
    let una = true;
    db.prepare = (sql) => {
      if (una && /^update publicaciones_programadas/.test(sql)) {
        una = false;
        db.sqlite.prepare("update publicaciones_programadas set updated_at = 'otra' where id = ?").run(f.id);
      }
      return original.call(db, sql);
    };
    expect(await procesarPublicacion(env, { id: f.id, owner_id: DUENO })).toBeNull();
    expect(llamadas).toHaveLength(0);
  });
});

describe("la cola: Facebook", () => {
  it("una foto va a /photos con el texto", async () => {
    await sembrar({ posts: [post({ redes: ["facebook"] })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(llamadas[0]).toMatchObject({ ruta: "/PAGE1/photos", params: { caption: "Hola mundo\n\n#cafe #panama" } });
    expect(filas()[0]).toMatchObject({ estado: "publicada", externo_id: "PAGE1_99", enlace: "https://www.facebook.com/PAGE1_99" });
  });

  it("varias fotos: se suben sin publicar y se adjuntan a una sola entrada", async () => {
    const medios = ["a", "b"].map((n) => ({ src: `/api/media/clientes/c1/posts/${n}.jpg`, tipo: "imagen" }));
    await sembrar({ posts: [post({ redes: ["facebook"], format: "carrusel", medios })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(pasos()).toEqual(["POST /PAGE1/photos", "POST /PAGE1/photos", "POST /PAGE1/feed"]);
    expect(llamadas[2].params["attached_media[1]"]).toBe(JSON.stringify({ media_fbid: "foto-1" }));
  });

  it("un video va por el host de video", async () => {
    await sembrar({ posts: [post({ redes: ["facebook"], format: "reel", medios: [{ src: "/api/media/clientes/c1/posts/v.mp4", tipo: "video" }] })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(llamadas[0]).toMatchObject({ host: "graph-video.facebook.com", ruta: "/PAGE1/videos" });
  });
});

describe("la cola sigue al calendario", () => {
  it("mover la hora mueve lo programado; quitar la publicación lo cancela", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1" });
    pasar();
    const cal = { id: "cal1", days: JSON.stringify([{ date: "2026-10-07", posts: [post({ publishTime: "18:30" })] }]) };
    expect(await resincronizarCalendario(env, acceso(), cal)).toBe(1);
    expect(filas()[0].programada_para).toBe("2026-10-07T23:30:00.000Z");

    pasar();
    await resincronizarCalendario(env, acceso(), { id: "cal1", days: "[]" });
    expect(filas()[0]).toMatchObject({ estado: "cancelada", error: "Se quitó del calendario." });
  });

  it("si el cliente pide cambios, lo programado no sale", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1" });
    pasar();
    await cancelarPendientes(acceso(), "cal1", "p1", "El cliente pidió cambios.");
    expect(filas()[0].estado).toBe("cancelada");
  });
});

describe("por la puerta del Worker", () => {
  const conSesion = (ruta, opciones = {}) => new Request(`https://calendarios.test${ruta}`, {
    ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
  });

  it("el estado enseña las cuentas sin un solo token", async () => {
    await sembrar();
    const res = await worker.fetch(conSesion("/api/redes/estado"), env, {});
    expect(res.status).toBe(200);
    const datos = await res.json();
    expect(datos.meta).toMatchObject({ configurado: true, conectado: true, redireccion: "https://calendarios.test/api/redes/meta/callback" });
    expect(datos.cuentas).toHaveLength(2);
    expect(JSON.stringify(datos)).not.toMatch(/token|cifrado/i);
  });

  it("programar por la API y leer la cola del calendario", async () => {
    await sembrar();
    const res = await worker.fetch(conSesion("/api/publicar", { method: "POST", body: JSON.stringify({ calendarId: "cal1", postId: "p1" }) }), env, {});
    expect(res.status).toBe(201);
    const lista = await (await worker.fetch(conSesion("/api/publicar?calendario=cal1"), env, {})).json();
    expect(lista).toMatchObject([{ postId: "p1", red: "instagram", estado: "programada", programadaPara: "2026-10-05T15:00:00.000Z" }]);
  });

  it("un error de lo pedido es 422 con el motivo, no un 500", async () => {
    await sembrar({ cuentas: [] });
    const res = await worker.fetch(conSesion("/api/publicar", { method: "POST", body: JSON.stringify({ calendarId: "cal1", postId: "p1" }) }), env, {});
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/Integraciones/);
  });

  it("asignar una cuenta libera la que ocupaba ese sitio", async () => {
    await sembrar();
    db.sqlite.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id) values (?,?,?,?)").run("otra", DUENO, "instagram", "IG2");
    const res = await worker.fetch(conSesion("/api/redes/cuentas/otra", { method: "PUT", body: JSON.stringify({ clientId: "c1" }) }), env, {});
    expect(res.status).toBe(200);
    const asignadas = db.sqlite.prepare("select id from cuentas_sociales where client_id = 'c1' and red = 'instagram'").all();
    expect(asignadas.map((f) => f.id)).toEqual(["otra"]);
  });

  it("conectar manda a Facebook con el state firmado y la cookie de la pestaña", async () => {
    await sembrar();
    const res = await worker.fetch(conSesion("/api/redes/meta/conectar"), env, {});
    expect(res.status).toBe(302);
    const destino = new URL(res.headers.get("Location"));
    expect(destino.host).toBe("www.facebook.com");
    expect(destino.searchParams.get("scope")).toMatch(/instagram_content_publish/);
    expect(res.headers.get("Set-Cookie")).toMatch(/^__Host-meta-oauth=\w+; Secure; HttpOnly/);
  });

  it("la vuelta de Facebook va sin sesión, pero sin la cookie de la pestaña se rechaza", async () => {
    const res = await worker.fetch(new Request("https://calendarios.test/api/redes/meta/callback?code=x&state=y"), env, {});
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toMatch(/\/ajustes\?meta=error/);
  });

  it("el medio público abre SÓLO el archivo firmado, sin sesión, y no se ejecuta", async () => {
    const bytes = new Uint8Array([255, 216, 255]);
    env.MEDIA = {
      async get(clave) {
        if (clave !== "clientes/c1/posts/foto.jpg") return null;
        return { body: bytes, size: 3, httpEtag: '"e"', httpMetadata: { contentType: "image/jpeg" } };
      },
    };
    const url = await urlMedioPublico(env, "https://calendarios.test", IMAGEN);
    const res = await worker.fetch(new Request(url), env, {});
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Security-Policy")).toBe("sandbox");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const falsa = url.replace(/\/medio-publico\/([^/]+)\//, (_, t) => `/medio-publico/${t.slice(0, -2)}xx/`);
    expect((await worker.fetch(new Request(falsa), env, {})).status).toBe(404);
  });

  it("un medio fuera de la carpeta de clientes no se firma", async () => {
    await expect(urlMedioPublico(env, "https://x", "/api/media/../secreto")).rejects.toThrow();
  });
});

describe("programar al aprobar", () => {
  it("con la opción encendida, la aprobación del cliente la mete en la cola", async () => {
    await sembrar({ opciones: { programarAlAprobar: true } });
    db.sqlite.prepare("update calendars set share_token = ?, share_enabled = 1 where id = 'cal1'").run("t".repeat(48));
    const esperas = [];
    const res = await worker.fetch(
      new Request(`https://calendarios.test/api/publico/${"t".repeat(48)}/aprobacion`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: "p1", estado: "aprobado", revisor: "Ana" }),
      }),
      env, { waitUntil: (p) => esperas.push(p) },
    );
    expect(res.status).toBe(200);
    await Promise.all(esperas);
    expect(filas()).toMatchObject([{ post_id: "p1", red: "instagram", estado: "programada" }]);
  });
});

describe("historias y variantes", () => {
  const historia = (n) => ({ src: `/api/media/clientes/c1/generadas/h${n}.jpg`, tipo: "imagen", ancho: 1080, alto: 1920 });

  it("un post con «también como historia» son dos piezas por red; la historia sale 15 min después", async () => {
    await sembrar({ posts: [post({ redes: ["instagram", "facebook"], historiaTambien: true, historias: [historia(1)] })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1" });
    const r = filas().map((f) => `${f.red}:${f.variante}@${f.programada_para}`).sort();
    expect(r).toEqual([
      "facebook:historia@2026-10-05T15:15:00.000Z", "facebook:post@2026-10-05T15:00:00.000Z",
      "instagram:historia@2026-10-05T15:15:00.000Z", "instagram:post@2026-10-05T15:00:00.000Z",
    ]);
  });

  it("sin imágenes de historia, «también como historia» no deja programar", async () => {
    await sembrar({ posts: [post({ historiaTambien: true, historias: [] })] });
    await expect(programar(env, acceso(), { calendarId: "cal1", postId: "p1" })).rejects.toThrow(/imagen de historia/);
  });

  it("Instagram: una tanda de historias sale una tras otra y no se repite ninguna", async () => {
    let n = 0;
    respuestas["POST /IG1/media"] = (p) => ({ id: p.media_type === "STORIES" ? `st-${n++}` : "cont1" });
    respuestas["GET /st-0"] = respuestas["GET /st-1"] = { status_code: "FINISHED" };
    let pub = 0;
    respuestas["POST /IG1/media_publish"] = () => ({ id: `pub-${pub++}` });
    await sembrar({ posts: [post({ format: "historia", medios: [historia(1), historia(2)] })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(llamadas.filter((l) => l.ruta === "/IG1/media").map((l) => l.params.media_type)).toEqual(["STORIES", "STORIES"]);
    expect(pasos().filter((p) => p === "POST /IG1/media_publish")).toHaveLength(2);
    expect(filas()[0]).toMatchObject({ estado: "publicada", externo_id: "pub-0" });
    expect(JSON.parse(filas()[0].carga).tanda.ids).toEqual(["pub-0", "pub-1"]);
  });

  it("una tanda que falla a medias queda publicada con cuántas faltaron", async () => {
    let n = 0;
    respuestas["POST /IG1/media"] = () => (n++ === 0 ? { id: "st-0" } : { __estado: 400, cuerpo: { error: { message: "no vale", code: 100 } } });
    respuestas["GET /st-0"] = { status_code: "FINISHED" };
    respuestas["POST /IG1/media_publish"] = { id: "pub-0" };
    await sembrar({ posts: [post({ format: "historia", medios: [historia(1), historia(2)] })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    const [f] = filas();
    expect(f.estado).toBe("publicada");
    expect(JSON.parse(f.carga).aviso).toMatch(/Salieron 1 de 2/);
  });

  it("Facebook: la historia de foto se sube sin publicar y se publica como historia", async () => {
    respuestas["POST /PAGE1/photo_stories"] = { post_id: "PAGE1_st" };
    await sembrar({ posts: [post({ redes: ["facebook"], format: "historia", medios: [historia(1)] })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(pasos()).toEqual(["POST /PAGE1/photos", "POST /PAGE1/photo_stories"]);
    expect(llamadas[0].params.published).toBe("false");
    expect(llamadas[1].params.photo_id).toMatch(/^foto-/);
    expect(filas()[0]).toMatchObject({ estado: "publicada", externo_id: "PAGE1_st" });
  });

  it("colaboradores: van en el post de Instagram, limpios y como mucho tres", async () => {
    await sembrar({ posts: [post({ colaboradores: ["@Marca.Amiga", "otra_cuenta"] })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(JSON.parse(llamadas[0].params.collaborators)).toEqual(["marca.amiga", "otra_cuenta"]);
  });

  it("la copia adaptada (4:5) es la que sale en Instagram; el original sigue en la publicación", async () => {
    const original = { src: "/api/media/clientes/c1/posts/flow.jpg", tipo: "imagen", ancho: 896, alto: 1200 };
    const adaptada = { src: "/api/media/clientes/c1/posts/flow-45.jpg", ancho: 960, alto: 1200 };
    await sembrar({ posts: [post({ medios: [original], adaptados: { [`feed|${original.src}`]: adaptada } })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1", ahoraMismo: true });
    await procesarCola(env);
    expect(llamadas[0].params.image_url).toMatch(/\/flow-45\.jpg$/);
  });

  it("sin copia adaptada, una imagen 3:4 no se programa desde el servidor", async () => {
    await sembrar({ posts: [post({ medios: [{ src: "/api/media/clientes/c1/posts/flow.jpg", tipo: "imagen", ancho: 896, alto: 1200 }] })] });
    await expect(programar(env, acceso(), { calendarId: "cal1", postId: "p1" })).rejects.toThrow(/4:5/);
  });

  it("quitar «también como historia» cancela la historia programada y deja el post", async () => {
    await sembrar({ posts: [post({ historiaTambien: true, historias: [historia(1)] })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1" });
    pasar();
    await resincronizarCalendario(env, acceso(), { id: "cal1", days: JSON.stringify([{ date: "2026-10-05", posts: [post({ historiaTambien: false, historias: [historia(1)] })] }]) });
    expect(filas().map((f) => `${f.variante}:${f.estado}`).sort()).toEqual(["historia:cancelada", "post:programada"]);
  });
});

describe("programar lo aprobado de una vez y la cola del espacio", () => {
  const conSesion = (ruta, opciones = {}) => new Request(`https://calendarios.test${ruta}`, {
    ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
  });
  const lote = (postIds) => worker.fetch(conSesion("/api/publicar/lote", { method: "POST", body: JSON.stringify({ calendarId: "cal1", postIds }) }), env, {});

  it("programa las que pueden salir y devuelve las demás con su motivo, sin parar", async () => {
    await sembrar({ posts: [
      post({ id: "a" }),
      post({ id: "b", redes: ["instagram", "facebook"] }),
      post({ id: "sin", image: null }),
    ] });
    const res = await lote(["a", "b", "sin", "no-existe"]);
    expect(res.status).toBe(200);
    const { programadas, fallidas } = await res.json();
    expect(programadas.map((f) => `${f.postId}:${f.red}`).sort()).toEqual(["a:instagram", "b:facebook", "b:instagram"]);
    expect(fallidas.map((f) => f.postId).sort()).toEqual(["no-existe", "sin"]);
    expect(fallidas.find((f) => f.postId === "sin").motivo).toMatch(/imagen|video|medio/i);
  });

  it("las mismas reglas que una a una: lo que ya salió no se repite y lo programado se sustituye", async () => {
    await sembrar({ posts: [post({ id: "a" }), post({ id: "b" })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "a" });
    db.sqlite.prepare("update publicaciones_programadas set estado = 'publicada', externo_id = 'm' where post_id = 'a'").run();
    await programar(env, acceso(), { calendarId: "cal1", postId: "b" });
    const { programadas, fallidas } = await (await lote(["a", "b"])).json();
    expect(programadas.map((f) => f.postId)).toEqual(["b"]);
    expect(fallidas).toMatchObject([{ postId: "a", motivo: expect.stringMatching(/ya salió/) }]);
    const vivas = filas().filter((f) => f.post_id === "b" && f.estado === "programada");
    expect(vivas).toHaveLength(1);
  });

  it("una red sin cuenta se salta; sin ninguna, el motivo lo dice", async () => {
    await sembrar({ posts: [post({ id: "a", redes: ["instagram", "tiktok"] }), post({ id: "t", redes: ["tiktok"] })], cuentas: ["instagram"] });
    const { programadas, fallidas } = await (await lote(["a", "t"])).json();
    expect(programadas.map((f) => `${f.postId}:${f.red}`)).toEqual(["a:instagram"]);
    expect(fallidas[0]).toMatchObject({ postId: "t", motivo: expect.stringMatching(/ninguna cuenta/) });
  });

  it("veinte publicaciones caben en el límite de consultas del plan gratuito", async () => {
    const posts = Array.from({ length: 20 }, (_, i) => post({ id: `p${i}`, redes: ["instagram", "facebook"] }));
    await sembrar({ posts });
    const prepare = vi.spyOn(db, "prepare");
    const { programadas } = await (await lote(posts.map((p) => p.id))).json();
    expect(programadas).toHaveLength(40);
    expect(prepare.mock.calls.length).toBeLessThan(50);
  });

  it("la cola del espacio trae lo justo para reconocer cada pieza, y las fallidas por separado", async () => {
    await sembrar({ posts: [post({ id: "a", title: "Lanzamiento de otoño" }), post({ id: "b" })] });
    await programar(env, acceso(), { calendarId: "cal1", postId: "a" });
    await programar(env, acceso(), { calendarId: "cal1", postId: "b" });
    db.sqlite.prepare("update publicaciones_programadas set estado = 'error', error = 'Meta dijo que no' where post_id = 'b'").run();
    const todo = await (await worker.fetch(conSesion("/api/publicar?todo=1"), env, {})).json();
    expect(todo).toHaveLength(2);
    expect(todo.find((f) => f.postId === "a")).toMatchObject({ titulo: "Lanzamiento de otoño", formato: "post", miniatura: IMAGEN, clientId: "c1" });
    expect(JSON.stringify(todo)).not.toMatch(/carga|token/);
    const fallidas = await (await worker.fetch(conSesion("/api/publicar?fallidas=1"), env, {})).json();
    expect(fallidas).toMatchObject([{ postId: "b", error: "Meta dijo que no" }]);
  });

  it("lo publicado hace más de los días pedidos ya no sale en la cola del espacio", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "p1" });
    db.sqlite.prepare("update publicaciones_programadas set estado = 'publicada', publicada_at = '2026-09-01T00:00:00.000Z'").run();
    expect(await (await worker.fetch(conSesion("/api/publicar?todo=1&dias=14"), env, {})).json()).toEqual([]);
    expect(await (await worker.fetch(conSesion("/api/publicar?todo=1&dias=60"), env, {})).json()).toHaveLength(1);
  });
});
