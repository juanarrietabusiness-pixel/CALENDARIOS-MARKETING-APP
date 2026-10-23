// ============================================================
// «Saber del rubro»: lo que un experto del rubro sabe, como nota del cerebro
//
// El contenido EDUCATIVO no tenía de dónde salir: la ficha y el catálogo
// hablan de la marca, no del rubro. La IA PROPONE la nota (con búsqueda web
// si la cuenta la tiene; si no, sólo conocimiento general y seguro) con lo
// que se sabe de la marca delante y, si ya había una, mejorándola. NO
// guarda: la persona la revisa y la guarda con la ruta fija
// (`RUTA_RUBRO`), que es la que lee entera el motor de ideas cuando la
// tanda lleva un educativo (worker/lib/estudio/lote.js).
// ============================================================

import { llamarIA, ErrorIA } from "./ia.js";
import { contexto as contextoCerebro, textoParaEscribir } from "./cerebro.js";
import { HERRAMIENTAS_WEB } from "../herramientasServidor.js";
import { pedidoDeRubro, leerRubro, RUTA_RUBRO, TITULO_RUBRO } from "../../../src/lib/materialTipo.js";

/** → { titulo, texto, existente: { id } | null, conWeb, fuentes, aviso }. No guarda nada. */
export async function proponerRubro(env, acceso, cliente) {
  const actual = await acceso.leerUno("cerebro_notas", { client_id: cliente.id, ruta: RUTA_RUBRO });
  let contexto = "";
  try {
    contexto = textoParaEscribir(await contextoCerebro(env, acceso, cliente.id, "productos servicios rubro clientes consejos cuidados", { para: "texto", presupuesto: 6000 }));
  } catch { /* sin cerebro: con el rubro de la ficha */ }
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeRubro({ marca: cliente.name, rubro: cliente.industry ?? "", contexto, conWeb: true, actual: actual?.texto ?? "" }),
    salida: 4000,
    funcion: "saber del rubro",
    herramientas: HERRAMIENTAS_WEB,
  });
  const texto = leerRubro(r.texto);
  if (!texto) throw new ErrorIA("La IA no devolvió la nota. Inténtalo otra vez.", 502);
  return {
    titulo: TITULO_RUBRO, texto, existente: actual ? { id: actual.id } : null,
    conWeb: Boolean(r.conWeb), fuentes: (r.fuentes ?? []).slice(0, 10), aviso: r.aviso ?? null,
  };
}
