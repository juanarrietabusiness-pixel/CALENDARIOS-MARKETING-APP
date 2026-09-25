// ============================================================
// Auditorías de perfil
//
//   GET    /api/auditorias               Todas las del espacio (sin el análisis)
//   GET    /api/auditorias/:id           Una entera
//   POST   /api/auditorias               { clientId?, usuario?, capturas?, nota? }
//   POST   /api/auditorias/:id/enlace    Compartir (testigo)
//   PATCH  /api/auditorias/:id/enlace    Dejar de compartir / volver
//   DELETE /api/auditorias/:id
//
// Y sin sesión, antes de ella en worker/index.js:
//   GET    /api/publico-auditoria/:testigo
// ============================================================

import { json, error, cuerpo, noEncontrado, sinContenido } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import { testigo as nuevoTestigo } from "../lib/ids.js";
import { generarAuditoria, ErrorAuditoria } from "../lib/auditorias.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };

const resumen = (f) => ({
  id: f.id, clientId: f.client_id ?? null, usuario: f.usuario, estado: f.estado, error: f.error ?? "",
  puntuacion: leerJSON(f.analisis, {}).puntuacion ?? null,
  compartido: f.compartido === 1, testigo: f.compartido === 1 ? f.testigo : null,
  creada: f.created_at, actualizada: f.updated_at,
});
const entera = (f) => ({ ...resumen(f), datos: leerJSON(f.datos, {}), analisis: leerJSON(f.analisis, {}) });

export async function rutasAuditorias(req, env, { acceso, usuario, partes, metodo }) {
  const [, id, sub] = partes;

  if (!id && metodo === "GET") {
    return json((await acceso.leer("auditorias", {}, "created_at desc")).map(resumen));
  }

  if (!id && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    if (!b.clientId && !b.usuario && !b.capturas?.length) return error("Falta el perfil: un cliente, un usuario de Instagram o capturas.");
    try {
      const fila = await generarAuditoria(env, acceso, {
        clientId: b.clientId ? String(b.clientId) : null, usuario: String(b.usuario ?? ""),
        capturas: b.capturas, nota: String(b.nota ?? ""), usuarioId: usuario.id,
      });
      return json(entera(fila), 201);
    } catch (e) {
      return error(e.message, e instanceof ErrorAuditoria ? 422 : 502);
    }
  }

  if (!id) return noEncontrado("Ruta");
  const fila = await acceso.leerUno("auditorias", { id });
  if (!fila) return noEncontrado("Auditoría");

  if (!sub && metodo === "GET") return json(entera(fila));

  if (!sub && metodo === "DELETE") {
    await acceso.borrar("auditorias", { id });
    difundir(env, acceso.ownerId, { tipo: "auditoria", id, estado: "borrada", por: firma(usuario, req) });
    return sinContenido();
  }

  // El testigo se reutiliza: regenerarlo mataría el enlace ya enviado.
  if (sub === "enlace" && metodo === "POST") {
    if (fila.estado !== "listo") return error("La auditoría todavía no está lista.", 409);
    const testigo = fila.testigo || nuevoTestigo(24);
    await acceso.actualizar("auditorias", { id }, { testigo, compartido: 1 });
    difundir(env, acceso.ownerId, { tipo: "auditoria", id, estado: fila.estado, por: firma(usuario, req) });
    return json({ testigo });
  }

  if (sub === "enlace" && metodo === "PATCH") {
    const { compartido } = (await cuerpo(req)) ?? {};
    await acceso.actualizar("auditorias", { id }, { compartido: compartido ? 1 : 0 });
    difundir(env, acceso.ownerId, { tipo: "auditoria", id, estado: fila.estado, por: firma(usuario, req) });
    return json({ compartido: Boolean(compartido) });
  }

  return noEncontrado("Ruta");
}
