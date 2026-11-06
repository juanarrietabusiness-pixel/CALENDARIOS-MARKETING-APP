// ============================================================
// Preparar una publicación para sus redes SIN pantalla (en el Container), para «Programar al aprobar»
//
// Cuando el cliente aprueba la pieza final, el servidor la programa solo; pero Instagram sólo publica JPEG, lo que no
// cabe en el feed sale con su copia 4:5 (9:16 en la historia) y las fotos de TikTok van a 1080p. Eso lo hacía SIEMPRE el
// navegador (al programar, o al abrir «Enviar al cliente» con el interruptor encendido); si nadie lo había hecho, la
// pieza no se programaba y se avisaba al equipo. Ahora lo hace el Container con la MISMA regla (src/lib/prepararRedes.js)
// y el MISMO dibujo (src/lib/encajarLienzo.js) que el navegador.
//
// Sólo archivos de ESE cliente en R2 (`claveDelCliente`); lo nuevo va a `clientes/<cliente>/posts/` como lo que sube la
// pantalla. Lo preparado se escribe en el calendario con su `updated_at` como condición y sólo si los archivos de la
// publicación siguen siendo los que se prepararon (si alguien los cambió entremedias, no se pisa nada).
// Nunca lanza: devuelve lo que no se pudo (y entonces `programar` dirá por qué no sale, como antes).
// ============================================================

import { normalizacionesDe, conNormalizadas, adaptacionesDe, conAdaptados, encajadaPendiente, conEncajada } from "../../src/lib/prepararRedes.js";
import { alContenedor, aBase64 } from "./estudio/cuadros.js";
import { claveDelCliente } from "./estudio/archivos.js";
import { difundir } from "./vivo.js";
import { ahora } from "./ids.js";

/** Lo más que pesa una imagen que se manda al Container a preparar. */
const TOPE_IMAGEN = 25 * 1024 * 1024;
const FIRMA = { userId: "sistema", nombre: "Programar al aprobar", color: "", tab: null };

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) : (t ?? d); } catch { return d; } };
/** Lo que identifica los archivos de una publicación: si cambia mientras se prepara, lo preparado ya no vale. */
const huella = (p) => JSON.stringify([p?.medios ?? null, p?.image ?? null, p?.historias ?? null, p?.portada ?? null]);

/** Una imagen de la publicación (su `src`) del cliente, pasada por el Container → { datos?, ancho, alto }. */
async function porElContenedor(env, clienteId, src, salida) {
  const clave = claveDelCliente(src, clienteId);
  if (!clave) throw new Error("una imagen no está guardada en la aplicación (vuelve a añadirla a la publicación)");
  const obj = await env.MEDIA.get(clave);
  if (!obj) throw new Error("una imagen de la publicación ya no existe");
  if (obj.size > TOPE_IMAGEN) throw new Error("una imagen pesa más de 25 MB");
  const r = await alContenedor(env, "/imagen-redes", { imagen: aBase64(new Uint8Array(await obj.arrayBuffer())), salida });
  return r.json();
}

/** Guarda un JPEG que devolvió el Container como archivo nuevo de la publicación → su `src`. */
async function guardarJpeg(env, clienteId, datos) {
  const clave = `clientes/${clienteId}/posts/${crypto.randomUUID()}.jpg`;
  const bytes = Uint8Array.from(atob(datos), (c) => c.charCodeAt(0));
  await env.MEDIA.put(clave, bytes, { httpMetadata: { contentType: "image/jpeg" } });
  return `/api/media/${clave}`;
}

/**
 * Prepara `post` para `redes` (las que van a salir) → { post, cambio, problema }. No escribe nada en el calendario.
 * `colorMarca`: el del cliente (para el ajuste «color»).
 */
