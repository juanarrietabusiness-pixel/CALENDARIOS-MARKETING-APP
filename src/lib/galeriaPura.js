// ============================================================
// Lo PURO de la galería del Estudio que necesitan la pantalla y el Worker
//
// Vivían en lib/estudio.js, el cliente HTTP de la pantalla (importa db.js y medios.js). El Worker arma ahora las piezas
// del director por MCP con el MISMO `pedidoDePieza` (lib/pieza.js) que la pantalla, y para eso pieza.js no puede
// arrastrar el cliente HTTP. lib/estudio.js las sigue exportando: nada de la pantalla cambia de import.
// ============================================================

import { conMedios, mediosDe } from "./publicacion.js";

/**
 * Las piezas de un carrusel o un reel, en orden. Manda el `orden` que guardó el flujo (las láminas finales, o los
 * videos y los fotogramas); sin él —se cerró a la mitad—, todo lo de la carpeta: en un carrusel, las láminas en el
 * orden en que salieron y sin las crudas que ya tienen su versión con texto encima; en un reel, los videos (el último
 * primero) y luego los fotogramas.
 */
export function piezasDeGrupo(carpeta, archivos = []) {
  const dentro = archivos.filter((a) => a.carpetaId === carpeta?.id && !a.borradoAt);
  const porId = new Map(dentro.map((a) => [a.id, a]));
  const ordenadas = (carpeta?.orden ?? []).map((id) => porId.get(id)).filter(Boolean);
  if (ordenadas.length) return ordenadas;
  const viejas = [...dentro].sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
  if (carpeta?.tipo === "reel") return [...viejas.filter((a) => a.tipo === "video").reverse(), ...viejas.filter((a) => a.tipo !== "video")];
  const conTexto = new Set(dentro.map((a) => a.ajustes?.plantilla?.origenId).filter(Boolean));
  return viejas.filter((a) => !conTexto.has(a.id));
}

/** «Titular\nApoyo\n$45» → «"Titular" / "Apoyo" / "$45"»: las líneas del texto de la pieza, entre comillas. Pura. */
export function textoDeLaPieza(texto) {
  return String(texto ?? "").split(/\n+/).map((l) => l.replace(/["“”«»]/g, "").trim()).filter(Boolean).slice(0, 4).map((l) => `"${l.slice(0, 80)}"`).join(" / ");
}

/** Las fotos del catálogo de un producto (`productos` de GET /api/estudio) como archivos de apoyo. [] si no tiene. Pura. */
export function fotosDelProducto(productos = [], productoId = "") {
  const p = productoId ? (productos ?? []).find((x) => x.id === productoId) : null;
  // `producto`: el pedido las presenta como el producto REAL (referencias.js), y si es de otra marca, lo dice.
  return (p?.fotos ?? []).map((clave) => ({ id: `ext:${clave}`, src: `/api/media/${clave}`, clave, prompt: p.nombre, producto: { nombre: p.nombre, marca: p.marca ?? "" } }));
}

/**
 * Las fotos de VARIOS productos en los huecos que haya: primero una de cada uno, luego la segunda de cada uno… Así una
 * pieza con dos o tres productos lleva a todos, en vez de llenar los huecos con las cuatro fotos del primero. Pura.
 */
export function fotosDeVariosProductos(productos = [], ids = [], huecos = 0) {
  const listas = [...new Set(ids)].map((id) => fotosDelProducto(productos, id)).filter((l) => l.length);
  const fuera = [];
  for (let vuelta = 0; fuera.length < huecos && listas.some((l) => l.length > vuelta); vuelta++) {
    for (const l of listas) if (l[vuelta] && fuera.length < huecos) fuera.push(l[vuelta]);
  }
  return fuera;
}

/** ¿Es un video de verdad (que se reproduce con <video>) y no una tarjeta animada de prueba? */
export const esVideoReal = (archivo) => String(archivo?.mime ?? "").startsWith("video/");

/** Lo que se añade a una publicación al usar un archivo del Estudio. */
export const medioDeArchivo = (a) => ({
  src: a.src, tipo: esVideoReal(a) ? "video" : "imagen", nombre: String(a.prompt ?? "").slice(0, 60),
  ...(a.ancho > 0 && a.alto > 0 ? { ancho: a.ancho, alto: a.alto } : {}),
});

/**
 * La publicación con `piezas` puestas: «reemplazar» (lo de antes se quita de ella; sigue en la galería) o «anadir» (al
 * final). Dos imágenes o más hacen carrusel un post (Instagram admite 10). → { post, antes }. Pura.
 */
export function postConPiezas(post, piezas, modo = "reemplazar") {
  const antes = mediosDe(post);
  const vistos = new Set(modo === "anadir" ? antes.map((x) => x.src) : []);
  const nuevos = piezas.map(medioDeArchivo).filter((m) => !vistos.has(m.src) && vistos.add(m.src));
  const medios = (modo === "anadir" ? [...antes, ...nuevos] : nuevos).slice(0, 10);
  // `mediosCambiadosAt`: si el cliente ya la aprobó, se sabe que los archivos cambiaron después (como el panel).
  let con = { ...conMedios(post, medios), mediosCambiadosAt: new Date().toISOString() };
  const imagenes = medios.filter((m) => m.tipo === "imagen").length;
  if (imagenes >= 2 && ["post", "carrusel", "", undefined].includes(post.format)) con = { ...con, format: "carrusel" };
  return { post: con, antes };
}

/** «Igualar el texto a…»: la lámina que se salió de la serie, editada con la buena de referencia (sólo posición y tamaño del texto). */
export const IGUALAR_TEXTO = "Pon el texto de la imagen de referencia 1 en la MISMA posición, con el MISMO tamaño, peso, color y alineación que el texto de la imagen de referencia 2 (otra lámina de la misma serie). Cambia sólo dónde va el texto y de qué tamaño es: sus palabras, el fondo, el sujeto y los colores se quedan";
export const ejemploParaIgualar = (a) => ({ id: a.id, clave: a.clave, src: a.src, toma: ["composicion", "tipografia"], nota: "es otra lámina de la MISMA serie: iguala a ésta la posición y el tamaño del texto" });
