// ============================================================
// El AVISO A LA HORA de lo que se publica a mano («La publico yo»), desde el cron
//
// Lo que sale desde el teléfono —un carrusel con la música de Instagram, un sticker, una encuesta— no lo publica la
// cola: si nadie se acuerda a su hora, no sale. El cron avisa a la campana 10 minutos antes y a la hora, a quien lleva la
// publicación (o a todo el equipo si nadie), con el enlace a /a-mano/<calendario>/<publicación>.
//
//   · `sincronizarAvisosAMano` (al guardar un calendario, desde `resincronizarCalendario`): una fila de `avisos_a_mano`
//     (0076) por publicación a mano sin publicar, con su momento. Sin nada a mano en el calendario NO consulta nada (el
//     guardado va cada 600 ms mientras se escribe). Si el momento cambia, los avisos se vuelven a dar.
//   · `avisosAManoPendiente` (el cron): UNA consulta por el índice; sólo si algo toca, se apunta el aviso ANTES de darlo
//     (con lo leído como condición: dos vueltas que se crucen no avisan dos veces), se comprueba contra el calendario
//     (la fila es un atajo: lo que dejó de ser a mano, se publicó o se movió no avisa) y se avisa. Como mucho
//     `MAX_POR_VUELTA` por vuelta, unas cinco consultas cada uno: cabe en los límites del plan gratuito.
//   · Lo que lleva más de `VIEJO_MS` pasado (se marcó a mano una publicación de ayer) se apunta sin avisar: un «es la
//     hora» de algo de hace un día no sirve.
// ============================================================

import { crearAcceso, avisosAManoPendientes, NULO } from "./acceso.js";
import { avisar, miembrosDe } from "./equipo.js";
import { ahora } from "./ids.js";
import { momentoPublicacion } from "../../src/lib/publicacion.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };

/** Cuánto antes llega el primer aviso. */
export const PREVIO_MS = 10 * 60_000;
/** Pasado esto, el momento ya no se avisa (se apunta y ya). */
export const VIEJO_MS = 2 * 60 * 60_000;
/** Los avisos que se dan como mucho en una vuelta del cron. */
export const MAX_POR_VUELTA = 3;

/** La fila de una publicación a mano: «<calendario>|<publicación>». */
export const idAviso = (calId, postId) => `${calId}|${postId}`;

/**
 * Lo que se publica a mano en un calendario: [{ id, post_id, para }] por publicación `asistida` sin publicar y con día.
 * `para` es su momento (Panamá, sin hora a las 9:00) en ISO UTC. Pura.
 */
export function aManoDelCalendario(calId, days) {
  const salida = [];
  for (const d of Array.isArray(days) ? days : []) {
    for (const p of d?.posts ?? []) {
      if (!p?.id || !p.asistida || p.status === "published") continue;
      const para = momentoPublicacion(d.date, p.publishTime);
      if (para) salida.push({ id: idAviso(calId, p.id), post_id: String(p.id), para });
    }
  }
  return salida;
}

/**
 * Al guardar un calendario (fila cruda: id, client_id, days): sus avisos a mano al día. Nuevas filas para lo que pasó a
 * mano, el momento nuevo (y los avisos otra vez) para lo que cambió de hora o de día, fuera lo que dejó de serlo. Sin
 * nada a mano, ni una consulta. → cuántas filas cambió. No lanza: un aviso perdido no puede tumbar un guardado.
 */
