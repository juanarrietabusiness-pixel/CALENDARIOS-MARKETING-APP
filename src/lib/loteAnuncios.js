// ============================================================
// El lote de anuncios por nivel de consciencia (puro)
//
// Lo que la agencia hacía a mano: para un producto, varias piezas por cada
// nivel de consciencia (Schwartz) —del que no sabe que tiene el problema al
// que sólo necesita el empujón—, con su gancho, el precio EXACTO del
// catálogo y el producto real.
//
//   1. Se escoge el producto, cuántas por nivel, el formato, el tipo de pieza,
//      el modelo y cómo va el texto (plantilla, por defecto, o lo escribe la IA).
//   2. La IA escribe las IDEAS (titular, apoyo y escena) con el estudio de
//      mercado y el cerebro delante: texto, no gasta en el motor.
//   3. Una persona las revisa, quita las que no y ve el costo total ANTES de
//      pedir nada. Sólo entonces se crean, en cola, en una carpeta del lote.
//   4. Cada pieza se lleva al calendario con un botón.
//
// Lo usan la pantalla (EstudioLote.jsx) y el Worker (worker/lib/estudio/lote.js).
// ============================================================

import { NIVELES_CONSCIENCIA, CLAVES_NIVEL, nombreDeNivel } from "./consciencia.js";
import { PLANTILLAS_TEXTO } from "./carrusel.js";

export const POR_NIVEL = 5;
export const MAX_POR_NIVEL = 10;
export const MAX_LOTE = 30;
export const MAX_TITULAR = 60;
export const MAX_APOYO = 110;
export const MAX_ESCENA = 400;

/** Los formatos de un anuncio: la proporción de la imagen y el formato de la publicación. */
export const FORMATOS_LOTE = Object.freeze({
  post: { nombre: "Post 4:5", aspectRatio: "4:5", format: "post" },
  historia: { nombre: "Historia 9:16", aspectRatio: "9:16", format: "historia" },
  cuadrado: { nombre: "Cuadrado 1:1", aspectRatio: "1:1", format: "post" },
});

/** Dónde va el texto en la plantilla, según el formato (en una historia, abajo tapa los botones de Instagram). */
export const plantillaDeFormato = (formato) => (formato === "historia" ? "centro" : "banda");

const corto = (t, max) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max).trim();

/** Cuántas por nivel, limpio: sólo niveles que existen, de 0 a MAX_POR_NIVEL, y el total con tope. Pura. */
export function limpiarCuantas(entrada = {}) {
  const fuera = {};
  let total = 0;
  for (const clave of CLAVES_NIVEL) {
    const n = Math.max(0, Math.min(MAX_POR_NIVEL, Math.floor(Number(entrada?.[clave]) || 0)));
    const cabe = Math.min(n, MAX_LOTE - total);
    if (cabe > 0) { fuera[clave] = cabe; total += cabe; }
  }
  return fuera;
}

export const totalDeCuantas = (cuantas) => Object.values(limpiarCuantas(cuantas)).reduce((a, b) => a + b, 0);

/** Las cuántas por defecto: POR_NIVEL en cada nivel. */
export const cuantasPorDefecto = () => Object.fromEntries(CLAVES_NIVEL.map((c) => [c, POR_NIVEL]));

/**
 * Lo que se le pide a la IA para escribir las ideas. `producto`: la línea del catálogo (con su precio); `estudio`: el
 * estudio de ese producto y lo general (texto); `contexto`: el cerebro para escribir (sin lo interno). Pura.
 */
export function pedidoDeIdeasLote({ marca = "la marca", producto = "", estudio = "", contexto = "", cuantas = {}, formato = "post" }) {
  const c = limpiarCuantas(cuantas);
  const niveles = NIVELES_CONSCIENCIA.filter((n) => c[n.clave]);
  return [
    `Escribe ideas de ANUNCIOS de una sola imagen (${FORMATOS_LOTE[formato]?.nombre ?? "post"}) para ${marca}, para este producto:`,
    producto || "(sin producto concreto: la marca)",
    "",
    "Cuántas por nivel de consciencia del público:",
    ...niveles.map((n) => `- ${n.clave} (${n.nombre}: ${n.ayuda}; se toca por ${n.angulo === "dolor" ? "el dolor" : "la ganancia"}): ${c[n.clave]}`),
    "",
    "Cada idea tiene:",
    `- "titular": el texto grande de la pieza, de 8 palabras como mucho (${MAX_TITULAR} caracteres).`,
    `- "apoyo": una línea corta debajo (${MAX_APOYO} caracteres como mucho). Puede ir vacía.`,
    `- "escena": qué se VE en la imagen, en una o dos frases, SIN texto (el texto va aparte). Con el producto real si aparece.`,
    "",
    "Reglas:",
    "- Cada idea con un ángulo distinto: ni dos titulares parecidos dentro del mismo nivel.",
    "- Inconsciente y problema: habla del dolor o la situación, el producto puede no aparecer todavía. Producto y listo para comprar: el producto, la prueba y la oferta.",
    "- El precio y la oferta, sólo si están en el catálogo y EXACTOS como allí. No inventes precios, descuentos, garantías ni cifras.",
    "- No nombres a la competencia.",
    "",
    estudio ? `ESTUDIO DE MERCADO:\n${String(estudio).slice(0, 9000)}\n` : "",
    contexto ? `LO QUE SE SABE DE LA MARCA:\n${String(contexto).slice(0, 6000)}\n` : "",
    'Responde SOLO con JSON, así: {"ideas":[{"nivel":"inconsciente","titular":"…","apoyo":"…","escena":"…"}]}',
  ].filter((l) => l !== null).join("\n");
}

