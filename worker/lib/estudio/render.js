// ============================================================
// El RENDER a mp4 del video animado: pedirlo, hacerlo (en el Container) y dejarlo donde se usa
//
//   · `pedirRender` (la ruta y las herramientas): sólo con el guion aprobado de esta versión y SU locución lista
//     (`puedeRenderizar`); pasa el proyecto a «Renderizando» con un `intento` nuevo y se lo encarga al Durable Object
//     del render (worker/contenedor.js, `RenderVideo`), que contesta en el acto. No gasta IA: es cómputo del Container
//     (unos 0,3 céntimos de dólar por video pasado lo que trae el plan, ver CLAUDE.md).
//   · `ejecutarRender` (la alarma de ese objeto): arma el pedido con lo de ESE cliente (el mismo de `ver_cuadro`) más la
//     toma de la voz, lo manda al Container y con el mp4: R2, la galería del Estudio (tipo «video», sin costo) y, si el
//     video va ligado a una publicación, en sus medios (en el sitio del render anterior de este video, o el primero).
//     Sólo si el proyecto sigue «Renderizando» con ESE intento: un encargo viejo no pisa uno nuevo.
//   · `renderAlDia`: un render que no terminó en `PLAZO_RENDER_MS` (el objeto murió a la mitad) se da por fallido al
//     leerlo, para que se pueda pedir otra vez y el guion se pueda editar.
//   · `barrerRendersVencidos` (el cron, cada 5 minutos): lo mismo SIN que nadie lo lea —antes un render muerto sólo se
//     daba por fallido al abrirlo, y «Publicar con música» se quedaba «haciéndose» para siempre—, y avisa.
//   · `ligarAPublicacion`: liga el video a una publicación del cliente (o lo desliga) en cualquier momento; si el mp4 ya
//     salió, lo pone en ella YA (sin volver a renderizar). Desligar no quita el mp4 del post de antes: eso se hace en él.
// ============================================================

import { carpetaDelVideo, alFrenteDelOrden } from "./carpetaVideo.js";
import { uuid, ahora } from "../ids.js";
import { crearAcceso, rendersVencidos } from "../acceso.js";
import { difundir } from "../vivo.js";
import { ErrorVideo, deFila, publicacionDelCliente, ID_VIDEO } from "../videosProyectos.js";
import { marcarUso } from "./galeria.js";
import { cambiarPublicacion } from "./ponerEnPost.js";
import { conVideoEnPost, rellenarVacios } from "../../../src/lib/resultadoEnPost.js";
import { pedidoDelVideo, aBase64, subirClips, subirImagenes, sinLoQueNoSubio } from "./cuadros.js";
import { claveDeArchivo, claveDelCliente, slugCorto } from "./archivos.js";
import { puedeRenderizar, esMp4, PLAZO_RENDER_MS } from "../../../src/lib/renderVideo.js";
import { tieneHabla, lineaDeTiempo } from "../../../src/lib/videoEscenas.js";
import { instanteLleno } from "../../../src/lib/revisionEscenas.js";
import { limpiarSonido, SITIOS_EFECTO } from "../../../src/lib/sonidoVideo.js";
import { claveDeSonido } from "./sonidos.js";
import { MAX_BYTES_SONIDO } from "../../../src/lib/bibliotecaSonido.js";
import { dbDeVolumenGuion } from "../../../src/lib/musica.js";
import { avisarRender } from "../equipo.js";
import { esVideoDeFoto, postConMusica } from "../../../src/lib/conMusica.js";
import { esCancion } from "../../../src/lib/videoCancion.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };
const SISTEMA = { userId: "sistema", nombre: "Render", color: "", tab: null };
/** La voz que se manda al Container: una toma de un video corto son cientos de kB. */
const TOPE_VOZ = 20 * 1024 * 1024;
/** Lo que pesa como mucho la música de fondo (va en el mismo pedido que la voz). */
const TOPE_MUSICA = 15 * 1024 * 1024;
/** Lo que pesa como mucho un efecto de la biblioteca (van en el pedido, en base64). */
const TOPE_EFECTO = MAX_BYTES_SONIDO.efecto;

const avisar = (env, ownerId, clienteId, id, por = SISTEMA) => difundir(env, ownerId, { tipo: "videos", clienteId, id, por });

