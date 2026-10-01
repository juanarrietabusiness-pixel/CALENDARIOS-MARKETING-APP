import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { firmaValida, firmar, desmenuzar, retoDeSuscripcion, fechaMeta } from "../../worker/lib/bandeja/webhook.js";
import { procesarAviso } from "../../worker/lib/bandeja/almacen.js";
import { crearAcceso, TABLAS_CON_DUENO, TABLAS_CON_CLIENTE } from "../../worker/lib/acceso.js";

// ============================================================
// La bandeja, contra una D1 de verdad y un Meta de mentira
//
// Lo que se comprueba, por orden de gravedad:
//
//   1. La firma del webhook: sin ella, con otra, o con el cuerpo tocado,
//      no se guarda NADA.
//   2. Lo que llega se queda en el espacio y el cliente dueños de la
//      cuenta; de una cuenta sin cliente, o de un cliente con la bandeja
//      apagada, nada.
//   3. Un colaborador no ve ni toca lo de un cliente que no lleva.
//   4. Las acciones llaman a Meta como dice su documentación, y la
//      respuesta privada respeta la ventana de 24 horas EN EL SERVIDOR.
//
// NADA de esto se ha probado contra Meta: el `fetch` de mentira responde
// con la forma de la documentación de la Graph API y de los webhooks.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const COLAB = "u-colab";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra", [COLAB]: "t-colab" };
const SECRETO = "secreto-de-la-app-de-meta";

let db;
let env;
let llamadas;

/** La Graph API, con lo justo que usa la bandeja. */
function graphFalsa({ fallar = [] } = {}) {
  return vi.fn(async (entrada, opciones = {}) => {
    const u = new URL(String(entrada));
    const metodo = opciones.method ?? "GET";
    const params = Object.fromEntries(metodo === "GET" ? u.searchParams : new URLSearchParams(String(opciones.body ?? "")));
    const ruta = u.pathname.replace(/^\/v[\d.]+/, "");
    llamadas.push({ metodo, ruta, params });
    const responder = (datos, estado = 200) => new Response(JSON.stringify(datos), { status: estado, headers: { "content-type": "application/json" } });
    if (fallar.some((f) => ruta.startsWith(f))) return responder({ error: { message: "(#10) Permission denied", code: 10 } }, 403);

    if (ruta.endsWith("/subscribed_apps")) return responder({ success: true });
    if (ruta === "/IG1/media") {
      return responder({ data: [{
        id: "M1", caption: "Nuevo menú", media_type: "IMAGE", media_url: "https://scontent.cdninstagram.com/m1.jpg", permalink: "https://www.instagram.com/p/M1/",
        comments: { data: [{
          id: "IGC1", text: "¿Hacen envíos?", timestamp: "2026-10-01T12:00:00+0000", from: { id: "U9", username: "ana" }, hidden: false,
          replies: { data: [{ id: "IGC2", text: "¡Sí!", timestamp: "2026-10-01T12:05:00+0000", from: { id: "IG1", username: "cafeluna" } }] },
        }] },
      }] });
    }
    if (ruta === "/P1/posts") {
      return responder({ data: [{
        id: "P1_55", message: "Promo", full_picture: "https://scontent.xx.fbcdn.net/p.jpg", permalink_url: "https://www.facebook.com/P1/posts/55",
        comments: { data: [{ id: "55_1", message: "Precio?", created_time: "2026-10-01T11:00:00+0000", from: { id: "F1", name: "Beto" } }] },
      }] });
    }
    if (ruta === "/P1/conversations") {
      const ig = params.platform === "instagram";
      return responder({ data: [{
        id: ig ? "convIG" : "convFB",
        participants: { data: [ig ? { id: "IG1", username: "cafeluna" } : { id: "P1", name: "Café Luna" }, ig ? { id: "S9", username: "carla" } : { id: "S1", name: "Dora" }] },
        messages: { data: [{ id: ig ? "mIG1" : "mFB1", message: "Hola", from: { id: ig ? "S9" : "S1" }, created_time: new Date(Date.now() - 3600_000).toJSON() }] },
      }] });
    }
    if (ruta === "/P1/messages") return responder({ recipient_id: params.recipient, message_id: "m-salida-1" });
    if (/\/(replies|comments)$/.test(ruta) && metodo === "POST") return responder({ id: "respuesta-1" });
    if (metodo === "POST" || metodo === "DELETE") return responder({ success: true });
    if (ruta === "/P1_77") return responder({ message: "Otra publicación", full_picture: "https://scontent.xx.fbcdn.net/77.jpg", permalink_url: "https://www.facebook.com/77" });
    if (/^\/S\d$/.test(ruta)) return responder({ name: "Persona de prueba" });
    return responder({ error: { message: `Ruta no prevista ${ruta}`, code: 100 } }, 400);
  });
}

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRA, "otra@b.com"], [COLAB, "colab@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#123456");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Colab", "#654321", '["c2"]');
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  const token = await cifrarMeta(env, "token-de-pagina");
  const cuenta = (id, owner, red, externo, pagina, cliente, nombre) =>
    s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, pagina_id, token_cifrado, client_id, nombre, usuario) values (?,?,?,?,?,?,?,?,?)")
      .run(id, owner, red, externo, pagina, token, cliente, nombre, red === "instagram" ? "cafeluna" : "");
  cuenta("j-fb", JEFE, "facebook", "P1", "P1", "c1", "Café Luna");
  cuenta("j-ig", JEFE, "instagram", "IG1", "P1", "c1", "Café Luna");
  cuenta("j-fb2", JEFE, "facebook", "P2", "P2", "c2", "Baby Caleb");
  cuenta("j-fb3", JEFE, "facebook", "P3", "P3", null, "Sin cliente");
  // La MISMA página conectada en otro espacio: lo suyo es suyo.
  cuenta("o-fb", OTRA, "facebook", "P1", "P1", "c9", "Café Luna (otra agencia)");
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env, {});

