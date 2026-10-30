// ============================================================
// La receta «Video del producto»: 10 a 15 segundos que terminan en el producto REAL y el logo REAL (puro)
//
// Salió de una prueba que funcionó (Baby Caleb, pañales pants, MiniMax H3): la caja y el logo salieron perfectos
// porque NO los dibujó el modelo de video. El video arranca en un primer fotograma y TERMINA en una imagen de cierre
// que ya se hizo con las fotos del catálogo y el logo del kit; el modelo sólo pone el movimiento entre las dos.
//
//   1. El guion (la IA, texto): el primer fotograma, tres tramos (gancho, el producto en uso, cierre), la cámara,
//      la locución EN ESPAÑOL escrita palabra por palabra (si no se escribe, el modelo se inventa una en otro
//      idioma) y la música.
//   2. Los dos fotogramas (imágenes, centavos): el primero SIN logo (si no, el video arrastra un logo deformado); el
//      cierre con las fotos reales del producto y el logo. Se revisan ANTES de pagar el video.
//   3. El video, con imagen inicial y final.
//
// Las reglas del prompt de video son las del método público de Higgsfield (github.com/higgsfield-ai/skills, licencia
// MIT, ver docs/licencias/higgsfield-skills.md), adaptadas: con imagen inicial se describe el MOVIMIENTO y no lo que
// ya se ve, el prompt va corto (los modelos deforman con prompts largos) y se dice lo que sí debe salir.
//
// Lo usan la pantalla (components/FlujoVideoProducto.jsx) y el Worker (worker/lib/estudio/guionCorto.js).
// ============================================================

import { lineasDeContenido } from "./pilares";

/** Lo que dura: el modelo decide cuáles tiene. 15 s es el tope de un clip de MiniMax H3 y de Kling 3.0. */
export const DURACIONES_PRODUCTO = Object.freeze([10, 12, 15]);
/** La voz cabe a este ritmo (lo mismo que el Reel IA). */
export const PALABRAS_POR_SEGUNDO_PRODUCTO = 2.5;
/** Por qué modelo se empieza: MiniMax H3 es el de la prueba que funcionó; luego los que hacen inicio y final. */
export const PREFERIDOS_PRODUCTO = Object.freeze(["minimax-h3-kie", "kling-3-kie", "seedance-2-5-kie", "wan-3-kie", "pixverse-6-kie", "seedance-2-kie"]);
/** Seedance y Wan se inventan la voz (mal, en español): van con música, sin locución (como en el Reel IA). */
export const sinVozEnProducto = (modelo) => /^(seedance|wan)/.test(String(modelo?.id ?? modelo ?? ""));
/** Lo más largo que puede ser el prompt del video: corto a propósito. */
export const MAX_PROMPT_VIDEO_PRODUCTO = 1400;

const corto = (t, n) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** ¿Este modelo de video sirve para la receta? Necesita imagen inicial Y final, y no pedir un video de entrada. */
export const sirveParaProducto = (m) => Boolean(m && m.tipo === "video" && m.inicial && m.final && !m.necesitaVideo);

/** Las duraciones de la receta que admite ese modelo. Sin ajuste de duración, la suya fija si cae en la lista. Pura. */
export function duracionesDe(modelo) {
  const valores = (modelo?.ajustes?.duration?.valores ?? []).map(Number);
  const fijas = valores.length ? valores : [Number(modelo?.segundos) || 0];
  const salida = DURACIONES_PRODUCTO.filter((s) => fijas.includes(s));
  if (salida.length) return salida;
  // Un modelo que no llega a 10 (Veo hace 8): la más larga que tenga, si pasa de 5.
  const max = Math.max(0, ...fijas.filter((s) => s <= 15));
  return max >= 6 ? [max] : [];
}

