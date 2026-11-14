// ============================================================
// «Variaciones para anuncios»: de una PIEZA MAESTRA, las de un conjunto de anuncios (pura)
//
// Cuando una imagen sale muy bien, la agencia la quiere como base de un conjunto de anuncios de Meta: de 3 a 5 piezas
// que se reconocen como la MISMA campaña (la paleta, la luz, la tipografía, el acabado, el producto y la familia de
// composición) y que cambian lo que conviene probar: el ángulo de la escena, la composición, el fondo y, si la pieza
// lleva texto, el GANCHO (el titular). Es lo que «Otra versión» no hace: aquélla da una alternativa con el mismo texto;
// esto da piezas distintas entre sí, cada una con UN cambio dicho.
//
// El director MIRA la maestra (papel «maestra», lib/director.js) y escribe una ficha por variación; cada una va por el
// servidor como el resto (control de calidad, proporción, logo). Aquí, lo puro: qué cambia cada una (`ejesDeVariacion`),
// el encargo del director (`encargoDeVariacion`), el texto que tiene que quedar (`textoDeVariacion`) y el nombre de la
// carpeta donde quedan juntas.
// ============================================================

import { lineasDelTexto, esFicha } from "./director.js";

export const MIN_VARIACIONES = 3;
export const MAX_VARIACIONES = 5;
const MAX_BASE = 2_000;

/**
 * Lo que cambia cada variación, uno por pieza. `gancho`: cambia el titular (sólo si la pieza lleva texto escrito por el
 * motor). Escritos con palabras propias. Los ganchos de anuncio no afirman nada personal de quien lee ni inventan cifras.
 */
export const EJES_VARIACION = Object.freeze({
  gancho: {
    nombre: "Otro gancho (beneficio)", gancho: true,
    linea: "Cambia el GANCHO: un titular NUEVO de 2 a 7 palabras que entre por el BENEFICIO o el resultado que se lleva quien compra, con la misma oferta y los mismos datos. La escena y la composición, casi iguales a la maestra.",
  },
  pregunta: {
    nombre: "Otro gancho (pregunta u objeción)", gancho: true,
    linea: "Cambia el GANCHO: un titular NUEVO de 2 a 7 palabras que entre por una PREGUNTA sobre la situación (nunca sobre quien lee) o por una duda frecuente ya resuelta, con la misma oferta y los mismos datos. La escena y la composición, casi iguales a la maestra.",
  },
  angulo: {
    nombre: "Otro ángulo de la escena",
    linea: "Cambia el ÁNGULO de la escena: otro momento o punto de vista de la misma historia (el producto en uso en vez de solo, desde arriba en vez de frente, el antes en vez del después), con la misma familia de composición.",
  },
  composicion: {
    nombre: "Otra composición",
    linea: "Cambia la COMPOSICIÓN dentro de la misma familia: otra distribución (el producto al otro lado, el texto arriba en vez de abajo, pantalla dividida), con la misma escena.",
  },
  fondo: {
    nombre: "Otro fondo",
    linea: "Cambia el FONDO o el escenario por otro de la paleta de la marca, con la misma luz y el mismo encuadre.",
  },
  detalle: {
    nombre: "Un detalle de cerca",
    linea: "Acércate a un DETALLE que venda (la textura, el acabado, la mano que lo usa) sin que el producto deje de reconocerse.",
  },
  encuadre: {
    nombre: "Otro encuadre",
    linea: "Cambia el ENCUADRE: un plano más abierto que enseñe el ambiente, o uno más cerrado, el contrario del que tiene la maestra.",
  },
});

/** El orden en que se reparten: con texto, los ganchos van primero (es lo que más enseña un conjunto de anuncios). */
const CON_TEXTO = ["gancho", "angulo", "composicion", "pregunta", "fondo"];
const SIN_TEXTO = ["angulo", "composicion", "fondo", "detalle", "encuadre"];

/** ¿Cuántas? Entre 3 y 5 (lo que no lo es, 0). Pura. */
export const cuantasVariaciones = (n) => (Number.isInteger(Number(n)) && Number(n) >= MIN_VARIACIONES && Number(n) <= MAX_VARIACIONES ? Number(n) : 0);

/** Los ejes de N variaciones (ids de EJES_VARIACION, sin repetir). `conTexto`: la pieza lleva un texto que se puede cambiar. Pura. */
export function ejesDeVariacion(n, { conTexto = false } = {}) {
  const k = Math.min(MAX_VARIACIONES, Math.max(0, Number(n) || 0));
  return (conTexto ? CON_TEXTO : SIN_TEXTO).slice(0, k);
}

/**
 * El texto que se le da al director como EXACTO en una variación: el de la maestra entero; en una de gancho, sin el
 * titular (la primera línea), que es lo que se cambia. Pura.
 */
export function textoDeVariacion(texto, eje) {
  const lineas = lineasDelTexto(texto);
  return (EJES_VARIACION[eje]?.gancho ? lineas.slice(1) : lineas).join("\n");
}

/**
 * El encargo del director para la variación k. `base`: la ficha de la maestra (o su escena, si es de antes del
 * director); `texto`: el de la maestra. Lo que conserva siempre: el ADN; lo que cambia: su eje. Pura.
 */
export function encargoDeVariacion(base, { k = 0, eje = "angulo", texto = "", indicacion = "", productoIds = [], formato = "", proporcion = "", sinTexto = false } = {}) {
  const def = EJES_VARIACION[eje] ?? EJES_VARIACION.angulo;
  // Sin texto escrito por el motor (lo pone la plantilla encima) no hay gancho que cambiar.
  const lineas = sinTexto ? [] : lineasDelTexto(texto);
  const textoQueQueda = textoDeVariacion(texto, eje);
  const sobreElTexto = !lineas.length
    ? ""
    : def.gancho
      ? `Antes el titular era «${lineas[0]}»: escribe otro, y ponlo DELANTE del resto del texto${textoQueQueda ? ", que va EXACTO" : ""}.`
      : "El texto de la pieza va EXACTO, el mismo de la maestra (no cambies, quites ni añadas una palabra).";
  return {
    n: k + 1, formato, proporcion,
    idea: [
      `VARIACIÓN ${k + 1} PARA UN CONJUNTO DE ANUNCIOS de la pieza maestra: conserva su ADN —la paleta, la luz, la tipografía y la jerarquía del texto, el acabado, el producto y la familia de composición— y cambia SÓLO esto: ${def.linea}`,
      sobreElTexto,
      "Nada de precios, descuentos, cifras ni promesas que no estén en la maestra; ninguna frase que afirme algo personal de quien la ve.",
      `${esFicha(base) ? "LA FICHA" : "LA ESCENA"} DE LA PIEZA MAESTRA:\n${String(base ?? "").slice(0, MAX_BASE)}`,
    ].filter(Boolean).join("\n"),
    texto: sinTexto ? "" : textoQueQueda, productoIds, indicacion, ...(sinTexto ? { sinTexto: true } : {}),
  };
}

/**
 * El nombre de la carpeta donde quedan juntas (carpetas de la galería: 40 caracteres como mucho). `intento` > 1 le
 * suma « (n)» si ya había una con ese nombre. Pura.
 */
export function carpetaDeVariaciones(titulo = "", intento = 1) {
  const base = `Variaciones · ${String(titulo ?? "").replace(/["“”«»]/g, "").replace(/\s+/g, " ").trim().slice(0, 24).trim() || "anuncio"}`;
  return intento > 1 ? `${base.slice(0, 34).trim()} (${intento})` : base;
}
