// ============================================================
// UGC · guion para grabar (puro)
//
// Un reel UGC (`post.rostro`) lo GRABA una persona de la marca hablando a
// cámara: la IA no lo crea, le escribe el guion. La agencia lo usa sobre todo
// para sacar la voz en off y las ideas visuales de un video que funciona y
// adaptarlas a la empresa con la que trabaja.
//
// El guion sigue viviendo en `post.guion` (texto), así lo leen igual el
// enlace del cliente, la exportación y todo lo que ya lee el guion. Cada
// línea es un tramo:
//
//   [0–3 s] VOZ: «lo que dice, palabra por palabra» | SE VE: la toma | TEXTO: en pantalla
//
// y se lee también la forma corta del lote («[0–3 s] dice · se ve · texto»).
// Al lado van la duración (`post.duracionUgc`: 15, 30, 45 o 60 s; la voz cabe
// a unas 2,5 palabras por segundo) y tres ganchos alternativos para el inicio
// (`post.ganchosUgc`), para grabar el que mejor salga.
//
// También lo importa el Worker («Extraer guion y adaptar»).
// ============================================================

export const DURACIONES_UGC = Object.freeze([15, 30, 45, 60]);
export const DURACION_UGC = 30;
/** Palabras por segundo de una voz natural a cámara. */
export const PALABRAS_POR_SEGUNDO = 2.5;
export const MAX_TRAMOS = 12;
const MAX_CAMPO = 400;

const limpio = (t, max = MAX_CAMPO) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/** La duración válida más cercana (30 s si no se dice). Pura. */
export const duracionUgc = (d) => {
  const n = Number(d);
  return DURACIONES_UGC.includes(n) ? n : DURACION_UGC;
};
/** Cuántas palabras de voz caben en esa duración. Pura. */
export const palabrasQueCaben = (duracion) => Math.round(duracionUgc(duracion) * PALABRAS_POR_SEGUNDO);
export const contarPalabras = (t) => String(t ?? "").split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;

const ETIQUETAS = [
  ["voz", /^(voz|dice|di|locuci[oó]n|audio)\s*:\s*/i],
  ["seVe", /^(se ve|toma|plano|visual|imagen|en c[aá]mara)\s*:\s*/i],
  ["texto", /^(texto|texto en pantalla|en pantalla|pantalla|rótulo|rotulo)\s*:\s*/i],
];
const sinComillas = (t) => t.replace(/^[«"“]\s*/, "").replace(/\s*[»"”]$/, "");

/**
 * El guion (texto) → tramos { desde, hasta, voz, seVe, texto }. Una línea sin tiempo se suma al tramo anterior (o
 * abre uno sin tiempo). Las partes van separadas por « | » o « · »; con etiqueta (VOZ:, SE VE:, TEXTO:) o, sin
 * ella, en ese orden. Pura.
 */
export function partirGuionUgc(texto) {
  const tramos = [];
  for (const crudo of String(texto ?? "").replace(/\\n/g, "\n").split(/\n+/)) {
    const linea = crudo.replace(/^\s*[-*•]\s*/, "").trim();
    if (!linea || /^ganchos?\b/i.test(linea)) continue;
    const m = linea.match(/^\[?\s*(\d+(?:[.,]\d+)?)\s*(?:s|seg)?\s*[–—-]\s*(\d+(?:[.,]\d+)?)\s*(?:s|seg|segundos)?\s*\]?\s*[:.)-]?\s*(.*)$/i);
    const resto = m ? m[3] : linea;
    const partes = resto.split(/\s+[|·]\s+/).map((p) => p.trim()).filter(Boolean);
    const tramo = { desde: m ? Number(m[1].replace(",", ".")) : null, hasta: m ? Number(m[2].replace(",", ".")) : null, voz: "", seVe: "", texto: "" };
    const libres = [];
    for (const p of partes) {
      const e = ETIQUETAS.find(([, re]) => re.test(p));
      if (e) tramo[e[0]] = sinComillas(p.replace(e[1], "").trim());
      else libres.push(sinComillas(p));
    }
    for (const k of ["voz", "seVe", "texto"]) if (!tramo[k] && libres.length) tramo[k] = libres.shift();
    if (!m && tramos.length) {
      // Una línea suelta sigue al tramo de antes (la voz partida en dos líneas).
      const ant = tramos[tramos.length - 1];
      for (const k of ["voz", "seVe", "texto"]) if (tramo[k]) ant[k] = [ant[k], tramo[k]].filter(Boolean).join(" ");
      continue;
    }
    if (tramo.voz || tramo.seVe || tramo.texto) tramos.push(tramo);
  }
  return tramos.slice(0, MAX_TRAMOS).map((t) => ({ ...t, voz: limpio(t.voz), seVe: limpio(t.seVe), texto: limpio(t.texto, 80) }));
}

