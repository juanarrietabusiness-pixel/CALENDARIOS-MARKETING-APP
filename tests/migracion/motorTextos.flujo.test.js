import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.js";
import { d1EnMemoria } from "../utils/d1Memoria.js";
import { COOKIE } from "../../worker/lib/sesion.js";
import { sha256 } from "../../worker/lib/ids.js";
import { olvidarModelos } from "../../worker/lib/configIA.js";

// ============================================================
// El MOTOR DE TEXTOS como lo haría Claude, de punta a punta (worker/lib/estudio/lote.js + lib/motorTextos.js):
//
//   1. El mes: el PLANIFICADOR mira todas las casillas antes de escribir y lo decidido se guarda en R2: la tanda
//      siguiente no lo vuelve a pagar.
//   2. El redactor escribe de dos en dos, con lo FIJO en la caché (igual en todas las llamadas y en el revisor).
//   3. Las opciones que escoge la IA y la VARIEDAD: si dos vecinas escogen lo mismo, el revisor reescribe la segunda.
//   4. El REVISOR reescribe sólo lo flojo; si falla, la tanda sale igual.
//   5. Los EJEMPLOS del cliente (lo aprobado y lo que rindió) van en el pedido.
// La IA es un `fetch` de mentira que contesta según el pedido; la D1, de verdad.
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

const textoDe = (p) => {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : c.filter((b) => b.type === "text").map((b) => b.text).join("\n");
};
const esPlanificador = (p) => /^Eres el PLANIFICADOR/.test(textoDe(p));
const esRevisor = (p) => /AHORA ERES EL EDITOR JEFE/.test(textoDe(p));
const esRedactor = (p) => !esPlanificador(p) && !esRevisor(p);

/** Las piezas que pide una llamada del redactor: su número y las formas que puede escoger (la sugerida primero). */
function piezasDelPedido(t) {
  const parte = t.split(/\nEscribe \d+ publicaciones?|\nEscribe UNA publicación/)[1] ?? "";
  return parte.split(/\n(?=\d+\. )/).filter((x) => /^\d+\. /.test(x)).map((x) => ({
    n: Number(x.match(/^(\d+)\./)[1]),
    formas: [
      x.match(/forma del gancho: [^\n]*\[([\w-]+)\]$/m)?.[1],
      ...[...(x.match(/otras formas que también valen aquí: ([^\n]*)/)?.[1] ?? "").matchAll(/\[([\w-]+)\]/g)].map((m) => m[1]),
    ].filter(Boolean),
  }));
}

