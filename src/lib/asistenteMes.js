// ============================================================
// El ASISTENTE DEL MES: el mes en un solo flujo (puro)
//
// Diseñar un mes eran cinco puertas («Planificar mes», «Producir el mes»,
// «Diseñar las que ya hay», «Revisar las ideas», «Revisar el mes», «Completar
// los textos»…). El asistente (calendario/AsistenteMes.jsx, en el botón
// grande del calendario) las pone en fila, en una sola pantalla con su avance:
//
//   1. Estrategia   objetivo, foco, campaña, ofertas y la etapa de cada semana,
//                   precargada del calendario, con UNA sola IA.
//   2. Plan         las publicaciones del mes salen del PLAN SEMANAL de la
//                   empresa (formato, tipo y hora de cada día; lib/planSemanal.js)
//                   con las fechas especiales y la temporada. Al confirmarlo se
//                   ponen en el calendario como CASILLAS (sin idea todavía).
//   3. Ideas        el motor del servidor escribe cada casilla (de tanda en tanda,
//                   cada tanda se guarda al llegar: lo pagado no se pierde); la
//                   lista lleva el balance del mes y la aprobación INTERNA.
//   4. Diseñar      las aprobadas, por los encargos del servidor (imagen,
//                   carrusel y reel), con el costo delante; se ponen SOLAS.
//   5. Revisar y enviar   la revisión del mes, las horas en bloque y el envío.
//
// SE GUARDA EN EL CALENDARIO (D1), no en el navegador: la estrategia en sus
// campos de siempre, las casillas como publicaciones y lo del asistente en
// `opciones.asistente` (el paso y los cambios de temporada aceptados). Así lo
// retoma otra persona del equipo, o la misma en el teléfono. Un mes que ya tiene
// publicaciones entra en el paso que le toca (`pasoQueToca`), sin pisar nada.
// ============================================================

import { mediosDe } from "./publicacion.js";
import { porRevisar, aprobadaPorDentro } from "./revisionIdeas.js";
import { limpiarEstrategia } from "./embudo.js";
import { nombreDePilar, sugerenciasDeTemporada, ritmoDelMes, asignarMatriz, CAMPOS_MATRIZ } from "./pilares.js";
import { ponerEnDia } from "./subir.js";
import { horaDelPlan, limpiarHoraPlan, semanaDelCliente, ritmoDelCliente, notasDelCliente } from "./planSemanal.js";
import { fechasDelMes } from "./fechasEspeciales.js";
import { conNotasDelDia } from "./notasSemana.js";
import { productosParaPlan, limpiarEstudio } from "./estudioMercado.js";
import { sugerirPauta } from "./pauta.js";

export const PASOS_MES = Object.freeze([
  { id: "estrategia", nombre: "Estrategia" },
  { id: "plan", nombre: "Plan" },
  { id: "ideas", nombre: "Ideas" },
  { id: "disenar", nombre: "Diseñar" },
  { id: "enviar", nombre: "Revisar y enviar" },
]);
export const PASO_MES = Object.freeze(Object.fromEntries(PASOS_MES.map((p, i) => [p.id, i])));

const dos = (n) => String(n).padStart(2, "0");
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lo del asistente guardado en el calendario (`opciones.asistente`), limpio: { paso, aceptadas, llenarOcupados,
 * actualizadoAt, por }. `aceptadas`: los cambios de temporada que se aceptaron ([{ fecha, a }]). Pura.
 */
export function limpiarAsistente(x) {
  const a = x && typeof x === "object" ? x : {};
  const paso = Number.isInteger(a.paso) && a.paso >= 0 && a.paso < PASOS_MES.length ? a.paso : null;
  return {
    paso,
    aceptadas: (Array.isArray(a.aceptadas) ? a.aceptadas : [])
      .filter((c) => FECHA.test(String(c?.fecha ?? "")) && typeof c?.a === "string")
      .slice(0, 31).map((c) => ({ fecha: c.fecha, a: String(c.a).slice(0, 40), ...(c.de ? { de: String(c.de).slice(0, 40) } : {}), ...(c.motivo ? { motivo: String(c.motivo).slice(0, 160) } : {}), ...(c.id ? { id: String(c.id).slice(0, 80) } : {}) })),
    llenarOcupados: a.llenarOcupados === true,
    actualizadoAt: typeof a.actualizadoAt === "string" ? a.actualizadoAt.slice(0, 40) : "",
    por: typeof a.por === "string" ? a.por.slice(0, 80) : "",
  };
}

