// ============================================================
// Lo que aprende el cerebro de lo que pasa después de escribir
//
// Todo puro: cómo se cuentan y se cuentan en frases las señales
// (respuestas del cliente, resultados en redes, correcciones del equipo),
// y cómo se junta lo que devuelve «aprender del historial», que va de a
// pocos calendarios por vez.
// ============================================================

export const NOMBRE_SENAL = Object.freeze({
  respuesta: "Respuesta del cliente",
  metricas: "Resultado en redes",
  correccion: "Corrección del equipo",
});

/** Cómo salió, en palabras: el color solo no vale para quien no lo distingue. */
export function etiquetaDeResultado(resultado) {
  const r = Number(resultado);
  if (!Number.isFinite(r)) return { texto: "Sin valorar", nivel: "medio" };
  if (r >= 0.6) return { texto: "Salió bien", nivel: "bien" };
  if (r <= 0.4) return { texto: "Salió mal", nivel: "mal" };
  return { texto: "Regular", nivel: "medio" };
}

const CUPO_METRICAS = 3;

/**
 * Qué señales se enseñan de entrada: las últimas, pero sin que las decenas que deja UN botón de resultados en redes
 * tapen las respuestas y las correcciones. De los resultados se enseñan las más claras (las mejores y las peores); si
 * no hay otras con qué llenar, entran más.
 */
export function senalesParaMostrar(senales = [], n = 8) {
  const otras = senales.filter((s) => s.tipo !== "metricas");
  const claras = senales.filter((s) => s.tipo === "metricas").sort((a, b) => Math.abs(b.resultado - 0.5) - Math.abs(a.resultado - 0.5));
  const cupo = Math.min(claras.length, Math.max(CUPO_METRICAS, n - otras.length));
  const elegidas = [...otras.slice(0, n - Math.min(cupo, CUPO_METRICAS)), ...claras.slice(0, cupo)].slice(0, n);
  return elegidas.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")));
}

