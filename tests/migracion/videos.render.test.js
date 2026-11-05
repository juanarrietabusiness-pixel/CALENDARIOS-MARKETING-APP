import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP } from "../../worker/lib/mcp.js";
import { ejecutarRender } from "../../worker/lib/estudio/render.js";
import { RenderVideo } from "../../worker/contenedor.js";
import { EJEMPLO_GUION } from "../../src/lib/videoFormatoIA.js";
import { PLAZO_RENDER_MS } from "../../src/lib/renderVideo.js";

// ============================================================
// El RENDER a mp4 del video animado, del lado del Worker
//
// El Container de verdad (que dibuja y llama a ffmpeg) se prueba aparte: container/probar.mjs, job «contenedor» de CI.
// Aquí, con un Container de mentira que devuelve un mp4 mínimo:
//   · sólo se renderiza el guion aprobado de esta versión con SU locución; si no, 409 con el motivo;
//   · pedirlo deja el video «Renderizando» y lo encarga al Durable Object del render (contesta en el acto);
//   · el render manda la toma de la voz y lo de ESE cliente; el mp4 va a R2, a la galería (sin costo) y a su
//     publicación, en el sitio del render anterior de este video;
//   · un encargo viejo (otro intento) no pisa nada; un fallo del Container queda como «Falló el render» con su motivo;
//   · uno que se quedó a medias pasado el plazo se da por fallido al leerlo;
//   · mientras se renderiza no se edita ni se borra; el Durable Object apunta el encargo y lo hace en su alarma.
// ============================================================

const JEFE = "u-jefe";
const MP4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 1, 2, 3]);
const VOZ = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 9, 9, 9]);
const CLAVE_VOZ = "clientes/bc/estudio/2026-11/2026-11-04-locucion-x.mp3";
let db;
let env;
let encargos;

function r2(objetos = new Map()) {
  return {
    objetos,
    async get(k) {
      const b = objetos.get(k);
      return b ? { size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } : null;
    },
    async head(k) { return objetos.has(k) ? { size: objetos.get(k).length } : null; },
    async put(k, v) { objetos.set(k, v instanceof Uint8Array ? v : new Uint8Array(v)); },
  };
}

/** El Durable Object del render, de mentira: apunta cada encargo. */
const renderDO = () => ({
  idFromName: (n) => n,
  get: (n) => ({ fetch: async (req) => { encargos.push({ nombre: n, cuerpo: await req.json() }); return new Response("{}", { status: 202 }); } }),
});

/** Un Container de mentira para el render: apunta el pedido y devuelve el mp4 con las cabeceras del de verdad. */
function container(recibidos, { estado = 200, error = "" } = {}) {
  return async (ruta, cuerpo) => {
    recibidos.push({ ruta, cuerpo });
    if (estado !== 200) return Response.json({ error }, { status: estado });
    return new Response(MP4, {
      headers: {
        "Content-Type": "video/mp4", "X-Duracion": "13.8", "X-Cuadros": "414", "X-Ancho": "1080", "X-Alto": "1920",
        "X-Lufs": "-14.02", "X-Lufs-Antes": "-31.5", "X-Ms-Audio": "900", "X-Ms-Video": "9000",
      },
    });
  };
}

const pedir = (ruta, init = {}) => worker.fetch(new Request(`https://calendarios.test/api${ruta}`, {
  ...init, headers: { Cookie: `${COOKIE}=t-jefe`, "Content-Type": "application/json", ...(init.headers ?? {}) },
}), env);
const fila = (id) => db.sqlite.prepare("select * from videos_proyectos where id = ?").get(id);
const dias = () => JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal1'").get().days);

beforeEach(async () => {
  db = d1EnMemoria();
  encargos = [];
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "y");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("bc", JEFE, "Cliente Uno");
  const posts = [{ id: "p1", format: "reel", status: "pending", medios: [{ src: "/api/media/clientes/bc/otra.jpg", tipo: "imagen" }] }];
  s.prepare("insert into calendars (id, client_id, owner_id, month, year, days) values (?,?,?,?,?,?)")
    .run("cal1", "bc", JEFE, 10, 2026, JSON.stringify([{ date: "2026-11-20", posts }]));
  env = { DB: db, ASSETS: { fetch: async () => new Response("") }, RENDER: renderDO(), MEDIA: r2(new Map([[CLAVE_VOZ, VOZ]])) };
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("t-jefe"), JEFE, "2026-11-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
}, 30_000);

