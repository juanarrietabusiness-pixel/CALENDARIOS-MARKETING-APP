// ============================================================
// /api/avisos — la bandeja de cada persona
//
//   GET                       Los últimos avisos de quien pregunta y cuántos sin leer
//   POST /leer { ids | todos } Marcarlos como leídos
//
// Siempre los de QUIEN PREGUNTA (`user_id` de la sesión), dentro de su
// espacio (la capa de acceso): nunca los de otra persona del equipo.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { ahora } from "../lib/ids.js";
import { difundir } from "../lib/vivo.js";

const CUANTOS = 60;

export async function rutasAvisos(req, env, { acceso, usuario, partes, metodo }) {
  const sub = partes[1];

  if (!sub && metodo === "GET") {
    const filas = await acceso.leer("avisos", { user_id: usuario.id }, "created_at desc", CUANTOS);
    return json({
      avisos: filas.map((a) => ({
        id: a.id, tipo: a.tipo, texto: a.texto, enlace: a.enlace, por: a.por_nombre, leido: Boolean(a.leido_at), fecha: a.created_at,
      })),
      sinLeer: filas.filter((a) => !a.leido_at).length,
    });
  }

  if (sub === "leer" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    const t = ahora();
    if (b.todos) {
      await acceso.actualizar("avisos", { user_id: usuario.id }, { leido_at: t });
    } else if (Array.isArray(b.ids) && b.ids.length) {
      for (const id of b.ids.slice(0, CUANTOS)) await acceso.actualizar("avisos", { user_id: usuario.id, id: String(id) }, { leido_at: t });
    } else {
      return error("Faltan los avisos");
    }
    // Sus otras pestañas (el móvil) bajan el número también.
    difundir(env, acceso.ownerId, { tipo: "avisos", para: [usuario.id] });
    return json({ ok: true });
  }

  return noEncontrado("Ruta");
}
