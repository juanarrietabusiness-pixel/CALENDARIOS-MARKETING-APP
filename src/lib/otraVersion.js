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
// TODAS van por el SERVIDOR (lib/piezaServidor.js), como el lote: la
// proporción, el control de calidad con su corrección y el logo estampado si el
// kit lo pide, aunque se cierre la pantalla. La versión de una pieza del Estudio
// se rehace con la MARCA DE HOY (lib/marcaDeHoy.js), no con el kit que tenía la
// original, y nunca se corta por el final. Se carga aparte: arrastra el catálogo.
// ============================================================

import * as api from "./estudio";
import { ajustesDe, estimar, modeloPorId, modeloQueRespeta, porPrecio, MODELOS, CONFIRMAR_DESDE } from "./estudioCatalogo";
import { ideaDelPedido, nombreDePreset, referenciaDePlantilla, lineaDePlantillaEnPedido } from "./kitMarca";
import { apoyosDePieza, pedidoDePieza, lineaDeTexto } from "./pieza";
import { presetDePilar, productosDelPost } from "./pilares";
import { productosNombrados } from "./referencias";
import { textoDeLaFicha } from "./director";
import { promptListo } from "./promptImagen";
import { esperarArchivos } from "./carruselEstudio";
import { conMarcaDeHoy } from "./marcaDeHoy";
import { crearUnaEnServidor, pasoListo } from "./piezaServidor";

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

/**
 * El modelo que escogió la persona para ESTA acción («Con qué modelo», sin fijar nada): sólo si es de imagen, tiene
 * llave y —cuando la acción lleva imágenes de apoyo— admite referencias. Si no, null y se usa el de siempre. Pura.
 */
export function modeloEscogido(id, activos = {}, { referencias = false } = {}) {
  const m = id ? modeloPorId(id) : null;
  return m && m.tipo === "imagen" && (m.motor === "prueba" || activos[m.motor]) && (!referencias || m.referencias > 0) ? m : null;
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

/**
 * La plantilla del kit que escogió el DIRECTOR (o la persona) como apoyo del pedido: su imagen de referencia (sólo por
 * su diseño) y su sistema escrito. null si no hay o ya no está. Pura.
 */
export function plantillaDelPedido(kit, archivos = [], id = "") {
  const ref = id ? referenciaDePlantilla(kit, id, archivos) : null;
  return ref ? { ref, linea: lineaDePlantillaEnPedido(kit, id) } : null;
}

/**
 * Crea la pieza por el SERVIDOR (proporción, control con su corrección, logo estampado si toca) y apunta su uso en la
 * publicación. `texto`: lo que tiene que decir (el control lo compara). → el archivo final.
 */
async function crearPorElServidor({ clienteId, pedido, texto = "", kit, post, calendarId, alProgresar, titulo = "" }) {
  const paso = pasoListo({ titulo, pedido: { ...pedido, ...(calendarId && post?.id ? { calendarId, postId: post.id } : {}) }, texto, kit });
  const nueva = await crearUnaEnServidor({ clienteId, paso, kit, alProgresar });
  if (!nueva) throw new Error("La imagen nueva no llegó. Prueba otra vez.");
  if (calendarId && post?.id) await api.apuntarUso(clienteId, nueva.id, { calendarId, postId: post.id }).catch(() => null);
  return nueva;
}

/** El pedido de la versión nueva, sin crear nada. → { pedido, costo, texto } (pedido listo para el servidor). */
async function prepararVersion({ clienteId, client, post, medio, g, activos, indicacion = "", modeloId = "" }) {
  const kit = g?.kit ?? {};
  // 1. Una pieza del Estudio: su mismo pedido, con otra escena.
  const archivo = (g?.archivos ?? []).find((a) => a.src === medio.src && a.tipo === "imagen");
  const trabajo = archivo && (g?.trabajos ?? []).find((t) => t.id === archivo.trabajoId);
  const suyo = archivo?.prompt && modeloPorId(archivo.modelo);
  const escogido = modeloEscogido(modeloId, activos);
  // Con el texto de la plantilla encima (lote), la nueva saldría cruda: mejor por el camino de la publicación.
  const preset = presetDePilar(post.pilar, post.pilarSub);
  const pieza = preset ? nombreDePreset(preset, kit) : "";
  if (archivo && trabajo && suyo && !archivo.ajustes?.plantilla && (escogido || suyo.motor === "prueba" || activos[suyo.motor])) {
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
      // Con otro modelo escogido, sus referencias son las que le quepan; si no hace la proporción, el que sí.
      const aspecto = archivo.ajustes?.aspectRatio ?? trabajo.ajustes?.aspectRatio ?? "";
      const claves = trabajo.medios?.reference ?? [];
      const usar = escogido ? modeloQueRespeta(escogido, activos, aspecto, claves.length) : suyo;
      // La marca de HOY (no la que tenía el kit el día de la original) y, si no cabe, se acorta la escena, no el final.
      const { prompt, reference } = conMarcaDeHoy({
        prompt: archivo.prompt, escena: [conIndicacion(nueva, indicacion), cola].filter(Boolean).join("\n"), kit, modelo: usar, claves,
      });
      const otros = Object.fromEntries(Object.entries(trabajo.medios ?? {}).filter(([k, l]) => k !== "reference" && k !== "faltaron" && Array.isArray(l) && l.length));
      const medios = { ...otros, ...(reference.length ? { reference } : {}) };
      const ajustes = ajustesDe(usar, archivo.ajustes ?? trabajo.ajustes ?? {}, medios);
      return { pedido: { modelo: usar.id, prompt, n: 1, ajustes, medios }, costo: estimar(usar, 1, ajustes), texto };
    }
  }

  // 2. Desde la publicación: su idea y su texto, diseñada otra vez por el director de arte.
  const modelo = escogido ?? api.modeloPreferido(activos, "imagen", kit.modelos?.imagen);
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
  const plantilla = plantillaDelPedido(kit, g?.archivos ?? [], r?.plantilla);
  const apoyos = apoyosDePieza({ kit, preset, archivos: g?.archivos ?? [], fotos, manuales: plantilla ? [plantilla.ref] : [], modelo });
  const pedido = pedidoDePieza({
    kit, idea: conIndicacion(escena, indicacion), preset, apoyos, modelo, marca: client.name, rubro: client.industry ?? "", aspectRatio,
    proporcion: deseadaPara(post, medio), activos,
    // Con la ficha del director el texto ya va dentro; sin ella, la línea de siempre. La plantilla que escogió, detrás.
    extra: [r?.idea || post.format === "carrusel" ? "" : lineaDeTexto(post.textoPieza), plantilla?.linea ?? ""].filter(Boolean).join(" "),
  });
  const texto = post.format === "carrusel" ? "" : (post.textoPieza || textoDeLaFicha(escena) || "");
  return { pedido, costo: estimar(modeloPorId(pedido.modelo) ?? modelo, 1, pedido.ajustes), texto };
}

