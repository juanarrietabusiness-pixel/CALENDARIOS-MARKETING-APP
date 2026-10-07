// ============================================================
// /api/plantillas-plan — las plantillas de plan de la agencia
//
//   GET    /api/plantillas-plan          Las de arranque (con lo cambiado) y las propias
//   PUT    /api/plantillas-plan/<id>     { plantilla }: guardarla (cambiar una de arranque o crear/editar una propia)
//   DELETE /api/plantillas-plan/<id>     Una propia se borra; una de arranque vuelve a como venía
//
// Lo puro (las de arranque, limpiar, juntar) está en src/lib/plantillasPlan.js.
// Cambiarlas es del espacio entero, así que lo hacen quien administra y los
// editores, no un colaborador (que sólo lleva algunos clientes). La plantilla
// de UN cliente va en su ficha (`clients.plan_contenido`), no aquí.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { uuid, ahora } from "../lib/ids.js";
import { plantillasDisponibles, limpiarPlantilla, esDeArranque, MAX_PLANTILLAS } from "../../src/lib/plantillasPlan.js";

const ID = /^[\w-]{1,60}$/;

const deFila = (f) => {
  let d = {};
  try { d = JSON.parse(f.datos); } catch { /* fila rota: se queda sin datos y la limpieza la descarta */ }
  return { ...d, id: f.plantilla_id };
};

async function lista(acceso) {
  return plantillasDisponibles((await acceso.leer("plantillas_plan", {})).map(deFila));
}

export async function rutasPlantillas(req, env, { acceso, usuario, partes, metodo }) {
  const [, id] = partes;
  if (!id && metodo === "GET") return json({ plantillas: await lista(acceso) });
  if (!ID.test(String(id ?? ""))) return noEncontrado("Plantilla");
  // Un colaborador es un editor con `clientes` (sólo lleva algunos): ése no cambia lo de toda la agencia.
  const puede = usuario?.rol === "admin" || (usuario?.rol === "editor" && !Array.isArray(usuario?.clientes));
  if (!puede) return error("Las plantillas son de toda la agencia: las cambia quien administra o un editor.", 403);

  if (metodo === "PUT") {
    const b = (await cuerpo(req)) ?? {};
    const limpia = limpiarPlantilla({ ...b.plantilla, id });
    if (!limpia) return error("A la plantilla le falta el nombre.");
    const { id: _id, ...datos } = limpia;
    const momento = ahora();
    const n = await acceso.actualizar("plantillas_plan", { plantilla_id: id }, { datos: JSON.stringify(datos), updated_at: momento });
    if (!n) {
      const guardadas = await acceso.leer("plantillas_plan", {});
      if (guardadas.length >= MAX_PLANTILLAS) return error(`Como mucho ${MAX_PLANTILLAS} plantillas guardadas.`);
      await acceso.insertar("plantillas_plan", { id: uuid(), plantilla_id: id, datos: JSON.stringify(datos), creado_por: usuario.id, created_at: momento, updated_at: momento });
    }
    return json({ plantillas: await lista(acceso) });
  }

  if (metodo === "DELETE") {
    const n = await acceso.borrar("plantillas_plan", { plantilla_id: id });
    if (!n && !esDeArranque(id)) return noEncontrado("Plantilla");
    return json({ plantillas: await lista(acceso) });
  }
  return noEncontrado("Ruta");
}
