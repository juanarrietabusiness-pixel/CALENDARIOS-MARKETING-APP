import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso, menorQue, distintoDe } from "../../worker/lib/acceso.js";
import { crearCarpeta, MAX_LISTADOS } from "../../worker/lib/estudio/galeria.js";

// ============================================================
// La galería del Estudio por PÁGINAS, contra una D1 de verdad
//
// Antes leía las 300 más recientes y ya: Baby Caleb tenía 401 piezas vivas y 101 no se veían ni se encontraban
// buscando, y los audios (las locuciones) contaban en esas 300 aunque no se enseñan. Lo que se comprueba:
//   1. Los audios no cuentan en la página; «Cargar más» trae lo que falta sin saltarse ni repetir nada, también lo que
//      comparte el mismo instante (un lote apunta varias a la vez).
//   2. `?hasta=` relee todo lo cargado (un aviso del espacio no devuelve la pantalla a la primera página).
//   3. La búsqueda va por el SERVIDOR sobre toda la galería, en la escena y no en el bloque de la marca.
//   4. «Usada» es el uso DE VERDAD (la publicación sigue llevando el archivo), con su día y su título.
//   5. Lo de la marca llega aunque sea viejo (la vista «Marca»).
//   6. Las carpetas de la aplicación («auto», el lote, la competencia) no gastan las 30 de la persona.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra" };
let db;
let env;

async function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRA, "otra@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
  }
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
}

const pedir = (quien, ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, ...(opciones.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const json = async (quien, ruta, opciones) => (await pedir(quien, ruta, opciones)).json();

/** Un archivo con su fecha: el segundo `i` del 1 de noviembre (cuanto más alto, más nuevo). */
const fecha = (i) => new Date(Date.UTC(2026, 10, 1, 0, 0, 0) + i * 1000).toISOString();
function archivo(id, i, extra = {}) {
  db.sqlite.prepare(
    "insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo, prompt, ajustes, origen, carpeta_id, usado_en, favorito, borrado_at, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(id, JEFE, extra.cliente ?? "c1", extra.clave ?? `clientes/c1/estudio/${id}.png`, extra.tipo ?? "imagen", extra.tipo === "audio" ? "audio/mpeg" : "image/png",
    extra.modelo ?? "muse-image", extra.prompt ?? `pieza ${id}`, JSON.stringify(extra.ajustes ?? {}), extra.origen ?? "estudio", extra.carpeta ?? null,
    JSON.stringify(extra.usos ?? []), extra.favorito ? 1 : 0, extra.borrado ?? null, extra.creado ?? fecha(i), extra.creado ?? fecha(i));
}

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: { head: async () => null, get: async () => null, put: async () => {}, delete: async () => {} }, ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
});

describe("la galería por páginas", () => {
  it("con 401 piezas y 50 audios: la primera página son 300 piezas (los audios no cuentan) y «Cargar más» trae las 101 que faltaban", async () => {
    for (let i = 0; i < 401; i++) archivo(`p${i}`, i * 2);
    for (let i = 0; i < 50; i++) archivo(`voz${i}`, 1000 + i, { tipo: "audio" });
    const g = await json(JEFE, "/api/estudio/c1");
    expect(g.archivos).toHaveLength(MAX_LISTADOS);
    expect(g.archivos.some((a) => a.tipo === "audio")).toBe(false);
    expect(g.archivos[0].id).toBe("p400");
    expect(g.siguiente).toBeTruthy();
    const mas = await json(JEFE, `/api/estudio/c1/galeria?antes=${encodeURIComponent(g.siguiente)}`);
    expect(mas.archivos).toHaveLength(101);
    expect(mas.siguiente).toBeNull();
    const todas = new Set([...g.archivos, ...mas.archivos].map((a) => a.id));
    expect(todas.size).toBe(401);
    // `hasta`: relee todo lo cargado, no la primera página.
    const releida = await json(JEFE, `/api/estudio/c1?hasta=${encodeURIComponent(mas.archivos.at(-1).creado)}`);
    expect(releida.archivos).toHaveLength(401);
    expect(releida.siguiente).toBeNull();
    // Con más detrás, `hasta` lo dice.
    const parcial = await json(JEFE, `/api/estudio/c1?hasta=${encodeURIComponent(fecha(100))}`);
    expect(parcial.archivos).toHaveLength(351);
    expect(parcial.siguiente).toBe(fecha(100));
  });

  it("lo que comparte el instante de la última de la página va entero en ella: la siguiente no se salta ninguna", async () => {
    for (let i = 0; i < 290; i++) archivo(`n${i}`, 1000 + i);
    // 30 apuntadas a la vez (un lote): cruzan el borde de la página.
    for (let i = 0; i < 30; i++) archivo(`lote${i}`, 500);
    for (let i = 0; i < 20; i++) archivo(`v${i}`, i);
    const g = await json(JEFE, "/api/estudio/c1");
    const ids = new Set(g.archivos.map((a) => a.id));
    expect([...ids].filter((x) => x.startsWith("lote"))).toHaveLength(30);
    const mas = await json(JEFE, `/api/estudio/c1/galeria?antes=${encodeURIComponent(g.siguiente)}`);
    expect(mas.archivos.map((a) => a.id).sort()).toEqual(Array.from({ length: 20 }, (_, i) => `v${i}`).sort());
    expect(mas.archivos.some((a) => ids.has(a.id))).toBe(false);
  });

  it("un cursor que no es una fecha no entra en el SQL; sin «antes» ni «q», 400", async () => {
    archivo("a", 1);
    expect((await pedir(JEFE, "/api/estudio/c1/galeria")).status).toBe(400);
    const raro = await json(JEFE, `/api/estudio/c1/galeria?antes=${encodeURIComponent("1; drop table clients")}`);
    expect(raro.archivos.map((a) => a.id)).toEqual(["a"]);
    expect(db.sqlite.prepare("select count(*) as n from clients").get().n).toBe(2);
  });

  it("un cliente de otro espacio da «no encontrado» también aquí", async () => {
    expect((await pedir(OTRA, "/api/estudio/c1/galeria?q=pieza")).status).toBe(404);
    expect((await pedir(OTRA, `/api/estudio/c1/galeria?antes=${encodeURIComponent(fecha(5))}`)).status).toBe(404);
  });
});

