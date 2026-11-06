// ============================================================
// Escribir textos de publicaciones por el MOTOR, desde la pantalla
//
// El cliente de modo «campos» de POST /api/estudio/<c>/lote/ideas (ver
// src/lib/camposTexto.js): lo usan los botones «IA» de cada campo del panel
// de una publicación y del banco de ideas, «Completar los textos que
// faltan» y «Generar con IA» del calendario y «Escribir guiones y
// descripciones» de «Planificar mes». Se carga EN DIFERIDO (al pulsar): la
// carga inicial está en su tope y esto arrastra el motor de ideas.
// ============================================================

import { pedir } from "./db";
import { casillaDeCampos, aplicarCampos } from "./camposTexto.js";
import { camposQueFaltan as camposQueFaltanDelFormato, llevaHashtags, tieneHashtags } from "./reglasFormato.js";
import { estrategiaDelCalendario } from "./estrategiaMes.js";
import { semanaDelMes } from "./semanas.js";
import { usadosDelMes } from "./ideaPublicacion.js";
import { vaAPauta, tieneTextosAnuncio } from "./pauta.js";

export { aplicarCampos };

/**
 * Lo que le falta a una publicación por su formato (lib/reglasFormato.js) y, si va a PAUTA y aún no los tiene, sus
 * textos de anuncio aparte (lib/pauta.js: toda publicación que va a pauta los lleva). Pura.
 */
export const camposQueFaltan = (post = {}) => [
  ...camposQueFaltanDelFormato(post),
  ...(vaAPauta(post) && post.format !== "live" && !tieneTextosAnuncio(post) ? ["anuncio"] : []),
];

/** Lo que escribe el motor en una tanda (modo «campos») → { textos: [{ clave, campos, ganchos?, formulaUgc? }], aviso }. */
export const escribirCampos = (clienteId, cuerpo) =>
  pedir(`/estudio/${encodeURIComponent(clienteId)}/lote/ideas`, { method: "POST", body: JSON.stringify({ ...cuerpo, modo: "campos" }) });

/** El concepto de la semana de un día: el de su FILA de la rejilla (lunes a domingo) o, si no, el que lleve el día. Pura. */
export function conceptoDelDia(cal, day) {
  const fecha = String(day?.date ?? "");
  const n = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? semanaDelMes(fecha) : 0;
  return String((n && (cal?.weekConcepts ?? [])[n - 1]) || day?.concept || "").trim();
}

/** La estrategia que viaja con el pedido (la del calendario en pantalla; sin calendario, nada: la lee el servidor). */
const estrategiaDe = (cal) => (cal && (cal.campaign || cal.weekConcepts?.length || cal.offers || cal.opciones?.estrategia) ? estrategiaDelCalendario(cal) : undefined);

/**
 * El texto de UN campo de una publicación (el botón «IA» de ese campo): el motor con todo lo que la publicación ya
 * tiene escrito delante. Con el caption, también los hashtags si no tiene (aparte, sólo rellenan). → los textos del
 * motor (para `aplicarCampos(post, textos, { reemplazar: [campo] })`).
 */
export async function textoDeUnCampo(clienteId, { post, day = {}, cal = null, campo }) {
  if (!clienteId) throw new Error("Escoge el cliente: la IA escribe con su marca.");
  // El caption de antes traía sus hashtags dentro; ahora van aparte: si la publicación no tiene, se piden con él.
  const extra = campo === "descripcion" && llevaHashtags(post?.format) && !tieneHashtags(post) ? ["hashtags"] : [];
  // Lo que va a pauta lleva además sus textos de anuncio aparte: si aún no los tiene, salen con el caption.
  if (campo === "descripcion" && vaAPauta(post) && !tieneTextosAnuncio(post)) extra.push("anuncio");
  const casilla = casillaDeCampos(post, day, { campos: [campo, ...extra], semana: conceptoDelDia(cal, day) });
  if (!casilla) throw new Error("Este formato no lleva ese texto.");
  const r = await escribirCampos(clienteId, { publicaciones: [casilla], estrategia: estrategiaDe(cal), usados: usadosDelMes(cal, post?.id), semilla: Date.now() % 997 });
  const t = (r?.textos ?? [])[0];
  if (!t?.campos?.[campo]) throw new Error("La IA no devolvió ese texto. Inténtalo otra vez.");
  return t;
}

/**
 * Lo que le FALTA a muchas publicaciones de un calendario, de TANDA en TANDA (6 por llamada). `pedidos`:
 * [{ post, day, campos? }] —sin `campos`, los que le faltan por su formato (lib/reglasFormato.js)—. `alProgresar(i,
 * total)` antes de cada tanda. → Map id de la publicación → textos del motor. Una tanda que falla corta el resto (el
 * error sube con lo que ya llegó en `parcial`).
 */
export async function escribirLoQueFalta(clienteId, cal, pedidos = [], { alProgresar = () => {}, tanda = 6 } = {}) {
  const casillas = pedidos
    .map(({ post, day, campos }) => casillaDeCampos(post, day, { campos: campos ?? camposQueFaltan(post), semana: conceptoDelDia(cal, day) }))
    .filter(Boolean);
  const porId = new Map();
  const semilla = Math.floor(Math.random() * 1000);
  const estrategia = estrategiaDe(cal);
  const usados = usadosDelMes(cal);
  for (let i = 0; i < casillas.length; i += tanda) {
    alProgresar(i, casillas.length);
    try {
      const r = await escribirCampos(clienteId, { publicaciones: casillas.slice(i, i + tanda), estrategia, usados, semilla });
      for (const t of r?.textos ?? []) porId.set(t.clave, t);
    } catch (e) {
      e.parcial = porId;
      throw e;
    }
  }
  return porId;
}

/** Los días del calendario con cada publicación ya con lo escrito por el motor (sólo rellena lo vacío). Pura. */
export function conTextos(days = [], porId = new Map()) {
  return (days ?? []).map((d) => ({
    ...d,
    posts: (d.posts ?? []).map((p) => (porId.has(p.id) ? { ...p, ...aplicarCampos(p, porId.get(p.id)).cambios } : p)),
  }));
}

/**
 * Lo que va a pauta, reescrito como ANUNCIO por el motor («Revisar el mes», «Versión para anuncio»): los `campos`
 * (el caption, sus textos de anuncio aparte o los dos) con lo ya escrito delante y la etapa de su pauta (lib/pauta.js);
 * `pide`, lo que tiene que cambiar (que sea distinta de otra de su etapa). No guarda: → los cambios (los campos pedidos
 * se reescriben), para ponerlos sobre la publicación de AHORA.
 */
export async function reescribirComoAnuncio(clienteId, { post, day = {}, cal = null, campos = ["descripcion"], pide = "" }) {
  if (!clienteId) throw new Error("Escoge el cliente: la IA escribe con su marca.");
  const casilla = casillaDeCampos(post, day, { campos, semana: conceptoDelDia(cal, day), pide });
  if (!casilla) throw new Error("Esta publicación no lleva ese texto.");
  const r = await escribirCampos(clienteId, { publicaciones: [casilla], estrategia: estrategiaDe(cal), usados: usadosDelMes(cal, post?.id), semilla: Date.now() % 997 });
  const t = (r?.textos ?? [])[0];
  if (!t || !Object.keys(t.campos ?? {}).length) throw new Error("La IA no devolvió el texto. Inténtalo otra vez.");
  return aplicarCampos(post, t, { reemplazar: casilla.campos }).cambios;
}
