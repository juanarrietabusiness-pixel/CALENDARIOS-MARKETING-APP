// ============================================================
// /api/edicion — el EDITOR DE VIDEO GRABADO en la pantalla (Fase 5; docs/propuesta-edicion-video-grabado.md)
//
//   GET    /api/edicion/actas            Las últimas ediciones (actas) del espacio, con su cliente, y la versión del kit
//
// Las actas las escribe Claude con acta_de_edicion (worker/lib/estudio/actasEdicion.js); aquí sólo se leen. La capa de
// acceso acota por dueño y, a un colaborador, por sus clientes.
// ============================================================

import { json, noEncontrado } from "../lib/respuesta.js";
import { KIT_EDICION } from "../../src/lib/kitEdicionVersion.js";

const leerJSON = (t, d) => { try { return typeof t === "string" ? JSON.parse(t) ?? d : (t ?? d); } catch { return d; } };
/** Cuántas actas enseña la lista. */
export const ACTAS_EN_LISTA = 20;

/** Las últimas actas con el nombre de su cliente. */
async function ultimasActas(acceso) {
  const filas = await acceso.leer("edicion_actas", {}, "created_at desc", ACTAS_EN_LISTA);
  const clientes = new Map((await acceso.leerColumnas("clients", ["id", "name"], {}, "name asc")).map((c) => [c.id, c.name]));
  return filas.map((f) => {
    const resumen = leerJSON(f.resumen, {});
    return {
      id: f.id, cliente: { id: f.client_id, nombre: clientes.get(f.client_id) ?? "" }, tipo: f.tipo, estiloId: f.estilo_id || "",
      kitVersion: f.kit_version || "", manualVersion: f.manual_version ?? 0, cuando: f.created_at, archivoId: f.archivo_id || null,
      resumen, correcciones: leerJSON(f.correcciones, []).length,
    };
  });
}

export async function rutasEdicion(req, env, { acceso, partes, metodo }) {
  const [, que] = partes;
  if (que === "actas" && metodo === "GET") return json({ actas: await ultimasActas(acceso), kit: KIT_EDICION });
  return noEncontrado("Ruta");
}