describe("buscar en TODA la galería, en el servidor", () => {
  it("encuentra lo que no está cargado, en la escena y no en el bloque de la marca, sin tildes", async () => {
    const marca = "\n\nMarca: paleta beige y azul, estilo cálido, nunca neón.";
    for (let i = 0; i < 350; i++) archivo(`p${i}`, 1000 + i, { prompt: `Escena: una taza número ${i}${marca}` });
    archivo("vieja", 1, { prompt: `Escena: Un sofá cama en la sala, luz de tarde${marca}` });
    const r = await json(JEFE, "/api/estudio/c1/galeria?q=SOFA%20cama");
    expect(r.archivos.map((a) => a.id)).toEqual(["vieja"]);
    expect(r).toMatchObject({ total: 1, completa: true });
    expect(r.buscadas).toBe(351);
    // Una palabra de la paleta ya no casa con todo.
    expect((await json(JEFE, "/api/estudio/c1/galeria?q=beige")).total).toBe(0);
  });

  it("por el producto de la publicación donde se usa y por su día", async () => {
    db.sqlite.prepare("insert into calendars (id, owner_id, client_id, name, month, year, days) values (?,?,?,?,?,?,?)").run("cal1", JEFE, "c1", "Noviembre", 10, 2026, JSON.stringify([
      { date: "2026-11-20", posts: [{ id: "post1", title: "Black Friday", producto: "Mesa de centro", medios: [{ src: "/api/media/clientes/c1/estudio/x.png" }] }] },
    ]));
    archivo("x", 5, { usos: [{ clave: "cal1:post1", calendarId: "cal1", postId: "post1" }] });
    archivo("y", 6);
    expect((await json(JEFE, "/api/estudio/c1/galeria?q=mesa")).archivos.map((a) => a.id)).toEqual(["x"]);
    expect((await json(JEFE, "/api/estudio/c1/galeria?q=black%20friday")).archivos.map((a) => a.id)).toEqual(["x"]);
    expect((await json(JEFE, "/api/estudio/c1/galeria?q=20%20nov")).archivos.map((a) => a.id)).toEqual(["x"]);
  });
});

