// ============================================================
// /api/formulas-ugc — las fórmulas UGC de la agencia
//
//   GET    /api/formulas-ugc              Todas (las más nuevas primero)
//   POST   /api/formulas-ugc              { formula }: guardar una nueva
//   PUT    /api/formulas-ugc/<id>         { formula }: corregirla
//   DELETE /api/formulas-ugc/<id>         Quitarla
//   POST   /api/formulas-ugc/proponer     { original, fuente?, duracion?, clienteId? }: la IA ABSTRAE la fórmula de
//                                          la transcripción de un video (no guarda: la persona la revisa)
//
// Una fórmula es la receta de un video, sin su contenido (src/lib/formulasUgc.js). Es de la agencia, no de un
// cliente, así que la cambian quien administra y los editores, no un colaborador (como las plantillas de plan); verlas
// y usarlas, todos.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { uuid, ahora } from "../lib/ids.js";
import { difundir, firma } from "../lib/vivo.js";
import { llamarIA, ErrorIA } from "../lib/cerebro/ia.js";
import { limpiarFormula, pedidoDeFormula, leerFormula, MAX_FORMULAS } from "../../src/lib/formulasUgc.js";
import { leerTranscripcion } from "../../src/lib/ugc.js";

const ID = /^[\w-]{1,80}$/;

const deFila = (f) => {
  let d = {};
  try { d = JSON.parse(f.datos); } catch { /* fila rota: la limpieza la descarta */ }
  return limpiarFormula({ ...d, id: f.id }) ? { ...limpiarFormula({ ...d, id: f.id }), creada: f.created_at } : null;
};

async function lista(acceso) {
  return (await acceso.leer("formulas_ugc", {}, "created_at desc", MAX_FORMULAS)).map(deFila).filter(Boolean);
}

const puedeCambiar = (usuario) => usuario?.rol === "admin" || (usuario?.rol === "editor" && !Array.isArray(usuario?.clientes));

export async function rutasFormulasUgc(req, env, { acceso, usuario, partes, metodo }) {
  const [, id] = partes;
  if (!id && metodo === "GET") return json({ formulas: await lista(acceso) });

  // Proponer la usa cualquiera que escriba (es texto, no cambia nada de la agencia).
  if (id === "proponer" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    // La transcripción viene del navegador (el resultado de «Extraer guion»): se limpia como si la diera Gemini.
    const original = leerTranscripcion(JSON.stringify(b.original ?? {}));
    if (!original) return error("Falta el video transcrito.");
    const cliente = b.clienteId ? await acceso.leerUno("clients", { id: String(b.clienteId) }) : null;
    try {
      const r = await llamarIA(env, acceso, cliente, { prompt: pedidoDeFormula(original), salida: 1500, funcion: "fórmula UGC" });
      const formula = leerFormula(r.texto, { fuente: b.fuente ?? null, duracion: b.duracion ?? original.duracion });
      if (!formula) return error("La IA no devolvió una fórmula que se pueda leer. Inténtalo otra vez.", 502);
      return json({ formula, aviso: r.aviso ?? null });
    } catch (e) {
      if (e instanceof ErrorIA) return error(e.message, e.estado ?? 502);
      throw e;
    }
  }

  if (!puedeCambiar(usuario)) return error("Las fórmulas son de toda la agencia: las cambia quien administra o un editor.", 403);

  if (!id && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    const f = limpiarFormula(b.formula);
    if (!f) return error("A la fórmula le falta el nombre o al menos dos tramos.");
    if ((await acceso.leerColumnas("formulas_ugc", ["id"], {})).length >= MAX_FORMULAS) return error(`Como mucho ${MAX_FORMULAS} fórmulas: borra las que ya no sirvan.`, 409);
    const { id: _ignorado, ...datos } = f;
    const momento = ahora();
    const fila = await acceso.insertar("formulas_ugc", { id: uuid(), datos: JSON.stringify(datos), creada_por: usuario.id, created_at: momento, updated_at: momento });
    difundir(env, acceso.ownerId, { tipo: "formulas-ugc", por: firma(usuario, req) });
    return json({ formula: deFila(fila), formulas: await lista(acceso) }, 201);
  }

  if (!ID.test(String(id ?? ""))) return noEncontrado("Fórmula");

  if (metodo === "PUT") {
    const b = (await cuerpo(req)) ?? {};
    const f = limpiarFormula(b.formula);
    if (!f) return error("A la fórmula le falta el nombre o al menos dos tramos.");
    const { id: _ignorado, ...datos } = f;
    const n = await acceso.actualizar("formulas_ugc", { id }, { datos: JSON.stringify(datos), updated_at: ahora() });
    if (!n) return noEncontrado("Fórmula");
    difundir(env, acceso.ownerId, { tipo: "formulas-ugc", por: firma(usuario, req) });
    return json({ formulas: await lista(acceso) });
  }

  if (metodo === "DELETE") {
    const n = await acceso.borrar("formulas_ugc", { id });
    if (!n) return noEncontrado("Fórmula");
    difundir(env, acceso.ownerId, { tipo: "formulas-ugc", por: firma(usuario, req) });
    return json({ formulas: await lista(acceso) });
  }
  return noEncontrado("Ruta");
}
