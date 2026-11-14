// ============================================================
// El DESGLOSE objetivo de un video, toma por toma (puro; también lo importa el Worker)
//
// Un video que funciona (de la competencia, de «Lo mejor», uno propio) se DESCRIBE sin opinar: qué se ve en cada toma,
// cómo está encuadrada, qué hace la cámara, cómo pasa a la siguiente, qué se dice y qué se lee. No propone ni escribe
// pedidos: separa VER de ESCRIBIR. Después, el guion del reel por planos (o el del video animado) puede seguir su FORMA
// —cuántas tomas, el ritmo de los cortes, los tamaños de plano, el orden— con la marca y el producto propios.
//
// Lo VE el motor de video del espacio (Gemini; o Meta por fotogramas, sin audio: las tomas son aproximadas). Lo que se
// puede contar lo cuenta el CÓDIGO, no la IA: cuántas tomas, cuánto dura cada una, la media, si el corte se acelera y
// qué planos y movimientos se repiten. Las palabras de valor que se le escapen a la IA («cinematográfico», «elegante»…)
// se quitan al leer. Es caro en tokens de video: sólo a pedido, y queda guardado en la ficha (`ajustes.deconstruccion`).
//
// Lo usan worker/lib/estudio/deconstructor.js (la ruta y la herramienta de Claude), components/DesgloseVideo.jsx (el
// visor del Estudio), el guion del reel (worker/lib/estudio/reel.js) y el del video animado de «Lo mejor».
// ============================================================

/** Lo más que se guarda: un video de 2 minutos con cortes cada segundo. */
export const MAX_TOMAS = 120;
/** Las tomas que se cuentan una a una en el resumen para el guion (las demás, en una línea). */
export const MAX_TOMAS_RESUMEN = 12;
/** Lo más largo del resumen que va al guion del reel o del video animado. */
export const MAX_RESUMEN = 1800;

/** El vocabulario normalizado (términos de cine; la IA usa el que corresponda sólo si el video lo muestra). */
export const VOCABULARIO = Object.freeze({
  plano: ["gran plano general", "plano general", "plano entero", "plano americano", "plano medio", "plano medio corto", "primer plano", "primerísimo primer plano", "plano detalle", "inserto"],
  angulo: ["altura de ojos", "picado", "contrapicado", "cenital", "nadir", "holandés", "sobre el hombro", "subjetivo", "a ras de suelo"],
  movimiento: ["fijo", "paneo", "tilt", "dolly de acercamiento", "dolly de alejamiento", "travelling lateral", "grúa", "órbita", "seguimiento", "cámara en mano", "estabilizador", "zoom", "barrido rápido", "dron"],
  transicion: ["corte directo", "jump cut", "corte por coincidencia", "corte disimulado", "disolvencia", "fundido a negro", "fundido a blanco", "barrido", "transición por objeto"],
});

/** Cómo se grabó: el nivel de producción que se deduce (siempre con su porqué). */
export const PRODUCCIONES = Object.freeze({
  telefono: "Grabado con un teléfono",
  semiprofesional: "Semiprofesional",
  profesional: "Profesional, con equipo",
  archivo: "Material de archivo o reutilizado",
  animacion: "Animación o gráficos",
});

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
const redondeo = (n) => Math.round(n * 10) / 10;
/** «2,6» (coma decimal, una cifra). */
export const segundosTexto = (n) => String(redondeo(Math.max(0, Number(n) || 0))).replace(".", ",");

// ------------------------------------------------------------
// El pedido
// ------------------------------------------------------------

