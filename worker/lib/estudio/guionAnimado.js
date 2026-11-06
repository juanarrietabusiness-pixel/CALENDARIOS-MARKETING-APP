// ============================================================
// «Escribir el guion con IA» del video animado (lo puro, en src/lib/guionAnimadoIA.js)
//
// Lee lo que la marca dice (cerebro para escribir, sin lo interno), el catálogo con los IDs de la galería de las fotos
// reales y el personaje del kit; le pide a la IA de texto el guion en el formato de escenas v1 y lo VALIDA con el
// mismo validador que el guardado. Si sale con errores, se los devuelve UNA vez para que los corrija. No guarda nada:
// la pantalla lo abre como borrador sin guardar, la persona lo revisa y lo guarda. Es texto (unos céntimos), sin
// confirmación, como «Dame ideas».
// ============================================================

import { llamarIA, ErrorIA } from "../cerebro/ia.js";
import { RechazoAnthropic } from "../anthropic.js";
import { miniaturaDe } from "./miniaturas.js";
import { NULO } from "../acceso.js";
import { marcaParaElVideo } from "../../../src/lib/estiloVideo.js";
import { galeriaParaLaIA, erroresDeFondos, fondosPendientes, MAX_GALERIA_FONDOS } from "../../../src/lib/fondosVideo.js";
import { aplicarEstilo, lineaDeEstilo, TOPE_FONDOS_ESTILO } from "../../../src/lib/estilosVideo.js";
import { kitDe } from "./kit.js";
import { contextoDeGuion } from "./guionVideo.js";
import { leerMercado } from "../mercado.js";
import { productosActivos, lineaDeProducto } from "../../../src/lib/estudioMercado.js";
import { validarGuion } from "../../../src/lib/videoEscenas.js";
import { pedidoDeGuionAnimado, leerGuionAnimado, textoDePublicacion, duracionAnimado, MAX_IDEA_ANIMADO, pedidoDeGuionCancion } from "../../../src/lib/guionAnimadoIA.js";
import { conLaCancion, comprobarLetra } from "../../../src/lib/videoCancion.js";
import { estructuraDeVoz, usadaEn, ErrorEstructura } from "../estructurasGuion.js";
import { lineaDeLexico } from "../../../src/lib/lexico.js";
import { preciosPermitidos, erroresDePrecio } from "../../../src/lib/fidelidad.js";

/** Lo de la marca para el guion con su LÉXICO detrás (cómo se dice algo; el código lo aplica además al guardar). */
const conLexico = (marcaVideo, kit) => [marcaVideo, lineaDeLexico(kit?.lexico)].filter(Boolean).join("\n");

/** Un error de lo pedido, con su estado HTTP. */
export class ErrorGuion extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

/**
 * El catálogo con los IDs de la galería de las fotos de cada producto (las que se pueden poner en una capa «imagen»).
 * Con `soloIds` (el producto o los productos del VIDEO), sólo esos: sus beneficios, claims y precios no se mezclan con
 * los de otro producto de la misma marca. → { texto, productos } (los productos que van, para comprobar sus precios).
 */
async function catalogoConFotos(acceso, clienteId, soloIds = []) {
  try {
    const { catalogo, inventario } = await leerMercado(acceso, clienteId);
    const activos = productosActivos(catalogo);
    if (!activos.length) return { texto: "", productos: [] };
    const del = soloIds.length ? activos.filter((p) => soloIds.includes(String(p.id))) : [];
    const lista = del.length ? del : activos.slice(0, 20);
    const archivos = await acceso.leerColumnas("estudio_archivos", ["id", "clave", "mime", "borrado_at"], { client_id: clienteId });
    const idDe = new Map(archivos.filter((f) => !f.borrado_at && String(f.mime).startsWith("image/")).map((f) => [f.clave, f.id]));
    const lineas = lista.map((p) => {
      const ids = (p.fotos ?? []).map((k) => idDe.get(k)).filter(Boolean);
      return `${lineaDeProducto(p, { inventario })}${ids.length ? ` · fotos (archivo): ${ids.join(", ")}` : " · sin fotos"}`;
    }).join("\n");
    const texto = del.length
      ? `EL PRODUCTO DE ESTE VIDEO (sus beneficios, claims y precios salen SÓLO de aquí, nunca de otro producto de la marca):\n${lineas}`
      : lineas;
    return { texto, productos: lista };
  } catch {
    return { texto: "", productos: [] };
  }
}

/** Los productos del video: el pedido, o los de su publicación. */
const productosDelVideo = (datos = {}, post = null) => [...new Set([
  datos.productoId, ...(Array.isArray(post?.productoIds) ? post.productoIds : []), post?.productoId,
].filter(Boolean).map(String))];

