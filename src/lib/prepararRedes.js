// ============================================================
// Lo que necesita una publicación para SALIR en cada red, como plan (puro: lo lee el Worker para prepararla SIN
// pantalla con el Container, al aprobarla el cliente con «Programar al aprobar»)
//
// El navegador lo hace al programar (`prepararParaRedes` en medios.js, con el lienzo); aquí está la misma regla dicha
// como pasos, para que el servidor la ejecute igual:
//   1. NORMALIZAR (`normalizacionesDe`): las imágenes de Instagram y Facebook en JPEG (a como mucho `LADO_PUBLICAR`) y
//      con sus medidas; la PORTADA del reel que va a Instagram, en JPEG (`cover_url` no lee otra cosa); las fotos de
//      TikTok, medidas (sin medidas no se puede comprobar su proporción).
//      `conNormalizadas` pone lo nuevo en la publicación y mueve las copias adaptadas a la ruta nueva.
//   2. ADAPTAR (`adaptacionesDe`): la copia 4:5 o 9:16 de lo que no cabe en su destino de Meta (con el ajuste de la
//      publicación: difuminado, color o recorte; la de IA no se pide sola) y la copia 1080p de las fotos de TikTok.
//      `conAdaptados` las apunta en `post.adaptados`. El original no se toca nunca.
// ============================================================

import {
  mediosDe, historiasDe, fotosTikTok, piezasDe, publicacionDeVariante, objetivoDe, necesitaAjuste, medidasAjuste,
  claveAdaptado, renombrarAdaptados, esDeMeta, esJPEG, queHacerConLaEncajada, portadaPorConvertir, LADO_PUBLICAR,
} from "./publicacion.js";

// El lado más largo al publicar vive en publicacion.js (va en la carga inicial con medios.js).
export { LADO_PUBLICAR };

/** Lo más grande que se le manda a TikTok en una foto (1080p). */
export const TIKTOK_FOTO = Object.freeze({ ancho: 1080, alto: 1920 });

/** ¿Esta foto necesita su copia para TikTok? Si pasa de 1080p o no es JPEG ni WebP (sin medidas, por si acaso). Pura. */
export function necesitaCopiaTikTok(m) {
  if (!/\.(jpe?g|webp)$/i.test(String(m?.src ?? ""))) return true;
  if (!m.ancho || !m.alto) return true;
  return m.ancho > TIKTOK_FOTO.ancho || m.alto > TIKTOK_FOTO.alto;
}

/**
 * Las imágenes que hay que convertir o medir antes de nada → [{ src, nombre, convertir }]: `convertir` si va a Meta y
 * no es JPEG (se pasa a JPEG); si no, sólo se mide. Una vez cada una (el post y su historia pueden compartirla). Pura.
 */
export function normalizacionesDe(post, redes = []) {
  const meta = redes.some(esDeMeta);
  const lista = new Map();
  const ver = (m, paraMeta) => {
    if (m?.tipo !== "imagen" || !m.src) return;
    const convertir = paraMeta && !esJPEG(m.src);
    if (!convertir && m.ancho && m.alto) return;
    const antes = lista.get(m.src);
    lista.set(m.src, { src: m.src, nombre: m.nombre || "imagen", convertir: Boolean(antes?.convertir || convertir) });
  };
  if (meta) for (const m of [...mediosDe(post), ...historiasDe(post)]) ver(m, true);
  if (redes.includes("tiktok")) for (const m of fotosTikTok(post)) ver(m, false);
  // La PORTADA del reel: Instagram la lee (`cover_url`) sólo en JPEG. Se convierte; medirla no hace falta.
  const portada = portadaPorConvertir(post, redes);
  if (portada && !lista.has(portada)) lista.set(portada, { src: portada, nombre: "portada", convertir: true });
  else if (portada) lista.set(portada, { ...lista.get(portada), convertir: true });
  return [...lista.values()];
}

/**
 * La publicación con lo normalizado (`mapa`: src de antes → { src, nombre?, ancho, alto }): en sus medios, en su historia,
 * en `image` y en su `portada`; las copias adaptadas que colgaban de la ruta de antes, en la nueva. Pura.
 */
export function conNormalizadas(post, mapa) {
  if (!mapa?.size) return post;
  const cambiar = (m) => {
    const n = mapa.get(m?.src);
    return n ? { ...m, src: n.src, ...(n.nombre ? { nombre: n.nombre } : {}), ancho: n.ancho, alto: n.alto } : m;
  };
  const medios = mediosDe(post).map(cambiar);
  const nuevo = { ...post, medios, image: medios.find((m) => m.tipo !== "video")?.src ?? null };
  if (historiasDe(post).length) nuevo.historias = historiasDe(post).map(cambiar);
  if (typeof post.portada === "string" && mapa.has(post.portada)) nuevo.portada = mapa.get(post.portada).src;
  const rutas = new Map([...mapa].filter(([antes, n]) => n.src !== antes).map(([antes, n]) => [antes, n.src]));
  if (rutas.size && post.adaptados) nuevo.adaptados = renombrarAdaptados(post.adaptados, rutas);
  return nuevo;
}

