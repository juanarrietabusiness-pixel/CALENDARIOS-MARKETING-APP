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
    // El tipo de pieza (escogido ANTES de la idea) va como propósito, sin cambiar lo que pide la persona.
    expect(pedidoDeMejora({ idea: "x", pieza: "Educativo / Informativo" })).toMatch(/Es una pieza de tipo «Educativo \/ Informativo»: que la idea cumpla ese propósito/);
    expect(p).not.toMatch(/Es una pieza de tipo/);
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
  const FICHA = "Pieza: post vertical 4:5 — vender el sofá.\nComposición: el sofá ocupa los dos tercios de abajo; titular arriba.\nTexto (exacto, sin cambiar una letra): titular «Sofá cama» (grande, blanco).";

  it("una IMAGEN la diseña el director de arte: devuelve su ficha de diseño, en texto, y no crea ningún trabajo", async () => {
    anthropic(JSON.stringify({ concepto: "", piezas: [{ n: 1, ficha: FICHA }] }));
    const res = await mejorar({ idea: "un sofá en una sala bonita", texto: "Sofá cama" });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.idea).toBe(FICHA);
    expect(r.ficha).toBe(true);
    // El pedido es de diseño gráfico: con el manual del director y la ficha.
    expect(textoDe(peticiones[0])).toMatch(/director creativo y diseñador gráfico/);
    expect(textoDe(peticiones[0])).toMatch(/de qué va: un sofá en una sala bonita/);
    expect(db.sqlite.prepare("select count(*) as n from estudio_trabajos").get().n).toBe(0);
    const apunte = db.sqlite.prepare("select funcion, client_id from consumo_ia").get();
    expect({ ...apunte }).toEqual({ funcion: "director de arte", client_id: "c1" });
  });

  it("el director lee la identidad visual del cerebro, pero nunca lo interno", async () => {
    anthropic(JSON.stringify({ piezas: [{ n: 1, ficha: FICHA }] }));
    await mejorar({ idea: "un sofá" });
    expect(textoDe(peticiones[0])).toMatch(/azul marino/);
    expect(textoDe(peticiones[0])).not.toMatch(/margen|200 dólares/);
  });

  it("si la IA reescribió el texto de la pieza, la ficha lo recupera EXACTO (no se tira)", async () => {
    anthropic(JSON.stringify({ piezas: [{ n: 1, ficha: "Pieza: post.\nTexto: titular «Sofa cama»." }] }));
    const r = await (await mejorar({ idea: "un sofá", texto: "Sofá cama" })).json();
    expect(r.idea).toMatch(/Texto exacto que va en la imagen[^\n]*«Sofá cama»/);
  });

  it("un VIDEO sigue con la mejora corta de siempre (va limpio, sin diseño gráfico)", async () => {
    anthropic("Un sofá que se abre en cama, cámara lenta.");
    const r = await (await mejorar({ idea: "un sofá que se abre", tipo: "video" })).json();
    expect(r.idea).toBe("Un sofá que se abre en cama, cámara lenta.");
    expect(textoDe(peticiones[0])).toMatch(/LA IDEA:\nun sofá que se abre/);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("prompt de imagen");
  });

  it("sin idea no se llama a nadie; y la ruta vieja de «Escribir el prompt» ya no existe", async () => {
    anthropic("x");
    expect((await mejorar({ idea: "  " })).status).toBe(400);
    expect(peticiones).toHaveLength(0);
    expect((await pedir("/api/estudio/c1/prompt", { method: "POST", body: { idea: "x" } })).status).toBe(404);
  });
});

