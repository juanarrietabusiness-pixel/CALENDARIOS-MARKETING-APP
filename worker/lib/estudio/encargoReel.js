// ============================================================
// El REEL por planos como ENCARGO del servidor: sigue aunque se cierre la pantalla, y se retoma
//
// Antes lo orquestaba la pantalla (FlujoReel) con `await`: el storyboard, el video o los clips se pedían uno detrás de
// otro y, al cerrar la pestaña o bloquear el teléfono, la cadena se paraba a medias. Ahora la pantalla arma el reel
// (el guion por planos, el modelo, el estilo de la marca, los personajes, las fotos) y el SERVIDOR lo lleva, paso a paso,
// guardando el avance en `estudio_encargos` (tipo «reel»), como el carrusel:
//
//   1. FOTOGRAMAS, en orden: uno por plano (imagen 9:16) con el anterior y el primero de referencia (la continuidad),
//      con el MISMO pedido que a mano (`pedidoDeFotogramaReel`). Se usan los pasos de siempre del encargo: el trabajo,
//      la proporción (se recompone si no casa) y `finales` (lo que la pantalla corrigió a mano manda).
//   2. Con `revisar`, se para aquí: la persona mira el storyboard, corrige lo que quiera y CONTINÚA (`continuarReel`).
//   3. EL VIDEO: «uno» (un solo video con los fotogramas como storyboard) o «clips» (un clip limpio por fotograma,
//      todos a la vez). Por la cola de video de siempre (lo avanza la bomba).
//   4. EL MONTAJE (si se pidió, o con «Montarlo aquí» después): el proyecto de video animado con la voz, el texto, los
//      subtítulos, el logo y el llamado (montaje.js); en automático, además lo aprueba, pide la voz —que SIEMPRE se
//      confirma: sin `confirmadoVoz` se queda en «confirmar» con su costo— y lo renderiza.
//   5. Todo resultado se PONE SOLO en su publicación (`poner`): el video, y si están vacíos el caption, el guion y la
//      portada. Con montaje, el mp4 lo pone el render en el sitio del video crudo.
//
// NADA SE COBRA DOS VECES: cada paso caro reserva el encargo (`bloqueado_hasta`, encargos.js) y cada trabajo apunta su
// id antes que nada. Un encargo cerrado por plazo da por fallido lo que esperaba y no se queda colgado.
// ============================================================

import { crearTrabajo, ErrorEstudio } from "./trabajos.js";
import { marcarUso } from "./galeria.js";
import { cambiarPublicacion } from "./ponerEnPost.js";
import { crearMontaje, fuenteDelEncargo } from "./montaje.js";
import { aprobarProyecto, guardarProyecto, ErrorVideo } from "../videosProyectos.js";
import { pedirLocucion, ErrorVoz } from "./locucion.js";
import { pedirRender, renderAlDia } from "./render.js";
import { modeloPorId, estaVivo, textoCosto } from "../../../src/lib/estudioCatalogo.js";
import { pedidoDeFotogramaReel, pedidoDeVideo, pedidoDeClip } from "../../../src/lib/reelPedidos.js";
import { repartirTiempos, sinVozPropia, TOMAS_PLANO, esTomaFija } from "../../../src/lib/reel.js";
import { duracionDeClip, duracionesDe, haceDuracion } from "../../../src/lib/duracionesVideo.js";
import { conVideoEnPost, rellenarVacios } from "../../../src/lib/resultadoEnPost.js";
import { textoDelGuionReel, ajustarMontaje, fotosDeEscenas } from "../../../src/lib/montajeReel.js";
import { lineaDeTiempo } from "../../../src/lib/videoEscenas.js";
import { SALIDAS_REEL, FIN_MONTAJE, PLANOS_REEL_MAX } from "../../../src/lib/encargoReelPuro.js";

export { SALIDAS_REEL, FIN_MONTAJE };

const SISTEMA = { userId: "sistema", nombre: "Estudio", color: "", tab: null };
const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };
const texto = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const clave = (v) => String(v ?? "").slice(0, 300);
const terminado = (p) => p.fase === "hecho" || p.fase === "fallido";
const finalDe = (p) => (p?.fase === "hecho" ? (p.finales?.[0] ?? p.opciones?.[0]?.id ?? null) : null);

// ------------------------------------------------------------
// Crear: lo que llega de la pantalla (o de Claude), limpio
// ------------------------------------------------------------

/** El guion del reel (planos, voz, música, gancho, llamado), limpio y con los tiempos contiguos. → null si no hay planos. */
export function limpiarGuionReel(r = {}) {
  if (!r || typeof r !== "object") return null;
  const segundos = Math.max(4, Math.min(120, Math.round(Number(r.segundos)) || 10));
  const planos = (Array.isArray(r.planos) ? r.planos : []).slice(0, PLANOS_REEL_MAX).map((p) => ({
    desde: Number(p?.desde) || 0, escena: texto(p?.escena, 300), camara: texto(p?.camara, 160), dice: texto(p?.dice, 400), pantalla: texto(p?.pantalla, 80),
    // La toma del plano: «fija» se monta con su fotograma (sin clip que pagar); «movimiento», con su clip.
    ...(TOMAS_PLANO.includes(p?.toma) ? { toma: p.toma } : {}),
  })).filter((p) => p.escena);
  if (!planos.length) return null;
  return {
    titulo: texto(r.titulo, 120), hilo: texto(r.hilo, 300), planos: repartirTiempos(planos, segundos), segundos,
    musica: texto(r.musica, 300), locucion: texto(r.locucion, 1200), efectos: texto(r.efectos, 300), descripcion: String(r.descripcion ?? "").trim().slice(0, 1000),
    gancho: texto(r.gancho, 80), llamado: texto(r.llamado, 30),
    // La estructura de guion de la agencia que siguió la voz (la devolvió el guion): la recuerdan el montaje y el post.
    ...(/^[\w-]{1,80}$/.test(String(r.estructuraId ?? "")) ? { estructuraId: String(r.estructuraId), estructuraNombre: texto(r.estructuraNombre, 60) } : {}),
  };
}

