// ============================================================
// Las fechas especiales que se acercan: para «De temporada» y el aviso del mes (puro)
//
// Va en la carga inicial (el aviso está en el calendario): lo que sólo usa el panel de una publicación —los textos de
// los modos de foto y de cada temporada— vive en modosFoto.js.
//
// La temporada reutiliza una pieza que funciona para una fecha especial del cliente que se acerca (Navidad, Black
// Friday, Día de la Madre…). Las fechas son las del cliente (fechasEspeciales.js: sin las ocultas, sin las
// internacionales que no escogió) y nunca una delicada: ahí no se hace promoción.
//
// Lo usan la pestaña Subir (calendario/seccionPublicar.jsx) y el aviso del mes (calendario/avisoTemporada.jsx).
// ============================================================

import { fechasDelMes } from "./fechasEspeciales";
import { sumarDias, diasEntre } from "./agenda";

/**
 * Las fechas especiales del cliente que vienen (de hoy a `dias` adelante), sin las delicadas ni las internacionales que
 * no escogió, en orden. Cada una: { id, fecha, nombre, tipo, destacada, faltan }. Pura.
 * @param guardado `client.fechasEspeciales`
 * @param hoy      "AAAA-MM-DD" (el de Panamá: fechaEnZona())
 */
export function fechasQueVienen(guardado, hoy, { dias = 45, max = 4 } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(hoy ?? ""))) return [];
  const hasta = sumarDias(hoy, dias);
  const meses = [];
  for (let a = +hoy.slice(0, 4), m = +hoy.slice(5, 7) - 1; `${a}-${String(m + 1).padStart(2, "0")}` <= hasta.slice(0, 7) && meses.length < 4; m = (m + 1) % 12, a += m === 0 ? 1 : 0) {
    meses.push([a, m]);
  }
  const todas = meses
    .flatMap(([a, m]) => fechasDelMes(a, m, guardado))
    .filter((f) => !f.delicada && f.fecha >= hoy && f.fecha <= hasta)
    .filter((f, i, l) => l.findIndex((x) => x.id === f.id && x.fecha === f.fecha) === i)
    .map((f) => ({ ...f, faltan: diasEntre(hoy, f.fecha) }));
  // Primero las que venden (comerciales, propias, escogidas) y luego los feriados: en noviembre los cinco feriados
  // patrios dejaban fuera al Black Friday. Lo que queda, por fecha.
  return [...todas.filter(vende), ...todas.filter((f) => !vende(f))].slice(0, max).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

/** ¿Es una fecha para vender? (no un feriado sin más). */
const vende = (f) => f.tipo === "comercial" || f.tipo === "propia" || f.destacada;

/** «faltan 9 días», «es mañana», «es hoy». Pura. */
export const fraseDeFalta = (faltan) => (faltan <= 0 ? "es hoy" : faltan === 1 ? "es mañana" : `faltan ${faltan} días`);

/**
 * La fecha que merece el AVISO del mes: la comercial, propia o escogida más cercana en las próximas tres semanas (un
 * feriado sin más no avisa: no todos venden). Null si ninguna. Pura.
 */
export function fechaParaAvisar(guardado, hoy, { dias = 21 } = {}) {
  return fechasQueVienen(guardado, hoy, { dias, max: 10 }).find(vende) ?? null;
}