export async function prepararPublicacion(env, { post, redes, clienteId, colorMarca }) {
  const normal = normalizacionesDe(post, redes);
  const pendientes = normal.length ? null : adaptacionesDe(post, redes, { colorMarca });
  if (!normal.length && !pendientes.length) return { post, cambio: false, problema: null };
  if (!env.VIDEO) return { post, cambio: false, problema: "no hay Container para preparar las imágenes" };
  try {
    const mapa = new Map();
    for (const n of normal) {
      const r = await porElContenedor(env, clienteId, n.src, { tipo: n.convertir ? "jpeg" : "medir" });
      if (n.convertir) {
        const nombre = `${String(n.nombre || "imagen").replace(/\.[a-z0-9]+$/i, "")}.jpg`;
        mapa.set(n.src, { src: await guardarJpeg(env, clienteId, r.datos), nombre, ancho: r.ancho, alto: r.alto });
      } else mapa.set(n.src, { src: n.src, ancho: r.ancho, alto: r.alto });
    }
    let nuevo = conNormalizadas(post, mapa);
    const hechas = [];
    for (const a of adaptacionesDe(nuevo, redes, { colorMarca })) {
      const r = await porElContenedor(env, clienteId, a.src, a.salida);
      hechas.push({ clave: a.clave, src: await guardarJpeg(env, clienteId, r.datos), ancho: r.ancho, alto: r.alto, ...(a.salida.modo ? { modo: a.salida.modo } : {}) });
    }
    nuevo = conAdaptados(nuevo, hechas);
    return { post: nuevo, cambio: mapa.size > 0 || hechas.length > 0, problema: null };
  } catch (e) {
    return { post, cambio: false, problema: `no se pudieron preparar las imágenes: ${e?.message ?? e}` };
  }
}

/**
 * Prepara la publicación `postId` del calendario y la GUARDA (si cambió algo y sus archivos siguen siendo los mismos).
 * → { preparada (bool), problema }. Avisa a las pantallas abiertas para que relean el calendario.
 */
export async function prepararYGuardar(env, acceso, { calendarId, postId, redes, clienteId, colorMarca }) {
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    const cal = await acceso.leerUno("calendars", { id: calendarId });
    const dias = leerJSON(cal?.days, []);
    const dia = Array.isArray(dias) ? dias.find((d) => (d?.posts ?? []).some((p) => p?.id === postId)) : null;
    if (!dia) return { preparada: false, problema: "la publicación ya no está en el calendario" };
    const i = dia.posts.findIndex((p) => p?.id === postId);
    const antes = dia.posts[i];
    const r = await prepararPublicacion(env, { post: antes, redes, clienteId, colorMarca });
    if (!r.cambio) return { preparada: false, problema: r.problema };
    // Se vuelve a leer: preparar pudo tardar, y alguien pudo guardar el calendario entretanto.
    const fresco = await acceso.leerUno("calendars", { id: calendarId });
    const diasF = leerJSON(fresco?.days, []);
    const diaF = Array.isArray(diasF) ? diasF.find((d) => (d?.posts ?? []).some((p) => p?.id === postId)) : null;
    const k = diaF ? diaF.posts.findIndex((p) => p?.id === postId) : -1;
    if (k < 0 || huella(diaF.posts[k]) !== huella(antes)) return { preparada: false, problema: "los archivos de la publicación cambiaron mientras se preparaban" };
    diaF.posts[k] = {
      ...diaF.posts[k], medios: r.post.medios, image: r.post.image, historias: r.post.historias, adaptados: r.post.adaptados,
      // La portada del reel, en JPEG (Instagram no lee otra en `cover_url`).
      ...(r.post.portada !== antes.portada ? { portada: r.post.portada } : {}),
    };
    const n = await acceso.actualizar("calendars", { id: calendarId, updated_at: fresco.updated_at }, { days: JSON.stringify(diasF), updated_at: ahora() });
    if (!n) continue;
    difundir(env, acceso.ownerId, { tipo: "calendario:recargar", id: calendarId, clientId: clienteId, por: FIRMA });
    return { preparada: true, problema: null };
  }
  return { preparada: false, problema: "el calendario se estaba guardando a la vez" };
}

/**
 * La historia ENCAJADA de un post que recibe su imagen sin pantalla (poner_en_publicacion del MCP): la imagen del post
 * en 9:16 con el ajuste de la publicación, marcada para salir también como historia, como hace el panel. → el post
 * (sin cambios si no toca, no hay Container o falla: es un extra, no puede tumbar lo que se puso).
 */
export async function conHistoriaEncajada(env, { antes, despues, clienteId, colorMarca }) {
  const pendiente = encajadaPendiente(antes, despues);
  if (!pendiente || !env.VIDEO) return despues;
  try {
    const modo = ["color", "recorte"].includes(despues.ajusteIG) ? despues.ajusteIG : "difuminado";
    const r = await porElContenedor(env, clienteId, pendiente.base, { tipo: "encajar", ancho: 1080, alto: 1920, modo, color: colorMarca || "#ffffff" });
    const historia = { src: await guardarJpeg(env, clienteId, r.datos), tipo: "imagen", nombre: "historia.jpg", ancho: r.ancho, alto: r.alto };
    return conEncajada(despues, pendiente, historia);
  } catch (e) {
    console.error("historia encajada:", e?.message ?? e);
    return despues;
  }
}
