// ============================================================
// Exportación del contenido de un calendario
//
// Sustituye al exportador de prompts visuales, que sacaba el prompt de
// imagen de cada publicación y poco más. Lo que hace falta pegar en el
// sitio donde se diseña y se programa es la ficha entera: formato, fecha
// y hora, idea, guion (para reels y carruseles), descripción y hashtags.
//
// Y entera de verdad. Una publicación a la que le falte la descripción o
// los hashtags no se exporta a medias: una idea suelta no se puede
// producir, y un archivo con la mitad de las fichas incompletas se lee
// como un fallo del exportador. Se quedan fuera y se cuentan aparte, con
// el nombre de lo que les falta, para poder ir a escribirlo.
//
// Vive aquí y no dentro del componente porque es puro: entran datos,
// sale texto. Así se puede probar sin montar React ni Supabase.
// ============================================================

import { FORMATS, MONTHS } from "../constants";

/** Los formatos que se exportan si nadie toca nada: los que se diseñan. */
export const FORMATOS_EXPORTABLES_POR_DEFECTO = ["post", "carrusel"];

/**
 * Los hashtags de una publicación.
 *
 * `hashtagsFinales` casi siempre viene vacío: el prompt de generación los
 * pide DENTRO del caption, al final, y así es como los escribe el modelo.
 * Cuando no está suelto se recogen del propio texto, sin repetirlos y en
 * el orden en que aparecen.
 */
export function hashtagsDe(post) {
  const sueltos = (post?.hashtagsFinales || "").trim();
  if (sueltos) return sueltos;
  const texto = post?.descripcion || post?.script || "";
  const encontrados = texto.match(/#[\p{L}\p{N}_]+/gu) || [];
  return [...new Set(encontrados)].join(" ");
}

/**
 * «lunes 4 de agosto de 2026».
 *
 * Se parte la cadena en vez de construir un Date: `day.date` ya es la
 * fecha local del calendario, y pasarla por Date para volver a formatearla
 * es justo lo que desplaza el día en medio mundo.
 */
export function fechaLarga(day) {
  const [anio, mes, dia] = (day?.date || "").split("-");
  const nombreMes = (MONTHS[Number(mes) - 1] || "").toLowerCase();
  const diaSemana = day?.dayName ? `${day.dayName} ` : "";
  return `${diaSemana}${Number(dia)} de ${nombreMes} de ${anio}`;
}

/**
 * Arma el texto de la exportación y dice qué se quedó fuera.
 *
 * @param days      los días del calendario, con sus publicaciones
 * @param formatos  claves de FORMATS que entran
 * @param ahora     se pasa para poder fijarla en los tests
 */
/** Los formatos que llevan guion y hay que exportarlo. */
const FORMATOS_CON_GUION = new Set(["reel", "carrusel", "historia", "live"]);

export function construirExportacion({ days = [], formatos = [], cliente = "", calendario = "", ahora = new Date() }) {
  const piezas = [];
  const incompletas = [];

  for (const day of days) {
    for (const post of day.posts || []) {
      if (!formatos.includes(post.format)) continue;

      const idea = (post.idea || "").trim();
      const guion = (post.guion || "").trim();
      const descripcion = (post.descripcion || post.script || "").trim();
      const hashtags = hashtagsDe(post);
      const necesitaGuion = FORMATOS_CON_GUION.has(post.format);

      const falta = [];
      if (!idea) falta.push("idea");
      if (necesitaGuion && !guion) falta.push("guion");
      if (!descripcion) falta.push("descripción");
      if (!hashtags) falta.push("hashtags");
      if (falta.length) {
        incompletas.push({ day, post, falta });
        continue;
      }

      piezas.push({ day, post, idea, guion, descripcion, hashtags });
    }
  }

  if (!piezas.length) {
    return { texto: "", completas: 0, incompletas };
  }

  const lineas = [];
  piezas.forEach(({ day, post, idea, guion, descripcion, hashtags }, i) => {
    const fmt = FORMATS[post.format] || FORMATS.post;
    lineas.push("═══════════════════════════════════════");
    lineas.push(`${i + 1} · ${fmt.label.toUpperCase()}`);
    lineas.push(`FECHA: ${fechaLarga(day)}`);
    lineas.push(`HORA: ${post.publishTime || "sin hora asignada"}`);
    const categoria = post.category || day.category;
    if (categoria) lineas.push(`CATEGORÍA: ${categoria}`);
    lineas.push("───────────────────────────────────────");
    lineas.push("IDEA:");
    lineas.push(idea);
    lineas.push("");
    if (guion) {
      lineas.push("GUION:");
      lineas.push(guion);
      lineas.push("");
    }
    lineas.push("DESCRIPCIÓN:");
    lineas.push(descripcion);
    lineas.push("");
    lineas.push("HASHTAGS:");
    lineas.push(hashtags);
    lineas.push("");
  });

  const etiquetas = formatos.map((f) => FORMATS[f]?.label || f).join(", ");
  const cabecera = [
    `CONTENIDO DEL CALENDARIO — ${cliente}`,
    calendario,
    `Formatos: ${etiquetas || "ninguno"}`,
    `${piezas.length} publicaciones completas`,
    `Generado: ${ahora.toLocaleString()}`,
    "",
    "",
  ].join("\n");

  return { texto: cabecera + lineas.join("\n"), completas: piezas.length, incompletas };
}
