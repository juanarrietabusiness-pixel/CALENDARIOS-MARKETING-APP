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
import { ErrorMotor, aBase64 } from "./gemini.js";
import { abrirDescarga, guardarDescarga, TOPE_VIDEO, TOPE_IMAGEN } from "./descarga.js";
import { claveDeArchivo, claveDelCliente, medidasDe, medidasDeVideo, tipoPorBytes } from "./archivos.js";
import { crearAcceso, estudioPendiente } from "../acceso.js";
import {
  modeloPorId, MODELOS_RETIRADOS, retirado, validarPedido, pideConfirmar, textoCosto, estaVivo, MEDIDAS, proporcionDe, estimar, enCola,
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

  // Lo que el motor no admite se dice AHORA, no a mitad del trabajo.
  const motivo = motor.validar?.(modelo, v.pedido);
  if (motivo) throw new ErrorEstudio(motivo, 400);

  // Los medios (referencias, imagen inicial y final) son del MISMO cliente y existen: el id llega del navegador y no se cree.
  const guardados = {};
  for (const rol of ["reference", "start", "end", "video"]) {
    for (const valor of medios[rol] ?? []) {
      const clave = claveDelCliente(valor, cliente.id);
      if (!clave) throw new ErrorEstudio(rol === "video" ? "El video no es de este cliente." : "Una de las imágenes no es de este cliente.", 400);
      if (!(await env.MEDIA.head(clave))) throw new ErrorEstudio(rol === "video" ? "El video ya no existe." : "Una de las imágenes ya no existe.", 404);
      (guardados[rol] ??= []).push(clave);
    }
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
    prompt, n, ajustes: JSON.stringify(ajustes), medios: JSON.stringify(guardados),
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

const MAX_VIDEO_REFERENCIA = 50 * 1024 * 1024;

/**
 * Las imágenes que lleva un trabajo (referencias, inicial, final) y su video de referencia, de R2. Una que falta
 * corta el paso: seguir sin ella cambiaría lo que se pidió. Con `base64` cada imagen trae además su texto en base64
 * (lo piden Gemini y Omni).
 */
async function cargarMedios(env, fila, modelo, { base64 = false } = {}) {
  const guardados = leerJSON(fila.medios, {});
  const limite = { reference: modelo.referencias || 0, start: modelo.inicial || 0, end: modelo.final || 0, video: modelo.video || 0 };
  const salida = { reference: [], start: [], end: [], video: [] };
  for (const rol of Object.keys(salida)) {
    for (const clave of (guardados[rol] ?? []).slice(0, limite[rol])) {
      const obj = await env.MEDIA.get(clave);
      if (!obj) throw new ErrorMotor(rol === "video" ? "El video de referencia ya no existe." : "Una de las imágenes ya no existe.", 422);
      if (rol === "video") {
        // El video va tal cual al almacén del motor: sólo MP4 o WebM y con tope (el Worker lo tiene en memoria al subirlo).
        const mime = obj.httpMetadata?.contentType || "";
        if (!/^video\/(mp4|webm)$/.test(mime)) throw new ErrorMotor("El video de referencia tiene que ser MP4 o WebM.", 422);
        if (obj.size > MAX_VIDEO_REFERENCIA) throw new ErrorMotor("El video de referencia pesa más de 50 MB.", 422);
        salida.video.push({ mime, bytes: await obj.arrayBuffer() });
        continue;
      }
      const mime = obj.httpMetadata?.contentType || "image/jpeg";
      if (modelo.motor !== "prueba" && !TIPOS_REALES.includes(mime)) {
        throw new ErrorMotor("Una tarjeta de prueba o un archivo que no es PNG, JPEG o WebP no sirve de imagen para un motor real.", 422);
      }
      const bytes = await obj.arrayBuffer();
      salida[rol].push({ mime, bytes, ...(base64 ? { base64: aBase64(bytes) } : {}) });
    }
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

/** Cada cuánto se mira un video en cola si el motor no dice otra cosa. */
const CADA_POR_DEFECTO = 8_000;

/**
 * Cuánto falta (ms) para que valga la pena volver a mirar un trabajo de COLA, o 0 si ya toca (o no es de cola).
 * Mirar un video cada 200 ms no lo hace llegar antes y cuesta una petición al motor y tres escrituras a D1.
 * Pura.
 */
export function esperaDe(fila, ahoraMs = Date.now()) {
  const remoto = leerJSON(fila.remoto, []);
  if (!remoto.length || remoto.length < fila.n) return 0;
  const pendientes = remoto.filter((r) => !r.hecho && !r.perdido);
  if (!pendientes.length) return 0;
  const proximo = Math.min(...pendientes.map((r) => Date.parse(r.proximo) || 0));
  return Math.max(0, proximo - ahoraMs);
}

/**
 * Da un paso. Devuelve `{ trabajo, ocupado, espera? }`: `ocupado` es que otro tenía el permiso, y `espera` los
 * milisegundos que faltan para que valga la pena volver a mirar (un video en cola). En los dos casos, quien
 * llama debería esperar antes de insistir. `null` si el trabajo no existe (o no es de este espacio).
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

  // Un video que el motor aún está haciendo: no se mira antes de tiempo.
  const espera = esperaDe(fila, t);
  if (espera > 0) return { trabajo: fila, ocupado: false, espera };

  // Reservar el paso: la condición es el valor que acabamos de leer.
  const permiso = new Date(t + RESERVA_MS).toISOString();
  const reservado = await acceso.actualizar("estudio_trabajos", { id, bloqueado_hasta: fila.bloqueado_hasta }, { bloqueado_hasta: permiso });
  if (reservado !== 1) return { trabajo: await acceso.leerUno("estudio_trabajos", { id }), ocupado: true };

  let cambios;
  try {
    cambios = await paso(env, acceso, fila);
  } catch (e) {
    console.error("estudio: paso inesperado", id, e);
    cambios = { intentos: fila.intentos + 1, nota: "Algo falló; se reintenta." };
    if (fila.intentos + 1 > MAX_INTENTOS) cambios = cerrada("fallido", { error: "Algo falló al crear el archivo. Inténtalo de nuevo." });
  }
  await soltar(acceso, fila, permiso, cambios);
  const actual = await acceso.leerUno("estudio_trabajos", { id });
  if (actual) anunciar(env, acceso, actual, por);
  return { trabajo: actual, ocupado: false, espera: actual && estaVivo(actual.estado) ? esperaDe(actual) : 0 };
}

/** El paso en sí. Devuelve los cambios que hay que escribir en el trabajo. */
async function paso(env, acceso, fila) {
  const modelo = modeloPorId(fila.modelo);
  const motor = modelo ? MOTORES[modelo.motor] : null;
  if (!modelo || !motor) return cerrada("fallido", { error: MODELOS_RETIRADOS[fila.modelo] ? retirado(fila.modelo) : "Ese modelo ya no está en el Estudio." });
  if (!motor.activo(env)) {
    return cerrada("fallido", { error: `${modelo.nombre} necesita la llave ${motor.llave}, que este servidor no tiene.` });
  }

  const hechos = leerJSON(fila.archivos, []);
  if (hechos.length >= fila.n) return cerrada("hecho", { nota: "" });

  // Con parte ya entregada, parar por presupuesto no es un fallo: cuesta lo entregado y se dice.
  const termina = (motivo) => (hechos.length
    ? cerrada("hecho", { nota: `Llegaron ${hechos.length} de ${fila.n}: ${motivo}` })
    : cerrada("fallido", { error: motivo }));
  // Un fallo del motor: pasajero, se reintenta unas veces; si no, se termina con el motivo.
  const falloDelMotor = (e) => (e.reintentable && fila.intentos < MAX_INTENTOS
    ? { intentos: fila.intentos + 1, nota: `${e.message} Se reintenta.`, estado: hechos.length ? "en_marcha" : fila.estado }
    : termina(e.message));

  if (enCola(modelo)) return pasoDeCola(env, acceso, fila, { modelo, motor, hechos, termina, falloDelMotor });

  if (modelo.costo > 0) {
    const bloqueo = await bloqueoPorPresupuesto(acceso);
    if (bloqueo) return termina(bloqueo);
  }

  let salida;
  try {
    const medios = await cargarMedios(env, fila, modelo);
    salida = await motor.generar(env, {
      modelo, prompt: fila.prompt, ajustes: leerJSON(fila.ajustes, {}), referencias: medios.reference, medios, indice: hechos.length, total: fila.n,
    });
  } catch (e) {
    if (!(e instanceof ErrorMotor)) throw e;
    return falloDelMotor(e);
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
  const archivoId = await guardarArchivo(acceso, fila, modelo, {
    clave, mime, tipo: "imagen", ancho: medidas.ancho || aw, alto: medidas.alto || ah, bytes: salida.bytes.byteLength, costo: salida.costo ?? 0,
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

/** Apunta un archivo terminado en la galería y su gasto. Devuelve el id del archivo. */
async function guardarArchivo(acceso, fila, modelo, { clave, mime, tipo, ancho, alto, bytes, costo }) {
  const id = uuid();
  const ahora = new Date().toISOString();
  await acceso.insertar("estudio_archivos", {
    id, client_id: fila.client_id, clave, tipo, mime, ancho, alto, bytes,
    prompt: fila.prompt, modelo: modelo.id, ajustes: fila.ajustes, trabajo_id: fila.id, carpeta_id: fila.carpeta_id,
    origen: "estudio", costo, favorito: 0, subido: 0, usado_en: "[]", borrado_at: null,
    created_at: ahora, updated_at: ahora,
  });
  await registrarConsumoFijo(acceso, {
    proveedor: modelo.motor, funcion: tipo === "video" ? "estudio-video" : "estudio-imagen", modelo: modelo.gid ?? modelo.id,
    costo, clienteId: fila.client_id,
  });
  return id;
}

/** Las medidas de una imagen que ya está en R2: de sus primeros bytes; si no se leen, las de la proporción pedida. */
async function medidasDeImagenGuardada(env, clave, mime, ajustes) {
  const [ancho, alto] = MEDIDAS[proporcionDe(ajustes)];
  try {
    const obj = await env.MEDIA.get(clave, { range: { offset: 0, length: 65_536 } });
    if (obj) {
      const m = medidasDe(new Uint8Array(await obj.arrayBuffer()), mime);
      if (m?.ancho > 0 && m?.alto > 0) return m;
    }
  } catch { /* sin medidas: las de la proporción pedida */ }
  return { ancho, alto };
}

/**
 * Un paso de un trabajo de COLA (un video, o una imagen de un motor que sólo contesta así): primero se ENVÍA cada
 * pedido al motor, uno por paso, y después se MIRA cómo va el primero que falta hasta que está listo y se baja a R2.
 *
 * Enviar es lo único que no se repite —dos envíos son dos videos cobrados—, así que el id que devuelve el motor
 * se guarda ANTES que nada y no espera a que el paso se suelte: si el Worker muere entre una cosa y la otra, ese
 * video se pagaría y no habría cómo encontrarlo. Cada video cuesta lo que dura, y se apunta al ENTREGARLO:
 * un video que falla no se cobra.
 */
async function pasoDeCola(env, acceso, fila, { modelo, motor, hechos, termina, falloDelMotor }) {
  const ajustes = leerJSON(fila.ajustes, {});
  const remoto = leerJSON(fila.remoto, []);
  const ahoraMs = Date.now();
  const en = (ms) => new Date(ahoraMs + ms).toISOString();
  const escribirRemoto = () => JSON.stringify(remoto);
  const esVideo = modelo.tipo === "video";
  const cosa = esVideo ? "video" : "imagen";

  // ---- 1. Enviar lo que falta.
  if (remoto.length < fila.n) {
    // Sin presupuesto no se envía más; lo ya enviado se espera y se entrega.
    const detener = (motivo) => (remoto.length
      ? { n: remoto.length, nota: `Se envían ${remoto.length} de ${fila.n}: ${motivo}`, estado: "en_marcha" }
      : termina(motivo));
    if (modelo.costo > 0) {
      const bloqueo = await bloqueoPorPresupuesto(acceso);
      if (bloqueo) return detener(bloqueo);
    }
    let enviado;
    try {
      const medios = await cargarMedios(env, fila, modelo, { base64: true });
      enviado = await motor.enviar(env, { modelo, prompt: fila.prompt, ajustes, medios });
    } catch (e) {
      if (!(e instanceof ErrorMotor)) throw e;
      return remoto.length && !(e.reintentable && fila.intentos < MAX_INTENTOS) ? detener(e.message) : falloDelMotor(e);
    }
    // `datos` son las direcciones de seguimiento del motor (fal, Higgsfield): se guardan tal cual y vuelven en `item.datos`.
    remoto.push({
      id: enviado.id, ...(enviado.datos ? { datos: enviado.datos } : {}),
      enviado: new Date(ahoraMs).toISOString(), proximo: en(enviado.cada ?? CADA_POR_DEFECTO), sondeos: 0, hecho: false,
    });
    await acceso.actualizar("estudio_trabajos", { id: fila.id }, { remoto: escribirRemoto() });
    return {
      remoto: escribirRemoto(), estado: "en_marcha", intentos: 0, error: "",
      nota: fila.n > 1 ? `Enviado ${remoto.length} de ${fila.n}` : `Enviado: ${esVideo ? "el video tarda unos minutos" : "la imagen tarda un momento"}.`,
    };
  }

  // ---- 2. Mirar cómo va el primero que falta.
  const i = remoto.findIndex((r) => !r.hecho && !r.perdido);
  if (i < 0) {
    return hechos.length
      ? cerrada("hecho", { nota: hechos.length < fila.n ? `Llegaron ${hechos.length} de ${fila.n}.` : "" })
      : cerrada("fallido", { error: remoto.map((r) => r.error).find(Boolean) || `No llegó ninguna ${cosa}.`.replace("ninguna video", "ningún video") });
  }
  const r = remoto[i];
  // Un video perdido no tumba a los demás: se apunta y se sigue con el resto.
  const perder = (motivo) => {
    r.perdido = true;
    r.error = motivo;
    const quedan = remoto.some((x) => !x.hecho && !x.perdido);
    if (quedan) return { remoto: escribirRemoto(), nota: `${esVideo ? "Un video" : "Una imagen"} no salió: ${motivo}`, intentos: 0 };
    return hechos.length
      ? { remoto: escribirRemoto(), ...cerrada("hecho", { nota: `Llegaron ${hechos.length} de ${fila.n}: ${motivo}` }) }
      : { remoto: escribirRemoto(), ...cerrada("fallido", { error: motivo }) };
  };

  let listo;
  try {
    listo = await motor.sondear(env, { modelo, item: r, prompt: fila.prompt, ajustes, medios: {} });
  } catch (e) {
    if (!(e instanceof ErrorMotor)) throw e;
    return e.reintentable && fila.intentos < MAX_INTENTOS ? falloDelMotor(e) : perder(e.message);
  }
  r.sondeos = (r.sondeos ?? 0) + 1;
  if (listo.estado === "pendiente") {
    r.proximo = en(listo.cada ?? CADA_POR_DEFECTO);
    return { remoto: escribirRemoto(), nota: listo.nota ?? "Generando…", intentos: 0 };
  }
  if (listo.estado === "fallido") return perder(listo.error || `${modelo.nombre} no pudo hacer ${esVideo ? "el video" : "la imagen"}.`);

  // Listo: se baja a R2 por flujo, sin cargarlo en memoria.
  const mimeVideo = listo.bytes && motor === MOTORES.prueba ? "image/svg+xml" : null;
  const clave = claveDeArchivo(fila.client_id, fila.prompt, mimeVideo ?? (listo.mime || "video/mp4"));
  let guardado;
  try {
    if (mimeVideo) {
      await env.MEDIA.put(clave, listo.bytes, { httpMetadata: { contentType: mimeVideo } });
      guardado = { bytes: listo.bytes.byteLength, mime: mimeVideo };
    } else {
      const descarga = await abrirDescarga(listo.url, {
        headers: listo.headers, nombre: modelo.nombre,
        ...(esVideo ? { tope: TOPE_VIDEO, tipos: ["video/mp4", "video/webm"] } : { tope: TOPE_IMAGEN, tipos: TIPOS_REALES }),
      });
      // La extensión sale del tipo que se reconoció, no del que declaró el motor.
      const claveFinal = claveDeArchivo(fila.client_id, fila.prompt, descarga.mime);
      guardado = { ...(await guardarDescarga(env, claveFinal, descarga)), clave: claveFinal };
    }
  } catch (e) {
    if (!(e instanceof ErrorMotor)) throw e;
    return e.reintentable && fila.intentos < MAX_INTENTOS ? falloDelMotor(e) : perder(e.message);
  }

  const costo = estimar(modelo, 1, ajustes);
  const claveGuardada = guardado.clave ?? clave;
  const medidas = listo.ancho ? { ancho: listo.ancho, alto: listo.alto }
    : esVideo ? medidasDeVideo(ajustes)
      : await medidasDeImagenGuardada(env, claveGuardada, guardado.mime, ajustes);
  const archivoId = await guardarArchivo(acceso, fila, modelo, {
    clave: claveGuardada, mime: guardado.mime, tipo: esVideo ? "video" : "imagen", ancho: medidas.ancho, alto: medidas.alto, bytes: guardado.bytes, costo,
  });
  r.hecho = true;
  r.archivo = archivoId;
  const lista = [...hechos, archivoId];
  const completo = !remoto.some((x) => !x.hecho && !x.perdido);
  return {
    remoto: escribirRemoto(), archivos: JSON.stringify(lista), costo: (fila.costo ?? 0) + costo,
    estado: completo ? "hecho" : "en_marcha", intentos: 0, nota: completo && lista.length < fila.n ? `Llegaron ${lista.length} de ${fila.n}.` : "", error: "",
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
