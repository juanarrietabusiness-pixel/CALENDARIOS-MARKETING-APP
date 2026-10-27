// ============================================================
// «Mejorar idea»: la idea de la persona, más clara, y nada más
//
// (Para una IMAGEN ya no: la diseña el director de arte —fichas.js— y vuelve
// su ficha de diseño. Lo de abajo sigue para el VIDEO, que va limpio.)
//
// La persona escribe lo que quiere con sus palabras; la IA la devuelve
// mejor dicha para que el motor de imagen o video la entienda: una o dos
// frases sencillas, con el sujeto, dónde está y cómo se ve. Sin listas,
// sin JSON, sin vocabulario técnico y sin inventar.
//
// Antes esto era «Escribir el prompt»: con la memoria de la marca, las
// referencias y carruseles, escribía párrafos enteros de dirección de arte
// y el motor, con tanto texto, sacaba cualquier cosa. Lo sencillo funciona
// mejor: la idea, más clara.
//
// Lo que sale es TEXTO que la persona revisa antes de pedir nada: no gasta
// en el motor de imagen.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { fichasDeDiseno } from "./fichas.js";

const MAX_IDEA = 2_000;
/** Palabras como mucho de la idea mejorada: más que eso ya es un prompt. */
export const MAX_PALABRAS = 60;

