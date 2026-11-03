// ============================================================
// Informes mensuales
//
//   GET    /api/informes?cliente=:id     Los de un cliente (sin el contenido)
//   GET    /api/informes/:id             Uno entero
//   GET    /api/informes/redes?cliente=  Las redes conectadas del cliente y las que entran ({ conectadas, seleccion })
//   POST   /api/informes                 Generar o regenerar { clientId, mes, redes?, anuncios?, recordar? }
//   POST   /api/informes/:id/enlace      Compartir con el cliente (testigo)
//   PATCH  /api/informes/:id/enlace      Dejar de compartir / volver
//   DELETE /api/informes/:id
//
// Y sin sesión, antes de ella en worker/index.js:
//   GET    /api/publico-informe/:testigo
// ============================================================

import { json, error, cuerpo, noEncontrado, sinContenido } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import { testigo as nuevoTestigo } from "../lib/ids.js";
import { generarInforme } from "../lib/informes.js";
import { limpiarSeleccion } from "../../src/lib/informeRedes.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };

const resumen = (f) => ({
  id: f.id, clientId: f.client_id, mes: f.mes, estado: f.estado, error: f.error ?? "",
  compartido: f.compartido === 1, testigo: f.compartido === 1 ? f.testigo : null,
  automatico: f.automatico === 1, actualizado: f.updated_at,
});

export async function rutasInformes(req, env, { acceso, usuario, partes, metodo }) {
  const [, id, sub] = partes;
  const url = new URL(req.url);

  if (!id && metodo === "GET") {
    const cliente = url.searchParams.get("cliente");
    if (!cliente) return error("Falta el cliente");
    return json((await acceso.leer("informes", { client_id: cliente }, "mes desc")).map(resumen));
  }

  // Qué redes tiene conectadas el cliente y cuáles entran en su informe (lo recordado; sin nada, todas).
  if (id === "redes" && metodo === "GET") {
    const cliente = await acceso.leerUno("clients", { id: url.searchParams.get("cliente") ?? "" });
    if (!cliente) return noEncontrado("Cliente");
    const cuentas = await acceso.leer("cuentas_sociales", { client_id: cliente.id });
    return json({
      conectadas: [...new Set(cuentas.map((c) => c.red))],
      anuncios: Boolean(await acceso.leerUno("cuentas_anuncios", { client_id: cliente.id })),
      seleccion: limpiarSeleccion(cliente.informe_redes),
    });
  }

  if (!id && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    const { clientId, mes } = b;
    if (!clientId || !/^\d{4}-\d{2}$/.test(String(mes ?? ""))) return error("Falta el cliente o el mes");
    if (!(await acceso.leerUno("clients", { id: clientId }))) return noEncontrado("Cliente");
    // Las redes que entran: las que mande la pantalla; si no manda ninguna, lo recordado del cliente.
    const seleccion = "redes" in b || "anuncios" in b ? limpiarSeleccion({ redes: b.redes, anuncios: b.anuncios }) : null;
    // «Recordar para este cliente»: también la usa el informe automático del día 1.
    if (seleccion && b.recordar) await acceso.actualizar("clients", { id: clientId }, { informe_redes: JSON.stringify(seleccion) });
    try {
      const fila = await generarInforme(env, acceso, { clientId, mes, usuarioId: usuario.id, seleccion });
      return json({ ...resumen(fila), contenido: leerJSON(fila.contenido, {}) }, 201);
    } catch (e) {
      return error(e.message, 502);
    }
  }

  if (!id) return noEncontrado("Ruta");
  const fila = await acceso.leerUno("informes", { id });
  if (!fila) return noEncontrado("Informe");

  if (!sub && metodo === "GET") return json({ ...resumen(fila), contenido: leerJSON(fila.contenido, {}) });

  if (!sub && metodo === "DELETE") {
    await acceso.borrar("informes", { id });
    difundir(env, acceso.ownerId, { tipo: "informe", clientId: fila.client_id, mes: fila.mes, estado: "borrado", por: firma(usuario, req) });
    return sinContenido();
  }

  // El testigo se reutiliza, igual que el del calendario: regenerarlo
  // mataría el enlace que el cliente ya tiene en su correo.
  if (sub === "enlace" && metodo === "POST") {
    if (fila.estado !== "listo") return error("El informe todavía no está listo.", 409);
    const testigo = fila.testigo || nuevoTestigo(24);
    await acceso.actualizar("informes", { id }, { testigo, compartido: 1 });
    difundir(env, acceso.ownerId, { tipo: "informe", clientId: fila.client_id, mes: fila.mes, estado: fila.estado, por: firma(usuario, req) });
    return json({ testigo });
  }

  if (sub === "enlace" && metodo === "PATCH") {
    const { compartido } = (await cuerpo(req)) ?? {};
    await acceso.actualizar("informes", { id }, { compartido: compartido ? 1 : 0 });
    difundir(env, acceso.ownerId, { tipo: "informe", clientId: fila.client_id, mes: fila.mes, estado: fila.estado, por: firma(usuario, req) });
    return json({ compartido: Boolean(compartido) });
  }

  return noEncontrado("Ruta");
}
