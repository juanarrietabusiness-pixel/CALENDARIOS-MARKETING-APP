// ============================================================
// «Aprobar todas» del enlace del cliente, en UNA petición
//
// Antes la página del cliente mandaba una aprobación por publicación, en serie, y decía «Aprobamos todas» aunque fallara
// una a la mitad. Ahora el servidor las guarda todas de una vez (`enviarAprobaciones`, un lote de D1: todas o ninguna) y
// después hace lo mismo que una aprobación suelta —la cola si el cliente tiene «Programar al aprobar» (en UN lote del
// servidor), el cerebro— y deja UN aviso en la campana (equipo.js, agrupado por mes), no uno por publicación.
// Lo que va después de responder va en segundo plano (`ctx.waitUntil`): nunca tumba la respuesta del cliente.
// ============================================================

import { crearAcceso } from "./acceso.js";
import { difundir } from "./vivo.js";
import { enviarAprobaciones } from "./publico.js";
import { avisarRespuestaCliente } from "./equipo.js";
import { programarAlAprobarVarias, avanzarMientras } from "./programarServidor.js";
import { registrarRespuesta } from "./cerebro/aprender.js";

/** → { ok, aprobadas: n, fecha }. Lanza los errores de `enviarAprobaciones` (el enlace los traduce a 400). */
export async function aprobarTodas(env, ctx, { token, postIds, revisor = "" }) {
  const r = await enviarAprobaciones(env.DB, { token, postIds, revisor });
  difundir(env, r.ownerId, {
    tipo: "aprobacion", calId: r.calendarId, postId: null, estado: "aprobado",
    por: { userId: "cliente", nombre: revisor || "El cliente", color: "#F5A623" },
  });
  const acceso = crearAcceso(env.DB, r.ownerId);
  const despues = (async () => {
    await avisarRespuestaCliente(env, acceso, { calendarId: r.calendarId, postIds: r.aprobadas.map((a) => a.postId), estado: "aprobado", revisor, fecha: r.fecha });
    // «Programar al aprobar»: las piezas aprobadas van a un lote del servidor (programarServidor.js). Preparar 25 en el
    // Container no cabe en lo que dura esta respuesta; se avanza lo que quepa y el resto lo lleva la bomba del espacio.
    try {
      const lote = await programarAlAprobarVarias(env, acceso, { calendarId: r.calendarId, postIds: r.aprobadas.map((a) => a.postId) });
      if (lote) await avanzarMientras(env, acceso, lote.id, 15_000);
    } catch (e) { console.error("cola al aprobar todas:", e); }
    if (r.clientId) {
      for (const a of r.aprobadas.filter((x) => x.publicacion)) {
        await registrarRespuesta(env, acceso, {
          clientId: r.clientId, calendarId: r.calendarId, postId: a.postId, publicacion: a.publicacion, estado: "aprobado",
          revisor, fecha: r.fecha.slice(0, 10),
        }).catch((e) => console.error("cerebro al aprobar todas:", e));
      }
    }
  })();
  if (ctx?.waitUntil) ctx.waitUntil(despues.catch((e) => console.error("después de aprobar todas:", e)));
  else await despues.catch(() => {});
  return { ok: true, aprobadas: r.aprobadas.length, fecha: r.fecha };
}
