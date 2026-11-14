// ============================================================
// El LENGUAJE DEL CLIENTE: las frases EXACTAS con las que sus clientes cuentan su problema, lo que dudan y lo que
// celebran (investigación del curso: el «diccionario del cliente» y las «pepitas de oro» de las reseñas, con palabras
// propias). Vive como una nota del cerebro con ruta fija (`RUTA_LENGUAJE`), como «Saber del rubro»: la propone la IA a
// partir de reseñas, comentarios y la encuesta de voz del cliente, el CÓDIGO comprueba que cada frase esté de verdad en
// el texto de donde salió, y una persona la guarda. El motor de ideas la lee entera al escribir ganchos y textos.
//
// Lo que hace el código y no la IA:
//   · COMPROBAR cada frase: tiene que estar tal cual en algún comentario (sin contar mayúsculas, tildes, comillas ni
//     espacios de más); la que no está, se descarta y se cuenta. Lo que queda en la nota es el trozo ORIGINAL del
//     comentario, no lo que escribió la IA.
//   · CONTAR cuántas veces aparece cada frase y cada tema (cuántos comentarios lo dicen).
//   · QUITAR los nombres de las marcas de la competencia (las del estudio y las que se escriban): «otra marca».
//
// Puro y sin importaciones: lo leen la pantalla, el Worker y el motor de ideas.
// ============================================================

export const RUTA_LENGUAJE = "lenguaje-del-cliente";
export const TITULO_LENGUAJE = "Lenguaje del cliente";
/** Lo que el motor de ideas lee de la nota, como mucho (como «Saber del rubro»). La nota se arma para caber aquí. */
export const MAX_LENGUAJE = 4000;

/** Los temas de la nota, en el orden en que se le piden a la IA. */
export const TEMAS_LENGUAJE = Object.freeze([
  { id: "dolor", nombre: "Cómo cuentan su problema", ayuda: "lo que les duele o les pasa, como lo dicen ellos" },
  { id: "duda", nombre: "Sus dudas y objeciones", ayuda: "lo que les frena o preguntan antes de comprar" },
  { id: "deseo", nombre: "Lo que quieren lograr", ayuda: "el resultado que buscan" },
  { id: "elogio", nombre: "Lo que celebran", ayuda: "lo que más les gustó de la marca" },
  { id: "competencia", nombre: "Lo que odian de otras opciones", ayuda: "lo que les falló con otras marcas o soluciones: lo que el anuncio tiene que resolver" },
]);
const IDS_TEMA = TEMAS_LENGUAJE.map((t) => t.id);

/** De dónde sale cada comentario. «nota»: las frases de la nota de ahora, para que lo que sigue valiendo no se pierda. */
export const FUENTES_LENGUAJE = Object.freeze(["pegado", "competencia", "nota", "encuesta", "bandeja"]);

export const MAX_FRASES_TEMA = 6;
export const MAX_FRASE = 220;
export const MAX_PATRONES = 4;
/** Lo que se le manda a la IA, como mucho (caracteres de comentarios) y por fuente. */
export const MAX_MATERIAL_LENGUAJE = 30_000;
const TOPE_FUENTE = Object.freeze({ pegado: 15_000, competencia: 8_000, nota: 4_000, encuesta: 9_000, bandeja: 9_000 });
const MAX_FRAGMENTO = 600;
const MIN_LETRAS = 8;
const MIN_PALABRAS = 2;
const OTRA_MARCA = "otra marca";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// ------------------------------------------------------------
// Comparar sin mayúsculas, tildes, comillas ni espacios de más
// ------------------------------------------------------------

