import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";

// ============================================================
// El estudio de mercado: catálogo, estudio por pasos, aprobar y referencias
//
// Lo que importa:
//   1. El catálogo va al cerebro como nota de CIFRAS (la IA la lee siempre) y
//      renovar la ficha técnica no se la lleva: no es una nota «ia».
//   2. El estudio pide la búsqueda web; si la cuenta no la tiene, sigue sin
//      ella y lo dice; una búsqueda larga (pause_turn) se reanuda.
//   3. Nada interno viaja a la IA.
//   4. Aprobar escribe las notas (la competencia, interna) y reaprobar no
//      duplica; sin carpeta de Drive se aprueba igual y se avisa.
//   5. Una referencia: la IA MIRA la captura, va a «Competencia» y al cerebro
//      como nota interna.
//   6. Un cliente de otro espacio no existe.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;
let peticiones;
let respuestas;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto, { parada = "end_turn", busquedas = 0 } = {}) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: parada }, usage: { output_tokens: 400, server_tool_use: { web_search_requests: busquedas } } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

/** Cada llamada a /v1/messages toma la siguiente respuesta de la lista (una función recibe el cuerpo). */
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
      return { httpMetadata: { contentType: o.tipo }, arrayBuffer: async () => bytes, text: async () => new TextDecoder().decode(bytes) };
    },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor, op) {
      const bytes = typeof valor === "string" ? valor : valor instanceof ReadableStream ? new Uint8Array(await new Response(valor).arrayBuffer()) : new Uint8Array(valor);
      objetos.set(clave, { bytes, tipo: op?.httpMetadata?.contentType });
    },
    async delete(clave) { objetos.delete(clave); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, ...(opciones.body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
    body: opciones.body === undefined || opciones.body instanceof FormData ? opciones.body : JSON.stringify(opciones.body),
  }), env);
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};
const notas = () => db.sqlite.prepare("select ruta, titulo, tipo, origen, interna, texto from cerebro_notas where client_id = 'c1' order by ruta").all();

const GENERAL = JSON.stringify({
  rubro: "Limpieza", resumen: "Mucha oferta informal.", competidores: [{ nombre: "LimpiaYa", queHacen: "Promos" }],
  perfiles: [{ nombre: "Mamá ocupada", quien: "Trabaja", dolor: "Manchas", aspiracion: "Casa limpia" }],
  deseos: [{ deseo: "Tranquilidad", porque: "Confianza" }], nivel: { dominante: "problema", porque: "x" },
  propuestaValor: "Como nuevo en un día", fuentes: [],
});
const PRODUCTO = JSON.stringify({
  elementos: { cliente: "Familias", dolor: "Manchas", deseo: "Limpio", objeciones: "Precio", alternativas: "Uno mismo", diferenciador: "Rápido", confianza: "Garantía" },
  objeciones: [], pruebas: [], ganchos: { producto: "Tu sofá como nuevo en 4 horas" }, anuncio: { titulo: "Sofá como nuevo" },
});

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-otro", "otro@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, industry) values (?,?,?,?)").run("c1", JEFE, "Dcasa", "Limpieza de muebles");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("ajeno", "u-otro", "De otra agencia");
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Servicios", texto: "Lavamos muebles a domicilio desde $45. Secado en 4 horas.", tipo: "marca" } });
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Costos", texto: "El costo del químico es de 3 dólares y el margen del 70 %.", tipo: "documento", interna: true } });
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

const CATALOGO = [{ id: "p-lavado", nombre: "Lavado de muebles", tipo: "servicio", precio: "Desde $45", beneficios: "Seca en 4 horas" }];

