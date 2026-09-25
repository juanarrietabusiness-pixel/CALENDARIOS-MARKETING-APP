import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrasDelMes, generarInforme, informePendiente, limitesDelMes, mesAnterior } from "../../worker/lib/informes.js";
import { crearEjecutor } from "../../worker/lib/herramientasServidor.js";

// ============================================================
// El informe mensual, contra una D1 de verdad y una Anthropic de mentira
//
// Lo que importa: que las cifras salgan de las fotos (no de la IA), que
// la IA reciba la orden de no inventar, que regenerar no rompa el enlace
// del cliente, y que el enlace público no enseñe nada sin compartir.
// ============================================================

const DUENO = "u-jefe";
const TESTIGO = "testigo-de-sesion-de-prueba";
let db;
let env;
let pedidos;
let respuestaIA;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "claude-sonnet-5", usage: { input_tokens: 900 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

const ANALISIS = {
  resumen: "Septiembre fue un buen mes: +60 seguidores.",
  destacados: ["El reel del latte llegó a 3.000 personas"],
  aprendizajes: ["Los reels rinden el doble"],
  recomendaciones: ["Dos reels por semana"],
  ideas: [{ formato: "reel", idea: "Receta de otoño" }],
};

async function sembrar() {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(DUENO, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(DUENO, DUENO, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), DUENO, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, industry, primary_color, logo) values (?,?,?,?,?,?)")
    .run("c1", DUENO, "Café Luna", "Cafetería", "#6B3E26", "data:image/png;base64,AAAA");
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, usuario, client_id) values (?,?,?,?,?,?)")
    .run("ig", DUENO, "instagram", "IG1", "cafeluna", "c1");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal9", "c1", DUENO, "Septiembre", 8, 2026, JSON.stringify([{ date: "2026-09-03", posts: [{ id: "a", status: "approved" }, { id: "b", status: "pending" }] }]));
  const foto = s.prepare("insert into metricas_cuenta (id, owner_id, client_id, cuenta_id, red, fecha, seguidores, alcance, interacciones) values (?,?,?,?,?,?,?,?,?)");
  foto.run("ig:2026-08-31", DUENO, "c1", "ig", "instagram", "2026-08-31", 1000, 100, 10);
  foto.run("ig:2026-09-01", DUENO, "c1", "ig", "instagram", "2026-09-01", 1000, 200, 20);
  foto.run("ig:2026-09-30", DUENO, "c1", "ig", "instagram", "2026-09-30", 1060, 300, 30);
  s.prepare("insert into metricas_publicacion (id, owner_id, client_id, cuenta_id, red, externo_id, tipo, texto, publicada_at, interacciones, alcance) values (?,?,?,?,?,?,?,?,?,?,?)")
    .run("ig:m1", DUENO, "c1", "ig", "instagram", "m1", "reel", "Nuevo latte", "2026-09-10T23:00:00.000Z", 165, 3000);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T15:00:00.000Z")); // 1 de octubre, 10:00 en Panamá
  db = d1EnMemoria();
  env = { DB: db, ANTHROPIC_API_KEY: "clave" };
  pedidos = [];
  respuestaIA = () => flujo(`Aquí va:\n${JSON.stringify(ANALISIS)}`);
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    if (String(url).includes("api.anthropic.com/v1/messages")) {
      pedidos.push(JSON.parse(init.body));
      return respuestaIA();
    }
    return new Response("{}", { status: 404 });
  }));
  await sembrar();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const acceso = () => crearAcceso(db, DUENO);

