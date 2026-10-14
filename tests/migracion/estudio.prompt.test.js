import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";
import { pedidoDeMejora, leerIdea, MAX_PALABRAS, pedidoDeVersiones, leerVersiones, MAX_VERSIONES } from "../../worker/lib/estudio/prompt.js";

// ============================================================
// «Mejorar idea»: la idea de la persona, más clara, y nada más
//
// Lo que importa:
//   1. Sale UNA idea sencilla en texto: ni JSON, ni listas, ni párrafos de
//      dirección de arte (eso es lo que hacía «Escribir el prompt» y el
//      motor, con tanto texto, sacaba cualquier cosa).
//   2. No mete la marca por detrás: ni la memoria del cerebro, ni lo interno.
//   3. Es texto: no crea ningún trabajo ni llama a ningún motor de imagen.
// ============================================================

describe("lo puro", () => {
  it("pide una o dos frases sencillas, sin inventar y sin listas", () => {
    const p = pedidoDeMejora({ idea: "un sofá en una sala bonita", cliente: { name: "Dcasa" } });
    expect(p).toMatch(/una imagen de la marca Dcasa/);
    expect(p).toMatch(new RegExp(`${MAX_PALABRAS} palabras como mucho`));
    expect(p).toMatch(/No inventes/);
    expect(p).toMatch(/Nada de listas/);
    expect(p).toMatch(/LA IDEA:\nun sofá en una sala bonita/);
    expect(p).not.toMatch(/JSON|CARRUSEL|director de arte/i);
    expect(pedidoDeMejora({ idea: "x", tipo: "video" })).toMatch(/un video corto/);
  });

  it("lee la idea limpia: sin etiqueta, sin comillas que la envuelven, en una línea", () => {
    expect(leerIdea("Idea mejorada: Un sofá color arena en una sala luminosa.")).toBe("Un sofá color arena en una sala luminosa.");
    expect(leerIdea("«Un sofá color arena junto a la ventana.»")).toBe("Un sofá color arena junto a la ventana.");
    expect(leerIdea("Una taza con el texto \"Buenos días\" sobre la mesa.")).toBe("Una taza con el texto \"Buenos días\" sobre la mesa.");
    expect(leerIdea("```\nUna taza\nsobre la mesa\n```")).toBe("Una taza sobre la mesa");
    expect(leerIdea("")).toBe("");
  });
});

describe("«Otra versión distinta», lo puro", () => {
  it("pide la MISMA información con otra escena, una por línea", () => {
    const p = pedidoDeVersiones({ idea: "Un sofá cama con el texto «Desde $399» en una sala", n: 2, cliente: { name: "Dcasa" } });
    expect(p).toMatch(/Escribe 2 versiones distintas/);
    expect(p).toMatch(/dice LO MISMO/);
    expect(p).toMatch(/el mismo texto exacto/);
    expect(p).toMatch(/No inventes/);
    expect(p).toMatch(/LA ESCENA:\nUn sofá cama/);
    expect(pedidoDeVersiones({ idea: "x", n: 1 })).toMatch(/1 versión distinta/);
  });

  it("lee las versiones: viñetas, números o «Versión N:», sin la frase de entrada, hasta n", () => {
    const texto = "Aquí tienes las versiones:\n- Un sofá cama abierto en un estudio pequeño, de noche.\n2. El sofá cama visto desde arriba con dos cojines.\nVersión 3: Una familia sentada en el sofá cama, luz de tarde.";
    expect(leerVersiones(texto, 3)).toEqual([
      "Un sofá cama abierto en un estudio pequeño, de noche.",
      "El sofá cama visto desde arriba con dos cojines.",
      "Una familia sentada en el sofá cama, luz de tarde.",
    ]);
    expect(leerVersiones(texto, 1)).toHaveLength(1);
    expect(leerVersiones("", 2)).toEqual([]);
    expect(MAX_VERSIONES).toBe(3);
  });
});

// ------------------------------------------------------------
// La ruta, con Anthropic de mentira
// ------------------------------------------------------------

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;
let peticiones;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 2000 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 400 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

function anthropic(texto) {
  peticiones = [];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      peticiones.push(JSON.parse(opciones.body));
      return flujo(texto);
    }
    throw new Error(`fetch inesperado a ${u}`);
  });
}

