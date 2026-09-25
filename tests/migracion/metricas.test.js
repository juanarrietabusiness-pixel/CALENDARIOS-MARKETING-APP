import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { fotografiarCuenta, fotoPendiente, fechaDeFoto } from "../../worker/lib/metricas.js";

// ============================================================
// La foto diaria de métricas, contra una D1 de verdad
//
// Lo que importa: que una métrica que Meta ya no da no tumbe la foto,
// que el cron tome UNA cuenta por vuelta (los límites del plan
// gratuito), y que lo que sale por la API sea sólo del espacio.
// ============================================================

const DUENO = "u-jefe";
const TESTIGO = "testigo-de-sesion-de-prueba";
let db;
let env;
let llamadas;
let respuestas;

async function sembrar() {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("otro", "otro@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, competidores) values (?,?,?,?)").run("c1", DUENO, "Café Luna", JSON.stringify(["rival.cafe"]));
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("ajeno", "otro", "De otra agencia");
  const token = await cifrarMeta(env, "token-de-pagina");
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, nombre, usuario, token_cifrado, client_id, updated_at) values (?,?,?,?,?,?,?,?,?)")
    .run("ig", DUENO, "instagram", "IG1", "Café Luna", "cafeluna", token, "c1", "2026-01-01");
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, nombre, token_cifrado, client_id, updated_at) values (?,?,?,?,?,?,?,?)")
    .run("fb", DUENO, "facebook", "PAGE1", "Café Luna", token, "c1", "2026-01-02");
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, token_cifrado, client_id) values (?,?,?,?,?,?)")
    .run("ig-ajeno", "otro", "instagram", "IG9", token, "ajeno");
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T14:00:00.000Z")); // 9:00 en Panamá
  db = d1EnMemoria();
  env = { DB: db, META_APP_ID: "app", META_APP_SECRET: "secreto" };
  llamadas = [];
  respuestas = {
    "/IG1": (p) => (p.fields.startsWith("business_discovery")
      ? { business_discovery: { username: "rival.cafe", followers_count: 5000, media_count: 300, media: { data: [{ like_count: 90, comments_count: 10, timestamp: "2026-10-13T12:00:00+0000" }] } } }
      : { followers_count: 1200, media_count: 80 }),
    "/IG1/insights": (p) => {
      if (p.metric === "follower_demographics") return { data: [{ total_value: { breakdowns: [{ results: [{ dimension_values: [p.breakdown === "gender" ? "F" : "25-34"], value: 700 }] }] } }] };
      // «views» no existe en esta versión: la petición conjunta falla.
      if (p.metric.includes(",") || p.metric === "views") return { __error: { message: "invalid metric", code: 100 } };
      return { data: [{ name: p.metric, total_value: { value: { reach: 800, total_interactions: 95, profile_views: 40, accounts_engaged: 60 }[p.metric] } }] };
    },
    "/IG1/media": { data: [
      { id: "m1", caption: "Nuevo latte", media_type: "VIDEO", media_product_type: "REELS", permalink: "https://instagram.com/p/m1", timestamp: "2026-10-10T23:00:00+0000", like_count: 120, comments_count: 8, thumbnail_url: "https://scontent.cdninstagram.com/m1.jpg" },
      { id: "vieja", caption: "Hace mucho", media_type: "IMAGE", timestamp: "2026-06-01T12:00:00+0000", like_count: 1, comments_count: 0 },
    ] },
    "/m1/insights": { data: [{ name: "reach", values: [{ value: 3000 }] }, { name: "saved", values: [{ value: 25 }] }, { name: "shares", values: [{ value: 12 }] }, { name: "views", values: [{ value: 9000 }] }, { name: "total_interactions", values: [{ value: 165 }] }] },
    "/PAGE1": { followers_count: 400 },
    "/PAGE1/insights": (p) => ({ data: [{ values: [{ value: { page_impressions_unique: 150, page_post_engagements: 20 }[p.metric] ?? 0 }] }] }),
    "/PAGE1/posts": { data: [{ id: "PAGE1_1", message: "Hola", created_time: "2026-10-12T15:00:00+0000", permalink_url: "https://facebook.com/1", reactions: { summary: { total_count: 30 } }, comments: { summary: { total_count: 4 } }, shares: { count: 2 } }] },
  };
  vi.stubGlobal("fetch", vi.fn(async (entrada) => {
    const u = new URL(String(entrada));
    const ruta = u.pathname.replace(/^\/v[\d.]+/, "");
    const params = Object.fromEntries(u.searchParams);
    llamadas.push(ruta);
    const r = typeof respuestas[ruta] === "function" ? respuestas[ruta](params) : respuestas[ruta];
    if (!r || r.__error) return new Response(JSON.stringify({ error: r?.__error ?? { message: "no", code: 100 } }), { status: 400 });
    return new Response(JSON.stringify(r), { status: 200 });
  }));
  await sembrar();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const acceso = () => crearAcceso(db, DUENO);
