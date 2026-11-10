// ============================================================
// «Publicar con música» en el servidor: de un post de UNA foto, un reel corto con su música (y los carruseles, a mano)
//
//   · `publicarConMusica`: la foto de la publicación pasa a ser un VIDEO ANIMADO de una escena —la foto a sangre con su
//     movimiento (src/lib/conMusica.js, `guionDeFoto`)—, con la música escogida en su SONIDO (o la favorita, la de la
//     marca o la más nueva de la galería del cliente), y se APRUEBA y se RENDERIZA solo, ligado a la publicación. Al
//     terminar, el render (render.js, `ponerEnPublicacion`) la pone como reel con el mp4 y la foto de portada. No gasta
//     IA: el render es cómputo del Container. Sin Container (en local) se dice antes de crear nada.
//     Si la publicación ya tenía su video con música, se REUSA ese proyecto (otra pista u otra duración = otra versión
//     del mismo video), así no se amontonan videos por cada intento.
//   · `aManoConMusica`: un CARRUSEL no se convierte: se marca «La publico yo» (`asistida`) con la música de Instagram y
//     la canción sugerida de la lista del cliente. El aviso a la hora lo pone el cron (worker/lib/avisosAMano.js).
//
// Es la MISMA puerta para la pantalla (POST /api/videos/<c>/con-musica) y para el asistente y Claude (herramienta
// `publicar_con_musica`, worker/lib/estudio/herramientasVideo.js).
// ============================================================

import { uuid, ahora } from "../ids.js";
import { crearProyecto, guardarProyecto, aprobarProyecto, guardarSonido, publicacionDelCliente, ErrorVideo, deFila } from "../videosProyectos.js";
import { pedirMusica } from "./musica.js";
import { pedirLocucion } from "./locucion.js";
import { llamarIA } from "../cerebro/ia.js";
import { puedeRenderizar } from "../../../src/lib/renderVideo.js";
import { pedirRender, ligarAPublicacion } from "./render.js";
import { musicasDe } from "./galeria.js";
import { kitDe } from "./kit.js";
import { claveDelCliente } from "./archivos.js";
import { cambiarPublicacion } from "./ponerEnPost.js";
import { cancelarPendientes } from "../publicador.js";
import {
  guionDeFoto, puedeConMusica, fotoDe, duracionDeFoto, movimientoDeFoto, esCarruselParaMusica, ORIGEN_FOTO, FRASE_COSTO, musicaPorDefecto,
  ORIGEN_CARRUSEL, puedeCarruselAReel, laminasDe, guionDeCarrusel, segundosDeLamina, pedidoDeVozCarrusel, leerVozCarrusel, esVideoDeFoto,
  cancionSugerida, ultimaCancionUsada, cancionParaGuardar, textoDeCancion,
} from "../../../src/lib/conMusica.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };

/** La publicación de ese cliente (en cualquiera de sus meses) → { calendarId, post, fecha } o el 404. */
async function laPublicacion(acceso, clienteId, postId, calendarId = null) {
  const liga = await publicacionDelCliente(acceso, clienteId, String(postId ?? ""));
  if (!liga || (calendarId && liga.calendarId !== String(calendarId))) throw new ErrorVideo("No encontré esa publicación en los calendarios de este cliente.", 404);
  const cal = await acceso.leerUno("calendars", { id: liga.calendarId, client_id: clienteId });
  for (const d of leerJSON(cal?.days, [])) {
    const post = (d?.posts ?? []).find((p) => p?.id === liga.postId);
    if (post) return { calendarId: liga.calendarId, post, fecha: d.date };
  }
  throw new ErrorVideo("No encontré esa publicación en los calendarios de este cliente.", 404);
}

/**
 * La ficha de la galería de la foto: la que ya hay con esa clave o una nueva que APUNTA al mismo objeto de R2 (origen
 * «app»: la papelera quita la ficha y nunca el objeto, que es de la publicación). El motor lee las imágenes por su id de
 * la galería. → la fila.
 */
