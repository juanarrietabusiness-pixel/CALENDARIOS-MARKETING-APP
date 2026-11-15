import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { pedidoDelLote, produccionDeLote } from "../../worker/lib/estudio/lote.js";

// ============================================================
// Los TEXTOS y el MES por el conector de Claude (worker/lib/herramientasTextos.js)
//
//   · escribir_textos va por el MOTOR de la agencia (el modo «campos» y el «plan» de worker/lib/estudio/lote.js) y lo
//     guarda en el calendario: lo vacío del plan entero, lo que falta, y los campos pedidos se REESCRIBEN (con lo que
//     había delante). Una tanda por llamada: «Quedan N». Lo publicado no se toca.
//   · ficha_de_textos devuelve EXACTAMENTE el pedido del motor (`pedidoDelLote`) sin llamar a ninguna IA ni guardar.
//   · preparar_mes pone el plan semanal en los días libres (sin IA), con lo que va a pauta solo.
//   · estrategia_del_mes lee, propone (no guarda) y guarda SÓLO con confirmado: true.
//   · revisar_mes y lo que devuelven crear_publicacion/editar_publicacion al guardar texto: las reglas de «Revisar el mes».
// La IA es un `fetch` de mentira; la D1, de verdad.
// ============================================================

const JEFE = "u-jefe";
let db;
let env;
let avisos;
let peticiones;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

/** La IA de mentira: contesta `texto` (o lo que devuelva la función con el pedido). Sin `texto`, falla si la llaman. */
function anthropic(texto) {
  peticiones = [];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      if (texto === undefined) throw new Error("No se debía llamar a la IA");
      const cuerpo = JSON.parse(opciones.body);
      peticiones.push(cuerpo);
      return flujo(typeof texto === "function" ? texto(cuerpo) : texto);
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}

function r2() {
  const objetos = new Map();
  return {
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const bytes = new TextEncoder().encode(objetos.get(clave));
      return { arrayBuffer: async () => bytes, text: async () => objetos.get(clave) };
    },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor) { objetos.set(clave, typeof valor === "string" ? valor : new TextDecoder().decode(valor)); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const PLAN = { v: 1, dias: { 1: [{ format: "post", pilar: "anuncio", hora: "09:00" }], 3: [{ format: "reel", pilar: "educativo" }] } };
const textoPedido = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};

beforeEach(async () => {
  db = d1EnMemoria();
  avisos = [];
  env = {
    DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") },
    HUB: { idFromName: (n) => n, get: () => ({ fetch: async (req) => { avisos.push(await req.json()); return new Response("ok"); } }) },
  };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "y");
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-otro", "otro@a.com", "x", "y");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run("u-otro", "u-otro", "admin", "Otro", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("t-jefe"), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, whatsapp, plan_semanal) values (?,?,?,?,?)").run("c1", JEFE, "Dcasa", "+507 6000-0000", JSON.stringify(PLAN));
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("cx", "u-otro", "Ajena");
  s.prepare("insert into mercado_clientes (id, client_id, owner_id, catalogo) values (?,?,?,?)")
    .run("m1", "c1", JEFE, JSON.stringify([{ id: "sofa", nombre: "Sofá cama", precio: "$399", activo: true }]));
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

const mcp = () => crearHerramientasMCP({ env, acceso: crearAcceso(db, JEFE), usuario: { id: JEFE, nombre: "Juan" } });
async function llamar(nombre, entrada) {
  const r = await mcp().llamar(nombre, entrada);
  return { texto: r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"), error: Boolean(r.isError) };
}
const mesGuardado = (year = 2030, month = 2) => {
  const f = db.sqlite.prepare("select * from calendars where client_id = 'c1' and year = ? and month = ?").get(year, month);
  return f ? { ...f, days: JSON.parse(f.days), opciones: JSON.parse(f.opciones ?? "{}"), week_concepts: JSON.parse(f.week_concepts ?? "[]") } : null;
};
const posts = (m = mesGuardado()) => (m?.days ?? []).flatMap((d) => d.posts.map((p) => ({ ...p, fecha: d.date })));
/** Un mes con publicaciones ya escritas (como lo deja la pantalla). */
function sembrarMes(days, { id = "cal1", year = 2030, month = 2, extra = {} } = {}) {
  db.sqlite.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days, campaign, offers, opciones) values (?,?,?,?,?,?,?,?,?,?)")
    .run(id, "c1", JEFE, "Marzo", month, year, JSON.stringify(days), extra.campaign ?? "", extra.offers ?? "", JSON.stringify(extra.opciones ?? {}));
}

