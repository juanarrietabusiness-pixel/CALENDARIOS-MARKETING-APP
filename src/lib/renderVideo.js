// ============================================================
// El RENDER del video animado a mp4: lo que se decide antes de dibujar (puro: lo leen el Container, el Worker y la pantalla)
//
// El Container (container/render.mjs) dibuja cada cuadro con el MISMO motor de la vista previa y se lo pasa a ffmpeg;
// aquí está lo que no depende de tener un lienzo ni un proceso:
//   · cuántos cuadros salen (`cuadrosDelVideo`): los del tiempo del VIDEO, con los silencios ya insertados;
//   · el AUDIO del video (`tramosDeAudio`, `armarPcm`): la locución es una sola toma y los silencios de las escenas
//     (`pausa`) no existen en ella; se corta en su segundo del audio y se mete silencio, y al final se rellena hasta el
//     último cuadro, copiando muestras (sin cadena de filtros). Luego se deja en -14 LUFS (lo que piden Instagram, TikTok y
//     YouTube): loudnorm MIDE y la segunda pasada aplica una ganancia fija con un limitador si hace falta
//     (`gananciaDe`, `filtroDeNormalizar`), para no «bombear» la voz;
//   · cuándo se puede renderizar (`puedeRenderizar`): el guion APROBADO y la locución lista de ESA versión. Sin voz no
//     hay render: los subtítulos irían con tiempos inventados.
// ============================================================

import { tieneHabla } from "./videoEscenas.js";
import { esCancion, estadoDeCancion } from "./videoCancion.js";

/** Lo fijo del render. -14 LUFS integrados, el pico verdadero a -1,5 dB y el rango que admite la voz hablada. */
export const RENDER = Object.freeze({ fps: 30, lufs: -14, pico: -1.5, rango: 11, muestreo: 48000, kbpsAudio: 192, crf: 20, kbpsVideoMax: 12000 });

/** Lo que tarda como mucho un render antes de darlo por perdido (el Durable Object pudo morir a la mitad). */
export const PLAZO_RENDER_MS = 15 * 60 * 1000;

const r3 = (n) => Math.round(n * 1000) / 1000;

/** Los cuadros del video: uno por cada 1/fps del tiempo del video. Puro. */
export const cuadrosDelVideo = (total, fps = RENDER.fps) => Math.max(1, Math.round((Number(total) || 0) * fps));

/**
 * El audio del video en tramos: voz (un trozo de la toma, en segundos del AUDIO) y silencio (insertado), en orden.
 * `silencios` es el de `lineaDeTiempo` ({ en: segundo del audio, dur }). Los trozos vacíos se quitan. Puro.
 */
export function tramosDeAudio(silencios = []) {
  const tramos = [];
  let desde = 0;
  for (const s of [...silencios].filter((x) => Number(x?.dur) > 0).sort((a, b) => a.en - b.en)) {
    const en = Math.max(desde, Number(s.en) || 0);
    if (en > desde) tramos.push({ tipo: "voz", desde: r3(desde), hasta: r3(en) });
    tramos.push({ tipo: "silencio", dur: r3(s.dur) });
    desde = en;
  }
  tramos.push({ tipo: "voz", desde: r3(desde), hasta: null }); // hasta el final de la toma
  return tramos;
}

/** Bytes de una muestra del audio armado: PCM de 16 bits en estéreo (dos canales × dos bytes). */
export const BYTES_MUESTRA = 4;

/**
 * El audio del video armado A MANO, sin cadena de filtros: `toma` es la locución ya decodificada (PCM s16le estéreo a
 * `muestreo`; vacía = sin voz) y `tramos` los de `tramosDeAudio`. Cada tramo de voz se copia de la toma (lo que caiga
 * después de su final, nada: la alineación puede acabar unos milisegundos más tarde que el archivo), cada silencio va
 * en ceros, y el resultado mide EXACTAMENTE `total` segundos (se rellena con silencio o se corta). → Uint8Array. Puro.
 *
 * Antes lo hacía un `-filter_complex` (asplit → atrim → aevalsrc → concat → apad → loudnorm) y con las tomas de
 * ElevenLabs v4 el ffmpeg 5.1 de la imagen moría con «Error reinitializing filters!»: copiar bytes no tiene parámetros
 * que se puedan desajustar.
 */
