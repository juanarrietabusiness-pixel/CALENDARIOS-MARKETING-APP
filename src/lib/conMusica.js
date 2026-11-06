// ============================================================
// «Publicar con música» (puro: lo comparten la pantalla, el Worker y el render)
//
// La API de Instagram no deja poner música de su biblioteca en fotos ni en carruseles (ni en reels: sólo el audio que
// ya trae el video). A la agencia y a sus clientes les gustan los posts con música, así que hay dos caminos:
//
//   · Un POST DE UNA FOTO se convierte en un REEL corto: la foto a sangre con un movimiento suave (acercar, alejar o un
//     paneo) y una pista de la galería del cliente. Es un video animado de UNA escena, sin habla (no necesita locución),
//     que se aprueba y se renderiza solo en el Container: no gasta IA. Al terminar, la publicación pasa a reel con el mp4
//     como su único medio y la foto de PORTADA (la regla de la portada, lib/publicacion.js), y queda apuntado lo de
//     antes en `post.conMusica` para «Volver a la foto». En Instagram sale como «audio original».
//   · Un CARRUSEL no se convierte: se publica A MANO desde el teléfono con la música de Instagram (`asistida`), y la
//     aplicación lo deja en un minuto: el aviso a la hora, las imágenes en orden, el texto y una CANCIÓN SUGERIDA de la
//     lista que la agencia escribe por cliente (`kit.musica.cancionesInstagram`), sin repetir la última usada.
// ============================================================

import { mediosDe, conMedios } from "./publicacion.js";
import { posicionDelKit } from "./logoEncima.js";

/** Las duraciones del reel que sale de una foto (s) y la de partida. */
export const DURACIONES_FOTO = Object.freeze([7, 10, 15]);
export const DURACION_FOTO = 10;

/** Los movimientos de la foto, en el orden en que se ofrecen (el primero, el de partida). */
export const MOVIMIENTOS_FOTO = Object.freeze([
  Object.freeze({ id: "acercar", nombre: "Zoom lento hacia dentro" }),
  Object.freeze({ id: "alejar", nombre: "Zoom lento hacia fuera" }),
  Object.freeze({ id: "paneo", nombre: "Paneo de lado a lado" }),
]);
export const MOVIMIENTO_FOTO = "acercar";

/** El `origen.tipo` del video animado que sale de una foto (videos_proyectos.origen): el render lo reconoce así. */
export const ORIGEN_FOTO = "foto";

/** Lo que cuesta en IA: nada (el render es cómputo del Container). La frase de siempre. */
export const FRASE_COSTO = "No gasta IA: el video lo hace el servidor con la foto y la música (0 $).";

/** Una foto casi vertical (hasta 0,62 de ancho por alto) llena el cuadro 9:16; las demás se ven ENTERAS. */
export const VERTICAL_PARA_CUBRIR = 0.62;

const esPublicada = (post) => post?.status === "published";

/**
 * ¿Se puede publicar con música (foto → reel)? Un post de UNA imagen, sin video, sin publicar. → { ok, motivo }. Una
 * publicación que ya es «con música» no (para cambiar la pista o la duración se vuelve a pedir desde ella). Pura.
 */
export function puedeConMusica(post) {
  if (!post) return { ok: false, motivo: "No hay publicación." };
  if (esPublicada(post)) return { ok: false, motivo: "Ya se publicó." };
  if (post.conMusica?.foto?.src) return { ok: true, motivo: "", yaEs: true };
  if (post.format && post.format !== "post") return { ok: false, motivo: "Sólo un post de una foto se convierte en reel con música (un carrusel se publica a mano con la música de Instagram)." };
  const medios = mediosDe(post);
  if (medios.length !== 1) return { ok: false, motivo: medios.length ? "Lleva más de un archivo: sólo un post de UNA foto." : "Primero pon la foto." };
  if (medios[0].tipo !== "imagen") return { ok: false, motivo: "Ya es un video." };
  return { ok: true, motivo: "" };
}

/** ¿Un carrusel que se puede publicar a mano con la música de Instagram? Pura. */
export const esCarruselParaMusica = (post) => post?.format === "carrusel" && !esPublicada(post) && mediosDe(post).length > 0;