export async function fotoEnGaleria(acceso, clienteId, medio) {
  const clave = claveDelCliente(medio?.src, clienteId);
  if (!clave) throw new ErrorVideo("La foto de la publicación no es un archivo de este cliente: súbela otra vez.", 400);
  const hay = (await acceso.leer("estudio_archivos", { client_id: clienteId, clave }, "created_at asc", 5)).find((f) => !f.borrado_at && f.tipo === "imagen");
  if (hay) return hay;
  const momento = ahora();
  const mime = /\.png$/i.test(clave) ? "image/png" : /\.webp$/i.test(clave) ? "image/webp" : "image/jpeg";
  return acceso.insertar("estudio_archivos", {
    id: uuid(), client_id: clienteId, clave, tipo: "imagen", mime, ancho: Number(medio.ancho) || 0, alto: Number(medio.alto) || 0, bytes: 0,
    prompt: String(medio.nombre ?? "Foto de la publicación").slice(0, 200), modelo: "", ajustes: "{}", trabajo_id: null, carpeta_id: null,
    origen: "app", costo: 0, favorito: 0, subido: 0, usado_en: "[]", borrado_at: null, created_at: momento, updated_at: momento,
  });
}

/**
 * La música del reel: la escogida (tiene que estar en la lista de la galería del cliente, `musicasDe`, tal cual) o, si no
 * se escoge, la FAVORITA, la de la MARCA (las que gustaron, `kit.musica.referencias`) o la más nueva. → { id, nombre } o
 * el 409 `sin_musica` (no se genera música nueva salvo que se pida en «Sonido»).
 */
export async function musicaParaFoto(acceso, cliente, musicaId = "") {
  const lista = await musicasDe(acceso, cliente.id);
  if (musicaId) {
    const m = lista.find((x) => x.id === String(musicaId));
    if (!m) throw new ErrorVideo("Esa música no está en la galería de este cliente.", 404);
    return m;
  }
  const m = musicaPorDefecto(lista, kitDe(cliente));
  if (!m) {
    throw new ErrorVideo(`${cliente.name ?? "Este cliente"} no tiene música en su galería: súbela (MP3 o WAV con derechos) o genérala en «Sonido» de un video animado, y vuelve.`, 409, { codigo: "sin_musica" });
  }
  return m;
}

/** El video «con música» que ya tiene la publicación (si lo tiene): se reusa. */
async function proyectoDeLaFoto(acceso, clienteId, postId) {
  const filas = await acceso.leer("videos_proyectos", { client_id: clienteId, post_id: String(postId) }, "updated_at desc", 10);
  return filas.find((f) => leerJSON(f.origen, {}).tipo === ORIGEN_FOTO) ?? null;
}

/** El proyecto «con música» que ya tiene la publicación (de una foto o de un carrusel), si lo tiene: se reusa. */
async function proyectoConMusica(acceso, clienteId, postId, tipo) {
  const filas = await acceso.leer("videos_proyectos", { client_id: clienteId, post_id: String(postId) }, "updated_at desc", 10);
  return filas.find((f) => leerJSON(f.origen, {}).tipo === tipo) ?? null;
}

/** Crea o vuelve a guardar el proyecto con este guion (otra versión del mismo video, no un video más). → la fila al día. */
async function guardarElProyecto(acceso, cliente, { fila, guion, calId, postId, usuario, origen }) {
  if (fila?.estado === "renderizando") throw new ErrorVideo("Ya se está haciendo el video de esta publicación: espera a que termine.", 409);
  if (fila) {
    await guardarProyecto(acceso, cliente, fila, { guion, version: fila.version, por: usuario?.nombre ?? null });
    // Lo de `origen` que cambia con cada pedido (render solo al tener lo que falta, la foto con que se hizo).
    await acceso.actualizar("videos_proyectos", { id: fila.id, client_id: cliente.id }, { origen: JSON.stringify({ ...leerJSON(fila.origen, {}), ...origen }) });
    return acceso.leerUno("videos_proyectos", { id: fila.id, client_id: cliente.id });
  }
  const r = await crearProyecto(acceso, cliente, { guion, titulo: guion.titulo, calendarId: calId, postId, usuario, origen });
  return acceso.leerUno("videos_proyectos", { id: r.video.id, client_id: cliente.id });
}

const aprobarSiHaceFalta = async (acceso, cliente, fila, usuario) => {
  if (fila.estado !== "borrador") return fila;
  await aprobarProyecto(acceso, cliente, fila, { version: fila.version, usuario });
  return acceso.leerUno("videos_proyectos", { id: fila.id, client_id: cliente.id });
};

/** «generar»: la música la escribe el director musical MIRANDO las imágenes del video y la hace Suno (con confirmación). */
export const GENERAR_MUSICA = "generar";

