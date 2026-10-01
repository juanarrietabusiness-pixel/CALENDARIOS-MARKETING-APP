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

// ------------------------------------------------------------
// La hora que TECLEA una persona en el campo de la hora
// ------------------------------------------------------------
//
// El campo se toca y se escribe: «9», «930», «0930», «21:30», «9.30»,
// «9:30 pm». Lo que no lleve a. m. o p. m. y quepa en un reloj de 12 horas
// toma el periodo que esté marcado al lado; lo de 24 horas («21:30»,
// «0:15») se entiende solo.

/** «21:30» → { texto: "9:30", periodo: "pm" }; vacío si no hay hora. */
export function partesDeHora(valor) {
  const hhmm = normalizarHora(valor ?? "");
  if (!hhmm) return { texto: "", periodo: null };
  const [h, m] = hhmm.split(":").map(Number);
  return { texto: `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`, periodo: h >= 12 ? "pm" : "am" };
}

/**
 * Lo escrito → «HH:MM», con `periodo` («am» | «pm») para lo que no diga
 * cuál es. null si no se entiende (o si está vacío).
 */
export function leerHoraEscrita(texto, periodo = "am") {
  let t = String(texto ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  let sufijo = null;
  const suf = t.match(/(a|p)\.?m?\.?$/);
  if (suf && /\d/.test(t.slice(0, suf.index))) {
    sufijo = suf[1] === "a" ? "am" : "pm";
    t = t.slice(0, suf.index);
  }
  t = t.replace(/[.h]/g, ":");
  let h;
  let m;
  const conSeparador = t.match(/^(\d{1,2}):(\d{1,2})$/);
  if (conSeparador) {
    h = Number(conSeparador[1]);
    m = Number(conSeparador[2]);
  } else if (/^\d{1,4}$/.test(t)) {
    // «9» → 9:00 · «930» → 9:30 · «0930» / «2130» → 09:30 / 21:30
    if (t.length <= 2) { h = Number(t); m = 0; } else { h = Number(t.slice(0, -2)); m = Number(t.slice(-2)); }
  } else {
    return null;
  }
  if (m > 59) return null;
  // Con más de 12 (o las 0) es de 24 horas: el periodo no pinta nada, y
  // escribirlo («21 pm») es una contradicción.
  if (h > 12 || h === 0) return sufijo || h > 23 ? null : aTexto(h, m);
  return normalizarHora(`${h}:${String(m).padStart(2, "0")}${sufijo ?? periodo}`);
}
