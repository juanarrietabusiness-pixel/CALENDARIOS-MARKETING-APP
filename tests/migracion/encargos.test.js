import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { bombear, encargosDelCron } from "../../worker/lib/estudio/bomba.js";
import { avanzarEncargo, conEscena, conPlantillaDelDirector } from "../../worker/lib/estudio/encargos.js";
import { ESCENA } from "../../src/lib/encargos.js";
import { MAX_PROMPT } from "../../src/lib/estudioCatalogo.js";

// ============================================================
// Los encargos del Estudio, contra una D1 de verdad
//
// Lo que importa: que el lote SIGA sin la pantalla. Aquí nadie llama a
// /avanzar de los trabajos: sólo la bomba (la alarma del Durable Object) y el
// cron, como cuando se cierra la aplicación. El motor es el de prueba (sin
// llave ni costo) y R2 es de mentira pero guarda los bytes.
// ============================================================

const JEFE = "u-jefe";
const OTRA = "u-otra";
const TESTIGO = { [JEFE]: "t-jefe", [OTRA]: "t-otra" };

let db;
let env;

function r2() {
  const objetos = new Map();
  const bytesDe = async (v) => (v instanceof Uint8Array ? v : new Uint8Array(await new Response(v).arrayBuffer()));
  return {
    objetos,
    async head(clave) { return objetos.has(clave) ? { size: objetos.get(clave).bytes.length } : null; },
    async get(clave) {
      const o = objetos.get(clave);
      return o ? { body: o.bytes, size: o.bytes.length, httpEtag: '"x"', httpMetadata: { contentType: o.tipo }, arrayBuffer: async () => o.bytes.buffer, writeHttpMetadata: (h) => h.set("content-type", o.tipo) } : null;
    },
    async put(clave, valor, opciones) { objetos.set(clave, { bytes: await bytesDe(valor), tipo: opciones?.httpMetadata?.contentType }); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

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

const pedir = (quien, ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  ...opciones,
  headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env);

/** Una pieza del lote como la arma la pantalla (lib/loteServidor.js): el pedido con el hueco de la escena. */
const paso = (id, extra = {}) => ({
  id, titulo: `Pieza ${id}`, escena: `Una taza de café número ${id}`, sinMejorar: "una taza",
  pedido: { modelo: "prueba", prompt: `Escena: ${ESCENA}\n\nTipo de pieza: anuncio.`, n: 1, ajustes: { aspectRatio: "4:5" }, medios: {} },
  ...extra,
});
const lanzar = async (cuerpo) => (await pedir(JEFE, "/estudio/c1/encargos", { method: "POST", body: { tipo: "lote", mejorar: false, ...cuerpo } }));
const encargo = async (id) => (await (await pedir(JEFE, `/estudio/c1/encargos/${id}`)).json());

/** La bomba, vuelta tras vuelta, como la alarma del objeto: hasta que no quede nada vivo. */
async function bombearHastaElFinal(tope = 40) {
  for (let i = 0; i < tope; i++) {
    const siguiente = await bombear(env, JEFE);
    if (siguiente == null) return i;
    // Los permisos de paso se sueltan al terminar; un video de prueba espera su turno: se adelanta el reloj.
    vi.setSystemTime(new Date(Date.now() + 5000));
  }
  return tope;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("el lote sigue sin la pantalla", () => {
  it("la bomba lo lleva entero: cada pieza con su escena en el pedido, y se cierra solo", async () => {
    const res = await lanzar({ pasos: [paso("a"), paso("b"), paso("c")] });
    expect(res.status).toBe(201);
    const { encargo: e } = await res.json();
    expect(e).toMatchObject({ tipo: "lote", estado: "en_marcha" });
    await bombearHastaElFinal();
    const { encargo: fin, archivos } = await encargo(e.id);
    expect(fin.estado).toBe("hecho");
    expect(fin.pasos.map((p) => p.fase)).toEqual(["hecho", "hecho", "hecho"]);
    expect(fin.nota).toBe("Las 3 listas.");
    expect(archivos).toHaveLength(3);
    // El hueco se llenó con la escena de cada una: el pedido que queda en la galería es el de verdad.
    const prompts = db.sqlite.prepare("select prompt from estudio_trabajos order by created_at").all().map((t) => t.prompt);
    expect(prompts.every((p) => !p.includes(ESCENA))).toBe(true);
    expect(prompts[0]).toContain("Una taza de café número a");
  });

  it("de dos en dos: no pide la tercera mientras dos están saliendo", async () => {
    const { encargo: e } = await (await lanzar({ pasos: [paso("a"), paso("b"), paso("c")], paralelo: 2 })).json();
    const acceso = crearAcceso(db, JEFE);
    await avanzarEncargo(env, acceso, e.id);
    await avanzarEncargo(env, acceso, e.id);
    await avanzarEncargo(env, acceso, e.id);
    expect(db.sqlite.prepare("select count(*) n from estudio_trabajos").get().n).toBe(2);
  });

  it("dos a la vez no dan el mismo paso (el permiso)", async () => {
    const { encargo: e } = await (await lanzar({ pasos: [paso("a")] })).json();
    const acceso = crearAcceso(db, JEFE);
    const [r1, r2b] = await Promise.all([avanzarEncargo(env, acceso, e.id), avanzarEncargo(env, acceso, e.id)]);
    expect([r1.ocupado, r2b.ocupado].filter(Boolean)).toHaveLength(1);
    expect(db.sqlite.prepare("select count(*) n from estudio_trabajos").get().n).toBe(1);
  });

  it("sin director (falla o no hay llave), la pieza sale con la escena sin mejorar", async () => {
    const { encargo: e } = await (await lanzar({
      mejorar: true,
      pasos: [paso("a", { escena: "", encargo: { idea: "taza", formato: "post" }, mejora: { idea: "taza", tipo: "imagen" } })],
    })).json();
    await bombearHastaElFinal();
    const { encargo: fin } = await encargo(e.id);
    expect(fin.estado).toBe("hecho");
    expect(fin.pasos[0].escena).toBe("una taza");
  });

  it("una pieza que no se puede pedir queda con su motivo; las demás siguen", async () => {
    const { encargo: e } = await (await lanzar({ pasos: [paso("a", { pedido: { ...paso("a").pedido, modelo: "no-existe" } }), paso("b")] })).json();
    await bombearHastaElFinal();
    const { encargo: fin } = await encargo(e.id);
    expect(fin.pasos[0].fase).toBe("fallido");
    expect(fin.pasos[0].error).toBeTruthy();
    expect(fin.pasos[1].fase).toBe("hecho");
    expect(fin.estado).toBe("hecho");
  });

  it("sin nada vivo, la bomba no vuelve a sonar", async () => {
    expect(await bombear(env, JEFE)).toBeNull();
  });

  it("el cron es el respaldo: un encargo que nadie lleva da su paso", async () => {
    const { encargo: e } = await (await lanzar({ pasos: [paso("a")] })).json();
    vi.setSystemTime(new Date(Date.now() + 60_000));
    expect(await encargosDelCron(env, new Date())).toBe(1);
    expect((await encargo(e.id)).encargo.pasos[0].fase).toBe("generando");
  });
});

describe("lo que hace la pantalla", () => {
  it("cancelar no pide lo que falta", async () => {
    const { encargo: e } = await (await lanzar({ pasos: [paso("a"), paso("b"), paso("c")], paralelo: 1 })).json();
    await avanzarEncargo(env, crearAcceso(db, JEFE), e.id);
    const r = await (await pedir(JEFE, `/estudio/c1/encargos/${e.id}/cancelar`, { method: "POST" })).json();
    expect(r.encargo.estado).toBe("cancelado");
    expect(r.encargo.pasos.slice(1).map((p) => p.fase)).toEqual(["fallido", "fallido"]);
    await bombearHastaElFinal();
    expect(db.sqlite.prepare("select count(*) n from estudio_trabajos").get().n).toBe(1);
  });

  it("los finales (texto encima, logo) se apuntan sólo con imágenes de ESTE cliente", async () => {
    const { encargo: e } = await (await lanzar({ pasos: [paso("a")] })).json();
    await bombearHastaElFinal();
    const { encargo: hecho } = await encargo(e.id);
    const propia = hecho.pasos[0].opciones[0].id;
    const r = await (await pedir(JEFE, `/estudio/c1/encargos/${e.id}/final`, { method: "POST", body: { pasoId: "a", finales: [propia, "de-otro"] } })).json();
    expect(r.encargo.pasos[0].finales).toEqual([propia, null]);
  });

  it("lo que espera a la pantalla (texto, logo) sale en «por terminar» hasta que la pantalla lo apunta", async () => {
    const { encargo: e } = await (await lanzar({ pasos: [paso("a", { navegador: { logo: true } }), paso("b")] })).json();
    await bombearHastaElFinal();
    const lista = await (await pedir(JEFE, "/encargos/por-terminar")).json();
    expect(lista.encargos.map((x) => x.encargo.id)).toEqual([e.id]);
    // La que no necesita nada ya tiene su final; la del logo, no.
    const pasos = lista.encargos[0].encargo.pasos;
    expect(pasos.find((x) => x.id === "b").finales).toHaveLength(1);
    expect(pasos.find((x) => x.id === "a").finales).toBeNull();
    expect(lista.encargos[0].archivos.length).toBeGreaterThan(0);
    const propia = pasos.find((x) => x.id === "a").opciones[0].id;
    await pedir(JEFE, `/estudio/c1/encargos/${e.id}/final`, { method: "POST", body: { pasoId: "a", finales: [propia] } });
    expect((await (await pedir(JEFE, "/encargos/por-terminar")).json()).encargos).toEqual([]);
    // Y de otro espacio no se ve nada.
    expect((await (await pedir(OTRA, "/encargos/por-terminar")).json()).encargos).toEqual([]);
  });

  it("un encargo de otro espacio no existe", async () => {
    const { encargo: e } = await (await lanzar({ pasos: [paso("a")] })).json();
    expect((await pedir(OTRA, `/estudio/c1/encargos/${e.id}`)).status).toBe(404);
    expect((await pedir(OTRA, `/estudio/c9/encargos/${e.id}`)).status).toBe(404);
  });

  it("un encargo sin piezas o de un tipo que no existe se rechaza", async () => {
    expect((await lanzar({ pasos: [] })).status).toBe(400);
    expect((await pedir(JEFE, "/estudio/c1/encargos", { method: "POST", body: { tipo: "otro", pasos: [paso("a")] } })).status).toBe(400);
  });
});

describe("la escena en el pedido", () => {
  it("va en su hueco; si no cabe, se acorta la escena y no el final del pedido", () => {
    expect(conEscena(`Escena: ${ESCENA}\n\nFin.`, "Una taza")).toBe("Escena: Una taza\n\nFin.");
    const largo = conEscena(`Escena: ${ESCENA}\n\nLÍNEA DEL LOGO.`, "x".repeat(MAX_PROMPT));
    expect(largo.length).toBeLessThanOrEqual(MAX_PROMPT);
    expect(largo.endsWith("LÍNEA DEL LOGO.")).toBe(true);
  });
});

describe("la plantilla que escoge el director", () => {
  const kit = { plantillas: [{ id: "plantilla-oferta", nombre: "Oferta", uso: "post", clave: "clientes/c1/estudio/oferta.png", sistema: "Titular arriba, 12 % del alto." }] };
  const pedido = { modelo: "nano-banana", prompt: `Escena: ${ESCENA}`, medios: { reference: ["clientes/c1/estudio/producto.png"] } };

  it("su imagen va de referencia, numerada detrás de las que ya iban, con su sistema escrito (como en la pantalla)", () => {
    const r = conPlantillaDelDirector(pedido, kit, "plantilla-oferta");
    expect(r.medios.reference).toEqual(["clientes/c1/estudio/producto.png", "clientes/c1/estudio/oferta.png"]);
    expect(r.prompt).toContain("Sigue el diseño de la plantilla «Oferta»");
    expect(r.prompt).toContain("Titular arriba, 12 % del alto.");
    expect(r.prompt).toMatch(/Imagen de referencia 2: toma SÓLO/);
    // El hueco de la escena sigue ahí: la ficha se pone después.
    expect(r.prompt).toContain(ESCENA);
  });

  it("no cambia nada si la pieza ya llevaba plantilla, si no cabe en el modelo o si la plantilla ya no está", () => {
    const conUna = conPlantillaDelDirector(pedido, kit, "plantilla-oferta");
    expect(conPlantillaDelDirector(conUna, kit, "plantilla-oferta")).toBe(conUna);
    const lleno = { ...pedido, medios: { reference: ["a", "b", "c"].map((x) => `clientes/c1/${x}.png`) } };
    expect(conPlantillaDelDirector(lleno, kit, "plantilla-oferta")).toBe(lleno);
    expect(conPlantillaDelDirector(pedido, kit, "plantilla-borrada")).toBe(pedido);
    expect(conPlantillaDelDirector(pedido, kit, "")).toBe(pedido);
  });
});
