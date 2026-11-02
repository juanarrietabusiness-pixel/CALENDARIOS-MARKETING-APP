// ============================================================
// Las notas fijas de cada día de la semana de una empresa (puro)
//
// Lo que se repite todas las semanas y no es un formato ni un tipo: «los
// lunes, muebles y camas» en D'CASA, «los miércoles, promo Feria Chorrera»
// en Feria del Lente. Van en su columna (`clients.notas_semana`, 0051), NO
// dentro del plan semanal: el plan son los formatos y tipos, y «Volver al
// estándar de la agencia» lo borra; las notas no las toca nadie más que
// quien las escribe. Una nota no cambia ni el formato ni el tipo del día:
// es el TEMA de ese día para la IA, y si nombra un producto del catálogo,
// ese día va con ese producto. También lo importa el Worker.
// ============================================================

export const MAX_NOTA_DIA = 120;

const normal = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** { "0".."6" → texto } limpio: sólo los días con algo, una línea, con tope. Null si no queda nada. Pura. */
export function limpiarNotasSemana(x) {
  const salida = {};
  if (x && typeof x === "object") {
    for (let dow = 0; dow < 7; dow++) {
      const t = String(x[dow] ?? x[String(dow)] ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTA_DIA);
      if (t) salida[dow] = t;
    }
  }
  return Object.keys(salida).length ? salida : null;
}

/** El día de la semana (0 domingo … 6 sábado) de una «AAAA-MM-DD», sin zona horaria. Pura. */
export function diaDeLaSemana(fecha) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha ?? ""));
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay() : -1;
}

/** La nota fija del día de esa fecha, o "". Pura. */
export function notaDelDia(notas, fecha) {
  const dow = diaDeLaSemana(fecha);
  return dow < 0 ? "" : limpiarNotasSemana(notas)?.[dow] ?? "";
}

/**
 * El producto del catálogo que nombra la nota («Promo camas» → «Camas»): el de nombre más largo que aparezca entero,
 * sin tildes ni mayúsculas. Null si no nombra ninguno. Pura.
 */
export function productoDeNota(nota, productos = []) {
  const texto = ` ${normal(nota).replace(/[^\p{L}\p{N} ]/gu, " ")} `;
  return (productos ?? [])
    .filter((p) => p?.id && normal(p.nombre).length >= 3)
    .filter((p) => texto.includes(` ${normal(p.nombre).replace(/[^\p{L}\p{N} ]/gu, " ")} `))
    .sort((a, b) => normal(b.nombre).length - normal(a.nombre).length)[0] ?? null;
}

/**
 * Las casillas del motor de ideas con la nota de su día (`notaDia`) y, si la nota nombra un producto de `productos` y
 * la casilla aún no lleva uno, ese producto. Lo que ya decidió una persona (su producto) no se toca. Pura.
 */
export function conNotasDelDia(casillas = [], notas = null, productos = []) {
  const limpias = limpiarNotasSemana(notas);
  if (!limpias) return casillas;
  return casillas.map((c) => {
    const nota = c?.fecha ? notaDelDia(limpias, c.fecha) : "";
    if (!nota) return c;
    const prod = c.productoId ? null : productoDeNota(nota, productos);
    return { ...c, notaDia: nota, ...(prod ? { productoId: prod.id, producto: prod.nombre } : {}) };
  });
}

/** La línea que lee la IA en cada pieza de ese día. Pura. */
export const lineaDeNotaDelDia = (nota) =>
  nota ? `nota fija de este día de la semana (el TEMA del día; no cambia el formato ni el tipo): ${String(nota).slice(0, MAX_NOTA_DIA)}` : "";
