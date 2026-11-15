// ============================================================
// /api/salud — Ajustes → Salud (sólo el administrador)
//
//   GET          Las tareas del cron, los proveedores del servidor y las integraciones de este espacio: último éxito,
//                último error con su texto y si se está saltando (worker/lib/salud.js, `estadoDeSalud`)
//   GET saldos   Los saldos que se pueden leer GRATIS (Kie y ElevenLabs), recordados 5 minutos (`?otraVez=1` los relee)
//
// Sólo el administrador: los textos de error del cron y de los proveedores son del servidor entero, y es quien puede
// recargar un saldo o reconectar una cuenta.
// ============================================================

import { json, error, noEncontrado } from "../lib/respuesta.js";
import { estadoDeSalud, saldosDeProveedores } from "../lib/salud.js";

export async function rutasSalud(req, env, { acceso, usuario, partes, metodo }) {
  if (usuario?.rol !== "admin") return error("La salud del sistema la ve el administrador.", 403);
  if (!partes[1] && metodo === "GET") return json(await estadoDeSalud(env, acceso));
  if (partes[1] === "saldos" && metodo === "GET") {
    const otraVez = new URL(req.url).searchParams.get("otraVez") === "1";
    return json({ saldos: await saldosDeProveedores(env, { otraVez }) });
  }
  return noEncontrado("Ruta");
}
