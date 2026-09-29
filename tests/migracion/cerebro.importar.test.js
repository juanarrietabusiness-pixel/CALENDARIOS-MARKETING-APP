import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { RAIZ, hayWorkspace } from "../../src/lib/workspace.test-helper.js";

// ============================================================
// Llenar el cerebro desde el repositorio, con un GitHub de mentira
//
// GitHub contesta como GitHub —un árbol y blobs en base64, cada cosa una
// petición—; la base es la D1 de verdad. Lo que importa:
//
//   · Volver a importar no descarga ni duplica lo que no cambió.
//   · Una importación NO pisa lo que alguien corrigió a mano.
//   · Se respeta el límite de peticiones de una invocación.
//   · Los costos de Baby Caleb quedan internos y su precio de venta no.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;
let repo;
let llamadas;

const hueca = (t) => `sha-${[...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}-${t.length}`;

/** GitHub de mentira con estos archivos { ruta: texto }. */
function github(archivos) {
  repo = { ...archivos };
  llamadas = [];
  vi.stubGlobal("fetch", async (entrada) => {
    const u = new URL(String(entrada));
    llamadas.push(u.pathname);
    if (u.pathname.endsWith("/git/trees/HEAD")) {
      return Response.json({
        truncated: false,
        tree: Object.entries(repo).map(([path, texto]) => ({ path, type: "blob", sha: hueca(texto), size: Buffer.byteLength(texto) })),
      });
    }
    const m = /\/git\/blobs\/(.+)$/.exec(u.pathname);
    if (m) {
      const e = Object.entries(repo).find(([, t]) => hueca(t) === m[1]);
      return e ? Response.json({ encoding: "base64", content: Buffer.from(e[1]).toString("base64") }) : new Response("no", { status: 404 });
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}

const blobs = () => llamadas.filter((p) => p.includes("/git/blobs/")).length;

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) { return objetos.has(clave) ? { text: async () => objetos.get(clave) } : null; },
    async put(clave, valor) { objetos.set(clave, String(valor)); },
    async delete(clave) { objetos.delete(clave); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

const importar = (body = {}) => pedir("/api/cerebro/c1/importar", { method: "POST", body });
const notas = () => db.sqlite.prepare("select * from cerebro_notas order by ruta").all().map((n) => ({ ...n }));

const GUIAS = "# Manual de marca\n\nTono cercano.\n\n## Tono\n\nCercano, de tú. Nunca versículos.\n\n## Límites\n\nNo mencionar la competencia.\n";
const PERSONAS = "# Personas\n\n## Mamá primeriza\n\nBusca algo suave para la piel del bebé.\n";

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), GITHUB_TOKEN: "tk", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, github_repo, github_folder) values (?,?,?,?,?)")
    .run("c1", JEFE, "Dcasa", "https://github.com/x/y", "Dcasa/01_ADN_y_Memoria");
});
afterEach(() => vi.unstubAllGlobals());