const encender = (quien, cliente, activa = true) => pedir(quien, `/api/bandeja/clientes/${cliente}`, { method: "PUT", body: { activa } });

/** Un aviso de Meta, firmado (o no) como lo firma Meta. */
async function avisar(aviso, { firma = "buena", alterar = false } = {}) {
  const cuerpo = JSON.stringify(aviso);
  const enviado = alterar ? cuerpo.replace("Hola", "Adiós") : cuerpo;
  const headers = { "Content-Type": "application/json" };
  if (firma === "buena") headers["X-Hub-Signature-256"] = await firmar(SECRETO, cuerpo);
  if (firma === "otra") headers["X-Hub-Signature-256"] = await firmar("otro-secreto", cuerpo);
  if (firma === "rota") headers["X-Hub-Signature-256"] = "sha1=abc";
  return worker.fetch(new Request("https://calendarios.test/api/webhooks/meta", { method: "POST", body: enviado, headers }), env, {});
}

const comentarioFB = (pagina, comentario, extra = {}) => ({
  object: "page",
  entry: [{ id: pagina, time: 1_790_000_000, changes: [{ field: "feed", value: {
    item: "comment", verb: "add", comment_id: comentario, post_id: `${pagina}_77`, parent_id: `${pagina}_77`,
    message: "Hola, ¿precio?", from: { id: "F1", name: "Beto" }, created_time: 1_790_000_000, ...extra,
  } }] }],
});

const filas = (tabla) => db.sqlite.prepare(`select * from ${tabla}`).all();

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, ASSETS: { fetch: async () => new Response("") }, META_APP_ID: "app", META_APP_SECRET: SECRETO, META_WEBHOOK_VERIFY_TOKEN: "verificar" };
  llamadas = [];
  vi.stubGlobal("fetch", graphFalsa());
  await sembrar();
});
afterEach(() => vi.unstubAllGlobals());

