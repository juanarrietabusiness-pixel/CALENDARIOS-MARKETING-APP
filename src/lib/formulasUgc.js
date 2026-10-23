// ============================================================
// Las fórmulas UGC de la agencia (puro)
//
// Una fórmula es la RECETA de un video que funciona, sin su contenido: los
// tramos con su tiempo y qué hace cada uno, el tipo de gancho, por qué
// funciona y cuándo conviene. Sirve para TODOS los clientes; la voz de cada
// uno va aparte (la nota «Voz UGC» de su cerebro, lib/ugc.js).
//
//   · Se guarda desde «Extraer guion y adaptar»: la IA ABSTRAE la fórmula
//     de la transcripción del video (`pedidoDeFormula`), la persona la
//     revisa y la guarda. También se escribe o corrige a mano.
//   · Al escribir un guion UGC se escoge una (`lineaDeFormula`, escalada a la
//     duración pedida) o la IA escoge entre todas (`bloqueDeFormulas`) y dice
//     cuál usó en una línea «FÓRMULA: …» (`formulaUsada`). La publicación
//     recuerda cuál (`post.formulaUgc`): de ahí saldrá qué funciona con cada
//     cliente.
//
// También lo importa el Worker.
// ============================================================

export const MAX_FORMULAS = 60;
export const MAX_TRAMOS_FORMULA = 10;
const DURACIONES = [15, 30, 45, 60];

const limpio = (t, max = 300) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const num = (n) => (Number.isFinite(Number(n)) && Number(n) >= 0 ? Math.round(Number(n) * 10) / 10 : null);
const duracionValida = (d) => (DURACIONES.includes(Number(d)) ? Number(d) : 30);