describe("POST /api/estudio/<cliente>/fichas", () => {
  const fichas = (datos) => pedir("/api/estudio/c1/fichas", { method: "POST", body: datos });

  it("una tanda: una ficha por pieza, como una serie, con el concepto", async () => {
    anthropic(JSON.stringify({ concepto: "Noviembre azul", piezas: [{ n: 1, ficha: "Pieza: uno.\nTexto: «Envío gratis»" }, { n: 2, ficha: "Pieza: dos." }] }));
    const res = await fichas({ piezas: [{ n: 1, texto: "Envío gratis", idea: "envío" }, { n: 2, idea: "sofá", sinTexto: true }] });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.concepto).toBe("Noviembre azul");
    expect(r.fichas[1].ficha).toMatch(/Envío gratis/);
    expect(r.fichas[2].ficha).toBe("Pieza: dos.");
    expect(textoDe(peticiones[0])).toMatch(/estas 2 piezas/);
    expect(textoDe(peticiones[0])).toMatch(/SIN TEXTO en la imagen/);
  });

  it("sin piezas, 400 sin llamar a nadie", async () => {
    anthropic("x");
    expect((await fichas({ piezas: [] })).status).toBe(400);
    expect(peticiones).toHaveLength(0);
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

  it("los días que ya tienen publicación no se vuelven a llenar; si no queda ninguno, lo dice sin gastar", async () => {
    anthropic(JSON.stringify({ ideas: [1, 2].map((n) => ({ n, titular: `Titular ${n}`, escena: `Escena ${n}` })) }));
    const r = await (await delMes({ mes: "2030-03", dias: [1], formato: "post", omitir: ["2030-03-04", "2030-03-18", "basura"] })).json();
    expect(r.ideas.map((i) => i.fecha)).toEqual(["2030-03-11", "2030-03-25"]);
    peticiones.length = 0;
    const todo = await delMes({ mes: "2030-03", dias: [1], omitir: ["2030-03-04", "2030-03-11", "2030-03-18", "2030-03-25"] });
    expect(todo.status).toBe(400);
    expect((await todo.json()).error).toMatch(/ya tienen publicación/);
    expect(peticiones).toHaveLength(0);
  });

  it("un mes que ya pasó, o sin días con tipo, no llama a nadie", async () => {
    anthropic("x");
    expect((await delMes({ mes: "2020-01", dias: [1] })).status).toBe(400);
    expect((await delMes({ mes: "2030-03", dias: [0] })).status).toBe(400);
    expect((await delMes({ mes: "nada" })).status).toBe(400);
    expect(peticiones).toHaveLength(0);
  });
});

describe("POST /api/estudio/<cliente>/lote/ideas: UNA publicación («Generar» de la Idea / Brief)", () => {
  const una = (datos) => pedir("/api/estudio/c1/lote/ideas", { method: "POST", body: { modo: "publicacion", ...datos } });

  it("con lo que ya trae la publicación, el formato dicho con todas sus letras, el precio EXACTO y lo que ya hay en el mes", async () => {
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: [{ id: "sofa", nombre: "Sofá cama", precio: "$399" }, { id: "mesa", nombre: "Mesa", precio: "$120" }] } });
    anthropic(JSON.stringify({ ideas: [{ n: 1, titulo: "Visitas sin estrés", brief: "Resuelve dónde duermen las visitas", titular: "¿Llegan visitas?", apoyo: "Sofá cama $399", escena: "Una sala de tarde con el sofá abierto" }] }));
    const res = await una({
      formato: "post",
      publicacion: { fecha: "2030-03-04", pilar: "beneficios", productoId: "sofa", nivel: "solucion", deseo: "tranquilidad", perfil: "Mamá organizada" },
      nota: "campaña del mes: Marzo cómodo", usados: ["Duerme mejor"],
    });
    expect(res.status).toBe(200);
    const [idea] = (await res.json()).ideas;
    expect(idea).toMatchObject({ productoId: "sofa", nivel: "solucion", fecha: "2030-03-04", titulo: "Visitas sin estrés", textoPieza: "¿Llegan visitas?\nSofá cama $399" });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/UNA publicación de una imagen/);
    expect(t).toMatch(/POST de UNA sola imagen fija.*No propongas carrusel, video ni reel/s);
    expect(t).toMatch(/Sofá cama \(producto\) · precio: \$399/);
    expect(t).toMatch(/Contexto de esta publicación: campaña del mes: Marzo cómodo/);
    expect(t).toMatch(/Duerme mejor/);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("publicación");
    expect(db.sqlite.prepare("select count(*) as n from estudio_trabajos").get().n).toBe(0);
  });

  it("un carrusel pide su guion por láminas y dice que no es una sola imagen", async () => {
    anthropic(JSON.stringify({ ideas: [{ n: 1, titular: "3 errores", escena: "Una sala", guion: "Portada: 3 errores\nCTA: Escríbenos" }] }));
    const [idea] = (await (await una({ formato: "carrusel", publicacion: { pilar: "educativo" } })).json()).ideas;
    expect(idea.guion).toMatch(/Portada/);
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/CARRUSEL de varias láminas/);
    expect(t).toMatch(/"guion": las láminas del carrusel/);
  });
});

