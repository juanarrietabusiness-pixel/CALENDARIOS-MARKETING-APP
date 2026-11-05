import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";

// ============================================================
// UN solo motor de texto (modo «campos» y la ficha del cliente)
//
// Lo que importa:
//   1. Lo que le falta a una publicación ya en el calendario (los botones
//      «IA», «Completar», la lista, el banco, «Planificar mes») va por el
//      motor del servidor: con lo ya escrito delante y SÓLO los campos
//      pedidos.
//   2. El motor recibe TODO lo del cliente en TODOS sus modos: sus
//      instrucciones obligatorias, su estilo, sus hashtags de marca y su
//      contacto. Antes lo leían los caminos viejos (api.js) y él no.
//   3. La estrategia del mes llega siempre: la que manda la pantalla o, si no
//      la manda, la guardada en el calendario de ese mes.
//   4. Una regla por formato: a una historia no se le pide caption, los
//      hashtags van aparte (los del final del caption se sacan) y una UGC
//      sigue la fórmula que escogió la agencia.
// ============================================================

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
    async get(clave) {
      if (!objetos.has(clave)) return null;
      const bytes = new TextEncoder().encode(objetos.get(clave));
      return { arrayBuffer: async () => bytes, text: async () => objetos.get(clave) };
    },
    async head(clave) { return objetos.has(clave) ? {} : null; },
    async put(clave, valor) { objetos.set(clave, typeof valor === "string" ? valor : new TextDecoder().decode(valor)); },
    async delete(clave) { for (const k of [].concat(clave)) objetos.delete(k); },
  };
}

