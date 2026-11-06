// ============================================================
// El SEMÁFORO de las 7 maletas, por producto (puro)
//
// El curso de campañas pide tener respondidas las 7 maletas (público,
// problema, solución, diferenciales, testimonios, objeciones y garantía)
// antes de anunciar: si falta una, no se lanza. Aquí cada maleta de un
// producto del estudio de mercado sale en verde (escrita y concreta), ámbar
// (escrita pero muy corta o genérica: «buena calidad», «excelente servicio»)
// o rojo (vacía, o dice que no hay). El producto entero toma el peor color.
//
// Testimonios y garantía sólo los puede dar el cliente (`delCliente`): para
// esas, `tareaParaElCliente` arma la tarea con el mensaje listo para
// mandarle («Pedírselo al cliente»).
//
// Lo leen el estudio de mercado (por producto), Marca → Cerebro (resumen) y
// el plan de campañas (`maletasQueFaltan`). Son reglas: no cuestan nada.
// ============================================================

import { ELEMENTOS_MERCADO, limpiarEstudio, productosActivos } from "./estudioMercado.js";

/** Por debajo de esto, una maleta escrita es «muy corta» (ámbar). */
export const MIN_PALABRAS_MALETA = 6;

/** Qué hacer con cada maleta que no está en verde: el arreglo, dicho para quien lo arregla. */
const ARREGLO = Object.freeze({
  publico: "Di quién compra: edad, género, dónde vive, a qué se dedica y su poder de compra.",
  problema: "Escoge el problema más importante y dilo con las palabras del cliente.",
  solucion: "Explica cómo el producto resuelve ESE problema, en concreto.",
  diferenciales: "Lo que hace mejor que la competencia, concreto: material, proceso, tiempo, experiencia.",
  testimonios: "Pídele al cliente 2 o 3 casos reales (con su nombre, su foto o captura y lo que dijeron).",
  objeciones: "Los «peros» antes de comprar (pago, envío, dudas) y cómo se responden.",
  garantia: "Pídele al cliente qué garantía ofrece: qué cubre, por cuánto tiempo y cómo se pide.",
});

/** Lo que se le pide al cliente por cada maleta suya, para el mensaje. */
const PEDIDO_AL_CLIENTE = Object.freeze({
  testimonios: "2 o 3 testimonios reales de clientes (una captura del mensaje o la reseña, su nombre y, si se puede, una foto con el producto)",
  garantia: "qué garantía ofrecen: qué cubre, por cuánto tiempo y cómo se pide (si hoy no hay ninguna, podemos pensar una juntos)",
});

// Frases de relleno: con sólo esto, la maleta no dice nada que la distinga.
const RELLENO = [
  /\b(muy |la mejor |buena |alta |excelente |gran )?calidad\b/g, /\b(buen|excelente|el mejor|mejor) (servicio|atenci[oó]n|precio)\b/g,
  /\batenci[oó]n personalizada\b/g, /\bprecios? (accesibles?|competitivos?|bajos?|justos?)\b/g, /\b(los|las) mejores\b/g,
  /\bprofesionalismo\b/g, /\bcompromiso\b/g, /\bconfianza\b/g, /\bexperiencia\b/g, /\binnovaci[oó]n\b/g, /\bresponsabilidad\b/g,
  /\bclientes? satisfechos?\b/g, /\bsatisfacci[oó]n garantizada\b/g, /\b(somos|son) (los|las) mejores\b/g,
];
const VACIAS = new Set(["para", "como", "pero", "porque", "sobre", "entre", "desde", "hasta", "este", "esta", "estos", "estas", "todo", "toda",
  "todos", "todas", "cada", "otro", "otra", "más", "mas", "muy", "también", "tambien", "nuestro", "nuestra", "nuestros", "nuestras", "ofrecemos",
  "tenemos", "brindamos", "contamos", "siempre", "donde", "cuando", "producto", "productos", "servicio", "servicios", "cliente", "clientes", "marca"]);
