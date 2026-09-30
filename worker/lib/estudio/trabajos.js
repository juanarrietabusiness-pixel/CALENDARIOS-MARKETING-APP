// ============================================================
// Los trabajos del Estudio: pedir, avanzar por pasos, cancelar, reintentar
//
// Un trabajo es una fila con su estado. `avanzarTrabajo()` da UN paso
// acotado —una imagen— y guarda su avance; el mismo principio que la cola
// de Instagram: cada paso guarda lo hecho y el siguiente sigue. Nadie
// espera dentro del Worker.
//
// QUIÉN AVANZA. El navegador, mientras se mira la pantalla (POST …/avanzar
// en cuanto termina el paso anterior), y el cron (`avanzarPendientes`,
// último paso de la vuelta de cada minuto) para lo que nadie mira. Los dos
// llaman a la MISMA función.
//
// UN PASO A LA VEZ. Dos que avancen el mismo trabajo generarían la imagen
// dos veces y la cobrarían dos veces. El permiso es `bloqueado_hasta`: se
// reserva con el valor que se leyó como CONDICIÓN del UPDATE (el que llega
// segundo no cambia ninguna fila) y se suelta al terminar. Si el Worker
// muere a medias, caduca solo.
//
// IDEMPOTENCIA. El archivo se guarda en R2 y en la galería ANTES de tocar
// el trabajo, y el trabajo apunta su id; un paso repetido después de un
// fallo a medias ve el archivo apuntado y no cuenta dos veces lo mismo.
//
// LO QUE NO PUEDE PASAR. Un trabajo que se pierde no se queda «en marcha»
// para siempre: tiene plazo, y termina en `fallido` con el motivo escrito
// en palabras, que es lo que la pantalla enseña.
// ============================================================

import { uuid } from "../ids.js";
import { difundir } from "../vivo.js";
import { bloqueoPorPresupuesto, registrarConsumoFijo } from "../configIA.js";
import { MOTORES } from "./motores.js";
import { ErrorMotor } from "./gemini.js";
import { claveDeArchivo, claveDelCliente, medidasDe, tipoPorBytes } from "./archivos.js";
import { crearAcceso, estudioPendiente } from "../acceso.js";
import {
  modeloPorId, validarPedido, pideConfirmar, textoCosto, estaVivo, MEDIDAS, proporcionDe,
} from "../../../src/lib/estudioCatalogo.js";

/** Cuánto vale un permiso de paso: lo que tarda Gemini en darse por vencido, más margen. */
export const RESERVA_MS = 150_000;
/** Un trabajo que lleva más que esto vivo se da por perdido. */
export const PLAZO_TRABAJO_MS = 30 * 60_000;
/** Veces que se reintenta solo un fallo pasajero (saturación, red, tiempo). */
export const MAX_INTENTOS = 2;

const TIPOS_REALES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);

/** Un fallo de una petición, con el código HTTP con el que contestar. */
export class ErrorEstudio extends Error {
  constructor(mensaje, estado = 400, extra = {}) {
    super(mensaje);
    this.name = "ErrorEstudio";
    this.estado = estado;
    Object.assign(this, extra);
  }
}

const leerJSON = (texto, defecto) => {
  try { const v = JSON.parse(texto); return v ?? defecto; } catch { return defecto; }
};

/** Un trabajo como lo ve el navegador: sin dueño ni ids del motor. */
export function trabajoPublico(f) {
  if (!f) return null;
  return {
    id: f.id, clientId: f.client_id, estado: f.estado, tipo: f.tipo, motor: f.motor, modelo: f.modelo,
    prompt: f.prompt, n: f.n, ajustes: leerJSON(f.ajustes, {}), medios: leerJSON(f.medios, {}),
    archivos: leerJSON(f.archivos, []), nota: f.nota, error: f.error, costoEstimado: f.costo_estimado, costo: f.costo,
    origen: f.origen, creadoPor: f.creado_por, calendarId: f.calendar_id, postId: f.post_id, carpetaId: f.carpeta_id,
    creado: f.created_at, actualizado: f.updated_at, terminado: f.terminado_at,
  };
}

/** Lo que se dice por el socket: lo mínimo, la pantalla relee lo demás. */
function anunciar(env, acceso, fila, por) {
  difundir(env, acceso.ownerId, {
    tipo: "estudio", clientId: fila.client_id, trabajoId: fila.id, estado: fila.estado,
    por: por ?? { userId: "sistema", nombre: "Estudio", color: "", tab: null },
  });
}

