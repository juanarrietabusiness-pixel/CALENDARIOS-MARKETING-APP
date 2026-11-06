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
//   · sólo se aprueba un borrador sin errores, y la aprobación fija `aprobada_version` (la voz sólo sale de ésa). Si lo
//     que se DICE no cambió (sólo lo que se ve: capas, fondos, pausas), la locución que ya había sirve para la versión
//     nueva y no se paga otra (`vozQueSigueValiendo`);
//   · cada cambio del guion guarda el de ANTES en `videos_versiones` (el historial); volver a una versión crea otra
//     nueva con ese guion, nunca reescribe la historia;
//   · el SONIDO (efectos y música) va aparte del guion: cambiarlo no toca la versión ni la voz.
// ============================================================

import { uuid, ahora } from "./ids.js";
import { validarGuion, lineaDeTiempo, estadoTrasEditar, NOMBRE_ESTADO_VIDEO } from "../../src/lib/videoEscenas.js";
import { textoParaVoz } from "../../src/lib/voces.js";
import { limpiarSonido, SITIOS_EFECTO } from "../../src/lib/sonidoVideo.js";
import { sonidoParaVideo, musicaDeLaMarca } from "./estudio/sonidos.js";

export const ID_VIDEO = /^[\w-]{1,80}$/;
export const MAX_PROYECTOS = 200;
/** Las versiones de antes que se guardan por video (las más viejas se borran). */
export const MAX_VERSIONES = 30;
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
    locucion, render: leerJSON(f.render, {}), sonido: limpiarSonido(leerJSON(f.sonido, {})),
    aprobadoPor: f.aprobado_por ?? null, aprobadoAt: f.aprobado_at ?? null,
    // De dónde salió (el montaje de un reel: { tipo: "reel", encargoId }); {} si se escribió aquí. Con `estructuraId`,
    // la estructura de guion de la agencia que siguió su voz en off.
    origen: leerJSON(f.origen, {}),
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

/** Lo que se guarda en `origen`: el reel del que sale ({ tipo, encargoId }), la foto de una foto con música y la estructura de guion que siguió. */
function origenLimpio(origen, estructuraId) {
  const o = origen && typeof origen === "object" && !Array.isArray(origen) ? { tipo: String(origen.tipo ?? "").slice(0, 20), encargoId: String(origen.encargoId ?? "").slice(0, 80) } : {};
  // El de una foto con música (lib/conMusica.js) recuerda la foto con que se hizo: si la publicación ya no la lleva al
  // terminar el render, el video no la toca.
  if (o.tipo === "foto" && /^\/api\/media\/clientes\/[^\s]{1,300}$/.test(String(origen.foto ?? "")) && !String(origen.foto).includes("..")) o.foto = String(origen.foto);
  return /^[\w-]{1,80}$/.test(String(estructuraId ?? "")) ? { ...o, estructuraId: String(estructuraId) } : o;
}

/**
 * Crea un proyecto (borrador). `estructuraId`: la ESTRUCTURA de guion de la agencia que siguió (ya comprobada por quien
 * llama: `estructuraExistente`), que queda en `origen.estructuraId`. → { video, avisos }.
 */
export async function crearProyecto(acceso, cliente, { guion: entrada, titulo, calendarId = null, postId = null, usuario, origen = null, estructuraId = "" }) {
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
  const sonido = await sonidoInicial(acceso, cliente.id, guion);
  const fila = await acceso.insertar("videos_proyectos", {
    ...(sonido ? { sonido: JSON.stringify(sonido) } : {}),
    id: uuid(), client_id: cliente.id, calendar_id: cal?.id ?? null,
    post_id: cal && ID_VIDEO.test(String(postId ?? "")) ? String(postId) : null,
    titulo: limpiarTitulo(titulo ?? guion.titulo) || "Video sin título",
    // Los valores por defecto van escritos: `insertar` devuelve lo que se le dio, no la fila releída.
    estado: "borrador", version: 1, locucion: "{}", render: "{}", nota: "",
    // De dónde sale (el montaje de un reel) y con qué estructura de guion. Sólo lo pone el servidor: lo que llega de
    // fuera no se cree (la estructura, quien llama la comprobó en el espacio).
    origen: JSON.stringify(origenLimpio(origen, estructuraId)),
    guion: JSON.stringify(guion), creado_por: usuario?.id ?? null, created_at: momento, updated_at: momento,
  });
  return { video: deFila(fila), avisos };
}

/**
 * El sonido con que nace un video: la MÚSICA DE LA MARCA del cliente (su favorita de la biblioteca de sonido) si la
 * tiene, salvo que el guion ya traiga su música (por su clave) o el sonido de sus clips (un montaje que suena solo).
 * Sin favorita, nada (el de siempre: efectos encendidos y sin música). Nunca tumba la creación. → el sonido o null.
 */
