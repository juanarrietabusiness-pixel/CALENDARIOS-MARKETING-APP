import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos, mesActual } from "../../worker/lib/configIA.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { buscar } from "../../worker/lib/cerebro/cerebro.js";
import {
  conPalabras, bloqueDeSenal, elegirEvidencia, hayEvidencia, promptDeReglas, leerReglas, respaldoSuficiente, filtrarNuevas,
  MAX_REGLAS, MIN_SENALES,
} from "../../worker/lib/cerebro/proponer.js";

// ============================================================
// Reglas que la IA propone y que una persona decide
//
// Anthropic es de mentira y registra lo que se le pide. Lo que importa:
//
//   1. Una regla necesita respaldo de dos respuestas (o una orden expresa),
//      y eso lo comprueba el código, no la IA.
//   2. Nada entra al cerebro sin que alguien lo acepte.
//   3. No se propone dos veces lo mismo, ni se llama a la IA sin motivo.
//   4. Un fallo se dice con su motivo y no deja nada a medias.
// ============================================================

const senal = (extra = {}) => ({
  clave: "respuesta:p1", tipo: "respuesta", post_id: "p1", resultado: 0.2, resumen: "x", updated_at: "2026-09-29T10:00:00.000Z",
  detalle: { estado: "cambios", comentario: "No me gustan los emojis", publicacion: { titulo: "Reel de sofás", formato: "reel", categoria: "Producto" }, fecha: "2026-09-29" },
  ...extra,
});
const conDetalle = (clave, detalle, extra = {}) => senal({ clave, post_id: clave.split(":")[1], detalle: { estado: "cambios", publicacion: { titulo: `Pub ${clave}`, formato: "reel" }, fecha: "2026-09-29", ...detalle }, ...extra });

describe("qué señales enseñan algo", () => {
  it("una respuesta con palabras sí; una aprobación a secas, no; un resultado o una corrección, sólo si fue claro", () => {
    expect(conPalabras(senal())).toBe(true);
    expect(conPalabras(senal({ detalle: { estado: "aprobado" } }))).toBe(false);
    expect(conPalabras(senal({ detalle: { estado: "cambios", sugeridaDescripcion: "otra cosa" } }))).toBe(true);
    expect(conPalabras(senal({ detalle: { estado: "cambios", sugeridoGuion: "otro" } }))).toBe(true);
    expect(conPalabras(senal({ detalle: { estado: "cambios", comentario: "   " } }))).toBe(false);
    // Un resultado en redes enseña si fue de los muy buenos o de los muy malos; uno del montón, no.
    expect(conPalabras(senal({ tipo: "metricas", detalle: { percentil: 90 } }))).toBe(true);
    expect(conPalabras(senal({ tipo: "metricas", detalle: { percentil: 10 } }))).toBe(true);
    expect(conPalabras(senal({ tipo: "metricas", detalle: { percentil: 50 } }))).toBe(false);
    expect(conPalabras(senal({ tipo: "metricas", detalle: {} }))).toBe(false);
    // Una corrección enseña si fue más que un retoque.
    expect(conPalabras(senal({ tipo: "correccion", detalle: { intensidad: 0.5 } }))).toBe(true);
    expect(conPalabras(senal({ tipo: "correccion", detalle: { intensidad: 0.2 } }))).toBe(false);
    expect(conPalabras(senal({ tipo: "correccion", detalle: {} }))).toBe(false);
  });

  it("un resultado del montón o un retoque no se cuentan como «aprobó sin comentarios»", () => {
    const ev = elegirEvidencia([
      senal({ clave: "respuesta:a", detalle: { estado: "aprobado" } }),
      senal({ clave: "metricas:b", tipo: "metricas", detalle: { percentil: 50 } }),
      senal({ clave: "correccion:c", tipo: "correccion", detalle: { intensidad: 0.1 } }),
    ]);
    expect(ev.bloques).toEqual([]);
    expect(ev.aprobadasSinPalabras.total).toBe(1);
  });

  it("hace falta un mínimo para aprender, y se dice cuánto hay", () => {
    const con = (n) => Array.from({ length: n }, (_, i) => conDetalle(`respuesta:p${i}`, { comentario: "algo" }));
    expect(hayEvidencia(con(MIN_SENALES - 1))).toEqual({ ok: false, n: MIN_SENALES - 1 });
    expect(hayEvidencia(con(MIN_SENALES))).toEqual({ ok: true, n: MIN_SENALES });
    expect(hayEvidencia([...con(2), senal({ detalle: { estado: "aprobado" } })])).toEqual({ ok: false, n: 2 });
  });
});

