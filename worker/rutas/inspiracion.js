// ============================================================
// /api/inspiracion — lo que publican las cuentas que sigue cada cliente
//
//   GET  /<cliente>              El feed guardado: sus cuentas con su estado y lo que publican
//   POST /<cliente>/actualizar   { cuentas?: ["red:usuario"] }: leerlas otra vez (todas si no se dice) → el feed.
//                                Las de TikTok van por Scrape Creators y sólo la que lleva una semana sin leerse:
//                                sin `cuentas` («Actualizar» a mano) cuentan como gasto a mano y no se bloquean (se
//                                avisa si se pasa del tope); con `cuentas` (la primera lectura de las recién
//                                añadidas), sólo si caben en el tope de la semana
//   PUT  /<cliente>/tendencias   { palabras: [] }: las palabras o #hashtags de las tendencias de TikTok del cliente
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
import { guardarTendencias } from "../lib/tendencias.js";
import { scConfigurado, creditosDeLaSemana } from "../lib/scrapeCreators.js";

const ID = /^[\w-]{1,80}$/;
const CLAVE = /^(instagram|youtube|tiktok):[\w.-]{1,40}$/;

function fallo(e) {
  if (e instanceof ErrorInspiracion || e instanceof ErrorCompetencia || e instanceof ErrorIA) {
    return json({ error: e.message, ...(e.codigo ? { codigo: e.codigo } : {}) }, e.estado ?? 400);
  }
  throw e;
}

/** Lo que se le dice a quien pulsó «Actualizar» de los créditos de Scrape Creators que gastó TikTok ("" si nada). */
async function avisoDeCreditos(acceso, r) {
  const partes = [];
  if (r.creditos) {
    const c = await creditosDeLaSemana(acceso);
    partes.push(`TikTok gastó ${r.creditos} ${r.creditos === 1 ? "crédito" : "créditos"} de Scrape Creators: esta semana van ${c.total} de ${c.tope}${c.total > c.tope ? " (se pasó del tope: lo de a mano no se bloquea, pero lo automático espera al lunes)" : ""}.`);
  }
  if (r.esperan) partes.push(`${r.esperan === 1 ? "Una cuenta de TikTok espera" : `${r.esperan} cuentas de TikTok esperan`} a que haya créditos en el tope de la semana.`);
  return partes.join(" ");
}

export async function rutasInspiracion(req, env, { acceso, partes, metodo }) {
  const [, clienteId, a] = partes;
  if (!ID.test(String(clienteId ?? ""))) return noEncontrado("Cliente");
  const cliente = await acceso.leerUno("clients", { id: clienteId });
  if (!cliente) return noEncontrado("Cliente");

  try {
    const sc = scConfigurado(env);
    if (!a && metodo === "GET") return json(await feedDe(acceso, cliente, { sc }));

    if (a === "actualizar" && metodo === "POST") {
      const d = (await cuerpo(req)) ?? {};
      const solo = Array.isArray(d.cuentas) ? d.cuentas.map(String).filter((c) => CLAVE.test(c)).slice(0, 10) : null;
      const r = await actualizarInspiracion(env, acceso, cliente, { solo: solo?.length ? solo : null, tiktok: solo?.length ? "auto" : "manual" });
      return json({ ...(await feedDe(acceso, cliente, { sc })), errores: r.errores, avisos: r.avisos, creditos: r.creditos, avisoSC: await avisoDeCreditos(acceso, r) });
    }

    if (a === "tendencias" && metodo === "PUT") {
      const d = (await cuerpo(req)) ?? {};
      if (!Array.isArray(d.palabras)) return error("Faltan las palabras.");
      return json(await guardarTendencias(env, acceso, cliente, d.palabras.map(String).slice(0, 20)));
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
