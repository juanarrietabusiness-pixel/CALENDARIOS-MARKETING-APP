// ============================================================
// El informe mensual de un cliente
//
// DOS PARTES, Y SÓLO UNA ES DE LA IA
//
//   1. Las cifras: las calcula `src/lib/resultados.js` —el MISMO código
//      que la pestaña Resultados— sobre las fotos diarias del mes. Así
//      el informe y la pantalla nunca dicen números distintos.
//   2. El análisis: resumen, destacados, aprendizajes, recomendaciones e
//      ideas para el mes siguiente. Lo escribe la IA con las cifras
//      delante y la instrucción de NO inventar ninguna.
//
// Las cifras se CONGELAN en el informe: si Meta corrige un número
// mañana, lo que se le mandó al cliente no cambia sin que nadie lo sepa.
//
// Sale solo el día 1 (el cron, desde las 9:00 de Panamá, uno por vuelta)
// y se puede generar o regenerar a mano desde Resultados.
// ============================================================

import { crearAcceso, clientesSinInforme } from "./acceso.js";
import { abrirFlujo, leerFlujo, textoDe, esRechazoDeModelo, mensajeDeRechazo } from "./anthropic.js";
import { prepararIA, registrarConsumo, MARGEN_RAZONAMIENTO, MODELO_SONNET } from "./configIA.js";
import { difundir } from "./vivo.js";
import { fechaEnZona, sumarDias } from "../../src/lib/agenda.js";
import {
  kpis, serieDiaria, porFormato, mejoresMomentos, mejoresPublicaciones, resumenCompetencia, DIAS_SEMANA, BLOQUES_HORA,
} from "../../src/lib/resultados.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };

