// ============================================================
// La hora que dice el modelo y la hora que guarda la aplicación
//
// `publishTime` se guarda como «HH:MM» en 24 horas, que es lo que
// produce un `<input type="time">`. Pero al asistente se le pide la hora
// hablando, y un modelo escribe «9am», «9:00 PM», «21:30», «6 pm» o
// «9» según le venga —y todas quieren decir algo perfectamente claro—.
//
// POR QUÉ NORMALIZAR EN VEZ DE EXIGIR EL FORMATO
//
// Se puede poner «formato HH:MM» en la descripción de la herramienta y
// confiar. El día que el modelo escriba «9:00 AM», eso entra tal cual en
// el campo, el `<input type="time">` no sabe leerlo y **lo muestra
// vacío**: la hora se «guardó» y no está. Nadie ve un error. Es más
// barato aceptar lo que escriba y traducirlo aquí, en un sitio, con
// tests.
//
// Lo que NO se acepta se rechaza en alto: `normalizarHora` devuelve
// `null` y quien la llama responde a la IA que no entendió la hora, en
// vez de guardar basura.
// ============================================================

/** Minutos desde medianoche → «HH:MM». */
const aTexto = (h, m) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/**
 * Traduce lo que sea que haya escrito el modelo a «HH:MM» de 24 horas.
 *
 * Acepta «9», «9:30», «09:30», «21:30», «9am», «9 AM», «9:30 p.m.»,
 * «9:30pm», y tolera espacios y puntos. Devuelve `null` si no lo
 * entiende: 25:00, 12:61, «por la mañana», vacío.
 *
 * Las 12 son el caso que se equivoca solo: 12am son las 00:00 y 12pm son
 * las 12:00, al revés de lo que sale de restar o sumar doce.
 */
export function normalizarHora(valor) {
  if (typeof valor !== "string") return null;

  const limpio = valor.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (!limpio) return null;

  const m = limpio.match(/^(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)?$/);
  if (!m) return null;

  let horas = Number(m[1]);
  const minutos = m[2] === undefined ? 0 : Number(m[2]);
  const sufijo = m[3];

  if (!Number.isInteger(horas) || !Number.isInteger(minutos)) return null;
  if (minutos > 59) return null;

  if (sufijo) {
    // Con am/pm el reloj es de 12: «13pm» no significa nada.
    if (horas < 1 || horas > 12) return null;
    if (sufijo === "am") horas = horas === 12 ? 0 : horas;
    else horas = horas === 12 ? 12 : horas + 12;
  } else if (horas > 23) {
    return null;
  }

  return aTexto(horas, minutos);
}

/** «HH:MM» → «9:30 AM», para contarle a la IA lo que ya hay puesto. */
export function hora12(valor) {
  const hhmm = normalizarHora(valor);
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const sufijo = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${sufijo}`;
}