/**
 * La música del video: la escogida de la biblioteca, ninguna, o GENERADA (`musicaId` = «generar»). Con «generar», el
 * director musical mira las imágenes (worker/lib/estudio/directorMusical.js) y la pide a Suno: sin `confirmado`, el 409
 * con su costo y su propuesta; con él, el trabajo, y el video se renderiza SOLO cuando llega la música (`renderSiToca`).
 * → { musica, generando, costo, aviso }.
 */
async function laMusicaDelVideo(env, acceso, cliente, fila, { musicaId, confirmado, usuario }) {
  if (musicaId === GENERAR_MUSICA) {
    await guardarSonido(acceso, cliente, fila, { efectos: false, musica: null });
    const actual = await acceso.leerUno("videos_proyectos", { id: fila.id, client_id: cliente.id });
    const r = await pedirMusica(env, acceso, cliente, { video: actual, confirmado, usuario });
    return { musica: { id: "", nombre: r.pedido?.titulo ?? "Música nueva" }, generando: true, costo: r.costo, aviso: r.aviso ?? null, propuesta: r.propuesta ?? null };
  }
  const m = await musicaParaFoto(acceso, cliente, musicaId);
  const antes = leerJSON(fila.sonido, {})?.musica?.archivoId ?? null;
  await guardarSonido(acceso, cliente, fila, { efectos: false, musica: { archivoId: m.id, volumen: 0 } });
  return { musica: { id: m.id, nombre: m.nombre }, generando: false, costo: 0, igual: antes === m.id };
}

/**
 * Convierte el post de UNA foto en un reel con música y lo deja RENDERIZÁNDOSE. `segundos` (7, 10 o 15), `movimiento`
 * (acercar, alejar, paneo o «ninguno»: la foto quieta), `musicaId` (de la galería del cliente, o «generar»: la escribe el
 * director musical mirando la foto y la hace Suno, con su confirmación) y `logo` (true/false; vacío: el del kit si lo
 * estampa la aplicación y la foto no salió ya del Estudio con él). → { video, musica, costo, aviso }.
 */
export async function publicarConMusica(env, acceso, cliente, { postId, calendarId = null, musicaId = "", segundos, movimiento, logo, confirmado = false, usuario = null, por = null }) {
  // Sin Container no hay render: se dice ANTES de crear nada.
  if (!env.RENDER) throw new ErrorVideo("El video lo hace el Container del servidor, y aquí no hay (en local). Pruébalo en el sitio publicado.", 503, { codigo: "sin_container" });
  const { calendarId: calId, post } = await laPublicacion(acceso, cliente.id, postId, calendarId);
  const puede = puedeConMusica(post);
  if (!puede.ok) throw new ErrorVideo(puede.motivo, 409);
  const foto = fotoDe(post);
  const archivo = await fotoEnGaleria(acceso, cliente.id, foto);
  // Antes de crear nada: que haya música que poner (o que se vaya a generar).
  if (musicaId !== GENERAR_MUSICA) await musicaParaFoto(acceso, cliente, musicaId);
  const kit = kitDe(cliente);
  const conLogo = typeof logo === "boolean" ? logo : kit.logoModo === "estampado" && Boolean(kit.logo) && archivo.origen !== "estudio";
  const guion = guionDeFoto({
    archivoId: archivo.id, segundos: duracionDeFoto(segundos), movimiento: movimientoDeFoto(movimiento),
    titulo: post.title || post.idea || "", ancho: foto.ancho || archivo.ancho, alto: foto.alto || archivo.alto,
    logo: conLogo && kit.logo ? kit.logoPosicion ?? {} : null,
  });
  const generar = musicaId === GENERAR_MUSICA;
  let fila = await guardarElProyecto(acceso, cliente, {
    fila: await proyectoDeLaFoto(acceso, cliente.id, post.id), guion, calId, postId: post.id, usuario,
    origen: { tipo: ORIGEN_FOTO, foto: foto.src, ...(generar ? { renderSolo: true, ...(usuario?.id ? { porId: usuario.id } : {}) } : { renderSolo: false }) },
  });
  fila = await aprobarSiHaceFalta(acceso, cliente, fila, usuario);
  const m = await laMusicaDelVideo(env, acceso, cliente, fila, { musicaId, confirmado, usuario });
  fila = await acceso.leerUno("videos_proyectos", { id: fila.id, client_id: cliente.id });
  if (m.generando) {
    return {
      video: deFila(fila), musica: m.musica, costo: m.costo, generando: true, ...(m.propuesta ? { propuesta: m.propuesta } : {}),
      aviso: [m.aviso, "Suno está haciendo la música (tarda unos minutos); en cuanto llegue, el video se hace solo y se pone en la publicación."].filter(Boolean).join(" "),
    };
  }
  // Lo MISMO que ya salió (el mismo guion y la misma música: se volvió a la foto y se pide otra vez): el mp4 que hay se
  // pone en la publicación ya, sin renderizar otra vez.
  const hecho = leerJSON(fila.render, {});
  if (fila.estado === "renderizado" && hecho.estado === "listo" && hecho.clave && hecho.version === fila.version && m.igual) {
    const r = await ligarAPublicacion(env, acceso, cliente, fila, { postId: post.id, calendarId: calId, por: por ?? undefined });
    return { video: r.video, musica: m.musica, costo: 0, yaHecho: true, aviso: r.aviso || "Ya estaba hecho así: el reel volvió a la publicación sin renderizarlo otra vez." };
  }
  const r = await pedirRender(env, acceso, cliente, fila, { version: fila.version, usuario, por });
  return {
    video: r.video, musica: m.musica, costo: 0,
    aviso: `${FRASE_COSTO} Tarda menos de un minuto; al terminar, la publicación pasa a reel con el video y la foto de portada.`,
  };
}

