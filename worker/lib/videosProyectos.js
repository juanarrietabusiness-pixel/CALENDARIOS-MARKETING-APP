// ============================================================
// Los PROYECTOS de video animado: crear, guardar, editar una escena y aprobar
//
// Una sola implementación para las dos puertas: la pantalla (worker/rutas/videos.js) y las herramientas del
// asistente y de Claude por MCP (worker/lib/estudio/herramientasVideo.js). Dos copias de «qué pasa al guardar»
// acabarían discrepando: una devolvería el video a borrador al editar y la otra no.
//
// Las reglas que viven aquí:
//   · el guion se VALIDA en el servidor (`validarGuion`): lo que llega no se cree, y con errores no se guarda;
//   · guardar y aprobar llevan la `version` que se leyó: si otra persona guardó entremedias, 409 en vez de pisarla;
//   · editar un guion lo devuelve a borrador (la aprobación era de otro texto) y sube la versión; mientras se
//     renderiza no se deja editar;
//   · sólo se aprueba un borrador sin errores, y la aprobación fija `aprobada_version` (la voz sólo sale de ésa).
// ============================================================

import { uuid, ahora } from "./ids.js";
import { validarGuion, lineaDeTiempo, estadoTrasEditar, puedePasar, NOMBRE_ESTADO_VIDEO } from "../../src/lib/videoEscenas.js";

export const ID_VIDEO = /^[\w-]{1,80}$/;
export const MAX_PROYECTOS = 200;
export const COLUMNAS_LISTA = ["id", "titulo", "estado", "version", "aprobada_version", "calendar_id", "post_id", "nota", "created_at", "updated_at"];

/** Un fallo de lo pedido, con su estado HTTP y lo que la pantalla necesita (`errores`, `avisos`, `video`). */
export class ErrorVideo extends Error {
  constructor(mensaje, estado = 400, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.extra = extra;
  }
}

const leerJSON = (t, def) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? def); } catch { return def; } };
const limpiarTitulo = (t) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

/** La fila como la ven la pantalla y las herramientas: el guion y la locución como objetos, y la duración estimada. */
export function deFila(f) {
  const guion = leerJSON(f.guion, {});
  const locucion = leerJSON(f.locucion, {});
  const v = validarGuion(guion);
  return {
    id: f.id, titulo: f.titulo, estado: f.estado, version: f.version, aprobadaVersion: f.aprobada_version ?? null,
    calendarId: f.calendar_id ?? null, postId: f.post_id ?? null, nota: f.nota ?? "",
    guion: v.guion ?? guion, valido: v.ok, errores: v.errores,
    segundos: v.guion?.escenas?.length ? lineaDeTiempo(v.guion, locucion.palabras ?? null).total : 0,
    locucion, render: leerJSON(f.render, {}),
    aprobadoPor: f.aprobado_por ?? null, aprobadoAt: f.aprobado_at ?? null,
    creado: f.created_at, actualizado: f.updated_at,
  };
}

/** Un guion que llega (objeto o texto JSON): validado, o el 400 con sus errores. */
export function guionValido(entrada) {
  const crudo = typeof entrada === "string" ? leerJSON(entrada, null) : entrada;
  if (typeof entrada === "string" && crudo === null) throw new ErrorVideo("El guion no es un JSON válido.", 400);
  const v = validarGuion(crudo);
  if (!v.ok) throw new ErrorVideo("El guion tiene errores: corrígelos y vuelve a guardarlo.", 400, { errores: v.errores, avisos: v.avisos });
  return { guion: v.guion, avisos: v.avisos };
}

/** Los proyectos de un cliente, del más reciente al más viejo (sin el guion: puede pesar). */
export async function listarProyectos(acceso, clienteId) {
  const filas = await acceso.leerColumnas("videos_proyectos", COLUMNAS_LISTA, { client_id: clienteId }, "updated_at desc", MAX_PROYECTOS);
  return filas.map((f) => ({ ...f, nombreEstado: NOMBRE_ESTADO_VIDEO[f.estado] ?? f.estado }));
}

