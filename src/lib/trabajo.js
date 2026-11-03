// ============================================================
// Trabajar en equipo (puro): menciones, etapas, historial y carga
//
// Lo importa también el Worker: las menciones que generan avisos, los
// cambios que se apuntan en el historial y quién recibe qué se calculan
// con ESTE código a los dos lados. Ver docs/propuesta-equipo.md.
// ============================================================

import { mediosDe } from "./publicacion.js";
import { listaParaProgramar, porProducir } from "./aprobacion.js";
import { sumarDias } from "./agenda.js";

// ------------------------------------------------------------
// Menciones: «@Bruno, cambia la foto»
// ------------------------------------------------------------

const normal = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Los miembros mencionados en un texto. Vale el nombre entero («@Ana
 * María») o el primero («@Ana»), sin importar tildes ni mayúsculas. Si
 * el primer nombre lo comparten dos personas, sólo cuenta el entero:
 * avisar a quien no era es peor que no avisar.
 */
export function mencionesEn(texto, miembros = []) {
  const t = normal(texto);
  if (!t.includes("@")) return [];
  const primeros = new Map();
  for (const m of miembros) {
    const p = normal(m.nombre).split(/\s+/)[0];
    if (p) primeros.set(p, (primeros.get(p) ?? 0) + 1);
  }
  const salida = [];
  for (const m of miembros) {
    const entero = normal(m.nombre);
    if (!entero) continue;
    const primero = entero.split(/\s+/)[0];
    const casa = (n) => new RegExp(`(^|[^\\p{L}\\p{N}_])@${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "u").test(t);
    if (casa(entero) || (primeros.get(primero) === 1 && casa(primero))) salida.push(m.userId ?? m.user_id);
  }
  return [...new Set(salida)];
}

// ------------------------------------------------------------
// Etapas de producción
// ------------------------------------------------------------

/**
 * De la idea a publicada, en CUATRO pasos que salen SOLOS (decisión de la agencia: marcar la etapa a mano no lo hacía
 * nadie, y el tablero mentía). Nadie la elige:
 *
 *   idea         sin archivos todavía;
 *   producción   ya tiene archivos (subidos o del Estudio) y no se ha mandado al cliente;
 *   cliente      se le mandó (se copió o compartió el enlace o el mensaje de «Enviar a cliente»: `post.enviadoAt`) o ya
 *                respondió. Dice en qué quedó: con el cliente, aprobada, pidió cambios, corregida;
 *   programada   está en la cola; el mismo paso dice «Publicada» cuando sale.
 *
 * `post.etapa` se queda para lo INTERNO: «aprobada por dentro» (revisión interna, «Revisar las ideas») y «enviada a
 * grabar» (los guiones UGC). Ya no es lo que se enseña.
 */
export const ETAPAS = [
  ["idea", "Idea", "bulb"],
  ["produccion", "Producción", "palette"],
  ["cliente", "Cliente", "send"],
  ["programada", "Programada", "clock"],
];
export const NOMBRE_ETAPA = { ...Object.fromEntries(ETAPAS.map(([k, n]) => [k, n])), publicada: "Publicada" };

/**
 * En qué paso está y qué decir de él. `estadoCola` es el de su fila en la cola (si hay). `compartido` es el respaldo de
 * los meses que se mandaron ANTES de apuntar `enviadoAt` (el calendario tiene enlace y nunca se marcó un envío): ahí,
 * como antes, una pendiente con enlace está con el cliente.
 * @returns {{ etapa: "idea"|"produccion"|"cliente"|"programada"|"publicada", paso: number, texto: string }}
 */
export function detalleEtapa(post, { estadoCola = null, compartido = false, revisionInterna = false } = {}) {
  const con = (etapa, texto) => ({ etapa, paso: etapa === "publicada" ? 3 : ETAPAS.findIndex(([k]) => k === etapa), texto });
  if (post?.status === "published" || estadoCola === "publicada") return con("publicada", "Publicada");
  if (estadoCola === "programada" || estadoCola === "procesando") return con("programada", estadoCola === "procesando" ? "Publicándose" : "Programada");
  if (listaParaProgramar(post)) return con("cliente", post.subidaRapida ? "Lista para programar" : "Aprobada por el cliente");
  const conArchivos = mediosDe(post).length > 0;
  // Idea aprobada: toca producirla (o ya se está produciendo).
  if (porProducir(post)) return con("produccion", conArchivos ? "Idea aprobada · con su pieza" : "Idea aprobada · por producir");
  if (post?.status === "rejected") {
    const corregida = post.actualizadaAt && (!post.cambiosAt || post.actualizadaAt > post.cambiosAt);
    return con("cliente", corregida ? "Corregida · falta que la vea" : "Pidió cambios");
  }
  if (post?.enviadoAt || (compartido && visibleParaCliente(post, revisionInterna))) return con("cliente", "Con el cliente");
  if (!conArchivos) return con("idea", aprobadaDentro(post) ? "Idea aprobada por dentro" : "Idea");
  // Con revisión interna, el cliente sólo ve lo que pasó a «cliente» por dentro (`visibleParaCliente`).
  if (revisionInterna && post?.etapa !== "cliente") return con("produccion", "Falta la revisión interna");
  return con("produccion", revisionInterna ? "Aprobada por dentro · lista para enviar" : "En producción");
}

/** El paso, en una palabra (lo que antes devolvía): idea | produccion | cliente | programada | publicada. */
export const etapaDe = (post, opciones = {}) => detalleEtapa(post, opciones).etapa;

/** ¿La agencia ya la aprobó por dentro? (revisión interna o «Revisar las ideas»). */
const aprobadaDentro = (post) => ["produccion", "revision", "cliente"].includes(post?.etapa);

/**
 * Con revisión interna, el enlace del cliente sólo enseña lo que pasó la
 * revisión: lo que está en idea, producción o revisión se queda dentro.
 * Lo que el cliente ya respondió se sigue viendo (es su historial).
 */
export function visibleParaCliente(post, revisionInterna) {
  if (!revisionInterna) return true;
  if (post?.status && post.status !== "pending") return true;
  return !["idea", "produccion", "revision"].includes(post?.etapa ?? "idea");
}

/**
 * Marca como ENVIADAS al cliente las publicaciones que va a ver (al copiar o compartir el enlace o el mensaje de
 * «Enviar a cliente»). Sólo las pendientes que aún no lo estaban: reenviar el enlace no cambia la fecha de las de antes.
 * Pura: devuelve los días nuevos, o los mismos si no había nada que marcar.
 */
export function marcarEnviadas(days, { revisionInterna = false, cuando = new Date().toISOString() } = {}) {
  let cambio = false;
  const nuevos = (days ?? []).map((d) => {
    let tocado = false;
    const posts = (d.posts ?? []).map((p) => {
      if (p.enviadoAt || p.status === "published" || (p.status && p.status !== "pending") || !visibleParaCliente(p, revisionInterna)) return p;
      tocado = true;
      return { ...p, enviadoAt: cuando };
    });
    if (!tocado) return d;
    cambio = true;
    return { ...d, posts };
  });
  return cambio ? nuevos : days;
}

// ------------------------------------------------------------
// Historial: qué cambió entre dos versiones de un calendario
// ------------------------------------------------------------

const texto = (p) => [p?.descripcion || p?.script || "", p?.hashtagsFinales || "", p?.guion || "", p?.primerComentario || ""].join("\u0001");
const archivos = (p) => mediosDe(p).map((m) => m.src).join("|");
const titulo = (p) => p?.title || String(p?.idea || p?.descripcion || "").split(/[.\n]/)[0].slice(0, 50) || "la publicación";

/** Cada publicación con su día, por id. */
function indice(days = []) {
  const m = new Map();
  for (const d of days ?? []) for (const p of d?.posts ?? []) if (p?.id) m.set(p.id, { post: p, fecha: d.date });
  return m;
}

const fechaCorta = (f) => {
  if (!f) return "";
  const [, mm, dd] = f.split("-").map(Number);
  return `${dd}/${mm}`;
};

/**
 * Lo que cambió, publicación a publicación, en palabras para el
 * historial: [{ postId, accion, titulo, responsable: {antes, despues}, etapa }].
 * `nombreDe` traduce un user_id a su nombre.
 */
export function cambiosEntre(antes = [], despues = [], nombreDe = () => "") {
  const a = indice(antes);
  const d = indice(despues);
  const salida = [];
  for (const [id, { post, fecha }] of d) {
    const previo = a.get(id);
    if (!previo) { salida.push({ postId: id, titulo: titulo(post), accion: `Creó «${titulo(post)}» (${fechaCorta(fecha)})` }); continue; }
    const p0 = previo.post;
    const t = titulo(post);
    if (previo.fecha !== fecha) salida.push({ postId: id, titulo: t, accion: `La movió del ${fechaCorta(previo.fecha)} al ${fechaCorta(fecha)}` });
    if ((p0.publishTime || "") !== (post.publishTime || "")) salida.push({ postId: id, titulo: t, accion: `Cambió la hora a ${post.publishTime || "sin hora"}` });
    if (texto(p0) !== texto(post)) salida.push({ postId: id, titulo: t, accion: "Cambió el texto" });
    if (archivos(p0) !== archivos(post)) salida.push({ postId: id, titulo: t, accion: "Cambió las imágenes o videos" });
    if ((p0.format || "") !== (post.format || "")) salida.push({ postId: id, titulo: t, accion: `Cambió el formato a ${post.format}` });
    if ((p0.status || "pending") !== (post.status || "pending") && post.status === "published") salida.push({ postId: id, titulo: t, accion: "La marcó como publicada" });
    // `etapa` es ya sólo lo interno: aprobarla por dentro (o devolverla) y mandarla a grabar.
    if ((p0.etapa || "") !== (post.etapa || "") && post.etapa) {
      const accion = post.etapa === "cliente" ? "La aprobó por dentro" : post.etapa === "idea" ? "La devolvió a idea" : post.etapa === "produccion" ? "La pasó a producción" : post.etapa === "revision" ? "La devolvió a revisión interna" : `La pasó a «${post.etapa}»`;
      salida.push({ postId: id, titulo: t, accion, etapa: post.etapa });
    }
    if (!p0.enviadoAt && post.enviadoAt) salida.push({ postId: id, titulo: t, accion: "Se le mandó al cliente" });
    if ((p0.responsableId || "") !== (post.responsableId || "")) {
      salida.push({
        postId: id, titulo: t,
        accion: post.responsableId ? `Se la asignó a ${nombreDe(post.responsableId) || "alguien del equipo"}` : "Le quitó el responsable",
        responsable: { antes: p0.responsableId || null, despues: post.responsableId || null },
      });
    }
    if ((p0.revisorId || "") !== (post.revisorId || "") && post.revisorId) {
      salida.push({ postId: id, titulo: t, accion: `Pidió la revisión a ${nombreDe(post.revisorId) || "alguien del equipo"}`, revisor: post.revisorId });
    }
  }
  for (const [id, { post }] of a) {
    if (!d.has(id)) salida.push({ postId: id, titulo: titulo(post), accion: `Quitó «${titulo(post)}» del calendario` });
  }
  return salida;
}

// ------------------------------------------------------------
// Carga del equipo
// ------------------------------------------------------------

/**
 * Cuánto tiene cada persona en los próximos `dias`: publicaciones que
 * lleva (sin publicar) y tareas abiertas, y cuántas de ellas van atrasadas.
 *
 * @param clients  con sus calendarios (days ya leídos)
 * @param tareas   client_tasks + quick_tasks (con asignado_id)
 */
export function cargaDelEquipo({ miembros = [], clients = [], tareas = [], hoy, dias = 7 }) {
  const hasta = sumarDias(hoy, dias - 1);
  const filas = new Map(miembros.map((m) => [m.userId, { ...m, publicaciones: 0, tareas: 0, atrasadas: 0, porDia: {} }]));
  const sinDueno = { userId: null, nombre: "Sin asignar", publicaciones: 0, tareas: 0, atrasadas: 0, porDia: {} };
  const de = (id) => filas.get(id) ?? sinDueno;
  for (const c of clients) for (const cal of c.calendars ?? []) for (const d of cal.days ?? []) {
    if (!d?.date || d.date > hasta) continue;
    for (const p of d.posts ?? []) {
      if (p?.status === "published") continue;
      const atrasada = d.date < hoy;
      if (atrasada && p.status === "approved") continue; // ya salió o se quedó: no es carga de producción
      const f = de(p.responsableId);
      f.publicaciones += 1;
      if (atrasada) f.atrasadas += 1;
      else f.porDia[d.date] = (f.porDia[d.date] ?? 0) + 1;
    }
  }
  for (const t of tareas) {
    if (t.status === "completed" || t.status === "done") continue;
    const cuando = t.due_date || t.today_date || null;
    if (cuando && cuando > hasta) continue;
    const f = de(t.asignado_id);
    f.tareas += 1;
    if (cuando && cuando < hoy) f.atrasadas += 1;
    else if (cuando) f.porDia[cuando] = (f.porDia[cuando] ?? 0) + 1;
  }
  const lista = [...filas.values()];
  if (sinDueno.publicaciones || sinDueno.tareas) lista.push(sinDueno);
  return lista;
}