const COMILLA = /["'`´“”‘’«»]/;
const LETRA = /[\p{L}\p{N}]/u;

/**
 * El texto plegado (minúsculas, sin tildes ni comillas, los espacios juntos) y, por cada carácter plegado, de qué
 * carácter del original salió: así lo encontrado se devuelve tal cual estaba escrito. Pura.
 */
export function plegarConMapa(texto) {
  const t = String(texto ?? "");
  let salida = "";
  const mapa = [];
  let tras = true; // tras un espacio (o al principio): otro espacio no cuenta
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (/\s/.test(c)) {
      if (!tras) { salida += " "; mapa.push(i); tras = true; }
      continue;
    }
    if (COMILLA.test(c)) continue;
    const plegado = c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (let j = 0; j < plegado.length; j++) { salida += plegado[j]; mapa.push(i); }
    tras = false;
  }
  if (salida.endsWith(" ")) { salida = salida.slice(0, -1); mapa.pop(); }
  return { texto: salida, mapa };
}

export const plegar = (texto) => plegarConMapa(texto).texto;

/** Una frase lista para buscarla: plegada y sin signos sueltos al principio ni al final. Pura. */
const BORDE = /^[\s.,;:!¡?¿…()[\]\-–—*]+|[\s.,;:!¡?¿…()[\]\-–—*]+$/g;
const paraBuscar = (frase) => plegar(frase).replace(BORDE, "");

/** Dónde empieza `aguja` dentro de `pajar` (los dos plegados) como palabras enteras, o -1. Pura. */
function buscarEntero(pajar, aguja, desde = 0) {
  if (!aguja) return -1;
  for (let i = pajar.indexOf(aguja, desde); i !== -1; i = pajar.indexOf(aguja, i + 1)) {
    const antes = i > 0 ? pajar[i - 1] : "";
    const despues = pajar[i + aguja.length] ?? "";
    if (!LETRA.test(antes) && !LETRA.test(despues)) return i;
  }
  return -1;
}

/**
 * Si `frase` está tal cual dentro de `texto` (sin contar mayúsculas, tildes, comillas ni espacios de más), el trozo
 * ORIGINAL de `texto` que la contiene; si no, null. Pura.
 */
export function fraseEnTexto(frase, texto) {
  const aguja = paraBuscar(frase);
  if (!aguja) return null;
  const { texto: pajar, mapa } = plegarConMapa(texto);
  const i = buscarEntero(pajar, aguja);
  if (i < 0) return null;
  const original = String(texto);
  return original.slice(mapa[i], mapa[i + aguja.length - 1] + 1).replace(/\s+/g, " ").trim();
}

/**
 * Cambia por «otra marca» cada nombre de `marcas` que aparezca como palabra entera (sin contar mayúsculas ni tildes; el
 * «@» de delante también). Los nombres de menos de 3 letras no se tocan (darían falsos positivos). Pura.
 */
export function quitarMarcas(texto, marcas = []) {
  let t = String(texto ?? "");
  const nombres = [...new Set((Array.isArray(marcas) ? marcas : []).map((m) => paraBuscar(m)))]
    .filter((m) => m.replace(/[^\p{L}\p{N}]/gu, "").length >= 3 && !OTRA_MARCA.includes(m))
    .sort((a, b) => b.length - a.length);
  for (const nombre of nombres) {
    for (let vueltas = 0; vueltas < 30; vueltas++) {
      const { texto: plano, mapa } = plegarConMapa(t);
      const i = buscarEntero(plano, nombre);
      if (i < 0) break;
      let ini = mapa[i];
      const fin = mapa[i + nombre.length - 1] + 1;
      if (ini > 0 && t[ini - 1] === "@") ini--;
      t = `${t.slice(0, ini)}${OTRA_MARCA}${t.slice(fin)}`;
    }
  }
  return t;
}

/** Las marcas de la competencia que se escriben a mano («A, B; C» o una por línea), sin la del propio cliente. Pura. */
export function marcasDeTexto(texto, { propia = "" } = {}) {
  const suya = paraBuscar(propia);
  return [...new Set(String(texto ?? "").split(/[,;\n]+/).map((m) => corto(m, 60)).filter(Boolean))]
    .filter((m) => paraBuscar(m) && paraBuscar(m) !== suya)
    .slice(0, 20);
}

