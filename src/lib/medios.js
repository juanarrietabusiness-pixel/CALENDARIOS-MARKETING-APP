// ============================================================
// Imágenes y videos en el navegador
//
// Todo lo que se lee aquí viene de `/api/media/*`, el MISMO origen: por
// eso el lienzo no queda «contaminado» y `toDataURL` funciona. Un video
// de otro dominio no dejaría sacar ni un fotograma.
// ============================================================

import { compressImage } from "../utils";

/** Una imagen del banco, reducida y en base64 para mandarla al modelo. */
export async function imagenParaModelo(url, lado = 1024) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error("No se pudo leer la imagen del banco.");
  const dataUrl = await compressImage(await res.blob(), lado);
  return dataUrl.split(",")[1];
}

/**
 * La imagen de una publicación, lista para la IA. `post.image` puede
 * ser un data: antiguo o una ruta `/api/media/…` (subida, del banco o
 * generada): mandar la ruta como si fuera base64 hace que Anthropic
 * rechace la petición entera.
 */
export async function base64DeImagen(image, lado = 800) {
  if (typeof image !== "string" || !image) return null;
  if (image.startsWith("data:")) return image.split(",")[1] ?? null;
  if (image.startsWith("/api/media/")) return imagenParaModelo(image, lado);
  return null;
}

/**
 * El HTML exportado se abre como archivo local: ahí `/api/media/…` no
 * resuelve contra nada. Se incrustan las imágenes antes de construirlo.
 */
export async function conImagenesIncrustadas(calendario) {
  const days = await Promise.all((calendario.days || []).map(async (d) => ({
    ...d,
    posts: await Promise.all((d.posts || []).map(async (p) => {
      if (typeof p.image !== "string" || !p.image.startsWith("/api/media/")) return p;
      try {
        return { ...p, image: `data:image/jpeg;base64,${await imagenParaModelo(p.image, 900)}` };
      } catch {
        return { ...p, image: null };
      }
    })),
  })));
  return { ...calendario, days };
}

function esperar(el, evento) {
  return new Promise((ok, mal) => {
    const limpiar = () => { el.removeEventListener(evento, bien); el.removeEventListener("error", fallo); };
    const bien = () => { limpiar(); ok(); };
    const fallo = () => { limpiar(); mal(new Error("El navegador no pudo leer ese video.")); };
    el.addEventListener(evento, bien);
    el.addEventListener("error", fallo);
  });
}

/**
 * `n` fotogramas repartidos por el video, en JPEG base64. Se saltan el
 * primer y el último instante, que suelen ser negro o un corte.
 * @returns {Promise<Array<{segundo:number, base64:string}>>}
 */
export async function fotogramasDeVideo(url, n = 6, ancho = 640) {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await esperar(video, "loadeddata");

  const duracion = Number.isFinite(video.duration) ? video.duration : 0;
  const escala = Math.min(1, ancho / (video.videoWidth || ancho));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round((video.videoWidth || ancho) * escala);
  lienzo.height = Math.round((video.videoHeight || ancho) * escala);
  const ctx = lienzo.getContext("2d");

  const salida = [];
  for (let i = 0; i < n; i++) {
    const t = duracion ? (duracion * (i + 0.5)) / n : 0;
    video.currentTime = t;
    await esperar(video, "seeked");
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    salida.push({ segundo: Math.round(t), base64: lienzo.toDataURL("image/jpeg", 0.7).split(",")[1] });
    if (!duracion) break;
  }
  video.removeAttribute("src");
  video.load();
  return salida;
}

/**
 * Descarga la imagen EXACTAMENTE a `ancho`×`alto`, recortando lo que
 * sobre desde el centro (como «cover»): la IA devuelve la proporción,
 * no los píxeles, y 1200×630 ni siquiera tiene proporción propia.
 */
export async function descargarEnTamano(url, ancho, alto, nombre) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error("No se pudo leer la imagen.");
  const bitmap = await createImageBitmap(await res.blob());
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const escala = Math.max(ancho / bitmap.width, alto / bitmap.height);
  const w = bitmap.width * escala;
  const h = bitmap.height * escala;
  const ctx = lienzo.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, (ancho - w) / 2, (alto - h) / 2, w, h);
  bitmap.close?.();

  const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/png"));
  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(blob);
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}