export function armarPcm(toma, tramos, total, muestreo = RENDER.muestreo) {
  const fuente = toma instanceof Uint8Array ? toma : new Uint8Array(0);
  const muestrasToma = Math.floor(fuente.length / BYTES_MUESTRA);
  const muestras = Math.max(1, Math.round(Math.max(0, Number(total) || 0) * muestreo));
  const salida = new Uint8Array(muestras * BYTES_MUESTRA); // en ceros: silencio
  const en = (seg) => Math.max(0, Math.round((Number(seg) || 0) * muestreo));
  let cursor = 0;
  for (const t of tramos ?? []) {
    if (cursor >= muestras) break;
    if (t.tipo === "silencio") {
      cursor += en(t.dur);
      continue;
    }
    const desde = Math.min(en(t.desde), muestrasToma);
    const hasta = t.hasta === null || t.hasta === undefined ? muestrasToma : Math.min(en(t.hasta), muestrasToma);
    const cuantas = Math.min(Math.max(0, hasta - desde), muestras - cursor);
    if (cuantas > 0) salida.set(fuente.subarray(desde * BYTES_MUESTRA, (desde + cuantas) * BYTES_MUESTRA), cursor * BYTES_MUESTRA);
    cursor += cuantas;
  }
  return salida;
}

/** El `-af` de la primera pasada: loudnorm sólo MIDE (imprime sus medidas en JSON). Puro. */
export const FILTRO_MEDIR = `loudnorm=I=${RENDER.lufs}:TP=${RENDER.pico}:LRA=${RENDER.rango}:print_format=json`;

/**
 * La ganancia que deja el audio en -14 LUFS a partir de lo medido (`leerLoudnorm` de la primera pasada) → { db,
 * limitar }: `limitar` cuando, subido así, el pico pasaría de -1,5 dB (una voz de verdad casi siempre: sus picos van muy
 * por encima de su volumen medio). Puro.
 *
 * No se usa la SEGUNDA pasada de loudnorm (`measured_*`): cuando no puede ir en lineal pasa a su modo dinámico, y el
 * ffmpeg 5.1 de la imagen muere ahí con «Error reinitializing filters! | Failed to inject frame into filter network:
 * Invalid argument». Con una voz de ElevenLabs pasaba siempre; con el tono de la prueba de humo, nunca.
 */
export function gananciaDe(medido) {
  const db = Math.round((RENDER.lufs - medido.input_i) * 100) / 100;
  return { db, limitar: medido.input_tp + db > RENDER.pico };
}

/**
 * El `-af` de la segunda pasada: la ganancia y, si hace falta, un limitador justo por debajo del pico permitido (sin
 * su «nivel automático», que volvería a subir el volumen). Termina en el muestreo del render. Puro.
 */
export function filtroDeNormalizar(medido, muestreo = RENDER.muestreo) {
  const { db, limitar } = gananciaDe(medido);
  const techo = Math.round(10 ** ((RENDER.pico - 0.5) / 20) * 1000) / 1000; // -2 dB: el limitador mira muestras, no el pico verdadero
  return `volume=${db}dB${limitar ? `,alimiter=limit=${techo}:attack=5:release=50:level=disabled` : ""},aresample=${muestreo}`;
}

/**
 * Lo que imprime `loudnorm` con `print_format=json` (el último bloque { … } de la salida de error de ffmpeg) → las
 * medidas como números, o null si no está o algo no es un número (silencio: «-inf»). Puro.
 */
export function leerLoudnorm(texto) {
  const s = String(texto ?? "");
  const fin = s.lastIndexOf("}");
  const inicio = fin >= 0 ? s.lastIndexOf("{", fin) : -1;
  if (inicio < 0) return null;
  let j;
  try { j = JSON.parse(s.slice(inicio, fin + 1)); } catch { return null; }
  const claves = ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"];
  const out = {};
  for (const k of [...claves, "output_i", "output_tp", "output_lra"]) {
    if (j[k] === undefined) continue;
    const n = Number(j[k]);
    if (!Number.isFinite(n)) return null;
    out[k] = n;
  }
  return claves.every((k) => k in out) ? out : null;
}

/**
 * ¿Se puede renderizar este proyecto? (`p`: la fila con su `locucion` —y, si se tiene, su `guion`— ya leídos como objetos)
 * → { ok, motivo, sinVoz? }. Hace falta el guion aprobado de esta versión y SU locución lista; no mientras se renderiza. Un
 * guion SIN habla (un montaje de clips) no necesita locución: `sinVoz`. Puro.
 */
export function puedeRenderizar(p) {
  const l = p?.locucion ?? {};
  if (p?.estado === "renderizando") return { ok: false, motivo: "Ya se está renderizando." };
  if (p?.estado === "borrador" || !Number.isInteger(p?.version) || p.version !== p?.aprobada_version) {
    return { ok: false, motivo: "Primero aprueba el guion." };
  }
  // Un video con CANCIÓN (src/lib/videoCancion.js): vale para cualquier versión mientras el guion diga la letra.
  if (esCancion(l)) {
    const c = p?.guion ? estadoDeCancion(p.guion, l) : { ok: l.estado === "lista" && Boolean(l.clave), motivo: "Primero sincroniza la canción." };
    return c.ok ? { ok: true, motivo: "", cancion: true } : { ok: false, motivo: c.motivo };
  }
  // Un montaje de clips que no dice nada en ninguna escena no tiene locución que generar: sale con el sonido de los clips.
  if (p?.guion && !tieneHabla(p.guion)) return { ok: true, motivo: "", sinVoz: true };
  if (l.estado !== "lista" || !l.clave) return { ok: false, motivo: "Primero genera la locución del guion aprobado." };
  if (l.version !== p.version || l.desfasada) return { ok: false, motivo: "La locución es de otra versión del guion: genérala otra vez." };
  return { ok: true, motivo: "" };
}

