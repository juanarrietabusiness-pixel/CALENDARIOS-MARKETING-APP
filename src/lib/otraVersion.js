// ============================================================
// «Otra versión» de la imagen de una publicación, hecha ahí mismo
//
// Antes, «Otra versión» abría «Crear con IA» con el pedido escrito y había
// que revisarlo y pulsar crear. La agencia lo usa para REUTILIZAR un post
// (la misma información, otro diseño), así que ahora sale sola y queda en la
// publicación, lista para programar:
//
//   · Si la imagen salió del Estudio, se repite SU pedido (modelo, kit,
//     referencias) con otra escena escrita por la IA: «Otra versión
//     distinta» de la galería, sin abrir la galería.
//   · Si no (subida, de Drive), se arma desde la publicación por el camino de
//     UNA pieza (pieza.js): la escena nueva sobre su idea y su texto, el kit,
//     las fotos de su producto, su tipo de contenido y el logo.
//
// Pasa por el control de calidad y el logo estampado como cualquier pieza
// del Estudio. Se carga aparte: arrastra el catálogo.
// ============================================================

import * as api from "./estudio";
import { ajustesDe, estimar, modeloPorId, porPrecio, MODELOS, CONFIRMAR_DESDE, MAX_PROMPT } from "./estudioCatalogo";
import { TOMA_DE_OTRA_MARCA, NOTA_OTRA_MARCA } from "./recrear";
import { ideaDelPedido, conOtraEscena } from "./kitMarca";
import { apoyosDePieza, pedidoDePieza, lineaDeTexto } from "./pieza";
import { presetDePilar } from "./pilares";
import { esperarArchivos } from "./carruselEstudio";
import { controlEncendido, controlarYCorregir } from "./controlEstudio";
import { conLogoSiToca } from "./logoEstudio";

const PARA_HISTORIA = new Set(["historia", "reel"]);

/** El pedido de la versión nueva, sin crear nada. → { pedido, costo } (pedido listo para `pedirImagenes`). */
async function prepararVersion({ clienteId, client, post, medio, g, activos }) {
  const kit = g?.kit ?? {};
  // 1. Una pieza del Estudio: su mismo pedido, con otra escena.
  const archivo = (g?.archivos ?? []).find((a) => a.src === medio.src && a.tipo === "imagen");
  const trabajo = archivo && (g?.trabajos ?? []).find((t) => t.id === archivo.trabajoId);
  const suyo = archivo?.prompt && modeloPorId(archivo.modelo);
  // Con el texto de la plantilla encima (lote), la nueva saldría cruda: mejor por el camino de la publicación.
  if (archivo && trabajo && suyo && !archivo.ajustes?.plantilla && (suyo.motor === "prueba" || activos[suyo.motor])) {
    const { escena, cola } = api.partirEscena(ideaDelPedido(archivo.prompt));
    const r = await api.versionesDeIdea(clienteId, { idea: escena, n: 1, tipo: "imagen" });
    const nueva = r?.versiones?.[0];
    if (nueva) {
      const medios = Object.fromEntries(Object.entries(trabajo.medios ?? {}).filter(([, l]) => Array.isArray(l) && l.length));
      const ajustes = ajustesDe(suyo, archivo.ajustes ?? trabajo.ajustes ?? {}, medios);
      const prompt = conOtraEscena(archivo.prompt, [nueva, cola].filter(Boolean).join(" ")).slice(0, MAX_PROMPT);
      return { pedido: { modelo: suyo.id, prompt, n: 1, ajustes, medios }, costo: estimar(suyo, 1, ajustes) };
    }
  }

  // 2. Desde la publicación: su idea y su texto, con una escena nueva.
  const modelo = api.modeloPreferido(activos, "imagen", kit.modelos?.imagen);
  if (!modelo) throw new Error("No hay ningún modelo de imagen con llave (Ajustes → IA).");
  const base = api.promptDePublicacion(post, { conTexto: false });
  if (!base.trim()) throw new Error("La publicación no tiene idea ni texto para hacer otra versión: escribe qué se ve.");
  const r = await api.versionesDeIdea(clienteId, { idea: base, n: 1, tipo: "imagen" }).catch(() => null);
  const escena = r?.versiones?.[0] || `${base} Una composición distinta a la anterior: otro encuadre y otra escena.`;
  const fotos = api.fotosDelProducto(g?.productos ?? [], post.productoId ?? "");
  const preset = presetDePilar(post.pilar, post.pilarSub);
  const apoyos = apoyosDePieza({ kit, preset, archivos: g?.archivos ?? [], fotos, modelo });
  const deseada = PARA_HISTORIA.has(post.format) ? "9:16" : api.proporcionDeMedidas(medio.ancho, medio.alto) || "4:5";
  const valores = modelo.ajustes?.aspectRatio?.valores ?? [];
  const pedido = pedidoDePieza({
    kit, idea: escena, preset, apoyos, modelo, marca: client.name, rubro: client.industry ?? "",
    aspectRatio: valores.includes(deseada) ? deseada : valores.includes("4:5") ? "4:5" : "",
    extra: post.format === "carrusel" ? "" : lineaDeTexto(post.textoPieza),
  });
  return { pedido, costo: estimar(modelo, 1, pedido.ajustes) };
}

