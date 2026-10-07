// ============================================================
// Cuánto le falta a una publicación para estar lista
//
// En la vista de mes una publicación es un chip de 24 píxeles: el formato,
// la categoría y la hora. Con eso no hay forma de saber si dentro hay una
// idea escrita, un caption, un título o nada, y descubrirlo obliga a abrir
// las treinta una a una. La barra de la parte de abajo del chip es eso
// resumido en tres píxeles de alto.
//
// Lo que cuenta como «completo» depende del formato: un post estático no
// lleva guion, así que exigírselo le dejaría la barra a cinco sextos para
// siempre y la señal dejaría de significar nada.
//
// Vive aquí y no dentro del componente porque es puro: entra una
// publicación, sale un número y una lista de lo que falta.
// ============================================================

import { hashtagsDe } from "./exportarContenido";
import { mediosDe } from "./publicacion";

/** Los formatos que se graban o se maquetan por partes llevan guion. */
const FORMATOS_CON_GUION = ["reel", "carrusel", "historia", "live"];

/**
 * Los campos que se miran, en el orden en que se nombran al humano.
 *
 * `etiqueta` va en minúsculas porque se lee dentro de una frase: «falta la
 * descripción y los hashtags».
 */
const CAMPOS = [
  { clave: "title", etiqueta: "título" },
  { clave: "category", etiqueta: "categoría" },
  { clave: "idea", etiqueta: "idea" },
  { clave: "guion", etiqueta: "guion", soloConGuion: true },
  { clave: "descripcion", etiqueta: "descripción" },
  { clave: "hashtags", etiqueta: "hashtags" },
  { clave: "publishTime", etiqueta: "hora" },
];

/**
 * El valor de un campo, con sus respaldos.
 *
 * La categoría puede venir del día y no de la publicación —es lo normal
 * cuando se define por día de la semana en el asistente—, la descripción
 * puede estar en el campo heredado `script`, y los hashtags casi siempre
 * viven dentro del propio caption.
 */
function valorDe(post, day, clave) {
  if (clave === "category") return post?.category || day?.category || "";
  if (clave === "descripcion") return post?.descripcion || post?.script || "";
  if (clave === "hashtags") return hashtagsDe(post || {});
  return post?.[clave] || "";
}

/**
 * Qué campos se le piden a esta publicación, según su formato.
 */
export function camposDe(post) {
  const llevaGuion = FORMATOS_CON_GUION.includes(post?.format);
  return CAMPOS.filter((c) => !c.soloConGuion || llevaGuion);
}

/**
 * @returns {{hechos: number, total: number, porcentaje: number, faltan: string[]}}
 */
export function completitud(post, day) {
  const campos = camposDe(post);
  const faltan = [];

  for (const campo of campos) {
    if (!String(valorDe(post, day, campo.clave)).trim()) faltan.push(campo.etiqueta);
  }

  const hechos = campos.length - faltan.length;
  return {
    hechos,
    total: campos.length,
    porcentaje: campos.length ? Math.round((hechos / campos.length) * 100) : 0,
    faltan,
  };
}

/**
 * La frase que describe el estado, para el `title` y el nombre accesible
 * del chip. Un color no se lee con lector de pantalla y en la barra no cabe
 * un texto, así que la información va también en palabras.
 */
export function resumenCompletitud(post, day) {
  const { hechos, total, faltan } = completitud(post, day);
  if (!faltan.length) return `Completa: ${hechos} de ${total} campos`;
  return `${hechos} de ${total} campos — falta ${listar(faltan)}`;
}

/** «título, categoría y hora», que es como se enumera en español. */
function listar(items) {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * Lo que le falta a una publicación SIN contenido para ir al cliente (revisión del mes y «Enviar al cliente»): el texto (lo que lee), el guion si es un
 * reel, carrusel, historia o directo, y una referencia que pueda abrir. Vacío si tiene contenido o no le falta
 * nada. Pura.
 */
export function faltaParaEnviar(post) {
  if (!post || post.status === "published" || mediosDe(post).length) return [];
  const falta = [];
  if (!String(post.descripcion || post.script || "").trim() && !String(post.title || "").trim()) falta.push("la idea en el texto");
  if (FORMATOS_CON_GUION.includes(post.format) && !String(post.guion || "").trim()) falta.push(post.format === "carrusel" ? "el texto de cada lámina" : "el guion");
  if (!String(post.referenceLink || "").trim()) falta.push("una referencia");
  return falta;
}

/** Cuántas publicaciones sin contenido van al cliente sin lo que necesitan para entenderse. Pura. */
export const sinLoNecesario = (days = []) => (days ?? []).flatMap((d) => d?.posts ?? []).filter((p) => faltaParaEnviar(p).length).length;
