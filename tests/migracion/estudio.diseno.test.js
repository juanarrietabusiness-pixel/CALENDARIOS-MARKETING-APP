import { describe, it, expect, beforeEach } from "vitest";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { crearAcceso } from "../../worker/lib/acceso.js";
import { crearHerramientasMCP, HERRAMIENTAS_MCP } from "../../worker/lib/mcp.js";
import { planDeDiseno, pasoDelPlan, limpiarPiezaMcp, DEFINICIONES_DISENO_MCP } from "../../worker/lib/estudio/herramientasDiseno.js";
import { ESCENA } from "../../src/lib/encargos.js";
import { instruccionDeDiseno } from "../../src/lib/director.js";

// ============================================================
// El DIRECTOR por MCP: Claude diseña en lote para un cliente, ve, corrige y pone en un post
//
//   · Sin `confirmado: true` (el booleano) NO se crea nada: vuelve el plan con su costo.
//   · Confirmado, un ENCARGO del servidor: con la ficha de Claude la escena va lista; sólo con la idea, la diseña el
//     director (paso con `encargo`). Cada pedido se arma como en la pantalla, con el hueco «{{ESCENA}}».
//   · Un carrusel va en orden y en su carpeta de tipo carrusel; sin fichas y con tema, lo diseña el director.
//   · estado_encargo enseña las piezas listas como imagen; corregir_pieza edita la MISMA imagen;
//     poner_en_publicacion pone lo de la galería en un post (sin crear) y apunta su uso.
//   · Nada de otro cliente ni de otro espacio.
// ============================================================

const ANA = "u-ana";
const OTRO = "u-otro";
const USUARIO = { id: ANA, nombre: "Ana" };
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const FICHA = [
  "Pieza: post de producto, 4:5.",
  "Composición: el estuche abajo a la derecha (40 % del ancho); titular arriba, del 8 al 20 % de la altura.",
  "Fondo: azul noche liso.",
  "Imagen principal: el estuche de lentes abierto.",
  "Texto exacto: «Lentes que se ven bien»",
  "Marca: logo abajo a la izquierda, pequeño.",
  "Evitar: texto deformado.",
].join("\n");

let db;
let env;
let acceso;
let objetos;

function r2() {
  objetos = new Map();
  return {
    async head(clave) { return objetos.has(clave) ? { size: 1 } : null; },
    async get(clave) {
      const b = objetos.get(clave);
      if (!b) return null;
      return { size: b.length, httpMetadata: { contentType: "image/png" }, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) };
    },
    async put(clave, valor) { objetos.set(clave, valor); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

function sembrar() {
  const s = db.sqlite;
  for (const [id, email] of [[ANA, "ana@a.com"], [OTRO, "otro@b.com"]]) {
    s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(id, email, "x", "x");
    s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(id, id, "admin", id, "#1E90FF");
  }
  s.prepare("insert into clients (id, owner_id, name, industry) values (?,?,?,?)").run("c1", ANA, "Feria del Lente", "Óptica");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", ANA, "Baby Caleb");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c9", OTRO, "Ajeno");
  s.prepare("insert into calendars (id, client_id, owner_id, name, month, year, days) values (?,?,?,?,?,?,?)")
    .run("cal1", "c1", ANA, "Noviembre", 10, 2026, JSON.stringify([
      { date: "2026-11-10", dayName: "Martes", posts: [
        { id: "p1", format: "post", title: "Estuche", status: "pending" },
        { id: "p2", format: "post", title: "Ya salió", status: "published" },
      ] },
    ]));
  // El catálogo con un producto con foto (su foto, en la galería y en R2).
  s.prepare("insert into mercado_clientes (client_id, owner_id, catalogo) values (?,?,?)")
    .run("c1", ANA, JSON.stringify([{ id: "estuche", nombre: "Estuche de lentes", precio: "$12", activo: true, fotos: ["clientes/c1/catalogo/estuche.png"] }]));
  objetos.set("clientes/c1/catalogo/estuche.png", PNG);
}

function pieza(id, cliente, { carpeta = null, creado = "2026-11-05T00:00:00.000Z" } = {}) {
  const clave = `clientes/${cliente}/estudio/${id}.png`;
  objetos.set(clave, PNG);
  db.sqlite.prepare(
    "insert into estudio_archivos (id, owner_id, client_id, clave, tipo, mime, ancho, alto, prompt, modelo, origen, carpeta_id, created_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(id, cliente === "c9" ? OTRO : ANA, cliente, clave, "imagen", "image/png", 1024, 1280, "un estuche", "nano-banana", "estudio", carpeta, creado);
}

const mcp = () => crearHerramientasMCP({ env, acceso, usuario: USUARIO });
const textoDe = (r) => r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
const encargos = () => db.sqlite.prepare("select * from estudio_encargos").all().map((e) => ({ ...e, pasos: JSON.parse(e.pasos), datos: JSON.parse(e.datos) }));
const trabajos = () => db.sqlite.prepare("select * from estudio_trabajos").all();

beforeEach(() => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), GOOGLE_AI_KEY: "llave-de-prueba" };
  acceso = crearAcceso(db, ANA);
  sembrar();
});

