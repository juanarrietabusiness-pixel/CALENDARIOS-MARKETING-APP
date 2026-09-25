// ============================================================
// Imágenes y videos en el navegador
//
// Todo lo que se lee aquí viene de `/api/media/*`, el MISMO origen: por
// eso el lienzo no queda «contaminado» y `toDataURL` funciona. Un video
// de otro dominio no dejaría sacar ni un fotograma.
// ============================================================

import { compressImage } from "../utils";
import {
  mediosDe, historiasDe, piezasDe, publicacionDeVariante, objetivoDe, necesitaAjuste, claveAdaptado, medidasAjuste,
} from "./publicacion";

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

/** Lado mayor con el que se publica: Instagram reduce a 1440 de ancho y rechaza más de 8 MB. */
const LADO_PUBLICAR = 2160;

/**
 * Las imágenes de una publicación, listas para Meta: en JPEG y con sus
 * medidas. Instagram SÓLO publica JPEG, y el servidor no puede convertir
 * —un Worker no trae un decodificador de imágenes—, así que se hace aquí,
 * con el lienzo, antes de programar. Lo que ya es JPEG y trae medidas no
 * se toca.
 *
 * `subir(file)` guarda el archivo nuevo y devuelve su ruta.
 * @returns {Promise<{ medios: Array, cambio: boolean }>}
 */