describe("el catálogo", () => {
  it("se guarda como nota de cifras, y renovar la ficha no se la lleva", async () => {
    const r = await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: CATALOGO } });
    expect(r.status).toBe(200);
    let n = notas().find((x) => x.ruta === "productos-y-servicios");
    expect(n).toMatchObject({ tipo: "cifras", origen: "mercado", interna: 0 });
    expect(n.texto).toContain("Desde $45");

    // Guardar otra vez lo reemplaza, no lo duplica.
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: [{ ...CATALOGO[0], precio: "Desde $50" }] } });
    expect(notas().filter((x) => x.ruta.startsWith("productos-y-servicios"))).toHaveLength(1);

    anthropic(flujo("FICHA:\nQuién es: Dcasa.\nCIFRAS:\n- Precio: $45 [[servicios]]"));
    expect((await pedir("/api/cerebro/c1/preparar", { method: "POST", body: {} })).status).toBe(200);
    n = notas().find((x) => x.ruta === "productos-y-servicios");
    expect(n?.texto).toContain("Desde $50");
  });

  it("proponer no guarda y no le enseña a la IA lo interno", async () => {
    anthropic(flujo('{"productos":[{"nombre":"Lavado de muebles","precio":"Desde $45"},{"nombre":"Impermeabilizado","tipo":"servicio"}]}'));
    const r = await pedir("/api/mercado/c1/catalogo/proponer", { method: "POST", body: {} });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.catalogo.map((p) => p.nombre)).toEqual(["Lavado de muebles", "Impermeabilizado"]);
    expect(textoDe(peticiones[0])).toContain("desde $45");
    expect(textoDe(peticiones[0])).not.toContain("margen");
    expect((await (await pedir("/api/mercado/c1")).json()).catalogo).toEqual([]);
  });
});

describe("el estudio por pasos", () => {
  beforeEach(async () => { await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: CATALOGO } }); });

  it("lo general busca en internet, reanuda una búsqueda pausada y queda en el borrador", async () => {
    // La primera vuelta se pausa a mitad; la segunda trae el resto del JSON: se juntan los textos de las dos.
    anthropic(flujo('{"rubro":"Limpieza",', { parada: "pause_turn", busquedas: 2 }), flujo(GENERAL.slice(1), { busquedas: 1 }));
    const r = await pedir("/api/mercado/c1/estudio/general", { method: "POST", body: { material: "«Llegaron puntuales y dejaron el sofá impecable»" } });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.busquedas).toBe(3);
    expect(d.borrador.general.perfiles[0].nombre).toBe("Mamá ocupada");
    expect(peticiones).toHaveLength(2);
    expect(peticiones[0].tools.map((t) => t.name)).toEqual(["web_search", "web_fetch"]);
    // La segunda vuelta reenvía lo que ya llevaba el asistente.
    expect(peticiones[1].messages.at(-1).role).toBe("assistant");
    expect(textoDe(peticiones[0])).toContain("Llegaron puntuales");
    expect(textoDe(peticiones[0])).not.toContain("margen");
    // Las búsquedas se cobran.
    expect(db.sqlite.prepare("select sum(busquedas) as b from consumo_ia").get().b).toBe(3);
  });

  it("sin búsqueda web en la cuenta, sigue sin ella y lo dice", async () => {
    anthropic(
      Response.json({ type: "error", error: { type: "invalid_request_error", message: "web_search is not enabled for this organization" } }, { status: 400 }),
      flujo(GENERAL),
    );
    const r = await pedir("/api/mercado/c1/estudio/general", { method: "POST", body: {} });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.aviso).toContain("Sin búsqueda en internet");
    expect(peticiones[1].tools).toBeUndefined();
  });

  it("un producto necesita lo general y tiene que estar en el catálogo", async () => {
    anthropic(flujo(PRODUCTO));
    expect((await pedir("/api/mercado/c1/estudio/producto", { method: "POST", body: { productoId: "p-lavado" } })).status).toBe(409);
    anthropic(flujo(GENERAL), flujo(PRODUCTO));
    await pedir("/api/mercado/c1/estudio/general", { method: "POST", body: {} });
    expect((await pedir("/api/mercado/c1/estudio/producto", { method: "POST", body: { productoId: "no-existe" } })).status).toBe(404);
    const r = await pedir("/api/mercado/c1/estudio/producto", { method: "POST", body: { productoId: "p-lavado" } });
    expect(r.status).toBe(200);
    expect(Object.keys((await r.json()).borrador.productos)).toEqual(["p-lavado"]);
    expect(textoDe(peticiones.at(-1))).toContain("Mamá ocupada");
  });

  it("aprobar escribe las notas (competencia interna), no duplica al reaprobar y avisa si no hay Drive", async () => {
    anthropic(flujo(GENERAL), flujo(PRODUCTO));
    await pedir("/api/mercado/c1/estudio/general", { method: "POST", body: {} });
    await pedir("/api/mercado/c1/estudio/producto", { method: "POST", body: { productoId: "p-lavado" } });
    const r = await pedir("/api/mercado/c1/estudio/aprobar", { method: "POST", body: {} });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.notas).toBe(3);
    expect(d.avisoDrive).toContain("carpeta de Drive");
    const del = notas().filter((x) => x.ruta.startsWith("estudio-"));
    expect(del.map((x) => [x.ruta, x.interna])).toEqual([["estudio-competencia", 1], ["estudio-de-mercado", 0], ["estudio-lavado-de-muebles", 0]]);

    // Otra vuelta: el borrador nuevo reemplaza las notas.
    anthropic(flujo(GENERAL));
    await pedir("/api/mercado/c1/estudio/general", { method: "POST", body: {} });
    await pedir("/api/mercado/c1/estudio/aprobar", { method: "POST", body: {} });
    expect(notas().filter((x) => x.ruta.startsWith("estudio-"))).toHaveLength(3);
    const m = await (await pedir("/api/mercado/c1")).json();
    expect(m.borrador).toBeNull();
    expect(m.estudio.aprobadoAt).toBeTruthy();

    // El Estudio ofrece los ganchos con el precio exacto.
    const e = await (await pedir("/api/estudio/c1")).json();
    expect(e.angulos[0]).toMatchObject({ producto: "Lavado de muebles", precio: "Desde $45", gancho: "Tu sofá como nuevo en 4 horas" });
  });

  it("el kit de marca lee el estudio aprobado", async () => {
    anthropic(flujo(GENERAL), flujo(PRODUCTO));
    await pedir("/api/mercado/c1/estudio/general", { method: "POST", body: {} });
    await pedir("/api/mercado/c1/estudio/aprobar", { method: "POST", body: {} });
    anthropic(flujo('{"paleta":[],"presets":{"anuncio":"x"}}'));
    await pedir("/api/estudio/c1/kit/preparar", { method: "POST", body: {} });
    expect(textoDe(peticiones[0])).toContain("ESTUDIO DE MERCADO");
    expect(textoDe(peticiones[0])).toContain("Mamá ocupada");
  });
});

