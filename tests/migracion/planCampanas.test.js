import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearEjecutor } from "../../worker/lib/herramientasServidor.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { idDelCiclo } from "../../worker/lib/planCampanas.js";

// ============================================================
// El plan de campañas contra una D1 de verdad
//
// Lo que importa:
//   1. El plan se arma con lo que hay en la base —los números del negocio y el Manual, el catálogo y el estudio, el kit,
//      las fechas especiales, el calendario del mes y los de antes, la cola de lo publicado y sus métricas— SIN Meta
//      (las campañas se montan en el Ads Manager) y sin cuenta publicitaria.
//   2. Lo publicado que rindió va con el enlace de su publicación; lo de «Va a pauta», a su etapa.
//   3. Lo marcado en la guía se FUNDE (dos personas marcan pasos distintos y no se pisan), avisa al espacio y lo ve
//      todo el equipo; los ajustes rehacen el plan. No aparece entre los planes del estratega.
//   4. Un colaborador sin el cliente, otro espacio: 404; quien es de sólo lectura lee y no marca.
//   5. El asistente y Claude lo leen en texto.
//
// Ninguna petición sale a Internet: el `fetch` falso revienta con cualquiera.
// ============================================================

const JEFE = "u-jefe";
const EDITOR = "u-editor";
const COLAB = "u-colab";
const LECTOR = "u-lector";
const OTRA = "u-otra";
const TESTIGO = { [JEFE]: "t-jefe", [EDITOR]: "t-editor", [COLAB]: "t-colab", [LECTOR]: "t-lector", [OTRA]: "t-otra" };

let db;
let env;
let eventos;

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const ciclo = (quien, cliente = "c1", mes = "2026-11", opciones) => pedir(quien, `/anuncios/clientes/${cliente}/ciclo${opciones?.method ? "" : `?mes=${mes}`}`, opciones);

const NEGOCIO = {
  v: 1, tipo: "productos", destino: "whatsapp", cuenta: "historial",
  ticket: { valor: 50, origen: "cliente" }, invertir: { valor: 20, origen: "agencia" }, metaVentas: { valor: 1000, origen: "agencia" }, costos: [],
};
const MALETAS = {
  publico: "Mujeres de 28 a 45 años en Ciudad de Panamá, con casa propia y poder de compra medio alto.",
  problema: "El sofá viejo se hunde y no tienen dónde recibir visitas que se quedan a dormir.",
  solucion: "Un sofá que se abre en cama en diez segundos, con colchón de espuma de alta densidad.",
  diferenciales: "Fabricado en Panamá, tela antimanchas, entrega e instalación gratis en 72 horas.",
  testimonios: "", objeciones: "", garantia: "",
};
const post = (id, extra = {}) => ({ id, format: "post", title: `Pieza ${id}`, descripcion: "¿Tu sofá se hunde? El sofá cama que se abre en diez segundos. Escríbenos por WhatsApp y te asesoramos.", ...extra });