function limpiarComunReel(c = {}) {
  const lista = (v, max) => (Array.isArray(v) ? v : []).slice(0, max);
  const persona = (p) => (p && typeof p === "object" && p.clave ? { clave: clave(p.clave), nota: texto(p.nota, 200) } : null);
  const ref = (r) => (r && typeof r === "object" && r.clave ? {
    clave: clave(r.clave), nota: texto(r.nota, 200), toma: lista(r.toma, 6).map((t) => texto(t, 20)).filter(Boolean),
  } : null);
  return {
    modelo: texto(c.modelo, 80), estilo: String(c.estilo ?? "").slice(0, 3000), lineaPersonajes: texto(c.lineaPersonajes, 600),
    personajes: lista(c.personajes, 4).map(persona).filter(Boolean), fotos: lista(c.fotos, 6).map(clave).filter(Boolean),
    referencias: lista(c.referencias, 3).map(ref).filter(Boolean),
  };
}

function limpiarVideo(v = {}) {
  const s = Math.round(Number(v?.segundosClip));
  return { modelo: texto(v?.modelo, 80), voz: texto(v?.voz, 40), segundosClip: s >= 2 && s <= 16 ? s : 0 };
}

/** Lo que pide el montaje: automático (aprobar, la voz y el render) o sólo crear el proyecto para revisarlo. */
export function limpiarMontaje(m) {
  if (!m || typeof m !== "object") return null;
  return {
    fase: "nuevo", automatico: m.automatico === true, confirmadoVoz: m.confirmadoVoz === true, conVoz: m.conVoz !== false,
    // Otra voz para ESTE montaje (un id de ElevenLabs); sin ella, la de la marca.
    ...(/^[\w-]{8,64}$/.test(String(m.vozId ?? "")) ? { vozId: String(m.vozId) } : {}),
  };
}

/**
 * De lo que manda la pantalla a los datos y los pasos del encargo (crearEncargo lo guarda). Lanza ErrorEstudio si no
 * se puede: sin planos, sin modelo de imagen, o una salida sin su modelo de video.
 */
export function prepararReel(cuerpo = {}) {
  const reel = limpiarGuionReel(cuerpo.reel);
  if (!reel) throw new ErrorEstudio("El reel no trae ningún plano.", 400);
  const comun = limpiarComunReel(cuerpo.comun);
  const mImagen = modeloPorId(comun.modelo);
  if (!mImagen || mImagen.tipo !== "imagen") throw new ErrorEstudio("Falta el modelo de los fotogramas.", 400);
  const salida = SALIDAS_REEL.includes(cuerpo.salida) ? cuerpo.salida : "fotogramas";
  const revisar = cuerpo.revisar === true || salida === "fotogramas";
  const video = limpiarVideo(cuerpo.video);
  if (salida !== "fotogramas") {
    const m = modeloPorId(video.modelo);
    if (!m || m.tipo !== "video") throw new ErrorEstudio("Falta el modelo del video.", 400);
    if (salida === "clips" && !m.inicial) throw new ErrorEstudio(`${m.nombre} no anima una imagen: escoge otro para los clips.`, 400);
    // Nunca un guion de 30 s con un modelo que hace 10: lo que pasa de lo que hace un modelo, por clips y montaje.
    if (salida === "uno" && !haceDuracion(m, reel.segundos)) throw new ErrorEstudio(`${m.nombre} no hace videos de ${reel.segundos} s: escoge otro o hazlo por clips y montaje.`, 400);
  }
  const montaje = salida === "fotogramas" ? null : limpiarMontaje(cuerpo.montaje);
  const postId = cuerpo.postId ? texto(cuerpo.postId, 80) : null;
  const datos = {
    reel, comun, salida, revisar,
    video: { ...video, fase: revisar ? "espera" : "nuevo" },
    montaje,
    calendarId: cuerpo.calendarId && postId ? texto(cuerpo.calendarId, 80) : null, postId,
    // Lo que sale se pone solo en la publicación (salvo que se diga que no).
    poner: Boolean(postId) && cuerpo.poner !== false,
  };
  const pasos = reel.planos.map((plano) => ({
    id: `f${plano.n}`, titulo: `Plano ${plano.n}`, plano, controlar: false, navegador: null,
    fase: "nuevo", trabajoId: "", opciones: [], error: "",
  }));
  return { datos, pasos };
}

// ------------------------------------------------------------
// Los pasos del reel
// ------------------------------------------------------------

/** Las fichas de la galería de los finales de esos pasos (para sus claves). → Map id → fila. */
async function filasDe(acceso, clienteId, ids) {
  const lista = [...new Set(ids.filter(Boolean))];
  if (!lista.length) return new Map();
  const filas = await acceso.leerVarios("estudio_archivos", ["id", "clave", "tipo", "mime", "ancho", "alto", "ajustes"], "id", lista, { client_id: clienteId });
  return new Map(filas.map((f) => [f.id, f]));
}

