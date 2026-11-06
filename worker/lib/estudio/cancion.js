// ============================================================
// «Video con tu canción»: SINCRONIZAR la letra de una canción ya grabada y crear el video animado con ella
// (lo puro, en src/lib/videoCancion.js; las rutas, en worker/rutas/videos.js; la herramienta, `video_con_cancion`)
//
//   · `sincronizarCancion`: la canción (de la biblioteca de sonido del cliente o de la AGENCIA de este espacio) y su
//     letra pegada. SIEMPRE se confirma (409 `confirmar` con la cifra, aproximada: la tarifa de ElevenLabs para esto no
//     está verificada desde aquí) y pasa por el presupuesto. Es UNA llamada dentro de la petición: el Worker lee la
//     canción de R2 (≤ 15 MB) y la manda.
//       1. ElevenLabs Forced Alignment (`ELEVENLABS_API_KEY`) con la mezcla;
//       2. si la letra no se encontró bien (< `COINCIDENCIA_MINIMA`), UN segundo intento: se AÍSLA la voz (Voice
//          Isolator) y se alinea eso;
//       3. sin llave, o si los dos fallan: Gemini OYE la canción con su letra delante;
//       4. si nada sale: estimado sobre lo que dura, y lo dice.
//     Todo se ALINEA a las palabras de la letra (`medirAlineacion`): `oidas` (la letra con sus tiempos), `coincidencia`
//     y `fuente`. El resultado se guarda en R2 (`canciones/<espacio>/<cliente>/<huella>.json`, fuera de `clientes/`): la
//     misma canción con la misma letra otra vez sale GRATIS, y crear el video lo lee de ahí (no lo que mande el navegador).
//   · `crearVideoConCancion`: la PRUEBA DE SINCRONÍA (`guionKaraoke`, gratis) o «Diseñar las escenas con IA»
//     (`escribirGuionCancion`, texto) y el borrador con la canción como su locución (`origen: "cancion"`).
//   · `ajustarCancion`: el ajuste fino (±1,5 s), que se aplica al leer (no se paga otra vez).
//   · `resincronizarVideo`: «Volver a sincronizar» la canción de un video (paga otra vez, con su confirmación).
// ============================================================

import { sha256, ahora } from "../ids.js";
import { bloqueoPorPresupuesto, registrarConsumoFijo } from "../configIA.js";
import { verVideo } from "../geminiVideo.js";
import { tipoPorBytes } from "./archivos.js";
import { sonidoParaVideo, claveDeSonido } from "./sonidos.js";
import { alineacionForzada, aislarVoz } from "./elevenlabs.js";
import { escribirGuionCancion, ErrorGuion } from "./guionAnimado.js";
import { fondosPendientes } from "../../../src/lib/fondosVideo.js";
import { alContenedor, aBase64 } from "./cuadros.js";
import { limpiarGolpes } from "../../../src/lib/golpes.js";
import { crearProyecto, publicacionDelCliente, deFila, ErrorVideo } from "../videosProyectos.js";
import { estiloDelCliente, ErrorEstilo } from "./estilosVideo.js";
import { aplicarEstilo } from "../../../src/lib/estilosVideo.js";
import { ErrorIA } from "../cerebro/ia.js";
import { palabrasDe, MIN_SEGUNDOS, MAX_SEGUNDOS_CANCION } from "../../../src/lib/videoEscenas.js";
import { USD_POR_CARACTER_ELEVENLABS, leerTranscripcionConTiempos } from "../../../src/lib/voces.js";
import { textoCosto } from "../../../src/lib/estudioCatalogo.js";
import {
  limpiarLetra, leerAlineacion, medirAlineacion, letraEstimada, pedidoDeTiemposCancion, costoDeSincronia, duracionDeAudio,
  extractoCrudo, lineasConTiempos, huecosInstrumentales, guionKaraoke, conDesplazamiento, limpiarDesplazamiento, esCancion,
  conPalabrasDeCancion, MAX_BYTES_CANCION, COINCIDENCIA_MINIMA, FUENTES_CANCION,
} from "../../../src/lib/videoCancion.js";

/** Un error de lo pedido, con su estado HTTP y lo que la pantalla necesita (`codigo`, `costo`…). */
export class ErrorCancion extends Error {
  constructor(mensaje, estado = 400, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.extra = extra;
  }
}

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };
const HUELLA = /^[0-9a-f]{24}$/;

