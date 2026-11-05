// ============================================================
// /api/recetas — las recetas de la agencia y los pedidos de «Crear con Claude»
//
//   GET    /api/recetas                   Las de la casa (con lo cambiado) y las propias
//   PUT    /api/recetas/<id>              { receta }: guardarla (cambiar una de la casa o crear/editar una propia)
//   DELETE /api/recetas/<id>              Una propia se borra; una de la casa vuelve a como venía
//   POST   /api/recetas/<id>/handoff      { clienteId, publicacion?, referencias?, productos?, indicacion? }
//                                         → { id, mensaje, enlace }: el pedido guardado un día para claude.ai
//
// Lo puro (las de la casa, limpiar, juntar, el mensaje) está en src/lib/recetas.js. Cambiarlas es del espacio entero:
// quien administra y los editores, no un colaborador (como las plantillas de plan). Pedir un handoff es de cualquiera
// que vea ESE cliente: la capa de acceso lo acota.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { uuid, ahora } from "../lib/ids.js";
import { recetasDelEspacio, crearHandoff } from "../lib/recetas.js";
import { limpiarReceta, esDeCasa, MAX_RECETAS } from "../../src/lib/recetas.js";

const ID = /^[a-z0-9][a-z0-9-]{1,59}$/;

export async function rutasRecetas(req, env, { acceso, usuario, partes, metodo }) {
  const [, id, accion] = partes;
  if (!id && metodo === "GET") return json({ recetas: await recetasDelEspacio(acceso) });
  if (!ID.test(String(id ?? ""))) return noEncontrado("Receta");

  if (accion === "handoff" && metodo === "POST") {
    const receta = (await recetasDelEspacio(acceso)).find((r) => r.id === id);
    if (!receta) return noEncontrado("Receta");
    const r = await crearHandoff(acceso, usuario, receta, (await cuerpo(req)) ?? {});
    return r.error ? error(r.error, r.estado) : json(r, 201);
  }
  if (accion) return noEncontrado("Ruta");

  // Un colaborador es un editor con `clientes` (sólo lleva algunos): ése no cambia lo de toda la agencia.
  const puede = usuario?.rol === "admin" || (usuario?.rol === "editor" && !Array.isArray(usuario?.clientes));
  if (!puede) return error("Las recetas son de toda la agencia: las cambia quien administra o un editor.", 403);

  if (metodo === "PUT") {
    const b = (await cuerpo(req)) ?? {};
    const limpia = limpiarReceta({ ...b.receta, id });
    if (!limpia) return error("A la receta le falta el título o el método.");
    const { id: _id, ...datos } = limpia;
    const momento = ahora();
    const n = await acceso.actualizar("recetas", { receta_id: id }, { datos: JSON.stringify(datos), updated_at: momento });
    if (!n) {
      if ((await acceso.leer("recetas", {})).length >= MAX_RECETAS) return error(`Como mucho ${MAX_RECETAS} recetas guardadas.`);
      await acceso.insertar("recetas", { id: uuid(), receta_id: id, datos: JSON.stringify(datos), creado_por: usuario.id, created_at: momento, updated_at: momento });
    }
    return json({ recetas: await recetasDelEspacio(acceso) });
  }

  if (metodo === "DELETE") {
    const n = await acceso.borrar("recetas", { receta_id: id });
    if (!n && !esDeCasa(id)) return noEncontrado("Receta");
    return json({ recetas: await recetasDelEspacio(acceso) });
  }
  return noEncontrado("Ruta");
}