describe("POST /api/estudio/<cliente>/lote/ideas: el PLAN del mes («Planificar mes», «Mes completo» con la plantilla)", () => {
  const plan = (datos) => pedir("/api/estudio/c1/lote/ideas", { method: "POST", body: { modo: "plan", ...datos } });

  it("formatos mezclados, varias por día, la estrategia del mes y la idea de la persona; cada idea vuelve con su clave", async () => {
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: [{ id: "sofa", nombre: "Sofá cama", precio: "$399" }] } });
    anthropic(JSON.stringify({ ideas: [
      { n: 1, titulo: "Visitas", brief: "B1", titular: "¿Llegan visitas?", escena: "Una sala", descripcion: "Caption 1", hashtags: "#sofacama muebles #sofacama" },
      { n: 2, titulo: "3 errores", brief: "B2", titular: "3 errores", escena: "Una tienda", guion: "Portada: 3 errores\nCTA: Escríbenos" },
      { n: 3, titulo: "Reel", brief: "B3", titular: "Así se abre", escena: "Manos", guion: "[0–2 s] …" },
    ] }));
    const res = await plan({
      casillas: [
        { clave: "2030-03-04|0", fecha: "2030-03-04", formato: "post", pilar: "beneficios", productoId: "sofa", semana: "Semana del descanso" },
        { clave: "2030-03-04|1", fecha: "2030-03-04", formato: "carrusel", pilar: "educativo", idea: "Errores al comprar un sofá" },
        { clave: "2030-03-05|0", fecha: "2030-03-05", formato: "reel", pilar: "humano" },
        { clave: "x", fecha: "2030-03-06", formato: "live" },
      ],
      estrategia: { campana: "Marzo cómodo", ofertas: "10 % en sofás", codigo: "COMODO", semanas: ["Semana del descanso"] },
    });
    expect(res.status).toBe(200);
    const r = await res.json();
    // El directo no se escribe; cada idea, con su clave y su formato.
    expect(r.total).toBe(3);
    expect(r.ideas.map((i) => [i.clave, i.formato])).toEqual([["2030-03-04|0", "post"], ["2030-03-04|1", "carrusel"], ["2030-03-05|0", "reel"]]);
    expect(r.ideas[0]).toMatchObject({ hashtags: "#sofacama #muebles", textoPieza: "¿Llegan visitas?", productoId: "sofa" });
    expect(r.ideas[0].guion).toBeUndefined();
    expect(r.ideas[1].guion).toMatch(/Portada/);
    // La matriz completa lo que el plan no trae (el nivel de cada tipo).
    expect(r.ideas.every((i) => i.nivel && i.composicion && i.tactica)).toBe(true);
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/Cada una tiene YA decidido su FORMATO/);
    expect(t).toMatch(/\[Post 4:5\]/);
    expect(t).toMatch(/\[Carrusel\]/);
    expect(t).toMatch(/- Carrusel: Es un CARRUSEL/);
    expect(t).toMatch(/"guion" \(SÓLO en las de formato Carrusel\)/);
    expect(t).toMatch(/"guion" \(SÓLO en las de formato Reel IA 10 s\)/);
    expect(t).toMatch(/ESTRATEGIA DEL MES[\s\S]*Campaña: Marzo cómodo[\s\S]*Ofertas del mes: 10 % en sofás[\s\S]*Código promocional: COMODO[\s\S]*Semana 1: Semana del descanso/);
    expect(t).toMatch(/idea de la agencia .*«Errores al comprar un sofá»/);
    expect(t).toMatch(/"hashtags"/);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("lote del mes");
  });

  it("el producto foco de la estrategia pesa la mitad de la rotación y el objetivo va en el pedido", async () => {
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: ["a", "b", "c", "d"].map((id) => ({ id, nombre: `P${id}`, precio: "$1" })) } });
    anthropic(JSON.stringify({ ideas: [] }));
    const casillas = Array.from({ length: 8 }, (_, i) => ({ clave: `2030-03-${String(i + 2).padStart(2, "0")}|0`, fecha: `2030-03-${String(i + 2).padStart(2, "0")}`, formato: "post", pilar: "anuncio" }));
    await plan({ casillas, estrategia: { campana: "X", objetivo: "Vender — Llevar a la compra", foco: "Pc", focoId: "c", semanas: [] } });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/Objetivo del mes: Vender/);
    expect(t).toMatch(/Foco: Pc/);
    expect((t.match(/producto: Pc/g) ?? []).length).toBe(4);
  });

  it("un video con rostro (UGC) del plan semanal: el pedido dice que lo graba una persona y la idea vuelve marcada", async () => {
    anthropic(JSON.stringify({ ideas: [
      { n: 1, titulo: "Detrás de cámaras", titular: "Así armamos tu sofá", escena: "En el taller", guion: "[0–3 s] Hola, soy Ana…" },
      { n: 2, titulo: "Reel IA", titular: "Se abre solo", escena: "Manos", guion: "[0–2 s] …" },
    ] }));
    const r = await (await plan({ casillas: [
      { clave: "2030-03-05|0", fecha: "2030-03-05", formato: "reel", pilar: "humano", rostro: true },
      { clave: "2030-03-05|1", fecha: "2030-03-05", formato: "reel", pilar: "humano", rostro: "sí" },
    ] })).json();
    expect(r.ideas[0]).toMatchObject({ clave: "2030-03-05|0", rostro: true });
    // Sólo el booleano: lo demás no lo marca.
    expect(r.ideas[1].rostro).toBeUndefined();
    const t = textoDe(peticiones[0]);
    expect((t.match(/UGC \(guion para grabar/g) ?? []).length).toBe(1);
    expect(t).toMatch(/VOZ: «lo que dice, palabra por palabra»/);
  });

  it("«Otra»: la que había y lo que pide la agencia van en el pedido", async () => {
    anthropic(JSON.stringify({ ideas: [{ n: 1, titulo: "Nueva", titular: "Otra cosa", escena: "Una cocina" }] }));
    const r = await (await plan({ casillas: [{ clave: "p1", fecha: "2030-03-04", formato: "post", pilar: "educativo", antes: "Duerme mejor", pide: "más divertida, sin precio" }] })).json();
    expect(r.ideas[0]).toMatchObject({ clave: "p1", titulo: "Nueva" });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/la que había y NO sirvió .*«Duerme mejor»/);
    expect(t).toMatch(/lo que pide la agencia para esta: más divertida, sin precio/);
  });

  it("sin casillas que se puedan escribir, 400 sin llamar a la IA", async () => {
    anthropic("x");
    expect((await plan({ casillas: [] })).status).toBe(400);
    expect((await plan({ casillas: [{ fecha: "2030-03-04", formato: "live" }] })).status).toBe(400);
    expect(peticiones).toHaveLength(0);
  });
});