/** Un video del ejemplo neutro ligado a la publicación p1; `listo`: aprobado y con la locución de su versión. */
async function video({ listo = true } = {}) {
  const r = await pedir("/videos/bc", { method: "POST", body: JSON.stringify({ guion: EJEMPLO_GUION, calendarId: "cal1", postId: "p1" }) });
  const { video: v } = await r.json();
  if (listo) {
    const locucion = { estado: "lista", clave: CLAVE_VOZ, version: 1, palabras: null, duracion: 12 };
    db.sqlite.prepare("update videos_proyectos set estado = 'aprobado', aprobada_version = 1, locucion = ? where id = ?").run(JSON.stringify(locucion), v.id);
  }
  return v.id;
}

const renderizar = (id, version = 1) => pedir(`/videos/bc/${id}/render`, { method: "POST", body: JSON.stringify({ version }) });

describe("pedir el render", () => {
  it("sin aprobar o sin la locución de esta versión, 409 con el motivo", async () => {
    const id = await video({ listo: false });
    let r = await renderizar(id);
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/aprueba el guion/);
    db.sqlite.prepare("update videos_proyectos set estado = 'aprobado', aprobada_version = 1 where id = ?").run(id);
    r = await renderizar(id);
    expect((await r.json()).error).toMatch(/genera la locución/);
    db.sqlite.prepare("update videos_proyectos set locucion = ? where id = ?").run(JSON.stringify({ estado: "lista", clave: CLAVE_VOZ, version: 1, desfasada: true }), id);
    expect((await (await renderizar(id)).json()).error).toMatch(/otra versión/);
    expect(encargos).toEqual([]);
  });

  it("lo deja «Renderizando» y lo encarga al objeto de ESE video; mientras tanto no se edita ni se borra", async () => {
    const id = await video();
    const r = await renderizar(id);
    expect(r.status).toBe(202);
    expect((await r.json()).video.estado).toBe("renderizando");
    expect(encargos).toHaveLength(1);
    expect(encargos[0].nombre).toBe(id);
    const render = JSON.parse(fila(id).render);
    expect(encargos[0].cuerpo).toEqual({ ownerId: JEFE, clienteId: "bc", videoId: id, intento: render.intento });
    expect(render).toMatchObject({ estado: "en_curso", version: 1, por: "Juan" });
    // Otra vez, ya no: se está renderizando.
    expect((await (await renderizar(id)).json()).error).toMatch(/Ya se está renderizando/);
    const g = JSON.parse(JSON.stringify(EJEMPLO_GUION));
    g.titulo = "Otro título";
    expect((await pedir(`/videos/bc/${id}`, { method: "PUT", body: JSON.stringify({ guion: g, version: 1 }) })).status).toBe(409);
    expect((await pedir(`/videos/bc/${id}`, { method: "DELETE" })).status).toBe(409);
  });

  it("sin el objeto del render (en local) es 503 y el video no se queda «Renderizando»", async () => {
    const id = await video();
    delete env.RENDER;
    expect((await renderizar(id)).status).toBe(503);
    expect(fila(id).estado).toBe("aprobado");
  });
});

