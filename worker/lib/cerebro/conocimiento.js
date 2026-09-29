// ============================================================
// El cerebro de un cliente: buscar por pasajes
//
// Portado de `knowledge.mjs` de Agents Office (la oficina de agentes de la
// agencia), que es donde se probó. El algoritmo es el mismo y el test de
// paridad (`tests/migracion/cerebro.paridad.test.js`) lo comprueba contra
// el original cuando ese checkout está: si alguien mejora la búsqueda allí,
// el test dice que aquí hay que traerla.
//
// QUÉ RESUELVE
//
// La aplicación le entregaba al modelo el ADN entero del cliente en cada
// llamada —hasta 200 000 caracteres—, sin importar qué se le pedía. Aquí
// cada nota se corta en PASAJES de unos 900 caracteres (por encabezado o
// párrafo), se ordenan con BM25 sobre palabras en español e inglés (sin
// tildes, con un truncado ligero de plurales) y el modelo recibe los
// mejores pasajes de las mejores notas: lo que esa tarea necesita.
//
// LO QUE CAMBIA RESPECTO AL ORIGINAL
//
//  · Todo es PURO: no hay `node:crypto`, ni `process`, ni red. La huella
//    de un pasaje es FNV-1a; sólo sirve para reconocerlo, no para
//    protegerlo. Sin esto no corre en el Worker ni en el navegador.
//  · Se añaden `serializar()` y `cargar()`: el índice de cada cliente se
//    guarda ya construido en R2 y en cada petición sólo se lee y se
//    consulta. Reconstruirlo cuesta decenas de milisegundos de CPU, y el
//    plan gratuito da diez por petición.
//  · `search` acepta `boost(nota)`: un factor por nota (lo aprendido, la
//    autoridad de su tipo) que se aplica ANTES de ordenar.
//  · Se quita lo que no aplica aquí: los embeddings (necesitan una clave
//    más) y las «tareas del mismo cliente».
//
// ÍNDICE POR CLIENTE, NUNCA UNO PARA TODOS
//
// El orquestador de la agencia manda no mezclar la memoria de un cliente
// con la de otro. Un índice compartido lo rompe en silencio: los nueve
// clientes tienen un `01_brand_guidelines` y los nueve encabezan sus
// secciones igual («Límites estrictos», «Pendiente de validar»). Por eso
// este módulo no sabe qué es un cliente: recibe UN mapa de notas y
// devuelve UN índice, y quien lo llama es quien decide de quién es.
// ============================================================

const PARADA = new Set(
  ("de la que el en y a los del se las por un para con no una su al lo como mas pero sus le ya o este si porque esta entre " +
    "cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso " +
    "ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual poco " +
    "ella estar estas algunas algo nosotros the of and to in is for on that with as are be this it by or at from an your " +
    "you we our can will not have has its was were if what how when which who").split(" "),
);

/** Minúsculas y sin tildes: «Guión» y «guion» son la misma palabra. */
export const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const raiz = (w) =>
  w.length > 5 && w.endsWith("ciones") ? w.slice(0, -2)
    : w.length > 4 && w.endsWith("es") ? w.slice(0, -2)
      : w.length > 3 && w.endsWith("s") ? w.slice(0, -1)
        : w;

/** Las palabras que cuentan de un texto: sin tildes, sin las de relleno, con plurales recortados. */
export const tokens = (s) =>
  fold(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2 && !PARADA.has(w)).map(raiz);

/** FNV-1a doble → 16 hex. Reconoce un pasaje; no protege nada. */
function huella(texto) {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b);
  }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(a) + hex(b);
}

/**
 * Una nota en pasajes de unos `tamano` caracteres, cortados en los
 * encabezados y en los párrafos; cada pasaje se acuerda de su encabezado.
 */
export function passages(nombre, texto, tamano = 900) {
  const cuerpo = String(texto || "").replace(/^---[\s\S]*?---\s*/, "");
  const salida = [];
  let encabezado = "";
  let buffer = "";
  const soltar = () => {
    const t = buffer.trim();
    if (t) salida.push({ note: nombre, head: encabezado, text: t });
    buffer = "";
  };
  for (const bloque of cuerpo.split(/\n\s*\n/)) {
    const h = /^#{1,4}\s+(.+)$/m.exec(bloque);
    if (h && bloque.trim().startsWith("#")) {
      soltar();
      encabezado = h[1].trim();
    }
    if ((buffer + "\n\n" + bloque).length > tamano && buffer) soltar();
    buffer += (buffer ? "\n\n" : "") + bloque;
  }
  soltar();
  return salida.map((p, i) => ({ ...p, i, id: `${nombre}#${i}`, hash: huella(p.text) }));
}

/** Un pasaje listo para el índice: sus palabras contadas y su longitud. */
function docDe(p) {
  const d = { ...p, tf: new Map(), len: 0 };
  const ws = tokens(d.note.replace(/[-_]/g, " ") + " " + d.head + " " + d.text);
  d.len = ws.length;
  for (const w of ws) d.tf.set(w, (d.tf.get(w) || 0) + 1);
  return d;
}

/** De los pasajes al índice: en cuántos aparece cada palabra y cuánto miden de media. */
function armar(docs) {
  const df = new Map();
  for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  const avg = docs.reduce((s, d) => s + d.len, 0) / (docs.length || 1);
  return { docs, df, avg, N: docs.length };
}

