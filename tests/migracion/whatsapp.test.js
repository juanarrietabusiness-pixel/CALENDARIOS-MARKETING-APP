import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearEjecutor } from "../../worker/lib/herramientasServidor.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { MAX_RESPUESTAS_CLIENTE } from "../../src/lib/vozCliente.js";

// ============================================================
// WhatsApp e investigación (curso de campañas, entrega 8)
//
// Lo que importa:
//   1. El kit lo PROPONE la IA con el estudio aprobado, el catálogo y la ficha del cliente, nunca con lo interno del
//      cerebro, y con los precios puestos por el código. Proponer no guarda; «Guardar» sí, y sin pisar las otras
//      columnas de la fila de anuncios del cliente.
//   2. La voz del cliente va SIN sesión por un testigo que se crea una vez; un testigo que no existe es 404.
//   3. «Llevar al estudio» propone sin guardar; «Aceptar» va al BORRADOR del estudio y un testimonio sólo entra si su
//      respuesta dio permiso (aunque el navegador mande otro).
//   4. Un colaborador sin ese cliente, otro espacio o quien es de sólo lectura no pasan.
//   5. El asistente y Claude leen el kit guardado (`kit_whatsapp`).
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const COLAB = "u-colab";
const LECTOR = "u-lector";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra", [COLAB]: "t-colab", [LECTOR]: "t-lector" };

let db;
let env;
let peticiones;
let respuestas;
let eventos;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

function anthropic(...lista) {
  peticiones = [];
  respuestas = [...lista];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      const cuerpo = JSON.parse(opciones.body);
      peticiones.push(cuerpo);
      const r = respuestas.length > 1 ? respuestas.shift() : respuestas[0];
      return typeof r === "function" ? r(cuerpo) : r;
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const o = objetos.get(clave);
      const bytes = typeof o.bytes === "string" ? new TextEncoder().encode(o.bytes) : o.bytes;
      return { httpMetadata: { contentType: o.tipo }, size: bytes.byteLength, arrayBuffer: async () => bytes, text: async () => new TextDecoder().decode(bytes) };
    },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor, op) {
      const bytes = typeof valor === "string" ? valor : valor instanceof ReadableStream ? new Uint8Array(await new Response(valor).arrayBuffer()) : new Uint8Array(valor);
      objetos.set(clave, { bytes, tipo: op?.httpMetadata?.contentType });
    },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "X-Pestana": "pestana-1", ...(opciones.body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: opciones.body === undefined || opciones.body instanceof FormData ? opciones.body : JSON.stringify(opciones.body),
  }), env);