// ------------------------------------------------------------
// Pedir
// ------------------------------------------------------------

/**
 * Crea un trabajo. No genera nada: eso lo hace el primer `avanzar`. Todo lo
 * que puede rechazarse se rechaza AQUÍ, antes de gastar: el modelo, la
 * llave, las referencias, la confirmación de un costo alto y el presupuesto.
 */
export async function crearTrabajo(env, acceso, cliente, datos, { usuario = null, origen = "persona", por = null } = {}) {
  const v = validarPedido(datos);
  if (!v.ok) throw new ErrorEstudio(v.error, 400);
  const { modelo, prompt, n, ajustes, medios, costoEstimado } = v.pedido;

  const motor = MOTORES[modelo.motor];
  if (!motor?.activo(env)) {
    throw new ErrorEstudio(
      `${modelo.nombre} necesita la llave ${motor?.llave ?? "del motor"}, que este servidor no tiene. El administrador la pone como secreto del Worker.`,
      503, { codigo: "sin_llave" },
    );
  }

  // Las referencias son del MISMO cliente y existen: el id llega del navegador y no se cree.
  const referencias = [];
  for (const valor of medios.reference ?? []) {
    const clave = claveDelCliente(valor, cliente.id);
    if (!clave) throw new ErrorEstudio("Una de las imágenes de referencia no es de este cliente.", 400);
    if (!(await env.MEDIA.head(clave))) throw new ErrorEstudio("Una de las imágenes de referencia ya no existe.", 404);
    referencias.push(clave);
  }

  if (pideConfirmar(costoEstimado) && !datos.confirmado) {
    throw new ErrorEstudio(
      `Este pedido cuesta ${textoCosto(costoEstimado)}. Confírmalo para seguir.`,
      409, { codigo: "confirmar", costo: costoEstimado },
    );
  }
  if (costoEstimado > 0) {
    const bloqueo = await bloqueoPorPresupuesto(acceso);
    if (bloqueo) throw new ErrorEstudio(bloqueo, 402, { codigo: "presupuesto" });
  }

  const ahora = new Date().toISOString();
  const fila = await acceso.insertar("estudio_trabajos", {
    id: uuid(), client_id: cliente.id, estado: "en_cola", tipo: modelo.tipo, motor: modelo.motor, modelo: modelo.id,
    prompt, n, ajustes: JSON.stringify(ajustes), medios: JSON.stringify(referencias.length ? { reference: referencias } : {}),
    remoto: "[]", archivos: "[]", nota: "", intentos: 0, bloqueado_hasta: "", costo_estimado: costoEstimado, costo: 0, error: "",
    origen, creado_por: usuario?.id ?? null,
    calendar_id: datos.calendarId ? String(datos.calendarId).slice(0, 80) : null,
    post_id: datos.postId ? String(datos.postId).slice(0, 80) : null,
    carpeta_id: datos.carpetaId ? String(datos.carpetaId).slice(0, 80) : null,
    created_at: ahora, updated_at: ahora, terminado_at: null,
  });
  anunciar(env, acceso, fila, por);
  return fila;
}

// ------------------------------------------------------------
// Avanzar
// ------------------------------------------------------------

/** Las imágenes de referencia, de R2. Una que falta corta el paso: seguir sin ella cambiaría lo que se pidió. */
async function cargarReferencias(env, fila, modelo) {
  const claves = (leerJSON(fila.medios, {}).reference ?? []).slice(0, modelo.referencias || 0);
  const salida = [];
  for (const clave of claves) {
    const obj = await env.MEDIA.get(clave);
    if (!obj) throw new ErrorMotor("Una de las imágenes de referencia ya no existe.", 422);
    const mime = obj.httpMetadata?.contentType || "image/jpeg";
    if (modelo.motor !== "prueba" && !TIPOS_REALES.includes(mime)) {
      throw new ErrorMotor("Una tarjeta de prueba o un archivo que no es PNG, JPEG o WebP no sirve de referencia para un motor real.", 422);
    }
    salida.push({ mime, bytes: await obj.arrayBuffer() });
  }
  return salida;
}

/**
 * Suelta el trabajo con lo que cambió. El UPDATE lleva como condición el
 * permiso que se reservó: si mientras tanto alguien lo canceló, no se pisa.
 * Devuelve true si se escribió.
 */
async function soltar(acceso, fila, permiso, cambios) {
  const n = await acceso.actualizar(
    "estudio_trabajos",
    { id: fila.id, bloqueado_hasta: permiso, estado: fila.estado },
    { ...cambios, bloqueado_hasta: "", updated_at: new Date().toISOString() },
  );
  return n === 1;
}

