// ============================================================
// Aprender de lo que pasa después de escribir
//
// Aquí vive lo que TOCA la base: guardar las señales, apuntar qué notas se
// usaron al escribir cada publicación, reforzar los pesos y dejar las notas
// automáticas con las palabras del cliente. Las cuentas —qué resultado
// tiene una respuesta, cómo se escribe una nota— son puras y viven en
// `senales.js`; el refuerzo, en `memoria.js`.
//
// TRES REGLAS DE LAS QUE DEPENDE QUE ESTO NO MIENTA
//
//   1. Una señal se REEMPLAZA, no se suma. Su `clave` es «tipo:publicación»:
//      si el cliente pide cambios y luego aprueba, la publicación cuenta
//      una vez, con lo último que dijo. Y `reinforce()` deshace lo que la
//      versión anterior hizo antes de aplicar la nueva.
//   2. Lo que una persona corrigió a mano MANDA. Una nota automática que
//      alguien editó (su `updated_at` ya no es el de su creación) no se
//      vuelve a escribir. Por eso se guardan SIN fechas —las pone la base,
//      iguales— y se actualizan sin tocarlas: `guardar` pone `updated_at` al
//      día y la haría pasar por editada.
//   3. Aprender NO puede tumbar una respuesta. Quien llama lo hace en
//      segundo plano y aquí un fallo se apunta, no se lanza hacia arriba.
// ============================================================

import { uuid } from "../ids.js";
import { reinforce, emptyMemory } from "./memoria.js";
import {
  slug, rutaUnica, derivados, MAX_NOTAS_POR_CLIENTE,
} from "./notas.js";
import { leerNotasLigeras, reindexar } from "./cerebro.js";
import {
  atenuar, senalDeRespuesta, notaDeRespuesta, fuenteDeRespuesta, resumenDePublicacion, claveDeSenal,
  puntuarPublicaciones, senalDeMetricas, textoDe, cambioElTexto, evaluarEdicion, senalDeCorreccion, MIN_CAMBIO, SALTO_MINIMO,
  MIN_MEDIDAS, DIAS_DE_MADURACION,
} from "./senales.js";

/** Cuántas notas automáticas se guardan por cliente: las más viejas sin tocar a mano se van. */
export const MAX_AUTOMATICAS = 60;
const MAX_APLICADAS = 400;
const MAX_ENLACES = 300;
const POR_LOTE = 40;