/** Dónde queda la sincronía de una canción con su letra (fuera de `clientes/`: ninguna ruta de medios la sirve). */
export const claveDeSincronia = (ownerId, clienteId, huella) => `canciones/${ownerId}/${clienteId}/${huella}.json`;

/**
 * La canción por su id: de la biblioteca de sonido del cliente o de la de la agencia de ESTE espacio (`sonidoParaVideo`,
 * y su clave por `claveDeSonido`). → { archivoId, clave, nombre, de, mime, src, duracion (la que midió el navegador al
 * subirla, o null) }. 404 si no está.
 */
export async function cancionDelCliente(acceso, clienteId, id) {
  const s = await sonidoParaVideo(acceso, clienteId, id, "musica");
  const clave = s ? claveDeSonido(s.clave, clienteId, acceso.ownerId) : null;
  if (!s || !clave) throw new ErrorCancion("Esa canción no está en la biblioteca de sonido de este cliente ni en la de la agencia.", 404);
  if (s.de === "agencia") {
    const f = await acceso.leerUno("biblioteca_sonidos", { id: s.archivoId });
    return { ...s, clave, mime: f?.mime || "audio/mpeg", src: `/api/sonidos/agencia/${encodeURIComponent(s.archivoId)}/audio`, duracion: Number(f?.duracion) || null };
  }
  const f = await acceso.leerUno("estudio_archivos", { id: s.archivoId, client_id: clienteId });
  const aj = leerJSON(f?.ajustes, {});
  return { ...s, clave, mime: f?.mime || "audio/mpeg", src: `/api/media/${clave}`, duracion: Number(aj?.biblioteca?.duracion ?? aj?.duracion) || null };
}

/** La sincronía ya hecha de esa huella (de este espacio y este cliente), o null. */
export async function leerSincronia(env, ownerId, clienteId, huella) {
  if (!HUELLA.test(String(huella ?? ""))) return null;
  const obj = await env.MEDIA.get(claveDeSincronia(ownerId, clienteId, huella)).catch(() => null);
  if (!obj) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(await obj.arrayBuffer()));
    return s && s.huella === huella && Array.isArray(s.oidas) ? s : null;
  } catch {
    return null;
  }
}

/** Lo que va a la pantalla y a la herramienta de una sincronía: la letra por líneas con sus tiempos, sin lo crudo. */
export function resumenDeSincronia(s, { desplazamiento = 0 } = {}) {
  const oidas = conDesplazamiento(s.oidas, desplazamiento, s.duracion);
  const lineas = lineasConTiempos(s.letra, oidas);
  return {
    huella: s.huella, archivo: s.archivo, de: s.de ?? "cliente", nombre: s.nombre, src: s.src, duracion: s.duracion,
    coincidencia: s.coincidencia, fuente: s.fuente, nombreFuente: FUENTES_CANCION[s.fuente] ?? s.fuente,
    revisar: s.coincidencia < COINCIDENCIA_MINIMA, palabras: s.oidas.length, lineas, huecos: huecosInstrumentales(lineas, s.duracion),
    intentos: s.intentos ?? [], avisos: s.avisos ?? [], costo: s.costo ?? 0,
    // El ritmo de la canción, si el Container lo sacó (los golpes van con la locución del video).
    bpm: s.bpm ?? 0, golpes: Array.isArray(s.golpes) ? s.golpes.length : 0,
  };
}

/** Gemini OYE la canción con su letra delante → las palabras con tiempo, o null (sin gastar más). */
async function oirCancion(env, acceso, { bytes, mime, clienteId, letra }) {
  try {
    if (await bloqueoPorPresupuesto(acceso)) return null;
    const texto = await verVideo(env, acceso, {
      bytes, mime, nombre: "cancion", clienteId, prompt: pedidoDeTiemposCancion(letra), funcion: "sincronizar canción", json: true, audio: true,
    });
    return { palabras: leerTranscripcionConTiempos(texto) ?? [], crudo: extractoCrudo(texto, 600) };
  } catch (e) {
    console.warn("canción: Gemini no la pudo oír", e?.message);
    return { palabras: [], error: String(e?.message ?? e).slice(0, 200) };
  }
}

/**
 * Los GOLPES de la canción (el BPM y el segundo de cada golpe): los saca el Container (ffmpeg + src/lib/golpes.js). Sin
 * Container (en local) o si falla, null y el aviso: la canción se sincroniza igual, sin ajustar los cortes a su ritmo.
 * No gasta IA. → { bpm, confianza, golpes } | { aviso }.
 */
