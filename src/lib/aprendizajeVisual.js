// ============================================================
// Lo que el cerebro aprende de lo que la agencia elige en el Estudio (puro)
//
// «Me gusta» (la estrella de antes) y la papelera son señales: lo que gusta
// enseña cómo se ve bien esta marca, y lo descartado, qué no repetir. Una IA
// MIRA esas imágenes con su pedido al lado y propone reglas visuales cortas
// —«fondos claros con luz natural», «nada de texto en la parte de arriba»—, y
// una persona decide cuáles entran al kit de marca (`kit.aprendido`), que va
// en TODA pieza.
//
// LAS GUARDAS, como las reglas de texto (worker/lib/cerebro/proponer.js):
//   1. Una regla necesita DOS imágenes que la respalden, y al menos una que
//      guste: una sola imagen es un gusto, no una regla. Lo comprueba el
//      código, no se le pide a la IA que se acuerde.
//   2. La IA no puede citar lo que no vio: el respaldo son números de las
//      imágenes que se le mandaron, y uno inventado no cuenta.
//   3. Lo descartado pesa menos: a la papelera se manda también por orden,
//      por repetida o por un error del motor. Sólo confirma un patrón.
//   4. No se propone lo que el kit ya dice.
//
// Lo que toca la base y la IA, en worker/lib/estudio/aprender.js.
// ============================================================

/** Reglas aprendidas que caben en el kit (van en cada pieza: pocas y cortas). */
export const MAX_APRENDIDO = 10;
export const MAX_TEXTO_REGLA = 160;
/** Cuántas imágenes se le enseñan a la IA de cada lado, y lo mínimo para pedir. */
export const MAX_GUSTAN = 8;
export const MAX_DESCARTADAS = 4;
export const MIN_GUSTAN = 3;

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).replace(/[.\s]+$/, "");
const normal = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();

/** Las reglas aprendidas guardadas en el kit, limpias: [{ texto, tipo: "gusta" | "evitar" }]. Pura. */
export function limpiarAprendido(lista) {
  const fuera = [];
  for (const r of Array.isArray(lista) ? lista : []) {
    const texto = corto(r?.texto, MAX_TEXTO_REGLA);
    if (texto.length < 4 || fuera.some((x) => normal(x.texto) === normal(texto))) continue;
    fuera.push({ texto, tipo: r?.tipo === "evitar" ? "evitar" : "gusta" });
  }
  return fuera.slice(0, MAX_APRENDIDO);
}

/** Lo aprendido como lo lee el motor, dentro del bloque de la marca. Vacío si no hay. Pura. */
export function lineasAprendidas(lista) {
  const r = limpiarAprendido(lista);
  const gusta = r.filter((x) => x.tipo === "gusta").map((x) => x.texto);
  const evitar = r.filter((x) => x.tipo === "evitar").map((x) => x.texto);
  return [
    gusta.length ? `Lo que funciona en esta marca: ${gusta.join("; ")}.` : "",
    evitar.length ? `Evita: ${evitar.join("; ")}.` : "",
  ].filter(Boolean).join(" ");
}

/** ¿Hay con qué pedir? Devuelve el motivo si no. Pura. */
export function faltaParaAprender({ gustan = 0 } = {}) {
  if (gustan >= MIN_GUSTAN) return "";
  return `Marca al menos ${MIN_GUSTAN} imágenes con «Me gusta» en el Estudio (llevas ${gustan}).`;
}

/**
 * Lo que se le pide a la IA, en texto (las imágenes van delante, numeradas G1… y D1…). `gustan` y `descartadas`:
 * [{ prompt }] en el mismo orden que las imágenes. Pura.
 */
