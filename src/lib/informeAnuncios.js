// ============================================================
// El informe de anuncios del mes (puro)
//
// Aparte del informe de redes: lo que ve el cliente de su publicidad
// pagada, fácil de leer. Cuatro cifras grandes con su comparación con el
// mes anterior (inversión, resultados, costo por resultado y personas
// alcanzadas), el día a día, los anuncios que mejor funcionaron con su
// imagen, cada campaña —también las creadas fuera de la aplicación— y,
// de la IA, lo logrado y lo que se hará el mes que viene.
//
// Las CIFRAS las calcula este módulo y se congelan al generar; la IA sólo
// escribe con ellas delante. «Mostrar el costo por resultado» lo decide
// la agencia por cliente y por informe: si no se muestra, `sinCosto()` lo
// QUITA de lo que se le manda al cliente (no basta con esconderlo).
// ============================================================

import { OBJETIVOS, objetivoODAX, resultadosDe, resumenInsights, estadoAnuncio, ACCION_MENSAJE } from "./anuncios.js";
import { sumarDias } from "./agenda.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const redondeo = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 100) / 100);
const MAX_CAMPANAS = 12;
const MAX_MEJORES = 3;

/** «octubre de 2026». */
export const nombreDelMes = (mes) => {
  const [y, m] = String(mes ?? "").split("-").map(Number);
  return y && m ? `${MESES[m - 1]} de ${y}` : String(mes ?? "");
};

/** El % de cambio frente al mes anterior; null si no hay con qué comparar. */
export const cambioPct = (ahora, antes) => (antes > 0 && ahora != null ? Math.round(((ahora - antes) / antes) * 1000) / 10 : null);