/** El índice BM25 de UN cliente. `notas`: Map nombre → texto. */
export function buildIndex(notas) {
  const docs = [];
  for (const [nombre, texto] of notas) for (const p of passages(nombre, texto)) docs.push(docDe(p));
  return armar(docs);
}

/**
 * El mismo índice con UNA nota cambiada (`texto`) o quitada (`null`), sin
 * volver a leer ni a trocear las demás. Editar una nota es lo habitual y
 * reconstruir el índice entero de un cliente cuesta decenas de
 * milisegundos de CPU; esto sólo recorre las palabras ya contadas.
 */
export function reemplazarNota(index, nombre, texto) {
  const docs = index.docs.filter((d) => d.note !== nombre);
  if (texto != null) for (const p of passages(nombre, texto)) docs.push(docDe(p));
  return armar(docs);
}

/**
 * BM25 sobre los pasajes. Suma 1,5 si una palabra de la consulta está en
 * el NOMBRE de la nota: quien la nombró ya dijo de qué habla.
 */
export function bm25(index, consulta, { k1 = 1.4, b = 0.75, boost = null, excluir = null } = {}) {
  const q = [...new Set(tokens(consulta))];
  const salida = [];
  for (const d of index.docs) {
    if (excluir && excluir(d.note)) continue;
    let s = 0;
    for (const w of q) {
      const f = d.tf.get(w);
      if (!f) continue;
      const n = index.df.get(w) || 0;
      const idf = Math.log(1 + (index.N - n + 0.5) / (n + 0.5));
      s += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.len) / index.avg));
    }
    if (fold(d.note).split(/[-_ ]/).some((p) => q.includes(raiz(p)))) s += 1.5;
    if (s > 0) salida.push({ d, s: boost ? s * boost(d.note) : s });
  }
  return salida.sort((a, b) => b.s - a.s);
}

/**
 * Las notas y pasajes para una consulta, mejores primero: como mucho `n`
 * notas y `per` pasajes de cada una. `siempre` son notas que entran aunque
 * no ganen (la ficha del cliente). → [{ note, passages: [texto], score }]
 */
export function search(index, consulta, { n = 5, per = 2, siempre = [], boost = null, excluir = null } = {}) {
  const aciertos = bm25(index, consulta, { boost, excluir });
  const porNota = new Map();
  for (const h of aciertos) {
    const e = porNota.get(h.d.note) || { note: h.d.note, passages: [], score: 0 };
    if (e.passages.length < per) {
      e.passages.push((h.d.head && !h.d.text.startsWith("#") ? "## " + h.d.head + "\n" : "") + h.d.text);
      e.score += h.s;
    }
    porNota.set(h.d.note, e);
  }
  const ranking = [...porNota.values()].sort((a, b) => b.score - a.score).slice(0, n);
  for (const nombre of siempre) {
    if (ranking.some((r) => r.note === nombre)) continue;
    const d = index.docs.find((x) => x.note === nombre);
    if (d) ranking.push({ note: nombre, passages: [d.text], score: 0 });
  }
  return ranking;
}

// ------------------------------------------------------------
// El índice ya construido, para guardarlo en R2
// ------------------------------------------------------------

/** El índice como un objeto que `JSON.stringify` entiende (los `Map` no). */
export function serializar(index) {
  return {
    v: 1,
    N: index.N,
    avg: index.avg,
    df: [...index.df],
    docs: index.docs.map((d) => ({
      id: d.id, note: d.note, head: d.head, text: d.text, hash: d.hash, i: d.i, len: d.len, tf: [...d.tf],
    })),
  };
}

/** Lo contrario. Devuelve `null` si lo guardado no es un índice que esta versión sepa leer. */
export function cargar(obj) {
  if (!obj || obj.v !== 1 || !Array.isArray(obj.docs) || !Array.isArray(obj.df)) return null;
  return {
    N: obj.N,
    avg: obj.avg,
    df: new Map(obj.df),
    docs: obj.docs.map((d) => ({ ...d, tf: new Map(d.tf) })),
  };
}

// ------------------------------------------------------------
// Notas que conviene mirar de nuevo
// ------------------------------------------------------------

/**
 * ¿Hace falta revisar esta nota? Manda la fecha del propio texto
 * (`revisar: AAAA-MM-DD` ya pasada, o `actualizado:` de hace más de
 * `maxDias`); si no hay ninguna, cuenta cuándo se tocó por última vez.
 * En el ADN de las agencias no hay ninguna de las dos fechas: la nota se
 * ve vieja por lo que dice la base, no por lo que dice el texto.
 */
export function staleness(texto, tocadaMs, ahora = Date.now(), maxDias = 180) {
  const fm = /^---([\s\S]*?)---/.exec(String(texto || ""))?.[1] || "";
  const revisar = /^\s*(?:revisar|review|revisar_el|review_by)\s*:\s*(\d{4}-\d{2}-\d{2})/im.exec(fm)?.[1];
  if (revisar && Date.parse(revisar + "T00:00:00") < ahora) {
    return { stale: true, why: `tocaba revisarla el ${revisar}`, since: Date.parse(revisar) };
  }
  const actualizado = /^\s*(?:actualizado|updated|reviewed|revisado)\s*:\s*(\d{4}-\d{2}-\d{2})/im.exec(fm)?.[1];
  const ultima = actualizado ? Date.parse(actualizado + "T00:00:00") : tocadaMs;
  if (ultima && ahora - ultima > maxDias * 864e5) {
    return { stale: true, why: `sin revisar desde ${new Date(ultima).toISOString().slice(0, 10)}`, since: ultima };
  }
  return { stale: false };
}
