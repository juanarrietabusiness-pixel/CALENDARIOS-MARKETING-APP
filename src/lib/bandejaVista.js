// ============================================================
// La bandeja: lo puro
//
// La ventana de 24 horas de los mensajes, los filtros de la lista y las
// frases de la pantalla. También lo importa el Worker: la ventana la
// comprueba el SERVIDOR antes de mandar nada a Meta, no sólo la pantalla
// (un asistente o una pestaña vieja no se la saltan).
// ============================================================

/** Meta sólo deja responder por API dentro de las 24 h siguientes al último mensaje DE LA PERSONA. */
export const VENTANA_MS = 24 * 3600 * 1000;

/** Cuándo avisar de que la ventana se cierra pronto. */
export const AVISO_CIERRE_MS = 2 * 3600 * 1000;

const NOMBRE_RED = { instagram: "Instagram", facebook: "Messenger" };

function duracion(ms) {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/**
 * ¿Se puede responder a este hilo ahora?
 *
 * `ultimoDelUsuario` es la fecha (ISO) del último mensaje que escribió la
 * persona, no el último del hilo: una respuesta de la agencia no reabre la
 * ventana. Devuelve siempre la misma forma:
 *   { abierta, cierraAt, restanteMs, motivo, aviso }
 * `motivo` dice por qué está cerrada (para el campo desactivado) y
 * `aviso`, si está abierta pero se cierra pronto.
 */
export function ventanaMensajes(ultimoDelUsuario, ahora = Date.now(), red = "facebook") {
  const t = Date.parse(ultimoDelUsuario ?? "");
  const donde = NOMBRE_RED[red] ?? "Meta";
  if (!Number.isFinite(t)) {
    return {
      abierta: false, cierraAt: null, restanteMs: 0, aviso: "",
      motivo: `Esta persona todavía no ha escrito. ${donde} sólo deja responder a quien escribió primero.`,
    };
  }
  const cierra = t + VENTANA_MS;
  const restante = cierra - Number(ahora);
  if (restante <= 0) {
    return {
      abierta: false, cierraAt: new Date(cierra).toJSON(), restanteMs: 0, aviso: "",
      motivo: `Pasaron más de 24 horas desde su último mensaje. Meta sólo deja responder desde aquí dentro de ese plazo: espera a que vuelva a escribir, o contéstale desde Meta Business Suite.`,
    };
  }
  return {
    abierta: true, cierraAt: new Date(cierra).toJSON(), restanteMs: restante, motivo: "",
    aviso: restante <= AVISO_CIERRE_MS ? `Quedan ${duracion(restante)} para poder responder.` : "",
  };
}

/** «hace 5 min», «hace 3 h», «ayer», «12 sep». Para la lista; la fecha exacta va en el `title`. */
export function haceCuanto(iso, ahora = Date.now()) {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (Number(ahora) - t) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 2 * 86_400) return "ayer";
  return new Date(t).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" });
}

/**
 * Los comentarios de la lista, con los filtros de la pantalla. `estado`:
 * «pendientes» (de otros, sin atender), «todos» u «ocultos». Las respuestas
 * propias no son pendientes de nadie: salen colgadas de su comentario.
 */
export function filtrarComentarios(lista = [], { cliente = "", red = "", estado = "pendientes" } = {}) {
  return lista.filter((c) => {
    if (cliente && c.clientId !== cliente) return false;
    if (red && c.red !== red) return false;
    if (estado === "pendientes") return !c.propio && !c.atendido;
    if (estado === "ocultos") return Boolean(c.oculto);
    return true;
  });
}

/** Los hilos con los filtros de la pantalla. «pendientes» = sin atender. */
export function filtrarHilos(lista = [], { cliente = "", red = "", estado = "pendientes" } = {}) {
  return lista.filter((h) => {
    if (cliente && h.clientId !== cliente) return false;
    if (red && h.red !== red) return false;
    if (estado === "pendientes") return !h.atendido;
    return true;
  });
}

/**
 * Los comentarios agrupados en conversaciones: cada comentario de otra
 * persona con sus respuestas debajo (las propias y las ajenas), en orden.
 * Una respuesta cuyo padre no está en la lista sale suelta.
 */
export function enHilos(lista = []) {
  const porExterno = new Map(lista.map((c) => [c.externoId, c]));
  const hijos = new Map();
  const raices = [];
  for (const c of lista) {
    if (c.padreId && porExterno.has(c.padreId)) {
      if (!hijos.has(c.padreId)) hijos.set(c.padreId, []);
      hijos.get(c.padreId).push(c);
    } else raices.push(c);
  }
  const porFecha = (a, b) => String(a.creadoAt).localeCompare(String(b.creadoAt));
  return raices.map((c) => ({ ...c, respuestas: (hijos.get(c.externoId) ?? []).sort(porFecha) }));
}

/**
 * Las conversaciones de comentarios que se ven con estos filtros: se
 * agrupan primero (cada comentario con sus respuestas) y se filtra la
 * conversación entera. Así una respuesta nueva a un comentario ya atendido
 * sale con su contexto, y no suelta.
 */
export function conversaciones(lista = [], { cliente = "", red = "", estado = "pendientes" } = {}) {
  const base = lista.filter((c) => (!cliente || c.clientId === cliente) && (!red || c.red === red));
  return enHilos(base).filter((h) => {
    const todas = [h, ...h.respuestas];
    if (estado === "pendientes") return todas.some((c) => !c.propio && !c.atendido);
    if (estado === "ocultos") return todas.some((c) => c.oculto);
    return true;
  });
}

/** Cuántos pendientes: lo del número de la navegación. */
export const totalPendientes = (p) => Number(p?.comentarios ?? 0) + Number(p?.mensajes ?? 0);

/** Los permisos con revisión de Meta que usa la bandeja (se piden aparte, ver worker/lib/meta.js). */
export const PERMISOS_BANDEJA = Object.freeze([
  "pages_manage_metadata",
  "pages_manage_engagement",
  "pages_messaging",
  "instagram_manage_messages",
]);

/** Qué deja hacer cada permiso, para decir qué falta en palabras. */
export const PARA_QUE_PERMISO = Object.freeze({
  pages_manage_metadata: "recibir los avisos de la página al momento",
  pages_manage_engagement: "responder, ocultar y borrar comentarios de Facebook",
  pages_messaging: "leer y responder los mensajes de Messenger",
  instagram_manage_messages: "leer y responder los mensajes directos de Instagram",
  instagram_manage_comments: "responder, ocultar y borrar comentarios de Instagram",
});

/** Los de la bandeja que no están en lo concedido. null si no se sabe. */
export function permisosQueFaltanBandeja(concedidos) {
  if (!Array.isArray(concedidos)) return null;
  return [...PERMISOS_BANDEJA, "instagram_manage_comments"].filter((p) => !concedidos.includes(p));
}

/** Un texto de respuesta válido: sin vacío, sin pasar del tope de Meta. */
export const TOPE_RESPUESTA = 2000;
export function validarRespuesta(texto) {
  const t = String(texto ?? "").trim();
  if (!t) return { ok: false, motivo: "Escribe la respuesta." };
  if (t.length > TOPE_RESPUESTA) return { ok: false, motivo: `La respuesta pasa de ${TOPE_RESPUESTA} caracteres.` };
  return { ok: true, texto: t };
}