async function sembrar() {
  const s = db.sqlite;
  for (const id of [JEFE, EDITOR, COLAB, LECTOR, OTRA]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(EDITOR, JEFE, "editor", "Ana", "#123456");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Colab", "#654321", '["c2"]');
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura) values (?,?,?,?,?,?)").run(LECTOR, JEFE, "editor", "Lector", "#777777", 1);
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#abcdef");
  s.prepare("insert into clients (id, owner_id, name, industry, kit_marca) values (?,?,?,?,?)").run("c1", JEFE, "Dcasa", "Muebles", JSON.stringify({ tiposArte: ["producto", "testimonio"] }));
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  s.prepare("insert into anuncios_clientes (id, client_id, owner_id, negocio) values (?,?,?,?)").run("ac1", "c1", JEFE, JSON.stringify(NEGOCIO));
  s.prepare("insert into mercado_clientes (id, client_id, owner_id, catalogo, estudio) values (?,?,?,?,?)").run("m1", "c1", JEFE,
    JSON.stringify([{ id: "sofa", nombre: "Sofá cama", precio: "$450", activo: true }]),
    JSON.stringify({ general: { resumen: "Muebles en Panamá.", perfiles: [{ nombre: "Mamá práctica", quien: "Mamás de 30 a 45" }], deseos: [] }, productos: { sofa: { elementos: MALETAS } } }));
  // Noviembre con una oferta (la de temporada) y lo que va a pauta; octubre con lo publicado.
  const dias = (lista) => JSON.stringify(lista);
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days, offers) values (?,?,?,?,?,?,?,?)").run("cal-11", "c1", JEFE, "Noviembre", 10, 2026, dias([
    { date: "2026-11-04", posts: [post("p3", { pauta: { etapa: "evaluacion" }, composicion: "cenital", anuncio: { textos: ["Texto uno", "Texto dos", "Texto tres"], titulos: ["Sofá cama"], descripcion: "Envío gratis" } })] },
    { date: "2026-11-07", posts: [post("p6", { pauta: { etapa: "conversion" }, descripcion: "Black Friday: 15 % en el sofá cama. Escríbenos por WhatsApp." })] },
  ]), "15 % de descuento por Black Friday");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)").run("cal-10", "c1", JEFE, "Octubre", 9, 2026, dias([
    { date: "2026-10-02", posts: [post("p1", { status: "published", composicion: "heroe" })] },
    { date: "2026-10-03", posts: [post("p2", { status: "published", composicion: "macro" })] },
  ]));
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, client_id) values (?,?,?,?,?)").run("ig1", JEFE, "instagram", "IG1", "c1");
  const cola = s.prepare(`insert into publicaciones_programadas (id, owner_id, client_id, calendar_id, post_id, red, cuenta_id, programada_para, estado, externo_id, enlace, variante)
    values (?,?,?,?,?,?,?,?,?,?,?,?)`);
  cola.run("q1", JEFE, "c1", "cal-10", "p1", "instagram", "ig1", "2026-10-02T14:00:00.000Z", "publicada", "m-1", "https://www.instagram.com/p/AAA/", "post");
  cola.run("q2", JEFE, "c1", "cal-10", "p2", "instagram", "ig1", "2026-10-03T14:00:00.000Z", "publicada", "m-2", "https://www.instagram.com/p/BBB/", "post");
  const metrica = s.prepare(`insert into metricas_publicacion (id, owner_id, client_id, cuenta_id, red, externo_id, tipo, publicada_at, interacciones, updated_at)
    values (?,?,?,?,?,?,?,?,?,?)`);
  // La mediana es 10: p1 rinde 4×, p2 1×.
  [["m-1", 40], ["m-2", 10], ["m-3", 10], ["m-4", 9], ["m-5", 12]].forEach(([id, n]) =>
    metrica.run(`ig1:${id}`, JEFE, "c1", "ig1", "instagram", id, "post", "2026-10-02T14:00:00.000Z", n, "2026-10-10T00:00:00.000Z"));
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T15:00:00.000Z"));
  db = d1EnMemoria();
  eventos = [];
  env = {
    DB: db, ASSETS: { fetch: async () => new Response("") },
    HUB: { idFromName: (x) => x, get: () => ({ fetch: (req) => { eventos.push(req); return Promise.resolve(new Response("")); } }) },
  };
  vi.stubGlobal("fetch", vi.fn(async (u) => { throw new Error(`Petición a Internet en un test: ${u}`); }));
  await sembrar();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("el plan de un cliente y un mes", () => {
  it("sale de lo que hay en la base, sin Meta ni cuenta publicitaria: las cuatro etapas y la de temporada", async () => {
    const r = await ciclo(JEFE);
    expect(r.status).toBe(200);
    const { plan, guardado, avance } = await r.json();
    expect(plan.campanas.map((c) => c.id)).toEqual(["presentacion", "evaluacion", "conversion", "ascension", "temporada"]);
    expect(plan.inversion).toBe(200);
    expect(plan.campanas.slice(0, 4).map((c) => c.presupuesto.mensual)).toEqual([120, 40, 20, 20]);
    expect(plan.campanas[0].nombre).toBe("Dcasa · Presentación · Interacción WhatsApp · Noviembre 2026");
    expect(plan.temporada).toMatchObject({ nombre: "Black Friday y Cyber Monday", inicio: "2026-11-20", fin: "2026-11-30", incluida: true });
    // Lo publicado que rindió (p1, 4×) va a presentación con su publicación; p2 rindió lo normal.
    expect(plan.campanas[0].anuncios.map((a) => [a.pieza.postId, a.como])).toEqual([["p1", "publicacion"]]);
    expect(plan.campanas[0].anuncios[0].pieza.enlaces.instagram).toBe("https://www.instagram.com/p/AAA/");
    // Lo de «Va a pauta», a su etapa; la oferta del mes, a la temporada.
    expect(plan.campanas[1].anuncios.map((a) => a.pieza.postId)).toEqual(["p3"]);
    expect(plan.campanas[4].anuncios.map((a) => a.pieza.postId)).toEqual(["p6"]);
    // El producto sin testimonios ni garantía: «si falta una, no lances».
    expect(plan.avisos.find((a) => a.codigo === "maletas")?.texto).toMatch(/no lances/);
    expect(guardado.progreso).toEqual({});
    expect(avance.hechos).toBe(0);
    expect(avance.total).toBeGreaterThan(20);
  });

  it("sin números del negocio, el plan sale igual y lo avisa; otro mes sin calendario también", async () => {
    db.sqlite.prepare("update anuncios_clientes set negocio = ? where client_id = 'c1'").run(JSON.stringify({ v: 1, tipo: "productos", destino: "whatsapp", cuenta: "nueva", costos: [] }));
    const { plan } = await (await ciclo(JEFE, "c1", "2027-01")).json();
    expect(plan.campanas.map((c) => c.id)).toEqual(["presentacion", "evaluacion"]);
    expect(plan.inversion).toBeNull();
    expect(plan.avisos.some((a) => a.codigo === "sin-numeros" && a.grave)).toBe(true);
    // Un mes que no se entiende es el de hoy.
    expect((await (await ciclo(JEFE, "c1", "raro")).json()).plan.mes).toBe("2026-11");
  });

  it("lo marcado se funde, avisa al espacio y lo ve todo el equipo", async () => {
    const r1 = await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", marcar: { "presentacion:campana": true } } });
    expect(r1.status).toBe(200);
    expect(eventos).toHaveLength(1);
    const r2 = await ciclo(EDITOR, "c1", "", { method: "PUT", body: { mes: "2026-11", marcar: { "publico:clientes": true, "no vale!": true } } });
    const { guardado } = await r2.json();
    expect(Object.keys(guardado.progreso).sort()).toEqual(["presentacion:campana", "publico:clientes"]);
    expect(guardado.progreso["publico:clientes"].por).toBe("Ana");
    const leido = await (await ciclo(JEFE)).json();
    expect(leido.avance.hechos).toBe(2);
    // Desmarcar quita.
    await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", marcar: { "presentacion:campana": false } } });
    expect(Object.keys((await (await ciclo(JEFE)).json()).guardado.progreso)).toEqual(["publico:clientes"]);
    // Va en planes_campana con su id fijo y su tipo, y el estratega no lo enseña entre sus planes.
    const fila = db.sqlite.prepare("select * from planes_campana where id = ?").get(idDelCiclo("c1", "2026-11"));
    expect(JSON.parse(fila.datos)).toMatchObject({ tipo: "ciclo", mes: "2026-11" });
    expect(fila.client_id).toBe("c1");
    expect(await (await pedir(JEFE, "/anuncios/planes")).json()).toEqual([]);
  });

  it("los ajustes (quitar la temporada, la inversión a mano) rehacen el plan y se guardan", async () => {
    const r = await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", ajustes: { temporada: { incluir: false }, inversion: 500 } } });
    expect(r.status).toBe(200);
    const { plan, guardado } = await r.json();
    expect(plan.campanas.some((c) => c.id === "temporada")).toBe(false);
    expect(plan.inversion).toBe(500);
    expect(plan.campanas[0].presupuesto.mensual).toBe(300);
    expect(guardado.ajustes).toEqual({ temporada: { incluir: false }, inversion: 500, que: { campanas: [], productos: "foco", productoIds: [], logro: "" } });
    // Marcar después no se lleva los ajustes.
    await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", marcar: { "presentacion:campana": true } } });
    expect((await (await ciclo(JEFE)).json()).plan.inversion).toBe(500);
    expect((await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11" } })).status).toBe(400);
    expect((await ciclo(JEFE, "c1", "", { method: "PUT", body: { marcar: {} } })).status).toBe(400);
  });

  it("un colaborador sin el cliente y otro espacio no pasan; sólo lectura lee y no marca", async () => {
    expect((await ciclo(COLAB)).status).toBe(404);
    expect((await ciclo(OTRA)).status).toBe(404);
    expect((await ciclo(COLAB, "c1", "", { method: "PUT", body: { mes: "2026-11", marcar: { "presentacion:campana": true } } })).status).toBe(404);
    expect((await ciclo(COLAB, "c2")).status).toBe(200);
    expect((await ciclo(LECTOR)).status).toBe(200);
    expect((await ciclo(LECTOR, "c1", "", { method: "PUT", body: { mes: "2026-11", marcar: { "presentacion:campana": true } } })).status).toBe(403);
    expect((await ciclo(OTRA, "c9")).status).toBe(200);
  });
});

describe("la estrategia entera: qué vas a hacer, el reparto a mano y los anuncios con sus textos", () => {
  const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
  const flujo = (texto) => new Response([
    sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
    sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
    sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
    sse("content_block_stop", { index: 0 }),
    sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
  ].join(""), { headers: { "content-type": "text/event-stream" } });
  const leerPost = (cal, id) => JSON.parse(db.sqlite.prepare("select days from calendars where id = ?").get(cal).days).flatMap((d) => d.posts).find((p) => p.id === id);

  it("«¿Qué vas a hacer?» se guarda y rehace el plan: sólo conversión y temporada, con un producto", async () => {
    const r = await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", ajustes: { que: { campanas: ["conversion", "temporada"], productos: "foco", productoIds: ["sofa"], logro: "Vender el sofá cama en Black Friday." } } } });
    expect(r.status).toBe(200);
    const { plan, guardado } = await r.json();
    expect(plan.campanas.map((c) => c.id)).toEqual(["conversion", "temporada"]);
    expect(plan.campanas[0].presupuesto.mensual).toBe(200);
    expect(plan.que.logro).toBe("Vender el sofá cama en Black Friday.");
    expect(guardado.ajustes.que.campanas).toEqual(["conversion", "temporada"]);
  });

  it("el reparto a mano se guarda en anuncios_clientes (sólo esa columna), no se guarda si no suma 100 y «Volver al estándar» lo quita", async () => {
    const malo = await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", reparto: { presentacion: 70, evaluacion: 20, conversion: 10, ascension: 10 } } });
    expect(malo.status).toBe(400);
    expect((await malo.json()).error).toMatch(/suma 110/);
    const r = await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", reparto: { presentacion: 70, evaluacion: 10, conversion: 10, ascension: 10 } } });
    expect(r.status).toBe(200);
    const { plan } = await r.json();
    expect(plan.repartoAMano).toBe(true);
    expect(plan.campanas.slice(0, 4).map((c) => c.presupuesto.mensual)).toEqual([140, 20, 20, 20]);
    const fila = db.sqlite.prepare("select negocio, reparto from anuncios_clientes where client_id = 'c1'").get();
    expect(JSON.parse(fila.reparto)).toEqual({ presentacion: 70, evaluacion: 10, conversion: 10, ascension: 10 });
    expect(JSON.parse(fila.negocio)).toMatchObject({ tipo: "productos" });
    // Se queda para los meses siguientes.
    expect((await (await ciclo(JEFE, "c1", "2026-12")).json()).plan.repartoAMano).toBe(true);
    const vuelta = await (await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", reparto: null } })).json();
    expect(vuelta.plan.repartoAMano).toBe(false);
    expect(db.sqlite.prepare("select reparto from anuncios_clientes where client_id = 'c1'").get().reparto).toBeNull();
  });

  it("escoger cualquier publicación para un anuncio (de otro mes, sin publicar) y escribir sus textos a mano: van también a la publicación", async () => {
    const r = await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", anuncios: {
      "presentacion:a2": { pieza: { calendarId: "cal-10", postId: "p2" }, como: "subir", textos: { textos: ["Uno", "Dos", "Tres"], titulos: ["Sofá cama"], descripcion: "Envío gratis" }, editado: true },
      "presentacion:a3": { nuevo: true },
    } } });
    expect(r.status).toBe(200);
    const { plan, enPublicaciones } = await r.json();
    const pre = plan.campanas[0];
    expect(pre.anuncios.map((a) => [a.n, a.origen, a.pieza?.postId ?? null])).toEqual([[1, "publicada", "p1"], [2, "elegido", "p2"], [3, "nuevo", null]]);
    expect(pre.anuncios[1]).toMatchObject({ como: "subir", editado: true, textos: { textos: ["Uno", "Dos", "Tres"] } });
    expect(enPublicaciones).toBe(1);
    expect(leerPost("cal-10", "p2").anuncio).toEqual({ textos: ["Uno", "Dos", "Tres"], titulos: ["Sofá cama"], descripcion: "Envío gratis", boton: "WHATSAPP_MESSAGE" });
    expect(leerPost("cal-10", "p2").pauta).toMatchObject({ etapa: "presentacion" });
    // null vuelve el hueco a lo sugerido.
    const otra = await (await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", anuncios: { "presentacion:a3": null } } })).json();
    expect(otra.plan.campanas[0].anuncios.some((a) => a.nuevo)).toBe(false);
    expect(otra.guardado.anuncios["presentacion:a2"]).toMatchObject({ pieza: { postId: "p2" }, editado: true });
  });

  it("la IA escribe los textos con el nivel de cada anuncio: con la publicación, sólo título y descripción; no pisa lo de la publicación", async () => {
    env.ANTHROPIC_API_KEY = "k";
    const pedidos = [];
    vi.stubGlobal("fetch", async (url, opciones = {}) => {
      const u = String(url);
      if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
      if (u.startsWith("https://api.anthropic.com/v1/messages")) {
        pedidos.push(JSON.parse(opciones.body));
        return flujo(JSON.stringify({ anuncios: [
          { n: 1, textos: ["no va"], titulos: ["El sofá que se abre en 10 s"], descripcion: "Envío gratis", boton: "WHATSAPP_MESSAGE" },
          { n: 2, textos: ["Tu visita se queda.", "Diez segundos.", "Hecho en Panamá."], titulos: ["Sofá cama"], descripcion: "Desde $450", boton: "WHATSAPP_MESSAGE" },
        ] }));
      }
      throw new Error(`fetch inesperado a ${u}`);
    });
    const sinPieza = await ciclo(JEFE, "c1", "", { method: "POST", body: { mes: "2026-11", escribir: ["presentacion:a4"] } });
    expect(sinPieza.status).toBe(400);
    const r = await ciclo(JEFE, "c1", "", { method: "POST", body: { mes: "2026-11", escribir: ["presentacion:a1", "evaluacion:a1"] } });
    expect(r.status).toBe(200);
    const out = await r.json();
    expect(out.escritos).toBe(2);
    const prompt = pedidos[0].messages[0].content;
    expect(prompt).toMatch(/CÓMO SE LE HABLA A CADA NIVEL/);
    expect(prompt).toMatch(/1\. Campaña de presentación[^\n]*nivel Inconsciente/);
    expect(prompt).toMatch(/Se monta con la PUBLICACIÓN YA SUBIDA[\s\S]*Escribe SÓLO "titulos" y "descripcion"/);
    expect(prompt).toMatch(/2\. Campaña de evaluación[^\n]*\n {3}Se monta SUBIENDO LA PIEZA/);
    expect(prompt).toMatch(/Sofá cama[^\n]*precio: \$450/);
    const [pre, eva] = out.plan.campanas;
    expect(pre.anuncios[0]).toMatchObject({ como: "publicacion", ia: true, textos: { textos: [], titulos: ["El sofá que se abre en 10 s"], descripcion: "Envío gratis" } });
    // p3 ya tenía sus textos de anuncio: no se pisan; p1 no tenía: se le ponen el título y la descripción.
    expect(eva.anuncios[0].textos.textos).toEqual(["Tu visita se queda.", "Diez segundos.", "Hecho en Panamá."]);
    expect(leerPost("cal-11", "p3").anuncio.textos).toEqual(["Texto uno", "Texto dos", "Texto tres"]);
    expect(leerPost("cal-10", "p1").anuncio).toMatchObject({ titulos: ["El sofá que se abre en 10 s"], descripcion: "Envío gratis" });
    // Lo que escribió una persona no se reescribe en «todos los que faltan»; con «reescribir», sí.
    await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", anuncios: { "presentacion:a1": { textos: { titulos: ["El mío"], descripcion: "Mío" }, editado: true } } } });
    expect((await ciclo(JEFE, "c1", "", { method: "POST", body: { mes: "2026-11", escribir: ["presentacion:a1"] } })).status).toBe(400);
    expect((await ciclo(JEFE, "c1", "", { method: "POST", body: { mes: "2026-11", escribir: ["presentacion:a1"], reescribir: true } })).status).toBe(200);
    // Sólo lectura no escribe.
    expect((await ciclo(LECTOR, "c1", "", { method: "POST", body: { mes: "2026-11", escribir: ["presentacion:a1"] } })).status).toBe(403);
  });

  it("el Excel y el texto los llevan", async () => {
    await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", anuncios: { "presentacion:a1": { textos: { titulos: ["Título del plan"], descripcion: "Desde $450" }, editado: true } } } });
    const acceso = crearAcceso(db, JEFE);
    const r = await crearEjecutor({ env, acceso }).ejecutar({ id: "t1", name: "plan_de_campanas", input: { cliente: "Dcasa", mes: "2026-11" } });
    expect(r.content).toContain("· Título del plan");
    expect(r.content).toContain("Descripción: Desde $450");
  });
});

