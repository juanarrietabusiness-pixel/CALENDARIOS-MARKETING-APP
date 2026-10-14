// ============================================================
// «Dame ideas»: la IA propone ideas de piezas para el Estudio (texto)
//
// Lo puro (el plan, el pedido, la lectura) en src/lib/ideasEstudio.js. Aquí
// se junta lo que la IA necesita: el catálogo (con los precios EXACTOS),
// lo general del estudio de mercado aprobado y el cerebro para escribir
// (nunca lo interno). No pide nada al motor de imagen.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { contexto as contextoCerebro } from "../cerebro/cerebro.js";
import { leerMercado } from "../mercado.js";
import { productosActivos, lineaDeProducto, resumenGeneral } from "../../../src/lib/estudioMercado.js";
import { planDeIdeas, pedidoDeIdeasEstudio, leerIdeasEstudio } from "../../../src/lib/ideasEstudio.js";

/** `datos`: { tipo?, n?, video?, tema?, semilla? } → { ideas, productos } */
export async function ideasDelEstudio(env, acceso, cliente, datos = {}) {
  const { catalogo, estudio, inventario } = await leerMercado(acceso, cliente.id);
  const activos = productosActivos(catalogo);
  // Primero los que tienen fotos: así la idea sale con el producto REAL.
  const rotan = [...activos.filter((p) => p.fotos?.length), ...activos.filter((p) => !p.fotos?.length)];
  const plan = planDeIdeas({ n: datos.n, tipo: String(datos.tipo ?? ""), productos: rotan, semilla: datos.semilla });
  const tema = String(datos.tema ?? "").slice(0, 300);

  let contexto = "";
  try {
    const c = await contextoCerebro(env, acceso, cliente.id, tema || "ideas contenido beneficios público", { para: "texto", presupuesto: 4000 });
    contexto = [c.ficha, c.pasajes].filter(Boolean).join("\n\n");
  } catch { /* sin cerebro, con el catálogo y el estudio */ }

  const usados = new Set(plan.map((r) => r.productoId).filter(Boolean));
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeIdeasEstudio({
      marca: cliente.name, plan, contexto, tema, video: datos.video === true,
      productos: Object.fromEntries(rotan.filter((p) => usados.has(p.id)).map((p) => [p.id, lineaDeProducto(p, { inventario }).slice(2)])),
      estudio: estudio?.general ? resumenGeneral(estudio.general) : "",
    }),
    salida: 220 * plan.length + 600,
    funcion: "ideas del estudio",
  });
  const ideas = leerIdeasEstudio(r.texto, plan);
  if (!ideas.length) throw Object.assign(new Error("La IA no devolvió ideas que se puedan leer. Inténtalo otra vez."), { estado: 502 });
  return { ideas, productos: rotan.map((p) => ({ id: p.id, nombre: p.nombre })), modelo: r.modelo, aviso: r.aviso ?? null };
}
