import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { cerebroPendiente, textoDelAviso } from "../../worker/lib/cerebro/sincronizar.js";
import { huellaSeccion } from "../../worker/lib/cerebro/notas.js";
import { fichaDesactualizada, notasParaLaFicha, promptDeLaFicha, LINEA_PRECIOS } from "../../worker/lib/cerebro/preparar.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";

// ============================================================
// El cerebro al día con GitHub, solo y sin ensuciarse (0079)
//
// GitHub de mentira (un árbol y blobs en base64, cada cosa una petición) y la D1 de verdad. Lo que importa:
//
//   · Lo borrado, renombrado o movido en GitHub sale del cerebro; lo corregido aquí queda como conflicto.
//   · Una nota borrada aquí no vuelve sola; «Volver a traer» la trae.
//   · Los conflictos se GUARDAN, por sección y con la versión de GitHub, y se resuelven nota a nota.
//   · Con el árbol cortado no se quita nada.
//   · La revisión diaria: una petición del árbol por cliente; sólo si cambió se baja algo; los choques, a la campana.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const TESTIGO = "t-jefe";
const BASE = "Dcasa/01_ADN_y_Memoria";
let db;
let env;
let repo;
let truncado;
let llamadas;

const hueca = (t) => `sha-${[...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)}-${t.length}`;

