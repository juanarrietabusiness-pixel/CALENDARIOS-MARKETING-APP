import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as K from "../../worker/lib/cerebro/conocimiento.js";
import * as M from "../../worker/lib/cerebro/memoria.js";
import { RAIZ as WORKSPACE, hayWorkspace } from "../../src/lib/workspace.test-helper.js";

// ============================================================
// Paridad con Agents Office
//
// El motor del cerebro es una COPIA de `knowledge.mjs` y `memory.mjs` de
// la oficina de agentes: se decidió copiar y no compartir un paquete
// (no hay monorepo todavía). Dos copias del mismo algoritmo son una que
// se queda atrás, así que este test hace la comparación que un humano
// olvidaría: pasa los mismos datos por las dos y exige el MISMO
// resultado, con las notas reales de cada cliente de Agencia_Workspace.
//
// Si alguien mejora la búsqueda en Agents Office, este test falla y dice
// qué comparar. Sin el checkout de Agents Office —CI— se salta.
// `AGENTS_OFFICE=/ruta` apunta a otro sitio.
//
// Lo único que difiere a propósito: la huella de un pasaje (sha1 allí,
// FNV-1a aquí, porque `node:crypto` no está en el navegador) y el
// nombre de la opción `always` → `siempre`.
// ============================================================

const AO = process.env.AGENTS_OFFICE || "/home/user/Agents-Office";
const hay = existsSync(join(AO, "knowledge.mjs")) && hayWorkspace;

/** Las notas de un cliente: nombre = ruta dentro del cliente, que no choca nunca. */
function notasDe(cliente) {
  const base = join(WORKSPACE, cliente);
  const mapa = new Map();
  const recorrer = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (/06_Assets_Brutos_Solo_Lectura|node_modules|\.git$/.test(p)) continue;
      if (e.isDirectory()) recorrer(p);
      else if (/\.(md|json|ya?ml|txt)$/i.test(e.name)) mapa.set(p.slice(base.length + 1), readFileSync(p, "utf8"));
    }
  };
  recorrer(base);
  return mapa;
}

/** Un pasaje sin su huella: es lo único que difiere a propósito (sha1 allí, FNV-1a aquí). */
const sinHuella = (p) => {
  const copia = { ...p };
  delete copia.hash;
  return copia;
};

const CLIENTES = ["Dcasa", "Baby Caleb", "Feria del lente", "Juancito Ads", "Rofer Service"];
const CONSULTAS = [
  "ideas de reel para el lanzamiento de una oferta de sofás",
  "guion de 30 segundos tono de voz y límites de la marca",
  "qué precios y descuentos puedo mencionar",
  "a quién le hablamos: buyer persona y objeciones",
  "hashtags y llamada a la acción por WhatsApp",
];

describe.skipIf(!hay)("paridad con Agents Office", () => {
  let AOK;
  let AOM;
  beforeAll(async () => {
    AOK = await import(/* @vite-ignore */ join(AO, "knowledge.mjs"));
    AOM = await import(/* @vite-ignore */ join(AO, "memory.mjs"));
  });

  it("las palabras que cuentan son las mismas", () => {
    for (const s of ["¿Cuánto cuesta una tienda en línea con pagos?", "Diseños y estrategias de marca: promociones", "la oferta de sofás 2x1 · $49.99", ""]) {
      expect(K.tokens(s)).toEqual(AOK.tokens(s));
    }
  });

  it.each(CLIENTES)("%s: los pasajes salen iguales (menos la huella)", (cliente) => {
    for (const [nombre, texto] of notasDe(cliente)) {
      const mio = K.passages(nombre, texto).map(sinHuella);
      const suyo = AOK.passages(nombre, texto).map(sinHuella);
      expect(mio, nombre).toEqual(suyo);
    }
  });

  it.each(CLIENTES)("%s: la búsqueda devuelve las mismas notas, pasajes y puntuaciones", (cliente) => {
    const notas = notasDe(cliente);
    const mio = K.buildIndex(notas);
    const suyo = AOK.buildIndex(notas);
    expect(mio.N).toBe(suyo.N);
    expect(mio.avg).toBeCloseTo(suyo.avg, 9);
    for (const q of CONSULTAS) {
      const a = K.search(mio, q, { n: 5, per: 2 });
      const b = AOK.search(suyo, q, { n: 5, per: 2 });
      expect(a.map((x) => x.note), q).toEqual(b.map((x) => x.note));
      expect(a.map((x) => x.passages), q).toEqual(b.map((x) => x.passages));
      a.forEach((x, i) => expect(x.score).toBeCloseTo(b[i].score, 9));
    }
  });

  it.each(CLIENTES)("%s: menciones, resúmenes y grafo son iguales", (cliente) => {
    const notas = notasDe(cliente);
    expect(M.mentions(notas)).toEqual(AOM.mentions(notas));
    for (const [nombre, texto] of notas) expect(M.summary(texto), nombre).toBe(AOM.summary(texto));
    const a = M.linkGraph(notas);
    const b = AOM.linkGraph(notas);
    expect([...a].map(([k, v]) => [k, [...v]])).toEqual([...b].map(([k, v]) => [k, [...v]]));
  });

  it.each(CLIENTES)("%s: el presupuesto de contexto arma el mismo texto", (cliente) => {
    const notas = notasDe(cliente);
    const ix = K.buildIndex(notas);
    const ax = AOK.buildIndex(notas);
    for (const q of CONSULTAS) {
      const bloques = (r) => r.map((h) => ({ head: `--- ${h.note} ---`, body: h.passages.join("\n…\n") }));
      expect(M.pack(bloques(K.search(ix, q)), 9000), q).toBe(AOM.pack(bloques(AOK.search(ax, q)), 9000));
    }
  });

  it("lo que se aprende es lo mismo, paso a paso", () => {
    const t0 = Date.parse("2026-09-01T12:00:00Z");
    const pasos = [
      { id: "t1", r: 1, cited: ["a", "b", "c"], read: ["a", "b", "c", "d"] },
      { id: "t2", r: 0.75, cited: ["a", "c"], read: ["d"] },
      { id: "t1", r: 0, cited: ["a", "b", "c"], read: ["a", "b", "c", "d"] },
      { id: "t3", r: 1, cited: ["b", "d"], read: [] },
    ];
    const mia = M.emptyMemory();
    const suya = AOM.emptyMemory();
    pasos.forEach((p, i) => {
      M.reinforce(mia, p, t0 + i * 864e5);
      AOM.reinforce(suya, p, t0 + i * 864e5);
      expect(mia, `paso ${i + 1}`).toEqual(suya);
    });
    const tarde = t0 + 200 * 864e5;
    for (const n of ["a", "b", "c", "d"]) expect(M.boostOf(mia, n, tarde)).toBeCloseTo(AOM.boostOf(suya, n, tarde), 12);
    expect(M.learnedLinks(mia, tarde)).toEqual(AOM.learnedLinks(suya, tarde));
  });
});