describe("la firma del webhook", () => {
  it("válida: se acepta", async () => {
    const cuerpo = new TextEncoder().encode('{"object":"page","entry":[]}');
    expect(await firmaValida(SECRETO, cuerpo, await firmar(SECRETO, cuerpo))).toBe(true);
  });

  it("inválida, ausente, con otro algoritmo o sin secreto: se rechaza", async () => {
    const cuerpo = new TextEncoder().encode('{"object":"page","entry":[]}');
    const buena = await firmar(SECRETO, cuerpo);
    expect(await firmaValida(SECRETO, cuerpo, await firmar("otro", cuerpo))).toBe(false);
    expect(await firmaValida(SECRETO, cuerpo, null)).toBe(false);
    expect(await firmaValida(SECRETO, cuerpo, "")).toBe(false);
    expect(await firmaValida(SECRETO, cuerpo, buena.replace("sha256=", "sha1="))).toBe(false);
    expect(await firmaValida(SECRETO, cuerpo, buena.slice(0, -2))).toBe(false);
    expect(await firmaValida("", cuerpo, buena)).toBe(false);
  });

  it("con el cuerpo alterado (un solo carácter), se rechaza", async () => {
    const cuerpo = '{"object":"page","entry":[{"id":"P1"}]}';
    const firma = await firmar(SECRETO, cuerpo);
    expect(await firmaValida(SECRETO, new TextEncoder().encode(cuerpo.replace("P1", "P2")), firma)).toBe(false);
  });

  it("se firma el cuerpo CRUDO: el JSON con los no ASCII escapados, como lo manda Meta", async () => {
    const crudo = '{"object":"page","entry":[{"id":"P1","changes":[{"field":"feed","value":{"message":"\\u00bfPrecio?"}}]}]}';
    const firma = await firmar(SECRETO, crudo);
    expect(await firmaValida(SECRETO, new TextEncoder().encode(crudo), firma)).toBe(true);
    // Volver a serializar lo leído da otra cadena, y otra firma.
    expect(await firmaValida(SECRETO, new TextEncoder().encode(JSON.stringify(JSON.parse(crudo))), firma)).toBe(false);
  });

  it("por la ruta: sin firma, con otra, rota o con el cuerpo tocado, 403 y nada guardado", async () => {
    await encender(JEFE, "c1");
    for (const opciones of [{ firma: "ninguna" }, { firma: "otra" }, { firma: "rota" }, { alterar: true }]) {
      const res = await avisar(comentarioFB("P1", "c-1"), opciones);
      expect(res.status, JSON.stringify(opciones)).toBe(403);
    }
    expect(filas("bandeja_comentarios")).toHaveLength(0);
    const ok = await avisar(comentarioFB("P1", "c-1"));
    expect(ok.status).toBe(200);
    expect(filas("bandeja_comentarios")).toHaveLength(1);
  });

  it("la verificación: el reto sólo vuelve con el testigo exacto", () => {
    const url = (t, reto = "123") => new URL(`https://x/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${t}&hub.challenge=${reto}`);
    expect(retoDeSuscripcion(url("verificar"), "verificar")).toBe("123");
    expect(retoDeSuscripcion(url("verificarX"), "verificar")).toBeNull();
    expect(retoDeSuscripcion(url("verificar"), "")).toBeNull();
    expect(retoDeSuscripcion(url("verificar", "<script>"), "verificar")).toBeNull();
  });
});