/** GitHub de mentira con estos archivos { ruta: texto } (rutas relativas a la carpeta del cliente). */
function github(archivos, { cortado = false } = {}) {
  repo = Object.fromEntries(Object.entries(archivos).map(([r, t]) => [r.startsWith(BASE) ? r : `${BASE}/${r}`, t]));
  truncado = cortado;
  llamadas = [];
  vi.stubGlobal("fetch", async (entrada) => {
    const u = new URL(String(entrada));
    llamadas.push(u.pathname);
    if (u.pathname.endsWith("/git/trees/HEAD")) {
      return Response.json({ truncated: truncado, tree: Object.entries(repo).map(([path, texto]) => ({ path, type: "blob", sha: hueca(texto), size: Buffer.byteLength(texto) })) });
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
const arboles = () => llamadas.filter((p) => p.endsWith("/git/trees/HEAD")).length;

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) { return objetos.has(clave) ? { text: async () => objetos.get(clave) } : null; },
    async put(clave, valor) { objetos.set(clave, String(valor)); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);

const importar = async (body = { actualizar: true }) => (await pedir("/api/cerebro/c1/importar", { method: "POST", body })).json();
const notas = () => db.sqlite.prepare("select * from cerebro_notas order by ruta").all().map((n) => ({ ...n }));
const nota = (titulo) => notas().find((n) => n.titulo === titulo);
const conflictos = () => db.sqlite.prepare("select * from cerebro_conflictos").all().map((c) => ({ ...c }));
const corregir = (n, texto) => pedir("/api/cerebro/c1/nota", { method: "PUT", body: { id: n.id, titulo: n.titulo, texto, tipo: n.tipo } });
const avisos = () => db.sqlite.prepare("select * from avisos order by created_at").all().map((a) => ({ ...a }));

const GUIAS = "# Manual de marca\n\nTono cercano.\n\n## Tono\n\nCercano, de tú. Nunca versículos.\n\n## Límites\n\nNo mencionar la competencia.\n";
const PERSONAS = "# Personas\n\n## Mamá primeriza\n\nBusca algo suave para la piel del bebé.\n";

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), GITHUB_TOKEN: "tk", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  for (const [id, mail, nombre] of [[JEFE, "jefe@a.com", "Juan"], [OTRA, "otra@a.com", "Ana"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, mail, "x", "x");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, JEFE, id === JEFE ? "admin" : "editor", nombre, "#1E90FF");
  }
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, github_repo, github_folder) values (?,?,?,?,?)")
    .run("c1", JEFE, "Dcasa", "https://github.com/x/y", BASE);
  github({ "01_brand_guidelines.md": GUIAS, "02_buyer_personas.md": PERSONAS });
  await importar({ actualizar: false });
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("lo que ya no está en GitHub", () => {
  it("un archivo borrado saca sus notas del cerebro", async () => {
    github({ "01_brand_guidelines.md": GUIAS });
    const r = await importar();
    expect(r.archivos.borrados).toBe(1);
    expect(r.notas.borradas).toBe(2);
    expect(notas().some((n) => n.fuente.endsWith("02_buyer_personas.md"))).toBe(false);
    expect(r.trajo).toBe(true);
  });

  it("si su nota estaba corregida aquí, no se borra sola: queda como conflicto «archivo» y se avisa una vez", async () => {
    await corregir(nota("Buyer personas — Mamá primeriza"), "La mamá primeriza busca suavidad y precio justo.");
    github({ "01_brand_guidelines.md": GUIAS });
    const r = await importar();
    expect(r.conflictos).toMatchObject({ nuevos: 1, total: 1 });
    expect(conflictos()).toEqual([expect.objectContaining({ tipo: "archivo", texto: "" })]);
    expect(nota("Buyer personas — Mamá primeriza").texto).toContain("precio justo");
    // A la campana de los demás (Ana), no de quien pulsó el botón: él lo está viendo.
    expect(avisos().map((a) => a.user_id)).toEqual([OTRA]);
    expect(avisos()[0]).toMatchObject({ tipo: "cerebro", enlace: "/cliente/c1/marca/cerebro" });
    // La siguiente vuelta no avisa otra vez lo mismo.
    await importar();
    expect(avisos()).toHaveLength(1);
  });

  it("«Usar la de GitHub» en un archivo que se fue quita la nota; «Quedarme con la mía» la vuelve nota propia", async () => {
    await corregir(nota("Buyer personas — Mamá primeriza"), "Corrección A.");
    await corregir(nota("Personas"), "Corrección B.");
    github({ "01_brand_guidelines.md": GUIAS });
    await importar();
    const [a, b] = conflictos().sort((x, y) => x.nota_id.localeCompare(y.nota_id));
    const quitar = a.nota_id === nota("Buyer personas — Mamá primeriza").id ? a : b;
    const quedar = quitar === a ? b : a;
    expect((await (await pedir("/api/cerebro/c1/conflictos", { method: "POST", body: { ids: [quitar.id], usar: "github" } })).json()).quitadas).toBe(1);
    await pedir("/api/cerebro/c1/conflictos", { method: "POST", body: { ids: [quedar.id], usar: "mia" } });
    expect(conflictos()).toEqual([]);
    expect(nota("Buyer personas — Mamá primeriza")).toBeUndefined();
    expect(nota("Personas")).toMatchObject({ origen: "manual", texto: "Corrección B." });
    // Ya es suya: la siguiente actualización no la toca ni vuelve a chocar.
    await importar();
    expect(conflictos()).toEqual([]);
  });

  it("un archivo MOVIDO de carpeta no deja copias «-2»: las notas vuelven con sus rutas, y la corregida lo sigue", async () => {
    const rutas = notas().map((n) => n.ruta).sort();
    await corregir(nota("Brand guidelines — Tono"), "Cercano, de tú, siempre.");
    github({ "Marca/01_brand_guidelines.md": GUIAS, "02_buyer_personas.md": PERSONAS });
    const r = await importar();
    expect(notas().map((n) => n.ruta).sort()).toEqual(rutas);
    expect(notas().filter((n) => /-2$/.test(n.ruta))).toEqual([]);
    const tono = nota("Brand guidelines — Tono");
    expect(tono).toMatchObject({ fuente: `${BASE}/Marca/01_brand_guidelines.md`, texto: "Cercano, de tú, siempre." });
    // Su sección no cambió: no hay nada que decidir.
    expect(conflictos()).toEqual([]);
    expect(r.conflictos.total).toBe(0);
  });

  it("con el árbol CORTADO no se quita nada: no se sabe qué falta", async () => {
    github({ "01_brand_guidelines.md": GUIAS }, { cortado: true });
    const r = await importar();
    expect(r.truncado).toBe(true);
    expect(r.notas.borradas).toBe(0);
    expect(notas().some((n) => n.fuente.endsWith("02_buyer_personas.md"))).toBe(true);
    const lista = await (await pedir("/api/cerebro/c1")).json();
    expect(lista.estado.sync.fuera.truncado).toBe(true);
  });
});

describe("una nota borrada aquí no vuelve sola", () => {
  it("borrarla deja la marca; la actualización no la trae aunque su archivo cambie; «Volver a traer» la trae", async () => {
    const tono = nota("Brand guidelines — Tono");
    const b = await (await pedir(`/api/cerebro/c1/nota/${tono.id}`, { method: "DELETE" })).json();
    expect(b.noTraer).toBe(true);
    github({ "01_brand_guidelines.md": GUIAS.replace("No mencionar", "Nunca mencionar"), "02_buyer_personas.md": PERSONAS });
    const r = await importar();
    expect(r.notas.saltadas).toBe(1);
    expect(nota("Brand guidelines — Tono")).toBeUndefined();
    expect(nota("Brand guidelines — Límites").texto).toContain("Nunca mencionar");

    const lista = await (await pedir("/api/cerebro/c1")).json();
    expect(lista.noTraer).toEqual([expect.objectContaining({ titulo: "Brand guidelines — Tono", fuente: `${BASE}/01_brand_guidelines.md` })]);
    // Aunque el archivo no haya vuelto a cambiar: se baja ese archivo y entra sólo esa sección.
    github(repo);
    const v = await (await pedir(`/api/cerebro/c1/no-traer/${lista.noTraer[0].id}`, { method: "DELETE" })).json();
    expect(blobs()).toBe(1);
    expect(v.notas.creadas).toBe(1);
    expect(nota("Brand guidelines — Tono").ruta).toBe(tono.ruta);
    expect((await (await pedir("/api/cerebro/c1")).json()).noTraer).toEqual([]);
  });

  it("una nota que no viene de GitHub no deja marca", async () => {
    const r = await (await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "A mano", texto: "Algo.", tipo: "nota" } })).json();
    expect((await (await pedir(`/api/cerebro/c1/nota/${r.id}`, { method: "DELETE" })).json()).noTraer).toBe(false);
  });
});

