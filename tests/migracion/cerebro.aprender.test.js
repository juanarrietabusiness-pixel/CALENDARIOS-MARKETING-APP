import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { buscar } from "../../worker/lib/cerebro/cerebro.js";
import { leerPesos, boostDe } from "../../worker/lib/cerebro/pesos.js";
import { MAX_AUTOMATICAS } from "../../worker/lib/cerebro/aprender.js";

// ============================================================
// Aprender de lo que pasa después de escribir, contra una D1 de verdad
//
//   1. Al generar, se apunta qué notas se le dieron a la IA para cada publicación.
//   2. Cuando el cliente responde por su enlace: queda la señal, se refuerzan
//      esas notas y, si dijo algo, queda una nota con sus palabras.
//   3. Se puede aprender también de lo que ya respondió.
//   4. Nada de esto puede tumbar la respuesta del cliente, ni pisar lo que
//      una persona corrigió, ni contar dos veces lo mismo.
// ============================================================

const JEFE = "u-jefe";
const COLAB = "u-colab";
const TESTIGO = { [JEFE]: "t-jefe", [COLAB]: "t-colab" };
const ENLACE = "enlace-publico-de-prueba-0123456789";
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

const posts = (n, prefijo = "p") => Array.from({ length: n }, (_, i) => ({
  id: `${prefijo}${i + 1}`, format: "reel", title: `Publicación ${i + 1}`, idea: `Idea de la publicación ${i + 1}`, category: "Producto",
}));
const dia = (fecha, ps) => ({ date: fecha, category: "Producto", posts: ps });

function sembrarCalendario(id, cliente, ps, { enlace = null, mes = 9 } = {}) {
  db.sqlite.prepare(
    "insert into calendars (id, client_id, owner_id, name, month, year, days, share_token, share_enabled) values (?,?,?,?,?,?,?,?,1)",
  ).run(id, cliente, JEFE, `Mes ${mes}`, mes, 2026, JSON.stringify([dia(`2026-${String(mes + 1).padStart(2, "0")}-12`, ps)]), enlace);
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
}