/**
 * Convierte un CARRUSEL en un reel: sus láminas una tras otra con la transición escogida, la música (de la biblioteca o
 * generada) y, con `voz`, una LOCUCIÓN: la IA escribe una frase por lámina con lo que dice la publicación (texto, barato)
 * y la voz de la marca la dice (ElevenLabs, SIEMPRE con su confirmación: sin `confirmado`, el 409 con el costo). Al
 * tener lo que falta (la voz, la música generada), se renderiza SOLO; al terminar, la publicación pasa a reel con la
 * primera lámina de portada y «Volver al carrusel» la deja como estaba. → { video, musica, costo, aviso }.
 */
export async function carruselAReel(env, acceso, cliente, { postId, calendarId = null, musicaId = "", segundos, transicion, movimiento, voz = false, logo, confirmado = false, usuario = null, por = null }) {
  if (!env.RENDER) throw new ErrorVideo("El video lo hace el Container del servidor, y aquí no hay (en local). Pruébalo en el sitio publicado.", 503, { codigo: "sin_container" });
  const { calendarId: calId, post } = await laPublicacion(acceso, cliente.id, postId, calendarId);
  const puede = puedeCarruselAReel(post);
  if (!puede.ok) throw new ErrorVideo(puede.motivo, 409);
  if (voz && musicaId === GENERAR_MUSICA) throw new ErrorVideo("Con voz, escoge una música de la biblioteca (o ninguna): la voz y la música nueva no se confirman a la vez.", 400);
  const laminas = laminasDe(post);
  const archivos = [];
  for (const l of laminas.slice(0, 10)) archivos.push({ medio: l, archivo: await fotoEnGaleria(acceso, cliente.id, l) });
  const sinMusica = musicaId === "ninguna";
  if (!sinMusica && musicaId !== GENERAR_MUSICA) await musicaParaFoto(acceso, cliente, musicaId);
  const kit = kitDe(cliente);
  const conLogo = typeof logo === "boolean" ? logo : kit.logoModo === "estampado" && Boolean(kit.logo) && !archivos.some((a) => a.archivo.origen === "estudio");
  const previo = await proyectoConMusica(acceso, cliente.id, post.id, ORIGEN_CARRUSEL);

  // La voz: una frase por lámina. Si ya la había escrito para estas mismas láminas (se vuelve con el «sí»), se reusa:
  // no se paga otra vez ni cambia lo que se va a decir.
  let hablas = [];
  if (voz) {
    const antes = previo ? leerJSON(previo.guion, {}) : null;
    const mismas = antes?.escenas?.length === archivos.length && antes.escenas.every((e, i) => e.capas?.[0]?.archivo === archivos[i].archivo.id);
    hablas = mismas && antes.escenas.some((e) => e.habla) ? antes.escenas.map((e) => e.habla ?? "") : await vozDelCarrusel(env, acceso, cliente, post, archivos.length, segundosDeLamina(segundos));
  }
  const guion = guionDeCarrusel({
    laminas: archivos.map(({ medio, archivo }) => ({ archivoId: archivo.id, ancho: medio.ancho || archivo.ancho, alto: medio.alto || archivo.alto })),
    segundos, transicion, movimiento, hablas, titulo: post.title || post.idea || "", logo: conLogo && kit.logo ? kit.logoPosicion ?? {} : null,
  });
  const esperaAlgo = voz || musicaId === GENERAR_MUSICA;
  let fila = await guardarElProyecto(acceso, cliente, {
    fila: previo, guion, calId, postId: post.id, usuario,
    origen: { tipo: ORIGEN_CARRUSEL, foto: archivos[0].medio.src, renderSolo: esperaAlgo, ...(esperaAlgo && usuario?.id ? { porId: usuario.id } : {}) },
  });
  fila = await aprobarSiHaceFalta(acceso, cliente, fila, usuario);
  const m = sinMusica
    ? (await guardarSonido(acceso, cliente, fila, { efectos: false, musica: null }), { musica: null, generando: false, costo: 0 })
    : await laMusicaDelVideo(env, acceso, cliente, fila, { musicaId, confirmado, usuario });
  fila = await acceso.leerUno("videos_proyectos", { id: fila.id, client_id: cliente.id });
  if (voz) {
    // Sin el «sí», el 409 con lo que cuesta la voz (y lo que va a decir, para leerlo antes de pagar).
    try {
      await pedirLocucion(env, acceso, cliente, fila, { confirmado, usuario, origen: "persona", por });
    } catch (e) {
      if (e?.codigo === "confirmar" || e?.datos?.codigo === "confirmar") Object.assign(e, { hablas, videoId: fila.id });
      throw e;
    }
    return {
      video: deFila(fila), musica: m.musica, costo: 0, generando: true, hablas,
      aviso: "Generando la voz: en cuanto esté, el video se hace solo con las láminas, la música y los subtítulos, y se pone en la publicación.",
    };
  }
  if (m.generando) {
    return { video: deFila(fila), musica: m.musica, costo: m.costo, generando: true, aviso: [m.aviso, "Suno está haciendo la música; en cuanto llegue, el video se hace solo y se pone en la publicación."].filter(Boolean).join(" ") };
  }
  const r = await pedirRender(env, acceso, cliente, fila, { version: fila.version, usuario, por });
  return { video: r.video, musica: m.musica, costo: 0, aviso: `${FRASE_COSTO} Al terminar, la publicación pasa a reel con la primera lámina de portada.` };
}

