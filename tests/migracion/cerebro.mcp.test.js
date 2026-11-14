import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE, clientesPermitidos } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { EDITADA_TEXTO } from "../../worker/lib/cerebro/notas.js";
import { TIPOS_PROPONIBLES } from "../../src/lib/cerebroVista.js";

// ============================================================
// El CEREBRO y el ESTUDIO DE MERCADO por MCP (worker/lib/cerebro/herramientasCerebro.js), contra una D1 de verdad
//
//   · guardar_en_cerebro: sin `confirmado: true` NO SE GUARDA NADA (y dice exactamente qué se guardaría y qué reemplaza);
//     con él, por la MISMA función que el PUT de la pantalla (worker/lib/cerebro/guardar.js): misma ruta, derivados,
//     `editada`, fechas e índice. La ruta de la pantalla responde igual que antes.
//   · proponer_nota_cerebro: las mismas funciones que los botones de Marca → Cerebro; no guarda.
//   · ver_estudio_mercado: lo aprobado, las 7 maletas, los ángulos y lo que trae el borrador; sin IA.
//   · proponer_angulos: al BORRADOR, nunca a lo aprobado.
//   · Un cliente de otro espacio (o de otro colaborador) no existe.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const COLAB = "u-colab";
let db;
let env;
let peticiones;
let respuestas;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 1200 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 300 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

/** La IA de mentira: cada llamada a /v1/messages toma la siguiente respuesta (la última se repite; un texto, como flujo nuevo). */
function anthropic(...lista) {
  peticiones = [];
  respuestas = [...lista];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      peticiones.push(JSON.parse(opciones.body));
      const r = respuestas.length > 1 ? respuestas.shift() : respuestas[0];
      return typeof r === "function" ? r() : typeof r === "string" ? flujo(r) : r;
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}
/** Sin IA: cualquier llamada de fuera falla el caso. */
const sinIA = () => anthropic(() => { throw new Error("no debía llamar a la IA"); });