const cuenta = (id) => db.sqlite.prepare("select * from cuentas_sociales where id = ?").get(id);

describe("la foto de una cuenta", () => {
  it("Instagram: seguidores, métricas del día (una a una si la conjunta falla), audiencia y publicaciones recientes", async () => {
    const fila = await fotografiarCuenta(env, acceso(), { ...cuenta("ig") }, "2026-10-14");
    expect(fila).toMatchObject({ fecha: "2026-10-14", seguidores: 1200, alcance: 800, interacciones: 95, visitas_perfil: 40, vistas: null });
    const datos = JSON.parse(db.sqlite.prepare("select datos from metricas_cuenta where id = 'ig:2026-10-14'").get().datos);
    expect(datos.audiencia.gender[0]).toEqual({ clave: "F", valor: 700 });

    const pubs = db.sqlite.prepare("select * from metricas_publicacion").all();
    expect(pubs).toHaveLength(1);
    expect(pubs[0]).toMatchObject({ externo_id: "m1", tipo: "reel", alcance: 3000, vistas: 9000, interacciones: 165, guardados: 25 });
  });

  it("y la competencia del cliente por business discovery", async () => {
    await fotografiarCuenta(env, acceso(), { ...cuenta("ig") }, "2026-10-14");
    expect(db.sqlite.prepare("select usuario, seguidores, interacciones_promedio from metricas_competencia").get())
      .toEqual({ usuario: "rival.cafe", seguidores: 5000, interacciones_promedio: 100 });
  });

  it("Facebook: seguidores, alcance y publicaciones con sus reacciones", async () => {
    await fotografiarCuenta(env, acceso(), { ...cuenta("fb") }, "2026-10-14");
    expect(db.sqlite.prepare("select seguidores, alcance, interacciones from metricas_cuenta where cuenta_id = 'fb'").get())
      .toEqual({ seguidores: 400, alcance: 150, interacciones: 20 });
    expect(db.sqlite.prepare("select interacciones from metricas_publicacion where cuenta_id = 'fb'").get().interacciones).toBe(36);
  });

  it("repetir la foto del mismo día la reescribe, no la duplica", async () => {
    await fotografiarCuenta(env, acceso(), { ...cuenta("ig") }, "2026-10-14");
    await fotografiarCuenta(env, acceso(), { ...cuenta("ig") }, "2026-10-14");
    expect(db.sqlite.prepare("select count(*) n from metricas_cuenta").get().n).toBe(1);
    expect(db.sqlite.prepare("select count(*) n from metricas_publicacion").get().n).toBe(1);
  });
});

