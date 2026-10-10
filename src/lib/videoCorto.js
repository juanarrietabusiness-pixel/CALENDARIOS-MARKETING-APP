// ============================================================
// Videos cortos: guiones de 8 y 10 segundos (puro)
//
// Los modelos de video de la agencia hacen piezas de 8 s (Veo por fal.ai) o 10 s (Gemini
// Omni Flash, el «Omni» de Flow; o Kling Omni por Higgsfield). En ese tiempo no
// cabe una historia: cabe UNA idea, en tres tiempos:
//
//   gancho     una acción que para el dedo (los dos primeros segundos);
//   beneficio  el producto o el resultado en acción, con un solo movimiento
//              de cámara;
//   cierre     el mensaje, corto y directo.
//
// Y una advertencia que manda sobre todo lo demás: los modelos de video
// escriben MAL el texto dentro del video. El guion pone como mucho cuatro
// palabras en pantalla, o lo deja «para edición» (CapCut, Canva). El logo,
// igual: mejor en edición que pedírselo al modelo.
//
// Lo usan el Estudio (pantalla) y el Worker (worker/lib/estudio/guionCorto.js).
// ============================================================

import { pilarDe, nombreDePilar, lineasDeContenido } from "./pilares";

/** Los tres tiempos de cada duración, en segundos. */
export const TRAMOS = Object.freeze({
  8: [{ clave: "gancho", desde: 0, hasta: 2 }, { clave: "beneficio", desde: 2, hasta: 6 }, { clave: "cierre", desde: 6, hasta: 8 }],
  10: [{ clave: "gancho", desde: 0, hasta: 2 }, { clave: "beneficio", desde: 2, hasta: 7 }, { clave: "cierre", desde: 7, hasta: 10 }],
});
export const NOMBRE_TRAMO = Object.freeze({ gancho: "Gancho", beneficio: "Beneficio", cierre: "Cierre" });
export const MAX_PALABRAS_PANTALLA = 4;

/**
 * Para qué duración escribir con un modelo y sus ajustes: 10 s si el modelo llega a 10, si no 8 (o lo más que
 * admita, si es menos). Pura.
 * @param modelo  la entrada del catálogo (`ajustes.duration.valores`, o `segundos` fijos).
 */
export function segundosParaModelo(modelo) {
  const valores = (modelo?.ajustes?.duration?.valores ?? []).map(Number).filter((n) => n > 0);
  const max = valores.length ? Math.max(...valores) : Number(modelo?.segundos) || 8;
  return max >= 10 ? 10 : max >= 8 ? 8 : max;
}

/** El valor de duración del modelo que corresponde a esos segundos (como texto, como lo guarda el ajuste). Null si no hay. */
export function ajusteDeDuracion(modelo, segundos) {
  const valores = modelo?.ajustes?.duration?.valores ?? [];
  return valores.includes(String(segundos)) ? String(segundos) : null;
}