const publico = (testigo, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test/api/publico-voz/${testigo}`, {
    ...opciones,
    headers: { "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};
const fila = (cliente = "c1") => db.sqlite.prepare("select * from anuncios_clientes where client_id = ?").get(cliente);
const esperarEventos = () => new Promise((r) => setTimeout(r, 0));

const CATALOGO = [
  { id: "sofa", nombre: "Sofá cama", tipo: "producto", precio: "$450", oferta: "Envío gratis esta semana" },
  { id: "mesa", nombre: "Mesa de centro", tipo: "producto", precio: "$120" },
  { id: "vieja", nombre: "Vieja", tipo: "producto", precio: "$1", activo: false },
];
const ESTUDIO = {
  general: null,
  productos: {
    sofa: {
      elementos: {
        publico: "Familias en apartamentos pequeños", problema: "No caben dos muebles", solucion: "Sofá que se abre en cama en segundos",
        diferenciales: "Lo armamos el mismo día", objeciones: "El precio y si cabe", garantia: "Un año contra defectos de fábrica",
      },
      objeciones: [{ objecion: "¿Cabe en mi sala?", respuesta: "Mide 1,80 m: te pasamos las medidas." }],
    },
  },
  aprobadoAt: "2026-10-01T10:00:00.000Z",
};

const KIT_IA = JSON.stringify({
  bienvenida: "¡Hola! Te atiende Dcasa. ¿Qué mueble buscas?",
  ausencia: "Ahora no estamos: te respondemos [completar: el horario de atención].",
  respuestas: [
    { atajo: "precio", titulo: "Precios", texto: "Nuestros precios:\n{precios}" },
    { atajo: "envio", titulo: "Envíos", texto: "Enviamos a todo Panamá." },
    { atajo: "horario", titulo: "Horario", texto: "[completar: el horario]" },
    { atajo: "ubicacion", titulo: "Dónde", texto: "Estamos en Calle 50." },
    { atajo: "pago", titulo: "Pago", texto: "[completar: formas de pago]" },
    { atajo: "cabe", titulo: "¿Cabe?", texto: "Mide 1,80 m: te paso las medidas.", objecion: true },
  ],
  etiquetas: [{ nombre: "Nuevo", etapa: "presentacion", cuando: "Escribió" }, { nombre: "Cotizó", etapa: "conversion", cuando: "Tiene el precio" }],
  guiones: [{ productoId: "sofa", saludo: "Hola", preguntas: ["¿Para qué espacio?"], presentacion: "Se arma el mismo día.", objeciones: [{ objecion: "Es caro", respuesta: "Es sofá y cama." }], cierre: "Con {oferta}, queda en {precio}. ¿Te lo aparto?", seguimiento: ["¿Pudiste ver las medidas?"] }],
});

async function sembrar() {
  const s = db.sqlite;
  for (const id of [JEFE, OTRA, COLAB, LECTOR]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#123456");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Colab", "#654321", '["c2"]');
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura) values (?,?,?,?,?,?)").run(LECTOR, JEFE, "editor", "Lector", "#777777", 1);
  s.prepare("insert into clients (id, owner_id, name, industry, whatsapp, sucursales, primary_color) values (?,?,?,?,?,?,?)")
    .run("c1", JEFE, "Dcasa", "Muebles", "+507 6000-0000", "Calle 50, Panamá", "#0A7A5A");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Café Luna");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  s.prepare("insert into mercado_clientes (id, owner_id, client_id, catalogo, estudio) values (?,?,?,?,?)")
    .run("m1", JEFE, "c1", JSON.stringify(CATALOGO), JSON.stringify(ESTUDIO));
  // Lo que ya decidía la agencia de los anuncios del cliente: el kit y la voz no pueden borrarlo.
  s.prepare("insert into anuncios_clientes (id, owner_id, client_id, informe_automatico, mostrar_costo, negocio, testigo_ventas) values (?,?,?,?,?,?,?)")
    .run("ac1", JEFE, "c1", 1, 0, JSON.stringify({ v: 1, tipo: "productos", destino: "whatsapp" }), "v".repeat(48));
  await pedir(JEFE, "/cerebro/c1/nota", { method: "PUT", body: { titulo: "Voz", texto: "Tuteamos y somos cercanos. Nada de emojis.", tipo: "marca" } });
  await pedir(JEFE, "/cerebro/c1/nota", { method: "PUT", body: { titulo: "Costos", texto: "El margen del sofá es del 60 %, secreto.", tipo: "documento", interna: true } });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T15:00:00.000Z"));
  db = d1EnMemoria();
  eventos = [];
  env = {
    DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) },
    HUB: { idFromName: (n) => n, get: (espacio) => ({ fetch: async (req) => { eventos.push({ espacio, ...(await req.json()) }); return new Response("ok"); } }) },
  };
  anthropic(flujo(KIT_IA));
  await sembrar();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); olvidarModelos(); });

describe("el kit de WhatsApp Business", () => {
  it("sin kit: vacío, con los precios del catálogo (sólo lo activo) y si el estudio tiene garantía", async () => {
    const r = await pedir(JEFE, "/whatsapp/c1");
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.kit.respuestas).toEqual([]);
    expect(d.contexto.productos.map((p) => p.id)).toEqual(["sofa", "mesa"]);
    expect(d.contexto).toMatchObject({ hayGarantia: true, conEstudio: true, aprobadoAt: ESTUDIO.aprobadoAt });
  });

  it("proponer: la IA lee el estudio, el catálogo, la ficha y la voz (nunca lo interno); los precios los pone el código; no guarda", async () => {
    const r = await pedir(JEFE, "/whatsapp/c1/proponer", { method: "POST", body: {} });
    expect(r.status).toBe(200);
    const d = await r.json();
    const pedido = textoDe(peticiones.at(-1));
    expect(pedido).toContain("[sofa] Sofá cama");
    expect(pedido).toContain("precio: $450");
    expect(pedido).toContain("Objeción: «¿Cabe en mi sala?» → Mide 1,80 m");
    expect(pedido).toContain("Garantía: Un año contra defectos de fábrica");
    expect(pedido).toContain("WhatsApp +507 6000-0000");
    expect(pedido).toContain("Tuteamos y somos cercanos");
    expect(pedido).toContain("vende productos");
    expect(pedido).not.toContain("margen del sofá");
    expect(pedido).not.toContain("Vieja");
    // Los precios, exactos, del catálogo.
    expect(d.kit.respuestas[0].texto).toContain("• Sofá cama: $450 (Envío gratis esta semana)");
    expect(d.kit.guiones[0].cierre).toBe("Con Envío gratis esta semana, queda en $450. ¿Te lo aparto?");
    expect(d.kit.propuestoAt).toBeTruthy();
    expect(d.pendientes.map((p) => p.donde)).toEqual(["Ausencia", "/horario", "/pago"]);
    // Nada guardado.
    expect(JSON.parse(fila().kit_whatsapp)).toEqual({});
    const consumo = db.sqlite.prepare("select funcion from consumo_ia where client_id = 'c1'").all().map((x) => x.funcion);
    expect(consumo).toContain("kit de WhatsApp");
  });

  it("guardar: escribe sólo su columna, avisa al espacio y otra persona no se pisa (409)", async () => {
    const { kit } = await (await pedir(JEFE, "/whatsapp/c1/proponer", { method: "POST", body: {} })).json();
    const r = await pedir(JEFE, "/whatsapp/c1", { method: "PUT", body: { kit, antes: null } });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.kit).toMatchObject({ por: "Juan", actualizado: expect.any(String) });
    expect(d.kit.respuestas).toHaveLength(6);
    const f = fila();
    expect(f).toMatchObject({ informe_automatico: 1, mostrar_costo: 0, testigo_ventas: "v".repeat(48) });
    expect(JSON.parse(f.negocio)).toMatchObject({ tipo: "productos" });
    expect(JSON.parse(f.kit_whatsapp).bienvenida.texto).toContain("Te atiende Dcasa");
    await esperarEventos();
    expect(eventos.some((e) => e.tipo === "whatsapp" && e.que === "kit" && e.clientId === "c1")).toBe(true);

    const viejo = await pedir(JEFE, "/whatsapp/c1", { method: "PUT", body: { kit, antes: null } });
    expect(viejo.status).toBe(409);
    expect((await viejo.json()).kit.actualizado).toBe(d.kit.actualizado);
    expect((await pedir(JEFE, "/whatsapp/c1", { method: "PUT", body: { kit, antes: d.kit.actualizado } })).status).toBe(200);
    expect((await pedir(JEFE, "/whatsapp/c1", { method: "PUT", body: {} })).status).toBe(400);
  });

  it("un cliente sin fila de anuncios también guarda su kit", async () => {
    const r = await pedir(JEFE, "/whatsapp/c2", { method: "PUT", body: { kit: { bienvenida: "Hola" } } });
    expect(r.status).toBe(200);
    expect(JSON.parse(fila("c2").kit_whatsapp).bienvenida.texto).toBe("Hola");
  });

  it("un colaborador sin el cliente, otro espacio y quien es de sólo lectura no pasan", async () => {
    for (const [ruta, opciones] of [["/whatsapp/c1", {}], ["/whatsapp/c1", { method: "PUT", body: { kit: {} } }], ["/whatsapp/c1/proponer", { method: "POST", body: {} }]]) {
      expect((await pedir(COLAB, ruta, opciones)).status, `colaborador ${ruta}`).toBe(404);
      expect((await pedir(OTRA, ruta, opciones)).status, `otro espacio ${ruta}`).toBe(404);
    }
    expect((await pedir(COLAB, "/whatsapp/c2")).status).toBe(200);
    expect((await pedir(LECTOR, "/whatsapp/c1")).status).toBe(200);
    expect((await pedir(LECTOR, "/whatsapp/c1", { method: "PUT", body: { kit: {} } })).status).toBe(403);
    expect(peticiones).toHaveLength(0);
  });

  it("el asistente y Claude leen el kit guardado", async () => {
    const { kit } = await (await pedir(JEFE, "/whatsapp/c1/proponer", { method: "POST", body: {} })).json();
    await pedir(JEFE, "/whatsapp/c1", { method: "PUT", body: { kit } });
    const acceso = crearAcceso(db, JEFE);
    const r = await crearEjecutor({ env, acceso }).ejecutar({ id: "t1", name: "kit_whatsapp", input: { cliente: "Dcasa" } });
    expect(r.is_error).toBeUndefined();
    expect(r.content).toContain("KIT DE WHATSAPP BUSINESS · Dcasa");
    expect(r.content).toContain("/precio — Precios");
    const sinKit = await crearEjecutor({ env, acceso }).ejecutar({ id: "t2", name: "kit_whatsapp", input: { cliente: "Café Luna" } });
    expect(sinKit.content).toMatch(/todavía no tiene kit/);

    expect(HERRAMIENTAS_MCP.find((h) => h.name === "kit_whatsapp")?.annotations.readOnlyHint).toBe(true);
    const mcp = crearHerramientasMCP({ env, acceso, usuario: { id: JEFE, nombre: "Juan" } });
    const m = await mcp.llamar("kit_whatsapp", { cliente: "Dcasa" });
    expect(m.isError).toBeUndefined();
    expect(m.content[0].text).toContain("GUION DE VENTAS · Sofá cama");
  });
});

describe("la voz del cliente", () => {
  const enlace = async (cliente = "c1") => (await (await pedir(JEFE, `/whatsapp/${cliente}/voz/enlace`, { method: "POST", body: {} })).json());

  it("el enlace se crea una vez y se reutiliza; no borra lo de la fila", async () => {
    const a = await enlace();
    expect(a.testigo).toMatch(/^[0-9a-f]{48}$/);
    expect(a.url).toBe(`https://calendarios.test/voz?t=${a.testigo}`);
    expect((await enlace()).testigo).toBe(a.testigo);
    expect(fila()).toMatchObject({ testigo_voz: a.testigo, testigo_ventas: "v".repeat(48), informe_automatico: 1 });
    // Otro cliente, otro testigo.
    expect((await enlace("c2")).testigo).not.toBe(a.testigo);
  });

  it("sin sesión: la encuesta con el nombre del cliente y sus productos activos", async () => {
    const { testigo } = await enlace();
    const r = await publico(testigo);
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.cliente).toMatchObject({ nombre: "Dcasa", color: "#0A7A5A" });
    expect(d.preguntas).toHaveLength(7);
    expect(d.preguntas.filter((p) => p.obligatoria).map((p) => p.id)).toEqual(["porque"]);
    expect(d.productos).toEqual([{ id: "sofa", nombre: "Sofá cama" }, { id: "mesa", nombre: "Mesa de centro" }]);
    // Nada del espacio ni de la agencia.
    expect(JSON.stringify(d)).not.toMatch(/owner|u-jefe|Juan|\$450/);
  });

  it("un testigo que no existe es 404 (también al responder)", async () => {
    for (const t of ["a".repeat(48), "corto"]) {
      expect((await publico(t)).status).toBe(404);
      expect((await publico(t, { method: "POST", body: { respuestas: { porque: "x" } } })).status).toBe(404);
    }
  });

  it("responder: se guarda en su espacio, avisa, y lo obligatorio, el nombre del testimonio y la trampa se respetan", async () => {
    const { testigo } = await enlace();
    const ok = await publico(testigo, { method: "POST", body: { respuestas: { porque: "Me lo armaron el mismo día", sorpresa: "Llegó rapidísimo" }, nombre: "Ana", permiso: true, producto: "sofa", recomienda: "si" } });
    expect(ok.status).toBe(200);
    const filas = db.sqlite.prepare("select * from voz_cliente").all();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ owner_id: JEFE, client_id: "c1", nombre: "Ana", permiso: 1, producto: "sofa", recomienda: "si", llevada_at: null });
    await esperarEventos();
    expect(eventos.some((e) => e.tipo === "whatsapp" && e.que === "voz" && e.por?.userId === "cliente")).toBe(true);

    const sinObligatoria = await publico(testigo, { method: "POST", body: { respuestas: { problema: "x" } } });
    expect(sinObligatoria.status).toBe(400);
    expect((await sinObligatoria.json()).error).toMatch(/por qué nos escogiste/);
    expect((await publico(testigo, { method: "POST", body: { respuestas: { porque: "x" }, permiso: true } })).status).toBe(400);
    const robot = await publico(testigo, { method: "POST", body: { respuestas: { porque: "compra ya" }, sitio: "http://spam" } });
    expect(robot.status).toBe(200);
    expect(db.sqlite.prepare("select count(*) as n from voz_cliente").get().n).toBe(1);
  });

  it("con el tope de respuestas lleno, 409", async () => {
    const { testigo } = await enlace();
    const ins = db.sqlite.prepare("insert into voz_cliente (id, owner_id, client_id, respuestas) values (?,?,?,?)");
    for (let i = 0; i < MAX_RESPUESTAS_CLIENTE; i++) ins.run(`v${i}`, JEFE, "c1", '{"porque":"x"}');
    expect((await publico(testigo, { method: "POST", body: { respuestas: { porque: "otra" } } })).status).toBe(409);
  });

  it("la agencia ve las respuestas con su resumen y quita una", async () => {
    const { testigo } = await enlace();
    await publico(testigo, { method: "POST", body: { respuestas: { porque: "Precio" }, recomienda: "tal-vez" } });
    const d = await (await pedir(JEFE, "/whatsapp/c1/voz")).json();
    expect(d.testigo).toBe(testigo);
    expect(d.resumen).toMatchObject({ total: 1, conPermiso: 0, sinLlevar: 1 });
    const id = d.respuestas[0].id;
    expect((await pedir(COLAB, `/whatsapp/c1/voz/${id}`, { method: "DELETE" })).status).toBe(404);
    expect((await pedir(JEFE, `/whatsapp/c1/voz/${id}`, { method: "DELETE" })).status).toBe(200);
    expect((await pedir(JEFE, `/whatsapp/c1/voz/${id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("«Llevar al estudio» propone sin guardar; «Aceptar» va al borrador y el testimonio sin permiso no entra", async () => {
    const { testigo } = await enlace();
    await publico(testigo, { method: "POST", body: { respuestas: { porque: "Me lo armaron el mismo día", sorpresa: "Llegó rapidísimo" }, nombre: "Ana", permiso: true, producto: "sofa" } });
    await publico(testigo, { method: "POST", body: { respuestas: { porque: "Precio", freno: "No sabía si cabía" }, nombre: "Luis" } });
    const ids = db.sqlite.prepare("select id, nombre from voz_cliente").all();
    const ana = ids.find((x) => x.nombre === "Ana").id;
    const luis = ids.find((x) => x.nombre === "Luis").id;

    anthropic(flujo(JSON.stringify({
      productos: [{
        productoId: "sofa", problema: ["No sabía si cabía"], diferenciales: ["Lo arman el mismo día"],
        objeciones: [{ objecion: "¿Y si no cabe?", respuesta: "Te pasamos las medidas antes." }],
        testimonios: [{ respuestaId: ana, cita: "Llegó rapidísimo" }, { respuestaId: luis, cita: "Precio" }],
      }],
      resumen: "Lo rápido.",
    })));
    const r = await pedir(JEFE, "/whatsapp/c1/voz/estudio", { method: "POST", body: {} });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(textoDe(peticiones[0])).toContain(`[${ana}] PUEDE SER TESTIMONIO (Ana)`);
    expect(d.propuesta.productos[0].testimonios).toEqual([{ respuestaId: ana, nombre: "Ana", cita: "Llegó rapidísimo" }]);
    expect(d.leidas.sort()).toEqual([ana, luis].sort());
    expect(db.sqlite.prepare("select borrador from mercado_clientes where client_id = 'c1'").get().borrador).toBeNull();

    // El navegador manda además un testimonio de Luis (sin permiso): no entra.
    const propuesta = structuredClone(d.propuesta);
    propuesta.productos[0].testimonios.push({ respuestaId: luis, nombre: "Luis", cita: "Precio" });
    const a = await pedir(JEFE, "/whatsapp/c1/voz/aceptar", { method: "POST", body: { propuesta, leidas: d.leidas } });
    expect(a.status).toBe(200);
    const { borrador, cambios } = await a.json();
    expect(cambios).toBe(4);
    const sofa = borrador.productos.sofa;
    expect(sofa.elementos.problema).toContain("En palabras de sus clientes: «No sabía si cabía»");
    expect(sofa.elementos.testimonios).toBe("«Llegó rapidísimo» — Ana");
    expect(sofa.objeciones.map((o) => o.objecion)).toContain("¿Y si no cabe?");
    expect(borrador).not.toHaveProperty("aprobadoAt");
    // Lo aprobado no cambia hasta aprobar el borrador.
    const m = db.sqlite.prepare("select estudio, borrador from mercado_clientes where client_id = 'c1'").get();
    expect(JSON.parse(m.estudio).productos.sofa.elementos.testimonios ?? "").toBe("");
    expect(JSON.parse(m.borrador).productos.sofa.elementos.testimonios).toBe("«Llegó rapidísimo» — Ana");
    // Las leídas quedan llevadas: «Llevar al estudio» otra vez no tiene nada nuevo.
    expect(db.sqlite.prepare("select count(*) as n from voz_cliente where llevada_at is not null").get().n).toBe(2);
    expect((await pedir(JEFE, "/whatsapp/c1/voz/estudio", { method: "POST", body: {} })).status).toBe(409);
    // Aceptar lo mismo otra vez: nada nuevo.
    expect((await pedir(JEFE, "/whatsapp/c1/voz/aceptar", { method: "POST", body: { propuesta: d.propuesta, leidas: d.leidas } })).status).toBe(409);
  });

  it("sin estudio no hay dónde llevarlas; un colaborador sin el cliente no pasa", async () => {
    expect((await pedir(JEFE, "/whatsapp/c2/voz/estudio", { method: "POST", body: {} })).status).toBe(409);
    expect((await pedir(COLAB, "/whatsapp/c1/voz")).status).toBe(404);
    expect((await pedir(COLAB, "/whatsapp/c1/voz/enlace", { method: "POST", body: {} })).status).toBe(404);
    expect((await pedir(COLAB, "/whatsapp/c1/voz/aceptar", { method: "POST", body: { propuesta: {} } })).status).toBe(404);
  });
});

describe("el semáforo y las referencias", () => {
  it("GET /api/estudio dice cuándo se aprobó el estudio de mercado", async () => {
    const d = await (await pedir(JEFE, "/estudio/c1")).json();
    expect(d.estudioMercado).toEqual({ aprobadoAt: ESTUDIO.aprobadoAt, conBorrador: false });
    const sin = await (await pedir(JEFE, "/estudio/c2")).json();
    expect(sin.estudioMercado).toEqual({ aprobadoAt: null, conBorrador: false });
  });

  it("analizar una referencia trae las preguntas del curso (problema, tipo de arte, sesgo, oferta, llamado)", async () => {
    const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 10, 0, 0, 0, 10, 8, 2, 0, 0, 0]);
    const form = new FormData();
    form.set("archivo", new File([PNG], "anuncio.png", { type: "image/png" }));
    const { archivo } = await (await pedir(JEFE, "/estudio/c1/archivos", { method: "POST", body: form })).json();
    anthropic(flujo(JSON.stringify({
      gancho: "¿No te cabe?", problema: "Sala pequeña", oferta: "Envío gratis", llamado: "Escríbenos", tipoArte: "dividida", sesgo: "escasez",
      nivel: "problema", porQueFunciona: "Toca el dolor", ideaParaNosotros: "Antes y después",
    })));
    const r = await pedir(JEFE, "/mercado/c1/referencias", { method: "POST", body: { archivoId: archivo.id, competidor: "MueblesYa" } });
    expect(r.status).toBe(201);
    const { referencia } = await r.json();
    expect(referencia.analisis).toMatchObject({ problema: "Sala pequeña", llamado: "Escríbenos", tipoArte: "dividida", sesgo: "escasez" });
    expect(textoDe(peticiones[0])).toContain("«tipoArte», uno de:");
  });
});
