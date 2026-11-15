// ============================================================
// Programar lo aprobado de UN calendario
//
// Lo usan «Programar lo aprobado» del calendario, «Programar todo lo listo» de «Ver el mes» y el bloque «Aprobadas,
// por programar» de Producción, que es el paso final fuera del calendario.
//
// AHORA LO HACE EL SERVIDOR (worker/lib/programarServidor.js). Antes la pantalla preparaba las imágenes (JPEG y copias
// 4:5 / 9:16) una tras otra y guardaba el mes al final: si se cerraba la pestaña a la mitad no quedaba nada. Ahora se
// guarda el mes YA (lo que sale es lo que hay en D1), el servidor crea un lote que el Container prepara y la cola
// programa publicación por publicación aunque se cierre la pestaña, y esto sólo lo SIGUE. Al terminar se relee el mes
// (con las imágenes preparadas) para que el estado de la pantalla no se quede con las de antes.
//
// Sin Container (en local) el servidor contesta 409 `sin_container` y se sigue por el camino de antes: la pantalla
// prepara cada una por su lado y programa todas en una petición.
// ============================================================

import { prepararParaRedes } from "./medios.js";
import { marcarActualizada } from "./publicacion.js";
import { saveCalendar, programarVarias, subirImagenPublicacion, pedir, mesDeCalendario } from "./db.js";

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
/** Cada cuánto se mira cómo va el lote, y lo más que se espera antes de dejarlo seguir solo. */
const CADA_MS = 2500;
const ESPERA_MAX_MS = 20 * 60_000;

const tituloDe = (lista, id) => {
  const p = lista.find((x) => x.post.id === id)?.post;
  return p?.title || p?.idea || "Publicación";
};

/**
 * Lo crea en el servidor y lo sigue hasta que termine. → { programadas, fallidas, sigue } o null si no hay Container
 * (`sigue`: se dejó de esperar y continúa solo en el servidor).
 */
async function porElServidor({ calId, lista, avisar, esperar }) {
  let r;
  try {
    r = await pedir("/publicar/lotes", { method: "POST", body: JSON.stringify({ calendarId: calId, postIds: lista.map((x) => x.post.id) }) });
  } catch (e) {
    if (e.estado === 409 && e.datos?.codigo === "sin_container") return null;
    throw e;
  }
  let lote = r.lote;
  const inicio = Date.now();
  while (lote?.estado === "en_marcha" && Date.now() - inicio < ESPERA_MAX_MS) {
    avisar(lote.nota && lote.nota !== "En cola" ? lote.nota : `Preparando y programando (${lote.hechas + lote.fallidas.length + 1} de ${lote.total})…`);
    await esperar(CADA_MS);
    try {
      lote = (await pedir(`/publicar/lotes/${encodeURIComponent(lote.id)}`))?.lote ?? lote;
    } catch { /* una lectura que falla no corta: el servidor sigue */ }
  }
  // El Container no contestó (en local no se arranca): el servidor no preparó nada y lo hace la pantalla.
  if (lote?.sinContainer) return null;
  return {
    programadas: lote?.programadas ?? 0,
    fallidas: (lote?.fallidas ?? []).map((f) => ({ ...f, titulo: tituloDe(lista, f.postId) })),
    sigue: lote?.estado === "en_marcha",
  };
}

/**
 * @param lista  [{ post, redes }] (de `revisarAprobadas`)
 * @returns { nuevo, cambiado, programadas, fallidas: [{ postId, motivo, titulo }], sigue }
 */
export async function programarAprobadasDe({ cal, clienteDb, colorMarca, lista, avisar = () => {}, preparar = prepararParaRedes, esperar = dormir }) {
  const calId = cal.dbId || cal.id;
  if (lista.length) {
    // Lo pendiente del mes, guardado YA: el servidor prepara y programa lo que hay en D1.
    avisar("Guardando el calendario…");
    const guardado = await saveCalendar(cal, clienteDb);
    const r = await porElServidor({ calId, lista, avisar, esperar });
    if (r) {
      // El servidor cambió las imágenes (JPEG, copias): el mes de ahora, para no quedarse con el de antes.
      const fresco = await mesDeCalendario(clienteDb, cal.year, cal.month).catch(() => null);
      return { nuevo: fresco ?? guardado ?? cal, cambiado: Boolean(fresco), ...r };
    }
  }
  return enElNavegador({ cal, calId, clienteDb, colorMarca, lista, avisar, preparar });
}

/** El camino de antes (sin Container): la pantalla prepara cada una y programa todas en una petición. */
async function enElNavegador({ cal, calId, clienteDb, colorMarca, lista, avisar, preparar }) {
  const ahoraISO = new Date().toISOString();
  const preparadas = new Map();
  // Cada una se prepara POR SU LADO: antes, una imagen que no se podía leer (o un video que no cargaba) lanzaba y el
  // lote entero se iba sin programar NADA, sin decir cuál; una a una, desde su panel, las demás sí salían.
  const noPreparadas = [];
  for (const [i, r] of lista.entries()) {
    avisar(`Preparando imágenes (${i + 1} de ${lista.length})…`);
    try {
      const { post, cambio } = await preparar(r.post, r.redes, {
        subir: (f) => subirImagenPublicacion(clienteDb, f),
        colorMarca,
      });
      if (cambio) preparadas.set(post.id, post);
    } catch (e) {
      noPreparadas.push({ postId: r.post.id, motivo: `No se pudieron preparar sus archivos: ${e?.message || "error desconocido"}. Ábrela y vuelve a ponerlos.` });
    }
  }
  const aProgramar = lista.filter((x) => !noPreparadas.some((f) => f.postId === x.post.id));
  const nuevo = {
    ...cal,
    days: (cal.days || []).map((d) => ({
      ...d,
      posts: (d.posts || []).map((p) => (preparadas.has(p.id) ? marcarActualizada(p, preparadas.get(p.id), ahoraISO) : p)),
    })),
  };
  avisar("Guardando el calendario…");
  const guardado = await saveCalendar(nuevo, clienteDb);
  avisar("Programando…");
  const r = aProgramar.length ? await programarVarias(calId, aProgramar.map((x) => x.post.id)) : { programadas: [], fallidas: [] };
  return {
    nuevo: guardado ?? nuevo,
    cambiado: preparadas.size > 0,
    programadas: r?.programadas?.length ?? 0,
    fallidas: [...noPreparadas, ...(r?.fallidas ?? [])].map((f) => ({ ...f, titulo: tituloDe(lista, f.postId) })),
    sigue: false,
  };
}
