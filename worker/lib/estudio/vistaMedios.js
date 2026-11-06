// ============================================================
// Los AUDIOS y VIDEOS de la vista previa del chat de Claude (MCP Apps, worker/lib/mcpVista/)
//
// Lo que se OYE o se REPRODUCE no cabe en el resultado de una herramienta como una imagen: va por su dirección firmada
// y de corta vida (worker/lib/medioVista.js), que la página carga en un <audio> o un <video>. Aquí se arma cada uno
// (`medioDe` con su dirección, su `ref` para firmar otra cuando caduque, su duración y su voz) a partir de lo que ya
// guarda la aplicación:
//   · la MUESTRA de una voz (R2, `voces/…`, de toda la agencia) y la LOCUCIÓN de un video (la galería del cliente);
//   · la MÚSICA de Suno (las dos versiones, en la galería);
//   · el MP4 de un video animado (su render) y los videos de un reel (el montaje, el video o los clips);
//   · un video del Estudio (crear_en_estudio de video).
// El asistente de la aplicación recibe sólo el texto (la vista es del chat de Claude). Las direcciones también van en el
// texto (`lineasDeMedios`), para que Claude se las pueda dar a la persona si su cliente no pinta vistas.
//
// Aparte de vistaEstudio.js a propósito: herramientas.js (la del asistente) lo importa, y vistaEstudio.js lee
// encargos.js (el ciclo de siempre: ver vistaTrabajo.js).
// ============================================================

import { direccionDeVista, VIDA_MEDIO_VISTA_MS } from "../medioVista.js";
import { medioDe, vistaDe, MAX_MEDIOS } from "../mcpVista/modelo.js";
import { claveDeMuestra, HUELLA, locucionAlDia } from "./locucion.js";
import { renderAlDia } from "./render.js";
import { claveDelCliente } from "./archivos.js";
import { deFila } from "../videosProyectos.js";
import { modeloDeVoz } from "../../../src/lib/voces.js";
import { NOMBRE_ESTADO_VIDEO } from "../../../src/lib/videoEscenas.js";

const leerJSON = (t, def) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? def); } catch { return def; } };
export const esAudio = (f) => String(f?.mime ?? "").startsWith("audio/");
export const esVideo = (f) => String(f?.mime ?? "").startsWith("video/");
/** El id de una voz como lo nombra la clave de su muestra (los de ElevenLabs son letras y números). */
const ID_VOZ = /^[A-Za-z0-9_-]{1,64}$/;
/** Las columnas de una ficha de la galería que hacen falta para enseñarla como audio o video. */
export const COLUMNAS_MEDIO = ["id", "clave", "mime", "tipo", "prompt", "ajustes", "client_id", "borrado_at"];
const HORAS = Math.round(VIDA_MEDIO_VISTA_MS / 3600_000);

/** La dirección firmada de una clave; si no se puede (sin R2, clave rara), null: la vista dice que no se puede oír. */
async function firmada(env, clave) {
  try {
    return await direccionDeVista(env, clave);
  } catch (e) {
    console.warn("vista: no se pudo firmar", clave, e?.message ?? e);
    return null;
  }
}

/** Lo que identifica una muestra para volver a firmarla. */
export const refDeMuestra = (modelo, vozId, huella = "") => `muestra:${modelo}:${vozId}:${huella}`;

/** Un audio o video de la GALERÍA del cliente (sólo de su carpeta). `titulo`, `voz`, `duracion`, `nota`: lo que se dice. */
export async function medioDeArchivo(env, ficha, { titulo = "", voz = "", duracion = null, nota = "" } = {}) {
  const clave = claveDelCliente(ficha?.clave, ficha?.client_id);
  const d = clave ? await firmada(env, clave) : null;
  const aj = leerJSON(ficha?.ajustes, {});
  return medioDe({
    id: ficha.id, ref: `archivo:${ficha.id}`, url: d?.url ?? "", caduca: d?.caduca ?? null,
    titulo: titulo || ficha.prompt || (esVideo(ficha) ? "Video" : "Audio"), voz, duracion: duracion ?? aj.duracion ?? null, nota,
  });
}