/** Un proyecto de ese cliente (la fila), o el 404. */
export async function proyectoDe(acceso, clienteId, id) {
  const fila = ID_VIDEO.test(String(id ?? "")) ? await acceso.leerUno("videos_proyectos", { id: String(id), client_id: clienteId }) : null;
  if (!fila) throw new ErrorVideo("No encontré ese video de este cliente.", 404);
  return fila;
}

/**
 * La publicación de un cliente por su id, en cualquiera de sus meses → { calendarId, postId } o null. Para ligar el
 * video a su post cuando quien pide (Claude) sólo sabe el id de la publicación.
 */
export async function publicacionDelCliente(acceso, clienteId, postId) {
  if (!ID_VIDEO.test(String(postId ?? ""))) return null;
  const cals = await acceso.leerColumnas("calendars", ["id", "days"], { client_id: clienteId });
  for (const cal of cals) {
    const dias = leerJSON(cal.days, []);
    if ((Array.isArray(dias) ? dias : []).some((d) => (d?.posts ?? []).some((p) => p?.id === postId))) return { calendarId: cal.id, postId: String(postId) };
  }
  return null;
}

/** Crea un proyecto (borrador). → { video, avisos }. */
export async function crearProyecto(acceso, cliente, { guion: entrada, titulo, calendarId = null, postId = null, usuario }) {
  const { guion, avisos } = guionValido(entrada);
  let cal = null;
  if (calendarId) {
    cal = await acceso.leerUno("calendars", { id: String(calendarId), client_id: cliente.id });
    if (!cal) throw new ErrorVideo("Ese calendario no es de este cliente.", 400);
  }
  if ((await acceso.leerColumnas("videos_proyectos", ["id"], { client_id: cliente.id })).length >= MAX_PROYECTOS) {
    throw new ErrorVideo(`Como mucho ${MAX_PROYECTOS} videos por cliente: borra los que ya no sirvan.`, 409);
  }
  const momento = ahora();
  const fila = await acceso.insertar("videos_proyectos", {
    id: uuid(), client_id: cliente.id, calendar_id: cal?.id ?? null,
    post_id: cal && ID_VIDEO.test(String(postId ?? "")) ? String(postId) : null,
    titulo: limpiarTitulo(titulo ?? guion.titulo) || "Video sin título",
    // Los valores por defecto van escritos: `insertar` devuelve lo que se le dio, no la fila releída.
    estado: "borrador", version: 1, locucion: "{}", render: "{}", nota: "",
    guion: JSON.stringify(guion), creado_por: usuario?.id ?? null, created_at: momento, updated_at: momento,
  });
  return { video: deFila(fila), avisos };
}

/** La versión que se leyó tiene que ser la de ahora: si no, otra persona lo cambió y no se pisa. */
function comprobarVersion(fila, version) {
  if (!Number.isInteger(version)) throw new ErrorVideo("Falta la versión que tenías abierta.", 400);
  if (version !== fila.version) {
    throw new ErrorVideo("Otra persona cambió este video mientras lo tenías abierto. Vuelve a abrirlo.", 409, { video: deFila(fila) });
  }
}

/**
 * Guarda el guion y/o el título de la versión que se tenía abierta. Un guion distinto sube la versión y devuelve el
 * proyecto a borrador. → { video, avisos, cambio } (`cambio`: si se escribió algo).
 */
export async function guardarProyecto(acceso, cliente, fila, { guion: entrada, titulo, version }) {
  comprobarVersion(fila, version);
  const cambios = {};
  let avisos = [];
  if (entrada !== undefined) {
    const r = guionValido(entrada);
    avisos = r.avisos;
    if (JSON.stringify(r.guion) !== fila.guion) {
      const estado = estadoTrasEditar(fila.estado);
      if (!estado) throw new ErrorVideo("Se está renderizando: no se puede cambiar el guion hasta que termine.", 409);
      Object.assign(cambios, { guion: JSON.stringify(r.guion), version: fila.version + 1, estado });
    }
  }
  if (titulo !== undefined) {
    const t = limpiarTitulo(titulo);
    if (!t) throw new ErrorVideo("El título no puede quedar vacío.", 400);
    if (t !== fila.titulo) cambios.titulo = t;
  }
  if (!Object.keys(cambios).length) return { video: deFila(fila), avisos, cambio: false };
  cambios.updated_at = ahora();
  const n = await acceso.actualizar("videos_proyectos", { id: fila.id, client_id: cliente.id, version: fila.version }, cambios);
  if (!n) throw new ErrorVideo("Otra persona cambió este video mientras lo guardabas. Vuelve a abrirlo.", 409);
  return { video: deFila({ ...fila, ...cambios }), avisos, cambio: true };
}

