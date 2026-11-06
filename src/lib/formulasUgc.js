// ============================================================
// Las ESTRUCTURAS DE GUION de la agencia (antes «fórmulas UGC»; puro)
//
// Una estructura es la RECETA de un guion que funciona, sin su contenido: los
// tramos con su tiempo y qué hace cada uno, el tipo de gancho, por qué
// funciona y cuándo conviene. Es de la AGENCIA y sirve para TODOS los
// clientes; el tono de cada uno va aparte y se SUMA (la nota «Voz UGC» de su
// cerebro, lib/ugc.js; el estilo de la locución de su ficha).
//
//   · `para` dice en qué guiones se ofrece: «ugc» (el guion para grabar de un
//     reel con rostro) y/o «voz» (la VOZ EN OFF: el video animado y el reel
//     por planos). Una de antes, sin `para`, vale para las DOS: la forma
//     (gancho → problema → demostración → llamado) sirve igual a quien graba
//     que a una locución, y así la voz en off no arranca vacía.
//   · Los nombres del código y la ruta (`formulas_ugc`, /api/formulas-ugc,
//     `post.formulaUgc`) se quedan; en la pantalla se llaman «Estructuras de
//     guion» (y /api/estructuras-guion es la misma ruta).
//   · Se guarda desde «Extraer guion y adaptar»: la IA ABSTRAE la estructura
//     de la transcripción del video (`pedidoDeFormula`), la persona la
//     revisa y la guarda. También se escribe o corrige a mano.
//   · Al escribir un guion UGC se escoge una (`lineaDeFormula`, escalada a la
//     duración pedida) o la IA escoge entre todas (`bloqueDeFormulas`) y dice
//     cuál usó en una línea «FÓRMULA: …» (`formulaUsada`). La publicación
//     recuerda cuál (`post.formulaUgc`): de ahí saldrá qué funciona con cada
//     cliente.
//   · En una voz en off igual, con `{ uso: "voz" }`: la IA dice cuál usó en el
//     campo «estructura» de su JSON, y lo escrito la recuerda (el proyecto del
//     video animado en `origen.estructuraId`; la publicación, en
//     `post.estructuraVoz`).
//   · «Guardar como estructura» desde una voz en off que salió bien: la IA la
//     ABSTRAE del guion (`pedidoDeEstructuraVoz`, con los tramos de
//     `tramosDeEscenas` o `tramosDeReel`) y la persona la revisa y la guarda.
//
// También lo importa el Worker.
// ============================================================

export const MAX_FORMULAS = 60;
export const MAX_TRAMOS_FORMULA = 10;
/** Las duraciones ORIGINALES que se apuntan (informativo: al usarla, los tramos se reparten en la del video). */
export const DURACIONES_ESTRUCTURA = Object.freeze([10, 15, 20, 30, 45, 60]);
const DURACIONES = DURACIONES_ESTRUCTURA;
/** Para qué guiones sirve una estructura, con su nombre en la pantalla. */
export const USOS_ESTRUCTURA = Object.freeze({ ugc: "UGC · para grabar", voz: "Voz en off" });
const USOS = Object.keys(USOS_ESTRUCTURA);

const limpio = (t, max = 300) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const num = (n) => (Number.isFinite(Number(n)) && Number(n) >= 0 ? Math.round(Number(n) * 10) / 10 : null);
const duracionValida = (d) => (DURACIONES.includes(Number(d)) ? Number(d) : 30);
/** Un segundo para leerlo («1,5»). */
const seg = (n) => String(n ?? "?").replace(".", ",");

/**
 * Para qué sirve: «ugc», «voz» o las dos, en ese orden. Sin decirlo (las de antes), las DOS: la forma sirve igual a
 * quien graba que a una locución. Pura.
 */
export function paraDe(f) {
  const dicho = Array.isArray(f?.para) ? f.para : typeof f?.para === "string" ? [f.para] : [];
  const lista = USOS.filter((u) => dicho.includes(u));
  return lista.length ? lista : [...USOS];
}

/** ¿Se ofrece en ese tipo de guion («ugc» | «voz»)? Pura. */
export const sirvePara = (f, uso) => paraDe(f).includes(uso);