/** La MUESTRA de una voz (de toda la agencia, bajo `voces/`). */
export async function audioDeMuestra(env, { modelo, vozId, huella = "", nombre = "", duracion = null }) {
  const clave = claveDeMuestra(modelo, vozId, huella);
  const d = await firmada(env, clave);
  const m = modeloDeVoz(modelo)?.clave ?? modelo;
  return medioDe({
    id: `muestra-${m}-${vozId}${huella ? `-${huella}` : ""}`, ref: refDeMuestra(m, vozId, huella), url: d?.url ?? "", caduca: d?.caduca ?? null,
    titulo: `Muestra de ${nombre || "la voz"}${huella ? " (tu texto)" : ""}`, voz: nombre, duracion, nota: `${modeloDeVoz(m)?.nombre ?? m}`,
  });
}

/**
 * Las líneas para el modelo con las direcciones de lo que se oye o se ve: así Claude se las puede dar a la persona (la
 * vista del chat ya las reproduce). Vacío si no hay ninguna.
 */
export function lineasDeMedios(vista) {
  const lista = [...(vista?.audios ?? []).map((m) => ["oír", m]), ...(vista?.videos ?? []).map((m) => ["ver", m])].filter(([, m]) => m.url);
  if (!lista.length) return "";
  return [
    `Para ${lista.length === 1 ? `${lista[0][0]}lo` : "oírlo o verlo"} fuera de la aplicación (la vista del chat ya lo reproduce; cada dirección caduca en ${HORAS} h):`,
    ...lista.map(([, m]) => `· ${m.titulo}: ${m.url}`),
  ].join("\n");
}

// ------------------------------------------------------------
// Un pedido de audio del Estudio (la muestra, la locución, la música)
// ------------------------------------------------------------

/** El título de un pedido de audio, según para qué es. */
export function tituloDeAudio(t) {
  const aj = t?.ajustes ?? {};
  if (aj.para === "muestra") return `Muestra de ${aj.vozNombre ?? "la voz"}`;
  if (aj.para === "musica") return `Música «${aj.pedido?.titulo || t.prompt || "de fondo"}»`;
  return `Locución${aj.vozNombre ? ` · ${aj.vozNombre}` : ""}`;
}

/**
 * Los audios de un pedido (`t`: trabajoPublico) → { audios, nombre }. En marcha, un hueco que dice qué se hace; hecho,
 * la toma (o las dos versiones de la música) con su dirección. `fichas`: las de la galería del pedido.
 */
export async function audiosDeTrabajo(env, t, fichas, { vivo, titulo = "" } = {}) {
  const aj = t.ajustes ?? {};
  const nombre = titulo || tituloDeAudio(t);
  if (vivo) {
    return {
      nombre,
      audios: [medioDe({
        id: `hueco-${t.id}`, titulo: nombre, voz: aj.vozNombre ?? "", estado: "en_marcha",
        nota: aj.para === "musica" ? "Suno la está componiendo: tarda unos minutos y salen dos versiones." : "Se está generando la voz: menos de un minuto.",
      })],
    };
  }
  if (t.estado !== "hecho") return { nombre, audios: [] };
  if (aj.para === "muestra") {
    if (!modeloDeVoz(aj.modeloVoz) || !ID_VOZ.test(String(aj.vozId ?? ""))) return { nombre, audios: [] };
    return { nombre, audios: [await audioDeMuestra(env, { modelo: aj.modeloVoz, vozId: aj.vozId, huella: HUELLA.test(aj.huella ?? "") ? aj.huella : "", nombre: aj.vozNombre, duracion: aj.duracion })] };
  }
  const porId = new Map(fichas.filter(esAudio).map((f) => [f.id, f]));
  const audios = [];
  for (const id of t.archivos) {
    const f = porId.get(String(id));
    if (!f) continue;
    audios.push(await medioDeArchivo(env, f, { titulo: aj.para === "musica" ? f.prompt : nombre, voz: aj.vozNombre ?? "" }));
  }
  return { nombre, audios };
}

