// ============================================================
// /api/inspiracion — lo que publican las cuentas que sigue cada cliente
//
//   GET  /<cliente>              El feed guardado: sus cuentas con su estado y lo que publican
//   POST /<cliente>/actualizar   { cuentas?: ["red:usuario"] }: leerlas otra vez (todas si no se dice) → el feed
//   POST /<cliente>/traer        { id, miniatura? }: el archivo de una publicación a la galería («Competencia»);
//                                con `miniatura`, la de un reel con música (Meta no da su video)
//   POST /<cliente>/resumen      La IA PROPONE «Lo que funciona en tu competencia» (no guarda; se guarda con
//                                PUT /api/cerebro/<cliente>/nota)
//
// Las cuentas se cambian con la ficha del cliente (`competidores`). El
// cliente tiene que ser de este espacio (y, si es un colaborador, de los
// suyos): uno ajeno da «no encontrado». Lo que no es GET lo corta la puerta
// para quien es de sólo lectura.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { ErrorIA } from "../lib/cerebro/ia.js";
import { ErrorCompetencia } from "../lib/competencia.js";
import { feedDe, actualizarInspiracion, traerDeInspiracion, proponerResumen, ErrorInspiracion } from "../lib/inspiracion.js";

const ID = /^[\w-]{1,80}$/;
const CLAVE = /^(instagram|youtube|tiktok):[\w.-]{1,40}$/;

function fallo(e) {
  if (e instanceof ErrorInspiracion || e instanceof ErrorCompetencia || e instanceof ErrorIA) {
    return json({ error: e.message, ...(e.codigo ? { codigo: e.codigo } : {}) }, e.estado ?? 400);
  }
  throw e;
}

export async function rutasInspiracion(req, env, { acceso, partes, metodo }) {
  const [, clienteId, a] = partes;
  if (!ID.test(String(clienteId ?? ""))) return noEncontrado("Cliente");
  const cliente = await acceso.leerUno("clients", { id: clienteId });
  if (!cliente) return noEncontrado("Cliente");

  try {
    if (!a && metodo === "GET") return json(await feedDe(acceso, cliente));

    if (a === "actualizar" && metodo === "POST") {
      const d = (await cuerpo(req)) ?? {};
      const solo = Array.isArray(d.cuentas) ? d.cuentas.map(String).filter((c) => CLAVE.test(c)).slice(0, 10) : null;
      const r = await actualizarInspiracion(env, acceso, cliente, { solo: solo?.length ? solo : null });
      return json({ ...(await feedDe(acceso, cliente)), errores: r.errores, avisos: r.avisos });
    }

    if (a === "traer" && metodo === "POST") {
      const d = (await cuerpo(req)) ?? {};
      const id = String(d.id ?? "");
      if (!id || id.length > 200) return error("Falta la publicación.");
      return json(await traerDeInspiracion(env, acceso, cliente, id, { miniatura: d.miniatura === true }), 201);
    }

    if (a === "resumen" && metodo === "POST") return json(await proponerResumen(env, acceso, cliente));
  } catch (e) {
    return fallo(e);
  }
  return noEncontrado("Ruta");
}