describe("los conflictos, sección por sección", () => {
  it("una corrección no choca con el cambio de OTRA sección del mismo archivo", async () => {
    await corregir(nota("Brand guidelines — Tono"), "Tono corregido aquí.");
    github({ "01_brand_guidelines.md": GUIAS.replace("No mencionar la competencia.", "Nada de política."), "02_buyer_personas.md": PERSONAS });
    const r = await importar();
    expect(r.conflictos.total).toBe(0);
    expect(nota("Brand guidelines — Tono").texto).toBe("Tono corregido aquí.");
    expect(nota("Brand guidelines — Límites").texto).toContain("Nada de política");
  });

  it("si ESA sección cambió en GitHub, se guarda el conflicto con su versión, y la pantalla tiene las dos", async () => {
    await corregir(nota("Brand guidelines — Tono"), "Tono corregido aquí.");
    github({ "01_brand_guidelines.md": GUIAS.replace("Cercano, de tú.", "Formal, de usted."), "02_buyer_personas.md": PERSONAS });
    const r = await importar();
    expect(r.conflictos).toMatchObject({ nuevos: 1, total: 1 });
    const lista = await (await pedir("/api/cerebro/c1")).json();
    expect(lista.conflictos).toEqual([expect.objectContaining({ tipo: "cambio", titulo: "Brand guidelines — Tono" })]);
    // Guardado: recargar (otra pantalla, otra persona) lo sigue enseñando.
    const c = await (await pedir(`/api/cerebro/c1/conflictos/${lista.conflictos[0].id}`)).json();
    expect(c.mia).toBe("Tono corregido aquí.");
    expect(c.github).toContain("Formal, de usted.");
    expect(c.enlace).toBe(`https://github.com/x/y/blob/HEAD/Dcasa/01_ADN_y_Memoria/01_brand_guidelines.md`);
  });

  it("«Usar la de GitHub» pone su texto y la nota deja de estar corregida; la siguiente vez se actualiza sola", async () => {
    const tono = nota("Brand guidelines — Tono");
    await corregir(tono, "Tono corregido aquí.");
    github({ "01_brand_guidelines.md": GUIAS.replace("Cercano, de tú.", "Formal, de usted."), "02_buyer_personas.md": PERSONAS });
    await importar();
    await pedir("/api/cerebro/c1/conflictos", { method: "POST", body: { ids: [conflictos()[0].id], usar: "github" } });
    const ya = nota("Brand guidelines — Tono");
    expect(ya).toMatchObject({ id: tono.id, ruta: tono.ruta, editada: 0 });
    expect(ya.texto).toContain("Formal, de usted.");
    github({ "01_brand_guidelines.md": GUIAS.replace("Cercano, de tú.", "Formal, de usted y sin jerga."), "02_buyer_personas.md": PERSONAS });
    await importar();
    expect(nota("Brand guidelines — Tono").texto).toContain("sin jerga");
    expect(conflictos()).toEqual([]);
  });

  it("«Quedarme con la mía» no vuelve a chocar hasta que esa sección cambie otra vez", async () => {
    await corregir(nota("Brand guidelines — Tono"), "Tono corregido aquí.");
    github({ "01_brand_guidelines.md": GUIAS.replace("Cercano, de tú.", "Formal, de usted."), "02_buyer_personas.md": PERSONAS });
    await importar();
    await pedir("/api/cerebro/c1/conflictos", { method: "POST", body: { ids: [conflictos()[0].id], usar: "mia" } });
    github({ "01_brand_guidelines.md": GUIAS.replace("Cercano, de tú.", "Formal, de usted.").replace("No mencionar", "Nunca mencionar"), "02_buyer_personas.md": PERSONAS });
    await importar();
    expect(conflictos()).toEqual([]);
    expect(nota("Brand guidelines — Tono").texto).toBe("Tono corregido aquí.");
    github({ "01_brand_guidelines.md": GUIAS.replace("Cercano, de tú.", "Otro tono más."), "02_buyer_personas.md": PERSONAS });
    await importar();
    expect(conflictos()).toEqual([expect.objectContaining({ tipo: "cambio" })]);
  });

  it("si GitHub ya dice lo que se corrigió aquí, no hay conflicto y la nota deja de estar «corregida aquí»", async () => {
    const tono = nota("Brand guidelines — Tono");
    const corregido = "## Tono\n\nCercano, de tú. Nunca versículos ni groserías.";
    await corregir(tono, corregido);
    github({ "01_brand_guidelines.md": GUIAS.replace("Nunca versículos.", "Nunca versículos ni groserías."), "02_buyer_personas.md": PERSONAS });
    const r = await importar();
    expect(r.notas.alcanzadas).toBe(1);
    expect(conflictos()).toEqual([]);
    expect(nota("Brand guidelines — Tono").editada & 1).toBe(0);
  });

  it("una sección que desaparece del archivo con su nota corregida queda como conflicto «seccion»", async () => {
    await corregir(nota("Brand guidelines — Límites"), "Límites corregidos.");
    github({ "01_brand_guidelines.md": GUIAS.replace("## Límites\n\nNo mencionar la competencia.\n", ""), "02_buyer_personas.md": PERSONAS });
    await importar();
    expect(conflictos()).toEqual([expect.objectContaining({ tipo: "seccion" })]);
  });

  it("corregir una nota de antes (sin huella) le pone la base: así sabe después si su sección cambió", async () => {
    const tono = nota("Brand guidelines — Tono");
    db.sqlite.prepare("update cerebro_notas set seccion_hash = '' where id = ?").run(tono.id);
    await corregir(tono, "Tono corregido aquí.");
    expect(nota("Brand guidelines — Tono").seccion_hash).toBe(huellaSeccion(tono.texto));
  });
});

