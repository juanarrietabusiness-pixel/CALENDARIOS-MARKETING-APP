// ============================================================
// Qué aprueba el cliente: la IDEA o la PIEZA FINAL (puro)
//
// A veces se le manda sólo la idea —el concepto, el guion, la
// referencia— para que diga si va por ahí; otras, la pieza terminada tal
// como se va a publicar. Las dos se aprobaban igual, y «aprobada» quería
// decir «lista para programar» aunque el cliente sólo hubiera visto un
// concepto sin archivo.
//
// Ahora cada publicación dice qué se le pide (`post.aprobacion`), la
// aprobación guarda qué aprobó (`approvals.tipo`) y con qué texto
// (`approvals.huella`), y de ahí sale:
//
//   · idea aprobada   → «Por producir»: nunca se programa, falta la pieza.
//   · pieza aprobada  → «Por programar»: espera a que la agencia pulse
//                       Programar (el paso final). Sólo sale sola si el
//                       calendario tiene encendido «Programar al aprobar».
//
// Lo importa también el Worker: la página del cliente, la aprobación y
// «Programar al aprobar» aplican la MISMA regla que la pantalla.
// ============================================================

import { mediosDe, momentoPublicacion } from "./publicacion.js";
import { fechaEnZona } from "./agenda.js";

export const TIPOS_APROBACION = {
  idea: {
    nombre: "La idea",
    corto: "Idea",
    ayuda: "El cliente revisa el concepto. Al aprobarla queda «por producir»: no se programa hasta que haya pieza.",
  },
  pieza: {
    nombre: "La pieza final",
    corto: "Pieza final",
    ayuda: "El cliente ve la imagen o el video y el texto tal como saldrán. Al aprobarla queda «por programar».",
  },
};

/** Lo que se le pide al cliente. Sin elegir: pieza si ya hay archivo, idea si no. */
export function tipoAprobacion(post) {
  if (post?.aprobacion === "idea" || post?.aprobacion === "pieza") return post.aprobacion;
  return mediosDe(post).length ? "pieza" : "idea";
}

