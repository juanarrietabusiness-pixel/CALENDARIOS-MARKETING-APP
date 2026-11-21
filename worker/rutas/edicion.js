// ============================================================
// /api/edicion — el EDITOR DE VIDEO GRABADO en la pantalla (Fase 5; docs/propuesta-edicion-video-grabado.md)
//
//   GET    /api/edicion/actas                    Las últimas ediciones (actas) del espacio, con su cliente, y la versión del kit
//   GET    /api/edicion/<cliente>/estilos        Los ESTILOS DE EDICIÓN del cliente y lo que se puede escoger (piezas, tipos…)
//   PUT    /api/edicion/<cliente>/estilos        Un estilo ENTERO: con su id (o el mismo nombre) lo reemplaza; sin él, uno nuevo
//   DELETE /api/edicion/<cliente>/estilos/<id>   Lo quita
//
// Los estilos los escriben esta ruta y estilo_de_edicion (worker/lib/estudio/estilosEdicion.js: el kit, sólo por ahí). Lo
// que no se entiende se dice y no se guarda nada (400 con cada cosa).
//
// Las actas las escribe Claude con acta_de_edicion (worker/lib/estudio/actasEdicion.js); aquí sólo se leen. La capa de
// acceso acota por dueño y, a un colaborador, por sus clientes.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import { estilosEdicionDe, guardarEstiloEdicion, quitarEstiloEdicion, ErrorEstiloEdicion } from "../lib/estudio/estilosEdicion.js";
import { PIEZAS_ESTILO_EDICION, TRANSICIONES_EDICION, TIPOS_ESTILO_EDICION, MAX_ESTILOS_EDICION } from "../../src/lib/estilosEdicion.js";
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

export async function rutasEdicion(req, env, { acceso, usuario, partes, metodo }) {
  const [, que, sub, id] = partes;
  if (que === "actas" && metodo === "GET") return json({ actas: await ultimasActas(acceso), kit: KIT_EDICION });

  if (que && sub === "estilos") {
    const cliente = await acceso.leerUno("clients", { id: que });
    if (!cliente) return noEncontrado("Cliente");
    const lista = (c) => json({ estilos: estilosEdicionDe(c), max: MAX_ESTILOS_EDICION, piezas: PIEZAS_ESTILO_EDICION, transiciones: TRANSICIONES_EDICION, tipos: TIPOS_ESTILO_EDICION });
    if (!id && metodo === "GET") return lista(cliente);
    try {
      if (!id && metodo === "PUT") {
        const b = await cuerpo(req);
        if (!b || typeof b !== "object" || Array.isArray(b)) return error("Falta el estilo.");
        await guardarEstiloEdicion(env, acceso, cliente, b);
      } else if (id && metodo === "DELETE") {
        await quitarEstiloEdicion(env, acceso, cliente, decodeURIComponent(id));
      } else return noEncontrado("Ruta");
    } catch (e) {
      if (e instanceof ErrorEstiloEdicion) return error(e.message, e.estado);
      throw e;
    }
    difundir(env, acceso.ownerId, { tipo: "estudio", clientId: cliente.id, por: firma(usuario, req) });
    return lista(await acceso.leerUno("clients", { id: cliente.id }));
  }
  return noEncontrado("Ruta");
}
