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
  // La foto QUIETA, sólo con la música (decisión de la agencia: a veces el movimiento sobra).
  Object.freeze({ id: "ninguno", nombre: "Sin animación" }),
]);
export const MOVIMIENTO_FOTO = "acercar";

/** El `origen.tipo` del video animado que sale de una foto (videos_proyectos.origen): el render lo reconoce así. */
export const ORIGEN_FOTO = "foto";

/** El `origen.tipo` del video que sale de un CARRUSEL (sus láminas una tras otra, con transiciones). */
export const ORIGEN_CARRUSEL = "carrusel";

/** Cuánto dura cada lámina del carrusel en el reel (s) sin voz; con voz, lo que dura lo que se dice de ella. */
export const SEGUNDOS_LAMINA = Object.freeze([2, 3, 4, 5]);
export const SEGUNDOS_LAMINA_INICIAL = 3;
/** Las transiciones entre láminas (las del motor del video animado). */
export const TRANSICIONES_CARRUSEL = Object.freeze([
  Object.freeze({ id: "fundido", nombre: "Fundido" }),
  Object.freeze({ id: "deslizar", nombre: "Deslizar" }),
  Object.freeze({ id: "zoom", nombre: "Zoom" }),
  Object.freeze({ id: "barrido", nombre: "Barrido" }),
  Object.freeze({ id: "corte", nombre: "Corte seco" }),
]);
export const TRANSICION_CARRUSEL = "fundido";
/** El movimiento de las láminas: el mismo en todas o «alternar» (dentro, fuera, paneo…). */
export const MOVIMIENTOS_CARRUSEL = Object.freeze([Object.freeze({ id: "alternar", nombre: "Alternar (dentro, fuera, paneo)" }), ...MOVIMIENTOS_FOTO]);
const ALTERNA = ["acercar", "alejar", "paneo"];

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
  // Un carrusel ya convertido se cambia por su camino (`puedeCarruselAReel`).
  if (Array.isArray(post.conMusica?.medios) && post.conMusica.medios.length > 1) return { ok: false, motivo: "Es un carrusel convertido en reel: cámbialo desde «Carrusel en reel»." };
  if (post.conMusica?.foto?.src) return { ok: true, motivo: "", yaEs: true };
  if (post.format && post.format !== "post") return { ok: false, motivo: "Sólo un post de una foto se convierte en reel con música (un carrusel se publica a mano con la música de Instagram)." };
  const medios = mediosDe(post);
  if (medios.length !== 1) return { ok: false, motivo: medios.length ? "Lleva más de un archivo: sólo un post de UNA foto." : "Primero pon la foto." };
  if (medios[0].tipo !== "imagen") return { ok: false, motivo: "Ya es un video." };
  return { ok: true, motivo: "" };
}

/** Las LÁMINAS (imágenes) de un carrusel, tal cual están en sus medios. Pura. */
export function laminasDe(post) {
  if (Array.isArray(post?.conMusica?.medios) && post.conMusica.medios.length > 1) return post.conMusica.medios.filter((m) => m?.src && m.tipo !== "video");
  const crudos = Array.isArray(post?.medios) && post.medios.length ? post.medios.filter((m) => m?.src) : mediosDe(post);
  return crudos.filter((m) => (m.tipo ?? "imagen") === "imagen");
}

/**
 * ¿Se puede convertir este CARRUSEL en un reel con música (sus láminas una tras otra, con transiciones, y voz si se
 * quiere)? De 2 a 10 imágenes, sin videos, sin publicar. Uno ya convertido también (para cambiarlo). → { ok, motivo, yaEs }. Pura.
 */