/**
 * La FOTO de la publicación: su único medio tal cual está en `post.medios` (con su ancho, alto y nombre), o la que se
 * apuntó al convertirla en reel. Null si no hay una sola imagen. Pura.
 */
export function fotoDe(post) {
  if (post?.conMusica?.foto?.src) return post.conMusica.foto;
  const crudos = Array.isArray(post?.medios) && post.medios.length ? post.medios.filter((m) => m?.src) : [];
  const medios = mediosDe(post);
  if (medios.length !== 1 || medios[0].tipo !== "imagen") return null;
  return crudos[0] ?? medios[0];
}

/** El recorte de la foto en el cuadro 9:16: «cubrir» si es casi vertical, si no «contener» (se ve entera). Pura. */
export function recorteDeFoto(ancho, alto) {
  const a = Number(ancho); const h = Number(alto);
  if (!(a > 0 && h > 0)) return "contener";
  return a / h <= VERTICAL_PARA_CUBRIR ? "cubrir" : "contener";
}

/** La duración pedida, a una de las que hay (la más cercana). Pura. */
export function duracionDeFoto(segundos) {
  const s = Number(segundos);
  if (!Number.isFinite(s) || s <= 0) return DURACION_FOTO;
  return DURACIONES_FOTO.reduce((mejor, d) => (Math.abs(d - s) < Math.abs(mejor - s) ? d : mejor), DURACIONES_FOTO[0]);
}

/** El movimiento pedido, o el de partida. Pura. */
export const movimientoDeFoto = (m) => (MOVIMIENTOS_FOTO.some((x) => x.id === m) ? m : MOVIMIENTO_FOTO);

/**
 * Dónde va el logo ESTAMPADO en el reel (fracciones del cuadro 9:16): la esquina del kit, pero DENTRO del área segura
 * —abajo, Instagram tapa el 20 % con el texto y los botones; arriba, el 12 % con su barra—. → { x, y, tam }. Pura.
 */
export function logoEnElReel(logoPosicion) {
  const p = posicionDelKit(logoPosicion);
  const tam = Math.min(0.3, Math.max(0.12, p.tamano));
  const x = p.esquina.endsWith("izquierda") ? 0.08 + tam / 2 : p.esquina.endsWith("centro") ? 0.5 : 0.92 - tam / 2;
  const y = p.esquina.startsWith("arriba") ? 0.17 : 0.74;
  return { x: Math.round(x * 1000) / 1000, y, tam };
}

/**
 * El GUION de un video animado de UNA escena que sale de una foto: la foto a sangre (`encuadre` «completo») con su
 * movimiento y la duración en `dura` (sin habla: no lleva locución), sin subtítulos y sin música en el guion (la pista va
 * en el SONIDO del video, aparte). Con `logo` ({ esquina, tamano }, el del kit cuando lo estampa la aplicación), el logo
 * en su esquina dentro del área segura. Pura.
 */
export function guionDeFoto({ archivoId, segundos = DURACION_FOTO, movimiento = MOVIMIENTO_FOTO, titulo = "", ancho = 0, alto = 0, logo = null }) {
  const dura = duracionDeFoto(segundos);
  const capas = [{
    tipo: "imagen", id: "foto", archivo: String(archivoId ?? ""), rol: "foto", encuadre: "completo",
    recorte: recorteDeFoto(ancho, alto), movimiento: movimientoDeFoto(movimiento), dura, entra: { s: 0 },
    animacion: { entrada: "aparece", salida: "ninguna", bucle: "ninguno" },
  }];
  if (logo) {
    const l = logoEnElReel(logo);
    capas.push({ tipo: "logo", id: "logo", pos: { x: l.x, y: l.y }, tam: l.tam, entra: { s: 0 }, animacion: { entrada: "aparece", salida: "ninguna", bucle: "ninguno" } });
  }
  const nombre = String(titulo ?? "").replace(/\s+/g, " ").trim();
  return {
    version: 1,
    titulo: `Con música${nombre ? `: ${nombre}` : ""}`.slice(0, 120),
    formatos: ["9:16"],
    estilo: { grano: 0, ritmo: "calmado" },
    escenas: [{
      id: "foto", tipo: "producto", habla: "", pantalla: "",
      fondo: { tipo: "plano", color: "oscuro" }, transicion: { tipo: "corte", dur: 0 }, capas,
    }],
    subtitulos: { activo: false },
    musica: null,
  };
}

