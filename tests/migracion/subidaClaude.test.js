import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { conEnlace } from "../../worker/lib/mcpVista/modelo.js";
import { datosDeMoov, medidasWebp } from "../../worker/lib/estudio/sonda.js";
import { MAX_SUBIDA_CLAUDE, VIDA_SUBIDA_MS } from "../../worker/lib/estudio/subidaClaude.js";

// ============================================================
// subir_a_galeria / confirmar_subida: lo que Claude hace fuera entra en la galería (y en su publicación)
// ============================================================

const ANA = "u-ana";
const OTRO = "u-otro";
const ORIGEN = "https://calendarios.test";
let db;
let env;
let acceso;

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async head(k) { const o = objetos.get(k); return o ? { size: o.bytes.length } : null; },
    async get(k, op = {}) {
      const o = objetos.get(k);
      if (!o) return null;
      const desde = op.range?.offset ?? 0;
      const b = op.range ? o.bytes.slice(desde, desde + op.range.length) : o.bytes;
      return { body: new Response(b).body, size: o.bytes.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
    },
    async put(k, v) { objetos.set(k, { bytes: v instanceof Uint8Array ? v : new Uint8Array(v instanceof ArrayBuffer ? v : await new Response(v).arrayBuffer()) }); },
    async delete(k) { objetos.delete(k); },
  };
}

// ---------- Un MP4 de mentira con su `moov` AL FINAL (sin faststart) ----------
const caja = (tipo, ...hijos) => {
  const cuerpo = hijos.reduce((s, h) => s + h.length, 0);
  const b = new Uint8Array(8 + cuerpo);
  new DataView(b.buffer).setUint32(0, 8 + cuerpo);
  b.set([...tipo].map((c) => c.charCodeAt(0)), 4);
  let p = 8;
  for (const h of hijos) { b.set(h, p); p += h.length; }
  return b;
};
const bytes = (n, f = (v) => v) => { const b = new Uint8Array(n); f(new DataView(b.buffer)); return b; };
function mp4({ ancho = 1080, alto = 1920, segundos = 30, girado = false, relleno = 5000 } = {}) {
  const ftyp = caja("ftyp", new Uint8Array([0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0]));
  const mdat = caja("mdat", new Uint8Array(relleno).fill(7));
  // mvhd v0: versión+banderas(4), creación(4), modificación(4), escala(4), duración(4), lo demás.
  const mvhd = caja("mvhd", bytes(96, (v) => { v.setUint32(12, 1000); v.setUint32(16, segundos * 1000); }));
  // tkhd v0: 4 + 20 + 8 + 8, la matriz (36) y ancho/alto en 16.16.
  const tkhd = caja("tkhd", bytes(84, (v) => {
    const m = 4 + 20 + 8 + 8;
    if (girado) { v.setInt32(m, 0); v.setInt32(m + 4, 65536); v.setInt32(m + 12, -65536); } else { v.setInt32(m, 65536); v.setInt32(m + 16, 65536); }
    v.setUint32(m + 36, ancho * 65536); v.setUint32(m + 40, alto * 65536);
  }));
  const hdlr = caja("hdlr", bytes(24, (v) => { v.setUint32(8, 0x76696465); }));
  const moov = caja("moov", mvhd, caja("trak", tkhd, caja("mdia", hdlr)));
  const todo = new Uint8Array(ftyp.length + mdat.length + moov.length);
  todo.set(ftyp, 0); todo.set(mdat, ftyp.length); todo.set(moov, ftyp.length + mdat.length);
  return { todo, moov };
}
const PNG = (() => { const b = new Uint8Array(40); b.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10], 0); const v = new DataView(b.buffer); v.setUint32(16, 1080); v.setUint32(20, 1350); return b; })();

