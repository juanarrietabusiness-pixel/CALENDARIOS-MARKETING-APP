// ============================================================
// /api/historias-auto — lo ya publicado vuelve como historia, una al día
//
//   GET    /api/historias-auto                     Los clientes con historias encendidas (para prepararlas)
//   GET    /api/historias-auto/<c>                 Interruptor, hora, redes, próxima y lo preparado
//   PUT    /api/historias-auto/<c>                 { activa, hora, redes }
//   GET    /api/historias-auto/<c>/pendientes      Lo publicado que aún no tiene su historia hecha
//   POST   /api/historias-auto/<c>/piezas          { filaId, src, frase }: la historia que hizo el navegador
//   DELETE /api/historias-auto/<c>/piezas/<id>     «Que no salga»: se queda apartada (no se vuelve a preparar)
//   POST   /api/historias-auto/<c>/piezas/<id>/volver  «Que vuelva a salir»
//
// Lo que hace cada día el cron, en worker/lib/historiasAuto.js.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import {
  ajustesHistorias, guardarAjustesHistorias, pendientesDePreparar, guardarPieza, excluirPieza, ErrorHistorias,
} from "../lib/historiasAuto.js";

const ID = /^[\w-]{1,80}$/;

export async function rutasHistoriasAuto(req, env, { acceso, partes, metodo }) {
  const [, clientId, que, id, accion] = partes;
  if (!clientId && metodo === "GET") {
    const filas = await acceso.leerColumnas("historias_auto", ["client_id"], { activa: 1 });
    return json({ clientes: filas.map((f) => f.client_id) });
  }
  if (!ID.test(String(clientId ?? ""))) return noEncontrado("Cliente");
  const cliente = await acceso.leerUno("clients", { id: clientId });
  if (!cliente) return noEncontrado("Cliente");
  try {
    if (!que && metodo === "GET") return json(await ajustesHistorias(acceso, clientId));
    if (!que && metodo === "PUT") return json(await guardarAjustesHistorias(acceso, clientId, (await cuerpo(req)) ?? {}));
    if (que === "pendientes" && metodo === "GET") return json({ pendientes: await pendientesDePreparar(acceso, clientId) });
    if (que === "piezas" && !id && metodo === "POST") {
      const pieza = await guardarPieza(env, acceso, clientId, (await cuerpo(req)) ?? {});
      return json({ id: pieza.id }, 201);
    }
    if (que === "piezas" && ID.test(String(id ?? "")) && !accion && metodo === "DELETE") {
      if (!(await excluirPieza(acceso, clientId, id, true))) return noEncontrado("Historia");
      return json(await ajustesHistorias(acceso, clientId));
    }
    if (que === "piezas" && ID.test(String(id ?? "")) && accion === "volver" && metodo === "POST") {
      if (!(await excluirPieza(acceso, clientId, id, false))) return noEncontrado("Historia");
      return json(await ajustesHistorias(acceso, clientId));
    }
  } catch (e) {
    if (e instanceof ErrorHistorias) return error(e.message, e.estado);
    throw e;
  }
  return noEncontrado("Ruta");
}
