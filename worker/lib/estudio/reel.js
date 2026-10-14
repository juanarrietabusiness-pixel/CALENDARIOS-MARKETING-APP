// ============================================================
// El reel con IA: el guion por planos (texto)
//
// Como lo hacía Flow: de la idea central (la promoción, el beneficio o la
// idea) a un guion de 10 s con varios planos —qué se ve, el texto corto en
// pantalla, la cámara—, el hilo que comparten, el sonido y la descripción.
// Con el catálogo (precio EXACTO), los personajes y el kit de la marca y el
// cerebro para escribir (nunca lo interno). Lo puro en src/lib/reel.js. Es
// texto: no pide nada al motor de video.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { contexto as contextoCerebro } from "../cerebro/cerebro.js";
import { leerMercado } from "../mercado.js";
import { kitDe } from "./kit.js";
import { productosActivos, lineaDeProducto } from "../../../src/lib/estudioMercado.js";
import { nombreDePreset, lineaDeEstilo, estiloDeLaPieza, bloqueDeMarca } from "../../../src/lib/kitMarca.js";
import { pedidoDeReel, leerReel } from "../../../src/lib/reel.js";

/** `datos`: { idea, segundos?, preset?, estilo?, productoId?, personajes?: [ids], musica?, locucion? } → { hilo, planos, musica, locucion, efectos, descripcion } */
export async function guionDeReel(env, acceso, cliente, datos = {}) {
  const idea = String(datos.idea ?? "").trim().slice(0, 1500);
  if (!idea) throw Object.assign(new Error("Escribe la idea central: la promoción, el beneficio o lo que quieres contar."), { estado: 400 });
  const segundos = [4, 6, 8, 10, 15].includes(Number(datos.segundos)) ? Number(datos.segundos) : 10;
  const kit = kitDe(cliente);
  const preset = String(datos.preset ?? "");
  let producto = "";
  if (datos.productoId) {
    try {
      const { catalogo, inventario } = await leerMercado(acceso, cliente.id);
      const p = productosActivos(catalogo).find((x) => x.id === datos.productoId);
      if (p) producto = lineaDeProducto(p, { inventario }).slice(2);
    } catch { /* sin catálogo, sin producto */ }
  }
  let contexto = "";
  try {
    const c = await contextoCerebro(env, acceso, cliente.id, `${idea} contacto whatsapp beneficios`, { para: "texto", presupuesto: 3000 });
    contexto = [c.ficha, c.pasajes].filter(Boolean).join("\n\n");
  } catch { /* sin cerebro */ }
  const ids = Array.isArray(datos.personajes) ? datos.personajes.map(String) : [];
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeReel({
      marca: cliente.name, rubro: cliente.industry ?? "", idea, segundos, producto, contexto,
      tipo: preset ? nombreDePreset(preset, kit) : "",
      estilo: lineaDeEstilo(kit, estiloDeLaPieza(kit, preset, String(datos.estilo ?? ""))),
      personajes: kit.personajes.filter((p) => ids.includes(p.id)).map((p) => `${p.nombre}${p.descripcion ? `: ${p.descripcion}` : ""}`),
      identidad: bloqueDeMarca(kit),
      musica: String(datos.musica ?? "").slice(0, 300), locucion: String(datos.locucion ?? "").slice(0, 500),
    }),
    salida: 2400,
    funcion: "guion de video",
  });
  const guion = leerReel(r.texto, segundos);
  if (!guion) throw Object.assign(new Error("La IA no devolvió un guion que se pueda leer. Inténtalo otra vez."), { estado: 502 });
  return { ...guion, segundos, modelo: r.modelo, aviso: r.aviso ?? null };
}