const parsear = (texto) => {
  try {
    const o = JSON.parse(texto);
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
};

// ------------------------------------------------------------
// Qué notas se usaron al escribir cada publicación
// ------------------------------------------------------------

/** Apunta que estas notas se le dieron a la IA para escribir estas publicaciones. La última vez gana. */
export async function registrarUsos(acceso, clientId, postIds, rutas) {
  const ids = [...new Set((postIds ?? []).map(String).filter((p) => p && p.length <= 200))].slice(0, 40);
  const lista = [...new Set(rutas ?? [])].slice(0, 30);
  if (!ids.length || !lista.length) return 0;
  const json = JSON.stringify(lista);
  await acceso.guardarVarios("cerebro_usos", ids.map((postId) => ({
    // El id sale del cliente y la publicación: volver a escribirla es reemplazar su fila, no añadir otra.
    id: `${clientId}:${postId}`, client_id: clientId, post_id: postId, rutas: json, updated_at: "",
  })));
  return ids.length;
}

/** Map publicación → notas que se usaron para escribirla. */
export async function usosDe(acceso, clientId, postIds) {
  if (!postIds.length) return new Map();
  const filas = await acceso.leerVarios("cerebro_usos", ["post_id", "rutas"], "post_id", postIds, { client_id: clientId });
  const lista = (texto) => {
    try { const r = JSON.parse(texto); return Array.isArray(r) ? r.map(String) : []; } catch { return []; }
  };
  return new Map(filas.map((f) => [f.post_id, lista(f.rutas)]));
}

// ------------------------------------------------------------
// Las señales
// ------------------------------------------------------------

/** Guarda señales, reemplazando la que ya hubiera con la misma clave. → cuántas eran nuevas. */
export async function guardarSenales(acceso, clientId, senales) {
  if (!senales.length) return { nuevas: 0, reemplazadas: 0 };
  const previas = await acceso.leerVarios("cerebro_senales", ["id", "clave"], "clave", senales.map((s) => s.clave), { client_id: clientId });
  const idDe = new Map(previas.map((p) => [p.clave, p.id]));
  const filas = senales.map((s) => ({
    id: idDe.get(s.clave) ?? uuid(), client_id: clientId, clave: s.clave, tipo: s.tipo, post_id: s.postId ?? "",
    resultado: s.resultado, resumen: s.resumen, detalle: JSON.stringify(s.detalle ?? {}), updated_at: "",
  }));
  for (let i = 0; i < filas.length; i += POR_LOTE) await acceso.guardarVarios("cerebro_senales", filas.slice(i, i + POR_LOTE));
  return { nuevas: senales.length - previas.length, reemplazadas: previas.length };
}

/** Las señales más recientes de un cliente, para enseñarlas o dárselas a la IA. */
export async function leerSenales(acceso, clientId, { tipo = null, limite = 200 } = {}) {
  const filas = await acceso.leerColumnas(
    "cerebro_senales", ["id", "clave", "tipo", "post_id", "resultado", "resumen", "detalle", "updated_at"],
    tipo ? { client_id: clientId, tipo } : { client_id: clientId }, "updated_at desc",
  );
  return filas.slice(0, limite).map((f) => ({ ...f, detalle: parsear(f.detalle) }));
}

// ------------------------------------------------------------
// Los pesos
// ------------------------------------------------------------

async function leerMemoria(acceso, clientId) {
  const [fila] = await acceso.leerColumnas("cerebro_memoria", ["id", "pesos", "aplicadas"], { client_id: clientId });
  const mem = emptyMemory();
  if (fila) {
    const p = parsear(fila.pesos);
    mem.notes = p.notes ?? {};
    mem.edges = p.edges ?? {};
    mem.applied = parsear(fila.aplicadas);
  }
  return { id: fila?.id ?? null, mem };
}

async function guardarMemoria(acceso, clientId, id, mem) {
  // Sólo se guardan los enlaces más fuertes y las señales más recientes: la memoria no puede crecer sin fin.
  const enlaces = Object.entries(mem.edges).sort((a, b) => b[1].w - a[1].w).slice(0, MAX_ENLACES);
  const aplicadas = Object.entries(mem.applied).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_APLICADAS);
  await acceso.guardar("cerebro_memoria", {
    id: id ?? uuid(), client_id: clientId,
    pesos: JSON.stringify({ notes: mem.notes, edges: Object.fromEntries(enlaces) }),
    aplicadas: JSON.stringify(Object.fromEntries(aplicadas)),
    updated_at: "",
  });
}

/**
 * Aplica señales a los pesos: las notas que se usaron para escribir esa publicación suben si salió bien y bajan si
 * salió mal. Una publicación de la que no se sabe qué notas usó (escrita antes de que esto existiera) no refuerza nada:
 * su señal sirve igual para proponer reglas, pero no para atribuirle nada a una nota. → cuántas reforzó.
 */
export async function reforzar(acceso, clientId, senales, ahora = Date.now()) {
  const conPost = senales.filter((s) => s.postId);
  if (!conPost.length) return 0;
  const usos = await usosDe(acceso, clientId, conPost.map((s) => s.postId));
  const utiles = conPost.filter((s) => (usos.get(s.postId) ?? []).length);
  if (!utiles.length) return 0;
  const { id, mem } = await leerMemoria(acceso, clientId);
  for (const s of utiles) {
    reinforce(mem, { id: s.clave, r: atenuar(s.resultado, s.tipo), cited: usos.get(s.postId) }, ahora);
  }
  await guardarMemoria(acceso, clientId, id, mem);
  return utiles.length;
}

// ------------------------------------------------------------
// Las notas con las palabras del cliente
// ------------------------------------------------------------

/**
 * Deja una nota «decisión» por publicación con lo que el cliente dijo. `items`: [{ postId, nota: { titulo, texto } }].
 * Reescribe la de una publicación que ya la tenía —salvo que alguien la corrigiera a mano— y, pasadas
 * `MAX_AUTOMATICAS`, quita las más viejas que nadie tocó. → { creadas, actualizadas, conservadas, quitadas }
 */
