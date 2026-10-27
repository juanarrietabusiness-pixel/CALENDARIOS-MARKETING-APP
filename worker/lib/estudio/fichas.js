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
import { pedidoDeFichas, leerFichas, limpiarPiezaEncargo, MAX_FICHAS, correccionesRecientes } from "../../../src/lib/director.js";
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
 * Lo que la agencia corrigió hace poco en este cliente (los pedidos de edición de su Estudio, los más nuevos primero),
 * para que el director no repita esos errores. Vacío si no hay o falla.
 */
export async function correccionesDelCliente(acceso, clienteId) {
  try {
    const filas = await acceso.leerColumnas("estudio_trabajos", ["prompt"], { client_id: clienteId }, "created_at desc", 80);
    return correccionesRecientes(filas.map((f) => f.prompt));
  } catch {
    return [];
  }
}

/** Como mucho, las imágenes del cliente que ve el director (las manda el navegador ya pequeñas). */
export const MAX_VISTAS = 4;
const MAX_VISTA = 700_000; // caracteres de base64 por imagen (~500 kB): copias de 512–768 px en JPEG

/** Las imágenes que manda el navegador, limpias: sólo JPEG, PNG o WEBP en base64 y de tamaño razonable. */
export function limpiarVistas(vistas) {
  return (Array.isArray(vistas) ? vistas : [])
    .filter((v) => /^image\/(jpeg|png|webp)$/.test(String(v?.media_type ?? "")) && typeof v?.data === "string" && v.data.length > 0 && v.data.length <= MAX_VISTA && /^[A-Za-z0-9+/=]+$/.test(v.data.slice(0, 200)))
    .slice(0, MAX_VISTAS)
    .map((v) => ({ type: "image", source: { type: "base64", media_type: v.media_type, data: v.data } }));
}

/** El pedido con las imágenes delante (si las hay): así el director ve el nivel a igualar. */
export const conVistas = (bloques, texto) => (bloques.length ? [...bloques, { type: "text", text: texto }] : texto);

/**
 * Las fichas de una tanda. `piezas`: [{ n, formato, tipo, idea, escena, texto, productoId, indicacion, sinTexto,
 * plantilla, composicion, fecha }] (hasta 12); `concepto`: el de la tanda, si ya se sabe.
 * → { concepto, fichas: { n → { ficha, plantilla? } }, modelo, aviso }.
 */
export async function fichasDeDiseno(env, acceso, cliente, { piezas = [], concepto = "", vistas = [] } = {}) {
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
  const [guia, manual, correcciones] = await Promise.all([guiaVisual(env, acceso, cliente.id), manualDelEspacio(acceso), correccionesDelCliente(acceso, cliente.id)]);
  const imagenes = limpiarVistas(vistas);
  const r = await llamarIA(env, acceso, cliente, {
    prompt: conVistas(imagenes, pedidoDeFichas({
      cliente: cliente.name, rubro: cliente.industry ?? "", piezas: encargo,
      marca: kitVacio(kit) ? "" : bloqueDeMarca(kit), guia, plantillas: kit.plantillas, manual, concepto, productos,
      correcciones, vistas: imagenes.length,
    })),
    salida: Math.min(900 * encargo.length + 1200, 14_000),
    funcion: "director de arte",
  });
  const leido = leerFichas(r.texto, encargo);
  if (!leido) throw new ErrorEstudio("El director de arte no devolvió fichas que se puedan leer. Inténtalo otra vez.", 502);
  return { ...leido, modelo: r.modelo, aviso: r.aviso ?? null };
}
