// ============================================================
// Colores de marca: del texto del ADN a un hex que la app entienda (puro)
//
// El ADN de un cliente escribe los colores como le viene: «#1E90FF»,
// «#1e9», «rgb(30, 144, 255)», «RGB 30 144 255». La ficha y la página
// de aprobación necesitan UN formato —#RRGGBB—, y un valor raro en un
// `style` no falla: el navegador lo descarta en silencio y la marca sale
// en el azul por defecto.
// ============================================================

const HEX = /#?([0-9a-f]{3}|[0-9a-f]{6})\b/i;
const RGB = /rgb\s*a?\s*\(?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i;

/** «#1e9» → «#11EE99»; «rgb(30,144,255)» → «#1E90FF»; lo demás → "". */
export function normalizarColor(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return "";
  const rgb = RGB.exec(t);
  if (rgb) {
    const partes = rgb.slice(1, 4).map(Number);
    if (partes.some((n) => n > 255)) return "";
    return `#${partes.map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  }
  const hex = HEX.exec(t);
  if (!hex) return "";
  // Sin almohadilla sólo vale si el texto ES el código: «bad» o «cafe» son palabras.
  if (!t.includes("#") && !/^[0-9a-f]{6}$/i.test(t)) return "";
  let h = hex[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h.toUpperCase()}`;
}

const PAPELES = [
  ["principal", /princip|primari|base|dominante|main|primary/i],
  ["secundario", /secund|secondary/i],
  ["acento", /acento|accent|destac|highlight|cta/i],
];

/**
 * De una paleta [{hex, nombre, rol}] a los tres colores de la ficha. Por
 * el papel si lo dice; si no, por orden. Pura.
 */
export function tresColores(paleta = []) {
  const validos = (paleta ?? [])
    .map((c) => ({ ...c, hex: normalizarColor(c?.hex) }))
    .filter((c) => c.hex);
  const salida = { principal: "", secundario: "", acento: "" };
  const usados = new Set();
  for (const [papel, re] of PAPELES) {
    const c = validos.find((x) => !usados.has(x.hex) && re.test(`${x.rol ?? ""} ${x.nombre ?? ""}`));
    if (c) { salida[papel] = c.hex; usados.add(c.hex); }
  }
  const resto = validos.filter((c) => !usados.has(c.hex));
  for (const papel of ["principal", "secundario", "acento"]) {
    if (!salida[papel] && resto.length) salida[papel] = resto.shift().hex;
  }
  return salida;
}

/** Texto claro u oscuro sobre un fondo, para que se lea. «#RRGGBB» → «#FFFFFF» o «#0B1220». */
export function textoSobre(hex) {
  const h = normalizarColor(hex);
  if (!h) return "#FFFFFF";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luz = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luz > 0.4 ? "#0B1220" : "#FFFFFF";
}

/** «#1E90FF» + 0.15 → «rgba(30, 144, 255, 0.15)». Nunca concatenar sufijos a un hex. */
export function conAlfa(hex, alfa) {
  const h = normalizarColor(hex) || "#1E90FF";
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/**
 * Los códigos de color que aparecen en un texto, sin repetir y en orden
 * de aparición. Es la red para cuando la IA no devuelve la paleta pero
 * el manual de marca sí trae los hex escritos.
 */
export function coloresDelTexto(texto, maximo = 6) {
  const vistos = [];
  for (const m of String(texto ?? "").matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgb\s*\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)/gi)) {
    const h = normalizarColor(m[0]);
    if (h && !vistos.includes(h)) vistos.push(h);
    if (vistos.length >= maximo) break;
  }
  return vistos;
}

/**
 * El mejor candidato a logo entre las imágenes del repositorio: que se
 * llame «logo», que no sea un favicon, PNG antes que WebP y JPG, y lo
 * menos anidado. null si no hay ninguno importable (SVG no se importa).
 */
export function elegirLogo(assets = []) {
  const orden = { png: 0, webp: 1, jpg: 2, jpeg: 2 };
  return (assets ?? [])
    .filter((a) => /logo/i.test(a?.name ?? "") && !/favicon|icon-\d/i.test(a.name))
    .map((a) => ({ ...a, ext: a.name.split(".").pop().toLowerCase() }))
    .filter((a) => a.ext in orden)
    .sort((a, b) => orden[a.ext] - orden[b.ext] || a.path.split("/").length - b.path.split("/").length)[0] ?? null;
}
