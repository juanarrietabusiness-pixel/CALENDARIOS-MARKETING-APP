import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { ruta } from "../utils/repo.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import {
  enlaceLimpio, plataformaDe, formatoPorEnlace, filtrarBanco, limpiarIdea, nuevaIdea, tituloDeIdea, esReferencia, ideaDeFila, deLoCompartido,
} from "../../src/lib/bancoIdeas.js";

// ============================================================
// El banco de ideas único, contra una D1 de verdad
//
// Lo que se cuida: que las ideas que cada cliente tenía en su fila pasen a
// la tabla con su cliente (y que reaplicar no resucite las borradas), que
// una idea sin cliente salga en el banco de TODOS los clientes, que asignarle
// uno la saque de los demás, que nadie de fuera vea nada y que un
// colaborador sólo toque las de sus clientes.
// ============================================================

const JEFE = "u-jefe";
const ANA = "u-ana";
const OTRA = "u-otra";
const COLAB = "u-colab";
const TESTIGO = { [JEFE]: "t-jefe", [ANA]: "t-ana", [OTRA]: "t-otra", [COLAB]: "t-colab" };
let db;
let env;

async function sembrar() {
  const s = db.sqlite;
  for (const id of [JEFE, ANA, OTRA, COLAB]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, `${id}@a.com`, "x", "x");
    s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
      .run(await sha256(TESTIGO[id]), id, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  }
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(ANA, JEFE, "editor", "Ana", "#00AA00");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(OTRA, OTRA, "admin", "Otra", "#123456");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color, clientes) values (?,?,?,?,?,?)").run(COLAB, JEFE, "editor", "Colab", "#654321", '["c1"]');
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRA, "Ajeno");
}

const pedir = (quien, camino, opciones = {}) => worker.fetch(new Request(`https://calendarios.test${camino}`, {
  ...opciones,
  headers: { Cookie: `${COOKIE}=${TESTIGO[quien]}`, "Content-Type": "application/json" },
  body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
}), env, {});

