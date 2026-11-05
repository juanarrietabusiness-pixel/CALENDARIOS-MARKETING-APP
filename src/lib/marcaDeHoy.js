// ============================================================
// Un pedido de antes, con la MARCA DE HOY (puro)
//
// «Otra igual», «Otra versión» (del visor y de la publicación) repetían el
// pedido de la pieza original tal cual: con el bloque de la marca, el logo y el
// acabado que tenía el kit EL DÍA que se hizo. Si después la agencia cambió la
// paleta, sumó una regla, el kit aprendió algo o el logo pasó a estamparse, la
// versión nueva salía con lo viejo (y, con el logo estampado, con dos logos).
// Y el pedido se cortaba por el final (`slice(0, MAX_PROMPT)`), que es donde van
// la marca y el logo.
//
// Aquí el pedido se parte en sus trozos (`componerPedido` en kitMarca.js los
// separa con una línea en blanco): se quedan la escena (o la nueva), el tipo de
// pieza, el estilo y las referencias de la pieza con lo que se toma de cada una;
// salen la identidad de la marca, el acabado y lo del logo, y entran los del kit
// ACTUAL. Si no cabe, se acorta la escena (`ajustarFicha`: lo prescindible
// primero, el texto exacto nunca), no el final.
// ============================================================

import {
  limpiarKit, kitVacio, bloqueDeMarca, ponerLogo, lineaSinLogo, pideLogoDeReferencia, PREFIJO_TIPO, LINEA_LOGO, LINEA_LOGO_ANTERIOR,
  LINEA_LOGO_FUERA, LINEA_OFICIO, LINEA_VIDEO,
} from "./kitMarca.js";
import { ajustarFicha } from "./director.js";
import { MAX_PROMPT } from "./estudioCatalogo.js";

const ESCENA = "Escena: ";
const MARCA = "Identidad de la marca (obligatoria):";
/** Las líneas del logo que pudo llevar el pedido (la de hoy, la de antes y la de cuando Muse lo dejó fuera). */
const DEL_LOGO = [LINEA_LOGO, LINEA_LOGO_ANTERIOR, LINEA_LOGO_FUERA];
const esSinLogo = (s) => s.startsWith("Sin logo en la imagen:") || s.startsWith("No dibujes ni inventes ningún logo");
const esDeReferencias = (s) => /^Imagen de referencia \d+:/.test(s) || s.startsWith("Fotos del producto:");

/**
 * Los trozos de un pedido compuesto: { compuesto, escena, tipo, referencias, otros, video, conLogo }. `otros` son los
 * trozos que no son de la marca (el estilo visual, la plantilla…), en su orden. Un pedido sin «Escena:» es todo escena.
 * Pura.
 */
export function partesDelPedido(prompt) {
  const t = String(prompt ?? "").trim();
  const trozos = t.split("\n\n");
  if (!trozos[0]?.startsWith(ESCENA)) return { compuesto: false, escena: t, tipo: "", referencias: "", otros: [], video: false, conLogo: false };
  const resto = trozos.slice(1).map((s) => s.trim()).filter(Boolean);
  const deLaMarca = (s) => s.startsWith(MARCA) || DEL_LOGO.includes(s) || esSinLogo(s) || s === LINEA_OFICIO;
  return {
    compuesto: true,
    escena: trozos[0].slice(ESCENA.length).trim(),
    tipo: resto.find((s) => s.startsWith(PREFIJO_TIPO)) ?? "",
    referencias: resto.filter(esDeReferencias).join("\n"),
    otros: resto.filter((s) => !deLaMarca(s) && !s.startsWith(PREFIJO_TIPO) && !esDeReferencias(s) && s !== LINEA_VIDEO),
    video: resto.includes(LINEA_VIDEO),
    conLogo: pideLogoDeReferencia(t),
  };
}

/**
 * El pedido de una pieza de antes con OTRA escena (o la misma, sin `escena`) y la marca del kit de HOY. `claves`: las
 * referencias con que se pidió (en orden; el logo, si lo llevaba, es la última); `modelo`: con el que se va a pedir (dice
 * si cabe el logo). → { prompt, reference } (las claves que van, con el logo de hoy al final si toca). Pura.
 */
export function conMarcaDeHoy({ prompt, escena = null, kit = {}, modelo = null, claves = [] }) {
  const p = partesDelPedido(prompt);
  const k = limpiarKit(kit);
  const nueva = String(escena ?? p.escena).trim();
  // El logo de antes era la última referencia: sale (va el de hoy, si toca). Y si el logo de hoy ya iba entre ellas, también.
  // Con otro modelo, las que le quepan (dejando sitio al logo si lo pone el modelo), como `apoyosDePieza`.
  const caben = modelo ? Math.max(0, (modelo.referencias ?? 0) - (k.logo && k.logoModo !== "estampado" && !p.video ? 1 : 0)) : Infinity;
  const refs = (p.conLogo && claves.length ? claves.slice(0, -1) : [...claves]).filter((c) => c && c !== k.logo).slice(0, caben);
  // Las líneas de las referencias que ya no van (con otro modelo, las de detrás) tampoco.
  const lineas = p.referencias.split("\n").filter((l) => {
    const n = Number(l.match(/^Imagen de referencia (\d+):/)?.[1] ?? 0);
    return l && (!n || n <= refs.length);
  }).join("\n");
  // Sin kit y sin pedido compuesto no hay marca que poner: la escena tal cual (lo decidió quien la pidió así).
  if (kitVacio(kit) && !k.logo && !p.compuesto) return { prompt: ajustarFicha(nueva, MAX_PROMPT), reference: refs };
  const logo = !p.video && ponerLogo({ kit, tipo: "imagen", modelo, referencias: refs });
  const armar = (e) => [
    `${ESCENA}${e}`, p.tipo, ...p.otros, p.video ? "" : LINEA_OFICIO, lineas, bloqueDeMarca(kit),
    p.video ? "" : logo ? LINEA_LOGO : lineaSinLogo(kit), p.video ? LINEA_VIDEO : "",
  ].filter(Boolean).join("\n\n");
  let completo = armar(nueva);
  if (completo.length > MAX_PROMPT) completo = armar(ajustarFicha(nueva, Math.max(200, nueva.length - (completo.length - MAX_PROMPT))));
  return { prompt: completo.slice(0, MAX_PROMPT), reference: [...refs, ...(logo ? [k.logo] : [])] };
}
