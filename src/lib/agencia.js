// ============================================================
// Lo que el asistente global puede mirar
//
// El panel global tenía los clientes enteros en memoria —con sus
// calendarios y sus publicaciones— y le contaba a la IA sólo el nombre y
// dos contadores, con un prompt que decía «no tienes acceso directo a
// los calendarios desde aquí». Por eso no sabía responder a «qué posts
// me faltan por describir» ni a «dame los pendientes de esta semana».
//
// POR QUÉ CONSULTAS Y NO VOLCAR TODO EN EL PROMPT
//
// Cinco clientes con un mes escrito cada uno son decenas de miles de
// tokens en CADA mensaje, se pagan enteros aunque la pregunta sea «hola»
// y acaban desplazando la conversación. Aquí la IA pregunta lo que
// necesita: el prompt lleva el índice —quién hay y cuánto tiene— y las
// herramientas traen el detalle.
//
// Todo lo de este módulo es puro: recibe los clientes, devuelve datos.
// Lo que hay que ir a buscar al servidor —las tareas— lo pide el panel.
// ============================================================

import { getWeekNumber, dayName } from "../utils";
import { hora12 } from "./horas";
import { completitud } from "./completitud";

const igual = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
const puesto = (v) => v !== undefined && v !== null && v !== "";

/** Un cliente por nombre o por id, tolerando mayúsculas y espacios. */
export function buscarCliente(clients, aguja) {
  if (!puesto(aguja)) return null;
  const q = String(aguja).trim().toLowerCase();
  return (clients || []).find((c) => c.id === aguja || c.dbId === aguja || igual(c.name, q))
    ?? (clients || []).find((c) => (c.name || "").toLowerCase().includes(q))
    ?? null;
}

/**
 * Aplana todas las publicaciones de todos los clientes, ya filtradas.
 *
 * Cada fila lleva a qué cliente y a qué calendario pertenece: sin eso,
 * una respuesta que mezcle clientes es inservible —«hay seis sin
 * descripción» y no se sabe de quién—.
 */
export function consultarPublicaciones(clients, filtros = {}) {
  const cliente = puesto(filtros.cliente) ? buscarCliente(clients, filtros.cliente) : null;
  if (puesto(filtros.cliente) && !cliente) {
    return { ok: false, mensaje: `No encontré ningún cliente que se parezca a «${filtros.cliente}».` };
  }

  const candidatos = cliente ? [cliente] : (clients || []);
  const filas = [];

  for (const c of candidatos) {
    for (const cal of c.calendars || []) {
      if (puesto(filtros.anio) && Number(cal.year) !== Number(filtros.anio)) continue;
      // El mes se pide como lo dice una persona (1-12) y se guarda 0-11.
      if (puesto(filtros.mes) && Number(cal.month) !== Number(filtros.mes) - 1) continue;

      const primerDia = (cal.days || [])[0]?.date;
      for (const d of cal.days || []) {
        if (puesto(filtros.desde) && d.date < filtros.desde) continue;
        if (puesto(filtros.hasta) && d.date > filtros.hasta) continue;
        if (puesto(filtros.semana) && primerDia
            && getWeekNumber(d.date, primerDia) !== Number(filtros.semana)) continue;
        if (puesto(filtros.dia) && !igual(dayName(d.date), filtros.dia)) continue;

        for (const p of d.posts || []) {
          if (puesto(filtros.estado) && !igual(p.status || "pending", filtros.estado)) continue;
          if (puesto(filtros.formato) && !igual(p.format, filtros.formato)) continue;
          if (puesto(filtros.categoria) && !igual(p.category, filtros.categoria)) continue;
          if (filtros.sin_descripcion && (p.descripcion || p.script || "").trim()) continue;
          if (filtros.sin_guion && (p.guion || "").trim()) continue;
          if (filtros.sin_hora && (p.publishTime || "").trim()) continue;
          if (filtros.incompletas && completitud(p, d).faltan.length === 0) continue;

          filas.push({
            id: p.id,
            cliente: c.name,
            calendario: cal.name || `${(cal.month ?? 0) + 1}/${cal.year}`,
            fecha: d.date,
            dia: dayName(d.date),
            semana: primerDia ? getWeekNumber(d.date, primerDia) : null,
            formato: p.format || "",
            categoria: p.category || "",
            estado: p.status || "pending",
            hora: p.publishTime ? hora12(p.publishTime) : "sin asignar",
            idea: p.idea || "",
            descripcion: p.descripcion || p.script || "",
            guion: p.guion || "",
            hashtags: p.hashtagsFinales || "",
            le_falta: completitud(p, d).faltan,
          });
        }
      }
    }
  }

  return { ok: true, total: filas.length, publicaciones: filas };
}

/**
 * El índice que va en el prompt: quién hay y en qué estado está.
 *
 * Es barato —una línea por cliente— y es lo que permite que la IA sepa
 * a qué cliente preguntarle el detalle sin traérselo todo antes.
 */
export function resumenAgencia(clients) {
  const porCliente = (clients || []).map((c) => {
    const calendarios = c.calendars || [];
    let total = 0;
    const estados = { pending: 0, approved: 0, rejected: 0, published: 0 };
    let incompletas = 0;
    let sinHora = 0;

    for (const cal of calendarios) {
      for (const d of cal.days || []) {
        for (const p of d.posts || []) {
          total++;
          const e = p.status || "pending";
          if (estados[e] !== undefined) estados[e]++;
          if (completitud(p, d).faltan.length) incompletas++;
          if (!(p.publishTime || "").trim()) sinHora++;
        }
      }
    }

    return {
      cliente: c.name,
      id: c.id,
      industria: c.industry || "",
      calendarios: calendarios.map((cal) => ({
        nombre: cal.name || "",
        mes: (cal.month ?? 0) + 1,
        anio: cal.year,
      })),
      publicaciones: total,
      ...estados,
      incompletas,
      sin_hora: sinHora,
    };
  });

  return {
    clientes: porCliente.length,
    publicaciones: porCliente.reduce((s, c) => s + c.publicaciones, 0),
    pendientes: porCliente.reduce((s, c) => s + c.pending, 0),
    incompletas: porCliente.reduce((s, c) => s + c.incompletas, 0),
    detalle: porCliente,
  };
}

/** Una línea por cliente para el prompt. Corta a propósito. */
export function indiceParaPrompt(clients) {
  const r = resumenAgencia(clients);
  if (!r.detalle.length) return "(Sin clientes aún)";
  return r.detalle.map((c) => {
    const meses = c.calendarios.map((k) => `${k.mes}/${k.anio}`).join(", ") || "sin calendarios";
    return `· ${c.cliente} (ID: ${c.id})${c.industria ? ` — ${c.industria}` : ""} · ${c.publicaciones} publicaciones (${c.pending} pendientes, ${c.incompletas} incompletas, ${c.sin_hora} sin hora) · ${meses}`;
  }).join("\n");
}