describe("los límites", () => {
  it("otra sincronización a la vez: 409, sin tocar nada", async () => {
    db.sqlite.prepare("update cerebro_sync set bloqueado_hasta = ? where id = 'c1'").run(new Date(Date.now() + 60_000).toISOString());
    github(repo);
    const res = await pedir("/api/cerebro/c1/importar", { method: "POST", body: { actualizar: true } });
    expect(res.status).toBe(409);
    expect(llamadas.length).toBe(0);
  });

  it("no pasa de 400 notas: un archivo que no cabe entero no entra, y se dice", async () => {
    const s = db.sqlite;
    const ins = s.prepare("insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, texto, tipo, origen) values (?,?,?,?,?,?,?,?)");
    for (let i = notas().length; i < 399; i++) ins.run(`r${i}`, JEFE, "c1", `relleno-${i}`, `Relleno ${i}`, "x", "nota", "manual");
    github({ ...repo, "03_mas.md": "# Más\n\n## Uno\n\na\n\n## Dos\n\nb\n" });
    const r = await importar();
    expect(r.sinSitio).toEqual([`${BASE}/03_mas.md`]);
    expect(notas()).toHaveLength(399);
  });

  it("lo que no entra se cuenta: PDF, Word, imágenes, lo muy hondo y lo enorme", async () => {
    github({
      ...repo,
      "Fotos/logo.png": "png", "Contrato.pdf": "pdf", "Brief.docx": "doc", "a/b/c/d/hondo.md": "# Hondo",
      "volcado.md": "# Volcado\n\n" + "x".repeat(400_001), ".DS_Store": "x",
    });
    const r = await importar();
    expect(r.fuera.noTexto).toMatchObject({ pdf: 1, word: 1, imagen: 1 });
    expect(r.fuera.profundos).toEqual([`${BASE}/a/b/c/d/hondo.md`]);
    expect(r.fuera.grandes).toEqual([`${BASE}/volcado.md`]);
  });
});