/**
 * Las copias que faltan → [{ clave, src, nombre, salida }]: `salida` es { tipo: "encajar", ancho, alto, modo, color }
 * (lo que no cabe en el feed o en la historia de Meta) o { tipo: "reducir", maxAncho, maxAlto } (la de TikTok). Lo que
 * ya tiene su copia hecha con ese ajuste no se repite. Va DESPUÉS de normalizar (necesita las medidas). Pura.
 */
export function adaptacionesDe(post, redes = [], { colorMarca = "#ffffff" } = {}) {
  const adaptados = post?.adaptados ?? {};
  const modo = post?.ajusteIG || "difuminado";
  const salida = new Map();
  for (const { red, variante } of piezasDe(post, redes)) {
    if (!esDeMeta(red)) continue;
    const pieza = publicacionDeVariante(post, variante);
    const objetivo = objetivoDe(pieza, red);
    if (!objetivo) continue;
    for (const m of mediosDe(pieza)) {
      if (!necesitaAjuste(m, objetivo)) continue;
      const clave = claveAdaptado(objetivo, m.src);
      // La ampliación con IA se pide con su botón, no aquí: sin la copia de ESTA imagen, sale difuminada.
      const efectivo = modo === "ia" && adaptados[clave]?.modo !== "ia" ? "difuminado" : modo;
      if (adaptados[clave]?.modo === efectivo || salida.has(clave)) continue;
      const medidas = medidasAjuste(m.ancho, m.alto, objetivo);
      salida.set(clave, {
        clave, src: m.src, nombre: `${(m.nombre || "imagen").replace(/\.[a-z0-9]+$/i, "")}-${objetivo}.jpg`,
        salida: { tipo: "encajar", ancho: medidas.ancho, alto: medidas.alto, modo: efectivo, color: colorMarca || "#ffffff" },
      });
    }
  }
  if (redes.includes("tiktok")) {
    for (const m of fotosTikTok(post)) {
      const clave = claveAdaptado("tiktok", m.src);
      if (adaptados[clave] || salida.has(clave) || !necesitaCopiaTikTok(m)) continue;
      salida.set(clave, {
        clave, src: m.src, nombre: `${(m.nombre || "imagen").replace(/\.[a-z0-9]+$/i, "")}-tiktok.jpg`,
        salida: { tipo: "reducir", maxAncho: TIKTOK_FOTO.ancho, maxAlto: TIKTOK_FOTO.alto },
      });
    }
  }
  return [...salida.values()];
}

/** La publicación con las copias hechas (`hechas`: [{ clave, src, ancho, alto, modo? }]) en `adaptados`. Pura. */
export function conAdaptados(post, hechas = []) {
  if (!hechas.length) return post;
  const adaptados = { ...(post.adaptados ?? {}) };
  for (const h of hechas) adaptados[h.clave] = { src: h.src, ancho: h.ancho, alto: h.alto, ...(h.modo ? { modo: h.modo } : {}) };
  return { ...post, adaptados };
}

// ------------------------------------------------------------
// La historia ENCAJADA de un post que recibe su imagen sin pantalla (MCP, el director)
// ------------------------------------------------------------

/** Los formatos que no llevan la historia encajada sola (como en el panel de la publicación). */
const SIN_ENCAJADA = Object.freeze(["historia", "live", "reel", "carrusel"]);
const baseDe = (p) => mediosDe(p).find((m) => m.tipo === "imagen" && String(m.src ?? "").startsWith("/api/media/clientes/"))?.src ?? null;

/**
 * ¿Hay que hacer (o rehacer) la historia encajada al pasar el post de `antes` a `despues`? Lo MISMO que hace el panel
 * cuando el post recibe su primera imagen (`queHacerConLaEncajada`) → { que: "crear" | "rehacer", base } o null. Pura.
 */
export function encajadaPendiente(antes, despues) {
  if (SIN_ENCAJADA.includes(despues?.format)) return null;
  const ahora = baseDe(despues);
  const que = queHacerConLaEncajada({ antes: baseDe(antes), ahora, historias: historiasDe(despues), encajada: despues?.encajadaDe });
  return que ? { que, base: ahora } : null;
}

/** El post con su historia encajada (`historia`: el medio 9:16 ya subido), marcada para salir también como historia. Pura. */
export function conEncajada(post, { que, base }, historia) {
  const historias = historiasDe(post);
  const lista = que === "rehacer" ? historias.map((h) => (h.src === post.encajadaDe?.src ? historia : h)) : [...historias, historia];
  return { ...post, historias: lista, historiaTambien: true, encajadaDe: { de: base, src: historia.src } };
}
