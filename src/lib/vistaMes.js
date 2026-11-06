// ============================================================
// «Ver el mes como se verá»: la vista previa del mes (puro)
//
// La agencia revisa el mes MIRÁNDOLO, sin marcar nada como «revisado», y hay
// clientes que no piden revisión: lo que está listo se programa de una vez.
// Aquí vive lo que decide cada cosa, sin pantalla, para probarlo:
//
//   · La CUADRÍCULA del perfil de Instagram: qué entra (sólo lo que sale en el
//     feed de Instagram: ni historias, ni directos, ni lo que va sólo a otras
//     redes; lo de «La publico yo» sí, marcado), en qué orden (lo más nuevo
//     primero, como Instagram) y qué se ve de cada una (la portada de un reel,
//     la copia del feed de una imagen).
//   · El FEED: cada publicación en el orden en que sale, con las historias
//     marcadas.
//   · Qué está LISTO para programar y por qué no lo demás: la pieza, la hora,
//     el texto, las redes conectadas y `revisarPublicacion` (las mismas reglas
//     que el panel), sin pedir la aprobación del cliente.
//   · Los DETALLES de cada publicación: lo que impide programarla y lo que
//     conviene mirar (avisos del panel, la revisión del mes, lo que le falta
//     para ir al cliente sin pieza).
//
// Lo usan la vista de la agencia (calendario/VistaMes.jsx) y la página del
// cliente (pages/Aprobar.jsx, «Así se verá tu perfil»): por eso no importa
// nada pesado (la revisión de los textos llega hecha desde fuera).
// ============================================================

import {
  mediosDe, mediosParaRed, destinoInstagram, redesDe, revisarPublicacion, momentoPublicacion, REDES, conHistoria,
} from "./publicacion.js";
import { colaDe } from "./cola.js";
import { faltaParaEnviar } from "./completitud.js";
import { llevaCaption, llevaHashtags, tieneHashtags } from "./reglasFormato.js";

/** Lo que ya está en la cola (o salió): no se vuelve a programar. Lo que falló sí se puede volver a meter. */
const VIVAS = new Set(["programada", "procesando", "publicada"]);

/** El orden en que salen: el día y la hora (sin hora, a las 9:00, como la cola); a igual momento, el del calendario. */
function enOrden(days = []) {
  const lista = [];
  let n = 0;
  for (const d of days ?? []) {
    for (const post of d?.posts ?? []) {
      if (!post?.id) continue;
      lista.push({ post, fecha: d.date, cuando: momentoPublicacion(d.date, post.publishTime) ?? "", orden: n++ });
    }
  }
  return lista.sort((a, b) => (a.cuando === b.cuando ? a.orden - b.orden : a.cuando < b.cuando ? -1 : 1));
}

/**
 * ¿Sale en el perfil (la cuadrícula) de Instagram? Un post, un carrusel o un reel que va a Instagram. Ni las historias
 * (no se quedan en el perfil) ni los directos ni lo que va sólo a otras redes. Sin redes conectadas (la página del
 * cliente no las sabe), las de la publicación o, si nadie escogió, Instagram. Pura.
 */
export function entraEnLaCuadricula(post, conectadas = []) {
  if (!post || ["historia", "live"].includes(post.format)) return false;
  if (destinoInstagram(post) === "historia") return false;
  return redesDe(post, conectadas).includes("instagram");
}

/**
 * Lo que enseña el perfil de una publicación: la portada de un reel (o su video, en el fotograma escogido), y de lo
 * demás el primer medio TAL COMO SALE en Instagram (la copia 4:5 si la hay). null si aún no tiene pieza. El recorte 3:4
 * del centro lo hace la pantalla (Instagram lo saca siempre del centro: `ventanaCuadricula` en medios.js). Pura.
 */
export function miniaturaDeCuadricula(post) {
  const medios = mediosParaRed(post, "instagram");
  if (destinoInstagram(post) === "reel") {
    const portada = typeof post?.portada === "string" ? post.portada : "";
    if (portada) return { src: portada, tipo: "imagen" };
    const video = medios.find((m) => m.tipo === "video");
    if (video) return { src: video.src, tipo: "video", segundo: Number.isFinite(post?.portadaMs) ? post.portadaMs / 1000 : 0 };
  }
  const m = medios[0];
  if (!m) return null;
  return m.tipo === "video"
    ? { src: m.src, tipo: "video", segundo: 0 }
    : { src: m.src, tipo: "imagen", ...(m.ancho && m.alto ? { ancho: m.ancho, alto: m.alto } : {}) };
}

