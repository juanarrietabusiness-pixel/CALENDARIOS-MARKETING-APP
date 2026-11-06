// ============================================================
// APRENDER DE LOS ANUNCIOS: qué forma de pieza sale más barata para ESTE cliente (curso de campañas, entrega 7; puro)
//
// El método del curso es probar unas pocas piezas de cada tipo y quedarse con lo que funciona. Con lo que ya corrió en
// el Ads Manager casado con su publicación del calendario (`anuncios_clientes.en_pauta`, lib/enPauta.js), esto lo hace
// solo: por cada rasgo de la pieza —el TIPO DE ARTE (deducido de su composición y su tipo de contenido con
// `TIPOS_ARTE`), el NIVEL de consciencia, la COMPOSICIÓN y la ETAPA del ciclo en que corrió— el costo por resultado de
// cada valor, y cuál sale más barato y cuál más caro.
//
// LA MUESTRA, decidida así y dicha en `motivo`:
//
//   · La unidad es la PIEZA (la publicación), no el anuncio: la misma publicación en tres conjuntos son tres anuncios
//     iguales, y contarlos por separado haría pasar una sola pieza por tres.
//   · Una pieza cuenta si gastó lo SUFICIENTE en 30 días: al menos dos veces el número mágico del cliente (lo que
//     cuestan dos resultados) y al menos un cuarto de lo que gasta una pieza típica de la cuenta (la mediana). Sin
//     número mágico, sólo lo segundo.
//   · Sólo se comparan piezas con el MISMO tipo de resultado (conversaciones con conversaciones): el que más se repite.
//   · Un valor necesita `MIN_PIEZAS` (3) piezas que cuenten, y un rasgo, al menos DOS valores así: con menos no se
//     concluye nada (`linea` vacía).
//   · El costo de un grupo es el de sus piezas juntas (lo gastado ÷ los resultados): una pieza con 0 resultados no
//     rompe la cuenta. «Más barato» es un 15 % por debajo del total del rasgo; «más caro», un 20 % por encima (o sin
//     resultados).
//
// Lo leen el motor de ideas cuando escribe para pauta (worker/lib/estudio/lote.js), el director de las piezas que van a
// pauta (worker/lib/estudio/fichas.js) y el plan de campañas (`preferenciasDeAnuncios`). La `linea` pide preferir lo que
// funciona sin dejar de probar: con todo igual, Meta deja de distinguir los anuncios (diversificación creativa).
// ============================================================

import { TIPOS_ARTE, tipoArteDe } from "./tiposArte.js";
import { nombreDeNivel } from "./consciencia.js";
import { nombreEtapaCiclo } from "./cicloVentas.js";
import { formatoMoneda } from "./anuncios.js";
import { limpiarEnPauta, clavePublicacion, mediana, singularDe } from "./enPauta.js";

export const MIN_PIEZAS = 3;
/** Cuántos números mágicos tiene que haber gastado una pieza para contar. */
export const VECES_NUMERO_MAGICO = 2;
/** …y qué parte de lo que gasta una pieza típica de la cuenta. */
export const PARTE_DE_LA_MEDIANA = 0.25;
export const MAS_BARATO = 0.85;
export const MAS_CARO = 1.2;

const num = (v) => (v == null || v === "" ? 0 : Number(v) || 0);
const r2 = (n) => Math.round(n * 100) / 100;
const esObjeto = (x) => Boolean(x) && typeof x === "object" && !Array.isArray(x);

/**
 * El tipo de arte de una publicación: el que lleve escrito o, si no, el que dibuja su composición con su tipo de
 * contenido; si no casan los dos, el de la composición; si no, el de su tipo de contenido. "" si no hay con qué. Pura.
 */
export function tipoArteDePost(post = {}) {
  if (tipoArteDe(post?.tipoArte)) return post.tipoArte;
  const comp = String(post?.composicion ?? "");
  const pilar = String(post?.pilar ?? "");
  if (comp && pilar) {
    const ambos = TIPOS_ARTE.find((t) => t.composiciones.includes(comp) && t.pilares.includes(pilar));
    if (ambos) return ambos.id;
  }
  if (comp) {
    const deComp = TIPOS_ARTE.find((t) => t.composiciones.includes(comp));
    if (deComp) return deComp.id;
  }
  return pilar ? TIPOS_ARTE.find((t) => t.pilares.includes(pilar))?.id ?? "" : "";
}

/** Los rasgos que se comparan y cómo se nombra cada valor. */
export const RASGOS = Object.freeze([
  { id: "tipoArte", nombre: "tipo de arte" },
  { id: "nivel", nombre: "nivel de consciencia" },
  { id: "composicion", nombre: "composición" },
  { id: "etapa", nombre: "etapa" },
]);