/**
 * Crea la otra versión y espera a que salga. `confirmar(costo)` se llama si cuesta desde 0,50 $ (devuelve si sigue).
 * → el archivo nuevo de la galería, o null si no se confirmó.
 */
export async function otraVersionDelPost({ client, post, medio, calendarId = null, confirmar = () => true, alProgresar = () => {} }) {
  const clienteId = client.dbId || client.id;
  alProgresar("Escribiendo otra escena con la misma información…");
  const [g, m] = await Promise.all([api.leerEstudio(clienteId), api.leerMotores()]);
  const activos = Object.fromEntries(Object.entries(m?.motores ?? {}).map(([k, v]) => [k, v.activo]));
  const { pedido, costo } = await prepararVersion({ clienteId, client, post, medio, g, activos });
  if (costo >= CONFIRMAR_DESDE && !confirmar(costo)) return null;
  alProgresar("Creando la imagen nueva…");
  const { trabajo } = await api.pedirImagenes(clienteId, { ...pedido, confirmado: true, ...(calendarId ? { calendarId, postId: post.id } : {}) });
  let [nueva] = await esperarArchivos(clienteId, trabajo);
  if (!nueva) throw new Error("La imagen nueva no llegó. Prueba otra vez.");
  if (controlEncendido()) {
    alProgresar("Revisando la imagen…");
    nueva = (await controlarYCorregir({ clienteId, archivo: nueva, texto: post.format === "carrusel" ? null : (post.textoPieza || null), activos })).archivo;
  }
  nueva = await conLogoSiToca({ clienteId, archivo: nueva, kit: g?.kit ?? {} });
  if (calendarId) await api.apuntarUso(clienteId, nueva.id, { calendarId, postId: post.id }).catch(() => null);
  return nueva;
}

// ------------------------------------------------------------
// «Recrear con mi marca» una referencia puesta en la publicación
// ------------------------------------------------------------

/** Para seguir un video: el fijado del cliente si admite uno; si no, Kling Omni («sigue un video») o el más barato. */
function modeloQueSigueVideo(activos, fijado) {
  const usable = (m) => m && m.tipo === "video" && (m.video ?? 0) >= 1 && activos[m.motor];
  const f = fijado ? modeloPorId(fijado) : null;
  if (usable(f)) return f;
  return [modeloPorId("kling-3-omni-kie"), ...porPrecio(MODELOS.filter(usable), activos)].find(usable) ?? null;
}

/**
 * La referencia que la agencia subió a la publicación (un anuncio que funciona, un video de IA que gustó) rehecha con
 * la marca del cliente: su FORMA (composición, ritmo, planos), el producto y el texto de la publicación, el kit y el
 * logo. Como «Recrear un anuncio» del Estudio (lib/recrear.js), pero sin salir del post: la pieza nueva ocupa el sitio
 * de la referencia. → el archivo nuevo, o null si no se confirmó el costo.
 */