describe("disenar_piezas: el plan y la confirmación", () => {
  it("sin confirmado no crea nada y dice el plan con su costo", async () => {
    const r = await mcp().llamar("disenar_piezas", {
      cliente: "Feria del Lente", piezas: [{ titulo: "Estuche", ficha: FICHA, productos: ["estuche"] }, { titulo: "Idea suelta", idea: "Por qué cuidar tus lentes", texto: "Cuida tus lentes\n3 consejos" }],
    });
    expect(r.isError).toBeUndefined();
    const t = textoDe(r);
    expect(t).toMatch(/NO SE CREÓ NADA/);
    expect(t).toMatch(/1\. Estuche · 4:5 .* con tu ficha/);
    expect(t).toMatch(/2\. Idea suelta .* la diseña el director/);
    expect(t).toMatch(/confirmado=true/);
    expect(encargos()).toHaveLength(0);
    expect(trabajos()).toHaveLength(0);
  });

  it("sólo el booleano true confirma", async () => {
    const r = await mcp().llamar("disenar_piezas", { cliente: "Feria del Lente", piezas: [{ titulo: "Estuche", ficha: FICHA }], confirmado: "true" });
    expect(textoDe(r)).toMatch(/NO SE CREÓ NADA/);
    expect(encargos()).toHaveLength(0);
  });

  it("una pieza sin ficha ni idea no va; si ninguna va, es un error", async () => {
    const r = await mcp().llamar("disenar_piezas", { cliente: "Feria del Lente", piezas: [{ titulo: "Vacía" }] });
    expect(r.isError).toBe(true);
    expect(textoDe(r)).toMatch(/Falta la ficha/);
  });

  it("un cliente de otro espacio no existe", async () => {
    const r = await mcp().llamar("disenar_piezas", { cliente: "Ajeno", piezas: [{ titulo: "x", ficha: FICHA }] });
    expect(r.isError).toBe(true);
  });
});

describe("disenar_piezas confirmado: el encargo del servidor", () => {
  it("con la ficha la escena va lista; con la idea, la diseña el director; el pedido lleva el hueco y las fotos del producto", async () => {
    const r = await mcp().llamar("disenar_piezas", {
      cliente: "Feria del Lente", concepto: "Noviembre azul", confirmado: true,
      piezas: [
        { titulo: "Estuche", ficha: FICHA, productos: ["estuche"], post_id: "p1" },
        { titulo: "Consejos", idea: "Por qué cuidar tus lentes", texto: "Cuida tus lentes\n3 consejos", formato: "story", estilo: "educativo" },
      ],
    });
    expect(r.isError).toBeUndefined();
    expect(textoDe(r)).toMatch(/En marcha para Feria del Lente: encargo/);
    const [e] = encargos();
    expect(e).toMatchObject({ tipo: "lote", client_id: "c1", estado: "en_marcha", creado_por: ANA });
    expect(e.datos).toMatchObject({ mejorar: true, controlar: true, paralelo: 2 });
    // La que lleva post_id se pone SOLA en su publicación al terminar el encargo.
    expect(e.datos.poner).toBe(true);
    expect(textoDe(r)).toMatch(/se ponen SOLAS en su publicación/);
    const [a, b] = e.pasos;
    expect(a.escena).toContain("Lentes que se ven bien");
    expect(a.encargo).toBeNull();
    expect(a.texto).toContain("Lentes que se ven bien");
    expect(a.controlar).toBe(true);
    expect(a.pedido.prompt).toContain(ESCENA);
    expect(a.pedido.medios.reference).toContain("clientes/c1/catalogo/estuche.png");
    expect(a.pedido).toMatchObject({ calendarId: "cal1", postId: "p1" });
    expect(a.pedido.ajustes.aspectRatio).toBe("4:5");
    expect(b.escena).toBe("");
    expect(b.encargo).toMatchObject({ formato: "historia", proporcion: "9:16", tipo: "Educativo / Informativo", texto: "Cuida tus lentes\n3 consejos" });
    expect(b.sinMejorar).toContain("Por qué cuidar tus lentes");
    expect(b.pedido.ajustes.aspectRatio).toBe("9:16");
  });

  it("todo con ficha: no hace falta el director", async () => {
    await mcp().llamar("disenar_piezas", { cliente: "Feria del Lente", confirmado: true, piezas: [{ titulo: "Estuche", ficha: FICHA }] });
    expect(encargos()[0].datos.mejorar).toBe(false);
    // Sin publicación, nada que poner.
    expect(encargos()[0].datos.poner).toBe(false);
  });
});