/** Los tres tramos: el gancho, el producto en uso y el cierre (los últimos ~30 %, que es donde está la imagen final). Pura. */
export function tramosDeProducto(segundos = 10) {
  const s = Math.max(6, Math.min(15, Math.round(Number(segundos) || 10)));
  const gancho = s >= 15 ? 4 : 3;
  const cierre = Math.max(3, Math.round(s * 0.3));
  return [
    { clave: "gancho", nombre: "Gancho", desde: 0, hasta: gancho },
    { clave: "uso", nombre: "El producto en uso", desde: gancho, hasta: s - cierre },
    { clave: "cierre", nombre: "Cierre", desde: s - cierre, hasta: s },
  ];
}

/** Cuántas palabras de locución caben. Pura. */
export const palabrasQueCaben = (segundos = 10) => Math.floor(Number(segundos || 10) * PALABRAS_POR_SEGUNDO_PRODUCTO);

/** La locución recortada a lo que cabe (sin partir una palabra). Pura. */
export function locucionQueCabeEn(texto = "", segundos = 10) {
  const palabras = String(texto ?? "").trim().split(/\s+/).filter(Boolean);
  const max = palabrasQueCaben(segundos);
  return palabras.length <= max ? palabras.join(" ") : `${palabras.slice(0, max).join(" ").replace(/[,;:]$/, "")}…`;
}

/** Lo que se le pide a la IA para el guion. Pura. */
export function pedidoDeVideoProducto({ marca = "la marca", segundos = 10, producto = "", idea = "", kit = "", contexto = "", post = null }) {
  const tramos = tramosDeProducto(segundos);
  const tipo = post ? lineasDeContenido(post) : "";
  return [
    `Eres director creativo de anuncios en video para redes. Escribe el guion de UN video vertical de ${segundos} segundos de ${marca} que promociona UN producto. Lo hace un modelo de video con IA en una sola toma: ARRANCA en un primer fotograma (una imagen que se crea antes) y TERMINA en una imagen de cierre ya hecha con la foto real del producto y el logo.`,
    "",
    `EL PRODUCTO (con su precio exacto): ${corto(producto, 600)}`,
    idea ? `LO QUE SE QUIERE CONTAR: ${corto(idea, 1000)}` : "LO QUE SE QUIERE CONTAR: propón el ángulo que mejor lo venda (un problema que resuelve, un momento de uso, un beneficio).",
    tipo ? `\n${tipo}` : "",
    kit ? `\nEL ESTILO DE LA MARCA:\n${corto(kit, 1200)}` : "",
    contexto ? `\nLO QUE SABEMOS DE LA MARCA:\n${corto(contexto, 3500)}` : "",
    "",
    "Reglas:",
    `- Tres tramos seguidos, en una sola escena continua: ${tramos.map((t) => `${t.nombre.toLowerCase()} (${t.desde}–${t.hasta} s)`).join(", ")}.`,
    "- El primer fotograma es una FOTO de la escena donde empieza la acción (quién y dónde). No lleva el logo ni texto. Si el producto ya sale ahí, dilo con «inicioConProducto»: true.",
    "- Cada tramo describe MOVIMIENTO y acción (qué pasa, qué hace la persona), no repite lo que ya se ve en la imagen.",
    "- El gancho es una acción visual que para el dedo en el primer segundo: un problema reconocible o un momento de la vida real.",
    "- El cierre termina en el producto protagonista sobre un fondo limpio con los colores de la marca: ahí está la imagen final.",
    "- Un solo movimiento de cámara, suave. Nada de giros ni efectos.",
    `- La locución es lo que dice una voz en off, palabra por palabra, en español latino neutro y en tú, de ${palabrasQueCaben(segundos)} palabras como mucho: un gancho, el beneficio y una llamada a la acción. Con el precio sólo si es el del catálogo.`,
    "- Nada de texto en pantalla: los modelos de video escriben mal. Nada inventado: ni precios, ni cifras, ni reseñas.",
    "",
    "Responde SOLO con JSON, sin texto alrededor:",
    `{"inicio":"el primer fotograma, en una o dos frases","inicioConProducto":false,"tramos":[${tramos.map((t) => `{"clave":"${t.clave}","accion":"lo que pasa"}`).join(",")}],"camara":"el movimiento","locucion":"lo que dice la voz en off","musica":"la música, en una frase","descripcion":"el caption del post, con llamada a la acción y hashtags al final"}`,
  ].filter((x) => x !== "").join("\n");
}

