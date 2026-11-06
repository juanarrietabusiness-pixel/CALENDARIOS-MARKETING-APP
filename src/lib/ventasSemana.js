// ============================================================
// «Tus ventas de la semana»: lo que el cliente apunta por su enlace (curso de campañas, entrega 4, E.1)
//
// Meta ve las conversaciones que empieza un anuncio a WhatsApp, pero NO las ventas que se cierran por mensaje. Sin
// ellas no hay tasa de cierre ni ROAS de verdad, y muchos clientes no las pasan. La agencia decidió un enlace fijo
// por cliente, sin sesión, que se llena en 30 segundos desde el teléfono cada semana (`/ventas?t=…`), y que la
// agencia también puede escribir desde la app si se lo dicen por llamada.
//
// Puro: lo usan la página del cliente, la pantalla de la agencia (Números del negocio) y el Worker, que vuelve a
// limpiar todo lo que llega (lo que manda el navegador no se cree).
//
// LAS SEMANAS
//
// Una semana es su LUNES, «AAAA-MM-DD», en la hora de Panamá (agenda.js, nunca toISOString()). El cliente escribe la
// semana actual y las dos anteriores; la agencia ve y corrige ocho.
//
// LA TASA DE CIERRE MEDIDA
//
// Ventas ÷ conversaciones que empezó la pauta, sobre las últimas 4 semanas con ventas apuntadas. Las ventas de una
// semana suelen venir de conversaciones de la ANTERIOR (alguien escribe el jueves y compra el lunes), así que cada
// semana de ventas se cruza con las conversaciones de la semana de antes: 4 semanas de cada lado. Si el cliente dijo
// cuántas vinieron de los anuncios, cuentan ésas; si no, todas las que cerró por WhatsApp.
// ============================================================

import { fechaEnZona, sumarDias, diaSemana, diasEntre, esFecha } from "./agenda.js";
import { MONTHS } from "../constants.js";

/** Las semanas que puede escribir el cliente por su enlace: la actual y las dos anteriores. */
export const VENTANA_CLIENTE = 3;
/** Las que ve y corrige la agencia. */
export const SEMANAS_AGENCIA = 8;
/** Sobre cuántas semanas con ventas se mide la tasa de cierre. */
export const SEMANAS_TASA = 4;
/** La tasa de cierre que se usa mientras no se mide la del cliente (la del curso: 5 de cada 100 conversaciones). */
export const TASA_POR_DEFECTO = 0.05;
/** Por debajo de esto, la tasa medida se dice «con pocos datos» y no sustituye a la de por defecto. */
export const MIN_CONVERSACIONES_TASA = 20;
export const MIN_SEMANAS_TASA = 2;
/** Más que esto de cierre suele querer decir que se cuentan ventas que no vinieron de los anuncios. */
export const TASA_SOSPECHOSA = 0.5;

export const MAX_VENTAS = 100_000;
export const MAX_MONTO = 10_000_000;
export const MAX_NOTA = 280;

const mes = (f) => MONTHS[Number(f.slice(5, 7)) - 1].toLowerCase();
const dia = (f) => Number(f.slice(8, 10));
const anio = (f) => f.slice(0, 4);

// ------------------------------------------------------------
// Las semanas
// ------------------------------------------------------------

/** El lunes de la semana de una fecha «AAAA-MM-DD» (la misma si ya es lunes), o "" si no es una fecha. Pura. */
export function lunesDe(fecha) {
  if (!esFecha(fecha)) return "";
  return sumarDias(fecha, -((diaSemana(fecha) + 6) % 7));
}

/** El lunes de esta semana en Panamá. */
export const lunesDeHoy = (momento = new Date()) => lunesDe(fechaEnZona(momento));

/** El domingo con que termina la semana de ese lunes. */
export const finDeSemana = (lunes) => sumarDias(lunes, 6);

/** `n` semanas hacia atrás desde la de `lunes`, la más nueva primero. Pura. */
export function semanasHacia(lunes, n) {
  const base = lunesDe(lunes);
  if (!base) return [];
  return Array.from({ length: Math.max(0, n) }, (_, i) => sumarDias(base, -7 * i));
}

/** Las semanas que puede escribir el cliente hoy (la actual y las dos anteriores). Pura. */
export const ventanaDelCliente = (hoy) => semanasHacia(lunesDe(hoy), VENTANA_CLIENTE);