// ------------------------------------------------------------
// El material: los comentarios, numerados
// ------------------------------------------------------------

/** Un texto pegado, partido en comentarios (uno por línea), sin las líneas sueltas de una o dos letras. Pura. */
export function partirComentarios(texto) {
  return String(texto ?? "").replace(/\r\n?/g, "\n").split(/\n+/).map((l) => corto(l, MAX_FRAGMENTO)).filter((l) => l.length >= 3);
}

/**
 * Las frases de una nota de lenguaje ya guardada (`- «frase» (3)`), con su cuenta: entran como material para que lo que
 * sigue valiendo no se pierda al proponerla otra vez. Pura.
 */
export function frasesDeNota(texto) {
  const salida = [];
  for (const linea of String(texto ?? "").split("\n")) {
    const m = linea.match(/^\s*-\s*«(.+)»\s*(?:\((\d+)\))?\s*$/);
    if (!m) continue;
    const frase = corto(m[1], MAX_FRASE + 10);
    if (frase) salida.push({ texto: frase, peso: Math.max(1, Math.min(999, Number(m[2]) || 1)) });
    if (salida.length >= 60) break;
  }
  return salida;
}

/**
 * Todo el material junto, numerado, con su fuente y con tope por fuente y en total. Pura.
 * @param pegado       reseñas o comentarios de sus clientes que pegó la persona (texto)
 * @param competencia  reseñas de clientes de la COMPETENCIA (texto)
 * @param nota         el texto de la nota de ahora (sus frases entran con su cuenta)
 * @param encuesta     [{ texto, etiqueta }]: cada respuesta de la encuesta, con su pregunta
 * @param bandeja      [texto]: los comentarios de otras personas guardados en la Bandeja
 * → [{ n, texto, fuente, etiqueta?, peso? }]
 */
export function fragmentosDeLenguaje({ pegado = "", competencia = "", nota = "", encuesta = [], bandeja = [] } = {}) {
  const porFuente = {
    pegado: partirComentarios(pegado).map((texto) => ({ texto })),
    competencia: partirComentarios(competencia).map((texto) => ({ texto })),
    nota: frasesDeNota(nota),
    encuesta: (Array.isArray(encuesta) ? encuesta : []).map((e) => ({ texto: corto(e?.texto, MAX_FRAGMENTO), etiqueta: corto(e?.etiqueta, 80) })).filter((e) => e.texto.length >= 3),
    bandeja: (Array.isArray(bandeja) ? bandeja : []).map((t) => ({ texto: corto(t, MAX_FRAGMENTO) })).filter((e) => e.texto.split(" ").length >= MIN_PALABRAS && e.texto.length >= MIN_LETRAS),
  };
  const salida = [];
  let total = 0;
  for (const fuente of FUENTES_LENGUAJE) {
    let deEsta = 0;
    for (const f of porFuente[fuente]) {
      if (deEsta + f.texto.length > TOPE_FUENTE[fuente] || total + f.texto.length > MAX_MATERIAL_LENGUAJE) break;
      deEsta += f.texto.length;
      total += f.texto.length;
      salida.push({ n: salida.length + 1, texto: f.texto, fuente, ...(f.etiqueta ? { etiqueta: f.etiqueta } : {}), ...(f.peso ? { peso: f.peso } : {}) });
    }
  }
  return salida;
}

/** Cuántos comentarios entraron de cada fuente → { pegado, competencia, nota, encuesta, bandeja }. Pura. */
export function cuentaDeFuentes(fragmentos) {
  const c = Object.fromEntries(FUENTES_LENGUAJE.map((f) => [f, 0]));
  for (const f of Array.isArray(fragmentos) ? fragmentos : []) if (f?.fuente in c) c[f.fuente]++;
  return c;
}

// ------------------------------------------------------------
// El pedido a la IA y su lectura
// ------------------------------------------------------------