async function golpesDeLaCancion(env, bytes, duracion) {
  if (!env.VIDEO) return { aviso: "Sin los golpes de la canción (el Container no está aquí): los cortes no se ajustan a su ritmo." };
  try {
    const r = await (await alContenedor(env, "/golpes", { audio: aBase64(bytes) })).json();
    const golpes = limpiarGolpes(r.golpes, duracion + 0.5);
    return { bpm: Math.round(Number(r.bpm) || 0), confianza: Number(r.confianza) || 0, golpes };
  } catch (e) {
    console.warn("canción: sin golpes", e?.message);
    return { aviso: `No se pudieron sacar los golpes de la canción (${String(e?.message ?? e).slice(0, 120)}): los cortes no se ajustan a su ritmo.` };
  }
}

/** Lo que costó una llamada de ElevenLabs: por sus créditos si la respuesta los dice; si no, lo estimado. */
const costoDe = (creditos, estimado) => (Number.isFinite(creditos) && creditos > 0 ? Math.ceil(creditos * USD_POR_CARACTER_ELEVENLABS * 1000) / 1000 : estimado);

/**
 * Sincroniza la letra con la canción (ver arriba). `musicaId`: el id de la canción en la biblioteca; `letra`: la pegada;
 * `confirmado`: el booleano `true` (si no, 409 con el costo y no se llama a nadie); `forzar`: otra vez aunque ya esté
 * hecha (paga). → la sincronía ({ huella, archivo, de, nombre, clave, src, mime, duracion, letra, oidas, coincidencia,
 * fuente, intentos, crudo, costo, avisos, repetida? }).
 */
