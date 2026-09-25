// ============================================================
// Una publicación, lista para enseñarse y para publicarse (puro)
//
// Lo importan el navegador (panel, página de aprobación, vista previa)
// y el Worker (enlace público, cola de publicación): las reglas de qué
// se publica y de qué ve el cliente tienen que ser UNA, o el panel dice
// «lista» y Meta la rechaza a la hora de salir.
// ============================================================

/** Límites de cada red que hacen fallar una publicación si se pasan. */
export const LIMITES = Object.freeze({
  instagram: { caracteres: 2200, hashtags: 30, menciones: 20, carruselMin: 2, carruselMax: 10, reelMaxSeg: 900, historiaMaxSeg: 60 },
  facebook: { caracteres: 63206 },
  tiktok: { caracteres: 2200, videoMaxSeg: 600 },
});

export const REDES = Object.freeze({
  instagram: { nombre: "Instagram", icono: "photo" },
  facebook: { nombre: "Facebook", icono: "globe" },
  tiktok: { nombre: "TikTok", icono: "video" },
});

const esVideo = (src = "", tipo = "") => tipo === "video" || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(src);

/** Instagram sólo publica imágenes JPEG. */
export const esJPEG = (src = "") => /\.jpe?g(\?|$)/i.test(src);

/** El feed de Instagram acepta de 4:5 (0,8) a 1.91:1. Con un pelo de tolerancia. */
export const PROPORCION_FEED = Object.freeze({ min: 0.795, max: 1.915 });

/**
 * El momento exacto en que sale una publicación: el día del calendario y
 * su hora, en Panamá (UTC−5 todo el año, sin horario de verano). Sin
 * hora, a las 9:00. Devuelve ISO en UTC, o null si la fecha no vale.
 */
export function momentoPublicacion(fecha, hora) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha ?? ""))) return null;
  const h = /^\d{2}:\d{2}$/.test(String(hora ?? "")) ? hora : "09:00";
  const d = new Date(`${fecha}T${h}:00-05:00`);
  // Un INSTANTE, no una fecha: aquí UTC es lo correcto (`toJSON` da el
  // mismo ISO; la guarda de fechas vigila `toISOString` a propósito).
  return Number.isNaN(d.getTime()) ? null : d.toJSON();
}

/**
 * Los medios de una publicación, en orden. Las publicaciones de antes
 * tienen sólo `image`; las nuevas, `medios`. Siempre devuelve la misma
 * forma: [{ src, tipo: "imagen" | "video", nombre }].
 */
export function mediosDe(post) {
  if (Array.isArray(post?.medios) && post.medios.length) {
    return post.medios
      .filter((m) => m && typeof m.src === "string" && m.src)
      .map((m) => ({
        src: m.src, tipo: esVideo(m.src, m.tipo) ? "video" : "imagen", nombre: m.nombre ?? "",
        ...(m.ancho && m.alto ? { ancho: m.ancho, alto: m.alto } : {}),
      }));
  }
  if (typeof post?.image === "string" && post.image) {
    return [{ src: post.image, tipo: esVideo(post.image) ? "video" : "imagen", nombre: "" }];
  }
  return [];
}

/**
 * Lo que se guarda al cambiar los medios: `medios` y, por compatibilidad,
 * `image` con la primera IMAGEN —la usan el HTML exportado, la IA y las
 * vistas de antes—.
 */
export function conMedios(post, medios) {
  const lista = (medios ?? []).filter((m) => m?.src);
  const primeraImagen = lista.find((m) => m.tipo !== "video")?.src ?? null;
  return { ...post, medios: lista, image: primeraImagen };
}

export const contarHashtags = (texto) => (String(texto ?? "").match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? []).length;
export const contarMenciones = (texto) => (String(texto ?? "").match(/(^|\s)@[\w.]+/g) ?? []).length;

/**
 * El texto que sale en una red: la descripción, más los hashtags si no
 * van en el primer comentario. Facebook puede llevar su propio texto.
 */
export function textoPara(post, red = "instagram") {
  const base = red === "facebook" && post?.textoFacebook?.trim()
    ? post.textoFacebook
    : String(post?.descripcion || post?.script || "");
  const hashtags = String(post?.hashtagsFinales ?? "").trim();
  if (!hashtags || post?.hashtagsEnComentario) return base.trim();
  // No se duplican si la descripción ya los trae al final.
  if (base.includes(hashtags)) return base.trim();
  return `${base.trim()}\n\n${hashtags}`.trim();
}

/** El primer comentario que se publica tras el post (Instagram). */
export function primerComentario(post) {
  const partes = [];
  if (post?.primerComentario?.trim()) partes.push(post.primerComentario.trim());
  if (post?.hashtagsEnComentario && post?.hashtagsFinales?.trim()) partes.push(post.hashtagsFinales.trim());
  return partes.join("\n\n");
}

/** Qué se publica en Instagram según el formato: feed, carrusel, reel o historia. */
export function destinoInstagram(post) {
  const medios = mediosDe(post);
  if (post?.format === "historia") return "historia";
  if (post?.format === "reel") return "reel";
  if (medios.length > 1) return "carrusel";
  return medios[0]?.tipo === "video" ? "reel" : "imagen";
}

/**
 * Lo que impide publicar (errores) y lo que conviene saber (avisos),
 * para cada red elegida. Sin errores, se puede programar.
 */
