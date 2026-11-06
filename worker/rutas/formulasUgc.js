// ============================================================
// /api/formulas-ugc — las ESTRUCTURAS DE GUION de la agencia (antes «fórmulas UGC»)
//
//   GET    /api/formulas-ugc?para=ugc|voz Todas (las más nuevas primero); con `para`, sólo las que sirven para eso
//   POST   /api/formulas-ugc              { formula }: guardar una nueva (con su `para`: ["ugc"], ["voz"] o los dos)
//   PUT    /api/formulas-ugc/<id>         { formula }: corregirla
//   DELETE /api/formulas-ugc/<id>         Quitarla
//   POST   /api/formulas-ugc/proponer     { original, fuente?, duracion?, clienteId? }: la IA ABSTRAE la estructura de
//                                          la transcripción de un video (UGC); o { voz: { titulo?, duracion, tramos },
//                                          clienteId? }: de una VOZ EN OFF que salió bien (para la voz en off). No
//                                          guarda: la persona la revisa
//
// /api/estructuras-guion es la MISMA ruta con su nombre de la pantalla (worker/index.js las manda aquí a las dos).
//
// Una estructura es la receta de un guion, sin su contenido (src/lib/formulasUgc.js). Es de la agencia, no de un
// cliente, así que la cambian quien administra y los editores, no un colaborador (como las plantillas de plan); verlas
// y usarlas, todos.
// ============================================================

import { json, error, cuerpo, noEncontrado } from "../lib/respuesta.js";
import { difundir, firma } from "../lib/vivo.js";
import { llamarIA, ErrorIA } from "../lib/cerebro/ia.js";
import { pedidoDeFormula, leerFormula, limpiarGuionVoz, pedidoDeEstructuraVoz } from "../../src/lib/formulasUgc.js";
import { leerTranscripcion } from "../../src/lib/ugc.js";
import { leerEstructuras, guardarEstructura, quitarEstructura, puedeCambiarEstructuras, ErrorEstructura } from "../lib/estructurasGuion.js";

const ID = /^[\w-]{1,80}$/;

const lista = (acceso, para = "") => leerEstructuras(acceso, { para });

/** La IA propone; un fallo de la IA se devuelve con su motivo. */
async function proponer(env, acceso, cliente, { prompt, funcion, leer }) {
  try {
    const r = await llamarIA(env, acceso, cliente, { prompt, salida: 1500, funcion });
    const formula = leer(r.texto);
    if (!formula) return error("La IA no devolvió una estructura que se pueda leer. Inténtalo otra vez.", 502);
    return json({ formula, aviso: r.aviso ?? null });
  } catch (e) {
    if (e instanceof ErrorIA) return error(e.message, e.estado ?? 502);
    throw e;
  }
}

export async function rutasFormulasUgc(req, env, { acceso, usuario, partes, metodo }) {
  const [, id] = partes;
  if (!id && metodo === "GET") {
    const para = new URL(req.url).searchParams.get("para") ?? "";
    return json({ formulas: await lista(acceso, ["ugc", "voz"].includes(para) ? para : "") });
  }

  // Proponer la usa cualquiera que escriba (es texto, no cambia nada de la agencia).
  if (id === "proponer" && metodo === "POST") {
    const b = (await cuerpo(req)) ?? {};
    const cliente = b.clienteId ? await acceso.leerUno("clients", { id: String(b.clienteId) }) : null;
    // De una VOZ EN OFF (el video animado, el reel): sus tramos con lo que dice cada uno. Sirve para la voz en off.
    if (b.voz) {
      const voz = limpiarGuionVoz(b.voz);
      if (!voz) return error("Hace falta un guion con voz en al menos dos tramos.");
      return proponer(env, acceso, cliente, {
        prompt: pedidoDeEstructuraVoz(voz), funcion: "fórmula UGC",
        leer: (texto) => leerFormula(texto, { duracion: voz.duracion, para: ["voz"] }),
      });
    }
    // La transcripción viene del navegador (el resultado de «Extraer guion»): se limpia como si la diera Gemini.
    const original = leerTranscripcion(JSON.stringify(b.original ?? {}));
    if (!original) return error("Falta el video transcrito.");
    return proponer(env, acceso, cliente, {
      prompt: pedidoDeFormula(original), funcion: "fórmula UGC",
      leer: (texto) => leerFormula(texto, { fuente: b.fuente ?? null, duracion: b.duracion ?? original.duracion }),
    });
  }

  if (!puedeCambiarEstructuras(usuario)) return error("Las estructuras de guion son de toda la agencia: las cambia quien administra o un editor.", 403);
  // Guardar y quitar van por las MISMAS funciones que usa Claude por MCP (worker/lib/estructurasGuion.js).
  const conErrores = async (f) => {
    try { return await f(); } catch (e) {
      if (e instanceof ErrorEstructura) return e.estado === 404 ? noEncontrado("Estructura") : error(e.message, e.estado);
      throw e;
    }
  };
  const avisar = () => difundir(env, acceso.ownerId, { tipo: "formulas-ugc", por: firma(usuario, req) });

  if (!id && metodo === "POST") {
    return conErrores(async () => {
      const b = (await cuerpo(req)) ?? {};
      const formula = await guardarEstructura(acceso, usuario, b.formula);
      avisar();
      return json({ formula, formulas: await lista(acceso) }, 201);
    });
  }

  if (!ID.test(String(id ?? ""))) return noEncontrado("Estructura");

  if (metodo === "PUT") {
    return conErrores(async () => {
      const b = (await cuerpo(req)) ?? {};
      await guardarEstructura(acceso, usuario, b.formula, { id });
      avisar();
      return json({ formulas: await lista(acceso) });
    });
  }

  if (metodo === "DELETE") {
    return conErrores(async () => {
      await quitarEstructura(acceso, usuario, id);
      avisar();
      return json({ formulas: await lista(acceso) });
    });
  }
  return noEncontrado("Ruta");
}