/**
 * Crea la otra versión y espera a que salga. `confirmar(costo)` se llama si cuesta desde 0,50 $ (devuelve si sigue).
 * → el archivo nuevo de la galería, o null si no se confirmó.
 */
export async function otraVersionDelPost({ client, post, medio, indicacion = "", modelo = "", calendarId = null, confirmar = () => true, alProgresar = () => {} }) {
  const clienteId = client.dbId || client.id;
  alProgresar("Escribiendo otra escena con la misma información…");
  const { g, activos } = await leerTodo(clienteId);
  const { pedido, costo, texto } = await prepararVersion({ clienteId, client, post, medio, g, activos, indicacion, modeloId: modelo });
  if (costo >= CONFIRMAR_DESDE && !confirmar(costo)) return null;
  alProgresar(`Creando la imagen nueva con ${modeloPorId(pedido.modelo)?.nombre ?? "el modelo"}…`);
  return crearPorElServidor({ clienteId, pedido, texto, kit: g?.kit ?? {}, post, calendarId, alProgresar, titulo: "Otra versión" });
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
  let plantilla = plantillaDelPedido(kit, g?.archivos ?? [], opciones.plantilla);
  // `opciones.proporcion`: la que manda quien llama (la portada de YouTube va en 16:9 aunque el post sea un reel).
  const valores = modelo.ajustes?.aspectRatio?.valores ?? [];
  const aspectRatio = opciones.proporcion && valores.includes(opciones.proporcion) ? opciones.proporcion : proporcionPara(modelo, post);
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
    // La plantilla del kit que escogió el director (si nadie escogió otra): su imagen va de referencia, como en el lote.
    plantilla ??= plantillaDelPedido(kit, g?.archivos ?? [], r?.plantilla);
    if (r?.idea && !algoCambia) alMejorar(r.idea);
  }
  const fotos = fotosDeLaPieza(g?.productos ?? [], post, idea);
  const apoyos = apoyosDePieza({ kit, preset, estilo: opciones.estilo || "", archivos: g?.archivos ?? [], fotos, manuales: plantilla ? [plantilla.ref] : [], modelo });
  // El texto exacto ya va dentro de la idea (el pedido listo o la ficha): no se repite.
  const pedido = pedidoDePieza({
    kit, idea: conIndicacion(idea, indicacion), preset, estilo: opciones.estilo || "", apoyos, modelo, marca: client.name, rubro: client.industry ?? "",
    aspectRatio, proporcion: opciones.proporcion || deseadaPara(post), activos, extra: plantilla?.linea ?? "",
  });
  const usado = modeloPorId(pedido.modelo) ?? modelo;
  const costo = estimar(usado, 1, pedido.ajustes);
  if (costo >= CONFIRMAR_DESDE && !confirmar(costo)) return null;
  alProgresar(`Creando la imagen con ${usado.nombre}…`);
  const texto = post.format === "carrusel" ? "" : (post.textoPieza || textoDeLaFicha(idea) || "");
  return crearPorElServidor({ clienteId, pedido, texto, kit, post, calendarId, alProgresar, titulo: post.title || "Imagen de la publicación" });
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
 * El pedido de una IMAGEN de otra marca recreada para el cliente. El DIRECTOR mira la referencia (`refSrc`, papel
 * «inspiración») y diseña una versión PROPIA, ligeramente distinta, con el catálogo del cliente; la imagen de la otra
 * marca NUNCA va al motor de imagen (decisión de la agencia: con ella delante, aunque se le dijera «sólo la
 * composición», el motor la copiaba casi exacta y la otra marca la habría reconocido). Sin director no hay versión: se
 * dice por qué, en vez de mandar la referencia al motor. → { pedido, costo, texto, modelo }.
 */