/** Las que sirven para ese uso (sin uso, todas). Pura. */
export const estructurasPara = (lista = [], uso = "") => (lista ?? []).filter((f) => f && (!uso || sirvePara(f, uso)));

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
    para: paraDe(f),
    duracion: duracionValida(f.duracion),
    tramos,
    gancho: limpio(f.gancho, 200),
    porQue: limpio(f.porQue, 300),
    cuando: limpio(f.cuando, 200),
    // Otras formas de la misma estructura que también valen (opcional; sólo si la hay: una de antes no cambia).
    ...(limpio(f.variantes, 300) ? { variantes: limpio(f.variantes, 300) } : {}),
    ...(Object.keys(fuente).length ? { fuente } : {}),
  };
}

/**
 * Una estructura escrita POR TRAMOS CON PESO (lo que manda Claude por MCP: `guardar_estructura`) → la forma de siempre de
 * la agencia (la misma que guarda Ajustes → Cómo trabajamos). Cada tramo { nombre, papel, peso, ejemplo? } pasa a su
 * `funcion` («Nombre — papel. Ej.: «…»») y su tramo en segundos sobre `duracion`, en proporción a su peso (sin peso, a
 * partes iguales; da igual si suman 100 o 1). → la estructura sin limpiar (la limpia `limpiarFormula`). Pura.
 */
export function estructuraDeTramosConPeso({ nombre = "", para = [], duracion = 30, tramos = [], tipoGancho = "", porQue = "", cuando = "", variantes = "" } = {}) {
  const lista = (Array.isArray(tramos) ? tramos : []).filter((t) => t && (limpio(t.papel, 160) || limpio(t.nombre, 60)));
  const d = duracionValida(duracion);
  const pesos = lista.map((t) => (Number(t.peso) > 0 ? Number(t.peso) : 0));
  const total = pesos.reduce((a, b) => a + b, 0);
  const peso = (i) => (total > 0 ? (pesos[i] || total / lista.length) : 1);
  const suma = lista.reduce((a, _, i) => a + peso(i), 0) || 1;
  let acumulado = 0;
  const conTiempo = lista.map((t, i) => {
    const desde = Math.round(((acumulado / suma) * d) * 10) / 10;
    acumulado += peso(i);
    const hasta = i === lista.length - 1 ? d : Math.round(((acumulado / suma) * d) * 10) / 10;
    const nombreT = limpio(t.nombre, 60);
    const papel = limpio(t.papel, 160);
    const ejemplo = limpio(t.ejemplo, 80);
    const funcion = `${nombreT && papel ? `${nombreT} — ${papel}` : nombreT || papel}${ejemplo ? `. Ej.: «${ejemplo}»` : ""}`;
    return { desde, hasta: Math.max(hasta, desde + 0.1), funcion: limpio(funcion, 160) };
  });
  return { nombre, para, duracion: d, tramos: conTiempo, gancho: tipoGancho, porQue, cuando, variantes };
}

/** La duración del video al que se lleva (cualquiera de 3 a 600 s: una voz en off dura 8, 10, 20…). */
const segundosValidos = (d) => {
  const n = Number(d);
  return Number.isFinite(n) && n >= 3 ? Math.min(600, Math.round(n * 10) / 10) : 30;
};

/**
 * Los tramos de la estructura en otra duración: cada uno conserva su proporción. Sin tiempos (escrita a mano), se
 * reparten a partes iguales. A segundos enteros si caben; en un video corto con muchos tramos, a medios segundos. Pura.
 */
export function tramosEnDuracion(formula, duracion) {
  const d = segundosValidos(duracion);
  const tramos = formula?.tramos ?? [];
  const n = tramos.length;
  if (!n) return [];
  const conTiempo = tramos.every((t) => t.desde != null && t.hasta != null && t.hasta > t.desde);
  const total = conTiempo ? Math.max(...tramos.map((t) => t.hasta)) : n;
  const paso = d >= n * 2 ? 1 : d >= n ? 0.5 : d / n;
  const redondo = (x) => Math.round(Math.round(x / paso) * paso * 10) / 10;
  let desde = 0;
  return tramos.map((t, i) => {
    const largo = conTiempo ? (t.hasta - t.desde) / total : 1 / total;
    // Cada tramo dura al menos un paso y deja sitio a los que faltan; el último termina en la duración.
    const hasta = i === n - 1 ? d : Math.min(redondo(d - (n - 1 - i) * paso), Math.max(redondo(desde + paso), redondo(desde + largo * d)));
    const tramo = { desde, hasta, funcion: t.funcion };
    desde = hasta;
    return tramo;
  });
}