describe("la revisión automática", () => {
  // El reloj de mentira (sólo `Date`): lo que escribe la sincronización (revisado, la ficha pendiente) va con él.
  const cuando = (iso) => { vi.setSystemTime(new Date(iso)); return new Date(iso); };
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  it("al abrir: si se miró hace poco, ni pregunta a GitHub", async () => {
    await importar({ actualizar: true, auto: true });
    github(repo);
    const r = await importar({ actualizar: true, auto: true });
    expect(r.reciente).toBe(true);
    expect(llamadas).toEqual([]);
  });

  it("el cron: una petición del árbol por cliente al día; sólo si cambió baja algo", async () => {
    github(repo);
    expect(await cerebroPendiente(env, cuando("2030-01-10T14:00:00Z"))).toBe(1);
    expect(arboles()).toBe(1);
    expect(blobs()).toBe(0);
    // Mismo día: ya no toca.
    expect(await cerebroPendiente(env, cuando("2030-01-10T15:00:00Z"))).toBe(0);
    // Al día siguiente (en Panamá), otra vez; la carpeta no cambió: sólo el árbol.
    github(repo);
    expect(await cerebroPendiente(env, cuando("2030-01-11T14:00:00Z"))).toBe(1);
    expect(llamadas).toHaveLength(1);
    // Cambió: baja ese archivo y lo aplica.
    github({ "01_brand_guidelines.md": GUIAS.replace("No mencionar", "Nunca mencionar"), "02_buyer_personas.md": PERSONAS });
    expect(await cerebroPendiente(env, cuando("2030-01-12T14:00:00Z"))).toBe(1);
    expect(blobs()).toBe(1);
    expect(nota("Brand guidelines — Límites").texto).toContain("Nunca mencionar");
  });

  it("si trajo cambios y hay ficha de la IA, la renueva en una vuelta posterior (y no la reintenta cada minuto si falla)", async () => {
    db.sqlite.prepare(`insert into cerebro_notas (id, owner_id, client_id, ruta, titulo, texto, tipo, origen) values ('f1', ?, 'c1', 'ficha-tecnica', 'Ficha técnica', 'Vieja', 'ficha', 'ia')`).run(JEFE);
    github({ "01_brand_guidelines.md": GUIAS.replace("No mencionar", "Nunca mencionar"), "02_buyer_personas.md": PERSONAS });
    await cerebroPendiente(env, cuando("2030-01-10T14:00:00Z"));
    const sync = () => db.sqlite.prepare("select * from cerebro_sync where id = 'c1'").get();
    expect(sync().ficha_pendiente).toBe(1);
    // Sin llave de IA: lo dice y no lo repite.
    expect(await cerebroPendiente(env, cuando("2030-01-10T14:30:00Z"))).toBe(1);
    expect(sync().ficha_pendiente).toBe(0);
    expect(sync().error).toMatch(/no se pudo renovar sola/);
    expect(await cerebroPendiente(env, cuando("2030-01-10T14:31:00Z"))).toBe(0);
  });

  it("un cliente cuyo cerebro no se llenó desde GitHub no se revisa solo", async () => {
    db.sqlite.prepare("delete from cerebro_notas").run();
    expect(await cerebroPendiente(env, cuando("2030-01-10T14:00:00Z"))).toBe(0);
  });

  it("un GitHub que falla deja el motivo y no se reintenta cada minuto", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 403 }));
    expect(await cerebroPendiente(env, cuando("2030-01-10T14:00:00Z"))).toBe(1);
    const lista = await (await pedir("/api/cerebro/c1")).json();
    expect(lista.estado.sync.error).toMatch(/GitHub rechazó/);
    expect(await cerebroPendiente(env, cuando("2030-01-10T14:01:00Z"))).toBe(0);
  });

  it("el aviso cuenta lo que choca y lo que ya no está", () => {
    expect(textoDelAviso({ name: "Dcasa" }, [{ tipo: "cambio" }, { tipo: "archivo" }, { tipo: "seccion" }]))
      .toBe("Cerebro de Dcasa: 1 nota que corregiste aquí también cambió en GitHub y 2 notas corregidas aquí ya no están en GitHub. Decide cuál vale en Marca → Cerebro.");
  });
});