describe("hacer el render (la alarma del objeto)", () => {
  async function encargado() {
    const id = await video();
    await renderizar(id);
    return { id, encargo: encargos.at(-1).cuerpo };
  }

  it("manda la voz y lo del cliente; el mp4 va a R2, a la galería y a su publicación (primero)", async () => {
    const { id, encargo } = await encargado();
    const recibidos = [];
    const r = await ejecutarRender(env, encargo, container(recibidos));
    expect(r.estado).toBe("listo");
    expect(recibidos[0].ruta).toBe("/render");
    expect(recibidos[0].cuerpo.audio).toBe(Buffer.from(VOZ).toString("base64"));
    expect(recibidos[0].cuerpo.guion.escenas.length).toBe(EJEMPLO_GUION.escenas.length);

    const f = fila(id);
    expect(f.estado).toBe("renderizado");
    const render = JSON.parse(f.render);
    expect(render).toMatchObject({ estado: "listo", ancho: 1080, alto: 1920, duracion: 13.8, lufs: -14.02, adjunto: { calendarId: "cal1", postId: "p1" } });
    expect(render.clave).toMatch(/^clientes\/bc\/estudio\/.+\.mp4$/);
    expect(env.MEDIA.objetos.get(render.clave)).toEqual(MP4);

    const archivo = db.sqlite.prepare("select * from estudio_archivos where id = ?").get(render.archivoId);
    expect(archivo).toMatchObject({ tipo: "video", mime: "video/mp4", costo: 0, client_id: "bc", clave: render.clave });
    expect(JSON.parse(archivo.usado_en)[0]).toMatchObject({ calendarId: "cal1", postId: "p1" });

    const medios = dias()[0].posts[0].medios;
    expect(medios[0]).toMatchObject({ src: `/api/media/${render.clave}`, tipo: "video", videoAnimado: id, duracion: 13.8 });
    expect(medios[1].src).toBe("/api/media/clientes/bc/otra.jpg");
  });

  it("manda el sonido: los efectos (encendidos por defecto) y la música de la galería con su volumen; sin ella, avisa", async () => {
    const { encargo } = await encargado();
    const recibidos = [];
    await ejecutarRender(env, encargo, container(recibidos));
    expect(recibidos[0].cuerpo.efectos).toBe(true);
    expect(recibidos[0].cuerpo.musica).toBeUndefined();

    // Con música (y los efectos apagados).
    const id2 = await video();
    const MUSICA = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 1, 2, 3, 4]);
    env.MEDIA.objetos.set("clientes/bc/estudio/tema.mp3", MUSICA);
    db.sqlite.prepare("insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, modelo, prompt) values (?,?,?,?,?,?,?,?)")
      .run("m1", JEFE, "bc", "clientes/bc/estudio/tema.mp3", "audio", "audio/mpeg", "musica-subida", "Tema.mp3");
    expect((await pedir(`/videos/bc/${id2}/sonido`, { method: "PUT", body: JSON.stringify({ efectos: false, musica: { archivoId: "m1", volumen: 4 } }) })).status).toBe(200);
    await renderizar(id2);
    const otros = [];
    await ejecutarRender(env, encargos.at(-1).cuerpo, container(otros));
    expect(otros[0].cuerpo.efectos).toBe(false);
    expect(otros[0].cuerpo.musica).toEqual({ audio: Buffer.from(MUSICA).toString("base64"), volumen: 4 });
    expect(JSON.parse(fila(id2).render)).toMatchObject({ estado: "listo", efectos: false, musica: "Tema" });

    // La música se borró de R2: sale igual, sin ella, y lo dice.
    env.MEDIA.objetos.delete("clientes/bc/estudio/tema.mp3");
    db.sqlite.prepare("update videos_proyectos set estado = 'con_voz' where id = ?").run(id2);
    await renderizar(id2);
    const sin = [];
    expect((await ejecutarRender(env, encargos.at(-1).cuerpo, container(sin))).estado).toBe("listo");
    expect(sin[0].cuerpo.musica).toBeUndefined();
    expect(JSON.parse(fila(id2).render).aviso).toMatch(/música de fondo ya no está/);
  });

  it("sin música en «Sonido», usa la del GUION por su clave (su volumen 0–1 en dB); la de «Sonido» manda sobre ella", async () => {
    const { id, encargo } = await encargado();
    const MUSICA = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 9, 9, 9, 9]);
    env.MEDIA.objetos.set("clientes/bc/estudio/guion.mp3", MUSICA);
    const g = JSON.parse(fila(id).guion);
    g.musica = { clave: "clientes/bc/estudio/guion.mp3", volumen: 0.7, bajarConVoz: true };
    db.sqlite.prepare("update videos_proyectos set guion = ? where id = ?").run(JSON.stringify(g), id);
    const recibidos = [];
    expect((await ejecutarRender(env, encargo, container(recibidos))).estado).toBe("listo");
    expect(recibidos[0].cuerpo.musica).toEqual({ audio: Buffer.from(MUSICA).toString("base64"), volumen: 6 });
    // Una clave de OTRO cliente en el guion no se usa.
    g.musica.clave = "clientes/otro/estudio/x.mp3";
    env.MEDIA.objetos.set("clientes/otro/estudio/x.mp3", MUSICA);
    db.sqlite.prepare("update videos_proyectos set guion = ?, estado = 'con_voz' where id = ?").run(JSON.stringify(g), id);
    await renderizar(id);
    const otros = [];
    await ejecutarRender(env, encargos.at(-1).cuerpo, container(otros));
    expect(otros[0].cuerpo.musica).toBeUndefined();
  });

  it("otro render del mismo video ocupa el sitio del anterior en la publicación", async () => {
    const { id, encargo } = await encargado();
    await ejecutarRender(env, encargo, container([]));
    const primero = JSON.parse(fila(id).render).clave;
    await renderizar(id);
    await ejecutarRender(env, encargos.at(-1).cuerpo, container([]));
    const segundo = JSON.parse(fila(id).render).clave;
    expect(segundo).not.toBe(primero);
    const medios = dias()[0].posts[0].medios;
    expect(medios.filter((m) => m.videoAnimado === id).map((m) => m.src)).toEqual([`/api/media/${segundo}`]);
    expect(medios).toHaveLength(2);
  });

  it("una publicación ya publicada no se toca: el mp4 queda en la galería y se dice", async () => {
    const d = dias();
    d[0].posts[0].status = "published";
    db.sqlite.prepare("update calendars set days = ? where id = 'cal1'").run(JSON.stringify(d));
    const { id, encargo } = await encargado();
    await ejecutarRender(env, encargo, container([]));
    const render = JSON.parse(fila(id).render);
    expect(render.adjunto).toBeNull();
    expect(render.aviso).toMatch(/ya salió/);
    expect(dias()[0].posts[0].medios).toHaveLength(1);
  });

  it("un encargo viejo (otro intento) no hace nada; un fallo del Container queda escrito con su motivo", async () => {
    const { id, encargo } = await encargado();
    const recibidos = [];
    expect(await ejecutarRender(env, { ...encargo, intento: "otro" }, container(recibidos))).toBeNull();
    expect(recibidos).toEqual([]);
    expect(fila(id).estado).toBe("renderizando");

    await ejecutarRender(env, encargo, container([], { estado: 500, error: "El dibujo falló: sin memoria" }));
    expect(fila(id).estado).toBe("fallido");
    expect(JSON.parse(fila(id).render)).toMatchObject({ estado: "fallido", error: "El dibujo falló: sin memoria" });
    // Desde «Falló el render» se puede pedir otra vez.
    expect((await renderizar(id)).status).toBe(202);
  });

  it("si el audio de la voz ya no está, falla diciéndolo (sin llamar al Container)", async () => {
    const { id, encargo } = await encargado();
    env.MEDIA.objetos.delete(CLAVE_VOZ);
    const recibidos = [];
    await ejecutarRender(env, encargo, container(recibidos));
    expect(recibidos).toEqual([]);
    expect(JSON.parse(fila(id).render).error).toMatch(/audio de la locución/);
  });

  it("uno que se quedó a medias pasado el plazo se da por fallido al leerlo", async () => {
    const { id } = await encargado();
    const render = JSON.parse(fila(id).render);
    render.pedidoAt = new Date(Date.now() - PLAZO_RENDER_MS - 1000).toISOString();
    db.sqlite.prepare("update videos_proyectos set render = ? where id = ?").run(JSON.stringify(render), id);
    const v = (await (await pedir(`/videos/bc/${id}`)).json()).video;
    expect(v.estado).toBe("fallido");
    expect(v.render.error).toMatch(/no terminó a tiempo/);
  });
});

