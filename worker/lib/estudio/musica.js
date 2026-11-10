// ============================================================
// La MÚSICA de fondo con Suno por Kie.ai, como TRABAJO del Estudio (lo puro, en src/lib/musica.js)
//
// Va como la voz (worker/lib/estudio/locucion.js): un trabajo de `estudio_trabajos` con `tipo: "audio"` que va por la
// cola de Kie (enviar una vez, mirar, entregar), lo avanza la bomba del espacio aunque nadie mire y se cobra al
// ENTREGARLO. Siempre se confirma: sin `confirmado: true`, 409 `confirmar` con el costo estimado.
//
// Al entregar, las pistas (Suno suele dar DOS versiones) se bajan a R2 y entran en la galería del cliente como audio
// con `modelo: "musica-suno"` (así las lista `musicasDe` junto a las subidas). Si se pidió para un video, la primera
// queda puesta en su SONIDO (`videos_proyectos.sonido`, aparte del guion): no sube la versión ni pide otra voz, sólo
// volver a renderizar. Si el video estaba renderizando o ya tenía otra música escogida DESPUÉS de pedirla, no se pisa.
//
// ANTES DE PAGAR: la cotización (409) trae también lo que ya hay en la BIBLIOTECA DE SONIDO que encaja con lo pedido
// (`biblioteca`, worker/lib/estudio/sonidos.js): reutilizarla es gratis.
//
// QUÉ SE PIDE: lo que diga la persona manda. Para un video SIN estilo dicho, el pedido lo escribe el DIRECTOR MUSICAL
// (worker/lib/estudio/directorMusical.js), que lee el video ya hecho y la música de la marca; el `guion.musica.estilo`
// queda de pista para él. La cotización (409) ya trae su propuesta y la guarda: la confirmación pide lo MISMO. Sin
// video y sin estilo, la música de la marca del kit si la agencia la escribió.
// ============================================================

import { uuid } from "../ids.js";
import { difundir } from "../vivo.js";
import { despertar } from "../despertar.js";
import { bloqueoPorPresupuesto, registrarConsumoFijo } from "../configIA.js";
import { MOTORES } from "./motores.js";
import { ErrorMotor } from "./gemini.js";
import { abrirDescarga, guardarDescarga } from "./descarga.js";
import { claveDeArchivo } from "./archivos.js";
import { validarGuion, lineaDeTiempo } from "../../../src/lib/videoEscenas.js";
import { limpiarSonido } from "../../../src/lib/sonidoVideo.js";
import {
  limpiarPedidoMusica, costoDeMusica, costoCobrado, modeloDeMusica, duracionParaVideo, MODELO_MUSICA_GENERADA,
} from "../../../src/lib/musica.js";
import { textoCosto } from "../../../src/lib/estudioCatalogo.js";
import { limpiarMusicaDeMarca } from "../../../src/lib/kitMarca.js";
import { kitDe } from "./kit.js";
import { proponerMusica } from "./directorMusical.js";
import { lasQueEncajan } from "./sonidos.js";
import { bpmDelTexto } from "../../../src/lib/bibliotecaSonido.js";

/** Lo más que pesa una pista (6 minutos en MP3 de 320 kbps son ~14 MB). */
export const TOPE_MUSICA = 20 * 1024 * 1024;
const TIPOS = ["audio/mpeg", "audio/wav"];

/** Un error de lo pedido, con su estado HTTP y lo que la pantalla necesita (`codigo`, `costo`…). */
export class ErrorMusica extends Error {
  constructor(mensaje, estado = 400, extra = {}) {
    super(mensaje);
    this.estado = estado;
    Object.assign(this, extra);
  }
}

const leerJSON = (t, def) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? def); } catch { return def; } };

/**
 * Lo que el guion de un video dice de su música (`musica.estilo`, `musica.instrumental`) y lo que dura (la pista del
 * director musical y el respaldo si no hay video). → { estilo, instrumental, segundos, valido }.
 */
function delGuion(video) {
  const v = validarGuion(leerJSON(video?.guion, null));
  if (!v.ok) return { estilo: "", instrumental: true, segundos: 0, valido: false };
  const m = v.guion.musica ?? {};
  // Lo que dura de verdad: con los tiempos de la locución si están listos (si no, estimado).
  const l = leerJSON(video?.locucion, {}) ?? {};
  const palabras = l.estado === "lista" && Array.isArray(l.palabras) ? l.palabras : null;
  return { estilo: m.estilo ?? "", instrumental: m.instrumental !== false, segundos: v.guion.escenas.length ? lineaDeTiempo(v.guion, palabras).total : 0, valido: true };
}

