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
// «Crear la imagen aquí» (`crearImagenDelPost`) es lo mismo para un post que
// aún no tiene imagen: su pedido listo (lib/promptImagen.js) o, si no lo
// tiene, el de la publicación mejorado una vez —y se le devuelve para que lo
// guarde—, sin abrir el Estudio. Las tres aceptan `indicacion`: lo que la
// persona escribió en «¿Qué quieres?» encima de la imagen.
//
// Pasa por el control de calidad y el logo estampado como cualquier pieza
// del Estudio. Se carga aparte: arrastra el catálogo.
// ============================================================

import * as api from "./estudio";
import { ajustesDe, estimar, modeloPorId, porPrecio, MODELOS, CONFIRMAR_DESDE, MAX_PROMPT } from "./estudioCatalogo";
import { TOMA_DE_OTRA_MARCA, NOTA_OTRA_MARCA } from "./recrear";
import { ideaDelPedido, conOtraEscena, nombreDePreset, referenciaDePlantilla, lineaDePlantillaEnPedido } from "./kitMarca";
import { apoyosDePieza, pedidoDePieza, lineaDeTexto } from "./pieza";
import { presetDePilar, productosDelPost } from "./pilares";
import { productosNombrados } from "./referencias";
import { textoDeLaFicha } from "./director";
import { promptListo } from "./promptImagen";
import { esperarArchivos } from "./carruselEstudio";
import { controlEncendido, controlarYCorregir } from "./controlEstudio";
import { conLogoSiToca } from "./logoEstudio";

const PARA_HISTORIA = new Set(["historia", "reel"]);

/**
 * Lo que pidió la persona en «¿Qué quieres?», como una línea del pedido (o vacío). Va DELANTE y MANDA: antes iba detrás
 * de la escena como «Además, la agencia pide…» y, si chocaba con ella («fondo blanco» frente a una sala de madera), el
 * motor se quedaba con la escena. Además lo lee el director de arte, que reescribe la ficha con ello. Pura.
 */