const mcp = (usuario = { id: ANA, ownerId: ANA, nombre: "Ana" }) => crearHerramientasMCP({ env, acceso, usuario });
const textoDe = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
const enlaceDe = (texto) => /(\/api\/subir\/[^\s"]+)/.exec(texto)?.[1];
const subidaIdDe = (texto) => /subida_id: ([0-9a-f-]{36})/.exec(texto)?.[1];
const subir = (url, cuerpo, cab = {}) => worker.fetch(new Request(`${ORIGEN}${url}`, {
  method: "PUT", body: cuerpo, headers: { "content-length": String(cuerpo.length), ...cab },
}), env, {});
const ficha = (id) => db.sqlite.prepare("select * from estudio_archivos where id = ?").get(id);
const postDe = (id) => JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal-dic'").get().days)[0].posts.find((p) => p.id === id);

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ASSETS: { fetch: () => new Response("spa") } };
  acceso = crearAcceso(db, ANA);
  const s = db.sqlite;
  for (const [id, email] of [[ANA, "ana@a.com"], [OTRO, "otro@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
  }
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", ANA, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", ANA, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRO, "Ajeno");
  const dias = [{ date: "2026-12-04", posts: [{ id: "p1", format: "reel", title: "Wipes", status: "pending", medios: [] }] }];
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)").run("cal-dic", "c1", ANA, "Diciembre 2026", 11, 2026, JSON.stringify(dias));
  vi.stubGlobal("fetch", async (url) => { throw new Error(`fetch inesperado: ${url}`); });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("medir sin ffprobe", () => {
  it("datosDeMoov: duración y medidas; girado 90°, se cruzan", () => {
    expect(datosDeMoov(mp4().moov)).toEqual({ duracion: 30, ancho: 1080, alto: 1920 });
    expect(datosDeMoov(mp4({ ancho: 1920, alto: 1080, girado: true }).moov)).toMatchObject({ ancho: 1080, alto: 1920 });
    expect(datosDeMoov(new Uint8Array(4))).toEqual({ duracion: 0, ancho: 0, alto: 0 });
  });
  it("medidasWebp: VP8X", () => {
    const b = new Uint8Array(40);
    b.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0); b.set([..."WEBPVP8X"].map((c) => c.charCodeAt(0)), 8);
    b.set([1079 & 255, 1079 >> 8, 0, 1349 & 255, 1349 >> 8, 0], 24);
    expect(medidasWebp(b)).toEqual({ ancho: 1080, alto: 1350 });
  });
});