const cerrada = (estado, cambios) => ({ estado, terminado_at: new Date().toISOString(), ...cambios });

/**
 * Da un paso. Devuelve `{ trabajo, ocupado }`: `ocupado` es que otro tenía
 * el permiso, y quien llama debería mirar otra vez en unos segundos.
 * `null` si el trabajo no existe (o no es de este espacio).
 */
export async function avanzarTrabajo(env, acceso, id, { por = null } = {}) {
  const fila = await acceso.leerUno("estudio_trabajos", { id });
  if (!fila) return null;
  if (!estaVivo(fila.estado)) return { trabajo: fila, ocupado: false };

  const t = Date.now();
  if (fila.bloqueado_hasta && fila.bloqueado_hasta > new Date(t).toISOString()) return { trabajo: fila, ocupado: true };

  if (t - Date.parse(fila.created_at) > PLAZO_TRABAJO_MS) {
    const hechos = leerJSON(fila.archivos, []).length;
    await acceso.actualizar("estudio_trabajos", { id, estado: fila.estado }, {
      ...(hechos ? cerrada("hecho", { nota: `Llegaron ${hechos} de ${fila.n}: el resto no terminó a tiempo.` }) : cerrada("fallido", { error: "No terminó a tiempo. Vuelve a intentarlo." })),
      bloqueado_hasta: "", updated_at: new Date().toISOString(),
    });
    const cerradaFila = await acceso.leerUno("estudio_trabajos", { id });
    anunciar(env, acceso, cerradaFila, por);
    return { trabajo: cerradaFila, ocupado: false };
  }

  // Reservar el paso: la condición es el valor que acabamos de leer.
  const permiso = new Date(t + RESERVA_MS).toISOString();
  const reservado = await acceso.actualizar("estudio_trabajos", { id, bloqueado_hasta: fila.bloqueado_hasta }, { bloqueado_hasta: permiso });
  if (reservado !== 1) return { trabajo: await acceso.leerUno("estudio_trabajos", { id }), ocupado: true };

  let cambios;
  try {
    cambios = await paso(env, acceso, fila);
  } catch (e) {
    console.error("estudio: paso inesperado", id, e);
    cambios = { intentos: fila.intentos + 1, nota: "Algo falló al crear la imagen; se reintenta." };
    if (fila.intentos + 1 > MAX_INTENTOS) cambios = cerrada("fallido", { error: "Algo falló al crear la imagen. Inténtalo de nuevo." });
  }
  await soltar(acceso, fila, permiso, cambios);
  const actual = await acceso.leerUno("estudio_trabajos", { id });
  if (actual) anunciar(env, acceso, actual, por);
  return { trabajo: actual, ocupado: false };
}