export async function sincronizarCancion(env, acceso, cliente, { musicaId, letra, confirmado = false, forzar = false, usuario = null }) {
  const pista = await cancionDelCliente(acceso, cliente.id, String(musicaId ?? ""));
  const limpia = limpiarLetra(letra);
  if (limpia.error) throw new ErrorCancion(limpia.error, 400);
  const huella = (await sha256(`${pista.archivoId}|${limpia.letra}`)).slice(0, 24);
  if (!forzar) {
    const hecha = await leerSincronia(env, acceso.ownerId, cliente.id, huella);
    if (hecha) return { ...hecha, repetida: true };
  }

  const obj = await env.MEDIA.get(pista.clave);
  if (!obj) throw new ErrorCancion("El archivo de la canción ya no está: súbela otra vez a la biblioteca de sonido.", 404);
  if (obj.size > MAX_BYTES_CANCION) throw new ErrorCancion("La canción pesa más de 15 MB: recorta el fragmento del reel.", 413);
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const mime = tipoPorBytes(bytes) ?? pista.mime;
  if (!String(mime ?? "").startsWith("audio/")) throw new ErrorCancion("Ese archivo no es un audio MP3, WAV o M4A.", 415);
  const duracion = duracionDeAudio(bytes, mime) || pista.duracion || 0;
  if (!(duracion > 0)) throw new ErrorCancion("No pude medir lo que dura la canción: ábrela en la biblioteca de sonido (la mide al oírla) y vuelve a intentarlo.", 400);
  if (duracion < MIN_SEGUNDOS) throw new ErrorCancion(`La canción dura ${duracion.toFixed(1)} s: el mínimo es ${MIN_SEGUNDOS}.`, 400);
  if (duracion > MAX_SEGUNDOS_CANCION + 0.5) throw new ErrorCancion(`La canción dura ${Math.round(duracion)} s y el video admite ${MAX_SEGUNDOS_CANCION} (3 minutos): sube sólo el fragmento del reel.`, 400);

  const conLlave = Boolean(env.ELEVENLABS_API_KEY);
  const costo = costoDeSincronia(duracion, { elevenlabs: conLlave });
  if (confirmado !== true) {
    const que = `Sincronizar la letra de «${pista.nombre}» (${duracion.toFixed(1)} s, ${limpia.palabras} palabras)`;
    const extra = conLlave && costo.maximo > costo.minimo ? ` Si la voz no se distingue de la música, se aísla y puede llegar a ${textoCosto(costo.maximo)}.` : "";
    throw new ErrorCancion(`${que} cuesta unos ${textoCosto(costo.minimo)} (precio aproximado).${extra} Confírmalo para hacerlo.`, 409, {
      codigo: "confirmar", costo: costo.maximo, minimo: costo.minimo, duracion, palabras: limpia.palabras, via: conLlave ? "elevenlabs" : "gemini",
    });
  }
  const bloqueo = await bloqueoPorPresupuesto(acceso);
  if (bloqueo) throw new ErrorCancion(bloqueo, 402, { codigo: "presupuesto" });

  const palabrasLetra = palabrasDe(limpia.letra.replace(/\n/g, " "));
  const intentos = [];
  const crudo = {};
  let gastado = 0;
  let mejor = null;
  const considerar = (fuente, crudas, extra = {}) => {
    const m = medirAlineacion(palabrasLetra, crudas, duracion);
    intentos.push({ fuente, coincidencia: m.coincidencia, exactas: m.exactas, aplastadas: m.aplastadas, ...extra });
    if (m.oidas.length && (!mejor || m.coincidencia > mejor.coincidencia)) mejor = { ...m, fuente };
  };
  const apuntar = (usd, modelo) => {
    gastado += usd;
    return registrarConsumoFijo(acceso, { proveedor: "elevenlabs", funcion: "sincronizar canción", modelo, costo: usd, clienteId: cliente.id });
  };

  if (conLlave) {
    // 1. La mezcla tal cual.
    try {
      const r = await alineacionForzada(env, { bytes, mime, texto: limpia.letra });
      await apuntar(costoDe(r.creditos, costo.alinear), "forced-alignment");
      const leido = leerAlineacion(r.datos);
      crudo.elevenlabs = extractoCrudo(r.datos);
      considerar("elevenlabs", leido.palabras, { loss: leido.loss, campos: leido.campos, ...(r.creditos !== null ? { creditos: r.creditos } : {}) });
    } catch (e) {
      intentos.push({ fuente: "elevenlabs", error: String(e?.message ?? e).slice(0, 200) });
    }
    // 2. La voz aislada (sólo si la mezcla no salió bien).
    if (!mejor || mejor.coincidencia < COINCIDENCIA_MINIMA) {
      try {
        const voz = await aislarVoz(env, { bytes, mime });
        await apuntar(costoDe(voz.creditos, costo.aislar), "audio-isolation");
        const r = await alineacionForzada(env, { bytes: voz.bytes, mime: voz.mime, texto: limpia.letra });
        await apuntar(costoDe(r.creditos, costo.alinear), "forced-alignment");
        const leido = leerAlineacion(r.datos);
        crudo.aislada = extractoCrudo(r.datos);
        considerar("elevenlabs-aislada", leido.palabras, { loss: leido.loss, campos: leido.campos });
      } catch (e) {
        intentos.push({ fuente: "elevenlabs-aislada", error: String(e?.message ?? e).slice(0, 200) });
      }
    }
  }
  // 3. Gemini la oye (sin llave de ElevenLabs, o si los dos intentos no salieron).
  if (!mejor || mejor.coincidencia < COINCIDENCIA_MINIMA) {
    const g = await oirCancion(env, acceso, { bytes, mime, clienteId: cliente.id, letra: limpia.letra });
    if (g.crudo) crudo.gemini = g.crudo;
    if (g.palabras.length) considerar("gemini", g.palabras);
    else intentos.push({ fuente: "gemini", error: g.error || "No devolvió tiempos." });
  }
  // 4. Sin nada que sirva: estimado sobre lo que dura (y se dice).
  const avisos = [...(limpia.avisos ?? [])];
  if (!mejor) {
    mejor = { oidas: letraEstimada(palabrasLetra, duracion), coincidencia: 0, fuente: "estimado" };
    avisos.push("No se pudo oír la letra en la canción: los tiempos son ESTIMADOS (repartidos sobre lo que dura). Revisa la vista previa o vuelve a sincronizar.");
  } else if (mejor.coincidencia < COINCIDENCIA_MINIMA) {
    avisos.push(`La letra sólo se encontró en un ${Math.round(mejor.coincidencia * 100)} % de la canción: revisa la vista previa (el ajuste fino mueve todo junto) o comprueba que la letra sea exactamente la del fragmento.`);
  }

  // El RITMO de la canción (sus golpes): los usan la IA que diseña las escenas y el `pulso` de una capa.
  const ritmo = await golpesDeLaCancion(env, bytes, duracion);
  if (ritmo.aviso) avisos.push(ritmo.aviso);
  const sincronia = {
    version: 1, huella, cliente: cliente.id, archivo: pista.archivoId, ...(pista.de ? { de: pista.de } : {}), nombre: pista.nombre,
    clave: pista.clave, src: pista.src, mime, duracion: Math.round(duracion * 1000) / 1000, letra: limpia.letra,
    oidas: mejor.oidas, coincidencia: mejor.coincidencia, fuente: mejor.fuente, intentos, crudo, avisos,
    ...(ritmo.golpes?.length ? { bpm: ritmo.bpm, golpes: ritmo.golpes } : {}),
    costo: Math.round(gastado * 1000) / 1000, creada: ahora(), por: usuario?.id ?? null,
  };
  await env.MEDIA.put(claveDeSincronia(acceso.ownerId, cliente.id, huella), JSON.stringify(sincronia), { httpMetadata: { contentType: "application/json" } });
  return sincronia;
}

