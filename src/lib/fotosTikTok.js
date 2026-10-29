// ============================================================
// Las fotos que salen en TikTok, a su medida
//
// TikTok rechaza las fotos grandes («picture_size_check_failed»: las del
// Estudio salen en 2K) y sólo lee JPEG o WebP. Al programar, el navegador hace
// una copia reducida a 1080p (`adaptados["tiktok|<src>"]`) y la cola manda ésa
// (worker/lib/publicador.js). El original no se toca: Instagram, el cliente y
// la página de aprobación lo ven tal cual. Aparte de medios.js, que va en la
// carga inicial: esto sólo se carga al programar para TikTok.
// ============================================================

import { fotosTikTok, claveAdaptado, mediosDe } from "./publicacion.js";
import { medirImagen } from "./medios.js";

/** Lo más grande que se le manda a TikTok en una foto (1080p). */
export const TIKTOK_FOTO = Object.freeze({ ancho: 1080, alto: 1920 });

/** ¿Esta foto necesita su copia para TikTok? Si pasa de 1080p o no es JPEG ni WebP (sin medidas, por si acaso). Pura. */
export function necesitaCopiaTikTok(m) {
  if (!/\.(jpe?g|webp)$/i.test(String(m?.src ?? ""))) return true;
  if (!m.ancho || !m.alto) return true;
  return m.ancho > TIKTOK_FOTO.ancho || m.alto > TIKTOK_FOTO.alto;
}

/**
 * Lo que necesitan las fotos de una publicación para TikTok: sus medidas (todas tienen que tener la misma proporción y,
 * sin medidas, no se puede comprobar al programar) y la copia de cada una que la necesite. `subir(File)` → la ruta.
 * → { post, cambio }.
 */
export async function paraTikTok(entrada, subir) {
  let post = entrada;
  let cambio = false;
  if (fotosTikTok(post).some((m) => !m.ancho || !m.alto)) {
    const medidos = [];
    for (const m of mediosDe(post)) {
      const medidas = m.tipo === "imagen" && (!m.ancho || !m.alto) ? await medirImagen(m.src) : null;
      medidos.push(medidas ? { ...m, ...medidas } : m);
      if (medidas) cambio = true;
    }
    if (cambio) post = { ...post, medios: medidos };
  }
  const adaptados = { ...(post.adaptados ?? {}) };
  for (const m of fotosTikTok(post)) {
    const clave = claveAdaptado("tiktok", m.src);
    if (adaptados[clave] || !necesitaCopiaTikTok(m)) continue;
    const res = await fetch(m.src, { credentials: "same-origin" });
    if (!res.ok) throw new Error("No se pudo leer una foto para TikTok.");
    const img = await createImageBitmap(await res.blob());
    const escala = Math.min(1, TIKTOK_FOTO.ancho / img.width, TIKTOK_FOTO.alto / img.height);
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.width * escala);
    lienzo.height = Math.round(img.height * escala);
    lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
    img.close?.();
    const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.9));
    const nombre = `${(m.nombre || "imagen").replace(/\.[a-z0-9]+$/i, "")}-tiktok.jpg`;
    adaptados[clave] = { src: await subir(new File([blob], nombre, { type: "image/jpeg" })), ancho: lienzo.width, alto: lienzo.height };
    cambio = true;
  }
  return { post: cambio ? { ...post, adaptados } : post, cambio };
}