function r2() {
  const objetos = new Map();
  return {
    objetos,
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const o = objetos.get(clave);
      const bytes = typeof o.bytes === "string" ? new TextEncoder().encode(o.bytes) : o.bytes;
      return { httpMetadata: { contentType: o.tipo }, arrayBuffer: async () => bytes, text: async () => new TextDecoder().decode(bytes) };
    },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor, op) { objetos.set(clave, { bytes: typeof valor === "string" ? valor : new Uint8Array(valor), tipo: op?.httpMetadata?.contentType }); },
    async delete(clave) { objetos.delete(clave); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const mejorar = (datos) => pedir("/api/estudio/c1/mejorar", { method: "POST", body: datos });
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", JEFE, "Dcasa");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c2", JEFE, "Otro");
  // El cerebro: su identidad visual y una nota interna que no puede salir.
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Identidad visual", texto: "Paleta azul marino y arena; fotografía cálida con luz natural; nunca fondos negros.", tipo: "marca" } });
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Costos", texto: "El costo del sofá es de 200 dólares y el margen del 40 %.", tipo: "documento", interna: true } });
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("POST /api/estudio/<cliente>/mejorar", () => {
  it("devuelve la idea más clara, en texto; no crea ningún trabajo y apunta el gasto", async () => {
    anthropic("Un sofá color arena en una sala con luz natural de la tarde, foto realista.");
    const res = await mejorar({ idea: "un sofá en una sala bonita" });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.idea).toBe("Un sofá color arena en una sala con luz natural de la tarde, foto realista.");
    expect(textoDe(peticiones[0])).toMatch(/LA IDEA:\nun sofá en una sala bonita/);
    // Ni imágenes ni nada más: sólo el texto del pedido.
    expect(typeof peticiones[0].messages[0].content).toBe("string");
    expect(db.sqlite.prepare("select count(*) as n from estudio_trabajos").get().n).toBe(0);
    const apunte = db.sqlite.prepare("select funcion, client_id from consumo_ia").get();
    expect({ ...apunte }).toEqual({ funcion: "prompt de imagen", client_id: "c1" });
  });

  it("no mete la marca por detrás: ni la memoria del cerebro, ni lo interno", async () => {
    anthropic("Un sofá en una sala.");
    await mejorar({ idea: "un sofá" });
    expect(textoDe(peticiones[0])).not.toMatch(/azul marino|margen|200 dólares/);
  });

  it("sin idea no se llama a nadie; y la ruta vieja de «Escribir el prompt» ya no existe", async () => {
    anthropic("x");
    expect((await mejorar({ idea: "  " })).status).toBe(400);
    expect(peticiones).toHaveLength(0);
    expect((await pedir("/api/estudio/c1/prompt", { method: "POST", body: { idea: "x" } })).status).toBe(404);
  });
});

describe("POST /api/estudio/<cliente>/versiones", () => {
  const versiones = (datos) => pedir("/api/estudio/c1/versiones", { method: "POST", body: datos });

  it("devuelve N escenas en texto; no crea ningún trabajo y apunta el gasto", async () => {
    anthropic("- Un sofá cama abierto en un estudio pequeño.\n- El sofá cama visto desde arriba.");
    const res = await versiones({ idea: "Un sofá cama en una sala", n: 2 });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.versiones).toEqual(["Un sofá cama abierto en un estudio pequeño.", "El sofá cama visto desde arriba."]);
    expect(textoDe(peticiones[0])).toMatch(/LA ESCENA:\nUn sofá cama en una sala/);
    expect(textoDe(peticiones[0])).not.toMatch(/margen|200 dólares/);
    expect(db.sqlite.prepare("select count(*) as n from estudio_trabajos").get().n).toBe(0);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("prompt de imagen");
  });

  it("de 1 a 3, y sin escena no se llama a nadie", async () => {
    anthropic("- x");
    expect((await versiones({ idea: "x", n: 4 })).status).toBe(400);
    expect((await versiones({ idea: "x", n: 0 })).status).toBe(400);
    expect((await versiones({ idea: " ", n: 1 })).status).toBe(400);
    expect(peticiones).toHaveLength(0);
  });

  it("si la IA no devuelve nada que sirva, lo dice", async () => {
    anthropic("Aquí tienes:");
    expect((await versiones({ idea: "Un sofá", n: 1 })).status).toBe(502);
  });
});