/** ¿Tiene forma de guion por tramos? (al menos dos con tiempo) Pura. */
export const esGuionUgc = (texto) => partirGuionUgc(texto).filter((t) => t.desde != null).length >= 2;

const seg = (n) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));
/** Tramos → el texto del guion, en la forma de siempre. Pura. */
export function guionUgcATexto(tramos = []) {
  return tramos.map((t) => [
    t.desde != null && t.hasta != null ? `[${seg(t.desde)}–${seg(t.hasta)} s]` : "",
    [t.voz ? `VOZ: «${t.voz}»` : "", t.seVe ? `SE VE: ${t.seVe}` : "", t.texto ? `TEXTO: ${t.texto}` : ""].filter(Boolean).join(" | "),
  ].filter(Boolean).join(" ")).join("\n");
}

/** Lo que se DICE, seguido, para leerlo o pegarlo en un teleprompter. Pura. */
export const vozDelGuion = (texto) => partirGuionUgc(texto).map((t) => t.voz).filter(Boolean).join("\n");

/** La lista de tomas para grabar: número, tiempo, qué se ve y el texto en pantalla. Pura. */
export const tomasDelGuion = (texto) => partirGuionUgc(texto)
  .filter((t) => t.seVe || t.texto)
  .map((t, i) => `${i + 1}. ${t.desde != null ? `[${seg(t.desde)}–${seg(t.hasta)} s] ` : ""}${t.seVe || "(a cámara)"}${t.texto ? ` · en pantalla: «${t.texto}»` : ""}`)
  .join("\n");

/** Cuánto dura la voz escrita y si cabe en la duración. → { palabras, caben, sobra }. Pura. */
export function medidaDeLaVoz(texto, duracion) {
  const palabras = contarPalabras(vozDelGuion(texto));
  const caben = palabrasQueCaben(duracion);
  return { palabras, caben, sobra: Math.max(0, palabras - caben) };
}

/** Los ganchos limpios: hasta 3, sin repetir. Pura. */
export const limpiarGanchos = (lista) => [...new Set((Array.isArray(lista) ? lista : []).map((g) => sinComillas(limpio(g, 200))).filter(Boolean))].slice(0, 3);

/**
 * La regla que se le da a la IA al escribir el guion de un UGC (el panel, el lote y «Extraer y adaptar»): la forma de
 * cada línea, la duración y lo que no se hace. Pura.
 */
export function reglaUgc(duracion = DURACION_UGC) {
  const d = duracionUgc(duracion);
  return [
    `UGC · GUION PARA GRABAR (${d} segundos): lo GRABA una persona de la marca hablando a cámara con el teléfono; no se hace con IA.`,
    `Escribe de 3 a ${Math.min(MAX_TRAMOS, Math.max(4, Math.round(d / 5)))} tramos, cada uno en UNA línea y con esta forma exacta:`,
    "[0–3 s] VOZ: «lo que dice, palabra por palabra» | SE VE: la toma (dónde, qué hace, el encuadre) | TEXTO: texto corto en pantalla",
    `- Los tiempos van seguidos desde 0 hasta ${d} s. La voz, natural y hablada (como se habla a un amigo), de ${palabrasQueCaben(d)} palabras como mucho EN TOTAL (unas ${PALABRAS_POR_SEGUNDO} por segundo).`,
    "- El primer tramo es el GANCHO (los 3 primeros segundos deciden si se queda); el último, el llamado a la acción.",
    "- TEXTO en pantalla: 6 palabras como mucho, o nada.",
    "- Lo que va entre comillas en la idea se dice TAL CUAL.",
    "- Nada de reseñas, cifras ni promesas que no estén en lo que se sabe de la marca.",
  ].join("\n");
}