const pedir = (ruta, opciones = {}, quien = JEFE) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const publico = (ruta, cuerpo) =>
  worker.fetch(new Request(`https://calendarios.test/api/publico/${ENLACE}${ruta}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }), env);

const poner = (cliente, titulo, texto, extra = {}) => pedir(`/api/cerebro/${cliente}/nota`, { method: "PUT", body: { titulo, texto, ...extra } });
const contexto = (cliente, consulta, extra = {}) => pedir(`/api/cerebro/${cliente}/contexto`, { method: "POST", body: { consulta, para: "texto", ...extra } }).then((r) => r.json());
const responder = (postId, estado, extra = {}) => publico("/aprobacion", { postId, estado, revisor: "Ana", ...extra });
const acceso = () => crearAcceso(db, JEFE);
const senales = (cliente = "c1") => db.sqlite.prepare("select * from cerebro_senales where client_id = ? order by clave").all(cliente).map((f) => ({ ...f, detalle: JSON.parse(f.detalle) }));
const usos = (cliente = "c1") => db.sqlite.prepare("select * from cerebro_usos where client_id = ? order by post_id").all(cliente).map((f) => ({ ...f, rutas: JSON.parse(f.rutas) }));
const notasAuto = (cliente = "c1") => db.sqlite.prepare("select * from cerebro_notas where client_id = ? and origen = 'app' order by created_at").all(cliente).map((n) => ({ ...n }));
const pesos = async (cliente = "c1") => leerPesos(acceso(), cliente);

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
  sembrarCalendario("cal1", "c1", posts(3), { enlace: ENLACE });
  await poner("c1", "Sofás", "Los sofás seccionales llevan espuma de alta densidad. Combinan con los comedores.", { tipo: "marca" });
  await poner("c1", "Comedores", "Comedores de roble macizo entregados armados.", { tipo: "marca" });
  await poner("c1", "Garantía", "Garantía de dos años en estructura.", { tipo: "marca" });
});
afterEach(() => vi.restoreAllMocks());

describe("qué notas se usaron al escribir cada publicación", () => {
  it("al pedir el contexto para unas publicaciones se apuntan las notas que se le dieron a la IA", async () => {
    const c = await contexto("c1", "sofás seccionales espuma", { postIds: ["p1", "p2"] });
    expect(c.fuentes).toContain("sofas");
    const u = usos();
    expect(u.map((x) => x.post_id)).toEqual(["p1", "p2"]);
    expect(u[0].rutas).toEqual(c.fuentes);
    expect(u[1].rutas).toEqual(c.fuentes);
  });

  it("volver a escribir una publicación reemplaza lo apuntado, no añade otra fila", async () => {
    await contexto("c1", "sofás seccionales", { postIds: ["p1"] });
    await contexto("c1", "garantía estructura", { postIds: ["p1"] });
    const u = usos();
    expect(u).toHaveLength(1);
    expect(u[0].rutas).toContain("garantia");
    expect(u[0].rutas).not.toContain("sofas");
  });

  it("sólo cuando es para escribir textos: el equipo hablando con el asistente no atribuye nada", async () => {
    await contexto("c1", "sofás", { postIds: ["p1"], para: "chat" });
    await contexto("c1", "sofás", { postIds: ["p1"], para: "piezas" });
    expect(usos()).toEqual([]);
  });

  it("sin publicaciones, o sin notas encontradas, no se apunta nada", async () => {
    await contexto("c1", "sofás");
    await contexto("c1", "sofás", { postIds: [] });
    await contexto("c1", "zzzz nada que ver", { postIds: ["p1"] });
    expect(usos()).toEqual([]);
  });

  it("no se apunta basura: ids vacíos, kilométricos o repetidos, y no más de 40", async () => {
    await contexto("c1", "sofás", { postIds: ["", "x".repeat(300), "p1", "p1", ...Array.from({ length: 60 }, (_, i) => `q${i}`)] });
    const ids = usos().map((x) => x.post_id);
    expect(ids).not.toContain("");
    expect(ids.some((i) => i.length > 200)).toBe(false);
    expect(ids.filter((i) => i === "p1")).toHaveLength(1);
    expect(ids.length).toBeLessThanOrEqual(40);
  });

  it("cada cliente apunta lo suyo", async () => {
    await poner("c2", "Pañales", "Pañales hipoalergénicos de recién nacido.");
    await contexto("c1", "sofás", { postIds: ["p1"] });
    await contexto("c2", "pañales", { postIds: ["p1"] });
    expect(usos("c1")[0].rutas).toContain("sofas");
    expect(usos("c2")[0].rutas).toEqual(["panales"]);
  });

  it("si apuntarlo falla, el contexto sale igual", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.sqlite.exec("drop table cerebro_usos");
    const c = await contexto("c1", "sofás seccionales", { postIds: ["p1"] });
    expect(c.pasajes).toContain("espuma");
  });
});

describe("cuando el cliente pide cambios", () => {
  it("queda la señal con su motivo, y una nota con sus palabras que la IA puede encontrar", async () => {
    const res = await responder("p1", "cambios", { comentario: "No me gustan los emojis, es muy informal." });
    expect(res.status).toBe(200);
    const [s] = senales();
    expect(s).toMatchObject({ clave: "respuesta:p1", tipo: "respuesta", post_id: "p1", resultado: 0.2 });
    expect(s.resumen).toBe("Pidió cambios en «Publicación 1»: No me gustan los emojis, es muy informal.");
    expect(s.detalle).toMatchObject({ estado: "cambios", revisor: "Ana", publicacion: { titulo: "Publicación 1", formato: "reel" } });

    const [n] = notasAuto();
    expect(n).toMatchObject({ tipo: "decision", origen: "app", fuente: "respuesta:p1", interna: 0 });
    expect(n.texto).toContain("No me gustan los emojis");
    expect(n.created_at, "nace «sin tocar»").toBe(n.updated_at);

    const hallazgo = await buscar(env, acceso(), "c1", "emojis informal", { para: "texto" });
    expect(hallazgo[0].ruta).toBe(n.ruta);
  });

  it("aprobar sin decir nada deja la señal y ninguna nota", async () => {
    await responder("p1", "aprobado");
    expect(senales()).toHaveLength(1);
    expect(senales()[0].resultado).toBe(1);
    expect(notasAuto()).toEqual([]);
  });

  it("aprobar con un comentario deja las dos cosas", async () => {
    await responder("p1", "aprobado", { comentario: "Me encanta que salga el precio." });
    expect(senales()[0].resultado).toBe(1);
    expect(notasAuto()[0].titulo).toBe("Aprobó con un comentario: Publicación 1");
  });

  it("cambiar de opinión REEMPLAZA la señal: una publicación cuenta una vez, con lo último que dijo", async () => {
    await responder("p1", "cambios", { comentario: "más corto" });
    await responder("p1", "aprobado");
    const s = senales();
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ resultado: 1, resumen: "Aprobó «Publicación 1»" });
  });

  it("responder dos veces lo mismo no duplica ni la señal ni la nota", async () => {
    await responder("p1", "cambios", { comentario: "más corto" });
    await responder("p1", "cambios", { comentario: "más corto" });
    expect(senales()).toHaveLength(1);
    expect(notasAuto()).toHaveLength(1);
  });

  it("una respuesta con otro comentario reescribe la nota de esa publicación, en la misma ruta", async () => {
    await responder("p1", "cambios", { comentario: "más corto" });
    const antes = notasAuto()[0];
    await responder("p1", "cambios", { comentario: "sin emojis por favor" });
    const despues = notasAuto();
    expect(despues).toHaveLength(1);
    expect(despues[0].id).toBe(antes.id);
    expect(despues[0].ruta).toBe(antes.ruta);
    expect(despues[0].texto).toContain("sin emojis por favor");
    expect(despues[0].texto).not.toContain("más corto");
    expect(despues[0].created_at, "sigue «sin tocar»: la siguiente respuesta también puede reescribirla").toBe(despues[0].updated_at);
  });

  it("cada publicación tiene su señal y su nota", async () => {
    await responder("p1", "cambios", { comentario: "uno" });
    await responder("p2", "cambios", { comentario: "dos" });
    expect(senales().map((s) => s.post_id)).toEqual(["p1", "p2"]);
    expect(notasAuto()).toHaveLength(2);
    expect(new Set(notasAuto().map((n) => n.ruta)).size).toBe(2);
  });

  it("lo que una persona corrigió a mano MANDA: una respuesta nueva no la pisa", async () => {
    await responder("p1", "cambios", { comentario: "más corto" });
    const n = notasAuto()[0];
    await pedir(`/api/cerebro/c1/nota`, { method: "PUT", body: { id: n.id, titulo: n.titulo, texto: "La agencia lo resumió así: prefieren textos cortos.", tipo: "decision" } });
    await responder("p1", "cambios", { comentario: "y sin emojis" });
    expect(notasAuto()[0].texto).toBe("La agencia lo resumió así: prefieren textos cortos.");
  });

  it("no toca las notas que no son automáticas, aunque se llamen parecido", async () => {
    await poner("c1", "Pidió cambios: Publicación 1", "Una nota escrita a mano con el mismo título.");
    await responder("p1", "cambios", { comentario: "más corto" });
    const todas = db.sqlite.prepare("select titulo, origen, ruta from cerebro_notas where client_id = 'c1' and titulo like 'Pidió%'").all();
    expect(todas).toHaveLength(2);
    expect(new Set(todas.map((t) => t.ruta)).size).toBe(2);
    expect(todas.map((t) => t.origen).sort()).toEqual(["app", "manual"]);
  });

  it("una aprobación de algo que no es una publicación (una referencia visual) no enseña nada", async () => {
    db.sqlite.prepare("update calendars set visual_references = ? where id = 'cal1'").run(JSON.stringify([{ id: "ref1" }]));
    const res = await responder("ref1", "aprobado", { comentario: "me gusta" });
    expect(res.status).toBe(200);
    expect(senales()).toEqual([]);
    expect(notasAuto()).toEqual([]);
  });

  it("el cliente de otro calendario, con otro enlace, no puede dejar señales en este", async () => {
    const res = await worker.fetch(new Request("https://calendarios.test/api/publico/enlace-que-no-existe-0123456789/aprobacion", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: "p1", estado: "cambios", comentario: "x" }),
    }), env);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(senales()).toEqual([]);
  });

  it("si aprender falla, la respuesta del cliente entra igual y se le contesta bien", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.sqlite.exec("drop table cerebro_senales");
    const res = await responder("p1", "aprobado", { comentario: "bien" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, estado: "aprobado" });
    expect(db.sqlite.prepare("select estado from approvals where post_id = 'p1'").get()).toEqual({ estado: "aprobado" });
  });

  it("no hay más de 60 notas automáticas por cliente: se van las más viejas, y las corregidas a mano se quedan", async () => {
    sembrarCalendario("cal2", "c1", posts(MAX_AUTOMATICAS + 8, "m"), { mes: 10 });
    db.sqlite.prepare("update calendars set share_token = 'otro-enlace-publico-de-prueba-012345' where id = 'cal2'").run();
    const enOtro = (postId, comentario) => worker.fetch(new Request("https://calendarios.test/api/publico/otro-enlace-publico-de-prueba-012345/aprobacion", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, estado: "cambios", comentario }),
    }), env);
    for (let i = 1; i <= MAX_AUTOMATICAS + 8; i++) {
      await enOtro(`m${i}`, `comentario ${i}`);
      if (i === 1) {
        const n = notasAuto()[0];
        await pedir(`/api/cerebro/c1/nota`, { method: "PUT", body: { id: n.id, titulo: n.titulo, texto: "corregida a mano", tipo: "decision" } });
      }
    }
    const auto = notasAuto();
    expect(auto.length).toBeLessThanOrEqual(MAX_AUTOMATICAS + 1);
    expect(auto.some((n) => n.texto === "corregida a mano"), "la que una persona corrigió no se borra por vieja").toBe(true);
    expect(auto.some((n) => n.fuente === `respuesta:m${MAX_AUTOMATICAS + 8}`), "las más nuevas se quedan").toBe(true);
  });
});

describe("lo que el cliente escribe en la conversación", () => {
  it("se recoge en la nota de esa publicación, sin lo que contestó la agencia", async () => {
    await responder("p1", "cambios", { comentario: "más corto" });
    db.sqlite.prepare("insert into comentarios_aprobacion (id, calendar_id, post_id, autor, nombre, texto) values (?,?,?,?,?,?)")
      .run("k1", "cal1", "p1", "agencia", "Juan", "Lo acortamos hoy mismo, secreto interno de la agencia.");
    const res = await publico("/comentario", { postId: "p1", texto: "Gracias, y que salga el precio", nombre: "Ana" });
    expect(res.status).toBe(200);
    const [n] = notasAuto();
    expect(n.texto).toContain("Gracias, y que salga el precio");
    expect(n.texto).toContain("más corto");
    expect(n.texto).not.toContain("secreto interno");
  });

  it("un comentario sin haber respondido deja una nota de comentario, y ninguna señal", async () => {
    await publico("/comentario", { postId: "p2", texto: "¿Y el precio?", nombre: "Ana" });
    expect(senales()).toEqual([]);
    expect(notasAuto()[0].titulo).toBe("Comentó: Publicación 2");
  });
});

describe("los pesos que aprende", () => {
  const dado = async (postId, consulta) => contexto("c1", consulta, { postIds: [postId] });

  it("pedir cambios baja las notas que se usaron, y aprobar las sube", async () => {
    const malo = await dado("p1", "sofás seccionales espuma");
    const bueno = await dado("p2", "garantía estructura");
    await responder("p1", "cambios", { comentario: "no" });
    await responder("p2", "aprobado");
    const p = await pesos();
    for (const r of malo.fuentes) expect(p.notes[r].w, `«${r}» usada en lo que se devolvió`).toBeLessThan(0.5);
    for (const r of bueno.fuentes) expect(p.notes[r].w, `«${r}» usada en lo que se aprobó`).toBeGreaterThan(0.5);
  });

  it("cambiar de opinión no cuenta dos veces: cambios y luego aprobado pesa lo mismo que aprobado a secas", async () => {
    await dado("p1", "sofás seccionales");
    await responder("p1", "cambios", { comentario: "más corto" });
    await responder("p1", "aprobado");
    const conVueltas = (await pesos()).notes.sofas.w;

    // Otro cliente, mismo caso, sin dar vueltas.
    await poner("c2", "Sofás", "Los sofás seccionales llevan espuma de alta densidad.");
    sembrarCalendario("cal9", "c2", posts(1, "z"), { enlace: "enlace-del-otro-cliente-0123456789" });
    await contexto("c2", "sofás seccionales", { postIds: ["z1"] });
    await worker.fetch(new Request("https://calendarios.test/api/publico/enlace-del-otro-cliente-0123456789/aprobacion", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: "z1", estado: "aprobado" }),
    }), env);
    expect(conVueltas).toBeCloseTo((await pesos("c2")).notes.sofas.w, 9);
  });

  it("repetir la misma respuesta no mueve nada", async () => {
    await dado("p1", "sofás seccionales");
    await responder("p1", "aprobado");
    const una = JSON.stringify((await pesos()).notes);
    await responder("p1", "aprobado");
    expect(JSON.stringify((await pesos()).notes)).toBe(una);
  });

  it("dos notas usadas juntas en algo que se aprobó se refuerzan entre sí; en algo devuelto, no", async () => {
    await dado("p1", "sofás comedores garantía");
    await responder("p1", "aprobado");
    expect(Object.keys((await pesos()).edges).length).toBeGreaterThan(0);

    await poner("c2", "Uno", "Pañales de recién nacido hipoalergénicos.");
    await poner("c2", "Dos", "Pañales de talla grande con gel absorbente.");
    sembrarCalendario("cal9", "c2", posts(1, "z"), { enlace: "enlace-del-otro-cliente-0123456789" });
    await contexto("c2", "pañales", { postIds: ["z1"] });
    await worker.fetch(new Request("https://calendarios.test/api/publico/enlace-del-otro-cliente-0123456789/aprobacion", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: "z1", estado: "cambios", comentario: "no" }),
    }), env);
    expect(Object.keys((await pesos("c2")).edges)).toEqual([]);
  });

  it("una publicación de la que no se sabe qué notas usó (escrita antes) da señal pero no mueve pesos", async () => {
    await responder("p3", "cambios", { comentario: "no" });
    expect(senales()).toHaveLength(1);
    expect(db.sqlite.prepare("select count(*) as n from cerebro_memoria").get().n).toBe(0);
  });

  it("lo aprendido mueve la búsqueda un poco: entre dos notas idénticas gana la que no se usó en lo que se devolvió", async () => {
    await poner("c1", "Precio A", "El precio del sofá seccional incluye el envío.", { tipo: "marca" });
    await poner("c1", "Precio B", "El precio del sofá seccional incluye el envío.", { tipo: "marca" });
    const orden = async () => (await buscar(env, acceso(), "c1", "precio del sofá seccional", { para: "texto", n: 8 }))
      .map((r) => r.ruta).filter((r) => /^precio-/.test(r));
    const antes = await orden();
    const [primera, otra] = antes;
    // Lo que se le dio a la IA para escribir p1 fue sólo la que iba primera, y el cliente lo devolvió.
    db.sqlite.prepare("insert into cerebro_usos (id, owner_id, client_id, post_id, rutas) values (?,?,?,?,?)").run("c1:p1", JEFE, "c1", "p1", JSON.stringify([primera]));
    await responder("p1", "cambios", { comentario: "no" });
    expect(await orden(), "la que se usó en lo que se devolvió baja").toEqual([otra, primera]);
  });

  it("y sube la que se usó en lo que el cliente aprobó, sin desaparecer nunca de la búsqueda", async () => {
    await poner("c1", "Precio A", "El precio del sofá seccional incluye el envío.", { tipo: "marca" });
    await poner("c1", "Precio B", "El precio del sofá seccional incluye el envío.", { tipo: "marca" });
    const orden = async () => (await buscar(env, acceso(), "c1", "precio del sofá seccional", { para: "texto", n: 8 }))
      .map((r) => r.ruta).filter((r) => /^precio-/.test(r));
    const [primera, otra] = await orden();
    db.sqlite.prepare("insert into cerebro_usos (id, owner_id, client_id, post_id, rutas) values (?,?,?,?,?)").run("c1:p1", JEFE, "c1", "p1", JSON.stringify([otra]));
    await responder("p1", "aprobado");
    expect(await orden()).toEqual([otra, primera]);
    // Nada de lo aprendido esconde una nota: siguen apareciendo las dos.
    expect((await orden()).sort()).toEqual(["precio-a", "precio-b"]);
  });

  it("el factor de la búsqueda está entre 0,8 y 1,2, y sin nada aprendido no hay factor", async () => {
    expect(boostDe(await pesos())).toBeNull();
    await dado("p1", "sofás");
    await responder("p1", "aprobado");
    const f = boostDe(await pesos());
    for (const r of ["sofas", "comedores", "garantia", "no-existe"]) {
      expect(f(r)).toBeGreaterThanOrEqual(0.8);
      expect(f(r)).toBeLessThanOrEqual(1.2);
    }
    expect(f("sofas")).toBeGreaterThan(1);
  });

  it("la memoria de un cliente no se mezcla con la de otro", async () => {
    await dado("p1", "sofás");
    await responder("p1", "aprobado");
    expect((await pesos("c2")).notes).toEqual({});
  });
});

describe("el mapa enseña lo aprendido", () => {
  it("las notas con peso lo llevan, y los pares reforzados salen como sinapsis aprendidas", async () => {
    await contexto("c1", "sofás comedores garantía", { postIds: ["p1"] });
    await responder("p1", "aprobado");
    const g = await (await pedir("/api/cerebro/c1/grafo")).json();
    const sofas = g.notas.find((n) => n.ruta === "sofas");
    expect(sofas.peso).toBeGreaterThan(0.5);
    expect(g.aprendidas.length).toBeGreaterThan(0);
    for (const [i, j, w] of g.aprendidas) {
      expect(g.notas[i] && g.notas[j]).toBeTruthy();
      expect(w).toBeGreaterThanOrEqual(0.1);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it("sin nada aprendido, ningún peso y ninguna sinapsis dorada", async () => {
    const g = await (await pedir("/api/cerebro/c1/grafo")).json();
    expect(g.aprendidas).toEqual([]);
    expect(g.notas.every((n) => n.peso === null)).toBe(true);
  });
});

describe("aprender de lo que el cliente ya respondió", () => {
  function sembrarHistorial() {
    sembrarCalendario("cal2", "c1", posts(2, "h"), { mes: 8 });
    sembrarCalendario("cal3", "c1", posts(1, "g"), { mes: 7 });
    const a = db.sqlite.prepare("insert into approvals (id, calendar_id, post_id, estado, comentario, reviewer_name, updated_at) values (?,?,?,?,?,?,?)");
    a.run("a1", "cal2", "h1", "cambios", "Muy largo, acórtenlo", "Ana", "2026-09-10T10:00:00.000Z");
    a.run("a2", "cal2", "h2", "aprobado", "", "Ana", "2026-09-11T10:00:00.000Z");
    a.run("a3", "cal3", "g1", "cambios", "Sin emojis", "Ana", "2026-08-05T10:00:00.000Z");
    a.run("a4", "cal3", "fantasma", "aprobado", "de una publicación que ya no existe", "Ana", "2026-08-06T10:00:00.000Z");
    db.sqlite.prepare("insert into comentarios_aprobacion (id, calendar_id, post_id, autor, nombre, texto) values (?,?,?,?,?,?)")
      .run("k1", "cal2", "h1", "cliente", "Ana", "Y que salga el precio");
  }
  const historial = (desde = 0, cliente = "c1", quien = JEFE) => pedir(`/api/cerebro/${cliente}/aprender/historial`, { method: "POST", body: { desde } }, quien);

  it("deja una señal por respuesta y una nota por cada una que dijo algo", async () => {
    sembrarHistorial();
    const res = await historial();
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r).toMatchObject({ senales: 3, notas: { creadas: 2 }, siguiente: null });
    expect(senales().map((s) => s.clave)).toEqual(["respuesta:g1", "respuesta:h1", "respuesta:h2"]);
    expect(notasAuto().map((n) => n.fuente).sort()).toEqual(["respuesta:g1", "respuesta:h1"]);
    expect(notasAuto().find((n) => n.fuente === "respuesta:h1").texto).toContain("Y que salga el precio");
  });

  it("las respuestas de publicaciones que ya no existen se saltan", async () => {
    sembrarHistorial();
    await historial();
    expect(senales().some((s) => s.post_id === "fantasma")).toBe(false);
  });

  it("es idempotente: volver a pasarlo reemplaza, no duplica", async () => {
    sembrarHistorial();
    await historial();
    const r = await (await historial()).json();
    expect(r.senalesNuevas).toBe(0);
    expect(senales()).toHaveLength(3);
    expect(notasAuto()).toHaveLength(2);
    expect(r.notas).toMatchObject({ creadas: 0, actualizadas: 2 });
  });

  it("va de a pocos calendarios y dice por dónde seguir", async () => {
    for (let m = 0; m < 5; m++) sembrarCalendario(`x${m}`, "c1", posts(1, `x${m}-`), { mes: m });
    const uno = await (await historial(0)).json();
    expect(uno).toMatchObject({ calendarios: 3, siguiente: 3 });
    const dos = await (await historial(uno.siguiente)).json();
    expect(dos.siguiente).toBe(null);
    expect(uno.calendarios + dos.calendarios).toBe(uno.total);
  });

  it("NO mueve pesos: no se sabe qué notas se usaron para escribir lo de antes", async () => {
    sembrarHistorial();
    await historial();
    expect(db.sqlite.prepare("select count(*) as n from cerebro_memoria").get().n).toBe(0);
  });

  it("no toca el cerebro de otro cliente, y sólo lectura no puede", async () => {
    sembrarHistorial();
    await historial();
    expect(senales("c2")).toEqual([]);
    expect((await historial(0, "c1", COLAB)).status).toBe(403);
  });

  it("un cliente ajeno es «no encontrado»", async () => {
    expect((await historial(0, "no-existe")).status).toBe(404);
  });
});

describe("ver lo que ha pasado (/senales)", () => {
  it("lista las señales recientes con su línea legible, y se puede filtrar por clase", async () => {
    await responder("p1", "cambios", { comentario: "más corto" });
    await responder("p2", "aprobado");
    const todas = await (await pedir("/api/cerebro/c1/senales")).json();
    expect(todas.senales).toHaveLength(2);
    expect(todas.senales.map((s) => s.resumen).sort()).toEqual(["Aprobó «Publicación 2»", "Pidió cambios en «Publicación 1»: más corto"]);
    expect(todas.senales[0]).not.toHaveProperty("detalle");
    expect((await (await pedir("/api/cerebro/c1/senales?tipo=metricas")).json()).senales).toEqual([]);
  });

  it("sólo las del cliente, y con sesión", async () => {
    await responder("p1", "aprobado");
    expect((await (await pedir("/api/cerebro/c2/senales")).json()).senales).toEqual([]);
    expect((await worker.fetch(new Request("https://calendarios.test/api/cerebro/c1/senales"), env)).status).toBe(401);
  });
});
