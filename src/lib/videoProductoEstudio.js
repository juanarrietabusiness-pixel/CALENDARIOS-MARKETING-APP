// ============================================================
// La receta «Video del producto» en el Estudio: los dos fotogramas y el video (navegador)
//
// Los fotogramas van por el camino de UNA pieza (pieza.js: el kit, su estilo y la proporción): el primero SIN logo y,
// si la escena enseña el producto, con sus fotos reales; el cierre con las fotos del producto y el logo del kit (o
// estampado por la aplicación, si el kit lo pide así). El video arranca en uno y termina en el otro. Lo puro de la
// receta (guion, escenas, prompt) está en videoProducto.js.
// ============================================================

import * as api from "./estudio";
import { MODELOS, porPrecio, ajustesDe, estimar } from "./estudioCatalogo";
import { pedidoDePieza } from "./pieza";
import { esperarArchivo } from "./carruselEstudio";
import { conLogoSiToca } from "./logoEstudio";
import { ajusteDeDuracion } from "./videoCorto";
import { limpiarKit } from "./kitMarca";
import {
  sirveParaProducto, duracionesDe, PREFERIDOS_PRODUCTO, escenaDelInicio, escenaDelCierre, promptDeVideoProducto, sinVozEnProducto,
} from "./videoProducto";

/** Los modelos de video que sirven (imagen inicial y final, una duración de la receta), del más barato al más caro. */
export function modelosParaProducto(activos = {}) {
  return porPrecio(MODELOS.filter((m) => sirveParaProducto(m) && duracionesDe(m).length && (m.motor === "prueba" || activos[m.motor])), activos);
}

/** El que se escoge si nadie escoge: el de la lista de preferencia con llave; si no, el primero que no sea de prueba. */
export function modeloParaProducto(activos = {}) {
  const lista = modelosParaProducto(activos);
  return PREFERIDOS_PRODUCTO.map((id) => lista.find((m) => m.id === id)).find(Boolean) ?? lista.find((m) => m.motor !== "prueba") ?? lista[0] ?? null;
}

/** Las fotos del producto como apoyos de una pieza, dejando un hueco para el logo si va. Pura. */
export function fotosParaFotograma(productos = [], productoId = "", modelo = null, { conLogo = false } = {}) {
  const huecos = Math.max(0, (modelo?.referencias ?? 0) - (conLogo ? 1 : 0));
  return api.fotosDelProducto(productos, productoId).slice(0, Math.min(3, huecos));
}

/** El pedido de un fotograma (sin pedirlo). `cual`: "inicio" | "cierre". Pura salvo por los imports. */
export function pedidoDeFotograma({ cual, guion, kit, modelo, producto, productos = [], marca = "la marca", rubro = "", activos = null }) {
  const cierre = cual === "cierre";
  const conLogo = cierre && Boolean(limpiarKit(kit).logo);
  const apoyos = cierre || guion?.inicioConProducto ? fotosParaFotograma(productos, producto?.id, modelo, { conLogo }) : [];
  const idea = cierre ? escenaDelCierre({ producto: producto?.nombre, conLogo }) : escenaDelInicio(guion);
  return pedidoDePieza({
    kit, idea, apoyos, modelo, marca, rubro, conLogo, aspectRatio: "9:16", proporcion: "9:16", activos, altaResolucion: true,
  });
}

/** Pide un fotograma y espera; el cierre sale con el logo ESTAMPADO si el kit lo pide así (o si el motor lo dejó fuera). */
export async function crearFotogramaDeProducto({ clienteId, carpetaId = null, seguir, ...datos }) {
  const pedido = pedidoDeFotograma(datos);
  const { trabajo } = await api.pedirImagenes(clienteId, { ...pedido, confirmado: true, ...(carpetaId ? { carpetaId } : {}) });
  const archivo = await esperarArchivo(clienteId, trabajo, { seguir });
  return datos.cual === "cierre" ? conLogoSiToca({ clienteId, archivo, kit: datos.kit, carpetaId }) : archivo;
}

/** Lo que cuestan los dos fotogramas con ese modelo de imagen. Pura. */
export const costoDeFotogramas = (modelo) => (modelo ? Math.round(2 * estimar(modelo, 1, { imageSize: "2K" }) * 1000) / 1000 : 0);

/** El pedido del VIDEO (sin pedirlo): imagen inicial y final, la duración y el prompt corto. Pura salvo por los imports. */
export function pedidoDeVideoProducto({ modelo, guion, inicio, cierre }) {
  const medios = { start: [inicio.clave], end: [cierre.clave] };
  const duracion = ajusteDeDuracion(modelo, guion.segundos) ?? undefined;
  const conVoz = !sinVozEnProducto(modelo);
  const sonido = modelo.ajustes?.sonido ? { sonido: "si" } : {};
  return {
    modelo: modelo.id, n: 1, medios,
    prompt: promptDeVideoProducto(guion, { conVoz }),
    ajustes: ajustesDe(modelo, { aspectRatio: "9:16", ...(duracion ? { duration: duracion } : {}), ...sonido }, medios),
  };
}
