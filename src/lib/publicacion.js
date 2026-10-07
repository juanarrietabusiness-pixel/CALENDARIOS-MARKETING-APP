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
  // El título, en caracteres; la descripción, en BYTES (YouTube cuenta
  // bytes: una tilde o un emoji ocupan más de uno); las etiquetas, 500
  // caracteres entre todas. Un Short, vertical y de hasta 60 s.
  youtube: { titulo: 100, descripcionBytes: 5000, etiquetas: 500, shortMaxSeg: 60 },
});

export const REDES = Object.freeze({
  instagram: { nombre: "Instagram", icono: "photo" },
  facebook: { nombre: "Facebook", icono: "globe" },
  tiktok: { nombre: "TikTok", icono: "video" },
  youtube: { nombre: "YouTube", icono: "play" },
});

/** Las redes que publican historias por API: TikTok y YouTube no. */
export const conHistorias = (red) => red === "instagram" || red === "facebook";

/** Las redes que publican con la conexión de Meta (las demás, con la cuenta de cada cliente). */
export const esDeMeta = (red) => red === "instagram" || red === "facebook";

const esVideo = (src = "", tipo = "") => tipo === "video" || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(src);

/** Instagram sólo publica imágenes JPEG. */
export const esJPEG = (src = "") => /\.jpe?g(\?|$)/i.test(src);

/** El feed de Instagram acepta de 4:5 (0,8) a 1.91:1. Con un pelo de tolerancia. */
export const PROPORCION_FEED = Object.freeze({ min: 0.795, max: 1.915 });

/** Una historia es 9:16 (0,5625). Lo que se aleje se encaja para que Instagram no la amplíe y corte. */
export const PROPORCION_HISTORIA = Object.freeze({ min: 0.55, max: 0.575 });

/**
 * Cómo se adapta una imagen que no cabe: la imagen entera sobre fondo
 * difuminado, sobre el color de la marca, recortada, o GENERADA de nuevo
 * con IA en la proporción de destino, con la original de referencia
 * (ampliarla hacía que Nano Banana la acercara: parecía un zoom). «ia» es la única que no se
 * hace sola al programar: cuesta dinero y se pide con un botón; si falta
 * la copia, sale difuminada.
 */
export const AJUSTES = Object.freeze({
  difuminado: "Completa, con fondo difuminado",
  color: "Completa, con el color de la marca",
  recorte: "Recortada al centro",
  ia: "Generada de nuevo con IA",
});

/** La proporción que se le pide a la IA para llevar una imagen a su objetivo. */
export function proporcionParaIA(ancho, alto, objetivo) {
  if (objetivo === "historia") return "9:16";
  return ancho / alto > PROPORCION_FEED.max ? "16:9" : "4:5";
}

/** Minutos entre el post y su historia, por defecto. */
export const RETRASO_HISTORIA_MIN = 15;

/** Instagram admite hasta 3 colaboradores (cuentas públicas) en post, carrusel y reel. */
export const MAX_COLABORADORES = 3;

/** Los usuarios colaboradores, limpios: sin «@», sin repetidos, válidos. */
export function colaboradoresDe(post) {
  const lista = Array.isArray(post?.colaboradores) ? post.colaboradores : String(post?.colaboradores ?? "").split(/[\s,]+/);
  return [...new Set(lista.map((u) => String(u ?? "").trim().replace(/^@/, "").toLowerCase()).filter((u) => /^[\w.]{1,30}$/.test(u)))];
}

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
        // Los segundos de un video, medidos en el navegador al programar
        // (YouTube decide con ellos si sale como Short).
        ...(Number(m.duracion) > 0 ? { duracion: Number(m.duracion) } : {}),
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

/** Fotos que admite un carrusel de TikTok. */
export const MAX_FOTOS_TIKTOK = 35;

/**
 * Las redes que, POR DEFECTO, sólo llevan video. TikTok también publica
 * carruseles de fotos, pero sólo si se elige a mano: necesita el dominio
 * verificado y no todas las fotos de Instagram tienen sentido en TikTok.
 */