describe("cómo lee la IA cada señal", () => {
  it("una respuesta: el número con el que se cita, cuándo, de qué y lo que dijo, tal cual", () => {
    const t = bloqueDeSenal(senal({ detalle: { ...senal().detalle, sugeridaDescripcion: "Sofás desde $450", sugeridoGuion: "Hook: el precio" } }), 3);
    expect(t).toBe("[R3] Respuesta del cliente · 2026-09-29 · reel · Producto — «Reel de sofás»: pidió cambios. Dijo: «No me gustan los emojis». Propuso la descripción: «Sofás desde $450». Propuso el guion: «Hook: el precio».");
  });

  it("una aprobación con comentario dice que aprobó", () => {
    expect(bloqueDeSenal(senal({ detalle: { estado: "aprobado", comentario: "Me encanta", publicacion: { titulo: "T" } } }), 1)).toMatch(/aprobó\. Dijo: «Me encanta»\./);
  });

  it("un resultado en redes: cuánto rindió frente a las demás", () => {
    const t = bloqueDeSenal(senal({ tipo: "metricas", detalle: { percentil: 88.4, alcance: 5200, interacciones: 310, hora: "19:00", texto: "Sofás desde $450", publicacion: { titulo: "Reel", formato: "reel" }, fecha: "2026-10-01" } }), 2);
    expect(t).toContain("[R2] Resultado en redes");
    expect(t).toContain("rindió mejor que el 88 % de las publicaciones de este cliente, 5200 de alcance, 310 interacciones, salió a las 19:00");
    expect(t).toContain("Texto: «Sofás desde $450»");
  });

  it("una corrección del equipo: lo que escribió la IA y lo que quedó", () => {
    const t = bloqueDeSenal(senal({ tipo: "correccion", detalle: { antes: "Texto con 🎉🎉 emojis", despues: "Texto sin emojis", cambio: "reescrito", publicacion: { titulo: "Reel" }, fecha: "2026-09-29" } }), 4);
    expect(t).toContain("[R4] Corrección del equipo · 2026-09-29");
    expect(t).toContain("«Reel»: la IA escribió «Texto con 🎉🎉 emojis» y quedó «Texto sin emojis» (reescrito).");
  });

  it("nada se pasa de largo", () => {
    const t = bloqueDeSenal(senal({ detalle: { ...senal().detalle, comentario: "palabra ".repeat(500) } }), 1);
    expect(t.length).toBeLessThan(1400);
  });
});

describe("qué se le enseña", () => {
  const varias = () => [
    conDetalle("respuesta:a", { comentario: "bien pero corto", estado: "aprobado" }, { resultado: 1, updated_at: "2026-09-01T00:00:00.000Z" }),
    conDetalle("respuesta:b", { comentario: "no emojis" }, { resultado: 0.2, updated_at: "2026-09-02T00:00:00.000Z" }),
    conDetalle("respuesta:c", { comentario: "sin precio" }, { resultado: 0.2, updated_at: "2026-09-10T00:00:00.000Z" }),
    conDetalle("respuesta:d", { estado: "aprobado" }, { resultado: 1 }),
    conDetalle("respuesta:e", { estado: "aprobado", publicacion: { titulo: "x", formato: "post" } }, { resultado: 1 }),
  ];

  it("lo que salió mal primero, y de eso lo más reciente; las aprobaciones a secas se cuentan, no se enseñan", () => {
    const e = elegirEvidencia(varias());
    expect(e.bloques.map((b) => b.senal.clave)).toEqual(["respuesta:c", "respuesta:b", "respuesta:a"]);
    expect(e.bloques.map((b) => b.n)).toEqual([1, 2, 3]);
    expect(e.aprobadasSinPalabras).toEqual({ total: 2, formatos: { reel: 1, post: 1 } });
    expect(e.total).toBe(5);
  });

  it("respeta el presupuesto de caracteres", () => {
    const muchas = Array.from({ length: 30 }, (_, i) => conDetalle(`respuesta:m${i}`, { comentario: "palabra ".repeat(60) }));
    const e = elegirEvidencia(muchas, { maxCaracteres: 2000 });
    expect(e.bloques.reduce((s, b) => s + b.texto.length, 0)).toBeLessThanOrEqual(2000);
    expect(e.bloques.length).toBeGreaterThan(0);
    expect(elegirEvidencia(muchas).bloques.length).toBeLessThanOrEqual(40);
  });
});