describe("POST /api/estudio/<cliente>/estrategia («Proponer la estrategia con IA»)", () => {
  const estrategia = (datos) => pedir("/api/estudio/c1/estrategia", { method: "POST", body: datos });

  it("con el catálogo, las semanas, las fechas y lo que mejor funcionó el mes anterior; propone sin guardar", async () => {
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: [{ id: "sofa", nombre: "Sofá cama", precio: "$399" }, { id: "mesa", nombre: "Mesa", precio: "$120" }] } });
    const s = db.sqlite;
    s.prepare("insert into cuentas_sociales (id, owner_id, red, externo_id, client_id) values (?,?,?,?,?)").run("ig1", JEFE, "instagram", "IG1", "c1");
    const met = s.prepare("insert into metricas_publicacion (id, owner_id, client_id, cuenta_id, red, externo_id, texto, publicada_at, interacciones) values (?,?,?,?,?,?,?,?,?)");
    met.run("m1", JEFE, "c1", "ig1", "instagram", "e1", "El sofá que se abre en 3 segundos", "2030-02-10T12:00:00Z", 300);
    met.run("m2", JEFE, "c1", "ig1", "instagram", "e2", "Fuera del mes", "2030-03-02T12:00:00Z", 900);
    anthropic(JSON.stringify({ objetivo: "ventas", foco: "sofa", campana: "Marzo cómodo", razon: "Porque sí", semanas: [{ concepto: "Visitas", etapa: "atraer" }, { concepto: "El sofá", etapa: "convertir" }] }));
    const res = await estrategia({ year: 2030, month: 2, objetivo: "ventas", semanas: [{ desde: "2030-03-01", hasta: "2030-03-07" }, { desde: "2030-03-08", hasta: "2030-03-14" }, { desde: "2030-02-01", hasta: "2030-02-02" }] });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.estrategia).toMatchObject({ objetivo: "ventas", focoId: "sofa", foco: "Sofá cama", campana: "Marzo cómodo" });
    // Sólo las semanas de ESE mes.
    expect(r.semanas).toHaveLength(2);
    expect(r.estrategia.semanas.map((x) => x.etapa)).toEqual(["atraer", "convertir"]);
    expect(r.mejores.map((m) => m.texto)).toEqual(["El sofá que se abre en 3 segundos"]);
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/OBJETIVO \(lo decidió la agencia, respétalo\): Vender/);
    expect(t).toMatch(/\[sofa\] Sofá cama/);
    expect(t).toMatch(/300 interacciones\] El sofá que se abre/);
    expect(t).not.toMatch(/Fuera del mes/);
    expect(t).not.toMatch(/margen del 40/);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("estrategia del mes");
  });

  it("un mes que no existe, 400 sin llamar a la IA", async () => {
    anthropic("{}");
    expect((await estrategia({ year: 2030, month: 12 })).status).toBe(400);
    expect(peticiones).toHaveLength(0);
  });
});

