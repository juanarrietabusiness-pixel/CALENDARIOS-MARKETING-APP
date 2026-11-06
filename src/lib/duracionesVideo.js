// ============================================================
// Las DURACIONES del reel por ruta, con las llaves que hay (puro: la pantalla, el Worker y las herramientas)
//
// Antes los chips de duración eran fijos (`DURACIONES_REEL` en reel.js) y no miraban las llaves: se podía pedir un
// guion de 30 s con un modelo que hace 10, y lo de más de 30 s era «sólo para Flow». Ahora cada duración dice POR DÓNDE
// sale con lo que la cuenta tiene:
//
//   · «uno»    un solo video por API, con un modelo que hace exactamente esa duración (el storyboard de referencia);
//   · «clips»  un clip por plano (cada fotograma anima su clip) y el MONTAJE de la aplicación los junta con la voz, el
//              texto, los subtítulos y el logo (lib/montajeReel.js). No hay techo: lo que pasa de lo que hace un modelo
//              se hace así. Ya no hay «sólo para Flow» (el prompt para Flow se sigue pudiendo copiar).
//
// Una duración sin ningún modelo con llave que la haga (ni uno que anime una imagen) no se ofrece.
// ============================================================

import { modelosParaReel, modelosParaClips, PREFERIDOS_CLIPS as PREFERIDOS_CLIPS_REEL } from "./reelPedidos.js";

/** Las duraciones que ofrece el reel (s). */
export const DURACIONES_OBJETIVO = Object.freeze([8, 10, 15, 20, 30, 45, 60]);
/** La de partida si nadie escoge. */
export const DURACION_REEL_POR_DEFECTO = 10;

/** El orden en que se prefiere cada modelo para UN video (los mejores para un reel con storyboard, primero). */
const PREFERIDOS_UNO = ["gemini-omni-kie", "kling-3-omni-kie", "seedance-2-5-kie", "seedance-2-kie", "minimax-h3-kie", "gemini-omni-flash", "veo-3-1-fast-kie", "kling-3-kie", "wan-3-kie"];
/** Y para los clips (animar UNA imagen bien y barato): Veo 3.1 Lite primero (ver reelPedidos.js). */
const PREFERIDOS_CLIPS = PREFERIDOS_CLIPS_REEL;
/**
 * El modelo de clips BARATO que deja el producto fiel (método de agencia): con su llave, toda duración va por clips y
 * montaje por defecto (un solo video con todo sigue disponible, escogiéndolo).
 */
export const CLIPS_POR_DEFECTO = "veo-3-1-lite-kie";

/** Las duraciones (s) que admite un modelo de video. Pura. */
export const duracionesDe = (modelo) => {
  const v = (modelo?.ajustes?.duration?.valores ?? []).map(Number).filter((n) => n > 0);
  return v.length ? [...new Set(v)].sort((a, b) => a - b) : Number(modelo?.segundos) > 0 ? [Number(modelo.segundos)] : [];
};

/** ¿Hace este modelo UN video de `s` segundos exactos? Pura. */
export const haceDuracion = (modelo, s) => duracionesDe(modelo).includes(Number(s));

/** Lo que dura el clip de un plano de `dur` s con ese modelo: la menor duración que lo cubre; si ninguna, la mayor. Pura. */
export function duracionDeClip(modelo, dur = 5) {
  const lista = duracionesDe(modelo);
  if (!lista.length) return Math.max(1, Math.round(dur));
  return lista.find((d) => d >= dur) ?? lista.at(-1);
}

const ordenar = (lista, preferidos) => {
  const reales = lista.filter((m) => m.motor !== "prueba");
  const base = reales.length ? reales : lista;
  const rango = (m) => { const i = preferidos.indexOf(m.id); return i < 0 ? preferidos.length : i; };
  return [...base].sort((a, b) => rango(a) - rango(b));
};

/**
 * Cada duración con su ruta y sus modelos (los que tienen llave; la prueba sólo si no hay ninguno de verdad).
 * → [{ segundos, ruta: "uno" | "clips", modelos: [ids], nombre, ayuda }]. Una duración sin forma de hacerse no sale. Pura.
 */
export function duracionesDeReel(activos = {}) {
  const uno = modelosParaReel(activos);
  const clips = ordenar(modelosParaClips(activos), PREFERIDOS_CLIPS);
  const salida = [];
  const clipsBaratos = clips[0]?.id === CLIPS_POR_DEFECTO;
  for (const s of DURACIONES_OBJETIVO) {
    const hacen = ordenar(uno.filter((m) => haceDuracion(m, s)), PREFERIDOS_UNO);
    if (hacen.length && !clipsBaratos) {
      salida.push({ segundos: s, ruta: "uno", modelos: hacen.map((m) => m.id), nombre: `${s} s · un video`, ayuda: `Un solo video con ${hacen[0].nombre}, con los fotogramas de storyboard.` });
    } else if (clips.length) {
      salida.push({ segundos: s, ruta: "clips", modelos: clips.map((m) => m.id), nombre: `${s} s · clips y montaje`, ayuda: `Un clip por plano con ${clips[0].nombre} y el montaje aquí: la voz, el texto, los subtítulos y el logo los pone la aplicación.` });
    }
  }
  return salida;
}

/** La entrada de esa duración (o la más cercana que exista). Pura. */
export function rutaDeDuracion(activos = {}, segundos = DURACION_REEL_POR_DEFECTO) {
  const lista = duracionesDeReel(activos);
  if (!lista.length) return null;
  return lista.find((d) => d.segundos === Number(segundos)) ?? [...lista].sort((a, b) => Math.abs(a.segundos - segundos) - Math.abs(b.segundos - segundos))[0];
}

/** ¿Este modelo puede hacer UN video de esa duración? Si no, la duración se hace por clips. Pura. */
export const cabeEnUnVideo = (modelo, segundos) => Boolean(modelo) && haceDuracion(modelo, segundos);