describe("el prompt", () => {
  const evidencia = elegirEvidencia([conDetalle("respuesta:b", { comentario: "no me gustan los emojis" }, { resultado: 0.2 })]);

  it("dice qué hacer, con las guardas de siempre, y lleva las respuestas con su número", () => {
    const p = promptDeReglas({ name: "Dcasa" }, evidencia, { ficha: "Dcasa vende muebles." });
    expect(p).toContain("cerebro de Dcasa");
    expect(p).toContain("al menos DOS respuestas");
    expect(p).toContain("Nada de costos, márgenes, proveedores");
    expect(p).toContain("SIN REGLAS");
    expect(p).toContain("[R1] Respuesta del cliente");
    expect(p).toContain("no me gustan los emojis");
    expect(p).toContain("FICHA DEL CLIENTE");
  });

  it("lo ya decidido, lo que espera y lo descartado van aparte, para no repetirlo", () => {
    const p = promptDeReglas({ name: "Dcasa" }, evidencia, { decididas: ["Sin emojis"], pendientes: ["Precio en dólares"], descartadas: ["Fondos azules"] });
    expect(p).toMatch(/YA DECIDIDO[\s\S]*- Sin emojis/);
    expect(p).toMatch(/ESPERANDO RESPUESTA[\s\S]*- Precio en dólares/);
    expect(p).toMatch(/DESCARTADO ANTES[\s\S]*- Fondos azules/);
    expect(promptDeReglas({ name: "X" }, evidencia)).toMatch(/YA DECIDIDO[^\n]*\n\(ninguna\)/);
  });

  it("avisa de que las aprobaciones sin comentario no son una preferencia", () => {
    const e = elegirEvidencia([conDetalle("respuesta:b", { comentario: "x" }), conDetalle("respuesta:d", { estado: "aprobado" })]);
    expect(promptDeReglas({ name: "X" }, e)).toContain("1 publicaciones se aprobaron sin ningún comentario (1 de reel): eso no es una preferencia");
  });
});

