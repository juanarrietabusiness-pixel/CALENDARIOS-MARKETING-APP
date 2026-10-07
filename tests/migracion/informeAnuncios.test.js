import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cifrarMeta } from "../../worker/lib/meta.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { informeAnunciosPendiente } from "../../worker/lib/informeAnuncios.js";
import { ACCION_MENSAJE } from "../../src/lib/anuncios.js";

// ============================================================
// El informe de anuncios: aparte del de redes, a pedido o el día 1
//
// Lo que importa:
//   1. Lee TODAS las campañas de la cuenta (también las de fuera) y
//      congela las cifras; compara con el mes anterior.
//   2. Las imágenes de los mejores anuncios se incrustan sólo si vienen
//      del CDN de Meta.
//   3. Sin el costo por resultado, el enlace del cliente NO lo lleva (no
//      basta con no pintarlo), y a la IA se le pide no nombrarlo.
//   4. Si la IA falla, el informe sale igual con sus cifras.
//   5. El automático: sólo con el interruptor del cliente, uno por vuelta,
//      y un fallo no se reintenta cada minuto.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra" };
const SECRETO = "secreto-de-meta-para-pruebas";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
let db;
let env;
let peticiones;
let respuestaIA;
let llamadasMeta;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

const fila = (gasto, { alcance = 1000, clics = 50, mensajes = 0, clicsEnlace = 0, fecha } = {}) => ({
  spend: String(gasto), impressions: String(alcance * 2), reach: String(alcance), clicks: String(clics), ctr: "2.5",
  actions: [
    ...(mensajes ? [{ action_type: ACCION_MENSAJE, value: String(mensajes) }] : []),
    ...(clicsEnlace ? [{ action_type: "link_click", value: String(clicsEnlace) }] : []),
  ],
  ...(fecha ? { date_start: fecha } : {}),
});

/** Meta de mentira: septiembre (el mes) y agosto (el anterior), y el CDN. */
function falsos() {
  peticiones = [];
  llamadasMeta = [];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      peticiones.push(JSON.parse(opciones.body));
      return typeof respuestaIA === "function" ? respuestaIA() : respuestaIA;
    }
    if (u.startsWith("https://scontent.fbcdn.net/")) return new Response(JPEG, { headers: { "content-type": "image/jpeg" } });
    if (u.startsWith("https://malo.example/")) throw new Error("no se debe bajar nada de fuera del CDN de Meta");
    if (!u.startsWith("https://graph.facebook.com/")) throw new Error(`fetch inesperado a ${u}`);
    llamadasMeta.push(u);
    const p = new URL(u);
    const todo = decodeURIComponent(p.search);
    const agosto = todo.includes("2026-08-01");
    if (p.pathname.endsWith("/act_111/insights")) {
      if (p.searchParams.get("time_increment")) {
        return Response.json({ data: [fila(20, { mensajes: 4, fecha: "2026-09-01" }), fila(30, { mensajes: 6, fecha: "2026-09-03" })] });
      }
      return Response.json({ data: [agosto ? fila(40, { alcance: 4000, clics: 100, mensajes: 5 }) : fila(50, { alcance: 5000, clics: 120, mensajes: 10 })] });
    }
    if (p.pathname.endsWith("/act_111/campaigns")) {
      const datos = agosto
        ? [{ id: "201", name: "WhatsApp agosto", objective: "OUTCOME_SALES", status: "ACTIVE", insights: { data: [fila(40, { mensajes: 5 })] } }]
        : [
            { id: "201", name: "Lavado a WhatsApp", objective: "OUTCOME_SALES", effective_status: "ACTIVE", insights: { data: [fila(35, { mensajes: 10 })] } },
            { id: "202", name: "Tráfico de fuera", objective: "OUTCOME_TRAFFIC", effective_status: "PAUSED", insights: { data: [fila(15, { clicsEnlace: 30 })] } },
            { id: "203", name: "Sin gasto", objective: "OUTCOME_TRAFFIC", effective_status: "PAUSED" },
          ];
      return Response.json({ data: datos });
    }
    if (p.pathname.endsWith("/act_111/ads")) {
      return Response.json({
        data: [
          { id: "a1", name: "Sofá", campaign: { name: "Lavado a WhatsApp", objective: "OUTCOME_SALES" }, creative: { title: "¿Manchas?", body: "Lavamos tu sofá", image_url: "https://scontent.fbcdn.net/a1.jpg" }, insights: { data: [fila(20, { mensajes: 7 })] } },
          { id: "a2", name: "Colchón", campaign: { name: "Lavado a WhatsApp", objective: "OUTCOME_SALES" }, creative: { title: "Colchón", thumbnail_url: "https://malo.example/x.jpg" }, insights: { data: [fila(15, { mensajes: 3 })] } },
          { id: "a3", name: "Sin cifras", campaign: { name: "X", objective: "OUTCOME_SALES" }, creative: {} },
        ],
      });
    }
    throw new Error(`Meta inesperado: ${u}`);
  });
}

