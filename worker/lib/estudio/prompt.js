// ============================================================
// «Mejorar idea»: la idea de la persona, más clara, y nada más
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

const MAX_IDEA = 2_000;
/** Palabras como mucho de la idea mejorada: más que eso ya es un prompt. */
export const MAX_PALABRAS = 60;

/** Lo que se le pide a la IA, en texto. Pura. */
export function pedidoDeMejora({ idea, tipo = "imagen", cliente = {} }) {
  const que = tipo === "video" ? "un video corto" : "una imagen";
  return [
    `Mejora esta idea para ${que}${cliente.name ? ` de la marca ${cliente.name}` : ""}, para que un generador de ${tipo === "video" ? "video" : "imágenes"} con IA la entienda bien.`,
    "",
    "Reglas:",
    `- Devuelve SOLO la idea mejorada: una o dos frases sencillas, de ${MAX_PALABRAS} palabras como mucho.`,
    "- Di con claridad qué se ve (el sujeto y lo que hace), dónde está y cómo se ve (luz, ambiente, estilo).",
    "- Conserva lo que pide la persona. No inventes productos, logos, colores de marca ni personas que no estén en la idea.",
    "- Si la idea pide un texto dentro de la imagen, ponlo exacto entre comillas. Si no lo pide, no añadas texto.",
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

/** Mejora la idea. `datos`: { idea, tipo }. */
export async function mejorarIdea(env, acceso, cliente, datos = {}) {
  const idea = String(datos.idea ?? "").trim();
  if (!idea) throw Object.assign(new Error("Escribe primero la idea, con tus palabras."), { estado: 400 });
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeMejora({ idea, tipo: datos.tipo === "video" ? "video" : "imagen", cliente }),
    salida: 600,
    funcion: "prompt de imagen",
  });
  const mejorada = leerIdea(r.texto);
  if (!mejorada) throw Object.assign(new Error("La IA no devolvió nada. Inténtalo otra vez."), { estado: 502 });
  return { idea: mejorada, modelo: r.modelo, aviso: r.aviso };
}