/**
 * Las imágenes de referencia del ESTILO del video (`kit.referenciasVideo`, de la galería de ESTE cliente): copias
 * reducidas (512 px), como las que mira el director. Ver una referencia es un extra: lo que no se puede leer, no va.
 */
export async function referenciasDelVideo(env, kit) {
  const imagenes = [];
  for (const clave of (kit?.referenciasVideo ?? []).slice(0, 6)) {
    const v = await miniaturaDe(env, clave, { lado: 512 }).catch(() => null);
    if (v && /^image\/(jpeg|png|webp)$/.test(v.mime)) imagenes.push({ type: "image", source: { type: "base64", media_type: v.mime, data: v.datos } });
  }
  return imagenes;
}

/** ¿El rechazo es del modelo que no acepta imágenes? (un 4xx que no es la llave, el saldo ni la saturación). */
const rechazaImagenes = (e) => {
  const c = e instanceof ErrorIA ? e.cause : e;
  return c instanceof RechazoAnthropic && c.estado >= 400 && c.estado < 500 && ![401, 402, 403, 429].includes(c.estado);
};

/**
 * Llama a la IA con las referencias del estilo DELANTE del pedido (`texto(n)` lo escribe sabiendo cuántas van). Si el
 * modelo del hueco no las acepta, sigue SIN ellas y lo dice (`avisoRefs`). → lo de `llamarIA` y `refs` (las que fueron).
 */
async function llamarConReferencias(env, acceso, cliente, { imagenes, texto, salida, funcion }) {
  if (imagenes.length) {
    try {
      const r = await llamarIA(env, acceso, cliente, { prompt: [...imagenes, { type: "text", text: texto(imagenes.length) }], salida, funcion });
      return { ...r, refs: imagenes.length };
    } catch (e) {
      if (!rechazaImagenes(e)) throw e;
      const r = await llamarIA(env, acceso, cliente, { prompt: texto(0), salida, funcion });
      return { ...r, refs: 0, avisoRefs: "El modelo de los guiones no recibió las imágenes de referencia del estilo del video: escribió sin ellas." };
    }
  }
  return { ...(await llamarIA(env, acceso, cliente, { prompt: texto(0), salida, funcion })), refs: 0 };
}

/** Lo que el kit le dice al guion: el bloque de la marca para el video y sus referencias de estilo (como imágenes). */
async function marcaDelGuion(env, acceso, cliente, { conFondos = false } = {}) {
  const kit = kitDe(cliente);
  const [imagenes, galeria] = await Promise.all([
    referenciasDelVideo(env, kit),
    conFondos ? galeriaDeFondos(acceso, cliente.id) : "",
  ]);
  return { kit, marcaVideo: marcaParaElVideo(kit), imagenes, galeria };
}

/** Las imágenes que el cliente ya tiene en su galería (para usarlas de fondo sin pagar otra): las últimas, sin la papelera. */
async function galeriaDeFondos(acceso, clienteId) {
  try {
    const filas = await acceso.leer("estudio_archivos", { client_id: clienteId, tipo: "imagen", borrado_at: NULO }, "created_at desc", MAX_GALERIA_FONDOS);
    return galeriaParaLaIA(filas.map((f) => ({ id: f.id, prompt: f.prompt, ancho: f.ancho, alto: f.alto, subido: Boolean(f.subido) })));
  } catch {
    return "";
  }
}

/** Un aviso hecho de varios (los que haya). */
const juntar = (...a) => a.filter(Boolean).join(" ") || null;

/** El nombre de la estructura que dice la IA (campo «estructura» de su JSON) sale del guion: no es del formato. */
function sinEstructura(g) {
  if (!g || typeof g !== "object" || !("estructura" in g)) return { guion: g, nombre: "" };
  const { estructura, ...guion } = g;
  return { guion, nombre: typeof estructura === "string" ? estructura : String(estructura?.nombre ?? "") };
}

/**
 * Escribe el guion. `datos`: { idea, segundos, formato, postId?, estructuraId? }. → { guion, avisos, corregido, modelo,
 * aviso, estructura: { id, nombre } | null }. `estructuraId`: la ESTRUCTURA de guion de la agencia que sigue la voz
 * (sin ella, la IA escoge entre las de voz en off y dice cuál). Lanza ErrorGuion (400 sin idea ni publicación, o con una
 * estructura que ya no está; 502 si la IA no da un guion válido ni al segundo intento).
 */
