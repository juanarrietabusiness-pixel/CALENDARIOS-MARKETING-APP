import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";

// ============================================================
// /api/cerebro, contra una D1 de verdad
//
// La base son las migraciones aplicadas en SQLite; R2 es de mentira pero
// guarda lo que se le pone. Lo que se comprueba, por orden de gravedad:
//
//   1. El cerebro de un cliente no se ve ni se toca desde otro espacio, ni
//      desde un colaborador que no lleva ese cliente.
//   2. El índice NO sale por /api/media: lleva las notas internas.
//   3. Lo interno no llega a un texto que se publica.
//   4. Las notas y el índice dicen lo mismo, también tras editar y borrar.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const COLAB = "u-colab";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra", [COLAB]: "t-colab" };

let db;
let env;

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const v = objetos.get(clave);
      return { text: async () => v, body: v, size: v.length, httpEtag: '"x"', writeHttpMetadata: () => {} };
    },
    async put(clave, valor) { objetos.set(clave, typeof valor === "string" ? valor : await new Response(valor).text()); },
    async delete(clave) { objetos.delete(clave); },
  };
}

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRA, "otra@b.com"], [COLAB, "colab@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#123456");
  // El colaborador es del espacio del jefe y sólo lleva c1.
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Colab", "#654321", '["c1"]');
  s.prepare("insert into clients (id, owner_id, name, github_repo) values (?,?,?,?)").run("c1", JEFE, "Dcasa", "https://github.com/x/y");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json", ...(opciones.headers ?? {}) },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

const poner = (quien, cliente, nota) => pedir(quien, `/api/cerebro/${cliente}/nota`, { method: "PUT", body: nota });
const nota = (titulo, texto, extra = {}) => ({ titulo, texto, ...extra });

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
});

describe("crear, leer, editar y borrar notas", () => {
  it("una nota nueva recibe su ruta, se lista con resumen y se lee entera", async () => {
    const res = await poner(JEFE, "c1", nota("Tono y voz", "# Tono\n\nCercano, de tú. Nunca versículos.", { tipo: "marca" }));
    expect(res.status).toBe(201);
    const creada = await res.json();
    expect(creada).toMatchObject({ ruta: "tono-y-voz", tipo: "marca", interna: false, origen: "manual" });

    const lista = await (await pedir(JEFE, "/api/cerebro/c1")).json();
    expect(lista.notas).toHaveLength(1);
    expect(lista.notas[0].resumen).toMatch(/Tono/);
    expect(lista.notas[0]).not.toHaveProperty("texto");
    expect(lista.estado).toMatchObject({ notas: 1, conFicha: false, internas: 0, repositorio: true });

    const entera = await (await pedir(JEFE, `/api/cerebro/c1/nota/${creada.id}`)).json();
    expect(entera.texto).toContain("Nunca versículos");
  });

  it("dos notas con el mismo título no chocan", async () => {
    const a = await (await poner(JEFE, "c1", nota("Precios", "uno"))).json();
    const b = await (await poner(JEFE, "c1", nota("Precios", "dos"))).json();
    expect([a.ruta, b.ruta]).toEqual(["precios", "precios-2"]);
  });

  it("editar conserva la ruta —los enlaces de otras notas dependen de ella— y cambia el texto", async () => {
    const a = await (await poner(JEFE, "c1", nota("Garantía", "Un año."))).json();
    const editada = await (await poner(JEFE, "c1", { ...nota("Garantía extendida", "Dos años."), id: a.id })).json();
    expect(editada.ruta).toBe("garantia");
    expect(editada.titulo).toBe("Garantía extendida");
    expect(editada.creada).toBe(a.creada);
    const lista = await (await pedir(JEFE, "/api/cerebro/c1")).json();
    expect(lista.notas).toHaveLength(1);
  });

  it("borrar quita la nota y su rastro del índice", async () => {
    const a = await (await poner(JEFE, "c1", nota("Garantía", "Dos años en toda la mueblería."))).json();
    const antes = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=garantía mueblería")).json();
    expect(antes.resultados[0].ruta).toBe("garantia");
    expect((await pedir(JEFE, `/api/cerebro/c1/nota/${a.id}`, { method: "DELETE" })).status).toBe(200);
    const despues = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=garantía mueblería")).json();
    expect(despues.resultados).toEqual([]);
    expect((await pedir(JEFE, `/api/cerebro/c1/nota/${a.id}`)).status).toBe(404);
  });

  it("una nota vacía, sin título o enorme se rechaza con el motivo", async () => {
    expect((await (await poner(JEFE, "c1", nota("", "algo"))).json()).error).toMatch(/título/);
    expect((await (await poner(JEFE, "c1", nota("x", "  "))).json()).error).toMatch(/vacía/);
    expect((await poner(JEFE, "c1", nota("x", "y".repeat(200_001)))).status).toBe(400);
  });

  it("un id que no es de este cliente no se edita", async () => {
    const a = await (await poner(JEFE, "c1", nota("Solo de c1", "texto"))).json();
    const res = await poner(JEFE, "c2", { ...nota("Robada", "otro"), id: a.id });
    expect(res.status).toBe(404);
    expect((await (await pedir(JEFE, `/api/cerebro/c1/nota/${a.id}`)).json()).texto).toBe("texto");
  });
});

