// ============================================================
// La galería del Estudio: archivos, carpetas y papelera
//
// PAPELERA. Quitar un archivo lo manda a la papelera (`borrado_at`); pasados
// 30 días se borra de verdad, AL LEER la galería, sin cron —igual que
// `purgarTareas()`—. Lo que una publicación usa (`usado_en`) no se purga:
// una imagen aprobada no puede desaparecer del calendario porque alguien
// vació la papelera.
//
// LO QUE EL ESTUDIO NO ES DUEÑO DE BORRAR. Un archivo que entró por
// `/api/generar-imagen` (historias, ampliar, portadas, el chat) vive en
// `generadas/` y lo puede estar usando una publicación sin que el Estudio lo
// sepa: de esos, purgar quita la FILA de la galería y nunca el objeto de R2.
// Sólo se borra de R2 lo que el Estudio creó o lo que se subió a mano.
//
// CARPETAS. Etiquetas, no directorios: el archivo nunca se mueve en R2, así
// que las direcciones que una publicación ya tiene siguen valiendo.
// ============================================================

import { uuid } from "../ids.js";
import { NULO, NO_NULO } from "../acceso.js";
import { claveDeArchivo, medidasDe, tipoPorBytes } from "./archivos.js";
import { DIAS_PAPELERA } from "../../../src/lib/estudioCatalogo.js";
import { ErrorEstudio, trabajoPublico } from "./trabajos.js";

export const MAX_LISTADOS = 300;
export const MAX_SUBIDA = 15 * 1024 * 1024;
/** Un video subido a mano (el de la competencia, para copiar su estructura o su movimiento). */
export const MAX_SUBIDA_VIDEO = 50 * 1024 * 1024;
export const MAX_CARPETAS = 30;
/** Objetos de R2 que una lectura borra como mucho: cada uno cuenta como petición. */
const MAX_PURGA_POR_LECTURA = 20;

const leerJSON = (texto, defecto) => {
  try { const v = JSON.parse(texto); return v ?? defecto; } catch { return defecto; }
};

/** Un archivo como lo ve el navegador. */
export function archivoPublico(f) {
  if (!f) return null;
  return {
    id: f.id, clave: f.clave, src: `/api/media/${f.clave}`, tipo: f.tipo, mime: f.mime, ancho: f.ancho, alto: f.alto, bytes: f.bytes,
    prompt: f.prompt, modelo: f.modelo, ajustes: leerJSON(f.ajustes, {}), trabajoId: f.trabajo_id, carpetaId: f.carpeta_id,
    origen: f.origen, costo: f.costo, favorito: Boolean(f.favorito), subido: Boolean(f.subido),
    usadoEn: leerJSON(f.usado_en, []), borradoAt: f.borrado_at, creado: f.created_at,
  };
}

/** Una carpeta como la ve el navegador. `tipo` «carrusel» | «reel» la agrupa en UNA tarjeta; `orden`, sus piezas. */
const carpetaPublica = (c) => ({ id: c.id, nombre: c.nombre, creada: c.created_at, tipo: c.tipo ?? "", orden: leerJSON(c.orden ?? "[]", []) });

/** Los tipos de carpeta que la galería agrupa (los crea el flujo del carrusel o del reel IA). */
export const TIPOS_CARPETA = ["carrusel", "reel"];
/** Las agrupadas no cuentan en las 30 de la persona (sale una por carrusel), pero tienen su propio tope. */
export const MAX_GRUPOS = 300;
const MAX_ORDEN = 40;

/** ¿El Estudio es dueño del objeto de R2 de este archivo? */
const esDelEstudio = (f) => f.origen === "estudio" || Boolean(f.subido);

/** Lo que se lee de la papelera de una vez (y lo que «Vaciar» borra por llamada: si quedan más, la pantalla repite). */
export const MAX_PAPELERA = 500;

