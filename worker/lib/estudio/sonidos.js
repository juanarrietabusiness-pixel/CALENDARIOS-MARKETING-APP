// ============================================================
// La BIBLIOTECA DE SONIDO: la música y los efectos de cada cliente y los de la AGENCIA (lo que toca la base y R2; lo
// puro, en src/lib/bibliotecaSonido.js; las rutas, en worker/rutas/sonidos.js)
//
//   · Lo de un CLIENTE vive en `estudio_archivos` (tipo «audio»): la categoría sale del `modelo` (musica-suno,
//     musica-subida, musica-agencia; efecto-subido, efecto-agencia), el nombre es el `prompt`, la favorita el
//     `favorito` y las etiquetas, el BPM y la duración van en `ajustes.biblioteca`. Lo que ya había (las músicas de Suno y
//     las subidas desde «Sonido») entra solo. La locución también es audio y NO es de la biblioteca (su modelo no empieza
//     por «musica» ni por «efecto»).
//   · Lo de la AGENCIA vive en `biblioteca_sonidos` (0075) y su archivo en R2 bajo `biblioteca/<espacio>/…`, que
//     /api/media no sirve (sólo `clientes/`): lo sirve GET /api/sonidos/agencia/<id>/audio con la sesión del espacio.
//   · Un video animado usa una pista de cualquiera de las dos (`sonidoParaVideo`): la clave queda en su sonido y el
//     render la lee de R2 si es de ESE cliente o de ESTE espacio (`claveDeSonido`).
//   · Quitar una que usa un video lo dice (409 `en_uso` con cuáles) y sólo con `forzar` se quita: lo del cliente va a la
//     papelera de la galería (su archivo sigue 30 días: el render no se rompe); lo de la agencia se borra.
//   · No se guarda dos veces la misma pista (la huella SHA-256 de sus bytes), ni al subir ni al copiar.
// ============================================================

import { uuid } from "../ids.js";
import { NULO } from "../acceso.js";
import { tipoPorBytes, slugCorto, extensionDe, claveDeArchivo, claveDelCliente } from "./archivos.js";
import {
  CATEGORIAS_SONIDO, MAX_BYTES_SONIDO, MAX_PISTAS, categoriaDeModelo, origenDeModelo, modeloDeSonido, limpiarNombreSonido,
  limpiarEtiquetas, limpiarBpm, limpiarDuracionSonido, limpiarCambiosSonido, metaDeSonido, ordenarPistas, pistasQueEncajan,
  MODELO_EFECTO_AGENCIA, MODELO_MUSICA_AGENCIA,
} from "../../../src/lib/bibliotecaSonido.js";

/** Un error de lo pedido, con su estado HTTP y lo que la pantalla necesita (`codigo`, `usos`…). */
export class ErrorSonido extends Error {
  constructor(mensaje, estado = 400, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.extra = extra;
  }
}

const leerJSON = (t, d) => { try { const v = typeof t === "string" ? JSON.parse(t) : t; return v ?? d; } catch { return d; } };
const ahora = () => new Date().toISOString();
const ID = /^[\w-]{1,80}$/;
const COLUMNAS = ["id", "clave", "prompt", "modelo", "mime", "bytes", "ajustes", "favorito", "huella", "created_at"];
const VACIA = Object.freeze({ musica: [], efectos: [] });

/** Quien cambia lo de la AGENCIA: quien administra y los editores sin clientes asignados (no un colaborador). */
export const puedeCambiarAgencia = (usuario) => usuario?.rol === "admin" || (usuario?.rol === "editor" && !Array.isArray(usuario?.clientes));

/** El nombre por defecto de una pista sin nombre. */
const nombrePorDefecto = (categoria) => (categoria === "efecto" ? "Efecto" : "Música");

