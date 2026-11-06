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
import { crearProyecto, guardarProyecto, aprobarProyecto, guardarSonido, publicacionDelCliente, ErrorVideo } from "../videosProyectos.js";
import { pedirRender, ligarAPublicacion } from "./render.js";
import { musicasDe } from "./galeria.js";
import { kitDe } from "./kit.js";
import { claveDelCliente } from "./archivos.js";
import { cambiarPublicacion } from "./ponerEnPost.js";
import { cancelarPendientes } from "../publicador.js";
import {
  guionDeFoto, puedeConMusica, fotoDe, duracionDeFoto, movimientoDeFoto, esCarruselParaMusica, ORIGEN_FOTO, FRASE_COSTO, musicaPorDefecto,
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

/**
 * Convierte el post de UNA foto en un reel con música y lo deja RENDERIZÁNDOSE. `segundos` (7, 10 o 15), `movimiento`
 * (acercar, alejar, paneo), `musicaId` (de la galería del cliente) y `logo` (true/false; vacío: el del kit si lo estampa
 * la aplicación y la foto no salió ya del Estudio con él). → { video, musica, costo: 0, aviso }.
 */
export async function publicarConMusica(env, acceso, cliente, { postId, calendarId = null, musicaId = "", segundos, movimiento, logo, usuario = null, por = null }) {
  // Sin Container no hay render: se dice ANTES de crear nada.
  if (!env.RENDER) throw new ErrorVideo("El video lo hace el Container del servidor, y aquí no hay (en local). Pruébalo en el sitio publicado.", 503, { codigo: "sin_container" });
  const { calendarId: calId, post } = await laPublicacion(acceso, cliente.id, postId, calendarId);
  const puede = puedeConMusica(post);
  if (!puede.ok) throw new ErrorVideo(puede.motivo, 409);
  const foto = fotoDe(post);
  const archivo = await fotoEnGaleria(acceso, cliente.id, foto);
  const musica = await musicaParaFoto(acceso, cliente, musicaId);
  const kit = kitDe(cliente);
  const conLogo = typeof logo === "boolean" ? logo : kit.logoModo === "estampado" && Boolean(kit.logo) && archivo.origen !== "estudio";
  const guion = guionDeFoto({
    archivoId: archivo.id, segundos: duracionDeFoto(segundos), movimiento: movimientoDeFoto(movimiento),
    titulo: post.title || post.idea || "", ancho: foto.ancho || archivo.ancho, alto: foto.alto || archivo.alto,
    logo: conLogo && kit.logo ? kit.logoPosicion ?? {} : null,
  });

  let fila = await proyectoDeLaFoto(acceso, cliente.id, post.id);
  if (fila?.estado === "renderizando") throw new ErrorVideo("Ya se está haciendo el video de esta publicación: espera a que termine.", 409);
  if (fila) {
    await guardarProyecto(acceso, cliente, fila, { guion, version: fila.version, por: usuario?.nombre ?? null });
    fila = await acceso.leerUno("videos_proyectos", { id: fila.id, client_id: cliente.id });
  } else {
    const r = await crearProyecto(acceso, cliente, {
      guion, titulo: guion.titulo, calendarId: calId, postId: post.id, usuario, origen: { tipo: ORIGEN_FOTO, foto: foto.src },
    });
    fila = await acceso.leerUno("videos_proyectos", { id: r.video.id, client_id: cliente.id });
  }
  // La música, en el SONIDO del video (aparte del guion); sin efectos: una foto no tiene transiciones ni sellos.
  const musicaAntes = leerJSON(fila.sonido, {})?.musica?.archivoId ?? null;
  await guardarSonido(acceso, cliente, fila, { efectos: false, musica: { archivoId: musica.id, volumen: 0 } });
  fila = await acceso.leerUno("videos_proyectos", { id: fila.id, client_id: cliente.id });
  // Lo MISMO que ya salió (el mismo guion y la misma música: se volvió a la foto y se pide otra vez): el mp4 que hay se
  // pone en la publicación ya, sin renderizar otra vez.
  const hecho = leerJSON(fila.render, {});
  if (fila.estado === "renderizado" && hecho.estado === "listo" && hecho.clave && hecho.version === fila.version && musicaAntes === musica.id) {
    const r = await ligarAPublicacion(env, acceso, cliente, fila, { postId: post.id, calendarId: calId, por: por ?? undefined });
    return { video: r.video, musica: { id: musica.id, nombre: musica.nombre }, costo: 0, yaHecho: true, aviso: r.aviso || "Ya estaba hecho así: el reel volvió a la publicación sin renderizarlo otra vez." };
  }
  // Aprobado solo: lo decidió la persona al pedirlo (no hay voz que pagar ni texto que revisar). Un guion igual al de
  // antes (misma pista y duración) ya estaba aprobado: se renderiza otra vez tal cual.
  if (fila.estado === "borrador") {
    await aprobarProyecto(acceso, cliente, fila, { version: fila.version, usuario });
    fila = await acceso.leerUno("videos_proyectos", { id: fila.id, client_id: cliente.id });
  }
  const r = await pedirRender(env, acceso, cliente, fila, { version: fila.version, usuario, por });
  return {
    video: r.video, musica: { id: musica.id, nombre: musica.nombre }, costo: 0,
    aviso: `${FRASE_COSTO} Tarda menos de un minuto; al terminar, la publicación pasa a reel con el video y la foto de portada.`,
  };
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
  if (post.format === "carrusel") return { tipo: "a-mano", ...(await aManoConMusica(env, acceso, cliente, opciones)) };
  return { tipo: "reel", ...(await publicarConMusica(env, acceso, cliente, opciones)) };
}