describe("las cifras del mes", () => {
  it("salen de las fotos: seguidores, alcance del mes, la mejor publicación y lo planificado", async () => {
    expect(limitesDelMes("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(mesAnterior()).toBe("2026-09");
    const c = await cifrasDelMes(acceso(), "c1", "2026-09");
    expect(c.kpis.seguidores).toMatchObject({ valor: 1060, ganados: 60 });
    expect(c.kpis.alcance.valor).toBe(500);
    expect(c.mejores[0]).toMatchObject({ tipo: "reel", interacciones: 165 });
    expect(c.plan).toMatchObject({ planificadas: 2, aprobadas: 1 });
  });
});

describe("generar", () => {
  it("la IA recibe las cifras y la orden de no inventar; se guarda cifras + análisis", async () => {
    const fila = await generarInforme(env, acceso(), { clientId: "c1", mes: "2026-09" });
    expect(fila.estado).toBe("listo");
    const pedido = pedidos[0].messages[0].content;
    expect(pedido).toMatch(/No inventes ningún número/);
    expect(pedido).toMatch(/"ganados":60/);
    const contenido = JSON.parse(fila.contenido);
    expect(contenido.analisis).toMatchObject({ resumen: ANALISIS.resumen, ideas: [{ formato: "reel", idea: "Receta de otoño" }] });
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("informe");
  });

  it("regenerar conserva el enlace del cliente", async () => {
    await generarInforme(env, acceso(), { clientId: "c1", mes: "2026-09" });
    db.sqlite.prepare("update informes set testigo = ?, compartido = 1").run("z".repeat(48));
    await generarInforme(env, acceso(), { clientId: "c1", mes: "2026-09" });
    expect(db.sqlite.prepare("select testigo, compartido from informes").get()).toEqual({ testigo: "z".repeat(48), compartido: 1 });
  });

  it("si la IA falla, queda en error con el motivo", async () => {
    respuestaIA = () => new Response(JSON.stringify({ error: { type: "invalid_request_error", message: "Your credit balance is too low" } }), { status: 400 });
    await expect(generarInforme(env, acceso(), { clientId: "c1", mes: "2026-09" })).rejects.toThrow();
    expect(db.sqlite.prepare("select estado from informes").get().estado).toBe("error");
  });

  it("el cron: del 1 al 5, desde las 9:00, uno por vuelta y no dos veces", async () => {
    expect(await informePendiente(env, new Date("2026-10-01T12:00:00.000Z"))).toBe(0); // 7:00
    expect(await informePendiente(env, new Date("2026-10-08T15:00:00.000Z"))).toBe(0); // día 8
    expect(await informePendiente(env)).toBe(1);
    expect(await informePendiente(env)).toBe(0);
    expect(db.sqlite.prepare("select automatico from informes").get().automatico).toBe(1);
  });
});

describe("por la puerta del Worker", () => {
  const conSesion = (ruta, opciones = {}) => new Request(`https://calendarios.test${ruta}`, {
    ...opciones, headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
  });

  it("generar, compartir y abrir el enlace público sin sesión", async () => {
    const creado = await worker.fetch(conSesion("/api/informes", { method: "POST", body: JSON.stringify({ clientId: "c1", mes: "2026-09" }) }), env, {});
    expect(creado.status).toBe(201);
    const { id } = await creado.json();

    const lista = await (await worker.fetch(conSesion("/api/informes?cliente=c1"), env, {})).json();
    expect(lista).toMatchObject([{ mes: "2026-09", estado: "listo", compartido: false, testigo: null }]);

    const { testigo } = await (await worker.fetch(conSesion(`/api/informes/${encodeURIComponent(id)}/enlace`, { method: "POST" }), env, {})).json();
    const publico = await worker.fetch(new Request(`https://calendarios.test/api/publico-informe/${testigo}`), env, {});
    expect(publico.status).toBe(200);
    const datos = await publico.json();
    expect(datos.cliente).toMatchObject({ name: "Café Luna", primaryColor: "#6B3E26", logo: "data:image/png;base64,AAAA" });
    expect(datos.analisis.resumen).toBe(ANALISIS.resumen);
    expect(JSON.stringify(datos)).not.toMatch(/u-jefe|owner|c1/);

    // Dejar de compartir cierra el enlace.
    await worker.fetch(conSesion(`/api/informes/${encodeURIComponent(id)}/enlace`, { method: "PATCH", body: JSON.stringify({ compartido: false }) }), env, {});
    expect((await worker.fetch(new Request(`https://calendarios.test/api/publico-informe/${testigo}`), env, {})).status).toBe(404);
  });

  it("un testigo inventado no abre nada", async () => {
    expect((await worker.fetch(new Request(`https://calendarios.test/api/publico-informe/${"x".repeat(48)}`), env, {})).status).toBe(404);
  });
});

describe("el asistente", () => {
  it("ver_resultados le cuenta las cifras y la mejor publicación", async () => {
    vi.setSystemTime(new Date("2026-10-02T15:00:00.000Z"));
    const { ejecutar } = crearEjecutor({ env, acceso: acceso() });
    const r = await ejecutar({ type: "tool_use", id: "t1", name: "ver_resultados", input: { cliente: "Café Luna", dias: 30 } });
    expect(r.is_error).toBeUndefined();
    expect(r.content).toMatch(/Seguidores: 1060/);
    expect(r.content).toMatch(/reel del 2026-09-10: 165 interacciones/);
  });
});
