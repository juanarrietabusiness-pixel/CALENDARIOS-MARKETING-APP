// ============================================================
// El director comercial de los videos (puro)
//
// Lo que se pide casi nunca llega bien escrito («un video del sofá»). En vez de
// depender del pedido, TODO guion de video (Reel IA, recrear un anuncio) lleva
// el CRITERIO COMERCIAL de la agencia, y el modelo razona con él (el
// razonamiento del espacio está siempre encendido: configIA.js). Además, el
// botón «Revisar como director comercial» del Reel IA devuelve la idea mejorada
// y POR QUÉ la cambió, y una persona decide: nunca se cambia a escondidas.
//
// El criterio es editable en Ajustes → Manual de la agencia (`manual.video`,
// dentro del manual de campañas: lib/estratega.js). Vacío, vale el de la casa
// (`MANUAL_VIDEO_BASE`), escrito con palabras propias.
//
// Lo importan el Worker (worker/lib/estudio/director.js, reel.js, mercado.js)
// y la pantalla.
// ============================================================

export const MAX_MANUAL_VIDEO = 4000;

export const MANUAL_VIDEO_BASE = [
  "- Una sola idea por video, que se entienda sin sonido.",
  "- El gancho es VISUAL y va en los primeros 2 segundos: una acción, un antes y un después, algo que no se espera. Nada de logos ni presentaciones al empezar.",
  "- Habla del problema o del deseo de quien lo ve antes que del producto; el producto aparece como la solución, y se ve bien (real, de cerca, en uso).",
  "- Un beneficio concreto y visible, no una lista de características.",
  "- Si hay oferta, precio o garantía, sólo los reales del catálogo; nada inventado (ni reseñas, ni cifras, ni urgencias).",
  "- Ritmo de redes: planos cortos (2 a 3 s), cámara con intención, personas reales y luz natural antes que efectos.",
  "- Cierre con un llamado a la acción claro (escribir por WhatsApp, visitar, pedir) y el producto en pantalla.",
  "- Vertical 9:16, sin texto dentro del video (va limpio), y el tono de la marca en todo.",
].join("\n");

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const largo = (t, n) => String(t ?? "").replace(/\r/g, "").trim().slice(0, n);

/** El criterio que vale: el escrito por la agencia o el de la casa. Pura. */
export const manualDeVideo = (manual) => largo(manual?.video, MAX_MANUAL_VIDEO) || MANUAL_VIDEO_BASE;

/** La línea que va delante en todo guion de video. Pura. */
export const lineaDelDirector = (manual) =>
  `CRITERIO COMERCIAL DE LA AGENCIA (síguelo siempre, por encima de cómo venga escrito el pedido; razona qué conviene a la marca y a lo que se pide):\n${manualDeVideo(manual)}`;

/** El pedido de «Revisar como director comercial»: la idea, mejorada, y qué cambió y por qué. Pura. */
export function pedidoDelDirector({ marca = "la marca", rubro = "", idea = "", formato = "reel", segundos = 10, producto = "", contexto = "", manual = null }) {
  return [
    `Eres el director comercial de una agencia en Panamá. Te traen este pedido de ${formato === "recrear" ? "un video para recrear" : `un video vertical de ${segundos} segundos`} para ${marca}${rubro ? ` (${rubro})` : ""}. Antes de producirlo, razona qué video le conviene de verdad a la marca para vender o crecer, y reescribe la idea para que funcione comercialmente. Respeta la intención de quien lo pidió: mejóralo, no lo cambies por otro.`,
    "",
    `EL PEDIDO: ${corto(idea, 1500)}`,
    producto ? `EL PRODUCTO (precio y oferta EXACTOS): ${corto(producto, 400)}` : "",
    contexto ? `\nLO QUE SABEMOS DE LA MARCA:\n${largo(contexto, 4000)}` : "",
    "",
    lineaDelDirector(manual),
    "",
    "Reglas: español latino neutro; nada de precios, garantías ni testimonios inventados. La idea mejorada, en 2 a 4 frases: qué pasa en el gancho, qué se muestra y cómo cierra.",
    'Responde SOLO con JSON: {"idea":"la idea mejorada","cambios":["lo que cambiaste y por qué, en una frase cada uno (de 2 a 4)"]}',
  ].filter((l) => l !== "").join("\n");
}

/** La respuesta → { idea, cambios: [] }, o null. Pura. */
export function leerDirector(texto) {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  let d;
  try { d = JSON.parse(t.slice(i, j + 1)); } catch { return null; }
  const idea = corto(d?.idea, 1500);
  if (!idea) return null;
  return { idea, cambios: (Array.isArray(d?.cambios) ? d.cambios : []).map((c) => corto(c, 300)).filter(Boolean).slice(0, 5) };
}