/**
 * La LOCUCIÓN de un video con canción: la sincronía apuntada en el proyecto (`origen: "cancion"`), con su ajuste fino y
 * las palabras del guion de ahora (que se recalculan gratis al leer). `version`: la del proyecto cuando se apuntó.
 */
export function locucionDeSincronia(s, guion, version, { desplazamiento = 0 } = {}) {
  return conPalabrasDeCancion(guion, {
    origen: "cancion", estado: "lista", archivo: s.archivo, ...(s.de ? { de: s.de } : {}), clave: s.clave, src: s.src, mime: s.mime,
    nombre: s.nombre, duracion: s.duracion, letra: s.letra, oidas: s.oidas, coincidencia: s.coincidencia, fuente: s.fuente,
    desplazamiento: limpiarDesplazamiento(desplazamiento), sincronia: s.huella, version, revisar: s.coincidencia < COINCIDENCIA_MINIMA,
    intentos: (s.intentos ?? []).slice(0, 4), crudo: extractoCrudo(s.crudo ?? {}, 1500), costo: s.costo ?? 0, terminadoAt: s.creada ?? ahora(),
    // Los golpes de la canción (si el Container los sacó): no se mueven con el ajuste fino (son del audio, no de la letra).
    ...(Array.isArray(s.golpes) && s.golpes.length ? { bpm: s.bpm ?? 0, golpes: s.golpes } : {}),
  });
}

/**
 * Crea el borrador con la canción como su locución: la PRUEBA DE SINCRONÍA (`modo` «karaoke», gratis) o las escenas
 * diseñadas por la IA (`modo` «ia», texto). `huella`: la de `sincronizarCancion` (se lee de R2, no del navegador).
 * `estiloId`: un ESTILO GUARDADO del cliente (src/lib/estilosVideo.js): la IA escribe el contenido con él delante y el
 * código impone su forma (también a la prueba de sincronía, que sigue gratis); el video recuerda cuál (`origen`).
 * → { video, avisos, corregido, aviso, fondos, estilo }.
 */
