// ============================================================
// El mapa del cerebro: lo que decide qué se ve y cómo se explora
//
// Todo puro. Convierte lo que devuelve /api/cerebro/<cliente>/grafo en el
// modelo que dibuja el lienzo (`components/cerebro3d/escena.js`), y
// responde a lo que pide el panel: qué notas se ven según los filtros,
// cuáles coinciden con una búsqueda, quiénes son las vecinas de una nota
// y a cuáles ponerles nombre encima.
//
// El COLOR sale del tipo de la nota; el LÓBULO (la región del cerebro),
// del grupo —el archivo de donde salió—. Un color por tipo se lee igual
// que los filtros de la lista, y un lóbulo por archivo junta lo que ya
// iba junto. El lienzo es siempre oscuro (los brillos suman luz, y sobre
// blanco desaparecerían), así que estos colores no dependen del tema.
// ============================================================

import { TIPOS_VISTA, sinTildes } from "./cerebroVista";

/** Color de cada tipo sobre el fondo oscuro del lienzo. Los mismos en la leyenda, en los filtros y en los puntos. */
export const COLOR_TIPO = Object.freeze({
  ficha: "#FFC46B",
  cifras: "#3DDC97",
  marca: "#6EA8FF",
  maquetacion: "#B58CFF",
  documento: "#5FD6E8",
  nota: "#F2F4F8",
  decision: "#FF8FB1",
  borrador: "#8791A8",
});
/** Las menciones (una nota nombra a otra sin enlazarla) son tenues y frías; las internas llevan un anillo cálido. */
export const COLOR_MENCION = "#8FA8FF";
export const COLOR_INTERNA = "#FF9F5A";
/** Lo aprendido de lo que pasó después de escribir: dos notas usadas juntas en algo que salió bien. Dorado, como la ficha. */
export const COLOR_APRENDIDA = "#FFC46B";

export const colorDeNota = (nota) => COLOR_TIPO[nota?.tipo] ?? COLOR_TIPO.nota;

/**
 * La respuesta del servidor → el modelo del mapa: cada nota con su lugar en la lista (`i`, con el que se
 * conectan las líneas), su grupo (`g`) y un texto sin tildes para buscar. Las conexiones que apunten a una nota
 * que no está se descartan: un índice suelto haría que una línea saliera de la nada.
 */
export function armarGrafo(respuesta) {
  const notas = Array.isArray(respuesta?.notas) ? respuesta.notas : [];
  const nodos = notas.map((n, i) => ({
    ...n,
    i,
    g: n.grupo || "Sin grupo",
    d: Number(n.d) || 0,
    peso: Number.isFinite(n.peso) ? n.peso : null,
    buscable: sinTildes(`${n.titulo} ${n.resumen ?? ""} ${n.ruta ?? ""} ${n.grupo ?? ""}`),
  }));
  const valida = ([a, b]) => Number.isInteger(a) && Number.isInteger(b) && a !== b && nodos[a] && nodos[b];
  return {
    nodos,
    enlaces: (respuesta?.enlaces ?? []).filter(valida),
    menciones: (respuesta?.menciones ?? []).filter(valida),
    // Las aprendidas llevan además su peso (0–1): un peso que no es número no dibuja una línea.
    aprendidas: (respuesta?.aprendidas ?? []).filter((x) => valida(x) && Number.isFinite(x[2])),
  };
}

/** Los filtros de partida: se ve todo. */
export const FILTROS_INICIALES = Object.freeze({ tiposOcultos: new Set(), soloInternas: false, menciones: true, aprendidas: true });

/** ¿Esta nota se dibuja con estos filtros? */
export function esVisible(nota, filtros = FILTROS_INICIALES) {
  if (filtros.tiposOcultos?.has(nota.tipo)) return false;
  if (filtros.soloInternas && !nota.interna) return false;
  return true;
}

/**
 * Las notas que responden a lo escrito: todas sus palabras, sin tildes ni mayúsculas, en el título, el resumen, la ruta
 * o el grupo. → Set de `i`, o null si no se escribió nada (nada que resaltar: se distingue de «nada coincide»).
 */
export function coincidencias(nodos, texto, extra = null) {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length && !(extra && extra.size)) return null;
  const salida = new Set(extra ?? []);
  if (palabras.length) for (const n of nodos) if (palabras.every((p) => n.buscable.includes(p))) salida.add(n.i);
  return salida;
}

/** Las vecinas de una nota: primero las que alguien enlazó, luego las mencionadas; las más conectadas antes. */
export function vecinas(grafo, i) {
  const salida = [];
  const visto = new Set();
  for (const [clase, lista] of [["enlace", grafo.enlaces], ["mencion", grafo.menciones]]) {
    for (const [a, b] of lista) {
      const otra = a === i ? b : b === i ? a : null;
      if (otra === null || visto.has(otra)) continue;
      visto.add(otra);
      salida.push({ nota: grafo.nodos[otra], clase });
    }
  }
  return salida.sort((x, y) => (x.clase === y.clase ? y.nota.d - x.nota.d || x.nota.titulo.localeCompare(y.nota.titulo, "es") : x.clase === "enlace" ? -1 : 1));
}

/**
 * A qué notas ponerles el nombre encima, por orden de importancia (el lienzo deja fuera las que se pisarían, y gana
 * la primera de la lista): la elegida, sus vecinas, las que coinciden con la búsqueda y los centros del cerebro.
 */
export function etiquetasPara(grafo, { elegida = null, coinciden = null, centros = 8, max = 28 } = {}) {
  const lista = [];
  const visto = new Set();
  const poner = (n) => { if (n && !visto.has(n.i) && lista.length < max) { visto.add(n.i); lista.push(n); } };
  if (elegida) {
    poner(elegida);
    vecinas(grafo, elegida.i).forEach((v) => poner(v.nota));
  }
  if (coinciden) [...coinciden].slice(0, 14).forEach((i) => poner(grafo.nodos[i]));
  [...grafo.nodos].sort((a, b) => b.d - a.d).slice(0, centros).forEach(poner);
  return lista;
}

/** Cuántas notas hay de cada tipo, en el orden de la leyenda, con su color y su nombre. */
export function regiones(nodos) {
  const cuenta = new Map();
  for (const n of nodos) cuenta.set(n.tipo, (cuenta.get(n.tipo) ?? 0) + 1);
  return Object.keys(TIPOS_VISTA)
    .filter((t) => cuenta.has(t))
    .map((tipo) => ({ tipo, nombre: TIPOS_VISTA[tipo].nombre, color: COLOR_TIPO[tipo], n: cuenta.get(tipo) }));
}

/** La línea de cifras de arriba del mapa. */
export function resumenDelMapa(grafo) {
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const base = `${plural(grafo.nodos.length, "nota", "notas")} · ${plural(grafo.enlaces.length, "enlace", "enlaces")} · ${plural(grafo.menciones.length, "mención", "menciones")}`;
  return grafo.aprendidas?.length ? `${base} · ${plural(grafo.aprendidas.length, "aprendida", "aprendidas")}` : base;
}

/**
 * ¿Hay tan pocas conexiones que el mapa parece un montón de puntos? El ADN de las agencias no trae ni un [[enlace]]
 * —la ficha técnica que escribe la IA es lo que los crea—, y sin conexiones el cerebro no se distingue de una lista.
 */
export function pocasConexiones(grafo) {
  return grafo.nodos.length >= 6 && grafo.enlaces.length + grafo.menciones.length < grafo.nodos.length / 4;
}