describe("«Usada» es el uso de verdad", () => {
  it("la que se cambió por otra en la publicación ya no sale usada; la que sigue, con su día y su título", async () => {
    db.sqlite.prepare("insert into calendars (id, owner_id, client_id, name, month, year, days) values (?,?,?,?,?,?,?)").run("cal1", JEFE, "c1", "Noviembre", 10, 2026, JSON.stringify([
      { date: "2026-11-12", posts: [{ id: "post1", title: "Sofá", medios: [{ src: "/api/media/clientes/c1/estudio/nueva.png" }] }] },
    ]));
    const uso = [{ clave: "cal1:post1", calendarId: "cal1", postId: "post1" }];
    archivo("vieja", 1, { usos: uso });
    archivo("nueva", 2, { usos: uso, ajustes: { deArchivo: "vieja" } });
    const { archivos } = await json(JEFE, "/api/estudio/c1");
    const porId = Object.fromEntries(archivos.map((a) => [a.id, a]));
    expect(porId.vieja.usadoEn).toEqual([]);
    expect(porId.nueva.usadoEn).toEqual([expect.objectContaining({ calendarId: "cal1", postId: "post1", fecha: "2026-11-12", titulo: "Sofá" })]);
  });
});

describe("lo de la marca llega aunque sea viejo", () => {
  it("el logo del kit, de hace 400 piezas, viene con la primera página y marcado", async () => {
    archivo("logo", 0, { clave: "clientes/c1/estudio/logo.png", origen: "subida" });
    for (let i = 0; i < 320; i++) archivo(`p${i}`, 10 + i);
    db.sqlite.prepare("update clients set kit_marca = ? where id = 'c1'").run(JSON.stringify({ logo: "clientes/c1/estudio/logo.png" }));
    const g = await json(JEFE, "/api/estudio/c1");
    const logo = g.archivos.find((a) => a.id === "logo");
    expect(logo?.deLaMarca).toBeTruthy();
    expect(g.archivos).toHaveLength(301);
    expect(g.perdidas).toBeUndefined();
    // Y no se repite al cargar la página donde de verdad está.
    const mas = await json(JEFE, `/api/estudio/c1/galeria?antes=${encodeURIComponent(g.siguiente)}`);
    expect(mas.archivos.find((a) => a.id === "logo")?.deLaMarca).toBeTruthy();
  });
});

describe("las carpetas de la aplicación", () => {
  it("«auto», el lote y la competencia no gastan las 30 de la persona; «reusar» devuelve la que ya hay", async () => {
    const acceso = crearAcceso(db, JEFE);
    for (let i = 0; i < 30; i++) await crearCarpeta(acceso, "c1", `Mía ${i}`);
    await expect(crearCarpeta(acceso, "c1", "Una más")).rejects.toThrow(/hasta 30/);
    const lote = await crearCarpeta(acceso, "c1", "Lote Sofá · 12 nov", { tipo: "auto", reusar: true });
    expect(lote.tipo).toBe("auto");
    expect((await crearCarpeta(acceso, "c1", "Lote Sofá · 12 nov", { tipo: "auto", reusar: true })).id).toBe(lote.id);
    const variaciones = await crearCarpeta(acceso, "c1", "Variaciones · Sofá", { tipo: "auto" });
    expect((await crearCarpeta(acceso, "c1", "Variaciones · Sofá", { tipo: "auto" })).nombre).toBe("Variaciones · Sofá (2)");
    expect(variaciones.id).toBeTruthy();
    // La de la competencia (el estudio de mercado la crea sin tipo) entra por su nombre.
    expect((await crearCarpeta(acceso, "c1", "Competencia")).nombre).toBe("Competencia");
  });

  it("por la ruta: tipo «auto» y «reusar»; otro tipo se ignora", async () => {
    const a = await json(JEFE, "/api/estudio/c1/carpetas", { method: "POST", body: { nombre: "Lote abril", tipo: "auto", reusar: true } });
    const b = await json(JEFE, "/api/estudio/c1/carpetas", { method: "POST", body: { nombre: "Lote abril", tipo: "auto", reusar: true } });
    expect(b.carpeta.id).toBe(a.carpeta.id);
    const c = await json(JEFE, "/api/estudio/c1/carpetas", { method: "POST", body: { nombre: "Rara", tipo: "drop" } });
    expect(c.carpeta.tipo).toBe("");
  });
});

describe("la capa: comparar sin salir de ella", () => {
  it("menorQue y distintoDe van como parámetros, acotados por el dueño", async () => {
    archivo("a", 1);
    archivo("b", 3);
    archivo("voz", 2, { tipo: "audio" });
    const acceso = crearAcceso(db, JEFE);
    const filas = await acceso.leer("estudio_archivos", { client_id: "c1", tipo: distintoDe("audio"), created_at: menorQue(fecha(3)) }, "created_at desc");
    expect(filas.map((f) => f.id)).toEqual(["a"]);
    const ajeno = crearAcceso(db, OTRA);
    expect(await ajeno.leer("estudio_archivos", { client_id: "c1", tipo: distintoDe("audio") })).toEqual([]);
  });
});