describe("el asistente y Claude", () => {
  it("lo leen en texto, con cuánto de la guía va marcado", async () => {
    await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", marcar: { "presentacion:campana": true } } });
    const acceso = crearAcceso(db, JEFE);
    const r = await crearEjecutor({ env, acceso }).ejecutar({ id: "t1", name: "plan_de_campanas", input: { cliente: "Dcasa", mes: "2026-11" } });
    expect(r.is_error).toBeUndefined();
    expect(r.content).toContain("PLAN DE CAMPAÑAS · Dcasa · Noviembre 2026");
    expect(r.content).toContain("TEMPORADA · Dcasa · Temporada");
    expect(r.content).toMatch(/Guía de montaje: 1 de \d+ pasos marcados/);
    expect(HERRAMIENTAS_MCP.find((h) => h.name === "plan_de_campanas")?.annotations.readOnlyHint).toBe(true);
    const m = await crearHerramientasMCP({ env, acceso, usuario: { id: JEFE, nombre: "Juan" } }).llamar("plan_de_campanas", { cliente: "Dcasa", mes: "2026-11" });
    expect(m.isError).toBeUndefined();
    expect(m.content[0].text).toContain("PRESENTACIÓN · Dcasa · Presentación");
  });
});

describe("los ángulos de venta del estudio aprobado en el plan", () => {
  const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
  const flujo = (texto) => new Response([
    sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
    sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
    sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
    sse("content_block_stop", { index: 0 }),
    sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
  ].join(""), { headers: { "content-type": "text/event-stream" } });

  it("cada hueco lleva su ángulo; se cambia y se guarda; la IA escribe con él y queda fijo en el hueco", async () => {
    db.sqlite.prepare("update mercado_clientes set estudio = ? where id = 'm1'").run(JSON.stringify({
      aprobadoAt: "2026-10-01T00:00:00.000Z",
      general: { resumen: "Muebles en Panamá.", perfiles: [{ nombre: "Mamá práctica", quien: "Mamás de 30 a 45" }], deseos: [] },
      productos: { sofa: { elementos: MALETAS, angulos: [
        { id: "visitas", nombre: "Las visitas que se quedan", publico: "frio", problemaExterno: "No hay dónde dormir a las visitas.", ganchos: ["¿Y si se quedan a dormir?"] },
        { id: "garantia", nombre: "Dos años sin preocuparte", publico: "tibio" },
      ] } },
    }));
    const d = await (await ciclo(JEFE)).json();
    expect(d.plan.angulos.map((a) => a.id)).toEqual(["visitas", "garantia"]);
    expect(d.plan.campanas[0].angulosHuecos[0]).toMatchObject({ id: "visitas", sugerido: true });
    expect(d.plan.campanas[1].angulosHuecos[0]).toMatchObject({ id: "garantia" });
    // «Sin ángulo» en el 2 de presentación: se guarda y el plan lo respeta.
    const r = await (await ciclo(JEFE, "c1", "", { method: "PUT", body: { mes: "2026-11", anuncios: { "presentacion:a2": { angulo: false } } } })).json();
    expect(r.guardado.anuncios["presentacion:a2"]).toMatchObject({ angulo: false });
    expect(r.plan.campanas[0].angulosHuecos[1]).toBeNull();

    env.ANTHROPIC_API_KEY = "k";
    const pedidos = [];
    vi.stubGlobal("fetch", async (url, opciones = {}) => {
      const u = String(url);
      if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
      if (u.startsWith("https://api.anthropic.com/v1/messages")) {
        pedidos.push(JSON.parse(opciones.body));
        return flujo(JSON.stringify({ anuncios: [{ n: 1, titulos: ["¿Y si se quedan?"], descripcion: "Sofá cama $450", boton: "WHATSAPP_MESSAGE" }] }));
      }
      throw new Error(`fetch inesperado a ${u}`);
    });
    const e = await ciclo(JEFE, "c1", "", { method: "POST", body: { mes: "2026-11", escribir: ["presentacion:a1"] } });
    expect(e.status).toBe(200);
    const prompt = pedidos[0].messages[0].content;
    expect(prompt).toMatch(/Ángulo de venta que prueba este anuncio[^\n]*«Las visitas que se quedan»/);
    expect(prompt).toMatch(/Ganchos de ese ángulo \(inspiración, no se copian\): «¿Y si se quedan a dormir\?»/);
    const guardado = await (await ciclo(JEFE)).json();
    expect(guardado.guardado.anuncios["presentacion:a1"].angulo).toEqual({ productoId: "sofa", id: "visitas", nombre: "Las visitas que se quedan" });
  });

  it("sin ángulos en el estudio aprobado, el plan va como antes", async () => {
    const d = await (await ciclo(JEFE)).json();
    expect(d.plan.angulos).toEqual([]);
  });
});
