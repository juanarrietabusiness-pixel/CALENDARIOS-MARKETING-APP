// ============================================================
// El director comercial de los videos (src/lib/directorVideo.js)
//
//   criterioDelEspacio   la línea del criterio comercial de la agencia, para
//                        TODO guion de video (Reel IA, recrear un anuncio).
//   revisarComoDirector  «Revisar como director comercial»: la idea mejorada y
//                        qué cambió y por qué. No guarda: decide una persona.
//
// El criterio vive en el manual de la agencia (`ajustes_espacio.manual_campanas`,
// campo `video`); se lee aquí a mano y no con leerManual (worker/lib/estratega.js)
// porque estratega.js importa mercado.js, y mercado.js usa esto: sería circular.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { contexto as contextoCerebro, textoParaEscribir } from "../cerebro/cerebro.js";
import { lineaDelDirector, pedidoDelDirector, leerDirector } from "../../../src/lib/directorVideo.js";

const leerJSON = (t) => { try { return JSON.parse(t || "{}"); } catch { return {}; } };

/** La línea del criterio comercial que va en todo guion de video. Si no se puede leer, la de la casa. */
export async function criterioDelEspacio(acceso) {
  try {
    const fila = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId });
    return lineaDelDirector(leerJSON(fila?.manual_campanas));
  } catch {
    return lineaDelDirector(null);
  }
}

/** → { idea, cambios, modelo, aviso }. `producto`: la línea del catálogo (con su precio), si se escogió. */
export async function revisarComoDirector(env, acceso, cliente, { idea = "", formato = "reel", segundos = 10, producto = "" } = {}) {
  const pedido = String(idea ?? "").trim();
  if (!pedido) throw Object.assign(new Error("Escribe primero la idea, con tus palabras."), { estado: 400 });
  let contexto = "";
  try {
    contexto = textoParaEscribir(await contextoCerebro(env, acceso, cliente.id, `${pedido} beneficios público`, { para: "texto", presupuesto: 2500 }));
  } catch { /* sin cerebro */ }
  const fila = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId }).catch(() => null);
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDelDirector({
      marca: cliente.name, rubro: cliente.industry ?? "", idea: pedido, formato, segundos: Number(segundos) || 10, producto, contexto,
      manual: leerJSON(fila?.manual_campanas),
    }),
    salida: 1500,
    funcion: "director comercial",
  });
  const revision = leerDirector(r.texto);
  if (!revision) throw Object.assign(new Error("La IA no devolvió una revisión que se pueda leer. Inténtalo otra vez."), { estado: 502 });
  return { ...revision, modelo: r.modelo, aviso: r.aviso ?? null };
}