/** Pide UN fotograma, en orden: el anterior y el primero (sus finales: lo corregido a mano manda) de referencia. */
export async function iniciarFotograma(ctx, p) {
  const { env, acceso, cliente, datos, usuario, pasos } = ctx;
  const c = datos.comun;
  const modelo = modeloPorId(c.modelo);
  if (!modelo) { p.fase = "fallido"; p.error = "Ese modelo ya no está en el Estudio."; return null; }
  const i = pasos.indexOf(p);
  const anteriorId = pasos.slice(0, i).map(finalDe).filter(Boolean).at(-1) ?? null;
  const primeroId = i > 0 ? finalDe(pasos[0]) : null;
  const filas = await filasDe(acceso, cliente.id, [anteriorId, primeroId]);
  const anterior = anteriorId ? filas.get(anteriorId) ?? null : null;
  const primero = primeroId && primeroId !== anteriorId ? filas.get(primeroId) ?? null : null;
  const pedido = pedidoDeFotogramaReel({
    modelo, plano: p.plano, total: pasos.length, hilo: datos.reel.hilo, estilo: c.estilo, personajes: c.personajes,
    fotos: c.fotos, referencias: c.referencias, anterior, primero,
  });
  try {
    const t = await crearTrabajo(env, acceso, cliente, { ...pedido, confirmado: true, ...(datos.carpetaId ? { carpetaId: datos.carpetaId } : {}) }, { usuario });
    p.trabajoId = t.id;
    p.fase = "generando";
  } catch (e) {
    p.fase = "fallido";
    p.error = e?.message || "No se pudo pedir el fotograma.";
    if (e?.codigo === "presupuesto") return { presupuesto: p.error };
  }
  return null;
}

/** Cómo terminó un trabajo de la cola de video: { vivo } | { archivoId } | { error }. */
async function comoVa(acceso, trabajoId) {
  const t = trabajoId ? await acceso.leerUno("estudio_trabajos", { id: trabajoId }) : null;
  if (!t) return { error: "El trabajo ya no existe." };
  if (estaVivo(t.estado)) return { vivo: true };
  const archivoId = leerJSON(t.archivos, [])[0];
  return t.estado === "hecho" && archivoId ? { archivoId } : { error: t.error || "No salió." };
}

/** El video con todo (los fotogramas de storyboard), con su trabajo. */
async function iniciarVideo(ctx, finales) {
  const { env, acceso, cliente, datos, usuario } = ctx;
  const v = datos.video;
  const modelo = modeloPorId(v.modelo);
  if (!modelo) { Object.assign(v, { fase: "fallido", error: "Ese modelo de video ya no está en el Estudio." }); return; }
  const r = datos.reel;
  // Con montaje la voz la pone ElevenLabs: el modelo de video va sin voz (música y efectos).
  const sinVoz = Boolean(datos.montaje) || sinVozPropia(modelo) || !r.locucion;
  const pedido = pedidoDeVideo({
    modelo, planos: r.planos, hilo: r.hilo, musica: r.musica, locucion: r.locucion, efectos: r.efectos, voz: v.voz, segundos: r.segundos,
    estilo: datos.comun.estilo, personajes: datos.comun.lineaPersonajes, fotogramas: finales, sinVoz: Boolean(datos.montaje),
  });
  try {
    const t = await crearTrabajo(env, acceso, cliente, {
      ...pedido, confirmado: true, ...(datos.carpetaId ? { carpetaId: datos.carpetaId } : {}),
      ...(datos.calendarId && datos.postId ? { calendarId: datos.calendarId, postId: datos.postId } : {}),
    }, { usuario });
    Object.assign(v, { fase: "generando", trabajoId: t.id, sinVoz, segundos: Number(pedido.ajustes?.duration) || r.segundos });
  } catch (e) {
    Object.assign(v, { fase: "fallido", error: e?.message || "No se pudo pedir el video." });
  }
}

/** El clip limpio de UN fotograma (lo que dura su plano, en lo que el modelo admita). */
async function iniciarClip(ctx, p, fotograma) {
  const { env, acceso, cliente, datos, usuario } = ctx;
  const v = datos.video;
  const modelo = modeloPorId(v.modelo);
  if (!modelo) { p.clip = { fase: "fallido", error: "Ese modelo de video ya no está en el Estudio." }; return; }
  const dura = Math.max(1, (Number(p.plano?.hasta) || 0) - (Number(p.plano?.desde) || 0));
  const segundos = v.segundosClip && duracionesDe(modelo).includes(v.segundosClip) ? v.segundosClip : duracionDeClip(modelo, dura);
  const pedido = pedidoDeClip({ modelo, plano: p.plano, fotograma, hilo: datos.reel.hilo, estilo: datos.comun.estilo, personajes: datos.comun.lineaPersonajes, segundos });
  try {
    const t = await crearTrabajo(env, acceso, cliente, { ...pedido, confirmado: true, ...(datos.carpetaId ? { carpetaId: datos.carpetaId } : {}) }, { usuario });
    p.clip = { fase: "generando", trabajoId: t.id, segundos };
  } catch (e) {
    p.clip = { fase: "fallido", error: e?.message || "No se pudo pedir el clip." };
  }
}