/** Lo que se le pide al motor que VE el video. `nombre`: el del archivo (sólo para la ficha). Pura. */
export function pedidoDeDeconstruccion({ nombre = "" } = {}) {
  const lista = (clave) => VOCABULARIO[clave].join(", ");
  return [
    `Eres un analista de video. Mira este video${nombre ? ` («${corto(nombre, 80)}»)` : ""} entero, con su imagen y su sonido, y descríbelo TOMA POR TOMA tal como es, con términos de cine y televisión. No diseñas, no propones, no mejoras y no escribes pedidos para otra IA: describes lo que hay. Lo que escribas lo leerá alguien que NO ha visto el video.`,
    "",
    "REGLAS",
    "· Sólo lo que se puede señalar en la imagen o en el audio. Lo que no se ve o no se oye, se dice que no se puede saber; no rellenes huecos.",
    "· Nada de palabras de valor o de gusto (cinematográfico, hermoso, impactante, elegante, premium, épico…), nada de lo que el video te hace sentir, nada de a qué se parece (directores, películas, marcas) y ninguna sugerencia.",
    "· Si está mal iluminado, movido o mal encuadrado, se describe así.",
    "· Una deducción técnica (con qué se grabó, qué lente, qué luz) va marcada: «[inferencia: … porque …]». Si la evidencia es dudosa, «[incierto]».",
    "· La emoción de una persona se describe por lo que hacen su cara y su cuerpo («sonríe y levanta las cejas»), nunca por lo que crees que siente.",
    "· Antes de escribir algo, pregúntate si otra persona que viera el mismo video escribiría lo mismo. Si depende de tu gusto, no va.",
    "",
    "CUÁNDO EMPIEZA UNA TOMA NUEVA",
    "Cuando haría falta otro clip para producirla: un corte (también el disimulado tras un barrido, un objeto que tapa o una zona oscura), un fundido o una disolvencia, un cambio de lugar, de ángulo o de tamaño de plano por corte, un salto (jump cut) o un cambio brusco de luz, de color o de ropa. NO es toma nueva lo que pasa dentro del mismo plano continuo: la cámara que se mueve y reencuadra, la persona que se mueve, un gesto, algo que entra o sale del cuadro. Cuenta TODAS las tomas, en orden, sin juntar ni saltar ninguna, con su segundo de entrada y de salida.",
    "",
    "VOCABULARIO (usa el término que corresponda, sólo si el video lo muestra)",
    `· Tamaño de plano: ${lista("plano")}.`,
    `· Ángulo: ${lista("angulo")}.`,
    `· Movimiento de cámara: ${lista("movimiento")}.`,
    `· Transición: ${lista("transicion")}.`,
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"ficha":{"duracion":0,"proporcion":"9:16","origen":"con qué se grabó [inferencia: … porque …]","produccion":"telefono|semiprofesional|profesional|archivo|animacion","produccionPorque":"los indicios que se ven (lente, ruido, estabilización, luz)","postproduccion":"lo que se nota: color, estabilización, gráficos, texto encima, o «ninguna»"},"recurrentes":{"sujetos":"quién sale (edad aparente, ropa, rasgos visibles), una vez","lugares":"dónde, una vez","color":"colores dominantes, temperatura y saturación","luz":"de dónde viene y cómo es","audio":"música (tipo, tempo, dónde entra), voz, ambiente"},"tomas":[{"desde":0,"hasta":2.1,"plano":"primer plano","angulo":"altura de ojos","movimiento":"cámara en mano","contenido":"qué se ve y qué pasa, en orden","dice":"lo que se dice, palabra por palabra, o vacío","texto":"el texto en pantalla tal cual, o vacío","transicion":"cómo pasa a la siguiente"}],"montaje":{"ritmo":"dónde se acelera o se frena el corte","musica":"si los cortes caen con la música o los golpes"},"noSeSabe":["lo que el video no deja saber"]}',
  ].join("\n");
}

// ------------------------------------------------------------
// La lectura: limpia, ordenada y con lo que cuenta el código
// ------------------------------------------------------------

/** Palabras de valor que no van en una descripción objetiva (con sus variantes de género y número). */
const VALOR = ["cinematogr[áa]fic[oa]s?", "hermos[oa]s?", "impactantes?", "poderos[oa]s?", "elegantes?", "[ée]pic[oa]s?", "premium", "espectacular(?:es)?",
  "impresionantes?", "incre[íi]bles?", "maravillos[oa]s?", "precios[oa]s?", "lujos[oa]s?", "sofisticad[oa]s?", "atractiv[oa]s?", "bonit[oa]s?", "bell[oa]s?"].join("|");
const INTENSIDAD = "(?:muy|tan|bastante|s[úu]per|realmente|sumamente)\\s+";
const NO_LETRA_ANTES = "(?<![\\p{L}\\p{N}])";
const NO_LETRA_DESPUES = "(?![\\p{L}\\p{N}])";
// «luz suave y elegante» → «luz suave»; «un plano muy cinematográfico» → «un plano».
const VALOR_TRAS_Y = new RegExp(`\\s*(?:,|${NO_LETRA_ANTES}[ye]${NO_LETRA_DESPUES})\\s*(?:${INTENSIDAD})?${NO_LETRA_ANTES}(?:${VALOR})${NO_LETRA_DESPUES}`, "giu");
// La «y» de DESPUÉS no se toca: en «abre una caja elegante y sonríe» une dos acciones.
const VALOR_SUELTO = new RegExp(`(?:${NO_LETRA_ANTES}${INTENSIDAD})?${NO_LETRA_ANTES}(?:${VALOR})${NO_LETRA_DESPUES}\\s*`, "giu");

