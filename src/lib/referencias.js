// ============================================================
// Qué se toma de cada imagen de referencia (puro)
//
// Una referencia sin más le dice al modelo «parécete a esto», y el modelo
// copia de más: el producto de otro, sus colores, su texto. La persona
// dice qué le gusta de cada una —el estilo, la composición, el producto,
// la persona, el fondo, la tipografía, o todo— y, si quiere, una nota; el
// pedido lo dice con palabras, imagen por imagen, en el mismo orden en que
// se mandan.
//
// Las FOTOS DEL PRODUCTO (del catálogo) son otra cosa: son el producto real
// y se copian tal cual. Si el producto es de OTRA marca (lo dice el
// catálogo), se respeta su empaque y no se le pone el logo del cliente.
//
// El logo del kit va el último y lo dice su propia línea (kitMarca.js).
// ============================================================

/** Lo que se puede tomar de una referencia, en el orden de los botones. */
export const TOMAS = Object.freeze([
  ["estilo", "Estilo y colores"],
  ["composicion", "Composición"],
  ["producto", "Producto"],
  ["persona", "Persona o pose"],
  ["fondo", "Fondo o lugar"],
  ["tipografia", "Tipografía"],
]);

const QUE = Object.freeze({
  estilo: "su estilo, su luz y sus colores",
  composicion: "su composición y su encuadre",
  producto: "el producto que aparece",
  persona: "la persona o su pose",
  fondo: "el fondo o el lugar",
  tipografia: "la tipografía y cómo va colocado el texto",
});
const IDS = TOMAS.map(([id]) => id);

/** La nota de una referencia: corta y en una línea. */
export const MAX_NOTA = 160;
const nota = (t) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTA).replace(/[.\s]+$/, "");

const enLista = (partes) => (partes.length < 2 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`);

/**
 * La línea de UNA referencia (la n-ésima que se manda), o vacío si no hay nada que decir: sin elegir nada ni nota,
 * el modelo hace lo de siempre. Pura.
 * @param ref { toma?: string[], nota?: string, producto?: { nombre, marca? } }
 */
export function lineaDeReferencia(ref, n, { cliente = "la marca" } = {}) {
  if (ref?.producto?.nombre) {
    const marca = String(ref.producto.marca ?? "").trim();
    return [
      `Imagen de referencia ${n}: es la foto REAL del producto «${ref.producto.nombre}»: cópialo tal cual (forma, etiqueta, marca y colores), sin inventar otro.`,
      marca ? `Es de la marca ${marca}: respeta su empaque y su logo, y no le pongas el logo de ${cliente}.` : "",
      nota(ref.nota) ? `Nota: ${nota(ref.nota)}.` : "",
    ].filter(Boolean).join(" ");
  }
  const toma = (Array.isArray(ref?.toma) ? ref.toma : []).filter((t) => IDS.includes(t));
  const n1 = nota(ref?.nota);
  if (!toma.length && !n1) return "";
  return [
    `Imagen de referencia ${n}:`,
    toma.length ? `toma SÓLO ${enLista(toma.map((t) => QUE[t]))}; lo demás de esa imagen (su producto, su texto, sus logos) no se copia.` : "úsala como referencia.",
    n1 ? `Nota: ${n1}.` : "",
  ].filter(Boolean).join(" ");
}

/** Las líneas de todas las referencias, en el orden en que se mandan. Vacío si ninguna dice nada. Pura. */
export function lineasDeReferencias(refs = [], opciones = {}) {
  return (refs ?? []).map((r, i) => lineaDeReferencia(r, i + 1, opciones)).filter(Boolean).join("\n");
}

/** Para comparar nombres sin tildes ni mayúsculas. */
const normal = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * El producto del catálogo que nombra la idea y cuyas fotos no van todavía de referencia: el que más largo se
 * llame, para que «Sofá cama» gane a «Sofá». Null si ninguno. Pura.
 * @param productos [{ id, nombre, fotos: [clave] }]
 * @param claves    las claves que ya van de referencia
 */
export function productoNombrado(productos = [], idea = "", claves = []) {
  const texto = normal(idea);
  const candidatos = (productos ?? [])
    .filter((p) => p?.fotos?.length && normal(p.nombre).length >= 3 && texto.includes(normal(p.nombre)))
    .filter((p) => !p.fotos.some((f) => claves.includes(f)))
    .sort((a, b) => normal(b.nombre).length - normal(a.nombre).length);
  return candidatos[0] ?? null;
}

/**
 * TODOS los productos del catálogo con fotos que nombra la idea («el kit con Dany Baby y Nateen»), del nombre más largo
 * al más corto; un nombre ya encontrado se quita del texto, así «Sofá cama» no cuenta también como «Sofá». Los que ya
 * van de referencia (`claves`) no se devuelven. Pura.
 */
export function productosNombrados(productos = [], idea = "", claves = []) {
  let texto = normal(idea);
  const fuera = [];
  const ordenados = (productos ?? [])
    .filter((p) => p?.fotos?.length && normal(p.nombre).length >= 3)
    .sort((a, b) => normal(b.nombre).length - normal(a.nombre).length);
  for (const p of ordenados) {
    const nombre = normal(p.nombre);
    if (!texto.includes(nombre)) continue;
    texto = texto.split(nombre).join(" ");
    if (!p.fotos.some((f) => claves.includes(f))) fuera.push(p);
  }
  return fuera;
}
