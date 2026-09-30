import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { leerPesos } from "../../worker/lib/cerebro/pesos.js";
import { MIN_MEDIDAS } from "../../worker/lib/cerebro/senales.js";

// ============================================================
// Aprender de lo que rindió en redes y de lo que el equipo corrigió,
// contra una D1 de verdad
//
//   RESULTADOS
//   1. Cada publicación medida se compara con las demás del mismo cliente;
//      sólo dejan señal las que salieron desde la aplicación.
//   2. Con pocas medidas, o sin salidas de la aplicación, se dice por qué y no se inventa nada.
//   3. Volver a compararlas reemplaza, no suma; y un cliente no ve lo de otro.
//   CORRECCIONES
//   4. El texto que la IA escribió con el cerebro se apunta al llegar; lo que el equipo cambia
//      después se mide contra eso y queda como señal.
//   5. Lo que la IA no escribió con el cerebro, lo que se teclea y los retoques no dejan nada.
//   6. Nada de esto puede tumbar el guardado del calendario.
// ============================================================

const JEFE = "u-jefe";
const COLAB = "u-colab";
const TESTIGO = { [JEFE]: "t-jefe", [COLAB]: "t-colab" };
let db;
let env;

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) { return objetos.has(clave) ? { text: async () => objetos.get(clave) } : null; },
    async put(clave, valor) { objetos.set(clave, String(valor)); },
    async delete(clave) { objetos.delete(clave); },
  };
}

async function sembrar() {
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
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, nombre, client_id) values (?,?,?,?,?,?)").run("cta1", JEFE, "instagram", "ig-dcasa", "dcasa", "c1");
  s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, nombre, client_id) values (?,?,?,?,?,?)").run("cta2", JEFE, "instagram", "ig-baby", "baby", "c2");
}

const pedir = (ruta, opciones = {}, quien = JEFE) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

const poner = (cliente, titulo, texto, extra = {}) => pedir(`/api/cerebro/${cliente}/nota`, { method: "PUT", body: { titulo, texto, ...extra } });
const contexto = (cliente, consulta, extra = {}) => pedir(`/api/cerebro/${cliente}/contexto`, { method: "POST", body: { consulta, para: "texto", ...extra } }).then((r) => r.json());
const acceso = () => crearAcceso(db, JEFE);
const senales = (cliente = "c1", tipo = null) => db.sqlite.prepare(`select * from cerebro_senales where client_id = ? ${tipo ? "and tipo = ?" : ""} order by clave`)
  .all(...(tipo ? [cliente, tipo] : [cliente])).map((f) => ({ ...f, detalle: JSON.parse(f.detalle) }));
const usoDe = (postId, cliente = "c1") => {
  const f = db.sqlite.prepare("select * from cerebro_usos where client_id = ? and post_id = ?").get(cliente, postId);
  return f ? { ...f, rutas: JSON.parse(f.rutas), texto: JSON.parse(f.texto) } : null;
};

const AHORA = Date.now();
const haceDias = (n) => new Date(AHORA - n * 86_400_000).toJSON();

// ---------------------------------------------------------------- resultados en redes

