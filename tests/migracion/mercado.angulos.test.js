import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";

// ============================================================
// Lo que el estudio de mercado sacó de la investigación del curso, por sus rutas:
//   1. «Proponer ángulos» (POST /api/mercado/<c>/estudio/angulos): barata (sin búsqueda web), con el estudio del producto
//      delante, y la propuesta va al BORRADOR —creado desde el aprobado— para aprobarla como siempre.
//   2. «Lenguaje del cliente» (POST /api/cerebro/<c>/lenguaje): lee lo pegado, los comentarios de OTRAS personas de la
//      Bandeja y la encuesta; el código descarta lo que no está tal cual y oculta la competencia; NO guarda.
//   3. El estudio general y el de un producto leen las referencias analizadas y la nota del lenguaje.
//   4. Un cliente de otro espacio no existe.
// ============================================================

const JEFE = "u-jefe";
const TESTIGO = "t-jefe";
let db;
let env;
let peticiones;
let respuestas;

const sse = (tipo, datos) => `event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`;
const flujo = (texto) => new Response([
  sse("message_start", { message: { model: "x", usage: { input_tokens: 1200 } } }),
  sse("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
  sse("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto } }),
  sse("content_block_stop", { index: 0 }),
  sse("message_delta", { delta: { stop_reason: "end_turn" }, usage: { output_tokens: 300 } }),
].join(""), { headers: { "content-type": "text/event-stream" } });

function anthropic(...lista) {
  peticiones = [];
  respuestas = [...lista];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      const cuerpo = JSON.parse(opciones.body);
      peticiones.push(cuerpo);
      const r = respuestas.length > 1 ? respuestas.shift() : respuestas[0];
      return typeof r === "function" ? r(cuerpo) : r;
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
    headers: { Cookie: `${COOKIE}=${TESTIGO}`, "Content-Type": "application/json" },
    body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
  }), env);
const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};
const fila = () => db.sqlite.prepare("select estudio, borrador from mercado_clientes where client_id = 'c1'").get();

const CATALOGO = [{ id: "p-lavado", nombre: "Lavado de muebles", tipo: "servicio", precio: "Desde $45", beneficios: "Seca en 4 horas", activo: true, fotos: [] }];
const GENERAL = {
  rubro: "Limpieza", resumen: "Mucha oferta informal.", competidores: [{ nombre: "LimpiaYa", queHacen: "Promos" }],
  perfiles: [{ nombre: "Mamá ocupada", quien: "Trabaja", dolor: "Manchas", aspiracion: "Casa limpia" }],
  deseos: [{ deseo: "Tranquilidad", porque: "Confianza" }], nivel: { dominante: "problema", porque: "x" }, propuestaValor: "Como nuevo en un día",
};
// Un estudio APROBADO de antes: sin ángulos y sin ninguna prueba real.
const APROBADO = {
  general: GENERAL,
  productos: { "p-lavado": { elementos: { publico: "Familias", problema: "Manchas", solucion: "Lavado a domicilio" }, objeciones: [], pruebas: [], ganchos: {}, anuncio: {}, faltan: [] } },
  aprobadoAt: "2026-10-01T00:00:00.000Z", hechoAt: "2026-09-30T00:00:00.000Z",
};
const ANGULOS = JSON.stringify({
  angulos: [
    { nombre: "Sin olor a mascota", problemaExterno: "Pelos y olor", garantia: "Garantía de 30 días", ganchos: ["Mi sofá olía a perro"], publico: "frio" },
    { nombre: "Sin perder el sábado", solucion: "Seca en 4 horas", ganchos: ["Limpio antes del almuerzo"], publico: "tibio" },
    { nombre: "Más barato que uno nuevo", falsaCreencia: "Lavarlo cuesta lo mismo", ganchos: ["No lo cambies todavía"] },
  ],
  faltan: ["Fotos del antes y el después"],
});

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run(JEFE, "jefe@a.com", "x", "x");
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-otro", "otro@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run(JEFE, JEFE, "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256(TESTIGO), JEFE, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name, industry) values (?,?,?,?)").run("c1", JEFE, "Dcasa", "Limpieza de muebles");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("ajeno", "u-otro", "De otra agencia");
  s.prepare("insert into mercado_clientes (id, owner_id, client_id, catalogo, estudio, referencias) values (?,?,?,?,?,?)")
    .run("m1", JEFE, "c1", JSON.stringify(CATALOGO), JSON.stringify(APROBADO), "[]");
  await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Costos", texto: "El costo del químico es de 3 dólares y el margen del 70 %.", tipo: "documento", interna: true } });
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("«Proponer ángulos» de un producto ya estudiado", () => {
  it("es barata (sin búsqueda web), lleva el estudio y nada interno, y deja la propuesta en el BORRADOR", async () => {
    anthropic(flujo(ANGULOS));
    const r = await pedir("/api/mercado/c1/estudio/angulos", { method: "POST", body: { productoId: "p-lavado" } });
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(peticiones).toHaveLength(1);
    expect(peticiones[0].tools).toBeUndefined();
    const t = textoDe(peticiones[0]);
    expect(t).toContain("SU ESTUDIO (las 7 maletas");
    expect(t).toContain("Lavado a domicilio");
    expect(t).not.toContain("margen del 70");
    // La garantía del primer ángulo era inventada (el estudio no tiene ninguna prueba): fuera, y se pide.
    expect(d.angulos.map((a) => a.nombre)).toEqual(["Sin olor a mascota", "Sin perder el sábado", "Más barato que uno nuevo"]);
    expect(d.angulos[0]).not.toHaveProperty("garantia");
    expect(d.borrador).not.toHaveProperty("aprobadoAt");
    // En la base: el aprobado sigue igual (sin ángulos) y el borrador los trae.
    const f = fila();
    expect(JSON.parse(f.estudio).productos["p-lavado"].angulos).toBeUndefined();
    const b = JSON.parse(f.borrador);
    expect(b.productos["p-lavado"].angulos).toHaveLength(3);
    expect(b.productos["p-lavado"].faltan).toEqual(["Fotos del antes y el después", expect.stringMatching(/garantía o una prueba real/)]);
    // Y se apuntó su costo.
    expect(db.sqlite.prepare("select count(*) as n from consumo_ia where funcion = 'estudio de mercado'").get().n).toBe(1);
  });

  it("sin estudio de ese producto, 409 sin llamar a la IA; un producto que no está, 404; un cliente ajeno no existe", async () => {
    anthropic(flujo(ANGULOS));
    db.sqlite.prepare("update mercado_clientes set estudio = ? where client_id = 'c1'").run(JSON.stringify({ general: GENERAL, productos: {} }));
    expect((await pedir("/api/mercado/c1/estudio/angulos", { method: "POST", body: { productoId: "p-lavado" } })).status).toBe(409);
    expect((await pedir("/api/mercado/c1/estudio/angulos", { method: "POST", body: { productoId: "p-otro" } })).status).toBe(404);
    expect((await pedir("/api/mercado/c1/estudio/angulos", { method: "POST", body: {} })).status).toBe(400);
    expect((await pedir("/api/mercado/ajeno/estudio/angulos", { method: "POST", body: { productoId: "p-lavado" } })).status).toBe(404);
    expect(peticiones).toHaveLength(0);
  });

  it("con un borrador en curso, los pone en ÉL (lo de los otros productos no se toca)", async () => {
    const borrador = { ...APROBADO, general: { ...GENERAL, resumen: "Lo corregido a mano." } };
    delete borrador.aprobadoAt;
    db.sqlite.prepare("update mercado_clientes set borrador = ? where client_id = 'c1'").run(JSON.stringify(borrador));
    anthropic(flujo(ANGULOS));
    await pedir("/api/mercado/c1/estudio/angulos", { method: "POST", body: { productoId: "p-lavado" } });
    const b = JSON.parse(fila().borrador);
    expect(b.general.resumen).toBe("Lo corregido a mano.");
    expect(b.productos["p-lavado"].angulos).toHaveLength(3);
  });
});

