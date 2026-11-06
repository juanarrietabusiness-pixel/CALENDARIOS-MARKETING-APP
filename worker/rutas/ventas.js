// ============================================================
// «Tus ventas de la semana» (curso de campañas, E.1)
//
// Con sesión (/api/ventas):
//   GET    /:cliente                 Las 8 últimas semanas, la pauta y las conversaciones de Meta, la tasa de cierre
//                                    medida, el ROAS real, desde cuándo no apunta y el testigo (si existe)
//   PUT    /:cliente/:semana         La agencia escribe o corrige una semana (origen «agencia»)
//   DELETE /:cliente/:semana         Quita lo apuntado de una semana (se escribió por error)
//   POST   /:cliente/enlace          El testigo del enlace del cliente: se crea UNA vez y se reutiliza siempre
//
// Sin sesión (/api/publico-ventas, en worker/index.js ANTES de la sesión, como el informe):
//   GET    /:testigo                 Lo que ve el cliente: su nombre, tres semanas y las conversaciones de cada una
//   POST   /:testigo                 El cliente guarda una semana (la actual o una de las dos anteriores)
//
// Lo de Meta y D1, en worker/lib/ventas.js; lo puro, en src/lib/ventasSemana.js.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { firma } from "../lib/vivo.js";
import {
  ErrorVentas, ventasDelCliente, escribirSemanaAgencia, borrarSemana, crearEnlaceDeVentas, ventasPublicas, guardarDelCliente,
} from "../lib/ventas.js";
import { enlaceDeVentas, lunesDe } from "../../src/lib/ventasSemana.js";

/** Lo que llega sin sesión: un error de quien lo escribe es un 400 con su motivo; lo demás, genérico. */
export async function rutaVentasPublica(req, env, { partes, metodo }) {
  const testigo = partes[1] ?? "";
  if (partes.length !== 2) return noEncontrado("Ruta");
  try {
    if (metodo === "GET") {
      const datos = await ventasPublicas(env, testigo);
      return datos ? json(datos) : noEncontrado("Enlace");
    }
    if (metodo === "POST") {
      const r = await guardarDelCliente(env, testigo, (await cuerpo(req)) ?? {});
      return r ? json({ ok: true, semana: r }) : noEncontrado("Enlace");
    }
    return error(`Método ${metodo} no permitido aquí`, 405);
  } catch (e) {
    if (e instanceof ErrorVentas && e.estado < 500) return error(e.message, e.estado);
    return error("No se pudo guardar. Vuelve a intentarlo en un momento.", 500, e);
  }
}

export async function rutasVentas(req, env, { acceso, usuario, partes, metodo }) {
  try {
    return await atender(req, env, { acceso, usuario, partes, metodo });
  } catch (e) {
    if (e instanceof ErrorVentas) return error(e.message, e.estado);
    throw e;
  }
}

async function atender(req, env, { acceso, usuario, partes, metodo }) {
  const [, clientId, sub] = partes;
  if (!clientId) return noEncontrado("Ruta");
  if (!(await acceso.leerUno("clients", { id: clientId }))) return noEncontrado("Cliente");

  if (!sub && metodo === "GET") return json(await ventasDelCliente(env, acceso, clientId));

  if (sub === "enlace" && partes.length === 3 && metodo === "POST") {
    const testigo = await crearEnlaceDeVentas(acceso, clientId);
    return json({ testigo, url: enlaceDeVentas(new URL(req.url).origin, testigo) });
  }

  if (sub && /^\d{4}-\d{2}-\d{2}$/.test(sub) && partes.length === 3) {
    if (lunesDe(sub) !== sub) return error("Una semana se nombra por su lunes.");
    if (metodo === "PUT") {
      const b = (await cuerpo(req)) ?? {};
      const semana = await escribirSemanaAgencia(env, acceso, { clientId, entrada: { ...b, semana: sub }, usuario, firma: firma(usuario, req) });
      return json({ semana });
    }
    if (metodo === "DELETE") return json(await borrarSemana(env, acceso, { clientId, semana: sub, firma: firma(usuario, req) }));
  }

  return noEncontrado("Ruta");
}
