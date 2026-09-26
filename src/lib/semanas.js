// ============================================================
// La vista de lista, por semanas (puro)
//
// La lista pintaba los treinta días del mes uno tras otro: interminable
// en el teléfono. Ahora se agrupa por semana, cada una con su resumen
// —cuántas publicaciones, cuántas aprobadas, cuántas faltan— y sólo la
// que toca abierta.
//
// La semana es la del CALENDARIO (`weekNumber`, la que lleva el concepto
// de la planificación). Un día sin ese dato —añadido a mano o por el
// asistente— cae en la semana natural que le toca, de lunes a domingo,
// contada desde el primer día del mes.
// ============================================================

/** Semana natural (lunes a domingo) de una fecha dentro de su mes: 1, 2, 3… */
export function semanaDelMes(fecha) {
  const d = new Date(`${fecha}T12:00:00Z`);
  const primero = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
  const desfase = (primero.getUTCDay() + 6) % 7; // 0 = lunes
  return Math.floor((d.getUTCDate() - 1 + desfase) / 7) + 1;
}

const esAprobada = (p) => p?.status === "approved" || p?.status === "published";

/**
 * Los días agrupados por semana, en orden, con su resumen. Cada grupo:
 * { numero, desde, hasta, concepto, dias, total, aprobadas, publicadas, cambios, pendientes }.
 */
export function agruparPorSemana(days = []) {
  const grupos = new Map();
  for (const dia of days) {
    if (!dia?.date) continue;
    const numero = Number(dia.weekNumber) || semanaDelMes(dia.date);
    if (!grupos.has(numero)) grupos.set(numero, { numero, dias: [], concepto: "" });
    const g = grupos.get(numero);
    g.dias.push(dia);
    if (!g.concepto && dia.concept) g.concepto = dia.concept;
  }
  return [...grupos.values()]
    .sort((a, b) => a.numero - b.numero)
    .map((g) => {
      const dias = [...g.dias].sort((a, b) => (a.date < b.date ? -1 : 1));
      const posts = dias.flatMap((d) => d.posts ?? []);
      return {
        ...g,
        dias,
        desde: dias[0].date,
        hasta: dias[dias.length - 1].date,
        total: posts.length,
        aprobadas: posts.filter(esAprobada).length,
        publicadas: posts.filter((p) => p?.status === "published").length,
        cambios: posts.filter((p) => p?.status === "rejected").length,
        pendientes: posts.filter((p) => !p?.status || p.status === "pending").length,
      };
    });
}

/**
 * Qué semana se abre al entrar: la que contiene hoy; si el mes ya pasó, la
 * última; si no ha empezado, la primera.
 */
export function semanaInicial(grupos = [], hoy = "") {
  if (!grupos.length) return null;
  const actual = grupos.find((g) => g.desde <= hoy && hoy <= g.hasta)
    ?? grupos.find((g) => g.desde > hoy);
  return (actual ?? grupos[grupos.length - 1]).numero;
}

/** «7 – 13 oct» o «29 sept – 4 oct», para la cabecera de la semana. */
export function rangoSemana(desde, hasta) {
  const f = (x, conMes) => new Date(`${x}T12:00:00Z`).toLocaleDateString("es-PA", { timeZone: "UTC", day: "numeric", ...(conMes ? { month: "short" } : {}) });
  if (desde === hasta) return f(desde, true);
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  return `${f(desde, !mismoMes)} – ${f(hasta, true)}`;
}
