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

const carpetaPublica = (c) => ({ id: c.id, nombre: c.nombre, creada: c.created_at });

/** ¿El Estudio es dueño del objeto de R2 de este archivo? */
const esDelEstudio = (f) => f.origen === "estudio" || Boolean(f.subido);

/**
 * Borra de verdad lo que lleva más de 30 días en la papelera y no usa
 * ninguna publicación. Devuelve las filas que quedan.
 */
export async function purgarPapelera(env, acceso, filas, ahoraMs = Date.now()) {
  const limite = ahoraMs - DIAS_PAPELERA * 86_400_000;
  const vencidas = filas
    .filter((f) => f.borrado_at && Date.parse(f.borrado_at) <= limite && leerJSON(f.usado_en, []).length === 0)
    .slice(0, MAX_PURGA_POR_LECTURA);
  if (!vencidas.length) return filas;
  for (const f of vencidas) {
    if (esDelEstudio(f)) await env.MEDIA.delete(f.clave).catch(() => {});
  }
  await acceso.borrarVarios("estudio_archivos", vencidas.map((f) => f.id));
  const idas = new Set(vencidas.map((f) => f.id));
  return filas.filter((f) => !idas.has(f.id));
}

/** Todo lo que la pantalla del Estudio necesita de un cliente, en una lectura. */
export async function leerGaleria(env, acceso, clientId) {
  const [todas, trabajos, carpetas] = await Promise.all([
    acceso.leer("estudio_archivos", { client_id: clientId }, "created_at desc", MAX_LISTADOS),
    acceso.leer("estudio_trabajos", { client_id: clientId }, "created_at desc", 40),
    acceso.leer("estudio_carpetas", { client_id: clientId }, "created_at asc"),
  ]);
  const filas = await purgarPapelera(env, acceso, todas);
  return {
    archivos: filas.filter((f) => !f.borrado_at).map(archivoPublico),
    papelera: filas.filter((f) => f.borrado_at).map(archivoPublico),
    trabajos: trabajos.map(trabajoPublico),
    carpetas: carpetas.map(carpetaPublica),
  };
}

const archivoDe = (acceso, clientId, id) => acceso.leerUno("estudio_archivos", { id, client_id: clientId });

/** A la papelera. */
export async function enviarAPapelera(acceso, clientId, id) {
  const f = await archivoDe(acceso, clientId, id);
  if (!f) return null;
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
export async function borrarParaSiempre(env, acceso, clientId, id, { forzar = false } = {}) {
  const f = await archivoDe(acceso, clientId, id);
  if (!f) return false;
  if (!f.borrado_at) throw new ErrorEstudio("Primero mándalo a la papelera.", 409);
  const usos = leerJSON(f.usado_en, []);
  if (usos.length && !forzar) {
    throw new ErrorEstudio(`Está en ${usos.length} publicación${usos.length === 1 ? "" : "es"}. Si lo borras del todo, desaparecerá de ${usos.length === 1 ? "ella" : "ellas"}.`, 409, { codigo: "en_uso", usos: usos.length });
  }
  if (esDelEstudio(f)) await env.MEDIA.delete(f.clave).catch(() => {});
  await acceso.borrar("estudio_archivos", { id, client_id: clientId });
  return true;
}

/** Vacía la papelera: lo que no usa ninguna publicación. Devuelve cuántos. */
export async function vaciarPapelera(env, acceso, clientId) {
  const filas = await acceso.leer("estudio_archivos", { client_id: clientId }, "created_at desc", MAX_LISTADOS);
  const fuera = filas.filter((f) => f.borrado_at && leerJSON(f.usado_en, []).length === 0).slice(0, MAX_PURGA_POR_LECTURA);
  for (const f of fuera) if (esDelEstudio(f)) await env.MEDIA.delete(f.clave).catch(() => {});
  if (fuera.length) await acceso.borrarVarios("estudio_archivos", fuera.map((f) => f.id));
  return fuera.length;
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
export async function subirArchivo(env, acceso, cliente, archivo, { carpetaId = null } = {}) {
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
  const clave = claveDeArchivo(cliente.id, archivo.name?.replace(/\.[^.]+$/, "") || "subida", mime);
  await env.MEDIA.put(clave, archivo.stream(), { httpMetadata: { contentType: mime } });
  const { ancho, alto } = esVideo ? { ancho: 0, alto: 0 } : medidasDe(cabecera, mime);
  const ahora = new Date().toISOString();
  const fila = await acceso.insertar("estudio_archivos", {
    id: uuid(), client_id: cliente.id, clave, tipo: esVideo ? "video" : "imagen", mime, ancho, alto, bytes: archivo.size,
    prompt: String(archivo.name ?? "").slice(0, 200), modelo: "", ajustes: "{}", trabajo_id: null,
    carpeta_id: carpetaId ? String(carpetaId) : null, origen: "subida", costo: 0, favorito: 0, subido: 1, usado_en: "[]",
    borrado_at: null, created_at: ahora, updated_at: ahora,
  });
  return archivoPublico(fila);
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

export async function crearCarpeta(acceso, clientId, nombre) {
  const limpio = nombreDeCarpeta(nombre);
  const existentes = await acceso.leerColumnas("estudio_carpetas", ["id", "nombre"], { client_id: clientId });
  if (existentes.length >= MAX_CARPETAS) throw new ErrorEstudio(`Puedes tener hasta ${MAX_CARPETAS} carpetas.`, 409);
  if (existentes.some((c) => c.nombre.toLowerCase() === limpio.toLowerCase())) throw new ErrorEstudio("Ya hay una carpeta con ese nombre.", 409);
  const ahora = new Date().toISOString();
  return carpetaPublica(await acceso.insertar("estudio_carpetas", { id: uuid(), client_id: clientId, nombre: limpio, created_at: ahora, updated_at: ahora }));
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