describe("la primera importación", () => {
  beforeEach(() => github({
    "Dcasa/01_ADN_y_Memoria/01_brand_guidelines.md": GUIAS,
    "Dcasa/01_ADN_y_Memoria/02_buyer_personas.md": PERSONAS,
    "Dcasa/01_ADN_y_Memoria/Assets_Visuales_Base/logo.png": "no-es-texto",
    "Dcasa/06_Assets_Brutos_Solo_Lectura/notas.md": "# no se lee",
    "Otro/01_ADN_y_Memoria/01_brand_guidelines.md": "# de otro cliente",
  }));

  it("lee la carpeta de la ficha y parte cada archivo en notas", async () => {
    const res = await importar();
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.archivos).toMatchObject({ nuevos: 2, cambiados: 0, iguales: 0, omitidos: 0 });
    const n = notas();
    expect(n.map((x) => x.titulo).sort()).toEqual(["Brand guidelines — Límites", "Brand guidelines — Tono", "Buyer personas — Mamá primeriza", "Manual de marca", "Personas"].sort());
    expect(n.every((x) => x.origen === "repositorio" && x.client_id === "c1")).toBe(true);
    expect(n.find((x) => x.titulo === "Brand guidelines — Tono")).toMatchObject({ tipo: "marca", interna: 0, fuente: "Dcasa/01_ADN_y_Memoria/01_brand_guidelines.md" });
  });

  it("no lee lo que está fuera de la carpeta del cliente, ni imágenes, ni la carpeta de assets", async () => {
    await importar();
    expect(blobs(), "sólo los dos .md de la carpeta").toBe(2);
    expect(notas().some((x) => /de otro cliente|no se lee/.test(x.texto))).toBe(false);
  });

  it("deja el índice hecho y la búsqueda funciona", async () => {
    await importar();
    expect(env.MEDIA.objetos.has("cerebro/c1/indice.json")).toBe(true);
    const r = await (await pedir("/api/cerebro/c1/buscar?q=versículos&para=texto")).json();
    expect(r.resultados[0].titulo).toBe("Brand guidelines — Tono");
  });

  it("toda nota importada nace «sin tocar»: creada y actualizada en el mismo instante", async () => {
    // Es lo que distingue, en una nueva importación, lo que alguien corrigió de lo que no.
    await importar();
    expect(notas().every((n) => n.created_at === n.updated_at)).toBe(true);
  });

  it("usa la carpeta que se le pide en vez de la de la ficha", async () => {
    const r = await (await importar({ carpeta: "Otro/01_ADN_y_Memoria" })).json();
    expect(r.archivos.nuevos).toBe(1);
    expect(notas()[0].texto).toContain("de otro cliente");
  });
});