describe("lo que devuelve la IA", () => {
  const evidencia = elegirEvidencia(Array.from({ length: 4 }, (_, i) => conDetalle(`respuesta:p${i}`, { comentario: `c${i}` }, { resultado: 0.2 })));
  const BIEN = `REGLA: No usar emojis
TEXTO: El cliente ha pedido dos veces quitarlos: suenan informales para su marca.
RESPALDO: R1, R2

REGLA: Poner el precio en dólares
TEXTO: Prefiere ver el precio en dólares y no en balboas.
RESPALDO: R3`;

  it("lee las reglas con su título, su texto y las respuestas que las respaldan", () => {
    expect(leerReglas(BIEN, evidencia)).toEqual([
      { titulo: "No usar emojis", texto: "El cliente ha pedido dos veces quitarlos: suenan informales para su marca.", apoyo: [1, 2] },
      { titulo: "Poner el precio en dólares", texto: "Prefiere ver el precio en dólares y no en balboas.", apoyo: [3] },
    ]);
  });

  it("SIN REGLAS es un resultado válido, no un error", () => {
    expect(leerReglas("SIN REGLAS", evidencia)).toEqual([]);
    expect(leerReglas("  sin reglas.", evidencia)).toEqual([]);
  });

  it("una respuesta que la IA cita y no existía no cuenta como respaldo", () => {
    const [r] = leerReglas("REGLA: Algo\nTEXTO: Una regla.\nRESPALDO: R1, R9, R77", evidencia);
    expect(r.apoyo).toEqual([1]);
  });

  it("una regla sin título o sin texto se tira, y hay un máximo", () => {
    expect(leerReglas("REGLA:\nTEXTO: sólo texto\nRESPALDO: R1", evidencia)).toEqual([]);
    expect(leerReglas("REGLA: Sólo título\nRESPALDO: R1", evidencia)).toEqual([]);
    const muchas = Array.from({ length: 12 }, (_, i) => `REGLA: Regla ${i}\nTEXTO: Texto ${i}.\nRESPALDO: R1, R2`).join("\n\n");
    expect(leerReglas(muchas, evidencia)).toHaveLength(MAX_REGLAS);
  });

  it("recorta lo kilométrico", () => {
    const [r] = leerReglas(`REGLA: ${"t".repeat(300)}\nTEXTO: ${"x ".repeat(600)}\nRESPALDO: R1, R2`, evidencia);
    expect(r.titulo.length).toBeLessThanOrEqual(80);
    expect(r.texto.length).toBeLessThanOrEqual(600);
  });

  it("charla antes o después no la rompe; sin formato, nada", () => {
    expect(leerReglas(`Claro, aquí van:\n\n${BIEN}\n\nEspero que sirva.`, evidencia)).toHaveLength(2);
    expect(leerReglas("Aquí tienes unas ideas muy bonitas.", evidencia)).toEqual([]);
    expect(leerReglas("", evidencia)).toEqual([]);
    expect(leerReglas(undefined, evidencia)).toEqual([]);
  });
});

describe("el respaldo lo comprueba el código", () => {
  const evidencia = elegirEvidencia([
    conDetalle("respuesta:a", { comentario: "Nunca pongan emojis en mis publicaciones" }, { resultado: 0.2 }),
    conDetalle("respuesta:b", { comentario: "Me parece un poco largo" }, { resultado: 0.2 }),
    conDetalle("respuesta:c", { comentario: "Otro comentario cualquiera" }, { resultado: 0.2 }),
  ]);
  const numeroDe = (clave) => evidencia.bloques.find((b) => b.senal.clave === clave).n;

  it("dos respuestas bastan", () => {
    expect(respaldoSuficiente({ apoyo: [1, 2] }, evidencia)).toBe(true);
  });

  it("una sola no, salvo que sea una orden expresa del cliente", () => {
    expect(respaldoSuficiente({ apoyo: [numeroDe("respuesta:b")] }, evidencia)).toBe(false);
    expect(respaldoSuficiente({ apoyo: [numeroDe("respuesta:a")] }, evidencia)).toBe(true);
  });

  it("ninguna, o una inventada, no", () => {
    expect(respaldoSuficiente({ apoyo: [] }, evidencia)).toBe(false);
    expect(respaldoSuficiente({ apoyo: [99] }, evidencia)).toBe(false);
  });

  it("«siempre» en boca de la IA no cuenta: tiene que estar en lo que dijo el cliente", () => {
    const e = elegirEvidencia([conDetalle("respuesta:z", { comentario: "Me gusta más corto" }, { resultado: 0.2 })]);
    expect(respaldoSuficiente({ titulo: "Siempre textos cortos", texto: "Siempre.", apoyo: [1] }, e)).toBe(false);
  });
});

describe("no repetir", () => {
  it("lo que ya existe, sin tildes ni mayúsculas ni puntuación", () => {
    const r = [{ titulo: "No usar emojis" }, { titulo: "Precio en dólares" }, { titulo: "no usar EMOJIS." }];
    const { nuevas, repetidas } = filtrarNuevas(r, ["Precio en dólares"]);
    expect(nuevas.map((x) => x.titulo)).toEqual(["No usar emojis"]);
    expect(repetidas).toBe(2);
  });
});

// ------------------------------------------------------------
// Contra una D1 de verdad y una IA de mentira
// ------------------------------------------------------------

