import { describe, it, expect, beforeEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { crearEjecutor } from "../../worker/lib/herramientasServidor.js";
import { ContenedorVideo, ESPERA, DORMIR_TRAS_MS } from "../../worker/contenedor.js";
import { EJEMPLO_GUION } from "../../src/lib/videoFormatoIA.js";

// ============================================================
// Ver un cuadro y revisar el video antes de renderizar: el Worker arma el pedido y el Container dibuja
//
// El Container de verdad se prueba aparte (container/probar.mjs, job «contenedor» de CI, contra la imagen construida).
// Aquí, con un Container de mentira que apunta lo que recibe:
//   · el pedido lleva SÓLO lo de ese cliente: las imágenes que nombra el guion y están en SU galería, su logo y su
//     letra; un id de otro cliente no viaja (sale como marcador);
//   · los tiempos de la locución van si la hay; si no, el motor estima;
//   · la ruta da la imagen, y las herramientas la devuelven como imagen (MCP y asistente);
//   · sin Container (en local), 503 diciendo por qué;
//   · el Durable Object arranca el Container, espera a /salud, fija cuándo dormirse y pasa el pedido.
// ============================================================

const JEFE = "u-jefe";
const OTRO = "u-otro";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
let db;
let env;
let recibidos;

function r2(objetos = new Map()) {
  return {
    objetos,
    async get(k) {
      const b = objetos.get(k);
      return b ? { size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } : null;
    },
    async head(k) { return objetos.has(k) ? { size: objetos.get(k).length } : null; },
  };
}

/** Un Container de mentira: apunta cada pedido y contesta como el de verdad. */
function contenedor() {
  return {
    idFromName: (n) => n,
    get: () => ({
      fetch: async (req) => {
        const ruta = new URL(req.url).pathname;
        const cuerpo = await req.json();
        recibidos.push({ ruta, cuerpo });
        if (ruta === "/revisar") {
          return Response.json({ formatos: (cuerpo.formatos ?? ["9:16"]).map((f) => ({ formato: f, problemas: [], texto: `Revisión (${f}): sin problemas.` })), faltan: [] });
        }
        return new Response(JPEG, { headers: { "Content-Type": "image/jpeg", "X-Escena": "e2", "X-Segundo": String(cuerpo.t ?? 0), "X-Total": "13.75" } });
      },
    }),
  };
}

const pedir = (ruta) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, { headers: { Cookie: `${COOKIE}=t-jefe` } }), env);

beforeEach(async () => {
  db = d1EnMemoria();
  recibidos = [];
  const s = db.sqlite;
  for (const [id, email] of [[JEFE, "jefe@a.com"], [OTRO, "otro@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "y");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
  }
  const kit = { logo: "clientes/bc/logo.png", fuente: { clave: "clientes/bc/fuentes/marca.ttf", nombre: "Marca", muestra: "clientes/bc/muestra.png" }, paleta: [{ hex: "#112233", nombre: "Noche", rol: "Fondo principal" }] };
  s.prepare("insert into clients (id, owner_id, name, kit_marca) values (?,?,?,?)").run("bc", JEFE, "Cliente Uno", JSON.stringify(kit));
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("ajeno", OTRO, "Ajeno");
  const ahora = "2026-11-01T00:00:00.000Z";
  const archivo = (id, cliente, dueno, clave) => s.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime) values (?,?,?,?,?,?)")
    .run(id, dueno, cliente, clave, "imagen", "image/png");
  archivo("foto-1", "bc", JEFE, "clientes/bc/foto.png");
  archivo("foto-ajena", "ajeno", OTRO, "clientes/ajeno/foto.png");
  env = {
    DB: db, ASSETS: { fetch: async () => new Response("") }, VIDEO: contenedor(),
    MEDIA: r2(new Map([
      ["clientes/bc/foto.png", new Uint8Array([1, 2, 3, 4])], ["clientes/ajeno/foto.png", new Uint8Array([9, 9])],
      ["clientes/bc/logo.png", new Uint8Array([5, 6])], ["clientes/bc/fuentes/marca.ttf", new Uint8Array([7, 7, 7])],
    ])),
  };
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)").run(await sha256("t-jefe"), JEFE, ahora, "2099-01-01T00:00:00.000Z");
}, 30_000);