describe("cada cliente tiene su cerebro", () => {
  it("las notas de un cliente no aparecen en el otro, ni en la lista ni en la búsqueda", async () => {
    await poner(JEFE, "c1", nota("Sofás", "Los sofás de Dcasa tienen garantía de dos años."));
    await poner(JEFE, "c2", nota("Pañales", "Los pañales de Baby Caleb son hipoalergénicos."));
    const c1 = await (await pedir(JEFE, "/api/cerebro/c1")).json();
    const c2 = await (await pedir(JEFE, "/api/cerebro/c2")).json();
    expect(c1.notas.map((n) => n.titulo)).toEqual(["Sofás"]);
    expect(c2.notas.map((n) => n.titulo)).toEqual(["Pañales"]);
    const busca = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=pañales hipoalergénicos")).json();
    expect(busca.resultados).toEqual([]);
  });

  it("dos clientes pueden tener una nota con la misma ruta: cada índice es el suyo", async () => {
    const a = await (await poner(JEFE, "c1", nota("Tono", "Cercano y de tú."))).json();
    const b = await (await poner(JEFE, "c2", nota("Tono", "Formal, de usted."))).json();
    expect(a.ruta).toBe(b.ruta);
    const r1 = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=tono cercano")).json();
    const r2 = await (await pedir(JEFE, "/api/cerebro/c2/buscar?q=tono formal usted")).json();
    expect(r1.resultados[0].pasajes[0]).toContain("Cercano");
    expect(r2.resultados[0].pasajes[0]).toContain("usted");
    expect([...env.MEDIA.objetos.keys()].sort()).toEqual(["cerebro/c1/indice.json", "cerebro/c2/indice.json"]);
  });

  it("el cerebro de un cliente de OTRO espacio no se ve, no se escribe y no se borra: es «no encontrado»", async () => {
    await poner(OTRA, "c9", nota("Secreto", "Cosa de la otra agencia."));
    const ajena = await db.sqlite.prepare("select id from cerebro_notas").get();
    for (const [ruta, metodo, body] of [
      ["/api/cerebro/c9", "GET"],
      [`/api/cerebro/c9/nota/${ajena.id}`, "GET"],
      ["/api/cerebro/c9/nota", "PUT", nota("Colada", "x")],
      [`/api/cerebro/c9/nota/${ajena.id}`, "DELETE"],
      ["/api/cerebro/c9/buscar?q=secreto", "GET"],
      ["/api/cerebro/c9/contexto", "POST", { consulta: "secreto" }],
      ["/api/cerebro/c9/reindexar", "POST", {}],
    ]) {
      const res = await pedir(JEFE, ruta, { method: metodo, body });
      expect(res.status, `${metodo} ${ruta}`).toBe(404);
    }
    expect(await db.sqlite.prepare("select count(*) as n from cerebro_notas").get()).toEqual({ n: 1 });
  });

  it("un colaborador ve y edita sólo el cerebro de SUS clientes", async () => {
    await poner(JEFE, "c2", nota("De c2", "Un cliente que el colaborador no lleva."));
    expect((await poner(COLAB, "c1", nota("Suya", "Nota de su cliente"))).status).toBe(201);
    expect((await pedir(COLAB, "/api/cerebro/c1")).status).toBe(200);
    for (const [ruta, metodo, body] of [
      ["/api/cerebro/c2", "GET"],
      ["/api/cerebro/c2/nota", "PUT", nota("Colada", "x")],
      ["/api/cerebro/c2/buscar?q=cliente", "GET"],
    ]) {
      expect((await pedir(COLAB, ruta, { method: metodo, body })).status, `${metodo} ${ruta}`).toBe(404);
    }
  });

  it("sin sesión no hay nada", async () => {
    const res = await worker.fetch(new Request("https://calendarios.test/api/cerebro/c1"), env);
    expect(res.status).toBe(401);
  });
});

