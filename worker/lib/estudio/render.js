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
//   · `ligarAPublicacion`: liga el video a una publicación del cliente (o lo desliga) en cualquier momento; si el mp4 ya
//     salió, lo pone en ella YA (sin volver a renderizar). Desligar no quita el mp4 del post de antes: eso se hace en él.
// ============================================================

import { uuid, ahora } from "../ids.js";
import { crearAcceso } from "../acceso.js";
import { difundir } from "../vivo.js";
import { ErrorVideo, deFila, publicacionDelCliente, ID_VIDEO } from "../videosProyectos.js";
import { marcarUso } from "./galeria.js";
import { cambiarPublicacion } from "./ponerEnPost.js";
import { conVideoEnPost, rellenarVacios } from "../../../src/lib/resultadoEnPost.js";
import { pedidoDelVideo, aBase64, subirClips } from "./cuadros.js";
import { claveDeArchivo, claveDelCliente, slugCorto } from "./archivos.js";
import { puedeRenderizar, esMp4, PLAZO_RENDER_MS } from "../../../src/lib/renderVideo.js";
import { tieneHabla } from "../../../src/lib/videoEscenas.js";
import { limpiarSonido, SITIOS_EFECTO } from "../../../src/lib/sonidoVideo.js";
import { claveDeSonido } from "./sonidos.js";
import { MAX_BYTES_SONIDO } from "../../../src/lib/bibliotecaSonido.js";
import { dbDeVolumenGuion } from "../../../src/lib/musica.js";
import { avisarRender } from "../equipo.js";
import { esVideoDeFoto, postConMusica } from "../../../src/lib/conMusica.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };
const SISTEMA = { userId: "sistema", nombre: "Render", color: "", tab: null };
/** La voz que se manda al Container: una toma de un video corto son cientos de kB. */
const TOPE_VOZ = 20 * 1024 * 1024;
/** Lo que pesa como mucho la música de fondo (va en el mismo pedido que la voz). */
const TOPE_MUSICA = 15 * 1024 * 1024;
/** Lo que pesa como mucho un efecto de la biblioteca (los dos van en el pedido, en base64). */
const TOPE_EFECTO = MAX_BYTES_SONIDO.efecto;
/** El efecto sintetizado al que sustituye cada efecto de la biblioteca (src/lib/efectosSonido.js). */
const SINTETIZADO = Object.freeze({ transicion: "whoosh", sello: "pop" });

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
export async function ponerEnPublicacion(env, acceso, fila, medio, { rellenar = null } = {}) {
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
      const con = conVideoEnPost(post, medio, esSuyo);
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
    const r = await ponerEnPublicacion(env, acceso, actual, medioDelRender(actual, render));
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
  try {
    const cliente = await acceso.leerUno("clients", { id: clienteId });
    if (!cliente) throw new Error("El cliente ya no existe.");
    const { pedido: base, clips, guion } = await pedidoDelVideo(env, acceso, cliente, fila);
    // Los clips de video, al Container del render por flujo ANTES del pedido. Uno que no sube sale con su «Video» de espera.
    const fallaron = clips.length && pedir ? await subirClips(env, clips, pedir) : clips.map((c) => c.id);
    const pedido = { ...base, videos: base.videos.filter((id) => !fallaron.includes(id)) };
    const sinClips = fallaron.length ? `No se pudo cargar ${fallaron.length === 1 ? "un clip de video" : `${fallaron.length} clips de video`}: ${fallaron.length === 1 ? "salió" : "salieron"} con el cuadro de espera.` : null;
    // Un montaje sin habla no tiene locución: el audio es el de los clips (y la música).
    let audio = null;
    if (tieneHabla(guion)) {
      const locucion = leerJSON(fila.locucion, {});
      const claveVoz = claveDelCliente(locucion.clave, clienteId);
      const voz = claveVoz ? await env.MEDIA.get(claveVoz) : null;
      if (!voz) throw new Error("No encontré el audio de la locución: genérala otra vez.");
      if (voz.size > TOPE_VOZ) throw new Error("El audio de la locución pesa demasiado.");
      audio = aBase64(new Uint8Array(await voz.arrayBuffer()));
    }

    // El sonido de debajo (efectos y música): aparte del guion. Una música que ya no está no tumba el render: va sin ella.
    const sonido = limpiarSonido(leerJSON(fila.sonido, {}));
    // Sin música escogida en «Sonido», la que el GUION trae por su clave (con su volumen 0–1 pasado a dB).
    if (!sonido.musica) {
      const delGuion = leerJSON(fila.guion, {})?.musica;
      if (delGuion?.clave && claveDelCliente(delGuion.clave, clienteId)) {
        sonido.musica = { archivoId: "guion", clave: delGuion.clave, nombre: "La música del guion", volumen: dbDeVolumenGuion(delGuion.volumen ?? 0.35) };
      }
    }
    let musica = null;
    let sinMusica = null;
    // La música puede ser de la biblioteca del cliente o de la de la AGENCIA (de este espacio): `claveDeSonido`.
    const claveMusica = sonido.musica ? claveDeSonido(sonido.musica.clave, clienteId, ownerId) : null;
    if (sonido.musica) {
      const obj = claveMusica ? await env.MEDIA.get(claveMusica) : null;
      if (!obj) sinMusica = "La música de fondo ya no está en la galería: salió sin ella.";
      else if (obj.size > TOPE_MUSICA) sinMusica = "La música de fondo pesa más de 15 MB: salió sin ella.";
      else musica = { audio: aBase64(new Uint8Array(await obj.arrayBuffer())), volumen: sonido.musica.volumen };
    }

    // Los EFECTOS de la biblioteca (en vez del whoosh y del pop sintetizados), sólo con los efectos encendidos. Uno que ya
    // no está no tumba el render: suena el sintetizado y se dice.
    const efectosPropios = {};
    const sinEfecto = [];
    if (sonido.efectos) {
      for (const sitio of SITIOS_EFECTO) {
        const e = sonido.efectosPropios?.[sitio];
        if (!e) continue;
        const clave = claveDeSonido(e.clave, clienteId, ownerId);
        const obj = clave ? await env.MEDIA.get(clave) : null;
        if (!obj || obj.size > TOPE_EFECTO * 1.1) sinEfecto.push(e.nombre || "un efecto");
        else efectosPropios[SINTETIZADO[sitio]] = aBase64(new Uint8Array(await obj.arrayBuffer()));
      }
    }
    const avisoEfectos = sinEfecto.length ? `${sinEfecto.length === 1 ? `El efecto «${sinEfecto[0]}» ya no está` : `Los efectos ${sinEfecto.map((x) => `«${x}»`).join(" y ")} ya no están`}: sonó el de la aplicación.` : null;

    const r = await enviar("/render", {
      ...pedido, ...(audio ? { audio } : {}), efectos: sonido.efectos, ...(musica ? { musica } : {}),
      ...(Object.keys(efectosPropios).length ? { efectosPropios } : {}),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `El Container respondió ${r.status}.`);
    }
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (!esMp4(bytes)) throw new Error("El Container no devolvió un mp4.");
    const h = (k) => r.headers.get(k);
    const num = (k) => (h(k) === null || h(k) === "" ? null : Number(h(k)));
    const ancho = num("X-Ancho") ?? 0;
    const alto = num("X-Alto") ?? 0;
    const duracion = num("X-Duracion") ?? 0;

    const clave = claveDeArchivo(clienteId, `video ${fila.titulo}`, "video/mp4");
    await env.MEDIA.put(clave, bytes, { httpMetadata: { contentType: "video/mp4" } });
    const medio = medioDelRender(fila, { clave, ancho, alto, duracion });
    const puesto = await ponerEnPublicacion(env, acceso, fila, medio);
    const momento = ahora();
    const archivoId = uuid();
    const usos = puesto?.postId ? [{ clave: `${puesto.calendarId}:${puesto.postId}`, calendarId: puesto.calendarId, postId: puesto.postId, en: momento }] : [];
    const datos = {
      duracion, cuadros: num("X-Cuadros"), lufs: num("X-Lufs"), lufsAntes: num("X-Lufs-Antes"),
      ms: { audio: num("X-Ms-Audio"), video: num("X-Ms-Video"), total: Date.now() - inicio }, videoId: fila.id, version: render.version,
      efectos: sonido.efectos, musica: musica ? sonido.musica.nombre || "Música" : null,
      ...(Object.keys(efectosPropios).length ? {
        efectosPropios: Object.fromEntries(SITIOS_EFECTO.filter((x) => efectosPropios[SINTETIZADO[x]]).map((x) => [x, sonido.efectosPropios[x].nombre || "Efecto"])),
      } : {}),
    };
    await acceso.insertar("estudio_archivos", {
      id: archivoId, client_id: clienteId, clave, tipo: "video", mime: "video/mp4", ancho, alto, bytes: bytes.byteLength,
      prompt: `Video animado: ${fila.titulo}`, modelo: "video-animado", ajustes: JSON.stringify(datos), trabajo_id: null, carpeta_id: null,
      origen: "estudio", costo: 0, favorito: 0, subido: 0, usado_en: JSON.stringify(usos), borrado_at: null, created_at: momento, updated_at: momento,
    });
    const listo = {
      ...render, estado: "listo", clave, archivoId, bytes: bytes.byteLength, ancho, alto, ...datos, terminadoAt: momento,
      adjunto: puesto?.postId ? { calendarId: puesto.calendarId, postId: puesto.postId } : null,
      aviso: [sinClips, sinMusica, avisoEfectos, puesto?.aviso].filter(Boolean).join(" ") || null,
    };
    delete listo.anterior;
    const escrito = await terminar(acceso, clienteId, videoId, intento, "renderizado", listo);
    avisar(env, ownerId, clienteId, videoId);
    // A la campana de quien lo pidió: el render sigue aunque se cierre la aplicación, y si no, nadie se enteraba.
    if (escrito) await avisarRender(env, acceso, fila, listo);
    return listo;
  } catch (e) {
    console.error("render:", e?.message ?? e);
    const motivo = String(e?.message ?? e).slice(0, 400);
    const fallido = { ...render, estado: "fallido", error: motivo, terminadoAt: ahora() };
    const escrito = await terminar(acceso, clienteId, videoId, intento, "fallido", fallido).catch(() => false);
    avisar(env, ownerId, clienteId, videoId);
    if (escrito) await avisarRender(env, acceso, fila, fallido);
    return null;
  }
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
