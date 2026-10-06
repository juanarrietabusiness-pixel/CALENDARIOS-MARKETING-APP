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
import { contexto as contextoCerebro } from "../cerebro/cerebro.js";
import { kitDe } from "./kit.js";
import { leerMercado } from "../mercado.js";
import { textoPaleta } from "../../../src/lib/kitMarca.js";
import { productosActivos, lineaDeProducto } from "../../../src/lib/estudioMercado.js";
import { CAMPOS_MATRIZ } from "../../../src/lib/pilares.js";
import { pedidoDeGuionCorto, leerGuionCorto, promptDeVideoCorto } from "../../../src/lib/videoCorto.js";

const MAX_IDEA = 2000;

/** `datos`: { idea, segundos (8 | 10), post? (los campos del tipo de contenido) }. */
export async function guionCorto(env, acceso, cliente, datos = {}) {
  const idea = String(datos.idea ?? "").trim().slice(0, MAX_IDEA);
  const segundos = Number(datos.segundos) >= 10 ? 10 : 8;
  const post = Object.fromEntries(CAMPOS_MATRIZ.map((k) => [k, String(datos.post?.[k] ?? "").slice(0, 120)]));

  const kit = kitDe(cliente);
  const textoKit = [
    kit.paleta.length && `Paleta: ${textoPaleta(kit.paleta)}`,
    kit.estilo && `Estilo: ${kit.estilo}`,
    kit.luz && `Luz: ${kit.luz}`,
    kit.evitar && `Nunca: ${kit.evitar}`,
  ].filter(Boolean).join("\n");

  let productoLinea = "";
  try {
    const { catalogo } = await leerMercado(acceso, cliente.id);
    const p = productosActivos(catalogo).find((x) => x.id === post.productoId || x.nombre === post.producto);
    if (p) productoLinea = lineaDeProducto(p).slice(2);
  } catch { /* sin catálogo, el guion sale igual */ }

  let contexto = "";
  try {
    const c = await contextoCerebro(env, acceso, cliente.id, `${idea} ${post.producto} video reel`, { para: "texto", presupuesto: 4000 });
    contexto = [c.ficha, c.pasajes].filter(Boolean).join("\n\n");
  } catch { /* sin cerebro, sólo la idea y el kit */ }

  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeGuionCorto({ marca: cliente.name, idea, segundos, post: post.pilar ? post : null, kit: textoKit, contexto, productoLinea }),
    salida: 1500,
    funcion: "guion de video",
  });
  const guion = leerGuionCorto(r.texto, segundos);
  if (!guion) throw Object.assign(new Error("La IA no devolvió un guion que se pueda leer. Inténtalo otra vez."), { estado: 502 });
  return { guion, prompt: promptDeVideoCorto(guion), modelo: r.modelo, aviso: r.aviso };
}