function r2() {
  const objetos = new Map();
  return {
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const v = objetos.get(clave);
      return { text: async () => v, arrayBuffer: async () => new TextEncoder().encode(v) };
    },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor) { objetos.set(clave, typeof valor === "string" ? valor : await new Response(valor).text()); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const CATALOGO = [
  { id: "p-lavado", nombre: "Lavado de muebles", tipo: "servicio", precio: "Desde $45", beneficios: "Seca en 4 horas", activo: true, fotos: [] },
  { id: "p-alfombra", nombre: "Lavado de alfombras", tipo: "servicio", precio: "$30", activo: true, fotos: [] },
];
const GENERAL = {
  rubro: "Limpieza", resumen: "Mucha oferta informal.", competidores: [{ nombre: "LimpiaYa", queHacen: "Promos" }],
  perfiles: [{ nombre: "Mamá ocupada", quien: "Trabaja", dolor: "Manchas", aspiracion: "Casa limpia" }],
  deseos: [{ deseo: "Tranquilidad", porque: "Confianza" }], nivel: { dominante: "problema", porque: "x" }, propuestaValor: "Como nuevo en un día",
};
const ANGULO_APROBADO = { nombre: "Sin olor a mascota", problemaExterno: "Pelos y olor", ganchos: ["Mi sofá olía a perro"], publico: "frio" };
const APROBADO = {
  general: GENERAL,
  productos: {
    "p-lavado": {
      elementos: { publico: "Familias con niños y mascotas en Ciudad de Panamá", problema: "Manchas", solucion: "Lavado a domicilio" },
      objeciones: [], pruebas: [], ganchos: {}, anuncio: {}, faltan: ["Fotos del antes y el después"], angulos: [ANGULO_APROBADO],
    },
  },
  aprobadoAt: "2026-10-01T00:00:00.000Z", hechoAt: "2026-09-30T00:00:00.000Z",
};
const ANGULOS = JSON.stringify({
  angulos: [
    { nombre: "Sin perder el sábado", solucion: "Seca en 4 horas", garantia: "Garantía de 30 días", ganchos: ["Limpio antes del almuerzo"], publico: "tibio" },
    { nombre: "Más barato que uno nuevo", falsaCreencia: "Lavarlo cuesta lo mismo", ganchos: ["No lo cambies todavía"], publico: "frio" },
    { nombre: "Para alérgicos", dolor: "Estornudos", ganchos: ["En mi casa ya nadie estornuda"] },
  ],
  faltan: [],
});

beforeEach(async () => {
  db = d1EnMemoria();
  env = {
    DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") },
    HUB: { idFromName: (n) => n, get: () => ({ fetch: async () => new Response("ok") }) },
  };
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRA, "otra@b.com"], [COLAB, "colab@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
  }
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("t-jefe"), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#123456");
  // El colaborador es del espacio del jefe y sólo lleva c2.
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Ana", "#654321", '["c2"]');
  s.prepare("insert into clients (id, owner_id, name, industry) values (?,?,?,?)").run("c1", JEFE, "Dcasa", "Limpieza de muebles");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
  s.prepare("insert into mercado_clientes (id, owner_id, client_id, catalogo, estudio, referencias) values (?,?,?,?,?,?)")
    .run("m1", JEFE, "c1", JSON.stringify(CATALOGO), JSON.stringify(APROBADO), "[]");
  s.prepare("insert into mercado_clientes (id, owner_id, client_id, catalogo, estudio, referencias) values (?,?,?,?,?,?)")
    .run("m9", OTRA, "c9", JSON.stringify(CATALOGO), JSON.stringify(APROBADO), "[]");
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

/** El perfil como lo arma la sesión del MCP (sesion.js). */
const perfil = (id) => {
  const m = db.sqlite.prepare("select * from memberships where user_id = ?").get(id);
  return { id, nombre: m.nombre, ownerId: m.owner_id, rol: m.rol, soloLectura: false, clientes: m.rol !== "admin" ? clientesPermitidos(m.clientes) : null };
};
async function llamar(nombre, entrada, id = JEFE) {
  const usuario = perfil(id);
  const r = await crearHerramientasMCP({ env, acceso: crearAcceso(db, usuario.ownerId, { clientes: usuario.clientes }), usuario }).llamar(nombre, entrada);
  return { texto: r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"), error: Boolean(r.isError) };
}
const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=t-jefe`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const notas = (cliente = "c1") => db.sqlite.prepare("select * from cerebro_notas where client_id = ? order by created_at").all(cliente);
const fila = () => db.sqlite.prepare("select estudio, borrador from mercado_clientes where client_id = 'c1'").get();
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};

describe("las definiciones", () => {
  it("están en el MCP con sus anotaciones y lo obligatorio", () => {
    const por = Object.fromEntries(HERRAMIENTAS_MCP.map((h) => [h.name, h]));
    expect(por.guardar_en_cerebro.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(por.guardar_en_cerebro.inputSchema.required).toEqual(["cliente", "titulo", "texto"]);
    expect(por.guardar_en_cerebro.inputSchema.properties.tipo.enum).toEqual([...TIPOS_PROPONIBLES]);
    expect(por.guardar_en_cerebro.description).toMatch(/NO SE GUARDA NADA[\s\S]*confirmado=true por tu cuenta/);
    expect(por.proponer_nota_cerebro.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(por.proponer_nota_cerebro.inputSchema.properties.tipo.enum).toEqual(["lenguaje_del_cliente", "saber_del_rubro", "voz_ugc"]);
    expect(por.proponer_nota_cerebro.inputSchema.required).toEqual(["cliente", "tipo"]);
    expect(por.ver_estudio_mercado.annotations.readOnlyHint).toBe(true);
    expect(por.ver_estudio_mercado.inputSchema.required).toEqual(["cliente"]);
    expect(por.proponer_angulos.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(por.proponer_angulos.inputSchema.required).toEqual(["cliente", "producto"]);
    // Ningún nombre repetido en el conector.
    expect(new Set(HERRAMIENTAS_MCP.map((h) => h.name)).size).toBe(HERRAMIENTAS_MCP.length);
  });
});

describe("guardar_en_cerebro", () => {
  it("sin confirmado NO guarda nada y enseña exactamente lo que guardaría", async () => {
    sinIA();
    const r = await llamar("guardar_en_cerebro", { cliente: "dcasa", titulo: "Sin emojis de fuego", texto: "Nunca usamos el emoji de fuego ni «🔥».", tipo: "pautas" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/^NO SE GUARDÓ NADA\./);
    expect(r.texto).toContain("Una nota NUEVA (ruta «sin-emojis-de-fuego»)");
    expect(r.texto).toContain("Tipo: Pautas para escribir");
    expect(r.texto).toContain("Nunca usamos el emoji de fuego");
    expect(r.texto).toMatch(/con su sí, vuelve a llamar con lo mismo y confirmado=true/);
    expect(notas()).toHaveLength(0);
    // `confirmado` sólo vale si es el booleano.
    expect((await llamar("guardar_en_cerebro", { cliente: "dcasa", titulo: "X", texto: "y", confirmado: "true" })).texto).toMatch(/^NO SE GUARDÓ NADA/);
    expect(notas()).toHaveLength(0);
  });

  it("con confirmado crea la nota como la pantalla: su ruta, origen manual, sin «editada», fechas iguales y en el índice", async () => {
    sinIA();
    const r = await llamar("guardar_en_cerebro", { cliente: "Dcasa", titulo: "Sin emojis de fuego", texto: "Nunca usamos el emoji de fuego.", tipo: "pautas", confirmado: true });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/Guardada en el cerebro de Dcasa: «Sin emojis de fuego» \[sin-emojis-de-fuego\]/);
    expect(r.texto).toMatch(/la IA la sigue SIEMPRE/);
    const [n] = notas();
    expect(n).toMatchObject({ ruta: "sin-emojis-de-fuego", tipo: "pautas", origen: "manual", interna: 0, editada: 0, caracteres: 31 });
    expect(n.created_at).toBe(n.updated_at);
    expect(n.resumen).toContain("Nunca usamos");
    // La pantalla la lista y el buscador del cerebro la encuentra (el índice se puso al día).
    const lista = await (await pedir("/api/cerebro/c1")).json();
    expect(lista.notas.map((x) => x.titulo)).toEqual(["Sin emojis de fuego"]);
    expect((await llamar("buscar_cerebro", { cliente: "Dcasa", consulta: "emoji de fuego" })).texto).toContain("Nunca usamos el emoji de fuego");
  });

  it("con nota REEMPLAZA esa: dice qué había, conserva su ruta, su tipo y su candado, y queda corregida a mano", async () => {
    sinIA();
    const creada = await (await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Tono y voz", texto: "Cercano, de tú. Nunca versículos.", tipo: "marca", interna: false } })).json();
    const vista = await llamar("guardar_en_cerebro", { cliente: "Dcasa", nota: "tono-y-voz", titulo: "Tono y voz", texto: "Cercano, de usted. Sin versículos ni refranes." });
    expect(vista.texto).toMatch(/^NO SE GUARDÓ NADA/);
    expect(vista.texto).toContain("REEMPLAZA la nota «Tono y voz» [tono-y-voz] (Marca), que tiene 33 caracteres y empieza así: «Cercano, de tú. Nunca versículos.»");
    expect(notas()[0].texto).toBe("Cercano, de tú. Nunca versículos.");

    // Por su título también la encuentra.
    const r = await llamar("guardar_en_cerebro", { cliente: "Dcasa", nota: "Tono y voz", titulo: "Tono y voz", texto: "Cercano, de usted. Sin versículos ni refranes.", confirmado: true });
    expect(r.texto).toMatch(/Reemplazó la nota anterior \(tenía 33 caracteres\)/);
    const todas = notas();
    expect(todas).toHaveLength(1);
    expect(todas[0]).toMatchObject({ id: creada.id, ruta: "tono-y-voz", tipo: "marca", interna: 0, texto: "Cercano, de usted. Sin versículos ni refranes." });
    expect(todas[0].editada & EDITADA_TEXTO).toBe(EDITADA_TEXTO);
    expect(todas[0].updated_at > todas[0].created_at).toBe(true);
  });

  it("los avisos: una pauta no puede ser interna, el mismo título ya existe, la nota del estudio de mercado se reescribe", async () => {
    sinIA();
    const r = await llamar("guardar_en_cerebro", { cliente: "Dcasa", titulo: "Reglas", texto: "De tú.", tipo: "pautas", interna: true, confirmado: true });
    expect(r.texto).toMatch(/Una pauta no puede ser interna/);
    expect(notas()[0].interna).toBe(0);
    const otra = await llamar("guardar_en_cerebro", { cliente: "Dcasa", titulo: "reglas", texto: "Otra cosa." });
    expect(otra.texto).toMatch(/Ya hay una nota «Reglas» \[reglas\]: así se crearía OTRA aparte \(ruta «reglas-2»\)/);
    db.sqlite.prepare("insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, texto, tipo, origen) values (?,?,?,?,?,?,?,?)")
      .run("nm", JEFE, "c1", "estudio-de-mercado", "Estudio de mercado", "# Estudio", "mercado", "mercado");
    expect((await llamar("guardar_en_cerebro", { cliente: "Dcasa", nota: "estudio-de-mercado", titulo: "Estudio de mercado", texto: "Otro" })).texto)
      .toMatch(/la escribe el estudio de mercado/);
  });

  it("lo que no vale: nota que no está, varias que encajan, sin título, tipo inventado; y otro espacio u otro colaborador no existen", async () => {
    sinIA();
    for (const t of ["Precios de envío", "Precios de instalación"]) await llamar("guardar_en_cerebro", { cliente: "Dcasa", titulo: t, texto: "x", confirmado: true });
    const varias = await llamar("guardar_en_cerebro", { cliente: "Dcasa", nota: "precios", titulo: "x", texto: "y", confirmado: true });
    expect(varias.error).toBe(true);
    expect(varias.texto).toMatch(/Hay 2 notas que encajan/);
    expect((await llamar("guardar_en_cerebro", { cliente: "Dcasa", nota: "no existe", titulo: "x", texto: "y" })).error).toBe(true);
    expect((await llamar("guardar_en_cerebro", { cliente: "Dcasa", titulo: " ", texto: "y", confirmado: true })).texto).toMatch(/necesita un título/);
    expect((await llamar("guardar_en_cerebro", { cliente: "Dcasa", titulo: "x", texto: "y", tipo: "ficha", confirmado: true })).error).toBe(true);
    const ajeno = await llamar("guardar_en_cerebro", { cliente: "Ajeno", titulo: "x", texto: "y", confirmado: true });
    expect(ajeno.error).toBe(true);
    expect(ajeno.texto).toMatch(/No encontré el cliente/);
    expect((await llamar("guardar_en_cerebro", { cliente: "Dcasa", titulo: "x", texto: "y", confirmado: true }, COLAB)).error).toBe(true);
    expect(notas()).toHaveLength(2);
    expect(notas("c9")).toHaveLength(0);
  });
});

describe("la ruta de la pantalla sigue igual (su lógica salió a worker/lib/cerebro/guardar.js)", () => {
  it("crear 201, editar 200, nota ajena 404, sin título 400, el tope 409; y lo que escribe Claude es lo mismo", async () => {
    const c = await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Horario", texto: "De lunes a sábado." } });
    expect(c.status).toBe(201);
    const nota = await c.json();
    expect(nota).toMatchObject({ ruta: "horario", tipo: "nota", origen: "manual", interna: false, corregida: false, caracteres: 18, texto: "De lunes a sábado." });
    const e = await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { id: nota.id, titulo: "Horario", texto: "De lunes a viernes.", tipo: "nota" } });
    expect(e.status).toBe(200);
    expect(await e.json()).toMatchObject({ id: nota.id, ruta: "horario", corregida: true });
    const ajena = await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { id: "no-existe", titulo: "x", texto: "y" } });
    expect(ajena.status).toBe(404);
    expect(await ajena.json()).toEqual({ error: "Nota no encontrado" });
    const vacia = await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "", texto: "y" } });
    expect(vacia.status).toBe(400);
    expect(await vacia.json()).toEqual({ error: "La nota necesita un título." });
    // Lo que guarda Claude por el conector queda igual que lo de la pantalla (salvo id y fechas).
    await llamar("guardar_en_cerebro", { cliente: "Dcasa", titulo: "Horario de Claude", texto: "De lunes a sábado.", confirmado: true });
    const [pantalla, claude] = [notas().find((n) => n.id === nota.id), notas().find((n) => n.titulo === "Horario de Claude")];
    const forma = ({ tipo, origen, fuente, fuente_sha: sha, interna, caracteres }) => ({ tipo, origen, fuente, sha, interna, caracteres });
    expect(forma(claude)).toEqual({ ...forma(pantalla), caracteres: 18 });
    expect(claude.editada).toBe(0);
    // El tope de notas: 409 en la pantalla y error del pedido por Claude.
    const stmt = db.sqlite.prepare("insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, texto, tipo) values (?,?,?,?,?,?, 'nota')");
    for (let i = notas().length; i < 400; i++) stmt.run(`relleno-${i}`, JEFE, "c1", `relleno-${i}`, `Relleno ${i}`, "x");
    expect((await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Una más", texto: "y" } })).status).toBe(409);
    expect((await llamar("guardar_en_cerebro", { cliente: "Dcasa", titulo: "Una más", texto: "y" })).texto).toMatch(/ya tiene 400 notas/);
  });
});

describe("proponer_nota_cerebro", () => {
  it("«Saber del rubro»: la misma función que el botón, no guarda nada y dice cómo guardarla (y que reemplaza la que hay)", async () => {
    anthropic("Aquí va:\n## Consejos\n- Aspira el sofá cada semana.\n## Mitos\n- El vinagre no quita todas las manchas.");
    const r = await llamar("proponer_nota_cerebro", { cliente: "Dcasa", tipo: "saber_del_rubro" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/^PROPUESTA — NO SE GUARDÓ NADA: la nota «Saber del rubro» de Dcasa/);
    expect(r.texto).toMatch(/Todavía no tiene esta nota: se crearía nueva/);
    expect(r.texto).toMatch(/guardar_en_cerebro con cliente «Dcasa», titulo «Saber del rubro», tipo «nota»/);
    expect(r.texto).toMatch(/TEXTO PROPUESTO:\n## Consejos\n- Aspira el sofá cada semana\./);
    expect(peticiones).toHaveLength(1);
    expect(notas()).toHaveLength(0);
    expect(db.sqlite.prepare("select count(*) as n from consumo_ia where funcion = 'saber del rubro'").get().n).toBe(1);

    // Con la nota ya guardada, la propuesta dice cuál reemplaza; y guardarla por su ruta la reemplaza.
    await llamar("guardar_en_cerebro", { cliente: "Dcasa", titulo: "Saber del rubro", texto: "## Consejos\n- Viejo.", confirmado: true });
    expect(notas()[0].ruta).toBe("saber-del-rubro");
    const otra = await llamar("proponer_nota_cerebro", { cliente: "Dcasa", tipo: "saber_del_rubro", material: "esto no cuenta aquí" });
    expect(otra.texto).toMatch(/Ya hay una nota «Saber del rubro» \[saber-del-rubro\] de 20 caracteres: la propuesta parte de ella y guardarla la REEMPLAZA/);
    expect(otra.texto).toMatch(/nota «saber-del-rubro» y confirmado=true/);
    expect(otra.texto).toMatch(/sólo cuentan para lenguaje_del_cliente/);
    const g = await llamar("guardar_en_cerebro", { cliente: "Dcasa", nota: "saber-del-rubro", titulo: "Saber del rubro", texto: "## Consejos\n- Aspira el sofá.", confirmado: true });
    expect(g.texto).toMatch(/Es «Saber del rubro»: .*educativo/);
    expect(notas()).toHaveLength(1);
  });

  it("«Lenguaje del cliente»: con lo pegado, el código descarta lo que no está tal cual; «Voz UGC» también propone", async () => {
    anthropic(flujo(JSON.stringify({ temas: { elogio: ["El sofá quedó como nuevo", "Excelente servicio siempre"] } })));
    const r = await llamar("proponer_nota_cerebro", { cliente: "Dcasa", tipo: "lenguaje_del_cliente", material: "El sofá quedó como nuevo, se los recomiendo" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/se descartó 1 porque no estaba/);
    expect(r.texto).toContain("«El sofá quedó como nuevo»");
    expect(r.texto).not.toContain("Excelente servicio siempre");
    expect(textoDe(peticiones[0])).toContain("El sofá quedó como nuevo, se los recomiendo");
    // Sin nada que leer: el error del pedido, sin llamar a la IA.
    anthropic(flujo("x"));
    const vacio = await llamar("proponer_nota_cerebro", { cliente: "Dcasa", tipo: "lenguaje_del_cliente" });
    expect(vacio.error).toBe(true);
    expect(vacio.texto).toMatch(/No hay qué leer/);
    expect(peticiones).toHaveLength(0);

    anthropic(flujo("## Quién habla\n- Una mamá, de tú."));
    const voz = await llamar("proponer_nota_cerebro", { cliente: "Dcasa", tipo: "voz_ugc" });
    expect(voz.texto).toMatch(/«Voz UGC» de Dcasa: .*guion UGC/);
    expect(voz.texto).toMatch(/todavía no tiene guiones UGC/);
    expect(notas()).toHaveLength(0);
    expect((await llamar("proponer_nota_cerebro", { cliente: "Dcasa", tipo: "otra" })).error).toBe(true);
    expect((await llamar("proponer_nota_cerebro", { cliente: "Ajeno", tipo: "voz_ugc" })).error).toBe(true);
  });
});

describe("ver_estudio_mercado", () => {
  it("el catálogo con sus precios e ids, lo general, el semáforo y los ángulos de cada producto y lo que trae el borrador; sin IA", async () => {
    sinIA();
    const borrador = structuredClone(APROBADO);
    delete borrador.aprobadoAt;
    borrador.productos["p-lavado"].angulos = JSON.parse(ANGULOS).angulos;
    db.sqlite.prepare("update mercado_clientes set borrador = ? where client_id = 'c1'").run(JSON.stringify(borrador));
    const r = await llamar("ver_estudio_mercado", { cliente: "Dcasa" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/^ESTUDIO DE MERCADO DE Dcasa \(aprobado el 1 de octubre de 2026\)/);
    expect(r.texto).toContain("- Lavado de muebles (servicio) · precio: Desde $45 · beneficios: Seca en 4 horas (id p-lavado)");
    expect(r.texto).toContain("Rubro: Limpieza");
    expect(r.texto).toMatch(/· «Lavado de muebles» \(id p-lavado\): semáforo rojo — Faltan .*no lances el anuncio/);
    expect(r.texto).toMatch(/Falta por confirmar: Fotos del antes y el después/);
    expect(r.texto).toMatch(/- «Sin olor a mascota» — problema \(lo que se ve\): Pelos y olor \[público frío: quien aún no conoce la marca\]\n\s+Ganchos: «Mi sofá olía a perro»/);
    expect(r.texto).toMatch(/· «Lavado de alfombras» \(id p-alfombra\): sin estudio todavía/);
    expect(r.texto).toMatch(/BORRADOR SIN APROBAR \(del 30 de septiembre de 2026\): el motor todavía NO lo usa/);
    expect(r.texto).toMatch(/«Lavado de muebles»: 3 ángulos de venta propuestos \(«Sin perder el sábado», «Más barato que uno nuevo», «Para alérgicos»\)/);
    expect(r.texto).toMatch(/no se aprueba desde aquí/);
  });

  it("con producto, su detalle entero: cada maleta con su color y su arreglo, y los ángulos del borrador; sin estudio, lo dice", async () => {
    sinIA();
    const borrador = structuredClone(APROBADO);
    delete borrador.aprobadoAt;
    borrador.productos["p-lavado"].angulos = JSON.parse(ANGULOS).angulos;
    db.sqlite.prepare("update mercado_clientes set borrador = ? where client_id = 'c1'").run(JSON.stringify(borrador));
    const r = await llamar("ver_estudio_mercado", { cliente: "Dcasa", producto: "lavado de muebles" });
    expect(r.texto).toMatch(/^ESTUDIO DE «Lavado de muebles» \(id p-lavado\) de Dcasa — aprobado el 1 de octubre de 2026/);
    expect(r.texto).toMatch(/· Público: verde — Escrita y concreta\./);
    expect(r.texto).toMatch(/· Testimonios: rojo — Vacía\. Cómo se arregla: .*\(sólo lo puede dar el cliente: no se inventa\)/);
    expect(r.texto).toContain("# Estudio: Lavado de muebles");
    expect(r.texto).toMatch(/EN EL BORRADOR SIN APROBAR hay cambios[\s\S]*Ángulos de venta propuestos \(3\)/);
    expect((await llamar("ver_estudio_mercado", { cliente: "Dcasa", producto: "p-alfombra" })).texto).toMatch(/no tiene estudio todavía/);
    const no = await llamar("ver_estudio_mercado", { cliente: "Dcasa", producto: "sillas" });
    expect(no.error).toBe(true);
    expect(no.texto).toMatch(/Los que hay: «Lavado de muebles» \(id p-lavado\), «Lavado de alfombras» \(id p-alfombra\)/);
    // Sin catálogo ni estudio, lo dice; otro espacio y otro colaborador no existen.
    expect((await llamar("ver_estudio_mercado", { cliente: "Baby Caleb" })).texto).toMatch(/todavía no tiene catálogo ni estudio de mercado/);
    expect((await llamar("ver_estudio_mercado", { cliente: "Ajeno" })).error).toBe(true);
    expect((await llamar("ver_estudio_mercado", { cliente: "Dcasa" }, COLAB)).error).toBe(true);
    expect((await llamar("ver_estudio_mercado", { cliente: "Baby Caleb" }, COLAB)).error).toBe(false);
  });
});

describe("proponer_angulos", () => {
  it("los pone en el BORRADOR (creado desde el aprobado), nunca en lo aprobado, y dice que hay que aprobarlo en la pantalla", async () => {
    anthropic(ANGULOS);
    const r = await llamar("proponer_angulos", { cliente: "Dcasa", producto: "p-lavado" });
    expect(r.error).toBe(false);
    expect(r.texto).toMatch(/^Ángulos de venta propuestos para «Lavado de muebles» de Dcasa \(3\)/);
    expect(r.texto).toMatch(/Quedaron en el BORRADOR del estudio de mercado, NO en lo aprobado: .*aprobar el estudio en Marca → Cerebro → Estudio de mercado/);
    expect(r.texto).toMatch(/1\. «Sin perder el sábado» — cómo lo resuelve: Seca en 4 horas \[público tibio: quien ya interactuó\]\n   Ganchos: «Limpio antes del almuerzo»/);
    // La garantía inventada (el estudio no tiene ninguna prueba) se quitó y se pide.
    expect(r.texto).not.toContain("Garantía de 30 días");
    expect(r.texto).toMatch(/Falta por confirmar .*garantía o una prueba real/);
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0].tools).toBeUndefined();
    const f = fila();
    expect(JSON.parse(f.estudio).productos["p-lavado"].angulos.map((a) => a.nombre)).toEqual(["Sin olor a mascota"]);
    expect(JSON.parse(f.borrador).productos["p-lavado"].angulos).toHaveLength(3);
    expect(JSON.parse(f.borrador).aprobadoAt).toBeUndefined();
    // Otra vez: reemplaza los del borrador y lo dice.
    const otra = await llamar("proponer_angulos", { cliente: "Dcasa", producto: "Lavado de muebles" });
    expect(otra.texto).toMatch(/reemplazaron los 3 que el borrador tenía para este producto/);
  });

  it("sin estudio de ese producto, un producto que no está o un cliente ajeno: error del pedido sin llamar a la IA", async () => {
    anthropic(flujo(ANGULOS));
    const sin = await llamar("proponer_angulos", { cliente: "Dcasa", producto: "p-alfombra" });
    expect(sin.error).toBe(true);
    expect(sin.texto).toMatch(/Primero hace falta el estudio de «Lavado de alfombras»/);
    expect((await llamar("proponer_angulos", { cliente: "Dcasa", producto: "sillas" })).error).toBe(true);
    expect((await llamar("proponer_angulos", { cliente: "Ajeno", producto: "p-lavado" })).error).toBe(true);
    expect(peticiones).toHaveLength(0);
    expect(JSON.parse(db.sqlite.prepare("select borrador from mercado_clientes where client_id = 'c9'").get().borrador ?? "null")).toBeNull();
  });
});