/** En qué quedó una publicación para la cuadrícula: publicada, programada o nada (sin cola, pendiente). */
function estadoEnInstagram(post, cola) {
  if (post?.status === "published") return "publicada";
  const f = colaDe(cola, post?.id).instagram;
  if (f?.estado === "publicada") return "publicada";
  if (f && (f.estado === "programada" || f.estado === "procesando")) return "programada";
  if (f?.estado === "error") return "error";
  return null;
}

/**
 * La cuadrícula del perfil con lo de este mes: lo más nuevo primero (como Instagram, que pone arriba lo último que se
 * publicó). Cada una: { post, fecha, cuando, miniatura, tipo («imagen» | «carrusel» | «reel»), aMano, estado }. Pura.
 * @param cola  las filas de la cola del calendario (para saber qué está programado o salió); vacía en el cliente.
 */
export function cuadriculaDelMes(days = [], { conectadas = [], cola = [] } = {}) {
  return enOrden(days)
    .filter(({ post }) => entraEnLaCuadricula(post, conectadas))
    .reverse()
    .map(({ post, fecha, cuando }) => ({
      post, fecha, cuando,
      miniatura: miniaturaDeCuadricula(post),
      tipo: destinoInstagram(post),
      aMano: Boolean(post.asistida),
      estado: estadoEnInstagram(post, cola),
    }));
}

/**
 * Lo que ya está publicado en Instagram (de las métricas que guarda el cron) ANTES de que empiece el mes, lo más nuevo
 * primero: va debajo de lo del mes. Lo publicado durante el mes ya está en el calendario (si se publicó por fuera de
 * la aplicación, no sale: no se sabría si es una de las del mes publicada a mano). Sólo lo que tiene miniatura, que
 * llega ya por el proxy (`/api/metricas/miniatura`: la CSP no deja pintar el CDN de Instagram). Pura.
 * @param antesDe  el primer instante del mes (ISO).
 */
export function yaPublicadasEnInstagram(publicaciones = [], { antesDe = "", max = 12 } = {}) {
  return (publicaciones ?? [])
    .filter((p) => p?.red === "instagram" && p.miniatura && p.publicadaAt && (!antesDe || p.publicadaAt < antesDe))
    .sort((a, b) => (a.publicadaAt < b.publicadaAt ? 1 : -1))
    .slice(0, max)
    .map((p) => ({ id: p.id, miniatura: p.miniatura, tipo: p.tipo, enlace: p.enlace || "", publicadaAt: p.publicadaAt, texto: p.texto || "" }));
}

/** El primer instante de un mes en Panamá (ISO), para cortar lo ya publicado. `mes` va de 0 a 11. Pura. */
export const inicioDelMes = (year, mes) => momentoPublicacion(`${year}-${String(Number(mes) + 1).padStart(2, "0")}-01`, "00:00");

/**
 * El feed del mes: cada publicación en el orden en que sale (del día 1 al último), sin los directos. Las historias van
 * marcadas (`esHistoria`) y las que llevan su historia, también (`conHistoria`). `redes`: las que la llevan. Pura.
 */
export function feedDelMes(days = [], { conectadas = [] } = {}) {
  return enOrden(days)
    .filter(({ post }) => post.format !== "live")
    .map(({ post, fecha, cuando }) => ({
      post, fecha, cuando,
      redes: redesDe(post, conectadas),
      esHistoria: post.format === "historia" || destinoInstagram(post) === "historia",
      conHistoria: conHistoria(post),
      aMano: Boolean(post.asistida),
    }));
}

/** Lo que dice «falta la pieza» cuando no hay medios: no se repite con lo que `revisarPublicacion` diga de lo mismo. */
const DE_LA_PIEZA = /necesita (al menos )?una imagen|necesita un video|necesita una imagen o un video|el video tiene que estar|las fotos tienen que estar/i;