describe("volver a importar", () => {
  beforeEach(async () => {
    github({ "Dcasa/01_ADN_y_Memoria/01_brand_guidelines.md": GUIAS, "Dcasa/01_ADN_y_Memoria/02_buyer_personas.md": PERSONAS });
    await importar();
  });

  it("lo que no cambió no se descarga ni se duplica", async () => {
    const antes = notas().length;
    github(repo);
    const r = await (await importar()).json();
    expect(blobs()).toBe(0);
    expect(r.archivos).toMatchObject({ nuevos: 0, cambiados: 0, iguales: 2 });
    expect(notas()).toHaveLength(antes);
  });

  it("un archivo nuevo entra; los demás se quedan", async () => {
    github({ ...repo, "Dcasa/01_ADN_y_Memoria/03_diccionario_seo.json": '{"palabras":["sofá"]}' });
    const r = await (await importar()).json();
    expect(r.archivos).toMatchObject({ nuevos: 1, iguales: 2 });
    expect(blobs()).toBe(1);
  });

  it("un archivo que cambió se cuenta, pero no se pisa sin permiso", async () => {
    github({ ...repo, "Dcasa/01_ADN_y_Memoria/01_brand_guidelines.md": GUIAS.replace("Cercano, de tú.", "Formal, de usted.") });
    const r = await (await importar()).json();
    expect(r.archivos).toMatchObject({ cambiados: 1, actualizados: 0 });
    expect(notas().find((n) => n.titulo === "Brand guidelines — Tono").texto).toContain("Cercano, de tú.");
    // No se baja lo que se va a tirar: cada archivo es una de las 50 peticiones del plan gratuito.
    expect(blobs()).toBe(0);
  });

  it("un archivo que cambió SÍ se descarga cuando se pide «actualizar»", async () => {
    github({ ...repo, "Dcasa/01_ADN_y_Memoria/01_brand_guidelines.md": GUIAS.replace("Cercano, de tú.", "Formal, de usted.") });
    await importar({ actualizar: true });
    expect(blobs()).toBe(1);
  });

  it("actualizar varios archivos borra lo viejo en una sola tanda, no una consulta por archivo", async () => {
    github({
      "Dcasa/01_ADN_y_Memoria/01_brand_guidelines.md": GUIAS.replace("Cercano", "Muy cercano"),
      "Dcasa/01_ADN_y_Memoria/02_buyer_personas.md": PERSONAS.replace("suave", "hipoalergénico"),
    });
    const sqls = [];
    const original = db.prepare.bind(db);
    db.prepare = (sql) => { sqls.push(sql); return original(sql); };
    const r = await (await importar({ actualizar: true })).json();
    expect(r.archivos.actualizados).toBe(2);
    expect(sqls.filter((q) => /^delete from cerebro_notas/.test(q)), "8 notas caben en un solo borrado de 50 ids").toHaveLength(1);
  });

  it("guarda con cada nota su resumen y su tamaño, para listarlas sin leer el texto", async () => {
    const n = notas().find((x) => x.titulo === "Brand guidelines — Tono");
    expect(n.caracteres).toBe(n.texto.length);
    expect(n.resumen).toMatch(/Tono/);
  });

  it("con «actualizar» reemplaza las notas que nadie tocó, con las MISMAS rutas", async () => {
    const rutasAntes = notas().map((n) => n.ruta).sort();
    github({ ...repo, "Dcasa/01_ADN_y_Memoria/01_brand_guidelines.md": GUIAS.replace("Cercano, de tú.", "Formal, de usted.") });
    const r = await (await importar({ actualizar: true })).json();
    expect(r.archivos).toMatchObject({ cambiados: 0, actualizados: 1 });
    expect(r.notas.reemplazadas).toBe(3);
    expect(notas().find((n) => n.titulo === "Brand guidelines — Tono").texto).toContain("Formal, de usted.");
    expect(notas().map((n) => n.ruta).sort(), "los [[enlaces]] de otras notas dependen de las rutas").toEqual(rutasAntes);
  });

  it("con «actualizar» NO pisa lo que alguien corrigió a mano, ni siquiera marcar una nota como interna", async () => {
    const tono = notas().find((n) => n.titulo === "Brand guidelines — Tono");
    const limites = notas().find((n) => n.titulo === "Brand guidelines — Límites");
    // Una corrige el texto; la otra sólo la marca interna.
    await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { id: tono.id, titulo: tono.titulo, texto: "Tono corregido por la agencia.", tipo: "marca" } });
    await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { id: limites.id, titulo: limites.titulo, texto: limites.texto, tipo: "marca", interna: true } });

    github({ ...repo, "Dcasa/01_ADN_y_Memoria/01_brand_guidelines.md": GUIAS.replace("Nunca versículos", "Nada de política") });
    const r = await (await importar({ actualizar: true })).json();
    // La introducción se reemplaza; las dos corregidas se quedan, y su sección NO se vuelve a crear al lado.
    expect(r.notas).toEqual({ creadas: 1, reemplazadas: 1, conservadas: 2 });
    const despues = notas();
    expect(despues.find((n) => n.id === tono.id).texto).toBe("Tono corregido por la agencia.");
    expect(despues.find((n) => n.id === limites.id).interna).toBe(1);
    // Y editarlas no les borró de dónde vienen.
    expect(despues.filter((n) => n.origen === "repositorio" && n.fuente.endsWith("01_brand_guidelines.md")).length, "ni una copia de más ni una de menos").toBe(3);
  });

  it("una importación que no cambia nada tampoco reconstruye el índice", async () => {
    const antes = env.MEDIA.objetos.get("cerebro/c1/indice.json");
    env.MEDIA.objetos.set("cerebro/c1/indice.json", antes + " ");
    github(repo);
    await importar();
    expect(env.MEDIA.objetos.get("cerebro/c1/indice.json")).toBe(antes + " ");
  });
});