describe("subir_a_galeria", () => {
  it("está en el MCP y escribe (no es de sólo lectura)", () => {
    for (const n of ["subir_a_galeria", "confirmar_subida"]) expect(HERRAMIENTAS_MCP.find((h) => h.name === n)?.annotations.readOnlyHint).toBe(false);
  });

  it("enlace → PUT del mp4 (moov al final) → ficha medida → confirmar lo pone en el reel", async () => {
    const r = conEnlace(await mcp().llamar("subir_a_galeria", { cliente: "baby", titulo: "Reel wipes 30 s" }), ORIGEN);
    const texto = textoDe(r);
    expect(texto).toContain(`${ORIGEN}/api/subir/`);
    expect(texto).toMatch(/curl -sS -T/);
    const id = subidaIdDe(texto);
    const { todo } = mp4();
    const res = await subir(enlaceDe(texto).replace(ORIGEN, ""), todo);
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j).toMatchObject({ id, tipo: "video", mime: "video/mp4", ancho: 1080, alto: 1920, duracion: 30, bytes: todo.length });
    const f = ficha(id);
    expect(f).toMatchObject({ client_id: "c1", origen: "subida-claude", subido: 1, tipo: "video", prompt: "Reel wipes 30 s" });
    expect(f.clave.startsWith("clientes/c1/estudio/")).toBe(true);
    expect(env.MEDIA.objetos.get(f.clave).bytes.length).toBe(todo.length);

    // Un solo uso.
    expect((await subir(enlaceDe(texto).replace(ORIGEN, ""), todo)).status).toBe(409);

    const c = await mcp().llamar("confirmar_subida", { cliente: "baby", subida_id: id, publicacion_id: "p1" });
    expect(c.isError).toBeUndefined();
    expect(textoDe(c)).toMatch(/1080×1920 · 30 s/);
    expect(textoDe(c)).toMatch(/Puesta en la publicación p1/);
    const post = postDe("p1");
    expect(post.medios).toHaveLength(1);
    expect(post.medios[0]).toMatchObject({ tipo: "video", src: `/api/media/${f.clave}`, ancho: 1080, alto: 1920, duracion: 30 });
    expect(JSON.parse(ficha(id).usado_en)).toEqual([{ calendarId: "cal-dic", postId: "p1" }].map((u) => expect.objectContaining(u)));
  });

  it("confirmar antes de subir dice que aún no llegó", async () => {
    const texto = textoDe(await mcp().llamar("subir_a_galeria", { cliente: "baby" }));
    const r = await mcp().llamar("confirmar_subida", { cliente: "baby", subida_id: subidaIdDe(texto) });
    expect(r.isError).toBe(true);
    expect(textoDe(r)).toMatch(/Todavía no llegó/);
  });

  it("rechaza lo que no es medio (HTML, SVG), un formulario, sin tamaño, el tope y un testigo caducado o tocado", async () => {
    const url = () => mcp().llamar("subir_a_galeria", { cliente: "baby" }).then((r) => enlaceDe(textoDe(r)));
    expect((await subir(await url(), new TextEncoder().encode("<html><script>alert(1)</script></html>"))).status).toBe(415);
    expect((await subir(await url(), new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).status).toBe(415);
    expect((await subir(await url(), PNG, { "content-type": "multipart/form-data; boundary=x" })).status).toBe(400);
    const sinLargo = await worker.fetch(new Request(`${ORIGEN}${await url()}`, { method: "PUT", body: PNG }), env, {});
    expect(sinLargo.status).toBe(411);
    expect((await subir(await url(), PNG, { "content-length": String(MAX_SUBIDA_CLAUDE.video + 1) })).status).toBe(413);
    // Una imagen de más de 15 MB (se dice que pesa eso: el tope por tipo se mira antes de guardar).
    expect((await subir(await url(), PNG, { "content-length": String(MAX_SUBIDA_CLAUDE.imagen + 1) })).status).toBe(413);
    const u = await url();
    expect((await subir(u.slice(0, -3) + "AAA", PNG)).status).toBe(404);
    vi.useFakeTimers({ now: Date.now() + VIDA_SUBIDA_MS + 1000, toFake: ["Date"] });
    expect((await subir(u, PNG)).status).toBe(404);
    vi.useRealTimers();
    // Nada quedó en la galería ni en R2.
    expect(db.sqlite.prepare("select count(*) n from estudio_archivos").get().n).toBe(0);
    expect([...env.MEDIA.objetos.keys()].filter((k) => k.startsWith("clientes/"))).toEqual([]);
  });

  it("una imagen sube con sus medidas; GET no sirve; otro cliente u otro espacio no se resuelven", async () => {
    const u = enlaceDe(textoDe(await mcp().llamar("subir_a_galeria", { cliente: "dcasa", titulo: "Portada" })));
    expect((await worker.fetch(new Request(`${ORIGEN}${u}`), env, {})).status).not.toBe(201);
    const res = await subir(u, PNG);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ tipo: "imagen", ancho: 1080, alto: 1350 });
    const r = await mcp().llamar("subir_a_galeria", { cliente: "Ajeno" });
    expect(r.isError).toBe(true);
  });

  it("un audio va a la biblioteca de sonido como música (o efecto/voz según «uso»)", async () => {
    const mp3 = new Uint8Array(400); mp3.set([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]);
    const u = enlaceDe(textoDe(await mcp().llamar("subir_a_galeria", { cliente: "baby", titulo: "Locución", uso: "voz" })));
    const res = await subir(u, mp3);
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(ficha(j.id)).toMatchObject({ tipo: "audio", modelo: "voz-subida" });
  });

  it("con url: baja por https, comprueba el tipo por sus bytes y lo pone en la publicación", async () => {
    const { todo } = mp4({ segundos: 12 });
    vi.stubGlobal("fetch", async (u) => {
      expect(String(u)).toBe("https://archivos.test/reel.mp4");
      return new Response(todo, { headers: { "content-length": String(todo.length), "content-type": "text/html" } });
    });
    const r = await mcp().llamar("subir_a_galeria", { cliente: "baby", url: "https://archivos.test/reel.mp4", titulo: "Reel", publicacion_id: "p1" });
    expect(r.isError).toBeUndefined();
    expect(textoDe(r)).toMatch(/12 s/);
    expect(postDe("p1").medios[0].duracion).toBe(12);
    const http = await mcp().llamar("subir_a_galeria", { cliente: "baby", url: "http://archivos.test/reel.mp4" });
    expect(http.isError).toBe(true);
  });
});