/**
 * Lo que de verdad usa cada archivo: `usado_en` se apunta al ponerlo en una publicación y NUNCA se quitaba, así que una
 * imagen que se cambió por otra, o de una publicación que se borró, quedaba «en uso» para siempre y «Vaciar la papelera»
 * no la borraba nunca. Aquí se mira en los calendarios del cliente (una lectura, sólo si alguna fila tiene usos) si la
 * publicación sigue existiendo y sigue llevando ESE archivo (por su clave, en cualquier sitio de la publicación: medios,
 * historias, copias adaptadas, portada, referencias). → Map(id del archivo → [usos vivos, con la fecha del día]).
 */
export async function usosVivos(acceso, clientId, filas) {
  const conUsos = filas.filter((f) => leerJSON(f.usado_en, []).length);
  if (!conUsos.length) return new Map();
  const calendarios = await acceso.leerColumnas("calendars", ["id", "days"], { client_id: clientId });
  const posts = new Map();
  for (const c of calendarios) {
    for (const d of leerJSON(c.days, [])) for (const p of d?.posts ?? []) posts.set(`${c.id}:${p.id}`, { texto: JSON.stringify(p), fecha: d.date });
  }
  return new Map(conUsos.map((f) => [f.id, leerJSON(f.usado_en, [])
    .map((u) => ({ u, p: posts.get(`${u.calendarId}:${u.postId}`) }))
    .filter(({ p }) => p?.texto.includes(f.clave))
    .map(({ u, p }) => ({ ...u, fecha: p.fecha }))]));
}

/**
 * ¿Se puede borrar de verdad? No lo que usa una publicación (de verdad: `vivos`), ni lo que usa la MARCA (`protegidas`, de
 * `clavesDeLaMarca`: el logo, la tipografía, los personajes, las plantillas, las fotos del catálogo). Borrado, el kit y
 * el catálogo seguían apuntando a él y TODA pieza que lo llevaba de referencia fallaba con «Una de las imágenes ya no
 * existe».
 */
const sePuedeBorrar = (f, protegidas, vivos) => !(vivos?.get(f.id) ?? []).length && !protegidas?.has(f.clave);

/** Borra de R2 de una vez (R2 admite hasta 1.000 claves por llamada): una sola petición, no una por archivo. */
async function borrarDeR2(env, claves) {
  for (let i = 0; i < claves.length; i += 1000) await env.MEDIA.delete(claves.slice(i, i + 1000)).catch(() => {});
}

/**
 * Borra de verdad lo que lleva más de 30 días en la papelera y no usa
 * ninguna publicación ni la marca. Devuelve las filas que quedan.
 */
export async function purgarPapelera(env, acceso, filas, ahoraMs = Date.now(), protegidas = null, vivos = null) {
  const limite = ahoraMs - DIAS_PAPELERA * 86_400_000;
  const enUso = vivos ?? new Map(filas.map((f) => [f.id, leerJSON(f.usado_en, [])]));
  const vencidas = filas
    .filter((f) => f.borrado_at && Date.parse(f.borrado_at) <= limite && sePuedeBorrar(f, protegidas, enUso))
    .slice(0, MAX_PURGA_POR_LECTURA);
  if (!vencidas.length) return filas;
  await borrarDeR2(env, vencidas.filter(esDelEstudio).map((f) => f.clave));
  await acceso.borrarVarios("estudio_archivos", vencidas.map((f) => f.id));
  const idas = new Set(vencidas.map((f) => f.id));
  return filas.filter((f) => !idas.has(f.id));
}

/** Un archivo para la pantalla, con lo que lo protege: la marca (`deLaMarca`) y sus usos de verdad. */
const conProteccion = (f, protegidas, vivos) => {
  const a = archivoPublico(f);
  const marca = protegidas?.get(f.clave);
  return { ...a, ...(vivos?.has(f.id) ? { usadoEn: vivos.get(f.id) } : {}), ...(marca ? { deLaMarca: marca.que } : {}) };
};