describe("los límites de una invocación", () => {
  it("con más archivos de los que caben, importa 40 y avisa; la siguiente sigue sin repetir", async () => {
    const muchos = Object.fromEntries(Array.from({ length: 55 }, (_, i) => [`Dcasa/01_ADN_y_Memoria/nota-${String(i).padStart(2, "0")}.md`, `# Nota ${i}\n\nContenido ${i}.`]));
    github(muchos);
    const uno = await (await importar()).json();
    expect(uno.archivos).toMatchObject({ nuevos: 40, omitidos: 15 });
    expect(llamadas.length, "el árbol y 40 archivos: cabe en las 50 del plan gratuito").toBe(41);

    github(repo);
    const dos = await (await importar()).json();
    expect(dos.archivos).toMatchObject({ nuevos: 15, iguales: 40, omitidos: 0 });
    expect(notas()).toHaveLength(55);
    expect(new Set(notas().map((n) => n.ruta)).size).toBe(55);
  });

  it("lo que pasa de 400 000 bytes no se lee: es un volcado, no ADN", async () => {
    github({ "Dcasa/01_ADN_y_Memoria/volcado.md": "# Volcado\n\n" + "x".repeat(400_001), "Dcasa/01_ADN_y_Memoria/bien.md": "# Bien\n\ntexto" });
    const r = await (await importar()).json();
    expect(r.archivos.nuevos).toBe(1);
    expect(notas().map((n) => n.titulo)).toEqual(["Bien"]);
  });
});

describe("cuando GitHub falla, se dice por qué", () => {
  it("una carpeta que no existe da su nombre", async () => {
    github({ "Otro/01_ADN_y_Memoria/a.md": "# a" });
    const res = await importar();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/«Dcasa\/01_ADN_y_Memoria» no existe/);
    expect(notas()).toEqual([]);
  });

  it("un repositorio al que el token no llega", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
    const res = await importar();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/token del servidor/);
  });

  it("un cliente sin repositorio en la ficha lo dice sin llamar a GitHub", async () => {
    db.sqlite.prepare("update clients set github_repo = '' where id = 'c1'").run();
    github({});
    const res = await importar();
    expect(res.status).toBe(400);
    expect(llamadas).toEqual([]);
  });
});

describe.skipIf(!hayWorkspace)("con el ADN real de Agencia_Workspace", () => {
  function archivosDe(cliente) {
    const salida = {};
    const ir = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = `${d}/${e.name}`;
        if (e.isDirectory()) ir(p);
        else if (/\.(md|json)$/.test(e.name)) salida[p.slice(RAIZ.length + 1)] = readFileSync(p, "utf8");
      }
    };
    ir(`${RAIZ}/${cliente}/01_ADN_y_Memoria`);
    return salida;
  }

  it("Dcasa: se llena en una llamada y la búsqueda para texto encuentra lo que debe", async () => {
    github(archivosDe("Dcasa"));
    const r = await (await importar()).json();
    expect(r.archivos.omitidos).toBe(0);
    expect(r.notas.creadas).toBeGreaterThan(20);
    const busca = await (await pedir("/api/cerebro/c1/buscar?q=límites estrictos qué no se puede decir&para=texto")).json();
    expect(busca.resultados.some((x) => /L[ií]mites estrictos/i.test(x.titulo))).toBe(true);
    expect(busca.resultados.every((x) => x.tipo !== "maquetacion" && !x.interna)).toBe(true);
  });

  it("Baby Caleb: los costos quedan internos y no llegan a un texto, y el precio de venta sí", async () => {
    db.sqlite.prepare("update clients set github_folder = ? where id = 'c1'").run("Baby Caleb/01_ADN_y_Memoria");
    github(archivosDe("Baby Caleb"));
    const r = await (await importar()).json();
    expect(r.internas.join(" | ")).toMatch(/Econom[ií]a unitaria/i);
    expect(r.internas.join(" | ")).toMatch(/proveedores/i);
    expect(r.revisar.length, "hay notas que mencionan lo interno y la agencia debe mirar").toBeGreaterThan(0);

    const c = await (await pedir("/api/cerebro/c1/contexto", { method: "POST", body: { consulta: "precio del pañal de recién nacido y costo por wipe", para: "texto" } })).json();
    expect(c.pasajes, "el precio de venta no puede faltar").toMatch(/\$\s?50/);
    expect(c.pasajes, "el costo por wipe es interno").not.toMatch(/\$0[.,]017/);
    expect(c.pasajes).not.toMatch(/landed/i);
  });
});