async function sembrar() {
  const s = db.sqlite;
  for (const id of [JEFE, OTRA]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
  }
  s.prepare("insert into clients (id, owner_id, name, industry, primary_color) values (?,?,?,?,?)").run("c1", JEFE, "Dcasa", "Limpieza", "#0A7");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Sin cuenta");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  s.prepare("insert into integracion_meta (id, owner_id, nombre, token_cifrado, origen, permisos) values (?,?,?,?,?,?)")
    .run(JEFE, JEFE, "Juan", await cifrarMeta(env, "token-persona"), "https://calendarios.test", JSON.stringify(["pages_show_list", "ads_read", "ads_management"]));
  s.prepare("insert into cuentas_anuncios (id, owner_id, externo_id, nombre, moneda, client_id) values (?,?,?,?,?,?)")
    .run(`${JEFE}:act_111`, JEFE, "act_111", "Dcasa Ads", "USD", "c1");
  // La campaña 201 se creó desde la aplicación.
  s.prepare("insert into campanas_anuncios (id, owner_id, client_id, cuenta_id, campana_id, nombre, objetivo, estado) values (?,?,?,?,?,?,?,?)")
    .run("r1", JEFE, "c1", `${JEFE}:act_111`, "201", "Lavado a WhatsApp", "OUTCOME_SALES", "ACTIVE");
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const publico = (testigo) => worker.fetch(new Request(`https://calendarios.test/api/publico-informe-anuncios/${testigo}`), env);
const textoDe = (p) => p.messages[0].content;

const ANALISIS = {
  logros: "Con 50 dólares llegaron 10 conversaciones por WhatsApp.",
  campanas: [{ id: "201", comentario: "La que más conversaciones trajo." }, { id: "999", comentario: "Inventada" }],
  recomendaciones: ["Mantener la campaña de WhatsApp", "Probar un público similar"],
};

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: { get: async () => null }, ANTHROPIC_API_KEY: "k", META_APP_ID: "app", META_APP_SECRET: SECRETO, ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
  respuestaIA = flujo(JSON.stringify(ANALISIS));
  falsos();
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("generar el informe de anuncios", () => {
  it("lee TODAS las campañas, compara con el mes anterior y congela las cifras", async () => {
    const r = await pedir(JEFE, "/anuncios/clientes/c1/informes", { method: "POST", body: { mes: "2026-09" } });
    expect(r.status).toBe(201);
    const d = await r.json();
    expect(d).toMatchObject({ mes: "2026-09", estado: "listo", compartido: false, mostrarCosto: true });
    const { cifras, analisis } = d.contenido;
    expect(cifras.nombreMes).toBe("septiembre de 2026");
    expect(cifras.kpis.inversion).toEqual({ valor: 50, cambio: 25 });
    // Resultados: las 10 conversaciones de la campaña de Ventas (donde más se invirtió) frente a 5 en agosto; los 30
    // clics de la de Tráfico NO se suman a las conversaciones.
    expect(cifras.kpis.resultados).toEqual({ valor: 10, cambio: 100 });
    // 35 $ ÷ 10 frente a 40 $ ÷ 5.
    expect(cifras.kpis.costoPorResultado).toEqual({ valor: 3.5, cambio: -56.2 });
    expect(cifras.kpis.alcance.cambio).toBe(25);
    expect(cifras.etiquetaResultados).toBe("Conversaciones por WhatsApp");
    expect(cifras.otrosObjetivos).toBe(true);
    // También la creada fuera de la app; la que no gastó, no.
    expect(cifras.campanas.map((c) => [c.id, c.desdeApp])).toEqual([["201", true], ["202", false]]);
    // El día a día del mes entero, con 0 donde Meta no devolvió fila.
    expect(cifras.serie).toHaveLength(30);
    expect(cifras.serie[1]).toEqual({ fecha: "2026-09-02", gasto: 0, resultados: 0 });
    expect(cifras.serie[2]).toMatchObject({ fecha: "2026-09-03", gasto: 30, resultados: 6 });
    // Los mejores: la imagen del CDN de Meta, incrustada; la de otro sitio, no se baja.
    expect(cifras.mejores.map((m) => m.id)).toEqual(["a1", "a2"]);
    expect(cifras.mejores[0].miniatura).toMatch(/^data:image\/jpeg;base64,/);
    expect(cifras.mejores[1].miniatura).toBeNull();
    // Lo de la IA, limpio: la campaña inventada se descarta.
    expect(analisis.campanas).toEqual({ 201: "La que más conversaciones trajo." });
    expect(analisis.recomendaciones).toHaveLength(2);
    // A la IA no le llegan las imágenes, y se apunta con su función.
    expect(textoDe(peticiones[0])).not.toContain("base64");
    expect(textoDe(peticiones[0])).toContain("Tráfico de fuera");
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("informe de anuncios");
    // Sólo lee: ninguna llamada a Meta escribe, y caben en una vuelta del cron.
    expect(llamadasMeta.length).toBeLessThanOrEqual(9);
  });

  it("regenerar conserva el enlace que el cliente ya tiene", async () => {
    await pedir(JEFE, "/anuncios/clientes/c1/informes", { method: "POST", body: { mes: "2026-09" } });
    const { testigo } = await (await pedir(JEFE, "/anuncios/clientes/c1/informes/2026-09/compartir", { method: "POST", body: { compartido: true } })).json();
    expect(testigo).toBeTruthy();
    await pedir(JEFE, "/anuncios/clientes/c1/informes", { method: "POST", body: { mes: "2026-09" } });
    const lista = await (await pedir(JEFE, "/anuncios/clientes/c1/informes")).json();
    expect(lista.informes).toHaveLength(1);
    expect(lista.informes[0]).toMatchObject({ compartido: true, testigo });
    expect((await publico(testigo)).status).toBe(200);
  });

  it("si la IA falla, el informe sale igual con sus cifras y la agencia lo sabe", async () => {
    respuestaIA = () => new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "caída" } }), { status: 500 });
    const r = await pedir(JEFE, "/anuncios/clientes/c1/informes", { method: "POST", body: { mes: "2026-09" } });
    expect(r.status).toBe(201);
    const d = await r.json();
    expect(d.estado).toBe("listo");
    expect(d.contenido.cifras.kpis.inversion.valor).toBe(50);
    expect(d.contenido.avisos[0]).toMatch(/La IA no escribió el análisis/);
  });

  it("un mes que no ha empezado no se genera", async () => {
    const r = await pedir(JEFE, "/anuncios/clientes/c1/informes", { method: "POST", body: { mes: "2099-01" } });
    expect(r.status).toBe(400);
  });

  it("sin cuenta publicitaria se puede abrir y ajustar, y generar dice por qué no", async () => {
    const lista = await (await pedir(JEFE, "/anuncios/clientes/c2/informes")).json();
    expect(lista).toMatchObject({ tieneCuenta: false, informes: [], ajustes: { automatico: false, mostrarCosto: true } });
    const r = await pedir(JEFE, "/anuncios/clientes/c2/informes", { method: "POST", body: { mes: "2026-09" } });
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/cuenta publicitaria/);
  });

  it("el cliente de otro espacio no existe", async () => {
    expect((await pedir(JEFE, "/anuncios/clientes/c9/informes")).status).toBe(404);
    await pedir(JEFE, "/anuncios/clientes/c1/informes", { method: "POST", body: { mes: "2026-09" } });
    expect((await pedir(OTRA, "/anuncios/clientes/c1/informes/2026-09")).status).toBe(404);
  });
});