describe("lo que dice un aviso", () => {
  it("Facebook: comentario, respuesta, y la publicación como padre no cuenta", () => {
    const [primero] = desmenuzar(comentarioFB("P1", "c-1"));
    expect(primero).toMatchObject({ tipo: "comentario", red: "facebook", cuenta: "P1", externoId: "c-1", padreId: null, publicacionId: "P1_77", autor: "Beto" });
    const [respuesta] = desmenuzar(comentarioFB("P1", "c-2", { parent_id: "c-1" }));
    expect(respuesta.padreId).toBe("c-1");
  });

  it("Instagram: comentarios y mensajes; un eco es propio y el hilo es de la otra persona", () => {
    const s = desmenuzar({
      object: "instagram",
      entry: [{
        id: "IG1", time: 1_790_000_000,
        changes: [{ field: "comments", value: { id: "IGC9", text: "Me encanta", from: { id: "U1", username: "ana" }, media: { id: "M1" } } }],
        messaging: [
          { sender: { id: "S9" }, recipient: { id: "IG1" }, timestamp: 1_790_000_000_000, message: { mid: "m1", text: "Hola" } },
          { sender: { id: "IG1" }, recipient: { id: "S9" }, timestamp: 1_790_000_100_000, message: { mid: "m2", text: "¡Hola!", is_echo: true } },
          { sender: { id: "S9" }, recipient: { id: "IG1" }, timestamp: 1, read: { mid: "m1" } },
        ],
      }],
    });
    expect(s.map((x) => x.tipo)).toEqual(["comentario", "mensaje", "mensaje"]);
    expect(s[0]).toMatchObject({ autor: "ana", publicacionId: "M1" });
    expect(s[1]).toMatchObject({ propio: false, usuarioId: "S9" });
    expect(s[2]).toMatchObject({ propio: true, usuarioId: "S9" });
  });

  it("lo que no es de Meta, o no es comentario ni mensaje, no da nada", () => {
    expect(desmenuzar({ object: "user", entry: [{ id: "1" }] })).toEqual([]);
    expect(desmenuzar({ object: "page", entry: [{ id: "P1", changes: [{ field: "feed", value: { item: "reaction" } }] }] })).toEqual([]);
    expect(desmenuzar(null)).toEqual([]);
  });

  it("las fechas de Meta: segundos, milisegundos e ISO con +0000", () => {
    expect(fechaMeta(1_790_000_000)).toBe(new Date(1_790_000_000_000).toJSON());
    expect(fechaMeta(1_790_000_000_000)).toBe(new Date(1_790_000_000_000).toJSON());
    expect(fechaMeta("2026-10-01T12:00:00+0000")).toBe("2026-10-01T12:00:00.000Z");
  });
});

