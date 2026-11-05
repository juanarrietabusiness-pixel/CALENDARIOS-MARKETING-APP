import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { bombear } from "../../worker/lib/estudio/bomba.js";
import { ESCENA } from "../../src/lib/encargos.js";
import { avisoDeEncargo, avisoDeRender, AVISO_SEGUIDO_MS } from "../../worker/lib/equipo.js";

// ============================================================
// La campana cuando el Estudio termina algo sin nadie delante
//
// Lo que se lanza desde el teléfono sigue en el servidor aunque se cierre la
// aplicación; al terminar (o fallar) le deja un aviso GUARDADO a quien lo pidió.
// Aquí sólo corre la bomba, como cuando no hay pantalla.
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
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRA, "otra@a.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, JEFE, "editor", "Ana", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
}

const pedir = (quien, ruta, opciones = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  ...opciones,
  headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env);

const paso = (id, extra = {}) => ({
  id, titulo: `Pieza ${id}`, escena: `Una taza de café número ${id}`, sinMejorar: "una taza",
  pedido: { modelo: "prueba", prompt: `Escena: ${ESCENA}\n\nTipo de pieza: anuncio.`, n: 1, ajustes: { aspectRatio: "4:5" }, medios: {} },
  ...extra,
});

async function bombearHastaElFinal(tope = 40) {
  for (let i = 0; i < tope; i++) {
    if ((await bombear(env, JEFE)) == null) return;
    vi.setSystemTime(new Date(Date.now() + 5000));
  }
}

const avisosDe = (quien) => db.sqlite.prepare("select tipo, texto, enlace, por_nombre from avisos where user_id = ? order by created_at").all(quien);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T15:00:00.000Z"));
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("un lote que termina sin pantalla avisa a quien lo pidió", () => {
  it("lanzado por Ana desde el teléfono: el aviso es de ella, guardado, y lleva al Estudio del cliente", async () => {
    const res = await pedir(OTRA, "/estudio/c1/encargos", { method: "POST", body: { tipo: "lote", titulo: "Lote de octubre", mejorar: false, pasos: [paso("a"), paso("b")] } });
    expect(res.status).toBe(201);
    await bombearHastaElFinal();
    const [a, ...otros] = avisosDe(OTRA);
    expect(otros).toHaveLength(0);
    expect(a.tipo).toBe("encargo");
    expect(a.texto).toBe("Listas 2 de 2 piezas de «Lote de octubre». Está en la galería del Estudio.");
    expect(a.enlace).toBe("/cliente/c1/estudio");
    expect(a.por_nombre).toBe("Estudio");
    // Al resto del equipo no le llega: no lo pidió.
    expect(avisosDe(JEFE)).toHaveLength(0);
  });

  it("una pieza que la pantalla sigue (`seguido`) no avisa si sale bien y rápido", async () => {
    await pedir(OTRA, "/estudio/c1/encargos", { method: "POST", body: { tipo: "lote", titulo: "Una", mejorar: false, seguido: true, pasos: [paso("a")] } });
    await bombearHastaElFinal();
    expect(avisosDe(OTRA)).toHaveLength(0);
  });
});

describe("el texto de cada aviso (puro)", () => {
  const base = { client_id: "c1", creado_por: "u1", titulo: "Sofá cama", created_at: "2026-10-28T15:00:00.000Z" };
  const t0 = Date.parse(base.created_at) + 60_000;

  it("lo cancelado, lo que sigue en marcha y lo que no tiene quien lo pidió no avisan", () => {
    expect(avisoDeEncargo({ ...base, estado: "cancelado" }, {}, t0)).toBeNull();
    expect(avisoDeEncargo({ ...base, estado: "en_marcha" }, {}, t0)).toBeNull();
    expect(avisoDeEncargo({ ...base, creado_por: null, estado: "hecho" }, {}, t0)).toBeNull();
  });

  it("lo seguido sólo avisa si falla o si tardó (ya no se estaba mirando)", () => {
    const f = { ...base, tipo: "lote", estado: "hecho" };
    const d = { datos: { seguido: true }, pasos: [{ fase: "hecho" }] };
    expect(avisoDeEncargo(f, d, t0)).toBeNull();
    expect(avisoDeEncargo(f, d, Date.parse(base.created_at) + AVISO_SEGUIDO_MS)?.texto).toBe("Lista «Sofá cama». Está en la galería del Estudio.");
    expect(avisoDeEncargo({ ...f, estado: "fallido", error: "Sin saldo." }, d, t0)).toMatchObject({ tipo: "encargo-fallo", texto: "No salió «Sofá cama»: Sin saldo." });
  });

  it("lo que va a una publicación lleva a ella y dice que ya está puesto", () => {
    const a = avisoDeEncargo({ ...base, tipo: "carrusel", estado: "hecho" }, {
      datos: { comun: { postId: "p1", calendarId: "cal1" }, puestos: [{ postId: "p1", archivos: ["x"] }] },
      pasos: [{ fase: "hecho" }, { fase: "hecho" }, { fase: "fallido" }],
    }, t0);
    expect(a.texto).toBe("Listo el carrusel «Sofá cama» (2 láminas): ya está en su publicación.");
    expect(a.enlace).toBe("/cliente/c1/cal1?publicacion=p1");
  });

  it("el reel dice en qué se quedó: el storyboard por revisar, la voz por confirmar o terminado", () => {
    const f = { ...base, tipo: "reel", estado: "hecho" };
    const pasos = [{ fase: "hecho" }];
    expect(avisoDeEncargo(f, { datos: { video: { fase: "espera" } }, pasos }, t0).texto).toMatch(/storyboard.*revísalo/);
    expect(avisoDeEncargo(f, { datos: { video: { fase: "hecho" }, montaje: { fase: "confirmar", costoTexto: "unos 0,12 $" } }, pasos }, t0).texto)
      .toBe("El montaje del reel «Sofá cama» espera tu sí para la voz (unos 0,12 $).");
    const listo = avisoDeEncargo(f, { datos: { postId: "p1", calendarId: "cal1", video: { fase: "hecho" }, puesto: { postId: "p1", calendarId: "cal1" } }, pasos }, t0);
    expect(listo.texto).toBe("Listo el reel «Sofá cama»: ya está en su publicación.");
    expect(listo.enlace).toBe("/cliente/c1/cal1?publicacion=p1");
  });

  it("el render avisa a quien lo pidió, salvo el de un montaje (lo dice el reel)", () => {
    const fila = { client_id: "c1", titulo: "Video de octubre", origen: "{}" };
    expect(avisoDeRender(fila, { estado: "listo", porId: "u1", adjunto: { postId: "p1", calendarId: "cal1" } }))
      .toMatchObject({ para: ["u1"], tipo: "render", texto: "Listo el video «Video de octubre»: ya está en su publicación.", enlace: "/cliente/c1/cal1?publicacion=p1" });
    expect(avisoDeRender(fila, { estado: "fallido", porId: "u1", error: "Sin voz." }).texto).toBe("Falló el render del video «Video de octubre»: Sin voz.");
    expect(avisoDeRender({ ...fila, origen: JSON.stringify({ tipo: "reel", encargoId: "e1" }) }, { estado: "listo", porId: "u1" })).toBeNull();
    expect(avisoDeRender(fila, { estado: "listo" })).toBeNull();
  });
});