async function sonidoInicial(acceso, clienteId, guion) {
  if (guion?.musica?.clave) return null;
  if ((guion?.escenas ?? []).some((e) => (e.capas ?? []).some((c) => c.tipo === "video" && c.sonido))) return null;
  const m = await musicaDeLaMarca(acceso, clienteId).catch(() => null);
  if (!m) return null;
  return limpiarSonido({ efectos: true, musica: { archivoId: m.id, clave: m.src.replace(/^\/api\/media\//, ""), nombre: m.nombre, volumen: 0 } });
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
export async function guardarProyecto(acceso, cliente, fila, { guion: entrada, titulo, version, por = null }) {
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
  // El guion de antes, al historial (sólo si cambió). Que falle no deshace el guardado: se pierde un paso del historial.
  if (cambios.guion) await guardarVersionAnterior(acceso, cliente.id, fila, por).catch(() => null);
  return { video: deFila({ ...fila, ...cambios }), avisos, cambio: true };
}

/** Guarda en el historial el guion de `fila` (la versión que se va a dejar atrás) y recorta a MAX_VERSIONES. */
async function guardarVersionAnterior(acceso, clienteId, fila, por) {
  await acceso.insertar("videos_versiones", {
    id: uuid(), client_id: clienteId, video_id: fila.id, version: fila.version, titulo: fila.titulo ?? "",
    guion: fila.guion || "{}", por: por ?? null, created_at: ahora(),
  });
  const todas = await acceso.leerColumnas("videos_versiones", ["id"], { client_id: clienteId, video_id: fila.id }, "version desc");
  const sobran = todas.slice(MAX_VERSIONES).map((v) => v.id);
  if (sobran.length) await acceso.borrarVarios("videos_versiones", sobran);
}

/** Las versiones de antes de un video, de la más nueva a la más vieja → [{ version, titulo, escenas, segundos, habla, por, fecha }]. */
export async function versionesDe(acceso, clienteId, fila) {
  const filas = await acceso.leerColumnas("videos_versiones", ["version", "titulo", "guion", "por", "created_at"], { client_id: clienteId, video_id: fila.id }, "version desc", MAX_VERSIONES);
  return filas.map((v) => {
    const g = leerJSON(v.guion, {});
    const escenas = Array.isArray(g.escenas) ? g.escenas : [];
    const ok = validarGuion(g);
    return {
      version: v.version, titulo: v.titulo, escenas: escenas.length, por: v.por ?? null, fecha: v.created_at,
      segundos: ok.guion?.escenas?.length ? lineaDeTiempo(ok.guion).total : 0,
      habla: escenas.map((e) => String(e?.habla ?? "")).join(" ").replace(/\s+/g, " ").trim().slice(0, 160),
    };
  });
}

/**
 * Vuelve a la versión `aVersion` (una del historial): su guion pasa a ser una versión NUEVA (la de ahora se guarda en el
 * historial como cualquier cambio) y el video queda en borrador. Si lo que se dice es lo mismo que la locución que hay,
 * al aprobarla la voz sigue valiendo. → { video, avisos, cambio }.
 */
export async function volverAVersion(acceso, cliente, fila, { version, aVersion, por = null }) {
  comprobarVersion(fila, version);
  if (!Number.isInteger(aVersion)) throw new ErrorVideo("Falta a qué versión volver.", 400);
  if (aVersion === fila.version) throw new ErrorVideo("Ya es la versión de ahora.", 400);
  const vieja = await acceso.leerUno("videos_versiones", { client_id: cliente.id, video_id: fila.id, version: aVersion });
  if (!vieja) throw new ErrorVideo(`No guardé la versión ${aVersion} de este video.`, 404);
  const r = await guardarProyecto(acceso, cliente, fila, { guion: leerJSON(vieja.guion, {}), version, por });
  if (!r.cambio) throw new ErrorVideo(`El guion de la versión ${aVersion} es igual al de ahora.`, 400);
  return r;
}

/**
 * ¿La locución que tiene el video sigue valiendo para el guion de ahora? Sí si está lista y lo que se DICE es
 * exactamente lo mismo que se le mandó a la voz (el texto del trabajo de la locución): los tiempos de cada palabra
 * siguen cuadrando. Así, cambiar sólo lo que se ve (capas, fondos, pausas) no obliga a pagar otra voz. → bool.
 */
export async function vozQueSigueValiendo(acceso, clienteId, fila, guion) {
  const l = leerJSON(fila.locucion, {});
  if (l.estado !== "lista" || !l.clave || !l.trabajoId) return false;
  const trabajo = await acceso.leerUno("estudio_trabajos", { id: String(l.trabajoId), client_id: clienteId }).catch(() => null);
  if (!trabajo?.prompt) return false;
  return textoParaVoz(guion, l.modelo) === trabajo.prompt;
}

/** Cambia el sonido del video (efectos y música; ver src/lib/sonidoVideo.js). No toca la versión ni la voz. → { video }. */
export async function guardarSonido(acceso, cliente, fila, sonido) {
  if (fila.estado === "renderizando") throw new ErrorVideo("Se está renderizando: espera a que termine para cambiar el sonido.", 409);
  const limpio = limpiarSonido(sonido);
  // La música y los efectos, de la biblioteca del cliente o de la de la AGENCIA: la clave la pone el servidor.
  if (limpio.musica) {
    const a = await sonidoParaVideo(acceso, cliente.id, limpio.musica.archivoId, "musica");
    if (!a) throw new ErrorVideo("Esa música no está en la biblioteca de este cliente ni en la de la agencia.", 404);
    const m = limpio.musica;
    limpio.musica = { archivoId: a.archivoId, clave: a.clave, nombre: m.nombre || a.nombre, volumen: m.volumen, ...(a.de ? { de: a.de } : {}) };
  }
  for (const sitio of SITIOS_EFECTO) {
    const e = limpio.efectosPropios?.[sitio];
    if (!e) continue;
    const a = await sonidoParaVideo(acceso, cliente.id, e.archivoId, "efecto");
    if (!a) throw new ErrorVideo("Ese efecto no está en la biblioteca de este cliente ni en la de la agencia.", 404);
    limpio.efectosPropios[sitio] = { archivoId: a.archivoId, clave: a.clave, nombre: a.nombre, ...(a.de ? { de: a.de } : {}) };
  }
  const momento = ahora();
  const n = await acceso.actualizar("videos_proyectos", { id: fila.id, client_id: cliente.id, estado: fila.estado }, { sonido: JSON.stringify(limpio), updated_at: momento });
  if (!n) throw new ErrorVideo("Otra persona cambió este video mientras lo guardabas. Vuelve a abrirlo.", 409);
  return { video: deFila({ ...fila, sonido: JSON.stringify(limpio), updated_at: momento }) };
}

/** Lo más que cambia una sola llamada (cada cambio es una escena). */
export const MAX_CAMBIOS = 20;
/** Lo que se puede cambiar de una escena sin mandarla entera (`cambiar`). */
const CAMPOS_ESCENA = Object.freeze(["tipo", "habla", "pantalla", "pausa", "fondo", "transicion", "capas"]);

/**
 * Aplica UN cambio a la lista de escenas (la cambia) y devuelve la frase de lo hecho. Formas:
 *   { quitar: id }                         la borra
 *   { escena: {…con id}, posicion? }       la reemplaza (y la mueve) o, con un id nuevo, la añade
 *   { id, cambiar: { habla, pantalla… } }  cambia SÓLO esos campos de una que existe (sin mandarla entera)
 *   { id, posicion }                       sólo la mueve
 * Lanza ErrorVideo con el número del cambio si no se puede. Pura salvo por cambiar `escenas`.
 */
function aplicarCambio(escenas, op, n = null) {
  const de = n === null ? "" : `Cambio ${n}: `;
  const falla = (m, e = 400) => { throw new ErrorVideo(`${de}${m}`, e); };
  const lista = () => escenas.map((e) => e?.id).join(", ") || "ninguna";
  const buscar = (id) => {
    const i = escenas.findIndex((e) => e?.id === id);
    if (i < 0) falla(`No hay ninguna escena «${id}». Las que hay: ${lista()}.`, 404);
    return i;
  };
  const sitio = (posicion, def) => (Number.isInteger(posicion) ? Math.min(Math.max(posicion, 1), escenas.length + 1) - 1 : def);
  if (!op || typeof op !== "object" || Array.isArray(op)) falla("Cada cambio es un objeto (escena, quitar o id con cambiar).");
  if (op.quitar !== undefined && op.quitar !== null && op.quitar !== "") {
    const i = buscar(op.quitar);
    if (escenas.length === 1) falla("Es la única escena: un video necesita al menos una.");
    escenas.splice(i, 1);
    return `Quitada la escena «${op.quitar}».`;
  }
  if (op.escena !== undefined) {
    const nueva = typeof op.escena === "string" ? leerJSON(op.escena, null) : op.escena;
    if (!nueva || typeof nueva !== "object" || Array.isArray(nueva)) falla("La escena es un objeto con su id.");
    const i = nueva.id ? escenas.findIndex((e) => e?.id === nueva.id) : -1;
    if (i >= 0) escenas.splice(i, 1);
    const k = sitio(op.posicion, i >= 0 ? i : escenas.length);
    escenas.splice(k, 0, nueva);
    return i >= 0 ? `Cambiada la escena «${nueva.id}»${k !== i ? ` (ahora es la ${k + 1})` : ""}.` : `Añadida una escena en la posición ${k + 1}.`;
  }
  if (op.id) {
    const i = buscar(op.id);
    const actual = escenas[i];
    let frase = "";
    if (op.cambiar !== undefined) {
      const c = op.cambiar;
      if (!c || typeof c !== "object" || Array.isArray(c)) falla("«cambiar» es un objeto con los campos de la escena.");
      const fuera = Object.keys(c).filter((k) => !CAMPOS_ESCENA.includes(k));
      if (fuera.length) falla(`«${fuera.join("», «")}» no se cambia así (se puede: ${CAMPOS_ESCENA.join(", ")}). Para cambiar el id, quítala y añádela.`);
      escenas[i] = { ...actual, ...c };
      frase = `Cambiada la escena «${op.id}» (${Object.keys(c).join(", ")})`;
    }
    if (Number.isInteger(op.posicion)) {
      const [e] = escenas.splice(i, 1);
      const k = sitio(op.posicion, i);
      escenas.splice(k, 0, e);
      frase = frase ? `${frase}, ahora es la ${k + 1}` : `Movida la escena «${op.id}» a la posición ${k + 1}`;
    }
    if (!frase) falla(`Para la escena «${op.id}» falta qué cambiar («cambiar» o «posicion»).`);
    return `${frase}.`;
  }
  return falla("Falta la escena (un objeto con su id), el id de la que se quita o el id con lo que se cambia.");
}

/**
 * Cambia escenas del guion guardado sin reescribir el resto. Uno: `escena` (con un id que existe la reemplaza y, con
 * `posicion`, la mueve; con uno nuevo la añade), `quitar` (un id) o `id` + `cambiar`. VARIOS a la vez: `cambios`, una
 * lista de esos mismos cambios (hasta MAX_CAMBIOS), que se aplican EN ORDEN y TODOS O NINGUNO: el guion resultante se
 * valida entero y se guarda como UNA versión (`guardarProyecto`). → { video, avisos, cambio, que }.
 */
export async function editarEscena(acceso, cliente, fila, { version, escena, posicion, quitar, id, cambiar, cambios, por = null }) {
  comprobarVersion(fila, version);
  const guion = leerJSON(fila.guion, {});
  const escenas = Array.isArray(guion.escenas) ? [...guion.escenas] : [];
  let que;
  if (cambios !== undefined && cambios !== null) {
    const lista = typeof cambios === "string" ? leerJSON(cambios, null) : cambios;
    if (!Array.isArray(lista) || !lista.length) throw new ErrorVideo("«cambios» es una lista con al menos un cambio.", 400);
    if (lista.length > MAX_CAMBIOS) throw new ErrorVideo(`Como mucho ${MAX_CAMBIOS} cambios a la vez.`, 400);
    que = lista.map((op, k) => aplicarCambio(escenas, op, k + 1)).join(" ");
  } else {
    que = aplicarCambio(escenas, { escena, posicion, quitar, id, cambiar });
  }
  const r = await guardarProyecto(acceso, cliente, fila, { guion: { ...guion, escenas }, version, por });
  return { ...r, que };
}

/** Aprueba el guion de ESA versión: fija `aprobada_version`, la única de la que saldrá la voz. → { video }. */
export async function aprobarProyecto(acceso, cliente, fila, { version, usuario }) {
  comprobarVersion(fila, version);
  // Sólo un borrador: «aprobar» otra vez un video con locución lo devolvía a «Guion aprobado» y parecía sin voz.
  if (fila.estado !== "borrador") throw new ErrorVideo(`Está en «${NOMBRE_ESTADO_VIDEO[fila.estado] ?? fila.estado}»: sólo se aprueba un borrador.`, 409);
  const v = validarGuion(leerJSON(fila.guion, null));
  if (!v.ok) throw new ErrorVideo("El guion tiene errores: corrígelos antes de aprobarlo.", 400, { errores: v.errores });
  const momento = ahora();
  const cambios = { estado: "aprobado", aprobada_version: fila.version, aprobado_por: usuario?.id ?? null, aprobado_at: momento, updated_at: momento };
  // Lo que se dice no cambió: la locución de antes sirve para esta versión (no se paga otra).
  const sigue = await vozQueSigueValiendo(acceso, cliente.id, fila, v.guion).catch(() => false);
  if (sigue) {
    const l = leerJSON(fila.locucion, {});
    Object.assign(cambios, { estado: "con_voz", locucion: JSON.stringify({ ...l, version: fila.version, desfasada: false, deVersion: l.deVersion ?? l.version }) });
  }
  const n = await acceso.actualizar("videos_proyectos", { id: fila.id, client_id: cliente.id, version: fila.version }, cambios);
  if (!n) throw new ErrorVideo("Otra persona cambió este video mientras lo aprobabas. Vuelve a abrirlo.", 409);
  return { video: deFila({ ...fila, ...cambios }), vozReutilizada: sigue };
}