/** El video con todo, a su publicación (en el sitio del de antes de este reel), con caption, guion y portada si faltan. */
async function ponerVideo(ctx, fila, archivo, portadaClave) {
  const { env, acceso, cliente, datos } = ctx;
  const r = datos.reel;
  const medio = {
    src: `/api/media/${archivo.clave}`, tipo: "video", nombre: texto(fila.titulo || r.titulo || "Reel", 60),
    ...(archivo.ancho > 0 && archivo.alto > 0 ? { ancho: archivo.ancho, alto: archivo.alto } : {}), deReel: fila.id,
  };
  const puesto = await cambiarPublicacion(env, acceso, {
    clienteId: cliente.id, calendarId: datos.calendarId, postId: datos.postId, por: SISTEMA,
    cambiar: (post) => rellenarVacios(conVideoEnPost(post, medio, (m) => m?.deReel === fila.id), {
      descripcion: r.descripcion, guion: textoDelGuionReel(r), portada: portadaClave ? `/api/media/${portadaClave}` : "", estructura: r.estructuraId ?? "",
    }).post,
  });
  if (puesto?.postId) await marcarUso(acceso, cliente.id, archivo.id, { calendarId: puesto.calendarId, postId: puesto.postId }).catch(() => null);
  datos.puesto = puesto?.postId ? { postId: puesto.postId, calendarId: puesto.calendarId } : { aviso: puesto?.aviso ?? null };
}

/** Sin video que poner (clips para editar fuera): al menos los textos de la publicación, si están vacíos. */
async function rellenarTextos(ctx, portadaClave) {
  const { env, acceso, cliente, datos } = ctx;
  const r = datos.reel;
  await cambiarPublicacion(env, acceso, {
    clienteId: cliente.id, calendarId: datos.calendarId, postId: datos.postId, por: SISTEMA,
    cambiar: (post) => {
      const x = rellenarVacios(post, { descripcion: r.descripcion, guion: textoDelGuionReel(r), portada: portadaClave ? `/api/media/${portadaClave}` : "", estructura: r.estructuraId ?? "" });
      return x.rellenados.length ? x.post : null;
    },
  }).catch(() => null);
}

/** ¿Terminó lo del video (o está esperando a una persona)? */
function videoTerminado(datos, pasos) {
  const v = datos.video ?? {};
  if (datos.salida === "fotogramas" || v.fase === "espera") return true;
  if (datos.salida === "uno") return v.fase === "hecho" || v.fase === "fallido";
  return pasos.every((p) => p.fase !== "hecho" || ["hecho", "fallido", "omitido"].includes(p.clip?.fase));
}

/** ¿Hay material para montar? (el video; o un clip, o un fotograma: el plano sin clip se monta con su fotograma). */
const hayMaterial = (datos, pasos) => (datos.salida === "uno" ? datos.video?.fase === "hecho"
  : pasos.some((p) => p.clip?.fase === "hecho") || (Boolean(datos.montaje) && pasos.some((p) => p.fase === "hecho")));

/** ¿Ya no queda nada que hacer en el reel? (lo que llama encargos.js para cerrarlo). Pura. */
export function reelTerminado(datos = {}, pasos = []) {
  if (!pasos.length || !pasos.every(terminado)) return false;
  if (!pasos.some((p) => p.fase === "hecho")) return true;
  if (!videoTerminado(datos, pasos)) return false;
  const m = datos.montaje;
  if (!m || datos.video?.fase === "espera") return true;
  return FIN_MONTAJE.includes(m.fase) || !hayMaterial(datos, pasos);
}

/** El estado al cerrarlo: «fallido» sólo si no quedó nada que sirva (ni fotogramas, ni el video, ni un clip). Pura. */
export function estadoDelReel(datos = {}, pasos = []) {
  if (!pasos.some((p) => p.fase === "hecho")) return { estado: "fallido", error: pasos.find((p) => p.error)?.error || "No salió ningún fotograma." };
  const v = datos.video ?? {};
  if (datos.salida === "uno" && v.fase === "fallido") return { estado: "fallido", error: v.error || "El video no salió." };
  // Con montaje, un plano sin clip se monta con su fotograma: los clips que no salieron no tumban el reel.
  if (datos.salida === "clips" && v.fase !== "espera" && !datos.montaje && !pasos.some((p) => p.clip?.fase === "hecho")) {
    return { estado: "fallido", error: pasos.find((p) => p.clip?.error)?.clip.error || "No salió ningún clip." };
  }
  return { estado: "hecho" };
}

