import { describe, it, expect } from "vitest";
import * as K from "../../worker/lib/cerebro/conocimiento.js";
import * as M from "../../worker/lib/cerebro/memoria.js";

// ============================================================
// El motor del cerebro de un cliente: buscar por pasajes y recordar.
//
// Los casos vienen de los tests de Agents Office (`knowledge.test.mjs` y
// `memory.test.mjs`), que es donde se escribió el algoritmo. Son los
// mismos casos; lo que cambia es el runner. Que las dos copias digan lo
// mismo sobre datos reales lo comprueba `cerebro.paridad.test.js`.
// ============================================================

const notas = new Map([
  ["precios-webs", "---\nrevisar: 2020-01-01\n---\n# Precios de webs\n\nLanding: $450.\n\n## Tienda online\n\nTienda completa desde $1.200 con pasarela de pago."],
  ["plazos-entrega", "# Plazos\n\nUna landing se entrega en 7 días hábiles. Una tienda, en 21."],
  ["voz", "# Voz\n\nCercana, directa, sin tecnicismos."],
]);

describe("buscar por pasajes", () => {
  it("encuentra el pasaje por lo que dicen las palabras, sin importar tildes ni plurales", () => {
    const ix = K.buildIndex(notas);
    const r = K.search(ix, "¿Cuánto cuesta una tienda en línea con pagos?");
    expect(r[0].note).toBe("precios-webs");
    expect(r[0].passages[0]).toMatch(/Tienda completa/);
    expect(K.search(ix, "en cuántos días entregan la landing")[0].note).toBe("plazos-entrega");
  });

  it("una nota «siempre» entra aunque no gane", () => {
    const ix = K.buildIndex(notas);
    expect(K.search(ix, "x", { siempre: ["voz"] }).some((x) => x.note === "voz")).toBe(true);
  });

  it("un factor por nota se aplica antes de ordenar", () => {
    const ix = K.buildIndex(new Map([
      ["borrador", "# Ideas\n\nLa oferta de sofás llega en octubre."],
      ["marca", "# Marca\n\nLa oferta de sofás llega en octubre."],
    ]));
    const sin = K.search(ix, "oferta de sofás").map((r) => r.note);
    const con = K.search(ix, "oferta de sofás", { boost: (n) => (n === "borrador" ? 0.4 : 1) }).map((r) => r.note);
    expect(sin.length).toBe(2);
    expect(con[0]).toBe("marca");
  });

  it("los pasajes se cortan en encabezados y cada uno recuerda el suyo", () => {
    const p = K.passages("n", "# A\n\nuno\n\n## B\n\ndos");
    expect(p.map((x) => x.head)).toEqual(["A", "B"]);
    expect(p[0].id).toBe("n#0");
  });

  it("dos pasajes con el mismo texto tienen la misma huella y con otro texto, otra", () => {
    const a = K.passages("x", "# T\n\nhola mundo")[0];
    const b = K.passages("y", "# T\n\nhola mundo")[0];
    const c = K.passages("x", "# T\n\nadiós mundo")[0];
    expect(a.hash).toBe(b.hash);
    expect(a.hash).not.toBe(c.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("el índice guardado en R2", () => {
  it("serializar y cargar devuelven un índice que busca igual", () => {
    const ix = K.buildIndex(notas);
    const guardado = JSON.parse(JSON.stringify(K.serializar(ix)));
    const vuelto = K.cargar(guardado);
    for (const q of ["cuánto cuesta una tienda", "días de entrega", "tono de voz"]) {
      expect(K.search(vuelto, q)).toEqual(K.search(ix, q));
    }
  });

  it("un índice de otra versión, o roto, no se carga: se reconstruye", () => {
    expect(K.cargar(null)).toBeNull();
    expect(K.cargar({ v: 2, docs: [], df: [] })).toBeNull();
    expect(K.cargar({ v: 1, docs: "no", df: [] })).toBeNull();
  });
});

describe("cambiar una nota sin reconstruir el índice", () => {
  const base = () => K.buildIndex(notas);

  it("el índice con una nota cambiada busca como uno construido de cero", () => {
    const cambiadas = new Map(notas);
    cambiadas.set("voz", "# Voz\n\nFormal, con trato de usted y sin tecnicismos.");
    const incremental = K.reemplazarNota(base(), "voz", cambiadas.get("voz"));
    const entero = K.buildIndex(cambiadas);
    expect(incremental.N).toBe(entero.N);
    expect(incremental.avg).toBeCloseTo(entero.avg, 9);
    for (const q of ["trato de usted", "cuánto cuesta una tienda", "días de entrega", "tono cercano y directo"]) {
      expect(K.search(incremental, q).map((r) => [r.note, r.passages]).sort()).toEqual(K.search(entero, q).map((r) => [r.note, r.passages]).sort());
    }
  });

  it("una nota nueva se encuentra y una quitada deja de encontrarse", () => {
    const con = K.reemplazarNota(base(), "garantia", "# Garantía\n\nDos años en toda la mueblería.");
    expect(K.search(con, "garantía de la mueblería")[0].note).toBe("garantia");
    const sin = K.reemplazarNota(con, "garantia", null);
    expect(K.search(sin, "garantía de la mueblería").some((r) => r.note === "garantia")).toBe(false);
    expect(sin.N).toBe(base().N);
  });

  it("no toca el índice de partida", () => {
    const ix = base();
    const antes = JSON.stringify(K.serializar(ix));
    K.reemplazarNota(ix, "voz", null);
    expect(JSON.stringify(K.serializar(ix))).toBe(antes);
  });

  it("«excluir» deja fuera las notas que no deben llegar a un texto publicable", () => {
    const ix = K.buildIndex(new Map([
      ["costos", "# Costos\n\nEl costo del pañal es de nueve dólares."],
      ["precios", "# Precios\n\nEl pañal cuesta once dólares."],
    ]));
    expect(K.search(ix, "costo del pañal", { n: 5 }).map((r) => r.note).sort()).toEqual(["costos", "precios"]);
    expect(K.search(ix, "costo del pañal", { n: 5, excluir: (n) => n === "costos" }).map((r) => r.note)).toEqual(["precios"]);
  });
});

describe("notas que conviene mirar", () => {
  const ahora = Date.parse("2026-09-25");
  it("manda la fecha del texto: revisar pasada, o actualizado hace mucho", () => {
    expect(K.staleness(notas.get("precios-webs"), ahora, ahora).stale).toBe(true);
    expect(K.staleness("---\nactualizado: 2026-09-01\n---", ahora - 400 * 864e5, ahora).stale).toBe(false);
    expect(K.staleness("---\nactualizado: 2025-01-01\n---", ahora, ahora).stale).toBe(true);
  });
  it("sin fechas en el texto cuenta cuándo se tocó por última vez", () => {
    expect(K.staleness("# x", ahora - 200 * 864e5, ahora).stale).toBe(true);
    expect(K.staleness("# x", ahora - 20 * 864e5, ahora).stale).toBe(false);
  });
});

const grafo = new Map([
  ["plazos-entrega", "# Plazos de entrega\nUn sitio Start se entrega en 10 días hábiles."],
  ["precios-webs", "---\nresumen: Lo que cuesta cada sitio\n---\n# Precios de sitios web\n\n## Start\nUn sitio de una página.\n\n| Plan | Precio |\n|---|---|\n| Start | $295 |\n\nLos plazos de entrega van aparte."],
  ["voz", "# Voz\nHablamos de tú."],
  ["index", "[[plazos-entrega]] [[precios-webs]] [[voz]] [[faq]]"],
  ["faq", "Preguntas: la voz de la marca y los [[precios-webs]]."],
]);

describe("menciones y resúmenes", () => {
  it("una nota que nombra a otra sin enlazarla queda conectada; un nombre corto como «voz» no cuenta", () => {
    const m = M.mentions(grafo).map((p) => p.join(" → "));
    expect(m).toContain("precios-webs → plazos-entrega");
    expect(m.some((x) => x.endsWith("→ voz"))).toBe(false);
    expect(m.some((x) => x.startsWith("index"))).toBe(false);
  });

  it("un resumen guarda el título, su «resumen», la primera frase de cada sección y las cifras, dentro del límite", () => {
    const s = M.summary(grafo.get("precios-webs"), 320);
    expect(s).toMatch(/Lo que cuesta cada sitio/);
    expect(s).toMatch(/Precios de sitios web/);
    expect(s).toMatch(/Start: Un sitio de una página\./);
    expect(s).toMatch(/\$295/);
    expect(s).not.toMatch(/---/);
    expect(M.summary("x".repeat(2000), 100).length).toBeLessThanOrEqual(100);
  });
});

describe("presupuesto de contexto y vecindario", () => {
  it("lo mejor primero, una casi copia fuera, y nunca se pasa", () => {
    const igual = "El plan Start cuesta 295 dólares y se entrega en diez días hábiles con dominio incluido.";
    const salida = M.pack([
      { head: "--- a.md ---", body: igual },
      { head: "--- b.md ---", body: igual + " " },
      { head: "--- c.md ---", body: "Otra cosa muy distinta: la voz de la marca es cercana." },
    ], 5000);
    expect(salida).toMatch(/a\.md/);
    expect(salida).not.toMatch(/b\.md/);
    expect(salida).toMatch(/c\.md/);
    const grande = M.pack(
      Array.from({ length: 10 }, (_, i) => ({ head: `--- n${i}.md ---`, body: `Párrafo ${i} ` + "palabra distinta ".repeat(20) + i + "\n\nOtro párrafo " + "z".repeat(400) })),
      1500,
    );
    expect(grande.length).toBeLessThanOrEqual(1500);
  });

  it("las mejores notas traen a sus vecinas; un índice enlazado con todo puntúa menos", () => {
    const adj = M.linkGraph(grafo, { extra: [["voz", "plazos-entrega", 0.9]] });
    expect(adj.get("precios-webs").get("plazos-entrega")).toBe(0.35);
    expect(adj.get("voz").get("plazos-entrega")).toBe(0.9);
    const vecinas = M.expand([{ note: "precios-webs", score: 2 }], adj, { max: 3 });
    expect(vecinas[0].note).toBe("faq");
    expect(vecinas[0].via).toBe("precios-webs");
    const indice = vecinas.find((x) => x.note === "index");
    const faq = vecinas.find((x) => x.note === "faq");
    expect(!indice || indice.score < faq.score).toBe(true);
  });
});

describe("sinapsis que aprenden", () => {
  it("«Fuentes:» nombra las notas que usó, entre las que leyó", () => {
    const r = "Texto del entregable.\n\nFuentes: precios webs, [[plazos-entrega]]\nUsed: Gmail";
    expect(M.cited(r, ["precios-webs", "plazos-entrega", "voz"]).sort()).toEqual(["plazos-entrega", "precios-webs"]);
    expect(M.cited("sin fuentes", ["voz"])).toEqual([]);
  });

  it("aprenden de lo aprobado, se debilitan con un rechazo, no cuentan dos veces lo mismo y vuelven al neutro", () => {
    const t0 = Date.parse("2026-09-01T12:00:00Z");
    const mem = M.emptyMemory();
    M.reinforce(mem, { id: "t1", r: 1, cited: ["precios-webs", "plazos-entrega"], read: ["precios-webs", "plazos-entrega", "voz"] }, t0);
    M.reinforce(mem, { id: "t2", r: 1, cited: ["precios-webs", "plazos-entrega"], read: [] }, t0);
    expect(mem.edges["plazos-entrega\u0001precios-webs"].w).toBeGreaterThan(0.2);
    expect(mem.notes["precios-webs"].w).toBeGreaterThan(0.5);
    expect(mem.notes.voz.w).toBeLessThan(0.5);
    const antes = JSON.stringify(mem.notes);
    M.reinforce(mem, { id: "t2", r: 1, cited: ["precios-webs", "plazos-entrega"], read: [] }, t0);
    expect(JSON.stringify(mem.notes)).toBe(antes);
    const arriba = mem.notes["precios-webs"].w;
    M.reinforce(mem, { id: "t2", r: 0, cited: ["precios-webs", "plazos-entrega"], read: [] }, t0);
    expect(mem.notes["precios-webs"].w).toBeLessThan(arriba);
    expect(M.boostOf(mem, "nunca-vista")).toBe(1);
    expect(Math.abs(M.effective(mem.notes.voz, t0 + 365 * 864e5) - 0.5)).toBeLessThan(0.03);
    const pobre = M.emptyMemory();
    M.reinforce(pobre, { id: "x", r: 0.25, cited: ["a", "b"], read: [] }, t0);
    expect(pobre.edges).toEqual({});
  });

  it("qué tal salió: aprobado 1, tal cual 0,75, cada devolución 0,25, rechazado 0", () => {
    expect(M.outcome({ approved: true })).toBe(1);
    expect(M.outcome({})).toBe(0.75);
    expect(M.outcome({ revisions: 1 })).toBe(0.5);
    expect(M.outcome({ revisions: 9 })).toBe(0.25);
    expect(M.outcome({ approved: true, vote: "down" })).toBe(0);
    expect(M.outcome({ revisions: 2, vote: "up" })).toBe(1);
  });
});