export async function guardarNotasAutomaticas(env, acceso, clientId, items) {
  const cuenta = { creadas: 0, actualizadas: 0, conservadas: 0, quitadas: 0 };
  if (!items.length) return cuenta;
  const todas = await leerNotasLigeras(acceso, clientId);
  const usadas = new Set(todas.map((n) => n.ruta));
  const automaticas = todas.filter((n) => n.origen === "app" && String(n.fuente).startsWith("respuesta:"));
  const porFuente = new Map(automaticas.map((n) => [n.fuente, n]));
  const filas = [];
  let total = todas.length;

  for (const { postId, nota } of items) {
    const fuente = fuenteDeRespuesta(postId);
    const previa = porFuente.get(fuente);
    const cuerpo = { titulo: nota.titulo, texto: nota.texto, ...derivados(nota.texto), tipo: "decision", origen: "app", fuente, fuente_sha: "", interna: 0 };
    if (previa) {
      // Alguien la corrigió: su versión gana. Se sabe porque `updated_at` ya no es el de su creación.
      if (previa.updated_at !== previa.created_at) { cuenta.conservadas++; continue; }
      filas.push({ id: previa.id, client_id: clientId, ruta: previa.ruta, ...cuerpo });
      cuenta.actualizadas++;
    } else {
      if (total >= MAX_NOTAS_POR_CLIENTE) continue;
      const ruta = rutaUnica(slug(nota.titulo), usadas);
      usadas.add(ruta);
      total++;
      filas.push({ id: uuid(), client_id: clientId, ruta, ...cuerpo });
      cuenta.creadas++;
    }
  }
  // Sin `created_at` ni `updated_at`: los pone la base, iguales, y así consta que nadie las ha tocado.
  for (let i = 0; i < filas.length; i += POR_LOTE) await acceso.guardarVarios("cerebro_notas", filas.slice(i, i + POR_LOTE));

  // Las más viejas sin tocar a mano se van cuando pasan del tope.
  const sobran = automaticas.length + cuenta.creadas - MAX_AUTOMATICAS;
  if (sobran > 0) {
    const viejas = automaticas
      .filter((n) => n.updated_at === n.created_at && !filas.some((f) => f.id === n.id))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
      .slice(0, sobran);
    if (viejas.length) { await acceso.borrarVarios("cerebro_notas", viejas.map((n) => n.id)); cuenta.quitadas = viejas.length; }
  }
  if (cuenta.creadas || cuenta.actualizadas || cuenta.quitadas) await reindexar(env, acceso, clientId);
  return cuenta;
}

// ------------------------------------------------------------
// Una respuesta del cliente
// ------------------------------------------------------------

/** Lo que el cliente escribió en la conversación de una publicación, del más viejo al más nuevo. */
async function comentariosDelCliente(acceso, calendarId, postId) {
  const filas = await acceso.leer("comentarios_aprobacion", { calendar_id: calendarId, post_id: postId, autor: "cliente" }, "created_at asc");
  return filas.map((f) => f.texto);
}

/**
 * El cliente respondió (o comentó) sobre una publicación: se guarda la señal, se refuerzan las notas que se usaron
 * al escribirla y, si dijo algo con sus palabras, queda su nota. Todo o nada de cada parte: si una falla, las
 * otras no se pierden. Nunca lanza.
 * `estado` es null cuando sólo comentó, sin responder: entonces no hay señal —no dijo ni sí ni no—, sólo nota.
 */