/** La respuesta de la IA → el guion, limpio. Null si no se puede leer. Pura. */
export function leerVideoProducto(texto, segundos = 10) {
  const t = String(texto ?? "").replace(/```(?:json)?/gi, "");
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini === -1 || fin <= ini) return null;
  let d;
  try { d = JSON.parse(t.slice(ini, fin + 1)); } catch { return null; }
  const s = Math.max(6, Math.min(15, Math.round(Number(segundos) || 10)));
  const porClave = new Map((Array.isArray(d.tramos) ? d.tramos : []).map((x) => [x?.clave, corto(x?.accion, 300)]));
  const tramos = tramosDeProducto(s).map((b, i) => ({ ...b, accion: porClave.get(b.clave) || corto(d.tramos?.[i]?.accion, 300) }));
  const inicio = corto(d.inicio, 400);
  if (!inicio || !tramos.some((x) => x.accion)) return null;
  return {
    segundos: s,
    inicio,
    inicioConProducto: d.inicioConProducto === true,
    tramos,
    camara: corto(d.camara, 160),
    locucion: locucionQueCabeEn(corto(d.locucion, 600), s),
    musica: corto(d.musica, 200),
    descripcion: String(d.descripcion ?? "").trim().slice(0, 2200),
  };
}

/** La escena del PRIMER fotograma (va por el camino de una pieza, sin logo). Pura. */
export function escenaDelInicio(guion) {
  return [
    `Primer fotograma de un reel vertical 9:16: ${corto(guion?.inicio, 400)}`,
    "Una sola foto realista y natural, la escena lista para empezar a moverse; sin collage ni texto.",
  ].join(" ");
}

/** La escena del CIERRE: el producto real (las fotos van de referencia) y el logo del kit como firma. Pura. */
export function escenaDelCierre({ producto = "", conLogo = true } = {}) {
  const nombre = corto(producto, 120) || "el producto";
  return [
    `Último fotograma (el cierre) de un reel vertical 9:16: ${nombre}, el de las fotos de referencia, IDÉNTICO (mismo empaque, colores y textos, sin redibujarlo), protagonista en el centro del tercio inferior, sobre una superficie limpia con los colores de la marca, con un detalle natural alrededor y una sombra suave.`,
    conLogo ? "El logo de la marca, nítido y de buen tamaño, centrado en el tercio superior, como firma del video." : "",
    "Luz suave, mucho espacio negativo y ningún otro texto.",
  ].filter(Boolean).join(" ");
}

/**
 * El pedido al modelo de video: corto, por segundos y con lo que SÍ debe salir. La voz va escrita entre comillas (si
 * no, el modelo se inventa una en otro idioma); con un modelo que se la inventa mal, sin voz. Pura.
 */
export function promptDeVideoProducto(guion, { conVoz = true } = {}) {
  if (!guion) return "";
  const voz = conVoz && guion.locucion
    ? `Voz en off en español latino neutro, cálida y natural, que dice exactamente: «${guion.locucion}».`
    : "Sin voz ni diálogo.";
  const partes = [
    `Video vertical 9:16 de ${guion.segundos} segundos, una sola toma continua que arranca exactamente en la imagen inicial y termina exactamente en la imagen final.`,
    ...guion.tramos.filter((t) => t.accion).map((t) => `${t.desde}–${t.hasta} s: ${t.accion}.`),
    guion.camara && `Cámara: ${guion.camara}.`,
    voz,
    guion.musica && `Música: ${guion.musica}.`,
    "Movimiento natural y realista. Sin texto ni subtítulos en pantalla; el único logo es el que ya trae la imagen final, tal cual.",
  ];
  return partes.filter(Boolean).join(" ").replace(/\.\./g, ".").slice(0, MAX_PROMPT_VIDEO_PRODUCTO);
}