describe("las referencias de la competencia", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 10, 0, 0, 0, 10, 8, 2, 0, 0, 0]);

  it("la IA mira la captura, va a «Competencia» y al cerebro como interna; quitarla borra la nota", async () => {
    const form = new FormData();
    form.set("archivo", new File([PNG], "anuncio.png", { type: "image/png" }));
    const subida = await pedir("/api/estudio/c1/archivos", { method: "POST", body: form });
    expect(subida.status).toBe(201);
    const { archivo } = await subida.json();

    anthropic(flujo('{"gancho":"50% hoy","angulo":"urgencia","nivel":"decision","deseo":"Ahorro","porQueFunciona":"Corre prisa","ideaParaNosotros":"Usar la garantía"}'));
    const r = await pedir("/api/mercado/c1/referencias", { method: "POST", body: { archivoId: archivo.id, competidor: "LimpiaYa", desde: "2026-07-01" } });
    expect(r.status).toBe(201);
    const { referencia, aviso } = await r.json();
    expect(aviso).toBeNull();
    expect(referencia.analisis.gancho).toBe("50% hoy");
    expect(peticiones[0].messages[0].content[0].type).toBe("image");

    const carpeta = db.sqlite.prepare("select c.nombre from estudio_archivos a join estudio_carpetas c on c.id = a.carpeta_id where a.id = ?").get(archivo.id);
    expect(carpeta.nombre).toBe("Competencia");
    const nota = notas().find((x) => x.ruta.startsWith("referencia-"));
    expect(nota).toMatchObject({ tipo: "mercado", interna: 1 });

    expect((await pedir(`/api/mercado/c1/referencias/${referencia.id}`, { method: "DELETE" })).status).toBe(200);
    expect(notas().find((x) => x.ruta.startsWith("referencia-"))).toBeUndefined();
  });
});

describe("de quién es", () => {
  it("un cliente de otro espacio no existe", async () => {
    expect((await pedir("/api/mercado/ajeno")).status).toBe(404);
    expect((await pedir("/api/mercado/ajeno/catalogo", { method: "PUT", body: { catalogo: CATALOGO } })).status).toBe(404);
  });
});