// ------------------------------------------------------------
// Un video animado (ver_video, renderizar_video y la vista que se pone al día sola)
// ------------------------------------------------------------

/**
 * La vista de un proyecto de video animado: su MP4 (si está renderizado; un hueco mientras se renderiza) y su
 * LOCUCIÓN (si la hay; un hueco mientras se genera). Mientras algo sigue, la página pregunta con `vista_video`.
 * `video`: el de `deFila` con la locución al día. → la vista.
 */
export async function vistaDeVideo(env, { video, clienteId, cliente = null }) {
  const r = video.render ?? {};
  const loc = video.locucion ?? {};
  const titulo = video.titulo || "Video animado";
  const videos = [];
  const audios = [];
  if (r.estado === "listo" && r.clave) {
    videos.push(await medioDeArchivo(env, { id: r.archivoId || `render-${video.id}`, clave: r.clave, client_id: clienteId, mime: "video/mp4" }, {
      titulo: `${titulo} · versión ${r.version ?? video.version}`, duracion: r.duracion,
      nota: [r.ancho && r.alto ? `${r.ancho}×${r.alto}` : "", r.adjunto ? "puesto en su publicación" : ""].filter(Boolean).join(" · "),
    }));
    if (!r.archivoId) delete videos[0].ref;
  } else if (video.estado === "renderizando" || r.estado === "en_curso") {
    videos.push(medioDe({ id: `render-${video.id}`, titulo, estado: "en_marcha", nota: "Renderizándose a mp4: menos de un minuto." }));
  }
  if (loc.estado === "lista" && loc.clave) {
    audios.push(await medioDeArchivo(env, { id: loc.archivoId || `voz-${video.id}`, clave: loc.clave, client_id: clienteId, mime: loc.mime || "audio/mpeg" }, {
      titulo: "La locución", voz: loc.voz?.nombre ?? "", duracion: loc.duracion,
      nota: loc.desfasada ? "Es de una versión anterior del guion." : loc.revisar ? "Ojo: no se oyó todo el guion tal cual; escúchala." : "",
    }));
    if (!loc.archivoId) delete audios[0].ref;
  } else if (loc.estado === "generando") {
    audios.push(medioDe({ id: `voz-${video.id}`, titulo: "La locución", voz: loc.voz?.nombre ?? "", estado: "en_marcha", nota: "Se está generando la voz." }));
  }
  const vivo = video.estado === "renderizando" || loc.estado === "generando";
  const aviso = r.estado === "fallido" ? `El render falló: ${r.error ?? "sin motivo"}` : loc.estado === "fallida" ? `La voz falló: ${loc.error ?? "sin motivo"}` : "";
  return vistaDe({
    tipo: "medios", titulo, subtitulo: NOMBRE_ESTADO_VIDEO[video.estado] ?? video.estado ?? "",
    cliente, estado: vivo ? "en_marcha" : video.estado ?? "", audios, videos,
    seguir: vivo ? { herramienta: "vista_video", argumentos: { video_id: video.id }, cada: 5 } : null, aviso,
  });
}

/** Un proyecto del espacio por su id (la capa de acceso acota), al día (render y voz) → { video, cliente } o null. */
export async function videoParaVista(acceso, id) {
  const fila = await acceso.leerUno("videos_proyectos", { id: String(id ?? "") });
  if (!fila) return null;
  const alDia = await renderAlDia(acceso, fila);
  const v = deFila(alDia);
  const c = await acceso.leerUno("clients", { id: fila.client_id });
  return { video: { ...v, locucion: await locucionAlDia(acceso, v.locucion) }, clienteId: fila.client_id, cliente: c ? { id: c.id, nombre: c.name } : null };
}