/** Lo que se le pide a la IA, en texto. Pura. */
export function pedidoDeMejora({ idea, tipo = "imagen", cliente = {}, pieza = "" }) {
  const que = tipo === "video" ? "un video corto" : "una imagen";
  const clase = String(pieza ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return [
    `Mejora esta idea para ${que}${cliente.name ? ` de la marca ${cliente.name}` : ""}, para que un generador de ${tipo === "video" ? "video" : "imágenes"} con IA la entienda bien.`,
    ...(clase ? [`Es una pieza de tipo «${clase}»: que la idea cumpla ese propósito, sin cambiar lo que pide la persona.`] : []),
    "",
    "Reglas:",
    `- Devuelve SOLO la idea mejorada: una o dos frases sencillas, de ${MAX_PALABRAS} palabras como mucho (sin contar el texto entre comillas).`,
    "- Di con claridad qué se ve (el sujeto y lo que hace), dónde está y cómo se ve (luz, ambiente, estilo).",
    "- Conserva lo que pide la persona. No inventes productos, logos, colores de marca ni personas que no estén en la idea.",
    "- Si la idea pide un texto dentro de la imagen, ponlo exacto entre comillas, TODAS sus líneas, sin cambiar una letra, y di que va legible y bien jerarquizado (lo primero grande). Si no lo pide, no añadas texto.",
    "- Si trae «Contexto de la publicación», úsalo sólo para entender de qué va: no lo copies ni lo resumas en la imagen.",
    "- Nada de listas, títulos, comillas alrededor de toda la respuesta, explicaciones ni términos técnicos.",
    "",
    `LA IDEA:\n${String(idea).slice(0, MAX_IDEA)}`,
  ].join("\n");
}

/** La respuesta de la IA → la idea, limpia. Pura. */
export function leerIdea(texto) {
  let limpio = String(texto ?? "")
    .replace(/```[a-z]*|```/g, "")
    .replace(/^\s*(idea mejorada|idea|respuesta)\s*:\s*/i, "")
    .trim();
  // Unas comillas que envuelven TODA la respuesta sobran; las de un texto dentro de la imagen, no.
  const m = limpio.match(/^["«“](.*)["»”]$/s);
  if (m && !/["«“»”]/.test(m[1])) limpio = m[1].trim();
  return limpio.replace(/\s*\n+\s*/g, " ");
}

/**
 * Mejora la idea. `datos`: { idea, tipo, pieza?, texto?, productoId?, indicacion?, formato?, proporcion?, sinTexto?,
 * plantilla? } (`pieza`: el nombre del tipo de pieza). Una IMAGEN la diseña el director de arte (fichas.js): devuelve
 * su ficha de diseño, no una frase. Un VIDEO sigue con la mejora corta de siempre (va limpio, sin diseño gráfico).
 */
export async function mejorarIdea(env, acceso, cliente, datos = {}) {
  const idea = String(datos.idea ?? "").trim();
  if (!idea) throw Object.assign(new Error("Escribe primero la idea, con tus palabras."), { estado: 400 });
  if (datos.tipo !== "video") {
    const r = await fichasDeDiseno(env, acceso, cliente, {
      piezas: [{
        n: 1, idea, tipo: datos.pieza, formato: datos.formato, proporcion: datos.proporcion, texto: datos.texto,
        productoId: datos.productoId, indicacion: datos.indicacion, sinTexto: datos.sinTexto === true, plantilla: datos.plantilla,
      }],
    });
    const f = r.fichas[1];
    return { idea: f.ficha, ...(f.plantilla ? { plantilla: f.plantilla } : {}), modelo: r.modelo, aviso: r.aviso, ficha: true };
  }
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeMejora({ idea, tipo: datos.tipo === "video" ? "video" : "imagen", cliente, pieza: datos.pieza }),
    salida: 600,
    funcion: "prompt de imagen",
  });
  const mejorada = leerIdea(r.texto);
  if (!mejorada) throw Object.assign(new Error("La IA no devolvió nada. Inténtalo otra vez."), { estado: 502 });
  return { idea: mejorada, modelo: r.modelo, aviso: r.aviso };
}

// ------------------------------------------------------------
// «Otra versión distinta»: la MISMA información, otra escena
// ------------------------------------------------------------

/** Cuántas versiones se piden de una vez, como mucho. */
export const MAX_VERSIONES = 3;

/** Lo que se le pide a la IA: N escenas distintas que digan lo mismo. Pura. */
export function pedidoDeVersiones({ idea, n = 1, tipo = "imagen", cliente = {} }) {
  const que = tipo === "video" ? "un video corto" : "una imagen";
  return [
    `Esta es la escena de ${que}${cliente.name ? ` de la marca ${cliente.name}` : ""}. Escribe ${n} ${n === 1 ? "versión distinta" : "versiones distintas"} de ella.`,
    "",
    "Reglas:",
    "- Cada versión dice LO MISMO (el mismo producto, el mismo mensaje, el mismo texto exacto si lo hay, entre comillas) con OTRA forma de mostrarlo: otro encuadre, otro escenario, otra composición, otra acción.",
    "- Las versiones son distintas entre sí, no variaciones mínimas.",
    `- Cada una en una o dos frases sencillas, de ${MAX_PALABRAS} palabras como mucho.`,
    "- No inventes productos, logos, colores de marca, precios ni textos que no estén en la escena.",
    `- Responde con ${n === 1 ? "la versión" : `las ${n} versiones`}, una por línea, empezando cada línea por «- ». Nada más.`,
    "",
    `LA ESCENA:\n${String(idea).slice(0, MAX_IDEA)}`,
  ].join("\n");
}

/** La respuesta de la IA → las versiones (como mucho `n`), cada una limpia. Pura. */
export function leerVersiones(texto, n = 1) {
  return String(texto ?? "")
    .replace(/```[a-z]*|```/g, "")
    .split(/\n+/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|versi[oó]n\s*\d+\s*:)\s*/i, "").trim())
    .filter((l) => l.length > 10 && !/^(aqu[ií] (tienes|est[aá]n)|versiones?\s*:)/i.test(l))
    .map((l) => leerIdea(l))
    .filter(Boolean)
    .slice(0, n);
}

/** N escenas distintas con la misma información. `datos`: { idea, n, tipo }. Texto: no gasta en el motor. */
export async function versionesDeIdea(env, acceso, cliente, datos = {}) {
  const idea = String(datos.idea ?? "").trim();
  if (!idea) throw Object.assign(new Error("Esta pieza no tiene escena de la que partir."), { estado: 400 });
  const n = Number(datos.n ?? 1);
  if (!(Number.isInteger(n) && n >= 1 && n <= MAX_VERSIONES)) throw Object.assign(new Error(`De 1 a ${MAX_VERSIONES} versiones.`), { estado: 400 });
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeVersiones({ idea, n, tipo: datos.tipo === "video" ? "video" : "imagen", cliente }),
    salida: 400 * n + 200,
    funcion: "prompt de imagen",
  });
  const versiones = leerVersiones(r.texto, n);
  if (!versiones.length) throw Object.assign(new Error("La IA no devolvió ninguna versión. Inténtalo otra vez."), { estado: 502 });
  return { versiones, modelo: r.modelo, aviso: r.aviso };
}
