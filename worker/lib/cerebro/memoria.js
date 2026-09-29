// ============================================================
// El cerebro de un cliente: cómo recuerda
//
// Portado de `memory.mjs` de Agents Office, tras estudiar cognee,
// Graphiti, Mem0, HippoGraph, company-brain y Engram. De todo eso, lo que
// encaja en una agencia que paga por uso —y por eso NINGUNA de estas
// funciones llama a un modelo—:
//
//  · MENCIONES. Una nota que nombra a otra sin `[[enlace]]` queda
//    conectada igual. Los enlaces que nadie escribió también cuentan.
//    El ADN de las agencias no trae ni un `[[enlace]]`: sin esto, el grafo
//    de un cliente sería un montón de puntos sueltos.
//  · RESÚMENES. Unas líneas por nota —su título, la primera frase de cada
//    sección, sus cifras—: lo que aporta una nota VECINA al contexto, y lo
//    que enseña el cerebro al pasar el cursor.
//  · UN PRESUPUESTO DE CONTEXTO. Pasajes ordenados, casi copias fuera, y
//    se para en un tamaño.
//  · EL VECINDARIO. Las mejores notas traen a sus vecinas más cercanas,
//    pesadas por el enlace y amortiguadas si son un índice enlazado con
//    todo, para que no inunde cada tarea.
//  · SINAPSIS QUE APRENDEN. Las notas que se citaron en trabajo que el
//    cliente aprobó se fortalecen, y también el enlace entre las citadas
//    juntas; lo devuelto o rechazado las debilita; todo vuelve a neutro en
//    unos meses si no se usa. Idempotente por publicación: un voto nuevo
//    reemplaza al anterior, nunca se cuenta dos veces.
//
// Es puro —sólo `Date.now()`— y de UN cliente: el mapa de notas que recibe
// es el suyo y nada más. Ver `conocimiento.js` para el porqué.
// ============================================================

import { tokens, fold } from "./conocimiento.js";

// ------------------------------------------------------------
// Menciones: una nota que nombra a otra sin enlazarla
// ------------------------------------------------------------