describe("cada cosa a su espacio y a su cliente", () => {
  it("las tablas de la bandeja están declaradas con dueño y con cliente", () => {
    for (const t of ["bandeja_clientes", "bandeja_comentarios", "bandeja_hilos", "bandeja_mensajes"]) {
      expect(TABLAS_CON_DUENO).toContain(t);
      expect(TABLAS_CON_CLIENTE).toContain(t);
    }
  });

  it("con la bandeja apagada no se guarda NADA de ese cliente", async () => {
    const r = await procesarAviso(env, comentarioFB("P1", "c-1"));
    expect(r).toMatchObject({ guardados: 0, descartados: 1 });
    expect(filas("bandeja_comentarios")).toHaveLength(0);
  });

  it("encendida, se guarda en el espacio y el cliente dueños de la página; la otra agencia con la misma página, nada", async () => {
    await encender(JEFE, "c1");
    const r = await procesarAviso(env, comentarioFB("P1", "c-1"));
    expect(r).toMatchObject({ guardados: 1, descartados: 0 });
    const [f] = filas("bandeja_comentarios");
    expect(f).toMatchObject({ owner_id: JEFE, client_id: "c1", cuenta_id: "j-fb", red: "facebook", texto: "Hola, ¿precio?", atendido: 0, propio: 0 });
    // La miniatura de la publicación se pidió a Meta, una vez.
    expect(f.publicacion_miniatura).toBe("https://scontent.xx.fbcdn.net/77.jpg");
    expect(llamadas.filter((l) => l.ruta === "/P1_77")).toHaveLength(1);
    // La otra agencia tiene la misma página y su cliente con la bandeja apagada: no ve nada.
    const suyas = await (await pedir(OTRA, "/api/bandeja/comentarios")).json();
    expect(suyas).toEqual([]);
  });

  it("si las dos agencias la tienen encendida, cada una tiene SU copia", async () => {
    await encender(JEFE, "c1");
    await encender(OTRA, "c9");
    await procesarAviso(env, comentarioFB("P1", "c-1"));
    expect(filas("bandeja_comentarios").map((f) => f.owner_id).sort()).toEqual([JEFE, OTRA].sort());
  });

  it("lo que llega de una página sin cliente, o que nadie tiene, se descarta", async () => {
    await encender(JEFE, "c1");
    expect(await procesarAviso(env, comentarioFB("P3", "x"))).toMatchObject({ guardados: 0, descartados: 1 });
    expect(await procesarAviso(env, comentarioFB("P404", "y"))).toMatchObject({ guardados: 0, descartados: 1 });
    expect(filas("bandeja_comentarios")).toHaveLength(0);
  });

  it("el mismo comentario dos veces es UNA fila, y lo atendido no lo pisa Meta", async () => {
    await encender(JEFE, "c1");
    await procesarAviso(env, comentarioFB("P1", "c-1"));
    const [f] = filas("bandeja_comentarios");
    await pedir(JEFE, `/api/bandeja/comentarios/${encodeURIComponent(f.id)}/atendido`, { method: "POST", body: { atendido: true } });
    await procesarAviso(env, comentarioFB("P1", "c-1", { verb: "edited", message: "Hola, ¿precio? (editado)" }));
    const todas = filas("bandeja_comentarios");
    expect(todas).toHaveLength(1);
    expect(todas[0]).toMatchObject({ atendido: 1, texto: "Hola, ¿precio? (editado)" });
    await procesarAviso(env, comentarioFB("P1", "c-1", { verb: "hide" }));
    expect(filas("bandeja_comentarios")[0].oculto).toBe(1);
    await procesarAviso(env, comentarioFB("P1", "c-1", { verb: "remove" }));
    expect(filas("bandeja_comentarios")).toHaveLength(0);
  });

  it("un mensaje abre su hilo con nombre y ventana; el eco no lo deja pendiente", async () => {
    await encender(JEFE, "c1");
    const ahora = Date.now();
    await procesarAviso(env, { object: "page", entry: [{ id: "P1", time: ahora, messaging: [
      { sender: { id: "S1" }, recipient: { id: "P1" }, timestamp: ahora - 60_000, message: { mid: "mid-1", text: "Hola" } },
    ] }] });
    let [h] = filas("bandeja_hilos");
    expect(h).toMatchObject({ client_id: "c1", usuario_id: "S1", usuario: "Persona de prueba", sin_leer: 1, atendido: 0, ultimo_texto: "Hola" });
    expect(h.ultimo_usuario_at).toBe(new Date(ahora - 60_000).toJSON());
    await procesarAviso(env, { object: "page", entry: [{ id: "P1", time: ahora, messaging: [
      { sender: { id: "P1" }, recipient: { id: "S1" }, timestamp: ahora, message: { mid: "mid-2", text: "¡Hola!", is_echo: true } },
    ] }] });
    [h] = filas("bandeja_hilos");
    expect(h).toMatchObject({ ultimo_texto: "¡Hola!", sin_leer: 1 });
    expect(h.ultimo_usuario_at).toBe(new Date(ahora - 60_000).toJSON());
    expect(filas("bandeja_mensajes")).toHaveLength(2);
  });

  it("un colaborador no ve ni toca lo de un cliente que no lleva", async () => {
    await encender(JEFE, "c1");
    await procesarAviso(env, comentarioFB("P1", "c-1"));
    const [f] = filas("bandeja_comentarios");
    expect(await (await pedir(COLAB, "/api/bandeja/comentarios")).json()).toEqual([]);
    expect((await pedir(COLAB, `/api/bandeja/comentarios/${encodeURIComponent(f.id)}/atendido`, { method: "POST", body: {} })).status).toBe(404);
    expect((await encender(COLAB, "c1", false)).status).toBe(404);
    expect(await (await pedir(COLAB, "/api/bandeja/pendientes")).json()).toEqual({ comentarios: 0, mensajes: 0 });
    expect(await (await pedir(JEFE, "/api/bandeja/pendientes")).json()).toEqual({ comentarios: 1, mensajes: 0 });
  });

  it("otro espacio no alcanza un comentario por su id", async () => {
    await encender(JEFE, "c1");
    await procesarAviso(env, comentarioFB("P1", "c-1"));
    const [f] = filas("bandeja_comentarios");
    expect((await pedir(OTRA, `/api/bandeja/comentarios/${encodeURIComponent(f.id)}`, { method: "DELETE" })).status).toBe(404);
    expect(filas("bandeja_comentarios")).toHaveLength(1);
  });

  it("apagada, lo guardado deja de verse y de contar", async () => {
    await encender(JEFE, "c1");
    await procesarAviso(env, comentarioFB("P1", "c-1"));
    await encender(JEFE, "c1", false);
    expect(await (await pedir(JEFE, "/api/bandeja/comentarios")).json()).toEqual([]);
    expect(await (await pedir(JEFE, "/api/bandeja/pendientes")).json()).toEqual({ comentarios: 0, mensajes: 0 });
  });
});