/** Lo que el director musical decidió, para la pantalla, el asistente y el trabajo (sin el estilo, que va en `pedido`). */
const delDirector = (pr) => (pr ? {
  porque: pr.porque, genero: pr.genero, bpm: pr.bpm, instrumentos: pr.instrumentos, energia: pr.energia,
  ...(pr.deRespaldo ? { deRespaldo: true } : {}),
} : null);

/**
 * Pide una música. Lo dicho manda; con `video` (una fila de videos_proyectos) y sin estilo, lo escribe el director
 * musical (y la duración sale de lo que dura el video). Sin `confirmado: true` contesta 409 con el costo y la propuesta;
 * con él, crea el trabajo. → { trabajoId, costo, pedido, propuesta, aviso }.
 */
export async function pedirMusica(env, acceso, cliente, { estilo, letra, instrumental, duracion, titulo, evitar, modelo, video = null, confirmado = false, usuario = null, origen = "persona" } = {}) {
  if (!MOTORES.kie?.activo(env)) {
    throw new ErrorMusica("La música con Suno va por Kie.ai, y este servidor no tiene su llave (KIE_API_KEY). El administrador la pone como secreto del Worker.", 503, { codigo: "sin_llave" });
  }
  const g = video ? delGuion(video) : { estilo: "", instrumental: true, segundos: 0, valido: false };
  const dicho = String(estilo ?? "").trim();
  let propuesta = null;
  let aviso = null;
  let biblioteca = null;
  // Un video sin estilo dicho: el director musical lo escucha (o se reusa lo que ya propuso para esta cotización).
  if (!dicho && video && g.valido) {
    const d = await proponerMusica(env, acceso, cliente, video, { reusar: true });
    propuesta = d.propuesta;
    aviso = d.aviso;
    biblioteca = d.biblioteca;
  }
  // Sin video ni estilo: la música de la marca, si la agencia la escribió.
  const marca = !dicho && !propuesta ? limpiarMusicaDeMarca(kitDe(cliente).musica) : null;
  const r = limpiarPedidoMusica({
    estilo: dicho || propuesta?.estilo || marca?.estilo || g.estilo, letra,
    instrumental: instrumental ?? propuesta?.instrumental ?? g.instrumental,
    titulo: titulo || propuesta?.titulo, evitar: evitar ?? (propuesta?.evitar || marca?.evitar || undefined), modelo,
    duracion: duracion ?? (g.segundos ? duracionParaVideo(g.segundos) : undefined),
  });
  if (r.error) throw new ErrorMusica(r.error);
  const p = r.pedido;
  const m = modeloDeMusica(p.modelo);
  const costo = costoDeMusica();
  const director = delDirector(propuesta);
  if (confirmado !== true) {
    // Antes de pagar: lo que YA hay en la biblioteca de sonido (del cliente y de la agencia) que encaja con lo pedido.
    biblioteca ??= await lasQueEncajan(acceso, cliente.id, { estilo: p.estilo, bpm: bpmDelTexto(p.estilo) });
    throw new ErrorMusica(
      `La música «${p.titulo}» (${p.duracion} s, ${p.instrumental ? "instrumental" : "con voz"}, ${m.nombre}) cuesta ${textoCosto(costo.usd)} aproximadamente (${costo.creditos} ${costo.unidad}; Suno entrega dos versiones). Confírmalo para generarla.`,
      409, {
        codigo: "confirmar", costo: costo.usd, creditos: costo.creditos, unidad: costo.unidad, pedido: p, ...(director ? { propuesta: director } : {}), ...(aviso ? { aviso } : {}),
        ...(biblioteca?.length ? { biblioteca } : {}),
      },
    );
  }
  const bloqueo = await bloqueoPorPresupuesto(acceso);
  if (bloqueo) throw new ErrorMusica(bloqueo, 402, { codigo: "presupuesto" });
  const ahora = new Date().toISOString();
  const fila = await acceso.insertar("estudio_trabajos", {
    id: uuid(), client_id: cliente.id, estado: "en_cola", tipo: "audio", motor: "kie", modelo: m.id,
    prompt: p.titulo, n: 1,
    ajustes: JSON.stringify({ para: "musica", pedido: p, ...(video ? { videoId: video.id } : {}), ...(director ? { director } : {}) }),
    medios: "{}", remoto: "[]", archivos: "[]", nota: "", intentos: 0, bloqueado_hasta: "",
    costo_estimado: costo.usd, costo: 0, error: "", origen, creado_por: usuario?.id ?? null,
    calendar_id: null, post_id: null, carpeta_id: null, created_at: ahora, updated_at: ahora, terminado_at: null,
  });
  await despertar(env, acceso.ownerId);
  return { trabajoId: fila.id, costo: costo.usd, creditos: costo.creditos, pedido: p, propuesta: director, aviso };
}

/**
 * Kie tiene las pistas: se bajan a R2, entran en la galería y, si se pidió para un video, la primera queda en su
 * sonido. Lo llama `pasoDeCola` (trabajos.js) y devuelve los cambios del trabajo.
 */