export function pedidoDeAprendizaje({ marca = "la marca", kit = {}, gustan = [], descartadas = [] }) {
  const escena = (p) => corto(String(p ?? "").match(/(?:^|\n\n)Escena: ([\s\S]*?)(?:\n\n|$)/)?.[1] ?? p, 200);
  const yaDice = [kit.estilo && `estilo: ${kit.estilo}`, kit.luz && `luz: ${kit.luz}`, kit.evitar && `nunca: ${kit.evitar}`,
    ...limpiarAprendido(kit.aprendido).map((r) => `${r.tipo === "evitar" ? "evita" : "funciona"}: ${r.texto}`)].filter(Boolean);
  return [
    `Estas son imágenes creadas para la marca ${marca}. Las marcadas G (G1, G2…) le GUSTARON a la agencia; las marcadas D (D1, D2…) las mandó a la papelera.`,
    "",
    "Propón reglas VISUALES cortas que expliquen qué tienen en común las que gustan (y, si se ve claro, qué no repetir de las descartadas), para que las próximas imágenes salgan así.",
    "",
    "Reglas:",
    "- Sólo lo que se VE: composición, encuadre, luz, fondo, colores, estilo, personas, cómo va el texto. Nada del producto ni del mensaje.",
    "- Cada regla tiene que verse en DOS imágenes o más, y al menos una G. Cita cuáles.",
    "- Lo descartado pudo irse a la papelera por otros motivos (repetida, error): úsalo sólo para confirmar un patrón.",
    `- Cada regla, de ${MAX_TEXTO_REGLA} caracteres como mucho, en una frase que se pueda pegar en un pedido de imagen.`,
    "- No repitas lo que el kit ya dice.",
    "- Como mucho 5 reglas. Si no hay un patrón claro, no inventes: responde «NINGUNA».",
    "",
    yaDice.length ? `EL KIT YA DICE:\n${yaDice.map((t) => `· ${t}`).join("\n")}\n` : "",
    "LO QUE SE PIDIÓ EN CADA UNA:",
    ...gustan.map((g, i) => `G${i + 1}: ${escena(g.prompt) || "(subida a mano)"}`),
    ...descartadas.map((d, i) => `D${i + 1}: ${escena(d.prompt) || "(subida a mano)"}`),
    "",
    "Responde una regla por línea, así (nada más):",
    "GUSTA | la regla | G1, G3",
    "EVITAR | la regla | D1, G2, G4",
  ].join("\n");
}

/**
 * La respuesta de la IA → las reglas que pasan las guardas: [{ texto, tipo, respaldo: ["G1", …] }]. `gustan` y
 * `descartadas`: cuántas imágenes se mandaron de cada lado; `kit`: lo que ya dice. Pura.
 */
export function leerAprendizaje(texto, { gustan = 0, descartadas = 0, kit = {} } = {}) {
  const ya = [kit.estilo, kit.luz, kit.evitar, ...limpiarAprendido(kit.aprendido).map((r) => r.texto)].filter(Boolean).map(normal);
  const fuera = [];
  for (const linea of String(texto ?? "").split(/\n+/)) {
    const m = linea.replace(/^[\s\-*•]+/, "").match(/^(GUSTA|EVITAR)\s*\|\s*(.+?)\s*\|\s*(.+)$/i);
    if (!m) continue;
    const texto1 = corto(m[2], MAX_TEXTO_REGLA);
    const respaldo = [...new Set((m[3].toUpperCase().match(/[GD]\d+/g) ?? []))]
      .filter((r) => {
        const n = Number(r.slice(1));
        return n >= 1 && n <= (r[0] === "G" ? gustan : descartadas);
      });
    if (respaldo.length < 2 || !respaldo.some((r) => r[0] === "G")) continue;
    if (texto1.length < 4 || ya.includes(normal(texto1)) || fuera.some((x) => normal(x.texto) === normal(texto1))) continue;
    fuera.push({ texto: texto1, tipo: m[1].toUpperCase() === "EVITAR" ? "evitar" : "gusta", respaldo });
  }
  return fuera.slice(0, 5);
}

/** «Basada en 3 que te gustaron y 1 descartada». Pura. */
export function textoDeRespaldoVisual(respaldo = []) {
  const g = respaldo.filter((r) => r[0] === "G").length;
  const d = respaldo.length - g;
  return [g ? `${g} que ${g === 1 ? "te gustó" : "te gustaron"}` : "", d ? `${d} descartada${d === 1 ? "" : "s"}` : ""].filter(Boolean).join(" y ");
}

/** Las imágenes que gustan para usarlas de referencia de estilo: las últimas, que no estén ya ni se hayan perdido. Pura. */
export function deMisGustos(archivos = [], { yaPuestas = [], perdidos = new Set(), cuantas = 2 } = {}) {
  return (archivos ?? [])
    .filter((a) => a.favorito && a.tipo === "imagen" && !a.borradoAt && !perdidos.has(a.id) && !yaPuestas.includes(a.clave))
    .sort((a, b) => String(b.creado ?? "").localeCompare(String(a.creado ?? "")))
    .slice(0, Math.max(0, cuantas))
    .map((a) => ({ ...a, toma: ["estilo"] }));
}
