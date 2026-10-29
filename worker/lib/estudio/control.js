// ============================================================
// El control de calidad de una pieza de la galería
//
// Lo puro (el pedido, la comparación del texto, el veredicto) en
// src/lib/control.js. Aquí: la imagen de R2, el kit, los precios del
// catálogo, la llamada a la IA (que MIRA la imagen) y apuntar el resultado
// en la ficha (`ajustes.control`), donde lo leen la galería, el visor, el
// lote y «Producir el mes».
//
// Va en el hueco «análisis» (función «control de calidad»): son céntimos
// por pieza, y lo que ahorra es que el cliente vea una letra mal.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { ErrorEstudio } from "./trabajos.js";
import { aBase64 } from "./gemini.js";
import { archivoPublico } from "./galeria.js";
import { leerMercado } from "../mercado.js";
import { productosActivos } from "../../../src/lib/estudioMercado.js";
import { limpiarKit, pideLogoDeReferencia } from "../../../src/lib/kitMarca.js";
import { pedidoDeControl, leerControl, textoDelPedido } from "../../../src/lib/control.js";
import { pedidoDeSistema, leerSistema, lineaDeSistema } from "../../../src/lib/sistemaCarrusel.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
/** Lo que Anthropic admite por imagen (5 MB en base64): con margen. */
const MAX_BYTES = 3_600_000;
const MAX_TEXTO = 400;

/** La ficha y los bytes de UNA imagen de la galería de este cliente (para que la IA la mire). */
async function imagenDeLaGaleria(env, acceso, cliente, archivoId) {
  const fila = await acceso.leerUno("estudio_archivos", { id: String(archivoId), client_id: cliente.id });
  if (!fila || fila.borrado_at) throw new ErrorEstudio("Esa pieza no está en la galería de este cliente.", 404);
  if (fila.tipo !== "imagen" || !/^image\/(png|jpeg|webp|gif)$/.test(fila.mime ?? "")) {
    throw new ErrorEstudio("El control de calidad mira imágenes (no videos ni SVG).", 400);
  }
  const obj = await env.MEDIA.get(fila.clave);
  if (!obj) throw new ErrorEstudio("La imagen ya no está en el almacenamiento.", 404);
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new ErrorEstudio("La imagen es demasiado grande para controlarla (más de 3,5 MB).", 413);
  return { fila, bytes };
}

/**
 * La FICHA de diseño con la que se pidió la pieza (lo que va del «Pieza:» al «Evitar:» del pedido), para que el
 * director la revise contra ella. "" si el pedido no la llevaba (una pieza a mano, una edición): sin ficha no hay
 * con qué comparar, y la revisión del director no se hace.
 */
export function fichaDelPedido(prompt) {
  const t = String(prompt ?? "");
  if (/^Edita la imagen de referencia/.test(t)) return "";
  const i = t.search(/(^|\n)Pieza: /);
  if (i < 0 || !/\nComposición: /.test(t)) return "";
  return t.slice(i).trim().split("\n\n")[0].slice(0, 2500);
}

/**
 * Controla UNA imagen de la galería de este cliente. `texto`: lo que tenía que decir (si la pantalla lo sabe; si no,
 * se saca del pedido); `sistema`: el sistema de diseño de la portada, si es una lámina de un carrusel (se dice lo que
 * se sale de la serie). → { control, archivo } con el control apuntado en la ficha.
 */
export async function controlarPieza(env, acceso, cliente, archivoId, { texto = null, sistema = null, ficha = null } = {}) {
  const { fila, bytes } = await imagenDeLaGaleria(env, acceso, cliente, archivoId);

  const ajustes = leerJSON(fila.ajustes, {});
  // El texto esperado: el que manda la pantalla, el de la plantilla puesta encima, o el que se le pidió al motor.
  const esperado = String(texto ?? ajustes?.plantilla?.texto ?? textoDelPedido(fila.prompt) ?? "").trim().slice(0, MAX_TEXTO);
  const kit = limpiarKit(leerJSON(cliente.kit_marca, {}));
  // ¿Se le dio el logo al modelo? Entonces tiene que salir, y bien.
  const logo = pideLogoDeReferencia(fila.prompt);
  let precios = [];
  try {
    const { catalogo } = await leerMercado(acceso, cliente.id);
    precios = productosActivos(catalogo).flatMap((p) => [p.precio, p.oferta]).map((x) => String(x ?? "").trim()).filter(Boolean);
  } catch { /* sin catálogo, cualquier precio se señala */ }

  // La ficha con la que el director la diseñó: la de su pedido, o la que manda la pantalla (la de la original).
  const laFicha = fichaDelPedido(fila.prompt) || String(ficha ?? "").trim();
  const r = await llamarIA(env, acceso, cliente, {
    prompt: [
      { type: "image", source: { type: "base64", media_type: fila.mime, data: aBase64(bytes) } },
      { type: "text", text: pedidoDeControl({ marca: cliente.name, texto: esperado, precios, logo, evitar: kit.evitar, reglas: kit.reglas, sistema: lineaDeSistema(sistema), ficha: laFicha }) },
    ],
    salida: 1300,
    funcion: "control de calidad",
  });
  const control = leerControl(r.texto, { texto: esperado, logo });
  if (!control) throw new ErrorEstudio("La IA no devolvió un control que se pueda leer. Inténtalo otra vez.", 502);
  const guardado = { ...control, texto: esperado, ...(laFicha ? { ficha: laFicha } : {}), at: new Date().toISOString() };
  await acceso.actualizar("estudio_archivos", { id: fila.id, client_id: cliente.id }, { ajustes: JSON.stringify({ ...ajustes, control: guardado }) });
  return { control: guardado, archivo: archivoPublico({ ...fila, ajustes: JSON.stringify({ ...ajustes, control: guardado }) }), modelo: r.modelo };
}

/**
 * El sistema de diseño de una PORTADA de carrusel (src/lib/sistemaCarrusel.js): la IA la mira y lo escribe en medidas
 * que el generador pueda seguir. Se apunta en la ficha (`ajustes.sistema`) y, si ya estaba, se devuelve sin llamar a
 * nadie. `texto`: el de la portada. → { sistema }.
 */
export async function sistemaDePortada(env, acceso, cliente, archivoId, { texto = "", para = "portada" } = {}) {
  const { fila, bytes } = await imagenDeLaGaleria(env, acceso, cliente, archivoId);
  const ajustes = leerJSON(fila.ajustes, {});
  const ya = leerSistema(ajustes.sistema);
  if (ya) return { sistema: ya };
  const r = await llamarIA(env, acceso, cliente, {
    prompt: [
      { type: "image", source: { type: "base64", media_type: fila.mime, data: aBase64(bytes) } },
      { type: "text", text: pedidoDeSistema({ marca: cliente.name, texto: String(texto ?? "").slice(0, MAX_TEXTO), para }) },
    ],
    salida: 900,
    funcion: "sistema de diseño",
  });
  const sistema = leerSistema(r.texto);
  if (!sistema) throw new ErrorEstudio("La IA no devolvió un sistema de diseño que se pueda leer. Inténtalo otra vez.", 502);
  await acceso.actualizar("estudio_archivos", { id: fila.id, client_id: cliente.id }, { ajustes: JSON.stringify({ ...ajustes, sistema }) });
  return { sistema, modelo: r.modelo };
}