const pedir = (ruta, opciones = {}) =>
  worker.fetch(new Request(`https://calendarios.test${ruta}`, {
    ...opciones,
    headers: { Cookie: `${COOKIE}=t-jefe`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const lote = (datos) => pedir("/api/estudio/c1/lote/ideas", { method: "POST", body: datos });
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-jefe", "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run("u-jefe", "u-jefe", "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("t-jefe"), "u-jefe", "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare(`insert into clients (id, owner_id, name, ai_instructions, estilo_guion, estilo_locucion, hashtags, whatsapp, instagram, sucursales)
    values (?,?,?,?,?,?,?,?,?,?)`).run(
    "c1", "u-jefe", "Dcasa", "Nunca digas «barato»: di «a buen precio».\nTrata siempre de tú.", "Cercano y con humor",
    "Voz cálida, sin prisas", "#Dcasa #MueblesPanama", "+507 6000-0000", "dcasa.pa", "Vía España y Los Pueblos",
  );
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("la ficha del cliente va en TODOS los modos", () => {
  it("modo «campos»: instrucciones obligatorias, estilo, locución, hashtags de marca, WhatsApp, Instagram y sucursales", async () => {
    anthropic(JSON.stringify({ textos: [{ n: 1, descripcion: "Ven hoy." }] }));
    const r = await lote({ modo: "campos", publicaciones: [{ clave: "p1", formato: "post", escrito: { idea: "Sofá cama" }, campos: ["descripcion"] }] });
    expect(r.status).toBe(200);
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/INSTRUCCIONES OBLIGATORIAS DEL CLIENTE \(mandan[^)]*\):\nNunca digas «barato»: di «a buen precio»\.\nTrata siempre de tú\./);
    expect(t).toMatch(/Estilo de sus textos: Cercano y con humor/);
    expect(t).toMatch(/Estilo de su locución[^:]*: Voz cálida, sin prisas/);
    expect(t).toMatch(/Hashtags de la marca: #Dcasa #MueblesPanama/);
    expect(t).toMatch(/WhatsApp \+507 6000-0000 · Instagram @dcasa\.pa/);
    expect(t).toMatch(/Dónde está: Vía España y Los Pueblos/);
  });

  it("modo «plan» y modo «publicacion» también (antes sólo lo leían los caminos viejos)", async () => {
    anthropic(JSON.stringify({ ideas: [{ n: 1, titular: "Uno", escena: "Una sala" }] }));
    await lote({ modo: "plan", casillas: [{ clave: "a", fecha: "2030-03-04", formato: "post", pilar: "educativo" }] });
    await lote({ modo: "publicacion", formato: "post", publicacion: { fecha: "2030-03-04" } });
    for (const p of peticiones) {
      expect(textoDe(p)).toMatch(/INSTRUCCIONES OBLIGATORIAS DEL CLIENTE/);
      expect(textoDe(p)).toMatch(/Hashtags de la marca: #Dcasa/);
    }
  });
});

describe("la estrategia del mes llega siempre", () => {
  it("sin la de la pantalla, el motor lee la GUARDADA en el calendario de ese mes (objetivo, foco, ofertas, semanas con su etapa)", async () => {
    db.sqlite.prepare(`insert into calendars (id, client_id, owner_id, month, year, campaign, week_concepts, offers, promo_code, opciones)
      values (?,?,?,?,?,?,?,?,?,?)`).run(
      "k1", "c1", "u-jefe", 2, 2030, "Marzo cómodo", JSON.stringify(["Semana del descanso", "Visitas"]), "10 % en sofás", "COMODO",
      JSON.stringify({ estrategia: { objetivo: "ventas", focoId: "sofa", foco: "Sofá cama", etapas: ["atraer", "convertir"] } }),
    );
    anthropic(JSON.stringify({ ideas: [{ n: 1, titular: "Uno", escena: "Una sala" }] }));
    await lote({ modo: "publicacion", formato: "post", publicacion: { fecha: "2030-03-04" } });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/ESTRATEGIA DEL MES[\s\S]*Objetivo del mes: Vender[\s\S]*Campaña: Marzo cómodo[\s\S]*Foco: Sofá cama[\s\S]*Ofertas del mes: 10 % en sofás[\s\S]*Código promocional: COMODO/);
    expect(t).toMatch(/Semana 1: Semana del descanso \(etapa: Atraer/);
    expect(t).toMatch(/Semana 2: Visitas \(etapa: Convertir/);
  });

  it("la que manda la pantalla gana (en «Planificar mes» está a medias, sin guardar)", async () => {
    db.sqlite.prepare("insert into calendars (id, client_id, owner_id, month, year, campaign) values (?,?,?,?,?,?)").run("k1", "c1", "u-jefe", 2, 2030, "La guardada");
    anthropic(JSON.stringify({ textos: [] }));
    await lote({ modo: "campos", publicaciones: [{ clave: "p1", fecha: "2030-03-04", formato: "post", campos: ["descripcion"] }], estrategia: { campana: "La de la pantalla" } });
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/Campaña: La de la pantalla/);
    expect(t).not.toMatch(/La guardada/);
  });
});

describe("modo «campos»: lo que le falta a una publicación ya en el calendario", () => {
  it("con lo ya escrito delante, sólo los campos pedidos, y los hashtags aparte (los del final del caption se sacan)", async () => {
    await pedir("/api/mercado/c1/catalogo", { method: "PUT", body: { catalogo: [{ id: "sofa", nombre: "Sofá cama", precio: "$399" }] } });
    anthropic(JSON.stringify({ textos: [
      { n: 1, descripcion: "¿Llegan visitas? Escríbenos.\n\n#sofacama #panama", hashtags: "#Dcasa", guion: "no se pidió" },
      { n: 2, guion: "Portada: 3 errores\nSlide 1: …\nCTA: Escríbenos" },
    ] }));
    const res = await lote({ modo: "campos", publicaciones: [
      { clave: "p1", fecha: "2030-03-04", formato: "post", pilar: "beneficios", productoId: "sofa",
        escrito: { titulo: "Visitas", idea: "Resuelve dónde duermen las visitas", textoPieza: "¿Llegan visitas?" }, campos: ["descripcion", "hashtags", "guion"] },
      { clave: "p2", fecha: "2030-03-05", formato: "carrusel", pilar: "educativo", escrito: { idea: "Errores al comprar un sofá" }, campos: ["guion"] },
    ] });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.textos).toEqual([
      { clave: "p1", n: 1, campos: { descripcion: "¿Llegan visitas? Escríbenos.", hashtags: "#Dcasa #sofacama #panama" } },
      { clave: "p2", n: 2, campos: { guion: "Portada: 3 errores\nSlide 1: …\nCTA: Escríbenos" } },
    ]);
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/YA ESCRITO \(manda[^)]*\):\n {5}título: «Visitas»\n {5}idea: «Resuelve dónde duermen las visitas»\n {5}texto en la pieza: «¿Llegan visitas\?»/);
    // Un post no lleva guion (lib/reglasFormato.js): no se le pide aunque venga en la lista.
    expect(t).toMatch(/escribe: "descripcion", "hashtags"\n/);
    expect(t).toMatch(/producto: Sofá cama \(producto\) · precio: \$399/);
    expect(t).toMatch(/"guion" \(en un carrusel\): las láminas del carrusel/);
    // El carrusel rota su estructura como el lote.
    expect(t).toMatch(/estructura del carrusel/i);
    expect(t).toMatch(/SIN hashtags \(van aparte\)/);
    expect(t).not.toMatch(/Hook/);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("guiones");
    expect(db.sqlite.prepare("select count(*) as n from estudio_trabajos").get().n).toBe(0);
  });

  it("un campo que ya tenía texto y se pide con su botón: «escribe una versión mejor que conserve su intención»", async () => {
    anthropic(JSON.stringify({ textos: [{ n: 1, idea: "Curso de maquillaje gratis por la compra de cualquier base, este sábado" }] }));
    const r = await (await lote({ modo: "campos", publicaciones: [
      { clave: "p1", formato: "live", escrito: {}, antes: { idea: "Curso de maquillaje gratis por la compra de" }, campos: ["idea"] },
    ] })).json();
    expect(r.textos[0].campos.idea).toMatch(/este sábado/);
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/\[Directo\]/);
    expect(t).toMatch(/lo que tiene ahora en «idea» \(escribe una versión mejor que conserve su intención[^)]*\): «Curso de maquillaje gratis por la compra de»/);
    expect(t).toMatch(/MEJÓRALA conservando su tema, su producto, su oferta y su enfoque: no la cambies por otra idea ni por otro formato/);
    expect(t).toMatch(/Es un DIRECTO/);
    expect(db.sqlite.prepare("select funcion from consumo_ia").get().funcion).toBe("publicación");
  });

  it("a una HISTORIA no se le pide caption ni hashtags (y si sólo pide eso, 400 sin llamar a la IA)", async () => {
    anthropic("x");
    const r = await lote({ modo: "campos", publicaciones: [{ clave: "h1", formato: "historia", campos: ["descripcion", "hashtags", "guion"] }] });
    expect(r.status).toBe(400);
    expect(peticiones).toHaveLength(0);
    expect((await lote({ modo: "campos", publicaciones: [] })).status).toBe(400);
  });

  it("una UGC con la fórmula que escogió la agencia: su línea, su duración, la voz de la marca y los ganchos", async () => {
    const { formula } = await (await pedir("/api/formulas-ugc", { method: "POST", body: { formula: {
      nombre: "Pregunta incómoda", duracion: 30, gancho: "una pregunta", porQue: "toca un dolor",
      tramos: [{ desde: 0, hasta: 3, funcion: "una pregunta que toca un dolor" }, { desde: 3, hasta: 25, funcion: "la demostración" }, { desde: 25, hasta: 30, funcion: "el precio" }],
    } } })).json();
    await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Voz UGC", texto: "Ana, de tú, sin tecnicismos.", tipo: "nota" } });
    anthropic(JSON.stringify({ textos: [{ n: 1, guion: "[0–3 s] VOZ: «¿Tu sofá se hunde?» | SE VE: Ana en la sala | TEXTO: ¿Se hunde?\n[3–15 s] VOZ: «Mira.» | SE VE: el sofá | TEXTO:", ganchos: ["¿Y si tu sofá durara?", "Esto le pasa a tu sofá"] }] }));
    const r = await (await lote({ modo: "campos", publicaciones: [
      { clave: "u1", fecha: "2030-03-07", formato: "reel", pilar: "humano", rostro: true, duracionUgc: 15, formulaUgc: formula.id, escrito: { idea: "Ana enseña el sofá" }, campos: ["guion"] },
    ] })).json();
    expect(r.textos[0].ganchos).toEqual(["¿Y si tu sofá durara?", "Esto le pasa a tu sofá"]);
    expect(r.textos[0].campos.guion).toMatch(/^\[0–3 s\] VOZ: «¿Tu sofá se hunde\?»/);
    const t = textoDe(peticiones[0]);
    expect(t).toMatch(/guion para grabar de 15 s, unas 38 palabras/);
    expect(t).toMatch(/SIGUE ESTA FÓRMULA «Pregunta incómoda»/);
    expect(t).toMatch(/VOZ UGC DE ESTA MARCA[\s\S]*Ana, de tú/);
    expect(t).toMatch(/UGC · GUION PARA GRABAR \(15 segundos\)/);
    // Con la fórmula escogida no se ofrecen las demás para escoger.
    expect(t).not.toMatch(/FÓRMULAS DE LA AGENCIA/);
  });
});