describe("el Durable Object del render", () => {
  it("apunta el encargo y pone la alarma; la alarma arranca el Container, le pide el render y borra el encargo", async () => {
    const id = await video();
    await renderizar(id);
    const encargo = encargos.at(-1).cuerpo;
    const guardado = new Map();
    let alarma = null;
    const pedidos = [];
    let arrancado = false;
    const state = {
      storage: {
        put: async (k, v) => { guardado.set(k, v); }, get: async (k) => guardado.get(k), delete: async (k) => { guardado.delete(k); },
        setAlarm: async (t) => { alarma = t; },
      },
      blockConcurrencyWhile: async (f) => f(),
      container: {
        get running() { return arrancado; },
        start: () => { arrancado = true; },
        setInactivityTimeout: async () => {},
        getTcpPort: () => ({
          fetch: async (req) => {
            const ruta = new URL(typeof req === "string" ? req : req.url).pathname;
            if (ruta === "/salud") return new Response("ok");
            pedidos.push(ruta);
            return container([])(ruta, await req.json());
          },
        }),
      },
    };
    const objeto = new RenderVideo(state, env);
    const r = await objeto.fetch(new Request("https://render/encargar", { method: "POST", body: JSON.stringify(encargo) }));
    expect(r.status).toBe(202);
    expect(guardado.get("encargo")).toEqual(encargo);
    expect(typeof alarma).toBe("number");
    expect((await objeto.fetch(new Request("https://render/encargar", { method: "POST", body: "{}" }))).status).toBe(400);

    await objeto.alarm();
    expect(arrancado).toBe(true);
    expect(pedidos).toEqual(["/render"]);
    expect(guardado.has("encargo")).toBe(false);
    expect(fila(id).estado).toBe("renderizado");
  });
});