async function pedidoDeRecrear({ clienteId, client, post, refSrc, g, activos, indicacion = "", modeloId = "", deseada = "4:5", alProgresar = () => {} }) {
  const kit = g?.kit ?? {};
  let modelo = modeloEscogido(modeloId, activos) ?? api.modeloPreferido(activos, "imagen", kit.modelos?.imagen);
  if (!modelo) throw new Error("No hay ningún modelo de imagen con llave (Ajustes → IA).");
  const preset = presetDePilar(post.pilar, post.pilarSub);
  const valores = modelo.ajustes?.aspectRatio?.valores ?? [];
  const contexto = api.promptDePublicacion(post, { conTexto: false });
  alProgresar("El director está mirando la referencia…");
  let r;
  try {
    r = await api.mejorarIdea(clienteId, {
      ...encargoDelPost(post, { indicacion, pieza: preset ? nombreDePreset(preset, kit) : "", proporcion: valores.includes(deseada) ? deseada : "" }),
      idea: [
        `Recrea para ${client.name} la IDEA de la pieza de otra marca que ves: una versión propia, ligeramente distinta, que no se reconozca como copia.`,
        contexto ? `De qué va la publicación: ${contexto}` : "",
        productosDelPost(post).length ? "" : "La publicación no dice qué producto: escoge del catálogo el que mejor encaje con la idea de la referencia.",
      ].filter(Boolean).join("\n"),
      especiales: [{ papel: "inspiracion", src: refSrc }],
    });
  } catch (e) {
    throw new Error(`El director no pudo mirar la referencia (${e.message}). Prueba otra vez: sin él no se recrea, para no mandar la pieza de la otra marca al motor.`);
  }
  if (!r?.idea) throw new Error("El director no devolvió el diseño. Prueba otra vez.");
  const fotos = fotosDeLaPieza(g?.productos ?? [], post, r.idea);
  const plantilla = plantillaDelPedido(kit, g?.archivos ?? [], r.plantilla);
  const apoyos = apoyosDePieza({ kit, preset, archivos: g?.archivos ?? [], fotos, manuales: plantilla ? [plantilla.ref] : [], modelo });
  const pedido = pedidoDePieza({
    kit, idea: conIndicacion(r.idea, indicacion), preset, apoyos, modelo, marca: client.name, rubro: client.industry ?? "",
    aspectRatio: valores.includes(deseada) ? deseada : "", proporcion: deseada, activos, extra: plantilla?.linea ?? "",
  });
  modelo = modeloPorId(pedido.modelo) ?? modelo;
  const texto = post.format === "carrusel" ? "" : (post.textoPieza || textoDeLaFicha(r.idea) || "");
  return { pedido, costo: estimar(modelo, 1, pedido.ajustes), texto, modelo };
}

/**
 * La referencia que la agencia subió a la publicación (un anuncio que funciona, un video de IA que gustó) rehecha con
 * la marca del cliente: su FORMA (composición, ritmo, planos), el producto y el texto de la publicación, el kit y el
 * logo. Como «Recrear un anuncio» del Estudio (lib/recrear.js), pero sin salir del post: la pieza nueva ocupa el sitio
 * de la referencia. Una imagen, por el director y el servidor (`pedidoDeRecrear`); un video, por el camino de video de
 * siempre. → el archivo nuevo, o null si no se confirmó el costo.
 */