/** Por dónde va, en palabras. Pura. */
export function notaDelReel(datos = {}, pasos = []) {
  const total = pasos.length;
  const hechos = pasos.filter((p) => p.fase === "hecho").length;
  if (!pasos.every(terminado)) return `Fotogramas: ${hechos} de ${total}.`;
  const v = datos.video ?? {};
  if (datos.salida === "fotogramas" || v.fase === "espera") return `Storyboard listo (${hechos} de ${total}): revísalo y sigue con el video.`;
  if (datos.salida === "uno" && v.fase === "generando") return "Creando el video: tarda unos minutos.";
  if (datos.salida === "uno" && v.fase === "fallido") return `El video no salió: ${v.error ?? ""}`.trim();
  if (datos.salida === "clips") {
    const con = pasos.filter((p) => p.clip && p.clip.fase !== "omitido");
    const listos = con.filter((p) => p.clip.fase === "hecho").length;
    const fijos = pasos.filter((p) => p.clip?.fase === "omitido").length;
    const conFijos = fijos ? ` (${fijos} con su fotograma, sin clip)` : "";
    if (con.some((p) => p.clip.fase !== "hecho" && p.clip.fase !== "fallido")) return `Clips: ${listos} de ${con.length}${conFijos}.`;
    if (!datos.montaje) return `Clips listos: ${listos} de ${con.length}. Móntalos aquí o descárgalos para editarlos.`;
  }
  const m = datos.montaje;
  if (m) {
    const NOTA = {
      nuevo: "Montando: el texto, los subtítulos, el logo y la música.",
      voz: "Pidiendo la voz de la marca…", esperaVoz: "Generando la voz de la marca…", ajustar: "Ajustando las escenas a la voz…",
      confirmar: `Montado. Falta confirmar la voz${m.costoTexto ? ` (${m.costoTexto})` : ""} para terminarlo.`,
      render: "Renderizando el mp4…", renderizando: "Renderizando el mp4…",
      espera: m.nota || "Montado: termínalo desde el video animado.",
      hecho: m.automatico ? "Terminado: el mp4 está en la galería y en su publicación." : "Montado: revisa el video animado y apruébalo.",
      fallido: `El montaje no salió: ${m.error ?? ""}`.trim(),
    };
    return NOTA[m.fase] ?? "";
  }
  return datos.puesto?.postId ? "Listo: el video está en su publicación." : "Listo: el video está en la galería.";
}

/**
 * Lo del reel después de los fotogramas: el video o los clips, y el montaje. Lo barato (mirar un trabajo, el proyecto)
 * se hace siempre; lo caro (un pedido, una llamada) UNA vez por paso. → { hizo } o null si no hay nada.
 */
export async function pasoReel(ctx, fila) {
  const { acceso, cliente, datos, pasos } = ctx;
  if (!pasos.every(terminado) || !pasos.some((p) => p.fase === "hecho")) return null;
  const v = (datos.video ??= { fase: "espera" });
  if (datos.salida === "fotogramas" || v.fase === "espera") return null;
  const hechos = pasos.filter((p) => p.fase === "hecho");
  const finales = await filasDe(acceso, cliente.id, hechos.map(finalDe));
  const portadaClave = finales.get(finalDe(hechos[0]))?.clave ?? "";

  if (datos.salida === "uno") {
    if (v.fase === "nuevo") {
      await iniciarVideo(ctx, hechos.map((p) => finales.get(finalDe(p))).filter(Boolean));
      return { hizo: true };
    }
    if (v.fase === "generando") {
      const r = await comoVa(acceso, v.trabajoId);
      if (r.vivo) return { hizo: false };
      if (r.error) { Object.assign(v, { fase: "fallido", error: r.error }); return { hizo: true }; }
      v.fase = "hecho";
      v.archivoId = r.archivoId;
      // Sin montaje, el video ES el resultado: a su publicación. Con montaje, lo pone el render (el mp4 terminado).
      if (datos.poner && !datos.montaje) {
        const archivo = (await filasDe(acceso, cliente.id, [r.archivoId])).get(r.archivoId);
        if (archivo) await ponerVideo(ctx, fila, archivo, portadaClave);
      }
      return { hizo: true };
    }
  } else if (datos.salida === "clips") {
    // Los que van saliendo (barato), luego UN clip nuevo por paso (todos a la vez: no dependen entre sí).
    let cambio = false;
    for (const p of hechos.filter((x) => x.clip?.fase === "generando")) {
      const r = await comoVa(acceso, p.clip.trabajoId);
      if (r.vivo) continue;
      p.clip = r.error ? { ...p.clip, fase: "fallido", error: r.error } : { ...p.clip, fase: "hecho", archivoId: r.archivoId };
      cambio = true;
    }
    // Con montaje, la toma FIJA (el producto, un beneficio, el cierre) se monta con su fotograma: ese clip no se paga.
    if (datos.montaje) {
      for (const p of hechos) if (!p.clip && esTomaFija(p.plano)) { p.clip = { fase: "omitido", nota: "Toma fija: se monta con su fotograma." }; cambio = true; }
    }
    const siguiente = hechos.find((p) => !p.clip || p.clip.fase === "nuevo");
    if (siguiente) {
      const f = finales.get(finalDe(siguiente));
      if (f) await iniciarClip(ctx, siguiente, f); else siguiente.clip = { fase: "fallido", error: "El fotograma ya no está en la galería." };
      return { hizo: true };
    }
    if (hechos.some((p) => p.clip?.fase === "generando")) return { hizo: cambio };
    if (cambio && datos.poner && !datos.montaje && !datos.textosPuestos) {
      datos.textosPuestos = true;
      await rellenarTextos(ctx, portadaClave);
    }
    if (cambio) return { hizo: true };
  }

  if (videoTerminado(datos, pasos) && datos.montaje) return pasoMontaje(ctx, fila);
  return null;
}