/** Un video del ejemplo neutro con una imagen de la galería del cliente y otra de otro cliente. */
async function video({ locucion = null } = {}) {
  const g = JSON.parse(JSON.stringify(EJEMPLO_GUION));
  g.escenas[1].capas.push({ tipo: "imagen", id: "f", archivo: "foto-1", pos: "abajo", tam: 0.5 });
  g.escenas[2].capas.push({ tipo: "imagen", id: "x", archivo: "foto-ajena", pos: "arriba", tam: 0.3 });
  const h = crearHerramientasMCP({ env, acceso: crearAcceso(db, JEFE), usuario: { id: JEFE, nombre: "Juan" } });
  const r = await h.llamar("crear_video", { cliente: "Cliente Uno", guion: g });
  const id = /\(ID ([0-9a-f-]{36})\)/.exec(r.content[0].text)[1];
  if (locucion) db.sqlite.prepare("update videos_proyectos set locucion = ? where id = ?").run(JSON.stringify(locucion), id);
  return { id, h };
}

describe("ver un cuadro por la ruta", () => {
  it("manda al Container sólo lo de ESE cliente (su imagen, su logo, su letra, su paleta) y devuelve la imagen", async () => {
    const { id } = await video();
    const r = await pedir(`/videos/bc/${id}/cuadro?t=5.2`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("x-escena")).toBe("e2");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(JPEG);
    const [{ ruta, cuerpo }] = recibidos;
    expect(ruta).toBe("/cuadro");
    expect(cuerpo).toMatchObject({ t: 5.2, ancho: 540, formato: "9:16", palabras: null, paleta: [{ hex: "#112233", rol: "Fondo principal" }] });
    expect(Object.keys(cuerpo.imagenes)).toEqual(["foto-1"]);
    expect(cuerpo.imagenes["foto-1"]).toBe(Buffer.from([1, 2, 3, 4]).toString("base64"));
    expect(cuerpo.logo).toBe(Buffer.from([5, 6]).toString("base64"));
    expect(cuerpo.fuentes.titular.datos).toBe(Buffer.from([7, 7, 7]).toString("base64"));
    // Nada de otro cliente viaja.
    expect(JSON.stringify(cuerpo)).not.toContain(Buffer.from([9, 9]).toString("base64"));
  });

  it("con la locución lista, van sus tiempos; la hoja y la revisión también salen por aquí", async () => {
    const palabras = [{ desde: 0, hasta: 0.3 }];
    const { id } = await video({ locucion: { estado: "lista", palabras } });
    await pedir(`/videos/bc/${id}/hoja?formato=1:1`);
    expect(recibidos[0]).toMatchObject({ ruta: "/hoja", cuerpo: { palabras, formato: "1:1", ancho: 1080 } });
    const rev = await (await pedir(`/videos/bc/${id}/revision?formatos=9:16,16:9`)).json();
    expect(rev.formatos.map((f) => f.formato)).toEqual(["9:16", "16:9"]);
  });

  it("sin Container (en local) es 503 diciendo por qué; un video de otro cliente no existe", async () => {
    const { id } = await video();
    delete env.VIDEO;
    const r = await pedir(`/videos/bc/${id}/cuadro`);
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/no está disponible aquí/);
    expect((await pedir(`/videos/ajeno/${id}/cuadro`)).status).toBe(404);
  });
});