/** Cuántas hay de cada clase y cuántas salieron bien o mal. */
export function contarSenales(senales = []) {
  const c = { total: senales.length, bien: 0, mal: 0, porTipo: {} };
  for (const s of senales) {
    const { nivel } = etiquetaDeResultado(s.resultado);
    if (nivel === "bien") c.bien++;
    else if (nivel === "mal") c.mal++;
    c.porTipo[s.tipo] = (c.porTipo[s.tipo] ?? 0) + 1;
  }
  return c;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** «12 señales: 8 salieron bien y 3 mal». */
export function describirSenales(senales = []) {
  const c = contarSenales(senales);
  if (!c.total) return "Todavía no ha aprendido nada.";
  const partes = [];
  if (c.bien) partes.push(`${c.bien} ${c.bien === 1 ? "salió bien" : "salieron bien"}`);
  if (c.mal) partes.push(`${c.mal} ${c.mal === 1 ? "salió mal" : "salieron mal"}`);
  const resto = c.total - c.bien - c.mal;
  if (resto) partes.push(`${resto} ${resto === 1 ? "regular" : "regulares"}`);
  return `${plural(c.total, "señal", "señales")}: ${partes.join(", ")}.`;
}

/** Junta lo que va devolviendo «aprender del historial» calendario a calendario. */
export function acumularHistorial(acum, r) {
  const a = acum ?? { leidos: 0, total: 0, senales: 0, senalesNuevas: 0, creadas: 0, actualizadas: 0, conservadas: 0, quitadas: 0 };
  return {
    leidos: a.leidos + (r?.calendarios ?? 0),
    total: r?.total ?? a.total,
    senales: a.senales + (r?.senales ?? 0),
    senalesNuevas: a.senalesNuevas + (r?.senalesNuevas ?? 0),
    creadas: a.creadas + (r?.notas?.creadas ?? 0),
    actualizadas: a.actualizadas + (r?.notas?.actualizadas ?? 0),
    conservadas: a.conservadas + (r?.notas?.conservadas ?? 0),
    quitadas: a.quitadas + (r?.notas?.quitadas ?? 0),
  };
}

/** Lo que se le dice a la persona al terminar. */
export function describirHistorial(a) {
  if (!a || !a.senales) return "No había respuestas del cliente que leer.";
  const partes = [`Leyó ${plural(a.leidos, "calendario", "calendarios")} y encontró ${plural(a.senales, "respuesta", "respuestas")} del cliente`];
  if (a.creadas) partes.push(`dejó ${plural(a.creadas, "nota nueva", "notas nuevas")} con sus palabras`);
  if (a.actualizadas) partes.push(`${plural(a.actualizadas, "nota puesta", "notas puestas")} al día`);
  if (a.conservadas) partes.push(`${plural(a.conservadas, "corregida a mano se conservó", "corregidas a mano se conservaron")}`);
  if (a.quitadas) partes.push(`${plural(a.quitadas, "vieja se quitó", "viejas se quitaron")} para no pasar del tope`);
  return `${partes.join("; ")}.`;
}

/** Lo que se le dice a la persona cuando la IA acaba de proponer reglas. */
export function describirPropuestas(r) {
  if (r?.sinNovedades) return "No ha pasado nada nuevo desde la última vez —ninguna respuesta, resultado ni corrección—: no se gastó nada.";
  if (!r) return "";
  const partes = [];
  if (r.propuestas) partes.push(`Propuso ${plural(r.propuestas, "regla nueva", "reglas nuevas")}: ${r.propuestas === 1 ? "revísala abajo y decide" : "revísalas abajo y acepta las que valgan"}`);
  else if (r.sinReglas) partes.push("La IA no vio ninguna regla que valga la pena guardar con lo que hay");
  else partes.push("No quedó ninguna regla nueva");
  if (r.sinRespaldo) partes.push(`${plural(r.sinRespaldo, "quedó fuera por no tener el respaldo suficiente", "quedaron fuera por no tener el respaldo suficiente")}`);
  if (r.repetidas) partes.push(`${plural(r.repetidas, "ya estaba decidida o descartada", "ya estaban decididas o descartadas")}`);
  if (r.aviso) partes.push(r.aviso);
  return `${partes.join(". ")}.`;
}

/** «Se apoya en 2 casos» para el resumen desplegable de una regla: cada caso es una respuesta, un resultado o una corrección. */
export const textoDeRespaldo = (n) => (n === 1 ? "Se apoya en 1 caso" : `Se apoya en ${n} casos`);

const NOMBRE_RED = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok" };

/** Lo que se le dice a la persona cuando se compararon los resultados en redes. */
export function describirMetricas(r) {
  if (!r || !r.medidas) return "Este cliente todavía no tiene publicaciones medidas: cuando su cuenta esté conectada en Ajustes, las cifras llegan solas.";
  const dias = r.dias ?? 5;
  const madura = r.madurando ? ` ${plural(r.madurando, "publicación más es", "publicaciones más son")} de hace menos de ${dias} días y sus cifras todavía suben.` : "";
  if (!r.comparadas) {
    const pocas = Object.entries(r.pocas ?? {});
    if (pocas.length) {
      const dicen = pocas.map(([red, n]) => `${n} de ${NOMBRE_RED[red] ?? red}`).join(" y ");
      return `Con menos de ${r.minimo ?? 8} publicaciones medidas no se puede saber cuáles rinden más: hay ${dicen}.${madura}`;
    }
    return `Las ${r.medidas} publicaciones medidas son de hace menos de ${dias} días: sus cifras todavía suben. Vuelve en unos días.`;
  }
  const partes = [`Comparó ${plural(r.comparadas, "publicación", "publicaciones")} entre sí`];
  if (!r.senales) {
    partes.push("ninguna salió desde la aplicación, así que no se sabe qué notas se usaron para escribirlas");
  } else {
    partes.push(`${plural(r.senales, "salió", "salieron")} desde la aplicación y ${r.senales === 1 ? "quedó apuntada" : "quedaron apuntadas"}${r.senalesNuevas ? ` (${plural(r.senalesNuevas, "nueva", "nuevas")})` : ""}`);
    partes.push(r.reforzadas
      ? `las notas usadas para escribir ${r.reforzadas === 1 ? "esa publicación subieron" : `${r.reforzadas} de ellas subieron`} o bajaron en la búsqueda`
      : "de ninguna se sabe qué notas se usaron —se escribieron antes de que el cerebro lo apuntara—, así que la búsqueda no se movió");
    if (r.sinPublicacion) partes.push(`${plural(r.sinPublicacion, "no salió", "no salieron")} desde la aplicación y ${r.sinPublicacion === 1 ? "sólo sirvió" : "sólo sirvieron"} para comparar`);
  }
  return `${partes.join("; ")}.${madura}`;
}