describe("la ficha técnica", () => {
  const n = (x) => ({ interna: 0, origen: "repositorio", fuente: "a.md", updated_at: "2026-11-10T00:00:00.000Z", texto: "t", ...x });

  it("las decisiones que la aplicación apunta sola NO dicen que la ficha está vieja (ni la alimentan)", () => {
    const ficha = n({ ruta: "ficha-tecnica", titulo: "Ficha técnica", tipo: "ficha", origen: "ia", updated_at: "2026-11-01T00:00:00.000Z" });
    const decision = n({ ruta: "aprobo", titulo: "El cliente aprobó", tipo: "decision", origen: "app", fuente: "respuesta:p1" });
    expect(fichaDesactualizada([ficha, decision])).toBeNull();
    expect(notasParaLaFicha([decision]).dentro).toEqual([]);
    // Una regla aceptada (origen ia, tipo decisión) sí la alimenta, y sí la deja vieja.
    const regla = n({ ruta: "regla", titulo: "Siempre de usted", tipo: "decision", origen: "ia", fuente: "propuesta:x" });
    expect(fichaDesactualizada([ficha, regla])?.total).toBe(1);
  });

  it("el prompt maestro de Meta AI no llega a la ficha, y las decisiones van después de los documentos", () => {
    const { dentro } = notasParaLaFicha([
      n({ ruta: "d", titulo: "Decisión", tipo: "decision", origen: "ia" }),
      n({ ruta: "p", titulo: "Prompt maestro meta ai — Tono", tipo: "marca" }),
      n({ ruta: "x", titulo: "Documento", tipo: "documento" }),
      n({ ruta: "m", titulo: "Marca", tipo: "marca" }),
    ]);
    expect(dentro.map((x) => x.ruta)).toEqual(["m", "x", "d"]);
  });

  it("con catálogo, la IA lo lee y las cifras no repiten precios", () => {
    const p = promptDeLaFicha({ name: "Dcasa" }, { dentro: [], fuera: [] }, { catalogo: "- Sofá (producto) · precio: $450" });
    expect(p).toMatch(/LOS PRECIOS MANDAN LOS DEL CATÁLOGO/);
    expect(p).toContain("- Sofá (producto) · precio: $450");
    expect(LINEA_PRECIOS).toMatch(/manda el catálogo/);
  });
});
