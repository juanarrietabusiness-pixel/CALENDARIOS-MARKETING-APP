// ============================================================
// Preparar el kit desde un MOODBOARD (pura)
//
// «Preparar con IA» lee el CEREBRO del cliente: lo que está escrito de la marca. Muchas veces lo que la marca quiere
// no está escrito: está en unas imágenes que le gustan (de su galería, o de otras cuentas subidas a la galería). Con
// «Preparar desde imágenes» se escogen de 3 a 10 y la IA las MIRA juntas y propone lo que tienen en común: el estilo,
// la luz, la paleta con el papel de cada color, las referencias de estilo (genéricas) y lo que nunca aparece.
//
// No guarda nada: la propuesta se funde en el formulario del kit como la de «Preparar con IA» y una persona la revisa
// y guarda. A diferencia de aquella, sólo toca lo VISUAL (`fundirMoodboard`): los presets por tipo, la tipografía, el
// logo, las reglas y todo lo demás se quedan como estaban.
// ============================================================

import { limpiarKit, textoPaleta } from "./kitMarca.js";
import { anclasUsables } from "./anclasEstilo.js";

/** De cuántas imágenes se prepara: con menos no hay «lo que tienen en común»; con más, cada una pesa poco. */
export const MIN_MOODBOARD = 3;
export const MAX_MOODBOARD = 10;

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Lo que se le pide a la IA (las imágenes van DELANTE, aparte). `actual`: el kit guardado (si ya tiene paleta, se
 * conserva salvo que las imágenes la contradigan). `ficha`: lo que se sabe del cliente. Pura.
 */
export function pedidoDeKitDesdeImagenes({ marca = "la marca", rubro = "", n = 0, actual = null, ficha = "" }) {
  const k = limpiarKit(actual);
  const yaTiene = [
    k.paleta.length ? `Paleta: ${textoPaleta(k.paleta)}` : "",
    k.estilo ? `Estilo: ${k.estilo}` : "",
    k.luz ? `Luz: ${k.luz}` : "",
  ].filter(Boolean);
  return [
    `Eres director de arte de una agencia en Panamá. ${n === 1 ? "La imagen de arriba es" : `Las ${n} imágenes de arriba son`} el MOODBOARD de la marca ${marca}${rubro ? ` (${rubro})` : ""}: imágenes que le gustan, suyas o de otras cuentas. No importa de quién son; importa lo que tienen en COMÚN.`,
    "Míralas juntas y saca su ADN visual: lo que se repite en casi todas (la luz, el color, el encuadre, la textura, el ambiente), no lo que sólo tiene una.",
    ficha ? `\nLO QUE SE SABE DE LA MARCA:\n${corto(ficha, 1500)}` : "",
    yaTiene.length ? `\nLO QUE YA TIENE SU KIT:\n${yaTiene.join("\n")}` : "",
    "",
    "Reglas:",
    "- «estilo»: cómo se ven y se sienten estas imágenes, en una o dos frases concretas (nada de «moderno», «profesional» ni «de alta calidad»).",
    "- «luz»: de dónde viene, cómo es (dura, suave, difusa) y si es cálida, neutra o fría.",
    "- «paleta»: de 3 a 6 colores que dominan en el conjunto, con su código hex aproximado y su papel (dominante, acento, fondo, texto). Si el kit YA tiene paleta y las imágenes no la contradicen, devuélvela vacía (se queda la suya); si la contradicen, propón la nueva y dilo en «dudas».",
    "- «anclas»: de 2 a 4 referencias de estilo que describen el conjunto (un tipo de película o de revelado, una época, un tipo de publicación, un movimiento artístico, una técnica de luz), de 3 a 10 palabras cada una. SIEMPRE genéricas: nunca nombres de artistas, fotógrafos, personas ni marcas (tampoco marcas de película fotográfica), aunque una imagen te los recuerde.",
    "- «evitar»: lo que NUNCA aparece en estas imágenes y desentonaría (colores, recursos, acabados), en una frase.",
    "- Es el estilo, no el contenido: no describas ninguna imagen en concreto ni tomes sus textos, sus logos ni sus productos.",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    '{"estilo":"…","luz":"…","paleta":[{"hex":"#RRGGBB","nombre":"…","rol":"…"}],"anclas":["…"],"evitar":"…","dudas":"lo que no estaba claro, en una frase (o vacío)"}',
  ].filter((l) => l !== "").join("\n");
}

/**
 * La respuesta → { kit (sólo lo visual: estilo, luz, paleta, anclas, evitar), dudas }, o null si no hay JSON. Las
 * referencias que parecen un nombre propio no se proponen. Pura.
 */
export function leerKitDesdeImagenes(texto) {
  const m = String(texto ?? "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let d;
  try { d = JSON.parse(m[0]); } catch { return null; }
  const k = limpiarKit({ estilo: d?.estilo, luz: d?.luz, paleta: d?.paleta, evitar: d?.evitar, anclas: anclasUsables(d?.anclas) });
  const kit = { estilo: k.estilo, luz: k.luz, paleta: k.paleta, evitar: k.evitar, ...(k.anclas ? { anclas: k.anclas } : {}) };
  if (!kit.estilo && !kit.luz && !kit.paleta.length && !kit.evitar && !kit.anclas) return null;
  return { kit, dudas: corto(d?.dudas, 300) };
}

/**
 * Lo que propone el moodboard sobre lo guardado: SÓLO lo visual (estilo, luz, paleta, referencias de estilo, «nunca»)
 * y sólo lo que trae; todo lo demás del kit (presets, tipografía, logo, reglas, plantillas, personajes, la voz…) se
 * queda como estaba. Pura.
 */
export function fundirMoodboard(guardado, propuesto) {
  const antes = limpiarKit(guardado);
  const p = propuesto ?? {};
  const paleta = limpiarKit({ paleta: p.paleta }).paleta;
  const anclas = anclasUsables(p.anclas);
  return limpiarKit({
    ...antes,
    estilo: corto(p.estilo, 300) || antes.estilo,
    luz: corto(p.luz, 200) || antes.luz,
    evitar: corto(p.evitar, 400) || antes.evitar,
    paleta: paleta.length ? paleta : antes.paleta,
    anclas: anclas.length ? anclas : antes.anclas,
  });
}
