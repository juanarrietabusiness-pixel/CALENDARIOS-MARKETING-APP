// ============================================================
// /api/manual-editor — el manual del editor de videos grabados (Ajustes → Manuales de la agencia → «Editor de video»)
//
//   GET    /api/manual-editor                  La versión vigente, qué partes cambió la casa y la lista de versiones
//   GET    /api/manual-editor/versiones/<n>    Las partes de una versión (para verla antes de volver a ella)
//   PUT    /api/manual-editor                  { version: la leída, partes, motivo? } → versión nueva, o 409 { actual }
//   POST   /api/manual-editor/volver           { a: n, version: la leída } → una versión NUEVA con las partes de la n
//
// Lo puro, en src/lib/manualEditor.js; lo que toca D1, en worker/lib/manualEditor.js. Leerlo es de cualquiera del
// espacio; cambiarlo, de quien administra y los editores que ven toda la agencia (no un colaborador), como las recetas.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import { estadoDelManual, versionDel, guardarVersion } from "../lib/manualEditor.js";

const choque = (c) => json({
  error: `Otra persona guardó el manual (versión ${c.version}) mientras lo editabas.`,
  actual: c,
}, 409);

export async function rutasManualEditor(req, env, { acceso, usuario, partes, metodo }) {
  const [, accion, numero] = partes;
  if (!accion && metodo === "GET") return json(await estadoDelManual(acceso));
  if (accion === "versiones" && numero && metodo === "GET") {
    const v = await versionDel(acceso, numero);
    return v ? json({ version: v.version, partes: v.partes, motivo: v.motivo, por: v.por, cuando: v.cuando }) : noEncontrado("Versión");
  }

  const escribe = (!accion && metodo === "PUT") || (accion === "volver" && metodo === "POST");
  if (!escribe) return noEncontrado("Ruta");
  const puede = usuario?.rol === "admin" || (usuario?.rol === "editor" && !Array.isArray(usuario?.clientes));
  if (!puede) return error("El manual del editor es de toda la agencia: lo cambia quien administra o un editor.", 403);

  const b = (await cuerpo(req)) ?? {};
  let r;
  if (accion === "volver") {
    const vieja = await versionDel(acceso, b.a);
    if (!vieja) return noEncontrado("Versión");
    r = await guardarVersion(acceso, { partes: vieja.partes, bases: vieja.bases, leida: b.version, motivo: `Vuelta a la versión ${vieja.version}`, usuario });
  } else {
    if (!b.partes || typeof b.partes !== "object" || Array.isArray(b.partes)) return error("Falta el manual («partes»).");
    r = await guardarVersion(acceso, { partes: b.partes, leida: b.version, motivo: b.motivo || "Editado a mano", usuario });
  }
  if (r.choque) return choque(r.choque);
  if (!r.sinCambios) difundir(env, acceso.ownerId, { tipo: "ajustes", por: firma(usuario, req) });
  return json(await estadoDelManual(acceso));
}