/**
 * Cambia UNA escena del guion guardado sin reescribir el resto: `escena` con un `id` que ya existe la reemplaza (y,
 * con `posicion`, la mueve); con uno nuevo la añade en `posicion` (1 = la primera) o al final; `quitar` (un id) la
 * borra. El guion resultante se valida entero y se guarda como `guardarProyecto`. → { video, avisos, cambio, que }.
 */
export async function editarEscena(acceso, cliente, fila, { version, escena, posicion, quitar }) {
  comprobarVersion(fila, version);
  const guion = leerJSON(fila.guion, {});
  const escenas = Array.isArray(guion.escenas) ? [...guion.escenas] : [];
  let que;
  if (quitar !== undefined && quitar !== null && quitar !== "") {
    const i = escenas.findIndex((e) => e?.id === quitar);
    if (i < 0) throw new ErrorVideo(`No hay ninguna escena «${quitar}». Las que hay: ${escenas.map((e) => e?.id).join(", ") || "ninguna"}.`, 404);
    if (escenas.length === 1) throw new ErrorVideo("Es la única escena: un video necesita al menos una.", 400);
    escenas.splice(i, 1);
    que = `Quitada la escena «${quitar}».`;
  } else {
    const nueva = typeof escena === "string" ? leerJSON(escena, null) : escena;
    if (!nueva || typeof nueva !== "object" || Array.isArray(nueva)) throw new ErrorVideo("Falta la escena (un objeto con su id) o el id de la que se quita.", 400);
    const i = nueva.id ? escenas.findIndex((e) => e?.id === nueva.id) : -1;
    if (i >= 0) escenas.splice(i, 1);
    const n = Number.isInteger(posicion) ? Math.min(Math.max(posicion, 1), escenas.length + 1) - 1 : i >= 0 ? i : escenas.length;
    escenas.splice(n, 0, nueva);
    que = i >= 0 ? `Cambiada la escena «${nueva.id}»${n !== i ? ` (ahora es la ${n + 1})` : ""}.` : `Añadida una escena en la posición ${n + 1}.`;
  }
  const r = await guardarProyecto(acceso, cliente, fila, { guion: { ...guion, escenas }, version });
  return { ...r, que };
}

/** Aprueba el guion de ESA versión: fija `aprobada_version`, la única de la que saldrá la voz. → { video }. */
export async function aprobarProyecto(acceso, cliente, fila, { version, usuario }) {
  comprobarVersion(fila, version);
  if (!puedePasar(fila.estado, "aprobado")) throw new ErrorVideo(`Está en «${NOMBRE_ESTADO_VIDEO[fila.estado] ?? fila.estado}»: sólo se aprueba un borrador.`, 409);
  const v = validarGuion(leerJSON(fila.guion, null));
  if (!v.ok) throw new ErrorVideo("El guion tiene errores: corrígelos antes de aprobarlo.", 400, { errores: v.errores });
  const momento = ahora();
  const cambios = { estado: "aprobado", aprobada_version: fila.version, aprobado_por: usuario?.id ?? null, aprobado_at: momento, updated_at: momento };
  const n = await acceso.actualizar("videos_proyectos", { id: fila.id, client_id: cliente.id, version: fila.version }, cambios);
  if (!n) throw new ErrorVideo("Otra persona cambió este video mientras lo aprobabas. Vuelve a abrirlo.", 409);
  return { video: deFila({ ...fila, ...cambios }) };
}