/** Una fila de `estudio_archivos` (audio de la biblioteca de un cliente) como pista. */
export function pistaDeArchivo(f) {
  const categoria = categoriaDeModelo(f.modelo) ?? "musica";
  const ajustes = leerJSON(f.ajustes, {});
  const estilo = String(ajustes?.pedido?.estilo ?? "").slice(0, 600);
  return {
    id: f.id, nombre: limpiarNombreSonido(f.prompt) || nombrePorDefecto(categoria), src: `/api/media/${f.clave}`, bytes: f.bytes ?? 0,
    modelo: f.modelo, fecha: f.created_at, ...(estilo ? { estilo } : {}),
    categoria, de: "cliente", origen: origenDeModelo(f.modelo), favorita: Boolean(f.favorito), mime: f.mime ?? "audio/mpeg",
    ...metaDeSonido(ajustes),
  };
}

/** Una fila de `biblioteca_sonidos` (de la agencia) como pista. */
export function pistaDeAgencia(f) {
  const datos = leerJSON(f.datos, {});
  const estilo = String(datos?.estilo ?? "").slice(0, 600);
  return {
    id: f.id, nombre: limpiarNombreSonido(f.nombre) || nombrePorDefecto(f.categoria), src: `/api/sonidos/agencia/${encodeURIComponent(f.id)}/audio`,
    bytes: f.bytes ?? 0, modelo: f.categoria === "efecto" ? MODELO_EFECTO_AGENCIA : MODELO_MUSICA_AGENCIA, fecha: f.created_at,
    ...(estilo ? { estilo } : {}), categoria: f.categoria, de: "agencia", origen: f.origen || "subida", favorita: Boolean(f.favorita),
    mime: f.mime ?? "audio/mpeg", etiquetas: limpiarEtiquetas(leerJSON(f.etiquetas, [])), bpm: limpiarBpm(f.bpm) ?? null,
    duracion: limpiarDuracionSonido(f.duracion),
  };
}

const porCategoria = (pistas) => ({
  musica: ordenarPistas(pistas.filter((p) => p.categoria === "musica")),
  efectos: ordenarPistas(pistas.filter((p) => p.categoria === "efecto")),
});

/** La biblioteca de un cliente (sólo lo suyo). → { musica, efectos }, la favorita primero. */
export async function sonidosDelCliente(acceso, clienteId) {
  const filas = await acceso.leerColumnas("estudio_archivos", COLUMNAS, { client_id: clienteId, tipo: "audio", borrado_at: NULO }, "created_at desc", MAX_PISTAS);
  return porCategoria(filas.filter((f) => categoriaDeModelo(f.modelo)).map(pistaDeArchivo));
}

/** La biblioteca de la agencia. → { musica, efectos }. */
export async function sonidosDeLaAgencia(acceso) {
  const filas = await acceso.leer("biblioteca_sonidos", {}, "created_at desc", MAX_PISTAS);
  return porCategoria(filas.map(pistaDeAgencia));
}

/** Las dos bibliotecas juntas para un cliente: lo suyo primero (la favorita, la primera) y luego lo de la agencia. */
async function juntas(acceso, clienteId, agencia) {
  const [c, a] = await Promise.all([
    sonidosDelCliente(acceso, clienteId),
    agencia ? sonidosDeLaAgencia(acceso).catch(() => VACIA) : VACIA,
  ]);
  return { musica: ordenarPistas([...c.musica, ...a.musica]), efectos: ordenarPistas([...c.efectos, ...a.efectos]) };
}

/**
 * Las músicas de fondo que puede usar un cliente: las suyas (subidas o generadas con Suno) y las de la AGENCIA (marcadas
 * `de: "agencia"`). La favorita del cliente (la música de la marca) va primero. La forma es la de siempre ({ id, nombre,
 * src, bytes, modelo, fecha, estilo? }) con campos AÑADIDOS: categoria, de, origen, favorita, etiquetas, bpm, duracion.
 */
export async function musicasDe(acceso, clienteId, { agencia = true } = {}) {
  return (await juntas(acceso, clienteId, agencia)).musica;
}