/**
 * ¿Se puede programar YA, sin pedir la aprobación del cliente? → { estado, motivos, redes, cuando }.
 * `estado`: «lista», «no-lista» (con sus `motivos`), «en-cola» (ya programada o saliendo), «publicada», «a-mano» (la
 * publica una persona: «La publico yo») o «directo». Lo que el navegador arregla solo al programar —la imagen a JPEG,
 * la copia 4:5 o 9:16— no impide nada: son avisos (`navegador: true`, como «Programar lo aprobado»). Pura.
 * @param conectadas  las redes que el cliente tiene conectadas de verdad.
 */
export function estadoParaProgramar(post, fecha, { conectadas = [], cola = [], ahora = Date.now() } = {}) {
  const cuando = momentoPublicacion(fecha, post?.publishTime);
  const base = { redes: [], cuando, motivos: [] };
  if (!post) return { ...base, estado: "no-lista", motivos: ["La publicación no existe."] };
  if (post.status === "published") return { ...base, estado: "publicada" };
  const filas = Object.values(colaDe(cola, post.id));
  if (filas.length && filas.every((f) => f.estado === "publicada")) return { ...base, estado: "publicada" };
  if (filas.some((f) => VIVAS.has(f.estado))) return { ...base, estado: "en-cola" };
  if (post.format === "live") return { ...base, estado: "directo", motivos: ["Un directo se hace en vivo: no se programa."] };
  if (post.asistida) return { ...base, estado: "a-mano", motivos: ["La publicas tú desde el teléfono («La publico yo»)."] };

  const motivos = [];
  const medios = mediosDe(post);
  if (post.status === "rejected") motivos.push("El cliente pidió cambios: hazlos antes de programarla.");
  if (!medios.length) motivos.push("Le falta la pieza (la imagen o el video).");
  if (!/^\d{2}:\d{2}$/.test(String(post.publishTime ?? ""))) motivos.push("Le falta la hora.");
  if (llevaCaption(post.format) && !String(post.descripcion || post.script || "").trim()) motivos.push("Le falta el texto.");
  const pedidas = redesDe(post, conectadas);
  const redes = pedidas.filter((r) => conectadas.includes(r));
  if (!conectadas.length) motivos.push("El cliente no tiene ninguna red conectada (Ajustes → Integraciones).");
  else if (!redes.length) motivos.push(`El cliente no tiene cuenta de ${pedidas.map((r) => REDES[r]?.nombre ?? r).join(" ni de ")} asignada.`);
  else {
    const errores = revisarPublicacion(post, redes, { navegador: true }).errores;
    motivos.push(...(medios.length ? errores : errores.filter((e) => !DE_LA_PIEZA.test(e))));
  }
  if (cuando && Date.parse(cuando) < ahora - 60_000) motivos.push("Su día y hora ya pasaron.");
  return { ...base, redes, estado: motivos.length ? "no-lista" : "lista", motivos: [...new Set(motivos)] };
}

/** Las palabras de cada estado, para el chip de la vista y la lista de lo que no se programa. */
export const NOMBRE_ESTADO_PROGRAMAR = Object.freeze({
  lista: "Lista para programar",
  "no-lista": "No está lista",
  "en-cola": "Ya está en la cola",
  publicada: "Publicada",
  "a-mano": "La publicas tú",
  directo: "Directo",
});

/**
 * «Programar todo lo listo»: lo del mes que se puede programar ya, y lo que no, con su motivo. Lo que ya está en la
 * cola, lo publicado y lo de «La publico yo» no cuentan como «no listo» (no hay nada que arreglar): van aparte en
 * `cuentas`. `listas` lleva la forma que espera `programarAprobadasDe` ({ post, redes }) y su fecha. Pura.
 */
export function loListoDelMes(days = [], { conectadas = [], cola = [], ahora = Date.now() } = {}) {
  const listas = [];
  const noListas = [];
  const cuentas = { "en-cola": 0, publicada: 0, "a-mano": 0, directo: 0 };
  for (const { post, fecha } of enOrden(days)) {
    const e = estadoParaProgramar(post, fecha, { conectadas, cola, ahora });
    if (e.estado === "lista") listas.push({ post, fecha, redes: e.redes, cuando: e.cuando });
    else if (e.estado === "no-lista") noListas.push({ post, fecha, motivos: e.motivos, cuando: e.cuando });
    else cuentas[e.estado] += 1;
  }
  return { listas, noListas, cuentas };
}