export function puedeCarruselAReel(post) {
  if (!post) return { ok: false, motivo: "No hay publicación." };
  if (esPublicada(post)) return { ok: false, motivo: "Ya se publicó." };
  if (Array.isArray(post.conMusica?.medios) && post.conMusica.medios.length > 1) return { ok: true, motivo: "", yaEs: true };
  if (post.format !== "carrusel") return { ok: false, motivo: "Esto es para un carrusel." };
  const medios = mediosDe(post);
  if (medios.some((m) => m.tipo === "video")) return { ok: false, motivo: "Lleva un video: sólo un carrusel de imágenes." };
  if (medios.length < 2) return { ok: false, motivo: "Un carrusel necesita al menos dos imágenes." };
  if (medios.length > 10) return { ok: false, motivo: "Como mucho 10 láminas." };
  return { ok: true, motivo: "" };
}

/** Los segundos de cada lámina, a uno de los que hay. Pura. */
export const segundosDeLamina = (s) => (SEGUNDOS_LAMINA.includes(Number(s)) ? Number(s) : SEGUNDOS_LAMINA_INICIAL);
export const transicionDeCarrusel = (t) => (TRANSICIONES_CARRUSEL.some((x) => x.id === t) ? t : TRANSICION_CARRUSEL);
export const movimientoDeCarrusel = (m) => (MOVIMIENTOS_CARRUSEL.some((x) => x.id === m) ? m : "alternar");

/**
 * El GUION del reel de un carrusel: una escena por lámina, la lámina a sangre (entera si no es vertical) con su
 * movimiento, la TRANSICIÓN escogida entre una y otra y, si hay `hablas` (la voz de cada lámina), lo que se dice en ella
 * con subtítulos; sin voz, cada lámina dura `segundos`. El logo del kit, en la última. La música va en el SONIDO. Pura.
 */
export function guionDeCarrusel({ laminas = [], segundos = SEGUNDOS_LAMINA_INICIAL, transicion = TRANSICION_CARRUSEL, movimiento = "alternar", hablas = [], titulo = "", logo = null }) {
  // Un video dura al menos 5 s: con dos láminas cortas, cada una se alarga lo justo.
  const dura = Math.max(segundosDeLamina(segundos), Math.ceil(5 / Math.max(1, Math.min(10, laminas.length))));
  const tr = transicionDeCarrusel(transicion);
  const mov = movimientoDeCarrusel(movimiento);
  const conVoz = hablas.some((h) => String(h ?? "").trim());
  const escenas = laminas.slice(0, 10).map((l, i) => {
    const habla = String(hablas[i] ?? "").replace(/\s+/g, " ").trim();
    const capas = [{
      tipo: "imagen", id: `lamina${i + 1}`, archivo: String(l.archivoId ?? ""), rol: "foto", encuadre: "completo",
      recorte: recorteDeFoto(l.ancho, l.alto), movimiento: mov === "alternar" ? ALTERNA[i % ALTERNA.length] : movimientoDeFoto(mov),
      dura, entra: { s: 0 }, animacion: { entrada: "aparece", salida: "ninguna", bucle: "ninguno" },
    }];
    if (logo && i === laminas.length - 1) {
      const p = logoEnElReel(logo);
      capas.push({ tipo: "logo", id: "logo", pos: { x: p.x, y: p.y }, tam: p.tam, entra: { s: 0 }, animacion: { entrada: "aparece", salida: "ninguna", bucle: "ninguno" } });
    }
    // Con voz, cada lámina se ve al menos sus segundos: lo que falte a su frase (a 2,5 palabras por segundo) va de pausa.
    const palabras = habla ? habla.split(/\s+/).filter(Boolean).length : 0;
    const pausa = habla ? Math.max(0, Math.min(3, Math.round((dura - palabras / 2.5) * 10) / 10)) : 0;
    return {
      id: `l${i + 1}`, tipo: "producto", habla, ...(pausa > 0 ? { pausa } : {}), pantalla: "", fondo: { tipo: "plano", color: "oscuro" },
      transicion: i === 0 || tr === "corte" ? { tipo: "corte", dur: 0 } : { tipo: tr, dur: 0.5 }, capas,
    };
  });
  const nombre = String(titulo ?? "").replace(/\s+/g, " ").trim();
  return {
    version: 1,
    titulo: `Carrusel en reel${nombre ? `: ${nombre}` : ""}`.slice(0, 120),
    formatos: ["9:16"],
    estilo: { grano: 0, ritmo: dura <= 2 ? "rapido" : "calmado" },
    escenas,
    subtitulos: { activo: conVoz },
    musica: null,
  };
}

