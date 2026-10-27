// ============================================================
// Las PLANTILLAS del kit: piezas que quedaron muy bien, para repetir su
// diseño con otro contenido
//
// Una plantilla es una imagen de la galería del cliente + su SISTEMA DE
// DISEÑO en palabras (lo escribe la IA mirándola, una vez: control.js), con
// un nombre y un uso (post fijo, historia, portada o lámina de carrusel).
// Va en `kit.plantillas` (kitMarca.js) y la usan el director de arte, el
// asistente, el lote, «Producir el mes», el post y las historias: la imagen
// de referencia (sólo su diseño, nunca su contenido) y el sistema escrito.
//
// Aparte de kit.js a propósito: control.js lee mercado.js, que lee kit.js.
// ============================================================

import { ErrorEstudio } from "./trabajos.js";
import { kitDe, guardarKit } from "./kit.js";
import { sistemaDePortada } from "./control.js";
import { MAX_PLANTILLAS } from "../../../src/lib/kitMarca.js";
import { lineaDeSistema } from "../../../src/lib/sistemaCarrusel.js";
import { USOS_PLANTILLA } from "../../../src/lib/director.js";

/**
 * «Guardar como plantilla»: una pieza de la galería que quedó muy bien pasa al kit con su SISTEMA DE DISEÑO (la IA la
 * mira una vez y lo escribe en medidas; queda también en la ficha del archivo). Después, cualquier pieza puede repetir
 * ese diseño con otro contenido (kitMarca.js: `referenciaDePlantilla`, `lineaDePlantillaEnPedido`). → { kit, plantilla }.
 */
export async function guardarPlantilla(env, acceso, cliente, { archivoId, nombre = "", uso = "post" } = {}) {
  const fila = await acceso.leerUno("estudio_archivos", { id: String(archivoId ?? ""), client_id: cliente.id });
  if (!fila || fila.borrado_at || fila.tipo !== "imagen") throw new ErrorEstudio("Esa imagen no está en la galería de este cliente.", 404);
  const actual = kitDe(cliente);
  const yaEsta = actual.plantillas.find((p) => p.clave === fila.clave);
  if (!yaEsta && actual.plantillas.length >= MAX_PLANTILLAS) throw new ErrorEstudio(`El kit ya tiene ${MAX_PLANTILLAS} plantillas: quita alguna en el kit de marca.`, 409);
  const { sistema } = await sistemaDePortada(env, acceso, cliente, fila.id, { para: "plantilla" });
  const plantilla = {
    id: yaEsta?.id ?? `plantilla-${crypto.randomUUID().slice(0, 8)}`,
    nombre: String(nombre ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || yaEsta?.nombre || `Plantilla ${actual.plantillas.length + 1}`,
    uso: USOS_PLANTILLA.includes(uso) ? uso : "post",
    clave: fila.clave, archivoId: fila.id, sistema: lineaDeSistema(sistema),
  };
  const kit = await guardarKit(env, acceso, cliente, { ...actual, plantillas: [...actual.plantillas.filter((p) => p.id !== plantilla.id), plantilla] });
  return { kit, plantilla };
}

/** Quita una plantilla del kit (la imagen se queda en la galería). → { kit }. */
export async function quitarPlantilla(env, acceso, cliente, id) {
  const actual = kitDe(cliente);
  if (!actual.plantillas.some((p) => p.id === id)) throw new ErrorEstudio("Esa plantilla no está en el kit.", 404);
  return { kit: await guardarKit(env, acceso, cliente, { ...actual, plantillas: actual.plantillas.filter((p) => p.id !== id) }) };
}