/**
 * Pide el render del video (la fila, con la `version` que se leyó). → { video }. 409 si no se puede todavía (con el
 * motivo), 503 sin Container (en local).
 */
export async function pedirRender(env, acceso, cliente, fila, { version, usuario, por }) {
  if (!Number.isInteger(version)) throw new ErrorVideo("Falta la versión que tenías abierta.", 400);
  if (version !== fila.version) throw new ErrorVideo("Otra persona cambió este video mientras lo tenías abierto. Vuelve a abrirlo.", 409, { video: deFila(fila) });
  const puede = puedeRenderizar({ ...fila, locucion: leerJSON(fila.locucion, {}), guion: leerJSON(fila.guion, null) });
  if (!puede.ok) throw new ErrorVideo(puede.motivo, 409);
  if (!env.RENDER) throw new ErrorVideo("El render no está disponible aquí (en local no hay Container: se prueba con container/probar.mjs).", 503);

  const anterior = leerJSON(fila.render, {});
  const intento = uuid();
  const momento = ahora();
  const render = {
    // `porId`: a quién le llega el aviso de la campana al terminar (equipo.js, `avisarRender`).
    estado: "en_curso", intento, version: fila.version, pedidoAt: momento, por: usuario?.nombre ?? null, porId: usuario?.id ?? null,
    // Lo que ya había salido se recuerda: si este falla, el mp4 anterior sigue en la galería y en la publicación.
    ...(anterior.estado === "listo" ? { anterior: { clave: anterior.clave, archivoId: anterior.archivoId, version: anterior.version } } : anterior.anterior ? { anterior: anterior.anterior } : {}),
  };
  const n = await acceso.actualizar("videos_proyectos", { id: fila.id, client_id: cliente.id, version: fila.version, estado: fila.estado },
    { estado: "renderizando", render: JSON.stringify(render), updated_at: momento });
  if (!n) throw new ErrorVideo("Otra persona cambió este video mientras lo pedías. Vuelve a abrirlo.", 409);

  try {
    const r = await env.RENDER.get(env.RENDER.idFromName(fila.id)).fetch(new Request("https://render/encargar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerId: acceso.ownerId, clienteId: cliente.id, videoId: fila.id, intento }),
    }));
    if (!r.ok) throw new Error(`el encargo respondió ${r.status}`);
  } catch (e) {
    await terminar(acceso, cliente.id, fila.id, intento, "fallido", { ...render, estado: "fallido", error: `No se pudo encargar el render: ${e?.message ?? e}` });
    throw new ErrorVideo("No se pudo encargar el render: inténtalo otra vez en un momento.", 503);
  }
  avisar(env, acceso.ownerId, cliente.id, fila.id, por);
  return { video: deFila({ ...fila, estado: "renderizando", render: JSON.stringify(render), updated_at: momento }) };
}

/** Cierra el render de ESE intento (si sigue siendo el que espera el proyecto). → si se escribió. */
async function terminar(acceso, clienteId, id, intento, estado, render) {
  const fila = await acceso.leerUno("videos_proyectos", { id, client_id: clienteId });
  if (!fila || fila.estado !== "renderizando" || leerJSON(fila.render, {}).intento !== intento) return false;
  return (await acceso.actualizar("videos_proyectos", { id, client_id: clienteId, estado: "renderizando" },
    { estado, render: JSON.stringify(render), updated_at: ahora() })) > 0;
}

/**
 * Pone el mp4 en la publicación ligada (en el sitio del render anterior de ESTE video; si el video salió del MONTAJE de
 * un reel, en el sitio del video crudo de ese reel; si no, el primero). → { calendarId, postId } si quedó puesto, o
 * { aviso } si no se pudo (la publicación ya no está, o ya se publicó). Con `rellenar` ({ descripcion, guion, portada }),
 * además pone esos textos donde la publicación los tiene VACÍOS.
 */
