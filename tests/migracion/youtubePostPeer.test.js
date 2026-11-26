import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { programar, procesarPublicacion } from "../../worker/lib/publicador.js";
import { cuerpoYouTube, leerPublicacion } from "../../worker/lib/postpeer.js";

// ============================================================
// YouTube por PostPeer (26-nov-2026, decisión de Juan: su canal está conectado en PostPeer)
//
// PostPeer es de mentira —contesta como dice su documentación (www.postpeer.dev/docs/platforms/youtube y
// /docs/posts/create-post)—; la base, no. Lo que importa: que el video salga una vez, con lo que preparó
// preparar_youtube (título, descripción, categoría Música, miniatura, privacidad), y que el id se guarde antes que nada.
// ============================================================

const DUENO = "u-jefe";
const VIDEO = "/api/media/clientes/c1/estudio/bendecidos.mp4";
const MINIATURA = "/api/media/clientes/c1/estudio/miniatura.jpg";
let db;
let env;
let llamadas;
let respuestas;

function post(extra = {}) {
  return {
    id: "y1", format: "post", title: "BENDECIDOS", descripcion: "Somos bendecidos", publishTime: "10:00", redes: ["youtube"], status: "approved",
    medios: [{ src: VIDEO, tipo: "video", ancho: 1920, alto: 1080, duracion: 193.5 }],
    youtube: { titulo: "BENDECIDOS (video oficial)", descripcion: "BENDECIDOS\n\nCapítulos:\n0:00 Intro", etiquetas: ["57dmc", "worship"], categoria: "10", miniatura: MINIATURA, privacidad: "unlisted" },
    ...extra,
  };
}

async function sembrar(posts = [post()]) {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", DUENO, "57DMC");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days, opciones) values (?,?,?,?,?,?,?,?)")
    .run("cal1", "c1", DUENO, "Diciembre", 11, 2026, JSON.stringify([{ date: "2026-12-05", posts }]), "{}");
  s.prepare("insert into integracion_meta (id, owner_id, token_cifrado, origen) values (?,?,?,?)")
    .run(DUENO, DUENO, await cifrarMeta(env, "token-de-usuario"), "https://calendarios.test");
  // El canal de YouTube, por PostPeer: sin token de Google.
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, client_id, datos, nombre) values (?,?,?,?,?,?,?)")
    .run(`${DUENO}:youtube:yt_789`, DUENO, "youtube", "yt_789", "c1", JSON.stringify({ via: "postpeer", origen: "https://calendarios.test" }), "57DMC");
}

const filas = () => db.sqlite.prepare("select * from publicaciones_programadas order by created_at").all().map((f) => ({ ...f }));
const acceso = () => crearAcceso(db, DUENO);

