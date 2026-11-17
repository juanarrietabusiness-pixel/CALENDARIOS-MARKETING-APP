// ============================================================
// ESCUCHAR un video animado sin oídos: lo que lo pide (la herramienta `escuchar_video` y POST …/escuchar de la pantalla
// «Sonido»). Manda al Container el MISMO pedido que el render —el guion con sus tiempos, la voz (si ya la hay), la música
// y los efectos (`sonidoParaElContainer`)— y el Container arma el audio por pistas, lo mide y lo dibuja
// (container/escuchar.mjs, src/lib/escucharSonido.js). No gasta IA ni codifica video: unos segundos de CPU.
//
// Se puede escuchar ANTES de la voz (con los tiempos estimados, lo dice) y antes de renderizar: así se coloca un efecto,
// se escucha, se corrige y sólo al final se renderiza.
// ============================================================

import { pedidoConClips, alContenedor } from "./cuadros.js";
import { sonidoParaElContainer, cuerpoDeSonido } from "./render.js";

/** Escucha el video (su fila). → { informe, texto, hoja: { mime, datos }, faltan }. */
export async function escucharVideo(env, acceso, cliente, fila) {
  const { pedido, guion, faltan } = await pedidoConClips(env, acceso, cliente, fila);
  const son = await sonidoParaElContainer(env, fila, guion, { clienteId: cliente.id, ownerId: acceso.ownerId, vozOpcional: true });
  const r = await alContenedor(env, "/escuchar", { ...pedido, ...cuerpoDeSonido(son), titulo: fila.titulo || "", musicaNombre: son.nombreMusica });
  const j = await r.json();
  const informe = { ...j.informe, avisos: [...son.avisos, ...(j.informe?.avisos ?? [])] };
  const texto = [
    ...son.avisos.map((a) => `OJO: ${a}`),
    j.informe?.texto ?? "",
    faltan.length ? `Imágenes o clips que no están en la galería (su sonido no cuenta): ${faltan.join(", ")}.` : "",
  ].filter(Boolean).join("\n");
  return { informe, texto, hoja: j.hoja ?? null, faltan };
}