describe("POST /api/estudio/<cliente>/lote/ideas", () => {
  const ideas = (datos) => pedir("/api/estudio/c1/lote/ideas", { method: "POST", body: datos });

  it("escribe las ideas por nivel con el producto y su precio EXACTO; no crea trabajos ni lee lo interno", async () => {
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: [{ id: "sofa", nombre: "Sofá cama", precio: "$399" }] } });
    anthropic(JSON.stringify({ ideas: [
      { nivel: "inconsciente", titular: "¿Duermes mal?", apoyo: "", escena: "Una persona cansada en un sofá viejo" },
      { nivel: "decision", titular: "Llévatelo hoy", apoyo: "Desde $399", escena: "El sofá cama en una sala luminosa" },
      { nivel: "decision", titular: "Sobra", escena: "Sobra" },
    ] }));
    const res = await ideas({ productoId: "sofa", cuantas: { inconsciente: 1, decision: 1 }, formato: "historia" });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.ideas.map((i) => i.titular)).toEqual(["¿Duermes mal?", "Llévatelo hoy"]);
    expect(r.producto).toEqual({ id: "sofa", nombre: "Sofá cama", precio: "$399" });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/Sofá cama \(producto\) · precio: \$399/);
    expect(t).toMatch(/Historia 9:16/);
    expect(t).not.toMatch(/margen|200 dólares/);
    expect(db.sqlite.prepare("select count(*) as n from estudio_trabajos").get().n).toBe(0);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("ideas de anuncios");
  });

  it("sin niveles o con un producto que no está activo no se llama a nadie", async () => {
    anthropic("x");
    expect((await ideas({ cuantas: {} })).status).toBe(400);
    expect((await ideas({ productoId: "no-existe", cuantas: { problema: 2 } })).status).toBe(404);
    expect(peticiones).toHaveLength(0);
  });

  it("sin producto escribe para la marca; si la IA no devuelve nada que sirva, lo dice", async () => {
    anthropic("no sé");
    expect((await ideas({ cuantas: { problema: 2 } })).status).toBe(502);
  });
});

describe("POST /api/estudio/<cliente>/ideas («Dame ideas»)", () => {
  const ideas = (datos) => pedir("/api/estudio/c1/ideas", { method: "POST", body: datos });

  it("ideas variadas con el catálogo y su precio EXACTO, cada una con su tipo; no crea trabajos", async () => {
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: [{ id: "sofa", nombre: "Sofá cama", precio: "$399" }] } });
    anthropic(JSON.stringify({ ideas: [
      { n: 1, titulo: "Llévatelo", escena: "El sofá cama en una sala luminosa", texto: "Desde $399" },
      { n: 2, titulo: "Oferta", escena: "El sofá abierto con una manta" },
    ] }));
    const res = await ideas({ n: 2, tema: "regreso a clases" });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.ideas.map((i) => [i.tipo, i.productoId, i.titulo])).toEqual([["anuncio", "sofa", "Llévatelo"], ["beneficios", "sofa", "Oferta"]]);
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/producto: Sofá cama \(producto\) · precio: \$399/);
    expect(t).toMatch(/Tema que pide la persona: regreso a clases/);
    expect(db.sqlite.prepare("select count(*) as n from estudio_trabajos").get().n).toBe(0);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("ideas del estudio");
  });

  it("si la IA no devuelve nada que sirva, lo dice", async () => {
    anthropic("no sé");
    expect((await ideas({ tipo: "educativo" })).status).toBe(502);
  });
});

describe("POST /api/estudio/<cliente>/lote/mes (el mes completo)", () => {
  const delMes = (datos) => pedir("/api/estudio/c1/lote/mes", { method: "POST", body: datos });

  it("una pieza por día escogido, con el tipo del ritmo, la matriz y el precio EXACTO; no crea trabajos", async () => {
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: [{ id: "sofa", nombre: "Sofá cama", precio: "$399" }] } });
    // Marzo de 2030: los lunes son 4, 11, 18 y 25.
    anthropic(JSON.stringify({ ideas: [1, 2, 3, 4].map((n) => ({ n, titular: `Titular ${n}`, escena: `Escena ${n}`, descripcion: `Texto ${n}` })) }));
    const res = await delMes({ mes: "2030-03", dias: [1], formato: "post" });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.ideas.map((i) => [i.fecha, i.pilar, i.productoId])).toEqual([
      ["2030-03-04", "anuncio", "sofa"], ["2030-03-11", "anuncio", "sofa"], ["2030-03-18", "anuncio", "sofa"], ["2030-03-25", "anuncio", "sofa"],
    ]);
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/producto: Sofá cama \(producto\) · precio: \$399/);
    expect(t).not.toMatch(/margen|200 dólares/);
    expect(db.sqlite.prepare("select count(*) as n from estudio_trabajos").get().n).toBe(0);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("lote del mes");
  });

  it("un mes que ya pasó, o sin días con tipo, no llama a nadie", async () => {
    anthropic("x");
    expect((await delMes({ mes: "2020-01", dias: [1] })).status).toBe(400);
    expect((await delMes({ mes: "2030-03", dias: [0] })).status).toBe(400);
    expect((await delMes({ mes: "nada" })).status).toBe(400);
    expect(peticiones).toHaveLength(0);
  });
});