/**
 * La música que se escoge sola para el reel de una foto, de la lista de la galería del cliente (la de `musicasDe`, tal
 * cual: de la más nueva a la más vieja): la FAVORITA, si no una de la MARCA (las que gustaron, `kit.musica.referencias`),
 * si no la más nueva. Null sin lista. Pura.
 */
export function musicaPorDefecto(lista, kit) {
  const musicas = Array.isArray(lista) ? lista.filter((m) => m?.id) : [];
  const deLaMarca = new Set((kit?.musica?.referencias ?? []).map((r) => r?.archivoId).filter(Boolean));
  return musicas.find((m) => m.favorita === true || m.favorito === true) ?? musicas.find((m) => deLaMarca.has(m.id)) ?? musicas[0] ?? null;
}

/** ¿Es el video de una foto con música? (por su `origen`, ya leído). Pura. */
export const esVideoDeFoto = (origen) => origen?.tipo === ORIGEN_FOTO;

/**
 * La publicación con el REEL puesto: formato reel, el mp4 como su ÚNICO medio y la foto de PORTADA, y lo de antes
 * apuntado en `conMusica` ({ foto, formato, portada, videoId, en }) para volver. Si ya era «con música», sólo cambia el
 * video (la foto apuntada se queda). `foto`: la src de la foto con que se hizo el video; si la publicación ya no la
 * lleva (alguien la cambió mientras se renderizaba), null: el video se queda en la galería. Pura.
 */
export function postConMusica(post, medio, { videoId = "", foto = "", ahora = "" } = {}) {
  if (!post || !medio?.src) return null;
  const previo = post.conMusica?.foto?.src ? post.conMusica : null;
  const actual = previo ? previo.foto : fotoDe(post);
  if (!actual?.src || (foto && actual.src !== foto)) return null;
  // Lo que se estaba haciendo (`conMusicaPendiente`, lo apunta la pantalla al pedirlo) ya está hecho.
  const { conMusicaPendiente, ...sinPendiente } = post;
  void conMusicaPendiente;
  const base = conMedios(sinPendiente, [medio]);
  return {
    ...base,
    format: "reel",
    portada: previo && String(post.portada ?? "").trim() ? post.portada : actual.src,
    portadaMs: null,
    portadaEncuadre: 0,
    mediosCambiadosAt: ahora || post.mediosCambiadosAt || null,
    conMusica: previo
      ? { ...previo, videoId: videoId || previo.videoId || "", en: ahora || previo.en || "" }
      : { foto: actual, formato: post.format || "post", portada: post.portada ?? null, videoId: String(videoId ?? ""), en: ahora || "" },
  };
}

/**
 * «Volver a la foto»: quita el video y deja la publicación como estaba (su foto, su formato, su portada). El mp4 se
 * queda en la galería. Sin `conMusica`, la misma publicación. Pura.
 */
export function volverALaFoto(post, ahora = "") {
  const cm = post?.conMusica;
  if (!cm?.foto?.src) return post;
  const { conMusica, conMusicaPendiente, ...resto } = post;
  void conMusica; void conMusicaPendiente;
  return {
    ...conMedios(resto, [cm.foto]),
    format: cm.formato || "post",
    portada: cm.portada ?? null,
    portadaMs: null,
    portadaEncuadre: 0,
    mediosCambiadosAt: ahora || post.mediosCambiadosAt || null,
  };
}

// Las canciones de Instagram de cada cliente viven aparte (src/lib/cancionesInstagram.js, sin importaciones: las lee
// también el kit de marca, que no puede arrastrar lib/publicacion.js); se reexportan aquí.
export {
  MAX_CANCIONES, limpiarCancion, limpiarCanciones, textoDeCancion, ultimaCancionUsada, cancionSugerida, cancionParaGuardar,
} from "./cancionesInstagram.js";
