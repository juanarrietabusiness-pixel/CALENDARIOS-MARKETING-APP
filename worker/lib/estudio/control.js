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
import { limpiarKit, LINEA_LOGO } from "../../../src/lib/kitMarca.js";
import { pedidoDeControl, leerControl, textoDelPedido } from "../../../src/lib/control.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
/** Lo que Anthropic admite por imagen (5 MB en base64): con margen. */
const MAX_BYTES = 3_600_000;
const MAX_TEXTO = 400;

/**
 * Controla UNA imagen de la galería de este cliente. `texto`: lo que tenía que decir (si la pantalla lo sabe; si no,
 * se saca del pedido). → { control, archivo } con el control apuntado en la ficha.
 */
export async function controlarPieza(env, acceso, cliente, archivoId, { texto = null } = {}) {
  const fila = await acceso.leerUno("estudio_archivos", { id: String(archivoId), client_id: cliente.id });
  if (!fila || fila.borrado_at) throw new ErrorEstudio("Esa pieza no está en la galería de este cliente.", 404);
  if (fila.tipo !== "imagen" || !/^image\/(png|jpeg|webp|gif)$/.test(fila.mime ?? "")) {
    throw new ErrorEstudio("El control de calidad mira imágenes (no videos ni SVG).", 400);
  }
  const obj = await env.MEDIA.get(fila.clave);
  if (!obj) throw new ErrorEstudio("La imagen ya no está en el almacenamiento.", 404);
  const bytes = new Uint8Array(await obj.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new ErrorEstudio("La imagen es demasiado grande para controlarla (más de 3,5 MB).", 413);

  const ajustes = leerJSON(fila.ajustes, {});
  // El texto esperado: el que manda la pantalla, el de la plantilla puesta encima, o el que se le pidió al motor.
  const esperado = String(texto ?? ajustes?.plantilla?.texto ?? textoDelPedido(fila.prompt) ?? "").trim().slice(0, MAX_TEXTO);
  const kit = limpiarKit(leerJSON(cliente.kit_marca, {}));
  // ¿Se le dio el logo al modelo? Entonces tiene que salir, y bien.
  const logo = String(fila.prompt ?? "").includes(LINEA_LOGO);
  let precios = [];
  try {
    const { catalogo } = await leerMercado(acceso, cliente.id);
    precios = productosActivos(catalogo).flatMap((p) => [p.precio, p.oferta]).map((x) => String(x ?? "").trim()).filter(Boolean);
  } catch { /* sin catálogo, cualquier precio se señala */ }

  const r = await llamarIA(env, acceso, cliente, {
    prompt: [
      { type: "image", source: { type: "base64", media_type: fila.mime, data: aBase64(bytes) } },
      { type: "text", text: pedidoDeControl({ marca: cliente.name, texto: esperado, precios, logo, evitar: kit.evitar, reglas: kit.reglas }) },
    ],
    salida: 900,
    funcion: "control de calidad",
  });
  const control = leerControl(r.texto, { texto: esperado, logo });
  if (!control) throw new ErrorEstudio("La IA no devolvió un control que se pueda leer. Inténtalo otra vez.", 502);
  const guardado = { ...control, texto: esperado, at: new Date().toISOString() };
  await acceso.actualizar("estudio_archivos", { id: fila.id, client_id: cliente.id }, { ajustes: JSON.stringify({ ...ajustes, control: guardado }) });
  return { control: guardado, archivo: archivoPublico({ ...fila, ajustes: JSON.stringify({ ...ajustes, control: guardado }) }), modelo: r.modelo };
}