describe("disenar_piezas de un carrusel", () => {
  it("con las fichas de cada lámina: en orden, en su carpeta de carrusel, 4:5", async () => {
    const fichas = ["Portada", "Lámina 2", "Cierre"].map((t) => FICHA.replace("Lentes que se ven bien", t));
    const r = await mcp().llamar("disenar_piezas", {
      cliente: "Feria del Lente", carrusel: true, concepto: "Tres consejos", confirmado: true, productos: ["estuche"], post_id: "p1",
      piezas: fichas.map((ficha, i) => ({ titulo: `L${i + 1}`, ficha, formato: "story" })),
    });
    expect(r.isError).toBeUndefined();
    const [e] = encargos();
    expect(e.tipo).toBe("carrusel");
    expect(e.pasos.map((p) => p.lamina.rol)).toEqual(["portada", "contenido", "cierre"]);
    expect(e.pasos[0].lamina.texto).toContain("Portada");
    expect(e.datos.comun).toMatchObject({ modo: "ia", calendarId: "cal1", postId: "p1" });
    expect(e.datos.poner).toBe(true);
    expect(e.datos.comun.fotos).toContain("clientes/c1/catalogo/estuche.png");
    const carpeta = db.sqlite.prepare("select * from estudio_carpetas where id = ?").get(e.datos.carpetaId);
    expect(carpeta.tipo).toBe("carrusel");
    expect(textoDe(r)).toContain(`carrusel_id ${carpeta.id}`);
    expect(textoDe(r)).toMatch(/se pone SOLO en la publicación p1/);
  });

  it("sin fichas y con tema: lo diseña el director (propuesta)", async () => {
    const plan = await mcp().llamar("disenar_piezas", { cliente: "Feria del Lente", carrusel: true, tema: "Cómo escoger tus lentes" });
    expect(textoDe(plan)).toMatch(/NO SE CREÓ NADA.*diseña el director/s);
    await mcp().llamar("disenar_piezas", { cliente: "Feria del Lente", carrusel: true, tema: "Cómo escoger tus lentes", confirmado: true });
    const [e] = encargos();
    expect(e.datos.propuesta).toMatchObject({ tema: "Cómo escoger tus lentes" });
    expect(e.pasos).toHaveLength(0);
  });

  it("una lámina sin ficha en un carrusel es un error", async () => {
    const r = await mcp().llamar("disenar_piezas", { cliente: "Feria del Lente", carrusel: true, piezas: [{ titulo: "a", ficha: FICHA }, { titulo: "b", idea: "algo" }] });
    expect(r.isError).toBe(true);
  });
});