/** El calendario con lo del asistente cambiado (sin tocar el resto de `opciones`). Pura. */
export function conAsistente(cal, cambios = {}, { por = "", ahora = new Date().toISOString() } = {}) {
  const a = limpiarAsistente({ ...cal?.opciones?.asistente, ...cambios });
  return { ...cal, opciones: { ...(cal?.opciones ?? {}), asistente: { ...a, actualizadoAt: ahora, por: por || a.por } } };
}

/** ¿Se diseña con IA? Una idea APROBADA por dentro de imagen, carrusel o reel hecho con IA (un UGC se graba). Pura. */
export const paraDisenar = (post) => aprobadaPorDentro(post) && (["post", "historia", "carrusel"].includes(post?.format) || (post?.format === "reel" && !post?.rostro));

const todasLas = (cal) => (cal?.days ?? []).flatMap((d) => (d.posts ?? []).map((post) => ({ post, day: d })));
const tieneIdea = (p) => Boolean(String(p?.idea || p?.title || "").trim());

/**
 * Dónde está el mes: cuántas publicaciones, cuántas casillas del plan sin idea, cuántas ideas por aprobar, cuántas
 * aprobadas sin pieza (las de diseñar: imagen, carrusel y reel hecho con IA), cuántos UGC para grabar, cuántas sin
 * hora y si la estrategia y el envío están. Pura.
 */
export function estadoDelMes(cal) {
  const todas = todasLas(cal).filter(({ post }) => post.status !== "published");
  const sinPieza = todas.filter(({ post }) => !mediosDe(post).length);
  const ideas = sinPieza.filter(({ post }) => tieneIdea(post));
  const estrategia = limpiarEstrategia(cal?.opciones?.estrategia);
  return {
    publicaciones: todasLas(cal).length,
    sinIdea: sinPieza.filter(({ post }) => !tieneIdea(post) && post.format !== "live").length,
    porAprobar: ideas.filter(({ post }) => porRevisar(post)).length,
    porDisenar: ideas.filter(({ post }) => paraDisenar(post)).length,
    paraGrabar: ideas.filter(({ post }) => post.format === "reel" && post.rostro).length,
    conPieza: todas.length - sinPieza.length,
    sinHora: todas.filter(({ post }) => !String(post.publishTime ?? "").trim()).length,
    estrategia: Boolean(estrategia || String(cal?.campaign ?? "").trim()),
    enviado: Boolean(cal?.opciones?.enviadoAt),
  };
}

/**
 * El paso en que se abre: el que le toca al mes (lo que falta), o el guardado si es anterior (se dejó ahí: se vuelve
 * ahí). Un mes vacío empieza por la estrategia (o por el plan, si ya la tiene). Pura.
 */
export function pasoQueToca(cal) {
  const e = estadoDelMes(cal);
  let toca;
  if (!e.publicaciones) toca = e.estrategia ? PASO_MES.plan : PASO_MES.estrategia;
  else if (e.sinIdea || e.porAprobar) toca = PASO_MES.ideas;
  else if (e.porDisenar) toca = PASO_MES.disenar;
  else toca = PASO_MES.enviar;
  const guardado = limpiarAsistente(cal?.opciones?.asistente).paso;
  return guardado == null ? toca : Math.min(guardado, toca);
}

/**
 * Las casillas del mes según el plan semanal: un día por fecha del mes (desde `desde`), cada publicación del plan de
 * ese día de la semana con su formato, su tipo (el de la temporada aceptada en la primera del día) y su hora. Los días
 * OCUPADOS (ya con publicaciones) no reciben nada salvo `llenarOcupados`. Sin formato fijo en el plan, «post».
 * `semana`: la de `semanaDelCliente`; `ritmoMes`: fecha → tipo (`ritmoDelMes`, con la temporada aceptada);
 * `fechas`: las especiales del mes ([{ fecha, nombre }]). → [{ clave, fecha, format, pilar, rostro?, hora?, especial? }].
 * Pura.
 */
export function casillasDelMes({ year, month, semana, ritmoMes = {}, ocupados = new Set(), llenarOcupados = false, desde = "", fechas = [] }) {
  const total = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const especial = new Map((fechas ?? []).map((f) => [f.fecha, f.nombre]));
  const salida = [];
  for (let d = 1; d <= total; d++) {
    const fecha = `${year}-${dos(month + 1)}-${dos(d)}`;
    if ((desde && fecha < desde) || (ocupados.has(fecha) && !llenarOcupados)) continue;
    const dow = new Date(Date.UTC(year, month, d)).getUTCDay();
    (semana?.dias?.[dow] ?? []).forEach((h, j) => {
      const pilar = (j === 0 ? ritmoMes[fecha] : "") || h.pilar || "";
      if (!pilar) return;
      const hora = limpiarHoraPlan(h.hora);
      salida.push({
        clave: `${fecha}|${j}`, fecha, format: h.format || "post", pilar,
        ...(h.format === "reel" && h.rostro ? { rostro: true } : {}),
        ...(hora ? { hora } : {}),
        ...(especial.get(fecha) ? { especial: especial.get(fecha) } : {}),
      });
    });
  }
  return salida;
}

