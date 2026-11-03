// ============================================================
// Markdown de las notas, en bloques para pintar (puro)
//
// Las notas del cerebro vienen del repositorio en Markdown: leídas en un cuadro
// de texto eran asteriscos, almohadillas y tablas con barras. Esto las parte en
// bloques (título, párrafo, lista, tabla, cita, línea) con su texto en trozos
// (negrita, código, enlace a otra nota `[[ruta]]`, enlace web) que la pantalla
// pinta con elementos de React: nada de HTML inyectado, así una nota no puede
// meter código en la página.
// ============================================================

/** Un texto en trozos: { t: "texto"|"negrita"|"cursiva"|"codigo"|"nota"|"enlace", v, url? } */
export function trozos(texto) {
  const salida = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[\[([^\]]+)\]\]|\[([^\]]+)\]\((https?:\/\/[^)\s]+|[^)\s]+)\)|(?<![*\w])\*([^*\n]+)\*(?![*\w]))/g;
  let i = 0;
  for (const m of String(texto ?? "").matchAll(re)) {
    if (m.index > i) salida.push({ t: "texto", v: texto.slice(i, m.index) });
    if (m[2]) salida.push({ t: "negrita", v: m[2] });
    else if (m[3]) salida.push({ t: "codigo", v: m[3] });
    else if (m[4]) salida.push({ t: "nota", v: m[4].trim() });
    else if (m[5]) {
      // Sólo los enlaces web son enlaces; uno relativo («05_flota.md») se queda como texto.
      if (/^https?:\/\//.test(m[6])) salida.push({ t: "enlace", v: m[5], url: m[6] });
      else salida.push({ t: "texto", v: m[5] });
    } else if (m[7]) salida.push({ t: "cursiva", v: m[7] });
    i = m.index + m[0].length;
  }
  if (i < String(texto ?? "").length) salida.push({ t: "texto", v: texto.slice(i) });
  return salida;
}

const celdas = (linea) => linea.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const esSeparador = (linea) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linea);

/**
 * Los bloques de una nota.
 * @returns {Array<{ tipo: "titulo", nivel: number, texto } | { tipo: "parrafo", texto } | { tipo: "lista", ordenada, items: string[] }
 *   | { tipo: "tabla", cabecera: string[], filas: string[][] } | { tipo: "cita", texto } | { tipo: "linea" }>}
 */
export function bloques(texto) {
  const lineas = String(texto ?? "").replace(/\r\n?/g, "\n").split("\n");
  const salida = [];
  let parrafo = [];
  const cerrarParrafo = () => {
    if (parrafo.length) salida.push({ tipo: "parrafo", texto: parrafo.join(" ") });
    parrafo = [];
  };
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (!l.trim()) { cerrarParrafo(); continue; }
    const titulo = l.match(/^(#{1,6})\s+(.*)$/);
    if (titulo) { cerrarParrafo(); salida.push({ tipo: "titulo", nivel: titulo[1].length, texto: titulo[2].trim() }); continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { cerrarParrafo(); salida.push({ tipo: "linea" }); continue; }
    if (/^\s*\|/.test(l) && i + 1 < lineas.length && esSeparador(lineas[i + 1])) {
      cerrarParrafo();
      const cabecera = celdas(l);
      const filas = [];
      i += 2;
      while (i < lineas.length && /^\s*\|/.test(lineas[i])) filas.push(celdas(lineas[i++]));
      i--;
      salida.push({ tipo: "tabla", cabecera, filas });
      continue;
    }
    const item = l.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (item) {
      cerrarParrafo();
      const ordenada = /\d/.test(item[1]);
      const previo = salida.at(-1);
      if (previo?.tipo === "lista" && previo.ordenada === ordenada) previo.items.push(item[2]);
      else salida.push({ tipo: "lista", ordenada, items: [item[2]] });
      continue;
    }
    const cita = l.match(/^\s*>\s?(.*)$/);
    if (cita) { cerrarParrafo(); salida.push({ tipo: "cita", texto: cita[1] }); continue; }
    parrafo.push(l.trim());
  }
  cerrarParrafo();
  return salida;
}