/** El texto sin palabras de valor (lo dice la regla, y lo asegura el código). → { texto, n }. Pura. */
export function sinPalabrasDeValor(texto = "") {
  let n = 0;
  const contar = () => { n++; return ""; };
  const limpio = String(texto ?? "")
    .replace(VALOR_TRAS_Y, contar)
    .replace(VALOR_SUELTO, (m) => { n++; return /\s$/.test(m) ? " " : ""; })
    .replace(/\s{2,}/g, " ").replace(/\s+([.,;:])/g, "$1").replace(/([.,;:]){2,}/g, "$1").trim();
  return { texto: limpio, n };
}

/**
 * ¿Cómo va el corte? Con 4 tomas o más: la duración media de la segunda mitad frente a la de la primera. «acelera» (los
 * cortes se apuran hacia el final), «frena» o «parejo»; «» con muy pocas tomas. Pura.
 */
export function ritmoDeCortes(tomas = []) {
  if (tomas.length < 4) return "";
  const mitad = Math.floor(tomas.length / 2);
  const media = (l) => l.reduce((s, t) => s + (t.hasta - t.desde), 0) / l.length;
  const a = media(tomas.slice(0, mitad));
  const b = media(tomas.slice(mitad));
  if (!(a > 0) || !(b > 0)) return "";
  if (b < a * 0.7) return "acelera";
  if (b > a * 1.4) return "frena";
  return "parejo";
}

const FRASE_RITMO = { acelera: "los cortes se aceleran hacia el final", frena: "los cortes se espacian hacia el final", parejo: "el corte va parejo" };