export async function registrarRespuesta(env, acceso, r) {
  const salida = { senal: false, reforzadas: 0, nota: null, error: null };
  try {
    const publicacion = r.publicacion ?? resumenDePublicacion(null);
    if (!r.soloNota && (r.estado === "aprobado" || r.estado === "cambios")) {
      const senal = senalDeRespuesta({
        postId: r.postId, publicacion, estado: r.estado, comentario: r.comentario, sugeridaDescripcion: r.sugeridaDescripcion,
        sugeridoGuion: r.sugeridoGuion, revisor: r.revisor, fecha: r.fecha ?? "",
      });
      await guardarSenales(acceso, r.clientId, [senal]);
      salida.senal = true;
      salida.reforzadas = await reforzar(acceso, r.clientId, [senal]);
    }
    const comentarios = await comentariosDelCliente(acceso, r.calendarId, r.postId);
    const nota = notaDeRespuesta({
      publicacion, estado: r.estado, comentario: r.comentario, sugeridaDescripcion: r.sugeridaDescripcion,
      sugeridoGuion: r.sugeridoGuion, revisor: r.revisor, comentarios,
    });
    if (nota) salida.nota = await guardarNotasAutomaticas(env, acceso, r.clientId, [{ postId: r.postId, nota }]);
  } catch (e) {
    console.error("cerebro: no se pudo aprender de la respuesta del cliente", e);
    salida.error = String(e?.message ?? e);
  }
  return salida;
}

/**
 * El cliente escribió en la conversación de una publicación. No es una respuesta nueva: la señal ya está (o no hay,
 * si nunca respondió). Sólo se pone al día la nota con lo que dijo, con la respuesta que ya tenía a la vista.
 */
export async function registrarComentario(env, acceso, r) {
  try {
    const [a] = await acceso.leer("approvals", { calendar_id: r.calendarId, post_id: r.postId });
    return await registrarRespuesta(env, acceso, {
      ...r, soloNota: true, estado: a?.estado ?? null, comentario: a?.comentario ?? "",
      sugeridaDescripcion: a?.suggested_descripcion ?? "", sugeridoGuion: a?.suggested_guion ?? "", revisor: a?.reviewer_name ?? r.revisor ?? "",
    });
  } catch (e) {
    console.error("cerebro: no se pudo aprender del comentario del cliente", e);
    return { senal: false, reforzadas: 0, nota: null, error: String(e?.message ?? e) };
  }
}

// ------------------------------------------------------------
// Lo que ya pasó: el historial de respuestas
// ------------------------------------------------------------

/** Cuántos calendarios se leen por llamada: cada uno trae sus publicaciones enteras, y una invocación no da para todos. */
const CALENDARIOS_POR_LLAMADA = 3;

/** Las publicaciones de unos días por su id, cada una con su día. */
function mapaDeDias(dias) {
  const mapa = new Map();
  for (const dia of Array.isArray(dias) ? dias : []) for (const post of dia?.posts ?? []) if (post?.id) mapa.set(post.id, { post, dia });
  return mapa;
}

/** Las publicaciones de un calendario (fila de D1, con `days` en texto) por su id, cada una con su día. */
function publicacionesDe(fila) {
  let dias = [];
  try { dias = JSON.parse(fila?.days || "[]"); } catch { dias = []; }
  return mapaDeDias(dias);
}

/**
 * Aprende de las respuestas que el cliente ya dio, de los calendarios más viejos a los más nuevos, de a
 * `CALENDARIOS_POR_LLAMADA` por vez (la pantalla vuelve a llamar con `siguiente` hasta que sea null).
 *
 * De cada publicación sólo se conserva la ÚLTIMA respuesta (`approvals` tiene una fila por publicación) y su
 * conversación: no hay forma de saber cuántas rondas de cambios hubo. Y no se sabe qué notas se usaron para
 * escribirla, así que esto NO mueve pesos: deja las señales —lo que lee la IA al proponer reglas— y las notas con
 * las palabras del cliente. Los pesos empiezan a aprender con lo que se escriba a partir de ahora.
 * Es idempotente: volver a pasarlo reemplaza, no duplica.
 */