const deJSON = (texto) => {
  const t = String(texto ?? "").replace(/```[a-z]*|```/g, "");
  const i = t.indexOf("{");
  const j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { return null; }
};

/** La respuesta de la IA → las ideas, como mucho las pedidas por nivel, en el orden de los niveles. Pura. */
export function leerIdeasLote(texto, cuantas = {}) {
  const c = limpiarCuantas(cuantas);
  const d = deJSON(texto);
  const lista = Array.isArray(d?.ideas) ? d.ideas : Array.isArray(d) ? d : [];
  const porNivel = Object.fromEntries(CLAVES_NIVEL.map((k) => [k, []]));
  for (const x of lista) {
    const nivel = String(x?.nivel ?? "").toLowerCase().trim();
    if (!porNivel[nivel] || porNivel[nivel].length >= (c[nivel] ?? 0)) continue;
    const titular = corto(x?.titular, MAX_TITULAR).replace(/^["«“]|["»”]$/g, "");
    const escena = corto(x?.escena, MAX_ESCENA);
    if (!titular || !escena) continue;
    porNivel[nivel].push({ id: `${nivel}-${porNivel[nivel].length + 1}`, nivel, titular, apoyo: corto(x?.apoyo, MAX_APOYO), escena, elegida: true });
  }
  return CLAVES_NIVEL.flatMap((k) => porNivel[k]);
}

/** «Titular\nApoyo»: lo que va escrito en la pieza (y en `textoPieza` de la publicación). Pura. */
export const textoDeIdea = (idea) => [corto(idea?.titular, MAX_TITULAR), corto(idea?.apoyo, MAX_APOYO)].filter(Boolean).join("\n");

/**
 * La escena del pedido de UNA pieza del lote: lo que se ve, el nivel (en palabras que entiende un motor) y el texto.
 * Con `modo: "ia"` el motor escribe el texto EXACTO; con «plantilla», deja el hueco y el texto se pone encima después.
 * Lo demás (tipo de pieza, referencias, marca, logo) lo añade `pedidoConMarca`. Pura.
 */
export function escenaDeAnuncio(idea, { modo = "plantilla", formato = "post" } = {}) {
  const zona = PLANTILLAS_TEXTO[plantillaDeFormato(formato)]?.zona ?? PLANTILLAS_TEXTO.banda.zona;
  const lineas = textoDeIdea(idea).split("\n").map((l) => `"${l.replace(/["“”«»]/g, "")}"`);
  return [
    corto(idea?.escena, MAX_ESCENA),
    modo === "ia"
      ? `Texto en la imagen, EXACTO, legible y bien jerarquizado (lo primero grande): ${lineas.join(" / ")}. Ningún otro texto.`
      : `NO escribas ningún texto, letra ni número en la imagen: el texto se pone después. Deja ${zona} limpio y despejado, con buen contraste.`,
  ].filter(Boolean).join(" ");
}

/** El nombre de la carpeta del lote en la galería. Pura. */
export function nombreCarpetaLote(producto = "", fecha = new Date()) {
  const dia = fecha.toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" }).replace(/\./g, "");
  return corto(`Lote ${producto || "anuncios"} · ${dia}`, 40);
}

/**
 * La publicación que sale de una pieza del lote, lista para meterla en un día: un anuncio (tipo de contenido), con su
 * nivel, su producto, el texto de la pieza y la imagen. Pendiente: la ve el cliente. Pura.
 */
export function publicacionDeAnuncio({ id, idea, archivo, formato = "post", producto = null }) {
  return {
    id,
    format: FORMATOS_LOTE[formato]?.format ?? "post",
    title: idea.titular,
    idea: idea.escena,
    textoPieza: textoDeIdea(idea),
    pilar: "anuncio",
    nivel: idea.nivel,
    ...(producto ? { productoId: producto.id, producto: producto.nombre } : {}),
    status: "pending",
    medios: [{ src: archivo.src, tipo: "imagen", ...(archivo.ancho && archivo.alto ? { ancho: archivo.ancho, alto: archivo.alto } : {}) }],
  };
}

/** «Inconsciente · 5», para los títulos de cada grupo. Pura. */
export const tituloDeNivel = (clave, n) => `${nombreDeNivel(clave)} · ${n}`;
