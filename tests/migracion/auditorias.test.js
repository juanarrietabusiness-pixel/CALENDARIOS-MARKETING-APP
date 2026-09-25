import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { generarAuditoria, leerPerfil } from "../../worker/lib/auditorias.js";

// ============================================================
// La auditoría de perfil, contra una D1 de verdad, una Meta y una
// Anthropic de mentira
//
// Lo que importa: de dónde se lee el perfil (la cuenta del cliente o
// business_discovery para un prospecto), que la IA VEA la foto y la
// rejilla, que lo propuesto respete los límites de Instagram, y que el
// enlace público no enseñe nada sin compartir ni las URL del CDN.
// ============================================================

const DUENO = "u-jefe";
const TESTIGO = "testigo-de-sesion-de-prueba";
const SECRETO = "secreto-meta";
let db;
let env;
let llamadas;
let pedidosIA;
let respuestaIA;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "claude-sonnet-5", usage: { input_tokens: 3000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 900 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

const ANALISIS = {
  puntuacion: 62,
  resumen: "Buen producto, perfil a medias.",
  fortalezas: ["Fotos cuidadas"],
  foto: { estado: "mejorable", comentario: "El logo no se lee en pequeño.", recomendacion: "Sólo el símbolo." },
  nombre: { estado: "mal", comentario: "No lleva la palabra clave.", propuesta: "Café Luna | Café de especialidad" },
  bio: { estado: "mejorable", comentario: "No dice dónde están.", opciones: ["☕ Café de especialidad en Panamá", "x".repeat(200)] },
  enlace: { estado: "bien", comentario: "Lleva a WhatsApp." },
  destacados: { estado: "mal", comentario: "No hay capturas.", propuesta: [{ titulo: "Menú", contenido: "Carta y precios" }] },
  rejilla: { estado: "mejorable", comentario: "Colores dispares.", recomendaciones: ["Una paleta"] },
  contenido: { estado: "mejorable", comentario: "Publica poco.", recomendaciones: ["Tres por semana"] },
  prioridades: ["Cambiar el nombre", "Nueva bio"],
};

const perfilGraph = (usuario) => ({
  username: usuario, name: "Café Luna", biography: "Café rico", website: "https://wa.me/507",
  profile_picture_url: "https://scontent.cdninstagram.com/foto.jpg", followers_count: 2000, follows_count: 100, media_count: 50,
  media: { data: [
    { caption: "Latte", media_type: "IMAGE", like_count: 90, comments_count: 10, timestamp: "2026-09-29T12:00:00+0000", permalink: "https://instagram.com/p/1", media_url: "https://scontent.cdninstagram.com/1.jpg" },
    { caption: "Reel", media_type: "VIDEO", media_product_type: "REELS", like_count: 40, comments_count: 0, timestamp: "2026-09-20T12:00:00+0000", permalink: "https://instagram.com/p/2", thumbnail_url: "https://scontent.cdninstagram.com/2.jpg" },
  ] },
});

async function sembrar({ conCuenta = true } = {}) {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, industry, primary_color) values (?,?,?,?,?)").run("c1", DUENO, "Café Luna", "Cafetería", "#6B3E26");
  if (conCuenta) {
    s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, usuario, token_cifrado, client_id) values (?,?,?,?,?,?,?)")
      .run("ig", DUENO, "instagram", "IG1", "cafeluna", await cifrarMeta(env, "token-pagina"), "c1");
  }
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, ANTHROPIC_API_KEY: "clave", META_APP_SECRET: SECRETO, META_APP_ID: "app" };
  llamadas = [];
  pedidosIA = [];
  respuestaIA = () => flujo(`Aquí está:\n${JSON.stringify(ANALISIS)}`);
  vi.stubGlobal("fetch", vi.fn(async (entrada, init = {}) => {
    const u = new URL(String(entrada));
    if (u.host === "api.anthropic.com") { pedidosIA.push(JSON.parse(init.body)); return respuestaIA(); }
    if (u.host === "graph.facebook.com") {
      llamadas.push({ ruta: u.pathname, fields: u.searchParams.get("fields") });
      const f = u.searchParams.get("fields") ?? "";
      const bd = /business_discovery\.username\(([^)]+)\)/.exec(f);
      if (bd && bd[1] === "privada") return new Response(JSON.stringify({ error: { message: "Invalid user id", code: 110 } }), { status: 400 });
      return new Response(JSON.stringify(bd ? { business_discovery: perfilGraph(bd[1]) } : perfilGraph("cafeluna")));
    }
    if (u.hostname.endsWith("cdninstagram.com")) return new Response(new Uint8Array([255, 216, 255, 1]), { headers: { "content-type": "image/jpeg" } });
    return new Response("{}", { status: 404 });
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const acceso = () => crearAcceso(db, DUENO);
const conSesion = (ruta, opciones = {}) => new Request(`https://calendarios.test${ruta}`, {
  ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
});

describe("de dónde sale el perfil", () => {
  it("un cliente con su Instagram conectado se lee con su propia cuenta", async () => {
    await sembrar();
    const p = await leerPerfil(env, acceso(), { clientId: "c1" });
    expect(p).toMatchObject({ fuente: "cuenta", usuario: "cafeluna", seguidores: 2000 });
    expect(p.medios.map((m) => m.formato)).toEqual(["imagen", "reel"]);
    expect(llamadas[0].ruta).toMatch(/\/IG1$/);
  });

  it("un prospecto, por business_discovery desde una cuenta conectada", async () => {
    await sembrar();
    const p = await leerPerfil(env, acceso(), { usuario: "@Rival.Cafe" });
    expect(p).toMatchObject({ fuente: "business_discovery", usuario: "rival.cafe" });
    expect(llamadas[0].fields).toMatch(/business_discovery\.username\(rival\.cafe\)/);
  });

  it("una cuenta personal no se puede leer: lo dice y ofrece las capturas", async () => {
    await sembrar();
    await expect(leerPerfil(env, acceso(), { usuario: "privada" })).rejects.toThrow(/empresa o de creador.*capturas/s);
  });

  it("sin ninguna cuenta de Instagram conectada, lo dice", async () => {
    await sembrar({ conCuenta: false });
    await expect(leerPerfil(env, acceso(), { usuario: "otra" })).rejects.toThrow(/Integraciones/);
  });
});

describe("generar", () => {
  it("la IA ve la foto, la rejilla y las capturas, y recibe las cifras ya hechas", async () => {
    await sembrar();
    await generarAuditoria(env, acceso(), { clientId: "c1", capturas: ["data:image/jpeg;base64,/9j/AAAA"] });
    const contenido = pedidosIA[0].messages[0].content;
    expect(contenido.filter((b) => b.type === "image")).toHaveLength(4); // foto + 2 de la rejilla + 1 captura
    const texto = contenido.find((b) => b.type === "text").text;
    expect(texto).toMatch(/"interaccionMedia":70/);
    expect(texto).toMatch(/≤ 150 caracteres/);
    expect(texto).not.toMatch(/cdninstagram/);
  });

  it("lo propuesto se ciñe a Instagram y se congela lo que había", async () => {
    await sembrar();
    const fila = await generarAuditoria(env, acceso(), { clientId: "c1" });
    const analisis = JSON.parse(fila.analisis);
    expect(analisis.bio.opciones).toEqual(["☕ Café de especialidad en Panamá"]);
    const datos = JSON.parse(fila.datos);
    expect(datos.perfil).toMatchObject({ bio: "Café rico", foto: expect.stringMatching(/^data:image\/jpeg;base64,/) });
    expect(JSON.stringify(datos.perfil)).not.toMatch(/profile_picture|fotoUrl/);
    const consumo = db.sqlite.prepare("select funcion from consumo_ia").all();
    expect(consumo.map((c) => c.funcion)).toEqual(["auditoria"]);
  });

  it("si la IA falla, la auditoría queda con su motivo, no desaparece", async () => {
    await sembrar();
    respuestaIA = () => flujo("No sé hacer eso.");
    await expect(generarAuditoria(env, acceso(), { usuario: "rival" })).rejects.toThrow(/formato/);
    expect(db.sqlite.prepare("select estado, error from auditorias").get()).toMatchObject({ estado: "error", error: expect.stringMatching(/formato/) });
  });

  it("una cuenta personal con capturas se audita igual, desde las capturas", async () => {
    await sembrar();
    const fila = await generarAuditoria(env, acceso(), { usuario: "privada", capturas: ["data:image/png;base64,iVBORw0KGgo="] });
    expect(fila.usuario).toBe("privada");
    expect(JSON.parse(fila.datos).perfil).toMatchObject({ fuente: "capturas", aviso: expect.stringMatching(/empresa o de creador/) });
  });
});

describe("por la puerta del Worker", () => {
  it("crear, listar, compartir y abrir sin sesión; sin compartir, 404", async () => {
    await sembrar();
    const creada = await (await worker.fetch(conSesion("/api/auditorias", { method: "POST", body: JSON.stringify({ usuario: "@rival.cafe" }) }), env, {})).json();
    expect(creada).toMatchObject({ usuario: "rival.cafe", estado: "listo", clientId: null, puntuacion: 62 });

    const lista = await (await worker.fetch(conSesion("/api/auditorias"), env, {})).json();
    expect(lista).toHaveLength(1);
    expect(lista[0]).not.toHaveProperty("analisis");

    const { testigo } = await (await worker.fetch(conSesion(`/api/auditorias/${creada.id}/enlace`, { method: "POST" }), env, {})).json();
    const publica = await worker.fetch(new Request(`https://calendarios.test/api/publico-auditoria/${testigo}`), env, {});
    expect(publica.status).toBe(200);
    const datos = await publica.json();
    expect(datos.analisis.puntuacion).toBe(62);
    expect(JSON.stringify(datos)).not.toMatch(/cdninstagram/);

    await worker.fetch(conSesion(`/api/auditorias/${creada.id}/enlace`, { method: "PATCH", body: JSON.stringify({ compartido: false }) }), env, {});
    expect((await worker.fetch(new Request(`https://calendarios.test/api/publico-auditoria/${testigo}`), env, {})).status).toBe(404);
  });

  it("un perfil que no se puede leer es un 422 con el motivo", async () => {
    await sembrar();
    const res = await worker.fetch(conSesion("/api/auditorias", { method: "POST", body: JSON.stringify({ usuario: "privada" }) }), env, {});
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/capturas/);
  });
});