export async function sincronizarAvisosAMano(acceso, cal) {
  try {
    const quiero = aManoDelCalendario(cal?.id, leerJSON(cal?.days, []));
    if (!quiero.length || !cal?.client_id) return 0;
    const hay = await acceso.leer("avisos_a_mano", { calendar_id: cal.id });
    const porId = new Map(hay.map((f) => [f.id, f]));
    const momento = ahora();
    const escribir = quiero
      .filter((q) => porId.get(q.id)?.para !== q.para)
      .map((q) => ({
        id: q.id, client_id: cal.client_id, calendar_id: cal.id, post_id: q.post_id, para: q.para,
        previo_at: null, hora_at: null, created_at: porId.get(q.id)?.created_at ?? momento, updated_at: momento,
      }));
    const fuera = hay.filter((f) => !quiero.some((q) => q.id === f.id)).map((f) => f.id);
    if (escribir.length) await acceso.guardarVarios("avisos_a_mano", escribir);
    if (fuera.length) await acceso.borrarVarios("avisos_a_mano", fuera);
    return escribir.length + fuera.length;
  } catch (e) {
    console.error("avisos a mano:", e?.message ?? e);
    return 0;
  }
}

/** El texto del aviso. `previo`: 10 minutos antes; si no, es la hora. Pura. */
export function textoDelAviso({ titulo, cliente, conMusica, previo }) {
  const que = `«${String(titulo || "la publicación").slice(0, 70)}»${cliente ? ` de ${cliente}` : ""}`;
  const musica = conMusica ? " con la música de Instagram" : "";
  return previo
    ? `En 10 minutos: publica a mano ${que}${musica}. Abre la pantalla del teléfono para tenerlo listo.`
    : `Es la hora: publica a mano ${que}${musica}. En la pantalla del teléfono están las imágenes en orden, el texto y la canción.`;
}

/**
 * El paso del cron: los avisos a mano que tocan (10 minutos antes y a la hora). → cuántos se apuntaron (0: nada que
 * hacer, y entonces costó UNA consulta).
 */
export async function avisosAManoPendiente(env, cuando = new Date()) {
  const ahoraMs = cuando.getTime();
  const filas = await avisosAManoPendientes(env.DB, new Date(ahoraMs + PREVIO_MS).toJSON(), 10);
  // Una con el previo ya dado espera su hora sin hacer nada más.
  const tocan = filas.filter((f) => Date.parse(f.para) <= ahoraMs || !f.previo_at).slice(0, MAX_POR_VUELTA);
  let hechos = 0;
  for (const f of tocan) {
    const acceso = crearAcceso(env.DB, f.owner_id);
    const aLaHora = Date.parse(f.para) <= ahoraMs;
    const momento = ahora();
    // Apuntado ANTES de avisar, con lo leído como condición: si otra vuelta ya lo hizo, no cambia ninguna fila.
    const n = await acceso.actualizar("avisos_a_mano", { id: f.id, hora_at: NULO, ...(aLaHora ? {} : { previo_at: NULO }) },
      aLaHora ? { hora_at: momento, previo_at: f.previo_at ?? momento, updated_at: momento } : { previo_at: momento, updated_at: momento });
    if (!n) continue;
    hechos += 1;
    if (ahoraMs - Date.parse(f.para) > VIEJO_MS) continue;
    try {
      // El calendario es la verdad: lo que ya no es a mano, se publicó o cambió de momento no avisa.
      const cal = await acceso.leerUno("calendars", { id: f.calendar_id, client_id: f.client_id });
      let post = null;
      let fecha = null;
      for (const d of leerJSON(cal?.days, [])) {
        const p = (d?.posts ?? []).find((x) => x?.id === f.post_id);
        if (p) { post = p; fecha = d.date; break; }
      }
      if (!post?.asistida || post.status === "published" || momentoPublicacion(fecha, post.publishTime) !== f.para) continue;
      const cliente = await acceso.leerUno("clients", { id: f.client_id });
      const para = post.responsableId ? [post.responsableId] : (await miembrosDe(acceso)).map((m) => m.userId);
      await avisar(env, acceso, {
        para, tipo: "a-mano",
        texto: textoDelAviso({ titulo: post.title || post.idea, cliente: cliente?.name, conMusica: Boolean(post.conMusicaInstagram || post.cancionInstagram), previo: !aLaHora }),
        enlace: `/a-mano/${encodeURIComponent(f.calendar_id)}/${encodeURIComponent(f.post_id)}`,
      });
    } catch (e) {
      console.error("aviso a mano:", e?.message ?? e);
    }
  }
  return hechos;
}