export async function ponerEnPublicacion(env, acceso, fila, medio, { rellenar = null, portadaMs = null } = {}) {
  if (!fila.calendar_id || !fila.post_id) return null;
  const origen = leerJSON(fila.origen, {});
  const esSuyo = (m) => m?.videoAnimado === fila.id || (origen.encargoId && m?.deReel === origen.encargoId);
  // Una FOTO CON MÚSICA (lib/conMusica.js): la publicación pasa a reel con el mp4 de único medio y la foto de portada, y
  // apunta lo de antes para «Volver a la foto». Si la foto ya no es la misma (se cambió mientras se hacía), no se toca.
  const deFoto = esVideoDeFoto(origen);
  const r = await cambiarPublicacion(env, acceso, {
    clienteId: fila.client_id, calendarId: fila.calendar_id, postId: fila.post_id, por: SISTEMA,
    cambiar: (post) => {
      if (deFoto) return postConMusica(post, medio, { videoId: fila.id, foto: origen.foto ?? "", ahora: ahora() });
      const con = conConPortada(conVideoEnPost(post, medio, esSuyo), portadaMs);
      // La estructura de guion que siguió la voz: la publicación la recuerda (si no tenía otra).
      const campos = { ...(rellenar ?? {}), ...(origen.estructuraId ? { estructura: origen.estructuraId } : {}) };
      return Object.keys(campos).length ? rellenarVacios(con, campos).post : con;
    },
  });
  if (r?.aviso) {
    // Las frases de siempre: el video quedó en la galería.
    if (/ya salió/.test(r.aviso)) return { aviso: "La publicación ya salió: el video quedó en la galería, sin tocarla." };
    if (/a la vez/.test(r.aviso)) return { aviso: "El calendario se estaba guardando a la vez: el video quedó en la galería; ponlo desde ahí." };
    return { aviso: "La publicación ligada ya no está en su calendario: el video quedó en la galería." };
  }
  if (deFoto && r?.sinCambios) return { aviso: "La foto de la publicación cambió mientras se hacía el video: quedó en la galería, sin tocarla." };
  return { calendarId: r.calendarId, postId: fila.post_id };
}

/**
 * El instante (ms) en que la PRIMERA escena está llena —su texto principal ya entero—: el cuadro que Instagram enseña
 * de portada del reel si no tiene imagen de portada (`thumb_offset`, publicador.js). Sin él enseñaba el primer cuadro,
 * donde el texto del gancho todavía no ha entrado (alfa 0): en el perfil se veía sólo el fondo. El mismo instante que
 * usa la hoja de escenas (`instanteLleno`). null si no se puede calcular. Pura.
 */