export async function aprenderDelHistorial(env, acceso, cliente, { desde = 0 } = {}) {
  const calendarios = await acceso.leerColumnas("calendars", ["id"], { client_id: cliente.id }, "created_at asc");
  const inicio = Math.max(0, Math.floor(Number(desde)) || 0);
  const lote = calendarios.slice(inicio, inicio + CALENDARIOS_POR_LLAMADA);
  const senales = [];
  const notas = [];
  for (const { id } of lote) {
    const fila = await acceso.leerUno("calendars", { id });
    const publicaciones = publicacionesDe(fila);
    const respuestas = await acceso.leer("approvals", { calendar_id: id });
    const conversacion = await acceso.leer("comentarios_aprobacion", { calendar_id: id, autor: "cliente" }, "created_at asc");
    for (const a of respuestas) {
      const encontrada = publicaciones.get(a.post_id);
      if (!encontrada) continue; // la publicación ya no existe
      const publicacion = resumenDePublicacion(encontrada.post, encontrada.dia);
      const datos = {
        postId: a.post_id, publicacion, estado: a.estado, comentario: a.comentario, sugeridaDescripcion: a.suggested_descripcion ?? "",
        sugeridoGuion: a.suggested_guion ?? "", revisor: a.reviewer_name, fecha: String(a.updated_at ?? "").slice(0, 10),
      };
      senales.push(senalDeRespuesta(datos));
      const nota = notaDeRespuesta({ ...datos, comentarios: conversacion.filter((c) => c.post_id === a.post_id).map((c) => c.texto) });
      if (nota) notas.push({ postId: a.post_id, nota });
    }
  }
  const guardadas = await guardarSenales(acceso, cliente.id, senales);
  const cuenta = await guardarNotasAutomaticas(env, acceso, cliente.id, notas);
  const fin = inicio + lote.length;
  return {
    calendarios: lote.length, total: calendarios.length, siguiente: fin < calendarios.length ? fin : null,
    senales: senales.length, senalesNuevas: guardadas.nuevas, notas: cuenta,
  };
}

// ------------------------------------------------------------
// Lo que rindió en redes
// ------------------------------------------------------------

/** Cuántas señales de resultados se escriben por vez: las más recientes. Cada una es una fila y un refuerzo. */
const MAX_SENALES_DE_METRICAS = 80;

/**
 * Compara lo que rindió cada publicación con las demás de ese cliente y lo apunta como señal. A pedido —no en el
 * cron: las cifras de una publicación siguen subiendo unos días y esto gasta consultas—.
 *
 * Sólo cuentan las publicaciones que salieron DESDE la aplicación (`publicaciones_programadas` guarda el id que
 * les dio Meta): son las únicas de las que se sabe qué publicación del calendario fue, y por tanto qué notas
 * se usaron para escribirla. Las demás entran en la comparación —son parte de cómo rinde esa cuenta— pero no
 * dejan señal.
 * → { medidas, comparadas, madurando, pocas: { red: n }, sinPublicacion, senales, senalesNuevas, reforzadas, minimo, dias }
 *   (`minimo` y `dias` son lo que hace falta para comparar, para que la pantalla lo diga sin repetirlo)
 */
export async function aprenderDeLasMetricas(acceso, cliente, { ahora = Date.now() } = {}) {
  const filas = await acceso.leerColumnas(
    "metricas_publicacion", ["red", "tipo", "externo_id", "interacciones", "alcance", "texto", "enlace", "publicada_at"],
    { client_id: cliente.id }, "publicada_at desc",
  );
  const { puntuadas, madurando, pocas } = puntuarPublicaciones(filas, { ahora });
  const salida = {
    medidas: filas.length, comparadas: puntuadas.length, madurando, pocas, sinPublicacion: 0, senales: 0, senalesNuevas: 0, reforzadas: 0,
    minimo: MIN_MEDIDAS, dias: DIAS_DE_MADURACION,
  };
  if (!puntuadas.length) return salida;

  const salidas = await acceso.leerColumnas(
    "publicaciones_programadas", ["post_id", "externo_id", "red", "variante"], { client_id: cliente.id, estado: "publicada" },
  );
  const postDe = new Map(salidas.filter((f) => f.externo_id && f.variante !== "historia").map((f) => [`${f.red}:${f.externo_id}`, f.post_id]));

  const porPost = new Map(); // el orden de `puntuadas` es el de más reciente a más vieja
  for (const f of puntuadas) {
    const postId = postDe.get(`${f.red}:${f.externo_id}`);
    if (!postId) { salida.sinPublicacion++; continue; }
    porPost.set(postId, [...(porPost.get(postId) ?? []), f]);
  }
  const senales = [...porPost].slice(0, MAX_SENALES_DE_METRICAS).map(([postId, lista]) => senalDeMetricas(postId, lista));
  if (!senales.length) return salida;

  const guardadas = await guardarSenales(acceso, cliente.id, senales);
  salida.senales = senales.length;
  salida.senalesNuevas = guardadas.nuevas;
  salida.reforzadas = await reforzar(acceso, cliente.id, senales, ahora);
  return salida;
}

