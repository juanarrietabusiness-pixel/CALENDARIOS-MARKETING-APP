import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { bombear } from "../../worker/lib/estudio/bomba.js";

// ============================================================
// Lo que se crea DESDE una publicación («Otra versión», «Corregir», «Diseñar con el director») va con `poner`: si se
// cierra el panel antes de que salga, el SERVIDOR lo pone en SU sitio (la lámina que se tocó), sin pisar las demás y
// sin ponerlo dos veces si el panel ya lo puso. Y quita la marca «se está creando» de la publicación.
// Contra una D1 de verdad y el motor de prueba; nadie mira la pantalla: sólo la bomba.
// ============================================================

const JEFE = "u-jefe";
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

const src = (id) => `/api/media/clientes/c1/estudio/${id}.png`;
const medio = (id) => ({ src: src(id), tipo: "imagen", nombre: "" });

async function sembrar(posts) {
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("t-jefe"), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Jefe", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal1", "c1", JEFE, "Noviembre", 10, 2026, JSON.stringify([{ date: "2026-11-20", dayName: "Viernes", posts }]));
}

const pedir = (ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  ...opciones,
  headers: { Cookie: `${COOKIE}=t-jefe`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env);

/** Una pieza como la manda el panel de la publicación (lib/piezaServidor.js: `pasoListo` con su sitio). */
const lanzar = (sitio, { poner = true } = {}) => pedir("/estudio/c1/encargos", {
  method: "POST",
  body: {
    tipo: "lote", mejorar: false, controlar: false, ...(poner ? { poner: true } : {}),
    pasos: [{
      id: "p1", titulo: "Otra versión", escena: "Pedido listo",
      pedido: { modelo: "prueba", prompt: "Un sofá azul en una sala luminosa.", n: 1, ajustes: { aspectRatio: "4:5" }, medios: {}, calendarId: "cal1", postId: "post1" },
      sitio,
    }],
  },
});

async function bombearHastaElFinal() {
  for (let i = 0; i < 40; i++) {
    if ((await bombear(env, JEFE)) == null) return;
    vi.setSystemTime(new Date(Date.now() + 5000));
  }
}

const elPost = () => JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal1'").get().days)[0].posts[0];
const elEncargo = () => {
  const e = db.sqlite.prepare("select * from estudio_encargos").get();
  return { ...e, datos: JSON.parse(e.datos), pasos: JSON.parse(e.pasos) };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") } };
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("lo que se crea desde una publicación se pone en SU sitio aunque el panel se cierre", () => {
  it("la lámina 2 de un carrusel: la nueva ocupa su sitio, las demás no se tocan y la marca se va", async () => {
    await sembrar([{ id: "post1", format: "carrusel", status: "pending", medios: [medio("a"), medio("b"), medio("c")], piezaEnCurso: { encargoId: "x", reemplaza: src("b") } }]);
    const res = await lanzar({ reemplaza: src("b") });
    expect(res.status).toBe(201);
    const { encargo } = await res.json();
    // La marca la pone el panel con el id del encargo (alLanzar); aquí, a mano.
    db.sqlite.prepare("update calendars set days = ? where id = 'cal1'").run(JSON.stringify([{ date: "2026-11-20", posts: [{ ...elPost(), piezaEnCurso: { encargoId: encargo.id, reemplaza: src("b") } }] }]));
    expect(elEncargo().pasos[0].sitio).toEqual({ reemplaza: src("b") });
    await bombearHastaElFinal();
    const e = elEncargo();
    expect(e.estado).toBe("hecho");
    const nueva = db.sqlite.prepare("select clave from estudio_archivos").get().clave;
    const post = elPost();
    expect(post.medios.map((m) => m.src)).toEqual([src("a"), `/api/media/${nueva}`, src("c")]);
    expect(post.piezaEnCurso).toBeUndefined();
    expect(post.format).toBe("carrusel");
    expect(e.datos.puestos).toEqual([{ postId: "post1", archivos: [expect.any(String)] }]);
  });

  it("un post vacío («Diseñar con el director»): se añade", async () => {
    await sembrar([{ id: "post1", format: "post", status: "pending" }]);
    await lanzar({ anadir: true });
    await bombearHastaElFinal();
    const nueva = db.sqlite.prepare("select clave from estudio_archivos").get().clave;
    expect(elPost().medios.map((m) => m.src)).toEqual([`/api/media/${nueva}`]);
  });

  it("si el panel ya la puso, no se pone dos veces", async () => {
    await sembrar([{ id: "post1", format: "post", status: "pending", medios: [medio("b")] }]);
    await lanzar({ reemplaza: src("b") });
    // El panel la puso en cuanto salió (antes de que el servidor cierre el encargo): la simulamos al crear el archivo.
    for (let i = 0; i < 40; i++) {
      const fila = db.sqlite.prepare("select clave from estudio_archivos").get();
      if (fila && elPost().medios[0].src === src("b")) {
        db.sqlite.prepare("update calendars set days = ? where id = 'cal1'").run(JSON.stringify([{ date: "2026-11-20", posts: [{ ...elPost(), medios: [{ src: `/api/media/${fila.clave}`, tipo: "imagen" }] }] }]));
      }
      if ((await bombear(env, JEFE)) == null) break;
      vi.setSystemTime(new Date(Date.now() + 5000));
    }
    expect(elEncargo().estado).toBe("hecho");
    expect(elPost().medios).toHaveLength(1);
  });

  it("si la imagen que se tocó ya no está, no se pone (queda en la galería y lo dice)", async () => {
    await sembrar([{ id: "post1", format: "post", status: "pending", medios: [medio("z")] }]);
    await lanzar({ reemplaza: src("b") });
    await bombearHastaElFinal();
    expect(elPost().medios.map((m) => m.src)).toEqual([src("z")]);
    expect(elEncargo().datos.puestos[0].aviso).toMatch(/ya no está en la publicación/);
  });

  it("sin `poner`, nada se toca (lo de antes sigue igual)", async () => {
    await sembrar([{ id: "post1", format: "post", status: "pending", medios: [medio("b")] }]);
    await lanzar({ reemplaza: src("b") }, { poner: false });
    await bombearHastaElFinal();
    expect(elEncargo().estado).toBe("hecho");
    expect(elPost().medios.map((m) => m.src)).toEqual([src("b")]);
  });
});