describe("POST /api/estudio/<cliente>/lote/ideas: la matriz y por tipos", () => {
  const lote = (datos) => pedir("/api/estudio/c1/lote/ideas", { method: "POST", body: datos });
  const conEstudio = async () => {
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: [{ id: "sofa", nombre: "Sofá cama", precio: "$399" }] } });
    db.sqlite.prepare("update mercado_clientes set estudio = ? where client_id = 'c1'").run(JSON.stringify({
      general: {
        resumen: "Mercado de muebles.", perfiles: [{ nombre: "Pareja joven", quien: "primer apartamento" }, { nombre: "Familia", quien: "con niños" }],
        deseos: [{ deseo: "Tranquilidad" }, { deseo: "Ahorro" }],
      },
      productos: {},
    }));
  };

  it("la matriz: una pieza por deseo × perfil × nivel, sólo de los del estudio; el producto no sale en los niveles fríos", async () => {
    await conEstudio();
    anthropic(JSON.stringify({ ideas: [1, 2, 3, 4].map((n) => ({ n, titulo: `T${n}`, brief: `B${n}`, titular: `Titular ${n}`, escena: `Escena ${n}` })) }));
    const res = await lote({ modo: "matriz", productoId: "sofa", deseos: ["Tranquilidad", "Inventado"], perfiles: ["Pareja joven", "Familia"], niveles: ["problema", "decision"] });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.ideas.map((i) => [i.deseo, i.perfil, i.nivel, i.conProducto])).toEqual([
      ["Tranquilidad", "Pareja joven", "problema", false], ["Tranquilidad", "Pareja joven", "decision", true],
      ["Tranquilidad", "Familia", "problema", false], ["Tranquilidad", "Familia", "decision", true],
    ]);
    expect(r.ideas[1]).toMatchObject({ productoId: "sofa", producto: "Sofá cama", titulo: "T2", brief: "B2" });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/Los perfiles:\n- Pareja joven: primer apartamento/);
    expect(t).toMatch(/NO aparece en la imagen/);
  });

  it("la matriz sin estudio aprobado no llama a nadie", async () => {
    anthropic("x");
    expect((await lote({ modo: "matriz", deseos: ["Tranquilidad"], perfiles: ["Familia"], niveles: ["problema"] })).status).toBe(400);
    expect(peticiones).toHaveLength(0);
  });

  it("por tipos: cuántas de cada tipo, con la matriz del mes (la maleta que toca) y sin composiciones de objeto donde no hay producto", async () => {
    await conEstudio();
    anthropic(JSON.stringify({ ideas: [1, 2, 3].map((n) => ({ n, titular: `Titular ${n}`, escena: `Escena ${n}` })) }));
    const r = await (await lote({ modo: "tipos", tipos: { educativo: 2, maletas: 1 } })).json();
    expect(r.ideas.map((i) => i.tipo)).toEqual(["educativo", "educativo", "maletas"]);
    expect(r.ideas[2].pilarSub).toBeTruthy();
    expect(r.ideas.filter((i) => i.tipo === "educativo").every((i) => i.conProducto === false)).toBe(true);
    expect((await lote({ modo: "tipos", tipos: {} })).status).toBe(400);
  });

  it("por TANDAS: sólo esas casillas del plan (el mismo plan con la misma semilla), el total, y fuera del plan nadie es llamado", async () => {
    await conEstudio();
    const cuerpo = { modo: "tipos", tipos: { educativo: 3, maletas: 2 }, semilla: 7, formato: "carrusel" };
    anthropic(JSON.stringify({ ideas: [1, 2, 3, 4, 5].map((n) => ({ n, titular: `Titular ${n}`, escena: `Escena ${n}`, guion: `Portada: ${n}\nSlide 2: algo` })) }));
    const entero = await (await lote(cuerpo)).json();
    anthropic(JSON.stringify({ ideas: [{ n: 4, titular: "Cuarta", escena: "E4", guion: "Portada: 4" }, { titular: "Quinta sin número", escena: "E5" }] }));
    const tanda = await (await lote({ ...cuerpo, desde: 3, tamano: 2 })).json();
    expect(tanda.total).toBe(5);
    expect(tanda.ideas.map((i) => [i.n, i.titular, i.tipo, i.composicion])).toEqual([
      [4, "Cuarta", entero.ideas[3].tipo, entero.ideas[3].composicion], [5, "Quinta sin número", entero.ideas[4].tipo, entero.ideas[4].composicion],
    ]);
    expect(tanda.ideas[0].guion).toBe("Portada: 4");
    // El pedido es de carrusel y pide su guion; sólo las dos casillas de la tanda.
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/formato Carrusel/);
    expect(t).toMatch(/"guion"/);
    expect(t).not.toMatch(/^1\. /m);
    anthropic("x");
    const vacia = await (await lote({ ...cuerpo, desde: 5, tamano: 2 })).json();
    expect(vacia).toMatchObject({ ideas: [], total: 5 });
    expect(peticiones).toHaveLength(0);
  });
});

