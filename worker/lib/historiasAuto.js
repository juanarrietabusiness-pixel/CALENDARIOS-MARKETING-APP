// ============================================================
// Historias automáticas: una al día por cliente, de lo ya publicado
//
// El NAVEGADOR hace la imagen (la del post encajada en 9:16 con su frase:
// necesita un lienzo, y el Worker no lo tiene) y la sube; aquí se guarda
// como pieza. El CRON (`historiasAutomaticasPendiente`) escoge cada día la
// que toca —la menos usada y, a igualdad, la que mejor funcionó— y la mete en
// la cola de siempre como una historia SIN calendario: la cola no la relee de
// ningún mes, la publica tal cual. Sale sola; se quita en Programación como
// cualquier otra fila.
//
// Una consulta por vuelta si no hay nada que hacer, y como mucho siete si
// pone una en la cola: cabe con lo demás del cron.
// ============================================================

import { crearAcceso, clientesConHistoriasPendientes } from "./acceso.js";
import { difundir } from "./vivo.js";
import { uuid, ahora } from "./ids.js";
import { momentoPublicacion } from "../../src/lib/publicacion.js";
import {
  limpiarAjustes, proximaFecha, porPreparar, elegirPieza, publicacionDeRepost, fraseDe, DIAS_ATRAS,
} from "../../src/lib/historiasAuto.js";

export class ErrorHistorias extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const FIRMA = { userId: "sistema", nombre: "Historias automáticas", color: "#1E90FF" };
const NOMBRE_RED = { instagram: "Instagram", facebook: "Facebook" };

const leerJSON = (t, d) => { try { return JSON.parse(t); } catch { return d; } };

/** Lo que ve la agencia de un cliente: el interruptor, la hora, las redes y qué hay listo. */
export async function ajustesHistorias(acceso, clientId) {
  const f = await acceso.leerUno("historias_auto", { client_id: clientId });
  const piezas = await acceso.leerColumnas("historias_auto_piezas", ["id", "titulo", "clave", "usos", "usada_at", "publicada_at", "excluida"], { client_id: clientId }, "created_at desc");
  const ajustes = limpiarAjustes({ activa: f?.activa === 1, hora: f?.hora, redes: leerJSON(f?.redes, []) });
  const vista = (p) => ({ id: p.id, titulo: p.titulo, src: `/api/media/${p.clave}`, usos: p.usos ?? 0, usadaAt: p.usada_at ?? null });
  return {
    ...ajustes,
    ultimaFecha: f?.ultima_fecha ?? null,
    nota: f?.nota ?? "",
    proxima: ajustes.activa ? proximaFecha(ajustes.hora) : null,
    piezas: piezas.filter((p) => !p.excluida).map(vista),
    quitadas: piezas.filter((p) => p.excluida).map(vista),
  };
}

export async function guardarAjustesHistorias(acceso, clientId, cambios = {}) {
  const previa = await acceso.leerUno("historias_auto", { client_id: clientId });
  const antes = limpiarAjustes({ activa: previa?.activa === 1, hora: previa?.hora, redes: leerJSON(previa?.redes, []) });
  const nuevos = limpiarAjustes({
    activa: typeof cambios.activa === "boolean" ? cambios.activa : antes.activa,
    hora: cambios.hora ?? antes.hora,
    redes: Array.isArray(cambios.redes) ? cambios.redes : antes.redes,
  });
  await acceso.guardar("historias_auto", {
    id: previa?.id ?? uuid(), client_id: clientId, activa: nuevos.activa ? 1 : 0, hora: nuevos.hora,
    redes: JSON.stringify(nuevos.redes),
    // Cambiar la hora o encenderla vuelve a mirar el día: si la de hoy aún no salió, puede entrar.
    ultima_fecha: nuevos.hora !== antes.hora || (nuevos.activa && !antes.activa) ? null : previa?.ultima_fecha ?? null,
    nota: previa?.nota ?? "",
    created_at: previa?.created_at ?? ahora(), updated_at: ahora(),
  });
  return ajustesHistorias(acceso, clientId);
}

