// ============================================================
// El carrusel, diseñado por el DIRECTOR (texto)
//
// Antes era una «contrapropuesta» aparte (qué se ve, texto y composición en
// una frase) que no leía el manual, ni el kit, ni las plantillas: las láminas
// salían como antes del director. Ahora el MISMO director que diseña los
// posts (src/lib/director.js) escribe el sistema de la serie —con medidas: el
// titular en la misma zona y del mismo tamaño en todas— y la ficha de cada
// lámina con su texto exacto, viendo las plantillas y los «Me gusta» del
// cliente y sabiendo lo que la agencia corrige una y otra vez. Es texto: no
// pide nada al motor de imagen. Una persona lo revisa antes de crear.
// ============================================================

import { llamarIA } from "../cerebro/ia.js";
import { pautasDe, bloqueDePautas } from "../cerebro/cerebro.js";
import { leerMercado } from "../mercado.js";
import { kitDe } from "./kit.js";
import { guiaVisual, manualDelEspacio, correccionesDelCliente, limpiarVistas, conVistas } from "./fichas.js";
import { productosActivos, lineaDeProducto } from "../../../src/lib/estudioMercado.js";
import { partirGuion } from "../../../src/lib/carrusel.js";
import { pedidoDeCarrusel, leerCarrusel } from "../../../src/lib/director.js";
import { estructuraDe, estructuraPara, lineaDeEstructura } from "../../../src/lib/estructurasCarrusel.js";
import { estructurasRecientes } from "./lote.js";
import { nombreDePreset, lineaDeEstilo, estiloDeLaPieza, bloqueDeMarca, kitVacio } from "../../../src/lib/kitMarca.js";

/** `datos`: { guion?, tema?, preset?, estilo?, productoId?, personajes?: [ids], vistas? } → { hilo, laminas: [{ n, rol, texto, ficha }] } */
export async function propuestaDeCarrusel(env, acceso, cliente, datos = {}) {
  const laminas = partirGuion(String(datos.guion ?? "").slice(0, 6000));
  const tema = String(datos.tema ?? "").slice(0, 400);
  if (laminas.length < 2 && !tema.trim()) throw Object.assign(new Error("Escribe el guion (una lámina por línea) o el tema del carrusel."), { estado: 400 });
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
  // Sólo con un tema, la estructura la pone el código (la de la publicación, o una del tipo que el cliente no usó
  // hace poco): si no, todos los carruseles salían con la misma forma.
  let estructura = "";
  if (laminas.length < 2) {
    estructura = estructuraDe(datos.estructura)?.id
      ?? estructuraPara(preset.split("-")[0], { usadas: await estructurasRecientes(acceso, cliente.id), semilla: Date.now() % 997 });
  }
  const ids = Array.isArray(datos.personajes) ? datos.personajes.map(String) : [];
  const personajes = kit.personajes.filter((p) => ids.includes(p.id)).map((p) => `${p.nombre}${p.descripcion ? `: ${p.descripcion}` : ""}`);
  const [guia, manual, correcciones, pautasNotas] = await Promise.all([
    guiaVisual(env, acceso, cliente.id), manualDelEspacio(acceso), correccionesDelCliente(acceso, cliente.id), pautasDe(env, acceso, cliente.id),
  ]);
  // Las pautas para escribir del cerebro (la jerarquía, el tono de los textos de las láminas): detrás del pedido.
  const pautas = bloqueDePautas(pautasNotas);
  const imagenes = limpiarVistas(datos.vistas);
  const pedido = [pedidoDeCarrusel({
    cliente: cliente.name, rubro: cliente.industry ?? "", laminas, tema, producto, personajes,
    tipo: preset ? nombreDePreset(preset, kit) : "",
    estilo: lineaDeEstilo(kit, estiloDeLaPieza(kit, preset, String(datos.estilo ?? ""))),
    marca: kitVacio(kit) ? "" : bloqueDeMarca(kit), guia, plantillas: kit.plantillas, manual, correcciones, vistas: imagenes.length,
    estructura: estructura ? lineaDeEstructura(estructura) : "",
  }), pautas].filter(Boolean).join("\n\n");
  const r = await llamarIA(env, acceso, cliente, {
    prompt: conVistas(imagenes, pedido),
    salida: 900 * Math.max(laminas.length, 7) + 1200,
    funcion: "director de arte",
  });
  const propuesta = leerCarrusel(r.texto);
  if (!propuesta) throw Object.assign(new Error("El director no devolvió un carrusel que se pueda leer. Inténtalo otra vez."), { estado: 502 });
  return { ...propuesta, ...(estructura ? { estructura } : {}), modelo: r.modelo, aviso: r.aviso ?? null };
}