// ------------------------------------------------------------
// Un reel por planos (estado_reel y la vista del encargo)
// ------------------------------------------------------------

/**
 * Los videos de un reel (`e`: el encargo público): el MP4 del montaje si ya está; si no, el video («uno») o los clips
 * («clips») que salieron. Mientras el montaje se renderiza, un hueco.
 */
export async function videosDelReel(env, acceso, e) {
  const r = e.reel ?? {};
  const m = r.montaje;
  if (m?.videoId) {
    const p = await acceso.leerUno("videos_proyectos", { id: m.videoId, client_id: e.clientId }).catch(() => null);
    const render = leerJSON(p?.render, {});
    if (render.estado === "listo" && render.clave) {
      return [await medioDeArchivo(env, { id: render.archivoId || `render-${p.id}`, clave: render.clave, client_id: p.client_id, mime: "video/mp4" }, {
        titulo: "El reel montado", duracion: render.duracion, nota: render.adjunto ? "Puesto en su publicación." : "",
      })];
    }
    if (p?.estado === "renderizando") return [medioDe({ id: `render-${p.id}`, titulo: "El reel montado", estado: "en_marcha", nota: "Renderizándose a mp4." })];
  }
  const ids = [];
  if (r.video?.fase === "hecho" && r.video.archivoId) ids.push([r.video.archivoId, "El video (sin montar)"]);
  (e.pasos ?? []).forEach((p, i) => { if (p.clip?.fase === "hecho" && p.clip.archivoId) ids.push([p.clip.archivoId, `Clip ${i + 1}`]); });
  if (!ids.length) return [];
  const fichas = await acceso.leerVarios("estudio_archivos", COLUMNAS_MEDIO, "id", ids.slice(0, MAX_MEDIOS).map(([id]) => String(id)));
  const porId = new Map(fichas.filter((f) => esVideo(f) && !f.borrado_at).map((f) => [f.id, f]));
  const videos = [];
  for (const [id, titulo] of ids.slice(0, MAX_MEDIOS)) {
    const f = porId.get(String(id));
    if (f) videos.push(await medioDeArchivo(env, f, { titulo }));
  }
  return videos;
}

// ------------------------------------------------------------
// Otra dirección para lo que caducó (`vista_medios`)
// ------------------------------------------------------------

/**
 * Firma otra vez lo que nombran las `refs` (`archivo:<id>` o `muestra:<modelo>:<voz>:<huella>`). Un archivo pasa por la
 * capa de acceso (uno de otro espacio, o de un cliente que el colaborador no lleva, no existe); una muestra tiene que
 * existir. → { audios, videos }, cada uno con su misma `ref`.
 */
export async function renovarMedios(env, acceso, refs) {
  const lista = [...new Set((Array.isArray(refs) ? refs : [refs]).map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, MAX_MEDIOS);
  const audios = [];
  const videos = [];
  for (const ref of lista) {
    const [tipo, ...resto] = ref.split(":");
    if (tipo === "archivo") {
      const f = await acceso.leerUno("estudio_archivos", { id: resto.join(":") }).catch(() => null);
      if (!f || f.borrado_at || !(esAudio(f) || esVideo(f))) continue;
      (esVideo(f) ? videos : audios).push(await medioDeArchivo(env, f));
    } else if (tipo === "muestra") {
      const [modelo, vozId = "", huella = ""] = resto;
      if (!modeloDeVoz(modelo) || !ID_VOZ.test(vozId) || (huella && !HUELLA.test(huella))) continue;
      if (!(await env.MEDIA?.head(claveDeMuestra(modelo, vozId, huella)).catch(() => null))) continue;
      audios.push(await audioDeMuestra(env, { modelo, vozId, huella }));
    }
  }
  return { audios, videos };
}