/**
 * Lo publicado que aún no tiene su historia hecha: el navegador la dibuja y
 * la sube. Las 80 últimas publicadas del cliente bastan (90 días a tres por día).
 */
export async function pendientesDePreparar(acceso, clientId, momento = new Date()) {
  const desde = new Date(momento.getTime() - DIAS_ATRAS * 86_400_000).toJSON();
  const filas = (await acceso.leer("publicaciones_programadas", { client_id: clientId, estado: "publicada", variante: "post" }, "publicada_at desc", 80))
    .filter((f) => !f.publicada_at || f.publicada_at >= desde);
  const piezas = await acceso.leerColumnas("historias_auto_piezas", ["clave_post"], { client_id: clientId });
  return porPreparar(filas, piezas, momento).map((p, i) => ({ ...p, frase: fraseDe(piezas.length + i) }));
}

/**
 * Guarda la historia hecha de una publicación. La imagen la sube el navegador:
 * tiene que ser de ESTE cliente y estar en R2, y la publicación tiene que
 * estar de verdad publicada (la clave la manda quien pide).
 */
export async function guardarPieza(env, acceso, clientId, { filaId, src, frase = "" } = {}) {
  const prefijo = `/api/media/clientes/${clientId}/`;
  if (typeof src !== "string" || !src.startsWith(prefijo) || src.includes("..")) throw new ErrorHistorias("La imagen no es de este cliente.");
  const clave = src.slice("/api/media/".length);
  if (!(await env.MEDIA.head(clave))) throw new ErrorHistorias("La imagen no se subió.", 404);
  const fila = filaId ? await acceso.leerUno("publicaciones_programadas", { id: String(filaId), client_id: clientId }) : null;
  if (!fila || fila.estado !== "publicada" || !fila.calendar_id) throw new ErrorHistorias("Esa publicación no está publicada.", 404);
  const post = leerJSON(fila.carga, {}).post ?? {};
  const clavePost = `${fila.calendar_id}|${fila.post_id}`;
  const previa = await acceso.leerUno("historias_auto_piezas", { client_id: clientId, clave_post: clavePost });
  const pieza = {
    id: previa?.id ?? uuid(), client_id: clientId, clave_post: clavePost, fila_id: fila.id,
    externo_id: fila.red === "instagram" ? fila.externo_id ?? "" : previa?.externo_id ?? "",
    clave, titulo: String(post.title || post.idea || "").slice(0, 140), frase: String(frase).slice(0, 60),
    publicada_at: fila.publicada_at ?? null, usos: previa?.usos ?? 0, usada_at: previa?.usada_at ?? null,
    excluida: previa?.excluida ? 1 : 0, created_at: previa?.created_at ?? ahora(),
  };
  await acceso.guardar("historias_auto_piezas", pieza);
  return pieza;
}

/**
 * «Que no salga» (`excluida`: true) o «Que vuelva a salir» (false). La fila NO se borra: si se borrara, la publicación
 * volvería a estar «sin historia hecha» y la aplicación la prepararía otra vez al abrirse.
 */
export async function excluirPieza(acceso, clientId, id, excluida = true) {
  return acceso.actualizar("historias_auto_piezas", { id: String(id), client_id: clientId }, { excluida: excluida ? 1 : 0 });
}

/**
 * La historia de un cliente para `fecha`, en la cola. Devuelve cuántas filas
 * puso (una por red con cuenta) y deja dicho en `nota` lo que pasó.
 */
