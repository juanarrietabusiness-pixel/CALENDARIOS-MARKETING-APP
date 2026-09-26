// ============================================================
// Programar lo aprobado de UN calendario (con el navegador delante)
//
// Lo usan «Programar lo aprobado» del calendario y el bloque «Aprobadas,
// por programar» de la página Programación, que es el paso final fuera
// del calendario. Prepara las imágenes de cada una como el panel (JPEG y
// copias 4:5 / 9:16: el Worker no puede tocar imágenes), guarda el
// calendario UNA vez —lo que sale es lo que hay en D1— y programa todas
// en una sola petición.
// ============================================================

import { prepararParaRedes } from "./medios.js";
import { marcarActualizada } from "./publicacion.js";
import { saveCalendar, programarVarias, subirImagenPublicacion } from "./db.js";

/**
 * @param lista  [{ post, redes }] (de `revisarAprobadas`)
 * @returns { nuevo, cambiado, programadas, fallidas: [{ postId, motivo, titulo }] }
 */
export async function programarAprobadasDe({ cal, clienteDb, colorMarca, lista, avisar = () => {} }) {
  const ahoraISO = new Date().toISOString();
  const preparadas = new Map();
  for (const [i, r] of lista.entries()) {
    avisar(`Preparando imágenes (${i + 1} de ${lista.length})…`);
    const { post, cambio } = await prepararParaRedes(r.post, r.redes, {
      subir: (f) => subirImagenPublicacion(clienteDb, f),
      colorMarca,
    });
    if (cambio) preparadas.set(post.id, post);
  }
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
  const r = await programarVarias(cal.dbId || cal.id, lista.map((x) => x.post.id));
  const titulo = (id) => {
    const p = lista.find((x) => x.post.id === id)?.post;
    return p?.title || p?.idea || "Publicación";
  };
  return {
    nuevo: guardado ?? nuevo,
    cambiado: preparadas.size > 0,
    programadas: r?.programadas?.length ?? 0,
    fallidas: (r?.fallidas ?? []).map((f) => ({ ...f, titulo: titulo(f.postId) })),
  };
}
