// ============================================================
// El cerebro del cliente, visto desde la generación
//
// Todo puro. La generación pide al Worker (`/api/cerebro/<id>/contexto`)
// dos cosas distintas, y este archivo dice cómo se arma cada una:
//
//   · LO ESTABLE: la ficha técnica y las cifras vigentes. Son lo mismo en
//     todas las tandas de una generación, así que van en el bloque que se
//     cachea (`lib/contextoADN.js`).
//   · LOS PASAJES: lo que esa tanda necesita. Cambian con las
//     publicaciones —una tanda de sofás pide sofás, la siguiente pide
//     hashtags—, así que van detrás de la marca de caché, con lo que
//     cambia.
//
// Si el cliente no tiene cerebro (`notas` = 0), nada de esto se usa y la
// generación sigue con el ADN de su ficha, como antes.
// ============================================================

/**
 * El cerebro existe pero aún no tiene ficha técnica. Se dice, para que el
 * modelo no crea que ya ha leído «el ADN completo»: sólo tiene los pasajes.
 */
export const TEXTO_SIN_FICHA =
  "(La ficha técnica de este cliente aún no está preparada. Abajo van los pasajes de su cerebro más relevantes para esta tarea; " +
  "lo que no esté ahí no lo sabes: no lo inventes.)";

/**
 * ¿Esta tarea se hace con el cerebro? Hace falta que tenga notas para ella y que pueda dar una base: su ficha
 * técnica o, si aún no la tiene, que el cliente no tenga otro ADN al que volver. Con notas pero sin ficha y con un
 * ADN de la ficha del cliente (`githubContext`), ese ADN sigue siendo mejor que unos pasajes sueltos: se genera
 * como siempre hasta que alguien pulse «Preparar ficha con IA».
 */
export function usaElCerebro(contexto, cliente) {
  if (!(contexto?.notas > 0)) return false;
  return Boolean(String(contexto.ficha ?? "").trim()) || !String(cliente?.githubContext ?? "").trim();
}

/**
 * Una memoria corta: guarda un valor `vidaMs` y lo suelta. El asistente pide el contexto del cerebro en cada
 * mensaje y la ficha no cambia de un mensaje a otro; sin esto, cada «hola» costaría una vuelta al servidor.
 * `ahora` se inyecta para poder probarla sin esperar.
 */
export function crearMemoriaCorta(vidaMs = 60_000, ahora = () => Date.now()) {
  const guardado = new Map();
  return {
    /** El valor guardado, o `undefined` si no hay o caducó (un `null` guardado sí cuenta como valor). */
    leer(clave) {
      const e = guardado.get(clave);
      if (!e) return undefined;
      if (ahora() >= e.hasta) { guardado.delete(clave); return undefined; }
      return e.valor;
    },
    poner(clave, valor) { guardado.set(clave, { valor, hasta: ahora() + vidaMs }); },
    olvidar(clave) { guardado.delete(clave); },
  };
}

/** El contexto del cerebro que usa el asistente, por cliente. La pestaña Cerebro lo suelta al cambiar algo. */
export const contextoDelChat = crearMemoriaCorta();

/** Lo que va en el bloque cacheado: la ficha y las cifras, con su título. */
export function textoEstableDelCerebro({ ficha = "", cifras = "" } = {}) {
  const partes = [];
  if (String(ficha).trim()) partes.push(`FICHA TÉCNICA\n${String(ficha).trim()}`);
  if (String(cifras).trim()) partes.push(`CIFRAS VIGENTES (lo único que se puede afirmar con números)\n${String(cifras).trim()}`);
  return partes.length ? partes.join("\n\n") : TEXTO_SIN_FICHA;
}

const MAX_CONSULTA = 1500;

const unir = (partes) => partes.map((p) => String(p ?? "").trim()).filter(Boolean).join(" · ");

/**
 * Qué buscar para una tanda de publicaciones: la campaña y las ofertas del
 * mes, y de cada publicación su idea, su categoría, su formato y el
 * concepto de su semana. Es lo que el modelo va a tener que escribir.
 */
export function consultaDeTanda(calendario, publicaciones = []) {
  const partes = [calendario?.campaign, calendario?.offers];
  for (const p of publicaciones) partes.push(unir([p?.idea, p?.category, p?.producto, p?.format, p?._concept]));
  return unir(partes).slice(0, MAX_CONSULTA);
}

/** Qué buscar para UNA publicación (un solo campo, un solo caption). */
export function consultaDePublicacion(calendario, publicacion, dia) {
  return unir([
    calendario?.campaign, calendario?.offers,
    publicacion?.idea, publicacion?.title, publicacion?.category ?? dia?.category, publicacion?.producto, publicacion?.format, dia?.concept,
  ]).slice(0, MAX_CONSULTA);
}
