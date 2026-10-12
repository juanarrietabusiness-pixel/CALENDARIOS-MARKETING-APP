// ============================================================
// El lote de anuncios: la IA escribe las ideas (texto)
//
// Lo puro (el pedido, la lectura, las cuántas por nivel) en
// src/lib/loteAnuncios.js. Aquí se junta lo que la IA necesita: la línea
// del producto en el catálogo (con su precio EXACTO), el estudio de mercado
// aprobado de ese producto y lo general, y el cerebro para escribir (nunca
// lo interno). No pide nada al motor de imagen: eso lo hace la pantalla,
// pieza a pieza, después de que una persona revisa las ideas y ve el costo.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { contexto as contextoCerebro } from "../cerebro/cerebro.js";
import { leerMercado } from "../mercado.js";
import { productosActivos, lineaDeProducto, notaDeProducto, resumenGeneral } from "../../../src/lib/estudioMercado.js";
import { pedidoDeIdeasLote, leerIdeasLote, limpiarCuantas, totalDeCuantas, FORMATOS_LOTE } from "../../../src/lib/loteAnuncios.js";

/** `datos`: { productoId?, cuantas: { nivel: n }, formato }. → { ideas, producto } */
export async function ideasDeLote(env, acceso, cliente, datos = {}) {
  const cuantas = limpiarCuantas(datos.cuantas);
  if (!totalDeCuantas(cuantas)) throw Object.assign(new Error("Escoge al menos un nivel con una idea."), { estado: 400 });
  const formato = FORMATOS_LOTE[datos.formato] ? datos.formato : "post";

  const { catalogo, estudio, inventario } = await leerMercado(acceso, cliente.id);
  const producto = datos.productoId ? productosActivos(catalogo).find((p) => p.id === datos.productoId) : null;
  if (datos.productoId && !producto) throw Object.assign(new Error("Ese producto no está activo en el catálogo."), { estado: 404 });

  const textoEstudio = [
    estudio?.general ? resumenGeneral(estudio.general) : "",
    producto && estudio?.productos?.[producto.id] ? notaDeProducto(estudio.productos[producto.id], producto) : "",
  ].filter(Boolean).join("\n\n");

  let contexto = "";
  try {
    const c = await contextoCerebro(env, acceso, cliente.id, `${producto?.nombre ?? ""} anuncio beneficios objeciones público`, { para: "texto", presupuesto: 5000 });
    contexto = [c.ficha, c.pasajes].filter(Boolean).join("\n\n");
  } catch { /* sin cerebro, con el catálogo y el estudio */ }

  const r = await llamarIA(env, acceso, cliente, {
    prompt: pedidoDeIdeasLote({
      marca: cliente.name, producto: producto ? lineaDeProducto(producto, { inventario }).slice(2) : "",
      estudio: textoEstudio, contexto, cuantas, formato,
    }),
    salida: 200 * totalDeCuantas(cuantas) + 800,
    funcion: "ideas de anuncios",
  });
  const ideas = leerIdeasLote(r.texto, cuantas);
  if (!ideas.length) throw Object.assign(new Error("La IA no devolvió ideas que se puedan leer. Inténtalo otra vez."), { estado: 502 });
  return {
    ideas,
    producto: producto ? { id: producto.id, nombre: producto.nombre, precio: producto.precio } : null,
    conEstudio: Boolean(textoEstudio),
    modelo: r.modelo, aviso: r.aviso ?? null,
  };
}