const tramosDe = (segundos) => TRAMOS[segundos >= 10 ? 10 : 8];
const recortarPalabras = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, n).join(" ");
const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Lo que se le pide a la IA para un guion corto. Pura. */
export function pedidoDeGuionCorto({ marca, idea = "", segundos = 8, post = null, kit = "", contexto = "", productoLinea = "" }) {
  const tramos = tramosDe(segundos);
  const tipo = post ? lineasDeContenido(post) : "";
  return [
    `Eres director creativo de videos cortos para redes. Escribe el guion de UN video de ${segundos} segundos para ${marca}, para generarlo con IA (un modelo de video que hace una sola toma).`,
    "",
    idea ? `LA IDEA: ${corto(idea, 1200)}` : "LA IDEA: propón una a partir de lo que sabemos de la marca.",
    tipo ? `\n${tipo}` : "",
    productoLinea ? `\nEL PRODUCTO (con su precio exacto): ${productoLinea}` : "",
    kit ? `\nEL ESTILO DE LA MARCA:\n${corto(kit, 1500)}` : "",
    contexto ? `\nLO QUE SABEMOS DE LA MARCA:\n${corto(contexto, 4000)}` : "",
    "",
    "Reglas:",
    `- Tres tiempos: ${tramos.map((t) => `${NOMBRE_TRAMO[t.clave].toLowerCase()} (${t.desde}–${t.hasta} s)`).join(", ")}. Una sola escena continua, sin cortes.`,
    "- El gancho es una ACCIÓN visual que llama la atención en el primer segundo, no un texto.",
    "- Un solo movimiento de cámara, suave (acercamiento, paneo lento o cámara fija). Nada de giros ni efectos.",
    "- Los colores de la marca en la escena (ropa, fondo, objetos), sin que se vea forzado.",
    `- Texto en pantalla: como MUCHO ${MAX_PALABRAS_PANTALLA} palabras, porque los modelos de video escriben mal. Si el mensaje necesita más, va en «textoEdicion» para ponerlo en CapCut o Canva.`,
    "- El logo NO lo dibuja el modelo: va en edición.",
    "- Mensaje corto y directo, en español latino neutro. Nada de precios inventados.",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    `{"escena":"dónde pasa y quién sale, en una frase","camara":"el movimiento","tramos":[${tramos.map((t) => `{"clave":"${t.clave}","accion":"lo que se ve"}`).join(",")}],"textoPantalla":"hasta ${MAX_PALABRAS_PANTALLA} palabras (o vacío)","textoEdicion":"el texto que se añade en edición (o vacío)","sonido":"música o sonido ambiente; voz sólo si hace falta, en una frase","descripcion":"el caption del post, con llamada a la acción y hashtags al final"}`,
  ].filter((x) => x !== "").join("\n");
}

/** La respuesta de la IA → el guion, limpio. Null si no se puede leer. Pura. */
export function leerGuionCorto(texto, segundos = 8) {
  const t = String(texto ?? "").replace(/```(?:json)?/gi, "");
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini === -1 || fin <= ini) return null;
  let d;
  try { d = JSON.parse(t.slice(ini, fin + 1)); } catch { return null; }
  const base = tramosDe(segundos);
  const porClave = new Map((Array.isArray(d.tramos) ? d.tramos : []).map((x) => [x?.clave, corto(x?.accion, 300)]));
  const tramos = base.map((b, i) => ({ ...b, accion: porClave.get(b.clave) || corto(d.tramos?.[i]?.accion, 300) }));
  if (!tramos.some((x) => x.accion)) return null;
  return {
    segundos: segundos >= 10 ? 10 : 8,
    escena: corto(d.escena, 300),
    camara: corto(d.camara, 160),
    tramos,
    textoPantalla: recortarPalabras(d.textoPantalla, MAX_PALABRAS_PANTALLA),
    textoEdicion: corto(d.textoEdicion, 200),
    sonido: corto(d.sonido, 200),
    descripcion: String(d.descripcion ?? "").trim().slice(0, 2200),
  };
}

/**
 * El guion convertido en el pedido al modelo de video: corto, concreto, por segundos. Lo que va en edición NO se
 * le pide al modelo (ni el texto largo ni el logo). Pura.
 */
export function promptDeVideoCorto(guion) {
  if (!guion) return "";
  const partes = [
    `Video vertical de ${guion.segundos} segundos, una sola toma continua, sin cortes.`,
    guion.escena && `Escena: ${guion.escena}.`,
    ...guion.tramos.filter((t) => t.accion).map((t) => `${t.desde}–${t.hasta} s: ${t.accion}.`),
    guion.camara && `Cámara: ${guion.camara}.`,
    guion.textoPantalla ? `Texto en pantalla, exactamente: «${guion.textoPantalla}».` : "Sin texto en pantalla.",
    "Sin logos.",
    guion.sonido && `Sonido: ${guion.sonido}.`,
  ];
  return partes.filter(Boolean).join(" ").replace(/\.\./g, ".");
}

/** Qué tipo de contenido y producto acompañan al guion, para enseñarlo. Pura. */
export function etiquetaDeGuion(post) {
  if (!pilarDe(post?.pilar)) return "";
  return [nombreDePilar(post.pilar, post.pilarSub), post.producto].filter(Boolean).join(" · ");
}