/**
 * Todo lo que la pantalla del Estudio necesita de un cliente, en una lectura. La galería y la papelera se leen APARTE:
 * juntas en los 300 más recientes, una papelera vieja no se veía (ni se podía vaciar) en cuanto la galería pasaba de 300.
 */
export async function leerGaleria(env, acceso, clientId, { protegidas = null } = {}) {
  const [activas, enPapelera, trabajos, carpetas] = await Promise.all([
    acceso.leer("estudio_archivos", { client_id: clientId, borrado_at: NULO }, "created_at desc", MAX_LISTADOS),
    acceso.leer("estudio_archivos", { client_id: clientId, borrado_at: NO_NULO }, "borrado_at desc", MAX_PAPELERA),
    acceso.leer("estudio_trabajos", { client_id: clientId }, "created_at desc", 40),
    acceso.leer("estudio_carpetas", { client_id: clientId }, "created_at asc"),
  ]);
  const vivos = await usosVivos(acceso, clientId, enPapelera);
  const papelera = await purgarPapelera(env, acceso, enPapelera, Date.now(), protegidas, vivos);
  return {
    archivos: activas.map((f) => conProteccion(f, protegidas, null)),
    papelera: papelera.map((f) => conProteccion(f, protegidas, vivos)),
    trabajos: trabajos.map(trabajoPublico),
    carpetas: carpetas.map(carpetaPublica),
  };
}

const archivoDe = (acceso, clientId, id) => acceso.leerUno("estudio_archivos", { id, client_id: clientId });

/**
 * A la papelera. Lo que usa la MARCA (el logo, una foto del catálogo, una plantilla…) no: 409 con qué es y dónde se
 * cambia. Antes se dejaba mandar y luego no se podía borrar, o se borraba con una papelera de antes y rompía las piezas.
 */
export async function enviarAPapelera(acceso, clientId, id, { protegidas = null } = {}) {
  const f = await archivoDe(acceso, clientId, id);
  if (!f) return null;
  const deLaMarca = protegidas?.get(f.clave);
  if (deLaMarca && !f.borrado_at) {
    throw new ErrorEstudio(`No se puede mandar a la papelera: es ${deLaMarca.que}. ${deLaMarca.arreglo}`, 409, { codigo: "de_la_marca", que: deLaMarca.que });
  }
  if (!f.borrado_at) await acceso.actualizar("estudio_archivos", { id, client_id: clientId }, { borrado_at: new Date().toISOString() });
  return archivoPublico(await archivoDe(acceso, clientId, id));
}

/** De la papelera a la galería. */
export async function recuperar(acceso, clientId, id) {
  const f = await archivoDe(acceso, clientId, id);
  if (!f) return null;
  if (f.borrado_at) await acceso.actualizar("estudio_archivos", { id, client_id: clientId }, { borrado_at: null });
  return archivoPublico(await archivoDe(acceso, clientId, id));
}

/**
 * Borrar del todo. Sólo desde la papelera. Lo que usa una publicación pide
 * `forzar`: desaparecería de ellas, y la persona tiene que saberlo.
 */
export async function borrarParaSiempre(env, acceso, clientId, id, { forzar = false, protegidas = null } = {}) {
  const f = await archivoDe(acceso, clientId, id);
  if (!f) return false;
  if (!f.borrado_at) throw new ErrorEstudio("Primero mándalo a la papelera.", 409);
  const deLaMarca = protegidas?.get(f.clave);
  if (deLaMarca) throw new ErrorEstudio(`No se puede borrar del todo: es ${deLaMarca.que} y se usa en cada pieza. ${deLaMarca.arreglo}`, 409, { codigo: "de_la_marca" });
  const usos = (await usosVivos(acceso, clientId, [f])).get(f.id) ?? [];
  if (usos.length && !forzar) {
    throw new ErrorEstudio(`Está en ${usos.length} publicación${usos.length === 1 ? "" : "es"}. Si lo borras del todo, desaparecerá de ${usos.length === 1 ? "ella" : "ellas"}.`, 409, { codigo: "en_uso", usos: usos.length });
  }
  if (esDelEstudio(f)) await borrarDeR2(env, [f.clave]);
  await acceso.borrar("estudio_archivos", { id, client_id: clientId });
  return true;
}