/**
 * La semana que se le pregunta al cliente: de lunes a miércoles, la que acaba de terminar (el mensaje sale los lunes
 * y pregunta por la semana pasada); de jueves a domingo, la que va. Pura.
 */
export function semanaQueToca(hoy) {
  const lunes = lunesDe(hoy);
  if (!lunes) return "";
  const d = diaSemana(hoy);
  return d >= 1 && d <= 3 ? sumarDias(lunes, -7) : lunes;
}

/** «del 2 al 8 de noviembre», «del 30 de noviembre al 6 de diciembre» (y el año si cambia). Pura. */
export function etiquetaSemana(lunes) {
  if (!esFecha(lunes)) return "";
  const fin = finDeSemana(lunes);
  if (anio(lunes) !== anio(fin)) return `del ${dia(lunes)} de ${mes(lunes)} de ${anio(lunes)} al ${dia(fin)} de ${mes(fin)} de ${anio(fin)}`;
  if (lunes.slice(5, 7) !== fin.slice(5, 7)) return `del ${dia(lunes)} de ${mes(lunes)} al ${dia(fin)} de ${mes(fin)}`;
  return `del ${dia(lunes)} al ${dia(fin)} de ${mes(fin)}`;
}

/** «Esta semana», «La semana pasada», «Hace 2 semanas»… o la etiqueta si es más vieja. Pura. */
export function nombreSemana(lunes, hoy) {
  const actual = lunesDe(hoy);
  if (!esFecha(lunes) || !actual) return "";
  const atras = Math.round(diasEntre(lunes, actual) / 7);
  if (atras === 0) return "Esta semana";
  if (atras === 1) return "La semana pasada";
  if (atras > 1 && atras < 5) return `Hace ${atras} semanas`;
  return `Semana ${etiquetaSemana(lunes)}`;
}

// ------------------------------------------------------------
// Lo que se escribe
// ------------------------------------------------------------

/**
 * Un entero de lo que se teclea («12», «1,200»); null si está vacío, NaN si no es un entero. Un separador sólo vale
 * como de miles (grupos de tres): «1.5» ventas no es 15 ni 1. Pura.
 */
export function leerEntero(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && Number.isInteger(v) ? v : NaN;
  const t = String(v).trim().replace(/\s/g, "");
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ""));
  return NaN;
}

/**
 * Un monto de lo que se teclea: «1250», «$1,250.50», «1.250,50», «B/. 80», «12,5». Con coma y punto, el último es el
 * decimal; con sólo comas, es de miles si le siguen exactamente tres cifras («1,250»); un solo punto es el decimal
 * (Panamá). Redondea al centavo. null si está vacío, NaN si no es un monto. Pura.
 */