export async function programarHistoriaDelDia(env, acceso, clientId, fecha, momento = new Date()) {
  const config = await acceso.leerUno("historias_auto", { client_id: clientId });
  if (!config) return 0;
  const ajustes = limpiarAjustes({ activa: config.activa === 1, hora: config.hora, redes: leerJSON(config.redes, []) });
  const cerrar = async (nota) => {
    await acceso.actualizar("historias_auto", { id: config.id }, { ultima_fecha: fecha, nota, updated_at: ahora() });
  };
  if (!ajustes.activa) return 0;

  const todas = await acceso.leer("historias_auto_piezas", { client_id: clientId });
  const piezas = todas.filter((p) => !p.excluida);
  if (!piezas.length) {
    await cerrar(todas.length ? "Todas las preparadas están apartadas con «Que no salga»."
      : "Aún no hay publicaciones preparadas: se preparan solas al abrir la aplicación.");
    return 0;
  }
  const medidas = await acceso.leerVarios("metricas_publicacion", ["externo_id", "interacciones"], "externo_id",
    piezas.map((p) => p.externo_id).filter(Boolean), { client_id: clientId });
  const pieza = elegirPieza(piezas, { interacciones: new Map(medidas.map((m) => [m.externo_id, m.interacciones])), momento });
  if (!pieza) {
    await cerrar("Ese día no salió ninguna: todo lo preparado salió hace poco o se acaba de publicar.");
    return 0;
  }

  const cuentas = (await acceso.leer("cuentas_sociales", { client_id: clientId })).filter((c) => ajustes.redes.includes(c.red) && c.token_cifrado);
  const meta = await acceso.leerUno("integracion_meta", { id: acceso.ownerId });
  const destinos = ajustes.redes.map((red) => cuentas.find((c) => c.red === red)).filter(Boolean);
  if (!meta || !destinos.length) {
    await cerrar(!meta ? "Meta no está conectado: conéctalo en Ajustes → Integraciones."
      : `El cliente no tiene cuenta de ${ajustes.redes.map((r) => NOMBRE_RED[r]).join(" ni ")} asignada.`);
    return 0;
  }

  const cuando = momentoPublicacion(fecha, ajustes.hora);
  const post = publicacionDeRepost(pieza, fecha);
  const filas = destinos.map((c) => ({
    id: uuid(), client_id: clientId, calendar_id: null, post_id: `${post.id}-${fecha}`, red: c.red, variante: "historia",
    cuenta_id: c.id, programada_para: cuando, estado: "programada", intentos: 0, siguiente_intento: null,
    carga: JSON.stringify({ post: { ...post, publishTime: ajustes.hora } }), creado_por: null,
    created_at: ahora(), updated_at: ahora(),
  }));
  await acceso.guardarVarios("publicaciones_programadas", filas);
  await acceso.actualizar("historias_auto_piezas", { id: pieza.id }, { usos: (pieza.usos ?? 0) + 1, usada_at: cuando });
  await cerrar(`${fecha}: «${pieza.titulo || "Publicación"}» en ${destinos.map((c) => NOMBRE_RED[c.red]).join(" y ")}.`);
  for (const f of filas) {
    difundir(env, acceso.ownerId, { tipo: "publicacion", calId: null, postId: f.post_id, red: f.red, variante: "historia", estado: "programada", por: FIRMA });
  }
  return filas.length;
}

/**
 * Del cron: el primer cliente con historias encendidas al que le falta poner
 * la de su próximo día. Uno por vuelta. Devuelve 1 si hizo algo.
 */
export async function historiasAutomaticasPendiente(env, momento = new Date()) {
  // Con la hora 00:00 la próxima fecha es siempre mañana: lo que ya tiene puesta la de mañana no se lee.
  const candidatos = await clientesConHistoriasPendientes(env.DB, proximaFecha("00:00", momento), 50);
  for (const c of candidatos) {
    const fecha = proximaFecha(c.hora, momento);
    if (c.ultima_fecha && c.ultima_fecha >= fecha) continue;
    const acceso = crearAcceso(env.DB, c.owner_id);
    try {
      await programarHistoriaDelDia(env, acceso, c.client_id, fecha, momento);
    } catch (e) {
      console.error("historias automáticas:", c.client_id, e?.message);
      await acceso.actualizar("historias_auto", { client_id: c.client_id }, { ultima_fecha: fecha, nota: `No se pudo programar: ${e?.message ?? e}`, updated_at: ahora() }).catch(() => {});
    }
    return 1;
  }
  return 0;
}