/**
 * Lo que se le pide a la IA para la VOZ de un carrusel: una frase por lámina (lo que se dice mientras se ve), con lo que
 * ya dice la publicación. Pura.
 */
export function pedidoDeVozCarrusel({ marca = "la marca", n, titulo = "", idea = "", descripcion = "", textoPieza = "", guion = "", segundos = SEGUNDOS_LAMINA_INICIAL }) {
  const palabras = Math.max(4, Math.round(segundos * 2.5));
  return [
    `Escribe la LOCUCIÓN (voz en off) de un reel de «${marca}» hecho con las ${n} láminas de un carrusel, una tras otra. Español latino neutro, de tú, cercano.`,
    titulo ? `Título: ${titulo}` : "", idea ? `Idea: ${idea}` : "",
    guion ? `Lo que dice cada lámina (su guion): ${String(guion).slice(0, 1500)}` : "",
    textoPieza ? `Texto en la pieza: ${String(textoPieza).slice(0, 400)}` : "",
    descripcion ? `Caption: ${String(descripcion).slice(0, 1200)}` : "",
    `Una frase por lámina, en orden, de unas ${palabras} palabras como mucho cada una (se dice mientras se ve esa lámina). La primera engancha; la última invita a actuar (escribir, comprar, guardar). Nada inventado: sólo lo que dice la publicación (ni precios, ni datos que no estén).`,
    `RESPONDE SÓLO con este JSON: {"lineas": ["frase de la lámina 1", "…"]} con exactamente ${n} frases.`,
  ].filter(Boolean).join("\n\n");
}

/** Lee las frases de la IA: exactamente `n` (las que falten, vacías: esa lámina va sin voz). Pura. */
export function leerVozCarrusel(texto, n) {
  const m = /\{[\s\S]*\}/.exec(String(texto ?? ""));
  let lineas = [];
  try { lineas = JSON.parse(m?.[0] ?? "{}").lineas ?? []; } catch { lineas = []; }
  const limpias = (Array.isArray(lineas) ? lineas : []).map((l) => String(l ?? "").replace(/[*#_]/g, "").replace(/\s+/g, " ").trim().slice(0, 220));
  return Array.from({ length: n }, (_, i) => limpias[i] ?? "");
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
export const esVideoDeFoto = (origen) => origen?.tipo === ORIGEN_FOTO || origen?.tipo === ORIGEN_CARRUSEL;

/**
 * La publicación con el REEL puesto: formato reel, el mp4 como su ÚNICO medio y la foto de PORTADA, y lo de antes
 * apuntado en `conMusica` ({ foto, formato, portada, videoId, en }) para volver. Si ya era «con música», sólo cambia el
 * video (la foto apuntada se queda). `foto`: la src de la foto con que se hizo el video; si la publicación ya no la
 * lleva (alguien la cambió mientras se renderizaba), null: el video se queda en la galería. Pura.
 */
export function postConMusica(post, medio, { videoId = "", foto = "", ahora = "" } = {}) {
  if (!post || !medio?.src) return null;
  const previo = post.conMusica?.foto?.src ? post.conMusica : null;
  // Un CARRUSEL: todas sus láminas se apuntan para volver; la primera es la portada (y la «foto» con que se comprueba).
  const laminas = !previo && post.format === "carrusel" ? laminasDe(post) : [];
  const actual = previo ? previo.foto : laminas.length > 1 ? laminas[0] : fotoDe(post);
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
      : { foto: actual, ...(laminas.length > 1 ? { medios: laminas } : {}), formato: post.format || "post", portada: post.portada ?? null, videoId: String(videoId ?? ""), en: ahora || "" },
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
    ...conMedios(resto, Array.isArray(cm.medios) && cm.medios.length > 1 ? cm.medios : [cm.foto]),
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
