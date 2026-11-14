// ============================================================
// «Lenguaje del cliente»: las frases EXACTAS de sus clientes, como nota del cerebro
//
// Lo que escriben los clientes de un cliente —reseñas que pega la persona (y
// las de 1 estrella de la COMPETENCIA, marcadas como tal), los comentarios de
// otras personas guardados en la Bandeja y las respuestas de la encuesta «La
// voz de tus clientes»— lo agrupa la IA por tema (dolor, duda, deseo, elogio,
// lo que odian de otras opciones). Lo demás lo hace el CÓDIGO
// (src/lib/lenguajeCliente.js): comprueba que cada frase esté tal cual en el
// material (la que no, se descarta y se cuenta), cuenta cuántos comentarios la
// dicen y cambia los nombres de la competencia por «otra marca». Como «Saber
// del rubro»: PROPONE y no guarda; la persona la revisa en el editor de notas y
// la guarda con la ruta fija (`RUTA_LENGUAJE`), que es la que lee el motor de
// ideas. La nota de ahora entra también como material: lo que sigue valiendo
// no se pierde al proponerla otra vez.
// ============================================================

import { llamarIA, ErrorIA } from "./ia.js";
import { respuestaDeFila, PREGUNTAS_VOZ } from "../../../src/lib/vozCliente.js";
import {
  RUTA_LENGUAJE, TITULO_LENGUAJE, fragmentosDeLenguaje, cuentaDeFuentes, pedidoDeLenguaje, leerLenguaje, notaDeLenguaje,
  marcasDeTexto, MAX_MATERIAL_LENGUAJE,
} from "../../../src/lib/lenguajeCliente.js";

/** Cuántos comentarios de la Bandeja y cuántas respuestas de la encuesta se leen, como mucho (los más nuevos). */
export const MAX_BANDEJA_LENGUAJE = 150;
export const MAX_ENCUESTA_LENGUAJE = 80;

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const PREGUNTA = Object.fromEntries(PREGUNTAS_VOZ.map((p) => [p.id, p.pregunta]));

/** Los nombres de la competencia que tiene el estudio de mercado (el aprobado y el borrador), leídos a mano. */
async function competidoresDelEstudio(acceso, clienteId) {
  const f = await acceso.leerUno("mercado_clientes", { client_id: clienteId }).catch(() => null);
  const nombres = [];
  for (const e of [leerJSON(f?.estudio, null), leerJSON(f?.borrador, null)]) {
    for (const c of Array.isArray(e?.general?.competidores) ? e.general.competidores : []) if (c?.nombre) nombres.push(String(c.nombre));
  }
  return nombres;
}

/**
 * La IA PROPONE la nota (no guarda). `texto`: reseñas o comentarios de sus clientes; `competencia`: reseñas de clientes
 * de otras marcas; `marcas`: nombres de la competencia que hay que ocultar (además de los del estudio).
 * → { titulo, texto, existente: { id } | null, fuentes, frases, descartadas, aviso }.
 */
export async function proponerLenguaje(env, acceso, cliente, { texto = "", competencia = "", marcas = "" } = {}) {
  const actual = await acceso.leerUno("cerebro_notas", { client_id: cliente.id, ruta: RUTA_LENGUAJE }).catch(() => null);
  const [bandeja, encuesta, delEstudio] = await Promise.all([
    // Sólo lo que escribieron otras personas: lo de la propia página (sus respuestas) no es voz del cliente.
    acceso.leerColumnas("bandeja_comentarios", ["texto"], { client_id: cliente.id, propio: 0 }, "creado_at desc", MAX_BANDEJA_LENGUAJE).catch(() => []),
    acceso.leer("voz_cliente", { client_id: cliente.id }, "created_at desc", MAX_ENCUESTA_LENGUAJE).catch(() => []),
    competidoresDelEstudio(acceso, cliente.id),
  ]);
  const respuestas = encuesta.map(respuestaDeFila).filter(Boolean)
    .flatMap((r) => Object.entries(r.respuestas).map(([id, t]) => ({ texto: t, etiqueta: PREGUNTA[id] ?? "" })));
  const fragmentos = fragmentosDeLenguaje({
    pegado: String(texto ?? "").slice(0, MAX_MATERIAL_LENGUAJE),
    competencia: String(competencia ?? "").slice(0, MAX_MATERIAL_LENGUAJE),
    nota: actual && !actual.interna ? actual.texto : "",
    encuesta: respuestas,
    bandeja: bandeja.map((b) => b.texto),
  });
  const fuentes = cuentaDeFuentes(fragmentos);
  if (!fragmentos.some((f) => f.fuente !== "nota")) {
    throw new ErrorIA("No hay qué leer: pega reseñas o comentarios de sus clientes, o espera a que lleguen comentarios a la Bandeja o respuestas a la encuesta «La voz de tus clientes».", 409);
  }
  const ocultas = [...new Set([...delEstudio, ...marcasDeTexto(marcas, { propia: cliente.name })])]
    .filter((m) => m.trim().toLowerCase() !== String(cliente.name ?? "").trim().toLowerCase());

  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeLenguaje({ marca: cliente.name ?? "", fragmentos }),
    salida: 3000,
    funcion: "lenguaje del cliente",
  });
  const resultado = leerLenguaje(r.texto, { fragmentos, marcas: ocultas });
  if (!resultado) throw new ErrorIA("La IA no devolvió la nota con el formato esperado. Inténtalo otra vez.", 502);
  if (!resultado.frases) {
    throw new ErrorIA(`Ninguna de las frases que propuso la IA estaba tal cual en los comentarios (se descartaron ${resultado.descartadas}). Inténtalo otra vez.`, 502);
  }
  return {
    titulo: TITULO_LENGUAJE,
    texto: notaDeLenguaje(resultado, { marca: cliente.name ?? "", fecha: new Date() }),
    existente: actual ? { id: actual.id } : null,
    fuentes: { ...fuentes, personas: encuesta.length },
    frases: resultado.frases,
    descartadas: resultado.descartadas,
    aviso: r.aviso ?? null,
  };
}