describe("el interruptor y la suscripción de la página", () => {
  it("encender suscribe la página con feed y messages (una vez aunque el Instagram cuelgue de ella); apagar la da de baja", async () => {
    const res = await encender(JEFE, "c1");
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r).toMatchObject({ activa: true, suscripcion: { paginas: ["P1"], errores: [] } });
    const altas = llamadas.filter((l) => l.ruta === "/P1/subscribed_apps");
    expect(altas).toHaveLength(1);
    expect(altas[0]).toMatchObject({ metodo: "POST", params: { subscribed_fields: "feed,messages", access_token: "token-de-pagina" } });
    await encender(JEFE, "c1", false);
    expect(llamadas.at(-1)).toMatchObject({ metodo: "DELETE", ruta: "/P1/subscribed_apps" });
  });

  it("si Meta no acepta la suscripción, el interruptor queda encendido y dice por qué", async () => {
    vi.stubGlobal("fetch", graphFalsa({ fallar: ["/P1/subscribed_apps"] }));
    const r = await (await encender(JEFE, "c1")).json();
    expect(r.activa).toBe(true);
    expect(r.suscripcion.errores[0]).toMatch(/Meta no dio permiso/);
  });

  it("sin cuentas de Meta no se enciende", async () => {
    db.sqlite.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c3", JEFE, "Sin redes");
    const res = await encender(JEFE, "c3");
    expect(res.status).toBe(409);
  });

  it("el estado dice qué permisos faltan y si el webhook está configurado", async () => {
    db.sqlite.prepare("insert into integracion_meta (id, owner_id, token_cifrado, permisos) values (?,?,?,?)")
      .run(JEFE, JEFE, "x", JSON.stringify(["instagram_manage_comments", "pages_messaging"]));
    const r = await (await pedir(JEFE, "/api/bandeja")).json();
    expect(r.meta).toMatchObject({ conectado: true, webhook: true, puedePedirPermisos: true, urlWebhook: "https://calendarios.test/api/webhooks/meta" });
    expect(r.meta.faltan).toEqual(["pages_manage_metadata", "pages_manage_engagement", "instagram_manage_messages"]);
    expect(r.clientes.map((c) => c.clientId).sort()).toEqual(["c1", "c2"]);
  });
});