describe("Claude mira el video: las herramientas devuelven la imagen", () => {
  it("ver_cuadro por escena manda su instante «lleno» y vuelve como bloque de imagen del MCP; avisa de lo que falta", async () => {
    const { id, h } = await video();
    const r = await h.llamar("ver_cuadro", { cliente: "Cliente Uno", video_id: id, escena: "e2" });
    expect(r.isError).toBeUndefined();
    expect(r.content[0]).toMatchObject({ type: "text" });
    expect(r.content[0].text).toMatch(/escena e2/);
    expect(r.content[0].text).toMatch(/foto-ajena/);
    expect(r.content[1]).toEqual({ type: "image", mimeType: "image/jpeg", data: Buffer.from(JPEG).toString("base64") });
    expect(recibidos[0].cuerpo.t).toBeGreaterThan(0);
    // Una escena que no existe: dice cuáles hay.
    const mal = await h.llamar("ver_cuadro", { cliente: "Cliente Uno", video_id: id, escena: "zz" });
    expect(mal.isError).toBe(true);
    expect(mal.content[0].text).toMatch(/Las que hay: e1, e2, e3/);
  });

  it("ver_escenas da una imagen; revisar_video da texto; en el MCP las tres son de sólo lectura", async () => {
    const { id, h } = await video();
    const hoja = await h.llamar("ver_escenas", { cliente: "Cliente Uno", video_id: id });
    expect(hoja.content.map((c) => c.type)).toEqual(["text", "image"]);
    const rev = await h.llamar("revisar_video", { cliente: "Cliente Uno", video_id: id });
    expect(rev.content[0].text).toMatch(/Revisión \(9:16\): sin problemas/);
    expect(rev.content[0].text).toMatch(/foto-ajena/);
    const por = Object.fromEntries(HERRAMIENTAS_MCP.map((x) => [x.name, x]));
    for (const n of ["ver_cuadro", "ver_escenas", "revisar_video"]) {
      expect(por[n].annotations.readOnlyHint).toBe(true);
      expect(por[n].inputSchema.required).toEqual(expect.arrayContaining(["cliente", "video_id"]));
    }
  });

  it("en el asistente, la imagen va dentro del tool_result", async () => {
    const { id } = await video();
    const ejecutor = crearEjecutor({
      env, acceso: crearAcceso(db, JEFE),
      estudio: { usuario: { id: JEFE }, por: null, origen: "asistente" },
    });
    const r = await ejecutor.ejecutar({ id: "t1", name: "ver_cuadro", input: { cliente: "Cliente Uno", video_id: id, segundo: 1 } });
    expect(r.is_error).toBeUndefined();
    expect(r.content[0]).toMatchObject({ type: "text" });
    expect(r.content[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(JPEG).toString("base64") } });
  });
});

describe("el Durable Object del Container", () => {
  /** Un `ctx.container` de mentira: /salud falla `fallos` veces antes de contestar. */
  function estado({ corriendo = false, fallos = 1 } = {}) {
    const c = {
      running: corriendo, inicios: [], timeouts: [], pedidos: [],
      start(op) { this.inicios.push(op); this.running = true; },
      async setInactivityTimeout(ms) { this.timeouts.push(ms); },
      getTcpPort: (puerto) => ({
        fetch: async (u, init) => {
          const req = typeof u === "string" ? new Request(u, init) : u;
          c.pedidos.push({ puerto, ruta: new URL(req.url).pathname, metodo: req.method });
          if (new URL(req.url).pathname === "/salud") {
            if (fallos-- > 0) throw new Error("todavía no escucha");
            return new Response("ok");
          }
          return new Response(`dibujado ${await req.text()}`);
        },
      }),
    };
    return { container: c, blockConcurrencyWhile: async (f) => f() };
  }

  it("lo arranca sin internet, fija cuándo dormirse, espera a /salud y pasa el pedido por el puerto 8080", async () => {
    ESPERA.pausaMs = 1;
    const st = estado();
    const r = await new ContenedorVideo(st, {}).fetch(new Request("https://contenedor/cuadro", { method: "POST", body: "{\"t\":1}" }));
    expect(await r.text()).toBe("dibujado {\"t\":1}");
    expect(st.container.inicios).toEqual([{ enableInternet: false }]);
    expect(st.container.timeouts).toContain(DORMIR_TRAS_MS);
    expect(st.container.pedidos.map((p) => `${p.puerto} ${p.ruta}`)).toEqual(["8080 /salud", "8080 /salud", "8080 /cuadro"]);
  });

  it("sin Container (en local, `dev.enable_containers: false`) contesta 503 diciendo por qué", async () => {
    const r = await new ContenedorVideo({ container: undefined, blockConcurrencyWhile: async (f) => f() }, {})
      .fetch(new Request("https://contenedor/cuadro", { method: "POST", body: "{}" }));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/en local no se arranca/);
  });

  it("despierto no lo vuelve a arrancar; si no contesta a tiempo, 503 con el motivo", async () => {
    ESPERA.pausaMs = 1;
    const st = estado({ corriendo: true, fallos: 0 });
    await new ContenedorVideo(st, {}).fetch(new Request("https://contenedor/hoja", { method: "POST", body: "{}" }));
    expect(st.container.inicios).toEqual([]);
    const antes = ESPERA.arranqueMs;
    ESPERA.arranqueMs = 20;
    try {
      const muerto = estado({ fallos: 1e9 });
      const r = await new ContenedorVideo(muerto, {}).fetch(new Request("https://contenedor/cuadro", { method: "POST", body: "{}" }));
      expect(r.status).toBe(503);
      expect((await r.json()).error).toMatch(/no arrancó a tiempo: todavía no escucha/);
    } finally {
      ESPERA.arranqueMs = antes;
    }
    vi.restoreAllMocks();
  });
});