/**
 * Quita de la galería una ficha cuyo archivo YA NO ESTÁ en R2 (la pantalla no pudo pintarla). Se comprueba aquí: con
 * el archivo en su sitio no se quita nada, que la imagen pudo fallar por la red. Así se limpian las que dejó «Ampliar
 * con IA», que apuntaba la imagen intermedia en la galería y luego borraba su archivo.
 */
export async function quitarPerdido(env, acceso, clientId, id) {
  const f = await archivoDe(acceso, clientId, id);
  if (!f) return false;
  if (await env.MEDIA.head(f.clave)) throw new ErrorEstudio("El archivo sí está: recarga la página.", 409);
  await acceso.borrar("estudio_archivos", { id, client_id: clientId });
  return true;
}

/** La ficha de una imagen que se acaba de borrar de R2 por otra puerta (la intermedia de «Ampliar con IA»). */
export async function olvidarClave(acceso, clientId, clave) {
  await acceso.borrar("estudio_archivos", { client_id: clientId, clave: String(clave) });
}

/**
 * Vacía la papelera: TODO lo que no usa de verdad una publicación ni la marca (antes, 20 por clic y con los usos de
 * hace meses contando). → { borrados, quedan: [{ id, motivo: "marca" | "publicacion", que?, fecha? }], mas } — `mas`: había
 * más de las que caben en una llamada (la pantalla repite).
 */
export async function vaciarPapelera(env, acceso, clientId, { protegidas = null } = {}) {
  const filas = await acceso.leer("estudio_archivos", { client_id: clientId, borrado_at: NO_NULO }, "borrado_at asc", MAX_PAPELERA);
  const vivos = await usosVivos(acceso, clientId, filas);
  const quedan = [];
  const fuera = [];
  for (const f of filas) {
    const marca = protegidas?.get(f.clave);
    const usos = vivos.get(f.id) ?? [];
    if (marca) quedan.push({ id: f.id, motivo: "marca", que: marca.que });
    else if (usos.length) quedan.push({ id: f.id, motivo: "publicacion", fecha: usos[0].fecha ?? "" });
    else fuera.push(f);
  }
  await borrarDeR2(env, fuera.filter(esDelEstudio).map((f) => f.clave));
  if (fuera.length) await acceso.borrarVarios("estudio_archivos", fuera.map((f) => f.id));
  return { borrados: fuera.length, quedan, mas: filas.length >= MAX_PAPELERA && fuera.length > 0 };
}

/** Favorito y carpeta. Una carpeta tiene que ser de este cliente. */
export async function cambiarArchivo(acceso, clientId, id, { favorito, carpetaId }) {
  const f = await archivoDe(acceso, clientId, id);
  if (!f) return null;
  const cambios = {};
  if (favorito !== undefined) cambios.favorito = favorito ? 1 : 0;
  if (carpetaId !== undefined) {
    if (carpetaId !== null && !(await acceso.leerUno("estudio_carpetas", { id: String(carpetaId), client_id: clientId }))) {
      throw new ErrorEstudio("Esa carpeta no existe.", 404);
    }
    cambios.carpeta_id = carpetaId === null ? null : String(carpetaId);
  }
  if (Object.keys(cambios).length) {
    cambios.updated_at = new Date().toISOString();
    await acceso.actualizar("estudio_archivos", { id, client_id: clientId }, cambios);
  }
  return archivoPublico(await archivoDe(acceso, clientId, id));
}