/** Lo que se le pide además para el panel: tres ganchos para probar. Pura. */
export const LINEA_GANCHOS = "Después del guion, una línea «GANCHOS:» y debajo 3 ganchos alternativos para el primer tramo, uno por línea empezando por «- » (lo que dice, palabra por palabra).";

/** La respuesta de la IA (guion + «GANCHOS:») → { guion, ganchos }. Pura. */
export function leerGuionConGanchos(texto) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "").trim();
  const m = /^[ \t]*ganchos?[^:\n]*:/im.exec(t);
  const cuerpo = m ? t.slice(0, m.index) : t;
  const ganchos = m
    ? limpiarGanchos(t.slice(m.index + m[0].length).split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")).filter((l) => l.trim()))
    : [];
  const tramos = partirGuionUgc(cuerpo);
  return { guion: tramos.length ? guionUgcATexto(tramos) : cuerpo.trim(), ganchos };
}

/** El gancho escogido pasa a ser la voz del primer tramo. Pura. */
export function conGancho(texto, gancho) {
  const tramos = partirGuionUgc(texto);
  if (!tramos.length || !limpio(gancho)) return texto;
  tramos[0] = { ...tramos[0], voz: sinComillas(limpio(gancho)) };
  return guionUgcATexto(tramos);
}

// ------------------------------------------------------------
// «Extraer guion y adaptar»: de un video que funciona a uno nuestro
// ------------------------------------------------------------

/** Lo que se le pide a Gemini al VER el video: la voz palabra por palabra y las tomas, tramo a tramo (JSON). Pura. */
export function pedidoDeTranscripcion() {
  return [
    "Mira y escucha este video entero. Transcribe lo que se DICE palabra por palabra (voz a cámara o voz en off, en su idioma) y describe lo que se VE, por tramos de tiempo.",
    "Responde SOLO con JSON, así:",
    '{"tramos":[{"desde":0,"hasta":3,"voz":"lo que se dice, tal cual","seVe":"la toma: quién, dónde, qué hace, el encuadre","texto":"el texto en pantalla, si hay"}],"duracion":30,"gancho":"qué hace que alguien se quede en los primeros segundos","porQue":"por qué funciona, en una frase","estructura":"la forma del video en pocas palabras (p. ej. problema → demostración → oferta)"}',
    "- Los tramos siguen al video (de 2 a 6 segundos cada uno), seguidos y sin huecos. Si no se dice nada en un tramo, «voz» va vacía.",
    "- No inventes lo que no se oye ni se ve.",
  ].join("\n");
}

const deJSON = (texto) => {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
};
const num = (n) => (Number.isFinite(Number(n)) ? Math.max(0, Math.round(Number(n) * 10) / 10) : null);

/** La respuesta de Gemini → { tramos, duracion, gancho, porQue, estructura }, o null. Pura. */
export function leerTranscripcion(texto) {
  const d = deJSON(texto);
  const tramos = (Array.isArray(d?.tramos) ? d.tramos : []).slice(0, 30).map((t) => ({
    desde: num(t?.desde), hasta: num(t?.hasta), voz: limpio(t?.voz), seVe: limpio(t?.seVe), texto: limpio(t?.texto, 80),
  })).filter((t) => t.voz || t.seVe);
  if (!tramos.length) return null;
  return {
    tramos,
    duracion: num(d?.duracion) || tramos[tramos.length - 1].hasta || null,
    gancho: limpio(d?.gancho, 300), porQue: limpio(d?.porQue, 300), estructura: limpio(d?.estructura, 200),
  };
}

/** El video original como texto (para la IA que adapta y para enseñarlo). Pura. */
export const transcripcionATexto = (t) => guionUgcATexto(t?.tramos ?? []);

/**
 * Lo que se le pide a la IA para ADAPTAR el video a la marca, en UGC: la misma forma y el mismo ritmo, con el producto,
 * la oferta y la voz de la marca. `original`: la transcripción; `productoLinea`: el producto del catálogo (precio
 * exacto); `contexto`: lo que se sabe de la marca (sin lo interno); `nota`: lo que pide la agencia. Pura.
 */