export function revisarPublicacion(post, redes = post?.redes ?? ["instagram"]) {
  const errores = [];
  const avisos = [];
  const medios = mediosDe(post);
  const videos = medios.filter((m) => m.tipo === "video");

  if (post?.format === "live") {
    errores.push("Un directo no se puede publicar por API: queda sólo como planificación.");
    return { errores, avisos };
  }

  if (redes.includes("instagram")) {
    const L = LIMITES.instagram;
    const texto = textoPara(post, "instagram");
    if (!medios.length) errores.push("Instagram necesita al menos una imagen o un video.");
    if (post?.format === "reel" && !videos.length) errores.push("Un reel necesita un video.");
    if (post?.format === "carrusel" && medios.length > 0 && medios.length < L.carruselMin) {
      errores.push("Un carrusel necesita al menos 2 imágenes o videos.");
    }
    if (medios.length > L.carruselMax) errores.push(`Instagram admite hasta ${L.carruselMax} elementos por carrusel.`);
    if (post?.format === "historia" && medios.length > 1) avisos.push("Cada historia es un solo elemento: se publicará sólo el primero.");
    if (post?.format === "historia" && texto) avisos.push("Una historia no muestra el texto: el texto va dentro de la imagen o el video.");
    if (texto.length > L.caracteres) errores.push(`El texto de Instagram tiene ${texto.length} caracteres; el máximo es ${L.caracteres}.`);
    const h = contarHashtags(texto) + (post?.hashtagsEnComentario ? contarHashtags(post?.hashtagsFinales) : 0);
    if (h > L.hashtags) errores.push(`Instagram admite ${L.hashtags} hashtags y hay ${h}.`);
    if (contarMenciones(texto) > L.menciones) errores.push(`Instagram admite ${L.menciones} menciones.`);
    const destino = destinoInstagram(post);
    if (destino === "imagen" || destino === "carrusel") {
      const fuera = medios.find((m) => m.tipo === "imagen" && m.ancho && m.alto &&
        (m.ancho / m.alto < PROPORCION_FEED.min || m.ancho / m.alto > PROPORCION_FEED.max));
      if (fuera) {
        errores.push(`Una imagen mide ${fuera.ancho}×${fuera.alto}: el feed de Instagram acepta de 4:5 (vertical) a 1.91:1 (horizontal). Recórtala o publícala como historia.`);
      }
    }
    if (medios.some((m) => m.tipo === "imagen" && !esJPEG(m.src))) {
      avisos.push("Instagram sólo acepta JPEG: las imágenes en otro formato se convierten al programar.");
    }
  }

  if (redes.includes("facebook")) {
    const texto = textoPara(post, "facebook");
    if (!medios.length && !texto) errores.push("Facebook necesita texto o al menos una imagen o un video.");
    if (texto.length > LIMITES.facebook.caracteres) errores.push("El texto de Facebook es demasiado largo.");
    if (post?.format === "historia") avisos.push("Las historias de Facebook no se publican por API: saldrá como publicación normal.");
    if (videos.length && medios.length > 1) avisos.push("Facebook no mezcla video y fotos en una publicación: se publicará sólo el video.");
  }

  if (redes.includes("tiktok")) {
    if (!videos.length) errores.push("TikTok necesita un video.");
    const texto = textoPara(post, "tiktok");
    if (texto.length > LIMITES.tiktok.caracteres) errores.push(`El texto de TikTok tiene ${texto.length} caracteres; el máximo es ${LIMITES.tiktok.caracteres}.`);
  }

  return { errores, avisos };
}

/**
 * Los campos de una publicación que puede ver el CLIENTE en su enlace.
 * Lista blanca a propósito: antes se mandaba la publicación entera, y con
 * ella el «Comentario interno» de la agencia y la idea para la IA. Un
 * campo nuevo no sale al cliente hasta que alguien lo añada aquí.
 */
const CAMPOS_PUBLICOS = [
  "id", "format", "title", "descripcion", "script", "guion", "hashtagsFinales", "hashtagsEnComentario",
  "primerComentario", "image", "medios", "portada", "publishTime", "redes", "actualizadaAt", "anterior",
];

export function publicacionParaCliente(post) {
  const salida = {};
  for (const k of CAMPOS_PUBLICOS) if (post?.[k] !== undefined) salida[k] = post[k];
  return salida;
}

export function diaParaCliente(dia) {
  return {
    date: dia?.date,
    dayName: dia?.dayName,
    weekNumber: dia?.weekNumber,
    concept: dia?.concept,
    posts: (dia?.posts ?? []).map(publicacionParaCliente),
  };
}

/** Todas las rutas de medios de una publicación: para autorizar el enlace público. */
export const rutasDeMedios = (post) => [
  ...mediosDe(post).map((m) => m.src),
  ...(post?.portada ? [post.portada] : []),
  ...(post?.anterior?.image ? [post.anterior.image] : []),
];

/**
 * Al guardar una publicación a la que el cliente le pidió cambios: se
 * marca como ACTUALIZADA y se guarda lo de antes, para que el cliente
 * vea qué cambió en vez de releerlo todo. Sólo si cambió algo que él ve.
 */
export function marcarActualizada(antes, despues, ahora) {
  if (antes?.status !== "rejected") return despues;
  const vistos = ["descripcion", "guion", "hashtagsFinales", "image", "publishTime"];
  const cambio = vistos.some((k) => (antes?.[k] ?? "") !== (despues?.[k] ?? "")) ||
    JSON.stringify(mediosDe(antes)) !== JSON.stringify(mediosDe(despues));
  if (!cambio) return despues;
  return {
    ...despues,
    actualizadaAt: ahora,
    anterior: {
      descripcion: antes.descripcion ?? "",
      guion: antes.guion ?? "",
      hashtagsFinales: antes.hashtagsFinales ?? "",
      image: antes.image ?? null,
      publishTime: antes.publishTime ?? "",
    },
  };
}