/**
 * Las publicaciones que se pasan (para mandar sobre lo recordado): un Map clave → post, una lista de calendarios
 * (`{ id | dbId, days }`, como los del navegador) o una lista de `{ calendarId, postId, post }`. → Map clave → post.
 */
function indiceDePosts(publicaciones) {
  if (publicaciones instanceof Map) return publicaciones;
  const m = new Map();
  for (const x of Array.isArray(publicaciones) ? publicaciones : []) {
    if (Array.isArray(x?.days)) {
      const cal = String(x.dbId || x.id || "");
      for (const d of x.days) for (const p of d?.posts ?? []) if (p?.id) m.set(clavePublicacion(cal, p.id), p);
    } else if (x?.calendarId && (x.postId || x.post?.id) && x.post) {
      m.set(clavePublicacion(x.calendarId, x.postId || x.post.id), x.post);
    }
  }
  return m;
}

/**
 * Las piezas que se comparan, cada una con sus rasgos. `nombres.composicion`: id → nombre, si se quiere el nombre de
 * una composición que la publicación no traiga recordado. Pura.
 */
export function piezasDeAnuncios(enPauta, publicaciones = null, { nombres = {} } = {}) {
  const guardado = limpiarEnPauta(enPauta);
  const posts = indiceDePosts(publicaciones);
  return Object.entries(guardado.publicaciones).map(([k, e]) => {
    const recordado = esObjeto(e.post) ? e.post : {};
    const vivo = posts.get(k);
    const p = vivo ? { ...vivo } : recordado;
    const composicion = String(p.composicion ?? "");
    const nombreComposicion = (composicion && recordado.composicion === composicion && recordado.composicionNombre)
      || (composicion && typeof nombres.composicion === "function" ? nombres.composicion(composicion) : "")
      || composicion;
    const nivel = String((esObjeto(p.pauta) && p.pauta.nivel) || p.nivel || recordado.nivel || "");
    const tipoArte = vivo ? tipoArteDePost(vivo) : tipoArteDePost({ tipoArte: recordado.tipoArte, composicion: recordado.composicion, pilar: recordado.pilar });
    const etapa = String(e.etapa || (esObjeto(p.pauta) ? p.pauta.etapa : "") || recordado.pautaEtapa || "");
    const c = e.d30?.gasto > 0 ? e.d30 : e.d7;
    return {
      clave: k, titulo: recordado.titulo ?? "", tipoResultado: e.tipoResultado ?? "", nombreResultado: e.nombreResultado ?? "",
      gasto: num(c?.gasto), resultados: num(c?.resultados), activo: Boolean(e.activo),
      rasgos: { tipoArte, nivel, composicion, etapa },
      nombres: {
        tipoArte: tipoArteDe(tipoArte)?.nombre ?? "",
        nivel: nombreDeNivel(nivel) || nivel,
        composicion: nombreComposicion,
        etapa: e.nombreEtapa || nombreEtapaCiclo(etapa) || (etapa === "temporada" ? "Temporada" : etapa),
      },
    };
  });
}

/** El costo de unas piezas juntas (null sin resultados). */
const costoDe = (piezas) => {
  const gasto = piezas.reduce((s, p) => s + p.gasto, 0);
  const resultados = piezas.reduce((s, p) => s + p.resultados, 0);
  return { gasto: r2(gasto), resultados, costo: resultados > 0 ? r2(gasto / resultados) : null };
};

/**
 * Qué rinde más barato para este cliente. `enPauta`: lo guardado (`anuncios_clientes.en_pauta`); `publicaciones`: las
 * publicaciones de ahora, opcional (mandan sobre lo recordado: ver `indiceDePosts`); `minGasto`: lo que tiene que haber
 * gastado una pieza para contar (si no, el que se explica arriba).
 * → { muestra, minimo, minGasto, tipoResultado, nombreResultado, moneda, porRasgo: { rasgo → [{ id, nombre, piezas,
 *     gasto, resultados, costo }] }, mejores: [{ rasgo, nombreRasgo, id, nombre, costo, total, piezas }], peores, linea,
 *     motivo }. Pura.
 */