const lista = async (quien, cliente = "") => (await (await pedir(quien, `/api/banco-ideas${cliente ? `?cliente=${cliente}` : ""}`)).json()).ideas;
const guardar = (quien, clienteId, idea) => pedir(quien, "/api/banco-ideas", { method: "POST", body: { clienteId, idea } });

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, ASSETS: { fetch: async () => new Response("") } };
  await sembrar();
  // Sin red en los tests: un oEmbed que no se haya preparado no contesta.
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("lo puro", () => {
  it("saca el enlace de lo que se comparte desde el teléfono", () => {
    expect(enlaceLimpio("Mira este video https://vm.tiktok.com/ZMabc/ 😍")).toBe("https://vm.tiktok.com/ZMabc/");
    expect(enlaceLimpio("«https://www.instagram.com/reel/C1x2y3/?igsh=abc».")).toBe("https://www.instagram.com/reel/C1x2y3/?igsh=abc");
    expect(enlaceLimpio("sin enlace")).toBe("");
    expect(enlaceLimpio("javascript:alert(1)")).toBe("");
  });

  it("reconoce la red y sugiere el formato", () => {
    expect(plataformaDe("https://www.instagram.com/reel/abc/")).toBe("instagram");
    expect(plataformaDe("https://vm.tiktok.com/ZM/")).toBe("tiktok");
    expect(plataformaDe("https://youtu.be/xyz")).toBe("youtube");
    expect(plataformaDe("https://fb.watch/abc")).toBe("facebook");
    expect(plataformaDe("https://ejemplo.com/a")).toBe("web");
    expect(plataformaDe("no es un enlace")).toBe("");
    // Un dominio que sólo se PARECE no cuenta.
    expect(plataformaDe("https://instagram.com.malo.net/x")).toBe("web");
    expect(formatoPorEnlace("https://www.instagram.com/reel/abc/")).toBe("reel");
    expect(formatoPorEnlace("https://www.instagram.com/p/abc/")).toBe("post");
    expect(formatoPorEnlace("https://www.tiktok.com/@x/video/1")).toBe("reel");
  });

  it("una idea nueva con enlace es una referencia con el formato del enlace", () => {
    const i = nuevaIdea({ id: "x", referenceLink: "Mira https://www.instagram.com/reel/abc/" });
    expect(i).toMatchObject({ id: "x", format: "reel", referenceLink: "https://www.instagram.com/reel/abc/", status: "pending" });
    expect(esReferencia(i)).toBe(true);
    expect(tituloDeIdea(i)).toBe("Referencia de Instagram");
    expect(nuevaIdea({ id: "y", idea: "Antes y después", format: "carrusel" }).format).toBe("carrusel");
  });

  it("filtra por vista y por «sólo referencias», lo más nuevo arriba", () => {
    const l = [
      { id: "a", clientId: "c1", _addedAt: "2026-10-01" },
      { id: "b", clientId: null, referenceLink: "https://x.com", _addedAt: "2026-10-03" },
      { id: "c", clientId: "c2", _addedAt: "2026-10-02" },
    ];
    expect(filtrarBanco(l, { clienteId: "c1", vista: "cliente" }).map((i) => i.id)).toEqual(["b", "a"]);
    expect(filtrarBanco(l, { clienteId: "c1", vista: "generales" }).map((i) => i.id)).toEqual(["b"]);
    expect(filtrarBanco(l, { vista: "todas" }).map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(filtrarBanco(l, { vista: "todas", soloReferencias: true }).map((i) => i.id)).toEqual(["b"]);
  });

  it("limpia lo que manda el navegador sin perder los campos de publicación", () => {
    const l = limpiarIdea({ id: "otro", clientId: "c9", format: "inventado", referenceLink: "ver https://youtu.be/x", medios: [{ src: "/api/media/a" }] }, "id-bueno");
    expect(l).toMatchObject({ id: "id-bueno", format: "reel", referenceLink: "https://youtu.be/x", medios: [{ src: "/api/media/a" }] });
    expect("clientId" in l).toBe(false);
    expect(limpiarIdea("texto", "x")).toBeNull();
    expect(ideaDeFila({ id: "r", client_id: null, datos: "{roto" })).toMatchObject({ id: "r", clientId: null });
  });

  it("lo que llega por «Compartir» (/compartir) abre el diálogo relleno", () => {
    const u = (x) => new URL(x, "https://calendario.test");
    // Android (share_target): Instagram manda el enlace en `text`, otras apps en `url`; el título va a la nota.
    expect(deLoCompartido(u("/compartir?title=Reel%20de%20Dcasa&text=https%3A%2F%2Fwww.instagram.com%2Freel%2Fabc%2F")))
      .toEqual({ texto: "https://www.instagram.com/reel/abc/", nota: "Reel de Dcasa" });
    expect(enlaceLimpio(deLoCompartido(u("/compartir?url=https%3A%2F%2Fvm.tiktok.com%2FZM%2F")).texto)).toBe("https://vm.tiktok.com/ZM/");
    // iPhone (el Atajo): `texto`, con la barra final o sin ella.
    expect(deLoCompartido(u("/compartir/?texto=https%3A%2F%2Fyoutu.be%2Fx")).texto).toBe("https://youtu.be/x");
    // Un título que ya va dentro del texto, o que es el enlace, no se repite en la nota.
    expect(deLoCompartido(u("/compartir?title=https%3A%2F%2Fyoutu.be%2Fx&text=https%3A%2F%2Fyoutu.be%2Fx")).nota).toBe("");
    // Otra dirección no es «Compartir».
    expect(deLoCompartido(u("/cliente/dcasa?texto=x"))).toBeNull();
    expect(deLoCompartido(u("/compartirlo?texto=x"))).toBeNull();
  });

  it("el manifiesto pone la aplicación en la hoja de compartir de Android", () => {
    const m = JSON.parse(readFileSync(ruta("public", "manifest.webmanifest"), "utf8"));
    // POST multipart: así llegan también los ARCHIVOS (el video guardado del teléfono). Lo recibe el service worker,
    // que los deja en su caché y redirige a /compartir?…&archivos=… (public/sw.js); sin él, el POST no tiene quién lo atienda.
    expect(m.share_target).toMatchObject({ action: "/compartir", method: "POST", enctype: "multipart/form-data" });
    expect(m.share_target.params).toMatchObject({ title: "title", text: "text", url: "url" });
    expect(m.share_target.params.files[0]).toMatchObject({ name: "archivos" });
    const sw = readFileSync(ruta("public", "sw.js"), "utf8");
    expect(sw).toMatch(/pathname !== "\/compartir"/);
    expect(sw).toMatch(/getAll\("archivos"\)/);
    expect(readFileSync(ruta("src", "main.jsx"), "utf8")).toMatch(/serviceWorker\.register\('\/sw\.js'\)/);
    // Android sólo instala con un icono de 192 y otro de 512 que existan.
    for (const t of ["192x192", "512x512"]) {
      const i = m.icons.find((x) => x.sizes === t);
      expect(i, t).toBeTruthy();
      expect(readFileSync(ruta("public", i.src.replace(/^\//, ""))).length).toBeGreaterThan(0);
    }
    expect(readFileSync(ruta("index.html"), "utf8")).toMatch(/rel="manifest"/);
  });
});

describe("la migración 0044", () => {
  it("pasa las ideas de cada cliente a la tabla, con su cliente, y vacía el JSON", () => {
    const s = db.sqlite;
    s.prepare("update clients set ideas_bank = ? where id = 'c1'").run(JSON.stringify([
      { id: "i1", idea: "Sofá en sala pequeña", format: "reel", _addedAt: "2026-09-01T00:00:00.000Z" },
      { idea: "Sin id" },
      "basura",
    ]));
    s.prepare("update clients set ideas_bank = ? where id = 'c9'").run(JSON.stringify([{ id: "i9", idea: "De otra agencia" }]));
    s.exec(readFileSync(ruta("migraciones", "d1", "0044_banco_ideas.sql"), "utf8"));
    const filas = s.prepare("select * from banco_ideas order by id").all();
    expect(filas.map((f) => [f.id, f.owner_id, f.client_id])).toEqual([
      ["c1-1", JEFE, "c1"], ["i1", JEFE, "c1"], ["i9", OTRA, "c9"],
    ]);
    expect(JSON.parse(filas.find((f) => f.id === "i1").datos)).toMatchObject({ idea: "Sofá en sala pequeña", format: "reel" });
    expect(filas.find((f) => f.id === "i1").created_at).toBe("2026-09-01T00:00:00.000Z");
    expect(s.prepare("select ideas_bank from clients where id = 'c1'").get().ideas_bank).toBe("[]");

    // Reaplicarla no resucita lo que se borró después.
    s.prepare("delete from banco_ideas where id = 'i1'").run();
    s.exec(readFileSync(ruta("migraciones", "d1", "0044_banco_ideas.sql"), "utf8"));
    expect(s.prepare("select count(*) as n from banco_ideas where id = 'i1'").get().n).toBe(0);
  });
});

describe("/api/banco-ideas", () => {
  it("una idea general sale en el banco de todos los clientes; asignarla la saca de los demás", async () => {
    const r = await guardar(JEFE, null, { idea: "Transición con la mano", referenceLink: "https://www.tiktok.com/@x/video/1" });
    expect(r.status).toBe(201);
    const { idea } = await r.json();
    expect(idea).toMatchObject({ clientId: null, format: "reel", referenceLink: "https://www.tiktok.com/@x/video/1" });
    await guardar(JEFE, "c1", { idea: "Sólo de Dcasa" });

    expect((await lista(JEFE, "c1")).map((i) => i.idea).sort()).toEqual(["Sólo de Dcasa", "Transición con la mano"]);
    expect((await lista(ANA, "c2")).map((i) => i.idea)).toEqual(["Transición con la mano"]);

    const put = await pedir(ANA, `/api/banco-ideas/${idea.id}`, { method: "PUT", body: { clienteId: "c2", idea: { ...idea, idea: "Transición para Baby Caleb" } } });
    expect(put.status).toBe(200);
    expect((await lista(JEFE, "c1")).map((i) => i.idea)).toEqual(["Sólo de Dcasa"]);
    expect((await lista(JEFE, "c2")).map((i) => i.idea)).toEqual(["Transición para Baby Caleb"]);
    expect((await lista(JEFE)).length).toBe(2);

    // Sin clienteId en el cuerpo se queda donde estaba; con null vuelve a general.
    await pedir(JEFE, `/api/banco-ideas/${idea.id}`, { method: "PUT", body: { idea: { ...idea, idea: "Otra vez" } } });
    expect((await lista(JEFE, "c2"))[0].clientId).toBe("c2");
    await pedir(JEFE, `/api/banco-ideas/${idea.id}`, { method: "PUT", body: { clienteId: null, idea } });
    expect((await lista(JEFE, "c1")).length).toBe(2);

    expect((await pedir(JEFE, `/api/banco-ideas/${idea.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await lista(JEFE)).map((i) => i.idea)).toEqual(["Sólo de Dcasa"]);
  });

  it("otra agencia no ve ni toca nada", async () => {
    const { idea } = await (await guardar(JEFE, null, { idea: "Nuestra" })).json();
    expect(await lista(OTRA)).toEqual([]);
    expect((await pedir(OTRA, `/api/banco-ideas/${idea.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await guardar(OTRA, "c1", { idea: "En un cliente ajeno" })).status).toBe(404);
    expect((await lista(JEFE)).length).toBe(1);
  });

  it("un colaborador sólo ve y escribe las de sus clientes (las generales no)", async () => {
    await guardar(JEFE, null, { idea: "General" });
    await guardar(JEFE, "c1", { idea: "De Dcasa" });
    await guardar(JEFE, "c2", { idea: "De Baby Caleb" });
    expect((await lista(COLAB)).map((i) => i.idea)).toEqual(["De Dcasa"]);
    expect((await guardar(COLAB, null, { idea: "Sin empresa" })).status).toBe(403);
    expect((await guardar(COLAB, "c1", { idea: "Mía" })).status).toBe(201);
  });

  it("un enlace de TikTok trae su título y su miniatura; si no contesta, se guarda igual", async () => {
    globalThis.fetch.mockImplementation(async (u) => (String(u).startsWith("https://www.tiktok.com/oembed")
      ? new Response(JSON.stringify({ title: "Tutorial de sofá cama", author_name: "@muebles", thumbnail_url: "https://p16-sign.tiktokcdn.com/x.jpeg" }))
      : new Response("", { status: 404 })));
    const { idea } = await (await guardar(JEFE, null, { referenceLink: "https://www.tiktok.com/@muebles/video/123" })).json();
    expect(idea).toMatchObject({ enlaceTitulo: "Tutorial de sofá cama", enlaceAutor: "@muebles", miniatura: "https://p16-sign.tiktokcdn.com/x.jpeg" });

    globalThis.fetch.mockImplementation(async () => { throw new Error("sin red"); });
    const r = await guardar(JEFE, null, { referenceLink: "https://www.tiktok.com/@otro/video/9" });
    expect(r.status).toBe(201);
    expect((await r.json()).idea.enlaceTitulo).toBeUndefined();
  });

  it("no guarda una idea que no cabe en la fila", async () => {
    const r = await guardar(JEFE, "c1", { idea: "Con imagen pegada", image: `data:image/png;base64,${"A".repeat(500_000)}` });
    expect(r.status).toBe(413);
  });
});