const tramosEnTexto = (f, duracion) => tramosEnDuracion(f, duracion).map((t) => `[${seg(t.desde)}–${seg(t.hasta)} s] ${t.funcion}`).join(" · ");

/**
 * La estructura como instrucción para la IA, ya en la duración pedida. `uso` «voz»: la recorre la VOZ EN OFF (el
 * video animado, el reel); si no, la de siempre del guion UGC. Pura.
 */
export function lineaDeFormula(formula, duracion, { uso = "ugc" } = {}) {
  const f = limpiarFormula(formula);
  if (!f) return "";
  const tramos = tramosEnTexto(f, duracion);
  return [
    uso === "voz"
      ? `SIGUE ESTA ESTRUCTURA DE GUION DE LA AGENCIA «${f.nombre}» (la forma, no el contenido): ${tramos}. La voz en off la recorre en ese orden y con esos tiempos: cada tramo hace lo que dice, con lo de esta marca.`
      : `SIGUE ESTA FÓRMULA «${f.nombre}» (la forma, no el contenido): ${tramos}.`,
    f.gancho ? `Su gancho: ${f.gancho}.` : "",
    f.porQue ? `Por qué funciona: ${f.porQue}.` : "",
    f.variantes ? `Variantes que también valen: ${f.variantes}.` : "",
  ].filter(Boolean).join(" ");
}

/**
 * Para que la IA ESCOJA la estructura: la lista (nombre, cuándo conviene y sus tramos) y la orden de decir cuál usó.
 * `uso` filtra (sólo las que sirven para «ugc» o «voz»); `campo`: el campo del JSON donde la IA la dice (cuando
 * responde en JSON); sin él, en la primera línea. Vacío sin estructuras. Pura.
 */
export function bloqueDeFormulas(lista = [], duracion = 30, { uso = "", campo = "" } = {}) {
  const formulas = estructurasPara(lista, uso).map(limpiarFormula).filter(Boolean).slice(0, 12);
  if (!formulas.length) return "";
  const voz = uso === "voz";
  return [
    voz
      ? "ESTRUCTURAS DE GUION DE LA AGENCIA (para la voz en off: escoge la que mejor encaje con la idea, el producto y el tipo de contenido, y síguela tramo a tramo; es la forma, no el contenido):"
      : "FÓRMULAS DE LA AGENCIA (escoge la que mejor encaje con la idea, el producto y el tipo de contenido, y síguela):",
    ...formulas.map((f) => `- «${f.nombre}»${f.cuando ? ` (conviene: ${f.cuando})` : ""}: ${tramosEnTexto(f, duracion)}`),
    campo
      ? `Di cuál usaste: pon su nombre exacto en el campo "${campo}" del JSON.`
      : voz
        ? "Empieza tu respuesta con una línea «ESTRUCTURA: <el nombre exacto de la que usaste>» y después el guion."
        : "Empieza tu respuesta con una línea «FÓRMULA: <el nombre exacto de la que usaste>» y después el guion.",
  ].join("\n");
}

const fold = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[«»"“”]/g, "").trim();

/** La fórmula que dice la IA que usó («FÓRMULA: …» o «ESTRUCTURA: …») → su id, o "". Pura. */
export function formulaUsada(texto, lista = []) {
  const m = /^[ \t]*(?:f[oó]rmula|estructura)\s*:\s*(.+)$/im.exec(String(texto ?? ""));
  if (!m) return "";
  const dicha = fold(m[1]);
  const f = (lista ?? []).find((x) => fold(x?.nombre) === dicha) ?? (lista ?? []).find((x) => x?.nombre && dicha.includes(fold(x.nombre)));
  return f?.id ?? "";
}

/** El NOMBRE de una estructura (el que dijo la IA en el campo de su JSON) → su id, o "". Pura. */
export const idDeEstructura = (nombre, lista = []) => {
  const n = String(nombre ?? "").split("\n")[0].trim();
  return n ? formulaUsada(`ESTRUCTURA: ${n}`, lista) : "";
};

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

/**
 * La respuesta de la IA → la estructura propuesta (limpia), con su fuente. `para`: para qué sirve (sin él, lo que diga
 * la IA o las dos). Null si no se puede leer. Pura.
 */
export function leerFormula(texto, { fuente = null, duracion = null, para = null } = {}) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  let d;
  try { d = JSON.parse(t.slice(i, j + 1)); } catch { return null; }
  const cerca = (n) => DURACIONES.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
  return limpiarFormula({ ...d, duracion: cerca(Number(duracion ?? d?.duracion) || 30), ...(fuente ? { fuente } : {}), para: para ?? d?.para });
}

