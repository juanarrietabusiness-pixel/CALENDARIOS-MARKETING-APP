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
