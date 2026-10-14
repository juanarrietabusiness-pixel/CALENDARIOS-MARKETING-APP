// ============================================================
// «Dame ideas» de carrusel o de reel IA (texto)
//
// Lo puro (el pedido y la lectura) en src/lib/ideasFormato.js. Aquí se junta
// lo que la IA necesita, como en «Dame ideas» del compositor: el catálogo (con
// los precios EXACTOS), lo general del estudio de mercado aprobado y el
// cerebro para escribir (nunca lo interno). No pide nada al motor.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { contexto as contextoCerebro } from "../cerebro/cerebro.js";
import { leerMercado } from "../mercado.js";
import { kitDe } from "./kit.js";
import { productosActivos, lineaDeProducto, resumenGeneral } from "../../../src/lib/estudioMercado.js";
import { nombreDePreset } from "../../../src/lib/kitMarca.js";
import { pedidoDeIdeasFormato, leerIdeasFormato } from "../../../src/lib/ideasFormato.js";

/** `formato`: "carrusel" | "reel"; `datos`: { tipo?, tema?, productoId?, n?, usados?, segundos? } → { ideas } */
export async function ideasDeFormato(env, acceso, cliente, formato, datos = {}) {
  const kit = kitDe(cliente);
  const preset = String(datos.preset ?? "");
  const tema = String(datos.tema ?? "").slice(0, 300);
  let producto = "";
  let estudio = "";
  try {
    const { catalogo, estudio: e, inventario } = await leerMercado(acceso, cliente.id);
    const p = datos.productoId ? productosActivos(catalogo).find((x) => x.id === datos.productoId) : null;
    if (p) producto = lineaDeProducto(p, { inventario }).slice(2);
    if (e?.general) estudio = resumenGeneral(e.general);
  } catch { /* sin catálogo ni estudio */ }
  let contexto = "";
  try {
    const c = await contextoCerebro(env, acceso, cliente.id, tema || `ideas ${formato} contenido beneficios público`, { para: "texto", presupuesto: 4000 });
    contexto = [c.ficha, c.pasajes].filter(Boolean).join("\n\n");
  } catch { /* sin cerebro */ }
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeIdeasFormato({
      formato, marca: cliente.name, rubro: cliente.industry ?? "", n: datos.n, tema, producto, estudio, contexto,
      tipo: preset ? nombreDePreset(preset, kit) : "",
      usados: (Array.isArray(datos.usados) ? datos.usados : []).map((t) => String(t ?? "").slice(0, 80)).filter(Boolean),
      segundos: [8, 10].includes(Number(datos.segundos)) ? Number(datos.segundos) : 10,
    }),
    salida: formato === "reel" ? 1500 : 3200,
    funcion: "ideas del estudio",
  });
  const ideas = leerIdeasFormato(r.texto, formato);
  if (!ideas.length) throw Object.assign(new Error("La IA no devolvió ideas que se puedan leer. Inténtalo otra vez."), { estado: 502 });
  return { ideas, modelo: r.modelo, aviso: r.aviso ?? null };
}
