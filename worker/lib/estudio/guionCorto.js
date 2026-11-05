// ============================================================
// El guion de un video corto (8 o 10 s) para el Estudio
//
// La IA escribe gancho, beneficio y cierre a partir de la idea, del tipo de
// contenido de la publicación (si viene de una), del producto con su precio
// EXACTO del catálogo, del kit de marca (paleta y estilo) y del cerebro (sin
// lo interno). Devuelve el guion para revisar y el pedido ya armado: no
// pide nada al motor de video, sólo escribe texto.
//
// Lo puro (el pedido, la lectura, el prompt) está en src/lib/videoCorto.js.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { kitDe } from "./kit.js";
import { contextoDeGuion } from "./guionVideo.js";
import { textoPaleta } from "../../../src/lib/kitMarca.js";
import { CAMPOS_MATRIZ } from "../../../src/lib/pilares.js";
import { pedidoDeGuionCorto, leerGuionCorto, promptDeVideoCorto } from "../../../src/lib/videoCorto.js";
import { pedidoDeVideoProducto, leerVideoProducto, promptDeVideoProducto, DURACIONES_PRODUCTO } from "../../../src/lib/videoProducto.js";

const MAX_IDEA = 2000;

/** El estilo del kit en pocas líneas (paleta, estilo, luz y lo que nunca). */
function textoDelKit(cliente) {
  const kit = kitDe(cliente);
  return [
    kit.paleta.length && `Paleta: ${textoPaleta(kit.paleta)}`,
    kit.estilo && `Estilo: ${kit.estilo}`,
    kit.luz && `Luz: ${kit.luz}`,
    kit.evitar && `Nunca: ${kit.evitar}`,
  ].filter(Boolean).join("\n");
}

/** `datos`: { idea, segundos (8 | 10), post? (los campos del tipo de contenido) }. */
export async function guionCorto(env, acceso, cliente, datos = {}) {
  const idea = String(datos.idea ?? "").trim().slice(0, MAX_IDEA);
  const segundos = Number(datos.segundos) >= 10 ? 10 : 8;
  const post = Object.fromEntries(CAMPOS_MATRIZ.map((k) => [k, String(datos.post?.[k] ?? "").slice(0, 120)]));
  const textoKit = textoDelKit(cliente);

  // El contexto común de todo guion de video: el producto con su precio, el cerebro, el criterio y la publicación.
  const ctx = await contextoDeGuion(env, acceso, cliente, {
    productoId: post.productoId, producto: post.producto, consulta: `${idea} ${post.producto} video reel`, presupuesto: 4000,
    postId: String(datos.postId ?? ""), guionPost: String(datos.guionPost ?? ""),
  });

  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeGuionCorto({
      marca: cliente.name, idea, segundos, post: post.pilar ? post : null, kit: textoKit, contexto: ctx.contexto, productoLinea: ctx.producto,
      criterio: ctx.criterio, guionPost: ctx.guionPost,
    }),
    salida: 1500,
    funcion: "guion de video",
  });
  const guion = leerGuionCorto(r.texto, segundos);
  if (!guion) throw Object.assign(new Error("La IA no devolvió un guion que se pueda leer. Inténtalo otra vez."), { estado: 502 });
  return { guion, prompt: promptDeVideoCorto(guion), modelo: r.modelo, aviso: r.aviso };
}

/**
 * El guion de la receta «Video del producto» (src/lib/videoProducto.js). `datos`: { productoId, segundos (10 | 12 |
 * 15), idea?, post? }. El producto es OBLIGATORIO y sale del catálogo, con su precio exacto: la imagen de cierre lleva
 * sus fotos reales. No pide nada al motor: sólo escribe texto.
 */
export async function guionDeVideoProducto(env, acceso, cliente, datos = {}) {
  const idea = String(datos.idea ?? "").trim().slice(0, MAX_IDEA);
  const pedidos = Number(datos.segundos);
  const segundos = DURACIONES_PRODUCTO.includes(pedidos) ? pedidos : pedidos >= 6 && pedidos < 10 ? Math.round(pedidos) : 10;
  const post = Object.fromEntries(CAMPOS_MATRIZ.map((k) => [k, String(datos.post?.[k] ?? "").slice(0, 120)]));

  // El contexto común de todo guion de video (el producto es OBLIGATORIO aquí: el video termina en su foto real).
  const ctx = await contextoDeGuion(env, acceso, cliente, {
    productoId: String(datos.productoId ?? ""), consulta: `${idea} beneficios video anuncio`, presupuesto: 3500,
    postId: String(datos.postId ?? ""), guionPost: String(datos.guionPost ?? ""),
  });
  const producto = ctx.productoFila;
  if (!producto) throw Object.assign(new Error("Escoge un producto del catálogo: el video termina en su foto real."), { estado: 400 });

  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeVideoProducto({
      marca: cliente.name, segundos, idea, kit: textoDelKit(cliente), contexto: ctx.contexto,
      producto: ctx.producto, post: post.pilar ? post : null, criterio: ctx.criterio, guionPost: ctx.guionPost,
    }),
    salida: 1500,
    funcion: "guion de video",
  });
  const guion = leerVideoProducto(r.texto, segundos);
  if (!guion) throw Object.assign(new Error("La IA no devolvió un guion que se pueda leer. Inténtalo otra vez."), { estado: 502 });
  return { guion, producto: { id: producto.id, nombre: producto.nombre }, prompt: promptDeVideoProducto(guion), modelo: r.modelo, aviso: r.aviso };
}