const JEFE = "u-jefe";
const COLAB = "u-colab";
const TESTIGO = { [JEFE]: "t-jefe", [COLAB]: "t-colab" };
let db;
let env;
let peticiones;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (t, { parada = "end_turn", uso = { input_tokens: 3000 } } = {}) => new Response([
  sse("message_start", { message: { model: "x", usage: uso } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: parada }, usage: { output_tokens: 600 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

function anthropic(respuestas) {
  peticiones = [];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }, { id: "claude-opus-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      peticiones.push(JSON.parse(opciones.body));
      return respuestas.shift();
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}
const prompt = (i = 0) => peticiones[i].messages[0].content;

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) { return objetos.has(clave) ? { text: async () => objetos.get(clave) } : null; },
    async put(clave, valor) { objetos.set(clave, String(valor)); },
    async delete(clave) { objetos.delete(clave); },
  };
}

const pedir = (ruta, opciones = {}, quien = JEFE) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const reglas = (body = {}, cliente = "c1", quien = JEFE) => pedir(`/api/cerebro/${cliente}/aprender/reglas`, { method: "POST", body }, quien);
const propuestas = () => db.sqlite.prepare("select * from cerebro_propuestas order by created_at, titulo").all().map((p) => ({ ...p, senales: JSON.parse(p.senales) }));
const acceso = () => crearAcceso(db, JEFE);

let contador = 0;
function ponerSenal(cliente, postId, detalle, { resultado = 0.2, tipo = "respuesta", ts } = {}) {
  contador++;
  db.sqlite.prepare("insert into cerebro_senales (id, owner_id, client_id, clave, tipo, post_id, resultado, resumen, detalle, updated_at) values (?,?,?,?,?,?,?,?,?,?)")
    .run(`s${contador}`, JEFE, cliente, `${tipo}:${postId}`, tipo, postId, resultado, `Pidió cambios en «${postId}»`,
      // Cada una más vieja que la anterior: así R1 es la primera que se siembra y el orden no depende del reloj.
      JSON.stringify({ estado: "cambios", publicacion: { titulo: `Reel ${postId}`, formato: "reel", categoria: "Producto" }, fecha: "2026-09-29", ...detalle }), ts ?? new Date(Date.now() - 60_000 * contador).toISOString());
}

const RESPUESTA = `REGLA: No usar emojis
TEXTO: El cliente pidió quitarlos en dos publicaciones: los ve informales para su marca.
RESPALDO: R1, R2

REGLA: Poner siempre el precio
TEXTO: Prefiere que el precio salga en la primera línea.
RESPALDO: R3

REGLA: Textos cortos
TEXTO: Un solo comentario dijo que era largo, sin más.
RESPALDO: R4`;

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [COLAB, "colab@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, solo_lectura) values (?,?,?,?,?,1)").run(COLAB, JEFE, "editor", "Colab", "#654321");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Baby Caleb");
  ponerSenal("c1", "p1", { comentario: "No me gustan los emojis, se ven informales" });
  ponerSenal("c1", "p2", { comentario: "Quiten los emojis por favor" });
  ponerSenal("c1", "p3", { comentario: "Siempre pongan el precio arriba, por favor" });
  ponerSenal("c1", "p4", { comentario: "Un poco largo" });
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("pedirle reglas a la IA", () => {
  it("las que tienen respaldo quedan como propuestas pendientes; las que no, se tiran", async () => {
    anthropic([flujo(RESPUESTA)]);
    const res = await reglas();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ propuestas: 2, sinRespaldo: 1, repetidas: 0, leidas: 4 });
    const p = propuestas();
    expect(p.map((x) => [x.titulo, x.estado]).sort()).toEqual([["No usar emojis", "pendiente"], ["Poner siempre el precio", "pendiente"]]);
    expect(p.find((x) => x.titulo === "No usar emojis").senales).toHaveLength(2);
    expect(p.find((x) => x.titulo === "Poner siempre el precio").senales, "una sola respuesta, pero es una orden expresa del cliente («siempre pongan…»)").toHaveLength(1);
  });

  it("«Textos cortos» tenía UNA respuesta sin orden expresa: no pasó", async () => {
    anthropic([flujo(RESPUESTA)]);
    await reglas();
    expect(propuestas().some((x) => x.titulo === "Textos cortos")).toBe(false);
  });

  it("NADA entra al cerebro por esto: sólo propuestas", async () => {
    anthropic([flujo(RESPUESTA)]);
    await reglas();
    expect(db.sqlite.prepare("select count(*) as n from cerebro_notas").get().n).toBe(0);
  });

  it("la IA lee lo que dijo el cliente, tal cual, y sus reglas", async () => {
    anthropic([flujo(RESPUESTA)]);
    await reglas();
    expect(prompt()).toContain("No me gustan los emojis, se ven informales");
    expect(prompt()).toContain("[R1]");
    expect(prompt()).toContain("al menos DOS respuestas");
  });

  it("lo que ya está decidido no se le pide otra vez, ni se propone otra vez", async () => {
    db.sqlite.prepare("insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, texto, tipo, origen) values (?,?,?,?,?,?,?,?)")
      .run("n1", JEFE, "c1", "no-usar-emojis", "No usar emojis", "Ya decidido.", "decision", "manual");
    anthropic([flujo(RESPUESTA)]);
    const r = await (await reglas()).json();
    expect(prompt()).toMatch(/YA DECIDIDO[\s\S]*- No usar emojis/);
    expect(r.repetidas).toBe(1);
    expect(propuestas().map((x) => x.titulo)).toEqual(["Poner siempre el precio"]);
  });

  it("apunta el consumo como «cerebro», del cliente", async () => {
    anthropic([flujo(RESPUESTA)]);
    await reglas();
    expect(db.sqlite.prepare("select * from consumo_ia").get()).toMatchObject({ funcion: "cerebro", client_id: "c1" });
  });

  it("no ve nada de otro cliente ni las notas internas del suyo", async () => {
    ponerSenal("c2", "z1", { comentario: "SECRETO DE OTRO CLIENTE" });
    db.sqlite.prepare("insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, texto, tipo, origen, interna) values (?,?,?,?,?,?,?,?,?)")
      .run("n2", JEFE, "c1", "costos", "Economía unitaria", "El costo del sofá es 200 dólares", "documento", "manual", 1);
    anthropic([flujo(RESPUESTA)]);
    await reglas();
    expect(prompt()).not.toContain("SECRETO DE OTRO CLIENTE");
    expect(prompt()).not.toContain("costo del sofá");
  });

  it("SIN REGLAS es un resultado: nada que proponer, y se dice", async () => {
    anthropic([flujo("SIN REGLAS")]);
    const r = await (await reglas()).json();
    expect(r).toMatchObject({ propuestas: 0, sinReglas: true });
    expect(propuestas()).toEqual([]);
  });
});