describe("el índice no sale por /api/media", () => {
  it("vive fuera del prefijo clientes/ y esa ruta no lo alcanza, ni para leerlo ni para borrarlo", async () => {
    await poner(JEFE, "c1", nota("Costos", "El costo del pañal es de nueve dólares.", { interna: true }));
    const clave = "cerebro/c1/indice.json";
    expect(env.MEDIA.objetos.has(clave)).toBe(true);
    for (const metodo of ["GET", "DELETE"]) {
      const res = await pedir(JEFE, `/api/media/${clave}`, { method: metodo });
      expect(res.status, `${metodo} /api/media/${clave}`).toBe(404);
    }
    expect(env.MEDIA.objetos.has(clave), "se borró por la ruta de las imágenes").toBe(true);
  });
});

describe("lo interno no llega a un texto que se publica", () => {
  beforeEach(async () => {
    await poner(JEFE, "c1", nota("Precios", "El pañal de recién nacido cuesta cincuenta dólares.", { tipo: "marca" }));
    await poner(JEFE, "c1", nota("Economía unitaria", "El costo del pañal de recién nacido es de nueve dólares y el margen es alto.", { interna: true }));
    await poner(JEFE, "c1", nota("Plantillas", "Plantilla A: pañal sobre fondo azul con el precio del pañal en grande.", { tipo: "maquetacion" }));
  });
  const titulos = (r) => r.resultados.map((x) => x.titulo).sort();

  it("para texto: sin internas y sin maquetación", async () => {
    const r = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=pañal recién nacido&para=texto")).json();
    expect(titulos(r)).toEqual(["Precios"]);
  });

  it("para piezas: con la maquetación, sin internas", async () => {
    const r = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=pañal recién nacido&para=piezas")).json();
    expect(titulos(r)).toEqual(["Plantillas", "Precios"]);
  });

  it("para el chat del equipo: todo", async () => {
    const r = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=pañal recién nacido&para=chat")).json();
    expect(titulos(r)).toEqual(["Economía unitaria", "Plantillas", "Precios"]);
  });

  it("el contexto para texto tampoco la trae, ni como pasaje ni como «relacionada»", async () => {
    const c = await (await pedir(JEFE, "/api/cerebro/c1/contexto", { method: "POST", body: { consulta: "pañal recién nacido", para: "texto" } })).json();
    expect(c.pasajes).toContain("cincuenta dólares");
    expect(c.pasajes).not.toContain("nueve dólares");
    expect(c.pasajes).not.toContain("Plantilla A");
    expect(c.fuentes).not.toContain("economia-unitaria");
  });

  it("un valor de «para» inventado se trata como texto, la opción más estricta", async () => {
    const r = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=pañal recién nacido&para=todo")).json();
    expect(titulos(r)).toEqual(["Precios"]);
  });
});