/** La voz de cada lámina, escrita por la IA con lo que dice la publicación (texto, barato). Sin IA, lanza con el motivo. */
async function vozDelCarrusel(env, acceso, cliente, post, n, segundos) {
  const prompt = pedidoDeVozCarrusel({
    marca: cliente.name, n, segundos, titulo: post.title ?? "", idea: post.idea ?? "", descripcion: post.descripcion ?? post.script ?? "",
    textoPieza: post.textoPieza ?? "", guion: post.guion ?? "",
  });
  const r = await llamarIA(env, acceso, cliente, { prompt, salida: 1200, funcion: "guion de video" });
  const lineas = leerVozCarrusel(r.texto, n);
  if (!lineas.some(Boolean)) throw new ErrorVideo("La IA no devolvió la voz de las láminas: inténtalo otra vez.", 502);
  return lineas;
}

/**
 * Si el video de una foto o de un carrusel espera algo para renderizarse SOLO (`origen.renderSolo`: la música que hacía
 * Suno, la voz que hacía ElevenLabs) y ya lo tiene, lo encarga. Lo llaman musica.js (al llegar la música) y locucion.js
 * (al estar la voz). Nunca lanza: si no se puede, el video queda listo para renderizar a mano. → true si lo encargó.
 */
export async function renderSiToca(env, acceso, clienteId, videoId) {
  try {
    const fila = await acceso.leerUno("videos_proyectos", { id: String(videoId), client_id: clienteId });
    const origen = leerJSON(fila?.origen, {});
    if (!fila || !origen.renderSolo || !esVideoDeFoto(origen) || !env.RENDER) return false;
    if (!["aprobado", "con_voz"].includes(fila.estado)) return false;
    // La música que se estaba generando tiene que estar ya en su sonido (si se pidió generar).
    const cliente = await acceso.leerUno("clients", { id: clienteId });
    if (!cliente) return false;
    const puede = puedeRenderizar({ ...fila, locucion: leerJSON(fila.locucion, {}), guion: leerJSON(fila.guion, null) });
    if (!puede.ok) return false;
    const usuario = origen.porId ? { id: origen.porId, nombre: "Estudio" } : null;
    await pedirRender(env, acceso, cliente, fila, { version: fila.version, usuario, por: null });
    await acceso.actualizar("videos_proyectos", { id: fila.id, client_id: clienteId }, { origen: JSON.stringify({ ...origen, renderSolo: false }) });
    return true;
  } catch (e) {
    console.error("con música: render solo", e?.message ?? e);
    return false;
  }
}