// Lo que dice, con todas sus letras, que la maleta no está. Sólo en un texto corto: «No hay quien lave muebles a
// domicilio en la ciudad…» es un problema bien escrito, no una maleta vacía.
const DICE_QUE_NO = /^\s*(no (hay|tiene|tenemos|ofrece|ofrecen|existe|se sabe)\b|sin (testimonios|garant[ií]as?|datos|informaci[oó]n)\b|ningun[oa]?\s*[.!]?\s*$|pendiente\b|por (definir|confirmar)\b|faltan? (confirmar|definir|pedir|el dato|datos|informaci)|n\/?a\s*$|[-—…?.]+\s*$)/i;
const CORTO_PARA_NEGAR = 12;

const palabras = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-zñ0-9]+/g) ?? [];

/** ¿El texto es sólo relleno? Lo que queda sin las frases genéricas tiene menos de 4 palabras con contenido. Pura. */
export function esGenerico(texto) {
  let t = String(texto ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const r of RELLENO) t = t.replace(r, " ");
  return palabras(t).filter((p) => p.length >= 4 && !VACIAS.has(p)).length < 4;
}

/**
 * El color de UNA maleta: { clave, titulo, estado: "verde" | "ambar" | "rojo", motivo, arreglo, delCliente }. Las
 * objeciones también cuentan en verde con dos o más objeciones respondidas en el estudio (`objeciones`). Pura.
 */
export function estadoDeMaleta(clave, texto, { objeciones = [] } = {}) {
  const el = ELEMENTOS_MERCADO.find((e) => e.clave === clave);
  const base = { clave, titulo: el?.titulo ?? clave, arreglo: ARREGLO[clave] ?? "", delCliente: Boolean(el?.delCliente) };
  const t = String(texto ?? "").trim();
  const respondidas = (Array.isArray(objeciones) ? objeciones : []).filter((o) => o?.objecion && o?.respuesta).length;
  if (clave === "objeciones" && respondidas >= 2) return { ...base, estado: "verde", motivo: `${respondidas} objeciones con su respuesta.`, arreglo: "" };
  if (!t) return { ...base, estado: "rojo", motivo: "Vacía." };
  const n = palabras(t).length;
  if (n < CORTO_PARA_NEGAR && DICE_QUE_NO.test(t)) return { ...base, estado: "rojo", motivo: "Dice que todavía no hay." };
  if (n < MIN_PALABRAS_MALETA) return { ...base, estado: "ambar", motivo: "Muy corta." };
  if (esGenerico(t)) return { ...base, estado: "ambar", motivo: "Muy general: no dice nada que la distinga." };
  return { ...base, estado: "verde", motivo: "Escrita y concreta.", arreglo: "" };
}

const PEOR = { verde: 0, ambar: 1, rojo: 2 };
const peor = (lista) => lista.reduce((m, x) => (PEOR[x.estado] > PEOR[m] ? x.estado : m), "verde");

/**
 * El semáforo de un producto del estudio (ya limpio o no): las siete en orden, su color, las que faltan (rojo), las
 * flojas (ámbar), si se puede anunciar (`listo`: ninguna en rojo) y el aviso en una frase. Sin estudio, las siete en
 * rojo. Pura.
 */
export function semaforoMaletas(estudioProducto) {
  const e = estudioProducto && typeof estudioProducto === "object" ? estudioProducto : null;
  const maletas = ELEMENTOS_MERCADO.map((el) => estadoDeMaleta(el.clave, e?.elementos?.[el.clave], { objeciones: e?.objeciones }));
  const faltan = maletas.filter((m) => m.estado === "rojo");
  const flojas = maletas.filter((m) => m.estado === "ambar");
  return { maletas, estado: peor(maletas), listo: !faltan.length, faltan: faltan.map((m) => m.clave), flojas: flojas.map((m) => m.clave), aviso: avisoDeMaletas(faltan, flojas) };
}