describe("el contexto de una tarea", () => {
  it("la ficha y las cifras van siempre; los pasajes, los que la tarea necesita", async () => {
    await poner(JEFE, "c1", nota("Ficha técnica", "Dcasa: muebles y hogar en Panamá. Tono cercano.", { tipo: "ficha" }));
    await poner(JEFE, "c1", nota("Cifras vigentes", "Envío gratis desde 300 dólares. Garantía: 2 años.", { tipo: "cifras" }));
    await poner(JEFE, "c1", nota("Sofás", "Los sofás seccionales tienen espuma de alta densidad."));
    await poner(JEFE, "c1", nota("Comedores", "Los comedores de roble macizo se entregan armados."));
    const c = await (await pedir(JEFE, "/api/cerebro/c1/contexto", { method: "POST", body: { consulta: "sofás seccionales" } })).json();
    expect(c.ficha).toContain("muebles y hogar");
    expect(c.cifras).toContain("Envío gratis");
    expect(c.pasajes).toContain("espuma");
    expect(c.pasajes).not.toContain("roble macizo");
    expect(c.fuentes).toContain("sofas");
    // La ficha y las cifras no compiten en la búsqueda: no se repiten en los pasajes.
    expect(c.fuentes).not.toContain("ficha-tecnica");
  });

  it("nunca pasa del presupuesto que se le pide", async () => {
    for (let i = 0; i < 12; i++) await poner(JEFE, "c1", nota(`Tema ${i}`, `Sofá número ${i}. ` + `párrafo distinto ${i} `.repeat(60)));
    const c = await (await pedir(JEFE, "/api/cerebro/c1/contexto", { method: "POST", body: { consulta: "sofá", presupuesto: 1500 } })).json();
    expect(c.pasajes.length).toBeLessThanOrEqual(1500);
  });

  it("un cliente sin notas devuelve un contexto vacío, no un error", async () => {
    const c = await (await pedir(JEFE, "/api/cerebro/c2/contexto", { method: "POST", body: { consulta: "lo que sea" } })).json();
    expect(c).toEqual({ ficha: "", cifras: "", pasajes: "", fuentes: [], notas: 0 });
  });
});