const ETIQUETA_FUENTE = { competencia: "COMPETENCIA", nota: "de la nota de ahora", encuesta: "encuesta", bandeja: "comentario en redes" };

/** Lo que se le pide a la IA: agrupar las frases EXACTAS por tema. Pura. */
export function pedidoDeLenguaje({ marca = "", fragmentos = [] } = {}) {
  return [
    `Eres investigador de mercado. Lee lo que escriben los clientes de ${marca || "la marca"} (y, marcado COMPETENCIA, lo que escriben clientes de otras marcas o soluciones) y saca las FRASES EXACTAS que sirven para escribir anuncios y contenido con sus mismas palabras.`,
    "",
    "Reglas:",
    "- Cada frase, COPIADA LETRA POR LETRA de un solo comentario: no la corrijas, no la resumas, no la traduzcas ni juntes trozos de dos comentarios. Puede ser un trozo del comentario (de 3 a 25 palabras). La frase que no esté tal cual en el material se descarta.",
    "- Escoge las que tienen emoción, detalles concretos (tiempos, cantidades, situaciones vividas) o la forma en que lo diría alguien que no es vendedor. Nada de frases genéricas («muy bueno», «excelente servicio»).",
    `- Temas: ${TEMAS_LENGUAJE.map((t) => `«${t.id}» (${t.ayuda})`).join("; ")}. Hasta ${MAX_FRASES_TEMA} por tema, la más fuerte primero. Un tema sin frases buenas, vacío: no lo fuerces.`,
    "- Lo marcado COMPETENCIA va a «competencia» (o a «dolor» o «duda» si cuenta el problema), nunca a «elogio».",
    `- «patrones»: hasta ${MAX_PATRONES} observaciones cortas de CÓMO escriben (por ejemplo, si muchos comparan con lo que usaban antes, o cuentan su proceso día a día) y qué formato de anuncio sugieren. Sin nombrar marcas.`,
    "",
    "LO QUE ESCRIBEN (cada línea es un comentario distinto):",
    ...fragmentos.map((f) => `[${f.n}${ETIQUETA_FUENTE[f.fuente] ? ` · ${ETIQUETA_FUENTE[f.fuente]}` : ""}${f.etiqueta ? ` · ${f.etiqueta}` : ""}] ${f.texto}`),
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    `{"temas":{${IDS_TEMA.map((t) => `"${t}":["…"]`).join(",")}},"patrones":["…"]}`,
  ].join("\n");
}