const lista = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
// Cada maleta con su artículo, para que las frases se lean bien («Faltan los testimonios y la garantía»).
const CON_ARTICULO = Object.freeze({
  publico: "el público", problema: "el problema", solucion: "la solución", diferenciales: "los diferenciales",
  testimonios: "los testimonios", objeciones: "las objeciones", garantia: "la garantía",
});
const PLURALES = new Set(["diferenciales", "testimonios", "objeciones"]);
const conArticulo = (m) => CON_ARTICULO[m.clave] ?? m.titulo.toLowerCase();

/** El aviso del semáforo en una frase: «si falta una, no lances». Pura. */
export function avisoDeMaletas(faltan = [], flojas = []) {
  if (faltan.length) {
    const verbo = faltan.length > 1 || PLURALES.has(faltan[0].clave) ? "Faltan" : "Falta";
    const frase = lista(faltan.map(conArticulo));
    return `${verbo} ${frase}: si falta una maleta, no lances el anuncio.`;
  }
  if (flojas.length) return `Se puede anunciar, pero conviene concretar ${lista(flojas.map(conArticulo))}.`;
  return "Las 7 maletas están: se puede anunciar.";
}

/**
 * Las maletas que faltan (rojo) o están flojas (ámbar) de un producto, para el plan de campañas: [{ clave, titulo,
 * estado, motivo, arreglo, delCliente }]. `estudio`: el estudio de mercado (aprobado o borrador, limpio o no). Sin
 * estudio de ese producto, las siete. Pura.
 */
export function maletasQueFaltan(estudio, productoId) {
  const e = limpiarEstudio(estudio);
  return semaforoMaletas(e?.productos?.[productoId] ?? null).maletas.filter((m) => m.estado !== "verde");
}

/**
 * El resumen para Marca → Cerebro: un renglón por producto activo del catálogo con su color y lo que falta, y
 * cuántos se pueden anunciar. `estudio`: el aprobado o, si no hay, el borrador. → { productos: [{ id, nombre, estado,
 * listo, faltan, flojas, aviso, delCliente: [claves que sólo da el cliente y no están en verde] }], listos, total }.
 * Pura.
 */
export function resumenDeMaletas(estudio, catalogo) {
  const e = limpiarEstudio(estudio);
  const productos = productosActivos(catalogo).map((p) => {
    const s = semaforoMaletas(e?.productos?.[p.id] ?? null);
    return {
      id: p.id, nombre: p.nombre, estado: s.estado, listo: s.listo, faltan: s.faltan, flojas: s.flojas, aviso: s.aviso,
      sinEstudio: !e?.productos?.[p.id],
      delCliente: s.maletas.filter((m) => m.delCliente && m.estado !== "verde").map((m) => m.clave),
    };
  });
  return { productos, listos: productos.filter((p) => p.listo).length, total: productos.length };
}

/**
 * La tarea «Pedírselo al cliente»: el título y la descripción con el mensaje listo para mandarle por WhatsApp.
 * `claves`: las maletas suyas que faltan (testimonios, garantía); las que no son del cliente se ignoran. Null si no
 * queda ninguna. Pura.
 */
export function tareaParaElCliente({ marca = "", producto = "", claves = [] } = {}) {
  const suyas = ELEMENTOS_MERCADO.filter((el) => el.delCliente && claves.includes(el.clave));
  if (!suyas.length) return null;
  const que = lista(suyas.map(conArticulo));
  const sobre = producto ? ` de «${producto}»` : "";
  return {
    title: `Pedirle a ${marca || "el cliente"} ${que}${sobre}`,
    description: [
      `Sin ${que} no se lanza el anuncio${sobre} (las 7 maletas del estudio de mercado). Mensaje para mandarle:`,
      "",
      `Hola${marca ? `, equipo de ${marca}` : ""}. Para los anuncios${sobre} necesitamos:`,
      ...suyas.map((el) => `• ${PEDIDO_AL_CLIENTE[el.clave]}`),
      "",
      "Con eso los anuncios dan más confianza y convierten mejor. ¡Gracias!",
    ].join("\n"),
  };
}