describe("Claude lo pide por MCP", () => {
  it("renderizar_video lo encarga y ver_video dice cómo quedó", async () => {
    const id = await video();
    const h = crearHerramientasMCP({ env, acceso: crearAcceso(db, JEFE), usuario: { id: JEFE, nombre: "Juan" } });
    const r = await h.llamar("renderizar_video", { cliente: "Cliente Uno", video_id: id, version: 1 });
    expect(r.content[0].text).toMatch(/Render encargado/);
    await ejecutarRender(env, encargos.at(-1).cuerpo, container([]));
    const v = await h.llamar("ver_video", { cliente: "Cliente Uno", video_id: id });
    expect(v.content[0].text).toMatch(/Render: mp4 de 13\.8 s, 1080×1920/);
    expect(v.content[0].text).toMatch(/Listo: el mp4 está en la galería y en su publicación/);
  });
});

describe("ligar el video a una publicación cuando se quiera", () => {
  /** Un video SIN publicación, aprobado y con su locución. */
  async function suelto() {
    const r = await pedir("/videos/bc", { method: "POST", body: JSON.stringify({ guion: EJEMPLO_GUION }) });
    const { video: v } = await r.json();
    db.sqlite.prepare("update videos_proyectos set estado = 'aprobado', aprobada_version = 1, locucion = ? where id = ?")
      .run(JSON.stringify({ estado: "lista", clave: CLAVE_VOZ, version: 1 }), v.id);
    return v.id;
  }
  const ligar = (id, postId) => pedir(`/videos/bc/${id}/publicacion`, { method: "POST", body: JSON.stringify({ postId }) });

  it("ya renderizado: ligarlo pone el mp4 en el post al momento, sin renderizar otra vez", async () => {
    const id = await suelto();
    await renderizar(id);
    await ejecutarRender(env, encargos.at(-1).cuerpo, container([]));
    let render = JSON.parse(fila(id).render);
    expect(render.adjunto).toBeNull();
    expect(dias()[0].posts[0].medios).toHaveLength(1);

    const r = await ligar(id, "p1");
    expect(r.status).toBe(200);
    expect((await r.json()).puesto).toEqual({ calendarId: "cal1", postId: "p1" });
    expect(dias()[0].posts[0].medios[0]).toMatchObject({ src: `/api/media/${render.clave}`, videoAnimado: id });
    render = JSON.parse(fila(id).render);
    expect(render.adjunto).toEqual({ calendarId: "cal1", postId: "p1" });
    const archivo = db.sqlite.prepare("select usado_en from estudio_archivos where id = ?").get(render.archivoId);
    expect(JSON.parse(archivo.usado_en)[0]).toMatchObject({ calendarId: "cal1", postId: "p1" });
    expect(encargos).toHaveLength(1); // no se volvió a renderizar
  });

  it("sin mp4 todavía, sólo queda ligado (se pondrá al terminar); desligar no saca nada del post", async () => {
    const id = await suelto();
    const r = await (await ligar(id, "p1")).json();
    expect(r.puesto).toBeNull();
    expect(fila(id)).toMatchObject({ calendar_id: "cal1", post_id: "p1" });
    await renderizar(id);
    await ejecutarRender(env, encargos.at(-1).cuerpo, container([]));
    expect(dias()[0].posts[0].medios[0].videoAnimado).toBe(id);
    await ligar(id, "");
    expect(fila(id)).toMatchObject({ calendar_id: null, post_id: null });
    expect(dias()[0].posts[0].medios[0].videoAnimado).toBe(id);
  });

  it("una publicación que no es de este cliente no se liga; mientras renderiza, tampoco se cambia", async () => {
    const id = await suelto();
    expect((await ligar(id, "no-existe")).status).toBe(404);
    await renderizar(id);
    expect((await ligar(id, "p1")).status).toBe(409);
  });

  it("Claude: ligar_video, y renderizar_video con publicacion_id liga antes de renderizar", async () => {
    const id = await suelto();
    const h = crearHerramientasMCP({ env, acceso: crearAcceso(db, JEFE), usuario: { id: JEFE, nombre: "Juan" } });
    const r = await h.llamar("renderizar_video", { cliente: "Cliente Uno", video_id: id, version: 1, publicacion_id: "p1" });
    expect(r.content[0].text).toMatch(/se pone en la publicación p1/);
    await ejecutarRender(env, encargos.at(-1).cuerpo, container([]));
    expect(dias()[0].posts[0].medios[0].videoAnimado).toBe(id);
    const fuera = await h.llamar("ligar_video", { cliente: "Cliente Uno", video_id: id, publicacion_id: "" });
    expect(fuera.content[0].text).toMatch(/ya no va ligado/);
    const otra = await h.llamar("ligar_video", { cliente: "Cliente Uno", video_id: id, publicacion_id: "p1" });
    expect(otra.content[0].text).toMatch(/ya está puesto/);
  });
});
