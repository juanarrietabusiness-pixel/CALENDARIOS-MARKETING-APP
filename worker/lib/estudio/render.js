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
import { resincronizarCalendario } from "../publicador.js";
import { pedidoDelVideo, aBase64 } from "./cuadros.js";
import { claveDeArchivo, claveDelCliente, slugCorto } from "./archivos.js";
import { puedeRenderizar, esMp4, PLAZO_RENDER_MS } from "../../../src/lib/renderVideo.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };
const SISTEMA = { userId: "sistema", nombre: "Render", color: "", tab: null };
/** La voz que se manda al Container: una toma de un video corto son cientos de kB. */
const TOPE_VOZ = 20 * 1024 * 1024;

const avisar = (env, ownerId, clienteId, id, por = SISTEMA) => difundir(env, ownerId, { tipo: "videos", clienteId, id, por });

/**
 * Pide el render del video (la fila, con la `version` que se leyó). → { video }. 409 si no se puede todavía (con el
 * motivo), 503 sin Container (en local).
 */
export async function pedirRender(env, acceso, cliente, fila, { version, usuario, por }) {
  if (!Number.isInteger(version)) throw new ErrorVideo("Falta la versión que tenías abierta.", 400);
  if (version !== fila.version) throw new ErrorVideo("Otra persona cambió este video mientras lo tenías abierto. Vuelve a abrirlo.", 409, { video: deFila(fila) });
  const puede = puedeRenderizar({ ...fila, locucion: leerJSON(fila.locucion, {}) });
  if (!puede.ok) throw new ErrorVideo(puede.motivo, 409);
  if (!env.RENDER) throw new ErrorVideo("El render no está disponible aquí (en local no hay Container: se prueba con container/probar.mjs).", 503);

  const anterior = leerJSON(fila.render, {});
  const intento = uuid();
  const momento = ahora();
  const render = {
    estado: "en_curso", intento, version: fila.version, pedidoAt: momento, por: usuario?.nombre ?? null,
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
 * Pone el mp4 en la publicación ligada (en el sitio del render anterior de ESTE video, o el primero). → { calendarId,
 * postId } si quedó puesto, o { aviso } si no se pudo (la publicación ya no está, o ya se publicó).
 */
export async function ponerEnPublicacion(env, acceso, fila, medio) {
  if (!fila.calendar_id || !fila.post_id) return null;
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const cal = await acceso.leerUno("calendars", { id: fila.calendar_id, client_id: fila.client_id });
    const dias = leerJSON(cal?.days, []);
    const dia = Array.isArray(dias) ? dias.find((d) => (d?.posts ?? []).some((p) => p?.id === fila.post_id)) : null;
    if (!cal || !dia) return { aviso: "La publicación ligada ya no está en su calendario: el video quedó en la galería." };
    const i = dia.posts.findIndex((p) => p?.id === fila.post_id);
    const post = dia.posts[i];
    if (post.status === "published") return { aviso: "La publicación ya salió: el video quedó en la galería, sin tocarla." };
    const medios = Array.isArray(post.medios) ? [...post.medios] : [];
    const k = medios.findIndex((m) => m?.videoAnimado === fila.id);
    if (k >= 0) medios[k] = medio; else medios.unshift(medio);
    dia.posts[i] = { ...post, medios, mediosCambiadosAt: ahora() };
    // Con la fecha que se leyó como condición: si otra persona guardó el calendario entremedias, se vuelve a leer.
    const n = await acceso.actualizar("calendars", { id: cal.id, client_id: fila.client_id, updated_at: cal.updated_at }, { days: JSON.stringify(dias), updated_at: ahora() });
    if (!n) continue;
    const crudo = await acceso.leerUno("calendars", { id: cal.id });
    try { await resincronizarCalendario(env, acceso, crudo, SISTEMA); } catch (e) { console.error("render resincronizar:", e); }
    difundir(env, acceso.ownerId, { tipo: "calendario:recargar", id: cal.id, clientId: fila.client_id, por: SISTEMA });
    return { calendarId: cal.id, postId: fila.post_id };
  }
  return { aviso: "El calendario se estaba guardando a la vez: el video quedó en la galería; ponlo desde ahí." };
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
 * Hace el render encargado (la alarma de `RenderVideo`). `enviar(ruta, cuerpo)` → la Response del Container. Nunca
 * lanza: lo que falla queda escrito en el proyecto («Falló el render» con el motivo).
 */
export async function ejecutarRender(env, { ownerId, clienteId, videoId, intento }, enviar) {
  const acceso = crearAcceso(env.DB, ownerId);
  const fila = await acceso.leerUno("videos_proyectos", { id: videoId, client_id: clienteId }).catch(() => null);
  const render = leerJSON(fila?.render, {});
  if (!fila || fila.estado !== "renderizando" || render.intento !== intento) return null;
  const inicio = Date.now();
  try {
    const cliente = await acceso.leerUno("clients", { id: clienteId });
    if (!cliente) throw new Error("El cliente ya no existe.");
    const { pedido } = await pedidoDelVideo(env, acceso, cliente, fila);
    const locucion = leerJSON(fila.locucion, {});
    const claveVoz = claveDelCliente(locucion.clave, clienteId);
    const voz = claveVoz ? await env.MEDIA.get(claveVoz) : null;
    if (!voz) throw new Error("No encontré el audio de la locución: genérala otra vez.");
    if (voz.size > TOPE_VOZ) throw new Error("El audio de la locución pesa demasiado.");
    const audio = aBase64(new Uint8Array(await voz.arrayBuffer()));

    const r = await enviar("/render", { ...pedido, audio });
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
    };
    await acceso.insertar("estudio_archivos", {
      id: archivoId, client_id: clienteId, clave, tipo: "video", mime: "video/mp4", ancho, alto, bytes: bytes.byteLength,
      prompt: `Video animado: ${fila.titulo}`, modelo: "video-animado", ajustes: JSON.stringify(datos), trabajo_id: null, carpeta_id: null,
      origen: "estudio", costo: 0, favorito: 0, subido: 0, usado_en: JSON.stringify(usos), borrado_at: null, created_at: momento, updated_at: momento,
    });
    const listo = {
      ...render, estado: "listo", clave, archivoId, bytes: bytes.byteLength, ancho, alto, ...datos, terminadoAt: momento,
      adjunto: puesto?.postId ? { calendarId: puesto.calendarId, postId: puesto.postId } : null, aviso: puesto?.aviso ?? null,
    };
    delete listo.anterior;
    await terminar(acceso, clienteId, videoId, intento, "renderizado", listo);
    avisar(env, ownerId, clienteId, videoId);
    return listo;
  } catch (e) {
    console.error("render:", e?.message ?? e);
    const motivo = String(e?.message ?? e).slice(0, 400);
    await terminar(acceso, clienteId, videoId, intento, "fallido", { ...render, estado: "fallido", error: motivo, terminadoAt: ahora() }).catch(() => {});
    avisar(env, ownerId, clienteId, videoId);
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