describe("no gastar sin motivo", () => {
  it("con menos de tres respuestas con palabras, ni se llama a la IA", async () => {
    db.sqlite.prepare("delete from cerebro_senales where post_id in ('p3','p4')").run();
    anthropic([]);
    const res = await reglas();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/al menos 3 casos/);
    expect(peticiones).toHaveLength(0);
  });

  it("sin nada nuevo desde la última vez no se vuelve a llamar; con «forzar» sí", async () => {
    anthropic([flujo(RESPUESTA)]);
    await reglas();
    anthropic([]);
    const r = await (await reglas()).json();
    expect(r).toMatchObject({ propuestas: 0, sinNovedades: true });
    expect(peticiones).toHaveLength(0);
    anthropic([flujo("SIN REGLAS")]);
    await reglas({ forzar: true });
    expect(peticiones).toHaveLength(1);
  });

  it("con una respuesta nueva desde la última vez, sí se vuelve a pedir", async () => {
    anthropic([flujo(RESPUESTA)]);
    await reglas();
    ponerSenal("c1", "p5", { comentario: "Más colores por favor" }, { ts: new Date(Date.now() + 5000).toISOString() });
    anthropic([flujo("SIN REGLAS")]);
    await reglas();
    expect(peticiones).toHaveLength(1);
  });

  it("con diez reglas esperando no se piden más", async () => {
    for (let i = 0; i < 10; i++) db.sqlite.prepare("insert into cerebro_propuestas (id, owner_id, client_id, titulo, texto) values (?,?,?,?,?)").run(`q${i}`, JEFE, "c1", `Regla ${i}`, "x");
    anthropic([]);
    const res = await reglas();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/10 reglas esperando/);
    expect(peticiones).toHaveLength(0);
  });

  it("con el presupuesto agotado y «detener», no llama a la IA", async () => {
    db.sqlite.prepare("insert into ajustes_espacio (id, owner_id, presupuesto_usd, al_limite) values (?,?,?,?)").run(JEFE, JEFE, 1, "detener");
    db.sqlite.prepare("insert into consumo_ia (id, owner_id, mes, funcion, modelo, costo_usd) values (?,?,?,?,?,?)").run("g1", JEFE, mesActual(), "x", "claude-sonnet-5", 5);
    anthropic([]);
    expect((await reglas()).status).toBe(402);
    expect(peticiones).toHaveLength(0);
  });
});