/** La etapa del montaje: crear el proyecto, y en automático aprobarlo, pedir la voz y renderizarlo. */
async function pasoMontaje(ctx, fila) {
  const { env, acceso, cliente, datos, pasos, usuario } = ctx;
  const m = datos.montaje;
  if (FIN_MONTAJE.includes(m.fase)) return null;
  if (!hayMaterial(datos, pasos)) { Object.assign(m, { fase: "fallido", error: "No salió nada que montar." }); return { hizo: true }; }
  const leer = async () => (m.videoId ? renderAlDia(acceso, await acceso.leerUno("videos_proyectos", { id: m.videoId, client_id: cliente.id })) : null);

  if (m.fase === "nuevo") {
    try {
      const r = await crearMontaje(env, acceso, cliente, { encargo: fila, pasos, datos, usuario });
      m.videoId = r.video.id;
      m.fase = m.automatico ? "aprobar" : "hecho";
    } catch (e) {
      Object.assign(m, { fase: "fallido", error: e?.message || "No se pudo montar." });
    }
    return { hizo: true };
  }
  const proyecto = await leer();
  if (!proyecto) { Object.assign(m, { fase: "fallido", error: "El video animado del montaje ya no existe." }); return { hizo: true }; }

  if (m.fase === "aprobar") {
    try {
      const ap = proyecto.estado === "borrador" ? (await aprobarProyecto(acceso, cliente, proyecto, { version: proyecto.version, usuario })).video : { estado: proyecto.estado };
      const habla = await tieneVoz(acceso, cliente.id, m.videoId);
      m.fase = ap.estado === "renderizado" ? "hecho" : !habla ? "render" : ap.estado === "con_voz" ? "ajustar" : "voz";
    } catch (e) {
      Object.assign(m, { fase: "espera", nota: `Montado, pero no se pudo aprobar solo: ${e?.message ?? e}. Termínalo desde el video animado.` });
    }
    return { hizo: true };
  }
  if (m.fase === "voz") {
    try {
      await pedirLocucion(env, acceso, cliente, proyecto, { confirmado: m.confirmadoVoz === true, usuario, origen: "persona", por: SISTEMA, ...(m.vozId ? { vozId: m.vozId } : {}) });
      m.fase = "esperaVoz";
    } catch (e) {
      if (e instanceof ErrorVoz && e.codigo === "confirmar") Object.assign(m, { fase: "confirmar", costo: e.costo ?? null, costoTexto: textoCosto(Number(e.costo) || 0) });
      else Object.assign(m, { fase: "espera", nota: `La voz no se pudo pedir: ${e?.message ?? e}. Pídela desde el video animado.` });
    }
    return { hizo: true };
  }
  if (m.fase === "esperaVoz") {
    const loc = leerJSON(proyecto.locucion, {});
    if (proyecto.estado === "con_voz") { m.fase = "ajustar"; return { hizo: true }; }
    if (loc.estado === "generando") {
      const t = await acceso.leerUno("estudio_trabajos", { id: loc.trabajoId }).catch(() => null);
      if (t && !estaVivo(t.estado) && t.estado !== "hecho") { Object.assign(m, { fase: "fallido", error: t.error || "La voz no salió." }); return { hizo: true }; }
    }
    return { hizo: false };
  }
  if (m.fase === "ajustar") {
    // Con los tiempos DE VERDAD de la voz: la escena con clip cuya frase dura más que el clip se parte (el resto, con su
    // fotograma), y con un solo video cada escena lo arranca donde va la voz. Lo que se dice no cambia: la voz sigue valiendo.
    try {
      const r = await ajustarConLaVoz(ctx, proyecto);
      m.fase = "render";
      if (r.partidas) m.nota = `${r.partidas} frase${r.partidas === 1 ? "" : "s"} más larga${r.partidas === 1 ? "" : "s"} que su clip: el resto va con el fotograma del plano.`;
    } catch (e) {
      // Si no se pudo ajustar, se renderiza como está (antes era así siempre); si ya se guardó, lo termina una persona.
      if (e?.guardado) Object.assign(m, { fase: "espera", nota: `Se ajustaron las escenas a la voz, pero ${e.message} Termínalo desde el video animado.` });
      else Object.assign(m, { fase: "render", nota: `No se pudieron ajustar las escenas a la voz (${e?.message ?? e}): se renderiza como está.` });
    }
    return { hizo: true };
  }
  if (m.fase === "render") {
    try {
      await pedirRender(env, acceso, cliente, proyecto, { version: proyecto.version, usuario, por: SISTEMA });
      m.fase = "renderizando";
    } catch (e) {
      if (e instanceof ErrorVideo && e.estado === 503) Object.assign(m, { fase: "espera", nota: `Montado con su voz; el render no está disponible aquí: ${e.message}` });
      else Object.assign(m, { fase: "fallido", error: e?.message || "No se pudo pedir el render." });
    }
    return { hizo: true };
  }
  if (m.fase === "renderizando") {
    if (proyecto.estado === "renderizado") { m.fase = "hecho"; return { hizo: true }; }
    if (proyecto.estado === "fallido") { Object.assign(m, { fase: "fallido", error: leerJSON(proyecto.render, {}).error || "El render falló." }); return { hizo: true }; }
    return { hizo: false };
  }
  return null;
}

/**
 * El montaje ajustado a los tiempos de la locución ya hecha (`ajustarMontaje`). Si cambió, se guarda (versión nueva) y se
 * aprueba otra vez: como lo que se dice es lo mismo, la locución sigue valiendo y vuelve a «Con voz» sin pagar otra.
 */
