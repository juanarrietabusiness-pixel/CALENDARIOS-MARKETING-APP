// ============================================================
// Auditorías de perfil
//
//   GET    /api/auditorias               Todas las del espacio (sin el análisis)
//   GET    /api/auditorias/:id           Una entera
//   POST   /api/auditorias               { clientId?, usuario?, capturas?, nota?, referentes? }
//   POST   /api/auditorias/:id/enlace    Compartir (testigo)
//   PATCH  /api/auditorias/:id/enlace    Dejar de compartir / volver
//   DELETE /api/auditorias/:id
//   PATCH  /api/auditorias/:id/aplicado   { k, hecho }: un cambio de «Aplicar en el perfil», hecho o no
//   POST   /api/auditorias/:id/comprobar  Relee el perfil y marca lo que ya se ve hecho
//   POST   /api/auditorias/:id/optimizado { si }: el perfil, dado por optimizado (o ya no)
//
// Y sin sesión, antes de ella en worker/index.js:
//   GET    /api/publico-auditoria/:testigo
// ============================================================

import { json, error, cuerpo, noEncontrado, sinContenido } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import { testigo as nuevoTestigo } from "../lib/ids.js";
import { generarAuditoria, leerPerfil, ErrorAuditoria } from "../lib/auditorias.js";
import { itemsParaAplicar, limpiarAplicado, comprobarEnPerfil } from "../../src/lib/auditoria.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };

const resumen = (f) => ({
  id: f.id, clientId: f.client_id ?? null, usuario: f.usuario, estado: f.estado, error: f.error ?? "",
  puntuacion: leerJSON(f.analisis, {}).puntuacion ?? null,
  compartido: f.compartido === 1, testigo: f.compartido === 1 ? f.testigo : null,
  optimizado: f.optimizado_at ?? null,
  creada: f.created_at, actualizada: f.updated_at,
});
const entera = (f) => ({ ...resumen(f), datos: leerJSON(f.datos, {}), analisis: leerJSON(f.analisis, {}), aplicado: limpiarAplicado(f.aplicado) });

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
        referentes: Array.isArray(b.referentes) ? b.referentes.map(String) : String(b.referentes ?? ""),
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

  // ---- «Aplicar en el perfil» ----
  const claves = () => itemsParaAplicar(leerJSON(fila.analisis, {}), leerJSON(fila.datos, {}).perfil).map((x) => x.k);
  const guardarAplicado = async (aplicado, extra = {}) => {
    await acceso.actualizar("auditorias", { id }, { aplicado: JSON.stringify(aplicado), ...extra });
    difundir(env, acceso.ownerId, { tipo: "auditoria", id, estado: fila.estado, por: firma(usuario, req) });
    return entera(await acceso.leerUno("auditorias", { id }));
  };

  if (sub === "aplicado" && metodo === "PATCH") {
    const { k, hecho } = (await cuerpo(req)) ?? {};
    if (!claves().includes(k)) return error("Ese cambio no está en la auditoría.");
    const aplicado = limpiarAplicado(fila.aplicado);
    aplicado[k] = { hecho: hecho === true, por: usuario?.nombre ?? "", at: new Date().toISOString(), auto: false };
    return json(await guardarAplicado(aplicado));
  }

  if (sub === "comprobar" && metodo === "POST") {
    if (fila.estado !== "listo") return error("La auditoría todavía no está lista.", 409);
    let ahora;
    try {
      ahora = await leerPerfil(env, acceso, { clientId: fila.client_id, usuario: fila.usuario });
    } catch (e) {
      return error(e.message, e instanceof ErrorAuditoria ? 422 : 502);
    }
    const { hechas, avisos } = comprobarEnPerfil(leerJSON(fila.analisis, {}), leerJSON(fila.datos, {}).perfil ?? {}, ahora);
    const pedidas = claves();
    const aplicado = limpiarAplicado(fila.aplicado);
    const nuevas = hechas.filter((k) => pedidas.includes(k) && !aplicado[k]?.hecho);
    // Sólo SUMA: lo que una persona marcó no lo desmarca una lectura.
    for (const k of nuevas) aplicado[k] = { hecho: true, por: "Comprobado en Instagram", at: new Date().toISOString(), auto: true };
    const auditoria = nuevas.length ? await guardarAplicado(aplicado) : entera(fila);
    return json({ auditoria, nuevas, avisos });
  }

  if (sub === "optimizado" && metodo === "POST") {
    const { si } = (await cuerpo(req)) ?? {};
    return json(await guardarAplicado(limpiarAplicado(fila.aplicado), { optimizado_at: si ? new Date().toISOString() : null }));
  }

  if (sub === "enlace" && metodo === "PATCH") {
    const { compartido } = (await cuerpo(req)) ?? {};
    await acceso.actualizar("auditorias", { id }, { compartido: compartido ? 1 : 0 });
    difundir(env, acceso.ownerId, { tipo: "auditoria", id, estado: fila.estado, por: firma(usuario, req) });
    return json({ compartido: Boolean(compartido) });
  }

  return noEncontrado("Ruta");
}