export async function escribirGuion(env, acceso, cliente, datos = {}) {
  const idea = String(datos.idea ?? "").trim().slice(0, MAX_IDEA_ANIMADO);
  let eleccion;
  try {
    eleccion = await estructuraDeVoz(acceso, { estructuraId: datos.estructuraId ?? datos.formulaId ?? "", segundos: duracionAnimado(datos.segundos) });
  } catch (e) {
    if (e instanceof ErrorEstructura) throw new ErrorGuion(e.message, e.estado);
    throw e;
  }
  // El contexto común de todo guion de video: la publicación (con su guion), el cerebro y el criterio comercial.
  const ctx = await contextoDeGuion(env, acceso, cliente, {
    postId: String(datos.postId ?? ""), consulta: `${idea} video animado guion`, presupuesto: 4000,
  });
  const post = ctx.post;
  const delPost = textoDePublicacion(post);
  if (!idea && !delPost) throw new ErrorGuion("Di de qué va el video (o créalo desde una publicación del calendario).");
  const segundos = duracionAnimado(datos.segundos);
  const contexto = ctx.contexto;
  const catalogo = await catalogoConFotos(acceso, cliente.id, productosDelVideo(datos, post));
  const productos = catalogo.texto;
  // Los precios que puede decir: los de su producto (o del catálogo, si no se sabe cuál) y los de la idea escrita.
  const permitidos = preciosPermitidos(catalogo.productos, [idea, delPost]);
  // Un ESTILO GUARDADO del cliente (src/lib/estilosVideo.js): la IA escribe el contenido y el código impone la forma.
  // Con fondos en el estilo, el video los lleva aunque no se marcara «Con imágenes de fondo».
  const estilo = datos.estilo ?? null;
  const conFondos = datos.conFondos === true || estilo?.fondo?.imagen === true;
  const maxFondos = estilo ? TOPE_FONDOS_ESTILO : undefined;
  const { kit, marcaVideo, imagenes, galeria } = await marcaDelGuion(env, acceso, cliente, { conFondos });
  const personaje = kit.personajeVideo ?? null;

  const base = {
    marca: cliente.name, idea, publicacion: delPost, segundos, formato: datos.formato, contexto, productos, personaje, criterio: ctx.criterio,
    estructura: eleccion.texto, marcaVideo: conLexico(marcaVideo, kit), conFondos, galeria, maxFondos,
    estiloGuardado: estilo ? lineaDeEstilo(estilo, { escenas: Math.round(segundos / 4) }) : "",
  };
  // Impone el estilo (si lo hay), valida y, con fondos, que no pida más imágenes de la cuenta (eso también se corrige
  // en la segunda vuelta).
  const comprobar = (crudo) => {
    if (!crudo) return { ok: false, errores: [{ donde: "guion", mensaje: "No es un JSON que se pueda leer." }] };
    const guion = estilo ? aplicarEstilo(crudo, estilo, { conFondos }).guion : crudo;
    const v = validarGuion(guion);
    const deFondos = conFondos && v.guion ? erroresDeFondos(v.guion, maxFondos ? { maxFondos } : {}) : [];
    // Un precio que no es del producto del video es un error grave (se corrige en la segunda vuelta).
    const dePrecio = v.guion ? erroresDePrecio(v.guion, permitidos) : [];
    const extra = [...deFondos, ...dePrecio];
    return extra.length ? { ...v, ok: false, errores: [...(v.errores ?? []), ...extra] } : v;
  };
  let r = await llamarConReferencias(env, acceso, cliente, { imagenes, texto: (n) => pedidoDeGuionAnimado({ ...base, referencias: n }), salida: 8000, funcion: "guion de video" });
  const refs = r.refs;
  const avisoRefs = r.avisoRefs ?? null;
  let leido = sinEstructura(leerGuionAnimado(r.texto));
  let nombre = leido.nombre;
  let g = leido.guion;
  let v = comprobar(g);
  let corregido = false;
  if (!v.ok) {
    // Una sola vuelta con sus errores: la segunda casi siempre los arregla y el costo tiene techo.
    corregido = true;
    r = await llamarConReferencias(env, acceso, cliente, {
      imagenes: imagenes.slice(0, refs), texto: (n) => pedidoDeGuionAnimado({ ...base, referencias: n, errores: v.errores, anterior: g ? JSON.stringify(g) : r.texto }), salida: 8000, funcion: "guion de video",
    });
    leido = sinEstructura(leerGuionAnimado(r.texto));
    nombre = leido.nombre || nombre;
    g = leido.guion;
    v = g ? comprobar(g) : v;
  }
  if (!v.ok) {
    const lista = (v.errores ?? []).slice(0, 4).map((e) => `${e.donde}: ${e.mensaje}`).join("; ");
    throw new ErrorGuion(`La IA no escribió un guion válido ni al corregirlo${lista ? ` (${lista})` : ""}. Prueba con otra idea o más detalle.`, 502);
  }
  return {
    guion: v.guion, avisos: v.avisos, corregido, modelo: r.modelo, aviso: juntar(r.aviso, avisoRefs), postId: post ? String(datos.postId) : null,
    estructura: usadaEn(eleccion, nombre), referencias: refs, fondos: fondosPendientes(v.guion).length,
  };
}