export async function prepararMediosParaMeta(medios, subir) {
  let cambio = false;
  const salida = [];
  for (const m of medios) {
    const esJpeg = /\.jpe?g(\?|$)/i.test(m.src);
    if (m.tipo === "video" || (esJpeg && m.ancho && m.alto)) { salida.push(m); continue; }
    const res = await fetch(m.src, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`No se pudo leer «${m.nombre || "una imagen"}».`);
    const bitmap = await createImageBitmap(await res.blob());
    if (esJpeg) {
      salida.push({ ...m, ancho: bitmap.width, alto: bitmap.height });
      bitmap.close?.();
      cambio = true;
      continue;
    }
    const escala = Math.min(1, LADO_PUBLICAR / Math.max(bitmap.width, bitmap.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    const ctx = lienzo.getContext("2d");
    // Un PNG con transparencia saldría con fondo negro en JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close?.();
    const blob = await new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", 0.9));
    const nombre = `${(m.nombre || "imagen").replace(/\.[a-z0-9]+$/i, "")}.jpg`;
    const src = await subir(new File([blob], nombre, { type: "image/jpeg" }));
    salida.push({ src, tipo: "imagen", nombre, ancho: lienzo.width, alto: lienzo.height });
    cambio = true;
  }
  return { medios: salida, cambio };
}

// ------------------------------------------------------------
// Ajustar imágenes a lo que admite cada red
// ------------------------------------------------------------

async function bitmapDe(src) {
  const res = await fetch(src, { credentials: "same-origin" });
  if (!res.ok) throw new Error("No se pudo leer la imagen.");
  return createImageBitmap(await res.blob());
}

/** Dibuja `img` ocupando todo el lienzo (recortando lo que sobre). */
function cubrir(ctx, img, w, h) {
  const e = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, (w - img.width * e) / 2, (h - img.height * e) / 2, img.width * e, img.height * e);
}

/** Dibuja `img` entera, centrada (dejando márgenes). */
function contener(ctx, img, w, h) {
  const e = Math.min(w / img.width, h / img.height);
  ctx.drawImage(img, (w - img.width * e) / 2, (h - img.height * e) / 2, img.width * e, img.height * e);
}

/**
 * La imagen encajada en `ancho`×`alto`:
 *   · difuminado: entera, sobre la misma imagen ampliada y desenfocada
 *     (lo que hace Metricool). El desenfoque se hace reduciendo y
 *     ampliando, que funciona igual en Safari, sin `ctx.filter`.
 *   · color: entera, sobre el color de la marca.
 *   · recorte: llenando el lienzo, recortada al centro.
 */
export function encajar(img, { ancho, alto }, modo = "difuminado", color = "#ffffff") {
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  if (modo === "recorte") {
    cubrir(ctx, img, ancho, alto);
    return lienzo;
  }
  if (modo === "color") {
    ctx.fillStyle = color || "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
  } else {
    const chico = document.createElement("canvas");
    chico.width = Math.max(8, Math.round(ancho / 28));
    chico.height = Math.max(8, Math.round(alto / 28));
    cubrir(chico.getContext("2d"), img, chico.width, chico.height);
    ctx.drawImage(chico, 0, 0, ancho, alto);
    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    ctx.fillRect(0, 0, ancho, alto);
  }
  contener(ctx, img, ancho, alto);
  return lienzo;
}

const aBlob = (lienzo, calidad = 0.9) => new Promise((ok) => lienzo.toBlob(ok, "image/jpeg", calidad));

/** Cómo quedará: una vista pequeña (data: URL) sin subir nada. */
export async function vistaAjuste(src, objetivo, modo, color) {
  const img = await bitmapDe(src);
  const m = medidasAjuste(img.width, img.height, objetivo);
  const escala = 360 / m.ancho;
  const lienzo = encajar(img, { ancho: Math.round(m.ancho * escala), alto: Math.round(m.alto * escala) }, modo, color);
  img.close?.();
  return lienzo.toDataURL("image/jpeg", 0.75);
}

/** Una imagen llevada a historia 9:16 (sin IA) y subida: lista para `post.historias`. */
export async function historiaDesdeImagen(src, subir, modo = "difuminado", color) {
  const img = await bitmapDe(src);
  const lienzo = encajar(img, { ancho: 1080, alto: 1920 }, modo, color);
  img.close?.();
  const nuevo = await subir(new File([await aBlob(lienzo)], "historia.jpg", { type: "image/jpeg" }));
  return { src: nuevo, tipo: "imagen", nombre: "historia.jpg", ancho: 1080, alto: 1920 };
}

/**
 * Todo lo que necesita una publicación para salir en esas redes, hecho en
 * el navegador (el Worker no puede tocar imágenes):
 *   1. Imágenes del post y de su historia en JPEG y con sus medidas.
 *   2. Copias adaptadas (`adaptados`) de las que no caben en su destino:
 *      4:5 para el feed de Instagram, 9:16 para las historias. El original
 *      no se toca; sólo cambia lo que sale en esa red.
 * Devuelve la publicación nueva y si cambió algo (para guardarla).
 */
export async function prepararParaRedes(post, redes, { subir, colorMarca } = {}) {
  const meta = redes.some((r) => r === "instagram" || r === "facebook");
  if (!meta) return { post, cambio: false };
  let cambio = false;
  let nuevo = { ...post };

  const r1 = await prepararMediosParaMeta(mediosDe(nuevo), subir);
  if (r1.cambio) { nuevo = { ...nuevo, medios: r1.medios, image: r1.medios.find((m) => m.tipo !== "video")?.src ?? null }; cambio = true; }
  if (historiasDe(nuevo).length) {
    const r2 = await prepararMediosParaMeta(historiasDe(nuevo), subir);
    if (r2.cambio) { nuevo = { ...nuevo, historias: r2.medios }; cambio = true; }
  }

  const modo = nuevo.ajusteIG || "difuminado";
  const adaptados = { ...(nuevo.adaptados ?? {}) };
  for (const { red, variante } of piezasDe(nuevo, redes)) {
    if (red === "tiktok") continue;
    const pieza = publicacionDeVariante(nuevo, variante);
    const objetivo = objetivoDe(pieza, red);
    if (!objetivo) continue;
    for (const m of mediosDe(pieza)) {
      if (!necesitaAjuste(m, objetivo)) continue;
      const clave = claveAdaptado(objetivo, m.src);
      if (adaptados[clave]?.modo === modo) continue;
      const img = await bitmapDe(m.src);
      const medidas = medidasAjuste(img.width, img.height, objetivo);
      const lienzo = encajar(img, medidas, modo, colorMarca);
      img.close?.();
      const nombre = `${(m.nombre || "imagen").replace(/\.[a-z0-9]+$/i, "")}-${objetivo}.jpg`;
      const src = await subir(new File([await aBlob(lienzo)], nombre, { type: "image/jpeg" }));
      adaptados[clave] = { src, ancho: medidas.ancho, alto: medidas.alto, modo };
      cambio = true;
    }
  }
  if (cambio) nuevo = { ...nuevo, adaptados };
  return { post: nuevo, cambio };
}

/**
 * Una captura de pantalla, reducida para mandarla a la IA: JPEG de 1080 px
 * de ancho como mucho. Una captura del teléfono pesa varios MB y la API
 * tiene tope por imagen; a este tamaño se sigue leyendo todo el texto.
 */
export async function capturaReducida(archivo, maximo = 1080) {
  const img = await createImageBitmap(archivo);
  const escala = Math.min(1, maximo / img.width);
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(img.width * escala);
  lienzo.height = Math.round(img.height * escala);
  lienzo.getContext("2d").drawImage(img, 0, 0, lienzo.width, lienzo.height);
  img.close?.();
  return lienzo.toDataURL("image/jpeg", 0.82);
}