export async function terminarMusica(env, acceso, fila, { listo, modelo }) {
  const ajustes = leerJSON(fila.ajustes, {});
  const p = ajustes.pedido ?? {};
  const pistas = (listo.pistas ?? [{ url: listo.url }]).slice(0, 4);
  const costo = costoCobrado(listo.resultado) ?? (Number(fila.costo_estimado) || 0);
  const ahora = new Date().toISOString();
  const guardadas = [];
  for (const [i, pista] of pistas.entries()) {
    try {
      const descarga = await abrirDescarga(pista.url, { nombre: modelo.nombre, tope: TOPE_MUSICA, tipos: TIPOS });
      const nombre = `${p.titulo || pista.titulo || "Música"}${pistas.length > 1 ? ` (${i + 1})` : ""}`;
      const clave = claveDeArchivo(fila.client_id, nombre, descarga.mime);
      const g = await guardarDescarga(env, clave, descarga);
      const id = uuid();
      await acceso.insertar("estudio_archivos", {
        id, client_id: fila.client_id, clave, tipo: "audio", mime: descarga.mime, ancho: 0, alto: 0, bytes: g?.bytes ?? 0,
        prompt: nombre, modelo: MODELO_MUSICA_GENERADA,
        ajustes: JSON.stringify({ para: "musica", pedido: p, duracion: pista.duracion || 0, suno: { id: pista.id, modelo: modelo.suno } }),
        trabajo_id: fila.id, carpeta_id: null, origen: "estudio", costo: i === 0 ? costo : 0, favorito: 0, subido: 0, usado_en: "[]",
        borrado_at: null, created_at: ahora, updated_at: ahora,
      });
      guardadas.push({ id, clave, nombre });
    } catch (e) {
      // Una pista que no baja no tira la otra; si no baja ninguna, el trabajo falla (y se reintenta si es pasajero).
      if (!(e instanceof ErrorMotor)) throw e;
      if (i === pistas.length - 1 && !guardadas.length) throw e;
    }
  }
  if (!guardadas.length) throw new ErrorMotor(`${modelo.nombre}: no se pudo bajar ninguna pista.`, 502, { reintentable: true });
  await registrarConsumoFijo(acceso, { proveedor: "kie", funcion: "estudio-musica", modelo: modelo.id, costo, clienteId: fila.client_id });

  let enVideo = "";
  if (ajustes.videoId) {
    enVideo = await ponerEnVideo(env, acceso, fila, ajustes.videoId, guardadas[0]);
    // La foto o el carrusel con música que la esperaba se renderiza SOLO (conMusica.js, en el momento: ciclo de imports).
    if (/^puesta/.test(enVideo) && await import("./conMusica.js").then((m) => m.renderSiToca(env, acceso, fila.client_id, ajustes.videoId)).catch(() => false)) {
      enVideo = "puesta en el video, que ya se está haciendo";
    }
  }
  const nota = `${guardadas.length === 1 ? "Una música" : `${guardadas.length} versiones de la música`} en la galería${enVideo ? ` · ${enVideo}` : ""}.`;
  return {
    estado: "hecho", intentos: 0, error: "", costo, terminado_at: ahora,
    archivos: JSON.stringify(guardadas.map((x) => x.id)), nota: nota.slice(0, 400),
  };
}

/** Pone la primera pista en el sonido del video (si sigue sin otra música escogida después del pedido). → la frase. */
async function ponerEnVideo(env, acceso, fila, videoId, pista) {
  const video = await acceso.leerUno("videos_proyectos", { id: videoId, client_id: fila.client_id }).catch(() => null);
  if (!video) return "";
  if (video.estado === "renderizando") return "el video se estaba renderizando: escógela en «Sonido»";
  const antes = limpiarSonido(leerJSON(video.sonido, null));
  // Si alguien escogió otra música DESPUÉS de pedir ésta, se respeta.
  if (antes.musica && video.updated_at > fila.created_at) return "el video ya tenía otra música escogida: cámbiala en «Sonido» si quieres ésta";
  const sonido = limpiarSonido({ ...antes, musica: { archivoId: pista.id, clave: pista.clave, nombre: pista.nombre, volumen: antes.musica?.volumen ?? 0 } });
  const n = await acceso.actualizar("videos_proyectos", { id: video.id, client_id: fila.client_id, updated_at: video.updated_at }, {
    sonido: JSON.stringify(sonido), updated_at: new Date().toISOString(),
  });
  if (!n) return "escógela en «Sonido»";
  difundir(env, acceso.ownerId, { tipo: "videos", clienteId: fila.client_id, id: video.id, por: { userId: "sistema", nombre: "Estudio", color: "", tab: null } });
  return "puesta en el video (vuelve a renderizar para oírla)";
}