// ------------------------------------------------------------
// De una voz en off que salió bien a su estructura
// ------------------------------------------------------------

/** Las etiquetas de emoción de ElevenLabs v3 («[emocionada]») no son guion. */
const sinEtiquetas = (t) => String(t ?? "").replace(/\[[^\]]{1,40}\]/g, " ");

/**
 * Lo que manda la pantalla de una voz en off → limpio: { titulo, duracion, tramos: [{ desde, hasta, dice, pantalla,
 * tipo }] }. Null si no tiene al menos dos tramos con voz. Pura (el servidor no se cree lo que llega).
 */
export function limpiarGuionVoz(v) {
  if (!v || typeof v !== "object") return null;
  const tramos = (Array.isArray(v.tramos) ? v.tramos : []).slice(0, 30).map((t) => ({
    desde: num(t?.desde), hasta: num(t?.hasta), dice: limpio(sinEtiquetas(t?.dice), 400), pantalla: limpio(t?.pantalla, 120), tipo: limpio(t?.tipo, 30),
  })).filter((t) => t.dice || t.pantalla);
  if (tramos.filter((t) => t.dice).length < 2) return null;
  const duracion = num(v.duracion) || Math.max(0, ...tramos.map((t) => t.hasta ?? 0)) || 30;
  return { titulo: limpio(v.titulo, 120), duracion, tramos };
}

/** Los tramos de un video animado: una escena = un tramo, con sus tiempos (`linea` = lineaDeTiempo del guion). Pura. */
export function tramosDeEscenas(guion, linea = null) {
  const escenas = Array.isArray(guion?.escenas) ? guion.escenas : [];
  return escenas.map((e, i) => ({
    desde: num(linea?.escenas?.[i]?.desde), hasta: num(linea?.escenas?.[i]?.hasta),
    dice: limpio(sinEtiquetas(e?.habla), 400), pantalla: limpio(e?.pantalla, 120), tipo: limpio(e?.tipo, 30),
  })).filter((t) => t.dice || t.pantalla);
}

/** Los tramos de un reel por planos: un plano = un tramo (lo que dice y lo que se lee). Pura. */
export function tramosDeReel(guion) {
  return (Array.isArray(guion?.planos) ? guion.planos : []).map((p) => ({
    desde: num(p?.desde), hasta: num(p?.hasta), dice: limpio(p?.dice, 400), pantalla: limpio(p?.pantalla, 120),
  })).filter((t) => t.dice || t.pantalla);
}

/** Lo que se le pide a la IA: abstraer la ESTRUCTURA de una voz en off que salió bien (sin su contenido). Pura. */
export function pedidoDeEstructuraVoz(voz = {}) {
  const tramos = (voz.tramos ?? []).map((t) => `[${seg(t.desde)}–${seg(t.hasta)} s]${t.tipo ? ` (${t.tipo})` : ""} dice: «${t.dice || "—"}»${t.pantalla ? ` · en pantalla: «${t.pantalla}»` : ""}`).join("\n");
  return [
    "Este es el guion de un video con VOZ EN OFF que salió bien, tramo a tramo. Saca su ESTRUCTURA: la forma que se puede repetir con cualquier marca y producto, SIN su contenido (ni marcas, ni productos, ni frases suyas).",
    voz.titulo ? `El video se llamaba «${voz.titulo}» (sólo para que sepas de qué iba).` : "",
    voz.duracion ? `Dura ${seg(voz.duracion)} s.` : "",
    "",
    `EL GUION:\n${tramos.slice(0, 4000)}`,
    "",
    "Responde SOLO con JSON, así:",
    '{"nombre":"un nombre corto y fácil de recordar (p. ej. «Pregunta → tres razones → llamado»)","duracion":30,"tramos":[{"desde":0,"hasta":3,"funcion":"qué hace la voz en este tramo, en general (p. ej. «una pregunta que nombra el problema»)"}],"gancho":"el tipo de gancho","porQue":"por qué funciona, en una frase","cuando":"para qué tipo de contenido o producto conviene"}',
    "- De 2 a 8 tramos. «funcion» describe el PAPEL del tramo, nunca lo que decía este guion.",
  ].filter((l, i, t) => l !== "" || t[i - 1] !== "").join("\n");
}