/** Cuántas veces sale cada valor (lo más repetido primero). → [[valor, n]]. Pura. */
function repeticiones(lista) {
  const m = new Map();
  for (const v of lista) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Lo que cuenta el código de las tomas ya limpias. Pura. */
export function cuentaDeTomas(tomas = [], duracionDicha = 0) {
  const n = tomas.length;
  const duracion = Math.max(numero(duracionDicha) || 0, tomas.at(-1)?.hasta ?? 0);
  const duras = tomas.map((t) => t.hasta - t.desde);
  return {
    tomas: n,
    duracion: redondeo(duracion),
    media: n ? redondeo(duracion / n) : 0,
    masCorta: n ? redondeo(Math.min(...duras)) : 0,
    masLarga: n ? redondeo(Math.max(...duras)) : 0,
    ritmo: ritmoDeCortes(tomas),
    planos: repeticiones(tomas.map((t) => t.plano.toLowerCase())),
    movimientos: repeticiones(tomas.map((t) => t.movimiento.toLowerCase())),
  };
}

/**
 * La respuesta del motor → el desglose limpio, o null (sin JSON o sin ninguna toma). Las tomas, en orden, con sus
 * tiempos contiguos y sin solaparse; lo que cuenta el código en `cuenta`; las palabras de valor quitadas, en `limpiadas`.
 * Pura.
 */
export function leerDeconstruccion(texto) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/gi, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  let d;
  try { d = JSON.parse(t.slice(i, j + 1)); } catch { return null; }
  if (!d || typeof d !== "object") return null;
  let limpiadas = 0;
  const objetivo = (v, n) => {
    const r = sinPalabrasDeValor(corto(v, n));
    limpiadas += r.n;
    return r.texto;
  };
  const ficha = d.ficha && typeof d.ficha === "object" ? d.ficha : {};
  const duracionDicha = Math.max(0, numero(ficha.duracion) || 0);
  const crudas = (Array.isArray(d.tomas) ? d.tomas : [])
    .map((x) => ({ x, desde: numero(x?.desde), hasta: numero(x?.hasta) }))
    .filter((y) => y.x && typeof y.x === "object" && Number.isFinite(y.desde) && y.desde >= 0)
    .sort((a, b) => a.desde - b.desde)
    .slice(0, MAX_TOMAS);
  const tomas = [];
  for (const [k, y] of crudas.entries()) {
    const siguiente = crudas[k + 1]?.desde;
    const desde = Math.max(y.desde, tomas.at(-1)?.hasta ?? 0);
    // Sin salida dicha (o antes de su entrada): hasta donde empieza la siguiente o, la última, hasta el final.
    let hasta = Number.isFinite(y.hasta) && y.hasta > desde ? y.hasta : Number.isFinite(siguiente) && siguiente > desde ? siguiente : Math.max(desde + 0.1, duracionDicha);
    if (Number.isFinite(siguiente) && siguiente > desde && hasta > siguiente) hasta = siguiente;
    if (!(hasta > desde)) hasta = desde + 0.1;
    tomas.push({
      n: tomas.length + 1, desde: redondeo(desde), hasta: redondeo(Math.max(hasta, desde + 0.1)),
      plano: corto(y.x.plano, 40), angulo: corto(y.x.angulo, 40), movimiento: corto(y.x.movimiento, 60),
      contenido: objetivo(y.x.contenido, 500), dice: corto(y.x.dice, 400), texto: corto(y.x.texto, 200), transicion: corto(y.x.transicion, 60),
    });
  }
  for (const t of tomas) t.dura = redondeo(t.hasta - t.desde);
  if (!tomas.length) return null;
  const rec = d.recurrentes && typeof d.recurrentes === "object" ? d.recurrentes : {};
  const mon = d.montaje && typeof d.montaje === "object" ? d.montaje : {};
  // «teléfono», «Telefono [inferencia…]»: la primera palabra, sin tildes, si es una de las de la lista.
  const dicha = String(ficha.produccion ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const produccion = Object.keys(PRODUCCIONES).find((k) => dicha.startsWith(k)) ?? "";
  return {
    ficha: {
      proporcion: corto(ficha.proporcion, 12), origen: objetivo(ficha.origen, 300), produccion,
      produccionPorque: objetivo(ficha.produccionPorque, 400), postproduccion: objetivo(ficha.postproduccion, 300),
    },
    recurrentes: {
      sujetos: objetivo(rec.sujetos, 600), lugares: objetivo(rec.lugares, 400), color: objetivo(rec.color, 300),
      luz: objetivo(rec.luz, 300), audio: objetivo(rec.audio, 400),
    },
    tomas,
    montaje: { ritmo: objetivo(mon.ritmo, 300), musica: objetivo(mon.musica, 300) },
    noSeSabe: (Array.isArray(d.noSeSabe) ? d.noSeSabe : []).map((s) => corto(s, 200)).filter(Boolean).slice(0, 10),
    cuenta: cuentaDeTomas(tomas, duracionDicha),
    limpiadas,
  };
}

// ------------------------------------------------------------
// Para leerlo: la ficha en una frase, el texto entero y el resumen para el guion
// ------------------------------------------------------------

const conVeces = (lista, max = 4) => lista.slice(0, max).map(([v, n]) => (n > 1 ? `${v} (${n})` : v)).join(", ");

/** «9 tomas en 23,4 s: una cada 2,6 s de media; los cortes se aceleran hacia el final.» Pura. */
export function fraseDeLaCuenta(d) {
  const c = d?.cuenta;
  if (!c?.tomas) return "";
  const ritmo = FRASE_RITMO[c.ritmo] ? `; ${FRASE_RITMO[c.ritmo]}` : "";
  return `${c.tomas} toma${c.tomas === 1 ? "" : "s"} en ${segundosTexto(c.duracion)} s: una cada ${segundosTexto(c.media)} s de media${ritmo}.`;
}

/** Una toma en una línea: «3 · 4,2–6,0 s · plano medio · picado · paneo → corte directo». Pura. */
export function cabeceraDeToma(t) {
  return [`${t.n} · ${segundosTexto(t.desde)}–${segundosTexto(t.hasta)} s`, t.plano, t.angulo, t.movimiento].filter(Boolean).join(" · ")
    + (t.transicion ? ` → ${t.transicion}` : "");
}

/** El desglose entero en texto (para copiarlo, para Claude). Pura. */
export function textoDeDeconstruccion(d, { nombre = "" } = {}) {
  if (!d?.tomas?.length) return "";
  const f = d.ficha ?? {};
  const r = d.recurrentes ?? {};
  const c = d.cuenta ?? {};
  return [
    `# Desglose toma por toma${nombre ? ` · ${nombre}` : ""}`,
    "",
    "## Ficha técnica",
    `- ${fraseDeLaCuenta(d)}`,
    c.tomas > 1 ? `- La toma más corta dura ${segundosTexto(c.masCorta)} s y la más larga ${segundosTexto(c.masLarga)} s.` : "",
    f.proporcion ? `- Proporción: ${f.proporcion}.` : "",
    f.origen ? `- Origen: ${f.origen}` : "",
    f.produccion ? `- Producción: ${PRODUCCIONES[f.produccion]}${f.produccionPorque ? ` (${f.produccionPorque})` : ""}.` : "",
    f.postproduccion ? `- Postproducción: ${f.postproduccion}` : "",
    d.porFotogramas ? "- Se vio por fotogramas, sin el audio: las tomas son aproximadas y lo que se dice no se sabe." : "",
    "",
    "## Lo que se repite",
    r.sujetos ? `- Sujetos: ${r.sujetos}` : "",
    r.lugares ? `- Lugares: ${r.lugares}` : "",
    r.color ? `- Color: ${r.color}` : "",
    r.luz ? `- Luz: ${r.luz}` : "",
    r.audio ? `- Audio: ${r.audio}` : "",
    c.planos?.length ? `- Planos: ${conVeces(c.planos, 6)}.` : "",
    c.movimientos?.length ? `- Cámara: ${conVeces(c.movimientos, 6)}.` : "",
    "",
    "## Mapa de secuencia",
    ...d.tomas.flatMap((t) => [
      `${cabeceraDeToma(t)}`,
      t.contenido ? `   ${t.contenido}` : "",
      t.dice ? `   Dice: «${t.dice}»` : "",
      t.texto ? `   En pantalla: «${t.texto}»` : "",
    ]),
    "",
    "## Montaje",
    d.montaje?.ritmo ? `- Ritmo: ${d.montaje.ritmo}` : "",
    d.montaje?.musica ? `- Música y cortes: ${d.montaje.musica}` : "",
    d.noSeSabe?.length ? `\n## Lo que no se puede saber\n${d.noSeSabe.map((s) => `- ${s}`).join("\n")}` : "",
  ].filter((l) => l !== "").join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * El mapa de secuencia RESUMIDO para quien escribe un guion que sigue la forma del video: cuántas tomas, el ritmo de
 * los cortes, los tamaños de plano y los movimientos, y el orden (sin lo que dice ni lo que se lee: eso es suyo).
 * `unidad`: «planos» (el reel) o «escenas» (el video animado); `cuantos`: los que tendrá lo nuevo (si son menos que las
 * tomas, se juntan las seguidas). «» sin desglose. Pura.
 */
export function resumenDeSecuencia(d, { unidad = "planos", cuantos = 0 } = {}) {
  if (!d?.tomas?.length) return "";
  const c = d.cuenta ?? cuentaDeTomas(d.tomas);
  const lista = d.tomas.slice(0, MAX_TOMAS_RESUMEN).map((t) => {
    const como = [t.plano, t.movimiento].filter(Boolean).join(", ");
    return `  ${t.n}. ${segundosTexto(t.desde)}–${segundosTexto(t.hasta)} s${como ? ` · ${como}` : ""}: ${corto(t.contenido, 90)}`;
  });
  const n = Math.round(Number(cuantos) || 0);
  const cabeza = [
    `LA FORMA DE UN VIDEO DE REFERENCIA, TOMA POR TOMA (es de otra marca: sigue su forma —cuántos cortes, su ritmo, los tamaños de plano y los movimientos de cámara, el orden de los momentos—, nunca su marca, sus personas, su texto ni lo que dice):`,
    `· ${fraseDeLaCuenta(d)}`,
    c.planos?.length ? `· Planos: ${conVeces(c.planos)}. Cámara: ${conVeces(c.movimientos) || "—"}.` : "",
    "· Orden:",
  ];
  const cola = [
    d.montaje?.musica ? `· Montaje: ${corto(d.montaje.musica, 200)}` : "",
    d.porFotogramas ? "· (Se vio por fotogramas: las tomas son aproximadas.)" : "",
    n > 0 && n < c.tomas ? `· Lo nuevo tiene ${n} ${unidad}: junta las tomas seguidas en cada uno, en el mismo orden y con el mismo ritmo relativo.` : "",
  ];
  const armar = (l) => {
    const resto = d.tomas.length - l.length;
    return [...cabeza, ...l, resto > 0 ? `  … y ${resto} toma${resto === 1 ? "" : "s"} más con el mismo patrón.` : "", ...cola].filter(Boolean).join("\n");
  };
  let texto = armar(lista);
  // Que quepa: se quitan tomas del final de la lista (la forma general se queda).
  while (texto.length > MAX_RESUMEN && lista.length > 3) {
    lista.pop();
    texto = armar(lista);
  }
  return texto.slice(0, MAX_RESUMEN);
}