describe("POST /api/estudio/<cliente>/carrusel/ideas y /reel/ideas", () => {
  it("carrusel: ideas con su guion por láminas, con lo que se sabe de la marca y sin lo interno; no crea trabajos", async () => {
    anthropic(JSON.stringify({ ideas: [{ titulo: "Mitos", tema: "Tres mitos del sofá", guion: "Portada: ¿Mito?\nSlide 2: No\nCTA: Escríbenos" }] }));
    const res = await pedir("/api/estudio/c1/carrusel/ideas", { method: "POST", body: { n: 3 } });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.ideas[0]).toMatchObject({ titulo: "Mitos", guion: expect.stringMatching(/^Portada: ¿Mito\?/) });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/ideas de CARRUSEL/);
    expect(t).not.toMatch(/margen del 40/);
    expect(db.sqlite.prepare("select count(*) n from estudio_trabajos").get().n).toBe(0);
  });

  it("reel: la idea central con su duración; si la IA no devuelve nada que sirva, lo dice", async () => {
    anthropic(JSON.stringify({ ideas: [{ titulo: "Gancho", idea: "Una pareja abre el sofá cama" }] }));
    const r = await (await pedir("/api/estudio/c1/reel/ideas", { method: "POST", body: { segundos: 8 } })).json();
    expect(r.ideas).toEqual([{ id: "idea-1", titulo: "Gancho", idea: "Una pareja abre el sofá cama" }]);
    expect(textoDe(peticiones[0])).toMatch(/REEL vertical de 8 segundos/);
    anthropic("nada");
    expect((await pedir("/api/estudio/c1/reel/ideas", { method: "POST", body: {} })).status).toBe(502);
  });
});