/**
 * EL PASO DEL PLAN entero, sin pantalla: lo que pone el plan semanal de la empresa en el mes (lo mismo que enseña el
 * paso «Plan» y lo que pone el conector de Claude con preparar_mes). `cliente`: el de la aplicación (camelCase, con su
 * plan semanal y sus fechas especiales); `lista`: las plantillas de la agencia; `aceptadas`: los ajustes de temporada
 * que se aceptaron; `hoy`: AAAA-MM-DD (en el mes en curso, sólo desde hoy). → { semana, ritmo, notas, todasLasFechas,
 * fechas (las que se enseñan), sugerencias (de temporada), ocupados, casillas, pasado }. Pura.
 */
export function planDelAsistente({ cliente, cal, lista = [], aceptadas = [], llenarOcupados = false, hoy = "" }) {
  const { year, month } = cal;
  const mes = `${year}-${dos(month + 1)}`;
  const semana = semanaDelCliente(cliente, lista);
  const todasLasFechas = fechasDelMes(year, month, cliente?.fechasEspeciales);
  const fechas = todasLasFechas.filter((f) => f.destacada || f.tipo !== "internacional");
  const ritmo = ritmoDelCliente(cliente);
  const sugerencias = sugerenciasDeTemporada({ year, month, ritmo, fechas: todasLasFechas });
  const ocupados = new Set((cal?.days ?? []).filter((d) => (d.posts ?? []).length).map((d) => d.date));
  const casillas = casillasDelMes({
    year, month, semana, ritmoMes: ritmoDelMes(year, month, ritmo, aceptadas), ocupados, llenarOcupados,
    desde: hoy && mes === hoy.slice(0, 7) ? hoy : "", fechas: fechas.map((f) => ({ fecha: f.fecha, nombre: f.delicada ? `${f.nombre} (fecha delicada: sin promociones)` : f.nombre })),
  });
  return { semana, ritmo, notas: notasDelCliente(cliente) ?? {}, todasLasFechas, fechas, sugerencias, ocupados, casillas, pasado: Boolean(hoy) && mes < hoy.slice(0, 7) };
}

/**
 * La matriz (producto, nivel, deseo, perfil) de las casillas del plan sobre el plan ENTERO, como «Planificar mes»: la
 * nota fija del día manda su producto y el foco de la estrategia pesa la mitad de la rotación. `mercado`: { catalogo,
 * estudio, inventario }. → Map clave → { campos de la matriz }. Pura.
 */
export function matrizDelPlan(casillas = [], { mercado = null, notas = {}, foco = "" } = {}) {
  const general = limpiarEstudio(mercado?.estudio)?.general;
  const productos = productosParaPlan(mercado?.catalogo ?? [], mercado?.inventario);
  const conNotas = conNotasDelDia(casillas.map((c) => ({ clave: c.clave, fecha: c.fecha, pilar: c.pilar })), notas, productos)
    .map(({ notaDia: _n, fecha: _f, ...c }) => c);
  return new Map(asignarMatriz(conNotas, { productos, deseos: general?.deseos ?? [], perfiles: general?.perfiles ?? [], foco })
    .map(({ clave, ...m }) => [clave, Object.fromEntries(CAMPOS_MATRIZ.map((k) => [k, m[k] ?? ""]))]));
}

/**
 * Las que van a pauta solas al poner el plan (decisión 9): las del tipo «Anuncio», las de la oferta del mes y algunas
 * frías para Presentación, con su etapa (en una cuenta nueva, lo de conversión va a evaluación). `cuenta`: la de los
 * números del negocio. → lo de `sugerirPauta` ([{ id: clave, pauta, motivo, cuentaNueva? }]). Pura.
 */
export const pautaDelPlan = (casillas = [], matriz = new Map(), { ofertas = "", codigo = "", cuenta = "" } = {}) => sugerirPauta(
  casillas.map((c) => ({ id: c.clave, post: { format: c.format, pilar: c.pilar, nivel: matriz.get(c.clave)?.nivel ?? "" } })),
  { ofertas, codigo, cuenta },
);

/**
 * Las publicaciones que pone el plan, listas para `conCasillas`: cada casilla con su matriz y, si va a pauta sola, su
 * pauta (o `false` si alguien la quitó: `sinPauta`, por clave, así no se vuelve a proponer). `nuevoId()`: el id de cada
 * una. → [{ fecha, especial, post }]. Pura salvo por `nuevoId`.
 */