const WIKI = /\[\[([^\]|#]+)/g;
/** El nombre de una nota como palabras: «plazos-entrega» → ['plazo', 'entrega']. */
const palabrasDelNombre = (nombre) => tokens(String(nombre).replace(/[-_]+/g, " "));

/**
 * Menciones entre notas: [[a, b]] cuando el texto de `a` contiene el
 * nombre de `b` como palabras y `a` no lo enlaza. Un nombre cuenta si
 * tiene dos palabras o más, o una de 7 letras o más (una nota llamada
 * «voz» aparecería en todas partes).
 */
export function mentions(notas) {
  const nombres = [...notas.keys()];
  const porPrimera = new Map();
  for (const n of nombres) {
    const tk = palabrasDelNombre(n);
    if (!tk.length || (tk.length < 2 && tk[0].length < 7)) continue;
    (porPrimera.get(tk[0]) || porPrimera.set(tk[0], []).get(tk[0])).push({ n, tk });
  }
  const salida = [];
  const vistas = new Set();
  for (const [a, texto] of notas) {
    const enlazadas = new Set([...String(texto).matchAll(WIKI)].map((m) => fold(m[1].trim().split("/").pop())));
    // Lo que ya es un enlace no es una mención.
    const cuerpo = String(texto).replace(/^---[\s\S]*?---\s*/, "").replace(/\[\[[^\]]*\]\]/g, " ");
    const tk = tokens(cuerpo);
    for (let i = 0; i < tk.length; i++) {
      for (const c of porPrimera.get(tk[i]) || []) {
        if (c.n === a || enlazadas.has(fold(c.n))) continue;
        let coincide = true;
        for (let k = 1; k < c.tk.length; k++) {
          if (tk[i + k] !== c.tk[k]) { coincide = false; break; }
        }
        if (!coincide) continue;
        const clave = a < c.n ? a + "\u0001" + c.n : c.n + "\u0001" + a;
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        salida.push([a, c.n]);
      }
    }
  }
  return salida;
}

// ------------------------------------------------------------
// Resúmenes: unas líneas que dicen qué guarda una nota
// ------------------------------------------------------------

const CIFRA = /(US\$|\$|€|B\/\.|\d+\s?%|\b\d{1,3}(?:[.,]\d{3})+\b|\b\d+(?:[.,]\d+)?\s?(?:dólares|usd|balboas)\b)/i;

/** Su título, una línea `resumen:`, la primera frase bajo cada encabezado y las líneas con cifras, hasta `max`. */
export function summary(texto, max = 320) {
  const t = String(texto || "").replace(/\r\n?/g, "\n");
  const fm = /^---\n([\s\S]*?)\n---/.exec(t)?.[1] || "";
  const cuerpo = t.replace(/^---[\s\S]*?---\s*/, "");
  const limpiar = (s) => s.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, "$1").replace(/[*_`>#]+/g, "").replace(/\s+/g, " ").trim();
  const trozos = [];
  // Las celdas de una tabla: un solo separador y ninguno en los extremos; y una línea que ya dijo otra más larga se va.
  const añadir = (s) => {
    s = limpiar(s).replace(/(\s*·\s*)+/g, " · ").replace(/^[\s·]+|[\s·]+$/g, "");
    if (!s || trozos.some((b) => b.includes(s))) return;
    for (let i = trozos.length - 1; i >= 0; i--) if (s.includes(trozos[i])) trozos.splice(i, 1);
    trozos.push(s);
  };
  const propio = /^(?:resumen|summary|descripcion|description)\s*:\s*(.+)$/im.exec(fm)?.[1];
  if (propio) añadir(propio);
  const h1 = /^#\s+(.+)$/m.exec(cuerpo)?.[1];
  if (h1) añadir(h1);
  for (const sec of cuerpo.split(/\n(?=#{2,3}\s)/)) {
    const lineas = sec.split("\n");
    const cabeza = /^#{2,3}\s+(.+)$/.exec(lineas[0])?.[1];
    const primera = lineas.slice(cabeza ? 1 : 0).map((l) => l.trim()).find((l) => l && !/^[#|\-:]/.test(l) && !/^[-*]\s*$/.test(l));
    if (primera) añadir((cabeza ? cabeza + ": " : "") + primera.split(/(?<=[.!?])\s/)[0]);
  }
  for (const l of cuerpo.split("\n")) {
    if (CIFRA.test(l) && !/^\s*\|?\s*:?-{2,}/.test(l)) añadir(l.replace(/\|/g, " · "));
  }
  let salida = "";
  for (const b of trozos) {
    if ((salida + (salida ? " · " : "") + b).length > max) {
      if (!salida) salida = b.slice(0, max - 1) + "…";
      break;
    }
    salida += (salida ? " · " : "") + b;
  }
  return salida;
}

// ------------------------------------------------------------
// Un presupuesto de contexto: lo mejor primero, las casi copias fuera
// ------------------------------------------------------------

const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0;
  let i = 0;
  for (const x of a) if (b.has(x)) i++;
  return i / (a.size + b.size - i);
};

/**
 * bloques: [{ head, body }] mejores primero → el texto que recibe el
 * modelo, sin pasar nunca de `presupuesto` caracteres. Un pasaje que
 * repite otro ya dentro (Jaccard ≥ 0,8 de sus palabras) se deja fuera; el
 * bloque que no cabe se corta en un párrafo.
 */
export function pack(bloques, presupuesto = 9000) {
  const guardados = [];
  const salida = [];
  let usado = 0;
  for (const b of bloques) {
    const partes = String(b.body || "").split(/\n…\n/).filter((p) => {
      const w = new Set(tokens(p));
      if (guardados.some((k) => jaccard(k, w) >= 0.8)) return false;
      guardados.push(w);
      return true;
    });
    if (!partes.length) continue;
    let texto = `${b.head}\n${partes.join("\n…\n")}`;
    if (usado + texto.length > presupuesto) {
      const cabe = presupuesto - usado;
      if (cabe < 400) break;
      texto = texto.slice(0, cabe).replace(/\n[^\n]*$/, "") + "\n…";
    }
    salida.push(texto);
    usado += texto.length + 2;
    if (usado >= presupuesto) break;
  }
  return salida.join("\n\n");
}

// ------------------------------------------------------------
// El vecindario: lo que traen consigo las mejores notas
// ------------------------------------------------------------

/**
 * El grafo de UN cliente: adj Map nombre → Map(vecina → peso). Un
 * `[[enlace]]` pesa 1, una mención 0,35 y un enlace aprendido lo que haya
 * aprendido (0–1).
 */
export function linkGraph(notas, { extra = [] } = {}) {
  const adj = new Map();
  const poner = (a, b, w) => {
    if (a === b || !notas.has(a) || !notas.has(b)) return;
    for (const [x, y] of [[a, b], [b, a]]) {
      const m = adj.get(x) || adj.set(x, new Map()).get(x);
      m.set(y, Math.max(m.get(y) || 0, w));
    }
  };
  const porFold = new Map([...notas.keys()].map((n) => [fold(n), n]));
  for (const [a, texto] of notas) {
    for (const m of String(texto).matchAll(WIKI)) {
      const b = porFold.get(fold(m[1].trim().split("/").pop()));
      if (b) poner(a, b, 1);
    }
  }
  for (const [a, b] of mentions(notas)) poner(a, b, 0.35);
  for (const [a, b, w] of extra) poner(a, b, Math.max(0, Math.min(1, w)));
  return adj;
}

/**
 * Las vecinas que merece la pena añadir a las mejores notas (semillas:
 * [{ note, score }], mejores primero): una vecina puntúa
 * semilla × peso del enlace × 0,5 / log2(2 + su grado), así que un índice
 * enlazado con todo puntúa poco. Como mucho `max`, y nunca una semilla.
 */
export function expand(semillas, adj, { take = 3, max = 2, skip = new Set() } = {}) {
  const mejores = new Map();
  for (const s of semillas.slice(0, take)) {
    for (const [vecina, w] of adj.get(s.note) || []) {
      if (skip.has(vecina) || semillas.some((x) => x.note === vecina)) continue;
      const grado = (adj.get(vecina) || new Map()).size;
      const puntos = ((s.score || 1) * w * 0.5) / Math.log2(2 + grado);
      const actual = mejores.get(vecina);
      if (!actual || actual.score < puntos) mejores.set(vecina, { note: vecina, via: s.note, score: puntos });
    }
  }
  return [...mejores.values()].sort((a, b) => b.score - a.score).slice(0, max);
}

// ------------------------------------------------------------
// Sinapsis que aprenden
// ------------------------------------------------------------

export const ALPHA = 0.1;
export const HALF_LIFE_DAYS = 90;
const claveDePar = (a, b) => (a < b ? a + "\u0001" + b : b + "\u0001" + a);

export const emptyMemory = () => ({ v: 1, notes: {}, edges: {}, applied: {} });

/**
 * Qué tal salió un trabajo terminado, de 0 a 1: aprobado 1, usado tal
 * cual 0,75, −0,25 por cada vez que se devolvió (mínimo 0,25), rechazado 0.
 * `t`: { vote?: "up"|"down", approved?, revisions? }.
 */
export function outcome(t) {
  if (t.vote === "down") return 0;
  if (t.vote === "up") return 1;
  return Math.max(0.25, Math.min(1, (t.approved ? 1 : 0.75) - 0.25 * (t.revisions || 0)));
}

/** Las notas que un texto nombra en su línea «Fuentes:», entre las que leyó. */
export function cited(resultado, leidas = []) {
  const fuentes = String(resultado || "").split("\n").filter((l) => /^\W*(fuentes|sources)\W*:/i.test(l.trim())).join(" ");
  if (!fuentes) return [];
  const palabras = new Set(tokens(fuentes));
  const crudo = fold(fuentes);
  return leidas.filter((n) => crudo.includes(fold(n)) || (() => {
    const tk = palabrasDelNombre(n);
    return tk.length && tk.every((w) => palabras.has(w));
  })());
}

/** Un peso como es hoy: lo aprendido vuelve al neutro (notas 0,5) o se aleja (enlaces 0) si no se usa. */
export function effective(e, ahora = Date.now(), neutro = 0.5) {
  if (!e) return neutro;
  const k = Math.pow(0.5, Math.max(0, ahora - (e.last || ahora)) / 864e5 / HALF_LIFE_DAYS);
  return neutro + (e.w - neutro) * k;
}

/**
 * Aprende de un trabajo terminado: { id, r, cited, read }. Las notas que
 * citó se mueven hacia `r` (α); las que leyó y no citó, la mitad hacia 0,4;
 * cada par citado junto refuerza su enlace (uno nuevo nace sólo de buen
 * trabajo). Aplicar el mismo trabajo otra vez deshace antes lo que hizo,
 * así que un voto que cambia nunca se cuenta dos veces.
 */
export function reinforce(mem, { id, r, cited: cit = [], read = [] }, ahora = Date.now()) {
  const previo = mem.applied[id];
  if (previo && previo.r === r && previo.cit === cit.join("|")) return mem; // nada nuevo
  if (previo) {
    for (const [n, d] of Object.entries(previo.dn)) {
      const e = mem.notes[n];
      if (e) e.w = Math.max(0, Math.min(1, e.w - d));
    }
    for (const [k, d] of Object.entries(previo.de)) {
      const e = mem.edges[k];
      if (e) {
        e.w = Math.max(0, Math.min(1, e.w - d));
        if (e.w < 0.1) delete mem.edges[k];
      }
    }
  }
  const dn = {};
  const de = {};
  const mover = (n, objetivo, a) => {
    const e = mem.notes[n] || (mem.notes[n] = { w: 0.5, n: 0, last: ahora });
    const w0 = effective(e, ahora);
    const w1 = w0 + a * (objetivo - w0);
    dn[n] = (dn[n] || 0) + (w1 - e.w);
    e.w = w1;
    e.n++;
    e.last = ahora;
  };
  const citadas = new Set(cit);
  for (const n of cit) mover(n, r, ALPHA);
  for (const n of read) if (!citadas.has(n)) mover(n, 0.4, ALPHA / 2);
  const lista = [...citadas];
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const k = claveDePar(lista[i], lista[j]);
      let e = mem.edges[k];
      if (!e) {
        if (r < 0.75) continue;
        e = mem.edges[k] = { w: 0.2, n: 0, last: ahora };
        de[k] = 0.2;
      }
      const w0 = effective(e, ahora, 0);
      const w1 = w0 + ALPHA * (r - w0);
      de[k] = (de[k] || 0) + (w1 - e.w);
      e.w = w1;
      e.n++;
      e.last = ahora;
      if (e.w < 0.1) delete mem.edges[k];
    }
  }
  mem.applied[id] = { r, cit: cit.join("|"), dn, de, at: ahora };
  const ids = Object.keys(mem.applied);
  if (ids.length > 3000) {
    for (const viejo of ids.sort((a, b) => mem.applied[a].at - mem.applied[b].at).slice(0, ids.length - 3000)) delete mem.applied[viejo];
  }
  return mem;
}

/** El peso aprendido de una nota (0–1, 0,5 neutro) → un factor para su puntuación de búsqueda: 0,8 … 1,2. */
export const boostOf = (mem, nombre, ahora = Date.now()) => 0.8 + 0.4 * effective(mem.notes[nombre], ahora);

/** Los enlaces aprendidos [[a, b, w]] que aún valen algo hoy. */
export function learnedLinks(mem, ahora = Date.now()) {
  return Object.entries(mem.edges)
    .map(([k, e]) => {
      const [a, b] = k.split("\u0001");
      return [a, b, +effective(e, ahora, 0).toFixed(3)];
    })
    .filter((x) => x[2] >= 0.1);
}