export async function crearVideoConCancion(env, acceso, cliente, { huella, modo = "karaoke", formato = "9:16", titulo = "", postId = "", calendarId = "", desplazamiento = 0, indicacion = "", conFondos = false, estiloId = "", usuario = null }) {
  let estilo = null;
  if (estiloId) {
    try {
      estilo = estiloDelCliente(cliente, estiloId);
    } catch (e) {
      if (e instanceof ErrorEstilo) throw new ErrorCancion(e.message, e.estado);
      throw e;
    }
  }
  const s = await leerSincronia(env, acceso.ownerId, cliente.id, String(huella ?? ""));
  if (!s) throw new ErrorCancion("No encuentro esa sincronización de la letra: vuelve a sincronizarla.", 404);
  // La canción tiene que seguir en la biblioteca (si se quitó, el render no tendría audio).
  await cancionDelCliente(acceso, cliente.id, s.archivo);
  const d = limpiarDesplazamiento(desplazamiento);
  const lineas = lineasConTiempos(s.letra, conDesplazamiento(s.oidas, d, s.duracion));
  if (!lineas.length) throw new ErrorCancion("La sincronización no tiene líneas: vuelve a sincronizar la letra.", 400);
  const huecos = huecosInstrumentales(lineas, s.duracion);
  let liga = null;
  if (postId) {
    liga = await publicacionDelCliente(acceso, cliente.id, String(postId));
    if (!liga || (calendarId && liga.calendarId !== String(calendarId))) throw new ErrorCancion("No encontré esa publicación en los calendarios de este cliente.", 404);
  }
  let guion;
  let avisos = [];
  let corregido = false;
  let aviso = null;
  if (modo === "ia") {
    try {
      // «Con imágenes de fondo»: la IA pone un fondo por crear por sección (src/lib/fondosVideo.js); se crean después.
      const r = await escribirGuionCancion(env, acceso, cliente, { sincronia: s, lineas, huecos, formato, titulo, postId: liga?.postId ?? "", indicacion, conFondos: conFondos === true, golpes: s.golpes ?? [], bpm: s.bpm ?? 0, estilo });
      ({ guion, avisos, corregido, aviso } = r);
    } catch (e) {
      if (e instanceof ErrorGuion || e instanceof ErrorIA) throw new ErrorCancion(e.message, e.estado ?? 502);
      throw e;
    }
  } else {
    guion = guionKaraoke({ titulo: titulo || s.nombre, lineas, duracion: s.duracion, cancion: { archivo: s.archivo, nombre: s.nombre }, formato });
    // La prueba de sincronía con la forma del estilo guardado (sin fondos: sigue gratis).
    if (estilo) guion = aplicarEstilo(guion, estilo).guion;
  }
  const r = await crearProyecto(acceso, cliente, {
    guion, titulo: titulo || guion.titulo, calendarId: liga?.calendarId ?? null, postId: liga?.postId ?? null, usuario,
    origen: { tipo: "cancion", ...(estilo ? { estiloId: estilo.id } : {}) }, locucion: locucionDeSincronia(s, guion, 1, { desplazamiento: d }),
    // Sin efectos si el estilo no los lleva.
    ...(estilo?.efectos === false ? { sonido: { efectos: false } } : {}),
  });
  return {
    video: r.video, avisos: [...avisos, ...r.avisos], corregido, aviso, fondos: fondosPendientes(guion).length,
    ...(estilo ? { estilo: { id: estilo.id, nombre: estilo.nombre } } : {}),
  };
}

/** El ajuste fino de la canción de un video (±1,5 s): se aplica al leer, sin pagar otra vez ni subir la versión. → { video }. */
export async function ajustarCancion(acceso, cliente, fila, { desplazamiento }) {
  const l = leerJSON(fila.locucion, {});
  if (!esCancion(l)) throw new ErrorVideo("Este video no va con una canción.", 409);
  if (fila.estado === "renderizando") throw new ErrorVideo("Se está renderizando: espera a que termine para mover la letra.", 409);
  const guion = leerJSON(fila.guion, {});
  const nueva = conPalabrasDeCancion(guion, { ...l, desplazamiento: limpiarDesplazamiento(desplazamiento) });
  const momento = ahora();
  await acceso.actualizar("videos_proyectos", { id: fila.id, client_id: cliente.id }, { locucion: JSON.stringify(nueva), updated_at: momento });
  return { video: deFila({ ...fila, locucion: JSON.stringify(nueva), updated_at: momento }) };
}

/**
 * «Volver a sincronizar» la canción de un video: la misma canción y la misma letra, otra vez (paga, con su
 * confirmación). Conserva el ajuste fino y la versión de la locución. → { video, sincronia }.
 */
export async function resincronizarVideo(env, acceso, cliente, fila, { confirmado = false, usuario = null }) {
  const l = leerJSON(fila.locucion, {});
  if (!esCancion(l)) throw new ErrorVideo("Este video no va con una canción.", 409);
  if (fila.estado === "renderizando") throw new ErrorVideo("Se está renderizando: espera a que termine.", 409);
  const s = await sincronizarCancion(env, acceso, cliente, { musicaId: l.archivo, letra: l.letra, confirmado, forzar: true, usuario });
  const guion = leerJSON(fila.guion, {});
  const nueva = locucionDeSincronia(s, guion, l.version ?? fila.version, { desplazamiento: l.desplazamiento ?? 0 });
  const momento = ahora();
  await acceso.actualizar("videos_proyectos", { id: fila.id, client_id: cliente.id }, { locucion: JSON.stringify(nueva), updated_at: momento });
  return { video: deFila({ ...fila, locucion: JSON.stringify(nueva), updated_at: momento }), sincronia: resumenDeSincronia(s, { desplazamiento: nueva.desplazamiento }) };
}