/** La fórmula limpia, o null si le falta el nombre o no tiene al menos dos tramos. Pura. */
export function limpiarFormula(f) {
  if (!f || typeof f !== "object") return null;
  const nombre = limpio(f.nombre, 60);
  const tramos = (Array.isArray(f.tramos) ? f.tramos : [])
    .map((t) => ({ desde: num(t?.desde), hasta: num(t?.hasta), funcion: limpio(t?.funcion, 160) }))
    .filter((t) => t.funcion)
    .slice(0, MAX_TRAMOS_FORMULA);
  if (!nombre || tramos.length < 2) return null;
  const fuente = f.fuente && typeof f.fuente === "object" ? {
    ...(limpio(f.fuente.cuenta, 60) ? { cuenta: limpio(f.fuente.cuenta, 60) } : {}),
    ...(/^https:\/\//.test(String(f.fuente.enlace ?? "")) ? { enlace: String(f.fuente.enlace).slice(0, 500) } : {}),
    ...(/^[\w-]{1,80}$/.test(String(f.fuente.archivoId ?? "")) ? { archivoId: String(f.fuente.archivoId) } : {}),
  } : {};
  return {
    ...(f.id ? { id: String(f.id) } : {}),
    nombre,
    duracion: duracionValida(f.duracion),
    tramos,
    gancho: limpio(f.gancho, 200),
    porQue: limpio(f.porQue, 300),
    cuando: limpio(f.cuando, 200),
    ...(Object.keys(fuente).length ? { fuente } : {}),
  };
}

/**
 * Los tramos de la fórmula en otra duración: cada uno conserva su proporción. Sin tiempos (escrita a mano), se reparten
 * a partes iguales. Pura.
 */
export function tramosEnDuracion(formula, duracion) {
  const d = duracionValida(duracion);
  const tramos = formula?.tramos ?? [];
  if (!tramos.length) return [];
  const conTiempo = tramos.every((t) => t.desde != null && t.hasta != null && t.hasta > t.desde);
  const total = conTiempo ? Math.max(...tramos.map((t) => t.hasta)) : tramos.length;
  let desde = 0;
  return tramos.map((t, i) => {
    const largo = conTiempo ? (t.hasta - t.desde) / total : 1 / total;
    const hasta = i === tramos.length - 1 ? d : Math.max(desde + 1, Math.round(desde + largo * d));
    const tramo = { desde, hasta, funcion: t.funcion };
    desde = hasta;
    return tramo;
  });
}

/** La fórmula como instrucción para la IA, ya en la duración pedida. Pura. */
export function lineaDeFormula(formula, duracion) {
  const f = limpiarFormula(formula);
  if (!f) return "";
  const tramos = tramosEnDuracion(f, duracion).map((t) => `[${t.desde}–${t.hasta} s] ${t.funcion}`).join(" · ");
  return [
    `SIGUE ESTA FÓRMULA «${f.nombre}» (la forma, no el contenido): ${tramos}.`,
    f.gancho ? `Su gancho: ${f.gancho}.` : "",
    f.porQue ? `Por qué funciona: ${f.porQue}.` : "",
  ].filter(Boolean).join(" ");
}

/**
 * Para que la IA ESCOJA la fórmula: la lista (nombre, cuándo conviene y sus tramos) y la orden de decir cuál usó en la
 * primera línea. Vacío sin fórmulas. Pura.
 */
export function bloqueDeFormulas(lista = [], duracion = 30) {
  const formulas = (lista ?? []).map(limpiarFormula).filter(Boolean).slice(0, 12);
  if (!formulas.length) return "";
  return [
    "FÓRMULAS DE LA AGENCIA (escoge la que mejor encaje con la idea, el producto y el tipo de contenido, y síguela):",
    ...formulas.map((f) => `- «${f.nombre}»${f.cuando ? ` (conviene: ${f.cuando})` : ""}: ${tramosEnDuracion(f, duracion).map((t) => `[${t.desde}–${t.hasta} s] ${t.funcion}`).join(" · ")}`),
    "Empieza tu respuesta con una línea «FÓRMULA: <el nombre exacto de la que usaste>» y después el guion.",
  ].join("\n");
}

const fold = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[«»"“”]/g, "").trim();

/** La fórmula que dice la IA que usó («FÓRMULA: …») → su id, o "". Pura. */
export function formulaUsada(texto, lista = []) {
  const m = /^[ \t]*f[oó]rmula\s*:\s*(.+)$/im.exec(String(texto ?? ""));
  if (!m) return "";
  const dicha = fold(m[1]);
  const f = (lista ?? []).find((x) => fold(x?.nombre) === dicha) ?? (lista ?? []).find((x) => x?.nombre && dicha.includes(fold(x.nombre)));
  return f?.id ?? "";
}

// ------------------------------------------------------------
// De un video que funciona a su fórmula
// ------------------------------------------------------------

/** Lo que se le pide a la IA: abstraer la fórmula de la transcripción de un video (sin su contenido). Pura. */
export function pedidoDeFormula(original = {}) {
  const tramos = (original.tramos ?? []).map((t) => `[${t.desde ?? "?"}–${t.hasta ?? "?"} s] dice: «${t.voz || "—"}» · se ve: ${t.seVe || "—"}${t.texto ? ` · en pantalla: «${t.texto}»` : ""}`).join("\n");
  return [
    "Este es un video que funciona, tramo a tramo. Saca su FÓRMULA: la receta que se puede repetir con cualquier marca y producto, SIN su contenido (ni marcas, ni productos, ni frases suyas).",
    original.estructura ? `Estructura según quien lo vio: ${original.estructura}.` : "",
    original.gancho ? `Su gancho: ${original.gancho}.` : "",
    original.porQue ? `Por qué funciona: ${original.porQue}.` : "",
    "",
    `EL VIDEO:\n${tramos.slice(0, 4000)}`,
    "",
    "Responde SOLO con JSON, así:",
    '{"nombre":"un nombre corto y fácil de recordar (p. ej. «Pregunta incómoda → demostración → precio»)","duracion":30,"tramos":[{"desde":0,"hasta":3,"funcion":"qué hace este tramo, en general (p. ej. «una pregunta que toca un dolor del cliente»)"}],"gancho":"el tipo de gancho","porQue":"por qué funciona, en una frase","cuando":"para qué tipo de contenido o producto conviene"}',
    "- De 2 a 8 tramos. «funcion» describe el PAPEL del tramo, nunca lo que decía este video.",
  ].filter((l, i, t) => l !== "" || t[i - 1] !== "").join("\n");
}

/** La respuesta de la IA → la fórmula propuesta (limpia), con su fuente. Null si no se puede leer. Pura. */
export function leerFormula(texto, { fuente = null, duracion = null } = {}) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  let d;
  try { d = JSON.parse(t.slice(i, j + 1)); } catch { return null; }
  const cerca = (n) => DURACIONES.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
  return limpiarFormula({ ...d, duracion: cerca(Number(duracion ?? d?.duracion) || 30), ...(fuente ? { fuente } : {}) });
}