describe("las pautas para escribir van en TODO lo que escribe, encuentre la búsqueda lo que encuentre", () => {
  const PAUTA = "Los reels empiezan con una pregunta al público. Nunca uses emojis de fuego.";
  beforeEach(async () => {
    // Marcada interna a propósito: una pauta no puede serlo (no llegaría a lo que escribe).
    const r = await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Cómo escribimos", texto: PAUTA, tipo: "pautas", interna: true } });
    expect(r.status).toBe(201);
  });

  it("una pauta nunca es interna", () => {
    expect(db.sqlite.prepare("select tipo, interna from cerebro_notas where titulo = 'Cómo escribimos'").get()).toEqual({ tipo: "pautas", interna: 0 });
  });

  it("en «Dame ideas», en el lote y en la propuesta del carrusel, con su título y sin lo interno", async () => {
    anthropic(JSON.stringify({ ideas: [{ n: 1, titulo: "x", escena: "y" }] }));
    await pedir("/api/estudio/c1/ideas", { method: "POST", body: { n: 1, tema: "regreso a clases" } });
    await pedir("/api/estudio/c1/lote/ideas", { method: "POST", body: { cuantas: { problema: 1 } } });
    await pedir("/api/estudio/c1/carrusel/propuesta", { method: "POST", body: { tema: "Cómo elegir un colchón" } });
    expect(peticiones).toHaveLength(3);
    for (const p of peticiones) {
      const t = textoDe(p);
      expect(t).toMatch(/PAUTAS PARA ESCRIBIR/);
      expect(t).toContain(PAUTA);
      expect(t).not.toMatch(/margen del 40/);
    }
  });
});

describe("el cerebro se busca por TIPO y se dice qué material falta (lib/materialTipo.js)", () => {
  const plan = (casillas) => pedir("/api/estudio/c1/lote/ideas", { method: "POST", body: { modo: "plan", casillas } });
  const IDEA = JSON.stringify({ ideas: [{ n: 1, titulo: "x", brief: "b", titular: "Algo", escena: "Una sala" }] });

  it("un testimonio sin testimonios en el cerebro: la IA lo sabe y la respuesta lo avisa; con uno escrito, no", async () => {
    anthropic(IDEA);
    let r = await (await plan([{ clave: "a", fecha: "2030-03-07", formato: "post", pilar: "maletas", pilarSub: "testimonio" }])).json();
    expect(r.faltan).toEqual(["testimonios"]);
    expect(textoDe(peticiones[0])).toMatch(/Lo que NO está en lo que se sabe de la marca \(no lo inventes.*testimonios reales/);
    await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Testimonios", texto: "Testimonio de Ana: «el sofá llegó en dos días y es comodísimo».", tipo: "nota" } });
    anthropic(IDEA);
    r = await (await plan([{ clave: "a", fecha: "2030-03-07", formato: "post", pilar: "maletas", pilarSub: "testimonio" }])).json();
    expect(r.faltan).toBeUndefined();
    expect(textoDe(peticiones[0])).toContain("el sofá llegó en dos días");
  });

  it("el educativo lee entera la nota «Saber del rubro»; sin ella, avisa", async () => {
    anthropic(IDEA);
    let r = await (await plan([{ clave: "a", fecha: "2030-03-05", formato: "carrusel", pilar: "educativo" }])).json();
    expect(r.faltan).toEqual(["rubro"]);
    await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Saber del rubro", texto: "## Consejos\n- Un sofá de espuma de alta densidad dura el doble.", tipo: "nota" } });
    anthropic(IDEA);
    r = await (await plan([{ clave: "a", fecha: "2030-03-05", formato: "carrusel", pilar: "educativo" }])).json();
    expect(r.faltan).toBeUndefined();
    expect(textoDe(peticiones[0])).toMatch(/SABER DEL RUBRO[^\n]*\n## Consejos\n- Un sofá de espuma de alta densidad dura el doble/);
  });

  it("«Saber del rubro»: la IA la propone (no guarda) y si ya había una la mejora", async () => {
    anthropic("Aquí va:\n## Consejos que da un experto\n- Ventila el sofá.");
    let res = await pedir("/api/cerebro/c1/rubro", { method: "POST" });
    expect(res.status).toBe(200);
    let r = await res.json();
    expect(r).toMatchObject({ titulo: "Saber del rubro", texto: "## Consejos que da un experto\n- Ventila el sofá.", existente: null });
    expect(db.sqlite.prepare("select count(*) n from cerebro_notas where ruta = 'saber-del-rubro'").get().n).toBe(0);
    expect(textoDe(peticiones[0])).not.toMatch(/margen del 40/);
    await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: r.titulo, texto: r.texto, tipo: "nota" } });
    const id = db.sqlite.prepare("select id from cerebro_notas where ruta = 'saber-del-rubro'").get().id;
    anthropic("## Consejos que da un experto\n- Ventila el sofá cada semana.");
    r = await (await pedir("/api/cerebro/c1/rubro", { method: "POST" })).json();
    expect(r.existente).toEqual({ id });
    expect(textoDe(peticiones[0])).toContain("LA NOTA DE AHORA");
    expect(db.sqlite.prepare("select funcion from consumo_ia").all().map((x) => x.funcion)).toContain("saber del rubro");
  });
});