async function ajustarConLaVoz(ctx, proyecto) {
  const { acceso, cliente, datos, pasos, usuario } = ctx;
  const guion = leerJSON(proyecto.guion, null);
  const loc = leerJSON(proyecto.locucion, {});
  if (!guion || !Array.isArray(loc.palabras) || !loc.palabras.length) return { partidas: 0 };
  const fuente = fuenteDelEncargo(datos, pasos);
  const r = ajustarMontaje(guion, lineaDeTiempo(guion, loc.palabras), { fotos: fotosDeEscenas(datos.reel ?? {}, fuente), continuo: fuente.tipo === "uno" });
  if (!r.cambio) return r;
  const g = await guardarProyecto(acceso, cliente, proyecto, { guion: r.guion, version: proyecto.version, por: SISTEMA });
  const fila = await acceso.leerUno("videos_proyectos", { id: proyecto.id, client_id: cliente.id });
  const ap = await aprobarProyecto(acceso, cliente, fila, { version: g.video.version, usuario });
  if (!ap.vozReutilizada) throw Object.assign(new Error("la voz dejó de valer al partir las escenas."), { guardado: true });
  return r;
}

/** ¿El proyecto dice algo? (un montaje sin locución no pide voz). */
async function tieneVoz(acceso, clienteId, id) {
  const f = await acceso.leerUno("videos_proyectos", { id, client_id: clienteId });
  const g = leerJSON(f?.guion, {});
  return (g.escenas ?? []).some((e) => String(e.habla ?? "").trim());
}

/** Lo que queda a medias al cerrarse por plazo: no se queda colgado. */
export function cerrarReelPorPlazo(datos = {}, pasos = []) {
  const v = datos.video;
  if (v && ["nuevo", "generando"].includes(v.fase)) Object.assign(v, { fase: "fallido", error: "No terminó a tiempo." });
  for (const p of pasos) if (p.clip && !["hecho", "fallido"].includes(p.clip.fase)) p.clip = { ...p.clip, fase: "fallido", error: "No terminó a tiempo." };
  if (datos.montaje && !FIN_MONTAJE.includes(datos.montaje.fase)) Object.assign(datos.montaje, { fase: "fallido", error: "No terminó a tiempo." });
}

/** Los ids de la galería que un reel ya tiene: los clips y el video (para que la pantalla los reciba con el encargo). Pura. */
export const archivosDelReel = (datos = {}, pasos = []) => [
  ...(datos.video?.archivoId ? [datos.video.archivoId] : []),
  ...pasos.map((p) => p.clip?.archivoId).filter(Boolean),
];

/** Lo del reel que ve la pantalla (sin los pedidos). Pura. */
export function reelPublico(datos = {}) {
  const v = datos.video ?? {};
  const m = datos.montaje;
  return {
    reel: datos.reel ?? null, salida: datos.salida ?? "fotogramas", revisar: Boolean(datos.revisar),
    video: { fase: v.fase ?? "espera", modelo: v.modelo ?? "", archivoId: v.archivoId ?? null, error: v.error ?? "", segundosClip: v.segundosClip ?? 0 },
    montaje: m ? { fase: m.fase, automatico: Boolean(m.automatico), videoId: m.videoId ?? null, error: m.error ?? "", nota: m.nota ?? "", costo: m.costo ?? null, costoTexto: m.costoTexto ?? "" } : null,
    postId: datos.postId ?? null, calendarId: datos.calendarId ?? null, puesto: datos.puesto ?? null, carpetaId: datos.carpetaId ?? null,
    comun: { modelo: datos.comun?.modelo ?? "" },
  };
}

// ------------------------------------------------------------
// Lo que la persona hace sobre un reel ya lanzado
// ------------------------------------------------------------

/** Reserva el encargo como un paso (si no, un paso que escribiera a la vez se llevaría lo de aquí). → la fila o null. */
async function reservar(acceso, fila, ms = 30_000) {
  const t = Date.now();
  if (fila.bloqueado_hasta && fila.bloqueado_hasta > new Date(t).toISOString()) return null;
  const permiso = new Date(t + ms).toISOString();
  return (await acceso.actualizar("estudio_encargos", { id: fila.id, bloqueado_hasta: fila.bloqueado_hasta }, { bloqueado_hasta: permiso })) === 1 ? permiso : null;
}

/**
 * Tras revisar el storyboard: el video con todo («uno») o los clips («clips»), con su modelo, y si se quiere el montaje.
 * `finales` { pasoId: archivoId }: los fotogramas que la persona corrigió (de la galería de ESTE cliente). Vuelve a
 * poner el encargo en marcha. → la fila nueva, { ocupado } o lanza ErrorEstudio.
 */
