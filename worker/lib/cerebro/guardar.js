// ============================================================
// Guardar UNA nota del cerebro: lo que hacía en línea `PUT /api/cerebro/<c>/nota`
//
// Lo usan la ruta (la pantalla y el asistente de la aplicación) y `guardar_en_cerebro` de Claude por MCP: una sola
// implementación, así una nota escrita desde Claude queda EXACTAMENTE como una escrita en la pantalla (su ruta única,
// sus derivados, `editada`, las fechas y el índice). `prepararNota` hace todo lo que se comprueba SIN escribir (lo usa
// la vista previa de la herramienta: lo que dice que se guardaría es lo que se guarda); `guardarNota` lo escribe.
// ============================================================

import { uuid, ahora } from "../ids.js";
import { limpiarNota, derivados, slug, rutaUnica, editadaTrasGuardar, textoEditado, huellaSeccion, MAX_NOTAS_POR_CLIENTE } from "./notas.js";
import { actualizarIndice } from "./cerebro.js";

/** Lo que no se puede guardar, con su estado (400 lo pedido, 404 la nota no está, 409 el tope de notas). */
export class ErrorNota extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

/**
 * Lo que se guardaría, sin escribir nada: la nota limpia (`limpiarNota`: el título, el tipo, una pauta nunca interna),
 * la que se reemplaza (con `entrada.id`) y la ruta que tendría. Una nota nueva toma una ruta libre a partir de su
 * título; una editada conserva la suya (los [[enlaces]] de otras notas dependen de ella). Lanza `ErrorNota`.
 * → { nota, previa, ruta }.
 */
export async function prepararNota(acceso, clienteId, entrada = {}) {
  const { nota, error: motivo } = limpiarNota(entrada);
  if (motivo) throw new ErrorNota(motivo);
  if (entrada.id) {
    const previa = await acceso.leerUno("cerebro_notas", { id: String(entrada.id), client_id: clienteId });
    if (!previa) throw new ErrorNota("Nota no encontrada", 404);
    return { nota, previa, ruta: previa.ruta };
  }
  // Sólo las rutas: para repartir una libre y contar. El texto de cada nota no hace falta para eso.
  const existentes = await acceso.leerColumnas("cerebro_notas", ["ruta"], { client_id: clienteId });
  if (existentes.length >= MAX_NOTAS_POR_CLIENTE) {
    throw new ErrorNota(`Este cliente ya tiene ${MAX_NOTAS_POR_CLIENTE} notas. Borra las que no sirvan antes de añadir más.`, 409);
  }
  return { nota, previa: null, ruta: rutaUnica(slug(nota.titulo), new Set(existentes.map((n) => n.ruta))) };
}

/**
 * Crea (sin `entrada.id`) o reemplaza (con él) una nota del cerebro de `clienteId` y pone al día su índice.
 * `entrada`: { id?, titulo, texto, tipo, interna, origen?, fuente? }. Lanza `ErrorNota`.
 * → { guardada (la fila tal como quedó en D1), previa (la de antes, o null) }.
 */
export async function guardarNota(env, acceso, clienteId, entrada = {}) {
  const { nota, previa, ruta } = await prepararNota(acceso, clienteId, entrada);
  const t = ahora();
  const fila = {
    id: previa?.id ?? uuid(), client_id: clienteId, ruta, ...nota, ...derivados(nota.texto),
    // De dónde salió una nota no lo cambia quien la edita: sin esto, corregir una nota importada le borraba el
    // origen y el archivo, y una nueva importación ya no la reconocía como suya.
    origen: previa?.origen ?? nota.origen,
    fuente: previa?.fuente ?? nota.fuente,
    // De qué versión del archivo salió (si salió de uno): no cambia al editar. Que la nota se tocó lo dice
    // su `updated_at`, y es lo que mira una nueva importación para no pisarla.
    fuente_sha: previa?.fuente_sha ?? "",
    // Qué le cambió la persona: el texto (no se pisa al importar) o sólo el tipo o el candado (se conservan).
    editada: editadaTrasGuardar(previa, { ...nota }),
    // La base de la sección de GitHub (0079): una nota importada antes de que existiera, y que nadie había tocado, TIENE
    // todavía el texto de GitHub; su huella es la que dirá después si esa sección cambió allí o sólo aquí.
    ...(previa?.origen === "repositorio" && !previa.seccion_hash && !textoEditado(previa) ? { seccion_hash: huellaSeccion(previa.texto) } : {}),
    created_at: previa?.created_at ?? t, updated_at: t,
  };
  // Que una nota está «editada a mano» se sabe porque su `updated_at` ya no es su `created_at` (importar.js, preparar.js
  // y las notas automáticas lo miran para no pisarla). Por eso:
  //   · una nota NUEVA entra con `insertar`, que respeta las dos fechas, iguales: con `guardar`, `updated_at` salía un
  //     milisegundo después y una nota sin tocar parecía editada;
  //   · una EDICIÓN queda siempre ESTRICTAMENTE después de la creación, aunque caiga en el mismo milisegundo: sin eso,
  //     corregir una nota recién escrita la dejaba «sin tocar» y la siguiente importación la pisaba. Se escribe con
  //     `actualizar`, que no vuelve a fechar (`guardar` sí).
  // Lo que se indexa es lo que quedó en D1: por eso `guardada` lleva la fecha que se escribió, no `t`.
  let guardada;
  if (previa) {
    const editada = new Date(Math.max(Date.now(), Date.parse(previa.created_at) + 1)).toJSON();
    const { id: _id, client_id: _cliente, created_at: _creada, ...cambios } = { ...fila, updated_at: editada };
    await acceso.actualizar("cerebro_notas", { id: previa.id, client_id: clienteId }, cambios);
    guardada = { ...fila, updated_at: editada };
  } else {
    guardada = await acceso.insertar("cerebro_notas", fila);
  }
  await actualizarIndice(env, acceso, clienteId, ruta, guardada);
  return { guardada, previa };
}