/** Sembrar `n` publicaciones medidas de un cliente; las `salidas` primeras salieron desde la aplicación (p1, p2…). */
function sembrarMedidas(cliente, cuenta, n, { salidas = 0, prefijo = "ig" } = {}) {
  const s = db.sqlite;
  for (let i = 1; i <= n; i++) {
    s.prepare(
      `insert into metricas_publicacion (id, owner_id, client_id, cuenta_id, red, externo_id, tipo, texto, publicada_at, interacciones, alcance, updated_at)
       values (?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(`${cuenta}:${prefijo}${i}`, JEFE, cliente, cuenta, "instagram", `${prefijo}${i}`, "reel", `Texto de la publicación ${i}\nSegunda línea`, haceDias(30 - i), i * 10, i * 100, haceDias(1));
    if (i <= salidas) {
      s.prepare(
        `insert into publicaciones_programadas (id, owner_id, client_id, calendar_id, post_id, red, cuenta_id, programada_para, estado, externo_id, variante)
         values (?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(`prog-${cliente}-${i}`, JEFE, cliente, null, `p${i}`, "instagram", cuenta, haceDias(30 - i), "publicada", `${prefijo}${i}`, "post");
    }
  }
}

describe("aprender de lo que rindió en redes", () => {
  beforeEach(async () => {
    db = d1EnMemoria();
    env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") } };
    await sembrar();
    await poner("c1", "Sofás", "Los sofás seccionales llevan espuma de alta densidad.", { tipo: "marca" });
    await poner("c1", "Garantía", "Garantía de dos años en estructura.", { tipo: "marca" });
  });
  afterEach(() => vi.restoreAllMocks());

  const aprender = (cliente = "c1", quien = JEFE) => pedir(`/api/cerebro/${cliente}/aprender/metricas`, { method: "POST", body: {} }, quien);

  it("deja una señal por publicación que salió de la aplicación, con lo que rindió frente a las demás", async () => {
    sembrarMedidas("c1", "cta1", 12, { salidas: 12 });
    const r = await aprender();
    expect(r.status).toBe(200);
    const b = await r.json();
    expect(b).toMatchObject({ medidas: 12, comparadas: 12, senales: 12, senalesNuevas: 12, sinPublicacion: 0, madurando: 0, pocas: {} });
    const s = senales("c1", "metricas");
    expect(s).toHaveLength(12);
    const mejor = s.find((x) => x.post_id === "p12");
    const peor = s.find((x) => x.post_id === "p1");
    expect(mejor.resultado).toBeGreaterThan(0.8);
    expect(peor.resultado).toBeLessThan(0.2);
    expect(mejor.detalle).toMatchObject({ interacciones: 120, alcance: 1200, redes: ["instagram"] });
    expect(mejor.detalle.percentil).toBeGreaterThan(90);
  });

  it("las notas que se usaron para escribir la publicación suben si rindió bien y bajan si rindió mal", async () => {
    sembrarMedidas("c1", "cta1", 12, { salidas: 12 });
    await contexto("c1", "sofás seccionales espuma", { postIds: ["p12"] }); // la mejor
    await contexto("c1", "garantía estructura", { postIds: ["p1"] }); // la peor
    await aprender();
    const p = await leerPesos(acceso(), "c1");
    expect(p.notes.sofas.w).toBeGreaterThan(0.5);
    expect(p.notes.garantia.w).toBeLessThan(0.5);
  });

  it("volver a compararlas reemplaza las señales, no las suma", async () => {
    sembrarMedidas("c1", "cta1", 12, { salidas: 12 });
    await contexto("c1", "sofás seccionales", { postIds: ["p12"] });
    await aprender();
    const antes = (await leerPesos(acceso(), "c1")).notes.sofas.w;
    const otra = await (await aprender()).json();
    expect(otra.senalesNuevas).toBe(0);
    expect(senales("c1", "metricas")).toHaveLength(12);
    expect((await leerPesos(acceso(), "c1")).notes.sofas.w).toBeCloseTo(antes, 9);
  });

  it("las que no salieron de la aplicación cuentan para comparar pero no dejan señal", async () => {
    sembrarMedidas("c1", "cta1", 12, { salidas: 4 });
    const b = await (await aprender()).json();
    expect(b).toMatchObject({ comparadas: 12, senales: 4, sinPublicacion: 8 });
    expect(senales("c1", "metricas").map((x) => x.post_id)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("las historias de la cola no se confunden con la publicación", async () => {
    sembrarMedidas("c1", "cta1", 10, { salidas: 0 });
    db.sqlite.prepare(
      `insert into publicaciones_programadas (id, owner_id, client_id, calendar_id, post_id, red, cuenta_id, programada_para, estado, externo_id, variante)
       values ('h1', ?, 'c1', null, 'pX', 'instagram', 'cta1', ?, 'publicada', 'ig5', 'historia')`,
    ).run(JEFE, haceDias(20));
    expect((await (await aprender()).json()).senales).toBe(0);
  });

  it("con pocas medidas dice cuántas hay y no inventa nada", async () => {
    sembrarMedidas("c1", "cta1", MIN_MEDIDAS - 1, { salidas: MIN_MEDIDAS - 1 });
    const b = await (await aprender()).json();
    expect(b).toMatchObject({ medidas: MIN_MEDIDAS - 1, comparadas: 0, senales: 0, pocas: { instagram: MIN_MEDIDAS - 1 } });
    expect(senales("c1", "metricas")).toEqual([]);
  });

  it("las que aún están madurando no cuentan", async () => {
    sembrarMedidas("c1", "cta1", 10, { salidas: 10 });
    db.sqlite.prepare("update metricas_publicacion set publicada_at = ? where externo_id in ('ig9','ig10')").run(haceDias(1));
    const b = await (await aprender()).json();
    expect(b).toMatchObject({ comparadas: 8, madurando: 2, senales: 8 });
    expect(senales("c1", "metricas").map((x) => x.post_id)).not.toContain("p10");
  });

  it("sin nada medido, todo en cero", async () => {
    expect(await (await aprender()).json()).toMatchObject({ medidas: 0, comparadas: 0, senales: 0, reforzadas: 0 });
  });

  it("no mezcla clientes: lo de uno no compara ni deja nada en otro", async () => {
    sembrarMedidas("c1", "cta1", 12, { salidas: 12 });
    sembrarMedidas("c2", "cta2", 10, { salidas: 10, prefijo: "bb" });
    await aprender("c1");
    expect(senales("c2")).toEqual([]);
    const b = await (await aprender("c2")).json();
    expect(b.medidas).toBe(10);
    expect(senales("c2", "metricas")).toHaveLength(10);
    expect(senales("c1", "metricas")).toHaveLength(12);
  });

  it("un cliente que no existe, o de sólo lectura, no puede", async () => {
    expect((await aprender("c9")).status).toBe(404);
    expect((await aprender("c1", COLAB)).status).toBe(403);
  });

  it("las señales entran en lo que lee la IA cuando se le pide proponer reglas", async () => {
    sembrarMedidas("c1", "cta1", 12, { salidas: 12 });
    await aprender();
    const r = await pedir("/api/cerebro/c1/senales");
    const { senales: lista } = await r.json();
    expect(lista.filter((x) => x.tipo === "metricas")).toHaveLength(12);
  });
});

// ---------------------------------------------------------------- correcciones del equipo

const CON_EMOJIS = "¡Hola! 😊 Descubre nuestros sofás seccionales 🛋️ con espuma de alta densidad. Escríbenos y agenda tu visita hoy 🚀 y llévate el mejor precio.";
const SIN_EMOJIS = "Descubre nuestros sofás seccionales con espuma de alta densidad. Escríbenos y agenda tu visita hoy y llévate el mejor precio.";
const OTRO = "Comedores de roble macizo, entregados armados en tu casa. Elige el tamaño que necesitas y te lo llevamos esta misma semana sin costo.";

const publicacion = (id, extra = {}) => ({ id, format: "reel", title: `Publicación ${id}`, idea: `Idea ${id}`, category: "Producto", descripcion: "", guion: "", ...extra });
function sembrarCalendario(ps) {
  db.sqlite.prepare(
    "insert into calendars (id, client_id, owner_id, name, month, year, days) values ('cal1','c1',?,?,?,?,?)",
  ).run(JEFE, "Octubre", 9, 2026, JSON.stringify([{ date: "2026-10-12", category: "Producto", posts: ps }]));
}
/** Guarda el calendario como lo haría el navegador: el PUT entero. */
const guardar = async (ps, quien = JEFE) => {
  const r = await pedir("/api/calendarios/cal1", { method: "PUT", body: { client_id: "c1", name: "Octubre", month: 9, year: 2026, days: [{ date: "2026-10-12", category: "Producto", posts: ps }] } }, quien);
  expect(r.status).toBe(200);
};

describe("aprender de lo que el equipo corrigió", () => {
  beforeEach(async () => {
    db = d1EnMemoria();
    env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") } };
    await sembrar();
    await poner("c1", "Sofás", "Los sofás seccionales llevan espuma de alta densidad.", { tipo: "marca" });
    await poner("c1", "Garantía", "Garantía de dos años en estructura.", { tipo: "marca" });
    sembrarCalendario([publicacion("p1"), publicacion("p2")]);
  });
  afterEach(() => vi.restoreAllMocks());

  /** Como la generación: pide el contexto con las publicaciones y después llega el texto. */
  const generar = async (postId, texto, consulta = "sofás seccionales espuma") => {
    await contexto("c1", consulta, { postIds: [postId] });
    await guardar([publicacion("p1", postId === "p1" ? { descripcion: texto } : {}), publicacion("p2", postId === "p2" ? { descripcion: texto } : {})]);
  };

  it("el texto que llega entero, tras pedirlo con el cerebro, se apunta como la base y todavía no es una corrección", async () => {
    await generar("p1", CON_EMOJIS);
    const u = usoDe("p1");
    expect(u.texto.descripcion).toBe(CON_EMOJIS);
    expect(Object.keys(u.texto.en)).toEqual(["descripcion"]);
    expect(senales("c1", "correccion")).toEqual([]);
  });

  it("apuntar la base no cuenta como pedirle texto a la IA otra vez", async () => {
    await contexto("c1", "sofás seccionales", { postIds: ["p1"] });
    const pedido = usoDe("p1").updated_at;
    await guardar([publicacion("p1", { descripcion: CON_EMOJIS }), publicacion("p2")]);
    expect(usoDe("p1").updated_at).toBe(pedido);
  });

  it("lo que el equipo cambia después se mide contra lo que escribió la IA y queda como señal", async () => {
    await generar("p1", CON_EMOJIS);
    await guardar([publicacion("p1", { descripcion: SIN_EMOJIS }), publicacion("p2")]);
    const [s] = senales("c1", "correccion");
    expect(s).toMatchObject({ clave: "correccion:p1", post_id: "p1" });
    expect(s.detalle).toMatchObject({ campo: "descripción", antes: CON_EMOJIS, despues: SIN_EMOJIS, cambio: "se quitaron los emojis", quien: "Juan" });
    expect(s.detalle.intensidad).toBeGreaterThanOrEqual(0.4);
    expect(s.resumen).toBe("Corrigió la descripción de «Publicación p1»: se quitaron los emojis");
    // La base sigue siendo lo que escribió la IA, no lo corregido.
    expect(usoDe("p1").texto.descripcion).toBe(CON_EMOJIS);
  });

  it("las notas que se usaron bajan cuando el equipo reescribe el texto casi entero", async () => {
    await generar("p1", CON_EMOJIS);
    await guardar([publicacion("p1", { descripcion: OTRO }), publicacion("p2")]);
    const p = await leerPesos(acceso(), "c1");
    expect(p.notes.sofas.w).toBeLessThan(0.5);
  });

  it("un retoque no deja nada, ni una errata", async () => {
    await generar("p1", CON_EMOJIS);
    await guardar([publicacion("p1", { descripcion: CON_EMOJIS.replace("Hola", "Hola,") }), publicacion("p2")]);
    await guardar([publicacion("p1", { descripcion: CON_EMOJIS.replace("mejor precio", "mejor precio del mercado") }), publicacion("p2")]);
    expect(senales("c1", "correccion")).toEqual([]);
  });

  it("los guardados de una pausa al teclear no reescriben la señal si casi no cambió nada", async () => {
    await generar("p1", CON_EMOJIS);
    await guardar([publicacion("p1", { descripcion: SIN_EMOJIS }), publicacion("p2")]);
    const primera = senales("c1", "correccion")[0];
    await guardar([publicacion("p1", { descripcion: SIN_EMOJIS + " Hoy" }), publicacion("p2")]);
    const segunda = senales("c1", "correccion")[0];
    expect(segunda.id).toBe(primera.id);
    expect(segunda.detalle.despues).toBe(SIN_EMOJIS); // no se volvió a escribir
    // Pero un cambio de verdad sí.
    await guardar([publicacion("p1", { descripcion: OTRO }), publicacion("p2")]);
    expect(senales("c1", "correccion")[0].detalle.despues).toBe(OTRO);
    expect(senales("c1", "correccion")).toHaveLength(1);
  });

  it("volver a dejarlo como estaba se apunta: era una aceptación", async () => {
    await generar("p1", CON_EMOJIS);
    await guardar([publicacion("p1", { descripcion: OTRO }), publicacion("p2")]);
    expect(senales("c1", "correccion")[0].resultado).toBeLessThan(0.3);
    await guardar([publicacion("p1", { descripcion: CON_EMOJIS }), publicacion("p2")]);
    const [s] = senales("c1", "correccion");
    expect(s.resultado).toBeCloseTo(0.75, 2);
    expect(s.resumen).toMatch(/^Dejó casi igual/);
  });

  it("un texto que nadie pidió con el cerebro no deja línea base ni señal, por mucho que se corrija", async () => {
    await guardar([publicacion("p1", { descripcion: CON_EMOJIS }), publicacion("p2")]);
    await guardar([publicacion("p1", { descripcion: OTRO }), publicacion("p2")]);
    expect(usoDe("p1")).toBeNull();
    expect(senales("c1", "correccion")).toEqual([]);
  });

  it("lo que se teclea a mano antes de que la IA escriba no es su texto", async () => {
    await contexto("c1", "sofás", { postIds: ["p1"] });
    await guardar([publicacion("p1", { descripcion: "Hola" }), publicacion("p2")]);
    await guardar([publicacion("p1", { descripcion: "Hola, buenas" }), publicacion("p2")]);
    expect(usoDe("p1").texto).toEqual({});
    expect(senales("c1", "correccion")).toEqual([]);
  });

  it("si se le pide texto otra vez y llega uno nuevo, es la IA regenerando: la base cambia y no cuenta como corrección", async () => {
    await generar("p1", CON_EMOJIS);
    // «Se le pidió DESPUÉS de la base» se sabe por los milisegundos: entre una generación y otra pasan segundos, pero
    // el test las hace seguidas y a veces caían en el mismo.
    await new Promise((r) => setTimeout(r, 5));
    await generar("p1", OTRO, "garantía estructura");
    expect(usoDe("p1").texto.descripcion).toBe(OTRO);
    expect(senales("c1", "correccion")).toEqual([]);
  });

  it("el guion que llega en otra vuelta tiene su propia base y no estropea lo de la descripción", async () => {
    await generar("p1", CON_EMOJIS);
    await contexto("c1", "garantía", { postIds: ["p1"] });
    await guardar([publicacion("p1", { descripcion: CON_EMOJIS, guion: OTRO }), publicacion("p2")]);
    const u = usoDe("p1");
    expect(u.texto).toMatchObject({ descripcion: CON_EMOJIS, guion: OTRO });
    expect(senales("c1", "correccion")).toEqual([]);
    await guardar([publicacion("p1", { descripcion: CON_EMOJIS, guion: "Otra cosa totalmente distinta, escrita de cero por una persona de la agencia." }), publicacion("p2")]);
    expect(senales("c1", "correccion")[0].detalle).toMatchObject({ campo: "guion" });
  });

  it("cada publicación con lo suyo: corregir una no toca a la otra", async () => {
    await contexto("c1", "sofás", { postIds: ["p1", "p2"] });
    await guardar([publicacion("p1", { descripcion: CON_EMOJIS }), publicacion("p2", { descripcion: OTRO })]);
    await guardar([publicacion("p1", { descripcion: SIN_EMOJIS }), publicacion("p2", { descripcion: OTRO })]);
    expect(senales("c1", "correccion").map((x) => x.post_id)).toEqual(["p1"]);
  });

  it("no mezcla clientes: la base de una publicación con el mismo id en otro cliente no cuenta", async () => {
    db.sqlite.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values ('cal2','c2',?,?,?,?,?)")
      .run(JEFE, "Octubre", 9, 2026, JSON.stringify([{ date: "2026-10-12", posts: [publicacion("p1")] }]));
    await poner("c2", "Tono", "Cercano, de tú.", { tipo: "marca" });
    await contexto("c2", "cercano tú", { postIds: ["p1"] });
    await guardar([publicacion("p1", { descripcion: CON_EMOJIS }), publicacion("p2")]);
    expect(usoDe("p1", "c1")).toBeNull(); // c1 nunca pidió texto con el cerebro para p1
    expect(usoDe("p1", "c2").texto).toEqual({});
    expect(senales("c1")).toEqual([]);
  });

  it("un guardado que no toca el texto no consulta nada del cerebro", async () => {
    await generar("p1", CON_EMOJIS);
    const consultas = [];
    const original = db.prepare.bind(db);
    db.prepare = (sql) => { consultas.push(sql); return original(sql); };
    await guardar([publicacion("p1", { descripcion: CON_EMOJIS, title: "Otro título" }), publicacion("p2")]);
    db.prepare = original;
    expect(consultas.filter((q) => /cerebro_(usos|senales|memoria)/.test(q))).toEqual([]);
  });

  it("si aprender falla, el calendario se guarda igual", async () => {
    await generar("p1", CON_EMOJIS);
    const original = db.prepare.bind(db);
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.prepare = (sql) => {
      if (/from cerebro_usos/.test(sql)) throw new Error("D1 caída");
      return original(sql);
    };
    const r = await pedir("/api/calendarios/cal1", { method: "PUT", body: { client_id: "c1", name: "Octubre", month: 9, year: 2026, days: [{ date: "2026-10-12", posts: [publicacion("p1", { descripcion: OTRO })] }] } });
    db.prepare = original;
    expect(r.status).toBe(200);
    const guardado = JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal1'").get().days);
    expect(guardado[0].posts[0].descripcion).toBe(OTRO);
  });
});