describe("el costo por resultado, si la agencia decide no enseñarlo", () => {
  it("a la IA se le pide no nombrarlo y el enlace del cliente NO lo lleva", async () => {
    const r = await pedir(JEFE, "/anuncios/clientes/c1/informes", { method: "POST", body: { mes: "2026-09", mostrarCosto: false } });
    expect((await r.json()).mostrarCosto).toBe(false);
    expect(textoDe(peticiones[0])).toContain("NO menciones el costo por resultado");
    expect(textoDe(peticiones[0])).not.toContain("costoPorResultado");

    // Sin compartir, el enlace no abre nada.
    const fila = db.sqlite.prepare("select testigo from informes_anuncios").get();
    expect(fila.testigo).toBeNull();
    const { testigo } = await (await pedir(JEFE, "/anuncios/clientes/c1/informes/2026-09/compartir", { method: "POST", body: { compartido: true } })).json();
    let p = await (await publico(testigo)).json();
    expect(JSON.stringify(p)).not.toContain("costoPorResultado");
    expect(p).toMatchObject({ mostrarCosto: false, cliente: { name: "Dcasa", primaryColor: "#0A7" } });
    // Lo de la agencia no sale.
    expect(p.avisos).toBeUndefined();
    expect(p.modelo).toBeUndefined();

    // Encenderlo después lo pone en el enlace sin regenerar.
    await pedir(JEFE, "/anuncios/clientes/c1/informes/2026-09/compartir", { method: "POST", body: { mostrarCosto: true } });
    p = await (await publico(testigo)).json();
    expect(p.cifras.kpis.costoPorResultado.valor).toBe(3.5);

    // Dejar de compartir lo cierra.
    await pedir(JEFE, "/anuncios/clientes/c1/informes/2026-09/compartir", { method: "POST", body: { compartido: false } });
    expect((await publico(testigo)).status).toBe(404);
  });

  it("el valor del cliente es el de partida de cada informe nuevo", async () => {
    const a = await (await pedir(JEFE, "/anuncios/clientes/c1/ajustes-informe", { method: "PUT", body: { mostrarCosto: false } })).json();
    expect(a).toEqual({ automatico: false, mostrarCosto: false });
    const d = await (await pedir(JEFE, "/anuncios/clientes/c1/informes", { method: "POST", body: { mes: "2026-09" } })).json();
    expect(d.mostrarCosto).toBe(false);
  });
});