export function portadaDelVideo(guion, palabras = null) {
  try {
    if (!guion?.escenas?.length) return null;
    const ms = Math.round(instanteLleno(guion, lineaDeTiempo(guion, palabras), 0) * 1000);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
}

/**
 * El reel sin IMAGEN de portada (la que pone la persona en la pestaña Pieza, o la del Estudio) toma `portadaMs`, el
 * cuadro lleno de su video: en cada render, porque el guion pudo cambiar. Con imagen de portada no se toca nada (la
 * imagen manda en el publicador). Pura.
 */
export function conConPortada(post, portadaMs) {
  if (!Number.isFinite(portadaMs) || post?.format !== "reel" || String(post.portada ?? "").trim()) return post;
  return post.portadaMs === portadaMs ? post : { ...post, portadaMs };
}

/** El medio de la publicación con el mp4 de un video (`videoAnimado` dice de qué video es: el siguiente render lo cambia). */
const medioDelRender = (fila, { clave, ancho, alto, duracion }) => ({
  src: `/api/media/${clave}`, tipo: "video", nombre: `${slugCorto(fila.titulo, 60)}.mp4`, ancho, alto, duracion, videoAnimado: fila.id,
});

/**
 * Liga el video a una publicación de ESE cliente (`postId`, en cualquiera de sus meses; `calendarId` si se sabe) o lo
 * desliga (`postId` vacío). Si su mp4 ya está hecho, lo pone en ella ya. → { video, puesto, aviso }.
 */
export async function ligarAPublicacion(env, acceso, cliente, fila, { calendarId = null, postId = null, por = SISTEMA }) {
  if (fila.estado === "renderizando") throw new ErrorVideo("Se está renderizando: espera a que termine para cambiar su publicación.", 409);
  let liga = null;
  if (postId) {
    if (!ID_VIDEO.test(String(postId))) throw new ErrorVideo("Esa publicación no existe.", 400);
    liga = await publicacionDelCliente(acceso, cliente.id, String(postId));
    if (!liga || (calendarId && liga.calendarId !== String(calendarId))) throw new ErrorVideo("No encontré esa publicación en los calendarios de este cliente.", 404);
  }
  const momento = ahora();
  const cambios = { calendar_id: liga?.calendarId ?? null, post_id: liga?.postId ?? null, updated_at: momento };
  await acceso.actualizar("videos_proyectos", { id: fila.id, client_id: cliente.id }, cambios);
  let actual = { ...fila, ...cambios };
  let puesto = null;
  let aviso = null;
  const render = leerJSON(fila.render, {});
  if (liga && render.estado === "listo" && render.clave) {
    const r = await ponerEnPublicacion(env, acceso, actual, medioDelRender(actual, render), { portadaMs: render.portadaMs ?? null });
    puesto = r?.postId ? r : null;
    aviso = r?.aviso ?? null;
    if (puesto && render.archivoId) await marcarUso(acceso, cliente.id, render.archivoId, puesto).catch(() => null);
    const nuevo = { ...render, adjunto: puesto ? { calendarId: puesto.calendarId, postId: puesto.postId } : render.adjunto ?? null, aviso };
    await acceso.actualizar("videos_proyectos", { id: fila.id, client_id: cliente.id }, { render: JSON.stringify(nuevo) });
    actual = { ...actual, render: JSON.stringify(nuevo) };
  }
  avisar(env, acceso.ownerId, cliente.id, fila.id, por);
  return { video: deFila(actual), puesto, aviso };
}

/**
 * Hace el render encargado (la alarma de `RenderVideo`). `enviar(ruta, cuerpo)` → la Response del Container (JSON);
 * `pedir(ruta, init)`, un pedido crudo (los clips de video van por flujo con `subirClips`; sin él, salen con su «Video» de
 * espera). Nunca lanza: lo que falla queda escrito en el proyecto («Falló el render» con el motivo).
 */
export async function ejecutarRender(env, { ownerId, clienteId, videoId, intento }, enviar, pedir = null) {
  const acceso = crearAcceso(env.DB, ownerId);
  const fila = await acceso.leerUno("videos_proyectos", { id: videoId, client_id: clienteId }).catch(() => null);
  const render = leerJSON(fila?.render, {});
  if (!fila || fila.estado !== "renderizando" || render.intento !== intento) return null;
  const inicio = Date.now();
  // Si el Container se reinicia a mitad (ffmpeg muere con «signal 15»: otro pedido lo despertó o lo reemplazó), el render
  // se repite UNA vez desde el principio —con los clips subidos otra vez: un Container nuevo no los tiene— en vez de
  // quedarse «fallido» por algo que no es del video.
  for (let vuelta = 1; ; vuelta++) {
    try {
      return await renderUnaVez();
    } catch (e) {
      if (vuelta < 2 && esCorteDelContainer(e)) { console.error("render cortado, otra vez:", e?.message ?? e); continue; }
      console.error("render:", e?.message ?? e);
      const motivo = String(e?.message ?? e).slice(0, 400);
      const fallido = { ...render, estado: "fallido", error: motivo, terminadoAt: ahora() };
      const escrito = await terminar(acceso, clienteId, videoId, intento, "fallido", fallido).catch(() => false);
      avisar(env, ownerId, clienteId, videoId);
      if (escrito) await avisarRender(env, acceso, fila, fallido);
      return null;
    }
  }

  async function renderUnaVez() {
    const cliente = await acceso.leerUno("clients", { id: clienteId });
    if (!cliente) throw new Error("El cliente ya no existe.");
    const armado = await pedidoDelVideo(env, acceso, cliente, fila);
    const { clips, porSubir, guion, palabras } = armado;
    // Los clips de video y las imágenes que no cabían en el pedido, al Container del render por flujo ANTES del pedido.
    // Un clip que no sube sale con su «Video» de espera; una imagen, con su marcador.
    const fallaron = clips.length && pedir ? await subirClips(env, clips, pedir) : clips.map((c) => c.id);
    const imagenesFallidas = porSubir.length && pedir ? await subirImagenes(env, porSubir, pedir) : porSubir.map((c) => c.id);
    const { pedido } = sinLoQueNoSubio(armado, { clips: fallaron, imagenes: imagenesFallidas });
    const sinClips = [
      fallaron.length ? `No se pudo cargar ${fallaron.length === 1 ? "un clip de video" : `${fallaron.length} clips de video`}: ${fallaron.length === 1 ? "salió" : "salieron"} con el cuadro de espera.` : "",
      imagenesFallidas.length ? `No se pudo cargar ${imagenesFallidas.length === 1 ? "una imagen" : `${imagenesFallidas.length} imágenes`}: ${imagenesFallidas.length === 1 ? "salió" : "salieron"} como marcador.` : "",
    ].filter(Boolean).join(" ") || null;
    const son = await sonidoParaElContainer(env, fila, guion, { clienteId, ownerId });
    const { musica, sonido } = son;
    const r = await enviar("/render", { ...pedido, ...cuerpoDeSonido(son) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `El Container respondió ${r.status}.`);
    }
    const h = (k) => r.headers.get(k);
    const num = (k) => (h(k) === null || h(k) === "" ? null : Number(h(k)));
    const ancho = num("X-Ancho") ?? 0;
    const alto = num("X-Alto") ?? 0;
    const duracion = num("X-Duracion") ?? 0;

    const clave = claveDeArchivo(clienteId, `video ${fila.titulo}`, "video/mp4");
    const bytes = { byteLength: await guardarMp4(env, clave, r) };
    const medio = medioDelRender(fila, { clave, ancho, alto, duracion });
    const portadaMs = portadaDelVideo(guion, palabras);
    const puesto = await ponerEnPublicacion(env, acceso, fila, medio, { portadaMs });
    const momento = ahora();
    const archivoId = uuid();
    const usos = puesto?.postId ? [{ clave: `${puesto.calendarId}:${puesto.postId}`, calendarId: puesto.calendarId, postId: puesto.postId, en: momento }] : [];
    const datos = {
      duracion, cuadros: num("X-Cuadros"), ...(portadaMs ? { portadaMs } : {}), lufs: num("X-Lufs"), lufsAntes: num("X-Lufs-Antes"),
      ms: { audio: num("X-Ms-Audio"), video: num("X-Ms-Video"), total: Date.now() - inicio }, videoId: fila.id, version: render.version,
      efectos: sonido.efectos, musica: musica ? sonido.musica.nombre || "Música" : null,
      ...(sonido.efectos ? { cuantosEfectos: num("X-Efectos") ?? 0, ...(sonido.colocados?.length ? { colocados: sonido.colocados.length } : {}) } : {}),
      ...(Object.keys(son.propios).length && !sonido.colocados?.length ? {
        efectosPropios: Object.fromEntries(Object.entries(son.propios).filter(([, e]) => son.libreria[e.archivoId]).map(([x, e]) => [x, e.nombre || "Efecto"])),
      } : {}),
    };
    let avisoContainer = "";
    try { avisoContainer = decodeURIComponent(h("X-Efectos-Avisos") || ""); } catch { avisoContainer = ""; }
    const sinSitio = num("X-Efectos-Sin-Sitio") ?? 0;
    // En la galería, junto a lo suyo: en la carpeta del video (o de su reel) si la tiene; si no, como VERSIÓN del render
    // anterior de este video (worker/lib/estudio/carpetaVideo.js). Antes cada render quedaba suelto.
    const carpetaId = await carpetaDelVideo(acceso, clienteId, fila).catch(() => null);
    const deAntes = !carpetaId && render.anterior?.archivoId ? String(render.anterior.archivoId) : null;
    await acceso.insertar("estudio_archivos", {
      id: archivoId, client_id: clienteId, clave, tipo: "video", mime: "video/mp4", ancho, alto, bytes: bytes.byteLength,
      prompt: `Video animado: ${fila.titulo}`, modelo: "video-animado", ajustes: JSON.stringify({ ...datos, ...(deAntes ? { deArchivo: deAntes } : {}) }), trabajo_id: null, carpeta_id: carpetaId,
      origen: "estudio", costo: 0, favorito: 0, subido: 0, usado_en: JSON.stringify(usos), borrado_at: null, created_at: momento, updated_at: momento,
    });
    if (carpetaId) await alFrenteDelOrden(acceso, clienteId, carpetaId, archivoId).catch(() => null);
    const listo = {
      ...render, estado: "listo", clave, archivoId, bytes: bytes.byteLength, ancho, alto, ...datos, terminadoAt: momento,
      adjunto: puesto?.postId ? { calendarId: puesto.calendarId, postId: puesto.postId } : null,
      aviso: [sinClips, ...son.avisos, avisoContainer, sinSitio ? `${sinSitio === 1 ? "Un efecto de la lista no sonó" : `${sinSitio} efectos de la lista no sonaron`}: su momento ya no existe (míralo con escuchar_video).` : "", puesto?.aviso].filter(Boolean).join(" ") || null,
    };
    delete listo.anterior;
    const escrito = await terminar(acceso, clienteId, videoId, intento, "renderizado", listo);
    avisar(env, ownerId, clienteId, videoId);
    // A la campana de quien lo pidió: el render sigue aunque se cierre la aplicación, y si no, nadie se enteraba.
    if (escrito) await avisarRender(env, acceso, fila, listo);
    return listo;
  }
}

/**
 * Lo que SUENA, listo para el Container (el render y la escucha mandan lo mismo): la toma de la voz (o la canción ya
 * grabada), la música de fondo (la de «Sonido» o, sin ella, la del guion) y los efectos: la lista colocada, los de la
 * biblioteca que usa (en base64, como mucho 2 MB cada uno) y los que sustituyen a los automáticos. Lo que ya no está no
 * tumba nada: va en `avisos`. `vozOpcional`: sin locución todavía no falla (escuchar antes de pagar la voz).
 * → { audio, musica, nombreMusica, sonido, propios, libreria, avisos, conCancion }.
 */
export async function sonidoParaElContainer(env, fila, guion, { clienteId, ownerId, vozOpcional = false }) {
  // Un montaje sin habla no tiene locución: el audio es el de los clips (y la música).
  let audio = null;
  const avisos = [];
  // Con una CANCIÓN ya grabada (src/lib/videoCancion.js) la toma ES la canción: del cliente o de la biblioteca de la
  // agencia de este espacio. Sin silencios (la línea de tiempo no los pone) y el video dura lo que ella.
  const locucion = leerJSON(fila.locucion, {});
  const conCancion = esCancion(locucion);
  if (tieneHabla(guion)) {
    const claveVoz = conCancion ? claveDeSonido(locucion.clave, clienteId, ownerId) : claveDelCliente(locucion.clave, clienteId);
    const voz = claveVoz && (!vozOpcional || locucion.estado === "lista" || conCancion) ? await env.MEDIA.get(claveVoz) : null;
    if (!voz && !vozOpcional) throw new Error(conCancion ? "No encontré el audio de la canción: ¿se quitó de la biblioteca de sonido?" : "No encontré el audio de la locución: genérala otra vez.");
    if (voz && voz.size > TOPE_VOZ) throw new Error(conCancion ? "La canción pesa demasiado." : "El audio de la locución pesa demasiado.");
    if (voz) audio = aBase64(new Uint8Array(await voz.arrayBuffer()));
    else avisos.push("Aún no hay voz: se escucha sin ella, con los tiempos estimados.");
  }

  // El sonido de debajo (efectos y música): aparte del guion. Una música que ya no está no tumba el render: va sin ella.
  const sonido = limpiarSonido(leerJSON(fila.sonido, {}));
  // Con una canción, la música de «Sonido» (y la del guion) se ignora: la canción ya es la música. Los efectos siguen.
  if (conCancion && sonido.musica) avisos.push(`La música de «Sonido» («${sonido.musica.nombre || "Música"}») no sonó: la canción ya es la música.`);
  if (conCancion) sonido.musica = null;
  // Sin música escogida en «Sonido», la que el GUION trae por su clave (con su volumen 0–1 pasado a dB).
  if (!sonido.musica && !conCancion) {
    const delGuion = leerJSON(fila.guion, {})?.musica;
    if (delGuion?.clave && claveDelCliente(delGuion.clave, clienteId)) {
      sonido.musica = { archivoId: "guion", clave: delGuion.clave, nombre: "La música del guion", volumen: dbDeVolumenGuion(delGuion.volumen ?? 0.35) };
    }
  }
  let musica = null;
  // La música puede ser de la biblioteca del cliente o de la de la AGENCIA (de este espacio): `claveDeSonido`.
  const claveMusica = sonido.musica ? claveDeSonido(sonido.musica.clave, clienteId, ownerId) : null;
  if (sonido.musica) {
    const obj = claveMusica ? await env.MEDIA.get(claveMusica) : null;
    if (!obj) avisos.push("La música de fondo ya no está en la galería: salió sin ella.");
    else if (obj.size > TOPE_MUSICA) avisos.push("La música de fondo pesa más de 15 MB: salió sin ella.");
    else musica = { audio: aBase64(new Uint8Array(await obj.arrayBuffer())), volumen: sonido.musica.volumen };
  }

  // Los EFECTOS de la biblioteca que se usan (los de la lista colocada y los que sustituyen a los automáticos), sólo con
  // los efectos encendidos. Uno que ya no está no tumba nada: un automático suena con el de la aplicación; uno de la
  // lista, no suena. Se dice.
  const propios = {};
  const libreria = {};
  if (sonido.efectos) {
    const conLista = Boolean(sonido.colocados?.length);
    const piden = new Map();
    if (!conLista) {
      for (const sitio of SITIOS_EFECTO) {
        const e = sonido.efectosPropios?.[sitio];
        if (!e) continue;
        propios[sitio] = { archivoId: e.archivoId, nombre: e.nombre || "Efecto" };
        piden.set(e.archivoId, e);
      }
    }
    for (const c of sonido.colocados ?? []) if (c.propio) piden.set(c.propio.archivoId, c.propio);
    const sinEfecto = [];
    for (const e of piden.values()) {
      const clave = claveDeSonido(e.clave, clienteId, ownerId);
      const obj = clave ? await env.MEDIA.get(clave) : null;
      if (!obj || obj.size > TOPE_EFECTO * 1.1) sinEfecto.push(e.nombre || "un efecto");
      else libreria[e.archivoId] = aBase64(new Uint8Array(await obj.arrayBuffer()));
    }
    // Un sustituto que no se pudo leer no se manda: suena el automático de la aplicación (y aquí se dice).
    for (const sitio of Object.keys(propios)) if (!libreria[propios[sitio].archivoId]) delete propios[sitio];
    if (sinEfecto.length) {
      avisos.push(`${sinEfecto.length === 1 ? `El efecto «${sinEfecto[0]}» ya no está` : `Los efectos ${sinEfecto.map((x) => `«${x}»`).join(" y ")} ya no están`} en la biblioteca: ${conLista ? "no sonó" : "sonó el de la aplicación"}.`);
    }
  }
  return { audio, musica, nombreMusica: musica ? sonido.musica.nombre || "Música" : null, sonido, propios, libreria, avisos, conCancion };
}

/** El sonido de `sonidoParaElContainer` como va en el cuerpo del pedido al Container. */
export function cuerpoDeSonido(son) {
  return {
    ...(son.audio ? { audio: son.audio } : {}), efectos: son.sonido.efectos, ...(son.musica ? { musica: son.musica } : {}),
    ...(son.sonido.colocados?.length ? { colocados: son.sonido.colocados } : {}),
    ...(Object.keys(son.propios).length ? { propios: son.propios } : {}),
    ...(Object.keys(son.libreria).length ? { libreria: son.libreria } : {}),
  };
}

/** ¿El render se cortó porque el Container se reinició (no por el video)? «signal 15» / SIGTERM, o se cayó la conexión. */
export const esCorteDelContainer = (e) => /signal 15|SIGTERM|SIGKILL|connection (reset|lost|closed)|Network connection lost|container (restarted|stopped|exited)/i.test(String(e?.message ?? e));

/**
 * El mp4 que devuelve el Container, a R2 POR FLUJO (→ lo que pesa). Leerlo entero en memoria reventaba el Durable
 * Object («Memory limit exceeded before EOF»): un video de 100 s con fondos de imagen y grano pasa de 100 MB, y el objeto
 * tiene 128. R2 pide saber el largo de un flujo (`FixedLengthStream`, del runtime de Workers): el Container lo dice en
 * `X-Bytes` (o `Content-Length`). Los primeros bytes se miran al pasar, y si no es un mp4 se borra y falla. Sin largo o
 * fuera de Workers (las pruebas), como antes: entero en memoria.
 */
export async function guardarMp4(env, clave, r) {
  const largo = Number(r.headers.get("X-Bytes") || r.headers.get("Content-Length") || 0);
  const Fijo = globalThis.FixedLengthStream;
  if (!(largo > 0) || typeof Fijo !== "function" || !r.body) {
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (!esMp4(bytes)) throw new Error("El Container no devolvió un mp4.");
    await env.MEDIA.put(clave, bytes, { httpMetadata: { contentType: "video/mp4" } });
    return bytes.byteLength;
  }
  let cabeza = new Uint8Array(0);
  const mirar = new TransformStream({
    transform(trozo, ctl) {
      if (cabeza.length < 16) {
        const junto = new Uint8Array(cabeza.length + trozo.length);
        junto.set(cabeza);
        junto.set(trozo, cabeza.length);
        cabeza = junto.slice(0, 16);
      }
      ctl.enqueue(trozo);
    },
  });
  const fijo = new Fijo(largo);
  await env.MEDIA.put(clave, r.body.pipeThrough(mirar).pipeThrough(fijo), { httpMetadata: { contentType: "video/mp4" } });
  if (!esMp4(cabeza)) {
    await env.MEDIA.delete(clave).catch(() => {});
    throw new Error("El Container no devolvió un mp4.");
  }
  return largo;
}

/**
 * Un render que pasó su plazo sin terminar (el objeto murió a la mitad) se da por fallido al leerlo. → la fila, al día.
 */
export async function renderAlDia(acceso, fila, ahoraMs = Date.now()) {
  if (fila?.estado !== "renderizando") return fila;
  const render = leerJSON(fila.render, {});
  const desde = Date.parse(render.pedidoAt ?? fila.updated_at);
  if (!(ahoraMs - desde > PLAZO_RENDER_MS)) return fila;
  const cerrado = { ...render, estado: "fallido", error: "El render no terminó a tiempo: vuelve a pedirlo.", terminadoAt: ahora() };
  const escrito = await terminar(acceso, fila.client_id, fila.id, render.intento, "fallido", cerrado);
  return escrito ? { ...fila, estado: "fallido", render: JSON.stringify(cerrado) } : fila;
}

/** El minuto (de cada 5) en que el cron barre los renders vencidos: así no coincide con la fecha límite (salud.js). */
const MINUTO_BARRIDO = 3;

/**
 * Del cron, cada 5 minutos: los renders que pasaron su plazo sin terminar (el objeto murió a la mitad) se dan por
 * fallidos AUNQUE nadie los lea (`renderAlDia`), se avisa a quien lo pidió (o, si no se sabe, al administrador) y, si era
 * un «Publicar con música», su publicación deja de decir que se está haciendo. Sin nada vencido, una consulta. → 1 si
 * hizo algo.
 */
export async function barrerRendersVencidos(env, cuando = new Date()) {
  if (cuando.getUTCMinutes() % 5 !== MINUTO_BARRIDO) return 0;
  const vencidos = await rendersVencidos(env.DB, new Date(cuando.getTime() - PLAZO_RENDER_MS).toISOString(), 2);
  if (!vencidos.length) return 0;
  for (const v of vencidos) {
    try {
      const acceso = crearAcceso(env.DB, v.owner_id);
      const fila = await acceso.leerUno("videos_proyectos", { id: v.id, client_id: v.client_id });
      const alDia = fila ? await renderAlDia(acceso, fila, cuando.getTime()) : null;
      if (!alDia || alDia === fila || alDia.estado !== "fallido") continue;
      const render = leerJSON(alDia.render, {});
      const origen = leerJSON(alDia.origen, {});
      avisar(env, v.owner_id, v.client_id, v.id);
      if (render.porId) await avisarRender(env, acceso, alDia, render);
      else if (origen.tipo !== "reel") {
        // Sin quién lo pidió (un encargo de antes): al administrador, una vez. En salud.js: estático sería un ciclo.
        const { avisarAdministradores } = await import("../salud.js");
        await avisarAdministradores(env, {
          clave: `render:${v.id}:${render.intento ?? ""}`, tipo: "render-fallo", enlace: `/cliente/${encodeURIComponent(v.client_id)}/estudio`,
          texto: `Falló el render del video «${String(alDia.titulo || "sin título").slice(0, 80)}»: no terminó a tiempo. Vuelve a pedirlo.`,
        }, { soloEspacio: v.owner_id });
      }
      if (esVideoDeFoto(origen) && alDia.calendar_id && alDia.post_id) {
        await cambiarPublicacion(env, acceso, {
          clienteId: v.client_id, calendarId: alDia.calendar_id, postId: alDia.post_id, por: SISTEMA,
          cambiar: (post) => {
            if (post?.conMusicaPendiente?.videoId !== v.id) return null;
            const { conMusicaPendiente, ...resto } = post;
            void conMusicaPendiente;
            return resto;
          },
        });
      }
    } catch (e) {
      console.error("cron renders vencidos:", v.id, e?.message ?? e);
    }
  }
  return 1;
}