describe("las definiciones", () => {
  it("están en el MCP con sus anotaciones y lo que piden", () => {
    const por = Object.fromEntries(HERRAMIENTAS_MCP.map((h) => [h.name, h]));
    for (const n of ["escribir_textos", "ficha_de_textos", "preparar_mes", "estrategia_del_mes", "revisar_mes"]) expect(por[n], n).toBeTruthy();
    expect(por.escribir_textos.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(por.preparar_mes.annotations.readOnlyHint).toBe(false);
    expect(por.estrategia_del_mes.annotations.readOnlyHint).toBe(false);
    expect(por.ficha_de_textos.annotations.readOnlyHint).toBe(true);
    expect(por.revisar_mes.annotations.readOnlyHint).toBe(true);
    for (const n of ["preparar_mes", "estrategia_del_mes", "revisar_mes"]) expect(por[n].inputSchema.required).toEqual(["cliente", "mes"]);
    expect(por.editar_publicacion.inputSchema.properties).toHaveProperty("forma_gancho");
    expect(por.editar_publicacion.inputSchema.properties).toHaveProperty("angulo");
    expect(por.editar_publicacion.inputSchema.properties).toHaveProperty("anuncio");
  });
});

describe("pedidoDelLote: el motor partido en dos sin cambiar lo que hace", () => {
  it("el pedido que arma es el MISMO que produccionDeLote manda a la IA", async () => {
    anthropic(JSON.stringify({ textos: [{ n: 1, descripcion: "Ven hoy. Escríbenos." }] }));
    const datos = { modo: "campos", publicaciones: [{ clave: "p1", formato: "post", escrito: { idea: "Sofá cama" }, campos: ["descripcion"] }], semilla: 3 };
    const cliente = db.sqlite.prepare("select * from clients where id = 'c1'").get();
    const pedido = await pedidoDelLote(env, crearAcceso(db, JEFE), cliente, datos);
    const r = await produccionDeLote(env, crearAcceso(db, JEFE), cliente, datos);
    expect(r.textos[0].campos.descripcion).toBe("Ven hoy. Escríbenos.");
    expect(textoPedido(peticiones[0])).toContain(pedido.prompt);
    expect(peticiones).toHaveLength(1);
  });
});

describe("preparar_mes", () => {
  it("pone el plan semanal en los días libres (sin IA), crea el mes, marca lo que va a pauta y el paso del asistente", async () => {
    anthropic(undefined);
    const r = await llamar("preparar_mes", { cliente: "Dcasa", mes: "2030-03" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/Puse 8 publicaciones del plan semanal/);
    expect(r.texto).toMatch(/escribir_textos/);
    const m = mesGuardado();
    const ps = posts(m);
    expect(ps).toHaveLength(8);
    expect(ps.every((p) => p.delPlan && !p.idea)).toBe(true);
    const lunes = ps.find((p) => p.fecha === "2030-03-04");
    expect(lunes).toMatchObject({ format: "post", pilar: "anuncio", publishTime: "09:00", productoId: "sofa" });
    expect(lunes.pauta).toMatchObject({ auto: true });
    expect(ps.find((p) => p.fecha === "2030-03-06")).toMatchObject({ format: "reel", pilar: "educativo" });
    expect(m.opciones.asistente).toMatchObject({ paso: 2 });
    // El aviso al espacio no se espera (lib/vivo.js): llega en cuanto se suelta el hilo.
    await vi.waitFor(() => expect(avisos.some((a) => a.tipo === "calendario:recargar")).toBe(true));
    // Otra vez: los días ya tienen las suyas y no se repite nada (ni con llenar_ocupados: lo del plan no se pone dos veces).
    expect((await llamar("preparar_mes", { cliente: "Dcasa", mes: "2030-03" })).texto).toMatch(/ya tienen sus publicaciones/);
    await llamar("preparar_mes", { cliente: "Dcasa", mes: "2030-03", llenar_ocupados: true });
    expect(posts()).toHaveLength(8);
  });

  it("un día ocupado no recibe nada; un mes pasado, error; un cliente de otro espacio no existe", async () => {
    sembrarMes([{ date: "2030-03-04", posts: [{ id: "ya", format: "post", status: "pending", idea: "Lo de la agencia" }] }]);
    await llamar("preparar_mes", { cliente: "Dcasa", mes: "2030-03" });
    expect(posts().filter((p) => p.fecha === "2030-03-04").map((p) => p.id)).toEqual(["ya"]);
    expect(posts()).toHaveLength(8);
    expect((await llamar("preparar_mes", { cliente: "Dcasa", mes: "2020-03" })).error).toBe(true);
    const ajena = await llamar("preparar_mes", { cliente: "Ajena", mes: "2030-03" });
    expect(ajena.error).toBe(true);
    expect(ajena.texto).toMatch(/No encontré el cliente/);
  });
});

describe("escribir_textos", () => {
  it("con un mes: las vacías del plan por el modo «plan» del motor, de 6 en 6, guardadas al llegar («Quedan N»)", async () => {
    await llamar("preparar_mes", { cliente: "Dcasa", mes: "2030-03" });
    anthropic(() => JSON.stringify({ ideas: Array.from({ length: 8 }, (_, i) => ({ n: i + 1, titulo: `Idea ${i + 1}`, titular: `Titular ${i + 1}`, apoyo: "Escríbenos", escena: `Una sala ${i + 1}`, brief: `Brief ${i + 1}`, descripcion: `Caption ${i + 1}. Escríbenos por WhatsApp.`, hashtags: "#sofa #panama", guion: "Plano 1: algo", anuncio: { textos: [`Texto ${i + 1}. Escríbenos por WhatsApp.`], titulos: ["Sofá cama"], descripcion: "A buen precio", boton: "WHATSAPP_MESSAGE" } })) }));
    const r = await llamar("escribir_textos", { cliente: "Dcasa", mes: "2030-03" });
    expect(r.error).toBe(false);
    // El mes por el conector: el planificador (aquí no devuelve plan), el redactor de dos en dos (3 llamadas) y el revisor.
    expect(peticiones).toHaveLength(5);
    expect(textoPedido(peticiones[0])).toMatch(/^Eres el PLANIFICADOR/);
    expect(textoPedido(peticiones[4])).toMatch(/EDITOR JEFE/);
    const pedido = textoPedido(peticiones[1]);
    expect(pedido).toMatch(/forma del gancho: «/);
    expect(pedido).toMatch(/Sofá cama/);
    const conIdea = posts().filter((p) => p.idea);
    expect(conIdea).toHaveLength(6);
    expect(conIdea[0]).toMatchObject({ title: "Idea 1", escena: "Una sala 1" });
    expect(conIdea.every((p) => p.formaGancho)).toBe(true);
    expect(r.texto).toMatch(/Escribí 6 publicaciones/);
    expect(r.texto).toMatch(/Quedan 2/);
    await vi.waitFor(() => expect(avisos.some((a) => a.tipo === "calendario:recargar")).toBe(true));
  });

  it("con una publicación y campos: los REESCRIBE (con lo que había) y rellena los hashtags que faltaban", async () => {
    sembrarMes([{ date: "2030-03-04", posts: [{ id: "p1", format: "post", status: "pending", idea: "Sofá cama para visitas", descripcion: "Viejo caption", pilar: "anuncio", productoId: "sofa" }] }]);
    anthropic((cuerpo) => {
      const t = textoPedido(cuerpo);
      expect(t).toMatch(/lo que tiene ahora en «caption»/);
      expect(t).toMatch(/lo que pide la agencia para esta: más corto/);
      return JSON.stringify({ textos: [{ n: 1, descripcion: "Nuevo caption. Escríbenos por WhatsApp.", hashtags: "#sofa #dcasa" }] });
    });
    const r = await llamar("escribir_textos", { publicacion_id: "p1", campos: ["descripcion"], pide: "más corto" });
    expect(r.error).toBe(false);
    expect(posts()[0]).toMatchObject({ descripcion: "Nuevo caption. Escríbenos por WhatsApp.", hashtagsFinales: "#sofa #dcasa", idea: "Sofá cama para visitas" });
    expect(r.texto).toMatch(/Lo que había en «caption»: «Viejo caption»/);
  });

  it("sin campos sólo rellena; lo publicado no se toca; nada que hacer, lo dice sin llamar a la IA", async () => {
    sembrarMes([{ date: "2030-03-04", posts: [
      { id: "pub", format: "post", status: "published", idea: "Salió", descripcion: "" },
      { id: "lleno", format: "historia", status: "pending", idea: "Una", textoPieza: "Hola" },
    ] }]);
    anthropic(undefined);
    expect((await llamar("escribir_textos", { publicacion_id: "pub" })).error).toBe(true);
    expect((await llamar("escribir_textos", { publicacion_id: "lleno" })).texto).toMatch(/no le falta ningún texto/);
    expect((await llamar("escribir_textos", { publicacion_id: "lleno", campos: ["descripcion"] })).texto).toMatch(/no lleva caption/);
    expect(posts().find((p) => p.id === "pub").descripcion).toBe("");
  });
});

describe("ficha_de_textos (el modo híbrido)", () => {
  it("devuelve el pedido del motor con la forma y el ángulo de cada pieza, sin llamar a la IA ni guardar nada", async () => {
    sembrarMes([{ date: "2030-03-04", posts: [{ id: "p1", format: "post", status: "pending", idea: "Sofá cama para visitas", pilar: "anuncio", productoId: "sofa" }] }]);
    anthropic(undefined);
    const antes = JSON.stringify(posts());
    const r = await llamar("ficha_de_textos", { cliente: "Dcasa", mes: "2030-03" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/=== EL PEDIDO ===/);
    expect(r.texto).toMatch(/Escribe lo que les falta a UNA publicación del calendario de Dcasa/);
    expect(r.texto).toMatch(/producto: Sofá cama.*precio: \$399/);
    // El arreglo del motor: «antes» de un campo ya no sale como «la que había y NO sirvió: [object Object]».
    expect(r.texto).not.toMatch(/object Object/);
    expect(r.texto).toMatch(/forma_gancho: [\w-]+/);
    expect(r.texto).toMatch(/editar_publicacion/);
    expect(JSON.stringify(posts())).toBe(antes);
    expect(peticiones).toHaveLength(0);
  });
});

describe("ficha_de_textos con las vacías del plan", () => {
  it("el pedido del modo «plan» (la idea entera) con dónde se guarda cada cosa, y una tanda que no pasa del tope", async () => {
    await llamar("preparar_mes", { cliente: "Dcasa", mes: "2030-03" });
    anthropic(undefined);
    const r = await llamar("ficha_de_textos", { cliente: "Dcasa", mes: "2030-03" });
    expect(r.error).toBe(false);
    if (process.env.VER_FICHA) console.log(r.texto);
    expect(r.texto).toMatch(/vacías: la idea entera/);
    expect(r.texto).toMatch(/guarda titulo, idea \(el brief\), escena/);
    expect(r.texto).toMatch(/Quedan \d+ después de éstas/);
    expect(r.texto.length).toBeLessThan(40000);
    expect(posts().every((p) => !p.idea)).toBe(true);
  });
});

describe("estrategia_del_mes", () => {
  it("guardar sin confirmado NO guarda; con confirmado sí (lo mismo que el asistente del mes); leer la enseña", async () => {
    sembrarMes([]);
    const guardar = { objetivo: "ventas", foco: "Sofá cama", campana: "Visitas sin estrés", ofertas: "15 % en sofás cama", semanas: [{ concepto: "Dónde duermen", etapa: "presentacion" }] };
    const sin = await llamar("estrategia_del_mes", { cliente: "Dcasa", mes: "2030-03", guardar });
    expect(sin.texto).toMatch(/^NO SE GUARDÓ NADA/);
    expect(sin.texto).toMatch(/Visitas sin estrés/);
    expect(mesGuardado().campaign).toBe("");
    const con = await llamar("estrategia_del_mes", { cliente: "Dcasa", mes: "2030-03", guardar, confirmado: true });
    expect(con.error).toBe(false);
    const m = mesGuardado();
    expect(m).toMatchObject({ campaign: "Visitas sin estrés", offers: "15 % en sofás cama" });
    expect(m.week_concepts[0]).toBe("Dónde duermen");
    expect(m.opciones.estrategia).toMatchObject({ objetivo: "ventas", focoId: "sofa", foco: "Sofá cama" });
    expect(m.opciones.estrategia.etapas[0]).toBe("presentacion");
    const leer = await llamar("estrategia_del_mes", { cliente: "Dcasa", mes: "2030-03" });
    expect(leer.texto).toMatch(/Producto foco: Sofá cama/);
  });

  it("proponer: la IA propone y no se guarda nada", async () => {
    anthropic(JSON.stringify({ objetivo: "ventas", foco: "sofa", campana: "Marzo de visitas", razon: "Porque sí.", semanas: [{ concepto: "Uno", etapa: "presentacion" }], ofertas: "" }));
    const r = await llamar("estrategia_del_mes", { cliente: "Dcasa", mes: "2030-03", proponer: true });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/PROPUESTA DE LA IA/);
    expect(r.texto).toMatch(/Marzo de visitas/);
    expect(mesGuardado()).toBeNull();
  });
});

describe("revisar_mes y la revisión al guardar", () => {
  it("revisar_mes: el precio fuera del catálogo y el voseo, con cómo arreglarlo, y el balance", async () => {
    sembrarMes([{ date: "2030-03-04", posts: [{ id: "p1", format: "post", status: "pending", idea: "Sofá", descripcion: "Vení por tu sofá a $350. Escribinos" }] }]);
    const r = await llamar("revisar_mes", { cliente: "Dcasa", mes: "2030-03" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/\$350, que no está en el catálogo/);
    expect(r.texto).toMatch(/Cómo: Usa el precio EXACTO del catálogo/);
    expect(r.texto).toMatch(/Voseo/);
    expect(r.texto).toMatch(/ID p1/);
  });

  it("editar_publicacion: un precio fuera del catálogo devuelve el aviso; un texto limpio, «sin avisos»; sin texto, nada", async () => {
    sembrarMes([{ date: "2030-03-04", posts: [{ id: "p1", format: "post", status: "pending", idea: "Sofá" }] }]);
    const mal = await llamar("editar_publicacion", { publicacion_id: "p1", descripcion: "El sofá cama a $350. Escríbenos por WhatsApp." });
    expect(mal.error).toBe(false);
    expect(mal.texto).toMatch(/Actualizada/);
    expect(mal.texto).toMatch(/AVISOS DEL CALENDARIO \(corrígelos con editar_publicacion\)/);
    expect(mal.texto).toMatch(/\$350/);
    const bien = await llamar("editar_publicacion", { publicacion_id: "p1", descripcion: "El sofá cama a $399. Escríbenos por WhatsApp.", hashtags: "#sofa" });
    expect(bien.texto).toMatch(/Revisado: sin avisos/);
    const hora = await llamar("editar_publicacion", { publicacion_id: "p1", hora: "18:30" });
    expect(hora.texto).not.toMatch(/Revisado|AVISOS/);
    expect(posts()[0]).toMatchObject({ descripcion: "El sofá cama a $399. Escríbenos por WhatsApp.", publishTime: "18:30" });
  });

  it("editar_publicacion guarda la forma del gancho y el ángulo (validados) y los textos del anuncio", async () => {
    sembrarMes([{ date: "2030-03-04", posts: [{ id: "p1", format: "post", status: "pending", idea: "Sofá" }] }]);
    expect((await llamar("editar_publicacion", { publicacion_id: "p1", forma_gancho: "no-existe" })).error).toBe(true);
    const ficha = (await llamar("ficha_de_textos", { publicacion_id: "p1" })).texto;
    const forma = /forma_gancho: ([\w-]+)/.exec(ficha)?.[1];
    expect(forma).toBeTruthy();
    const r = await llamar("editar_publicacion", { publicacion_id: "p1", forma_gancho: forma, angulo: "visitas", anuncio: { textos: ["Uno. Escríbenos por WhatsApp."], titulos: ["Sofá cama"], boton: "WHATSAPP_MESSAGE" } });
    expect(r.error).toBe(false);
    expect(posts()[0]).toMatchObject({ formaGancho: forma, angulo: "visitas", anuncio: { textos: ["Uno. Escríbenos por WhatsApp."], boton: "WHATSAPP_MESSAGE" } });
  });

  it("editar_publicacion guarda el enlace de la referencia (limpio) y lo quita con \"\"", async () => {
    sembrarMes([{ date: "2030-03-04", posts: [{ id: "p1", format: "post", status: "pending", idea: "Sofá" }] }]);
    expect((await llamar("editar_publicacion", { publicacion_id: "p1", referencia: "esto no es un enlace" })).error).toBe(true);
    expect((await llamar("editar_publicacion", { publicacion_id: "p1", referencia: "Mira este https://www.instagram.com/reel/abc123/ ." })).error).toBe(false);
    expect(posts()[0].referenceLink).toBe("https://www.instagram.com/reel/abc123/");
    expect((await llamar("editar_publicacion", { publicacion_id: "p1", referencia: "" })).error).toBe(false);
    expect(posts()[0].referenceLink).toBe("");
  });

  it("crear_publicacion con texto también se revisa", async () => {
    sembrarMes([]);
    const r = await llamar("crear_publicacion", { cliente: "Dcasa", fecha: "2030-03-05", formato: "post", descripcion: "Vení hoy. Escribinos" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/Creada/);
    expect(r.texto).toMatch(/AVISOS DEL CALENDARIO/);
    expect(r.texto).toMatch(/Voseo/);
  });
});

describe("las rutas de la pantalla siguen igual", () => {
  it("GET /api/plantillas-plan (lo que se sacó a worker/lib/plantillasPlan.js) sigue dando las de arranque", async () => {
    const r = await worker.fetch(new Request("https://calendarios.test/api/plantillas-plan", { headers: { Cookie: `${COOKIE}=t-jefe` } }), env);
    expect(r.status).toBe(200);
    expect((await r.json()).plantillas.length).toBeGreaterThan(0);
  });

  it("POST /api/estudio/<c>/lote/ideas (modo «campos») sigue contestando lo de siempre", async () => {
    anthropic(JSON.stringify({ textos: [{ n: 1, descripcion: "Ven hoy." }] }));
    const r = await worker.fetch(new Request("https://calendarios.test/api/estudio/c1/lote/ideas", {
      method: "POST", headers: { Cookie: `${COOKIE}=t-jefe`, "Content-Type": "application/json" },
      body: JSON.stringify({ modo: "campos", publicaciones: [{ clave: "p1", formato: "post", escrito: { idea: "Sofá" }, campos: ["descripcion"] }] }),
    }), env);
    expect(r.status).toBe(200);
    expect((await r.json()).textos[0]).toMatchObject({ clave: "p1", campos: { descripcion: "Ven hoy." } });
  });
});
