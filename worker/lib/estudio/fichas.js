// ============================================================
// El DIRECTOR DE ARTE: una ficha de diseño por pieza, por tandas
//
// Sustituye a «Mejorar idea» (60 palabras describiendo una foto) en todas las
// piezas de imagen: el lote, «Producir el mes», «Crear con IA», «Crear la
// imagen aquí», «Otra versión» y las historias. Razona como el asistente
// —con el manual del director, el kit, la identidad visual del cerebro, el
// catálogo y las plantillas del cliente— y escribe la ficha completa de cada
// pieza (src/lib/director.js). En una tanda, todas como una serie.
//
// No guarda nada: devuelve las fichas, y quien pide las pone en el pedido (y
// en la publicación, para que la segunda vez salga al instante).
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { buscar as buscarCerebro } from "../cerebro/cerebro.js";
import { pack } from "../cerebro/memoria.js";
import { kitDe } from "./kit.js";
import { leerMercado } from "../mercado.js";
import { bloqueDeMarca, kitVacio } from "../../../src/lib/kitMarca.js";
import { productosActivos, lineaDeProducto } from "../../../src/lib/estudioMercado.js";
import { pedidoDeFichas, leerFichas, limpiarPiezaEncargo, MAX_FICHAS } from "../../../src/lib/director.js";
import { ErrorEstudio } from "./trabajos.js";

const leerJSON = (t, d) => { try { return JSON.parse(t) ?? d; } catch { return d; } };
const CONSULTA_VISUAL = "identidad visual paleta colores tipografía estilo fotografía composición logo evitar";
const MAX_GUIA = 3_500;

/** El manual de la agencia (con el del director dentro), o null. No puede tumbar nada. */
export async function manualDelEspacio(acceso) {
  try {
    const fila = await acceso.leerUno("ajustes_espacio", { id: acceso.ownerId });
    return leerJSON(fila?.manual_campanas, null);
  } catch {
    return null;
  }
}

/** La identidad visual del cerebro (sin lo interno ni el prompt maestro de antes). Vacía si no hay o falla. */
export async function guiaVisual(env, acceso, clienteId) {
  try {
    const hits = await buscarCerebro(env, acceso, clienteId, CONSULTA_VISUAL, { para: "imagen", n: 5, per: 2 });
    const bloques = hits.filter((h) => !h.interna).map((h) => ({ head: `· ${h.titulo}`, body: h.pasajes.join(" … ") }));
    return bloques.length ? pack(bloques, MAX_GUIA) : "";
  } catch {
    return "";
  }
}

/**
 * Las fichas de una tanda. `piezas`: [{ n, formato, tipo, idea, escena, texto, productoId, indicacion, sinTexto,
 * plantilla, composicion, fecha }] (hasta 12); `concepto`: el de la tanda, si ya se sabe.
 * → { concepto, fichas: { n → { ficha, plantilla? } }, modelo, aviso }.
 */
export async function fichasDeDiseno(env, acceso, cliente, { piezas = [], concepto = "" } = {}) {
  const lista = (Array.isArray(piezas) ? piezas : []).slice(0, MAX_FICHAS);
  if (!lista.length) throw new ErrorEstudio("No hay piezas que diseñar.", 400);
  const kit = kitDe(cliente);
  const mercado = await leerMercado(acceso, cliente.id).catch(() => null);
  const activos = mercado ? productosActivos(mercado.catalogo) : [];
  // El producto de cada pieza, con su precio del catálogo (sólo los que existen).
  const productoDe = (id) => activos.find((p) => p.id === String(id ?? ""));
  const encargo = lista.map((p, i) => {
    const prod = productoDe(p?.productoId);
    return limpiarPiezaEncargo({ ...p, producto: prod ? lineaDeProducto(prod, { inventario: mercado.inventario }).slice(2) : p?.producto }, i);
  });
  const productos = [...new Set(lista.map((p) => p?.productoId).filter(Boolean))]
    .map(productoDe).filter(Boolean)
    .map((p) => lineaDeProducto(p, { inventario: mercado.inventario })).join("\n");
  const [guia, manual] = await Promise.all([guiaVisual(env, acceso, cliente.id), manualDelEspacio(acceso)]);
  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeFichas({
      cliente: cliente.name, rubro: cliente.industry ?? "", piezas: encargo,
      marca: kitVacio(kit) ? "" : bloqueDeMarca(kit), guia, plantillas: kit.plantillas, manual, concepto, productos,
    }),
    salida: Math.min(900 * encargo.length + 1200, 14_000),
    funcion: "director de arte",
  });
  const leido = leerFichas(r.texto, encargo);
  if (!leido) throw new ErrorEstudio("El director de arte no devolvió fichas que se puedan leer. Inténtalo otra vez.", 502);
  return { ...leido, modelo: r.modelo, aviso: r.aviso ?? null };
}