export function preferenciasDeAnuncios(enPauta, publicaciones = null, { minGasto = null, nombres = {} } = {}) {
  const guardado = limpiarEnPauta(enPauta);
  const moneda = guardado.moneda || "USD";
  const todas = piezasDeAnuncios(guardado, publicaciones, { nombres }).filter((p) => p.gasto > 0);
  // El tipo de resultado que más se repite: sólo se compara lo comparable.
  const cuenta = new Map();
  for (const p of todas) if (p.tipoResultado) cuenta.set(p.tipoResultado, (cuenta.get(p.tipoResultado) ?? 0) + 1);
  const [tipoResultado = ""] = [...cuenta].sort((a, b) => b[1] - a[1])[0] ?? [];
  const delTipo = todas.filter((p) => p.tipoResultado === tipoResultado);
  const nombreResultado = delTipo[0]?.nombreResultado || "resultados";
  const tipica = mediana(delTipo.map((p) => p.gasto));
  const umbral = Number(minGasto) > 0
    ? Number(minGasto)
    : r2(Math.max(guardado.referencia ? VECES_NUMERO_MAGICO * guardado.referencia : 0, PARTE_DE_LA_MEDIANA * tipica));
  const muestra = delTipo.filter((p) => p.gasto >= umbral);

  const porRasgo = {};
  const mejores = [];
  const peores = [];
  for (const r of RASGOS) {
    const grupos = new Map();
    for (const p of muestra) {
      const id = p.rasgos[r.id];
      if (!id) continue;
      if (!grupos.has(id)) grupos.set(id, { id, nombre: p.nombres[r.id] || id, lista: [] });
      grupos.get(id).lista.push(p);
    }
    const lista = [...grupos.values()].map((g) => ({ id: g.id, nombre: g.nombre, piezas: g.lista.length, ...costoDe(g.lista) }))
      .sort((a, b) => (a.costo ?? Infinity) - (b.costo ?? Infinity));
    porRasgo[r.id] = lista;
    const validos = lista.filter((g) => g.piezas >= MIN_PIEZAS);
    if (validos.length < 2) continue;
    const total = costoDe(muestra.filter((p) => validos.some((g) => g.id === p.rasgos[r.id])));
    if (!(total.costo > 0)) continue;
    const mejor = validos[0];
    const peor = validos[validos.length - 1];
    if (mejor.costo != null && mejor.costo <= MAS_BARATO * total.costo) {
      mejores.push({ rasgo: r.id, nombreRasgo: r.nombre, id: mejor.id, nombre: mejor.nombre, costo: mejor.costo, total: total.costo, piezas: mejor.piezas });
    }
    if (peor !== mejor && (peor.costo == null || peor.costo >= MAS_CARO * total.costo)) {
      peores.push({ rasgo: r.id, nombreRasgo: r.nombre, id: peor.id, nombre: peor.nombre, costo: peor.costo, total: total.costo, piezas: peor.piezas });
    }
  }

  const d = (n) => formatoMoneda(n, moneda);
  const resultado = singularDe(nombreResultado);
  const articulo = (x) => (x.rasgo === "composicion" || x.rasgo === "etapa" ? "la" : "el");
  const dicho = (x, conTotal) => `${articulo(x)} ${x.nombreRasgo} «${x.nombre}» (${x.costo == null ? `sin ${nombreResultado}` : d(x.costo)}${conTotal ? ` frente a ${d(x.total)} del total` : ""})`;
  const partes = [
    mejores.length ? `sale más barato ${mejores.map((x) => dicho(x, true)).join(", ")}` : "",
    peores.length ? `sale más caro ${peores.map((x) => dicho(x, false)).join(", ")}` : "",
  ].filter(Boolean);
  const hay = partes.length > 0;
  const linea = hay
    ? `Lo que ya se probó en pauta con esta marca (costo por ${resultado}, últimos 30 días, ${muestra.length} piezas con gasto suficiente): ${partes.join("; ")}. Para lo que va a pauta, prefiere lo que sale más barato y evita lo más caro, pero deja una pieza de cada cuatro para probar algo distinto: con todo igual, Meta deja de distinguir los anuncios y no se sigue aprendiendo.`
    : "";
  const motivo = hay ? "" : !todas.length
    ? "Todavía no hay piezas del calendario que hayan corrido en el Ads Manager con gasto."
    : `Todavía no hay con qué comparar: hace falta que al menos dos valores de un mismo rasgo (tipo de arte, nivel, composición o etapa) tengan ${MIN_PIEZAS} piezas pautadas cada uno con gasto suficiente (${d(umbral)} o más en 30 días). Hoy cuentan ${muestra.length} de ${todas.length}.`;
  return { muestra: muestra.length, piezas: todas.length, minimo: MIN_PIEZAS, minGasto: umbral, tipoResultado, nombreResultado, moneda, porRasgo, mejores, peores, linea, motivo };
}