export async function continuarReel(env, acceso, cliente, fila, cuerpo = {}) {
  if (fila.tipo !== "reel") throw new ErrorEstudio("Ese encargo no es un reel.", 400);
  const pasos = leerJSON(fila.pasos, []);
  const datos = leerJSON(fila.datos, {});
  if (!pasos.every(terminado)) throw new ErrorEstudio("El storyboard todavía se está haciendo: espera a que termine.", 409);
  if (!pasos.some((p) => p.fase === "hecho")) throw new ErrorEstudio("No salió ningún fotograma: rehazlos antes de seguir.", 409);
  const v = datos.video ?? {};
  const yaVa = ["generando"].includes(v.fase) || pasos.some((p) => p.clip?.fase === "generando");
  if (yaVa) throw new ErrorEstudio("El video ya se está creando.", 409);
  const salida = cuerpo.salida === "clips" ? "clips" : "uno";
  const video = limpiarVideo(cuerpo.video);
  const m = modeloPorId(video.modelo);
  if (!m || m.tipo !== "video") throw new ErrorEstudio("Falta el modelo del video.", 400);
  if (salida === "clips" && !m.inicial) throw new ErrorEstudio(`${m.nombre} no anima una imagen: escoge otro para los clips.`, 400);
  if (salida === "uno" && !haceDuracion(m, datos.reel?.segundos)) throw new ErrorEstudio(`${m.nombre} no hace videos de ${datos.reel?.segundos} s: escoge otro o hazlo por clips y montaje.`, 400);
  const permiso = await reservar(acceso, fila);
  if (!permiso) return { ocupado: true };
  // Los fotogramas corregidos a mano (sólo de la galería de ESTE cliente).
  const cambios = cuerpo.finales && typeof cuerpo.finales === "object" ? cuerpo.finales : {};
  const ids = Object.values(cambios).map((x) => String(x ?? "").slice(0, 80)).filter(Boolean);
  const existen = ids.length ? new Set((await acceso.leerVarios("estudio_archivos", ["id"], "id", ids, { client_id: cliente.id })).map((a) => a.id)) : new Set();
  for (const p of pasos) {
    const nuevo = String(cambios[p.id] ?? "");
    if (nuevo && existen.has(nuevo) && p.fase === "hecho") p.finales = [nuevo];
    if (salida === "clips" && p.clip?.fase !== "hecho") delete p.clip;
  }
  if (cuerpo.reel) {
    // Lo que se dice o se lee pudo cambiar al revisar (los planos no: los fotogramas son de ellos).
    const r = limpiarGuionReel({ ...datos.reel, ...cuerpo.reel, planos: datos.reel.planos.map((p, i) => ({ ...p, ...(cuerpo.reel.planos?.[i] ?? {}), escena: p.escena, desde: p.desde })) });
    if (r) datos.reel = r;
  }
  Object.assign(datos, {
    salida, revisar: false, video: { ...video, fase: "nuevo" },
    // Lo que diga ahora la persona manda (null: sin montaje); si no dice nada, el que se pidió al lanzar.
    montaje: "montaje" in cuerpo ? limpiarMontaje(cuerpo.montaje) : salida === datos.salida ? datos.montaje : null,
  });
  delete datos.textosPuestos;
  const momento = new Date().toISOString();
  await acceso.actualizar("estudio_encargos", { id: fila.id, bloqueado_hasta: permiso }, {
    pasos: JSON.stringify(pasos), datos: JSON.stringify(datos), estado: "en_marcha", terminado_at: null, error: "",
    nota: salida === "clips" ? "Creando los clips…" : "Creando el video…", bloqueado_hasta: "", updated_at: momento,
  });
  return { fila: await acceso.leerUno("estudio_encargos", { id: fila.id }) };
}

/**
 * «Montarlo aquí» (o confirmar la voz del montaje): pone la etapa del montaje y vuelve a poner el encargo en marcha.
 * `automatico`: aprobar, la voz y el render solos; `confirmadoVoz`: la persona vio el costo de la voz y dijo que sí.
 * → la fila nueva, { ocupado } o lanza ErrorEstudio.
 */
export async function montarReel(env, acceso, cliente, fila, cuerpo = {}) {
  if (fila.tipo !== "reel") throw new ErrorEstudio("Ese encargo no es un reel.", 400);
  const pasos = leerJSON(fila.pasos, []);
  const datos = leerJSON(fila.datos, {});
  if (!videoTerminado(datos, pasos) || datos.video?.fase === "espera" || datos.salida === "fotogramas") {
    throw new ErrorEstudio("Primero el video o los clips: se monta lo que ya salió.", 409);
  }
  if (!hayMaterial(datos, pasos)) throw new ErrorEstudio("No hay ningún clip ni video que montar.", 409);
  const m = datos.montaje;
  const seguirConLaVoz = m && m.fase === "confirmar" && cuerpo.confirmadoVoz === true;
  if (m && !FIN_MONTAJE.includes(m.fase)) throw new ErrorEstudio("Ya se está montando.", 409);
  const permiso = await reservar(acceso, fila);
  if (!permiso) return { ocupado: true };
  const vozId = /^[\w-]{8,64}$/.test(String(cuerpo.vozId ?? "")) ? String(cuerpo.vozId) : "";
  datos.montaje = seguirConLaVoz
    ? { ...m, fase: "voz", confirmadoVoz: true, ...(vozId ? { vozId } : {}) }
    : { ...limpiarMontaje({ automatico: cuerpo.automatico === true, confirmadoVoz: cuerpo.confirmadoVoz === true, conVoz: cuerpo.conVoz, vozId: vozId || m?.vozId }), ...(cuerpo.otraVez !== true && m?.videoId ? { videoId: m.videoId } : {}) };
  // Un montaje que ya tiene su proyecto (y no se pidió otro): sólo sigue con lo que falte.
  if (!seguirConLaVoz && datos.montaje.videoId) datos.montaje.fase = datos.montaje.automatico ? "aprobar" : "hecho";
  // Sin nada que hacer (montar otra vez lo que ya está montado, sin automático): no se reabre.
  if (datos.montaje.fase === "hecho") {
    await acceso.actualizar("estudio_encargos", { id: fila.id, bloqueado_hasta: permiso }, { datos: JSON.stringify(datos), bloqueado_hasta: "" });
    return { fila: await acceso.leerUno("estudio_encargos", { id: fila.id }) };
  }
  await acceso.actualizar("estudio_encargos", { id: fila.id, bloqueado_hasta: permiso }, {
    datos: JSON.stringify(datos), estado: "en_marcha", terminado_at: null, error: "", nota: "Montando…", bloqueado_hasta: "", updated_at: new Date().toISOString(),
  });
  return { fila: await acceso.leerUno("estudio_encargos", { id: fila.id }) };
}