export const nombreMes = (mes) => {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${a}`;
};

/** «2026-09» → primer y último día. */
export function limitesDelMes(mes) {
  const [a, m] = mes.split("-").map(Number);
  const desde = `${mes}-01`;
  const siguiente = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
  return { desde, hasta: sumarDias(siguiente, -1) };
}

/** El mes anterior al de hoy en Panamá: el que toca informar. */
export const mesAnterior = (ahora = new Date()) => sumarDias(`${fechaEnZona(ahora).slice(0, 7)}-01`, -1).slice(0, 7);

const salidaPublicacion = (p) => ({
  red: p.red, tipo: p.tipo, texto: String(p.texto ?? "").slice(0, 160), enlace: p.enlace,
  publicadaAt: p.publicada_at, interacciones: p.interacciones, alcance: p.alcance, vistas: p.vistas,
  meGusta: p.me_gusta, comentarios: p.comentarios, guardados: p.guardados, compartidos: p.compartidos,
});

/** Las cifras del mes, congeladas: lo que se enseña y lo que lee la IA. */
export async function cifrasDelMes(acceso, clientId, mes) {
  const { desde, hasta } = limitesDelMes(mes);
  const antes = sumarDias(desde, -40);
  const [cliente, cuentas, serieBruta, pubsBrutas, compBruta, calendarios, publicadas] = await Promise.all([
    acceso.leerUno("clients", { id: clientId }),
    acceso.leer("cuentas_sociales", { client_id: clientId }, "red asc"),
    acceso.leer("metricas_cuenta", { client_id: clientId }, "fecha asc"),
    acceso.leer("metricas_publicacion", { client_id: clientId }, "publicada_at asc"),
    acceso.leer("metricas_competencia", { client_id: clientId }, "fecha asc"),
    acceso.leer("calendars", { client_id: clientId }),
    acceso.leer("publicaciones_programadas", { client_id: clientId, estado: "publicada" }),
  ]);
  if (!cliente) throw new Error("Ese cliente no existe.");

  const serie = serieBruta.filter((f) => f.fecha >= antes && f.fecha <= hasta).map((f) => {
    const d = leerJSON(f.datos, {});
    return {
      cuentaId: f.cuenta_id, red: f.red, fecha: f.fecha, seguidores: f.seguidores, alcance: f.alcance, vistas: f.vistas,
      interacciones: f.interacciones, visitas: f.visitas_perfil, ...(d.error ? { error: d.error } : {}),
    };
  });
  const publicaciones = pubsBrutas.map((p) => ({
    ...salidaPublicacion(p), publicadaAt: p.publicada_at,
  })).filter((p) => p.publicadaAt && p.publicadaAt >= `${sumarDias(desde, -31)}T00:00:00`);
  const delMes = publicaciones.filter((p) => p.publicadaAt >= `${desde}T05:00:00` && p.publicadaAt < `${sumarDias(hasta, 1)}T05:00:00`);

  // Lo planificado: los calendarios de ese mes y lo que salió desde la app.
  const [a, m] = mes.split("-").map(Number);
  const delCalendario = calendarios.filter((c) => c.year === a && c.month === m - 1);
  const posts = delCalendario.flatMap((c) => leerJSON(c.days, []).flatMap((d) => d?.posts ?? []));

  let audiencia = null;
  for (const f of serieBruta) {
    if (f.fecha > hasta) break;
    const au = leerJSON(f.datos, {}).audiencia;
    if (au && Object.keys(au).length) audiencia = au;
  }

  const momentos = mejoresMomentos(delMes);
  return {
    mes,
    nombreMes: nombreMes(mes),
    desde,
    hasta,
    cliente: { nombre: cliente.name, industria: cliente.industry ?? "" },
    redes: cuentas.map((c) => ({ red: c.red, usuario: c.usuario, nombre: c.nombre })),
    kpis: kpis({ serie, publicaciones }, { desde, hasta }),
    seguidores: serieDiaria(serie).filter((d) => d.fecha >= desde).map((d) => ({ fecha: d.fecha, valor: d.seguidores })),
    alcance: serieDiaria(serie).filter((d) => d.fecha >= desde).map((d) => ({ fecha: d.fecha, valor: d.alcance })),
    formatos: porFormato(delMes),
    mejores: mejoresPublicaciones(delMes, 5),
    momentos: momentos.mejores.map((x) => ({ dia: DIAS_SEMANA[x.dia], franja: `${BLOQUES_HORA[x.bloque]} h`, media: Math.round(x.media), cantidad: x.cantidad })),
    audiencia,
    competencia: resumenCompetencia(compBruta.filter((f) => f.fecha <= hasta).map((f) => ({
      usuario: f.usuario, fecha: f.fecha, seguidores: f.seguidores, publicaciones: f.publicaciones,
      interaccionesPromedio: f.interacciones_promedio, datos: leerJSON(f.datos, {}),
    })), desde),
    plan: {
      planificadas: posts.length,
      aprobadas: posts.filter((p) => p.status === "approved" || p.status === "published").length,
      publicadasDesdeLaApp: publicadas.filter((f) => (f.publicada_at ?? "") >= desde && (f.publicada_at ?? "") <= `${hasta}T23:59:59`).length,
    },
  };
}

/** Lo que se le pide a la IA. Las cifras van en JSON y no se pueden inventar otras. */
function pedido(cifras, cliente) {
  const ficha = [cliente.industry && `Rubro: ${cliente.industry}`, cliente.descripcion && `Descripción: ${String(cliente.descripcion).slice(0, 600)}`]
    .filter(Boolean).join("\n");
  return `Eres el estratega de redes sociales de la agencia Juancito Ads (Panamá). Escribe el análisis del informe mensual de ${cifras.cliente.nombre} para ${cifras.nombreMes}, que leerá el propio cliente.

${ficha}

Estas son TODAS las cifras del mes (JSON). «cambio» es el % respecto al mes anterior; null significa que no hay con qué comparar. No inventes ningún número que no esté aquí; si un dato falta, no lo menciones.

${JSON.stringify(cifras)}

Devuelve SOLO un objeto JSON, sin texto antes ni después, con esta forma:
{
  "resumen": "3 o 4 frases: cómo fue el mes, con las 2 o 3 cifras que más importan",
  "destacados": ["3 a 5 logros concretos, cada uno con su cifra"],
  "aprendizajes": ["3 a 4 cosas que enseñan los datos: qué formato, qué tema, qué horario funcionó y cuál no"],
  "recomendaciones": ["3 a 5 acciones concretas para el mes siguiente, que se puedan poner en el calendario"],
  "ideas": [{"formato": "reel|carrusel|imagen|historia", "idea": "una idea de publicación concreta para el mes siguiente"}]
}

Tono: cercano y profesional, en español de Panamá, de tú. Sin tecnicismos: «personas alcanzadas» mejor que «reach». Si el mes fue flojo, dilo con honestidad y en positivo: qué se va a hacer para mejorarlo.`;
}

function extraerJSON(texto) {
  const inicio = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (inicio < 0 || fin < inicio) return null;
  try { return JSON.parse(texto.slice(inicio, fin + 1)); } catch { return null; }
}

const lista = (x, n) => (Array.isArray(x) ? x.map((s) => (typeof s === "string" ? s : s)).filter(Boolean).slice(0, n) : []);

/**
 * Genera (o regenera) el informe de `mes`. Conserva el enlace público si
 * ya lo había: regenerar no puede romper el que el cliente tiene.
 */
export async function generarInforme(env, acceso, { clientId, mes, usuarioId = null, automatico = false }) {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error("Mes inválido.");
  const cliente = await acceso.leerUno("clients", { id: clientId });
  if (!cliente) throw new Error("Ese cliente no existe.");
  if (!env.ANTHROPIC_API_KEY) throw new Error("El servidor no tiene configurada la clave de Anthropic.");

  const id = `${clientId}:${mes}`;
  const previo = await acceso.leerUno("informes", { id });
  const base = {
    id, client_id: clientId, mes, testigo: previo?.testigo ?? null, compartido: previo?.compartido ?? 0,
    automatico: automatico ? 1 : 0, generado_por: usuarioId, created_at: previo?.created_at ?? new Date().toJSON(),
  };
  await acceso.guardar("informes", { ...base, estado: "generando", contenido: previo?.contenido ?? "{}", error: null, updated_at: "" });
  difundir(env, acceso.ownerId, { tipo: "informe", clientId, mes, estado: "generando", por: { userId: "sistema", nombre: "Informes", color: "#1E90FF" } });

  try {
    const cifras = await cifrasDelMes(acceso, clientId, mes);
    const ia = await prepararIA(env, acceso);
    if (ia.bloqueo) throw new Error(ia.bloqueo);
    let modelo = ia.modelo;
    let m;
    for (;;) {
      try {
        const res = await abrirFlujo(env, {
          model: modelo,
          max_tokens: 4000 + (MARGEN_RAZONAMIENTO[ia.esfuerzo] ?? 16_000),
          thinking: { type: "adaptive" },
          output_config: { effort: ia.esfuerzo },
          messages: [{ role: "user", content: pedido(cifras, cliente) }],
        });
        m = await leerFlujo(res);
        break;
      } catch (e) {
        if (esRechazoDeModelo(e) && modelo !== MODELO_SONNET) { modelo = MODELO_SONNET; continue; }
        throw new Error(mensajeDeRechazo(e));
      }
    }
    await registrarConsumo(acceso, { funcion: "informe", modelo, uso: m.usage, clienteId: clientId });
    const texto = textoDe(m);
    const bruto = extraerJSON(texto);
    const analisis = bruto
      ? {
          resumen: String(bruto.resumen ?? ""),
          destacados: lista(bruto.destacados, 6),
          aprendizajes: lista(bruto.aprendizajes, 5),
          recomendaciones: lista(bruto.recomendaciones, 6),
          ideas: lista(bruto.ideas, 5).map((i) => (typeof i === "string" ? { formato: "", idea: i } : { formato: String(i.formato ?? ""), idea: String(i.idea ?? "") })),
        }
      : { resumen: texto.trim().slice(0, 3000), destacados: [], aprendizajes: [], recomendaciones: [], ideas: [] };

    const fila = { ...base, estado: "listo", contenido: JSON.stringify({ cifras, analisis, modelo }), error: null, updated_at: "" };
    await acceso.guardar("informes", fila);
    difundir(env, acceso.ownerId, { tipo: "informe", clientId, mes, estado: "listo", por: { userId: "sistema", nombre: "Informes", color: "#1E90FF" } });
    return fila;
  } catch (e) {
    await acceso.guardar("informes", { ...base, estado: "error", contenido: previo?.contenido ?? "{}", error: String(e?.message ?? e).slice(0, 500), updated_at: "" });
    difundir(env, acceso.ownerId, { tipo: "informe", clientId, mes, estado: "error", por: { userId: "sistema", nombre: "Informes", color: "#1E90FF" } });
    throw e;
  }
}

/**
 * El cron: del día 1 al 5, desde las 9:00 de Panamá (la foto del último
 * día del mes ya está), el informe del mes anterior de cada cliente con
 * cuentas medidas. Uno por vuelta.
 */
export async function informePendiente(env, ahora = new Date()) {
  if (!env.ANTHROPIC_API_KEY) return 0;
  const hoy = fechaEnZona(ahora);
  const horaPanama = (ahora.getUTCHours() + 19) % 24;
  if (Number(hoy.slice(8, 10)) > 5 || horaPanama < 9) return 0;
  const mes = mesAnterior(ahora);
  const [siguiente] = await clientesSinInforme(env.DB, mes, 1);
  if (!siguiente) return 0;
  const acceso = crearAcceso(env.DB, siguiente.owner_id);
  try {
    await generarInforme(env, acceso, { clientId: siguiente.client_id, mes, automatico: true });
  } catch (e) {
    console.error("informe automático:", siguiente.client_id, e?.message);
  }
  return 1;
}
