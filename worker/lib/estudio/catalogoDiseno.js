// ============================================================
// El CATÁLOGO del cliente para quien DISEÑA: el asistente de la aplicación (rutas/chat.js) y Claude por MCP
// (herramientasDiseno.js). Cada producto con su id (lo que se pasa en «productos» para que sus fotos REALES vayan de
// referencia), su precio y si tiene fotos. Puro.
// ============================================================

import { productosActivos, lineaDeProducto } from "../../../src/lib/estudioMercado.js";

/**
 * El CATÁLOGO del cliente para quien diseña en el chat: cada producto con su id (lo que se pasa en `productos` de
 * disenar_piezas, y así van sus fotos reales de referencia), su precio y si tiene fotos. Sin esto el asistente no
 * sabía qué productos había y, en los carruseles, se los inventaba con marca y todo. Vacío sin catálogo.
 */
export function catalogoParaDisenar(mercado, cliente = "este cliente") {
  const activos = mercado ? productosActivos(mercado.catalogo) : [];
  const vigentes = mercado?.inventario ? activos.filter((p) => p.stock !== "agotado") : activos;
  if (!vigentes.length) {
    return `CATÁLOGO DE ${cliente.toUpperCase()}: vacío. Si una pieza tiene que enseñar un producto, PREGÚNTALE a la persona cuál y cómo es antes de diseñarla (o que lo cargue en Cerebro → Estudio de mercado): no inventes productos, empaques ni marcas.`;
  }
  return [
    `CATÁLOGO DE ${cliente.toUpperCase()} (lo único que existe; precios exactos):`,
    ...vigentes.map((p) => `${lineaDeProducto(p, { inventario: mercado.inventario })} · id: ${p.id} · ${p.fotos?.length ? `${p.fotos.length} foto${p.fotos.length === 1 ? "" : "s"} real${p.fotos.length === 1 ? "" : "es"}` : "sin fotos"}`),
    "CÓMO LO USAS AL DISEÑAR: si una pieza o un carrusel enseña productos, sólo de esta lista y por su nombre exacto, y pasa sus ids en «productos» de disenar_piezas (a nivel de la tanda y de cada pieza): así van sus fotos REALES de referencia y el motor no se inventa otro. Una pieza puede llevar varios. Si la persona no dijo cuál y no es evidente por el calendario o el cerebro, PREGÚNTALE cuál (dale las opciones de esta lista) antes de llamar a disenar_piezas. Nunca inventes un producto, un modelo, un empaque ni una marca.",
  ].join("\n");
}