/** Los bytes de un mp4 de verdad: la caja «ftyp» al principio. Puro. */
export const esMp4 = (b) => b?.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const FORMATO_CORTO = { post: "Post", reel: "Reel", carrusel: "Carrusel", historia: "Historia", live: "Directo" };

/**
 * Las publicaciones de un cliente a las que se puede ligar un video (`calendars`: los de `client.calendars`, con sus
 * días): desde una semana antes de `hoy` («AAAA-MM-DD») en adelante, por fecha, primero los reels y las historias de
 * cada día (lo que lleva video), como mucho `max`; la ya ligada (`ligada`: su id) siempre está. → [{ postId,
 * calendarId, fecha, etiqueta }]. Pura.
 */
export function publicacionesParaVideo(calendars = [], { hoy = "", ligada = null, max = 60 } = {}) {
  const desde = hoy ? new Date(`${hoy}T12:00:00`) : null;
  if (desde) desde.setDate(desde.getDate() - 7);
  const limite = desde ? `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}-${String(desde.getDate()).padStart(2, "0")}` : "";
  const todas = [];
  for (const cal of calendars ?? []) {
    for (const d of cal?.days ?? []) {
      for (const p of d?.posts ?? []) {
        if (!p?.id || !d.date) continue;
        if (d.date < limite && p.id !== ligada) continue;
        const [, m, dia] = d.date.split("-").map(Number);
        const titulo = String(p.title || p.idea || "sin título").replace(/\s+/g, " ").trim().slice(0, 50);
        todas.push({
          postId: p.id, calendarId: cal.id, fecha: d.date, video: ["reel", "historia"].includes(p.format) ? 0 : 1,
          etiqueta: `${dia} ${MESES_CORTOS[m - 1] ?? ""} · ${FORMATO_CORTO[p.format] ?? "Post"} · ${titulo}`,
        });
      }
    }
  }
  todas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.video - b.video);
  const lista = todas.slice(0, max);
  const suya = todas.find((x) => x.postId === ligada);
  if (suya && !lista.includes(suya)) lista.unshift(suya);
  return lista.map(({ video: _, ...x }) => x);
}

// ------------------------------------------------------------
// Los CLIPS de video (las capas `video`): lo que el Container decide antes de decodificar
// ------------------------------------------------------------

/** Lo más que mide de lado un clip decodificado: el lado largo del lienzo más grande (16:9 o 9:16 a 1080). */
export const LADO_MAX_CLIP = 1920;

/**
 * La medida a la que se decodifica un clip (`info`: { ancho, alto } ya girados): la suya, sin pasar de `LADO_MAX_CLIP`
 * de lado y sin agrandarla (un clip de 720 p no gana nada a 1080: el motor lo escala al dibujarlo). Pares. Pura.
 */
export function medidaDeDecodificar(info) {
  const w = Math.max(2, Number(info?.ancho) || 0);
  const h = Math.max(2, Number(info?.alto) || 0);
  const k = Math.min(1, LADO_MAX_CLIP / Math.max(w, h));
  const par = (n) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { ancho: par(w), alto: par(h) };
}

/**
 * Lo que imprime `ffprobe -print_format json -show_streams -show_format` → { ancho, alto, duracion, audio } con el ancho
 * y el alto como se VEN (un teléfono graba en horizontal y marca un giro de 90°: ffmpeg lo endereza al decodificar), o
 * null si no hay imagen de video. Pura.
 */
export function leerSonda(texto) {
  let j;
  try { j = typeof texto === "string" ? JSON.parse(texto) : texto; } catch { return null; }
  const flujos = Array.isArray(j?.streams) ? j.streams : [];
  const v = flujos.find((f) => f?.codec_type === "video" && !f?.disposition?.attached_pic && Number(f.width) > 0 && Number(f.height) > 0);
  if (!v) return null;
  const giro = Number(v.side_data_list?.find((d) => d && d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0) || 0;
  const deLado = Math.abs(Math.round(giro)) % 180 === 90;
  const duracion = Number(v.duration) || Number(j?.format?.duration) || 0;
  return {
    ancho: deLado ? Number(v.height) : Number(v.width),
    alto: deLado ? Number(v.width) : Number(v.height),
    duracion: Math.round(duracion * 1000) / 1000,
    audio: flujos.some((f) => f?.codec_type === "audio"),
  };
}