/** La IA de mentira: `responder(pedido)` → el texto (o un `Response` para un error). */
function anthropic(responder) {
  peticiones = [];
  vi.stubGlobal("fetch", async (url, opciones = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.anthropic.com/v1/models")) return Response.json({ data: [{ id: "claude-sonnet-5" }] });
    if (u.startsWith("https://api.anthropic.com/v1/messages")) {
      const cuerpo = JSON.parse(opciones.body);
      peticiones.push(cuerpo);
      const r = responder(cuerpo);
      return r instanceof Response ? r : flujo(r);
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

const casillas = Array.from({ length: 4 }, (_, i) => ({ clave: `c${i}`, fecha: `2030-03-0${i + 2}`, formato: "post", pilar: "educativo", nivel: "problema" }));
/** Lo que escribe el redactor para cada pieza de su llamada (con la forma que diga `escoger`). */
const ideasDe = (t, escoger = (p) => p.formas[0]) => JSON.stringify({ ideas: piezasDelPedido(t).map((p) => ({
  n: p.n, titulo: `Idea ${p.n}`, titular: `Titular ${p.n}`, apoyo: "", escena: `Una sala ${p.n}`, brief: `Brief ${p.n}`,
  descripcion: `Caption ${p.n}. Escríbenos.`, hashtags: "#a", forma: escoger(p), porque: "Funciona.",
})) });

beforeEach(async () => {
  db = d1EnMemoria();
  env = { DB: db, MEDIA: r2(), ANTHROPIC_API_KEY: "k", ASSETS: { fetch: async () => new Response("") } };
  const s = db.sqlite;
  s.prepare("insert into users (id, email, password_hash, salt) values (?,?,?,?)").run("u-jefe", "jefe@a.com", "x", "x");
  s.prepare("insert into memberships (user_id, owner_id, rol, nombre, color) values (?,?,?,?,?)").run("u-jefe", "u-jefe", "admin", "Juan", "#1E90FF");
  s.prepare("insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)")
    .run(await sha256("t-jefe"), "u-jefe", "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z");
  s.prepare("insert into clients (id, owner_id, name) values (?,?,?)").run("c1", "u-jefe", "Dcasa");
});
afterEach(() => { vi.unstubAllGlobals(); olvidarModelos(); });

describe("el mes en dos pasadas: el planificador y el redactor", () => {
  it("planifica las 4 antes de escribir, lo guarda en R2 y la tanda siguiente no lo vuelve a pagar", async () => {
    anthropic((p) => {
      const t = textoDe(p);
      if (esPlanificador(p)) {
        return JSON.stringify({ arco: "Del problema a la compra.", piezas: [1, 2, 3, 4].map((n) => ({ n, idea: `La idea planificada ${n}`, porque: `Porque ${n}` })) });
      }
      if (esRevisor(p)) return '{"revisadas":[]}';
      return ideasDe(t);
    });
    const r1 = await (await lote({ modo: "plan", casillas, planificar: true, semilla: 5, desde: 0, tamano: 2 })).json();
    expect(r1.ideas.map((i) => i.clave)).toEqual(["c0", "c1"]);
    expect(peticiones.filter(esPlanificador)).toHaveLength(1);
    const plan = textoDe(peticiones[0]);
    expect(plan).toMatch(/LAS PIEZAS DEL MES \(4\)/);
    // El redactor escribe con lo que decidió el planificador y el arco del mes.
    const redactor = textoDe(peticiones.find(esRedactor));
    expect(redactor).toMatch(/EL ARCO DEL MES[^\n]*Del problema a la compra/);
    expect(redactor).toMatch(/EL PLAN DEL MES \(lo decidió el planificador[^)]*\): «La idea planificada 1» — por qué: Porque 1/);
    expect(redactor).not.toMatch(/otras formas que también valen aquí/);
    const guardado = JSON.parse(env.MEDIA.objetos.get("planificador/u-jefe/c1/2030-03.json"));
    expect(Object.keys(guardado.piezas).sort()).toEqual(["c0", "c1", "c2", "c3"]);
    expect(db.sqlite.prepare("select funcion from consumo_ia order by rowid").all().map((f) => f.funcion)[0]).toBe("planificador del mes");
    // Lo del planificador no vuelve en la idea.
    expect(r1.ideas[0].planificada).toBeUndefined();
    expect(r1.ideas[0].opciones).toBeUndefined();

    // La segunda tanda: sin planificador (lo lee de R2).
    anthropic((p) => (esRevisor(p) ? '{"revisadas":[]}' : ideasDe(textoDe(p))));
    const r2_ = await (await lote({ modo: "plan", casillas, planificar: true, semilla: 5, desde: 2, tamano: 2 })).json();
    expect(r2_.ideas.map((i) => i.clave)).toEqual(["c2", "c3"]);
    expect(peticiones.some(esPlanificador)).toBe(false);
    expect(textoDe(peticiones[0])).toMatch(/«La idea planificada 3»/);
  });

  it("sin `planificar`, el plan va como siempre (sin planificador); si el planificador falla, se escribe sin él", async () => {
    anthropic((p) => (esRevisor(p) ? '{"revisadas":[]}' : ideasDe(textoDe(p))));
    await lote({ modo: "plan", casillas, semilla: 5 });
    expect(peticiones.some(esPlanificador)).toBe(false);
    anthropic((p) => (esPlanificador(p) ? new Response('{"error":{"type":"invalid_request_error","message":"no"}}', { status: 400 }) : esRevisor(p) ? '{"revisadas":[]}' : ideasDe(textoDe(p))));
    const r = await lote({ modo: "plan", casillas, planificar: true, semilla: 5 });
    expect(r.status).toBe(200);
    expect((await r.json()).ideas).toHaveLength(4);
  });
});

describe("de dos en dos, con lo fijo en la caché", () => {
  it("cada llamada escribe 2; lo fijo es el mismo bloque (con caché) en todas y en el revisor; la segunda sabe los titulares de la primera", async () => {
    anthropic((p) => (esRevisor(p) ? '{"revisadas":[]}' : ideasDe(textoDe(p))));
    const r = await (await lote({ modo: "plan", casillas, semilla: 5 })).json();
    expect(r.ideas).toHaveLength(4);
    const redactores = peticiones.filter(esRedactor);
    expect(redactores).toHaveLength(2);
    for (const p of redactores) expect(piezasDelPedido(textoDe(p))).toHaveLength(2);
    const fijos = peticiones.map((p) => p.messages[0].content[0]);
    for (const b of fijos) expect(b).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
    expect(new Set(fijos.map((b) => b.text)).size).toBe(1);
    expect(textoDe(redactores[1])).toMatch(/Estos titulares ya salieron[\s\S]*Titular 1/);
    // Ya no se pide la ficha «imagen» (la escribe el director al diseñar).
    expect(textoDe(redactores[0])).not.toMatch(/"imagen"/);
  });

  it("una sola pieza: una llamada, sin caché y sin revisor (como el botón «IA» de un campo)", async () => {
    anthropic((p) => ideasDe(textoDe(p)));
    await lote({ modo: "plan", casillas: casillas.slice(0, 1), semilla: 5 });
    expect(peticiones).toHaveLength(1);
    expect(typeof peticiones[0].messages[0].content).toBe("string");
  });
});

describe("el revisor y la variedad", () => {
  it("reescribe SÓLO lo flojo; lo demás se queda", async () => {
    anthropic((p) => (esRevisor(p)
      ? JSON.stringify({ revisadas: [{ n: 2, motivo: "genérico", titular: "Tus visitas duermen bien", descripcion: "Nuevo caption. Escríbenos." }] })
      : ideasDe(textoDe(p))));
    const r = await (await lote({ modo: "plan", casillas, semilla: 5 })).json();
    expect(r.revisadas).toBe(1);
    expect(r.ideas.find((i) => i.n === 2)).toMatchObject({ titular: "Tus visitas duermen bien", descripcion: "Nuevo caption. Escríbenos.", textoPieza: "Tus visitas duermen bien" });
    expect(r.ideas.find((i) => i.n === 1).titular).toBe("Titular 1");
    expect(db.sqlite.prepare("select funcion from consumo_ia").all().map((f) => f.funcion)).toContain("crítica de textos");
  });

  it("si el revisor falla, la tanda sale igual", async () => {
    anthropic((p) => (esRevisor(p) ? new Response('{"error":{"type":"invalid_request_error","message":"no"}}', { status: 400 }) : ideasDe(textoDe(p))));
    const r = await lote({ modo: "plan", casillas, semilla: 5 });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ideas).toHaveLength(4);
    expect(j.revisadas).toBeUndefined();
  });

  it("si dos vecinas escogen la misma forma, el código le da otra a la segunda y el revisor la reescribe con ella", async () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({ clave: `c${i}`, fecha: `2030-03-0${i + 2}`, formato: "post", pilar: "educativo", nivel: "problema" }));
    let vistas = [];
    let revisor = "";
    anthropic((p) => {
      const t = textoDe(p);
      if (esRevisor(p)) {
        revisor = t;
        const repiten = [...t.matchAll(/n\.º (\d+): repite con la anterior/g)].map((m) => Number(m[1]));
        return JSON.stringify({ revisadas: repiten.map((n) => ({ n, titular: `Otro gancho ${n}` })) });
      }
      // Cada pieza escoge, si puede, la misma forma que la anterior (la que ya se vio).
      vistas = [...vistas, ...piezasDelPedido(t)].sort((a, b) => a.n - b.n);
      return ideasDe(t, (pz) => {
        const previa = vistas.find((v) => v.n === pz.n - 1);
        return pz.formas.find((f) => previa?.formas.includes(f)) ?? pz.formas[0];
      });
    });
    const r = await (await lote({ modo: "plan", casillas: seis, semilla: 1 })).json();
    expect(r.ideas).toHaveLength(6);
    expect(revisor).toMatch(/repite con la anterior/);
    expect(r.revisadas).toBeGreaterThan(0);
    for (let i = 1; i < r.ideas.length; i++) expect(r.ideas[i].formaGancho, `pieza ${i + 1}`).not.toBe(r.ideas[i - 1].formaGancho);
    for (const i of r.ideas) expect(i.formaGancho).toBeTruthy();
  });
});

describe("los ejemplos del cliente", () => {
  it("lo que el cliente aprobó va en el pedido como referencia del tono", async () => {
    const posts = [{ id: "a1", format: "post", status: "pending", title: "Visitas", descripcion: "Cuando llegan visitas, el sofá cama de Dcasa se abre en un gesto. Escríbenos y te contamos." }];
    db.sqlite.prepare("insert into calendars (id, client_id, owner_id, month, year, days) values (?,?,?,?,?,?)")
      .run("k1", "c1", "u-jefe", 1, 2030, JSON.stringify([{ date: "2030-02-03", posts }]));
    db.sqlite.prepare("insert into approvals (id, calendar_id, post_id, estado) values (?,?,?,?)").run("ap1", "k1", "a1", "aprobado");
    anthropic((p) => ideasDe(textoDe(p)));
    await lote({ modo: "plan", casillas: casillas.slice(0, 1), semilla: 5 });
    expect(textoDe(peticiones[0])).toMatch(/EJEMPLOS DE ESTA MARCA[^\n]*TONO[\s\S]*Aprobada por el cliente · Post · «Visitas»: «Cuando llegan visitas/);
  });
});