export const lineaDeIndicacion = (indicacion) => {
  const t = String(indicacion ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  return t ? `LO QUE PIDE LA AGENCIA (manda sobre todo lo demás de este pedido): ${t.replace(/[.\s]+$/, "")}.` : "";
};
/** La idea con lo que pidió la persona DELANTE. Pura. */
export const conIndicacion = (idea, indicacion) => [lineaDeIndicacion(indicacion), String(idea ?? "").trim()].filter(Boolean).join("\n");
/** Lo que el director de arte necesita de una publicación (src/lib/director.js). Pura. */
const encargoDelPost = (post, { indicacion = "", proporcion = "", pieza = "", plantilla = "", texto = null } = {}) => ({
  tipo: "imagen", pieza, formato: post.format === "historia" ? "historia" : "post", proporcion,
  texto: texto ?? (post.format === "carrusel" ? "" : post.textoPieza ?? ""),
  productoId: post.productoId ?? "", productoIds: productosDelPost(post), indicacion, ...(plantilla ? { plantilla } : {}),
});

/**
 * Las fotos REALES de los productos de la pieza: los de la publicación (pueden ser varios) y los que nombre la ficha del
 * director (si la publicación no decía cuál, el director escoge del catálogo y aquí van sus fotos). Pura.
 */
export function fotosDeLaPieza(productos = [], post = {}, ficha = "") {
  const ids = [...productosDelPost(post), ...productosNombrados(productos, ficha).map((p) => p.id)];
  return api.fotosDeVariosProductos(productos, ids, 8);
}

/** Lo que se le pide al director para OTRA VERSIÓN de una pieza: la misma información y el mismo texto. Pura. */
export function ideaDeOtraVersion(anterior = "", { conTexto = true } = {}) {
  return [
    "OTRA VERSIÓN de la pieza original (es la imagen que ves): el mismo mensaje, el mismo producto y el MISMO texto exacto, con la misma marca y el mismo nivel de acabado; que se reconozca como de la misma campaña. Cambia la composición de forma moderada: otro encuadre, otra distribución o otro fondo.",
    conTexto ? "" : "El texto es el que se lee en la imagen original: cópialo exacto, sin cambiar, quitar ni añadir una palabra.",
    anterior ? `La ficha o escena con la que se hizo la original:\n${anterior}` : "",
  ].filter(Boolean).join("\n");
}

/** Los motores con llave y lo del Estudio del cliente, de una vez. */
async function leerTodo(clienteId) {
  const [g, m] = await Promise.all([api.leerEstudio(clienteId), api.leerMotores()]);
  return { g, activos: Object.fromEntries(Object.entries(m?.motores ?? {}).map(([k, v]) => [k, v.activo])) };
}

/** La proporción que TIENE que salir: 9:16 en historia o reel; si no, la de la que había, o 4:5. */
const deseadaPara = (post, medio = null) => (PARA_HISTORIA.has(post.format) ? "9:16" : (medio && api.proporcionDeMedidas(medio.ancho, medio.alto)) || "4:5");

/** La proporción de la imagen nueva: 9:16 en historia o reel; si no, la de la que había (o 4:5), si el modelo la tiene. */
function proporcionPara(modelo, post, medio = null) {
  const deseada = deseadaPara(post, medio);
  const valores = modelo.ajustes?.aspectRatio?.valores ?? [];
  return valores.includes(deseada) ? deseada : valores.includes("4:5") ? "4:5" : "";
}

/** Lo que pasa después de que el motor entrega: el control, el logo estampado y el uso en la publicación. */
async function terminar({ clienteId, nueva, post, kit, activos, calendarId, alProgresar }) {
  if (controlEncendido()) {
    alProgresar("Revisando la imagen…");
    nueva = (await controlarYCorregir({ clienteId, archivo: nueva, texto: post.format === "carrusel" ? null : (post.textoPieza || null), activos })).archivo;
  }
  nueva = await conLogoSiToca({ clienteId, archivo: nueva, kit });
  if (calendarId) await api.apuntarUso(clienteId, nueva.id, { calendarId, postId: post.id }).catch(() => null);
  return nueva;
}

/** El pedido de la versión nueva, sin crear nada. → { pedido, costo } (pedido listo para `pedirImagenes`). */
async function prepararVersion({ clienteId, client, post, medio, g, activos, indicacion = "" }) {
  const kit = g?.kit ?? {};
  // 1. Una pieza del Estudio: su mismo pedido, con otra escena.
  const archivo = (g?.archivos ?? []).find((a) => a.src === medio.src && a.tipo === "imagen");
  const trabajo = archivo && (g?.trabajos ?? []).find((t) => t.id === archivo.trabajoId);
  const suyo = archivo?.prompt && modeloPorId(archivo.modelo);
  // Con el texto de la plantilla encima (lote), la nueva saldría cruda: mejor por el camino de la publicación.
  const preset = presetDePilar(post.pilar, post.pilarSub);
  const pieza = preset ? nombreDePreset(preset, kit) : "";
  if (archivo && trabajo && suyo && !archivo.ajustes?.plantilla && (suyo.motor === "prueba" || activos[suyo.motor])) {
    const { escena, cola } = api.partirEscena(ideaDelPedido(archivo.prompt));
    // El director de arte MIRA la original y escribe la ficha de la versión nueva: el mismo mensaje y el MISMO texto
    // (el de la publicación o el de la ficha de la original), otra composición moderada. Antes se le decía «DISTINTA,
    // otra escena» sin enseñarle la imagen, y salían piezas raras, a veces sin texto.
    const texto = post.format === "carrusel" ? "" : (post.textoPieza || textoDeLaFicha(escena) || "");
    const r = await api.mejorarIdea(clienteId, {
      ...encargoDelPost(post, { indicacion, pieza, proporcion: archivo.ajustes?.aspectRatio ?? "", texto }),
      idea: ideaDeOtraVersion(escena, { conTexto: Boolean(texto) }),
      especiales: [{ papel: "original", src: medio.src }],
    }).catch(() => null);
    const nueva = r?.idea || (await api.versionesDeIdea(clienteId, { idea: conIndicacion(escena, indicacion), n: 1, tipo: "imagen", texto, original: medio.src }).catch(() => null))?.versiones?.[0];
    if (nueva) {
      const medios = Object.fromEntries(Object.entries(trabajo.medios ?? {}).filter(([, l]) => Array.isArray(l) && l.length));
      const ajustes = ajustesDe(suyo, archivo.ajustes ?? trabajo.ajustes ?? {}, medios);
      const prompt = conOtraEscena(archivo.prompt, [conIndicacion(nueva, indicacion), cola].filter(Boolean).join("\n")).slice(0, MAX_PROMPT);
      return { pedido: { modelo: suyo.id, prompt, n: 1, ajustes, medios }, costo: estimar(suyo, 1, ajustes) };
    }
  }

  // 2. Desde la publicación: su idea y su texto, diseñada otra vez por el director de arte.
  const modelo = api.modeloPreferido(activos, "imagen", kit.modelos?.imagen);
  if (!modelo) throw new Error("No hay ningún modelo de imagen con llave (Ajustes → IA).");
  const base = api.promptDePublicacion(post, { conTexto: false });
  if (!base.trim()) throw new Error("La publicación no tiene idea ni texto para hacer otra versión: escribe qué se ve.");
  const aspectRatio = proporcionPara(modelo, post, medio);
  const r = await api.mejorarIdea(clienteId, {
    ...encargoDelPost(post, { indicacion, pieza, proporcion: aspectRatio }),
    idea: `${ideaDeOtraVersion("", { conTexto: Boolean(post.textoPieza) })}\nDe qué va la publicación: ${base}`,
    especiales: medio?.tipo === "video" ? [] : [{ papel: "original", src: medio.src }],
  }).catch(() => null);
  const escena = r?.idea || `${base} Otra versión de la imagen que había: el mismo mensaje, con otro encuadre.`;
  const fotos = fotosDeLaPieza(g?.productos ?? [], post, escena);
  const apoyos = apoyosDePieza({ kit, preset, archivos: g?.archivos ?? [], fotos, modelo });
  const pedido = pedidoDePieza({
    kit, idea: conIndicacion(escena, indicacion), preset, apoyos, modelo, marca: client.name, rubro: client.industry ?? "", aspectRatio,
    proporcion: deseadaPara(post, medio), activos,
    // Con la ficha del director el texto ya va dentro; sin ella, la línea de siempre.
    extra: r?.idea || post.format === "carrusel" ? "" : lineaDeTexto(post.textoPieza),
  });
  return { pedido, costo: estimar(modeloPorId(pedido.modelo) ?? modelo, 1, pedido.ajustes) };
}

/**
 * Crea la otra versión y espera a que salga. `confirmar(costo)` se llama si cuesta desde 0,50 $ (devuelve si sigue).
 * → el archivo nuevo de la galería, o null si no se confirmó.
 */
export async function otraVersionDelPost({ client, post, medio, indicacion = "", calendarId = null, confirmar = () => true, alProgresar = () => {} }) {
  const clienteId = client.dbId || client.id;
  alProgresar("Escribiendo otra escena con la misma información…");
  const { g, activos } = await leerTodo(clienteId);
  const { pedido, costo } = await prepararVersion({ clienteId, client, post, medio, g, activos, indicacion });
  if (costo >= CONFIRMAR_DESDE && !confirmar(costo)) return null;
  alProgresar("Creando la imagen nueva…");
  const { trabajo } = await api.pedirImagenes(clienteId, { ...pedido, confirmado: true, ...(calendarId ? { calendarId, postId: post.id } : {}) });
  const [nueva] = await esperarArchivos(clienteId, trabajo);
  if (!nueva) throw new Error("La imagen nueva no llegó. Prueba otra vez.");
  return terminar({ clienteId, nueva, post, kit: g?.kit ?? {}, activos, calendarId, alProgresar });
}

// ------------------------------------------------------------
// «Crear la imagen aquí»: la del post, sin abrir el Estudio
// ------------------------------------------------------------

/**
 * La imagen de una publicación que aún no la tiene, hecha ahí mismo con el modelo del cliente, su kit, las fotos de su
 * producto, su tipo de contenido y el logo. La idea es su pedido listo (la ficha de diseño); sin él —o si la persona
 * pide algo en «¿Qué quieres?» o escoge una plantilla—, el director de arte la diseña, y si no hubo nada que cambiar
 * `alMejorar(ficha)` la recibe para guardarla (la próxima sale sin esperar). `opciones`: { preset, estilo, modelo,
 * plantilla } escogidos a mano (vacío: los de la publicación y el cliente). `confirmar(costo)` se llama si cuesta desde
 * 0,50 $, como «Otra versión». → el archivo nuevo, o null si no se confirmó.
 */
export async function crearImagenDelPost({ client, post, indicacion = "", opciones = {}, calendarId = null, confirmar = () => true, alProgresar = () => {}, alMejorar = () => {} }) {
  const clienteId = client.dbId || client.id;
  alProgresar("Preparando la imagen…");
  const { g, activos } = await leerTodo(clienteId);
  const kit = g?.kit ?? {};
  const escogido = opciones.modelo ? modeloPorId(opciones.modelo) : null;
  const modelo = escogido && escogido.tipo === "imagen" && (escogido.motor === "prueba" || activos[escogido.motor]) ? escogido : api.modeloPreferido(activos, "imagen", kit.modelos?.imagen);
  if (!modelo) throw new Error("No hay ningún modelo de imagen con llave (Ajustes → IA).");
  const preset = opciones.preset || presetDePilar(post.pilar, post.pilarSub);
  const plantilla = opciones.plantilla ? referenciaDePlantilla(kit, opciones.plantilla, g?.archivos ?? []) : null;
  const aspectRatio = proporcionPara(modelo, post);
  const algoCambia = Boolean(String(indicacion).trim() || plantilla);
  let idea = algoCambia ? "" : promptListo(post);
  if (!idea) {
    const base = api.promptDePublicacion(post);
    if (!base.trim()) throw new Error("La publicación no dice qué se ve: escribe la idea o «Qué se ve» primero.");
    alProgresar("El director de arte está diseñando la pieza…");
    const r = await api.mejorarIdea(clienteId, {
      ...encargoDelPost(post, { indicacion, pieza: preset ? nombreDePreset(preset, kit) : "", proporcion: aspectRatio, plantilla: plantilla ? opciones.plantilla : "" }),
      idea: base,
    }).catch(() => null);
    idea = r?.idea || base;
    if (r?.idea && !algoCambia) alMejorar(r.idea);
  }
  const fotos = fotosDeLaPieza(g?.productos ?? [], post, idea);
  const apoyos = apoyosDePieza({ kit, preset, estilo: opciones.estilo || "", archivos: g?.archivos ?? [], fotos, manuales: plantilla ? [plantilla] : [], modelo });
  // El texto exacto ya va dentro de la idea (el pedido listo o la ficha): no se repite.
  const pedido = pedidoDePieza({
    kit, idea: conIndicacion(idea, indicacion), preset, estilo: opciones.estilo || "", apoyos, modelo, marca: client.name, rubro: client.industry ?? "",
    aspectRatio, proporcion: deseadaPara(post), activos, extra: plantilla ? lineaDePlantillaEnPedido(kit, opciones.plantilla) : "",
  });
  const usado = modeloPorId(pedido.modelo) ?? modelo;
  const costo = estimar(usado, 1, pedido.ajustes);
  if (costo >= CONFIRMAR_DESDE && !confirmar(costo)) return null;
  alProgresar(`Creando la imagen con ${usado.nombre}…`);
  const { trabajo } = await api.pedirImagenes(clienteId, { ...pedido, confirmado: true, ...(calendarId ? { calendarId, postId: post.id } : {}) });
  const [nueva] = await esperarArchivos(clienteId, trabajo);
  if (!nueva) throw new Error("La imagen no llegó. Prueba otra vez.");
  return terminar({ clienteId, nueva, post, kit, activos, calendarId, alProgresar });
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
export async function recrearConLaMarca({ client, post, medio, indicacion = "", calendarId = null, confirmar = () => true, alProgresar = () => {} }) {
  const clienteId = client.dbId || client.id;
  const ref = api.archivoDesdeSrc(medio.src, clienteId);
  if (!ref) throw new Error("Esa referencia no está en el almacén de este cliente: súbela otra vez a la publicación.");
  const video = medio.tipo === "video";
  alProgresar("Preparando la versión con tu marca…");
  const { g, activos } = await leerTodo(clienteId);
  const kit = g?.kit ?? {};
  const fotos = api.fotosDelPost(g?.productos ?? [], post);
  const contexto = api.promptDePublicacion(post, { conTexto: false });
  const idea = [
    lineaDeIndicacion(indicacion),
    `Recrea la idea de la pieza de referencia para ${client.name}: toma su idea y su tipo de composición${video ? ", su ritmo y sus planos" : ""}, pero en una versión propia, ligeramente distinta (otro encuadre, otra distribución, otro escenario), con el producto, la marca y el mensaje de ${client.name}; nada del producto, el texto ni el logo de la referencia.`,
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
    const preset = presetDePilar(post.pilar, post.pilarSub);
    const deseada = PARA_HISTORIA.has(post.format) ? "9:16" : api.proporcionDeMedidas(medio.ancho, medio.alto) || "4:5";
    const valores = modelo.ajustes?.aspectRatio?.valores ?? [];
    // El DIRECTOR mira la referencia y diseña una versión PROPIA, ligeramente distinta, con el catálogo del cliente. La
    // referencia ya no va al motor de imagen: con ella delante (aunque se le dijera «sólo la composición») el motor la
    // copiaba casi exacta, y la otra marca la habría reconocido.
    alProgresar("El director está mirando la referencia…");
    const r = await api.mejorarIdea(clienteId, {
      ...encargoDelPost(post, { indicacion, pieza: preset ? nombreDePreset(preset, kit) : "", proporcion: valores.includes(deseada) ? deseada : "" }),
      idea: [
        `Recrea para ${client.name} la IDEA de la pieza de otra marca que ves: una versión propia, ligeramente distinta, que no se reconozca como copia.`,
        contexto ? `De qué va la publicación: ${contexto}` : "",
        productosDelPost(post).length ? "" : "La publicación no dice qué producto: escoge del catálogo el que mejor encaje con la idea de la referencia.",
      ].filter(Boolean).join("\n"),
      especiales: [{ papel: "inspiracion", src: medio.src }],
    }).catch(() => null);
    if (r?.idea) {
      const deLaFicha = fotosDeLaPieza(g?.productos ?? [], post, r.idea);
      const apoyos = apoyosDePieza({ kit, preset, archivos: g?.archivos ?? [], fotos: deLaFicha, modelo });
      pedido = pedidoDePieza({
        kit, idea: conIndicacion(r.idea, indicacion), preset, apoyos, modelo, marca: client.name, rubro: client.industry ?? "",
        aspectRatio: valores.includes(deseada) ? deseada : "", proporcion: deseada, activos,
      });
    } else {
      // Sin director (sin saldo, sin red): la referencia va al motor, sólo por su idea y con la orden de no copiarla.
      const deLaReferencia = { clave: ref.clave, toma: [...TOMA_DE_OTRA_MARCA], nota: NOTA_OTRA_MARCA };
      const apoyos = apoyosDePieza({ kit, preset, archivos: g?.archivos ?? [], fotos: [deLaReferencia, ...fotos], modelo });
      pedido = pedidoDePieza({
        kit, idea, preset, apoyos, modelo, marca: client.name, rubro: client.industry ?? "",
        aspectRatio: valores.includes(deseada) ? deseada : "", proporcion: deseada, activos, extra: post.format === "carrusel" ? "" : lineaDeTexto(post.textoPieza),
      });
    }
    modelo = modeloPorId(pedido.modelo) ?? modelo;
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
