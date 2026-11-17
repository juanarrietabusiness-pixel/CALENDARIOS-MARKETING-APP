// ============================================================
// El CATÁLOGO DE EFECTOS de la aplicación (puro: lo leen el Worker, el Container y la pantalla de «Sonido»)
//
// Los efectos son archivos de la propia aplicación (public/efectos/v1/*.mp3, servidos como estáticos y copiados en la
// imagen del Container), no filas de la base: no cuentan en la biblioteca de nadie, no se borran y valen para todos los
// clientes. Salen de earshot (síntesis por código, MIT) y de uisfx (CC0); cómo se arman, scripts/efectos/. Cada uno
// tiene su PAPEL (transición, golpe, pop…), y las reglas de cada papel están en src/lib/efectosColocados.js.
//
// Los datos (`catalogoEfectos.datos.js`, generado) pesan unos 50 kB: este módulo sólo se importa donde hace falta
// buscar o listar (el Worker, el Container y una pantalla perezosa), nunca en la carga inicial.
// ============================================================

import { EFECTOS_CATALOGO } from "./catalogoEfectos.datos.js";

export { EFECTOS_CATALOGO };

/** Dónde se sirven los archivos (estáticos del sitio). La imagen del Container los tiene en la misma ruta, bajo /app. */
export const RUTA_EFECTOS = "/efectos/v1/";
export const CARPETA_EFECTOS = "public/efectos/v1";

const porId = new Map(EFECTOS_CATALOGO.map((e) => [e.id, e]));

/** Un efecto del catálogo por su id, o null. Pura. */
export const efectoDelCatalogo = (id) => porId.get(String(id ?? "")) ?? null;

/** La dirección de un efecto del catálogo (para oírlo en la pantalla). Pura. */
export const srcDeEfecto = (e) => `${RUTA_EFECTOS}${e.archivo}`;

const sinTildes = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Busca en el catálogo: por papel (uno o varios; cuenta también el papel secundario) y por palabras (todas, en el nombre,
 * la familia, para qué sirve o el id), en el orden del catálogo (por papel). → [efecto]. Pura.
 */
export function buscarEnCatalogo({ papel = null, texto = "", limite = Infinity } = {}) {
  const papeles = papel ? new Set((Array.isArray(papel) ? papel : [papel]).map(String).filter(Boolean)) : null;
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
  const out = [];
  for (const e of EFECTOS_CATALOGO) {
    if (papeles?.size && !papeles.has(e.papel) && !e.papeles?.some((p) => papeles.has(p))) continue;
    const donde = sinTildes(`${e.id} ${e.nombre} ${e.familia} ${e.para}`);
    if (palabras.some((p) => !donde.includes(p))) continue;
    out.push(e);
    if (out.length >= limite) break;
  }
  return out;
}

/** Cuántos efectos hay de cada papel. → { papel: n }. Pura. */
export function cuentaPorPapel() {
  const out = {};
  for (const e of EFECTOS_CATALOGO) out[e.papel] = (out[e.papel] ?? 0) + 1;
  return out;
}