describe("el informe automático del día 1", () => {
  const dia1 = new Date("2026-10-01T15:00:00Z"); // 10:00 en Panamá

  it("sólo para los clientes con el interruptor encendido, como borrador y uno por vuelta", async () => {
    expect(await informeAnunciosPendiente(env, dia1)).toBe(0);
    await pedir(JEFE, "/anuncios/clientes/c1/ajustes-informe", { method: "PUT", body: { automatico: true } });
    expect(await informeAnunciosPendiente(env, dia1)).toBe(1);
    const f = db.sqlite.prepare("select mes, estado, automatico, compartido from informes_anuncios").get();
    expect(f).toEqual({ mes: "2026-09", estado: "listo", automatico: 1, compartido: 0 });
    // Ya está: la siguiente vuelta no hace nada.
    expect(await informeAnunciosPendiente(env, dia1)).toBe(0);
  });

  it("fuera de hora o pasado el día 5, nada; y un fallo no se reintenta cada minuto", async () => {
    await pedir(JEFE, "/anuncios/clientes/c1/ajustes-informe", { method: "PUT", body: { automatico: true } });
    expect(await informeAnunciosPendiente(env, new Date("2026-10-01T12:00:00Z"))).toBe(0); // 7:00
    expect(await informeAnunciosPendiente(env, new Date("2026-10-06T15:00:00Z"))).toBe(0);
    db.sqlite.prepare("delete from integracion_meta").run();
    expect(await informeAnunciosPendiente(env, dia1)).toBe(1);
    expect(db.sqlite.prepare("select estado from informes_anuncios").get().estado).toBe("error");
    expect(await informeAnunciosPendiente(env, dia1)).toBe(0);
  });
});