export async function recrearConLaMarca({ client, post, medio, calendarId = null, confirmar = () => true, alProgresar = () => {} }) {
  const clienteId = client.dbId || client.id;
  const ref = api.archivoDesdeSrc(medio.src, clienteId);
  if (!ref) throw new Error("Esa referencia no está en el almacén de este cliente: súbela otra vez a la publicación.");
  const video = medio.tipo === "video";
  alProgresar("Preparando la versión con tu marca…");
  const [g, m] = await Promise.all([api.leerEstudio(clienteId), api.leerMotores()]);
  const activos = Object.fromEntries(Object.entries(m?.motores ?? {}).map(([k, v]) => [k, v.activo]));
  const kit = g?.kit ?? {};
  const fotos = api.fotosDelProducto(g?.productos ?? [], post.productoId ?? "");
  const contexto = api.promptDePublicacion(post, { conTexto: false });
  const idea = [
    `Recrea la pieza de referencia para ${client.name}: conserva su forma (composición, encuadre, ritmo${video ? ", planos y movimiento de cámara" : ""}), pero con el producto, la marca y el mensaje de ${client.name}; nada del producto, el texto ni el logo de la referencia.`,
    contexto ? `De qué va: ${contexto}` : "",
  ].filter(Boolean).join(" ");

  let pedido;
  let modelo;
  if (video) {
    modelo = modeloQueSigueVideo(activos, kit.modelos?.video);
    if (!modelo) throw new Error("Ningún modelo con llave sigue un video de referencia (Kling Omni, Seedance o Gemini Omni por Kie).");
    const base = pedidoDePieza({ kit, idea, apoyos: fotos, modelo, marca: client.name, rubro: client.industry ?? "", video: true, aspectRatio: "9:16" });
    const medios = { ...base.medios, video: [ref.clave] };
    pedido = { ...base, medios, ajustes: ajustesDe(modelo, base.ajustes, medios) };
  } else {
    modelo = api.modeloPreferido(activos, "imagen", kit.modelos?.imagen);
    if (!(modelo?.referencias > 0)) modelo = porPrecio(MODELOS.filter((x) => x.tipo === "imagen" && x.referencias > 0 && activos[x.motor]), activos)[0] ?? null;
    if (!modelo) throw new Error("No hay ningún modelo de imagen con referencias y con llave (Ajustes → IA).");
    // La referencia va PRIMERO (si no cabe, no hay nada que recrear) y dice qué se toma de ella; luego el producto real.
    const deLaReferencia = { clave: ref.clave, toma: [...TOMA_DE_OTRA_MARCA], nota: NOTA_OTRA_MARCA };
    const apoyos = apoyosDePieza({ kit, preset: presetDePilar(post.pilar, post.pilarSub), archivos: g?.archivos ?? [], fotos: [deLaReferencia, ...fotos], modelo });
    const deseada = PARA_HISTORIA.has(post.format) ? "9:16" : api.proporcionDeMedidas(medio.ancho, medio.alto) || "4:5";
    const valores = modelo.ajustes?.aspectRatio?.valores ?? [];
    pedido = pedidoDePieza({
      kit, idea, preset: presetDePilar(post.pilar, post.pilarSub), apoyos, modelo, marca: client.name, rubro: client.industry ?? "",
      aspectRatio: valores.includes(deseada) ? deseada : "", extra: post.format === "carrusel" ? "" : lineaDeTexto(post.textoPieza),
    });
  }
  const costo = estimar(modelo, 1, pedido.ajustes);
  if (costo >= CONFIRMAR_DESDE && !confirmar(costo)) return null;
  alProgresar(video ? `Creando el video con ${modelo.nombre} (unos minutos)…` : `Creando la imagen con ${modelo.nombre}…`);
  const { trabajo } = await api.pedirImagenes(clienteId, { ...pedido, confirmado: true, ...(calendarId ? { calendarId, postId: post.id } : {}) });
  let [nueva] = await esperarArchivos(clienteId, trabajo);
  if (!nueva) throw new Error("La pieza nueva no llegó. Prueba otra vez.");
  if (!video) nueva = await conLogoSiToca({ clienteId, archivo: nueva, kit });
  if (calendarId) await api.apuntarUso(clienteId, nueva.id, { calendarId, postId: post.id }).catch(() => null);
  return nueva;
}
