// ============================================================
// Resultados: de las filas de métricas a lo que se enseña (puro)
//
// Lo usan la pestaña Resultados, el resumen de la agencia y el informe
// mensual (que se construye en el Worker): las cuentas tienen que ser
// las mismas en los tres, o el informe dice un número y la pantalla otro.
//
// Todas las horas son de Panamá (UTC−5, sin horario de verano).
// ============================================================

import { sumarDias } from "./agenda.js";

const DESFASE_MS = 5 * 3600_000;
export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const BLOQUES_HORA = ["0–3", "3–6", "6–9", "9–12", "12–15", "15–18", "18–21", "21–24"];

const suma = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
const media = (xs) => (xs.length ? suma(xs) / xs.length : 0);

/** El cambio en % entre dos cifras, o null si no hay con qué comparar. */
export function variacion(actual, anterior) {
  if (actual == null || anterior == null || anterior === 0) return null;
  return ((actual - anterior) / anterior) * 100;
}

/** Día y hora de Panamá de un instante ISO. */
export function enPanama(iso) {
  const d = new Date(Date.parse(iso) - DESFASE_MS);
  return { dia: d.getUTCDay(), hora: d.getUTCHours(), fecha: d.toJSON().slice(0, 10) };
}

const deRed = (red) => (x) => !red || red === "todas" || x.red === red;

/**
 * Una fila por día con las cuentas sumadas: seguidores (el último valor
 * de cada cuenta ese día), alcance, vistas, interacciones y visitas.
 */