export function publicacionesDelPlan(casillas = [], { matriz = new Map(), sugeridas = [], sinPauta = new Set(), nuevoId } = {}) {
  const enPauta = new Map(sugeridas.map((x) => [x.id, x]));
  return casillas.map((c) => {
    const post = publicacionDeCasilla(c, { id: nuevoId(), matriz: matriz.get(c.clave) ?? {} });
    const s = enPauta.get(c.clave);
    return { fecha: c.fecha, especial: c.especial ?? "", post: s ? { ...post, pauta: sinPauta.has(c.clave) ? false : s.pauta } : post };
  });
}

/**
 * La publicación del calendario que sale de una casilla del plan: sin idea todavía (la escribe el motor en el paso
 * de las ideas), con su formato, su tipo, su hora y lo que la matriz le dio (producto, nivel, deseo, perfil). `delPlan`
 * dice que la puso el asistente. Pura.
 */
export function publicacionDeCasilla(c, { id, matriz = {} } = {}) {
  const m = Object.fromEntries(["pilarSub", "productoId", "producto", "nivel", "deseo", "perfil"].filter((k) => matriz[k]).map((k) => [k, matriz[k]]));
  return {
    id, format: c.format, pilar: c.pilar, ...m,
    ...(c.rostro ? { rostro: true } : {}),
    idea: "", title: "", descripcion: "", guion: "", hashtagsFinales: "", comment: "",
    // Sin `aprobacion`: el cliente aprobará la pieza si la tiene (lo de siempre), no sólo la idea.
    status: "pending", category: nombreDePilar(c.pilar, m.pilarSub) || "",
    publishTime: c.hora || "",
    delPlan: true,
  };
}

/**
 * El calendario con las publicaciones del plan puestas en sus días (la fecha especial del día, si la hay, en el día).
 * Las que ya están (por id) no se repiten. Pura.
 */
export function conCasillas(cal, publicaciones = []) {
  const ya = new Set(todasLas(cal).map(({ post }) => post.id));
  let salida = { ...cal, days: [...(cal?.days ?? [])] };
  for (const { fecha, post, especial } of publicaciones) {
    if (!post?.id || ya.has(post.id) || !FECHA.test(String(fecha))) continue;
    ya.add(post.id);
    salida = ponerEnDia(salida, fecha, post);
    if (especial) salida = { ...salida, days: salida.days.map((d) => (d.date === fecha && !d.specialDate ? { ...d, specialDate: especial } : d)) };
  }
  return salida;
}

/**
 * LAS HORAS EN BLOQUE: a toda publicación sin hora (y sin publicar) le pone la del plan semanal para su día y su
 * formato (`horaDelPlan`) o, si el plan no la dice, `porDefecto`. Lo que ya tiene hora no se toca. → { days, cambiadas }.
 * Pura.
 */
export function horasEnBloque(days = [], { semana = null, porDefecto = "" } = {}) {
  const defecto = limpiarHoraPlan(porDefecto);
  let cambiadas = 0;
  const salida = days.map((d) => {
    const vistos = {};
    let cambio = false;
    const posts = (d.posts ?? []).map((p) => {
      const i = vistos[p.format] = (vistos[p.format] ?? -1) + 1;
      if (p.status === "published" || String(p.publishTime ?? "").trim()) return p;
      const hora = horaDelPlan(semana, d.date, p.format, i) || defecto;
      if (!hora) return p;
      cambio = true;
      cambiadas += 1;
      return { ...p, publishTime: hora };
    });
    return cambio ? { ...d, posts } : d;
  });
  return { days: salida, cambiadas };
}

/** Lo que dice el avance de cada paso (debajo de su nombre). Pura. */
export function avanceDelMes(cal) {
  const e = estadoDelMes(cal);
  return [
    e.estrategia ? "Lista" : "Por hacer",
    e.publicaciones ? `${e.publicaciones} ${e.publicaciones === 1 ? "publicación" : "publicaciones"}` : "Sin publicaciones",
    e.sinIdea ? `${e.sinIdea} sin idea` : e.porAprobar ? `${e.porAprobar} por aprobar` : e.publicaciones ? "Aprobadas" : "—",
    e.porDisenar ? `${e.porDisenar} por diseñar` : e.paraGrabar ? `${e.paraGrabar} para grabar` : e.conPieza ? `${e.conPieza} con pieza` : "—",
    e.enviado ? "Enviado" : e.sinHora ? `${e.sinHora} sin hora` : "Por enviar",
  ];
}