beforeEach(() => {
  db = d1EnMemoria();
  llamadas = [];
  respuestas = {
    "POST /v1/posts": { success: true, status: "publishing", postId: "post_ghi789", platforms: [{ platform: "youtube", success: true }] },
    "GET /v1/posts/post_ghi789": { success: true, data: { id: "post_ghi789", status: "published", platforms: [{ platform: "youtube", status: "published", platformPostUrl: "https://www.youtube.com/watch?v=abc" }] } },
  };
  env = {
    DB: db, META_APP_ID: "app", META_APP_SECRET: "secreto", POSTPEER_API_KEY: "pp_llave",
    MEDIA: { head: async (k) => ({ size: 1000, key: k, httpMetadata: { contentType: k.endsWith(".mp4") ? "video/mp4" : "image/jpeg" } }) },
  };
  vi.stubGlobal("fetch", vi.fn(async (entrada, init = {}) => {
    const u = new URL(String(entrada));
    const metodo = init.method ?? "GET";
    llamadas.push({ metodo, ruta: u.pathname, cuerpo: init.body ? JSON.parse(String(init.body)) : null, llave: init.headers?.["x-access-key"] ?? init.headers?.get?.("x-access-key") });
    const r = respuestas[`${metodo} ${u.pathname}`];
    return new Response(JSON.stringify(r ?? { error: "sin respuesta" }), { status: r ? 200 : 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("YouTube por PostPeer", () => {
  it("el cuerpo: la descripción en content; título, etiquetas, privacidad, Música, no es para niños; la miniatura con el video", () => {
    const c = cuerpoYouTube({
      descripcion: "Letra…", titulo: "Un <título>", etiquetas: ["#a", "b"], visibilidad: "unlisted", categoria: "10",
      accountId: "yt_789", urlVideo: "https://x/v.mp4", urlMiniatura: "https://x/m.jpg", clave: "fila1",
    });
    expect(c).toEqual({
      content: "Letra…",
      platforms: [{ platform: "youtube", accountId: "yt_789", platformSpecificData: { title: "Un título", tags: ["a", "b"], visibility: "unlisted", categoryId: "10", madeForKids: false } }],
      mediaItems: [{ type: "video", url: "https://x/v.mp4", thumbnail: "https://x/m.jpg" }],
      publishNow: true, idempotencyKey: "fila1",
    });
    expect(cuerpoYouTube({ accountId: "a", urlVideo: "u", visibilidad: "otra" }).platforms[0].platformSpecificData.visibility).toBe("public");
    // La respuesta se lee por la plataforma de YouTube.
    expect(leerPublicacion({ data: { id: "p", platforms: [{ platform: "youtube", status: "published", platformPostUrl: "https://www.youtube.com/watch?v=abc" }] } }, "youtube"))
      .toMatchObject({ postId: "p", estado: "publicada", enlace: "https://www.youtube.com/watch?v=abc" });
  });

  it("se programa con la cuenta de PostPeer (sin token de Google) y sale UNA vez, con lo que preparó preparar_youtube", async () => {
    await sembrar();
    await programar(env, acceso(), { calendarId: "cal1", postId: "y1", ahoraMismo: true });
    const [f] = filas();
    expect(f.red).toBe("youtube");
    await procesarPublicacion(env, { id: f.id, owner_id: DUENO });
    // PostPeer contestó «publishing»: el id ya está guardado y la fila espera.
    expect(filas()[0]).toMatchObject({ contenedor_id: "post_ghi789" });
    expect(filas()[0].estado).not.toBe("publicada");
    // La vuelta siguiente PREGUNTA (no manda otra): ya salió.
    db.sqlite.prepare("update publicaciones_programadas set siguiente_intento = null, estado = 'programada', updated_at = '2000-01-01T00:00:00.000Z' where id = ?").run(f.id);
    await procesarPublicacion(env, { id: f.id, owner_id: DUENO });
    expect(llamadas.some((l) => l.metodo === "GET" && l.ruta === "/v1/posts/post_ghi789")).toBe(true);
    const envio = llamadas.find((l) => l.metodo === "POST" && l.ruta === "/v1/posts");
    expect(envio.cuerpo.platforms[0]).toMatchObject({
      platform: "youtube", accountId: "yt_789",
      platformSpecificData: { title: "BENDECIDOS (video oficial)", tags: ["57dmc", "worship"], visibility: "unlisted", categoryId: "10", madeForKids: false },
    });
    expect(envio.cuerpo.content).toMatch(/^BENDECIDOS\n\nCapítulos:/);
    expect(envio.cuerpo.mediaItems[0].url).toMatch(/^https:\/\/calendarios\.test\/api\/medio-publico\//);
    expect(envio.cuerpo.mediaItems[0].thumbnail).toMatch(/^https:\/\/calendarios\.test\/api\/medio-publico\//);
    expect(envio.cuerpo.idempotencyKey).toBe(f.id);
    const despues = filas()[0];
    expect(despues.contenedor_id).toBe("post_ghi789");
    expect(despues.estado).toBe("publicada");
    expect(despues.enlace).toBe("https://www.youtube.com/watch?v=abc");
    // Otra vuelta no la manda otra vez.
    await procesarPublicacion(env, { id: f.id, owner_id: DUENO });
    expect(llamadas.filter((l) => l.metodo === "POST" && l.ruta === "/v1/posts")).toHaveLength(1);
    // Ni una sola llamada a Google.
    expect(llamadas.every((l) => !String(l.ruta).includes("youtube/v3"))).toBe(true);
  });

  it("sin la llave de PostPeer lo dice; sin video subido, no se programa", async () => {
    await sembrar([post({ medios: [] })]);
    await expect(programar(env, acceso(), { calendarId: "cal1", postId: "y1", ahoraMismo: true })).rejects.toThrow(/video/);
  });
});