export async function recrearConLaMarca({ client, post, medio, indicacion = "", modelo: modeloId = "", calendarId = null, confirmar = () => true, alProgresar = () => {} }) {
  const clienteId = client.dbId || client.id;
  const ref = api.archivoDesdeSrc(medio.src, clienteId);
  if (!ref) throw new Error("Esa referencia no está en el almacén de este cliente: súbela otra vez a la publicación.");
  alProgresar("Preparando la versión con tu marca…");
  const { g, activos } = await leerTodo(clienteId);
  const kit = g?.kit ?? {};
  if (medio.tipo !== "video") {
    const deseada = PARA_HISTORIA.has(post.format) ? "9:16" : api.proporcionDeMedidas(medio.ancho, medio.alto) || "4:5";
    const { pedido, costo, texto, modelo } = await pedidoDeRecrear({ clienteId, client, post, refSrc: medio.src, g, activos, indicacion, modeloId, deseada, alProgresar });
    if (costo >= CONFIRMAR_DESDE && !confirmar(costo)) return null;
    alProgresar(`Creando la imagen con ${modelo.nombre}…`);
    return crearPorElServidor({ clienteId, pedido, texto, kit, post, calendarId, alProgresar, titulo: "Recreada con la marca" });
  }
  // Un VIDEO sigue el camino de video de siempre: la referencia va como video a seguir, con un modelo que tenga llave.
  const fotos = api.fotosDelPost(g?.productos ?? [], post);
  const contexto = api.promptDePublicacion(post, { conTexto: false });
  const idea = [
    lineaDeIndicacion(indicacion),
    `Recrea la idea de la pieza de referencia para ${client.name}: toma su idea y su tipo de composición, su ritmo y sus planos, pero en una versión propia, ligeramente distinta (otro encuadre, otra distribución, otro escenario), con el producto, la marca y el mensaje de ${client.name}; nada del producto, el texto ni el logo de la referencia.`,
    contexto ? `De qué va: ${contexto}` : "",
  ].filter(Boolean).join(" ");
  const modelo = modeloQueSigueVideo(activos, kit.modelos?.video);
  if (!modelo) throw new Error("Ningún modelo con llave sigue un video de referencia (Kling Omni, Seedance o Gemini Omni por Kie).");
  const base = pedidoDePieza({ kit, idea, apoyos: fotos, modelo, marca: client.name, rubro: client.industry ?? "", video: true, aspectRatio: "9:16" });
  const medios = { ...base.medios, video: [ref.clave] };
  const pedido = { ...base, medios, ajustes: ajustesDe(modelo, base.ajustes, medios) };
  const costo = estimar(modelo, 1, pedido.ajustes);
  if (costo >= CONFIRMAR_DESDE && !confirmar(costo)) return null;
  alProgresar(`Creando el video con ${modelo.nombre} (unos minutos)…`);
  const { trabajo } = await api.pedirImagenes(clienteId, { ...pedido, confirmado: true, ...(calendarId ? { calendarId, postId: post.id } : {}) });
  const [nueva] = await esperarArchivos(clienteId, trabajo);
  if (!nueva) throw new Error("La pieza nueva no llegó. Prueba otra vez.");
  if (calendarId) await api.apuntarUso(clienteId, nueva.id, { calendarId, postId: post.id }).catch(() => null);
  return nueva;
}

/**
 * «Recrear un anuncio» del Estudio, en IMAGEN: la versión que se escribió (qué se ve y su texto) para el producto
 * escogido, por el MISMO camino que la publicación (el director mira el anuncio; el anuncio no va al motor) y el
 * servidor. → el archivo nuevo de la galería, o null si no se confirmó el costo.
 */
export async function recrearAnuncioConLaMarca({ client, archivo, version = {}, productoId = "", confirmar = () => true, alProgresar = () => {} }) {
  const clienteId = client.dbId || client.id;
  const { g, activos } = await leerTodo(clienteId);
  const post = { format: "post", idea: String(version.idea ?? ""), textoPieza: String(version.texto ?? ""), productoId, productoIds: productoId ? [productoId] : [] };
  const { pedido, costo, texto, modelo } = await pedidoDeRecrear({ clienteId, client, post, refSrc: archivo.src, g, activos, deseada: "4:5", alProgresar });
  if (costo >= CONFIRMAR_DESDE && !confirmar(costo)) return null;
  alProgresar(`Creando la imagen con ${modelo.nombre}…`);
  return crearPorElServidor({ clienteId, pedido, texto, kit: g?.kit ?? {}, post, calendarId: null, alProgresar, titulo: "Anuncio recreado con la marca" });
}