/** El título corto de una publicación, para las listas. */
export const tituloCorto = (post) => String(post?.title || post?.idea || post?.descripcion || post?.script || "Sin título")
  .replace(/\s+/g, " ").trim().slice(0, 80);

const fechaHoraCorta = (cuando) => (cuando ? new Date(cuando).toLocaleString("es-PA", {
  timeZone: "America/Panama", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
}) : "");

/**
 * Lo que dice la confirmación antes de programar: «Programar 14 publicaciones de noviembre» y la lista corta (hasta
 * `max`, con «y N más»). `pendientesCliente`: cuántas las tiene el cliente sin responder (se programan igual: si pide
 * cambios, salen solas de la cola). Pura.
 */
export function confirmacionDeProgramar(listas = [], mes = "", max = 8) {
  const n = listas.length;
  const titulo = `Programar ${n} ${n === 1 ? "publicación" : "publicaciones"}${mes ? ` de ${mes}` : ""}`;
  const lineas = listas.slice(0, max).map(({ post, cuando, redes }) => ({
    id: post.id,
    texto: `${fechaHoraCorta(cuando)} · ${tituloCorto(post)}`,
    redes: (redes ?? []).map((r) => REDES[r]?.nombre ?? r).join(", "),
  }));
  const pendientesCliente = listas.filter(({ post }) => post.status === "pending" && post.enviadoAt).length;
  return { titulo, lineas, mas: Math.max(0, n - max), pendientesCliente };
}

/** Avisos del panel que el navegador arregla solo al programar: en los detalles serían ruido. */
const SOLO_AL_PROGRAMAR = /se convierten? al programar|sólo lee la portada en JPEG/i;

/**
 * Los detalles de una publicación, SIN IA: lo que impide programarla (`motivos`, de `estadoParaProgramar`) y lo que
 * conviene mirar (`avisos`): los del panel (`revisarPublicacion`), la revisión de los textos del mes
 * (`problemasTexto`, de revisionMes.js, que llega hecha: aquí no se importa), lo que le falta para ir al cliente sin
 * pieza (`faltaParaEnviar`) y los hashtags que su formato lleva y no tiene. Pura.
 * @returns {{ estado, motivos: string[], avisos: string[], redes: string[], cuando }}
 */
export function detallesDe(post, fecha, { conectadas = [], cola = [], ahora = Date.now(), problemasTexto = [] } = {}) {
  const e = estadoParaProgramar(post, fecha, { conectadas, cola, ahora });
  const avisos = [];
  const redes = e.redes.length ? e.redes : redesDe(post, conectadas);
  if (post?.status !== "published" && post?.format !== "live") {
    avisos.push(...revisarPublicacion(post, redes, { navegador: true }).avisos.filter((a) => !SOLO_AL_PROGRAMAR.test(a)));
  }
  avisos.push(...(problemasTexto ?? []).map((p) => (typeof p === "string" ? p : p?.texto)).filter(Boolean));
  const falta = faltaParaEnviar(post);
  if (falta.length) avisos.push(`Para que el cliente la entienda sin pieza le falta ${falta.join(", ")}.`);
  if (llevaHashtags(post?.format) && post?.status !== "published" && String(post?.descripcion || post?.script || "").trim() && !tieneHashtags(post)) {
    avisos.push("No lleva hashtags.");
  }
  // En «a mano» y «directo» el motivo es informativo: no hay nada que arreglar para programar.
  const motivos = e.estado === "no-lista" ? e.motivos : [];
  return { estado: e.estado, motivos, avisos: [...new Set(avisos)], redes, cuando: e.cuando, nota: e.estado === "no-lista" ? "" : e.motivos[0] ?? "" };
}

/** Los filtros de la vista Detalles. */
export const FILTROS_DETALLES = Object.freeze([
  ["todas", "Todas"],
  ["avisos", "Con algo que mirar"],
  ["no-listas", "No listas para programar"],
]);

/** ¿Pasa el filtro? Pura. */
export function pasaFiltroDetalles(detalle, filtro = "todas") {
  if (filtro === "no-listas") return detalle.estado === "no-lista";
  if (filtro === "avisos") return detalle.motivos.length > 0 || detalle.avisos.length > 0;
  return true;
}