/** djb2: corto, estable y sin dependencias; basta para «¿cambió?». */
function hash(texto) {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * La huella del TEXTO que ve el cliente. Los archivos no entran: al
 * programar se convierten a JPEG y cambian de ruta sin que nadie los
 * haya tocado. Para ellos está `mediosCambiadosAt`, que sólo escribe el
 * editor de medios.
 */
export function huellaPieza(post) {
  const t = [
    post?.descripcion || post?.script || "",
    post?.hashtagsFinales || "",
    post?.primerComentario || "",
    post?.guion || "",
  ].map((s) => String(s).trim());
  return hash(JSON.stringify(t));
}

/**
 * La respuesta del cliente que cuenta todavía. Una publicación que se
 * reenvía (`pideAprobacionDesde`) invalida lo que el cliente dijera
 * antes: si no, al recargar volvería a salir aprobada.
 */
export function aprobacionVigente(post, review) {
  if (!review) return null;
  const desde = post?.pideAprobacionDesde;
  if (desde && String(review.timestamp ?? review.updated_at ?? "") < desde) return null;
  return review;
}

/**
 * Vuelca la respuesta del cliente en la publicación (sólo en el estado:
 * ver «Las aprobaciones que llegan del sondeo» en CLAUDE.md).
 */
export function conAprobacion(post, review) {
  const vigente = aprobacionVigente(post, review);
  if (!vigente || post?.status === "published") return post;
  // Lo que pidió el cliente viaja con la publicación (sólo en el estado): es la indicación de «Rehacer con lo que
  // dijo el cliente», y `cambiosAt` dice si lo que hizo la agencia después ya lo corrige.
  if (vigente.estado === "cambios") {
    return { ...post, status: "rejected", cambiosPedidos: String(vigente.comentario ?? "").trim(), cambiosAt: vigente.timestamp ?? vigente.updated_at ?? null };
  }
  if (vigente.estado !== "aprobado") return post;
  return {
    ...post,
    status: "approved",
    // Las aprobaciones de antes no traen tipo: valen por lo que se pide hoy.
    aprobadaComo: vigente.tipo || tipoAprobacion(post),
    huellaAprobada: vigente.huella || null,
    aprobadaAt: vigente.timestamp ?? vigente.updated_at ?? null,
  };
}

/** ¿Está aprobada como idea? Entonces falta producirla. */
export const porProducir = (post) => post?.status === "approved" && post.aprobadaComo === "idea";

/**
 * ¿Lista para programar? Aprobada como pieza (o sin tipo: lo subido con
 * «Subir», que no pasa por el cliente, y lo aprobado antes de esto).
 */
export const listaParaProgramar = (post) =>
  post?.status === "approved" && post.aprobadaComo !== "idea" && post.format !== "live" && !post.asistida;

/**
 * Lo que cambió DESPUÉS de que el cliente aprobara la pieza, en palabras.
 * Vacío si nada: el aviso sólo sale cuando hay algo que decir.
 */
export function cambiosTrasAprobar(post) {
  if (post?.status !== "approved" || post.aprobadaComo !== "pieza") return [];
  const salida = [];
  if (post.huellaAprobada && post.huellaAprobada !== huellaPieza(post)) salida.push("el texto");
  if (post.aprobadaAt && post.mediosCambiadosAt && post.mediosCambiadosAt > post.aprobadaAt) salida.push("los archivos");
  return salida;
}

/** «Cambiaste el texto y los archivos después de que el cliente lo aprobara.» */
export function avisoCambios(post) {
  const c = cambiosTrasAprobar(post);
  return c.length ? `Cambiaste ${c.join(" y ")} después de que el cliente la aprobara.` : "";
}

/**
 * Volver a pedir la aprobación: como pieza (la idea ya está producida, o
 * se retocó lo aprobado). Lo que el cliente respondió antes deja de contar.
 */
export function pedirAprobacion(post, ahoraISO, tipo = "pieza") {
  const { aprobadaComo: _a, huellaAprobada: _h, aprobadaAt: _t, cambiosPedidos: _c, cambiosAt: _ca, ...resto } = post;
  return { ...resto, aprobacion: tipo, status: "pending", pideAprobacionDesde: ahoraISO };
}

/** Cuántas ideas y piezas se mandan en un envío (para el diálogo de enviar). */
export function resumenEnvio(days = []) {
  const r = { idea: 0, pieza: 0 };
  for (const d of days) for (const p of d?.posts ?? []) {
    if (p?.status === "published" || p?.status === "approved") continue;
    r[tipoAprobacion(p)] += 1;
  }
  return r;
}

/** ¿Se cambió algo DESPUÉS de que el cliente pidiera cambios? Entonces su enlace la enseña «Actualizada · revísala». */
export const corregidaTrasCambios = (post) =>
  post?.status === "rejected" && Boolean(post.actualizadaAt) && post.actualizadaAt > String(post.cambiosAt ?? "");

/**
 * Cómo va el calendario para mandarlo al cliente COMPLETO (la agencia decidió no mandarle ideas sueltas): cuántas
 * llevan ya su pieza, cuántas no (el cliente las vería como idea), cuántas no tienen hora (aprobadas, no se podrían
 * programar), cuántas tienen cambios pedidos sin corregir y cuántas ya están corregidas (el mensaje lo dice). Un
 * directo no lleva pieza ni cuenta. Pura.
 */
export function estadoDelEnvio(days = []) {
  const r = { total: 0, conPieza: 0, sinPieza: 0, sinHora: 0, porCorregir: 0, corregidas: 0 };
  for (const d of days ?? []) for (const p of d?.posts ?? []) {
    if (!p || p.status === "published") continue;
    if (p.status === "rejected") {
      if (corregidaTrasCambios(p)) r.corregidas += 1;
      else r.porCorregir += 1;
    }
    if (p.status === "approved" || p.format === "live") continue;
    r.total += 1;
    if (mediosDe(p).length) r.conPieza += 1;
    else r.sinPieza += 1;
    if (!String(p.publishTime ?? "").trim()) r.sinHora += 1;
  }
  return r;
}

/**
 * El mensaje de WhatsApp para mandar el enlace. Con correcciones hechas desde su revisión, lo dice: el cliente
 * revisa sólo esas (en su enlace salen «Actualizada · revísala»). Pura.
 */
export function mensajeDeEnvio({ nombre = "", mes = "", url = "", corregidas = 0, revisado = false } = {}) {
  const hola = `Hola${nombre ? ` ${nombre}` : ""}`;
  if (revisado && corregidas > 0) {
    return `${hola}, ya hicimos los cambios que pediste en ${corregidas === 1 ? "1 publicación" : `${corregidas} publicaciones`} de ${mes}. Están marcadas «Actualizada» para que revises sólo esas:\n${url}`;
  }
  return `${hola}, aquí está el calendario de ${mes} para tu revisión:\n${url}\nPuedes aprobar o pedir cambios directamente desde tu celular.`;
}

/**
 * La indicación para EDITAR la imagen con lo que pidió el cliente (la misma imagen, sólo ese cambio). `extra`: lo que
 * añada la agencia. Vacío si no hay nada que pedir. Pura.
 */
export function instruccionDelCliente(comentario = "", extra = "") {
  const pide = String(comentario ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
  const mas = String(extra ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (!pide && !mas) return "";
  return [pide && `el cliente pidió este cambio: «${pide}»`, mas && `${pide ? "y además" : "haz este cambio:"} ${mas}`]
    .filter(Boolean).join(" ").concat(". Haz SÓLO ese cambio");
}

/**
 * Lo que espera a la agencia en TODO el espacio: lo aprobado como pieza
 * que aún no está en la cola («por programar», el paso final) y las ideas
 * aprobadas («por producir»). Se calcula con las filas de `approvals` y
 * no con el `status` guardado en `days`, que sólo se pone al día cuando
 * alguien abre ese calendario.
 *
 * @param calendarios  filas de calendars (days en JSON o ya leídos)
 * @param aprobaciones filas de approvals del espacio
 * @param filas        la cola (publicaciones_programadas)
 * @param clientes     id → nombre
 */
export function aprobadasDelEspacio({ calendarios = [], aprobaciones = [], filas = [], clientes = {} }, hoy = fechaEnZona(new Date(), "America/Panama")) {
  const enCola = new Set(filas.filter((f) => f.estado !== "cancelada" && f.estado !== "error").map((f) => `${f.calendar_id}:${f.post_id}`));
  const respuestas = new Map(aprobaciones.map((a) => [`${a.calendar_id}:${a.post_id}`, {
    estado: a.estado, tipo: a.tipo || null, huella: a.huella || null, timestamp: a.updated_at,
  }]));
  const aProgramar = [];
  const aProducir = [];
  for (const cal of calendarios) {
    let days = cal.days;
    if (typeof days === "string") { try { days = JSON.parse(days); } catch { days = []; } }
    for (const d of days ?? []) {
      if (!d?.date || d.date < hoy) continue;
      for (const original of d.posts ?? []) {
        if (!original?.id) continue;
        const clave = `${cal.id}:${original.id}`;
        if (enCola.has(clave)) continue;
        const post = conAprobacion(original, respuestas.get(clave));
        const item = {
          clientId: cal.client_id, cliente: clientes[cal.client_id] ?? "", calendarId: cal.id, calendario: cal.name ?? "",
          fecha: d.date, cuando: momentoPublicacion(d.date, post.publishTime),
          postId: post.id, titulo: post.title || post.idea || String(post.descripcion || "").slice(0, 60) || "Publicación",
          formato: post.format, redes: Array.isArray(post.redes) ? post.redes : [],
          tieneArchivo: mediosDe(post).length > 0, subidaRapida: Boolean(post.subidaRapida),
          miniatura: mediosDe(post).find((m) => m.tipo === "imagen")?.src ?? null,
          cambios: cambiosTrasAprobar(post),
        };
        if (porProducir(post)) aProducir.push(item);
        else if (listaParaProgramar(post)) aProgramar.push(item);
      }
    }
  }
  const orden = (a, b) => ((a.cuando ?? a.fecha) < (b.cuando ?? b.fecha) ? -1 : 1);
  return { porProgramar: aProgramar.sort(orden), porProducir: aProducir.sort(orden) };
}