describe("cuando la IA falla, no queda nada a medias", () => {
  it("un rechazo de Anthropic enseña su motivo", async () => {
    anthropic([new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "prompt demasiado largo" } }), { status: 400 })]);
    const res = await reglas();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("prompt demasiado largo");
    expect(propuestas()).toEqual([]);
  });

  it("una respuesta sin el formato se dice, y no deja propuestas", async () => {
    anthropic([flujo("Aquí tienes unas ideas muy bonitas, sin etiquetas.")]);
    const res = await reglas();
    expect(res.status).toBe(502);
    expect(propuestas()).toEqual([]);
  });

  it("una respuesta cortada por longitud tampoco", async () => {
    anthropic([flujo("REGLA: A medias", { parada: "max_tokens" })]);
    expect((await reglas()).status).toBe(502);
    expect(propuestas()).toEqual([]);
  });

  it("sin la clave de Anthropic, 503", async () => {
    env.ANTHROPIC_API_KEY = "";
    expect((await reglas()).status).toBe(503);
  });
});

describe("las reglas que esperan decisión", () => {
  beforeEach(async () => { anthropic([flujo(RESPUESTA)]); await reglas(); });
  const lista = async (cliente = "c1", quien = JEFE) => (await (await pedir(`/api/cerebro/${cliente}/propuestas`, {}, quien)).json()).propuestas;
  const id = (titulo) => propuestas().find((p) => p.titulo === titulo).id;

  it("se listan con las respuestas que las respaldan, escritas como se le mostraron a la persona", async () => {
    const l = await lista();
    expect(l.map((p) => p.titulo).sort()).toEqual(["No usar emojis", "Poner siempre el precio"]);
    const emojis = l.find((p) => p.titulo === "No usar emojis");
    expect(emojis.respaldo).toHaveLength(2);
    expect(emojis.respaldo.join(" ")).toMatch(/Pidió cambios en/);
    expect(emojis).not.toHaveProperty("senales");
  });

  it("sólo las del cliente, y con sesión; sólo lectura puede mirar", async () => {
    expect(await lista("c2")).toEqual([]);
    expect((await pedir("/api/cerebro/c1/propuestas", {}, COLAB)).status).toBe(200);
    expect((await worker.fetch(new Request("https://calendarios.test/api/cerebro/c1/propuestas"), env)).status).toBe(401);
  });

  it("aceptar deja una nota de decisión con la regla, que la búsqueda encuentra al momento", async () => {
    const res = await pedir(`/api/cerebro/c1/propuestas/${id("No usar emojis")}/aceptar`, { method: "POST", body: {} });
    expect(res.status).toBe(201);
    const { nota } = await res.json();
    const fila = db.sqlite.prepare("select * from cerebro_notas where id = ?").get(nota.id);
    expect(fila).toMatchObject({ tipo: "decision", origen: "ia", interna: 0, titulo: "No usar emojis", client_id: "c1" });
    expect(fila.fuente).toBe(`propuesta:${id("No usar emojis")}`);
    expect(fila.caracteres).toBe(fila.texto.length);
    const p = propuestas().find((x) => x.titulo === "No usar emojis");
    expect(p).toMatchObject({ estado: "aceptada", nota_id: nota.id });
    expect(p.resuelta_at).toBeTruthy();
    const hallazgo = await buscar(env, acceso(), "c1", "quitarlos informales marca emojis", { para: "texto" });
    expect(hallazgo.map((h) => h.ruta)).toContain(nota.ruta);
  });

  it("aceptarla con cambios deja lo que la persona corrigió, y puede marcarla interna", async () => {
    const res = await pedir(`/api/cerebro/c1/propuestas/${id("Poner siempre el precio")}/aceptar`, { method: "POST", body: { titulo: "Precio primero", texto: "El precio va en la primera línea, en dólares.", interna: true } });
    const { nota } = await res.json();
    expect(db.sqlite.prepare("select titulo, texto, interna from cerebro_notas where id = ?").get(nota.id)).toEqual({ titulo: "Precio primero", texto: "El precio va en la primera línea, en dólares.", interna: 1 });
  });

  it("aceptar dos veces no deja dos notas", async () => {
    const uno = await pedir(`/api/cerebro/c1/propuestas/${id("No usar emojis")}/aceptar`, { method: "POST", body: {} });
    const dos = await pedir(`/api/cerebro/c1/propuestas/${id("No usar emojis")}/aceptar`, { method: "POST", body: {} });
    expect(uno.status).toBe(201);
    expect(dos.status).toBe(409);
    expect(db.sqlite.prepare("select count(*) as n from cerebro_notas where tipo = 'decision'").get().n).toBe(1);
  });

  it("una nota con el mismo título no choca: la ruta se reparte", async () => {
    db.sqlite.prepare("insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, texto) values (?,?,?,?,?,?)").run("n9", JEFE, "c1", "no-usar-emojis", "No usar emojis", "a mano");
    const { nota } = await (await pedir(`/api/cerebro/c1/propuestas/${id("No usar emojis")}/aceptar`, { method: "POST", body: {} })).json();
    expect(nota.ruta).toBe("no-usar-emojis-2");
  });

  it("una regla vacía por lo que la persona borró se rechaza y sigue esperando", async () => {
    const res = await pedir(`/api/cerebro/c1/propuestas/${id("No usar emojis")}/aceptar`, { method: "POST", body: { texto: "   " } });
    expect(res.status).toBe(400);
    expect(propuestas().find((x) => x.titulo === "No usar emojis").estado).toBe("pendiente");
  });

  it("descartar la quita de la lista y no se vuelve a proponer", async () => {
    expect((await pedir(`/api/cerebro/c1/propuestas/${id("No usar emojis")}/descartar`, { method: "POST", body: {} })).status).toBe(200);
    expect((await lista()).map((p) => p.titulo)).toEqual(["Poner siempre el precio"]);
    expect((await pedir(`/api/cerebro/c1/propuestas/${id("No usar emojis")}/descartar`, { method: "POST", body: {} })).status).toBe(409);
    ponerSenal("c1", "p9", { comentario: "Otro más" }, { ts: new Date(Date.now() + 5000).toISOString() });
    anthropic([flujo(RESPUESTA)]);
    const r = await (await reglas()).json();
    expect(prompt()).toMatch(/DESCARTADO ANTES[\s\S]*- No usar emojis/);
    expect(r.repetidas).toBeGreaterThanOrEqual(1);
    expect(propuestas().filter((p) => p.titulo === "No usar emojis")).toHaveLength(1);
  });

  it("una regla de otro cliente es «no encontrada»; sólo lectura no decide", async () => {
    const otra = id("No usar emojis");
    expect((await pedir(`/api/cerebro/c2/propuestas/${otra}/aceptar`, { method: "POST", body: {} })).status).toBe(404);
    expect((await pedir(`/api/cerebro/c2/propuestas/${otra}/descartar`, { method: "POST", body: {} })).status).toBe(404);
    expect((await pedir(`/api/cerebro/c1/propuestas/${otra}/aceptar`, { method: "POST", body: {} }, COLAB)).status).toBe(403);
    expect((await pedir(`/api/cerebro/c1/aprender/reglas`, { method: "POST", body: {} }, COLAB)).status).toBe(403);
    expect(propuestas().find((x) => x.id === otra).estado).toBe("pendiente");
  });
});