/** Los efectos que puede usar un cliente: los suyos y los de la agencia. */
export async function efectosDe(acceso, clienteId, { agencia = true } = {}) {
  return (await juntas(acceso, clienteId, agencia)).efectos;
}

/** La música de la marca de un cliente (su favorita), o null: la que llevan por defecto sus videos nuevos. */
export async function musicaDeLaMarca(acceso, clienteId) {
  const filas = await acceso.leerColumnas("estudio_archivos", COLUMNAS, { client_id: clienteId, tipo: "audio", favorito: 1, borrado_at: NULO }, "updated_at desc", 10).catch(() => []);
  const f = filas.find((x) => categoriaDeModelo(x.modelo) === "musica");
  return f ? pistaDeArchivo(f) : null;
}

/** El SHA-256 de unos bytes, en hexadecimal. */
async function huellaDe(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** La clave de R2 de una pista de la agencia: fuera de `clientes/` (que /api/media sirve a cualquiera del espacio). */
export function claveDeAgencia(ownerId, categoria, nombre, mime, { fecha = new Date(), aleatorio = crypto.randomUUID() } = {}) {
  const iso = fecha.toISOString();
  return `biblioteca/${ownerId}/${categoria}/${iso.slice(0, 7)}/${iso.slice(0, 10)}-${slugCorto(nombre)}-${String(aleatorio).slice(0, 8)}.${extensionDe(mime)}`;
}

/**
 * ¿Esta clave es de un audio que puede sonar en un video de ESTE cliente? La suya (`clientes/<cliente>/`) o la de la
 * agencia de ESTE espacio (`biblioteca/<espacio>/`), sin `..`. → la clave o null.
 */
export function claveDeSonido(clave, clienteId, ownerId) {
  const c = claveDelCliente(clave, clienteId);
  if (c) return c;
  const s = String(clave ?? "");
  return ownerId && s.startsWith(`biblioteca/${ownerId}/`) && !s.includes("..") && s.length <= 300 ? s : null;
}

/** Lo que pesa como mucho una categoría, dicho para la persona. */
const textoTope = (categoria) => (categoria === "efecto" ? "Un efecto pesa como mucho 2 MB." : "La música pesa más de 15 MB.");

/**
 * Sube una pista a la biblioteca de un cliente (`cliente`) o a la de la agencia (sin cliente). Se reconoce por sus
 * primeros bytes (MP3, WAV o M4A), no por el nombre. `duracion` la mide el navegador (el Worker no decodifica audio):
 * puede venir aquí o después, con `cambiarSonido`, medida de su dirección ya subida.
 * La misma pista otra vez devuelve la que había (`repetido`; si estaba en la papelera, vuelve). → { pista, repetido }.
 */
export async function subirSonido(env, acceso, { cliente = null, archivo, categoria = "musica", nombre = "", duracion = null, usuario = null }) {
  if (!CATEGORIAS_SONIDO.includes(categoria)) throw new ErrorSonido("La categoría es «musica» o «efecto».", 400);
  if (!archivo || typeof archivo === "string") throw new ErrorSonido("Falta el archivo.", 400);
  if (archivo.size > MAX_BYTES_SONIDO[categoria]) throw new ErrorSonido(textoTope(categoria), 413);
  const cabecera = new Uint8Array(await archivo.slice(0, 65_536).arrayBuffer());
  const mime = tipoPorBytes(cabecera);
  if (!mime?.startsWith("audio/")) throw new ErrorSonido("Tiene que ser un audio MP3, WAV o M4A.", 415);
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const huella = await huellaDe(bytes);
  const n = limpiarNombreSonido(nombre || archivo.name) || nombrePorDefecto(categoria);
  const dur = limpiarDuracionSonido(duracion);
  const momento = ahora();

  if (cliente) {
    const igual = (await acceso.leer("estudio_archivos", { client_id: cliente.id, huella }, "created_at asc", 1))[0];
    if (igual) {
      if (igual.borrado_at) await acceso.actualizar("estudio_archivos", { id: igual.id, client_id: cliente.id }, { borrado_at: null, updated_at: momento });
      return { pista: pistaDeArchivo(igual), repetido: true };
    }
    const clave = claveDeArchivo(cliente.id, n, mime);
    await env.MEDIA.put(clave, bytes, { httpMetadata: { contentType: mime } });
    const fila = await acceso.insertar("estudio_archivos", {
      id: uuid(), client_id: cliente.id, clave, tipo: "audio", mime, ancho: 0, alto: 0, bytes: bytes.byteLength,
      prompt: n, modelo: modeloDeSonido(categoria), ajustes: JSON.stringify({ biblioteca: { etiquetas: [], bpm: null, duracion: dur } }),
      trabajo_id: null, carpeta_id: null, origen: "subida", costo: 0, favorito: 0, subido: 1, usado_en: "[]",
      huella, borrado_at: null, created_at: momento, updated_at: momento,
    });
    return { pista: pistaDeArchivo(fila), repetido: false };
  }

  const igual = (await acceso.leer("biblioteca_sonidos", { huella }, "created_at asc", 1))[0];
  if (igual) return { pista: pistaDeAgencia(igual), repetido: true };
  const clave = claveDeAgencia(acceso.ownerId, categoria, n, mime);
  await env.MEDIA.put(clave, bytes, { httpMetadata: { contentType: mime } });
  const fila = await acceso.insertar("biblioteca_sonidos", {
    id: uuid(), categoria, clave, mime, bytes: bytes.byteLength, nombre: n, etiquetas: "[]", bpm: null, duracion: dur, favorita: 0,
    origen: "subida", huella, datos: "{}", creado_por: usuario?.id ?? null, created_at: momento, updated_at: momento,
  });
  return { pista: pistaDeAgencia(fila), repetido: false };
}

/** La fila de una pista de un cliente (audio de su biblioteca, fuera de la papelera), o null. */
async function filaDelCliente(acceso, clienteId, id) {
  if (!ID.test(String(id ?? ""))) return null;
  const f = await acceso.leerUno("estudio_archivos", { id: String(id), client_id: clienteId });
  return f && f.tipo === "audio" && categoriaDeModelo(f.modelo) ? f : null;
}

/**
 * Cambia el nombre, las etiquetas, el BPM o la favorita de una pista (de un cliente con `clienteId`; si no, de la
 * agencia). La favorita de la MÚSICA es una sola (la música de la marca): marcar otra desmarca la de antes. → la pista.
 */
export async function cambiarSonido(acceso, { clienteId = null, id, cambios }) {
  const c = limpiarCambiosSonido(cambios);
  const momento = ahora();
  if (clienteId) {
    const f = await filaDelCliente(acceso, clienteId, id);
    if (!f || f.borrado_at) return null;
    const ajustes = leerJSON(f.ajustes, {});
    const b = { ...(ajustes.biblioteca && typeof ajustes.biblioteca === "object" ? ajustes.biblioteca : {}) };
    if (c.etiquetas) b.etiquetas = c.etiquetas;
    if ("bpm" in c) b.bpm = c.bpm;
    if ("duracion" in c) b.duracion = c.duracion;
    const upd = { ajustes: JSON.stringify({ ...ajustes, biblioteca: b }), updated_at: momento };
    if (c.nombre) upd.prompt = c.nombre;
    if (c.favorita !== undefined) {
      upd.favorito = c.favorita ? 1 : 0;
      if (c.favorita && categoriaDeModelo(f.modelo) === "musica") {
        const otras = await acceso.leerColumnas("estudio_archivos", ["id", "modelo"], { client_id: clienteId, tipo: "audio", favorito: 1 });
        for (const o of otras) {
          if (o.id !== f.id && categoriaDeModelo(o.modelo) === "musica") await acceso.actualizar("estudio_archivos", { id: o.id, client_id: clienteId }, { favorito: 0, updated_at: momento });
        }
      }
    }
    await acceso.actualizar("estudio_archivos", { id: f.id, client_id: clienteId }, upd);
    return pistaDeArchivo(await acceso.leerUno("estudio_archivos", { id: f.id, client_id: clienteId }));
  }
  if (!ID.test(String(id ?? ""))) return null;
  const a = await acceso.leerUno("biblioteca_sonidos", { id: String(id) });
  if (!a) return null;
  const upd = { updated_at: momento };
  if (c.nombre) upd.nombre = c.nombre;
  if (c.etiquetas) upd.etiquetas = JSON.stringify(c.etiquetas);
  if ("bpm" in c) upd.bpm = c.bpm;
  if ("duracion" in c) upd.duracion = c.duracion;
  if (c.favorita !== undefined) {
    upd.favorita = c.favorita ? 1 : 0;
    if (c.favorita && a.categoria === "musica") {
      const otras = await acceso.leerColumnas("biblioteca_sonidos", ["id"], { categoria: "musica", favorita: 1 });
      for (const o of otras) if (o.id !== a.id) await acceso.actualizar("biblioteca_sonidos", { id: o.id }, { favorita: 0, updated_at: momento });
    }
  }
  await acceso.actualizar("biblioteca_sonidos", { id: a.id }, upd);
  return pistaDeAgencia(await acceso.leerUno("biblioteca_sonidos", { id: a.id }));
}

/** ¿Este sonido de un video usa la pista `id` (como música o como efecto)? */
const usa = (sonido, id) => {
  const s = leerJSON(sonido, {}) ?? {};
  return s.musica?.archivoId === id || s.efectosPropios?.transicion?.archivoId === id || s.efectosPropios?.sello?.archivoId === id;
};

/** Los videos animados que usan una pista (de un cliente, o de todo el espacio si es de la agencia). → [{ id, titulo, clienteId }]. */
export async function videosQueUsan(acceso, id, { clienteId = null } = {}) {
  const filas = await acceso.leerColumnas("videos_proyectos", ["id", "titulo", "sonido", "client_id"], clienteId ? { client_id: clienteId } : {});
  return filas.filter((v) => usa(v.sonido, id)).map((v) => ({ id: v.id, titulo: v.titulo || "Video sin título", clienteId: v.client_id }));
}

/** El 409 de una pista que usa algún video: cuáles, y que con un segundo toque se quita igual. */
function enUso(usos) {
  const n = usos.length;
  const cuales = usos.slice(0, 3).map((v) => `«${v.titulo}»`).join(", ");
  return new ErrorSonido(
    `La usa${n === 1 ? "" : "n"} ${n === 1 ? "un video" : `${n} videos`}: ${cuales}${n > 3 ? "…" : ""}. Si la quitas, ${n === 1 ? "ese video saldrá" : "esos videos saldrán"} sin ella al volver a renderizar.`,
    409, { codigo: "en_uso", usos },
  );
}

/**
 * Quita una pista. Si la usa un video, 409 `en_uso` (sin `forzar`). La de un cliente va a la papelera de su galería (su
 * archivo sigue ahí 30 días: un render no se rompe); la de la agencia se borra de verdad. → { quitada, papelera }.
 */
export async function quitarSonido(env, acceso, { clienteId = null, id, forzar = false }) {
  if (clienteId) {
    const f = await filaDelCliente(acceso, clienteId, id);
    if (!f) return null;
    if (f.borrado_at) return { quitada: true, papelera: true };
    const usos = await videosQueUsan(acceso, f.id, { clienteId });
    if (usos.length && !forzar) throw enUso(usos);
    await acceso.actualizar("estudio_archivos", { id: f.id, client_id: clienteId }, { borrado_at: ahora(), favorito: 0, updated_at: ahora() });
    return { quitada: true, papelera: true };
  }
  if (!ID.test(String(id ?? ""))) return null;
  const a = await acceso.leerUno("biblioteca_sonidos", { id: String(id) });
  if (!a) return null;
  const usos = await videosQueUsan(acceso, a.id);
  if (usos.length && !forzar) throw enUso(usos);
  await env.MEDIA.delete(a.clave).catch(() => {});
  await acceso.borrar("biblioteca_sonidos", { id: a.id });
  return { quitada: true, papelera: false };
}

/** De la papelera a la biblioteca del cliente («Deshacer» al quitar). → la pista, o null. */
export async function recuperarSonido(acceso, clienteId, id) {
  const f = await filaDelCliente(acceso, clienteId, id);
  if (!f) return null;
  if (f.borrado_at) await acceso.actualizar("estudio_archivos", { id: f.id, client_id: clienteId }, { borrado_at: null, updated_at: ahora() });
  return pistaDeArchivo({ ...f, borrado_at: null });
}

/** Los bytes de un objeto de R2 (≤ 15 MB: cabe en memoria), o null. */
async function bytesDe(env, clave) {
  const o = await env.MEDIA.get(clave);
  return o ? new Uint8Array(await o.arrayBuffer()) : null;
}

/**
 * «Usar de la agencia»: COPIA una pista de la agencia a la biblioteca del cliente (con su nombre, etiquetas, BPM y el
 * estilo de Suno si lo traía), para ponerle su favorita y sus etiquetas. Si ya la tenía, la que había. → { pista, repetido }.
 */
export async function copiarDeAgencia(env, acceso, cliente, id) {
  if (!ID.test(String(id ?? ""))) throw new ErrorSonido("Falta qué pista de la agencia.", 400);
  const a = await acceso.leerUno("biblioteca_sonidos", { id: String(id) });
  if (!a) throw new ErrorSonido("Esa pista ya no está en la biblioteca de la agencia.", 404);
  if (a.huella) {
    const igual = (await acceso.leer("estudio_archivos", { client_id: cliente.id, huella: a.huella }, "created_at asc", 1))[0];
    if (igual) {
      if (igual.borrado_at) await acceso.actualizar("estudio_archivos", { id: igual.id, client_id: cliente.id }, { borrado_at: null, updated_at: ahora() });
      return { pista: pistaDeArchivo(igual), repetido: true };
    }
  }
  const bytes = await bytesDe(env, a.clave);
  if (!bytes) throw new ErrorSonido("El archivo de esa pista ya no está.", 404);
  const datos = leerJSON(a.datos, {});
  const clave = claveDeArchivo(cliente.id, a.nombre, a.mime);
  await env.MEDIA.put(clave, bytes, { httpMetadata: { contentType: a.mime } });
  const momento = ahora();
  const fila = await acceso.insertar("estudio_archivos", {
    id: uuid(), client_id: cliente.id, clave, tipo: "audio", mime: a.mime, ancho: 0, alto: 0, bytes: bytes.byteLength,
    prompt: a.nombre, modelo: modeloDeSonido(a.categoria, { deAgencia: true }),
    ajustes: JSON.stringify({
      biblioteca: { etiquetas: limpiarEtiquetas(leerJSON(a.etiquetas, [])), bpm: limpiarBpm(a.bpm), duracion: limpiarDuracionSonido(a.duracion) },
      deAgencia: a.id, ...(datos.estilo ? { pedido: { estilo: String(datos.estilo).slice(0, 600) } } : {}),
    }),
    trabajo_id: null, carpeta_id: null, origen: "subida", costo: 0, favorito: 0, subido: 1, usado_en: "[]",
    huella: a.huella || (await huellaDe(bytes)), borrado_at: null, created_at: momento, updated_at: momento,
  });
  return { pista: pistaDeArchivo(fila), repetido: false };
}

/**
 * «Pasar a la agencia»: COPIA una pista de un cliente (una música de Suno, una subida, un efecto) a la biblioteca de la
 * agencia, para usarla con TODOS los clientes sin volver a pagarla. Si ya estaba, la que había. → { pista, repetido }.
 */
export async function pasarALaAgencia(env, acceso, cliente, id, { usuario = null } = {}) {
  const f = await filaDelCliente(acceso, cliente.id, id);
  if (!f || f.borrado_at) throw new ErrorSonido("Esa pista no está en la biblioteca de este cliente.", 404);
  const bytes = await bytesDe(env, f.clave);
  if (!bytes) throw new ErrorSonido("El archivo de esa pista ya no está.", 404);
  const huella = f.huella || (await huellaDe(bytes));
  const igual = (await acceso.leer("biblioteca_sonidos", { huella }, "created_at asc", 1))[0];
  if (igual) return { pista: pistaDeAgencia(igual), repetido: true };
  const p = pistaDeArchivo(f);
  const mime = f.mime || "audio/mpeg";
  const clave = claveDeAgencia(acceso.ownerId, p.categoria, p.nombre, mime);
  await env.MEDIA.put(clave, bytes, { httpMetadata: { contentType: mime } });
  const momento = ahora();
  const fila = await acceso.insertar("biblioteca_sonidos", {
    id: uuid(), categoria: p.categoria, clave, mime, bytes: bytes.byteLength, nombre: p.nombre, etiquetas: JSON.stringify(p.etiquetas),
    bpm: p.bpm, duracion: p.duracion, favorita: 0, origen: "cliente", huella,
    datos: JSON.stringify({ deCliente: cliente.id, deArchivo: f.id, ...(p.estilo ? { estilo: p.estilo } : {}), ...(p.origen === "suno" ? { suno: true } : {}) }),
    creado_por: usuario?.id ?? null, created_at: momento, updated_at: momento,
  });
  return { pista: pistaDeAgencia(fila), repetido: false };
}

/**
 * Lo que guarda el sonido de un video de una pista: de la biblioteca del cliente o de la AGENCIA, de su categoría.
 * Una música del cliente sigue aceptando cualquier audio suyo (como antes de la biblioteca). → { archivoId, clave,
 * nombre, de? } o null si no es de ninguna de las dos.
 */
export async function sonidoParaVideo(acceso, clienteId, archivoId, categoria = "musica") {
  if (!ID.test(String(archivoId ?? ""))) return null;
  const f = await acceso.leerUno("estudio_archivos", { id: String(archivoId), client_id: clienteId });
  if (f) {
    if (f.tipo !== "audio" || f.borrado_at) return null;
    if (categoria === "efecto" && categoriaDeModelo(f.modelo) !== "efecto") return null;
    return { archivoId: f.id, clave: f.clave, nombre: limpiarNombreSonido(f.prompt) || nombrePorDefecto(categoria) };
  }
  const a = await acceso.leerUno("biblioteca_sonidos", { id: String(archivoId) });
  if (!a || a.categoria !== categoria) return null;
  return { archivoId: a.id, clave: a.clave, nombre: a.nombre || nombrePorDefecto(categoria), de: "agencia" };
}

/**
 * Las músicas de la biblioteca (del cliente y de la agencia) que encajan con lo que propone el director musical: lo que
 * se ofrece GRATIS antes de pagar a Suno. Nunca falla: sin biblioteca, nada. → [{ id, nombre, de, src, bpm, etiquetas,
 * motivo }].
 */
export async function lasQueEncajan(acceso, clienteId, propuesta, { max = 3 } = {}) {
  try {
    const lista = pistasQueEncajan(propuesta, await musicasDe(acceso, clienteId), { max });
    return lista.map(({ pista: p, motivo }) => ({
      id: p.id, nombre: p.nombre, de: p.de, src: p.src, categoria: "musica", origen: p.origen, bpm: p.bpm, etiquetas: p.etiquetas,
      duracion: p.duracion, favorita: p.favorita, motivo,
    }));
  } catch {
    return [];
  }
}