describe("un solo director: el carrusel, las correcciones de la agencia y lo que ve", () => {
  const CARRUSEL = JSON.stringify({
    sistema: "Titular entre el 8 y el 22 % de la altura, 80 % del ancho; logo abajo a la derecha.",
    laminas: [
      { n: 1, texto: "¿Duermes mal?", ficha: "Pieza: portada 4:5.\nComposición: titular arriba.\nTexto (exacto): titular «¿Duermes mal?»." },
      { n: 2, texto: "Elige firmeza media", ficha: "Pieza: lámina 4:5.\nTexto (exacto): titular «Elige firmeza media»." },
      { n: 3, texto: "Escríbenos", ficha: "Pieza: cierre 4:5.\nTexto (exacto): botón «Escríbenos»." },
    ],
  });
  const edicion = (id, texto, minuto) => db.sqlite.prepare("insert into estudio_trabajos (id, owner_id, client_id, motor, modelo, prompt, created_at) values (?,?,?,?,?,?,?)")
    .run(id, JEFE, "c1", "gemini", "nano-banana", texto, `2026-10-20T10:${minuto}:00.000Z`);

  it("el carrusel lo diseña el director con el MISMO modelo que el chat: sistema de la serie y una ficha por lámina", async () => {
    edicion("e1", "Edita la imagen de referencia: el titular más arriba y más grande. Conserva todo lo demás exactamente igual.", "01");
    edicion("e2", "Edita la imagen de referencia: donde dice «Sofa» debe decir «Sofá». Conserva todo lo demás exactamente igual.", "02");
    anthropic(CARRUSEL);
    const vista = { media_type: "image/jpeg", data: "QUJD" };
    const r = await (await pedir("/api/estudio/c1/carrusel/propuesta", { method: "POST", body: { guion: "Portada: ¿Duermes mal?\nSlide 1: Elige firmeza media\nCTA: Escríbenos", vistas: [vista, { media_type: "text/html", data: "x" }] } })).json();
    expect(r.hilo).toMatch(/entre el 8 y el 22 %/);
    expect(r.laminas.map((l) => l.rol)).toEqual(["portada", "contenido", "cierre"]);
    expect(r.laminas[1].ficha).toMatch(/^Pieza: lámina 4:5\./);
    const p = peticiones[0];
    const t = textoDe(p);
    expect(t).toMatch(/MANUAL DEL DIRECTOR/);
    expect(t).toMatch(/Un carrusel es UNA serie/);
    // Lo que la agencia corrigió hace poco, sin la letra mal escrita (eso lo arregla el control solo).
    expect(t).toMatch(/CORRECCIONES QUE LA AGENCIA HIZO HACE POCO[^]*- el titular más arriba y más grande/);
    expect(t).not.toMatch(/donde dice «Sofa»/);
    // Ve la imagen buena (la que no es imagen, fuera) y se le dice qué es.
    expect(p.messages[0].content.filter((b) => b.type === "image")).toHaveLength(1);
    expect(t).toMatch(/imagen de arriba es plantillas y piezas que le gustaron/);
    expect(db.sqlite.prepare("select funcion from consumo_ia order by rowid desc").get().funcion).toBe("director de arte");
  });

  it("las fichas del lote también leen las correcciones de la agencia", async () => {
    edicion("e3", "Edita la imagen de referencia: el logo más pequeño. Conserva todo lo demás exactamente igual.", "03");
    anthropic(JSON.stringify({ concepto: "x", piezas: [{ n: 1, ficha: "Pieza: post.\nTexto: NINGUNO." }] }));
    await pedir("/api/estudio/c1/fichas", { method: "POST", body: { piezas: [{ n: 1, idea: "Un sofá", sinTexto: true }] } });
    expect(textoDe(peticiones[0])).toMatch(/- el logo más pequeño/);
  });
});