describe("el cron", () => {
  it("antes de las 6:00 de Panamá no hace nada", async () => {
    expect(await fotoPendiente(env, new Date("2026-10-15T10:30:00.000Z"))).toBe(0);
    expect(llamadas).toHaveLength(0);
  });

  it("una cuenta por vuelta, de todos los espacios, hasta que no quede ninguna", async () => {
    const vueltas = [];
    for (let i = 0; i < 5; i++) vueltas.push(await fotoPendiente(env));
    expect(vueltas).toEqual([1, 1, 1, 0, 0]);
    const fotos = db.sqlite.prepare("select cuenta_id from metricas_cuenta order by cuenta_id").all().map((f) => f.cuenta_id);
    expect(fotos).toEqual(["fb", "ig", "ig-ajeno"]);
    expect(fechaDeFoto()).toBe("2026-10-14");
  });

  it("una cuenta cuyo token no vale queda apuntada con el error y no bloquea a las demás", async () => {
    respuestas["/IG1"] = { __error: { message: "token", code: 190 } };
    respuestas["/IG1/media"] = { __error: { message: "token", code: 190 } };
    for (let i = 0; i < 3; i++) await fotoPendiente(env);
    const ig = db.sqlite.prepare("select seguidores, datos from metricas_cuenta where cuenta_id = 'ig'").get();
    expect(ig.seguidores).toBeNull();
    expect(JSON.parse(ig.datos).error).toMatch(/no devolvió datos/);
    // La de Facebook sí se midió (la de la otra agencia tampoco tiene respuesta aquí).
    expect(db.sqlite.prepare("select cuenta_id from metricas_cuenta where seguidores is not null").all().map((f) => f.cuenta_id)).toEqual(["fb"]);
  });
});

describe("por la puerta del Worker", () => {
  const conSesion = (ruta, opciones = {}) => new Request(`https://calendarios.test${ruta}`, {
    ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, ...(opciones.headers ?? {}) },
  });

  it("los resultados de un cliente: cuentas, serie, publicaciones y competencia", async () => {
    await fotografiarCuenta(env, acceso(), { ...cuenta("ig") }, "2026-10-14");
    const res = await worker.fetch(conSesion("/api/metricas/clientes/c1?dias=30"), env, {});
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.cuentas.map((c) => c.red)).toEqual(["facebook", "instagram"]);
    expect(d.serie[0]).toMatchObject({ fecha: "2026-10-14", seguidores: 1200, alcance: 800 });
    expect(d.publicaciones[0].miniatura).toMatch(/^\/api\/metricas\/miniatura\?u=https%3A%2F%2Fscontent\.cdninstagram\.com/);
    expect(d.competencia[0].usuario).toBe("rival.cafe");
    expect(JSON.stringify(d)).not.toMatch(/token/i);
  });

  it("el cliente de otro espacio no existe", async () => {
    expect((await worker.fetch(conSesion("/api/metricas/clientes/ajeno"), env, {})).status).toBe(404);
  });

  it("actualizar una cuenta la mide en el momento", async () => {
    const res = await worker.fetch(conSesion("/api/metricas/cuentas/ig/actualizar", { method: "POST" }), env, {});
    expect(res.status).toBe(200);
    expect((await res.json()).fecha).toBe("2026-10-14");
  });

  it("el resumen de la agencia sólo trae sus clientes", async () => {
    for (let i = 0; i < 3; i++) await fotoPendiente(env);
    const d = await (await worker.fetch(conSesion("/api/metricas/resumen"), env, {})).json();
    expect(d.clientes.map((c) => c.clientId)).toEqual(["c1"]);
    expect(d.clientes[0].seguidores).toBe(1600);
  });

  it("la miniatura sólo sale de los CDN de Meta", async () => {
    const fuera = await worker.fetch(conSesion(`/api/metricas/miniatura?u=${encodeURIComponent("https://malicioso.com/x.jpg")}`), env, {});
    expect(fuera.status).toBe(404);
    const disfrazado = await worker.fetch(conSesion(`/api/metricas/miniatura?u=${encodeURIComponent("https://cdninstagram.com.malicioso.com/x.jpg")}`), env, {});
    expect(disfrazado.status).toBe(404);
    expect(llamadas).toHaveLength(0);
  });
});