describe("el estudio lee las referencias analizadas y el lenguaje del cliente", () => {
  it("el general recibe los anuncios ya analizados (sin el competidor) y la nota del lenguaje; el de un producto, la nota", async () => {
    db.sqlite.prepare("update mercado_clientes set referencias = ? where client_id = 'c1'").run(JSON.stringify([
      { id: "r1", competidor: "LimpiaYa", medio: "video", origen: "anuncio", analisis: { gancho: "¿Tu sofá huele?", angulo: "dolor", formato: "antes y después", porQueFunciona: "x" } },
    ]));
    await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Lenguaje del cliente", texto: "# Lenguaje del cliente\n\n## Lo que celebran · lo dicen 2 comentarios\n- «quedó como nuevo» (2)\n\n## Para escribir\n- Úsalas tal cual.", tipo: "nota" } });
    anthropic(flujo(JSON.stringify({ ...GENERAL, problemas: { principal: "Le da vergüenza el sofá" } })), flujo(JSON.stringify({ ...APROBADO.productos["p-lavado"], angulos: JSON.parse(ANGULOS).angulos })));
    expect((await pedir("/api/mercado/c1/estudio/general", { method: "POST", body: {} })).status).toBe(200);
    const g = textoDe(peticiones[0]);
    expect(g).toContain("ANUNCIOS Y VIDEOS DE LA COMPETENCIA YA ANALIZADOS");
    expect(g).toContain("gancho: ¿Tu sofá huele?");
    expect(g.split("ANUNCIOS Y VIDEOS")[1].split("Reglas:")[0]).not.toContain("LimpiaYa");
    expect(g).toContain("«quedó como nuevo» (2)");
    expect(g).not.toContain("Úsalas tal cual");
    expect(JSON.parse(fila().borrador).general.problemas.principal).toBe("Le da vergüenza el sofá");
    expect((await pedir("/api/mercado/c1/estudio/producto", { method: "POST", body: { productoId: "p-lavado" } })).status).toBe(200);
    expect(textoDe(peticiones[1])).toContain("«quedó como nuevo» (2)");
    expect(JSON.parse(fila().borrador).productos["p-lavado"].angulos).toHaveLength(3);
  });
});