const SOLO_VIDEO = new Set(["tiktok", "youtube"]);

/**
 * ¿Puede salir esta publicación en esa red? Las de video necesitan un
 * video (o, si aún no se subió nada, un reel, que lo tendrá), y no
 * tienen historias ni directos.
 */
export function redAdmite(post, red) {
  if (!SOLO_VIDEO.has(red)) return true;
  if (["historia", "live"].includes(post?.format)) return false;
  const medios = mediosDe(post);
  return medios.length ? medios.some((m) => m.tipo === "video") : post?.format === "reel";
}

/**
 * Las redes por defecto: TODAS las que el cliente tiene conectadas y
 * pueden llevar la publicación. Antes eran Instagram y Facebook, o sólo
 * Instagram si la publicación no decía nada, y el TikTok conectado del
 * cliente se quedaba fuera sin que nadie lo decidiera.
 */
export function redesPorDefecto(conectadas = [], post = {}) {
  const lista = Object.keys(REDES).filter((r) => conectadas.includes(r) && redAdmite(post, r));
  return lista.length ? lista : ["instagram"];
}

/** Las redes de una publicación: las elegidas o, si nadie eligió, las de por defecto. */
export function redesDe(post, conectadas = []) {
  return Array.isArray(post?.redes) && post.redes.length ? post.redes : redesPorDefecto(conectadas, post);
}

/** Las imágenes o videos de la historia que acompaña al post, con la forma de `mediosDe`. */
export function historiasDe(post) {
  return mediosDe({ medios: Array.isArray(post?.historias) ? post.historias : [] });
}

/** ¿Sale también como historia? Sólo un post (no una historia ni un directo) con historias preparadas. */
export const conHistoria = (post) =>
  Boolean(post?.historiaTambien) && !["historia", "live"].includes(post?.format) && historiasDe(post).length > 0;

/**
 * Lo que se publica de una publicación en cada red: la publicación y, si
 * se pidió, su historia. TikTok y YouTube no tienen historias por API.
 */
export function piezasDe(post, redes = post?.redes ?? ["instagram"]) {
  const salida = [];
  for (const red of redes) {
    salida.push({ red, variante: "post" });
    if (conHistorias(red) && conHistoria(post)) salida.push({ red, variante: "historia" });
  }
  return salida;
}

/** La publicación tal como sale en una variante: la historia es otra publicación con los medios de la historia. */
export function publicacionDeVariante(post, variante = "post") {
  if (variante !== "historia") return post;
  return { ...post, format: "historia", medios: historiasDe(post), image: null, colaboradores: [] };
}

/** A qué hora sale una variante: la historia, unos minutos después del post. */
export function momentoDeVariante(fecha, hora, post, variante = "post") {
  const base = momentoPublicacion(fecha, hora);
  if (!base || variante !== "historia") return base;
  const retraso = Number.isFinite(Number(post?.historiaRetraso)) ? Math.min(Math.max(Number(post.historiaRetraso), 0), 240) : RETRASO_HISTORIA_MIN;
  return new Date(Date.parse(base) + retraso * 60_000).toJSON();
}

/**
 * A qué forma hay que llevar las imágenes en una red: «feed» (4:5 a
 * 1.91:1) o «historia» (9:16). null si esa red las acepta como vengan.
 */
export function objetivoDe(post, red) {
  if (red === "instagram") {
    const d = destinoInstagram(post);
    if (d === "historia") return "historia";
    if (d === "imagen" || d === "carrusel") return "feed";
    return null;
  }
  if (red === "facebook" && post?.format === "historia") return "historia";
  return null;
}

/** ¿Esta imagen hay que encajarla para ese objetivo? Sin medidas no se sabe: se mide al programar. */
export function necesitaAjuste(medio, objetivo) {
  if (medio?.tipo !== "imagen" || !objetivo || !medio.ancho || !medio.alto) return false;
  const r = medio.ancho / medio.alto;
  const P = objetivo === "historia" ? PROPORCION_HISTORIA : PROPORCION_FEED;
  return r < P.min || r > P.max;
}