describe("estado_encargo", () => {
  it("cuenta cómo va cada pieza y enseña las listas", async () => {
    pieza("a1", "c1");
    db.sqlite.prepare("insert into estudio_encargos (id, owner_id, client_id, tipo, titulo, estado, datos, pasos, nota, error, creado_por, bloqueado_hasta, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("e1", ANA, "c1", "lote", "Prueba", "en_marcha", "{}", JSON.stringify([
        { id: "p1", titulo: "Estuche", fase: "hecho", opciones: [{ id: "a1", fase: "hecho", control: { estado: "ok", puntajeDiseno: 8 } }], finales: ["a1"], error: "" },
        { id: "p2", titulo: "Consejos", fase: "generando", opciones: [], error: "", deDirector: true },
      ]), "1 de 2", "", ANA, "", "2026-11-05T00:00:00.000Z", "2026-11-05T00:00:00.000Z");
    const r = await mcp().llamar("estado_encargo", { encargo_id: "e1" });
    const t = textoDe(r);
    expect(t).toMatch(/1\. Estuche — lista · archivo a1 · control: bien, diseño 8\/10/);
    expect(t).toMatch(/2\. Consejos — creándose · ficha del director/);
    expect(t).toMatch(/Sigue en el servidor/);
    expect(r.content.filter((b) => b.type === "image")).toHaveLength(1);
  });

  it("uno de otro espacio no existe", async () => {
    db.sqlite.prepare("insert into estudio_encargos (id, owner_id, client_id, tipo, titulo, estado, datos, pasos, nota, error, creado_por, bloqueado_hasta, created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("e9", OTRO, "c9", "lote", "x", "hecho", "{}", "[]", "", "", OTRO, "", "2026-11-05T00:00:00.000Z", "2026-11-05T00:00:00.000Z");
    const r = await mcp().llamar("estado_encargo", { encargo_id: "e9" });
    expect(r.isError).toBe(true);
  });
});

describe("corregir_pieza", () => {
  it("edita la MISMA imagen (va de referencia) y deja la de antes", async () => {
    pieza("a1", "c1");
    pieza("a2", "c1");
    const r = await mcp().llamar("corregir_pieza", { cliente: "Feria del Lente", archivo_id: "a1", indicacion: "donde dice «lentez» debe decir «lentes»", igual_a: "a2" });
    expect(r.isError).toBeUndefined();
    const [t] = trabajos();
    const medios = JSON.parse(t.medios);
    expect(medios.reference[0]).toBe("clientes/c1/estudio/a1.png");
    expect(medios.reference).toContain("clientes/c1/estudio/a2.png");
    expect(t.prompt).toMatch(/lentes/);
    expect(t.origen).toBe("claude");
    expect(db.sqlite.prepare("select count(*) n from estudio_archivos where id = 'a1' and borrado_at is null").get().n).toBe(1);
  });

  it("una pieza de otro cliente no se toca", async () => {
    pieza("b1", "c2");
    const r = await mcp().llamar("corregir_pieza", { cliente: "Feria del Lente", archivo_id: "b1", indicacion: "x" });
    expect(r.isError).toBe(true);
    expect(trabajos()).toHaveLength(0);
  });
});

describe("poner_en_publicacion", () => {
  it("pone imágenes sueltas en su orden; con dos, el post pasa a carrusel; apunta el uso", async () => {
    pieza("a1", "c1");
    pieza("a2", "c1");
    const r = await mcp().llamar("poner_en_publicacion", { post_id: "p1", archivo_ids: ["a2", "a1"] });
    expect(r.isError).toBeUndefined();
    const dias = JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal1'").get().days);
    const post = dias[0].posts.find((p) => p.id === "p1");
    expect(post.medios.map((m) => m.src)).toEqual(["/api/media/clientes/c1/estudio/a2.png", "/api/media/clientes/c1/estudio/a1.png"]);
    expect(post.format).toBe("carrusel");
    expect(post.image).toBe("/api/media/clientes/c1/estudio/a2.png");
    const uso = JSON.parse(db.sqlite.prepare("select usado_en from estudio_archivos where id = 'a1'").get().usado_en);
    expect(uso.length).toBe(1);
  });

  it("un carrusel entero en el orden de su carpeta", async () => {
    db.sqlite.prepare("insert into estudio_carpetas (id, client_id, owner_id, nombre, tipo, orden) values (?,?,?,?,?,?)").run("k1", "c1", ANA, "Carrusel", "carrusel", JSON.stringify(["l2", "l1"]));
    pieza("l1", "c1", { carpeta: "k1" });
    pieza("l2", "c1", { carpeta: "k1" });
    await mcp().llamar("poner_en_publicacion", { post_id: "p1", carrusel_id: "k1" });
    const post = JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal1'").get().days)[0].posts[0];
    expect(post.medios.map((m) => m.src.split("/").pop())).toEqual(["l2.png", "l1.png"]);
  });

  it("un post que RECIBE su primera imagen lleva su historia 9:16 encajada en el Container, como en el panel", async () => {
    pieza("a1", "c1");
    const pedidos = [];
    env.VIDEO = {
      idFromName: (n) => n,
      get: () => ({ fetch: async (req) => { const j = await req.json(); pedidos.push(j.salida); return Response.json({ datos: btoa("jpeg"), mime: "image/jpeg", ancho: 1080, alto: 1920 }); } }),
    };
    const r = await mcp().llamar("poner_en_publicacion", { post_id: "p1", archivo_ids: ["a1"] });
    expect(textoDe(r)).toMatch(/historia 9:16/);
    expect(pedidos).toEqual([{ tipo: "encajar", ancho: 1080, alto: 1920, modo: "difuminado", color: expect.any(String) }]);
    const post = JSON.parse(db.sqlite.prepare("select days from calendars where id = 'cal1'").get().days)[0].posts[0];
    expect(post.historiaTambien).toBe(true);
    expect(post.historias).toHaveLength(1);
    expect(post.historias[0]).toMatchObject({ tipo: "imagen", ancho: 1080, alto: 1920 });
    expect(post.encajadaDe).toEqual({ de: "/api/media/clientes/c1/estudio/a1.png", src: post.historias[0].src });
    // Otra vez la misma imagen: no se rehace nada.
    await mcp().llamar("poner_en_publicacion", { post_id: "p1", archivo_ids: ["a1"] });
    expect(pedidos).toHaveLength(1);
    delete env.VIDEO;
  });

  it("lo publicado no se toca, y lo de otro cliente no se pone", async () => {
    pieza("a1", "c1");
    pieza("b1", "c2");
    expect((await mcp().llamar("poner_en_publicacion", { post_id: "p2", archivo_ids: ["a1"] })).isError).toBe(true);
    expect((await mcp().llamar("poner_en_publicacion", { post_id: "p1", archivo_ids: ["b1"] })).isError).toBe(true);
  });
});