// ------------------------------------------------------------
// Lo que el equipo corrigió de lo que escribió la IA
// ------------------------------------------------------------

/** Cuántas publicaciones se miran por guardado: uno corriente toca una o dos. */
const MAX_CORRECCIONES_POR_GUARDADO = 6;

/**
 * Tras guardar un calendario: para cada publicación cuyo texto cambió y que se escribió con el cerebro
 * (`cerebro_usos`), apunta lo que la IA escribió la primera vez que llegó —la línea base— y, si el equipo lo ha
 * alejado de eso, deja la señal con cuánto. Reemplaza la anterior de esa publicación, y sólo cuando la corrección
 * cambió de verdad: los guardados llegan cada vez que la persona hace una pausa al teclear.
 *
 * `antes` y `despues` son los `days` del calendario antes y después de guardar. Nunca lanza: es un apunte.
 * → { evaluadas, bases, senales, reforzadas, error }
 */
export async function registrarCorrecciones(acceso, { antes, despues, clientId, usuario = {}, ahora = new Date() }) {
  const salida = { evaluadas: 0, bases: 0, senales: 0, reforzadas: 0, error: null };
  try {
    const previos = mapaDeDias(antes);
    const cambiadas = [];
    for (const [id, { post, dia }] of mapaDeDias(despues)) {
      const previo = previos.get(id);
      if (!previo) continue;
      const a = textoDe(previo.post);
      const d = textoDe(post);
      if (cambioElTexto(a, d)) cambiadas.push({ id, a, d, post, dia });
      if (cambiadas.length >= MAX_CORRECCIONES_POR_GUARDADO) break;
    }
    if (!cambiadas.length) return salida;

    const usos = await acceso.leerVarios("cerebro_usos", ["id", "post_id", "texto", "updated_at"], "post_id", cambiadas.map((c) => c.id), { client_id: clientId });
    if (!usos.length) return salida; // ninguna se escribió con el cerebro: no hay línea base que tener
    const usoDe = new Map(usos.map((u) => [u.post_id, u]));
    const claves = cambiadas.filter((c) => usoDe.has(c.id)).map((c) => claveDeSenal("correccion", c.id));
    const previas = await acceso.leerVarios("cerebro_senales", ["clave", "detalle"], "clave", claves, { client_id: clientId });
    const previaDe = new Map(previas.map((p) => [p.clave, parsear(p.detalle)]));

    const iso = ahora.toJSON();
    const bases = [];
    const senales = [];
    for (const c of cambiadas) {
      const uso = usoDe.get(c.id);
      if (!uso) continue;
      salida.evaluadas++;
      const ev = evaluarEdicion(parsear(uso.texto), c.a, c.d, { pedidoAt: String(uso.updated_at ?? ""), ahora: iso });
      // Sin `updated_at`: fecharla al día la haría pasar por «se le pidió texto a la IA otra vez».
      if (ev.fijada) bases.push({ id: uso.id, client_id: clientId, post_id: c.id, texto: JSON.stringify(ev.base) });
      const k = ev.correccion;
      if (!k) continue;
      const previa = previaDe.get(claveDeSenal("correccion", c.id));
      if (!previa && k.intensidad < MIN_CAMBIO) continue; // un retoque no enseña nada
      if (previa && Math.abs(Number(previa.intensidad ?? 0) - k.intensidad) < SALTO_MINIMO) continue; // nada nuevo que decir
      senales.push(senalDeCorreccion({ postId: c.id, publicacion: resumenDePublicacion(c.post, c.dia), ...k, quien: usuario.nombre, fecha: iso.slice(0, 10) }));
    }
    if (bases.length) { await acceso.guardarVarios("cerebro_usos", bases); salida.bases = bases.length; }
    if (senales.length) {
      await guardarSenales(acceso, clientId, senales);
      salida.senales = senales.length;
      salida.reforzadas = await reforzar(acceso, clientId, senales, ahora.getTime());
    }
  } catch (e) {
    console.error("cerebro: no se pudo aprender de lo que corrigió el equipo", e);
    salida.error = String(e?.message ?? e);
  }
  return salida;
}