/** Apunta que una publicación usa este archivo: lo que se usa no se purga. */
export async function marcarUso(acceso, clientId, id, { calendarId, postId }) {
  const f = await archivoDe(acceso, clientId, id);
  if (!f) return null;
  const usos = leerJSON(f.usado_en, []);
  const clave = `${String(calendarId ?? "").slice(0, 80)}:${String(postId ?? "").slice(0, 80)}`;
  if (!calendarId || !postId) throw new ErrorEstudio("Falta la publicación.", 400);
  if (!usos.some((u) => u.clave === clave) && usos.length < 50) {
    usos.push({ clave, calendarId: String(calendarId), postId: String(postId), en: new Date().toISOString() });
    await acceso.actualizar("estudio_archivos", { id, client_id: clientId }, { usado_en: JSON.stringify(usos), updated_at: new Date().toISOString() });
  }
  return archivoPublico(await archivoDe(acceso, clientId, id));
}

/**
 * Sube un archivo a mano (la foto del producto, el logo, una cara) para usarlo
 * de referencia, o un VIDEO (el de la competencia: para sacar su estructura o
 * copiar su movimiento). Se reconoce por sus primeros bytes, no por el nombre
 * ni por el tipo que declare el navegador; y va a R2 por flujo, sin cargarlo
 * entero.
 */
/**
 * Lo que una pieza COMPUESTA (el texto de la plantilla encima de una cruda del Estudio) hereda de su cruda: el pedido,
 * el modelo y el trabajo —para que «Otra igual» y «Otra versión» sepan repetirla— y el texto que lleva encima. Sólo de
 * una cruda de ESTE cliente; si no, nada (y se sube como una más). Pura salvo la lectura.
 */
async function herenciaDe(acceso, clientId, origenId, plantilla) {
  if (!origenId) return null;
  const o = await acceso.leerUno("estudio_archivos", { id: String(origenId).slice(0, 80), client_id: clientId });
  if (!o || o.subido || o.tipo !== "imagen") return null;
  let p = null;
  try { p = typeof plantilla === "string" ? JSON.parse(plantilla) : plantilla; } catch { p = null; }
  const texto = String(p?.texto ?? "").slice(0, 400);
  const donde = ["banda", "arriba", "centro", "degradado"].includes(p?.plantilla) ? p.plantilla : "banda";
  // La que lleva el logo ESTAMPADO ya no está «sin logo»: si heredara la marca, corregirla lo estamparía dos veces.
  const { logoFuera, ...ajustes } = leerJSON(o.ajustes, {});
  return {
    prompt: o.prompt, modelo: o.modelo, trabajo_id: o.trabajo_id,
    // `deArchivo`: de qué pieza sale (la galería la apila como una versión de ella), también la del logo estampado.
    ajustes: JSON.stringify({ ...ajustes, deArchivo: o.id, ...(logoFuera && p?.plantilla !== "logo" ? { logoFuera } : {}), ...(texto ? { plantilla: { texto, plantilla: donde, origenId: o.id } } : {}) }),
  };
}