/**
 * Un CARRUSEL con la música de Instagram: se marca «La publico yo» (`asistida`) con la nota de la música y la canción
 * sugerida (la que ya tenga, o la siguiente de la lista del cliente sin repetir la última usada). → { post, cancion,
 * enlace }. Lo que la API no deja (la música) se pone desde el teléfono en /a-mano/<calendario>/<publicación>.
 */
export async function aManoConMusica(env, acceso, cliente, { postId, calendarId = null, por }) {
  const { calendarId: calId, post } = await laPublicacion(acceso, cliente.id, postId, calendarId);
  if (!esCarruselParaMusica(post)) {
    throw new ErrorVideo(post.status === "published" ? "Ya se publicó." : "Esto es para un carrusel (con sus imágenes puestas): un post de una foto se convierte en reel con música.", 409);
  }
  const kit = kitDe(cliente);
  const canciones = kit.musica?.cancionesInstagram ?? [];
  // La última usada se busca en todos sus meses (una lectura de sus calendarios, sólo los días).
  const cals = await acceso.leerColumnas("calendars", ["id", "days"], { client_id: cliente.id });
  const ultima = ultimaCancionUsada({ calendars: cals.map((c) => ({ days: leerJSON(c.days, []) })) }, post.id);
  const cancion = cancionSugerida(canciones, { ultima, actual: post.cancionInstagram });
  const momento = ahora();
  const r = await cambiarPublicacion(env, acceso, {
    clienteId: cliente.id, calendarId: calId, postId: post.id, por,
    cambiar: (p) => ({
      ...p, asistida: true, conMusicaInstagram: true,
      notaAsistida: String(p.notaAsistida ?? "").trim() || `Música de Instagram${cancion ? `: «${textoDeCancion(cancion)}»` : ""}`,
      ...(cancion && !p.cancionInstagram?.nombre ? { cancionInstagram: cancionParaGuardar(cancion, momento) } : {}),
    }),
  });
  if (r?.aviso) throw new ErrorVideo(r.aviso, 409);
  // Lo que ya estaba en la cola saldría solo, SIN la música: se saca (como «La publico yo» de «¿Cuándo sale?»).
  const sacadas = await cancelarPendientes(acceso, calId, post.id, "Pasó a publicarse a mano con la música de Instagram.").catch(() => 0);
  return { post: r.post, cancion, sacadas, sinLista: !canciones.length, enlace: `/a-mano/${encodeURIComponent(calId)}/${encodeURIComponent(post.id)}` };
}

/**
 * Lo que pide «con música» según la publicación: un carrusel, a mano con la música de Instagram (`aManoConMusica`); lo
 * demás, el reel de una foto (`publicarConMusica`, que dice por qué no si no es un post de una foto). → { tipo: "reel" |
 * "a-mano", …lo de cada una }.
 */
export async function conMusicaSegun(env, acceso, cliente, opciones) {
  const { post } = await laPublicacion(acceso, cliente.id, opciones.postId, opciones.calendarId ?? null);
  // Un carrusel: en reel con sus láminas si se pide (`reel: true`, o ya lo es); si no, a mano con la música de Instagram.
  if (opciones.reel === true || (Array.isArray(post.conMusica?.medios) && post.conMusica.medios.length > 1)) return { tipo: "reel", ...(await carruselAReel(env, acceso, cliente, opciones)) };
  if (post.format === "carrusel") return { tipo: "a-mano", ...(await aManoConMusica(env, acceso, cliente, opciones)) };
  return { tipo: "reel", ...(await publicarConMusica(env, acceso, cliente, opciones)) };
}