export function serieDiaria(serie = [], red = "todas") {
  const porDia = new Map();
  for (const f of serie.filter(deRed(red))) {
    if (f.error) continue;
    const d = porDia.get(f.fecha) ?? { fecha: f.fecha, seguidores: null, alcance: 0, vistas: 0, interacciones: 0, visitas: 0 };
    if (f.seguidores != null) d.seguidores = (d.seguidores ?? 0) + f.seguidores;
    d.alcance += f.alcance ?? 0;
    d.vistas += f.vistas ?? 0;
    d.interacciones += f.interacciones ?? 0;
    d.visitas += f.visitas ?? 0;
    porDia.set(f.fecha, d);
  }
  return [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Seguidores de la última foto con dato en o antes de `fecha`. */
function seguidoresEn(dias, fecha) {
  let v = null;
  for (const d of dias) {
    if (d.fecha > fecha) break;
    if (d.seguidores != null) v = d.seguidores;
  }
  return v;
}

/**
 * Las cifras del periodo [desde, hasta] y las del periodo anterior de la
 * misma duración, para enseñar la flecha de subida o bajada.
 */
export function kpis({ serie = [], publicaciones = [] }, { desde, hasta, red = "todas" }) {
  const dias = serieDiaria(serie, red);
  const largo = Math.max(1, Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400_000));
  const desdeAntes = sumarDias(desde, -largo);
  const enRango = (a, b) => (d) => d.fecha >= a && d.fecha <= b;
  const ahora = dias.filter(enRango(desde, hasta));
  const antes = dias.filter(enRango(desdeAntes, sumarDias(desde, -1)));

  const pubs = publicaciones.filter(deRed(red)).filter((p) => p.publicadaAt);
  const pubsEn = (a, b) => pubs.filter((p) => { const f = enPanama(p.publicadaAt).fecha; return f >= a && f <= b; });
  const pAhora = pubsEn(desde, hasta);
  const pAntes = pubsEn(desdeAntes, sumarDias(desde, -1));

  const seguidores = seguidoresEn(dias, hasta);
  const seguidoresInicio = seguidoresEn(dias, desde) ?? ahora.find((d) => d.seguidores != null)?.seguidores ?? null;
  const tasa = (lista) => (seguidores ? media(lista.map((p) => (p.interacciones / seguidores) * 100)) : null);

  const cifra = (valor, anterior) => ({ valor, anterior, cambio: variacion(valor, anterior) });
  return {
    seguidores: { valor: seguidores, anterior: seguidoresInicio, cambio: variacion(seguidores, seguidoresInicio), ganados: seguidores != null && seguidoresInicio != null ? seguidores - seguidoresInicio : null },
    alcance: cifra(suma(ahora.map((d) => d.alcance)), antes.length ? suma(antes.map((d) => d.alcance)) : null),
    vistas: cifra(suma(ahora.map((d) => d.vistas)), antes.length ? suma(antes.map((d) => d.vistas)) : null),
    interacciones: cifra(suma(pAhora.map((p) => p.interacciones)), pAntes.length ? suma(pAntes.map((p) => p.interacciones)) : null),
    visitas: cifra(suma(ahora.map((d) => d.visitas)), antes.length ? suma(antes.map((d) => d.visitas)) : null),
    publicaciones: cifra(pAhora.length, pAntes.length || null),
    tasaInteraccion: cifra(tasa(pAhora), pAntes.length ? tasa(pAntes) : null),
  };
}

export const NOMBRE_FORMATO = { imagen: "Imagen", carrusel: "Carrusel", reel: "Reel", video: "Video", texto: "Texto", historia: "Historia" };

/** Qué formato rinde más: publicaciones, interacciones y alcance medios. */
export function porFormato(publicaciones = []) {
  const grupos = new Map();
  for (const p of publicaciones) {
    const g = grupos.get(p.tipo) ?? [];
    g.push(p);
    grupos.set(p.tipo, g);
  }
  return [...grupos.entries()]
    .map(([tipo, lista]) => ({
      tipo, nombre: NOMBRE_FORMATO[tipo] ?? tipo, cantidad: lista.length,
      interacciones: media(lista.map((p) => p.interacciones)),
      alcance: media(lista.map((p) => p.alcance)),
    }))
    .sort((a, b) => b.interacciones - a.interacciones);
}

/**
 * Cuándo funcionan mejor sus publicaciones: interacciones medias por día
 * de la semana y bloque de tres horas. `mejores` son los tres huecos con
 * más interacción de los que tienen al menos una publicación.
 */
export function mejoresMomentos(publicaciones = []) {
  const celdas = Array.from({ length: 7 }, () => Array.from({ length: 8 }, () => []));
  for (const p of publicaciones) {
    if (!p.publicadaAt) continue;
    const { dia, hora } = enPanama(p.publicadaAt);
    celdas[dia][Math.floor(hora / 3)].push(p.interacciones ?? 0);
  }
  const matriz = celdas.map((fila) => fila.map((v) => (v.length ? { media: media(v), cantidad: v.length } : null)));
  const mejores = [];
  matriz.forEach((fila, dia) => fila.forEach((c, bloque) => { if (c) mejores.push({ dia, bloque, ...c }); }));
  mejores.sort((a, b) => b.media - a.media);
  const maximo = Math.max(0, ...mejores.map((m) => m.media));
  return { matriz, mejores: mejores.slice(0, 3), maximo };
}

/** Las que más movieron, de más a menos. */
export const mejoresPublicaciones = (publicaciones = [], n = 6) =>
  [...publicaciones].sort((a, b) => (b.interacciones ?? 0) - (a.interacciones ?? 0)).slice(0, n);

/** Por competidor: la última foto y cuánto cambió desde la primera del periodo. */
export function resumenCompetencia(competencia = [], desde = "") {
  const porUsuario = new Map();
  for (const f of competencia) {
    const k = f.usuario.toLowerCase();
    const e = porUsuario.get(k) ?? { usuario: f.usuario, primera: null, ultima: null };
    if (f.fecha >= desde && !e.primera) e.primera = f;
    e.ultima = f;
    porUsuario.set(k, e);
  }
  return [...porUsuario.values()].map(({ usuario, primera, ultima }) => ({
    usuario,
    seguidores: ultima.seguidores,
    cambio: primera && primera !== ultima ? variacion(ultima.seguidores, primera.seguidores) : null,
    publicaciones: ultima.publicaciones,
    interaccionesPromedio: ultima.interaccionesPromedio,
    ultima: ultima.datos?.ultima ?? null,
  })).sort((a, b) => (b.seguidores ?? 0) - (a.seguidores ?? 0));
}

/** Números cortos: 1.234 → «1,2 mil», 1.200.000 → «1,2 M». */
export function numeroCorto(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const f = (x, d) => x.toLocaleString("es", { maximumFractionDigits: d });
  if (abs >= 1e6) return `${f(n / 1e6, 1)} M`;
  if (abs >= 1e4) return `${f(n / 1e3, 1)} mil`;
  return f(n, n % 1 ? 1 : 0);
}