describe("el índice y las notas dicen lo mismo", () => {
  it("un índice que falta se reconstruye solo al buscar", async () => {
    await poner(JEFE, "c1", nota("Garantía", "Dos años en toda la mueblería."));
    env.MEDIA.objetos.clear();
    const r = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=garantía")).json();
    expect(r.resultados[0].ruta).toBe("garantia");
    expect(env.MEDIA.objetos.has("cerebro/c1/indice.json")).toBe(true);
  });

  it("un índice roto o de otra versión también se reconstruye", async () => {
    await poner(JEFE, "c1", nota("Garantía", "Dos años en toda la mueblería."));
    env.MEDIA.objetos.set("cerebro/c1/indice.json", "{esto no es json");
    expect((await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=garantía")).json()).resultados[0].ruta).toBe("garantia");
    env.MEDIA.objetos.set("cerebro/c1/indice.json", JSON.stringify({ v: 99 }));
    expect((await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=garantía")).json()).resultados[0].ruta).toBe("garantia");
  });

  it("reindexar devuelve lo mismo que dejan las ediciones una a una", async () => {
    await poner(JEFE, "c1", nota("Uno", "Sofás seccionales de espuma."));
    await poner(JEFE, "c1", nota("Dos", "Comedores de roble macizo."));
    const a = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=roble macizo")).json();
    await pedir(JEFE, "/api/cerebro/c1/reindexar", { method: "POST", body: {} });
    const b = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=roble macizo")).json();
    expect(b).toEqual(a);
  });

  it("buscar sin nada que buscar es un error claro", async () => {
    const res = await pedir(JEFE, "/api/cerebro/c1/buscar?q=%20");
    expect(res.status).toBe(400);
  });
});

describe("papeles", () => {
  it("sólo lectura puede mirar y buscar, y no escribir", async () => {
    db.sqlite.prepare("update memberships set solo_lectura = 1, rol = 'editor' where user_id = ?").run(COLAB);
    await poner(JEFE, "c1", nota("Garantía", "Dos años."));
    expect((await pedir(COLAB, "/api/cerebro/c1")).status).toBe(200);
    expect((await pedir(COLAB, "/api/cerebro/c1/buscar?q=garantía")).status).toBe(200);
    expect((await poner(COLAB, "c1", nota("Nueva", "x"))).status).toBe(403);
  });
});

// ============================================================
// Lo que salió de la revisión
// ============================================================

const paquete = () => JSON.parse(env.MEDIA.objetos.get("cerebro/c1/indice.json"));

describe("la lista no lee el texto de las notas", () => {
  it("listar y crear pasan por columnas concretas, nunca por «select *» de las notas", async () => {
    await poner(JEFE, "c1", nota("Sofás", "# Sofás\n\nSeccionales de espuma de alta densidad."));
    const sqls = [];
    const original = db.prepare.bind(db);
    db.prepare = (sql) => { sqls.push(sql); return original(sql); };
    await pedir(JEFE, "/api/cerebro/c1");
    await poner(JEFE, "c1", nota("Comedores", "Roble macizo."));
    const deNotas = sqls.filter((q) => /cerebro_notas/.test(q) && /^select/.test(q));
    expect(deNotas.length).toBeGreaterThan(0);
    expect(deNotas.filter((q) => /^select \*/.test(q)), "listar o crear no necesita el texto de las demás").toEqual([]);
  });

  it("aun así la lista trae el resumen y el tamaño de cada nota, guardados al escribirla", async () => {
    await poner(JEFE, "c1", nota("Sofás", "# Sofás\n\nSeccionales de espuma de alta densidad. Precio: $450."));
    const fila = db.sqlite.prepare("select resumen, caracteres, texto from cerebro_notas").get();
    expect(fila.caracteres).toBe(fila.texto.length);
    expect(fila.resumen).toMatch(/Sofás/);
    const lista = await (await pedir(JEFE, "/api/cerebro/c1")).json();
    expect(lista.notas[0]).toMatchObject({ caracteres: fila.texto.length, resumen: fila.resumen });
    expect(lista.estado.caracteres).toBe(fila.texto.length);
  });

  it("editar recalcula el resumen y el tamaño", async () => {
    const a = await (await poner(JEFE, "c1", nota("Garantía", "Un año."))).json();
    await poner(JEFE, "c1", { ...nota("Garantía", "# Garantía\n\nDos años en toda la mueblería, sin letra chica."), id: a.id });
    const fila = db.sqlite.prepare("select resumen, caracteres, texto from cerebro_notas").get();
    expect(fila.caracteres).toBe(fila.texto.length);
    expect(fila.resumen).toMatch(/Dos años/);
  });
});

describe("buscar encuentra también la ficha y las cifras", () => {
  beforeEach(async () => {
    await poner(JEFE, "c1", nota("Ficha técnica", "Dcasa: muebles y hogar en Panamá. Atiende por WhatsApp.", { tipo: "ficha" }));
    await poner(JEFE, "c1", nota("Cifras vigentes", "- Envío gratis desde 300 dólares.\n- Garantía: 2 años.", { tipo: "cifras" }));
  });

  it("quien busca (el buscador, el asistente, Claude por MCP) no las recibe de ningún otro lado", async () => {
    const r = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=envío gratis garantía&para=chat")).json();
    expect(r.resultados.map((x) => x.tipo)).toContain("cifras");
    const f = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=whatsapp panamá&para=texto")).json();
    expect(f.resultados.map((x) => x.tipo)).toContain("ficha");
  });

  it("el contexto sigue poniéndolas aparte y no las repite entre los pasajes", async () => {
    const c = await (await pedir(JEFE, "/api/cerebro/c1/contexto", { method: "POST", body: { consulta: "envío gratis garantía whatsapp" } })).json();
    expect(c.cifras).toContain("Envío gratis");
    expect(c.ficha).toContain("muebles y hogar");
    expect(c.fuentes).not.toContain("cifras-vigentes");
    expect(c.fuentes).not.toContain("ficha-tecnica");
  });
});

describe("«notas» del contexto cuenta lo que le sirve a ese uso", () => {
  it("un cerebro con todo interno no sirve para escribir textos, y sí para el equipo", async () => {
    await poner(JEFE, "c1", nota("Costos", "El costo del pañal es de nueve dólares.", { interna: true }));
    const cuerpo = (para) => ({ method: "POST", body: { consulta: "costo", para } });
    expect((await (await pedir(JEFE, "/api/cerebro/c1/contexto", cuerpo("texto"))).json()).notas).toBe(0);
    expect((await (await pedir(JEFE, "/api/cerebro/c1/contexto", cuerpo("chat"))).json()).notas).toBe(1);
  });
});

describe("el índice detecta que se quedó atrás", () => {
  it("una nota que el índice perdió (dos escrituras a la vez) reaparece en la siguiente lectura", async () => {
    await poner(JEFE, "c1", nota("Sofás", "Sofás seccionales de espuma."));
    const conUna = env.MEDIA.objetos.get("cerebro/c1/indice.json");
    await poner(JEFE, "c1", nota("Comedores", "Comedores de roble macizo."));
    // La otra escritura leyó el índice antes de que entrara «Comedores» y lo escribió después: se lo lleva por delante.
    env.MEDIA.objetos.set("cerebro/c1/indice.json", conUna);
    const r = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=roble macizo")).json();
    expect(r.resultados[0]?.ruta).toBe("comedores");
    expect(Object.keys(paquete().meta).sort()).toEqual(["comedores", "sofas"]);
  });

  it("una nota editada cuyo índice conserva el texto de antes también se corrige", async () => {
    const a = await (await poner(JEFE, "c1", nota("Garantía", "Un año de garantía."))).json();
    const viejo = env.MEDIA.objetos.get("cerebro/c1/indice.json");
    await poner(JEFE, "c1", { ...nota("Garantía", "Cinco años de garantía extendida."), id: a.id });
    env.MEDIA.objetos.set("cerebro/c1/indice.json", viejo);
    const r = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=extendida")).json();
    expect(r.resultados[0]?.pasajes[0]).toContain("extendida");
  });

  it("marcar una nota como interna también es un cambio que el índice tiene que ver", async () => {
    const a = await (await poner(JEFE, "c1", nota("Costos", "El costo del pañal es nueve dólares."))).json();
    const antes = env.MEDIA.objetos.get("cerebro/c1/indice.json");
    await poner(JEFE, "c1", { ...nota("Costos", "El costo del pañal es nueve dólares.", { interna: true }), id: a.id });
    // Aunque el índice volviera a decir «no interna», la lectura lo detecta y no lo cuela en un texto.
    env.MEDIA.objetos.set("cerebro/c1/indice.json", antes);
    const r = await (await pedir(JEFE, "/api/cerebro/c1/buscar?q=costo pañal&para=texto")).json();
    expect(r.resultados).toEqual([]);
  });

  it("un índice sin cambios no se reconstruye en cada lectura", async () => {
    await poner(JEFE, "c1", nota("Sofás", "Sofás seccionales de espuma."));
    const escrituras = [];
    const put = env.MEDIA.put.bind(env.MEDIA);
    env.MEDIA.put = async (...a) => { escrituras.push(a[0]); return put(...a); };
    await pedir(JEFE, "/api/cerebro/c1/buscar?q=sofás");
    await pedir(JEFE, "/api/cerebro/c1/buscar?q=espuma");
    expect(escrituras).toEqual([]);
  });
});

describe("el grafo se calcula al usarlo, no en cada edición", () => {
  it("editar deja el grafo pendiente; el primer contexto lo calcula y lo guarda", async () => {
    await poner(JEFE, "c1", nota("Sofás", "Sobre los sofás: ver [[comedores]] para combinar."));
    await poner(JEFE, "c1", nota("Comedores", "Los comedores combinan con los sofás."));
    expect(paquete().aristas, "una edición no recalcula el grafo entero").toBeNull();
    await pedir(JEFE, "/api/cerebro/c1/contexto", { method: "POST", body: { consulta: "sofás" } });
    expect(paquete().aristas.length).toBeGreaterThan(0);
  });

  it("el grafo guardado al usarlo es el mismo que deja reindexar", async () => {
    await poner(JEFE, "c1", nota("Sofás", "Sobre los sofás: ver [[comedores]] para combinar."));
    await poner(JEFE, "c1", nota("Comedores", "Los comedores combinan con los sofás."));
    await pedir(JEFE, "/api/cerebro/c1/contexto", { method: "POST", body: { consulta: "sofás" } });
    const perezoso = paquete().aristas;
    await pedir(JEFE, "/api/cerebro/c1/reindexar", { method: "POST", body: {} });
    expect(paquete().aristas).toEqual(perezoso);
  });

  it("la vecina de la mejor nota llega al contexto gracias al grafo calculado", async () => {
    await poner(JEFE, "c1", nota("Sofás", "Los sofás seccionales llevan espuma. Combinan con los [[comedores]]."));
    await poner(JEFE, "c1", nota("Comedores", "Roble macizo, entregados armados."));
    const c = await (await pedir(JEFE, "/api/cerebro/c1/contexto", { method: "POST", body: { consulta: "espuma seccionales" } })).json();
    expect(c.fuentes).toEqual(expect.arrayContaining(["sofas", "comedores"]));
  });
});

describe("borrar un cliente borra su índice", () => {
  it("el índice del cerebro no se queda en R2 con las notas internas dentro", async () => {
    await poner(JEFE, "c1", nota("Costos", "El costo del pañal es nueve dólares.", { interna: true }));
    expect(env.MEDIA.objetos.has("cerebro/c1/indice.json")).toBe(true);
    const res = await pedir(JEFE, "/api/clientes/c1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(env.MEDIA.objetos.has("cerebro/c1/indice.json")).toBe(false);
    expect(db.sqlite.prepare("select count(*) as n from cerebro_notas").get()).toEqual({ n: 0 });
  });

  it("un fallo de R2 no impide borrar al cliente", async () => {
    await poner(JEFE, "c1", nota("Sofás", "Sofás."));
    env.MEDIA.delete = async () => { throw new Error("R2 caído"); };
    expect((await pedir(JEFE, "/api/clientes/c1", { method: "DELETE" })).status).toBe(204);
  });

  it("el índice de OTRO cliente no se toca", async () => {
    await poner(JEFE, "c1", nota("Sofás", "Sofás."));
    await poner(JEFE, "c2", nota("Pañales", "Pañales."));
    await pedir(JEFE, "/api/clientes/c1", { method: "DELETE" });
    expect([...env.MEDIA.objetos.keys()]).toEqual(["cerebro/c2/indice.json"]);
  });
});

describe("el mapa del cerebro (/grafo)", () => {
  const grafoDe = async (quien = JEFE, cliente = "c1") => (await pedir(quien, `/api/cerebro/${cliente}/grafo`)).json();

  it("un cliente sin notas devuelve un mapa vacío, no un error", async () => {
    expect(await grafoDe(JEFE, "c2")).toEqual({ notas: [], enlaces: [], menciones: [] });
  });

  it("las notas vienen SIN texto, con su grupo, su tipo y su candado", async () => {
    await poner(JEFE, "c1", nota("Costos", "El costo del pañal es nueve dólares. Margen alto.", { interna: true, tipo: "documento" }));
    await poner(JEFE, "c1", nota("Tono y voz", "# Tono\n\nCercano, de tú.", { tipo: "marca" }));
    const g = await grafoDe();
    expect(g.notas).toHaveLength(2);
    for (const n of g.notas) {
      expect(n).not.toHaveProperty("texto");
      expect(n).toMatchObject({ id: expect.any(String), ruta: expect.any(String), grupo: "Escritas a mano", d: 0 });
    }
    const costos = g.notas.find((n) => n.ruta === "costos");
    expect(costos).toMatchObject({ interna: true, tipo: "documento", caracteres: expect.any(Number) });
    expect(JSON.stringify(g), "el texto entero no viaja: sólo el resumen").not.toContain("Margen alto.");
  });

  it("un [[enlace]] es un enlace y un nombre sin enlazar es una mención; cada nota cuenta las conexiones que toca", async () => {
    await poner(JEFE, "c1", nota("Ficha técnica", "Dcasa vende muebles. Ver [[sofas]] y [[comedores]].", { tipo: "ficha" }));
    await poner(JEFE, "c1", nota("Sofás", "Sofás seccionales. Combinan con la garantía extendida."));
    await poner(JEFE, "c1", nota("Comedores", "Roble macizo."));
    await poner(JEFE, "c1", nota("Garantía extendida", "Cinco años."));
    const g = await grafoDe();
    const i = (ruta) => g.notas.findIndex((n) => n.ruta === ruta);
    const par = (a, b) => ([x, y]) => (x === i(a) && y === i(b)) || (x === i(b) && y === i(a));
    expect(g.enlaces.some(par("ficha-tecnica", "sofas"))).toBe(true);
    expect(g.enlaces.some(par("ficha-tecnica", "comedores"))).toBe(true);
    expect(g.menciones.some(par("sofas", "garantia-extendida"))).toBe(true);
    expect(g.enlaces).toHaveLength(2);
    expect(g.notas[i("ficha-tecnica")].d, "dos enlaces").toBe(2);
    expect(g.notas[i("sofas")].d, "un enlace y una mención").toBe(2);
    expect(g.notas[i("comedores")].d).toBe(1);
  });

  it("la ficha y las cifras van juntas en su lóbulo; las importadas, por archivo", async () => {
    await poner(JEFE, "c1", nota("Ficha técnica", "Quién es.", { tipo: "ficha" }));
    await poner(JEFE, "c1", nota("Cifras vigentes", "- Envío gratis.", { tipo: "cifras" }));
    await poner(JEFE, "c1", { ...nota("Tono", "Cercano.", { tipo: "marca" }), fuente: "Dcasa/01_ADN_y_Memoria/01_brand_guidelines.md", origen: "repositorio" });
    const g = await grafoDe();
    const grupo = (ruta) => g.notas.find((n) => n.ruta === ruta).grupo;
    expect(grupo("ficha-tecnica")).toBe("Ficha y cifras");
    expect(grupo("cifras-vigentes")).toBe("Ficha y cifras");
    expect(grupo("tono")).toBe("Brand guidelines");
  });

  it("las conexiones de una nota borrada desaparecen; los índices siguen apuntando a notas que existen", async () => {
    const a = await (await poner(JEFE, "c1", nota("Ficha técnica", "Ver [[sofas]] y [[comedores]].", { tipo: "ficha" }))).json();
    await poner(JEFE, "c1", nota("Sofás", "Sofás."));
    await poner(JEFE, "c1", nota("Comedores", "Comedores."));
    const s = (await grafoDe()).notas.find((n) => n.ruta === "sofas");
    await pedir(JEFE, `/api/cerebro/c1/nota/${s.id}`, { method: "DELETE" });
    const g = await grafoDe();
    expect(g.notas.map((n) => n.ruta).sort()).toEqual(["comedores", "ficha-tecnica"]);
    expect(g.enlaces).toHaveLength(1);
    for (const [x, y] of [...g.enlaces, ...g.menciones]) expect(g.notas[x] && g.notas[y]).toBeTruthy();
    expect(a.ruta).toBe("ficha-tecnica");
  });

  it("si el índice se quedó atrás, se reconstruye y el mapa sale bien igual", async () => {
    await poner(JEFE, "c1", nota("Ficha técnica", "Ver [[sofas]].", { tipo: "ficha" }));
    await poner(JEFE, "c1", nota("Sofás", "Sofás."));
    env.MEDIA.objetos.set("cerebro/c1/indice.json", "{roto");
    expect((await grafoDe()).enlaces).toHaveLength(1);
  });

  it("el grafo de un cliente de otro espacio, o de otro colaborador, es «no encontrado»; sin sesión, 401; sólo lectura puede mirar", async () => {
    await poner(OTRA, "c9", nota("Secreto", "Cosa de la otra agencia."));
    await poner(JEFE, "c2", nota("De c2", "Un cliente que el colaborador no lleva."));
    expect((await pedir(JEFE, "/api/cerebro/c9/grafo")).status).toBe(404);
    expect((await pedir(COLAB, "/api/cerebro/c2/grafo")).status).toBe(404);
    expect((await pedir(COLAB, "/api/cerebro/c1/grafo")).status).toBe(200);
    expect((await worker.fetch(new Request("https://calendarios.test/api/cerebro/c1/grafo"), env)).status).toBe(401);
    db.sqlite.prepare("update memberships set solo_lectura = 1, rol = 'editor' where user_id = ?").run(COLAB);
    expect((await pedir(COLAB, "/api/cerebro/c1/grafo")).status).toBe(200);
  });

  it("no mezcla las notas de un cliente con las de otro del mismo espacio", async () => {
    await poner(JEFE, "c1", nota("Sofás", "Sofás de Dcasa."));
    await poner(JEFE, "c2", nota("Pañales", "Pañales de Baby Caleb."));
    expect((await grafoDe(JEFE, "c1")).notas.map((n) => n.ruta)).toEqual(["sofas"]);
    expect((await grafoDe(JEFE, "c2")).notas.map((n) => n.ruta)).toEqual(["panales"]);
  });
});