/** El paso en sí: UNA imagen. Devuelve los cambios que hay que escribir en el trabajo. */
async function paso(env, acceso, fila) {
  const modelo = modeloPorId(fila.modelo);
  const motor = modelo ? MOTORES[modelo.motor] : null;
  if (!modelo || !motor) return cerrada("fallido", { error: "Ese modelo ya no está en el Estudio." });
  if (!motor.activo(env)) {
    return cerrada("fallido", { error: `${modelo.nombre} necesita la llave ${motor.llave}, que este servidor no tiene.` });
  }

  const hechos = leerJSON(fila.archivos, []);
  if (hechos.length >= fila.n) return cerrada("hecho", { nota: "" });

  // Con parte ya entregada, parar por presupuesto no es un fallo: cuesta lo entregado y se dice.
  const termina = (motivo) => (hechos.length
    ? cerrada("hecho", { nota: `Llegaron ${hechos.length} de ${fila.n}: ${motivo}` })
    : cerrada("fallido", { error: motivo }));

  if (modelo.costo > 0) {
    const bloqueo = await bloqueoPorPresupuesto(acceso);
    if (bloqueo) return termina(bloqueo);
  }

  let salida;
  try {
    const referencias = await cargarReferencias(env, fila, modelo);
    salida = await motor.generar(env, {
      modelo, prompt: fila.prompt, ajustes: leerJSON(fila.ajustes, {}), referencias, indice: hechos.length, total: fila.n,
    });
  } catch (e) {
    if (!(e instanceof ErrorMotor)) throw e;
    if (e.reintentable && fila.intentos < MAX_INTENTOS) {
      return { intentos: fila.intentos + 1, nota: `${e.message} Se reintenta.`, estado: hechos.length ? "en_marcha" : fila.estado };
    }
    return termina(e.message);
  }

  // Lo que se guarda se reconoce por sus primeros bytes, no por lo que diga el motor.
  const mime = motor === MOTORES.prueba ? "image/svg+xml" : tipoPorBytes(salida.bytes);
  if (!mime || !(mime === "image/svg+xml" || TIPOS_REALES.includes(mime))) {
    return termina("El motor devolvió algo que no es una imagen.");
  }

  const clave = claveDeArchivo(fila.client_id, fila.prompt, mime);
  await env.MEDIA.put(clave, salida.bytes, { httpMetadata: { contentType: mime } });
  const medidas = salida.ancho ? { ancho: salida.ancho, alto: salida.alto } : medidasDe(salida.bytes, mime);
  const [aw, ah] = MEDIDAS[proporcionDe(leerJSON(fila.ajustes, {}))];
  const archivoId = uuid();
  const ahora = new Date().toISOString();
  await acceso.insertar("estudio_archivos", {
    id: archivoId, client_id: fila.client_id, clave, tipo: "imagen", mime,
    ancho: medidas.ancho || aw, alto: medidas.alto || ah, bytes: salida.bytes.byteLength,
    prompt: fila.prompt, modelo: modelo.id, ajustes: fila.ajustes, trabajo_id: fila.id, carpeta_id: fila.carpeta_id,
    origen: "estudio", costo: salida.costo ?? 0, favorito: 0, subido: 0, usado_en: "[]", borrado_at: null,
    created_at: ahora, updated_at: ahora,
  });
  await registrarConsumoFijo(acceso, {
    proveedor: modelo.motor, funcion: "estudio-imagen", modelo: modelo.gid ?? modelo.id,
    costo: salida.costo ?? 0, clienteId: fila.client_id,
  });

  const lista = [...hechos, archivoId];
  const completo = lista.length >= fila.n;
  return {
    archivos: JSON.stringify(lista),
    costo: (fila.costo ?? 0) + (salida.costo ?? 0),
    estado: completo ? "hecho" : "en_marcha",
    intentos: 0, nota: "", error: "",
    ...(completo ? { terminado_at: new Date().toISOString() } : {}),
  };
}

// ------------------------------------------------------------
// Cancelar y reintentar
// ------------------------------------------------------------

/** Cancela lo que sigue vivo. Lo ya guardado se queda en la galería. */
export async function cancelarTrabajo(env, acceso, id, { por = null } = {}) {
  const fila = await acceso.leerUno("estudio_trabajos", { id });
  if (!fila) return null;
  if (!estaVivo(fila.estado)) return fila;
  await acceso.actualizar("estudio_trabajos", { id, estado: fila.estado }, {
    ...cerrada("cancelado", { nota: "Cancelado." }), bloqueado_hasta: "", updated_at: new Date().toISOString(),
  });
  const actual = await acceso.leerUno("estudio_trabajos", { id });
  anunciar(env, acceso, actual, por);
  return actual;
}

/** Vuelve a poner en cola un trabajo que falló o se canceló. Sigue desde lo ya hecho. */
export async function reintentarTrabajo(env, acceso, id, { por = null } = {}) {
  const fila = await acceso.leerUno("estudio_trabajos", { id });
  if (!fila) return null;
  if (!["fallido", "cancelado"].includes(fila.estado)) return fila;
  await acceso.actualizar("estudio_trabajos", { id, estado: fila.estado }, {
    estado: "en_cola", error: "", nota: "", intentos: 0, bloqueado_hasta: "", terminado_at: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  });
  const actual = await acceso.leerUno("estudio_trabajos", { id });
  anunciar(env, acceso, actual, por);
  return actual;
}

// ------------------------------------------------------------
// El cron
// ------------------------------------------------------------

/**
 * Avanza UN trabajo que nadie está mirando (el último paso de la vuelta de
 * cada minuto). «Nadie mirando»: sin tocar hace más de 15 s, que es más de lo
 * que tarda el navegador entre paso y paso. Devuelve cuántos avanzó.
 */
export async function avanzarPendientes(env, ahora = new Date()) {
  const [siguiente] = await estudioPendiente(env.DB, ahora.toISOString(), new Date(ahora.getTime() - 15_000).toISOString(), 1);
  if (!siguiente) return 0;
  const acceso = crearAcceso(env.DB, siguiente.owner_id);
  try {
    await avanzarTrabajo(env, acceso, siguiente.id);
  } catch (e) {
    console.error("cron estudio:", siguiente.id, e?.message);
  }
  return 1;
}