describe("«Actualizar» y las acciones", () => {
  beforeEach(async () => { await encender(JEFE, "c1"); llamadas.length = 0; });

  it("«Actualizar» lee comentarios y conversaciones en cuatro llamadas y los guarda", async () => {
    const r = await (await pedir(JEFE, "/api/bandeja/clientes/c1/actualizar", { method: "POST" })).json();
    expect(r.avisos).toEqual([]);
    expect(llamadas).toHaveLength(4);
    const lista = await (await pedir(JEFE, "/api/bandeja/comentarios")).json();
    expect(lista.map((c) => c.externoId).sort()).toEqual(["55_1", "IGC1", "IGC2"]);
    const respuesta = lista.find((c) => c.externoId === "IGC2");
    expect(respuesta).toMatchObject({ propio: true, atendido: true, padreId: "IGC1" });
    expect(lista.find((c) => c.externoId === "IGC1").publicacion.miniatura).toBe(`/api/metricas/miniatura?u=${encodeURIComponent("https://scontent.cdninstagram.com/m1.jpg")}`);
    const hilos = await (await pedir(JEFE, "/api/bandeja/mensajes")).json();
    expect(hilos.map((h) => h.usuario).sort()).toEqual(["@carla", "Dora"]);
  });

  it("sin el permiso de mensajes, trae los comentarios igual y lo dice", async () => {
    vi.stubGlobal("fetch", graphFalsa({ fallar: ["/P1/conversations"] }));
    const r = await (await pedir(JEFE, "/api/bandeja/clientes/c1/actualizar", { method: "POST" })).json();
    expect(r.comentarios).toBeGreaterThan(0);
    expect(r.avisos.join(" ")).toMatch(/Mensajes de Messenger: Meta no dio permiso/);
  });

  it("apagada, «Actualizar» no pregunta a Meta", async () => {
    await encender(JEFE, "c1", false);
    llamadas.length = 0;
    expect((await pedir(JEFE, "/api/bandeja/clientes/c1/actualizar", { method: "POST" })).status).toBe(409);
    expect(llamadas).toHaveLength(0);
  });

  it("responder, ocultar y borrar llaman a Meta como dice su documentación", async () => {
    await pedir(JEFE, "/api/bandeja/clientes/c1/actualizar", { method: "POST" });
    const lista = await (await pedir(JEFE, "/api/bandeja/comentarios")).json();
    const ig = lista.find((c) => c.externoId === "IGC1");
    const fb = lista.find((c) => c.externoId === "55_1");
    llamadas.length = 0;

    const r = await pedir(JEFE, `/api/bandeja/comentarios/${encodeURIComponent(ig.id)}/responder`, { method: "POST", body: { texto: "¡Claro!" } });
    expect(r.status).toBe(201);
    expect(llamadas[0]).toMatchObject({ metodo: "POST", ruta: "/IGC1/replies", params: { message: "¡Claro!" } });
    await pedir(JEFE, `/api/bandeja/comentarios/${encodeURIComponent(fb.id)}/responder`, { method: "POST", body: { texto: "Te escribimos" } });
    expect(llamadas[1]).toMatchObject({ metodo: "POST", ruta: "/55_1/comments" });
    const tras = await (await pedir(JEFE, "/api/bandeja/comentarios")).json();
    expect(tras.find((c) => c.id === ig.id)).toMatchObject({ atendido: true, respondido: true });

    await pedir(JEFE, `/api/bandeja/comentarios/${encodeURIComponent(ig.id)}/ocultar`, { method: "POST", body: { oculto: true } });
    expect(llamadas.at(-1)).toMatchObject({ metodo: "POST", ruta: "/IGC1", params: { hide: "true" } });
    await pedir(JEFE, `/api/bandeja/comentarios/${encodeURIComponent(fb.id)}/ocultar`, { method: "POST", body: { oculto: true } });
    expect(llamadas.at(-1)).toMatchObject({ metodo: "POST", ruta: "/55_1", params: { is_hidden: "true" } });

    expect((await pedir(JEFE, `/api/bandeja/comentarios/${encodeURIComponent(fb.id)}`, { method: "DELETE" })).status).toBe(200);
    expect(llamadas.at(-1)).toMatchObject({ metodo: "DELETE", ruta: "/55_1" });
    expect((await (await pedir(JEFE, "/api/bandeja/comentarios")).json()).some((c) => c.id === fb.id)).toBe(false);
  });

  it("una respuesta vacía no sale", async () => {
    await pedir(JEFE, "/api/bandeja/clientes/c1/actualizar", { method: "POST" });
    const [c] = await (await pedir(JEFE, "/api/bandeja/comentarios")).json();
    llamadas.length = 0;
    expect((await pedir(JEFE, `/api/bandeja/comentarios/${encodeURIComponent(c.id)}/responder`, { method: "POST", body: { texto: "  " } })).status).toBe(400);
    expect(llamadas).toHaveLength(0);
  });

  it("el mensaje privado sale dentro de las 24 horas, y fuera de ellas el SERVIDOR lo rechaza sin llamar a Meta", async () => {
    await pedir(JEFE, "/api/bandeja/clientes/c1/actualizar", { method: "POST" });
    const hilos = await (await pedir(JEFE, "/api/bandeja/mensajes")).json();
    const fb = hilos.find((h) => h.red === "facebook");
    llamadas.length = 0;
    const ok = await pedir(JEFE, `/api/bandeja/hilos/${encodeURIComponent(fb.id)}/responder`, { method: "POST", body: { texto: "¡Hola, Dora!" } });
    expect(ok.status).toBe(201);
    expect(llamadas[0]).toMatchObject({ metodo: "POST", ruta: "/P1/messages", params: { messaging_type: "RESPONSE" } });
    expect(JSON.parse(llamadas[0].params.recipient)).toEqual({ id: "S1" });
    expect(JSON.parse(llamadas[0].params.message)).toEqual({ text: "¡Hola, Dora!" });
    const hilo = await (await pedir(JEFE, `/api/bandeja/hilos/${encodeURIComponent(fb.id)}`)).json();
    expect(hilo.mensajes.at(-1)).toMatchObject({ propio: true, texto: "¡Hola, Dora!" });
    expect(hilo.hilo.atendido).toBe(true);

    // Su último mensaje fue hace 25 horas.
    db.sqlite.prepare("update bandeja_hilos set ultimo_usuario_at = ? where id = ?").run(new Date(Date.now() - 25 * 3600_000).toJSON(), fb.id);
    llamadas.length = 0;
    const fuera = await pedir(JEFE, `/api/bandeja/hilos/${encodeURIComponent(fb.id)}/responder`, { method: "POST", body: { texto: "¿Sigues ahí?" } });
    expect(fuera.status).toBe(409);
    expect((await fuera.json()).error).toMatch(/24 horas/);
    expect(llamadas).toHaveLength(0);
  });

  it("el mensaje de Instagram sale por la página de la que cuelga", async () => {
    await pedir(JEFE, "/api/bandeja/clientes/c1/actualizar", { method: "POST" });
    const ig = (await (await pedir(JEFE, "/api/bandeja/mensajes")).json()).find((h) => h.red === "instagram");
    llamadas.length = 0;
    await pedir(JEFE, `/api/bandeja/hilos/${encodeURIComponent(ig.id)}/responder`, { method: "POST", body: { texto: "Hola" } });
    expect(llamadas[0]).toMatchObject({ ruta: "/P1/messages" });
    expect(JSON.parse(llamadas[0].params.recipient)).toEqual({ id: "S9" });
  });
});

describe("la capa de acceso con las tablas de la bandeja", () => {
  it("un colaborador sólo lee los suyos (client_id in …)", async () => {
    const a = crearAcceso(db, JEFE, { clientes: ["c2"] });
    db.sqlite.prepare("insert into bandeja_clientes (id, owner_id, client_id, activa) values (?,?,?,?)").run("c1", JEFE, "c1", 1);
    expect(await a.leer("bandeja_clientes")).toEqual([]);
  });
});