/**
 * El tamaño al que se lleva una imagen que no cabe (puro, para probarlo):
 * historia 1080×1920; feed, 1080×1350 si es demasiado alta y 1080×566 si
 * es demasiado ancha. Lo que ya cabe se queda como está.
 */
export function medidasAjuste(ancho, alto, objetivo) {
  if (objetivo === "historia") return { ancho: 1080, alto: 1920 };
  const r = ancho / alto;
  if (r < PROPORCION_FEED.min) return { ancho: 1080, alto: 1350 };
  if (r > PROPORCION_FEED.max) return { ancho: 1080, alto: 566 };
  return { ancho, alto };
}

/** La clave de una copia adaptada: por objetivo y por imagen original. */
export const claveAdaptado = (objetivo, src) => `${objetivo}|${src}`;

/**
 * Los medios que salen en una red, con las copias adaptadas en lugar de
 * los originales cuando las hay. El original no se toca: la página de
 * aprobación, el cliente y las demás redes lo ven tal cual.
 */
export function mediosParaRed(post, red, variante = "post") {
  const p = publicacionDeVariante(post, variante);
  const medios = mediosDe(p);
  const objetivo = objetivoDe(p, red);
  if (!objetivo) return medios;
  return medios.map((m) => {
    const a = post?.adaptados?.[claveAdaptado(objetivo, m.src)];
    return a?.src && m.tipo === "imagen" ? { ...m, src: a.src, ancho: a.ancho, alto: a.alto, original: m.src } : m;
  });
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

// ------------------------------------------------------------
// YouTube
// ------------------------------------------------------------

/** YouTube rechaza «<» y «>» en el título y la descripción: se cambian por comillas angulares. */
const sinAngulos = (t) => String(t ?? "").replace(/</g, "‹").replace(/>/g, "›");

/** Los bytes de un texto en UTF-8: es como cuenta YouTube la descripción. */
export const bytesDe = (texto) => new TextEncoder().encode(String(texto ?? "")).length;

/**
 * ¿Sale como Short? Un reel o una historia, vertical (o cuadrado) y de 60
 * segundos o menos. Lo que no se sabe no lo impide: un reel es vertical
 * por definición, y la duración sólo se conoce si el navegador la midió
 * al programar. YouTube decide al final; `#Shorts` es la pista.
 */
export function esShortYouTube(post) {
  if (!["reel", "historia"].includes(post?.format)) return false;
  const video = mediosDe(post).find((m) => m.tipo === "video");
  if (!video) return false;
  if (video.ancho && video.alto && video.ancho > video.alto) return false;
  return !(video.duracion > LIMITES.youtube.shortMaxSeg);
}

/**
 * El título del video: la primera línea del texto (lo que engancha), o el
 * título de la publicación, o la idea. Hasta 100 caracteres, cortado en
 * una palabra entera, y sin «<» ni «>».
 */
export function tituloYouTube(post) {
  const primera = String(post?.descripcion || post?.script || "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const base = sinAngulos(primera || post?.title || post?.idea || "").replace(/\s+/g, " ").trim();
  const max = LIMITES.youtube.titulo;
  if (base.length <= max) return base;
  const corte = base.slice(0, max - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).trim()}…`;
}

/** La descripción: el texto con sus hashtags y, si es un Short, `#Shorts` si no lo lleva ya. */
export function descripcionYouTube(post) {
  const texto = sinAngulos(textoPara(post, "youtube"));
  if (!esShortYouTube(post) || /#shorts\b/i.test(`${texto} ${tituloYouTube(post)}`)) return texto;
  return `${texto}\n\n#Shorts`.trim();
}

/**
 * Las etiquetas del video: los hashtags, sin «#», sin repetir, hasta 500
 * caracteres entre todas (YouTube cuenta la coma que las separa).
 */
export function etiquetasYouTube(post) {
  const tags = [...new Set((String(post?.hashtagsFinales ?? "").match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.slice(1)))];
  const salida = [];
  let total = 0;
  for (const t of tags) {
    const costo = t.length + (salida.length ? 1 : 0);
    if (total + costo > LIMITES.youtube.etiquetas) break;
    salida.push(t);
    total += costo;
  }
  return salida;
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
export function revisarPublicacion(post, redes = post?.redes ?? ["instagram"], { navegador = false } = {}) {
  const errores = [];
  const avisos = [];
  // El arreglo de cada problema que lo tiene, por su texto: el panel lo
  // pinta como botón al lado (ver `aplicarArreglo`).
  const arreglos = {};
  const con = (lista, texto, arreglo) => { lista.push(texto); if (arreglo) arreglos[texto] = arreglo; };
  const medios = mediosDe(post);
  const videos = medios.filter((m) => m.tipo === "video");

  if (post?.format === "live") {
    errores.push("Un directo no se puede publicar por API: queda sólo como planificación.");
    return { errores, avisos, arreglos };
  }

  if (redes.includes("instagram")) {
    const L = LIMITES.instagram;
    const texto = textoPara(post, "instagram");
    const deIG = mediosParaRed(post, "instagram");
    if (!medios.length) con(errores, "Instagram necesita al menos una imagen o un video.", { codigo: "medios", etiqueta: "Añadir imagen o video" });
    if (post?.format === "reel" && !videos.length) {
      con(errores, "Un reel necesita un video.", medios.length
        ? { codigo: medios.length > 1 ? "formato:carrusel" : "formato:post", etiqueta: medios.length > 1 ? "Publicarlo como carrusel" : "Publicarlo como post" }
        : null);
    }
    if (post?.format === "carrusel" && medios.length > 0 && medios.length < L.carruselMin) {
      con(errores, "Un carrusel necesita al menos 2 imágenes o videos.", { codigo: "formato:post", etiqueta: "Publicarlo como post" });
    }
    if (medios.length > L.carruselMax) {
      con(errores, `Instagram admite hasta ${L.carruselMax} elementos por ${post?.format === "historia" ? "tanda de historias" : "carrusel"}.`, { codigo: "recortar-medios", etiqueta: `Quedarse con los ${L.carruselMax} primeros` });
    }
    if (post?.format === "historia" && medios.length > 1) avisos.push(`Salen ${medios.length} historias seguidas, en este orden.`);
    if (post?.format === "historia" && texto) avisos.push("Una historia no muestra el texto: el texto va dentro de la imagen o el video.");
    if (texto.length > L.caracteres) {
      const mover = !post?.hashtagsEnComentario && String(post?.hashtagsFinales ?? "").trim() &&
        textoPara({ ...post, hashtagsEnComentario: true }, "instagram").length <= L.caracteres;
      con(errores, `El texto de Instagram tiene ${texto.length} caracteres; el máximo es ${L.caracteres}.`,
        mover ? { codigo: "hashtags-al-comentario", etiqueta: "Mover los hashtags al primer comentario" } : null);
    }
    const h = contarHashtags(texto) + (post?.hashtagsEnComentario ? contarHashtags(post?.hashtagsFinales) : 0);
    if (h > L.hashtags) {
      con(errores, `Instagram admite ${L.hashtags} hashtags y hay ${h}.`,
        contarHashtags(post?.hashtagsFinales) ? { codigo: "recortar-hashtags", etiqueta: `Dejar ${L.hashtags} hashtags` } : null);
    }
    if (contarMenciones(texto) > L.menciones) errores.push(`Instagram admite ${L.menciones} menciones.`);
    const objetivo = objetivoDe(post, "instagram");
    const fuera = deIG.find((m) => objetivo === "feed" && necesitaAjuste(m, "feed"));
    if (fuera) {
      if (navegador) avisos.push(`Una imagen mide ${fuera.ancho}×${fuera.alto}, fuera de lo que admite el feed (de 4:5 a 1.91:1): al programar se ajusta sola (${AJUSTES[post?.ajusteIG] ?? AJUSTES.difuminado}).`);
      else errores.push(`Una imagen mide ${fuera.ancho}×${fuera.alto}: el feed de Instagram acepta de 4:5 (vertical) a 1.91:1 (horizontal). Programa desde el panel, que la ajusta sola.`);
    }
    if (deIG.some((m) => m.tipo === "imagen" && !esJPEG(m.src))) {
      avisos.push("Instagram sólo acepta JPEG: las imágenes en otro formato se convierten al programar.");
    }
    const colab = colaboradoresDe(post);
    if (colab.length > MAX_COLABORADORES) {
      con(errores, `Instagram admite hasta ${MAX_COLABORADORES} colaboradores y hay ${colab.length}.`, { codigo: "recortar-colaboradores", etiqueta: `Dejar los ${MAX_COLABORADORES} primeros` });
    }
    if (colab.length && post?.format === "historia") {
      con(avisos, "Las historias no llevan colaboradores: sólo se invitan en posts, carruseles y reels.", { codigo: "quitar-colaboradores", etiqueta: "Quitar colaboradores" });
    }
  }

  if (redes.includes("facebook")) {
    const texto = textoPara(post, "facebook");
    if (post?.format === "historia") {
      if (!medios.length) con(errores, "Una historia de Facebook necesita una imagen o un video.", quitarRed(redes, "facebook"));
    } else {
      if (!medios.length && !texto) con(errores, "Facebook necesita texto o al menos una imagen o un video.", quitarRed(redes, "facebook"));
      if (videos.length && medios.length > 1) avisos.push("Facebook no mezcla video y fotos en una publicación: se publicará sólo el video.");
    }
    if (texto.length > LIMITES.facebook.caracteres) errores.push("El texto de Facebook es demasiado largo.");
  }

  if (redes.includes("tiktok")) {
    // Sin video, TikTok publica las fotos como carrusel (hasta 35). Las
    // DESCARGA de un dominio verificado: si no hay uno configurado, lo dice
    // la cola al publicar (el navegador no sabe del servidor).
    const fotos = medios.filter((m) => m.tipo !== "video");
    if (["historia", "live"].includes(post?.format)) con(errores, "TikTok no publica historias ni directos desde la API.", quitarRed(redes, "tiktok"));
    else if (!videos.length && !fotos.length) con(errores, "TikTok necesita un video o fotos.", quitarRed(redes, "tiktok"));
    else if (!videos.length && fotos.length > MAX_FOTOS_TIKTOK) errores.push(`TikTok admite hasta ${MAX_FOTOS_TIKTOK} fotos y hay ${fotos.length}.`);
    else if (!videos.length) avisos.push("En TikTok sale como carrusel de fotos, con música que TikTok elige; el cliente puede cambiarla desde la app.");
    else if (fotos.length) avisos.push("TikTok publica sólo el video: las fotos no salen ahí.");
    const texto = textoPara(post, "tiktok");
    if (texto.length > LIMITES.tiktok.caracteres) errores.push(`El texto de TikTok tiene ${texto.length} caracteres; el máximo es ${LIMITES.tiktok.caracteres}.`);
  }

  if (redes.includes("youtube")) {
    const L = LIMITES.youtube;
    if (!videos.length) con(errores, "YouTube sólo publica video: esta publicación no tiene ninguno.", quitarRed(redes, "youtube"));
    else {
      if (medios.length > 1) avisos.push("YouTube publica un solo video: sale el primero.");
      if (!tituloYouTube(post)) errores.push("YouTube necesita un título: escribe el texto de la publicación (su primera línea es el título).");
      const bytes = bytesDe(descripcionYouTube(post));
      if (bytes > L.descripcionBytes) {
        errores.push(`La descripción de YouTube ocupa ${bytes} bytes; el máximo es ${L.descripcionBytes} (cada tilde o emoji cuenta más de uno).`);
      }
      const primera = String(post?.descripcion || post?.script || "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
      if (primera.length > L.titulo) avisos.push(`La primera línea tiene ${primera.length} caracteres: el título de YouTube se corta a ${L.titulo}.`);
      if (/[<>]/.test(`${post?.descripcion ?? ""}${post?.hashtagsFinales ?? ""}`)) avisos.push("YouTube no admite «<» ni «>»: se cambian por ‹ y ›.");
      if (esShortYouTube(post)) avisos.push("En YouTube sale como Short (vertical y de hasta 60 s): se le añade #Shorts si no lo lleva.");
      else if (["reel", "historia"].includes(post?.format)) avisos.push("En YouTube sale como video normal, no como Short: es horizontal o dura más de 60 s.");
    }
  }

  // La historia que acompaña al post.
  if (post?.historiaTambien && !["historia", "live"].includes(post?.format)) {
    const hs = historiasDe(post);
    if (!hs.length) {
      con(errores, "Marcaste «también como historia», pero no hay ninguna imagen de historia: créala con IA o usa la del post.", { codigo: "sin-historia", etiqueta: "No publicar historia" });
    }
    else if (hs.length > LIMITES.instagram.carruselMax) errores.push(`Como mucho ${LIMITES.instagram.carruselMax} historias por publicación.`);
    else if (redes.every((r) => !conHistorias(r))) avisos.push(`${redes.map((r) => REDES[r]?.nombre ?? r).join(" y ")} no ${redes.length > 1 ? "tienen" : "tiene"} historias por API: la historia saldrá sólo en Instagram y Facebook.`);
  }

  return { errores, avisos, arreglos };
}

/** «Quitar esta red», sólo si queda otra: quitar la única no arregla nada. */
const quitarRed = (redes, red) => (redes.length > 1 ? { codigo: `quitar-red:${red}`, etiqueta: `Quitar ${REDES[red].nombre}` } : null);

/**
 * Aplica el arreglo de un problema (el `codigo` de `revisarPublicacion`)
 * y devuelve la publicación nueva. Sólo toca lo que dice el arreglo: lo
 * escrito no se reescribe. «medios» no cambia nada: lo resuelve el panel
 * abriendo la subida.
 */
export function aplicarArreglo(post, codigo) {
  const [accion, valor] = String(codigo).split(":");
  const redes = Array.isArray(post?.redes) && post.redes.length ? post.redes : ["instagram"];
  switch (accion) {
    case "formato": return { ...post, format: valor };
    case "recortar-medios": return conMedios(post, mediosDe(post).slice(0, LIMITES.instagram.carruselMax));
    case "hashtags-al-comentario": return { ...post, hashtagsEnComentario: true };
    case "recortar-hashtags": {
      const enTexto = post?.hashtagsEnComentario ? 0 : contarHashtags(post?.descripcion || post?.script);
      const libres = Math.max(0, LIMITES.instagram.hashtags - enTexto);
      const tags = String(post?.hashtagsFinales ?? "").match(/#[\p{L}\p{N}_]+/gu) ?? [];
      return { ...post, hashtagsFinales: tags.slice(0, libres).join(" ") };
    }
    case "recortar-colaboradores": return { ...post, colaboradores: colaboradoresDe(post).slice(0, MAX_COLABORADORES) };
    case "quitar-colaboradores": return { ...post, colaboradores: [] };
    case "quitar-red": return { ...post, redes: redes.filter((r) => r !== valor) };
    case "sin-historia": return { ...post, historiaTambien: false };
    default: return post;
  }
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
  "historias", "historiaTambien",
  // El ejemplo que abre el cliente mientras no hay contenido (sólo se enseña si es un enlace http).
  "referenceLink",
];

export function publicacionParaCliente(post) {
  const salida = {};
  for (const k of CAMPOS_PUBLICOS) if (post?.[k] !== undefined) salida[k] = post[k];
  // Qué se le pide: la idea o la pieza final (lib/aprobacion.js). Se
  // calcula aquí para no importar en círculo: sin elegir, pieza si hay archivo.
  salida.aprobacion = post?.aprobacion === "idea" || post?.aprobacion === "pieza"
    ? post.aprobacion : (mediosDe(post).length ? "pieza" : "idea");
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
  ...historiasDe(post).map((m) => m.src),
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