/** El objetivo que más gastó: el que da nombre a los «resultados» del informe. */
function objetivoPrincipal(campanas = []) {
  const porObjetivo = new Map();
  for (const c of campanas) {
    const o = objetivoODAX(c.objective);
    if (!o) continue;
    porObjetivo.set(o, (porObjetivo.get(o) ?? 0) + (Number(c.insights?.spend) || 0));
  }
  return [...porObjetivo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Cómo se llaman los resultados: conversaciones si llegaron por WhatsApp; si no, lo que mide el objetivo principal. */
function etiquetaResultados(objetivo, total) {
  const mensajes = (total?.actions ?? []).some((a) => a.action_type === ACCION_MENSAJE && Number(a.value) > 0);
  if (mensajes && ["OUTCOME_ENGAGEMENT", "OUTCOME_SALES"].includes(objetivo)) return "Conversaciones por WhatsApp";
  return OBJETIVOS[objetivo]?.resultado ?? "Resultados";
}

/** El día a día, con 0 en los días sin gasto (Meta no devuelve fila): una gráfica con huecos engaña. */
function serieDelMes(dias = [], objetivo, desde, hasta) {
  const porDia = new Map((dias ?? []).map((d) => [d.date_start, d]));
  const fechas = [...porDia.keys()].sort();
  const inicio = desde || fechas[0];
  const fin = hasta || fechas.at(-1);
  const salida = [];
  for (let fecha = inicio; fecha && fin && fecha <= fin && salida.length < 31; fecha = sumarDias(fecha, 1)) {
    const d = porDia.get(fecha);
    salida.push({ fecha, gasto: redondeo(Number(d?.spend) || 0), resultados: d && objetivo ? resultadosDe(d, objetivo) ?? 0 : 0 });
  }
  return salida;
}

/** Los resultados de un conjunto de campañas: cada una con lo que mide su objetivo. */
const sumaResultados = (campanas = []) => campanas.reduce((n, c) => n + (resultadosDe(c.insights, c.objective) ?? 0), 0);
const sumaGasto = (campanas = []) => campanas.reduce((n, c) => n + (Number(c.insights?.spend) || 0), 0);

/**
 * Las cifras del informe, congeladas. Recibe lo leído de Meta:
 *   total, anterior: /insights de la cuenta (el mes y el anterior)
 *   campanas, campanasAnterior: /campaigns con sus cifras
 *   dias: /insights con time_increment=1
 *   anuncios: /ads con campaign{objective}, creative{…} e insights, más `miniatura` (data URI) en los que la tengan
 *   desdeApp: ids de las campañas creadas en la aplicación
 * Pura.
 */
export function cifrasInformeAnuncios({ mes, desde = "", hasta = "", cuenta, total, anterior, campanas = [], campanasAnterior = [], dias = [], anuncios = [], desdeApp = [] }) {
  const t = resumenInsights(total);
  const a = resumenInsights(anterior);
  // Los resultados grandes son los del objetivo que más invirtió: sumar conversaciones con clics bajo una sola
  // etiqueta sería mentir. Las campañas de otros objetivos salen en la tabla con lo suyo.
  const objetivo = objetivoPrincipal(campanas);
  const delObjetivo = (lista) => lista.filter((c) => objetivoODAX(c.objective) === objetivo);
  const principales = delObjetivo(campanas);
  const principalesAntes = delObjetivo(campanasAnterior);
  const resultados = sumaResultados(principales);
  const resultadosAntes = sumaResultados(principalesAntes);
  const gastoPrincipal = sumaGasto(principales);
  const gastoAntes = sumaGasto(principalesAntes);
  const cpr = resultados ? redondeo(gastoPrincipal / resultados) : null;
  const cprAntes = resultadosAntes ? redondeo(gastoAntes / resultadosAntes) : null;
  const deAqui = new Set(desdeApp.map(String));
  const lista = campanas
    .map((c) => {
      const r = resumenInsights(c.insights, c.objective);
      return {
        id: String(c.id), nombre: c.name ?? "", objetivo: OBJETIVOS[objetivoODAX(c.objective)]?.nombre ?? "",
        estado: estadoAnuncio(c.effective_status ?? c.status).texto, desdeApp: deAqui.has(String(c.id)),
        gasto: redondeo(r.gasto), resultados: r.resultados ?? 0, costoPorResultado: redondeo(r.costoPorResultado),
        alcance: r.alcance, clics: r.clics,
      };
    })
    .filter((c) => c.gasto > 0)
    .sort((x, y) => y.gasto - x.gasto);
  const mejores = anuncios
    .map((x) => {
      const r = resumenInsights(x.insights, x.campaign?.objective);
      return {
        id: String(x.id), nombre: x.name ?? "", campana: x.campaign?.name ?? "", miniatura: x.miniatura ?? null,
        titulo: x.creative?.title ?? "", texto: String(x.creative?.body ?? "").slice(0, 280),
        gasto: redondeo(r.gasto), resultados: r.resultados ?? 0, costoPorResultado: redondeo(r.costoPorResultado), ctr: r.ctr, clics: r.clics,
      };
    })
    .filter((x) => x.gasto > 0)
    .sort((x, y) => y.resultados - x.resultados || (y.clics ?? 0) - (x.clics ?? 0))
    .slice(0, MAX_MEJORES);
  return {
    mes, nombreMes: nombreDelMes(mes), moneda: cuenta?.moneda ?? "USD", cuenta: cuenta?.nombre ?? "",
    etiquetaResultados: etiquetaResultados(objetivo, total),
    // Hay campañas de otros objetivos con gasto: sus resultados no están en la cifra grande.
    otrosObjetivos: lista.some((c) => c.objetivo !== (OBJETIVOS[objetivo]?.nombre ?? "")),
    kpis: {
      inversion: { valor: redondeo(t.gasto), cambio: cambioPct(t.gasto, a.gasto) },
      resultados: { valor: resultados, cambio: cambioPct(resultados, resultadosAntes) },
      costoPorResultado: { valor: cpr, cambio: cambioPct(cpr, cprAntes) },
      alcance: { valor: t.alcance, cambio: cambioPct(t.alcance, a.alcance) },
      clics: { valor: t.clics, cambio: cambioPct(t.clics, a.clics) },
      ctr: { valor: t.ctr, cambio: null },
    },
    serie: serieDelMes(dias, objetivo, desde, hasta),
    campanas: lista.slice(0, MAX_CAMPANAS),
    otras: Math.max(0, lista.length - MAX_CAMPANAS),
    mejores,
  };
}

/** Lo que ve el cliente cuando la agencia decide no enseñar el costo por resultado: se QUITA, no se esconde. Pura. */
export function sinCosto(cifras) {
  if (!cifras) return cifras;
  const { costoPorResultado: _, ...kpis } = cifras.kpis ?? {};
  const quitar = ({ costoPorResultado: __, ...resto }) => resto;
  return { ...cifras, kpis, campanas: (cifras.campanas ?? []).map(quitar), mejores: (cifras.mejores ?? []).map(quitar) };
}

/** Lo que se le pide a la IA: lo logrado, una frase por campaña y lo del mes que viene, sin inventar cifras. Pura. */
export function pedidoInformeAnuncios(cifras, { marca, mostrarCosto = true, rubro = "" }) {
  const datos = mostrarCosto ? cifras : sinCosto(cifras);
  // La IA no necesita las imágenes para escribir.
  const sinImagenes = { ...datos, mejores: (datos.mejores ?? []).map(({ miniatura: _, ...x }) => x) };
  return [
    `Eres el especialista en anuncios de la agencia Juancito Ads (Panamá). Escribe lo que va en el informe de publicidad de ${marca}${rubro ? ` (${rubro})` : ""} de ${cifras.nombreMes}, que leerá el propio cliente.`,
    "Estas son TODAS las cifras (JSON). «cambio» es el % frente al mes anterior; null es que no hay con qué comparar. No inventes ningún número que no esté aquí.",
    mostrarCosto ? "" : "NO menciones el costo por resultado ni lo calcules: el cliente no lo ve en este informe.",
    JSON.stringify(sinImagenes),
    "",
    "Devuelve SOLO un JSON, sin texto alrededor:",
    '{"logros":"3 o 4 frases: lo que se logró con la inversión, con las 2 o 3 cifras que más importan","campanas":[{"id":"…","comentario":"una frase sobre cómo le fue"}],"recomendaciones":["3 o 4 acciones concretas para el mes que viene: qué mantener, qué cambiar, qué probar"]}',
    "",
    "Tono: cercano y claro, de tú, español latino neutro. Sin tecnicismos («personas alcanzadas», no «reach»; «clics», no «CTR»). Si el mes fue flojo, dilo con honestidad y en positivo.",
  ].filter((l) => l !== "").join("\n");
}

/** La respuesta de la IA, limpia. Lo que nombre una campaña que no está, se descarta. Pura. */
export function leerAnalisisAnuncios(texto, cifras) {
  const t = String(texto ?? "").replace(/```(?:json)?/gi, "");
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  let d = null;
  if (ini !== -1 && fin > ini) { try { d = JSON.parse(t.slice(ini, fin + 1)); } catch { d = null; } }
  if (!d) return { logros: t.trim().slice(0, 1500), campanas: {}, recomendaciones: [] };
  const ids = new Set((cifras?.campanas ?? []).map((c) => c.id));
  const campanas = {};
  for (const c of Array.isArray(d.campanas) ? d.campanas : []) {
    const id = String(c?.id ?? "");
    const comentario = String(c?.comentario ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (ids.has(id) && comentario) campanas[id] = comentario;
  }
  return {
    logros: String(d.logros ?? "").trim().slice(0, 1500),
    campanas,
    recomendaciones: (Array.isArray(d.recomendaciones) ? d.recomendaciones : []).map((x) => String(x ?? "").trim().slice(0, 300)).filter(Boolean).slice(0, 5),
  };
}