describe("«Lenguaje del cliente»", () => {
  const ahora = "2026-11-10T12:00:00.000Z";
  const comentario = (id, texto, propio = 0) => db.sqlite.prepare(
    "insert into bandeja_comentarios (id, owner_id, client_id, red, externo_id, texto, propio, creado_at) values (?,?,?,?,?,?,?,?)",
  ).run(id, JEFE, "c1", "instagram", id, texto, propio, ahora);

  beforeEach(() => {
    comentario("b1", "El sofá quedó como nuevo, se los recomiendo");
    comentario("b2", "Gracias por su comentario, los esperamos de nuevo", 1); // la página respondiendo: no es voz del cliente
    db.sqlite.prepare("insert into voz_cliente (id, owner_id, client_id, respuestas, nombre, permiso) values (?,?,?,?,?,?)")
      .run("v1", JEFE, "c1", JSON.stringify({ porque: "Llegaron puntuales y no dañaron la tela", freno: "Me daba miedo el precio" }), "Ana", 1);
  });

  it("lee lo pegado, la Bandeja (sin lo de la página) y la encuesta; descarta lo que no está, oculta la competencia y NO guarda", async () => {
    anthropic(flujo(JSON.stringify({
      temas: {
        elogio: ["El sofá quedó como nuevo", "Llegaron puntuales y no dañaron la tela", "Excelente servicio siempre"],
        duda: ["Me daba miedo el precio"],
        competencia: ["en Brillo me cobraron el doble"],
      },
      patrones: ["Muchos comparan con Brillo y LimpiaYa"],
    })));
    const antes = db.sqlite.prepare("select count(*) as n from cerebro_notas where client_id = 'c1'").get().n;
    const r = await pedir("/api/cerebro/c1/lenguaje", { method: "POST", body: { texto: "Me encantó el servicio", competencia: "En Brillo me cobraron el doble y tardaron", marcas: "Brillo, Dcasa" } });
    expect(r.status).toBe(200);
    const d = await r.json();
    const t = textoDe(peticiones[0]);
    expect(t).toContain("El sofá quedó como nuevo, se los recomiendo");
    expect(t).not.toContain("los esperamos de nuevo");
    expect(t).toContain("Llegaron puntuales y no dañaron la tela");
    expect(t).toContain("COMPETENCIA] En Brillo me cobraron el doble y tardaron");
    expect(d.titulo).toBe("Lenguaje del cliente");
    expect(d.existente).toBeNull();
    expect(d.descartadas).toBe(1); // «Excelente servicio siempre» no lo dijo nadie
    expect(d.texto).toContain("«El sofá quedó como nuevo»");
    expect(d.texto).toContain("«En otra marca me cobraron el doble»"); // el trozo ORIGINAL, sin la marca
    expect(d.texto).not.toMatch(/Brillo|LimpiaYa/);
    expect(d.texto).not.toContain("Excelente servicio siempre");
    expect(d.fuentes).toMatchObject({ pegado: 1, competencia: 1, bandeja: 1, encuesta: 2, personas: 1 });
    expect(db.sqlite.prepare("select count(*) as n from cerebro_notas where client_id = 'c1'").get().n).toBe(antes);
    expect(db.sqlite.prepare("select count(*) as n from consumo_ia where funcion = 'lenguaje del cliente'").get().n).toBe(1);
  });

  it("si ya hay nota, dice cuál es (se guarda encima) y sus frases entran como material", async () => {
    const nota = await (await pedir("/api/cerebro/c1/nota", { method: "PUT", body: { titulo: "Lenguaje del cliente", texto: "# Lenguaje del cliente\n\n## Lo que celebran · lo dicen 5 comentarios\n- «el olor a mascota desapareció» (5)", tipo: "nota" } })).json();
    anthropic(flujo(JSON.stringify({ temas: { elogio: ["el olor a mascota desapareció"] } })));
    const d = await (await pedir("/api/cerebro/c1/lenguaje", { method: "POST", body: {} })).json();
    expect(d.existente).toEqual({ id: nota.id });
    expect(textoDe(peticiones[0])).toContain("de la nota de ahora] el olor a mascota desapareció");
    expect(d.texto).toContain("- «el olor a mascota desapareció» (5)");
  });

  it("sin nada que leer, 409 sin llamar a la IA; si ninguna frase está en el material, 502; un cliente ajeno no existe", async () => {
    db.sqlite.prepare("delete from bandeja_comentarios").run();
    db.sqlite.prepare("delete from voz_cliente").run();
    anthropic(flujo(JSON.stringify({ temas: { dolor: ["algo que nadie dijo nunca"] } })));
    expect((await pedir("/api/cerebro/c1/lenguaje", { method: "POST", body: {} })).status).toBe(409);
    expect(peticiones).toHaveLength(0);
    expect((await pedir("/api/cerebro/c1/lenguaje", { method: "POST", body: { texto: "Me encantó el servicio de lavado" } })).status).toBe(502);
    expect((await pedir("/api/cerebro/ajeno/lenguaje", { method: "POST", body: { texto: "x" } })).status).toBe(404);
  });
});