export async function subirArchivo(env, acceso, cliente, archivo, { carpetaId = null, origenId = null, plantilla = null } = {}) {
  if (!archivo || typeof archivo === "string") throw new ErrorEstudio("Falta el archivo.", 400);
  if (archivo.size > MAX_SUBIDA_VIDEO) throw new ErrorEstudio("El archivo pesa más de 50 MB.", 413);
  const cabecera = new Uint8Array(await archivo.slice(0, 65_536).arrayBuffer());
  const mime = tipoPorBytes(cabecera);
  if (!mime) throw new ErrorEstudio("Sólo se pueden subir imágenes PNG, JPEG o WebP, o videos MP4, MOV o WebM.", 415);
  const esVideo = mime.startsWith("video/");
  if (!esVideo && archivo.size > MAX_SUBIDA) throw new ErrorEstudio("La imagen pesa más de 15 MB.", 413);
  if (carpetaId && !(await acceso.leerUno("estudio_carpetas", { id: String(carpetaId), client_id: cliente.id }))) {
    throw new ErrorEstudio("Esa carpeta no existe.", 404);
  }
  const herencia = esVideo ? null : await herenciaDe(acceso, cliente.id, origenId, plantilla);
  // Una imagen subida a mano dos veces es la misma: se devuelve la ficha que ya había (y, si estaba en la papelera,
  // vuelve). Las compuestas no se comparan (las crea el Estudio) y los videos tampoco (no se cargan enteros).
  const huella = !esVideo && !herencia ? await huellaDe(archivo) : "";
  if (huella) {
    const igual = (await acceso.leer("estudio_archivos", { client_id: cliente.id, huella }, "created_at asc", 1))[0];
    if (igual) {
      if (igual.borrado_at) await acceso.actualizar("estudio_archivos", { id: igual.id, client_id: cliente.id }, { borrado_at: null, updated_at: new Date().toISOString() });
      return { ...archivoPublico({ ...igual, borrado_at: null }), repetido: true };
    }
  }
  const clave = claveDeArchivo(cliente.id, archivo.name?.replace(/\.[^.]+$/, "") || "subida", mime);
  await env.MEDIA.put(clave, archivo.stream(), { httpMetadata: { contentType: mime } });
  const { ancho, alto } = esVideo ? { ancho: 0, alto: 0 } : medidasDe(cabecera, mime);
  const ahora = new Date().toISOString();
  const fila = await acceso.insertar("estudio_archivos", {
    id: uuid(), client_id: cliente.id, clave, tipo: esVideo ? "video" : "imagen", mime, ancho, alto, bytes: archivo.size,
    prompt: herencia?.prompt ?? String(archivo.name ?? "").slice(0, 200), modelo: herencia?.modelo ?? "", ajustes: herencia?.ajustes ?? "{}",
    trabajo_id: herencia?.trabajo_id ?? null,
    // Una compuesta la crea el Estudio (el texto encima de su pieza): no es «subida a mano», y su objeto de R2 es suyo.
    carpeta_id: carpetaId ? String(carpetaId) : null, origen: herencia ? "estudio" : "subida", costo: 0, favorito: 0, subido: herencia ? 0 : 1, usado_en: "[]",
    huella, borrado_at: null, created_at: ahora, updated_at: ahora,
  });
  return archivoPublico(fila);
}

/** El SHA-256 de los bytes, en hexadecimal: lo que dice que dos subidas son la misma imagen. */
async function huellaDe(archivo) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", await archivo.arrayBuffer()));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Apunta en la galería una imagen que se creó por otra puerta
 * (`/api/generar-imagen`), para que aparezca junto a las demás. No puede
 * tumbar la respuesta: si falla, la imagen ya existe y se pierde el apunte.
 */
export async function registrarImagenGenerada(acceso, { clientId, clave, mime, prompt, modelo, costo = 0, ancho = 0, alto = 0, bytes = 0, ajustes = {} }) {
  try {
    const ahora = new Date().toISOString();
    await acceso.insertar("estudio_archivos", {
      id: uuid(), client_id: clientId, clave, tipo: "imagen", mime, ancho, alto, bytes,
      prompt: String(prompt ?? "").slice(0, 2000), modelo: String(modelo ?? ""), ajustes: JSON.stringify(ajustes), trabajo_id: null,
      carpeta_id: null, origen: "app", costo, favorito: 0, subido: 0, usado_en: "[]", borrado_at: null, created_at: ahora, updated_at: ahora,
    });
  } catch (e) {
    console.error("estudio: no se pudo apuntar la imagen generada", e?.message);
  }
}

// ---------- Carpetas ----------