export function pedidoDeAdaptacionUgc({ marca = "la marca", original, duracion = DURACION_UGC, productoLinea = "", contexto = "", nota = "" }) {
  return [
    `Este es un video que funciona (de otra cuenta). Escribe un UGC para ${marca} que siga su FORMA: el mismo tipo de gancho, el mismo orden de tramos y el mismo ritmo, pero con el producto, la oferta y la voz de ${marca}. No copies frases, marcas, nombres ni cifras del original.`,
    original?.estructura ? `Su estructura: ${original.estructura}.` : "",
    original?.gancho ? `Su gancho: ${original.gancho}.` : "",
    original?.porQue ? `Por qué funciona: ${original.porQue}.` : "",
    "",
    `EL VIDEO ORIGINAL, TRAMO A TRAMO:\n${transcripcionATexto(original).slice(0, 4000)}`,
    "",
    productoLinea ? `EL PRODUCTO (precio EXACTO, como aquí): ${productoLinea}` : "",
    nota ? `LO QUE PIDE LA AGENCIA: ${String(nota).slice(0, 500)}` : "",
    "",
    reglaUgc(duracion),
    "",
    "Responde con esta forma, sin nada más:",
    "TITULO: cómo se llamaría en el calendario (pocas palabras)",
    "GUION:",
    "(los tramos, uno por línea)",
    "GANCHOS:",
    "- (3 ganchos alternativos para el primer tramo, lo que se dice)",
    "DESCRIPCION: el caption, de 2 a 4 frases con un llamado a la acción y de 5 a 10 hashtags al final",
    "",
    contexto ? `LO QUE SE SABE DE LA MARCA:\n${String(contexto).slice(0, 8000)}` : "",
  ].filter((l, i, t) => l !== "" || t[i - 1] !== "").join("\n");
}

/** La respuesta de la adaptación → { titulo, guion, ganchos, descripcion }, o null si no trae guion. Pura. */
export function leerAdaptacionUgc(texto) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "").replace(/\r/g, "");
  const tramo = (etiqueta, siguientes) => {
    const re = new RegExp(`^\\s*${etiqueta}\\s*:\\s*`, "im");
    const m = re.exec(t);
    if (!m) return "";
    const resto = t.slice(m.index + m[0].length);
    const fin = resto.search(new RegExp(`^\\s*(${siguientes})\\s*:`, "im"));
    return (fin >= 0 ? resto.slice(0, fin) : resto).trim();
  };
  const titulo = limpio(tramo("T[IÍ]TULO", "GUION|GANCHOS?|DESCRIPCI[OÓ]N").split("\n")[0], 80);
  const cuerpo = tramo("GUION", "GANCHOS?|DESCRIPCI[OÓ]N|T[IÍ]TULO");
  const ganchos = limpiarGanchos(tramo("GANCHOS?", "DESCRIPCI[OÓ]N|T[IÍ]TULO|GUION").split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")));
  const descripcion = tramo("DESCRIPCI[OÓ]N", "T[IÍ]TULO|GUION|GANCHOS?").slice(0, 2200);
  const tramos = partirGuionUgc(cuerpo);
  if (tramos.length < 2) return null;
  return { titulo, guion: guionUgcATexto(tramos), ganchos, descripcion };
}

/**
 * La publicación (o la idea del banco) que sale de una adaptación: un reel UGC con su guion, ganchos, duración y
 * caption. Sólo lo que trae; lo demás (fecha, medios) es de quien la recibe. Pura.
 */
export function publicacionDeUgc(adaptado = {}, { duracion = DURACION_UGC, productoId = "", producto = "" } = {}) {
  return {
    format: "reel", rostro: true,
    ...(adaptado.titulo ? { title: adaptado.titulo } : {}),
    idea: adaptado.titulo ? `UGC: ${adaptado.titulo}` : "UGC adaptado de un video de referencia",
    guion: adaptado.guion ?? "",
    ...(adaptado.ganchos?.length ? { ganchosUgc: adaptado.ganchos } : {}),
    duracionUgc: duracionUgc(duracion),
    ...(adaptado.descripcion ? { descripcion: adaptado.descripcion } : {}),
    ...(productoId ? { productoId, producto } : {}),
  };
}