function jsonDe(texto) {
  const t = String(texto ?? "").replace(/```(?:json)?/gi, "");
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini === -1 || fin <= ini) return null;
  try { return JSON.parse(t.slice(ini, fin + 1)); } catch { return null; }
}

/** Una frase larga se corta en una palabra, con «…»: lo que queda sigue siendo exacto. */
function recortar(frase) {
  if (frase.length <= MAX_FRASE) return frase;
  const corte = frase.slice(0, MAX_FRASE - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > MAX_FRASE * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s,;:]+$/, "")}…`;
}

/**
 * La respuesta de la IA, COMPROBADA contra el material. Cada frase tiene que estar tal cual en algún comentario; la que
 * no, se descarta (`descartadas`). Lo que queda es el trozo original del comentario, sin los nombres de `marcas`. Una
 * frase que sólo dicen clientes de la competencia no puede ser un elogio ni un deseo: va a «competencia». La cuenta:
 * cuántos comentarios la dicen (las de la nota de ahora, con la cuenta que traían, sin sumarla dos veces).
 * → { temas: [{ id, nombre, frases: [{ texto, veces }], veces }], patrones, frases, descartadas } | null. Pura.
 */
export function leerLenguaje(texto, { fragmentos = [], marcas = [] } = {}) {
  const d = jsonDe(texto);
  if (!d || typeof d !== "object" || !d.temas || typeof d.temas !== "object") return null;
  const material = (Array.isArray(fragmentos) ? fragmentos : []).map((f) => ({ ...f, plano: plegarConMapa(f.texto) }));
  const vistas = new Set();
  const porTema = Object.fromEntries(IDS_TEMA.map((t) => [t, []]));
  let descartadas = 0;

  for (const tema of IDS_TEMA) {
    const lista = Array.isArray(d.temas[tema]) ? d.temas[tema] : [];
    for (const bruta of lista.slice(0, MAX_FRASES_TEMA * 2)) {
      const aguja = paraBuscar(bruta);
      if (aguja.replace(/[^\p{L}\p{N}]/gu, "").length < MIN_LETRAS || aguja.split(" ").length < MIN_PALABRAS) continue;
      if (vistas.has(aguja)) continue;
      const dondeEsta = material.filter((f) => buscarEntero(f.plano.texto, aguja) >= 0);
      if (!dondeEsta.length) { descartadas++; continue; }
      vistas.add(aguja);
      const primero = dondeEsta[0];
      const i = buscarEntero(primero.plano.texto, aguja);
      const original = String(primero.texto).slice(primero.plano.mapa[i], primero.plano.mapa[i + aguja.length - 1] + 1).replace(/\s+/g, " ").trim();
      const comentarios = dondeEsta.filter((f) => f.fuente !== "nota");
      const deNota = Math.max(0, ...dondeEsta.filter((f) => f.fuente === "nota").map((f) => Number(f.peso) || 1));
      const veces = Math.max(1, comentarios.length, deNota);
      const soloCompetencia = comentarios.length > 0 && comentarios.every((f) => f.fuente === "competencia");
      const destino = soloCompetencia && !["competencia", "dolor", "duda"].includes(tema) ? "competencia" : tema;
      porTema[destino].push({ texto: recortar(quitarMarcas(original, marcas)), veces, ns: comentarios.map((f) => f.n), deNota: comentarios.length ? 0 : deNota });
    }
  }

  const temas = TEMAS_LENGUAJE.map((t) => {
    const frases = porTema[t.id].sort((a, b) => b.veces - a.veces).slice(0, MAX_FRASES_TEMA);
    const comentarios = new Set(frases.flatMap((f) => f.ns));
    const veces = comentarios.size + frases.reduce((s, f) => s + f.deNota, 0);
    return { id: t.id, nombre: t.nombre, frases: frases.map((f) => ({ texto: f.texto, veces: f.veces })), veces };
  }).filter((t) => t.frases.length).sort((a, b) => b.veces - a.veces);

  const patrones = (Array.isArray(d.patrones) ? d.patrones : []).map((p) => corto(quitarMarcas(corto(p, 240), marcas), 220)).filter(Boolean).slice(0, MAX_PATRONES);
  return { temas, patrones, frases: temas.reduce((s, t) => s + t.frases.length, 0), descartadas };
}

// ------------------------------------------------------------
// La nota del cerebro
// ------------------------------------------------------------

/** Cómo usar la nota al escribir (lo pone el código, igual para todos). */
export const PARA_ESCRIBIR = Object.freeze([
  "Usa estas frases tal cual (o casi) en ganchos, titulares y guiones: así hablan sus clientes, no un vendedor.",
  "Lo que odian de otras opciones es lo que el anuncio tiene que resolver. Nunca se nombra a la competencia.",
  "En un anuncio no se afirma algo personal de quien lee («¿Sufres de…?», «tu piel…»): se cuenta como lo dicen otros clientes o como una situación.",
  "Una frase de un cliente no es un testimonio con nombre: para citarla con su nombre hace falta su permiso.",
]);

const fechaLarga = (d) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

function armarNota(temas, patrones, { marca, cuando }) {
  return [
    `# ${TITULO_LENGUAJE}`,
    "",
    `Las frases EXACTAS con las que hablan los clientes${marca ? ` de ${marca}` : ""} (reseñas, comentarios y la encuesta), agrupadas por tema. Entre paréntesis, cuántos comentarios la dicen.${cuando ? ` Actualizada el ${cuando}.` : ""}`,
    "",
    ...temas.flatMap((t) => [
      `## ${t.nombre} · ${t.veces === 1 ? "lo dice 1 comentario" : `lo dicen ${t.veces} comentarios`}`,
      ...t.frases.map((f) => `- «${f.texto}» (${f.veces})`),
      "",
    ]),
    "## Para escribir",
    ...PARA_ESCRIBIR.map((x) => `- ${x}`),
    ...patrones.map((x) => `- ${x}`),
  ].join("\n").trim();
}

/**
 * La nota en Markdown legible (temas con sus frases y su cuenta, y «Para escribir»), armada para caber en
 * `MAX_LENGUAJE`: si no cabe, se quitan primero los patrones y luego las frases que menos se repiten. Pura.
 */
export function notaDeLenguaje(resultado, { marca = "", fecha = null } = {}) {
  let temas = (resultado?.temas ?? []).map((t) => ({ ...t, frases: [...t.frases] }));
  let patrones = [...(resultado?.patrones ?? [])];
  const cuando = fecha ? fechaLarga(new Date(fecha)) : "";
  let texto = armarNota(temas, patrones, { marca, cuando });
  while (texto.length > MAX_LENGUAJE) {
    if (patrones.length) patrones = patrones.slice(0, -1);
    else {
      // La frase que menos se repite del tema que más tiene (a igualdad, la última de ese tema).
      let peor = null;
      for (const t of temas) {
        if (!t.frases.length) continue;
        const ultima = t.frases.at(-1);
        if (!peor || ultima.veces < peor.f.veces || (ultima.veces === peor.f.veces && t.frases.length > peor.t.frases.length)) peor = { t, f: ultima };
      }
      if (!peor) break;
      peor.t.frases.pop();
      temas = temas.filter((t) => t.frases.length);
    }
    texto = armarNota(temas, patrones, { marca, cuando });
  }
  return texto.slice(0, MAX_LENGUAJE);
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Lo que se le dice a la persona al proponer la nota: de dónde salió, cuántas frases quedaron y cuántas se descartaron
 * por no estar tal cual en los comentarios. `r` es la respuesta de POST /api/cerebro/<c>/lenguaje. Pura.
 */
export function describirLenguaje(r) {
  const f = r?.fuentes ?? {};
  const leyo = [
    f.bandeja && plural(f.bandeja, "comentario de la Bandeja", "comentarios de la Bandeja"),
    f.encuesta && `${plural(f.personas || f.encuesta, "respuesta", "respuestas")} de la encuesta`,
    f.pegado && plural(f.pegado, "línea que pegaste", "líneas que pegaste"),
    f.competencia && plural(f.competencia, "reseña de la competencia", "reseñas de la competencia"),
  ].filter(Boolean);
  const lista = leyo.length > 1 ? `${leyo.slice(0, -1).join(", ")} y ${leyo.at(-1)}` : leyo[0] ?? "lo que había";
  const frases = Number(r?.frases) || 0;
  const descartadas = Number(r?.descartadas) || 0;
  return [
    `La IA leyó ${lista}${f.nota ? " (y las frases de la nota de ahora)" : ""}.`,
    `Quedaron ${plural(frases, "frase", "frases")}${descartadas ? `; se ${descartadas === 1 ? "descartó 1 porque no estaba" : `descartaron ${descartadas} porque no estaban`} tal cual en los comentarios` : ""}.`,
    "Revísala y guárdala con ese título: es la que leen las ideas y los textos.",
  ].join(" ");
}

/** Lo que otra IA lee de la nota (el estudio de mercado, los ángulos): sin «Para escribir», con tope. Pura. */
export function lenguajeParaPedido(texto, max = 2500) {
  const t = String(texto ?? "").split(/\n## Para escribir/)[0].replace(/^# .*\n+/, "").trim();
  return t.length > max ? `${t.slice(0, max).replace(/\n[^\n]*$/, "")}\n…` : t;
}