export function leerMonto(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  let t = String(v).trim().replace(/^(b\/\.|us\$|usd|\$)\s*/i, "").replace(/\s/g, "");
  if (!t) return null;
  if (!/^\d[\d.,]*$/.test(t)) return NaN;
  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    const dec = coma > punto ? "," : ".";
    const mil = dec === "," ? "." : ",";
    t = t.split(mil).join("").replace(dec, ".");
  } else if (coma >= 0) {
    const partes = t.split(",");
    t = partes.length > 2 || partes.at(-1).length === 3 ? partes.join("") : partes.join(".");
  } else if (punto >= 0 && t.split(".").length > 2) {
    t = t.split(".").join("");
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/**
 * Lo que manda el cliente (o la agencia), limpio: `{ fila }` o `{ error }` con el motivo para la persona. Sólo una
 * semana de la ventana (`ventana` semanas hasta la de `hoy`); ventas y monto obligatorios; lo de los anuncios y lo de
 * otros canales, opcional. Pura.
 */
export function limpiarVentas(entrada = {}, { hoy, ventana = VENTANA_CLIENTE } = {}) {
  const e = entrada && typeof entrada === "object" ? entrada : {};
  const semana = lunesDe(String(e.semana ?? ""));
  if (!semana) return { error: "Falta la semana." };
  const permitidas = semanasHacia(lunesDe(hoy), ventana);
  if (!permitidas.includes(semana)) {
    return { error: semana > permitidas[0] ? "Esa semana todavía no empieza." : `Sólo se pueden apuntar las últimas ${ventana} semanas.` };
  }
  const ventas = leerEntero(e.ventas);
  if (ventas == null) return { error: "Escribe cuántas ventas cerraste (si no hubo, pon 0)." };
  if (Number.isNaN(ventas) || ventas < 0) return { error: "Las ventas tienen que ser un número entero, sin decimales." };
  if (ventas > MAX_VENTAS) return { error: "Son demasiadas ventas para una semana: revisa el número." };
  const monto = leerMonto(e.monto);
  if (monto == null) return { error: "Escribe por cuánto vendiste en total (si no hubo ventas, pon 0)." };
  if (Number.isNaN(monto) || monto < 0) return { error: "El monto tiene que ser un número, como 1250 o 1250.50." };
  if (monto > MAX_MONTO) return { error: "El monto es demasiado alto: revisa el número." };
  if (ventas === 0 && monto > 0) return { error: "Si vendiste algo, pon cuántas ventas fueron." };

  const deAnuncios = leerEntero(e.deAnuncios);
  if (Number.isNaN(deAnuncios) || (deAnuncios != null && deAnuncios < 0)) return { error: "Las ventas de los anuncios tienen que ser un número entero." };
  if (deAnuncios != null && deAnuncios > ventas) return { error: "Las ventas de los anuncios no pueden ser más que las ventas de la semana." };
  const otrosCanales = leerMonto(e.otrosCanales);
  if (Number.isNaN(otrosCanales) || (otrosCanales != null && otrosCanales < 0)) return { error: "Lo de otros canales tiene que ser un monto, como 300 o 300.50." };
  if (otrosCanales != null && otrosCanales > MAX_MONTO) return { error: "Lo de otros canales es demasiado alto: revisa el número." };
  const nota = String(e.nota ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTA);
  return { fila: { semana, ventas, monto, deAnuncios, otrosCanales, nota } };
}

// ------------------------------------------------------------
// Lo que dice Meta, por semana
// ------------------------------------------------------------

/**
 * Las filas día a día de /insights (`date_start`, `spend`, `actions`) sumadas por su lunes: `{ [lunes]: { gasto,
 * conversaciones } }`. Las semanas de `semanas` salen siempre, con 0 si Meta no devolvió nada (no gastó): sin eso, una
 * semana sin pauta no se distinguiría de una que no se leyó. `accion`: el `action_type` de la conversación empezada
 * (ACCION_MENSAJE de src/lib/anuncios.js; se pasa para no arrastrar ese módulo a la página del cliente). Pura.
 */
export function agruparPorSemana(filas = [], { accion, semanas = [] } = {}) {
  const salida = Object.fromEntries(semanas.map((s) => [s, { gasto: 0, conversaciones: 0 }]));
  for (const f of Array.isArray(filas) ? filas : []) {
    const lunes = lunesDe(String(f?.date_start ?? ""));
    if (!lunes) continue;
    const s = (salida[lunes] ??= { gasto: 0, conversaciones: 0 });
    s.gasto += Number(f.spend) || 0;
    const a = (Array.isArray(f.actions) ? f.actions : []).find((x) => x?.action_type === accion);
    s.conversaciones += Number(a?.value) || 0;
  }
  for (const s of Object.values(salida)) s.gasto = Math.round(s.gasto * 100) / 100;
  return salida;
}

// ------------------------------------------------------------
// La tasa de cierre, el ROAS y el costo por venta
// ------------------------------------------------------------

/** Las ventas de una semana que cuentan para la tasa: las de los anuncios si el cliente las separó, si no todas. */
const ventasQueCuentan = (s) => (s.deAnuncios != null ? Number(s.deAnuncios) : Number(s.ventas) || 0);

/** Las semanas con ventas apuntadas, la más nueva primero (filas con `semana` y `ventas`). */
const conDatos = (semanas) => (Array.isArray(semanas) ? semanas : [])
  .filter((s) => esFecha(s?.semana) && s.ventas != null && !Number.isNaN(Number(s.ventas)))
  .sort((a, b) => (a.semana < b.semana ? 1 : -1));

/**
 * Las últimas `n` semanas con ventas que se pueden cruzar con Meta (la semana ANTERIOR a cada una está en
 * `meta`), y lo que suman de cada lado. Pura.
 */
function cruce(semanas, meta, n) {
  const usadas = conDatos(semanas).filter((s) => meta && meta[sumarDias(s.semana, -7)] != null).slice(0, n);
  const suma = (f) => usadas.reduce((t, s) => t + f(s), 0);
  return {
    usadas,
    ventas: suma(ventasQueCuentan),
    ventasTodas: suma((s) => Number(s.ventas) || 0),
    monto: Math.round(suma((s) => Number(s.monto) || 0) * 100) / 100,
    otrosCanales: Math.round(suma((s) => Number(s.otrosCanales) || 0) * 100) / 100,
    conversaciones: suma((s) => Number(meta[sumarDias(s.semana, -7)]?.conversaciones) || 0),
    gasto: Math.round(suma((s) => Number(meta[sumarDias(s.semana, -7)]?.gasto) || 0) * 100) / 100,
  };
}

/**
 * La tasa de cierre medida: ventas ÷ conversaciones de Meta sobre las últimas 4 semanas con ventas, cada una con las
 * conversaciones de la semana anterior. `meta`: `{ [lunes]: { gasto, conversaciones } }` (agruparPorSemana).
 * Devuelve `{ tasa, ventas, conversaciones, semanas, suficiente, aviso, motivo }`: `tasa` es null sin conversaciones;
 * `suficiente` dice si ya puede sustituir a la de por defecto (2 semanas y 20 conversaciones como mínimo). Pura.
 */
export function tasaDeCierreMedida(semanas, meta, { n = SEMANAS_TASA } = {}) {
  if (!meta || typeof meta !== "object") {
    return { tasa: null, ventas: 0, conversaciones: 0, semanas: [], suficiente: false, aviso: "", motivo: "Sin la cuenta publicitaria no se sabe cuántas conversaciones empezaron los anuncios." };
  }
  const c = cruce(semanas, meta, n);
  const base = { ventas: c.ventas, conversaciones: c.conversaciones, semanas: c.usadas.map((s) => s.semana) };
  if (!c.usadas.length) return { ...base, tasa: null, suficiente: false, aviso: "", motivo: "El cliente todavía no ha apuntado ninguna semana." };
  if (c.conversaciones <= 0) return { ...base, tasa: null, suficiente: false, aviso: "", motivo: "Los anuncios no empezaron conversaciones en esas semanas." };
  const bruta = c.ventas / c.conversaciones;
  const tasa = Math.min(bruta, 1);
  const suficiente = c.usadas.length >= MIN_SEMANAS_TASA && c.conversaciones >= MIN_CONVERSACIONES_TASA;
  return {
    ...base,
    tasa,
    suficiente,
    aviso: bruta > TASA_SOSPECHOSA
      ? "Cierran más de la mitad de las conversaciones: puede que se estén contando ventas que no vinieron de los anuncios. Pídele al cliente que apunte cuántas vinieron de ellos."
      : "",
    motivo: suficiente ? "" : `Con pocos datos todavía (${c.usadas.length} ${c.usadas.length === 1 ? "semana" : "semanas"}, ${c.conversaciones} conversaciones): se sigue usando el ${pct(TASA_POR_DEFECTO)}.`,
  };
}

/** La tasa que se usa en las cuentas: la medida si ya hay datos suficientes, si no la de por defecto. Pura. */
export const tasaParaUsar = (medida, porDefecto = TASA_POR_DEFECTO) =>
  (medida?.suficiente && Number.isFinite(medida.tasa) ? medida.tasa : porDefecto);

/**
 * El ROAS real de WhatsApp (monto vendido ÷ pauta) y el costo real por venta (pauta ÷ ventas), sobre las mismas
 * semanas que la tasa y con la pauta de la semana anterior a cada una. La pauta es la de toda la cuenta (lo que el
 * cliente paga en anuncios). null donde falta con qué dividir. Pura.
 */
export function roasReal(semanas, meta, { n = SEMANAS_TASA } = {}) {
  if (!meta || typeof meta !== "object") return { roas: null, costoPorVenta: null, gasto: 0, monto: 0, ventas: 0, otrosCanales: 0, semanas: [] };
  const c = cruce(semanas, meta, n);
  return {
    roas: c.gasto > 0 && c.usadas.length ? c.monto / c.gasto : null,
    costoPorVenta: c.ventas > 0 && c.gasto > 0 ? c.gasto / c.ventas : null,
    gasto: c.gasto, monto: c.monto, ventas: c.ventas, otrosCanales: c.otrosCanales,
    semanas: c.usadas.map((s) => s.semana),
  };
}

/**
 * ¿Desde cuándo no apunta el cliente? null si ya tiene la semana que acaba de terminar (o una más nueva);
 * `{ nunca: true }` si no apuntó ninguna; si no, `{ desde, ultima, semanas }`: el lunes de la primera semana sin dato,
 * la última que sí tiene y cuántas semanas TERMINADAS faltan. Pura.
 */
export function sinMedirDesde(semanas, hoy) {
  const pasada = sumarDias(lunesDe(hoy), -7);
  const con = conDatos(semanas);
  if (!con.length) return { nunca: true, desde: "", ultima: "", semanas: 0 };
  const ultima = con[0].semana;
  if (ultima >= pasada) return null;
  const desde = sumarDias(ultima, 7);
  return { nunca: false, desde, ultima, semanas: Math.round(diasEntre(ultima, pasada) / 7) };
}

/** «Sin medir desde el 2 de noviembre» para la pantalla de la agencia (o "" si está al día). Pura. */
export function textoSinMedir(s) {
  if (!s) return "";
  if (s.nunca) return "El cliente todavía no ha apuntado sus ventas.";
  return `Sin medir desde el ${dia(s.desde)} de ${mes(s.desde)}${anio(s.desde) !== anio(s.ultima) ? ` de ${anio(s.desde)}` : ""} (${s.semanas === 1 ? "falta 1 semana" : `faltan ${s.semanas} semanas`}).`;
}

/** Todo junto, para la pantalla de la agencia y el informe: tasa, ROAS, costo por venta y si está al día. Pura. */
export function resumenVentas(semanas, meta, { hoy } = {}) {
  const tasa = tasaDeCierreMedida(semanas, meta);
  const r = roasReal(semanas, meta);
  return { tasa, tasaUsada: tasaParaUsar(tasa), ...r, sinMedir: sinMedirDesde(semanas, hoy) };
}

// ------------------------------------------------------------
// Cómo se dice
// ------------------------------------------------------------

/** «5 %», «12,5 %». Pura. */
export function pct(x) {
  if (x == null || !Number.isFinite(Number(x))) return "—";
  const v = Math.round(Number(x) * 1000) / 10;
  return `${String(v).replace(".", ",")} %`;
}

/** «$1,250.50» (o sin decimales si es redondo). La moneda de la cuenta publicitaria; USD si no hay. Pura. */
export function dinero(valor, moneda = "USD") {
  if (valor == null || !Number.isFinite(Number(valor))) return "—";
  const n = Number(valor);
  const decimales = Number.isInteger(n) ? 0 : 2;
  try {
    return new Intl.NumberFormat("es-PA", { style: "currency", currency: moneda || "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(n);
  } catch {
    return `${n.toFixed(decimales)} ${moneda}`;
  }
}

/** La dirección del enlace del cliente. Pura. */
export const enlaceDeVentas = (origen, testigo) => (testigo ? `${String(origen ?? "").replace(/\/$/, "")}/ventas?t=${encodeURIComponent(testigo)}` : "");

/**
 * El mensaje de los lunes, listo para copiar en WhatsApp: corto, cálido, en tú y con el enlace. Pregunta por la
 * semana que toca (la que acaba de terminar, si sale de lunes a miércoles). Pura.
 */
export function mensajeDeLosLunes({ nombre = "", enlace = "", hoy } = {}) {
  const semana = semanaQueToca(hoy);
  const cual = semana && semana < lunesDe(hoy) ? `la semana pasada (${etiquetaSemana(semana)})` : semana ? `esta semana (${etiquetaSemana(semana)})` : "esta semana";
  const hola = `Hola${String(nombre).trim() ? ` ${String(nombre).trim()}` : ""}`;
  return [
    `${hola}, ¿cómo te fue ${cual}? Apunta aquí cuántas ventas cerraste por WhatsApp y por cuánto; te toma 30 segundos:`,
    enlace,
    "Con eso sabemos cuánto te deja cada dólar de publicidad y ajustamos las campañas. ¡Gracias!",
  ].filter(Boolean).join("\n");
}