/**
 * «Diseñar las escenas con IA» de un video con CANCIÓN (worker/lib/estudio/cancion.js): la IA diseña sobre la letra por
 * líneas con sus tiempos, el coro y los huecos instrumentales (`pedidoDeGuionCancion`); la aplicación le pone SU canción
 * (`conLaCancion`) y lo valida con el validador de siempre y con `comprobarLetra` (la `habla` es la letra tal cual). Si
 * falla, UNA vuelta con los errores; si tampoco, 502. No guarda nada. Texto (unos céntimos), sin confirmación.
 * `sincronia`: la de la canción ({ archivo, nombre, duracion, letra }); `lineas`, `huecos`: los de videoCancion.js.
 * → { guion, avisos, corregido, modelo, aviso }.
 */
export async function escribirGuionCancion(env, acceso, cliente, { sincronia, lineas, huecos, formato = "9:16", titulo = "", postId = "", indicacion = "", conFondos = false, golpes = [], bpm = 0, estilo = null }) {
  const ctx = await contextoDeGuion(env, acceso, cliente, { postId: String(postId ?? ""), consulta: `${titulo || sincronia.nombre || ""} canción video animado`, presupuesto: 3000 });
  const productos = (await catalogoConFotos(acceso, cliente.id)).texto;
  // Con un ESTILO GUARDADO que lleva fondos, el video los lleva aunque no se marcara «Con imágenes de fondo».
  const fondos = conFondos === true || estilo?.fondo?.imagen === true;
  const maxFondos = estilo ? TOPE_FONDOS_ESTILO : undefined;
  const { kit, marcaVideo, imagenes, galeria } = await marcaDelGuion(env, acceso, cliente, { conFondos: fondos });
  const personaje = kit.personajeVideo ?? null;
  const base = {
    marca: cliente.name, titulo, nombre: sincronia.nombre ?? "", duracion: sincronia.duracion, lineas, huecos, formato,
    contexto: ctx.contexto, productos, personaje, indicacion, marcaVideo: conLexico(marcaVideo, kit), conFondos: fondos, galeria, golpes, bpm, maxFondos,
    estiloGuardado: estilo ? lineaDeEstilo(estilo, { escenas: lineas.length + huecos.length, cancion: true }) : "",
  };
  const cancion = { archivo: sincronia.archivo, duracion: sincronia.duracion, nombre: sincronia.nombre ?? "" };
  const revisar = (texto) => {
    const leido = leerGuionAnimado(texto);
    if (!leido) return { g: null, v: { ok: false, errores: [{ donde: "guion", mensaje: "No es un JSON que se pueda leer." }] } };
    // El estilo guardado se IMPONE en la forma antes de validar (la letra y lo que se lee no cambian).
    const g = estilo ? aplicarEstilo(leido, estilo, { conFondos: fondos }).guion : leido;
    const conCancion = conLaCancion(g, cancion);
    const v = validarGuion(conCancion);
    const deLetra = v.guion ? comprobarLetra(v.guion, sincronia.letra) : [];
    const deFondos = base.conFondos && v.guion ? erroresDeFondos(v.guion, maxFondos ? { maxFondos } : {}) : [];
    const extra = [...deLetra, ...deFondos];
    return { g: conCancion, v: extra.length ? { ...v, ok: false, errores: [...(v.errores ?? []), ...extra] } : v };
  };
  let r = await llamarConReferencias(env, acceso, cliente, { imagenes, texto: (n) => pedidoDeGuionCancion({ ...base, referencias: n }), salida: 12000, funcion: "guion de video" });
  const refs = r.refs;
  const avisoRefs = r.avisoRefs ?? null;
  let { g, v } = revisar(r.texto);
  let corregido = false;
  if (!v.ok) {
    corregido = true;
    r = await llamarConReferencias(env, acceso, cliente, {
      imagenes: imagenes.slice(0, refs), texto: (n) => pedidoDeGuionCancion({ ...base, referencias: n, errores: v.errores, anterior: g ? JSON.stringify(g) : r.texto }), salida: 12000, funcion: "guion de video",
    });
    ({ g, v } = revisar(r.texto));
  }
  if (!v.ok) {
    const lista = (v.errores ?? []).slice(0, 4).map((e) => `${e.donde}: ${e.mensaje}`).join("; ");
    throw new ErrorGuion(`La IA no diseñó un guion válido con la letra tal cual ni al corregirlo${lista ? ` (${lista})` : ""}. Prueba con la prueba de sincronía (gratis) y edítala.`, 502);
  }
  return { guion: v.guion, avisos: v.avisos, corregido, modelo: r.modelo, aviso: juntar(r.aviso, avisoRefs), referencias: refs, fondos: fondosPendientes(v.guion).length };
}