describe("guia_de_diseno", () => {
  it("trae el manual en su versión de MCP, el catálogo con los ids y no gasta", async () => {
    const r = await mcp().llamar("guia_de_diseno", { cliente: "Feria del Lente" });
    const t = textoDe(r);
    expect(t).toMatch(/MANUAL DEL DIRECTOR/);
    expect(t).toMatch(/TUS HERRAMIENTAS DE DISEÑO \(por MCP\)/);
    expect(t).toMatch(/id: estuche/);
    expect(trabajos()).toHaveLength(0);
  });
});

describe("las definiciones", () => {
  it("las cinco están en el MCP; las que gastan o escriben no son de sólo lectura", () => {
    const por = Object.fromEntries(HERRAMIENTAS_MCP.map((h) => [h.name, h]));
    for (const d of DEFINICIONES_DISENO_MCP) expect(por[d.name], d.name).toBeTruthy();
    expect(por.guia_de_diseno.annotations.readOnlyHint).toBe(true);
    expect(por.estado_encargo.annotations.readOnlyHint).toBe(true);
    for (const n of ["disenar_piezas", "corregir_pieza", "poner_en_publicacion"]) expect(por[n].annotations.readOnlyHint, n).toBe(false);
    expect(por.disenar_piezas.description).toMatch(/Nunca pongas confirmado=true por tu cuenta/);
  });

  it("el manual del chat de la aplicación no cambia con la versión de MCP", () => {
    expect(instruccionDeDiseno("")).toMatch(/La persona ve las fichas y el costo y aprueba con un botón/);
    expect(instruccionDeDiseno("", { canal: "mcp" })).not.toMatch(/aprueba con un botón/);
  });
});

describe("el armado (puro)", () => {
  it("planDeDiseno y pasoDelPlan: la escena en el hueco y el texto exacto de la ficha para el control", () => {
    const ctx = { kit: {}, activos: { gemini: true }, productos: [], archivos: [], cliente: { name: "Feria del Lente" } };
    const [p] = planDeDiseno(ctx, [{ titulo: "x", ficha: FICHA }]);
    expect(p.error).toBeUndefined();
    expect(p.costo).toBeGreaterThan(0);
    const paso = pasoDelPlan(p, {});
    expect(paso.pedido.prompt).toContain(ESCENA);
    expect(paso.texto).toBe("Lentes que se ven bien");
    expect(limpiarPiezaMcp({ formato: "raro", estilo: "inventado" })).toMatchObject({ formato: "vertical", estilo: "" });
  });
});