const nombreDeCarpeta = (nombre) => {
  const limpio = String(nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
  if (!limpio) throw new ErrorEstudio("Ponle un nombre a la carpeta.", 400);
  return limpio;
};

export async function crearCarpeta(acceso, clientId, nombre, { tipo = "" } = {}) {
  const limpio = nombreDeCarpeta(nombre);
  const t = TIPOS_CARPETA.includes(tipo) ? tipo : "";
  const existentes = await acceso.leerColumnas("estudio_carpetas", ["id", "nombre", "tipo"], { client_id: clientId });
  const mismas = existentes.filter((c) => (c.tipo ?? "") === "" ? !t : Boolean(t));
  if (!t && mismas.length >= MAX_CARPETAS) throw new ErrorEstudio(`Puedes tener hasta ${MAX_CARPETAS} carpetas.`, 409);
  if (t && mismas.length >= MAX_GRUPOS) throw new ErrorEstudio(`Hay ${MAX_GRUPOS} carruseles y reels en la galería: borra alguno viejo.`, 409);
  if (existentes.some((c) => c.nombre.toLowerCase() === limpio.toLowerCase())) throw new ErrorEstudio("Ya hay una carpeta con ese nombre.", 409);
  const ahora = new Date().toISOString();
  return carpetaPublica(await acceso.insertar("estudio_carpetas", { id: uuid(), client_id: clientId, nombre: limpio, tipo: t, orden: "[]", created_at: ahora, updated_at: ahora }));
}

/**
 * El orden de las piezas de un carrusel o un reel (las láminas finales, o los videos y los fotogramas). Sólo ids de
 * archivos que están EN esa carpeta: la lista la manda el navegador.
 */
export async function ordenarCarpeta(acceso, clientId, id, orden) {
  const c = await acceso.leerUno("estudio_carpetas", { id, client_id: clientId });
  if (!c) return null;
  if (!Array.isArray(orden)) throw new ErrorEstudio("El orden tiene que ser una lista.", 400);
  const dentro = new Set((await acceso.leerColumnas("estudio_archivos", ["id"], { client_id: clientId, carpeta_id: id })).map((f) => f.id));
  const limpio = [...new Set(orden.map((x) => String(x ?? "").slice(0, 80)))].filter((x) => dentro.has(x)).slice(0, MAX_ORDEN);
  await acceso.actualizar("estudio_carpetas", { id, client_id: clientId }, { orden: JSON.stringify(limpio), updated_at: new Date().toISOString() });
  return carpetaPublica(await acceso.leerUno("estudio_carpetas", { id, client_id: clientId }));
}

export async function renombrarCarpeta(acceso, clientId, id, nombre) {
  const limpio = nombreDeCarpeta(nombre);
  const n = await acceso.actualizar("estudio_carpetas", { id, client_id: clientId }, { nombre: limpio, updated_at: new Date().toISOString() });
  return n ? carpetaPublica(await acceso.leerUno("estudio_carpetas", { id, client_id: clientId })) : null;
}

/** Quitar una carpeta no borra sus archivos: vuelven a «Sin carpeta». */
export async function borrarCarpeta(acceso, clientId, id) {
  if (!(await acceso.leerUno("estudio_carpetas", { id, client_id: clientId }))) return false;
  await acceso.actualizar("estudio_archivos", { carpeta_id: id, client_id: clientId }, { carpeta_id: null });
  await acceso.borrar("estudio_carpetas", { id, client_id: clientId });
  return true;
}

/** Cuántas imágenes de la marca se comprueban en R2 por lectura, como mucho: cada una cuenta como petición. */
const MAX_COMPROBAR_MARCA = 10;

/**
 * Las imágenes de la marca (`protegidas`) cuyo archivo YA NO ESTÁ: un Set de claves. Las que tienen ficha en la galería
 * (o en la papelera) se dan por buenas; las demás se preguntan a R2, como mucho `MAX_COMPROBAR_MARCA`. Lo que borró una
 * papelera de antes (cuando aún no protegía la marca) aparece aquí y la pantalla deja de pedirlo de referencia.
 */
export async function clavesPerdidas(env, protegidas, galeria) {
  const conFicha = new Set([...(galeria?.archivos ?? []), ...(galeria?.papelera ?? [])].map((a) => a.clave));
  const dudosas = [...(protegidas?.keys() ?? [])].filter((c) => !conFicha.has(c)).slice(0, MAX_COMPROBAR_MARCA);
  const perdidas = new Set();
  for (const clave of dudosas) {
    const cabeza = await env.MEDIA.head(clave).catch(() => "error");
    if (!cabeza) perdidas.add(clave);
  }
  return perdidas;
}
